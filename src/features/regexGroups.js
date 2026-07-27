import { characters, this_chid } from '@sillytavern/script';
import { extension_settings } from '@sillytavern/scripts/extensions';
import { getCurrentPresetAPI as getRegexCurrentPresetAPI, getCurrentPresetName as getRegexCurrentPresetName, getScriptsByType as getRegexScriptsByType, SCRIPT_TYPES as REGEX_SCRIPT_TYPES } from '@sillytavern/scripts/extensions/regex/engine';
import { t } from '@sillytavern/scripts/i18n';
import { getPresetManager } from '@sillytavern/scripts/preset-manager';
import { LOG_PREFIX, REGEX_PENDING_ASSIGNMENT_GROUP_ID, REGEX_PRESET_GROUP_EXTENSION_PATH, REGEX_PRESET_GROUP_EXTENSION_VERSION, REGEX_UNGROUPED_GROUP_ID, SETTINGS_KEY } from './constants.js';
import { markRegexGroupSettingsSavePending } from './regexPending.js';
import { getRegexQuickOperationState } from './regexQuickOps.js';
import { settings } from './state.js';

function getRegexScriptTypeKey(scriptType) {
    switch (scriptType) {
        case REGEX_SCRIPT_TYPES.GLOBAL:
            return 'global';
        case REGEX_SCRIPT_TYPES.PRESET:
            return 'preset';
        case REGEX_SCRIPT_TYPES.SCOPED:
            return 'scoped';
        default:
            return 'unknown';
    }
}

function getRegexScriptTypeFromKey(typeKey) {
    switch (typeKey) {
        case 'global':
            return REGEX_SCRIPT_TYPES.GLOBAL;
        case 'preset':
            return REGEX_SCRIPT_TYPES.PRESET;
        case 'scoped':
            return REGEX_SCRIPT_TYPES.SCOPED;
        default:
            return null;
    }
}

function getRegexGroupSettingsRoot() {
    if (!settings.regexListGroups || typeof settings.regexListGroups !== 'object') {
        settings.regexListGroups = {};
    }

    if (!settings.regexListGroups.scopes || typeof settings.regexListGroups.scopes !== 'object') {
        settings.regexListGroups.scopes = {};
    }

    extension_settings[SETTINGS_KEY].regexListGroups = settings.regexListGroups;
    return settings.regexListGroups;
}

function getRegexGroupScopeKey(scriptType) {
    switch (scriptType) {
        case REGEX_SCRIPT_TYPES.GLOBAL:
            return 'global';
        case REGEX_SCRIPT_TYPES.SCOPED: {
            const avatar = characters?.[this_chid]?.avatar;
            return `scoped:${avatar || 'none'}`;
        }
        case REGEX_SCRIPT_TYPES.PRESET:
            return getRegexPresetGroupScopeKey(getRegexCurrentPresetAPI(), getRegexCurrentPresetName());
        default:
            return `unknown:${scriptType}`;
    }
}

function getRegexPresetGroupScopeKey(apiId, presetName) {
    return `preset:${apiId || 'unknown'}:${presetName || 'unknown'}`;
}

function getRegexDefaultUngroupedGroupName() {
    return t`默认分组`;
}

function getRegexUngroupedGroupDisplayName(name) {
    const value = typeof name === 'string' ? name.trim() : '';

    if (!value || value === 'Ungrouped') {
        return getRegexDefaultUngroupedGroupName();
    }

    return value;
}

function getRegexGroupStateForScriptType(scriptType) {
    const root = getRegexGroupSettingsRoot();
    const scopeKey = getRegexGroupScopeKey(scriptType);

    if (!root.scopes[scopeKey] || typeof root.scopes[scopeKey] !== 'object') {
        root.scopes[scopeKey] = {};
    }

    const state = root.scopes[scopeKey];

    if (!Array.isArray(state.groups)) {
        state.groups = [];
    }

    if (!state.scripts || typeof state.scripts !== 'object') {
        state.scripts = {};
    }

    if (!state.ungrouped || typeof state.ungrouped !== 'object') {
        state.ungrouped = {};
    }

    return state;
}

function normalizeRegexGroupState(groupState) {
    groupState.groups = groupState.groups
        .filter(group => group && typeof group === 'object' && group.id && group.id !== REGEX_UNGROUPED_GROUP_ID && group.id !== REGEX_PENDING_ASSIGNMENT_GROUP_ID)
        .map((group, index) => {
            return {
                id: String(group.id),
                name: String(group.name || t`Unnamed group`),
                order: Number.isFinite(Number(group.order)) ? Number(group.order) : index,
                collapsed: Boolean(group.collapsed),
            };
        })
        .sort((a, b) => a.order - b.order)
        .map((group, index) => ({ ...group, order: index }));

    if (!groupState.ungrouped || typeof groupState.ungrouped !== 'object') {
        groupState.ungrouped = {};
    }

    groupState.ungrouped = {
        name: getRegexUngroupedGroupDisplayName(groupState.ungrouped.name),
        collapsed: Boolean(groupState.ungrouped.collapsed),
    };
}

function normalizeRegexPresetGroupExtensionState(value, scripts) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return null;
    }

    if (Number(value.version) !== REGEX_PRESET_GROUP_EXTENSION_VERSION) {
        return null;
    }

    const seenGroupIds = new Set();
    const groups = (Array.isArray(value.groups) ? value.groups : [])
        .filter(group => group && typeof group === 'object' && group.id)
        .map((group, index) => ({
            id: String(group.id),
            name: String(group.name || t`Unnamed group`),
            order: Number.isFinite(Number(group.order)) ? Number(group.order) : index,
            collapsed: Boolean(group.collapsed),
        }))
        .filter(group => {
            if (
                group.id === REGEX_UNGROUPED_GROUP_ID
                || group.id === REGEX_PENDING_ASSIGNMENT_GROUP_ID
                || seenGroupIds.has(group.id)
            ) {
                return false;
            }

            seenGroupIds.add(group.id);
            return true;
        })
        .sort((left, right) => left.order - right.order)
        .map((group, index) => ({ ...group, order: index }));
    const validGroupIds = new Set(groups.map(group => group.id));
    const sourceScripts = value.scripts && typeof value.scripts === 'object' && !Array.isArray(value.scripts)
        ? value.scripts
        : {};
    const buckets = new Map([
        ...groups.map(group => [group.id, []]),
        [REGEX_UNGROUPED_GROUP_ID, []],
    ]);

    for (let index = 0; index < (Array.isArray(scripts) ? scripts.length : 0); index++) {
        const scriptId = scripts[index]?.id;

        if (!scriptId) {
            continue;
        }

        const sourceMeta = sourceScripts[scriptId];
        const groupId = validGroupIds.has(sourceMeta?.groupId)
            ? sourceMeta.groupId
            : REGEX_UNGROUPED_GROUP_ID;
        const order = Number.isFinite(Number(sourceMeta?.order)) ? Number(sourceMeta.order) : index;
        buckets.get(groupId).push({ scriptId, order, index });
    }

    const normalizedScripts = {};

    for (const [groupId, entries] of buckets) {
        entries
            .sort((left, right) => left.order - right.order || left.index - right.index)
            .forEach((entry, order) => {
                normalizedScripts[entry.scriptId] = { groupId, order };
            });
    }

    return {
        groups,
        scripts: normalizedScripts,
        ungrouped: {
            name: getRegexUngroupedGroupDisplayName(value.ungrouped?.name),
            collapsed: Boolean(value.ungrouped?.collapsed),
        },
    };
}

function createRegexPresetGroupExtensionPayload(groupState, scripts) {
    const normalized = normalizeRegexPresetGroupExtensionState({
        version: REGEX_PRESET_GROUP_EXTENSION_VERSION,
        groups: Array.isArray(groupState?.groups) ? structuredClone(groupState.groups) : [],
        scripts: groupState?.scripts && typeof groupState.scripts === 'object'
            ? structuredClone(groupState.scripts)
            : {},
        ungrouped: groupState?.ungrouped && typeof groupState.ungrouped === 'object'
            ? structuredClone(groupState.ungrouped)
            : {},
    }, scripts);

    if (!normalized) {
        return null;
    }

    return {
        version: REGEX_PRESET_GROUP_EXTENSION_VERSION,
        ...normalized,
    };
}

function getRegexPresetGroupExtensionValue(presetData) {
    return presetData?.extensions?.baibaiToolkit?.regexGroups;
}

function setRegexPresetGroupExtensionValue(presetData, value) {
    if (!presetData || typeof presetData !== 'object' || !value) {
        return false;
    }

    presetData.extensions = presetData.extensions && typeof presetData.extensions === 'object'
        ? presetData.extensions
        : {};
    presetData.extensions.baibaiToolkit = presetData.extensions.baibaiToolkit
        && typeof presetData.extensions.baibaiToolkit === 'object'
        ? presetData.extensions.baibaiToolkit
        : {};
    presetData.extensions.baibaiToolkit.regexGroups = value;
    return true;
}

function hydrateCurrentRegexPresetGroupStateFromExtension({ force = false } = {}) {
    const apiId = getRegexCurrentPresetAPI();
    const presetName = getRegexCurrentPresetName();

    if (!apiId || !presetName) {
        return false;
    }

    const quickState = getRegexQuickOperationState();
    const scopeKey = getRegexPresetGroupScopeKey(apiId, presetName);

    if (!force && quickState.regexPresetGroupHydratedScopeKey === scopeKey) {
        return false;
    }

    quickState.regexPresetGroupHydratedScopeKey = scopeKey;
    const presetManager = getPresetManager(apiId);
    const scripts = getRegexScriptsByType(REGEX_SCRIPT_TYPES.PRESET);
    const portableValue = presetManager?.readPresetExtensionField({
        name: presetName,
        path: REGEX_PRESET_GROUP_EXTENSION_PATH,
    });
    const root = getRegexGroupSettingsRoot();
    const cachedState = root.scopes[scopeKey];

    if (portableValue !== null && portableValue !== undefined) {
        const normalized = normalizeRegexPresetGroupExtensionState(portableValue, scripts);

        if (!normalized) {
            console.warn(`${LOG_PREFIX} Ignored invalid portable regex group data for preset "${presetName}"`);
            return false;
        }

        const changed = JSON.stringify(cachedState ?? null) !== JSON.stringify(normalized);
        root.scopes[scopeKey] = normalized;

        if (changed) {
            markRegexGroupSettingsSavePending({ captureCurrentPreset: false });
        }

        return changed;
    }

    if (!cachedState || typeof cachedState !== 'object') {
        return false;
    }

    const migratedState = normalizeRegexPresetGroupExtensionState({
        version: REGEX_PRESET_GROUP_EXTENSION_VERSION,
        ...cachedState,
    }, scripts);

    if (!migratedState) {
        return false;
    }

    root.scopes[scopeKey] = migratedState;
    markRegexGroupSettingsSavePending();
    return true;
}

function injectRegexPresetGroupStateIntoExport(presetData, apiId) {
    const presetManager = getPresetManager(apiId);
    const presetName = presetManager?.getSelectedPresetName();

    if (!presetName || !presetData || typeof presetData !== 'object') {
        return false;
    }

    const scopeKey = getRegexPresetGroupScopeKey(apiId, presetName);
    const groupState = getRegexGroupSettingsRoot().scopes[scopeKey];

    if (!groupState || typeof groupState !== 'object') {
        return false;
    }

    const scripts = Array.isArray(presetData.extensions?.regex_scripts)
        ? presetData.extensions.regex_scripts
        : [];
    const payload = createRegexPresetGroupExtensionPayload(groupState, scripts);
    return setRegexPresetGroupExtensionValue(presetData, payload);
}

function importRegexPresetGroupStateFromPresetData(presetData, apiId, presetName) {
    if (!apiId || !presetName || !presetData || typeof presetData !== 'object') {
        return false;
    }

    const portableValue = getRegexPresetGroupExtensionValue(presetData);

    if (portableValue === undefined) {
        return false;
    }

    const scripts = Array.isArray(presetData.extensions?.regex_scripts)
        ? presetData.extensions.regex_scripts
        : [];
    const normalized = normalizeRegexPresetGroupExtensionState(portableValue, scripts);

    if (!normalized) {
        console.warn(`${LOG_PREFIX} Ignored invalid imported regex group data for preset "${presetName}"`);
        return false;
    }

    const scopeKey = getRegexPresetGroupScopeKey(apiId, presetName);
    const root = getRegexGroupSettingsRoot();
    root.scopes[scopeKey] = normalized;

    const quickState = getRegexQuickOperationState();
    if (getRegexCurrentPresetAPI() === apiId && getRegexCurrentPresetName() === presetName) {
        quickState.regexPresetGroupHydratedScopeKey = scopeKey;
    }

    markRegexGroupSettingsSavePending({ captureCurrentPreset: false });
    return true;
}

function createPendingCurrentRegexPresetGroupSaveEntry() {
    const apiId = getRegexCurrentPresetAPI();
    const presetName = getRegexCurrentPresetName();

    if (!apiId || !presetName) {
        return null;
    }

    const scopeKey = getRegexPresetGroupScopeKey(apiId, presetName);
    const groupState = getRegexGroupSettingsRoot().scopes[scopeKey];

    if (!groupState || typeof groupState !== 'object') {
        return null;
    }

    const value = createRegexPresetGroupExtensionPayload(
        groupState,
        getRegexScriptsByType(REGEX_SCRIPT_TYPES.PRESET),
    );

    if (!value) {
        return null;
    }

    return {
        apiId,
        presetName,
        scopeKey,
        value,
    };
}

function getNormalizedRegexGroupId(groupId, validGroupIds) {
    if (groupId === REGEX_PENDING_ASSIGNMENT_GROUP_ID) {
        return REGEX_PENDING_ASSIGNMENT_GROUP_ID;
    }

    if (groupId === REGEX_UNGROUPED_GROUP_ID || !validGroupIds.has(groupId)) {
        return REGEX_UNGROUPED_GROUP_ID;
    }

    return groupId;
}

function syncRegexGroupScriptOrderMetaFromScriptArray(groupState, scripts) {
    if (!groupState?.scripts || typeof groupState.scripts !== 'object' || !Array.isArray(scripts)) {
        return false;
    }

    const validGroupIds = new Set((groupState.groups ?? []).map(group => group.id));
    const nextOrderByGroupId = new Map();
    let changed = false;

    for (const script of scripts) {
        const scriptId = script?.id;

        if (!scriptId) {
            continue;
        }

        const meta = groupState.scripts[scriptId];
        const groupId = getNormalizedRegexGroupId(meta?.groupId, validGroupIds);
        const nextOrder = nextOrderByGroupId.get(groupId) ?? 0;

        nextOrderByGroupId.set(groupId, nextOrder + 1);

        if (!meta || typeof meta !== 'object') {
            continue;
        }

        if (meta.groupId !== groupId || Number(meta.order) !== nextOrder) {
            meta.groupId = groupId;
            meta.order = nextOrder;
            changed = true;
        }
    }

    return changed;
}

function saveRegexGroupSettings() {
    extension_settings[SETTINGS_KEY].regexListGroups = settings.regexListGroups;
    markRegexGroupSettingsSavePending();
}

export {
    createPendingCurrentRegexPresetGroupSaveEntry,
    createRegexPresetGroupExtensionPayload,
    getNormalizedRegexGroupId,
    getRegexDefaultUngroupedGroupName,
    getRegexGroupScopeKey,
    getRegexGroupSettingsRoot,
    getRegexGroupStateForScriptType,
    getRegexPresetGroupExtensionValue,
    getRegexPresetGroupScopeKey,
    getRegexScriptTypeFromKey,
    getRegexScriptTypeKey,
    getRegexUngroupedGroupDisplayName,
    hydrateCurrentRegexPresetGroupStateFromExtension,
    importRegexPresetGroupStateFromPresetData,
    injectRegexPresetGroupStateIntoExport,
    normalizeRegexGroupState,
    normalizeRegexPresetGroupExtensionState,
    saveRegexGroupSettings,
    setRegexPresetGroupExtensionValue,
    syncRegexGroupScriptOrderMetaFromScriptArray,
};
