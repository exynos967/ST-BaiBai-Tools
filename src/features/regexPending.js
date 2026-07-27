import { characters, getCurrentChatId, reloadCurrentChat, saveSettings, this_chid } from '@sillytavern/script';
import { extension_settings, writeExtensionField } from '@sillytavern/scripts/extensions';
import { getCurrentPresetAPI as getRegexCurrentPresetAPI, getCurrentPresetName as getRegexCurrentPresetName, SCRIPT_TYPES as REGEX_SCRIPT_TYPES } from '@sillytavern/scripts/extensions/regex/engine';
import { t } from '@sillytavern/scripts/i18n';
import { getPresetManager } from '@sillytavern/scripts/preset-manager';
import { LOG_PREFIX, REGEX_CHAT_RELOAD_VISIBILITY_CHECK_DELAY_MS, REGEX_CHAT_RELOAD_VISIBILITY_FALLBACK_DELAY_MS, REGEX_CONTAINER_SELECTOR, REGEX_EXTENSIONS_PANEL_SELECTOR, REGEX_PRESET_GROUP_EXTENSION_PATH, SETTINGS_KEY } from './constants.js';
import { createPendingCurrentRegexPresetGroupSaveEntry, getRegexGroupScopeKey } from './regexGroups.js';
import { getRegexQuickOperationState } from './regexQuickOps.js';
import { settings } from './state.js';

async function saveRegexScriptList(scriptType, scripts) {
    markRegexScriptListSavePending(scriptType, scripts);
}

function markRegexScriptListSavePending(scriptType, scripts) {
    const state = getRegexQuickOperationState();

    if (!state.pendingRegexScriptSaves || !(state.pendingRegexScriptSaves instanceof Map)) {
        state.pendingRegexScriptSaves = new Map();
    }

    const entry = createPendingRegexScriptSaveEntry(scriptType, scripts);

    if (!entry) {
        return;
    }

    state.pendingRegexScriptSaves.set(entry.scopeKey, entry);
    schedulePendingRegexChangesFlushCheck();
}

function createPendingRegexScriptSaveEntry(scriptType, scripts) {
    const safeScripts = Array.isArray(scripts) ? scripts : [];

    switch (scriptType) {
        case REGEX_SCRIPT_TYPES.GLOBAL:
            return {
                scriptType,
                scopeKey: getRegexGroupScopeKey(scriptType),
                scripts: safeScripts,
            };
        case REGEX_SCRIPT_TYPES.SCOPED: {
            if (this_chid === undefined || !characters?.[this_chid]) {
                return null;
            }

            return {
                scriptType,
                scopeKey: getRegexGroupScopeKey(scriptType),
                scripts: safeScripts,
                characterId: this_chid,
            };
        }
        case REGEX_SCRIPT_TYPES.PRESET: {
            const apiId = getRegexCurrentPresetAPI();
            const presetName = getRegexCurrentPresetName();

            if (!apiId || !presetName) {
                return null;
            }

            return {
                scriptType,
                scopeKey: getRegexGroupScopeKey(scriptType),
                scripts: safeScripts,
                apiId,
                presetName,
            };
        }
        default:
            return null;
    }
}

function markRegexGroupSettingsSavePending({ captureCurrentPreset = true } = {}) {
    const state = getRegexQuickOperationState();
    extension_settings[SETTINGS_KEY].regexListGroups = settings.regexListGroups;
    state.pendingRegexGroupSettingsSave = true;

    if (captureCurrentPreset) {
        const entry = createPendingCurrentRegexPresetGroupSaveEntry();

        if (entry) {
            if (!(state.pendingRegexPresetGroupSaves instanceof Map)) {
                state.pendingRegexPresetGroupSaves = new Map();
            }

            state.pendingRegexPresetGroupSaves.set(entry.scopeKey, entry);
        }
    }

    schedulePendingRegexChangesFlushCheck();
}

function schedulePendingRegexChangesFlushCheck() {
    installRegexChatReloadVisibilityObserver();
    scheduleRegexChatReloadVisibilityCheck(0);
}

function allowRegexScriptTypeAfterEditSave(scriptType) {
    if (scriptType === REGEX_SCRIPT_TYPES.SCOPED) {
        const avatar = characters?.[this_chid]?.avatar;

        if (!avatar) {
            return;
        }

        if (!Array.isArray(extension_settings.character_allowed_regex)) {
            extension_settings.character_allowed_regex = [];
        }

        if (!extension_settings.character_allowed_regex.includes(avatar)) {
            extension_settings.character_allowed_regex.push(avatar);
            markRegexGroupSettingsSavePending();
        }

        return;
    }

    if (scriptType === REGEX_SCRIPT_TYPES.PRESET) {
        const apiId = getRegexCurrentPresetAPI();
        const presetName = getRegexCurrentPresetName();

        if (!apiId || !presetName) {
            return;
        }

        if (!extension_settings.preset_allowed_regex || typeof extension_settings.preset_allowed_regex !== 'object') {
            extension_settings.preset_allowed_regex = {};
        }

        if (!Array.isArray(extension_settings.preset_allowed_regex[apiId])) {
            extension_settings.preset_allowed_regex[apiId] = [];
        }

        if (!extension_settings.preset_allowed_regex[apiId].includes(presetName)) {
            extension_settings.preset_allowed_regex[apiId].push(presetName);
            markRegexGroupSettingsSavePending();
        }
    }
}

function queueRegexChatReloadAfterPanelClose() {
    if (!getCurrentChatId()) {
        return;
    }

    const state = getRegexQuickOperationState();
    state.pendingChatReload = true;
    installRegexChatReloadVisibilityObserver();
    scheduleRegexChatReloadVisibilityCheck(0);
}

function installRegexChatReloadVisibilityObserver() {
    const state = getRegexQuickOperationState();

    if (state.chatReloadVisibilityObserver || typeof MutationObserver !== 'function') {
        return;
    }

    const observer = new MutationObserver(() => {
        scheduleRegexChatReloadVisibilityCheck();
    });

    state.chatReloadVisibilityObserver = observer;

    for (const target of getRegexChatReloadVisibilityTargets()) {
        observer.observe(target, {
            attributes: true,
            attributeFilter: ['class', 'style', 'hidden', 'aria-hidden'],
        });
    }
}

function getRegexChatReloadVisibilityTargets() {
    const targets = [];
    const seen = new Set();
    const add = element => {
        if (element instanceof HTMLElement && !seen.has(element)) {
            seen.add(element);
            targets.push(element);
        }
    };

    const regexContainer = document.querySelector(REGEX_CONTAINER_SELECTOR);
    const extensionsPanel = document.querySelector(REGEX_EXTENSIONS_PANEL_SELECTOR);

    add(regexContainer);
    add(extensionsPanel);

    if (regexContainer instanceof HTMLElement) {
        for (let element = regexContainer.parentElement; element && element !== document.body; element = element.parentElement) {
            add(element);

            if (element.matches(REGEX_EXTENSIONS_PANEL_SELECTOR)) {
                break;
            }
        }
    }

    return targets;
}

function scheduleRegexChatReloadVisibilityCheck(delayMs = REGEX_CHAT_RELOAD_VISIBILITY_CHECK_DELAY_MS) {
    const state = getRegexQuickOperationState();
    clearTimeout(state.chatReloadVisibilityTimer);
    state.chatReloadVisibilityTimer = setTimeout(() => {
        state.chatReloadVisibilityTimer = null;
        checkPendingRegexChatReload();
    }, delayMs);
}

function checkPendingRegexChatReload() {
    const state = getRegexQuickOperationState();

    if (!state.pendingChatReload && !hasPendingRegexChanges()) {
        removeRegexChatReloadVisibilityWatch();
        return;
    }

    if (!isRegexPanelVisible()) {
        void flushPendingRegexChatReload();
        return;
    }

    scheduleRegexChatReloadVisibilityCheck(REGEX_CHAT_RELOAD_VISIBILITY_FALLBACK_DELAY_MS);
}

async function flushPendingRegexChatReload() {
    const state = getRegexQuickOperationState();

    if ((!state.pendingChatReload && !hasPendingRegexChanges()) || state.chatReloadInFlight) {
        return;
    }

    const shouldReload = Boolean(state.pendingChatReload);
    state.pendingChatReload = false;
    state.chatReloadInFlight = true;
    removeRegexChatReloadVisibilityWatch();

    try {
        await flushPendingRegexChanges();

        if (shouldReload) {
            await reloadCurrentChatForRegexChange();
        }
    } catch (error) {
        if (shouldReload) {
            state.pendingChatReload = true;
        }

        console.debug(`${LOG_PREFIX} Failed to flush regex changes`, error);
        toastr.error(t`Failed to save regex changes. See console for details.`);
    } finally {
        state.chatReloadInFlight = false;

        if (state.pendingChatReload || hasPendingRegexChanges()) {
            installRegexChatReloadVisibilityObserver();
            scheduleRegexChatReloadVisibilityCheck();
        }
    }
}

function hasPendingRegexChanges() {
    const state = getRegexQuickOperationState();
    return Boolean(
        state.pendingRegexGroupSettingsSave
        || state.pendingRegexScriptSaves?.size > 0
        || state.pendingRegexPresetGroupSaves?.size > 0
    );
}

async function flushPendingRegexChanges() {
    const state = getRegexQuickOperationState();

    if (state.regexChangesSavePromise) {
        return state.regexChangesSavePromise;
    }

    const pendingScriptSaves = state.pendingRegexScriptSaves instanceof Map
        ? Array.from(state.pendingRegexScriptSaves.values())
        : [];
    const pendingPresetGroupSaves = state.pendingRegexPresetGroupSaves instanceof Map
        ? Array.from(state.pendingRegexPresetGroupSaves.values())
        : [];
    const shouldSaveGroups = Boolean(state.pendingRegexGroupSettingsSave);

    if (pendingScriptSaves.length === 0 && pendingPresetGroupSaves.length === 0 && !shouldSaveGroups) {
        return;
    }

    state.regexChangesSaveInFlight = true;
    const shouldSaveSettings = shouldSaveGroups || pendingScriptSaves.some(entry => entry.scriptType === REGEX_SCRIPT_TYPES.GLOBAL);
    const savePromise = (async () => {
        try {
            state.pendingRegexScriptSaves = new Map();
            state.pendingRegexPresetGroupSaves = new Map();
            state.pendingRegexGroupSettingsSave = false;

            for (const entry of pendingScriptSaves) {
                await flushPendingRegexScriptSave(entry);
            }

            for (const entry of pendingPresetGroupSaves) {
                await flushPendingRegexPresetGroupSave(entry);
            }

            if (shouldSaveSettings) {
                extension_settings[SETTINGS_KEY].regexListGroups = settings.regexListGroups;
                await saveSettings();
            }
        } catch (error) {
            if (!state.pendingRegexScriptSaves || !(state.pendingRegexScriptSaves instanceof Map)) {
                state.pendingRegexScriptSaves = new Map();
            }

            for (const entry of pendingScriptSaves) {
                state.pendingRegexScriptSaves.set(entry.scopeKey, entry);
            }

            if (!(state.pendingRegexPresetGroupSaves instanceof Map)) {
                state.pendingRegexPresetGroupSaves = new Map();
            }

            for (const entry of pendingPresetGroupSaves) {
                state.pendingRegexPresetGroupSaves.set(entry.scopeKey, entry);
            }

            state.pendingRegexGroupSettingsSave = state.pendingRegexGroupSettingsSave || shouldSaveGroups;
            throw error;
        } finally {
            state.regexChangesSaveInFlight = false;
        }
    })();

    state.regexChangesSavePromise = savePromise;

    try {
        await savePromise;
    } finally {
        if (state.regexChangesSavePromise === savePromise) {
            state.regexChangesSavePromise = null;
        }

        if (hasPendingRegexChanges()) {
            installRegexChatReloadVisibilityObserver();
            scheduleRegexChatReloadVisibilityCheck();
        }
    }
}

async function flushPendingRegexScriptSave(entry) {
    switch (entry.scriptType) {
        case REGEX_SCRIPT_TYPES.GLOBAL:
            extension_settings.regex = entry.scripts;
            break;
        case REGEX_SCRIPT_TYPES.SCOPED:
            await writeExtensionField(entry.characterId, 'regex_scripts', entry.scripts);
            break;
        case REGEX_SCRIPT_TYPES.PRESET: {
            const presetManager = getPresetManager(entry.apiId);

            if (!presetManager) {
                throw new Error(`Preset manager not found for API: ${entry.apiId}`);
            }

            await presetManager.writePresetExtensionField({
                name: entry.presetName,
                path: 'regex_scripts',
                value: entry.scripts,
            });
            break;
        }
        default:
            break;
    }
}

async function flushPendingRegexPresetGroupSave(entry) {
    const presetManager = getPresetManager(entry.apiId);

    if (!presetManager) {
        throw new Error(`Preset manager not found for API: ${entry.apiId}`);
    }

    await presetManager.writePresetExtensionField({
        name: entry.presetName,
        path: REGEX_PRESET_GROUP_EXTENSION_PATH,
        value: entry.value,
    });
}

function removeRegexChatReloadVisibilityWatch() {
    const state = getRegexQuickOperationState();
    clearTimeout(state.chatReloadVisibilityTimer);
    state.chatReloadVisibilityTimer = null;

    if (state.chatReloadVisibilityObserver) {
        state.chatReloadVisibilityObserver.disconnect();
        state.chatReloadVisibilityObserver = null;
    }
}

function isRegexPanelVisible() {
    const extensionsPanel = document.querySelector(REGEX_EXTENSIONS_PANEL_SELECTOR);

    if (!isRegexReloadVisibilityElementVisible(extensionsPanel)) {
        return false;
    }

    return true;
}

function isRegexReloadVisibilityElementVisible(element) {
    if (!(element instanceof HTMLElement) || !element.isConnected || element.getClientRects().length === 0) {
        return false;
    }

    const style = getComputedStyle(element);
    return style.display !== 'none' && style.visibility !== 'hidden';
}

async function reloadCurrentChatForRegexChange() {
    if (getCurrentChatId()) {
        await reloadCurrentChat();
    }
}

export {
    allowRegexScriptTypeAfterEditSave,
    checkPendingRegexChatReload,
    createPendingRegexScriptSaveEntry,
    flushPendingRegexChanges,
    flushPendingRegexChatReload,
    flushPendingRegexPresetGroupSave,
    flushPendingRegexScriptSave,
    getRegexChatReloadVisibilityTargets,
    hasPendingRegexChanges,
    installRegexChatReloadVisibilityObserver,
    isRegexPanelVisible,
    isRegexReloadVisibilityElementVisible,
    markRegexGroupSettingsSavePending,
    markRegexScriptListSavePending,
    queueRegexChatReloadAfterPanelClose,
    reloadCurrentChatForRegexChange,
    removeRegexChatReloadVisibilityWatch,
    saveRegexScriptList,
    schedulePendingRegexChangesFlushCheck,
    scheduleRegexChatReloadVisibilityCheck,
};
