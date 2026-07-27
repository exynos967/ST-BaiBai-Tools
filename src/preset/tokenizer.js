import * as scriptModule from '@sillytavern/script';
import { getCurrentChatId, getRequestHeaders } from '@sillytavern/script';
import { oai_settings, promptManager } from '@sillytavern/scripts/openai';
import { getTokenizerModel } from '@sillytavern/scripts/tokenizers';
import { getStringHash } from '@sillytavern/scripts/utils';
import { BAIBAOKU_TOKENIZER_BULK_COUNT_URL, OPENAI_TOKENIZER_BULK_AJAX_BATCH_DELAY_MS, OPENAI_TOKENIZER_BULK_BRIDGE_KEY, OPENAI_TOKENIZER_BULK_CACHE_LIMIT, OPENAI_TOKENIZER_BULK_CIRCUIT_BREAKER_MS, OPENAI_TOKENIZER_BULK_FAILURE_THRESHOLD, OPENAI_TOKENIZER_BULK_PREPARE_CHUNK_SIZE, OPENAI_TOKENIZER_BULK_PREPARE_MAX_MESSAGES, PRESET_CONTEXT_TOKEN_REFRESH_SELF_SUPPRESS_MS, PRESET_PROMPT_MANAGER_LIST_SELECTOR, PROMPT_MANAGER_TOKEN_REFRESH_BUSY_DELAY_MS, PROMPT_MANAGER_TOKEN_REFRESH_DEFAULT_DELAY_MS, PROMPT_MANAGER_TOKEN_REFRESH_FAST_DELAY_MS, PROMPT_MANAGER_TOKEN_REFRESH_QUEUE_KEY } from './constants.js';
import { updatePromptTokenCell } from './saveToggle.js';
import { LOG_PREFIX, extensionState, settings } from './state.js';
import { arePromptManagerTokenCountsCurrent, calculatePresetEffectivePromptTokenTotal, getPresetContextTokenRefreshState, getPresetEffectiveTokenCountSignature, getPromptTokenWarning, hasPromptManagerTokenContext, isPromptManagerReadyForFastPresetSwitch, refreshPromptManagerTokensForMissingContext, renderPromptManagerListWithoutTokenStats, updatePresetEffectiveTokenHeaderDisplay, waitForNextPaint } from './switchFast.js';
import { isPresetGenerationActive } from './util.js';
import { getPresetVuePromptListManagerState, isPresetVuePromptListDragging, isPresetVuePromptListManagerActive, syncPresetVuePromptListManagerState } from './vueList.js';
import { getPresetVuePromptItemsFromModel, handlePresetVuePromptRangeSelectionClick } from './vueModel.js';

function installOpenAITokenizerBulkBridge() {
    const state = getOpenAITokenizerBulkState();
    const bridge = globalThis[OPENAI_TOKENIZER_BULK_BRIDGE_KEY] && typeof globalThis[OPENAI_TOKENIZER_BULK_BRIDGE_KEY] === 'object'
        ? globalThis[OPENAI_TOKENIZER_BULK_BRIDGE_KEY]
        : {};

    bridge.installed = true;
    bridge.version = '0.1';
    bridge.prepareOpenAIMessages = prepareOpenAITokenizerBulkMessages;
    bridge.prepareWorldInfoBudgetCounts = prepareOpenAITokenizerWorldInfoBudgetCounts;
    bridge.clear = () => state.cache.clear();
    bridge.getStats = () => ({ ...state.stats, cacheSize: state.cache.size });
    bridge.isEnabled = isOpenAITokenizerBulkEnabled;
    globalThis[OPENAI_TOKENIZER_BULK_BRIDGE_KEY] = bridge;

    installOpenAITokenizerBulkAjaxPatch();
}

async function getOpenAITokenizerBulkCountsUsingCache(model, entries) {
    const results = new Array(entries.length);
    const misses = [];

    for (let index = 0; index < entries.length; index += 1) {
        const entry = entries[index];
        const key = getOpenAITokenizerCacheKey(model, entry.message);
        const cached = getOpenAITokenizerBulkState().cache.get(key);

        if (typeof cached === 'number') {
            results[index] = cached;
            continue;
        }

        misses.push({
            index,
            key,
            message: entry.message,
        });
    }

    if (misses.length > 0) {
        const counts = await fetchOpenAITokenizerBulkCounts(model, misses);
        counts.forEach((count, missIndex) => {
            const miss = misses[missIndex];
            setOpenAITokenizerBulkCache(miss.key, count);
            results[miss.index] = count;
        });
    }

    return results.map(count => Number(count) || 0);
}

function normalizeOpenAITokenizerPromptManagerCount(rawCount, model) {
    const count = Number(rawCount);
    if (!Number.isFinite(count)) {
        return 0;
    }

    return Math.max(0, count - (model === 'claude' ? 1 : 3));
}

async function fastRefreshPromptManagerTokensAfterContextChange(reason, { markPending = true, forceVisible = false } = {}) {
    try {
        if (!isPromptManagerReadyForFastPresetSwitch()) {
            return;
        }

        if (!forceVisible && !isPromptManagerTokenPanelVisible()) {
            return;
        }

        await renderPromptManagerListWithoutTokenStats();
        if (markPending) {
            markPromptManagerTokensPending();
        }
        schedulePromptManagerTokenRefresh(reason || 'context change token refresh', {
            delayMs: PROMPT_MANAGER_TOKEN_REFRESH_FAST_DELAY_MS,
            forceVisible,
        });
    } catch (error) {
        console.debug(`${LOG_PREFIX} Failed to fast-refresh prompt manager after ${reason}`, error);
    }
}

function getPromptManagerTokenRefreshQueueState() {
    if (!extensionState[PROMPT_MANAGER_TOKEN_REFRESH_QUEUE_KEY] || typeof extensionState[PROMPT_MANAGER_TOKEN_REFRESH_QUEUE_KEY] !== 'object') {
        extensionState[PROMPT_MANAGER_TOKEN_REFRESH_QUEUE_KEY] = {
            timer: null,
            reason: '',
            inFlight: false,
            pendingAfterFlight: false,
            pendingWhileHidden: false,
            lastSignature: '',
            lastEffectiveTokenCountSignature: '',
            force: false,
            forceVisible: false,
            displayFrame: 0,
            pendingFrame: 0,
        };
    }

    const state = extensionState[PROMPT_MANAGER_TOKEN_REFRESH_QUEUE_KEY];
    if (typeof state.lastEffectiveTokenCountSignature !== 'string') {
        state.lastEffectiveTokenCountSignature = typeof state.lastEffectiveTokenSignature === 'string'
            ? state.lastEffectiveTokenSignature
            : '';
    }

    if (Object.prototype.hasOwnProperty.call(state, 'lastEffectiveTokenSignature')) {
        delete state.lastEffectiveTokenSignature;
    }

    return state;
}

function schedulePromptManagerTokenRefresh(reason = 'prompt manager token refresh', {
    delayMs = PROMPT_MANAGER_TOKEN_REFRESH_DEFAULT_DELAY_MS,
    force = false,
    forceVisible = false,
} = {}) {
    const state = getPromptManagerTokenRefreshQueueState();
    state.reason = reason || state.reason || 'prompt manager token refresh';
    state.force = Boolean(state.force || force);
    state.forceVisible = Boolean(state.forceVisible || forceVisible);

    if (!isPromptManagerTokenRefreshEnabled()) {
        clearTimeout(state.timer);
        state.timer = null;
        return;
    }

    if (extensionState.promptManagerCustomDragState || isPresetVuePromptListDragging()) {
        extensionState.promptManagerTokenRefreshPendingAfterDrag = true;
        return;
    }

    if (isPresetGenerationActive()) {
        clearTimeout(state.timer);
        state.timer = setTimeout(() => {
            state.timer = null;
            schedulePromptManagerTokenRefresh(state.reason || reason, {
                delayMs: PROMPT_MANAGER_TOKEN_REFRESH_BUSY_DELAY_MS,
                force: state.force,
                forceVisible: state.forceVisible,
            });
        }, PROMPT_MANAGER_TOKEN_REFRESH_BUSY_DELAY_MS);
        return;
    }

    if (state.inFlight) {
        state.pendingAfterFlight = true;
        return;
    }

    if (!state.forceVisible && !isPromptManagerTokenPanelVisible()) {
        state.pendingWhileHidden = true;
        return;
    }

    clearTimeout(state.timer);
    state.timer = setTimeout(() => {
        state.timer = null;
        void runScheduledPromptManagerTokenRefresh();
    }, Math.max(0, Number(delayMs) || 0));
}

function flushPromptManagerTokenRefreshIfPendingVisible(reason = 'prompt manager visible') {
    const state = getPromptManagerTokenRefreshQueueState();
    if (!state.pendingWhileHidden || !isPromptManagerTokenPanelVisible()) {
        return;
    }

    state.pendingWhileHidden = false;
    schedulePromptManagerTokenRefresh(reason, {
        delayMs: PROMPT_MANAGER_TOKEN_REFRESH_FAST_DELAY_MS,
        force: true,
        forceVisible: true,
    });
}

async function runScheduledPromptManagerTokenRefresh() {
    const state = getPromptManagerTokenRefreshQueueState();
    if (state.inFlight) {
        state.pendingAfterFlight = true;
        return;
    }

    state.inFlight = true;
    state.pendingAfterFlight = false;

    try {
        await refreshPromptManagerTokens({
            reason: state.reason,
            force: state.force,
            forceVisible: state.forceVisible,
        });
    } finally {
        state.inFlight = false;
        state.force = false;
        state.forceVisible = false;

        if (state.pendingAfterFlight) {
            state.pendingAfterFlight = false;
            schedulePromptManagerTokenRefresh(state.reason || 'pending prompt manager token refresh', {
                delayMs: PROMPT_MANAGER_TOKEN_REFRESH_DEFAULT_DELAY_MS,
                force: true,
                forceVisible: true,
            });
        }
    }
}

async function refreshPromptManagerTokens({ reason = 'prompt manager token refresh', force = false, forceVisible = false } = {}) {
    if (!isPromptManagerTokenRefreshEnabled()) {
        return;
    }

    if (extensionState.promptManagerCustomDragState || isPresetVuePromptListDragging()) {
        extensionState.promptManagerTokenRefreshPendingAfterDrag = true;
        return;
    }

    if (isPresetGenerationActive()) {
        return;
    }

    if (!forceVisible && !isPromptManagerTokenPanelVisible()) {
        getPromptManagerTokenRefreshQueueState().pendingWhileHidden = true;
        return;
    }

    if (!hasPromptManagerTokenContext()) {
        await refreshPromptManagerTokensForMissingContext();
        return;
    }

    try {
        const contextRefreshState = getPresetContextTokenRefreshState();
        const queueState = getPromptManagerTokenRefreshQueueState();
        const signature = getPromptManagerTokenRefreshSignature();
        if (!force && signature && signature === queueState.lastSignature && arePromptManagerTokenCountsComplete()) {
            queueState.lastEffectiveTokenCountSignature = getPresetEffectiveTokenCountSignature();
            schedulePromptManagerTokenDisplayUpdate();
            return;
        }

        contextRefreshState.inFlight = true;
        const startedAt = performance.now?.() ?? Date.now();
        const startedSignature = signature;
        const startedEffectiveTokenCountSignature = getPresetEffectiveTokenCountSignature();
        const startedEffectiveTokenCountsCurrent = arePromptManagerTokenCountsCurrent();
        queueState.lastSignature = '';
        if (!startedEffectiveTokenCountsCurrent) {
            queueState.lastEffectiveTokenCountSignature = '';
            updatePresetEffectiveTokenHeaderDisplay(null);
        }
        await promptManager.tryGenerate();
        const completedSignature = getPromptManagerTokenRefreshSignature();
        const completedEffectiveTokenCountSignature = getPresetEffectiveTokenCountSignature();
        if (startedSignature && completedSignature === startedSignature) {
            queueState.lastSignature = startedSignature;
        } else {
            queueState.lastSignature = '';
            queueState.pendingAfterFlight = true;
        }
        if (startedEffectiveTokenCountSignature && completedEffectiveTokenCountSignature === startedEffectiveTokenCountSignature) {
            queueState.lastEffectiveTokenCountSignature = startedEffectiveTokenCountSignature;
        } else if (startedEffectiveTokenCountSignature) {
            queueState.lastEffectiveTokenCountSignature = '';
            updatePresetEffectiveTokenHeaderDisplay(null);
            queueState.pendingAfterFlight = true;
        }
        if (isPresetVuePromptListManagerActive()) {
            syncPresetVuePromptListManagerState();
        }
        schedulePromptManagerTokenDisplayUpdate();
        console.debug(`${LOG_PREFIX} Prompt manager token refresh completed after ${reason}: ${Math.round((performance.now?.() ?? Date.now()) - startedAt)}ms`);
    } catch (error) {
        console.debug(`${LOG_PREFIX} Failed to refresh prompt manager token counts`, error);
    } finally {
        const contextRefreshState = getPresetContextTokenRefreshState();
        contextRefreshState.inFlight = false;
        contextRefreshState.suppressUntil = Date.now() + PRESET_CONTEXT_TOKEN_REFRESH_SELF_SUPPRESS_MS;
    }
}

function isPromptManagerTokenPanelVisible() {
    if (document.visibilityState === 'hidden') {
        return false;
    }

    const list = document.querySelector(PRESET_PROMPT_MANAGER_LIST_SELECTOR);
    const container = promptManager?.containerElement;

    if (!(list instanceof HTMLElement) || !(container instanceof HTMLElement)) {
        return false;
    }

    if (!list.isConnected || !container.isConnected) {
        return false;
    }

    const rect = container.getBoundingClientRect();
    return Boolean(rect.width > 0 && rect.height > 0 && getComputedStyle(container).display !== 'none');
}

function getPromptManagerTokenRefreshSignature() {
    try {
        const serviceSettings = promptManager?.serviceSettings ?? oai_settings;
        const prompts = Array.isArray(serviceSettings?.prompts) ? serviceSettings.prompts : [];
        const promptOrder = Array.isArray(serviceSettings?.prompt_order)
            ? serviceSettings.prompt_order
            : promptManager?.getPromptOrderForCharacter?.(promptManager?.activeCharacter) ?? [];
        const promptParts = prompts.map(prompt => [
            prompt?.identifier || '',
            prompt?.role || '',
            prompt?.enabled === false ? 0 : 1,
            prompt?.marker ? 1 : 0,
            getStringHash(String(prompt?.content ?? '')),
        ].join(':'));
        const orderParts = promptOrder.map(entry => [
            entry?.identifier || '',
            entry?.enabled === false ? 0 : 1,
        ].join(':'));
        const chat = Array.isArray(scriptModule.chat) ? scriptModule.chat : [];
        const lastMessage = chat[chat.length - 1];
        const lastMessageSignature = lastMessage
            ? [
                chat.length,
                lastMessage.send_date || '',
                getStringHash(String(lastMessage.mes ?? lastMessage.content ?? '').slice(-512)),
            ].join(':')
            : `${chat.length}:`;

        return [
            getTokenizerModel(),
            getCurrentChatId?.() || '',
            serviceSettings?.preset_settings_openai || oai_settings?.preset_settings_openai || '',
            serviceSettings?.openai_max_context ?? '',
            serviceSettings?.openai_max_tokens ?? '',
            promptParts.join('|'),
            orderParts.join('|'),
            lastMessageSignature,
        ].join('||');
    } catch (error) {
        console.debug(`${LOG_PREFIX} Failed to build prompt manager token refresh signature`, error);
        return '';
    }
}

function arePromptManagerTokenCountsComplete() {
    const counts = promptManager?.tokenHandler?.getCounts?.();
    const list = document.querySelector(PRESET_PROMPT_MANAGER_LIST_SELECTOR);

    if (!counts || !list) {
        return false;
    }

    const rows = Array.from(list.querySelectorAll('li.completion_prompt_manager_prompt[data-pm-identifier]'));
    if (rows.length === 0) {
        return false;
    }

    return rows.every(row => {
        const identifier = row.dataset.pmIdentifier;
        return identifier && Number.isFinite(Number(counts[identifier]));
    });
}

function schedulePromptManagerTokenDisplayUpdate() {
    const state = getPromptManagerTokenRefreshQueueState();
    if (state.displayFrame) {
        return;
    }

    state.displayFrame = requestAnimationFrame(() => {
        state.displayFrame = 0;
        updatePromptManagerTokenDisplay();
    });
}

function schedulePromptManagerTokensPending() {
    const state = getPromptManagerTokenRefreshQueueState();
    if (state.pendingFrame) {
        return;
    }

    state.pendingFrame = requestAnimationFrame(() => {
        state.pendingFrame = 0;
        markPromptManagerTokensPendingNow();
    });
}

function handlePresetVuePromptRangeSelectionDelegatedClick(event, target) {
    const manager = getPresetVuePromptListManagerState();
    const model = manager.state;

    if (!model?.rangeSelection?.active) {
        return false;
    }

    const row = target.closest(`${PRESET_PROMPT_MANAGER_LIST_SELECTOR} li.completion_prompt_manager_prompt[data-pm-identifier]`);

    if (!(row instanceof HTMLElement)) {
        return false;
    }

    const item = getPresetVuePromptItemsFromModel(model).find(item => item?.id === row.dataset.pmIdentifier);

    if (!item) {
        return false;
    }

    handlePresetVuePromptRangeSelectionClick(model, item, event);
    return true;
}

function getOpenAITokenizerBulkState() {
    if (!extensionState.openAITokenizerBulkBridge || typeof extensionState.openAITokenizerBulkBridge !== 'object') {
        extensionState.openAITokenizerBulkBridge = {};
    }

    const state = extensionState.openAITokenizerBulkBridge;
    if (!(state.cache instanceof Map)) {
        state.cache = new Map();
    }
    if (!state.stats || typeof state.stats !== 'object') {
        state.stats = {
            prepareCalls: 0,
            prepareMessages: 0,
            prepareEmpty: 0,
            prepareErrors: 0,
            ajaxBatches: 0,
            ajaxBatchMessages: 0,
            ajaxHits: 0,
            ajaxMisses: 0,
            ajaxFallbacks: 0,
            ajaxErrors: 0,
            worldInfoPrepareCalls: 0,
            worldInfoPrepareMessages: 0,
            worldInfoPrepareEmpty: 0,
            worldInfoPrepareErrors: 0,
        };
    }
    for (const key of ['prepareCalls', 'prepareMessages', 'prepareEmpty', 'prepareErrors', 'ajaxBatches', 'ajaxBatchMessages', 'ajaxHits', 'ajaxMisses', 'ajaxFallbacks', 'ajaxErrors', 'worldInfoPrepareCalls', 'worldInfoPrepareMessages', 'worldInfoPrepareEmpty', 'worldInfoPrepareErrors']) {
        if (typeof state.stats[key] !== 'number') {
            state.stats[key] = 0;
        }
    }
    if (typeof state.failureCount !== 'number') {
        state.failureCount = 0;
    }
    if (typeof state.disabledUntil !== 'number') {
        state.disabledUntil = 0;
    }

    return state;
}

function isOpenAITokenizerBulkCircuitOpen(state = getOpenAITokenizerBulkState()) {
    return Date.now() < Number(state.disabledUntil || 0);
}

function recordOpenAITokenizerBulkSuccess(state = getOpenAITokenizerBulkState()) {
    state.failureCount = 0;
    state.disabledUntil = 0;
}

function recordOpenAITokenizerBulkFailure(state = getOpenAITokenizerBulkState(), error = null) {
    state.failureCount = Number(state.failureCount || 0) + 1;
    if (state.failureCount >= OPENAI_TOKENIZER_BULK_FAILURE_THRESHOLD) {
        state.disabledUntil = Date.now() + OPENAI_TOKENIZER_BULK_CIRCUIT_BREAKER_MS;
        console.debug(`${LOG_PREFIX} OpenAI tokenizer bulk disabled temporarily after repeated failures`, error);
    }
}

function installOpenAITokenizerBulkAjaxPatch() {
    const state = getOpenAITokenizerBulkState();
    if (state.ajaxPatched) {
        return;
    }

    const jq = globalThis.jQuery;
    if (!jq || typeof jq.ajax !== 'function') {
        console.debug(`${LOG_PREFIX} jQuery.ajax unavailable; OpenAI tokenizer bulk bridge was not installed`);
        return;
    }

    const originalAjax = jq.ajax;
    state.originalAjax = originalAjax;
    jq.ajax = function baiBaiOpenAITokenizerBulkAjax(...args) {
        const request = normalizeJQueryAjaxRequest(args);
        if (!request || !shouldInterceptOpenAITokenizerCount(request.options)) {
            return originalAjax.apply(this, args);
        }

        const intercepted = handleOpenAITokenizerBulkAjax(this, args, request.options);
        return intercepted || originalAjax.apply(this, args);
    };

    state.ajaxPatched = true;
}

function normalizeJQueryAjaxRequest(args) {
    const first = args[0];
    if (typeof first === 'string') {
        return {
            options: {
                ...(args[1] && typeof args[1] === 'object' ? args[1] : {}),
                url: first,
            },
        };
    }

    if (first && typeof first === 'object') {
        return { options: first };
    }

    return null;
}

function shouldInterceptOpenAITokenizerCount(options) {
    if (!isOpenAITokenizerBulkEnabled() || options?.async === false) {
        return false;
    }

    const method = String(options?.method || options?.type || 'GET').toUpperCase();
    if (method !== 'POST') {
        return false;
    }

    const url = toOpenAITokenizerUrl(options?.url);
    return Boolean(url && url.origin === location.origin && url.pathname === '/api/tokenizers/openai/count');
}

function handleOpenAITokenizerBulkAjax(thisArg, args, options) {
    const hitPromise = getOpenAITokenizerBulkAjaxHit(options);
    if (!hitPromise) {
        return null;
    }

    const state = getOpenAITokenizerBulkState();
    return hitPromise
        .then(hit => {
            if (!hit) {
                state.stats.ajaxFallbacks += 1;
                return state.originalAjax.apply(thisArg, args);
            }

            state.stats.ajaxHits += 1;
            const payload = { token_count: hit.count };
            callJQueryAjaxCallback(options.success, payload, 'success', null);
            callJQueryAjaxCallback(options.complete, null, 'success');
            return payload;
        })
        .catch(error => {
            state.stats.ajaxErrors += 1;
            console.debug(`${LOG_PREFIX} OpenAI tokenizer bulk ajax fallback`, error);
            return state.originalAjax.apply(thisArg, args);
        });
}

function getOpenAITokenizerBulkAjaxHit(options) {
    const state = getOpenAITokenizerBulkState();
    const url = toOpenAITokenizerUrl(options?.url);
    const message = getOpenAITokenizerAjaxMessage(options);
    const model = url?.searchParams?.get('model') || getTokenizerModel();

    if (!message || !model) {
        state.stats.ajaxMisses += 1;
        return null;
    }

    const key = getOpenAITokenizerCacheKey(model, message);
    const cached = state.cache.get(key);
    if (typeof cached === 'number') {
        return Promise.resolve({ count: cached });
    }

    if (!state.pending) {
        return enqueueOpenAITokenizerBulkAjaxCount(model, message, key);
    }

    return Promise.resolve(state.pending).then(() => {
        const next = state.cache.get(key);
        if (typeof next === 'number') {
            return { count: next };
        }

        return enqueueOpenAITokenizerBulkAjaxCount(model, message, key);
    });
}

function enqueueOpenAITokenizerBulkAjaxCount(model, message, key) {
    const state = getOpenAITokenizerBulkState();

    if (!state.ajaxBatch || typeof state.ajaxBatch !== 'object') {
        state.ajaxBatch = {
            entries: [],
            byKey: new Map(),
            timer: null,
        };
    }
    if (!(state.ajaxBatch.byKey instanceof Map)) {
        state.ajaxBatch.byKey = new Map();
    }
    if (!Array.isArray(state.ajaxBatch.entries)) {
        state.ajaxBatch.entries = [];
    }

    const existing = state.ajaxBatch.byKey.get(key);
    if (existing?.promise) {
        return existing.promise;
    }

    let resolveEntry;
    let rejectEntry;
    const promise = new Promise((resolve, reject) => {
        resolveEntry = resolve;
        rejectEntry = reject;
    });
    const entry = {
        model,
        message,
        key,
        promise,
        resolve: resolveEntry,
        reject: rejectEntry,
    };

    state.ajaxBatch.entries.push(entry);
    state.ajaxBatch.byKey.set(key, entry);

    if (!state.ajaxBatch.timer) {
        state.ajaxBatch.timer = setTimeout(flushOpenAITokenizerBulkAjaxBatch, OPENAI_TOKENIZER_BULK_AJAX_BATCH_DELAY_MS);
    }

    return promise;
}

function flushOpenAITokenizerBulkAjaxBatch() {
    const state = getOpenAITokenizerBulkState();
    const batch = state.ajaxBatch;

    if (!batch || !Array.isArray(batch.entries) || batch.entries.length === 0) {
        if (batch) {
            batch.timer = null;
        }
        return;
    }

    const entries = batch.entries.splice(0, batch.entries.length);
    batch.byKey?.clear?.();
    batch.timer = null;

    const entriesByModel = new Map();
    for (const entry of entries) {
        const group = entriesByModel.get(entry.model) ?? [];
        group.push(entry);
        entriesByModel.set(entry.model, group);
    }

    for (const [model, group] of entriesByModel.entries()) {
        state.stats.ajaxBatches += 1;
        state.stats.ajaxBatchMessages += group.length;
        void fetchOpenAITokenizerBulkCounts(model, group)
            .then(counts => {
                counts.forEach((count, index) => {
                    const entry = group[index];
                    setOpenAITokenizerBulkCache(entry.key, count);
                    entry.resolve({ count });
                });
            })
            .catch(error => {
                state.stats.ajaxMisses += group.length;
                for (const entry of group) {
                    entry.reject(error);
                }
            });
    }
}

function getOpenAITokenizerAjaxMessage(options) {
    try {
        const data = typeof options?.data === 'string' ? JSON.parse(options.data) : options?.data;
        if (!Array.isArray(data) || data.length !== 1) {
            return null;
        }

        return normalizeOpenAITokenizerMessage(data[0], { allowEmptyContent: true });
    } catch {
        return null;
    }
}

async function prepareOpenAITokenizerBulkMessages(context = {}) {
    const state = getOpenAITokenizerBulkState();
    state.stats.prepareCalls += 1;

    if (!isOpenAITokenizerBulkEnabled()) {
        return false;
    }

    const model = getTokenizerModel();
    const messages = await collectOpenAITokenizerBulkMessages(context);
    const uniqueMessages = [];
    const seen = new Set();
    const keyCache = new Map();

    for (let index = 0; index < messages.length; index += 1) {
        if (index > 0 && index % OPENAI_TOKENIZER_BULK_PREPARE_CHUNK_SIZE === 0) {
            await waitForNextPaint();
        }

        const message = messages[index];
        const key = getOpenAITokenizerCacheKey(model, message, keyCache);
        if (seen.has(key) || state.cache.has(key)) {
            continue;
        }

        seen.add(key);
        uniqueMessages.push({ key, message });
    }

    if (uniqueMessages.length === 0) {
        state.stats.prepareEmpty += 1;
        return true;
    }

    const pending = fetchOpenAITokenizerBulkCounts(model, uniqueMessages)
        .then(counts => {
            counts.forEach((count, index) => {
                setOpenAITokenizerBulkCache(uniqueMessages[index].key, count);
            });
            state.stats.prepareMessages += uniqueMessages.length;
            return true;
        })
        .catch(error => {
            state.stats.prepareErrors += 1;
            throw error;
        })
        .finally(() => {
            if (state.pending === pending) {
                state.pending = null;
            }
        });

    state.pending = pending;
    return pending;
}

async function prepareOpenAITokenizerWorldInfoBudgetCounts(context = {}) {
    const state = getOpenAITokenizerBulkState();
    state.stats.worldInfoPrepareCalls += 1;

    if (!isOpenAITokenizerBulkEnabled()) {
        return false;
    }

    const model = getTokenizerModel();
    const messages = collectOpenAITokenizerWorldInfoBudgetMessages(context);
    const uniqueMessages = [];
    const seen = new Set();
    const keyCache = new Map();

    for (const message of messages) {
        const key = getOpenAITokenizerCacheKey(model, message, keyCache);
        if (seen.has(key) || state.cache.has(key)) {
            continue;
        }

        seen.add(key);
        uniqueMessages.push({ key, message });
    }

    if (uniqueMessages.length === 0) {
        state.stats.worldInfoPrepareEmpty += 1;
        return true;
    }

    const pending = fetchOpenAITokenizerBulkCounts(model, uniqueMessages)
        .then(counts => {
            counts.forEach((count, index) => {
                setOpenAITokenizerBulkCache(uniqueMessages[index].key, count);
            });
            state.stats.worldInfoPrepareMessages += uniqueMessages.length;
            return true;
        })
        .catch(error => {
            state.stats.worldInfoPrepareErrors += 1;
            throw error;
        })
        .finally(() => {
            if (state.pending === pending) {
                state.pending = null;
            }
        });

    state.pending = pending;
    return pending;
}

function collectOpenAITokenizerWorldInfoBudgetMessages(context = {}) {
    const texts = [];
    const seenTexts = new Set();
    const addText = (text) => {
        if (texts.length >= OPENAI_TOKENIZER_BULK_PREPARE_MAX_MESSAGES) {
            return false;
        }

        if (typeof text !== 'string' || text.length === 0 || seenTexts.has(text)) {
            return true;
        }

        seenTexts.add(text);
        texts.push(text);
        return true;
    };

    addText(context.textToScan);

    let states = [''];
    const entries = Array.isArray(context.entries) ? context.entries : [];
    for (const entry of entries) {
        if (texts.length >= OPENAI_TOKENIZER_BULK_PREPARE_MAX_MESSAGES) {
            break;
        }

        const content = typeof entry?.content === 'string' ? entry.content : '';
        const nextStates = [];
        const seenStates = new Set();
        const pushState = (value) => {
            if (seenStates.has(value)) {
                return;
            }
            seenStates.add(value);
            nextStates.push(value);
        };

        if (entry?.maySkip) {
            for (const state of states) {
                pushState(state);
            }
        }

        for (const state of states) {
            pushState(`${state}${content}\n`);
        }

        states = nextStates.slice(0, OPENAI_TOKENIZER_BULK_PREPARE_MAX_MESSAGES);

        if (!entry?.ignoreBudget) {
            for (const state of states) {
                if (!addText(state)) {
                    break;
                }
            }
        }
    }

    return texts
        .map(text => normalizeOpenAITokenizerMessage({ role: 'system', content: text }, { allowEmptyContent: true }))
        .filter(Boolean);
}

async function collectOpenAITokenizerBulkMessages(context) {
    const entries = [];
    let processed = 0;
    const add = async (message, options = {}) => {
        if (entries.length >= OPENAI_TOKENIZER_BULK_PREPARE_MAX_MESSAGES) {
            return false;
        }

        const normalized = normalizeOpenAITokenizerMessage(message, options);
        if (normalized) {
            entries.push(normalized);
        }

        processed += 1;
        if (processed % OPENAI_TOKENIZER_BULK_PREPARE_CHUNK_SIZE === 0) {
            await waitForNextPaint();
        }

        return entries.length < OPENAI_TOKENIZER_BULK_PREPARE_MAX_MESSAGES;
    };

    await add({ role: 'system', content: context.newChatContent });
    await add({ role: 'user', content: context.sendIfEmpty });
    await add({ role: 'system', content: context.newExampleChatContent });

    await collectPromptCollectionTokenMessages(context.prompts, add);
    await collectChatHistoryTokenMessages(context, add);
    await collectDialogueExampleTokenMessages(context.messageExamples, add);

    return entries;
}

async function collectPromptCollectionTokenMessages(prompts, add) {
    const collection = Array.isArray(prompts?.collection) ? prompts.collection : [];
    for (const prompt of collection) {
        if (!await add({
            role: prompt?.role || 'system',
            content: prompt?.content,
        })) {
            return;
        }
    }
}

async function collectChatHistoryTokenMessages(context, add) {
    const sourceMessages = Array.isArray(context.messages) ? context.messages : [];
    const namesInCompletion = Number(context.oaiSettings?.names_behavior) === 1;
    const manager = context.promptManager || promptManager;

    for (let index = 0; index < sourceMessages.length; index++) {
        const source = sourceMessages[index];
        if (!source || typeof source !== 'object') {
            continue;
        }

        const prompt = {
            ...source,
            identifier: `chatHistory-${sourceMessages.length - index}`,
        };
        const prepared = preparePromptForOpenAITokenizerBulk(prompt, manager);
        const message = {
            role: prepared?.role || source.role || 'system',
            content: prepared?.content ?? source.content,
        };

        if (!await add(message)) {
            return;
        }

        if (namesInCompletion && source.name) {
            const name = typeof manager?.isValidName === 'function' && manager.isValidName(source.name)
                ? source.name
                : typeof manager?.sanitizeName === 'function'
                    ? manager.sanitizeName(source.name)
                    : source.name;
            if (!await add({ ...message, name })) {
                return;
            }
        }

        if (Array.isArray(source.invocations)) {
            for (const invocation of source.invocations) {
                if (!await add({ role: 'tool', content: invocation?.result || '[No content]' })) {
                    return;
                }
            }
        }
    }
}

async function collectDialogueExampleTokenMessages(messageExamples, add) {
    if (!Array.isArray(messageExamples)) {
        return;
    }

    for (const dialogue of messageExamples) {
        if (!Array.isArray(dialogue)) {
            continue;
        }

        for (const prompt of dialogue) {
            const message = {
                role: 'system',
                content: prompt?.content || '',
            };
            if (!await add(message)) {
                return;
            }
            if (prompt?.name) {
                if (!await add({ ...message, name: prompt.name })) {
                    return;
                }
            }
        }
    }
}

function preparePromptForOpenAITokenizerBulk(prompt, manager) {
    try {
        if (typeof manager?.preparePrompt === 'function') {
            return manager.preparePrompt(prompt);
        }
    } catch (error) {
        console.debug(`${LOG_PREFIX} Failed to prepare OpenAI tokenizer bulk prompt`, error);
    }

    return prompt;
}

function normalizeOpenAITokenizerMessage(message, { allowEmptyContent = false } = {}) {
    if (!message || typeof message !== 'object') {
        return null;
    }

    const normalized = {};
    normalized.role = message.role || 'system';

    if (Object.prototype.hasOwnProperty.call(message, 'content') && message.content !== undefined) {
        normalized.content = message.content;
    }
    if (message.name !== undefined && message.name !== null && message.name !== '') {
        normalized.name = message.name;
    }
    if (message.tool_calls !== undefined) {
        normalized.tool_calls = message.tool_calls;
    }
    if (message.reasoning !== undefined && message.reasoning !== null && message.reasoning !== '') {
        normalized.reasoning = message.reasoning;
    }

    const hasContent = Object.prototype.hasOwnProperty.call(normalized, 'content');
    const hasToolCalls = Object.prototype.hasOwnProperty.call(normalized, 'tool_calls');
    if (!hasContent && !hasToolCalls) {
        return null;
    }

    if (!allowEmptyContent && typeof normalized.content === 'string' && normalized.content.length === 0 && !hasToolCalls && !normalized.name) {
        return null;
    }

    return normalized;
}

async function fetchOpenAITokenizerBulkCounts(model, entries) {
    const state = getOpenAITokenizerBulkState();
    if (isOpenAITokenizerBulkCircuitOpen(state)) {
        throw new Error('BaiBaoKu bulk count is temporarily disabled after repeated failures');
    }

    const headers = new Headers(getRequestHeaders());
    headers.set('content-type', 'application/json');

    try {
        const response = await fetch(BAIBAOKU_TOKENIZER_BULK_COUNT_URL, {
            method: 'POST',
            headers,
            cache: 'no-store',
            body: JSON.stringify({
                model,
                messages: entries.map(entry => entry.message),
            }),
        });
        const payload = await response.json().catch(() => null);
        const counts = payload?.data?.counts;

        if (!response.ok || payload?.ok !== true || !Array.isArray(counts) || counts.length !== entries.length) {
            throw new Error(payload?.error?.message || `BaiBaoKu bulk count failed: HTTP ${response.status}`);
        }

        recordOpenAITokenizerBulkSuccess(state);
        return counts.map(count => Number(count));
    } catch (error) {
        recordOpenAITokenizerBulkFailure(state, error);
        throw error;
    }
}

function setOpenAITokenizerBulkCache(key, count) {
    const value = Number(count);
    if (!key || !Number.isFinite(value)) {
        return;
    }

    const state = getOpenAITokenizerBulkState();
    state.cache.set(key, value);
    while (state.cache.size > OPENAI_TOKENIZER_BULK_CACHE_LIMIT) {
        const oldestKey = state.cache.keys().next().value;
        state.cache.delete(oldestKey);
    }
}

function getOpenAITokenizerCacheKey(model, message, roundCache = null) {
    const serialized = JSON.stringify(message);
    const cacheKey = `${model}:${serialized}`;

    if (roundCache instanceof Map && roundCache.has(cacheKey)) {
        return roundCache.get(cacheKey);
    }

    const key = `${model}-${getStringHash(serialized)}`;
    roundCache?.set?.(cacheKey, key);
    return key;
}

function isOpenAITokenizerBulkEnabled() {
    if (settings.tokenizerBulkCountEnabled === false) {
        return false;
    }

    if (isOpenAITokenizerBulkCircuitOpen()) {
        return false;
    }

    const earlyBridge = globalThis.__baibaokuEarlyBridge;
    if (typeof earlyBridge?.isTokenizerBulkCountEnabled === 'function') {
        return earlyBridge.isTokenizerBulkCountEnabled() !== false;
    }

    return earlyBridge?.tokenizerBulkCountEnabled !== false;
}

function toOpenAITokenizerUrl(value) {
    try {
        if (typeof value === 'string') return new URL(value, location.href);
        if (value instanceof URL) return new URL(value.href, location.href);
        if (value && typeof value.url === 'string') return new URL(value.url, location.href);
    } catch {
        return null;
    }

    return null;
}

function callJQueryAjaxCallback(callback, ...args) {
    if (typeof callback !== 'function') {
        return;
    }

    try {
        callback(...args);
    } catch (error) {
        console.debug(`${LOG_PREFIX} OpenAI tokenizer bulk ajax callback failed`, error);
    }
}

function isPromptManagerTokenRefreshEnabled() {
    return Boolean(
        promptManager?.tryGenerate
        && (settings.presetToggleOptimizationEnabled || settings.presetSwitchOptimizationEnabled),
    );
}

function markPromptManagerTokensPending() {
    schedulePromptManagerTokensPending();
}

function markPromptManagerTokensPendingNow() {
    const list = document.querySelector(PRESET_PROMPT_MANAGER_LIST_SELECTOR);

    if (!list) {
        return;
    }

    for (const row of list.querySelectorAll('li.completion_prompt_manager_prompt[data-pm-identifier]')) {
        updatePromptTokenCell(row, null);
    }

    const header = document.querySelector('.completion_prompt_manager_header');
    const totalContainer = header?.querySelector(':scope > div:last-child');
    const totalLabel = totalContainer?.querySelector('span');

    if (totalContainer && totalLabel) {
        const nextText = ' - ';
        if (totalContainer.textContent?.replace(totalLabel.textContent || '', '') !== nextText) {
            totalContainer.replaceChildren(totalLabel, document.createTextNode(nextText));
        }
    }

    updatePresetEffectiveTokenHeaderDisplay(arePromptManagerTokenCountsCurrent() ? undefined : null);
}

function updatePromptManagerTokenDisplay() {
    const counts = promptManager?.tokenHandler?.getCounts?.();
    const list = document.querySelector(PRESET_PROMPT_MANAGER_LIST_SELECTOR);

    if (!counts || !list) {
        return;
    }

    const prompts = Array.isArray(promptManager?.serviceSettings?.prompts)
        ? promptManager.serviceSettings.prompts.filter(Boolean)
        : [];
    const promptById = new Map(prompts.map(prompt => [prompt.identifier, prompt]));
    const tokenBudget = (promptManager?.serviceSettings?.openai_max_context ?? 0)
        - (promptManager?.serviceSettings?.openai_max_tokens ?? 0);
    const isTokenUsageWarning = (promptManager?.tokenUsage ?? 0) > tokenBudget * 0.8;

    for (const row of list.querySelectorAll('li.completion_prompt_manager_prompt[data-pm-identifier]')) {
        const identifier = row.dataset.pmIdentifier;
        const tokens = counts[identifier] ?? 0;
        const prompt = promptById.get(identifier);
        const warning = prompt
            ? getPromptTokenWarning({ prompt, tokens, isTokenUsageWarning })
            : null;
        updatePromptTokenCell(row, tokens, warning);
    }

    const header = document.querySelector('.completion_prompt_manager_header');
    const totalContainer = header?.querySelector(':scope > div:last-child');
    const totalLabel = totalContainer?.querySelector('span');

    if (totalContainer && totalLabel) {
        const nextText = ` ${promptManager.tokenUsage ?? 0} `;
        if (totalContainer.textContent?.replace(totalLabel.textContent || '', '') !== nextText) {
            totalContainer.replaceChildren(totalLabel, document.createTextNode(nextText));
        }
    }

    updatePresetEffectiveTokenHeaderDisplay(calculatePresetEffectivePromptTokenTotal());
}

export {
    arePromptManagerTokenCountsComplete,
    callJQueryAjaxCallback,
    collectChatHistoryTokenMessages,
    collectDialogueExampleTokenMessages,
    collectOpenAITokenizerBulkMessages,
    collectOpenAITokenizerWorldInfoBudgetMessages,
    collectPromptCollectionTokenMessages,
    enqueueOpenAITokenizerBulkAjaxCount,
    fastRefreshPromptManagerTokensAfterContextChange,
    fetchOpenAITokenizerBulkCounts,
    flushOpenAITokenizerBulkAjaxBatch,
    flushPromptManagerTokenRefreshIfPendingVisible,
    getOpenAITokenizerAjaxMessage,
    getOpenAITokenizerBulkAjaxHit,
    getOpenAITokenizerBulkCountsUsingCache,
    getOpenAITokenizerBulkState,
    getOpenAITokenizerCacheKey,
    getPromptManagerTokenRefreshQueueState,
    getPromptManagerTokenRefreshSignature,
    handleOpenAITokenizerBulkAjax,
    handlePresetVuePromptRangeSelectionDelegatedClick,
    installOpenAITokenizerBulkAjaxPatch,
    installOpenAITokenizerBulkBridge,
    isOpenAITokenizerBulkCircuitOpen,
    isOpenAITokenizerBulkEnabled,
    isPromptManagerTokenPanelVisible,
    isPromptManagerTokenRefreshEnabled,
    markPromptManagerTokensPending,
    markPromptManagerTokensPendingNow,
    normalizeJQueryAjaxRequest,
    normalizeOpenAITokenizerMessage,
    normalizeOpenAITokenizerPromptManagerCount,
    prepareOpenAITokenizerBulkMessages,
    prepareOpenAITokenizerWorldInfoBudgetCounts,
    preparePromptForOpenAITokenizerBulk,
    recordOpenAITokenizerBulkFailure,
    recordOpenAITokenizerBulkSuccess,
    refreshPromptManagerTokens,
    runScheduledPromptManagerTokenRefresh,
    schedulePromptManagerTokenDisplayUpdate,
    schedulePromptManagerTokenRefresh,
    schedulePromptManagerTokensPending,
    setOpenAITokenizerBulkCache,
    shouldInterceptOpenAITokenizerCount,
    toOpenAITokenizerUrl,
    updatePromptManagerTokenDisplay,
};
