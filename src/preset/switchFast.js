import { event_types, eventSource, getCurrentChatId, getRequestHeaders, saveSettings } from '@sillytavern/script';
import { t } from '@sillytavern/scripts/i18n';
import { oai_settings, openai_setting_names, promptManager } from '@sillytavern/scripts/openai';
import { callGenericPopup, POPUP_TYPE } from '@sillytavern/scripts/popup';
import { INJECTION_POSITION } from '@sillytavern/scripts/PromptManager';
import { isMobile } from '@sillytavern/scripts/RossAscends-mods';
import { renderTemplateAsync } from '@sillytavern/scripts/templates';
import { getTokenizerModel } from '@sillytavern/scripts/tokenizers';
import { escapeHtml, getStringHash } from '@sillytavern/scripts/utils';
import { FORCE_EDIT_PROMPTS, FORCE_TOGGLE_PROMPTS, OPENAI_PRESET_DELETE_SELECTOR, OPENAI_PRESET_SELECT_SELECTOR, PRESET_CHAT_LOADED_HANDLER_KEY, PRESET_CHAT_LOAD_RENDER_SUPPRESS_MS, PRESET_CONTEXT_INJECTION_PROMPT_IDS, PRESET_CONTEXT_TOKEN_REFRESH_DELAY_MS, PRESET_CONTEXT_TOKEN_REFRESH_KEY, PRESET_CONTEXT_TOKEN_REFRESH_MAX_ATTEMPTS, PRESET_CONTEXT_TOKEN_REFRESH_RETRY_MS, PRESET_CONTEXT_TOKEN_REFRESH_SELF_SUPPRESS_MS, PRESET_DELETE_HANDLER_KEY, PRESET_EFFECTIVE_TOKEN_HEADER_CLASS, PRESET_EFFECTIVE_TOKEN_HEADER_PENDING_TEXT, PRESET_EFFECTIVE_TOKEN_HEADER_TITLE, PRESET_LIST_ACTION_HANDLER_KEY, PRESET_MODEL_CHANGE_HANDLER_KEY, PRESET_PROMPT_MANAGER_LIST_SELECTOR, PRESET_SELECT_CHANGE_HANDLER_KEY, PRESET_SWITCH_BEFORE_HANDLER_KEY, PRESET_SWITCH_HANDLER_KEY, PROMPT_MANAGER_TOKEN_REFRESH_BUSY_DELAY_MS, PROMPT_MANAGER_TOKEN_REFRESH_FAST_DELAY_MS, refreshPromptManagerTokensAfterPresetSwitchDebounced } from './constants.js';
import { patchPromptManagerDraggable, preparePromptManagerCustomDragList } from './dragCustom.js';
import { isPresetGlobalLibraryDialogOpen } from './globalLibrary.js';
import { applyPresetGroupDeletedCleanup, applyPresetGroupImportCleanup, applyPresetGroupRenameCleanup, getPresetPromptGroupState, resetPresetPromptGroupRuntimeState } from './groupState.js';
import { closePresetPromptActionMenus, handlePresetPromptActionButtonClick, togglePresetPromptActionMenu } from './listActions.js';
import { clearPendingPresetPromptChanges, clearPendingPresetPromptChangesForPreset } from './pendingChanges.js';
import { LOG_PREFIX, extensionState, settings } from './state.js';
import { fastRefreshPromptManagerTokensAfterContextChange, flushPromptManagerTokenRefreshIfPendingVisible, getOpenAITokenizerBulkCountsUsingCache, getPromptManagerTokenRefreshQueueState, getPromptManagerTokenRefreshSignature, handlePresetVuePromptRangeSelectionDelegatedClick, isOpenAITokenizerBulkEnabled, isPromptManagerTokenPanelVisible, markPromptManagerTokensPending, normalizeOpenAITokenizerPromptManagerCount, schedulePromptManagerTokenDisplayUpdate } from './tokenizer.js';
import { escapeCssSelectorValue, isPresetGenerationActive, isPresetGroupingEnabled } from './util.js';
import { getPresetVuePromptListManagerState, getPromptManagerListElement, installPresetVuePromptListManager, installPresetVuePromptListRenderPatch, isPresetVuePromptListManagerActive, removePresetVuePromptListRenderPatch, syncPresetVuePromptListManagerState } from './vueList.js';
import { isPresetPromptDeleteOrDetachAllowed, renderNativePromptControlsHtml } from './vueRender.js';

function applyPresetSwitchOptimization() {
    if (!settings.presetSwitchOptimizationEnabled) {
        removePresetSwitchOptimization();
        return;
    }

    applyPresetSelectChangeDeferral();
    applyPresetDeleteSelectionOptimization();
    applyPresetListActionDelegation();
    installPresetVuePromptListRenderPatch();
    applyPresetGroupDeletedCleanup();
    applyPresetGroupImportCleanup();
    applyPresetGroupRenameCleanup();
    applyPresetSwitchBeforeOptimization();
    applyPresetModelChangeTokenRefreshOptimization();
    applyPresetChatLoadedTokenRefreshOptimization();

    if (extensionState[PRESET_SWITCH_HANDLER_KEY]) {
        return;
    }

    const handler = async () => {
        await handleOpenAiPresetChangedAfter();
    };

    extensionState[PRESET_SWITCH_HANDLER_KEY] = handler;

    if (typeof eventSource.makeFirst === 'function') {
        eventSource.makeFirst(event_types.OAI_PRESET_CHANGED_AFTER, handler);
    } else {
        eventSource.on(event_types.OAI_PRESET_CHANGED_AFTER, handler);
    }
}

// 切换优化关闭时的卸载。各事件代理(select/click/delete 等)内部都已按 settings 二次判定,
// 关掉后即静默,无需逐个解绑;真正会留下可见副作用的是 render patch——它会接管
// renderPromptManagerListItems 走快速刷新。单独关切换优化时(分组也关)必须主动拆掉 patch
// 并重渲染一次,让列表回到 ST 原生渲染。
// 分组开启时 patch 归分组管理(installPresetVuePromptListRenderPatch 由 applyPresetGrouping 装),
// 此处不拆。
function removePresetSwitchOptimization() {
    if (isPresetGroupingEnabled()) {
        return;
    }

    removePresetVuePromptListRenderPatch();

    if (!promptManager || typeof promptManager.renderPromptManagerListItems !== 'function') {
        return;
    }

    // patch 已拆,这次 renderPromptManagerListItems 会走 ST 原生实现重渲染列表。
    void Promise.resolve(promptManager.renderPromptManagerListItems()).catch(error => {
        console.debug(`${LOG_PREFIX} Failed to re-render prompt manager after disabling preset switch optimization`, error);
    });
}

function applyPresetModelChangeTokenRefreshOptimization() {
    if (extensionState[PRESET_MODEL_CHANGE_HANDLER_KEY]) {
        return;
    }

    const handler = () => {
        void handleChatCompletionModelChangedForPromptManager();
    };

    extensionState[PRESET_MODEL_CHANGE_HANDLER_KEY] = handler;

    if (typeof eventSource.makeFirst === 'function') {
        eventSource.makeFirst(event_types.CHATCOMPLETION_MODEL_CHANGED, handler);
    } else {
        eventSource.on(event_types.CHATCOMPLETION_MODEL_CHANGED, handler);
    }
}

function applyPresetChatLoadedTokenRefreshOptimization() {
    if (extensionState[PRESET_CHAT_LOADED_HANDLER_KEY]) {
        return;
    }

    const registrations = [];
    const register = (eventType, reason, {
        suppressMs = 0,
        delayMs = PRESET_CONTEXT_TOKEN_REFRESH_DELAY_MS,
        allowNoContext = false,
        requireVisible = true,
    } = {}) => {
        if (!eventType || typeof eventSource?.on !== 'function') {
            return;
        }

        const handler = () => {
            schedulePromptManagerContextTokenRefresh(reason, { suppressMs, delayMs, allowNoContext, requireVisible });
        };

        registrations.push({ eventType, handler });

        if (typeof eventSource.makeFirst === 'function') {
            eventSource.makeFirst(eventType, handler);
        } else {
            eventSource.on(eventType, handler);
        }
    };

    register(event_types.CHAT_LOADED, 'chat load', { suppressMs: PRESET_CHAT_LOAD_RENDER_SUPPRESS_MS, delayMs: 0 });
    register(event_types.CHAT_CHANGED, 'chat changed', { suppressMs: PRESET_CHAT_LOAD_RENDER_SUPPRESS_MS, allowNoContext: true });
    register('groupSelected', 'group selected', { suppressMs: PRESET_CHAT_LOAD_RENDER_SUPPRESS_MS, allowNoContext: true });
    register(event_types.CHARACTER_EDITED, 'character edited', { suppressMs: PRESET_CHAT_LOAD_RENDER_SUPPRESS_MS });
    register(event_types.CHARACTER_DELETED, 'character deleted', { suppressMs: PRESET_CHAT_LOAD_RENDER_SUPPRESS_MS });
    register(event_types.MESSAGE_SENT, 'message sent', { delayMs: PROMPT_MANAGER_TOKEN_REFRESH_BUSY_DELAY_MS });
    register(event_types.MESSAGE_RECEIVED, 'message received', { suppressMs: PRESET_CHAT_LOAD_RENDER_SUPPRESS_MS, delayMs: PROMPT_MANAGER_TOKEN_REFRESH_BUSY_DELAY_MS });
    register(event_types.MESSAGE_EDITED, 'message edited', { suppressMs: PRESET_CHAT_LOAD_RENDER_SUPPRESS_MS, delayMs: PROMPT_MANAGER_TOKEN_REFRESH_BUSY_DELAY_MS });
    register(event_types.MESSAGE_UPDATED, 'message updated', { delayMs: PROMPT_MANAGER_TOKEN_REFRESH_BUSY_DELAY_MS });
    register(event_types.MESSAGE_DELETED, 'message deleted', { suppressMs: PRESET_CHAT_LOAD_RENDER_SUPPRESS_MS, delayMs: PROMPT_MANAGER_TOKEN_REFRESH_BUSY_DELAY_MS });
    register(event_types.MESSAGE_SWIPED, 'message swiped', { delayMs: PROMPT_MANAGER_TOKEN_REFRESH_BUSY_DELAY_MS });
    register(event_types.MESSAGE_SWIPE_DELETED, 'message swipe deleted', { delayMs: PROMPT_MANAGER_TOKEN_REFRESH_BUSY_DELAY_MS });
    register(event_types.GENERATION_ENDED, 'generation ended', { delayMs: PROMPT_MANAGER_TOKEN_REFRESH_FAST_DELAY_MS });
    register(event_types.WORLDINFO_SETTINGS_UPDATED, 'world info settings updated', { suppressMs: PRESET_CHAT_LOAD_RENDER_SUPPRESS_MS });
    register(event_types.WORLDINFO_UPDATED, 'world info updated');
    register(event_types.WORLDINFO_FORCE_ACTIVATE, 'world info force activate');
    register(event_types.WORLDINFO_SCAN_DONE, 'world info scan done');
    register(event_types.PERSONA_CHANGED, 'persona changed');
    register(event_types.PERSONA_CREATED, 'persona created');
    register(event_types.PERSONA_UPDATED, 'persona updated');
    register(event_types.PERSONA_RENAMED, 'persona renamed');
    register(event_types.PERSONA_DELETED, 'persona deleted');
    register(event_types.CHATCOMPLETION_SOURCE_CHANGED, 'chat completion source changed', { suppressMs: PRESET_CHAT_LOAD_RENDER_SUPPRESS_MS });
    register(event_types.SETTINGS_UPDATED, 'settings updated', { delayMs: 250 });

    const tokenSettingsHandler = event => {
        const target = event.target instanceof Element ? event.target : null;
        if (!target?.matches?.('#openai_max_context, #openai_max_tokens')) {
            return;
        }

        schedulePromptManagerContextTokenRefresh('token budget changed', {
            suppressMs: PRESET_CHAT_LOAD_RENDER_SUPPRESS_MS,
            delayMs: PRESET_CONTEXT_TOKEN_REFRESH_DELAY_MS,
            requireVisible: true,
        });
    };

    document.addEventListener('change', tokenSettingsHandler, true);

    extensionState[PRESET_CHAT_LOADED_HANDLER_KEY] = {
        registrations,
        tokenSettingsHandler,
    };

    schedulePromptManagerContextTokenRefresh('initial prompt manager token refresh', {
        delayMs: 250,
        allowNoContext: true,
    });
}

function schedulePromptManagerContextTokenRefresh(reason, {
    suppressMs = 0,
    delayMs = PRESET_CONTEXT_TOKEN_REFRESH_DELAY_MS,
    allowNoContext = false,
    requireVisible = true,
} = {}) {
    if (!settings.presetSwitchOptimizationEnabled) {
        return;
    }

    if (requireVisible && !isPromptManagerTokenPanelVisible()) {
        return;
    }

    const state = getPresetContextTokenRefreshState();
    const now = Date.now();
    if (state.inFlight || now < Number(state.suppressUntil || 0)) {
        return;
    }

    const hasContext = hasPromptManagerTokenContext();
    if (!hasContext && !allowNoContext) {
        return;
    }

    if (suppressMs > 0) {
        suppressPromptManagerDebouncedRender(suppressMs);
    }

    state.reason = reason || 'context change';
    state.attempt = 0;
    state.allowNoContext = Boolean(allowNoContext);
    state.requireVisible = Boolean(requireVisible);

    clearTimeout(state.timer);
    state.timer = setTimeout(() => {
        state.timer = null;
        void runPromptManagerContextTokenRefresh(state.reason, state.attempt, state.allowNoContext, state.requireVisible);
    }, Math.max(0, Number(delayMs) || 0));
}

function hasPromptManagerTokenContext() {
    return Boolean(getCurrentChatId?.());
}

function getPresetContextTokenRefreshState() {
    if (!extensionState[PRESET_CONTEXT_TOKEN_REFRESH_KEY] || typeof extensionState[PRESET_CONTEXT_TOKEN_REFRESH_KEY] !== 'object') {
        extensionState[PRESET_CONTEXT_TOKEN_REFRESH_KEY] = {
            timer: null,
            reason: '',
            attempt: 0,
            allowNoContext: false,
            requireVisible: true,
            inFlight: false,
            suppressUntil: 0,
        };
    }

    return extensionState[PRESET_CONTEXT_TOKEN_REFRESH_KEY];
}

async function handleChatCompletionModelChangedForPromptManager() {
    if (!settings.presetSwitchOptimizationEnabled || !isPromptManagerReadyForFastPresetSwitch()) {
        return;
    }

    try {
        suppressPromptManagerDebouncedRender();
        await renderPromptManagerListWithoutTokenStats();
        refreshPromptManagerTokensAfterPresetSwitchDebounced();
    } catch (error) {
        console.debug(`${LOG_PREFIX} Failed to fast-refresh prompt manager after model change`, error);
    }
}

async function runPromptManagerContextTokenRefresh(reason, attempt = 0, allowNoContext = false, requireVisible = true) {
    if (!settings.presetSwitchOptimizationEnabled) {
        return;
    }

    try {
        if (requireVisible && !isPromptManagerTokenPanelVisible()) {
            return;
        }

        if (isPresetGenerationActive()) {
            return;
        }

        if (!isPromptManagerReadyForFastPresetSwitch()) {
            if (attempt >= PRESET_CONTEXT_TOKEN_REFRESH_MAX_ATTEMPTS) {
                return;
            }

            const state = getPresetContextTokenRefreshState();
            state.reason = reason || state.reason || 'context change';
            state.attempt = attempt + 1;
            state.allowNoContext = Boolean(allowNoContext);
            state.requireVisible = Boolean(requireVisible);
            clearTimeout(state.timer);
            state.timer = setTimeout(() => {
                state.timer = null;
                void runPromptManagerContextTokenRefresh(state.reason, state.attempt, state.allowNoContext, state.requireVisible);
            }, PRESET_CONTEXT_TOKEN_REFRESH_RETRY_MS);
            return;
        }

        if (!hasPromptManagerTokenContext()) {
            if (allowNoContext) {
                await refreshPromptManagerTokensForMissingContext();
            }
            return;
        }

        await fastRefreshPromptManagerTokensAfterContextChange(reason || 'context change', { markPending: false, forceVisible: !requireVisible });
    } catch (error) {
        console.debug(`${LOG_PREFIX} Failed to fast-refresh prompt manager after ${reason}`, error);
    }
}

async function refreshPromptManagerTokensForMissingContext() {
    const contextRefreshState = getPresetContextTokenRefreshState();
    const queueState = getPromptManagerTokenRefreshQueueState();
    contextRefreshState.inFlight = true;
    const startedSignature = getPromptManagerTokenRefreshSignature();
    const startedEffectiveTokenCountSignature = getPresetEffectiveTokenCountSignature();
    const startedEffectiveTokenCountsCurrent = arePromptManagerTokenCountsCurrent();
    queueState.lastSignature = '';
    if (!startedEffectiveTokenCountsCurrent) {
        queueState.lastEffectiveTokenCountSignature = '';
        updatePresetEffectiveTokenHeaderDisplay(null);
    }

    try {
        const refreshed = await refreshPromptManagerStaticTokensWithoutChatContext();
        if (refreshed) {
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
        }
        if (isPresetVuePromptListManagerActive()) {
            // Vue 列表已激活时,跳过 ST 原生 renderPromptManagerListWithoutTokenStats:
            // 它内部的 promptManager.renderPromptManager() 会重建整个面板 DOM、抹掉
            // Vue host,迫使列表从零重装(丢失当前状态、并造成卡顿)。结构已在 Vue model 中,
            // token 数走命令式 DOM 更新即可。
            syncPresetVuePromptListManagerState();
        } else {
            await renderPromptManagerListWithoutTokenStats();
        }
        schedulePromptManagerTokenDisplayUpdate();
    } catch (error) {
        console.debug(`${LOG_PREFIX} Failed to refresh prompt manager after leaving chat`, error);
    } finally {
        contextRefreshState.inFlight = false;
        contextRefreshState.suppressUntil = Date.now() + PRESET_CONTEXT_TOKEN_REFRESH_SELF_SUPPRESS_MS;
    }
}

async function refreshPromptManagerStaticTokensWithoutChatContext() {
    if (!promptManager?.tokenHandler || typeof promptManager.getPromptCollection !== 'function') {
        return false;
    }

    const tokenHandler = promptManager.tokenHandler;
    if (typeof tokenHandler.resetCounts !== 'function' || typeof tokenHandler.getCounts !== 'function') {
        return false;
    }

    tokenHandler.resetCounts();
    const counts = tokenHandler.getCounts();

    for (const prompt of promptManager.serviceSettings?.prompts || []) {
        if (prompt?.identifier) {
            counts[prompt.identifier] = 0;
        }
    }

    const promptCollection = promptManager.getPromptCollection('normal');
    const prompts = Array.isArray(promptCollection?.collection) ? promptCollection.collection : [];
    const entries = prompts
        .filter(prompt => prompt?.identifier && typeof prompt.content === 'string' && prompt.content.length > 0)
        .map(prompt => ({
            identifier: prompt.identifier,
            message: {
                role: prompt.role || 'system',
                content: prompt.content,
            },
        }));

    if (entries.length > 0) {
        if (!isOpenAITokenizerBulkEnabled()) {
            return false;
        }

        const model = getTokenizerModel();
        const rawCounts = await getOpenAITokenizerBulkCountsUsingCache(model, entries);
        rawCounts.forEach((count, index) => {
            counts[entries[index].identifier] = normalizeOpenAITokenizerPromptManagerCount(count, model);
        });
    }

    promptManager.tokenUsage = typeof tokenHandler.getTotal === 'function' ? tokenHandler.getTotal() : 0;
    return true;
}

function applyPresetDeleteSelectionOptimization() {
    if (extensionState[PRESET_DELETE_HANDLER_KEY]) {
        return;
    }

    const handler = (event) => {
        handleOpenAiPresetDeleteClick(event);
    };

    extensionState[PRESET_DELETE_HANDLER_KEY] = handler;
    document.addEventListener('click', handler, true);
}

function applyPresetListActionDelegation() {
    if (extensionState[PRESET_LIST_ACTION_HANDLER_KEY]) {
        return;
    }

    const handler = (event) => {
        handlePresetListActionClick(event);
    };

    extensionState[PRESET_LIST_ACTION_HANDLER_KEY] = handler;
    document.addEventListener('click', handler, true);
}

function applyPresetSwitchBeforeOptimization() {
    if (extensionState[PRESET_SWITCH_BEFORE_HANDLER_KEY]) {
        return;
    }

    const handler = async (event) => {
        await handleOpenAiPresetChangedBefore(event);
    };

    extensionState[PRESET_SWITCH_BEFORE_HANDLER_KEY] = handler;

    if (typeof eventSource.makeLast === 'function') {
        eventSource.makeLast(event_types.OAI_PRESET_CHANGED_BEFORE, handler);
    } else {
        eventSource.on(event_types.OAI_PRESET_CHANGED_BEFORE, handler);
    }
}

function applyPresetSelectChangeDeferral() {
    if (extensionState[PRESET_SELECT_CHANGE_HANDLER_KEY]) {
        return;
    }

    const handler = (event) => {
        deferOpenAiPresetSelectChangeOnMobile(event);
    };

    extensionState[PRESET_SELECT_CHANGE_HANDLER_KEY] = handler;
    document.addEventListener('change', handler, true);
}

function deferOpenAiPresetSelectChangeOnMobile(event) {
    if (!settings.presetSwitchOptimizationEnabled || !isMobile()) {
        return;
    }

    const select = event.target instanceof HTMLSelectElement ? event.target : null;

    if (!select?.matches(OPENAI_PRESET_SELECT_SELECTOR) || extensionState.allowOpenAiPresetSelectChange) {
        return;
    }

    event.stopPropagation();
    event.stopImmediatePropagation();
    select.blur();

    setTimeout(() => {
        extensionState.allowOpenAiPresetSelectChange = true;
        try {
            $(select).trigger('change');
        } finally {
            extensionState.allowOpenAiPresetSelectChange = false;
        }
    }, 0);
}

function handleOpenAiPresetDeleteClick(event) {
    if (!settings.presetSwitchOptimizationEnabled) {
        return;
    }

    const target = event.target instanceof Element ? event.target : null;
    const button = target?.closest(OPENAI_PRESET_DELETE_SELECTOR);

    if (!button) {
        return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    void deleteOpenAiPresetSelectingNext();
}

async function deleteOpenAiPresetSelectingNext() {
    const confirm = await callGenericPopup(t`Delete the preset? This action is irreversible and your current settings will be overwritten.`, POPUP_TYPE.CONFIRM);

    if (!confirm) {
        return;
    }

    const select = document.querySelector(OPENAI_PRESET_SELECT_SELECTOR);
    const nameToDelete = oai_settings.preset_settings_openai;

    if (!(select instanceof HTMLSelectElement) || !nameToDelete) {
        return;
    }

    clearPendingPresetPromptChanges();

    const deletedIndex = Math.max(0, select.selectedIndex);
    const value = openai_setting_names?.[nameToDelete];

    if (value !== undefined) {
        select.querySelector(`option[value="${escapeCssSelectorValue(value)}"]`)?.remove();
    } else if (select.selectedIndex >= 0) {
        select.options[select.selectedIndex]?.remove();
    }

    delete openai_setting_names[nameToDelete];
    oai_settings.preset_settings_openai = null;

    if (Object.keys(openai_setting_names).length && select.options.length) {
        const nextIndex = deletedIndex < select.options.length ? deletedIndex : 0;
        select.selectedIndex = nextIndex;
        oai_settings.preset_settings_openai = select.options[nextIndex]?.text ?? null;
        $(select).trigger('change');
    }

    const response = await fetch('/api/presets/delete', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({ apiId: 'openai', name: nameToDelete }),
    });

    if (!response.ok) {
        toastr.warning(t`Preset was not deleted from server`);
    } else {
        toastr.success(t`Preset deleted`);
        await eventSource.emit(event_types.PRESET_DELETED, { apiId: 'openai', name: nameToDelete });
    }

    await saveSettings();
}

function handlePresetListActionClick(event) {
    if (!settings.presetSwitchOptimizationEnabled && !isPresetGroupingEnabled()) {
        return;
    }

    const target = event.target instanceof Element ? event.target : null;

    if (!target) {
        closePresetPromptActionMenus();
        return;
    }

    const menuButton = target.closest(`${PRESET_PROMPT_MANAGER_LIST_SELECTOR} .bai-bai-preset-prompt-actions-hint`);

    if (menuButton instanceof HTMLElement) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        togglePresetPromptActionMenu(menuButton);
        return;
    }

    if (!target.closest(`${PRESET_PROMPT_MANAGER_LIST_SELECTOR} .bai-bai-preset-prompt-actions, ${PRESET_PROMPT_MANAGER_LIST_SELECTOR} .bai-bai-preset-prompt-actions-hint`)) {
        closePresetPromptActionMenus();
    }

    if (!target.closest(PRESET_PROMPT_MANAGER_LIST_SELECTOR)) {
        return;
    }

    if (handlePresetVuePromptRangeSelectionDelegatedClick(event, target)) {
        return;
    }

    const action = target.closest('[data-preset-prompt-action], .prompt-manager-detach-action, .prompt-manager-inspect-action, .prompt-manager-edit-action');

    if (!action) {
        return;
    }

    handlePresetPromptActionButtonClick(event, action);
}

async function handleOpenAiPresetChangedBefore(event) {
    extensionState.openAiPresetSwitchEarlyRendered = false;
    clearPendingPresetPromptChangesForPreset(event?.presetNameBefore);
    resetPresetPromptGroupRuntimeState();

    if (!settings.presetSwitchOptimizationEnabled || !isPromptManagerReadyForFastPresetSwitch()) {
        return;
    }

    const preset = event?.preset;

    if (!preset || typeof preset !== 'object' || (!Array.isArray(preset.prompts) && !Array.isArray(preset.prompt_order))) {
        return;
    }

    try {
        applyPromptManagerPresetFieldsEarly(preset);
        await renderPromptManagerListWithoutTokenStats();
        markPromptManagerTokensPending();
        extensionState.openAiPresetSwitchEarlyRendered = true;
        await waitForNextPaint();
    } catch (error) {
        extensionState.openAiPresetSwitchEarlyRendered = false;
        console.debug(`${LOG_PREFIX} Failed to early-render prompt manager after preset switch`, error);
    }
}

async function handleOpenAiPresetChangedAfter() {
    if (!settings.presetSwitchOptimizationEnabled || !isPromptManagerReadyForFastPresetSwitch()) {
        if (isPresetGroupingEnabled()) {
            syncPresetVuePromptListManagerState();
        }
        return;
    }

    try {
        if (!extensionState.openAiPresetSwitchEarlyRendered) {
            await renderPromptManagerListWithoutTokenStats();
            markPromptManagerTokensPending();
        }

        suppressPromptManagerDebouncedRender();
        if (isPresetGroupingEnabled()) {
            syncPresetVuePromptListManagerState();
        }
        refreshPromptManagerTokensAfterPresetSwitchDebounced();
    } catch (error) {
        console.debug(`${LOG_PREFIX} Failed to fast-render prompt manager after preset switch`, error);
    } finally {
        extensionState.openAiPresetSwitchEarlyRendered = false;
    }
}

function isPromptManagerReadyForFastPresetSwitch() {
    return Boolean(
        promptManager
        && typeof promptManager.renderDebounced === 'function'
        && typeof promptManager.renderPromptManager === 'function'
        && typeof promptManager.renderPromptManagerListItems === 'function'
        && promptManager.containerElement
        && promptManager.serviceSettings,
    );
}

function applyPromptManagerPresetFieldsEarly(preset) {
    if (Array.isArray(preset.prompts)) {
        oai_settings.prompts = structuredClone(preset.prompts);
    }

    if (Array.isArray(preset.prompt_order)) {
        oai_settings.prompt_order = structuredClone(preset.prompt_order);
    }

    oai_settings.extensions = preset.extensions && typeof preset.extensions === 'object'
        ? structuredClone(preset.extensions)
        : {};

    promptManager.serviceSettings = oai_settings;
    promptManager.sanitizeServiceSettings?.();
}

async function renderPromptManagerListWithoutTokenStats() {
    if (isPresetGlobalLibraryDialogOpen()) {
        // 全局库弹窗挂在 #completion_prompt_manager 容器内,而 promptManager.renderPromptManager()
        // 会清空该容器,会把正在编辑/选择的弹窗一起删掉。弹窗打开期间推迟重建,关闭后补一次。
        extensionState.presetPromptListRebuildDeferredByDialog = true;
        return;
    }

    installPresetVuePromptListRenderPatch();
    const scrollContainer = promptManager.containerElement.closest('.scrollableInner');
    const scrollTop = scrollContainer?.scrollTop;
    const renderCycle = (extensionState.presetPromptManagerFastRenderCycle ?? 0) + 1;

    extensionState.presetPromptManagerFastRenderCycle = renderCycle;

    try {
        promptManager.error = null;
        await promptManager.renderPromptManager();
        await renderPromptManagerListItemsFast({ skipVueSyncIfCurrentCycle: true });
        schedulePromptManagerDraggableInit();

        if (typeof scrollTop === 'number') {
            scrollContainer?.scrollTo(0, scrollTop);
        }

        flushPromptManagerTokenRefreshIfPendingVisible('prompt manager rendered');
    } finally {
        if (extensionState.presetPromptManagerFastRenderCycle === renderCycle) {
            extensionState.presetPromptManagerFastRenderCycle = 0;
        }
    }
}

async function renderPromptManagerListItemsFast({ skipVueSyncIfCurrentCycle = false } = {}) {
    if (isPresetGroupingEnabled()) {
        const manager = getPresetVuePromptListManagerState();

        if (
            skipVueSyncIfCurrentCycle
            && manager.lastRenderPatchSyncCycle
            && manager.lastRenderPatchSyncCycle === extensionState.presetPromptManagerFastRenderCycle
            && isPresetVuePromptListManagerActive()
        ) {
            preparePromptManagerCustomDragList(getPromptManagerListElement(), { signature: manager.lastStructureSignature });
            return;
        }

        await installPresetVuePromptListManager();

        if (syncPresetVuePromptListManagerState()) {
            preparePromptManagerCustomDragList(getPromptManagerListElement(), { signature: manager.lastStructureSignature });
            return;
        }
    }

    const promptManagerList = promptManager.listElement;

    if (!promptManager.serviceSettings?.prompts || !promptManagerList) {
        return;
    }

    const { prefix } = promptManager.configuration;
    const promptOrder = promptManager.getPromptOrderForCharacter?.(promptManager.activeCharacter) ?? [];
    const prompts = promptManager.serviceSettings.prompts.filter(Boolean);
    const promptById = new Map(prompts.map(prompt => [prompt.identifier, prompt]));
    const orderEntryById = new Map(promptOrder.filter(Boolean).map(entry => [entry.identifier, entry]));
    const counts = promptManager.tokenHandler?.getCounts?.() ?? {};
    const toggleDisabled = new Set(promptManager.configuration.toggleDisabled ?? []);
    const overriddenPrompts = new Set(Array.isArray(promptManager.overriddenPrompts) ? promptManager.overriddenPrompts : []);
    const tokenBudget = promptManager.serviceSettings.openai_max_context - promptManager.serviceSettings.openai_max_tokens;
    const isTokenUsageWarning = promptManager.tokenUsage > tokenBudget * 0.8;

    let listItemHtml = await renderTemplateAsync('promptManagerListHeader', { prefix });

    for (const orderEntry of promptOrder) {
        const prompt = promptById.get(orderEntry?.identifier);

        if (!prompt) {
            continue;
        }

        const listEntry = orderEntryById.get(prompt.identifier) ?? orderEntry;
        const enabledClass = listEntry?.enabled ? '' : `${prefix}prompt_manager_prompt_disabled`;
        const draggableClass = `${prefix}prompt_manager_prompt_draggable`;
        const markerClass = prompt.marker ? `${prefix}prompt_manager_marker` : '';
        const tokens = counts[prompt.identifier] ?? 0;
        const { warningClass, warningTitle } = getPromptTokenWarning({
            prompt,
            tokens,
            isTokenUsageWarning,
        });

        const calculatedTokens = tokens ? tokens : '-';
        const canDelete = isPresetPromptDeleteOrDetachAllowed(prompt);
        const canEdit = FORCE_EDIT_PROMPTS.has(prompt.identifier) || !prompt.marker;
        const canToggle = prompt.marker && !FORCE_TOGGLE_PROMPTS.has(prompt.identifier)
            ? false
            : !toggleDisabled.has(prompt.identifier);
        // 切换优化的快速刷新只在「未开启分组」时走到这里(分组开启会在上面委派给 Vue 后 return)。
        // 渲染 ST 原生平铺菜单,而非收缩菜单——收缩菜单是预设分组专属。
        const controlsHtml = renderNativePromptControlsHtml({
            canDelete,
            canEdit,
            canToggle,
            isEnabled: listEntry?.enabled !== false,
        });

        listItemHtml += renderPromptManagerListRow({
            prefix,
            prompt,
            enabledClass,
            draggableClass,
            markerClass,
            importantClass: getPromptImportantClass(prompt, prefix),
            controlsHtml,
            warningClass,
            warningTitle,
            calculatedTokens,
            isOverriddenPrompt: overriddenPrompts.has(prompt.identifier),
        });
    }

    promptManagerList.innerHTML = listItemHtml;
}

function renderPromptManagerListRow({
    prefix,
    prompt,
    enabledClass,
    draggableClass,
    markerClass,
    importantClass,
    controlsHtml,
    warningClass,
    warningTitle,
    calculatedTokens,
    isOverriddenPrompt,
}) {
    const encodedId = escapeHtml(prompt.identifier);
    const encodedName = escapeHtml(prompt.name ?? '');
    const isMarkerPrompt = prompt.marker && prompt.injection_position !== INJECTION_POSITION.ABSOLUTE;
    const isSystemPrompt = !prompt.marker && prompt.system_prompt && prompt.injection_position !== INJECTION_POSITION.ABSOLUTE && !prompt.forbid_overrides;
    const isImportantPrompt = !prompt.marker && prompt.system_prompt && prompt.injection_position !== INJECTION_POSITION.ABSOLUTE && prompt.forbid_overrides;
    const isUserPrompt = !prompt.marker && !prompt.system_prompt && prompt.injection_position !== INJECTION_POSITION.ABSOLUTE;
    const isInjectionPrompt = prompt.injection_position === INJECTION_POSITION.ABSOLUTE;
    const iconLookup = prompt.role === 'system' && (prompt.marker || prompt.system_prompt) ? '' : prompt.role;
    const promptRoles = {
        assistant: { roleIcon: 'fa-robot', roleTitle: 'Prompt will be sent as Assistant' },
        user: { roleIcon: 'fa-user', roleTitle: 'Prompt will be sent as User' },
    };
    const roleIcon = promptRoles[iconLookup]?.roleIcon || '';
    const roleTitle = promptRoles[iconLookup]?.roleTitle || '';

    return `
        <li class="${prefix}prompt_manager_prompt ${draggableClass} ${enabledClass} ${markerClass} ${importantClass}" data-pm-identifier="${encodedId}">
            <span class="drag-handle">☰</span>
            <span class="${prefix}prompt_manager_prompt_name" data-pm-name="${encodedName}">
                ${isMarkerPrompt ? '<span class="fa-fw fa-solid fa-thumb-tack" title="Marker"></span>' : ''}
                ${isSystemPrompt ? '<span class="fa-fw fa-solid fa-square-poll-horizontal" title="Global Prompt"></span>' : ''}
                ${isImportantPrompt ? '<span class="fa-fw fa-solid fa-star" title="Important Prompt"></span>' : ''}
                ${isUserPrompt ? '<span class="fa-fw fa-solid fa-asterisk" title="Preset Prompt"></span>' : ''}
                ${isInjectionPrompt ? '<span class="fa-fw fa-solid fa-syringe" title="In-Chat Injection"></span>' : ''}
                ${promptManager.isPromptInspectionAllowed?.(prompt) ? `<a title="${encodedName}" class="prompt-manager-inspect-action">${encodedName}</a>` : `<span title="${encodedName}">${encodedName}</span>`}
                ${roleIcon ? `<span data-role="${escapeHtml(prompt.role)}" class="fa-xs fa-solid ${roleIcon}" title="${roleTitle}"></span>` : ''}
                ${isInjectionPrompt ? `<small class="prompt-manager-injection-depth">@ ${escapeHtml(prompt.injection_depth?.toString?.() ?? '')}</small>` : ''}
                ${isOverriddenPrompt ? '<small class="fa-solid fa-address-card prompt-manager-overridden" title="Pulled from a character card"></small>' : ''}
            </span>
            <span>
                <span class="prompt_manager_prompt_controls">
                    ${controlsHtml}
                </span>
            </span>
            <span class="prompt_manager_prompt_tokens" data-pm-tokens="${calculatedTokens}"><span class="${warningClass}" title="${warningTitle}"> </span>${calculatedTokens}</span>
        </li>
    `;
}

function getPromptImportantClass(prompt, prefix) {
    return !prompt.marker && prompt.system_prompt && prompt.injection_position !== INJECTION_POSITION.ABSOLUTE && prompt.forbid_overrides
        ? `${prefix}prompt_manager_important`
        : '';
}

function getPromptTokenWarning({ prompt, tokens, isTokenUsageWarning }) {
    const result = { warningClass: '', warningTitle: '' };

    if (!isTokenUsageWarning || prompt.identifier !== 'chatHistory') {
        return result;
    }

    if (tokens <= promptManager.configuration.dangerTokenThreshold) {
        result.warningClass = 'fa-solid tooltip fa-triangle-exclamation text_danger';
        result.warningTitle = 'Very little of your chat history is being sent, consider deactivating some other prompts.';
    } else if (tokens <= promptManager.configuration.warningTokenThreshold) {
        result.warningClass = 'fa-solid tooltip fa-triangle-exclamation text_warning';
        result.warningTitle = 'Only a few messages worth chat history is being sent.';
    }

    return result;
}

function getPresetEffectiveTokenGroupContext() {
    if (!isPresetGroupingEnabled()) {
        return null;
    }

    const groupState = getPresetPromptGroupState();
    const groups = Array.isArray(groupState?.groups) ? groupState.groups : [];
    return {
        promptGroups: groupState?.prompts ?? {},
        groupsById: new Map(groups.map(group => [String(group?.id ?? ''), group])),
    };
}

function isPresetPromptIncludedInEffectiveTokenTotal(prompt, orderEntry, groupContext = null) {
    const promptId = prompt?.identifier;

    if (!promptId || orderEntry?.enabled === false || PRESET_CONTEXT_INJECTION_PROMPT_IDS.has(promptId)) {
        return false;
    }

    if (!isPresetGroupingEnabled()) {
        return true;
    }

    const context = groupContext ?? getPresetEffectiveTokenGroupContext();
    const groupId = context?.promptGroups?.[promptId]?.groupId;

    if (!groupId) {
        return true;
    }

    const group = context?.groupsById?.get(String(groupId));

    return group?.enabled !== false;
}

function normalizePresetEffectiveTokenCount(value) {
    if (value === null) {
        return null;
    }

    if (value === undefined) {
        return 0;
    }

    const tokens = Number(value);
    return Number.isFinite(tokens) && tokens >= 0 ? Math.round(tokens) : 0;
}

function getPresetEffectiveTokenCountSignature() {
    try {
        const serviceSettings = promptManager?.serviceSettings ?? oai_settings;
        const prompts = Array.isArray(serviceSettings?.prompts)
            ? serviceSettings.prompts.filter(Boolean)
            : [];
        const promptOrder = promptManager?.getPromptOrderForCharacter?.(promptManager.activeCharacter) ?? [];
        const promptById = new Map(prompts.map(prompt => [prompt.identifier, prompt]));
        const promptParts = [];

        for (const orderEntry of promptOrder) {
            const promptId = orderEntry?.identifier || '';
            if (!promptId || PRESET_CONTEXT_INJECTION_PROMPT_IDS.has(promptId)) {
                continue;
            }

            const prompt = promptById.get(promptId);

            promptParts.push([
                promptId,
                prompt?.role || '',
                prompt?.marker ? 1 : 0,
                getStringHash(String(prompt?.content ?? '')),
            ].join(':'));
        }

        return [
            getTokenizerModel(),
            promptParts.join('|'),
        ].join('||');
    } catch (error) {
        console.debug(`${LOG_PREFIX} Failed to build preset effective token count signature`, error);
        return '';
    }
}

function arePromptManagerTokenCountsCurrent() {
    const signature = getPresetEffectiveTokenCountSignature();
    const queueState = getPromptManagerTokenRefreshQueueState();

    return Boolean(
        signature
        && queueState.lastEffectiveTokenCountSignature
        && signature === queueState.lastEffectiveTokenCountSignature
    );
}

function calculatePresetEffectivePromptTokenTotal() {
    const counts = promptManager?.tokenHandler?.getCounts?.();
    const promptOrder = promptManager?.getPromptOrderForCharacter?.(promptManager.activeCharacter) ?? [];
    const prompts = Array.isArray(promptManager?.serviceSettings?.prompts)
        ? promptManager.serviceSettings.prompts.filter(Boolean)
        : [];

    if (!counts || !promptOrder.length || !prompts.length) {
        return null;
    }

    const promptById = new Map(prompts.map(prompt => [prompt.identifier, prompt]));
    const allowCurrentCounts = arePromptManagerTokenCountsCurrent();

    if (!allowCurrentCounts) {
        return null;
    }

    const groupContext = getPresetEffectiveTokenGroupContext();
    let total = 0;
    let includedCount = 0;

    for (const orderEntry of promptOrder) {
        const prompt = promptById.get(orderEntry?.identifier);

        if (!isPresetPromptIncludedInEffectiveTokenTotal(prompt, orderEntry, groupContext)) {
            continue;
        }

        includedCount += 1;
        const tokens = normalizePresetEffectiveTokenCount(counts[prompt.identifier]);

        if (tokens === null) {
            return null;
        }

        total += tokens;
    }

    return includedCount > 0 ? Math.round(total) : 0;
}

function formatPresetEffectiveTokenHeaderText(value) {
    if (value === null || value === undefined) {
        return PRESET_EFFECTIVE_TOKEN_HEADER_PENDING_TEXT;
    }

    const total = Number(value);
    return `预设总Token: ${Number.isFinite(total) ? Math.max(0, Math.round(total)) : 0}`;
}

function updatePresetEffectiveTokenHeaderDisplay(value = undefined) {
    if (!isPresetGroupingEnabled()) {
        return false;
    }

    const list = document.querySelector(PRESET_PROMPT_MANAGER_LIST_SELECTOR);
    const label = list?.querySelector(`li.completion_prompt_manager_list_head span.${PRESET_EFFECTIVE_TOKEN_HEADER_CLASS}`);

    if (!label) {
        return false;
    }

    const nextText = formatPresetEffectiveTokenHeaderText(
        value === undefined ? calculatePresetEffectivePromptTokenTotal() : value,
    );

    if (label.textContent !== nextText) {
        label.textContent = nextText;
    }

    if (label.title !== PRESET_EFFECTIVE_TOKEN_HEADER_TITLE) {
        label.title = PRESET_EFFECTIVE_TOKEN_HEADER_TITLE;
    }

    return true;
}

function schedulePromptManagerDraggableInit() {
    const initId = (extensionState.promptManagerDraggableInitId ?? 0) + 1;
    extensionState.promptManagerDraggableInitId = initId;

    setTimeout(() => {
        if (extensionState.promptManagerDraggableInitId !== initId) {
            return;
        }

        try {
            patchPromptManagerDraggable();
            promptManager.makeDraggable?.();
            preparePromptManagerCustomDragList();
        } catch (error) {
            console.debug(`${LOG_PREFIX} Failed to initialize prompt manager sorting`, error);
        }
    }, 0);
}

function waitForNextPaint() {
    return new Promise(resolve => {
        let settled = false;
        const finish = () => {
            if (settled) {
                return;
            }

            settled = true;
            clearTimeout(fallback);
            resolve();
        };
        const fallback = setTimeout(finish, 80);

        if (typeof requestAnimationFrame !== 'function') {
            finish();
            return;
        }

        requestAnimationFrame(() => setTimeout(finish, 0));
    });
}

function suppressPromptManagerDebouncedRender(restoreDelayMs = 0) {
    const originalRenderDebounced = promptManager.renderDebounced;

    if (typeof originalRenderDebounced !== 'function' || originalRenderDebounced.__baiBaiToolkitPresetSwitchSuppressed) {
        return;
    }

    const suppressedRenderDebounced = () => { };
    suppressedRenderDebounced.__baiBaiToolkitPresetSwitchSuppressed = true;
    suppressedRenderDebounced.__baiBaiToolkitOriginalRenderDebounced = originalRenderDebounced;
    promptManager.renderDebounced = suppressedRenderDebounced;

    setTimeout(() => {
        if (promptManager?.renderDebounced === suppressedRenderDebounced) {
            promptManager.renderDebounced = originalRenderDebounced;
        }
    }, Math.max(0, Number(restoreDelayMs) || 0));
}

export {
    applyPresetChatLoadedTokenRefreshOptimization,
    applyPresetDeleteSelectionOptimization,
    applyPresetListActionDelegation,
    applyPresetModelChangeTokenRefreshOptimization,
    applyPresetSelectChangeDeferral,
    applyPresetSwitchBeforeOptimization,
    applyPresetSwitchOptimization,
    applyPromptManagerPresetFieldsEarly,
    arePromptManagerTokenCountsCurrent,
    calculatePresetEffectivePromptTokenTotal,
    deferOpenAiPresetSelectChangeOnMobile,
    deleteOpenAiPresetSelectingNext,
    formatPresetEffectiveTokenHeaderText,
    getPresetContextTokenRefreshState,
    getPresetEffectiveTokenCountSignature,
    getPresetEffectiveTokenGroupContext,
    getPromptImportantClass,
    getPromptTokenWarning,
    handleChatCompletionModelChangedForPromptManager,
    handleOpenAiPresetChangedAfter,
    handleOpenAiPresetChangedBefore,
    handleOpenAiPresetDeleteClick,
    handlePresetListActionClick,
    hasPromptManagerTokenContext,
    isPresetPromptIncludedInEffectiveTokenTotal,
    isPromptManagerReadyForFastPresetSwitch,
    normalizePresetEffectiveTokenCount,
    refreshPromptManagerStaticTokensWithoutChatContext,
    refreshPromptManagerTokensForMissingContext,
    removePresetSwitchOptimization,
    renderPromptManagerListItemsFast,
    renderPromptManagerListRow,
    renderPromptManagerListWithoutTokenStats,
    runPromptManagerContextTokenRefresh,
    schedulePromptManagerContextTokenRefresh,
    schedulePromptManagerDraggableInit,
    suppressPromptManagerDebouncedRender,
    updatePresetEffectiveTokenHeaderDisplay,
    waitForNextPaint,
};
