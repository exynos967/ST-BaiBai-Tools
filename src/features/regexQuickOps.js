import { event_types, eventSource } from '@sillytavern/script';
import { extension_settings } from '@sillytavern/scripts/extensions';
import { SCRIPT_TYPES as REGEX_SCRIPT_TYPES } from '@sillytavern/scripts/extensions/regex/engine';
import { t } from '@sillytavern/scripts/i18n';
import { LOG_PREFIX, REGEX_CONTAINER_SELECTOR, REGEX_PENDING_CHANGES_LIFECYCLE_HANDLER_KEY, REGEX_PRESET_GROUP_PORTABILITY_HANDLER_KEY, REGEX_QUICK_OPERATION_HANDLER_KEY, REGEX_QUICK_OPERATION_OBSERVER_KEY, REGEX_VUE_MANAGER_CLICK_HANDLER_KEY, REGEX_VUE_NATIVE_RENDER_GUARD_KEY, REGEX_VUE_PRESET_RENAME_HANDLER_KEY, REGEX_VUE_SCOPED_CONTEXT_HANDLER_KEY, SETTINGS_KEY } from './constants.js';
import { openOptimizedRegexEditorForType } from './regexEditor.js';
import { bulkDeleteRegexVueScripts, bulkMoveRegexVueScripts, bulkToggleRegexVueScripts, exportRegexVueSelectedScripts, toggleRegexVueBulkSelection } from './regexGroupOps.js';
import { getRegexGroupSettingsRoot, getRegexPresetGroupScopeKey, importRegexPresetGroupStateFromPresetData, injectRegexPresetGroupStateIntoExport } from './regexGroups.js';
import { installOptimizedRegexImportHandler, removeOptimizedRegexImportHandler } from './regexImport.js';
import { handleRegexQuickOperationClick, preventRegexQuickOperationEvent, scheduleNativeRegexSortableGuard } from './regexNative.js';
import { flushPendingRegexChanges, flushPendingRegexChatReload, hasPendingRegexChanges, markRegexGroupSettingsSavePending, removeRegexChatReloadVisibilityWatch, schedulePendingRegexChangesFlushCheck } from './regexPending.js';
import { installRegexVueManager, isRegexVueManagerActive, removeRegexVueManager, scheduleRegexVueManagerSync, syncRegexVuePresetListFromContext, syncRegexVueScopedListFromContext } from './regexVue.js';
import { extensionState, settings } from './state.js';

function applyRegexQuickOperationOptimization() {
    if (settings.regexQuickOperationOptimizationEnabled) {
        installRegexQuickOperationOptimization();
    } else {
        removeRegexQuickOperationOptimization();
    }
}

function installRegexQuickOperationOptimization() {
    if (!extensionState[REGEX_QUICK_OPERATION_HANDLER_KEY]) {
        const handler = (event) => {
            handleRegexQuickOperationClick(event);
        };

        extensionState[REGEX_QUICK_OPERATION_HANDLER_KEY] = handler;
        document.addEventListener('click', handler, true);
    }

    installRegexVueNativeRenderGuard();
    installRegexQuickOperationMutationObserver();
    installOptimizedRegexImportHandler();
    installRegexPendingChangesLifecycleGuard();
    installRegexVueManagerActionHandler();
    installRegexVueScopedContextHandler();
    installRegexVuePresetRenameHandler();
    installRegexPresetGroupPortabilityHandlers();
    scheduleNativeRegexSortableGuard();
    void installRegexVueManager();
}

function removeRegexQuickOperationOptimization() {
    const handler = extensionState[REGEX_QUICK_OPERATION_HANDLER_KEY];

    if (handler) {
        document.removeEventListener('click', handler, true);
        delete extensionState[REGEX_QUICK_OPERATION_HANDLER_KEY];
    }

    const observer = extensionState[REGEX_QUICK_OPERATION_OBSERVER_KEY];

    if (observer) {
        observer.disconnect();
        delete extensionState[REGEX_QUICK_OPERATION_OBSERVER_KEY];
    }

    const state = getRegexQuickOperationState();
    clearTimeout(state.nativeSortableGuardTimer);
    state.nativeSortableGuardTimer = null;
    state.nativeSortableGuardRetries = 0;
    state.scriptTemplate = null;
    void flushPendingRegexChatReload();
    removeRegexChatReloadVisibilityWatch();
    removeRegexPendingChangesLifecycleGuard();
    removeRegexVueNativeRenderGuard();
    removeRegexVueScopedContextHandler();
    removeRegexVuePresetRenameHandler();
    removeRegexPresetGroupPortabilityHandlers();
    removeOptimizedRegexImportHandler();
    removeRegexVueManagerActionHandler();
    removeRegexVueManager();
}

function getRegexQuickOperationState() {
    if (!extensionState.regexQuickOperationOptimization || typeof extensionState.regexQuickOperationOptimization !== 'object') {
        extensionState.regexQuickOperationOptimization = {};
    }

    const state = extensionState.regexQuickOperationOptimization;

    if (!(state.scriptTemplate instanceof DocumentFragment)) {
        state.scriptTemplate = null;
    }

    return state;
}

function installRegexPendingChangesLifecycleGuard() {
    if (extensionState[REGEX_PENDING_CHANGES_LIFECYCLE_HANDLER_KEY]) {
        return;
    }

    const beforeUnloadHandler = (event) => {
        const state = getRegexQuickOperationState();

        if (!hasPendingRegexChanges() && !state.regexChangesSaveInFlight && !state.regexChangesSavePromise) {
            return;
        }

        void flushPendingRegexChanges().catch(error => {
            console.debug(`${LOG_PREFIX} Failed to flush regex changes before unload`, error);
        });
        event.preventDefault();
        event.returnValue = '';
        return '';
    };

    const pageLifecycleHandler = (event) => {
        if (event?.type === 'visibilitychange' && document.visibilityState !== 'hidden') {
            return;
        }

        if (!hasPendingRegexChanges()) {
            return;
        }

        void flushPendingRegexChanges().catch(error => {
            console.debug(`${LOG_PREFIX} Failed to flush regex changes during page lifecycle event`, error);
        });
    };

    extensionState[REGEX_PENDING_CHANGES_LIFECYCLE_HANDLER_KEY] = {
        beforeUnloadHandler,
        pageLifecycleHandler,
    };

    window.addEventListener('beforeunload', beforeUnloadHandler);
    window.addEventListener('pagehide', pageLifecycleHandler);
    document.addEventListener('visibilitychange', pageLifecycleHandler);
}

function removeRegexPendingChangesLifecycleGuard() {
    const entry = extensionState[REGEX_PENDING_CHANGES_LIFECYCLE_HANDLER_KEY];

    if (!entry) {
        return;
    }

    window.removeEventListener('beforeunload', entry.beforeUnloadHandler);
    window.removeEventListener('pagehide', entry.pageLifecycleHandler);
    document.removeEventListener('visibilitychange', entry.pageLifecycleHandler);
    delete extensionState[REGEX_PENDING_CHANGES_LIFECYCLE_HANDLER_KEY];
}

function installRegexQuickOperationMutationObserver() {
    if (extensionState[REGEX_QUICK_OPERATION_OBSERVER_KEY] || !document.body) {
        return;
    }

    const target = document.querySelector(REGEX_CONTAINER_SELECTOR) ?? document.body;
    const observer = new MutationObserver(() => {
        scheduleNativeRegexSortableGuard();
        scheduleRegexVueManagerSync();
    });

    observer.observe(target, { childList: true, subtree: true });
    extensionState[REGEX_QUICK_OPERATION_OBSERVER_KEY] = observer;
}

function installRegexVueManagerActionHandler() {
    if (extensionState[REGEX_VUE_MANAGER_CLICK_HANDLER_KEY]) {
        return;
    }

    const handler = (event) => {
        handleRegexVueManagerActionClick(event);
    };

    extensionState[REGEX_VUE_MANAGER_CLICK_HANDLER_KEY] = handler;
    document.addEventListener('click', handler, true);
}

function removeRegexVueManagerActionHandler() {
    const handler = extensionState[REGEX_VUE_MANAGER_CLICK_HANDLER_KEY];

    if (!handler) {
        return;
    }

    document.removeEventListener('click', handler, true);
    delete extensionState[REGEX_VUE_MANAGER_CLICK_HANDLER_KEY];
}

function installRegexVueScopedContextHandler() {
    if (extensionState[REGEX_VUE_SCOPED_CONTEXT_HANDLER_KEY]) {
        return;
    }

    const handler = () => {
        syncRegexVueScopedListFromContext();
    };
    const presetHandler = () => {
        syncRegexVuePresetListFromContext({ forcePortableHydration: true });
    };

    extensionState[REGEX_VUE_SCOPED_CONTEXT_HANDLER_KEY] = { handler, presetHandler };
    eventSource.on(event_types.CHAT_CHANGED, handler);
    eventSource.on(event_types.CHARACTER_PAGE_LOADED, handler);
    eventSource.on(event_types.PRESET_CHANGED, presetHandler);
    eventSource.on(event_types.OAI_PRESET_CHANGED_AFTER, presetHandler);
}

function removeRegexVueScopedContextHandler() {
    const entry = extensionState[REGEX_VUE_SCOPED_CONTEXT_HANDLER_KEY];

    if (!entry) {
        return;
    }

    const { handler, presetHandler } = entry;
    eventSource.removeListener(event_types.CHAT_CHANGED, handler);
    eventSource.removeListener(event_types.CHARACTER_PAGE_LOADED, handler);
    eventSource.removeListener(event_types.PRESET_CHANGED, presetHandler);
    eventSource.removeListener(event_types.OAI_PRESET_CHANGED_AFTER, presetHandler);
    delete extensionState[REGEX_VUE_SCOPED_CONTEXT_HANDLER_KEY];
}

function installRegexVuePresetRenameHandler() {
    if (extensionState[REGEX_VUE_PRESET_RENAME_HANDLER_KEY] || !event_types.PRESET_RENAMED) {
        return;
    }

    const handler = event => {
        handleRegexVuePresetRenamed(event);
    };

    extensionState[REGEX_VUE_PRESET_RENAME_HANDLER_KEY] = handler;
    eventSource.on(event_types.PRESET_RENAMED, handler);
}

function removeRegexVuePresetRenameHandler() {
    const handler = extensionState[REGEX_VUE_PRESET_RENAME_HANDLER_KEY];

    if (!handler) {
        return;
    }

    eventSource.removeListener(event_types.PRESET_RENAMED, handler);
    delete extensionState[REGEX_VUE_PRESET_RENAME_HANDLER_KEY];
}

function handleRegexVuePresetRenamed(event) {
    const apiId = event?.apiId;
    const oldName = event?.oldName;
    const newName = event?.newName;

    if (!apiId || !oldName || !newName || oldName === newName) {
        return;
    }

    const groupsChanged = migrateRegexPresetGroupScopeAfterRename(apiId, oldName, newName);
    const allowedChanged = migrateRegexPresetAllowedAfterRename(apiId, oldName, newName);
    const pendingChanged = migratePendingRegexPresetSavesAfterRename(apiId, oldName, newName);

    if (groupsChanged || allowedChanged) {
        markRegexGroupSettingsSavePending();
    }

    if (pendingChanged) {
        schedulePendingRegexChangesFlushCheck();
    }

    syncRegexVuePresetListFromContext();
}

function migrateRegexPresetGroupScopeAfterRename(apiId, oldName, newName) {
    const root = getRegexGroupSettingsRoot();
    const oldKey = getRegexPresetGroupScopeKey(apiId, oldName);
    const newKey = getRegexPresetGroupScopeKey(apiId, newName);

    if (oldKey === newKey || !root.scopes[oldKey] || typeof root.scopes[oldKey] !== 'object') {
        return false;
    }

    root.scopes[newKey] = root.scopes[oldKey];
    delete root.scopes[oldKey];
    extension_settings[SETTINGS_KEY].regexListGroups = settings.regexListGroups;
    return true;
}

function migrateRegexPresetAllowedAfterRename(apiId, oldName, newName) {
    const root = extension_settings.preset_allowed_regex;

    if (!root || typeof root !== 'object' || !Array.isArray(root[apiId])) {
        return false;
    }

    if (!root[apiId].includes(oldName)) {
        return false;
    }

    const before = root[apiId].join('\u0000');
    const nextNames = root[apiId].filter(name => name !== oldName && name !== newName);

    nextNames.push(newName);
    root[apiId] = nextNames;
    return before !== root[apiId].join('\u0000');
}

function migratePendingRegexPresetSavesAfterRename(apiId, oldName, newName) {
    const state = getRegexQuickOperationState();
    const oldKey = getRegexPresetGroupScopeKey(apiId, oldName);
    const newKey = getRegexPresetGroupScopeKey(apiId, newName);
    let changed = false;

    if (state.pendingRegexScriptSaves instanceof Map) {
        for (const [key, entry] of Array.from(state.pendingRegexScriptSaves.entries())) {
            if (entry?.scriptType !== REGEX_SCRIPT_TYPES.PRESET || entry.apiId !== apiId || entry.presetName !== oldName) {
                continue;
            }

            state.pendingRegexScriptSaves.delete(key);
            state.pendingRegexScriptSaves.set(newKey, {
                ...entry,
                presetName: newName,
                scopeKey: newKey,
            });
            changed = true;
        }

        if (!changed && state.pendingRegexScriptSaves.has(oldKey)) {
            const entry = state.pendingRegexScriptSaves.get(oldKey);
            state.pendingRegexScriptSaves.delete(oldKey);
            state.pendingRegexScriptSaves.set(newKey, {
                ...entry,
                apiId,
                presetName: newName,
                scopeKey: newKey,
            });
            changed = true;
        }
    }

    if (state.pendingRegexPresetGroupSaves instanceof Map && state.pendingRegexPresetGroupSaves.has(oldKey)) {
        const entry = state.pendingRegexPresetGroupSaves.get(oldKey);
        state.pendingRegexPresetGroupSaves.delete(oldKey);
        state.pendingRegexPresetGroupSaves.set(newKey, {
            ...entry,
            apiId,
            presetName: newName,
            scopeKey: newKey,
        });
        changed = true;
    }

    if (state.regexPresetGroupHydratedScopeKey === oldKey) {
        state.regexPresetGroupHydratedScopeKey = newKey;
    }

    return changed;
}

function installRegexPresetGroupPortabilityHandlers() {
    if (extensionState[REGEX_PRESET_GROUP_PORTABILITY_HANDLER_KEY]) {
        return;
    }

    const exportHandler = async preset => {
        try {
            await flushPendingRegexChanges();
        } catch (error) {
            console.debug(`${LOG_PREFIX} Failed to flush regex groups before preset export`, error);
        }

        injectRegexPresetGroupStateIntoExport(preset, 'openai');
    };
    const importHandler = event => {
        importRegexPresetGroupStateFromPresetData(event?.data, 'openai', event?.presetName);
    };
    const genericExportClickHandler = event => {
        const button = event.target instanceof Element
            ? event.target.closest('[data-preset-manager-export]')
            : null;

        if (!(button instanceof HTMLElement)) {
            return;
        }

        const state = getRegexQuickOperationState();

        if (state.regexPresetExportBypassButton === button) {
            state.regexPresetExportBypassButton = null;
            return;
        }

        if (!hasPendingRegexChanges() && !state.regexChangesSavePromise) {
            return;
        }

        event.preventDefault();
        event.stopImmediatePropagation();
        void (async () => {
            try {
                await flushPendingRegexChanges();
                state.regexPresetExportBypassButton = button;
                button.click();
            } catch (error) {
                console.debug(`${LOG_PREFIX} Failed to save regex groups before preset export`, error);
                toastr.error(t`Failed to save regex groups before exporting the preset.`);
            }
        })();
    };

    extensionState[REGEX_PRESET_GROUP_PORTABILITY_HANDLER_KEY] = {
        exportHandler,
        importHandler,
        genericExportClickHandler,
    };
    eventSource.on(event_types.OAI_PRESET_EXPORT_READY, exportHandler);
    eventSource.on(event_types.OAI_PRESET_IMPORT_READY, importHandler);
    document.addEventListener('click', genericExportClickHandler, true);
}

function removeRegexPresetGroupPortabilityHandlers() {
    const entry = extensionState[REGEX_PRESET_GROUP_PORTABILITY_HANDLER_KEY];

    if (!entry) {
        return;
    }

    eventSource.removeListener(event_types.OAI_PRESET_EXPORT_READY, entry.exportHandler);
    eventSource.removeListener(event_types.OAI_PRESET_IMPORT_READY, entry.importHandler);
    document.removeEventListener('click', entry.genericExportClickHandler, true);
    delete extensionState[REGEX_PRESET_GROUP_PORTABILITY_HANDLER_KEY];
}

function installRegexVueNativeRenderGuard() {
    const jquery = globalThis.jQuery;

    if (extensionState[REGEX_VUE_NATIVE_RENDER_GUARD_KEY] || typeof jquery?.fn !== 'object') {
        if (extensionState[REGEX_VUE_NATIVE_RENDER_GUARD_KEY]) {
            extensionState[REGEX_VUE_NATIVE_RENDER_GUARD_KEY].enabled = true;
        }
        return;
    }

    const originalEmpty = jquery.fn.empty;
    const originalAppend = jquery.fn.append;

    if (typeof originalEmpty !== 'function' || typeof originalAppend !== 'function') {
        console.warn(`${LOG_PREFIX} jQuery empty/append is unavailable; regex Vue native render guard was not installed`);
        return;
    }

    const guard = {
        enabled: true,
        originalEmpty,
        originalAppend,
        patchedEmpty: null,
        patchedAppend: null,
    };

    function patchedEmpty(...args) {
        if (guard.enabled && shouldBlockRegexVueNativeListMutation(this)) {
            return this;
        }

        return originalEmpty.apply(this, args);
    }

    function patchedAppend(...args) {
        if (guard.enabled && shouldBlockRegexVueNativeListMutation(this)) {
            return this;
        }

        return originalAppend.apply(this, args);
    }

    guard.patchedEmpty = patchedEmpty;
    guard.patchedAppend = patchedAppend;
    patchedEmpty.__baiBaiToolkitRegexVueNativeRenderGuard = true;
    patchedAppend.__baiBaiToolkitRegexVueNativeRenderGuard = true;
    patchedEmpty.__baiBaiToolkitOriginalEmpty = originalEmpty;
    patchedAppend.__baiBaiToolkitOriginalAppend = originalAppend;
    Object.assign(patchedEmpty, originalEmpty);
    Object.assign(patchedAppend, originalAppend);
    jquery.fn.empty = patchedEmpty;
    jquery.fn.append = patchedAppend;
    extensionState[REGEX_VUE_NATIVE_RENDER_GUARD_KEY] = guard;
}

function removeRegexVueNativeRenderGuard() {
    const guard = extensionState[REGEX_VUE_NATIVE_RENDER_GUARD_KEY];

    if (!guard) {
        return;
    }

    guard.enabled = false;

    if (globalThis.jQuery?.fn?.empty === guard.patchedEmpty) {
        globalThis.jQuery.fn.empty = guard.originalEmpty;
    }

    if (globalThis.jQuery?.fn?.append === guard.patchedAppend) {
        globalThis.jQuery.fn.append = guard.originalAppend;
    }

    if (globalThis.jQuery?.fn?.empty !== guard.patchedEmpty && globalThis.jQuery?.fn?.append !== guard.patchedAppend) {
        delete extensionState[REGEX_VUE_NATIVE_RENDER_GUARD_KEY];
    }
}

function shouldBlockRegexVueNativeListMutation(collection) {
    if (!settings.regexQuickOperationOptimizationEnabled || !isRegexVueManagerActive()) {
        return false;
    }

    return Array.from(collection ?? []).some(element => isRegexVueOwnedScriptListElement(element));
}

function isRegexVueOwnedScriptListElement(element) {
    return element instanceof HTMLElement
        && ['saved_regex_scripts', 'saved_scoped_scripts', 'saved_preset_scripts'].includes(element.id)
        && element.querySelector(':scope > .bai-bai-regex-vue-list');
}

function handleRegexVueManagerActionClick(event) {
    if (!settings.regexQuickOperationOptimizationEnabled || !isRegexVueManagerActive()) {
        return;
    }

    const target = event.target instanceof Element ? event.target : null;

    if (!target?.closest(REGEX_CONTAINER_SELECTOR)) {
        return;
    }

    const topAction = target.closest([
        '#open_regex_editor',
        '#open_scoped_editor',
        '#open_preset_editor',
        '#bulk_select_all_toggle',
        '#bulk_enable_regex',
        '#bulk_disable_regex',
        '#bulk_regex_move_to_global',
        '#bulk_regex_move_to_scoped',
        '#bulk_regex_move_to_preset',
        '#bulk_delete_regex',
        '#bulk_export_regex',
    ].join(', '));

    if (!(topAction instanceof HTMLElement)) {
        return;
    }

    preventRegexQuickOperationEvent(event);

    switch (topAction.id) {
        case 'open_regex_editor':
            void openOptimizedRegexEditorForType(REGEX_SCRIPT_TYPES.GLOBAL);
            break;
        case 'open_scoped_editor':
            void openOptimizedRegexEditorForType(REGEX_SCRIPT_TYPES.SCOPED);
            break;
        case 'open_preset_editor':
            void openOptimizedRegexEditorForType(REGEX_SCRIPT_TYPES.PRESET);
            break;
        case 'bulk_select_all_toggle':
            toggleRegexVueBulkSelection();
            break;
        case 'bulk_enable_regex':
            void bulkToggleRegexVueScripts(true);
            break;
        case 'bulk_disable_regex':
            void bulkToggleRegexVueScripts(false);
            break;
        case 'bulk_regex_move_to_global':
            void bulkMoveRegexVueScripts(REGEX_SCRIPT_TYPES.GLOBAL);
            break;
        case 'bulk_regex_move_to_scoped':
            void bulkMoveRegexVueScripts(REGEX_SCRIPT_TYPES.SCOPED);
            break;
        case 'bulk_regex_move_to_preset':
            void bulkMoveRegexVueScripts(REGEX_SCRIPT_TYPES.PRESET);
            break;
        case 'bulk_delete_regex':
            void bulkDeleteRegexVueScripts();
            break;
        case 'bulk_export_regex':
            exportRegexVueSelectedScripts();
            break;
        default:
            break;
    }
}

export {
    applyRegexQuickOperationOptimization,
    getRegexQuickOperationState,
    handleRegexVueManagerActionClick,
    handleRegexVuePresetRenamed,
    installRegexPendingChangesLifecycleGuard,
    installRegexPresetGroupPortabilityHandlers,
    installRegexQuickOperationMutationObserver,
    installRegexQuickOperationOptimization,
    installRegexVueManagerActionHandler,
    installRegexVueNativeRenderGuard,
    installRegexVuePresetRenameHandler,
    installRegexVueScopedContextHandler,
    isRegexVueOwnedScriptListElement,
    migratePendingRegexPresetSavesAfterRename,
    migrateRegexPresetAllowedAfterRename,
    migrateRegexPresetGroupScopeAfterRename,
    removeRegexPendingChangesLifecycleGuard,
    removeRegexPresetGroupPortabilityHandlers,
    removeRegexQuickOperationOptimization,
    removeRegexVueManagerActionHandler,
    removeRegexVueNativeRenderGuard,
    removeRegexVuePresetRenameHandler,
    removeRegexVueScopedContextHandler,
    shouldBlockRegexVueNativeListMutation,
};
