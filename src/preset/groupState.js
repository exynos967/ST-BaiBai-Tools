import { event_types, eventSource, saveSettings } from '@sillytavern/script';
import { t } from '@sillytavern/scripts/i18n';
import { oai_settings, promptManager } from '@sillytavern/scripts/openai';
import { callGenericPopup, POPUP_TYPE } from '@sillytavern/scripts/popup';
import { escapeHtml, uuidv4 } from '@sillytavern/scripts/utils';
import { beginOpenAiPresetRenameSaveGate, markOpenAiPresetRenameSaveGateRenamed } from './autoBackup.js';
import { PRESET_COMPAT_ENTRY_GROUPING_EXTENSION_PATH, PRESET_GROUP_COMPAT_CHOICE_RESULT_BASE, PRESET_GROUP_EXTENSION_PATH, PRESET_GROUP_PRESET_DELETED_HANDLER_KEY, PRESET_GROUP_PRESET_IMPORT_HANDLER_KEY, PRESET_GROUP_PRESET_RENAMED_HANDLER_KEY } from './constants.js';
import { preparePromptManagerCustomDragList } from './dragCustom.js';
import { flushScheduledPresetVuePromptOrderSave, getOpenAiPresetSaveRequestStates, getPendingOpenAiPresetSaves, getPendingPresetPromptGroupSaves, getPendingPresetPromptServiceSaves, getPresetPromptSaveRevisions, markOpenAiPresetSavePending, markPresetPromptGroupSettingsSavePending } from './pendingChanges.js';
import { LOG_PREFIX, extensionState } from './state.js';
import { getObjectPath, isPresetGroupingEnabled, readCurrentPresetExtensionField, setObjectPath } from './util.js';
import { getPresetVuePromptListManagerState, getPromptManagerListElement, isPresetVuePromptListManagerActive, schedulePresetVuePromptListManagerSync, syncPresetVuePromptListManagerState } from './vueList.js';

function getPresetPromptGroupState() {
    const presetName = getPresetPromptGroupRuntimePresetName();

    if (
        extensionState.presetPromptGroupRuntimePresetName !== presetName
        || !extensionState.presetPromptGroupRuntimeState
        || typeof extensionState.presetPromptGroupRuntimeState !== 'object'
    ) {
        const loaded = loadCurrentPresetPromptGroupStateFromPreset();
        extensionState.presetPromptGroupRuntimePresetName = presetName;
        extensionState.presetPromptGroupRuntimeState = loaded.state;

        if (loaded.shouldPersist) {
            savePresetPromptGroupSettings({ immediate: true });
        }
    }

    return extensionState.presetPromptGroupRuntimeState;
}

function getPresetPromptGroupRuntimePresetName() {
    return oai_settings?.preset_settings_openai || 'current';
}

function createEmptyPresetPromptGroupState() {
    return {
        groups: [],
        prompts: {},
    };
}

function loadCurrentPresetPromptGroupStateFromPreset() {
    const validPromptIds = getCurrentPresetPromptOrderIds();
    const importedState = readCurrentPresetPromptGroupExtensionState(validPromptIds);

    if (importedState) {
        return {
            state: importedState,
            shouldPersist: false,
        };
    }

    const compatCandidates = getCompatPresetPromptGroupStateCandidates(validPromptIds);

    if (compatCandidates.length > 1) {
        schedulePresetPromptGroupCompatChoice(compatCandidates, validPromptIds);
        return {
            state: createEmptyPresetPromptGroupState(),
            shouldPersist: false,
        };
    }

    const compatCandidate = compatCandidates[0];

    if (compatCandidate) {
        return {
            state: compatCandidate.state,
            shouldPersist: true,
        };
    }

    return {
        state: createEmptyPresetPromptGroupState(),
        shouldPersist: false,
    };
}

function hasPresetPromptGroupStateData(state) {
    return Boolean(
        Array.isArray(state?.groups) && state.groups.length > 0
        && state?.prompts && typeof state.prompts === 'object'
        && Object.keys(state.prompts).length > 0,
    );
}

function normalizePresetPromptGroupState(groupState, validPromptIds = null) {
    const seenGroupIds = new Set();
    groupState.groups = groupState.groups
        .filter(group => group && typeof group === 'object' && group.id)
        .map((group, index) => ({
            id: String(group.id),
            name: String(group.name || t`未命名分组`),
            order: Number.isFinite(Number(group.order)) ? Number(group.order) : index,
            collapsed: Boolean(group.collapsed),
            enabled: group.enabled !== false,
        }))
        .sort((a, b) => a.order - b.order)
        .filter(group => {
            if (seenGroupIds.has(group.id)) {
                return false;
            }

            seenGroupIds.add(group.id);
            return true;
        })
        .map((group, index) => ({ ...group, order: index }));

    const validGroupIds = new Set(groupState.groups.map(group => group.id));
    const normalizedPrompts = {};

    for (const [promptId, meta] of Object.entries(groupState.prompts ?? {})) {
        const groupId = meta?.groupId;

        if (!groupId || !validGroupIds.has(groupId)) {
            continue;
        }

        if (validPromptIds instanceof Set && !validPromptIds.has(promptId)) {
            continue;
        }

        normalizedPrompts[promptId] = { groupId };
    }

    groupState.prompts = normalizedPrompts;
}

function readCurrentPresetPromptGroupExtensionState(validPromptIds = getCurrentPresetPromptOrderIds()) {
    const value = readCurrentPresetExtensionField(PRESET_GROUP_EXTENSION_PATH);

    if (!value || typeof value !== 'object') {
        return null;
    }

    const groupState = {
        groups: Array.isArray(value.groups)
            ? structuredClone(value.groups)
            : [],
        prompts: value.prompts && typeof value.prompts === 'object' ? structuredClone(value.prompts) : {},
    };

    normalizePresetPromptGroupState(groupState, new Set(validPromptIds));
    return hasPresetPromptGroupStateData(groupState) ? groupState : null;
}

function getCompatPresetPromptGroupStateCandidates(validPromptIds = getCurrentPresetPromptOrderIds()) {
    const entryGrouping = readCurrentPresetExtensionField(PRESET_COMPAT_ENTRY_GROUPING_EXTENSION_PATH);

    if (!entryGrouping || !validPromptIds.length) {
        return [];
    }

    return [
        {
            formatName: t`起止范围格式`,
            state: convertCompatEntryGroupingRangeToPresetPromptGroupState(entryGrouping, validPromptIds),
        },
        {
            formatName: t`成员列表格式`,
            state: convertCompatEntryGroupingMembersToPresetPromptGroupState(entryGrouping, validPromptIds),
        },
    ].filter(candidate => hasPresetPromptGroupStateData(candidate.state));
}

function getCompatEntryGroupingEntries(entryGrouping) {
    if (Array.isArray(entryGrouping)) {
        return entryGrouping;
    }

    if (!entryGrouping || typeof entryGrouping !== 'object') {
        return [];
    }

    for (const key of ['groups', 'entries', 'entryGroups', 'items']) {
        if (Array.isArray(entryGrouping[key])) {
            return entryGrouping[key];
        }
    }

    return [];
}

function convertCompatEntryGroupingRangeToPresetPromptGroupState(entryGrouping, promptIds = getCurrentPresetPromptOrderIds()) {
    const entries = getCompatEntryGroupingEntries(entryGrouping);

    if (!entries.length || !promptIds.length) {
        return null;
    }

    const validPromptIds = new Set(promptIds);
    const groupState = {
        groups: [],
        prompts: {},
    };
    const assignedPromptIds = new Set();

    for (const [index, entry] of entries.entries()) {
        if (!entry || typeof entry !== 'object') {
            continue;
        }

        const startIndex = promptIds.indexOf(entry.startIdentifier);
        const endIndex = promptIds.indexOf(entry.endIdentifier);

        if (startIndex < 0 || endIndex < 0) {
            continue;
        }

        const exclusive = String(entry.mode || 'inclusive').toLowerCase() === 'exclusive';
        const from = Math.min(startIndex, endIndex) + (exclusive ? 1 : 0);
        const to = Math.max(startIndex, endIndex) - (exclusive ? 1 : 0);

        if (from > to) {
            continue;
        }

        const groupId = String(entry.id || uuidv4());
        groupState.groups.push({
            id: groupId,
            name: String(entry.name || t`未命名分组`),
            order: index,
            collapsed: true,
            enabled: true,
        });

        for (const promptId of promptIds.slice(from, to + 1)) {
            if (!validPromptIds.has(promptId) || assignedPromptIds.has(promptId)) {
                continue;
            }

            assignedPromptIds.add(promptId);
            groupState.prompts[promptId] = { groupId };
        }
    }

    normalizePresetPromptGroupState(groupState, validPromptIds);
    return hasPresetPromptGroupStateData(groupState) ? groupState : null;
}

function convertCompatEntryGroupingMembersToPresetPromptGroupState(entryGrouping, promptIds = getCurrentPresetPromptOrderIds()) {
    const entries = getCompatEntryGroupingEntries(entryGrouping);

    if (!entries.length || !promptIds.length) {
        return null;
    }

    const validPromptIds = new Set(promptIds);
    const groupState = {
        groups: [],
        prompts: {},
    };
    const assignedPromptIds = new Set();

    for (const [index, entry] of entries.entries()) {
        if (!entry || typeof entry !== 'object' || !Array.isArray(entry.memberIdentifiers)) {
            continue;
        }

        const memberIds = entry.memberIdentifiers
            .map(identifier => String(identifier || ''))
            .filter(identifier => validPromptIds.has(identifier) && !assignedPromptIds.has(identifier));

        if (!memberIds.length) {
            continue;
        }

        const memberIdSet = new Set(memberIds);
        const groupId = String(entry.id || uuidv4());
        groupState.groups.push({
            id: groupId,
            name: String(entry.name || t`未命名分组`),
            order: index,
            collapsed: true,
            enabled: true,
        });

        for (const promptId of promptIds) {
            if (!memberIdSet.has(promptId)) {
                continue;
            }

            assignedPromptIds.add(promptId);
            groupState.prompts[promptId] = { groupId };
        }
    }

    normalizePresetPromptGroupState(groupState, validPromptIds);
    return hasPresetPromptGroupStateData(groupState) ? groupState : null;
}

function schedulePresetPromptGroupCompatChoice(candidates, validPromptIds = getCurrentPresetPromptOrderIds()) {
    const presetName = getPresetPromptGroupRuntimePresetName();
    const choiceKey = getPresetPromptGroupCompatChoiceKey(presetName, candidates, validPromptIds);

    if (
        extensionState.presetPromptGroupCompatChoicePendingKey === choiceKey
        || extensionState.presetPromptGroupCompatChoiceDismissedKey === choiceKey
    ) {
        return false;
    }

    extensionState.presetPromptGroupCompatChoicePendingKey = choiceKey;
    void choosePresetPromptGroupCompatCandidate(candidates, validPromptIds, presetName, choiceKey);
    return true;
}

function getPresetPromptGroupCompatChoiceKey(presetName, candidates, validPromptIds) {
    const candidateKey = candidates
        .map(candidate => {
            const groupNames = candidate.state.groups.map(group => group.name).join(',');
            return `${candidate.formatName}:${candidate.state.groups.length}:${Object.keys(candidate.state.prompts).length}:${groupNames}`;
        })
        .join('|');

    return `${presetName}:${validPromptIds.length}:${candidateKey}`;
}

async function choosePresetPromptGroupCompatCandidate(candidates, validPromptIds, presetName, choiceKey) {
    try {
        const popupResult = await callGenericPopup(
            renderPresetPromptGroupCompatChoicePopup(candidates),
            POPUP_TYPE.TEXT,
            '',
            {
                okButton: false,
                cancelButton: t`取消`,
                allowVerticalScrolling: true,
                wider: true,
                customButtons: candidates.map((candidate, index) => ({
                    text: t`使用分组${getPresetPromptGroupCompatChoiceLetter(index)}`,
                    result: PRESET_GROUP_COMPAT_CHOICE_RESULT_BASE + index,
                    tooltip: candidate.formatName,
                })),
            },
        );
        const selectedIndex = Number(popupResult) - PRESET_GROUP_COMPAT_CHOICE_RESULT_BASE;
        const selectedCandidate = candidates[selectedIndex];

        if (!selectedCandidate) {
            extensionState.presetPromptGroupCompatChoiceDismissedKey = choiceKey;
            return;
        }

        if (getPresetPromptGroupRuntimePresetName() !== presetName) {
            return;
        }

        extensionState.presetPromptGroupRuntimePresetName = presetName;
        extensionState.presetPromptGroupRuntimeState = selectedCandidate.state;
        normalizePresetPromptGroupState(extensionState.presetPromptGroupRuntimeState, new Set(validPromptIds));
        savePresetPromptGroupSettings({ immediate: true });
        syncPresetVuePromptListManagerState();
    } finally {
        if (extensionState.presetPromptGroupCompatChoicePendingKey === choiceKey) {
            delete extensionState.presetPromptGroupCompatChoicePendingKey;
        }
    }
}

function renderPresetPromptGroupCompatChoicePopup(candidates) {
    const lines = candidates
        .map((candidate, index) => {
            const letter = getPresetPromptGroupCompatChoiceLetter(index);
            const groups = candidate.state.groups ?? [];
            const groupNames = groups.map(group => group.name).filter(Boolean);
            const previewNames = groupNames.slice(0, 6).map(name => escapeHtml(name));
            const suffix = groupNames.length > previewNames.length ? '...' : '';
            const preview = [...previewNames, suffix].filter(Boolean).join('、') || t`无`;

            return `<p><strong>${t`分组`}${letter}</strong>${t`有${groups.length}个分组`}：${preview}</p>`;
        })
        .join('');

    return `
        <div class="bai-bai-preset-group-import-choice">
            <p>${t`检测到当前预设同时包含两种可兼容的分组格式，请选择要导入的分组。`}</p>
            ${lines}
        </div>
    `;
}

function getPresetPromptGroupCompatChoiceLetter(index) {
    return String.fromCharCode(65 + index);
}

function getCurrentPresetPromptOrderIds() {
    return (promptManager?.getPromptOrderForCharacter?.(promptManager.activeCharacter) ?? [])
        .map(entry => entry?.identifier)
        .filter(Boolean);
}

function savePresetPromptGroupSettings({ force = false } = {}) {
    const payload = getCurrentPresetPromptGroupExtensionPayload();
    const changed = syncCurrentPresetPromptGroupStateToPresetExtensionField({ force, persist: false, payload });

    if (changed) {
        markPresetPromptGroupSettingsSavePending(payload);
    }

    return changed;
}

function getCurrentPresetPromptGroupExtensionPayload() {
    const presetName = oai_settings?.preset_settings_openai;

    if (!presetName) {
        return null;
    }

    const promptIds = getCurrentPresetPromptOrderIds();

    if (!promptIds.length) {
        return null;
    }

    const groupState = getSerializableCurrentPresetPromptGroupState(promptIds);
    const existingPresetGroupState = readCurrentPresetExtensionField(PRESET_GROUP_EXTENSION_PATH);

    if (!hasPresetPromptGroupStateData(groupState) && !existingPresetGroupState) {
        return null;
    }

    const serialized = JSON.stringify(groupState);
    return {
        presetName,
        groupState,
        syncKey: `${presetName}:${serialized}`,
    };
}

function applyPresetPromptGroupExtensionPayloadToMemory(payload) {
    if (!payload) {
        return;
    }

    if (oai_settings?.preset_settings_openai === payload.presetName) {
        oai_settings.extensions = oai_settings.extensions && typeof oai_settings.extensions === 'object'
            ? oai_settings.extensions
            : {};
        setObjectPath(oai_settings.extensions, PRESET_GROUP_EXTENSION_PATH, payload.groupState);

        if (promptManager?.serviceSettings && typeof promptManager.serviceSettings === 'object') {
            promptManager.serviceSettings.extensions = promptManager.serviceSettings.extensions && typeof promptManager.serviceSettings.extensions === 'object'
                ? promptManager.serviceSettings.extensions
                : {};
            setObjectPath(promptManager.serviceSettings.extensions, PRESET_GROUP_EXTENSION_PATH, payload.groupState);
        }
    }

}

function syncCurrentPresetPromptGroupStateToPresetExtensionField({ force = false, persist = true, payload = null } = {}) {
    payload ||= getCurrentPresetPromptGroupExtensionPayload();

    if (!payload) {
        return false;
    }

    if (!force && persist && extensionState.presetPromptGroupExtensionSyncKey === payload.syncKey) {
        return false;
    }

    applyPresetPromptGroupExtensionPayloadToMemory(payload);

    if (persist) {
        extensionState.presetPromptGroupExtensionSyncKey = payload.syncKey;
    }

    return true;
}

async function flushCurrentPresetPromptGroupSettings({ force = false } = {}) {
    const payload = getCurrentPresetPromptGroupExtensionPayload();

    if (!payload) {
        return false;
    }

    if (!force && extensionState.presetPromptGroupExtensionSyncKey === payload.syncKey) {
        return false;
    }

    applyPresetPromptGroupExtensionPayloadToMemory(payload);
    extensionState.presetPromptGroupExtensionSyncKey = payload.syncKey;
    markOpenAiPresetSavePending(payload.presetName);
    await saveSettings();

    return true;
}

function getSerializableCurrentPresetPromptGroupState(promptIds = getCurrentPresetPromptOrderIds()) {
    const groupState = getPresetPromptGroupState();
    const serializable = {
        version: 1,
        groups: structuredClone(groupState.groups ?? []),
        prompts: structuredClone(groupState.prompts ?? {}),
    };

    normalizePresetPromptGroupState(serializable, new Set(promptIds));
    return serializable;
}

function applyPresetGroupDeletedCleanup() {
    if (extensionState[PRESET_GROUP_PRESET_DELETED_HANDLER_KEY]) {
        return;
    }

    const handler = (event) => {
        if (event?.apiId !== 'openai' || !event?.name) {
            return;
        }

        resetPresetPromptGroupRuntimeState(event.name);
    };

    extensionState[PRESET_GROUP_PRESET_DELETED_HANDLER_KEY] = handler;
    eventSource.on(event_types.PRESET_DELETED, handler);
}

function applyPresetGroupImportCleanup() {
    if (extensionState[PRESET_GROUP_PRESET_IMPORT_HANDLER_KEY]) {
        return;
    }

    const handler = (event) => {
        const presetName = event?.presetName;

        if (!presetName) {
            return;
        }

        collapseImportedPresetPromptGroups(event?.data);
        resetPresetPromptGroupRuntimeState(presetName);
    };

    extensionState[PRESET_GROUP_PRESET_IMPORT_HANDLER_KEY] = handler;
    eventSource.on(event_types.OAI_PRESET_IMPORT_READY, handler);
}

function applyPresetGroupRenameCleanup() {
    if (
        extensionState[PRESET_GROUP_PRESET_RENAMED_HANDLER_KEY]
        || !event_types.PRESET_RENAMED_BEFORE
        || !event_types.PRESET_RENAMED
    ) {
        return;
    }

    const beforeHandler = event => handlePresetPromptGroupRenamedBefore(event);
    const renamedHandler = event => {
        handlePresetPromptGroupRenamed(event);
    };

    extensionState[PRESET_GROUP_PRESET_RENAMED_HANDLER_KEY] = { beforeHandler, renamedHandler };
    eventSource.on(event_types.PRESET_RENAMED_BEFORE, beforeHandler);
    eventSource.on(event_types.PRESET_RENAMED, renamedHandler);
}

async function handlePresetPromptGroupRenamedBefore(event) {
    if (event?.apiId !== 'openai' || !event.oldName || !event.newName) {
        return;
    }

    const activeSaveRequests = beginOpenAiPresetRenameSaveGate(event.oldName, event.newName);

    try {
        await activeSaveRequests;

        if (!isPresetGroupingEnabled()) {
            return;
        }

        await flushScheduledPresetVuePromptOrderSave();
        if (extensionState.presetPromptGroupRuntimePresetName === event.oldName) {
            syncCurrentPresetPromptGroupStateToPresetExtensionField({ force: true, persist: false });
        }

        // ST 重命名 openai 预设时,会先保存一个空的新预设并触发预设切换;在开启预设切换
        // 优化后该切换被异步推迟,等它执行时会用空预设覆盖 oai_settings.extensions,导致分组丢失。
        // 这里在数据仍完整时(RENAMED_BEFORE)把分组状态深拷贝暂存,等 RENAMED 时再写回。
        extensionState.renamedPresetGroupStash = captureRenamedPresetGroupStash(event.oldName, event.newName);
    } catch (error) {
        console.debug(`${LOG_PREFIX} Failed to prepare preset prompt groups before preset rename`, error);
    }
}

function captureRenamedPresetGroupStash(oldName, newName) {
    const live = getObjectPath(oai_settings?.extensions, PRESET_GROUP_EXTENSION_PATH);
    const source = hasPresetPromptGroupStateData(live)
        ? live
        : (extensionState.presetPromptGroupRuntimePresetName === oldName ? extensionState.presetPromptGroupRuntimeState : null);

    if (!hasPresetPromptGroupStateData(source)) {
        return null;
    }

    return {
        newName,
        groupState: structuredClone(source),
    };
}

function restoreRenamedPresetGroupStash(newName) {
    const stash = extensionState.renamedPresetGroupStash;
    delete extensionState.renamedPresetGroupStash;

    if (!stash || stash.newName !== newName || !hasPresetPromptGroupStateData(stash.groupState)) {
        return false;
    }

    const groupState = structuredClone(stash.groupState);
    const payload = {
        presetName: newName,
        groupState,
        syncKey: `${newName}:${JSON.stringify(groupState)}`,
    };

    // 写回 oai_settings.extensions / serviceSettings(当前预设已是新名),随后的
    // update_oai_preset 会基于 oai_settings 落盘,从而把分组持久化到新预设文件。
    applyPresetPromptGroupExtensionPayloadToMemory(payload);
    extensionState.presetPromptGroupExtensionSyncKey = payload.syncKey;
    extensionState.presetPromptGroupRuntimePresetName = newName;
    extensionState.presetPromptGroupRuntimeState = structuredClone(groupState);
    markOpenAiPresetSavePending(newName);
    return true;
}

function handlePresetPromptGroupRenamed(event) {
    if (event?.apiId !== 'openai' || !event.oldName || !event.newName) {
        return;
    }

    migratePendingPresetPromptSavesAfterRename(event.oldName, event.newName);
    markOpenAiPresetRenameSaveGateRenamed(event.oldName, event.newName);

    if (!isPresetGroupingEnabled()) {
        return;
    }

    if (extensionState.presetPromptGroupRuntimePresetName === event.oldName) {
        extensionState.presetPromptGroupRuntimePresetName = event.newName;
    } else if (extensionState.presetPromptGroupRuntimePresetName === event.newName) {
        resetPresetPromptGroupRuntimeState(event.newName);
    }

    delete extensionState.presetPromptGroupExtensionSyncKey;

    // 把 RENAMED_BEFORE 暂存的分组数据写回新预设(此时内存中的分组已被异步预设切换清空)。
    restoreRenamedPresetGroupStash(event.newName);

    if (isPresetVuePromptListManagerActive()) {
        syncPresetVuePromptListManagerState();
        preparePromptManagerCustomDragList(getPromptManagerListElement(), {
            signature: getPresetVuePromptListManagerState().lastStructureSignature,
        });
    } else {
        schedulePresetVuePromptListManagerSync(0);
    }
}

function migratePendingPresetPromptSavesAfterRename(oldName, newName) {
    const manager = getPresetVuePromptListManagerState();
    migratePendingPresetPromptSaveMapAfterRename(getPendingPresetPromptServiceSaves(manager), oldName, newName);
    migratePendingPresetPromptSaveMapAfterRename(getPendingPresetPromptGroupSaves(manager), oldName, newName);
    migratePendingOpenAiPresetSaveSetAfterRename(getPendingOpenAiPresetSaves(manager), oldName, newName);
    migratePendingPresetPromptSaveRevisionAfterRename(getPresetPromptSaveRevisions(manager), oldName, newName);
    migrateOpenAiPresetSaveRequestStateAfterRename(getOpenAiPresetSaveRequestStates(manager), oldName, newName);
}

function migratePendingPresetPromptSaveMapAfterRename(map, oldName, newName) {
    if (!(map instanceof Map) || !map.has(oldName)) {
        return false;
    }

    const entry = map.get(oldName);
    map.delete(oldName);

    if (!entry || typeof entry !== 'object') {
        return false;
    }

    const migratedEntry = {
        ...entry,
        presetName: newName,
    };

    if (migratedEntry.groupState) {
        migratedEntry.syncKey = `${newName}:${JSON.stringify(migratedEntry.groupState)}`;
    }

    map.set(newName, migratedEntry);
    return true;
}

function migratePendingOpenAiPresetSaveSetAfterRename(set, oldName, newName) {
    if (!(set instanceof Set) || !set.has(oldName)) {
        return false;
    }

    set.delete(oldName);
    set.add(newName);
    return true;
}

function migratePendingPresetPromptSaveRevisionAfterRename(map, oldName, newName) {
    if (!(map instanceof Map) || !map.has(oldName)) {
        return false;
    }

    const revision = map.get(oldName);
    map.delete(oldName);
    map.set(newName, Math.max(Number(map.get(newName)) || 0, Number(revision) || 0));
    return true;
}

function migrateOpenAiPresetSaveRequestStateAfterRename(map, oldName, newName) {
    if (!(map instanceof Map) || !map.has(oldName)) {
        return false;
    }

    const sourceState = map.get(oldName);
    const targetState = map.get(newName);
    map.delete(oldName);

    if (!sourceState || typeof sourceState !== 'object') {
        return false;
    }

    sourceState.presetName = newName;

    if (!targetState || targetState === sourceState) {
        map.set(newName, sourceState);
        return true;
    }

    const sourceRevision = Number(sourceState.requestedRevision);
    const targetRevision = Number(targetState.requestedRevision);

    if (
        sourceState.requestedRevision !== null
        && (targetState.requestedRevision === null || sourceRevision >= targetRevision)
    ) {
        targetState.requestedRevision = sourceState.requestedRevision;
        targetState.requestedSnapshot = sourceState.requestedSnapshot;
    }

    targetState.presetName = newName;

    if (!targetState.promise && sourceState.promise) {
        map.set(newName, sourceState);
    } else {
        map.set(newName, targetState);
    }

    return true;
}

function collapseImportedPresetPromptGroups(presetData) {
    const groups = getObjectPath(presetData?.extensions, PRESET_GROUP_EXTENSION_PATH)?.groups;

    if (!Array.isArray(groups)) {
        return false;
    }

    for (const group of groups) {
        if (group && typeof group === 'object') {
            group.collapsed = true;
        }
    }

    return true;
}

function resetPresetPromptGroupRuntimeState(presetName = null) {
    if (presetName && extensionState.presetPromptGroupRuntimePresetName !== presetName) {
        return;
    }

    delete extensionState.presetPromptGroupRuntimePresetName;
    delete extensionState.presetPromptGroupRuntimeState;
}

export {
    applyPresetGroupDeletedCleanup,
    applyPresetGroupImportCleanup,
    applyPresetGroupRenameCleanup,
    applyPresetPromptGroupExtensionPayloadToMemory,
    captureRenamedPresetGroupStash,
    choosePresetPromptGroupCompatCandidate,
    collapseImportedPresetPromptGroups,
    convertCompatEntryGroupingMembersToPresetPromptGroupState,
    convertCompatEntryGroupingRangeToPresetPromptGroupState,
    createEmptyPresetPromptGroupState,
    flushCurrentPresetPromptGroupSettings,
    getCompatEntryGroupingEntries,
    getCompatPresetPromptGroupStateCandidates,
    getCurrentPresetPromptGroupExtensionPayload,
    getCurrentPresetPromptOrderIds,
    getPresetPromptGroupCompatChoiceKey,
    getPresetPromptGroupCompatChoiceLetter,
    getPresetPromptGroupRuntimePresetName,
    getPresetPromptGroupState,
    getSerializableCurrentPresetPromptGroupState,
    handlePresetPromptGroupRenamed,
    handlePresetPromptGroupRenamedBefore,
    hasPresetPromptGroupStateData,
    loadCurrentPresetPromptGroupStateFromPreset,
    migrateOpenAiPresetSaveRequestStateAfterRename,
    migratePendingOpenAiPresetSaveSetAfterRename,
    migratePendingPresetPromptSaveMapAfterRename,
    migratePendingPresetPromptSaveRevisionAfterRename,
    migratePendingPresetPromptSavesAfterRename,
    normalizePresetPromptGroupState,
    readCurrentPresetPromptGroupExtensionState,
    renderPresetPromptGroupCompatChoicePopup,
    resetPresetPromptGroupRuntimeState,
    restoreRenamedPresetGroupStash,
    savePresetPromptGroupSettings,
    schedulePresetPromptGroupCompatChoice,
    syncCurrentPresetPromptGroupStateToPresetExtensionField,
};
