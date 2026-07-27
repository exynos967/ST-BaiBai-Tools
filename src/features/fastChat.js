import * as scriptModule from '@sillytavern/script';
import { event_types, eventSource, getCurrentChatId, getRequestHeaders } from '@sillytavern/script';
import { power_user } from '@sillytavern/scripts/power-user';
import { BAIBAOKU_FAST_CHAT_GET_URL, FAST_CHAT_GET_ACTION_SELECTOR, FAST_CHAT_GET_DEFAULT_INITIAL_MESSAGES, FAST_CHAT_GET_DEFAULT_THRESHOLD_BYTES, FAST_CHAT_GET_FETCH_KEY, FAST_CHAT_GET_JQUERY_TRIGGER_GUARD_KEY, FAST_CHAT_GET_PATHS, FAST_CHAT_GET_SAVE_PATHS, LOG_PREFIX } from './constants.js';
import { buildFetchHeaders, copyFetchRequestOptions, getFetchRequestMethod, getFetchRequestUrl } from './gzipHook.js';
import { extensionState, settings } from './state.js';
import { readFetchJsonBody } from './util.js';

function applyFastChatGetOptimization() {
    const hook = installFastChatGetFetchHook();
    if (hook) {
        hook.isEnabled = () => settings.progressiveChatLoadingEnabled === true;
    }

    installFastChatGetInteractionGuard();
}

function getFastChatGetState() {
    if (!extensionState.fastChatGet || typeof extensionState.fastChatGet !== 'object') {
        extensionState.fastChatGet = {
            requestId: 0,
            current: null,
            lastNoticeAt: 0,
        };
    }

    return extensionState.fastChatGet;
}

function installFastChatGetInteractionGuard() {
    const state = getFastChatGetState();

    installFastChatGetJQueryTriggerGuard();

    if (!state.pointerInteractionGuardInstalled) {
        state.pointerInteractionGuardInstalled = true;

        const interactionHandler = (event) => {
            if (!isFastChatGetHydrating()) {
                return;
            }

            if (!getFastChatGetBlockedInteractionTarget(event)) {
                return;
            }

            event.preventDefault();
            event.stopImmediatePropagation();
            notifyFastChatGetBlocked();
        };

        for (const eventName of ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'touchstart', 'touchend', 'click']) {
            document.addEventListener(eventName, interactionHandler, { capture: true });
        }
    }

    if (!state.keydownInteractionGuardInstalled) {
        state.keydownInteractionGuardInstalled = true;

        document.addEventListener('keydown', (event) => {
            if (!isFastChatGetHydrating()) {
                return;
            }

            if (!isFastChatGetBlockedKeydown(event)) {
                return;
            }

            event.preventDefault();
            event.stopImmediatePropagation();
            notifyFastChatGetBlocked();
        }, true);
    }

    state.interactionGuardInstalled = true;
}

function installFastChatGetJQueryTriggerGuard() {
    const existing = globalThis[FAST_CHAT_GET_JQUERY_TRIGGER_GUARD_KEY];
    if (existing?.installed) {
        return existing;
    }

    const jQueryPrototype = globalThis.jQuery?.fn || globalThis.$?.fn;
    if (!jQueryPrototype) {
        return null;
    }

    const state = {
        installed: true,
        originalTrigger: jQueryPrototype.trigger,
        originalTriggerHandler: jQueryPrototype.triggerHandler,
    };

    if (typeof state.originalTrigger === 'function') {
        jQueryPrototype.trigger = function guardedFastChatGetJQueryTrigger(eventType, ...args) {
            if (shouldBlockFastChatGetJQueryTrigger(this, eventType)) {
                notifyFastChatGetBlocked();
                return this;
            }

            return state.originalTrigger.call(this, eventType, ...args);
        };
    }

    if (typeof state.originalTriggerHandler === 'function') {
        jQueryPrototype.triggerHandler = function guardedFastChatGetJQueryTriggerHandler(eventType, ...args) {
            if (shouldBlockFastChatGetJQueryTrigger(this, eventType)) {
                notifyFastChatGetBlocked();
                return undefined;
            }

            return state.originalTriggerHandler.call(this, eventType, ...args);
        };
    }

    globalThis[FAST_CHAT_GET_JQUERY_TRIGGER_GUARD_KEY] = state;
    return state;
}

function shouldBlockFastChatGetJQueryTrigger(collection, eventType) {
    if (!isFastChatGetHydrating() || getFastChatGetJQueryTriggerEventType(eventType) !== 'click') {
        return false;
    }

    const length = Number(collection?.length || 0);
    for (let index = 0; index < length; index++) {
        const element = collection[index];
        if (element instanceof Element && element.closest(FAST_CHAT_GET_ACTION_SELECTOR)) {
            return true;
        }
    }

    return false;
}

function getFastChatGetJQueryTriggerEventType(eventType) {
    const rawType = typeof eventType === 'string'
        ? eventType
        : typeof eventType?.type === 'string'
            ? eventType.type
            : '';

    return rawType.split('.')[0];
}

function getFastChatGetBlockedInteractionTarget(event) {
    const target = getFastChatGetEventTargetElement(event);
    if (!target) {
        return null;
    }

    const actionTarget = target.closest(FAST_CHAT_GET_ACTION_SELECTOR);
    if (actionTarget) {
        return actionTarget;
    }

    if (Number(event?.detail || 0) >= 2) {
        return target.closest('#chat .mes[mesid]');
    }

    return null;
}

function isFastChatGetBlockedKeydown(event) {
    const target = getFastChatGetEventTargetElement(event);
    const key = String(event?.key || '');

    if (key === 'Enter') {
        const isSendTextareaEnter = target instanceof HTMLElement
            && target.id === 'send_textarea'
            && (event.ctrlKey || event.metaKey || !event.shiftKey);
        const isGenerationShortcut = Boolean(event.ctrlKey || event.metaKey || event.altKey);

        return isSendTextareaEnter || isGenerationShortcut;
    }

    if (key === 'ArrowLeft' || key === 'ArrowRight') {
        return !isFastChatGetEditableTarget(target);
    }

    return false;
}

function isFastChatGetEditableTarget(target) {
    if (!(target instanceof HTMLElement)) {
        return false;
    }

    const tagName = target.tagName?.toUpperCase?.() || '';
    return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(tagName);
}

function getFastChatGetEventTargetElement(event) {
    const target = event?.target;
    if (target instanceof Element) {
        return target;
    }

    if (typeof Node !== 'undefined' && target instanceof Node && target.parentElement) {
        return target.parentElement;
    }

    return null;
}

function isFastChatGetHydrating() {
    const current = getFastChatGetState().current;
    return settings.progressiveChatLoadingEnabled === true
        && Boolean(current?.loadingFull);
}

function notifyFastChatGetBlocked() {
    const state = getFastChatGetState();
    const now = Date.now();
    if (now - Number(state.lastNoticeAt || 0) < 1500) {
        return;
    }

    state.lastNoticeAt = now;
    if (globalThis.toastr?.info) {
        globalThis.toastr.info('剩余批次还未加载完成，先不要进行操作', '长聊天分批加载:');
    }
}

function installFastChatGetFetchHook() {
    const existing = globalThis[FAST_CHAT_GET_FETCH_KEY];
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
        isEnabled: () => settings.progressiveChatLoadingEnabled === true,
    };

    state.wrappedFetch = async function baiBaiToolkitFastChatGetFetch(input, init) {
        try {
            if (isFastChatGetSaveRequest(input, init) && isFastChatGetHydrating()) {
                notifyFastChatGetBlocked();
                return buildFastChatGetSkippedSaveResponse();
            }

            if (!state.isEnabled()) {
                return state.originalFetch(input, init);
            }

            const requestInfo = await getFastChatGetRequestInfo(input, init);
            if (!requestInfo) {
                return state.originalFetch(input, init);
            }

            return await fetchFastChatInitial(state.originalFetch, requestInfo, input, init);
        } catch (error) {
            console.debug(`${LOG_PREFIX} Fast chat get path failed; falling back to native chat get`, error);
            return state.originalFetch(input, init);
        }
    };

    state.wrappedFetch[FAST_CHAT_GET_FETCH_KEY] = true;
    globalThis[FAST_CHAT_GET_FETCH_KEY] = state;
    globalThis.fetch = state.wrappedFetch;
    return state;
}

function isFastChatGetSaveRequest(input, init) {
    const rawUrl = getFetchRequestUrl(input);
    if (!rawUrl || getFetchRequestMethod(input, init) !== 'POST') {
        return false;
    }

    try {
        const url = new URL(rawUrl, location.href);
        return url.origin === location.origin && FAST_CHAT_GET_SAVE_PATHS.has(url.pathname);
    } catch {
        return false;
    }
}

async function getFastChatGetRequestInfo(input, init) {
    const rawUrl = getFetchRequestUrl(input);

    if (!rawUrl || getFetchRequestMethod(input, init) !== 'POST') {
        return null;
    }

    let url;
    try {
        url = new URL(rawUrl, location.href);
    } catch {
        return null;
    }

    if (url.origin !== location.origin || !FAST_CHAT_GET_PATHS.has(url.pathname)) {
        return null;
    }

    const body = await readFetchJsonBody(input, init);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return null;
    }

    return {
        path: url.pathname,
        body,
    };
}

async function fetchFastChatInitial(fetchFn, requestInfo, input, init) {
    const response = await fetchFastChatPayload(fetchFn, input, init, {
        source: requestInfo.path,
        mode: 'initial',
        originalRequest: requestInfo.body,
        thresholdBytes: FAST_CHAT_GET_DEFAULT_THRESHOLD_BYTES,
        initialMessages: getFastChatInitialMessageCount(),
    });

    const data = normalizeFastChatGetPayload(response);
    if (!Array.isArray(data.chat)) {
        throw new Error('BaiBaoKu fast chat get returned a non-array chat payload');
    }

    if (data.kind === 'partial' || data.meta?.partial === true) {
        beginFastChatHydration(fetchFn, requestInfo, input, init, data);
    } else {
        clearFastChatHydration();
    }

    return buildFastChatGetArrayResponse(data.chat);
}

async function fetchFastChatPayload(fetchFn, input, init, payload) {
    const headers = buildFetchHeaders(input, init);
    const requestHeaders = getRequestHeaders();
    for (const [key, value] of Object.entries(requestHeaders || {})) {
        if (!headers.has(key)) {
            headers.set(key, value);
        }
    }
    headers.set('Content-Type', 'application/json');

    const fastInit = {
        ...copyFetchRequestOptions(input, init),
        method: 'POST',
        headers,
        cache: 'no-store',
        body: JSON.stringify(payload),
    };

    const response = await fetchFn(BAIBAOKU_FAST_CHAT_GET_URL, fastInit);
    const json = await response.clone().json().catch(() => null);
    if (!response?.ok || !json) {
        throw new Error(`Unexpected status ${response?.status || 'unknown'}`);
    }

    const data = json?.data && typeof json.data === 'object' ? json.data : json;
    if (json?.ok === false || data?.ok === false) {
        throw new Error(json?.message || json?.error?.message || data?.message || data?.error?.message || 'BaiBaoKu fast chat get failed');
    }

    return data;
}

function normalizeFastChatGetPayload(data) {
    if (!data || typeof data !== 'object') {
        throw new Error('BaiBaoKu fast chat get returned an invalid payload');
    }

    return {
        kind: String(data.kind || (data.meta?.partial ? 'partial' : 'complete')),
        chat: data.chat,
        meta: data.meta && typeof data.meta === 'object' ? data.meta : {},
    };
}

function beginFastChatHydration(fetchFn, requestInfo, input, init, data) {
    const state = getFastChatGetState();
    const meta = data.meta || {};
    const hydration = {
        requestId: Number(state.requestId || 0) + 1,
        loadingFull: true,
        source: requestInfo.path,
        originalRequest: requestInfo.body,
        chatKey: String(meta.chatKey || ''),
        version: String(meta.version || ''),
        messageStartIndex: Math.max(0, Number(meta.messageStartIndex || 0)),
        returnedMessages: Math.max(0, Number(meta.returnedMessages || getChatMessagesFromResponseChat(data.chat).length || 0)),
        currentChatId: getCurrentChatId?.() ?? '',
        startedAt: Date.now(),
    };

    state.requestId = hydration.requestId;
    state.current = hydration;
    document.body?.classList.add('bai-bai-toolkit-fast-chat-hydrating');

    void hydrateFastChatInBackground(fetchFn, input, init, hydration)
        .catch((error) => {
            console.warn(`${LOG_PREFIX} Fast chat hydration failed`, error);
            if (getFastChatGetState().current?.requestId === hydration.requestId && globalThis.toastr?.error) {
                globalThis.toastr.error('聊天记录补全失败，请重新进入当前聊天。', '柏宝库');
            }
        });
}

async function hydrateFastChatInBackground(fetchFn, input, init, hydration) {
    const payload = {
        source: hydration.source,
        mode: 'full',
        originalRequest: hydration.originalRequest,
        chatKey: hydration.chatKey,
        version: hydration.version,
    };

    let data;
    try {
        data = normalizeFastChatGetPayload(await fetchFastChatPayload(fetchFn, input, init, payload));
    } catch (error) {
        console.debug(`${LOG_PREFIX} BaiBaoKu full chat get failed; trying native chat get`, error);
        data = {
            kind: 'full',
            chat: await fetchNativeFullChat(fetchFn, hydration),
            meta: {
                chatKey: hydration.chatKey,
                version: hydration.version,
            },
        };
    }

    if (!isCurrentFastChatHydration(hydration, data.meta)) {
        if (getFastChatGetState().current?.requestId === hydration.requestId) {
            clearFastChatHydration(hydration.requestId);
            if (globalThis.toastr?.warning) {
                globalThis.toastr.warning('聊天记录补全状态已过期，请重新进入当前聊天。', '柏宝库');
            }
        }
        return;
    }

    completeFastChatHydration(hydration, data);
}

async function fetchNativeFullChat(fetchFn, hydration) {
    const headers = new Headers(getRequestHeaders());
    if (!headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json');
    }

    const response = await fetchFn(hydration.source, {
        method: 'POST',
        headers,
        cache: 'no-store',
        body: JSON.stringify(hydration.originalRequest || {}),
    });
    const data = await response.clone().json().catch(() => null);
    if (!response?.ok || !Array.isArray(data)) {
        throw new Error(`Native chat get returned ${response?.status || 'invalid data'}`);
    }

    return data;
}

function isCurrentFastChatHydration(hydration, meta = {}) {
    const current = getFastChatGetState().current;
    if (!current || current.requestId !== hydration.requestId || !current.loadingFull) {
        return false;
    }

    if (hydration.chatKey && meta?.chatKey && String(meta.chatKey) !== hydration.chatKey) {
        return false;
    }

    if (hydration.version && meta?.version && String(meta.version) !== hydration.version) {
        return false;
    }

    const currentChatId = getCurrentChatId?.() ?? '';
    return String(currentChatId) === String(hydration.currentChatId);
}

function completeFastChatHydration(hydration, data) {
    const messages = getChatMessagesFromResponseChat(data.chat);
    if (!messages.length && Array.isArray(data.chat) && data.chat.length > 0) {
        throw new Error('Full chat payload did not contain messages');
    }

    const chatArray = Array.isArray(scriptModule.chat) ? scriptModule.chat : null;
    if (!chatArray) {
        throw new Error('SillyTavern chat array is unavailable');
    }

    const chatElement = document.querySelector('#chat');
    const scrollSnapshot = getFastChatScrollSnapshot(chatElement);

    chatArray.splice(0, chatArray.length, ...messages);
    scheduleFastChatDomCorrection(hydration);
    syncFastChatShowMoreButton(messages.length);
    emitFastChatHydratedEvents();
    restoreFastChatScrollSnapshot(chatElement, scrollSnapshot);
    clearFastChatHydration(hydration.requestId);

    console.debug(`${LOG_PREFIX} Fast chat hydration completed`, {
        messages: messages.length,
        start: hydration.messageStartIndex,
        returned: hydration.returnedMessages,
    });
}

function getChatMessagesFromResponseChat(chat) {
    if (!Array.isArray(chat)) {
        return [];
    }

    if (chat[0]?.chat_metadata) {
        return chat.slice(1);
    }

    return chat;
}

function correctFastChatDomMessageIds(hydration) {
    const messages = [...document.querySelectorAll('#chat .mes[mesid]')]
        .filter(element => element instanceof HTMLElement);

    messages.forEach((element, index) => {
        const realId = hydration.messageStartIndex + index;
        element.setAttribute('mesid', String(realId));
        element.dataset.mesid = String(realId);
        element.dataset.messageId = String(realId);

        const display = element.querySelector('.mesIDDisplay');
        if (display instanceof HTMLElement) {
            display.textContent = `#${realId}`;
        }
    });
}

function scheduleFastChatDomCorrection(hydration) {
    correctFastChatDomMessageIds(hydration);
    requestAnimationFrame(() => correctFastChatDomMessageIds(hydration));
    setTimeout(() => correctFastChatDomMessageIds(hydration), 100);
    setTimeout(() => correctFastChatDomMessageIds(hydration), 500);
}

function syncFastChatShowMoreButton(fullMessageCount) {
    const button = document.querySelector('#show_more_messages');
    if (!(button instanceof HTMLElement)) {
        return;
    }

    const renderedMessages = document.querySelectorAll('#chat .mes[mesid]').length;
    if (renderedMessages <= 0 || renderedMessages >= fullMessageCount) {
        return;
    }

    button.classList.remove('disabled', 'displayNone', 'hidden');
    button.removeAttribute('disabled');
    button.removeAttribute('aria-disabled');
    button.style.display = '';
}

function emitFastChatHydratedEvents() {
    try {
        if (event_types.MORE_MESSAGES_LOADED) {
            eventSource.emit(event_types.MORE_MESSAGES_LOADED);
        }
        if (event_types.CHAT_LOADED) {
            eventSource.emit(event_types.CHAT_LOADED);
        }
    } catch (error) {
        console.debug(`${LOG_PREFIX} Failed to emit fast chat hydration events`, error);
    }
}

function clearFastChatHydration(requestId = null) {
    const state = getFastChatGetState();
    if (requestId !== null && state.current?.requestId !== requestId) {
        return;
    }

    state.current = null;
    document.body?.classList.remove('bai-bai-toolkit-fast-chat-hydrating');
}

function getFastChatInitialMessageCount() {
    const truncation = Number(power_user?.chat_truncation);
    if (Number.isInteger(truncation) && truncation > 0) {
        return truncation;
    }

    return FAST_CHAT_GET_DEFAULT_INITIAL_MESSAGES;
}

function buildFastChatGetArrayResponse(chat) {
    return new Response(JSON.stringify(chat), {
        status: 200,
        statusText: 'OK',
        headers: {
            'Content-Type': 'application/json',
        },
    });
}

function buildFastChatGetSkippedSaveResponse() {
    return new Response(JSON.stringify({
        ok: true,
        skipped: true,
        reason: 'hydrating',
        message: 'Chat is still hydrating. Please wait for the full chat to load.',
    }), {
        status: 200,
        statusText: 'OK',
        headers: {
            'Content-Type': 'application/json',
        },
    });
}

function getFastChatScrollSnapshot(chatElement) {
    if (!(chatElement instanceof HTMLElement)) {
        return null;
    }

    return {
        top: chatElement.scrollTop,
        height: chatElement.scrollHeight,
    };
}

function restoreFastChatScrollSnapshot(chatElement, snapshot) {
    if (!(chatElement instanceof HTMLElement) || !snapshot) {
        return;
    }

    const restore = () => {
        const delta = chatElement.scrollHeight - snapshot.height;
        chatElement.scrollTop = Math.max(0, snapshot.top + delta);
    };

    restore();
    requestAnimationFrame(restore);
}

export {
    applyFastChatGetOptimization,
    beginFastChatHydration,
    buildFastChatGetArrayResponse,
    buildFastChatGetSkippedSaveResponse,
    clearFastChatHydration,
    completeFastChatHydration,
    correctFastChatDomMessageIds,
    emitFastChatHydratedEvents,
    fetchFastChatInitial,
    fetchFastChatPayload,
    fetchNativeFullChat,
    getChatMessagesFromResponseChat,
    getFastChatGetBlockedInteractionTarget,
    getFastChatGetEventTargetElement,
    getFastChatGetJQueryTriggerEventType,
    getFastChatGetRequestInfo,
    getFastChatGetState,
    getFastChatInitialMessageCount,
    getFastChatScrollSnapshot,
    hydrateFastChatInBackground,
    installFastChatGetFetchHook,
    installFastChatGetInteractionGuard,
    installFastChatGetJQueryTriggerGuard,
    isCurrentFastChatHydration,
    isFastChatGetBlockedKeydown,
    isFastChatGetEditableTarget,
    isFastChatGetHydrating,
    isFastChatGetSaveRequest,
    normalizeFastChatGetPayload,
    notifyFastChatGetBlocked,
    restoreFastChatScrollSnapshot,
    scheduleFastChatDomCorrection,
    shouldBlockFastChatGetJQueryTrigger,
    syncFastChatShowMoreButton,
};
