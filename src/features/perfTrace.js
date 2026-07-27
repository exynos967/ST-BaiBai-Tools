import * as chatOptimizations from '../chat/index.js';
import * as scriptModule from '@sillytavern/script';
import { eventSource, getCurrentChatId } from '@sillytavern/script';
import { power_user } from '@sillytavern/scripts/power-user';
import { PERFORMANCE_TRACE_DEDUPE_MS, PERFORMANCE_TRACE_EVENTS, PERFORMANCE_TRACE_FETCH_KEY, PERFORMANCE_TRACE_FETCH_PATHS, PERFORMANCE_TRACE_INTERACTION_SELECTOR, PERFORMANCE_TRACE_LISTENER_LOG_MS, PERFORMANCE_TRACE_MAX_LINES, PERFORMANCE_TRACE_MAX_LINE_LENGTH, PERFORMANCE_TRACE_SLOW_MS } from './constants.js';
import { buildFetchHeaders, getFetchRequestMethod, getFetchRequestUrl } from './gzipHook.js';
import { extensionState } from './state.js';

function getPerformanceTraceState() {
    if (!extensionState.performanceTrace || typeof extensionState.performanceTrace !== 'object') {
        extensionState.performanceTrace = {};
    }

    return extensionState.performanceTrace;
}

function startPerformanceTrace() {
    const state = getPerformanceTraceState();

    if (state.active) {
        return;
    }

    Object.assign(state, {
        active: true,
        startedAt: performance.now(),
        startedAtIso: new Date().toISOString(),
        endedAtIso: '',
        lines: [],
        lastKeys: new Map(),
        responseInfo: new WeakMap(),
        counters: {
            dropped: 0,
            suppressed: 0,
            events: 0,
            fetches: 0,
            gzipCompression: 0,
            jsonStringify: 0,
            responseJson: 0,
            longTasks: 0,
            longDomRefreshes: 0,
            interactions: 0,
            listeners: 0,
        },
        activities: [],
        eventStats: new Map(),
        listenerStats: new Map(),
        fetchStats: new Map(),
        gzipStats: new Map(),
        jsonStats: new Map(),
        responseJsonStats: new Map(),
        longDomRefreshStats: new Map(),
    });

    installPerformanceTraceRuntimePatches(state);
    appendPerformanceTraceLine('trace', `start ${getPerformanceTraceSnapshot({ includeTextStats: true })}`);

    state.uiTimer = setInterval(updatePerformanceTraceControls, 1000);
    updatePerformanceTraceControls();
    notifyPerformanceTrace('Performance trace started.');
}

function stopPerformanceTraceAndExport() {
    const state = getPerformanceTraceState();

    if (!state.active) {
        return;
    }

    appendPerformanceTraceLine('trace', `stop ${getPerformanceTraceSnapshot({ includeTextStats: true })}`);
    state.active = false;
    state.endedAtIso = new Date().toISOString();

    restorePerformanceTraceRuntimePatches(state);
    clearInterval(state.uiTimer);
    state.uiTimer = null;

    const text = buildPerformanceTraceExport(state);
    const filename = `st-performance-trace-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`;
    downloadTextFile(filename, text);

    updatePerformanceTraceControls();
    notifyPerformanceTrace('Performance trace exported.');
}

function installPerformanceTraceRuntimePatches(state) {
    installPerformanceTraceEventEmitPatch(state);
    installPerformanceTraceJsonStringifyPatch(state);
    installPerformanceTraceResponseJsonPatch(state);
    installPerformanceTraceLongTaskObserver(state);
    installPerformanceTraceInteractionListeners(state);
}

function restorePerformanceTraceRuntimePatches(state) {
    if (state.originalEventEmit) {
        eventSource.emit = state.originalEventEmit;
        state.originalEventEmit = null;
    }

    if (state.originalJsonStringify) {
        JSON.stringify = state.originalJsonStringify;
        state.originalJsonStringify = null;
    }

    if (state.originalResponseJson && typeof Response !== 'undefined') {
        Response.prototype.json = state.originalResponseJson;
        state.originalResponseJson = null;
    }

    if (state.longTaskObserver) {
        state.longTaskObserver.disconnect();
        state.longTaskObserver = null;
    }

    if (state.interactionClickHandler) {
        document.removeEventListener('click', state.interactionClickHandler, true);
        state.interactionClickHandler = null;
    }

    if (state.interactionKeydownHandler) {
        document.removeEventListener('keydown', state.interactionKeydownHandler, true);
        state.interactionKeydownHandler = null;
    }
}

function installPerformanceTraceEventEmitPatch(state) {
    if (state.originalEventEmit || typeof eventSource?.emit !== 'function') {
        return;
    }

    state.originalEventEmit = eventSource.emit;
    eventSource.emit = async function baiBaiToolkitPerformanceTraceEmit(event, ...args) {
        const traceState = getPerformanceTraceState();

        if (!traceState.active || !PERFORMANCE_TRACE_EVENTS.has(event)) {
            return traceState.originalEventEmit.apply(this, [event, ...args]);
        }

        const start = performance.now();
        const listeners = Array.isArray(this.events?.[event]) ? this.events[event].slice() : [];

        if (localStorage.getItem('eventTracing') === 'true') {
            console.trace('Event emitted: ' + event, args);
        } else {
            console.debug('Event emitted: ' + event);
        }

        for (let index = 0; index < listeners.length; index++) {
            const listener = listeners[index];
            const listenerStart = performance.now();
            let error = null;

            try {
                await listener.apply(this, args);
            } catch (err) {
                error = err;
                console.error(err);
                console.trace('Error in event listener');
            } finally {
                const listenerDuration = performance.now() - listenerStart;
                recordPerformanceTraceListener(event, listener, index, listenerDuration, error);
            }
        }

        if (this.autoFireAfterEmit?.has(event)) {
            this.autoFireLastArgs?.set(event, args);
        }

        const duration = performance.now() - start;
        recordPerformanceTraceEvent(event, args, duration, listeners.length);
    };
}

function installPerformanceTraceJsonStringifyPatch(state) {
    if (state.originalJsonStringify || typeof JSON.stringify !== 'function') {
        return;
    }

    state.originalJsonStringify = JSON.stringify;
    JSON.stringify = function baiBaiToolkitPerformanceTraceStringify(value, replacer, space) {
        const traceState = getPerformanceTraceState();
        const kind = traceState.active ? getJsonStringifyTraceKind(value) : null;
        const start = traceState.active ? performance.now() : 0;
        const result = traceState.originalJsonStringify.apply(this, [value, replacer, space]);

        if (traceState.active) {
            const duration = performance.now() - start;
            if (kind || duration >= PERFORMANCE_TRACE_SLOW_MS) {
                recordPerformanceTraceJsonStringify(kind || { name: 'slow-json', count: 0 }, duration, result);
            }
        }

        return result;
    };
}

function installPerformanceTraceResponseJsonPatch(state) {
    if (state.originalResponseJson || typeof Response === 'undefined' || typeof Response.prototype?.json !== 'function') {
        return;
    }

    state.originalResponseJson = Response.prototype.json;
    Response.prototype.json = async function baiBaiToolkitPerformanceTraceResponseJson(...args) {
        const traceState = getPerformanceTraceState();
        const info = traceState.active ? traceState.responseInfo?.get(this) : null;
        const start = traceState.active ? performance.now() : 0;
        const result = await traceState.originalResponseJson.apply(this, args);

        if (traceState.active) {
            const duration = performance.now() - start;
            if (info || duration >= PERFORMANCE_TRACE_SLOW_MS) {
                recordPerformanceTraceResponseJson(info, result, duration);
            }
        }

        return result;
    };
}

function installPerformanceTraceLongTaskObserver(state) {
    if (state.longTaskObserver || typeof PerformanceObserver !== 'function') {
        return;
    }

    const supported = PerformanceObserver.supportedEntryTypes || [];
    if (supported.length && !supported.includes('longtask')) {
        return;
    }

    try {
        state.longTaskObserver = new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
                recordPerformanceTraceLongTask(entry);
            }
        });
        state.longTaskObserver.observe({ entryTypes: ['longtask'] });
    } catch (error) {
        appendPerformanceTraceLine('trace', `longtask observer unavailable error=${sanitizeTraceValue(error?.message || error)}`);
    }
}

function installPerformanceTraceInteractionListeners(state) {
    if (state.interactionClickHandler || state.interactionKeydownHandler) {
        return;
    }

    state.interactionClickHandler = (event) => {
        const target = event.target instanceof Element
            ? event.target.closest(PERFORMANCE_TRACE_INTERACTION_SELECTOR)
            : null;

        if (!target) {
            return;
        }

        recordPerformanceTraceInteraction('click', getTraceElementLabel(target));
    };

    state.interactionKeydownHandler = (event) => {
        const target = event.target;
        if (!(target instanceof Element) || target.id !== 'send_textarea') {
            return;
        }

        if (event.key === 'Enter' && (event.ctrlKey || event.metaKey || !event.shiftKey)) {
            recordPerformanceTraceInteraction('keydown', `#send_textarea key=${event.key} ctrl=${event.ctrlKey} meta=${event.metaKey} shift=${event.shiftKey}`);
        }
    };

    document.addEventListener('click', state.interactionClickHandler, true);
    document.addEventListener('keydown', state.interactionKeydownHandler, true);
}

function installPerformanceTraceFetchHook() {
    const existing = globalThis[PERFORMANCE_TRACE_FETCH_KEY];
    if (existing?.wrappedFetch) {
        return existing;
    }

    const originalFetch = globalThis.fetch;
    if (typeof originalFetch !== 'function') {
        return null;
    }

    const state = {
        originalFetch: originalFetch.bind(globalThis),
        wrappedFetch: null,
    };

    state.wrappedFetch = async function baiBaiToolkitPerformanceTraceFetch(input, init) {
        const traceState = getPerformanceTraceState();
        const info = traceState.active ? getPerformanceTraceFetchInfo(input, init) : null;

        if (!info) {
            return state.originalFetch(input, init);
        }

        const start = performance.now();
        recordPerformanceTraceFetchStart(info);

        try {
            const response = await state.originalFetch(input, init);
            const duration = performance.now() - start;
            traceState.responseInfo?.set(response, {
                ...info,
                status: response?.status,
            });
            recordPerformanceTraceFetchEnd(info, duration, response?.status);
            return response;
        } catch (error) {
            const duration = performance.now() - start;
            recordPerformanceTraceFetchError(info, duration, error);
            throw error;
        }
    };

    state.wrappedFetch[PERFORMANCE_TRACE_FETCH_KEY] = true;
    globalThis[PERFORMANCE_TRACE_FETCH_KEY] = state;
    globalThis.fetch = state.wrappedFetch;
    return state;
}

function recordPerformanceTraceEvent(event, args, duration, listenerCount = 0) {
    const state = getPerformanceTraceState();
    state.counters.events += 1;
    updatePerformanceTraceStats(state.eventStats, event, duration);
    rememberPerformanceTraceActivity('event', event, performance.now() - duration);

    const slow = duration >= PERFORMANCE_TRACE_SLOW_MS;
    const key = `event:${event}:${summarizeTraceArgs(args, 1)}`;
    const argsSummary = summarizeTraceArgs(args);
    appendPerformanceTraceLine(
        'event',
        `${event} duration=${formatTraceMs(duration)} listeners=${listenerCount} args=${argsSummary}`,
        { key, dedupeMs: slow ? 0 : PERFORMANCE_TRACE_DEDUPE_MS },
    );
}

function recordPerformanceTraceListener(event, listener, index, duration, error = null) {
    const state = getPerformanceTraceState();
    const label = getPerformanceTraceListenerLabel(event, listener, index);
    const key = `${event} ${label}`;
    const shouldLog = duration >= PERFORMANCE_TRACE_LISTENER_LOG_MS || error;

    state.counters.listeners += 1;
    updatePerformanceTraceStats(state.listenerStats, key, duration);

    if (!shouldLog) {
        return;
    }

    appendPerformanceTraceLine(
        'listener',
        `${event} #${index + 1}/${getPerformanceTraceListenerCount(event)} ${label} duration=${formatTraceMs(duration)}${error ? ` error=${sanitizeTraceValue(error?.message || error)}` : ''}`,
        { key: `listener:${event}:${index}:${label}:${Math.round(duration / 10)}`, dedupeMs: 100 },
    );
}

function recordPerformanceTraceJsonStringify(kind, duration, result) {
    const state = getPerformanceTraceState();
    state.counters.jsonStringify += 1;
    updatePerformanceTraceStats(state.jsonStats, kind.name, duration);
    rememberPerformanceTraceActivity('json', kind.name, performance.now() - duration);

    const chars = typeof result === 'string' ? result.length : 0;
    appendPerformanceTraceLine(
        'json',
        `JSON.stringify kind=${kind.name} items=${kind.count || 0} chars=${chars} duration=${formatTraceMs(duration)}`,
        { key: `json:${kind.name}:${kind.count}:${chars}`, dedupeMs: 500 },
    );
}

function recordPerformanceTraceResponseJson(info, result, duration) {
    const state = getPerformanceTraceState();
    const path = info?.path || 'unknown';
    state.counters.responseJson += 1;
    updatePerformanceTraceStats(state.responseJsonStats, path, duration);
    appendPerformanceTraceLine(
        'response-json',
        `path=${path} result=${summarizeResponseJsonResult(result)} duration=${formatTraceMs(duration)}`,
        { key: `response-json:${path}:${summarizeResponseJsonResult(result)}`, dedupeMs: 500 },
    );
}

function recordPerformanceTraceLongTask(entry) {
    const state = getPerformanceTraceState();
    if (!state.active) {
        return;
    }

    state.counters.longTasks += 1;
    const relativeStart = Math.max(0, entry.startTime - state.startedAt);
    const nearby = getNearbyPerformanceTraceActivity(entry.startTime);
    const attribution = summarizePerformanceTraceLongTaskAttribution(entry);
    appendPerformanceTraceLine(
        'longtask',
        `duration=${formatTraceMs(entry.duration)} taskStart=+${formatTraceMs(relativeStart)}${nearby ? ` near=${nearby}` : ''}${attribution ? ` attr=${attribution}` : ''}`,
        { key: `longtask:${Math.round(entry.startTime)}`, dedupeMs: 0 },
    );
}

function recordPerformanceTraceLongDomRefresh(info) {
    const state = getPerformanceTraceState();
    if (!state.active || !info) {
        return;
    }

    state.counters.longDomRefreshes = Number(state.counters.longDomRefreshes || 0) + 1;
    if (!(state.longDomRefreshStats instanceof Map)) {
        state.longDomRefreshStats = new Map();
    }
    const reason = sanitizeTraceValue(info.reason || 'unknown');
    updatePerformanceTraceStats(state.longDomRefreshStats, reason, info.duration);

    if (info.duration < PERFORMANCE_TRACE_LISTENER_LOG_MS) {
        return;
    }

    appendPerformanceTraceLine(
        'longdom',
        [
            `refresh reason=${reason}`,
            `duration=${formatTraceMs(info.duration)}`,
            `messages=${info.messages || 0}`,
            `optimized=${info.optimized ? 'yes' : 'no'}`,
            `contained=${info.contained || 0}`,
            `editing=${info.editing || 0}`,
            `tail=${info.tail || 0}`,
            `cached=${info.cached || 0}`,
            `estimated=${info.estimated || 0}`,
            `skipped=${info.skipped || 0}`,
        ].join(' '),
        { key: `longdom:${reason}`, dedupeMs: 80 },
    );
}

function recordPerformanceTraceInteraction(type, label) {
    const state = getPerformanceTraceState();
    if (!state.active) {
        return;
    }

    state.counters.interactions += 1;
    rememberPerformanceTraceActivity('interaction', `${type}:${label}`);
    appendPerformanceTraceLine(
        'interaction',
        `${type} ${sanitizeTraceValue(label)}`,
        { key: `interaction:${type}:${label}`, dedupeMs: 500 },
    );
}

function recordPerformanceTraceFetchStart(info) {
    const state = getPerformanceTraceState();
    state.counters.fetches += 1;
    rememberPerformanceTraceActivity('fetch-start', `${info.method} ${info.path}`);
    appendPerformanceTraceLine(
        'fetch-start',
        `${info.method} ${info.path} body=${info.bodySize} encoding=${info.encoding || 'none'}`,
        { key: `fetch-start:${info.method}:${info.path}:${info.bodySize}`, dedupeMs: 250 },
    );
}

function recordPerformanceTraceFetchEnd(info, duration, status) {
    const state = getPerformanceTraceState();
    updatePerformanceTraceStats(state.fetchStats, `${info.method} ${info.path}`, duration);
    rememberPerformanceTraceActivity('fetch-end', `${info.method} ${info.path}`, performance.now() - duration);
    appendPerformanceTraceLine(
        'fetch-end',
        `${info.method} ${info.path} status=${status || 'unknown'} duration=${formatTraceMs(duration)} body=${info.bodySize}`,
        { key: `fetch-end:${info.method}:${info.path}:${status}:${info.bodySize}`, dedupeMs: 250 },
    );
}

function recordPerformanceTraceFetchError(info, duration, error) {
    rememberPerformanceTraceActivity('fetch-error', `${info.method} ${info.path}`, performance.now() - duration);
    appendPerformanceTraceLine(
        'fetch-error',
        `${info.method} ${info.path} duration=${formatTraceMs(duration)} error=${sanitizeTraceValue(error?.message || error)}`,
        { key: `fetch-error:${info.method}:${info.path}`, dedupeMs: 250 },
    );
}

function recordPerformanceTraceGzipCompression(info) {
    const state = getPerformanceTraceState();
    if (!state.active) {
        return;
    }

    const duration = Number(info?.duration || 0);
    const label = `${info?.method || 'POST'} ${info?.path || '/api/chats/save'}`;
    const originalBytes = Number(info?.originalBytes || 0);
    const compressedBytes = Number(info?.compressedBytes || 0);
    const ratio = originalBytes > 0 && compressedBytes > 0
        ? `${Math.round((compressedBytes / originalBytes) * 100)}%`
        : 'n/a';

    state.counters.gzipCompression += 1;
    updatePerformanceTraceStats(state.gzipStats, label, duration);
    rememberPerformanceTraceActivity('gzip', label, info?.startedAt || performance.now() - duration);

    appendPerformanceTraceLine(
        'gzip',
        `${label} original=${formatTraceBytes(originalBytes)} compressed=${formatTraceBytes(compressedBytes)} ratio=${ratio} duration=${formatTraceMs(duration)}${info?.caller ? ` caller=${sanitizeTraceValue(info.caller)}` : ''}`,
        { key: `gzip:${label}:${originalBytes}:${compressedBytes}:${Math.round(duration / 10)}`, dedupeMs: 0 },
    );
}

function rememberPerformanceTraceActivity(type, label, at = performance.now()) {
    const state = getPerformanceTraceState();
    if (!state.active || !Array.isArray(state.activities)) {
        return;
    }

    state.activities.push({
        at,
        type: sanitizeTraceValue(type),
        label: sanitizeTraceValue(label),
    });

    while (state.activities.length > 80) {
        state.activities.shift();
    }
}

function getNearbyPerformanceTraceActivity(startTime) {
    const state = getPerformanceTraceState();
    const activities = Array.isArray(state.activities) ? state.activities : [];
    let nearest = null;
    let nearestDistance = Infinity;

    for (const activity of activities) {
        const distance = Math.abs(startTime - activity.at);
        if (distance < nearestDistance) {
            nearest = activity;
            nearestDistance = distance;
        }
    }

    if (!nearest || nearestDistance > 1200) {
        return '';
    }

    const delta = startTime - nearest.at;
    const sign = delta >= 0 ? '+' : '-';
    return `${nearest.type}:${nearest.label}${sign}${formatTraceMs(Math.abs(delta))}`;
}

function summarizePerformanceTraceLongTaskAttribution(entry) {
    const attribution = Array.isArray(entry?.attribution) ? entry.attribution[0] : null;
    if (!attribution) {
        return '';
    }

    return [
        attribution.name,
        attribution.containerType,
        attribution.containerName,
        attribution.containerSrc,
    ]
        .filter(Boolean)
        .map(sanitizeTraceValue)
        .join('/');
}

function appendPerformanceTraceLine(type, message, { key = '', dedupeMs = PERFORMANCE_TRACE_DEDUPE_MS } = {}) {
    const state = getPerformanceTraceState();
    if (!state.active || !Array.isArray(state.lines)) {
        return;
    }

    const now = performance.now();
    const elapsed = now - state.startedAt;

    if (key && dedupeMs > 0) {
        const previous = state.lastKeys.get(key) || 0;
        if (now - previous < dedupeMs) {
            state.counters.suppressed += 1;
            return;
        }
        state.lastKeys.set(key, now);
    }

    const snapshot = getPerformanceTraceSnapshot();
    let line = `+${formatTraceMs(elapsed)} ${type} ${message} | ${snapshot}`;

    if (line.length > PERFORMANCE_TRACE_MAX_LINE_LENGTH) {
        line = `${line.slice(0, PERFORMANCE_TRACE_MAX_LINE_LENGTH - 15)}...<truncated>`;
    }

    state.lines.push(line);

    while (state.lines.length > PERFORMANCE_TRACE_MAX_LINES) {
        state.lines.shift();
        state.counters.dropped += 1;
    }
}

function getPerformanceTraceFetchInfo(input, init) {
    const rawUrl = getFetchRequestUrl(input);
    if (!rawUrl) {
        return null;
    }

    try {
        const url = new URL(rawUrl, location.href);
        if (!PERFORMANCE_TRACE_FETCH_PATHS.has(url.pathname)) {
            return null;
        }

        const headers = buildFetchHeaders(input, init);
        return {
            path: url.pathname,
            method: getFetchRequestMethod(input, init),
            bodySize: getTraceFetchBodySize(init?.body),
            encoding: headers.get('Content-Encoding') || '',
        };
    } catch {
        return null;
    }
}

function getTraceFetchBodySize(body) {
    if (body == null) {
        return 'none';
    }

    if (typeof body === 'string') {
        return `${body.length}ch`;
    }

    if (body instanceof Blob) {
        return `${body.size}B`;
    }

    if (body instanceof URLSearchParams) {
        return `${String(body).length}ch`;
    }

    if (body instanceof ArrayBuffer) {
        return `${body.byteLength}B`;
    }

    if (ArrayBuffer.isView(body)) {
        return `${body.byteLength}B`;
    }

    if (body instanceof FormData) {
        return 'form-data';
    }

    return typeof body;
}

function getJsonStringifyTraceKind(value) {
    if (!value || typeof value !== 'object') {
        return null;
    }

    if (Array.isArray(value.chat)) {
        return {
            name: value.id ? 'group-chat-save-body' : 'chat-save-body',
            count: value.chat.length,
        };
    }

    if (Array.isArray(value) && value[0]?.chat_metadata) {
        return {
            name: 'chat-array',
            count: value.length,
        };
    }

    return null;
}

function getPerformanceTraceSnapshot({ includeTextStats = false } = {}) {
    const chat = Array.isArray(scriptModule.chat) ? scriptModule.chat : [];
    const visibleMessages = document.querySelectorAll('#chat .mes').length;
    const firstVisible = document.querySelector('#chat .mes')?.getAttribute('mesid') ?? 'none';
    const lastVisible = [...document.querySelectorAll('#chat .mes')].at(-1)?.getAttribute('mesid') ?? 'none';
    const memory = getPerformanceMemorySnapshot();
    const base = [
        `chat=${chat.length}`,
        `visible=${visibleMessages}`,
        `range=${firstVisible}-${lastVisible}`,
        `trunc=${power_user?.chat_truncation ?? 'unknown'}`,
        `chatId=${sanitizeTraceValue(getCurrentChatId() || 'none')}`,
        memory,
        chatOptimizations.getLongChatDomRenderSnapshot(),
    ].filter(Boolean);

    if (includeTextStats) {
        base.push(getChatTextStats(chat));
    }

    base.push(getVisibleMessageTextStats(chat));

    return base.join(' ');
}

function getChatTextStats(chat) {
    let textChars = 0;
    let mediaItems = 0;

    for (const message of chat) {
        textChars += typeof message?.mes === 'string' ? message.mes.length : 0;
        mediaItems += Array.isArray(message?.extra?.media) ? message.extra.media.length : 0;
        mediaItems += Array.isArray(message?.extra?.files) ? message.extra.files.length : 0;
    }

    return `textChars=${textChars} mediaItems=${mediaItems}`;
}

function getVisibleMessageTextStats(chat) {
    const stats = chatOptimizations.calculateVisibleMessageTextStats(chat);
    return `visibleTextChars=${stats.visibleTextChars} maxVisibleMes=${stats.maxVisibleMesId}:${stats.maxVisibleChars}`;
}

function getPerformanceMemorySnapshot() {
    const memory = performance.memory;
    if (!memory) {
        return '';
    }

    return `heap=${formatTraceBytes(memory.usedJSHeapSize)}/${formatTraceBytes(memory.jsHeapSizeLimit)}`;
}

function summarizeTraceArgs(args, limit = 3) {
    return args
        .slice(0, limit)
        .map((arg) => summarizeTraceArg(arg))
        .join(',');
}

function summarizeTraceArg(arg) {
    if (arg == null) {
        return String(arg);
    }

    if (['string', 'number', 'boolean'].includes(typeof arg)) {
        return sanitizeTraceValue(arg);
    }

    if (Array.isArray(arg)) {
        return `Array(${arg.length})`;
    }

    if (typeof arg === 'object') {
        if ('messageId' in arg || 'mesId' in arg || 'newSwipeId' in arg) {
            return `{messageId=${arg.messageId ?? arg.mesId ?? 'n/a'},newSwipeId=${arg.newSwipeId ?? 'n/a'}}`;
        }

        if (arg.detail?.id !== undefined) {
            return `{detail.id=${sanitizeTraceValue(arg.detail.id)}}`;
        }

        const keys = Object.keys(arg).slice(0, 5).join(',');
        return `{keys=${keys}}`;
    }

    return typeof arg;
}

function getPerformanceTraceListenerCount(event) {
    return Array.isArray(eventSource?.events?.[event]) ? eventSource.events[event].length : 0;
}

function getPerformanceTraceListenerLabel(event, listener, index) {
    const name = listener?.name || 'anonymous';
    const source = getFunctionSource(listener);
    const hint = inferPerformanceTraceListenerHint(event, listener, source);
    return `${hint || 'unknown'}:${name}#${index + 1}`;
}

function getFunctionSource(fn) {
    try {
        return Function.prototype.toString.call(fn).slice(0, 1600);
    } catch {
        return '';
    }
}

function inferPerformanceTraceListenerHint(event, listener, source) {
    const name = listener?.name || '';

    if (source.includes('translateFunction') || source.includes('translateIncomingMessage') || source.includes('translateMessageEdit')) {
        return 'translate';
    }

    if (source.includes('extension_settings.memory') || source.includes('getLatestMemoryFromChat') || source.includes('setMemoryContext')) {
        return 'memory';
    }

    if (source.includes('PromptReasoning') || source.includes('updateReasoningUI') || source.includes('eventHandler(event, idx)')) {
        return 'reasoning';
    }

    if (source.includes('renderDebounced') || source.includes('PromptManager')) {
        return 'prompt-manager';
    }

    if (source.includes('moduleWorker.update') || source.includes('vectors') || name.includes('vectors')) {
        return 'vectors';
    }

    if (source.includes('debouncedRender') || source.includes('logprobs')) {
        return 'logprobs';
    }

    if (source.includes('getContext().saveChat') || source.includes('saveChatConditional')) {
        return 'save-chat';
    }

    if (source.includes('baiBaiToolkit') || source.includes('MobileMessageEdit') || source.includes('mobileMessageEdit')) {
        return 'this-plugin';
    }

    if (name && name !== 'anonymous') {
        return 'named';
    }

    return '';
}

function summarizeResponseJsonResult(result) {
    if (Array.isArray(result)) {
        const first = result[0]?.chat_metadata ? 'chat-header' : typeof result[0];
        return `Array(${result.length},first=${first})`;
    }

    if (result && typeof result === 'object') {
        return `{keys=${Object.keys(result).slice(0, 5).join(',')}}`;
    }

    return sanitizeTraceValue(typeof result);
}

function updatePerformanceTraceStats(map, key, duration) {
    const stats = map.get(key) || { count: 0, total: 0, max: 0 };
    stats.count += 1;
    stats.total += duration;
    stats.max = Math.max(stats.max, duration);
    map.set(key, stats);
}

function buildPerformanceTraceExport(state) {
    const duration = state.endedAtIso
        ? new Date(state.endedAtIso).getTime() - new Date(state.startedAtIso).getTime()
        : 0;
    const lines = [
        'SillyTavern performance trace',
        `started=${state.startedAtIso || ''}`,
        `ended=${state.endedAtIso || ''}`,
        `duration=${duration}ms`,
        `finalSnapshot=${getPerformanceTraceSnapshot({ includeTextStats: true })}`,
        '',
        'Counters',
        `events=${state.counters?.events || 0}`,
        `fetches=${state.counters?.fetches || 0}`,
        `gzipCompression=${state.counters?.gzipCompression || 0}`,
        `jsonStringify=${state.counters?.jsonStringify || 0}`,
        `responseJson=${state.counters?.responseJson || 0}`,
        `longTasks=${state.counters?.longTasks || 0}`,
        `longDomRefreshes=${state.counters?.longDomRefreshes || 0}`,
        `interactions=${state.counters?.interactions || 0}`,
        `listeners=${state.counters?.listeners || 0}`,
        `suppressedDuplicates=${state.counters?.suppressed || 0}`,
        `droppedOldLines=${state.counters?.dropped || 0}`,
        '',
        'Top Events',
        ...formatTraceStatsMap(state.eventStats),
        '',
        'Top Listeners',
        ...formatTraceStatsMap(state.listenerStats),
        '',
        'Top Fetches',
        ...formatTraceStatsMap(state.fetchStats),
        '',
        'Top Gzip compression',
        ...formatTraceStatsMap(state.gzipStats),
        '',
        'Top JSON.stringify',
        ...formatTraceStatsMap(state.jsonStats),
        '',
        'Top Response.json',
        ...formatTraceStatsMap(state.responseJsonStats),
        '',
        'Top Long DOM Refresh',
        ...formatTraceStatsMap(state.longDomRefreshStats),
        '',
        'Log',
        ...(state.lines || []),
    ];

    return lines.join('\n');
}

function formatTraceStatsMap(map) {
    if (!map || !map.size) {
        return ['none'];
    }

    return [...map.entries()]
        .sort((a, b) => b[1].total - a[1].total)
        .slice(0, 12)
        .map(([key, stats]) => `${key} count=${stats.count} total=${formatTraceMs(stats.total)} max=${formatTraceMs(stats.max)}`);
}

function updatePerformanceTraceControls() {
    const state = getPerformanceTraceState();
    const active = Boolean(state.active);
    const lineCount = Array.isArray(state.lines) ? state.lines.length : 0;
    const dropped = state.counters?.dropped || 0;
    const suppressed = state.counters?.suppressed || 0;

    $('#bai_bai_toolkit_perf_trace_start').toggleClass('disabled', active);
    $('#bai_bai_toolkit_perf_trace_stop').toggleClass('disabled', !active);
    $('#bai_bai_toolkit_perf_trace_status').text(
        active
            ? `recording, lines=${lineCount}, suppressed=${suppressed}, dropped=${dropped}`
            : `idle, last lines=${lineCount}, suppressed=${suppressed}, dropped=${dropped}`,
    );
}

function downloadTextFile(filename, text) {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function notifyPerformanceTrace(message) {
    if (globalThis.toastr?.info) {
        globalThis.toastr.info(message, 'Performance trace');
    }
}

function getTraceElementLabel(element) {
    if (element.id) {
        return `#${element.id}`;
    }

    const classes = [...element.classList].slice(0, 4).join('.');
    return `${element.tagName.toLowerCase()}${classes ? `.${classes}` : ''}`;
}

function getPerformanceTraceStackSummary() {
    const state = getPerformanceTraceState();
    if (!state.active) {
        return '';
    }

    try {
        const stack = new Error().stack;
        if (!stack) {
            return '';
        }

        return stack
            .split('\n')
            .map(line => line.trim().replace(/^at\s+/, ''))
            .filter(line => line
                && !line.includes('getPerformanceTraceStackSummary')
                && !line.includes('baiBaiToolkitSaveRequestGzipFetch')
                && !line.includes('baiBaiToolkitPerformanceTraceFetch')
                && !line.includes('gzipFetchBody')
                && !line.includes('recordPerformanceTrace'))
            .slice(0, 4)
            .map(line => line.replace(location.origin, ''))
            .join(' <- ');
    } catch {
        return '';
    }
}

function sanitizeTraceValue(value) {
    return String(value)
        .replace(/\s+/g, ' ')
        .slice(0, 120);
}

function formatTraceMs(value) {
    return `${Number(value || 0).toFixed(1)}ms`;
}

function formatTraceBytes(value) {
    const bytes = Number(value || 0);
    if (bytes >= 1024 * 1024) {
        return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
    }
    if (bytes >= 1024) {
        return `${(bytes / 1024).toFixed(1)}KB`;
    }
    return `${bytes}B`;
}

export {
    appendPerformanceTraceLine,
    buildPerformanceTraceExport,
    downloadTextFile,
    formatTraceBytes,
    formatTraceMs,
    formatTraceStatsMap,
    getChatTextStats,
    getFunctionSource,
    getJsonStringifyTraceKind,
    getNearbyPerformanceTraceActivity,
    getPerformanceMemorySnapshot,
    getPerformanceTraceFetchInfo,
    getPerformanceTraceListenerCount,
    getPerformanceTraceListenerLabel,
    getPerformanceTraceSnapshot,
    getPerformanceTraceStackSummary,
    getPerformanceTraceState,
    getTraceElementLabel,
    getTraceFetchBodySize,
    getVisibleMessageTextStats,
    inferPerformanceTraceListenerHint,
    installPerformanceTraceEventEmitPatch,
    installPerformanceTraceFetchHook,
    installPerformanceTraceInteractionListeners,
    installPerformanceTraceJsonStringifyPatch,
    installPerformanceTraceLongTaskObserver,
    installPerformanceTraceResponseJsonPatch,
    installPerformanceTraceRuntimePatches,
    notifyPerformanceTrace,
    recordPerformanceTraceEvent,
    recordPerformanceTraceFetchEnd,
    recordPerformanceTraceFetchError,
    recordPerformanceTraceFetchStart,
    recordPerformanceTraceGzipCompression,
    recordPerformanceTraceInteraction,
    recordPerformanceTraceJsonStringify,
    recordPerformanceTraceListener,
    recordPerformanceTraceLongDomRefresh,
    recordPerformanceTraceLongTask,
    recordPerformanceTraceResponseJson,
    rememberPerformanceTraceActivity,
    restorePerformanceTraceRuntimePatches,
    sanitizeTraceValue,
    startPerformanceTrace,
    stopPerformanceTraceAndExport,
    summarizePerformanceTraceLongTaskAttribution,
    summarizeResponseJsonResult,
    summarizeTraceArg,
    summarizeTraceArgs,
    updatePerformanceTraceControls,
    updatePerformanceTraceStats,
};
