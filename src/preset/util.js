import * as scriptModule from '@sillytavern/script';
import * as groupChatsModule from '@sillytavern/scripts/group-chats';
import { oai_settings } from '@sillytavern/scripts/openai';
import { getPresetManager } from '@sillytavern/scripts/preset-manager';
import { settings } from './state.js';

function isPresetGenerationActive() {
    if (typeof scriptModule.isGenerating === 'function') {
        try {
            return Boolean(scriptModule.isGenerating());
        } catch {
            return false;
        }
    }

    return Boolean(scriptModule.is_send_press || groupChatsModule.is_group_generating);
}

function isPresetGroupingEnabled() {
    return settings.presetGroupingEnabled !== false;
}

function readCurrentPresetExtensionField(path) {
    const settingsValue = getObjectPath(oai_settings?.extensions, path);

    if (settingsValue !== null && settingsValue !== undefined) {
        return settingsValue;
    }

    const presetName = oai_settings?.preset_settings_openai;
    const presetManager = getPresetManager('openai');

    if (presetManager && presetName) {
        const preset = presetManager.getCompletionPresetByName?.(presetName);
        const presetValue = getObjectPath(preset?.extensions, path);

        if (presetValue !== null && presetValue !== undefined) {
            return presetValue;
        }
    }

    return null;
}

function getObjectPath(source, path) {
    if (!source || typeof source !== 'object') {
        return null;
    }

    return String(path || '')
        .split('.')
        .filter(Boolean)
        .reduce((value, key) => (value && typeof value === 'object' ? value[key] : undefined), source) ?? null;
}

function setObjectPath(target, path, value) {
    if (!target || typeof target !== 'object') {
        return;
    }

    const parts = String(path || '').split('.').filter(Boolean);
    let cursor = target;

    for (let index = 0; index < parts.length - 1; index++) {
        const key = parts[index];

        if (!cursor[key] || typeof cursor[key] !== 'object') {
            cursor[key] = {};
        }

        cursor = cursor[key];
    }

    cursor[parts[parts.length - 1]] = value;
}

function areStringArraysEqual(left, right) {
    return left.length === right.length && left.every((value, index) => value === right[index]);
}

function escapeCssSelectorValue(value) {
    const text = String(value);
    return typeof globalThis.CSS?.escape === 'function'
        ? globalThis.CSS.escape(text)
        : text.replace(/["\\]/g, '\\$&');
}

export {
    areStringArraysEqual,
    escapeCssSelectorValue,
    getObjectPath,
    isPresetGenerationActive,
    isPresetGroupingEnabled,
    readCurrentPresetExtensionField,
    setObjectPath,
};
