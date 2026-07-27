import { getRequestHeaders, saveSettings } from '@sillytavern/script';
import { t } from '@sillytavern/scripts/i18n';
import { oai_settings, openai_setting_names, openai_settings, promptManager, settingsToUpdate } from '@sillytavern/scripts/openai';
import { callGenericPopup, POPUP_TYPE } from '@sillytavern/scripts/popup';
import { getPresetManager } from '@sillytavern/scripts/preset-manager';
import { finishOpenAiPresetRenameSaveGateAfterFinalSave, flushPresetRenameBackup, getOpenAiPresetRenameSaveGate, getOpenAiPresetSaveStateName, isOpenAiPresetRenameSaveGateActive, isPresetRenameInProgress } from './autoBackup.js';
import { LEFT_NAV_PANEL_SELECTOR, OPENAI_PRESET_EXPORT_SELECTOR, OPENAI_PRESET_UPDATE_SELECTOR, PRESET_EXPORT_PENDING_CHANGES_HANDLER_KEY, PRESET_PENDING_CHANGES_FOCUSOUT_CHECK_DELAY_MS, PRESET_PENDING_CHANGES_LIFECYCLE_HANDLER_KEY, PRESET_PENDING_CHANGES_VISIBILITY_CHECK_DELAY_MS, PRESET_PENDING_CHANGES_VISIBILITY_FALLBACK_DELAY_MS, PRESET_UPDATE_PENDING_CHANGES_HANDLER_KEY } from './constants.js';
import { isPromptManagerReadyForCustomDrag } from './dragCustom.js';
import { applyPresetPromptGroupExtensionPayloadToMemory, getCurrentPresetPromptGroupExtensionPayload, getPresetPromptGroupRuntimePresetName, getPresetPromptGroupState, normalizePresetPromptGroupState, savePresetPromptGroupSettings } from './groupState.js';
import { triggerOpenAiPresetUpdateAndWait, waitForOpenAiPresetUpdateRequest } from './saveToggle.js';
import { LOG_PREFIX, extensionState, settings } from './state.js';
import { areStringArraysEqual } from './util.js';
import { getPresetVuePromptListManagerState } from './vueList.js';
import { getPresetVuePromptFlatIds, getPresetVuePromptItemsFromModel, sanitizePresetVuePromptListModel } from './vueModel.js';

function installPresetExportPendingChangesGuard() {
    if (extensionState[PRESET_EXPORT_PENDING_CHANGES_HANDLER_KEY]) {
        return;
    }

    const handler = event => {
        const target = event.target instanceof Element
            ? event.target.closest(OPENAI_PRESET_EXPORT_SELECTOR)
            : null;

        if (!(target instanceof HTMLElement)) {
            return;
        }

        if (extensionState.presetExportPendingChangesBypass) {
            extensionState.presetExportPendingChangesBypass = false;
            return;
        }

        if (!hasPendingPresetPromptChanges()) {
            return;
        }

        event.preventDefault();
        event.stopImmediatePropagation();

        void confirmSavePendingPresetChangesBeforeExport(target);
    };

    extensionState[PRESET_EXPORT_PENDING_CHANGES_HANDLER_KEY] = handler;
    document.addEventListener('click', handler, true);
}

function installPresetUpdatePendingChangesGuard() {
    if (extensionState[PRESET_UPDATE_PENDING_CHANGES_HANDLER_KEY]) {
        return;
    }

    const handler = event => {
        const target = event.target instanceof Element
            ? event.target.closest(OPENAI_PRESET_UPDATE_SELECTOR)
            : null;

        if (!(target instanceof HTMLElement)) {
            return;
        }

        // 重命名收尾:ST 的 jQuery update 处理器已经发出最终保存。拦掉随后触发的原生
        // re-click,等待该保存和内存缓存更新完成后再释放重命名期间积压的插件保存。
        if (isOpenAiPresetRenameSaveGateActive() || isPresetRenameInProgress()) {
            event.preventDefault();
            event.stopImmediatePropagation();
            flushPresetRenameBackup();

            if (isOpenAiPresetRenameSaveGateActive()) {
                void finishOpenAiPresetRenameSaveGateAfterFinalSave();
            } else {
                clearPendingPresetPromptChangesForPreset(oai_settings?.preset_settings_openai);
            }

            return;
        }

        if (!hasPendingPresetPromptChanges()) {
            void saveSettingsAfterOpenAiPresetUpdate(oai_settings?.preset_settings_openai);
            return;
        }

        event.preventDefault();
        event.stopImmediatePropagation();

        void saveOpenAiPresetAfterPendingRuntimeCommit();
    };

    extensionState[PRESET_UPDATE_PENDING_CHANGES_HANDLER_KEY] = handler;
    document.addEventListener('click', handler, true);
}

async function saveOpenAiPresetAfterPendingRuntimeCommit() {
    const currentPresetName = oai_settings?.preset_settings_openai;
    if (!currentPresetName) {
        return;
    }

    const saveState = getOpenAiPresetSaveRequestState(currentPresetName);
    const requestedRevision = getPresetPromptSaveRevision(currentPresetName);
    syncOpenAiPromptManagerStateToSettings();
    saveState.requestedRevision = Math.max(saveState.requestedRevision ?? -1, requestedRevision);
    saveState.requestedSnapshot = getChatCompletionPresetFromSettings(oai_settings);

    if (saveState.promise) {
        await saveState.promise.catch(() => {});

        if (saveState.promise || saveState.requestedRevision === null) {
            return;
        }
    }

    const savePromise = runOpenAiPresetSaveRequestQueue(saveState);
    saveState.promise = savePromise;

    try {
        await savePromise;
    } catch (error) {
        if (hasAutoFlushPendingPresetPromptChanges()) {
            schedulePendingPresetPromptChangesFlushCheck();
        }
        console.debug(`${LOG_PREFIX} Failed to save pending preset prompt changes`, error);
        toastr.error(t`Failed to save preset prompt changes. See console for details.`);
    } finally {
        if (saveState.promise === savePromise) {
            saveState.promise = null;
        }

        if (!saveState.promise && saveState.requestedRevision === null && saveState.requestedSnapshot === null) {
            const states = getOpenAiPresetSaveRequestStates();

            for (const [presetName, state] of states.entries()) {
                if (state === saveState) {
                    states.delete(presetName);
                }
            }
        }
    }
}

async function runOpenAiPresetSaveRequestQueue(saveState) {
    let saved = false;

    while (saveState.requestedRevision !== null) {
        const requestedRevision = saveState.requestedRevision;
        const requestedSnapshot = saveState.requestedSnapshot;
        saveState.requestedRevision = null;
        saveState.requestedSnapshot = null;

        let presetName = saveState.presetName;
        await commitPendingPresetPromptChangesToRuntime(presetName);
        presetName = saveState.presetName;

        let savedRevision = requestedRevision;
        let presetSnapshot = requestedSnapshot;

        if (oai_settings?.preset_settings_openai === presetName) {
            syncOpenAiPromptManagerStateToSettings();
            savedRevision = getPresetPromptSaveRevision(presetName);
            presetSnapshot = getChatCompletionPresetFromSettings(oai_settings);
        }

        if (!presetSnapshot) {
            throw new Error(`Unable to capture OpenAI preset snapshot for ${presetName}`);
        }

        await saveOpenAiPresetSnapshot(presetName, presetSnapshot, { revision: savedRevision });
        clearPendingPresetPromptChangesForSavedRevision(saveState.presetName, savedRevision);

        if (saveState.requestedRevision !== null && saveState.requestedRevision <= savedRevision) {
            saveState.requestedRevision = null;
            saveState.requestedSnapshot = null;
        }

        await saveSettings();
        saved = true;
    }

    if (saved) {
        toastr.success(t`Preset updated`);
    }
}

async function saveSettingsAfterOpenAiPresetUpdate(
    presetName = oai_settings?.preset_settings_openai,
    waitForSave = waitForOpenAiPresetUpdateRequest(presetName),
) {
    try {
        await waitForSave;
        syncCurrentOpenAiPresetCacheFromSettings(presetName);
        await saveSettings();
    } catch (error) {
        console.debug(`${LOG_PREFIX} Failed to save settings after preset save`, error);
    }
}

function syncOpenAiPromptManagerStateToSettings() {
    const serviceSettings = promptManager?.serviceSettings;

    if (!serviceSettings || serviceSettings === oai_settings) {
        return false;
    }

    let changed = false;

    if (Array.isArray(serviceSettings.prompts)) {
        oai_settings.prompts = serviceSettings.prompts;
        changed = true;
    }

    if (Array.isArray(serviceSettings.prompt_order)) {
        oai_settings.prompt_order = serviceSettings.prompt_order;
        changed = true;
    }

    if (serviceSettings.extensions && typeof serviceSettings.extensions === 'object') {
        oai_settings.extensions = serviceSettings.extensions;
        changed = true;
    }

    return changed;
}

function getChatCompletionPresetFromSettings(settings = oai_settings) {
    const presetBody = {};

    for (const [presetKey, [, settingsKey]] of Object.entries(settingsToUpdate ?? {})) {
        presetBody[presetKey] = settings?.[settingsKey];
    }

    return structuredClone(presetBody);
}

function saveOpenAiPresetSnapshot(presetName, presetSnapshot, { revision = null } = {}) {
    const renameGate = getOpenAiPresetRenameSaveGate();

    if (renameGate && (presetName === renameGate.oldName || presetName === renameGate.newName)) {
        const deferredSave = renameGate.deferredSaveTail
            .catch(() => {})
            .then(async () => {
                const resolvedPresetName = await renameGate.completionPromise;

                if (
                    Number.isFinite(revision)
                    && Number.isFinite(renameGate.finalSavedRevision)
                    && revision <= renameGate.finalSavedRevision
                ) {
                    return;
                }

                await performOpenAiPresetSnapshotSave(resolvedPresetName, presetSnapshot);
            });
        renameGate.deferredSaveTail = deferredSave;
        return deferredSave;
    }

    return performOpenAiPresetSnapshotSave(presetName, presetSnapshot);
}

async function performOpenAiPresetSnapshotSave(presetName, presetSnapshot) {
    const presetManager = getPresetManager('openai');

    if (presetManager && typeof presetManager.savePreset === 'function') {
        await presetManager.savePreset(presetName, presetSnapshot, { skipUpdate: true });
    } else {
        const response = await fetch('/api/presets/save', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({
                apiId: 'openai',
                name: presetName,
                preset: presetSnapshot,
            }),
        });

        if (!response.ok) {
            throw new Error('OpenAI preset update request failed');
        }
    }

    syncOpenAiPresetCacheFromSnapshot(presetName, presetSnapshot);
}

function syncOpenAiPresetCacheFromSnapshot(presetName, presetSnapshot) {
    if (!presetName || !presetSnapshot || !Array.isArray(openai_settings)) {
        return false;
    }

    const value = openai_setting_names?.[presetName];

    if (value === undefined || value === null) {
        return false;
    }

    if (openai_settings[value] && typeof openai_settings[value] === 'object') {
        Object.assign(openai_settings[value], presetSnapshot);
    } else {
        openai_settings[value] = presetSnapshot;
    }

    return true;
}

function syncCurrentOpenAiPresetCacheFromSettings(presetName = oai_settings?.preset_settings_openai) {
    syncOpenAiPromptManagerStateToSettings();
    const preset = getChatCompletionPresetFromSettings(oai_settings);
    return syncOpenAiPresetCacheFromSnapshot(presetName, preset);
}

async function confirmSavePendingPresetChangesBeforeExport(exportButton) {
    if (extensionState.presetExportPendingChangesPromptOpen) {
        return;
    }

    extensionState.presetExportPendingChangesPromptOpen = true;

    try {
        const confirmed = await callGenericPopup(t`当前预设有未保存的更改。要先保存后再导出吗？`, POPUP_TYPE.CONFIRM);

        if (!confirmed) {
            return;
        }

        await flushPendingPresetPromptChanges({ includeOpenAiPresetSaves: true });

        extensionState.presetExportPendingChangesBypass = true;
        exportButton.click();
    } catch (error) {
        console.debug(`${LOG_PREFIX} Failed to save pending preset changes before export`, error);
        toastr.error(t`Failed to save preset changes before export. See console for details.`);
    } finally {
        extensionState.presetExportPendingChangesPromptOpen = false;
    }
}

function schedulePresetVuePromptOrderSaveAfterDrop() {
    const manager = getPresetVuePromptListManagerState();
    clearPresetVuePromptOrderSaveSchedule(manager);
    void Promise.resolve(savePresetVuePromptOrderFromModel())
        .catch(error => {
            manager.pendingOrderSave = true;
            markPresetPromptChangesSavePending();
            console.debug(`${LOG_PREFIX} Failed to sync preset prompt order after drop`, error);
        });
}

function clearPresetVuePromptOrderSaveSchedule(manager = getPresetVuePromptListManagerState()) {
    if (manager.saveFrame !== null && typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(manager.saveFrame);
    }

    if (manager.saveTimer !== null) {
        clearTimeout(manager.saveTimer);
    }

    manager.saveFrame = null;
    manager.saveTimer = null;
    manager.pendingOrderSave = false;
}

async function flushScheduledPresetVuePromptOrderSave() {
    const manager = getPresetVuePromptListManagerState();

    if (!hasScheduledPresetVuePromptOrderSave(manager)) {
        return false;
    }

    clearPresetVuePromptOrderSaveSchedule(manager);
    try {
        await savePresetVuePromptOrderFromModel();
        return true;
    } catch (error) {
        manager.pendingOrderSave = true;
        throw error;
    }
}

function hasScheduledPresetVuePromptOrderSave(manager = getPresetVuePromptListManagerState()) {
    return Boolean(manager.pendingOrderSave || manager.saveFrame !== null || manager.saveTimer !== null);
}

function getPendingPresetPromptServiceSaves(manager = getPresetVuePromptListManagerState()) {
    if (!(manager.pendingPresetPromptServiceSaves instanceof Map)) {
        manager.pendingPresetPromptServiceSaves = new Map();
    }

    return manager.pendingPresetPromptServiceSaves;
}

function getPendingPresetPromptGroupSaves(manager = getPresetVuePromptListManagerState()) {
    if (!(manager.pendingPresetPromptGroupSaves instanceof Map)) {
        manager.pendingPresetPromptGroupSaves = new Map();
    }

    return manager.pendingPresetPromptGroupSaves;
}

function getPendingOpenAiPresetSaves(manager = getPresetVuePromptListManagerState()) {
    if (!(manager.pendingOpenAiPresetSaves instanceof Set)) {
        manager.pendingOpenAiPresetSaves = new Set();
    }

    return manager.pendingOpenAiPresetSaves;
}

function getPresetPromptSaveRevisions(manager = getPresetVuePromptListManagerState()) {
    if (!(manager.presetPromptSaveRevisions instanceof Map)) {
        manager.presetPromptSaveRevisions = new Map();
    }

    return manager.presetPromptSaveRevisions;
}

function getPresetPromptSaveRevision(presetName, manager = getPresetVuePromptListManagerState()) {
    if (!presetName) {
        return 0;
    }

    return getPresetPromptSaveRevisions(manager).get(presetName) ?? 0;
}

function markPresetPromptSaveRevisionChanged(presetName, manager = getPresetVuePromptListManagerState()) {
    if (!presetName) {
        return 0;
    }

    manager.nextPresetPromptSaveRevision = Number(manager.nextPresetPromptSaveRevision) || 0;
    manager.nextPresetPromptSaveRevision += 1;
    getPresetPromptSaveRevisions(manager).set(presetName, manager.nextPresetPromptSaveRevision);
    return manager.nextPresetPromptSaveRevision;
}

function getOpenAiPresetSaveRequestStates(manager = getPresetVuePromptListManagerState()) {
    if (!(manager.openAiPresetSaveRequestStates instanceof Map)) {
        manager.openAiPresetSaveRequestStates = new Map();
    }

    return manager.openAiPresetSaveRequestStates;
}

function getOpenAiPresetSaveRequestState(presetName, manager = getPresetVuePromptListManagerState()) {
    const states = getOpenAiPresetSaveRequestStates(manager);
    presetName = getOpenAiPresetSaveStateName(presetName);

    if (!states.has(presetName)) {
        states.set(presetName, {
            presetName,
            requestedRevision: null,
            requestedSnapshot: null,
            promise: null,
        });
    }

    const state = states.get(presetName);
    state.presetName = presetName;
    return state;
}

function markOpenAiPresetSavePending(presetName = oai_settings?.preset_settings_openai) {
    if (!presetName) {
        return;
    }

    markPresetPromptSaveRevisionChanged(presetName);
    getPendingOpenAiPresetSaves().add(presetName);
}

function markPresetPromptServiceSettingsSavePending() {
    const manager = getPresetVuePromptListManagerState();
    const entry = createPendingPresetPromptServiceSaveEntry();

    if (!entry) {
        return;
    }

    markPresetPromptSaveRevisionChanged(entry.presetName, manager);
    getPendingPresetPromptServiceSaves(manager).set(entry.presetName, entry);
    manager.pendingServiceSettingsSave = true;
    markPresetPromptChangesSavePending();
}

function createPendingPresetPromptServiceSaveEntry() {
    const presetName = getPresetPromptGroupRuntimePresetName();
    const promptOrder = promptManager?.serviceSettings?.prompt_order ?? oai_settings?.prompt_order;

    if (!presetName || !promptOrder) {
        return null;
    }

    return {
        presetName,
        promptOrder: structuredClone(promptOrder),
    };
}

function markPresetPromptGroupSettingsSavePending(payload = null) {
    const manager = getPresetVuePromptListManagerState();
    payload ||= getCurrentPresetPromptGroupExtensionPayload();

    if (!payload) {
        return;
    }

    markPresetPromptSaveRevisionChanged(payload.presetName, manager);
    getPendingPresetPromptGroupSaves(manager).set(payload.presetName, {
        presetName: payload.presetName,
        groupState: structuredClone(payload.groupState),
        syncKey: payload.syncKey,
    });
    manager.pendingGroupSettingsSave = true;
    markPresetPromptChangesSavePending();
}

function markPresetPromptChangesSavePending() {
    installPresetPendingChangesLifecycleGuard();
    schedulePendingPresetPromptChangesFlushCheck(0);
}

function hasPendingPresetPromptChanges() {
    const manager = getPresetVuePromptListManagerState();
    return Boolean(
        hasAutoFlushPendingPresetPromptChanges(manager)
        || getPendingOpenAiPresetSaves(manager).size > 0,
    );
}

function hasAutoFlushPendingPresetPromptChanges(manager = getPresetVuePromptListManagerState()) {
    return Boolean(
        hasScheduledPresetVuePromptOrderSave(manager)
        || manager.pendingServiceSettingsSave
        || manager.pendingGroupSettingsSave
        || getPendingPresetPromptServiceSaves(manager).size > 0
        || getPendingPresetPromptGroupSaves(manager).size > 0,
    );
}

function clearPendingPresetPromptChanges() {
    const manager = getPresetVuePromptListManagerState();
    clearPresetVuePromptOrderSaveSchedule(manager);
    manager.pendingServiceSettingsSave = false;
    manager.pendingGroupSettingsSave = false;
    getPendingPresetPromptServiceSaves(manager).clear();
    getPendingPresetPromptGroupSaves(manager).clear();
    getPendingOpenAiPresetSaves(manager).clear();
    removePresetPromptManagerVisibilityWatch();
}

function clearPendingPresetPromptChangesForPreset(presetName) {
    if (!presetName) {
        clearPendingPresetPromptChanges();
        return;
    }

    const manager = getPresetVuePromptListManagerState();
    clearPresetVuePromptOrderSaveSchedule(manager);

    const pendingServiceSaves = getPendingPresetPromptServiceSaves(manager);
    const pendingGroupSaves = getPendingPresetPromptGroupSaves(manager);
    const pendingPresetSaves = getPendingOpenAiPresetSaves(manager);
    const groupEntry = pendingGroupSaves.get(presetName);

    pendingServiceSaves.delete(presetName);
    pendingGroupSaves.delete(presetName);
    pendingPresetSaves.delete(presetName);

    if (groupEntry?.syncKey && oai_settings?.preset_settings_openai === presetName) {
        extensionState.presetPromptGroupExtensionSyncKey = groupEntry.syncKey;
    }

    manager.pendingServiceSettingsSave = pendingServiceSaves.size > 0;
    manager.pendingGroupSettingsSave = pendingGroupSaves.size > 0;

    if (hasAutoFlushPendingPresetPromptChanges()) {
        schedulePendingPresetPromptChangesFlushCheck();
    } else {
        removePresetPromptManagerVisibilityWatch();
    }
}

function clearPendingPresetPromptChangesForSavedRevision(presetName, savedRevision) {
    if (!presetName || getPresetPromptSaveRevision(presetName) !== savedRevision) {
        return false;
    }

    const manager = getPresetVuePromptListManagerState();
    const pendingServiceSaves = getPendingPresetPromptServiceSaves(manager);
    const pendingGroupSaves = getPendingPresetPromptGroupSaves(manager);
    const pendingPresetSaves = getPendingOpenAiPresetSaves(manager);
    const groupEntry = pendingGroupSaves.get(presetName);

    pendingServiceSaves.delete(presetName);
    pendingGroupSaves.delete(presetName);
    pendingPresetSaves.delete(presetName);

    if (groupEntry?.syncKey && oai_settings?.preset_settings_openai === presetName) {
        extensionState.presetPromptGroupExtensionSyncKey = groupEntry.syncKey;
    }

    manager.pendingServiceSettingsSave = pendingServiceSaves.size > 0;
    manager.pendingGroupSettingsSave = pendingGroupSaves.size > 0;

    if (hasAutoFlushPendingPresetPromptChanges()) {
        schedulePendingPresetPromptChangesFlushCheck();
    } else {
        removePresetPromptManagerVisibilityWatch();
    }

    return true;
}

async function commitPendingPresetPromptChangesToRuntime(presetName = oai_settings?.preset_settings_openai) {
    const manager = getPresetVuePromptListManagerState();

    if (manager.pendingChangesSavePromise) {
        await manager.pendingChangesSavePromise;
    }

    await flushScheduledPresetVuePromptOrderSave();

    if (!presetName) {
        return;
    }

    applyPendingPresetPromptServiceSaveToMemory(getPendingPresetPromptServiceSaves(manager).get(presetName));
    applyPendingPresetPromptGroupSaveToMemory(getPendingPresetPromptGroupSaves(manager).get(presetName));
}

function applyPendingPresetPromptServiceSaveToMemory(entry) {
    if (!entry?.presetName || !entry.promptOrder) {
        return false;
    }

    const promptOrder = structuredClone(entry.promptOrder);

    if (oai_settings?.preset_settings_openai === entry.presetName) {
        oai_settings.prompt_order = promptOrder;
        if (promptManager) {
            promptManager.serviceSettings = oai_settings;
        }
    }

    return true;
}

function applyPendingPresetPromptGroupSaveToMemory(entry) {
    if (!entry?.presetName || !entry.groupState) {
        return false;
    }

    applyPresetPromptGroupExtensionPayloadToMemory({
        presetName: entry.presetName,
        groupState: structuredClone(entry.groupState),
        syncKey: entry.syncKey || `${entry.presetName}:${JSON.stringify(entry.groupState)}`,
    });

    return true;
}

function installPresetPendingChangesLifecycleGuard() {
    if (extensionState[PRESET_PENDING_CHANGES_LIFECYCLE_HANDLER_KEY]) {
        return;
    }

    const beforeUnloadHandler = (event) => {
        const manager = getPresetVuePromptListManagerState();

        if (!hasAutoFlushPendingPresetPromptChanges(manager) && !manager.pendingChangesSaveInFlight && !manager.pendingChangesSavePromise) {
            return;
        }

        void flushPendingPresetPromptChanges({ includeOpenAiPresetSaves: false }).catch(error => {
            console.debug(`${LOG_PREFIX} Failed to flush preset prompt changes before unload`, error);
        });
        event.preventDefault();
        event.returnValue = '';
        return '';
    };

    const pageLifecycleHandler = (event) => {
        if (event?.type === 'visibilitychange' && document.visibilityState !== 'hidden') {
            return;
        }

        if (!hasAutoFlushPendingPresetPromptChanges()) {
            return;
        }

        void flushPendingPresetPromptChanges({ includeOpenAiPresetSaves: false }).catch(error => {
            console.debug(`${LOG_PREFIX} Failed to flush preset prompt changes during page lifecycle event`, error);
        });
    };
    let lastLeftNavPointerDownAt = 0;
    const leftNavPointerDownHandler = (event) => {
        if (isNodeInsideLeftNavPanel(event.target)) {
            lastLeftNavPointerDownAt = Date.now();
        } else {
            lastLeftNavPointerDownAt = 0;
        }
    };
    const leftNavFocusOutHandler = (event) => {
        if (!hasAutoFlushPendingPresetPromptChanges() || !isNodeInsideLeftNavPanel(event.target)) {
            return;
        }

        if (isNodeInsideLeftNavPanel(event.relatedTarget)) {
            return;
        }

        setTimeout(() => {
            if (!hasAutoFlushPendingPresetPromptChanges()) {
                return;
            }

            if (isFocusInsideLeftNavPanel()) {
                return;
            }

            if (lastLeftNavPointerDownAt && Date.now() - lastLeftNavPointerDownAt < 300) {
                return;
            }

            void flushPendingPresetPromptChanges({ includeOpenAiPresetSaves: false }).catch(error => {
                console.debug(`${LOG_PREFIX} Failed to flush preset prompt changes after left panel focusout`, error);
            });
        }, PRESET_PENDING_CHANGES_FOCUSOUT_CHECK_DELAY_MS);
    };

    extensionState[PRESET_PENDING_CHANGES_LIFECYCLE_HANDLER_KEY] = {
        beforeUnloadHandler,
        pageLifecycleHandler,
        leftNavPointerDownHandler,
        leftNavFocusOutHandler,
    };

    window.addEventListener('beforeunload', beforeUnloadHandler);
    window.addEventListener('pagehide', pageLifecycleHandler);
    document.addEventListener('visibilitychange', pageLifecycleHandler);
    document.addEventListener('pointerdown', leftNavPointerDownHandler, true);
    document.addEventListener('focusout', leftNavFocusOutHandler, true);
}

function schedulePendingPresetPromptChangesFlushCheck(delayMs = PRESET_PENDING_CHANGES_VISIBILITY_CHECK_DELAY_MS) {
    const manager = getPresetVuePromptListManagerState();
    installPresetPromptManagerVisibilityObserver();
    clearTimeout(manager.pendingVisibilityTimer);
    manager.pendingVisibilityTimer = setTimeout(() => {
        manager.pendingVisibilityTimer = null;
        checkPendingPresetPromptChangesFlush();
    }, delayMs);
}

function installPresetPromptManagerVisibilityObserver() {
    const manager = getPresetVuePromptListManagerState();

    if (manager.pendingVisibilityObserver || typeof MutationObserver !== 'function') {
        return;
    }

    const observer = new MutationObserver(() => {
        schedulePendingPresetPromptChangesFlushCheck();
    });

    manager.pendingVisibilityObserver = observer;

    for (const target of getPresetPromptManagerVisibilityTargets()) {
        observer.observe(target, {
            attributes: true,
            attributeFilter: ['class', 'style', 'hidden', 'aria-hidden'],
        });
    }
}

function removePresetPromptManagerVisibilityWatch() {
    const manager = getPresetVuePromptListManagerState();
    clearTimeout(manager.pendingVisibilityTimer);
    manager.pendingVisibilityTimer = null;

    if (manager.pendingVisibilityObserver) {
        manager.pendingVisibilityObserver.disconnect();
        manager.pendingVisibilityObserver = null;
    }
}

function getPresetPromptManagerVisibilityTargets() {
    const targets = [];
    const seen = new Set();
    const add = element => {
        if (element instanceof HTMLElement && !seen.has(element)) {
            seen.add(element);
            targets.push(element);
        }
    };
    const container = promptManager?.containerElement instanceof HTMLElement
        ? promptManager.containerElement
        : document.querySelector('#completion_prompt_manager');

    add(container);

    if (container instanceof HTMLElement) {
        for (let element = container.parentElement; element && element !== document.body; element = element.parentElement) {
            add(element);
        }
    }

    return targets;
}

function checkPendingPresetPromptChangesFlush() {
    if (!hasAutoFlushPendingPresetPromptChanges()) {
        removePresetPromptManagerVisibilityWatch();
        return;
    }

    if (!isPresetPromptManagerVisible()) {
        flushPendingPresetPromptChangesSafely();
        return;
    }

    schedulePendingPresetPromptChangesFlushCheck(PRESET_PENDING_CHANGES_VISIBILITY_FALLBACK_DELAY_MS);
}

function isPresetPromptManagerVisible() {
    const container = promptManager?.containerElement instanceof HTMLElement
        ? promptManager.containerElement
        : document.querySelector('#completion_prompt_manager');

    return isPresetVisibilityElementVisible(container);
}

function isPresetVisibilityElementVisible(element) {
    if (!(element instanceof HTMLElement) || !element.isConnected || element.getClientRects().length === 0) {
        return false;
    }

    const style = getComputedStyle(element);
    return style.display !== 'none' && style.visibility !== 'hidden';
}

function getLeftNavPanelElement() {
    return document.querySelector(LEFT_NAV_PANEL_SELECTOR);
}

function isNodeInsideLeftNavPanel(node) {
    const leftNavPanel = getLeftNavPanelElement();
    return Boolean(leftNavPanel instanceof HTMLElement && node instanceof Node && leftNavPanel.contains(node));
}

function isFocusInsideLeftNavPanel() {
    return isNodeInsideLeftNavPanel(document.activeElement);
}

function flushPendingPresetPromptChangesSafely() {
    void flushPendingPresetPromptChanges({ includeOpenAiPresetSaves: false }).catch(error => {
        console.debug(`${LOG_PREFIX} Failed to flush preset prompt changes`, error);
        toastr.error(t`Failed to save preset prompt changes. See console for details.`);
    });
}

async function flushPendingPresetPromptChanges({ includeOpenAiPresetSaves = false } = {}) {
    const manager = getPresetVuePromptListManagerState();

    if (manager.pendingChangesSavePromise) {
        return manager.pendingChangesSavePromise;
    }

    await flushScheduledPresetVuePromptOrderSave();

    const pendingServiceSaves = Array.from(getPendingPresetPromptServiceSaves(manager).values());
    const pendingGroupSaves = Array.from(getPendingPresetPromptGroupSaves(manager).values());
    const pendingPresetSaves = includeOpenAiPresetSaves
        ? Array.from(getPendingOpenAiPresetSaves(manager).values())
        : [];
    const shouldSaveServiceSettings = pendingServiceSaves.length > 0 || Boolean(manager.pendingServiceSettingsSave);
    const shouldSaveGroups = pendingGroupSaves.length > 0 || Boolean(manager.pendingGroupSettingsSave);
    const shouldSavePreset = pendingPresetSaves.length > 0;

    if (!shouldSaveServiceSettings && !shouldSaveGroups && !shouldSavePreset) {
        removePresetPromptManagerVisibilityWatch();
        return;
    }

    manager.pendingChangesSaveInFlight = true;
    const savePromise = (async () => {
        try {
            manager.pendingServiceSettingsSave = false;
            manager.pendingGroupSettingsSave = false;
            manager.pendingPresetPromptServiceSaves = new Map();
            manager.pendingPresetPromptGroupSaves = new Map();
            if (includeOpenAiPresetSaves) {
                manager.pendingOpenAiPresetSaves = new Set();
            }

            const presetNamesNeedingPresetSave = new Set(pendingPresetSaves);
            let shouldSaveSettingsOnly = false;

            for (const entry of pendingServiceSaves) {
                if (applyPendingPresetPromptServiceSaveToMemory(entry)) {
                    presetNamesNeedingPresetSave.add(entry.presetName);
                    shouldSaveSettingsOnly = true;
                }
            }

            for (const entry of pendingGroupSaves) {
                if (applyPendingPresetPromptGroupSaveToMemory(entry)) {
                    presetNamesNeedingPresetSave.add(entry.presetName);
                    shouldSaveSettingsOnly = true;
                }
            }

            if ((shouldSaveServiceSettings || shouldSaveGroups) && !presetNamesNeedingPresetSave.size) {
                presetNamesNeedingPresetSave.add(oai_settings?.preset_settings_openai);
                shouldSaveSettingsOnly = true;
            }

            if (includeOpenAiPresetSaves) {
                for (const presetName of presetNamesNeedingPresetSave) {
                    await flushPendingOpenAiPresetSave(presetName);
                }
            } else if (shouldSaveSettingsOnly) {
                for (const presetName of presetNamesNeedingPresetSave) {
                    if (presetName) {
                        getPendingOpenAiPresetSaves(manager).add(presetName);
                    }
                }

                await saveSettings();
            }
        } catch (error) {
            manager.pendingServiceSettingsSave = manager.pendingServiceSettingsSave || shouldSaveServiceSettings;
            manager.pendingGroupSettingsSave = manager.pendingGroupSettingsSave || shouldSaveGroups;

            for (const entry of pendingServiceSaves) {
                getPendingPresetPromptServiceSaves(manager).set(entry.presetName, entry);
            }

            for (const entry of pendingGroupSaves) {
                getPendingPresetPromptGroupSaves(manager).set(entry.presetName, entry);
            }

            if (includeOpenAiPresetSaves) {
                for (const presetName of pendingPresetSaves) {
                    getPendingOpenAiPresetSaves(manager).add(presetName);
                }
            }

            throw error;
        } finally {
            manager.pendingChangesSaveInFlight = false;
        }
    })();

    manager.pendingChangesSavePromise = savePromise;

    try {
        await savePromise;
    } finally {
        if (manager.pendingChangesSavePromise === savePromise) {
            manager.pendingChangesSavePromise = null;
        }

        if (hasAutoFlushPendingPresetPromptChanges()) {
            schedulePendingPresetPromptChangesFlushCheck();
        } else {
            removePresetPromptManagerVisibilityWatch();
        }
    }
}

async function flushPendingOpenAiPresetSave(presetName) {
    if (!presetName || oai_settings?.preset_settings_openai !== presetName) {
        return;
    }

    await triggerOpenAiPresetUpdateAndWait(presetName);
    await saveSettings();
}

async function flushPendingPresetPromptServiceSave(entry) {
    if (!applyPendingPresetPromptServiceSaveToMemory(entry)) {
        return;
    }

    markOpenAiPresetSavePending(entry.presetName);
    await saveSettings();
}

async function flushPendingPresetPromptGroupSave(entry) {
    if (!applyPendingPresetPromptGroupSaveToMemory(entry)) {
        return;
    }

    markOpenAiPresetSavePending(entry.presetName);
    await saveSettings();
}

async function savePresetVuePromptOrderFromModel() {
    if (!isPromptManagerReadyForCustomDrag()) {
        return;
    }

    const manager = getPresetVuePromptListManagerState();
    if (!manager.state) {
        return;
    }

    sanitizePresetVuePromptListModel(manager.state);
    const promptOrder = promptManager.getPromptOrderForCharacter(promptManager.activeCharacter) ?? [];
    const beforeOrder = promptOrder.map(entry => entry?.identifier).filter(Boolean);
    const nextAssignments = getPresetVuePromptGroupAssignmentsFromModel(manager.state);
    const afterOrder = getPresetVuePromptFlatIds(manager.state);

    if (areStringArraysEqual(beforeOrder, afterOrder)) {
        savePresetVuePromptGroupAssignments(nextAssignments);
        return;
    }

    const idToObjectMap = new Map(promptOrder.filter(Boolean).map(entry => [entry.identifier, entry]));
    const updatedPromptOrder = afterOrder
        .map(identifier => idToObjectMap.get(identifier))
        .filter(Boolean);

    promptManager.removePromptOrderForCharacter(promptManager.activeCharacter);
    promptManager.addPromptOrderForCharacter(promptManager.activeCharacter, updatedPromptOrder);
    promptManager.log?.(`Prompt order updated for ${promptManager.activeCharacter?.name ?? 'OpenAI preset'}.`);
    savePresetVuePromptGroupAssignments(nextAssignments, { persist: false });
    markPresetPromptServiceSettingsSavePending();
    savePresetPromptGroupSettings();
}

function getPresetVuePromptGroupAssignmentsFromModel(model) {
    const assignments = {};

    for (const item of model?.items ?? []) {
        if (item?.type === 'group') {
            for (const child of item.children ?? []) {
                if (child?.type === 'prompt' && !Object.prototype.hasOwnProperty.call(assignments, child.id)) {
                    assignments[child.id] = item.groupId;
                }
            }
            continue;
        }

        if (item?.type === 'prompt' && !Object.prototype.hasOwnProperty.call(assignments, item.id)) {
            assignments[item.id] = null;
        }
    }

    return assignments;
}

function savePresetVuePromptGroupAssignments(assignments, { persist = true } = {}) {
    const groupState = getPresetPromptGroupState();
    const validPromptIds = new Set(getPresetVuePromptFlatIds());
    normalizePresetPromptGroupState(groupState, validPromptIds);
    const validGroupIds = new Set(groupState.groups.map(group => group.id));
    const nextPrompts = {};
    const usedGroupIds = new Set();

    for (const promptId of validPromptIds) {
        const groupId = assignments?.[promptId];

        if (!groupId || !validGroupIds.has(groupId)) {
            continue;
        }

        nextPrompts[promptId] = { groupId };
        usedGroupIds.add(groupId);
    }

    groupState.prompts = nextPrompts;
    groupState.groups = groupState.groups.filter(group => usedGroupIds.has(group.id));
    normalizePresetPromptGroupState(groupState, validPromptIds);

    if (persist) {
        savePresetPromptGroupSettings();
    }
}

function removeUnusedPresetPromptGroups(groupState) {
    const usedGroupIds = new Set(
        Object.values(groupState.prompts ?? {})
            .map(meta => meta?.groupId)
            .filter(Boolean),
    );

    groupState.groups = groupState.groups.filter(group => usedGroupIds.has(group.id));
}

function updatePresetVuePromptItemEnabled(promptId, enabled) {
    const manager = getPresetVuePromptListManagerState();
    const items = getPresetVuePromptItemsFromModel(manager.state, { includeFavoriteMirrors: true })
        .filter(item => item?.id === promptId);

    if (!items.length) {
        return false;
    }

    for (const item of items) {
        item.enabled = Boolean(enabled);

        if (item.orderEntry) {
            item.orderEntry.enabled = Boolean(enabled);
        }
    }

    return true;
}

export {
    applyPendingPresetPromptGroupSaveToMemory,
    applyPendingPresetPromptServiceSaveToMemory,
    checkPendingPresetPromptChangesFlush,
    clearPendingPresetPromptChanges,
    clearPendingPresetPromptChangesForPreset,
    clearPendingPresetPromptChangesForSavedRevision,
    clearPresetVuePromptOrderSaveSchedule,
    commitPendingPresetPromptChangesToRuntime,
    confirmSavePendingPresetChangesBeforeExport,
    createPendingPresetPromptServiceSaveEntry,
    flushPendingOpenAiPresetSave,
    flushPendingPresetPromptChanges,
    flushPendingPresetPromptChangesSafely,
    flushPendingPresetPromptGroupSave,
    flushPendingPresetPromptServiceSave,
    flushScheduledPresetVuePromptOrderSave,
    getChatCompletionPresetFromSettings,
    getLeftNavPanelElement,
    getOpenAiPresetSaveRequestState,
    getOpenAiPresetSaveRequestStates,
    getPendingOpenAiPresetSaves,
    getPendingPresetPromptGroupSaves,
    getPendingPresetPromptServiceSaves,
    getPresetPromptManagerVisibilityTargets,
    getPresetPromptSaveRevision,
    getPresetPromptSaveRevisions,
    getPresetVuePromptGroupAssignmentsFromModel,
    hasAutoFlushPendingPresetPromptChanges,
    hasPendingPresetPromptChanges,
    hasScheduledPresetVuePromptOrderSave,
    installPresetExportPendingChangesGuard,
    installPresetPendingChangesLifecycleGuard,
    installPresetPromptManagerVisibilityObserver,
    installPresetUpdatePendingChangesGuard,
    isFocusInsideLeftNavPanel,
    isNodeInsideLeftNavPanel,
    isPresetPromptManagerVisible,
    isPresetVisibilityElementVisible,
    markOpenAiPresetSavePending,
    markPresetPromptChangesSavePending,
    markPresetPromptGroupSettingsSavePending,
    markPresetPromptSaveRevisionChanged,
    markPresetPromptServiceSettingsSavePending,
    performOpenAiPresetSnapshotSave,
    removePresetPromptManagerVisibilityWatch,
    removeUnusedPresetPromptGroups,
    runOpenAiPresetSaveRequestQueue,
    saveOpenAiPresetAfterPendingRuntimeCommit,
    saveOpenAiPresetSnapshot,
    savePresetVuePromptGroupAssignments,
    savePresetVuePromptOrderFromModel,
    saveSettingsAfterOpenAiPresetUpdate,
    schedulePendingPresetPromptChangesFlushCheck,
    schedulePresetVuePromptOrderSaveAfterDrop,
    syncCurrentOpenAiPresetCacheFromSettings,
    syncOpenAiPresetCacheFromSnapshot,
    syncOpenAiPromptManagerStateToSettings,
    updatePresetVuePromptItemEnabled,
};
