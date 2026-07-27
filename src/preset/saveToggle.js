import { oai_settings, promptManager } from '@sillytavern/scripts/openai';
import { INJECTION_POSITION } from '@sillytavern/scripts/PromptManager';
import { flushPresetPromptCodeMirrorEditor } from './codeMirror.js';
import { PRESET_PROMPT_MANAGER_LIST_SELECTOR, PRESET_PROMPT_MANAGER_SAVE_SELECTOR, PRESET_SAVE_HANDLER_KEY, PRESET_TOGGLE_HANDLER_KEY, refreshPromptManagerTokensDebounced } from './constants.js';
import { flushPendingPresetPromptChanges, getChatCompletionPresetFromSettings, getPresetPromptSaveRevision, markOpenAiPresetSavePending, markPresetPromptServiceSettingsSavePending, saveOpenAiPresetSnapshot, syncOpenAiPromptManagerStateToSettings, updatePresetVuePromptItemEnabled } from './pendingChanges.js';
import { LOG_PREFIX, extensionState, settings } from './state.js';
import { updatePresetEffectiveTokenHeaderDisplay } from './switchFast.js';
import { isPresetGroupingEnabled } from './util.js';
import { isPresetVuePromptListManagerActive, markPresetVuePromptListSyncSignatureCurrent } from './vueList.js';

function applyPresetToggleOptimization() {
    if (!extensionState[PRESET_TOGGLE_HANDLER_KEY]) {
        const handler = (event) => {
            handlePresetPromptToggleClick(event);
        };

        extensionState[PRESET_TOGGLE_HANDLER_KEY] = handler;
        document.addEventListener('click', handler, true);
    }
}

function applyPresetSaveOptimization() {
    if (extensionState[PRESET_SAVE_HANDLER_KEY]) {
        return;
    }

    const handler = (event) => {
        handlePresetPromptSaveClick(event);
    };

    extensionState[PRESET_SAVE_HANDLER_KEY] = handler;
    document.addEventListener('click', handler, true);
}

function handlePresetPromptToggleClick(event) {
    // 分组模式下的条目列表由插件自行渲染(Vue),开关按钮没有 ST 原生 click 监听,
    // 只能靠此委托处理器响应。因此开启分组时也必须处理,即使 toggle 优化开关本身是关的。
    if (!settings.presetToggleOptimizationEnabled && !isPresetGroupingEnabled()) {
        return;
    }

    const target = event.target instanceof Element ? event.target : null;
    const toggle = target?.closest(`${PRESET_PROMPT_MANAGER_LIST_SELECTOR} .prompt-manager-toggle-action`);

    if (!toggle) {
        return;
    }

    const row = toggle.closest('li.completion_prompt_manager_prompt');
    const promptId = row?.dataset?.pmIdentifier;

    if (!row || !promptId || !promptManager?.activeCharacter || typeof promptManager.getPromptOrderEntry !== 'function') {
        return;
    }

    const promptOrderEntry = promptManager.getPromptOrderEntry(promptManager.activeCharacter, promptId);

    if (!promptOrderEntry) {
        return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    promptOrderEntry.enabled = !promptOrderEntry.enabled;

    for (const promptRow of findPromptManagerRows(promptId)) {
        updatePromptToggleRow(promptRow, promptRow.querySelector('.prompt-manager-toggle-action'), promptOrderEntry.enabled);
    }

    // DOM 与 Vue model 已就地同步;若成功,刷新签名基线,
    // 避免随后的 token 刷新把这次结构变更当作需要整列重建。
    const vueUpdated = updatePresetVuePromptItemEnabled(promptId, promptOrderEntry.enabled);
    if (vueUpdated && isPresetVuePromptListManagerActive()) {
        markPresetVuePromptListSyncSignatureCurrent();
    }
    updatePresetEffectiveTokenHeaderDisplay();
    markPresetPromptServiceSettingsSavePending();
    markOpenAiPresetSavePending();

    refreshPromptManagerTokensDebounced();
}

function handlePresetPromptSaveClick(event) {
    const target = event.target instanceof Element ? event.target : null;
    const saveButton = target?.closest(PRESET_PROMPT_MANAGER_SAVE_SELECTOR);

    if (!saveButton) {
        return;
    }

    flushPresetPromptCodeMirrorEditor('optimized save click');

    if (!settings.presetToggleOptimizationEnabled || !promptManager || typeof promptManager.getPromptById !== 'function') {
        scheduleOpenAiPresetSaveAfterPromptEdit();
        return;
    }

    const promptId = saveButton.dataset.pmPrompt;
    const prompt = promptId ? promptManager.getPromptById(promptId) : null;

    if (!prompt || typeof promptManager.updatePromptWithPromptEditForm !== 'function') {
        scheduleOpenAiPresetSaveAfterPromptEdit();
        return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    promptManager.updatePromptWithPromptEditForm(prompt);
    markOpenAiPresetSavePending();
    updateQuickEditPrompt(promptId, prompt);
    updatePromptManagerRowFromPrompt(prompt);
    promptManager.hidePopup?.();
    promptManager.clearEditForm?.();

    void saveOpenAiPresetAfterPromptEdit({ allowPresetAutoSave: true })
        .catch(error => {
            console.debug(`${LOG_PREFIX} Failed to save prompt edits`, error);
        });

    refreshPromptManagerTokensDebounced();
}

function scheduleOpenAiPresetSaveAfterPromptEdit() {
    setTimeout(() => {
        void saveOpenAiPresetAfterPromptEdit({ allowPresetAutoSave: true })
            .catch(error => {
                console.debug(`${LOG_PREFIX} Failed to prepare prompt edit preset save`, error);
            });
    }, 0);
}

async function saveOpenAiPresetAfterPromptEdit({ allowPresetAutoSave = false } = {}) {
    markPresetPromptServiceSettingsSavePending();
    markOpenAiPresetSavePending();

    if (!allowPresetAutoSave || !settings.presetAutoSaveAfterPromptEditEnabled) {
        return false;
    }

    await flushPendingPresetPromptChanges({ includeOpenAiPresetSaves: true });
    return true;
}

async function triggerOpenAiPresetUpdateAndWait(presetName = oai_settings?.preset_settings_openai) {
    syncOpenAiPromptManagerStateToSettings();
    const revision = getPresetPromptSaveRevision(presetName);
    const presetSnapshot = getChatCompletionPresetFromSettings(oai_settings);
    await saveOpenAiPresetSnapshot(presetName, presetSnapshot, { revision });
}

function waitForOpenAiPresetUpdateRequest(presetName) {
    if (typeof globalThis.fetch !== 'function') {
        return waitForOpenAiPresetUpdateFallback();
    }

    const originalFetch = globalThis.fetch;
    let captured = false;
    let settled = false;
    let timeout = 0;

    return new Promise((resolve, reject) => {
        const cleanup = () => {
            if (globalThis.fetch === patchedFetch) {
                globalThis.fetch = originalFetch;
            }

            if (timeout) {
                clearTimeout(timeout);
                timeout = 0;
            }
        };

        const settle = (handler, value) => {
            if (settled) {
                return;
            }

            settled = true;
            cleanup();
            handler(value);
        };

        const patchedFetch = function (...args) {
            const result = originalFetch.apply(this, args);

            if (!captured && isOpenAiPresetSaveRequest(args[0], args[1], presetName)) {
                captured = true;
                Promise.resolve(result)
                    .then(response => {
                        if (response?.ok) {
                            settle(resolve, true);
                            return;
                        }

                        settle(reject, new Error('OpenAI preset update request failed'));
                    })
                    .catch(error => settle(reject, error));
            }

            return result;
        };

        globalThis.fetch = patchedFetch;
        timeout = setTimeout(() => settle(resolve, false), 1200);
    });
}

function isOpenAiPresetSaveRequest(resource, init, presetName) {
    const url = typeof resource === 'string'
        ? resource
        : typeof resource?.url === 'string'
            ? resource.url
            : '';

    if (!url.includes('/api/presets/save')) {
        return false;
    }

    const method = String(init?.method || resource?.method || 'GET').toUpperCase();
    if (method !== 'POST') {
        return false;
    }

    if (typeof init?.body !== 'string') {
        return true;
    }

    try {
        const payload = JSON.parse(init.body);

        if (payload?.apiId && payload.apiId !== 'openai') {
            return false;
        }

        if (presetName && payload?.name && payload.name !== presetName) {
            return false;
        }
    } catch {
        return true;
    }

    return true;
}

function waitForOpenAiPresetUpdateFallback() {
    return new Promise(resolve => setTimeout(resolve, 1200));
}

function updatePromptToggleRow(row, toggle, isEnabled) {
    row.classList.toggle('completion_prompt_manager_prompt_disabled', !isEnabled);

    if (toggle) {
        toggle.classList.toggle('fa-toggle-on', isEnabled);
        toggle.classList.toggle('fa-toggle-off', !isEnabled);
    }
}

function updatePromptTokenCell(row, value, warning = null) {
    const tokenCell = row.querySelector('.prompt_manager_prompt_tokens');

    if (!tokenCell) {
        return;
    }

    const warningClass = warning?.warningClass ?? '';
    const warningTitle = warning?.warningTitle ?? '';
    const displayValue = value ? String(value) : '-';
    const existingWarning = tokenCell.querySelector('span');
    if (tokenCell.dataset.pmTokens === displayValue
        && tokenCell.textContent?.trim() === displayValue
        && (existingWarning?.className ?? '') === warningClass
        && (existingWarning?.title ?? '') === warningTitle) {
        return;
    }

    const warningSpan = existingWarning ?? document.createElement('span');
    warningSpan.className = warningClass;
    warningSpan.title = warningTitle;
    warningSpan.textContent = ' ';
    tokenCell.dataset.pmTokens = displayValue;
    tokenCell.replaceChildren(warningSpan, document.createTextNode(displayValue));
}

function updateQuickEditPrompt(promptId, prompt) {
    if (!['main', 'nsfw', 'jailbreak'].includes(promptId)) {
        return;
    }

    promptManager.updateQuickEdit?.(promptId, prompt);
}

function updatePromptManagerRowFromPrompt(prompt) {
    const rows = findPromptManagerRows(prompt.identifier);

    if (!rows.length) {
        return;
    }

    const listEntry = promptManager.getPromptOrderEntry?.(promptManager.activeCharacter, prompt.identifier);
    const isEnabled = listEntry?.enabled ?? true;
    const isImportantPrompt = !prompt.marker && prompt.system_prompt && prompt.injection_position !== INJECTION_POSITION.ABSOLUTE && prompt.forbid_overrides;

    for (const row of rows) {
        row.classList.toggle('completion_prompt_manager_prompt_disabled', !isEnabled);
        row.classList.toggle('completion_prompt_manager_marker', Boolean(prompt.marker));
        row.classList.toggle('completion_prompt_manager_important', Boolean(isImportantPrompt));

        const nameContainer = row.querySelector('.completion_prompt_manager_prompt_name');

        if (nameContainer) {
            renderPromptNameCell(nameContainer, prompt, {
                allowInspect: row.dataset.presetFavoriteMirror !== 'true',
            });
        }

        updatePromptTokenCell(row, null);
    }
}

function findPromptManagerRow(promptId) {
    return findPromptManagerRows(promptId)[0] ?? null;
}

function findPromptManagerRows(promptId) {
    const list = document.querySelector(PRESET_PROMPT_MANAGER_LIST_SELECTOR);

    if (!list) {
        return [];
    }

    return Array.from(list.querySelectorAll('li.completion_prompt_manager_prompt[data-pm-identifier]'))
        .filter(row => row.dataset.pmIdentifier === promptId);
}

function renderPromptNameCell(container, prompt, { allowInspect = true } = {}) {
    const promptName = prompt.name ?? '';
    const isMarkerPrompt = prompt.marker && prompt.injection_position !== INJECTION_POSITION.ABSOLUTE;
    const isSystemPrompt = !prompt.marker && prompt.system_prompt && prompt.injection_position !== INJECTION_POSITION.ABSOLUTE && !prompt.forbid_overrides;
    const isImportantPrompt = !prompt.marker && prompt.system_prompt && prompt.injection_position !== INJECTION_POSITION.ABSOLUTE && prompt.forbid_overrides;
    const isUserPrompt = !prompt.marker && !prompt.system_prompt && prompt.injection_position !== INJECTION_POSITION.ABSOLUTE;
    const isInjectionPrompt = prompt.injection_position === INJECTION_POSITION.ABSOLUTE;
    const isOverriddenPrompt = Array.isArray(promptManager.overriddenPrompts) && promptManager.overriddenPrompts.includes(prompt.identifier);
    const iconLookup = prompt.role === 'system' && (prompt.marker || prompt.system_prompt) ? '' : prompt.role;
    const promptRoles = {
        assistant: { roleIcon: 'fa-robot', roleTitle: 'Prompt will be sent as Assistant' },
        user: { roleIcon: 'fa-user', roleTitle: 'Prompt will be sent as User' },
    };
    const role = promptRoles[iconLookup];

    container.dataset.pmName = promptName;
    container.replaceChildren();

    if (isMarkerPrompt) appendIcon(container, 'fa-fw fa-solid fa-thumb-tack', 'Marker');
    if (isSystemPrompt) appendIcon(container, 'fa-fw fa-solid fa-square-poll-horizontal', 'Global Prompt');
    if (isImportantPrompt) appendIcon(container, 'fa-fw fa-solid fa-star', 'Important Prompt');
    if (isUserPrompt) appendIcon(container, 'fa-fw fa-solid fa-asterisk', 'Preset Prompt');
    if (isInjectionPrompt) appendIcon(container, 'fa-fw fa-solid fa-syringe', 'In-Chat Injection');

    const canInspect = promptManager.isPromptInspectionAllowed?.(prompt);
    const nameElement = document.createElement(allowInspect && canInspect ? 'a' : 'span');
    nameElement.title = promptName;
    nameElement.textContent = promptName;

    if (nameElement instanceof HTMLAnchorElement) {
        nameElement.className = 'prompt-manager-inspect-action';
        nameElement.addEventListener('click', promptManager.handleInspect);
    } else if (canInspect) {
        nameElement.className = 'prompt-manager-inspect-action bai-bai-preset-prompt-name-visual-only';
    }

    container.append(nameElement);

    if (role) {
        const roleIcon = document.createElement('span');
        roleIcon.dataset.role = prompt.role;
        roleIcon.className = `fa-xs fa-solid ${role.roleIcon}`;
        roleIcon.title = role.roleTitle;
        container.append(document.createTextNode(' '), roleIcon);
    }

    if (isInjectionPrompt) {
        const depth = document.createElement('small');
        depth.className = 'prompt-manager-injection-depth';
        depth.textContent = `@ ${prompt.injection_depth}`;
        container.append(document.createTextNode(' '), depth);
    }

    if (isOverriddenPrompt) {
        const overridden = document.createElement('small');
        overridden.className = 'fa-solid fa-address-card prompt-manager-overridden';
        overridden.title = 'Pulled from a character card';
        container.append(document.createTextNode(' '), overridden);
    }
}

function appendIcon(container, className, title) {
    const icon = document.createElement('span');
    icon.className = className;
    icon.title = title;
    container.append(icon, document.createTextNode(' '));
}

export {
    appendIcon,
    applyPresetSaveOptimization,
    applyPresetToggleOptimization,
    findPromptManagerRow,
    findPromptManagerRows,
    handlePresetPromptSaveClick,
    handlePresetPromptToggleClick,
    isOpenAiPresetSaveRequest,
    renderPromptNameCell,
    saveOpenAiPresetAfterPromptEdit,
    scheduleOpenAiPresetSaveAfterPromptEdit,
    triggerOpenAiPresetUpdateAndWait,
    updatePromptManagerRowFromPrompt,
    updatePromptToggleRow,
    updatePromptTokenCell,
    updateQuickEditPrompt,
    waitForOpenAiPresetUpdateFallback,
    waitForOpenAiPresetUpdateRequest,
};
