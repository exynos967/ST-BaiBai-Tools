import { getRequestHeaders, saveSettingsDebounced } from '../../../../script.js';
import { AutoComplete } from '../../../autocomplete/AutoComplete.js';
import { extension_settings, renderExtensionTemplateAsync } from '../../../extensions.js';
import { promptManager } from '../../../openai.js';
import { INJECTION_POSITION } from '../../../PromptManager.js';
import { isMobile, favsToHotswap } from '../../../RossAscends-mods.js';
import { power_user } from '../../../power-user.js';
import { debounce, timestampToMoment } from '../../../utils.js';

const LOG_PREFIX = '[柏宝箱]';
const MODULE_NAME = getModuleName();
const SETTINGS_KEY = 'baiBaiToolkit';
const EXTENSION_KEY = '__baiBaiToolkitExtensionInstalled';
const FAST_CHAT_SEARCH_FETCH_KEY = '__baiBaiToolkitFastChatSearchFetchPatched';
const FAST_CHAT_LIST_SCROLL_STYLE_ID = 'bai_bai_toolkit_fast_chat_list_scroll_style';
const PRESET_SCROLL_STYLE_ID = 'bai_bai_toolkit_preset_scroll_style';
const PRESET_TOGGLE_HANDLER_KEY = '__baiBaiToolkitPresetToggleHandler';
const PRESET_SAVE_HANDLER_KEY = '__baiBaiToolkitPresetSaveHandler';
const CHAT_MANAGEMENT_POPUP_SELECTOR = '#shadow_select_chat_popup';
const CHAT_MANAGEMENT_LIST_SELECTOR = '#select_chat_div';
const PRESET_PROMPT_MANAGER_LIST_SELECTOR = '#completion_prompt_manager_list';
const PRESET_PROMPT_MANAGER_SAVE_SELECTOR = '#completion_prompt_manager_popup_entry_form_save';
const defaultSettings = {
    resizeGuardEnabled: true,
    fastChatListEnabled: true,
    chatListScrollOptimizationEnabled: true,
    chatListAutoClearEnabled: true,
    presetScrollOptimizationEnabled: true,
    presetToggleOptimizationEnabled: true,
};
const settings = { ...defaultSettings };
let fastChatListRequestId = 0;

const extensionState = getExtensionState();

initializeSettings();

if (!extensionState.installed) {
    extensionState.installed = true;
    patchFastChatSearchFetch();
    console.debug(`${LOG_PREFIX} Installed`);
}

observeChatManagementPopupCleanup();
applyFeatureSettings();
jQuery(renderSettingsPanel);

function getExtensionState() {
    if (!globalThis[EXTENSION_KEY] || typeof globalThis[EXTENSION_KEY] !== 'object') {
        globalThis[EXTENSION_KEY] = {};
    }

    return globalThis[EXTENSION_KEY];
}

function getModuleName() {
    const extensionPathMarker = '/scripts/extensions/';
    const currentUrl = new URL(import.meta.url);
    const currentPath = decodeURIComponent(currentUrl.pathname.replace(/\\/g, '/'));
    const markerIndex = currentPath.indexOf(extensionPathMarker);

    if (markerIndex === -1) {
        return 'third-party/SillyTavern-Mobile-Resize-Guard';
    }

    return currentPath
        .slice(markerIndex + extensionPathMarker.length)
        .replace(/\/index\.js$/i, '');
}

function initializeSettings() {
    if (!extension_settings[SETTINGS_KEY] || typeof extension_settings[SETTINGS_KEY] !== 'object') {
        extension_settings[SETTINGS_KEY] = {};
    }

    for (const [key, value] of Object.entries(defaultSettings)) {
        if (typeof extension_settings[SETTINGS_KEY][key] !== typeof value) {
            extension_settings[SETTINGS_KEY][key] = value;
        }
    }

    Object.assign(settings, defaultSettings, extension_settings[SETTINGS_KEY]);
}

function saveExtensionSettings() {
    Object.assign(extension_settings[SETTINGS_KEY], settings);
    saveSettingsDebounced();
}

async function renderSettingsPanel() {
    const root = $('#extensions_settings2');

    if (!root.length) {
        return;
    }

    let container = $('#bai_bai_toolkit_container');

    if (!container.length) {
        container = $('<div id="bai_bai_toolkit_container" class="extension_container"></div>');
        root.append(container);
    }

    const template = await renderExtensionTemplateAsync(MODULE_NAME, 'settings');
    container.empty().append(template);

    $('#bai_bai_toolkit_resize_guard_enabled')
        .prop('checked', settings.resizeGuardEnabled)
        .on('input', function () {
            settings.resizeGuardEnabled = Boolean($(this).prop('checked'));
            saveExtensionSettings();
            applyFeatureSettings();
        });

    $('#bai_bai_toolkit_fast_chat_list_enabled')
        .prop('checked', settings.fastChatListEnabled)
        .on('input', function () {
            settings.fastChatListEnabled = Boolean($(this).prop('checked'));
            saveExtensionSettings();
        });

    $('#bai_bai_toolkit_chat_list_scroll_optimization_enabled')
        .prop('checked', settings.chatListScrollOptimizationEnabled)
        .on('input', function () {
            settings.chatListScrollOptimizationEnabled = Boolean($(this).prop('checked'));
            saveExtensionSettings();
            applyFastChatListScrollOptimization();
        });

    $('#bai_bai_toolkit_chat_list_auto_clear_enabled')
        .prop('checked', settings.chatListAutoClearEnabled)
        .on('input', function () {
            settings.chatListAutoClearEnabled = Boolean($(this).prop('checked'));
            saveExtensionSettings();
        });

    $('#bai_bai_toolkit_preset_scroll_optimization_enabled')
        .prop('checked', settings.presetScrollOptimizationEnabled)
        .on('input', function () {
            settings.presetScrollOptimizationEnabled = Boolean($(this).prop('checked'));
            saveExtensionSettings();
            applyPresetScrollOptimization();
        });

    $('#bai_bai_toolkit_preset_toggle_optimization_enabled')
        .prop('checked', settings.presetToggleOptimizationEnabled)
        .on('input', function () {
            settings.presetToggleOptimizationEnabled = Boolean($(this).prop('checked'));
            saveExtensionSettings();
            applyPresetToggleOptimization();
            applyPresetSaveOptimization();
        });
}

function applyFeatureSettings() {
    if (settings.resizeGuardEnabled) {
        patchAutoCompletePositioning();
        patchPowerUserResizeHandler();
    } else {
        restoreAutoCompletePositioning();
        restorePowerUserResizeHandler();
    }

    applyFastChatListScrollOptimization();
    applyPresetScrollOptimization();
    applyPresetToggleOptimization();
    applyPresetSaveOptimization();
}

function applyFastChatListScrollOptimization() {
    const existingStyle = document.getElementById(FAST_CHAT_LIST_SCROLL_STYLE_ID);

    if (!settings.chatListScrollOptimizationEnabled) {
        existingStyle?.remove();
        return;
    }

    if (existingStyle) {
        return;
    }

    const style = document.createElement('style');
    style.id = FAST_CHAT_LIST_SCROLL_STYLE_ID;
    style.textContent = `
${CHAT_MANAGEMENT_POPUP_SELECTOR} ${CHAT_MANAGEMENT_LIST_SELECTOR} > .select_chat_block_wrapper {
    content-visibility: auto;
    contain: layout paint style;
    contain-intrinsic-size: 72px;
}
`;
    document.head.append(style);
}

function applyPresetScrollOptimization() {
    const existingStyle = document.getElementById(PRESET_SCROLL_STYLE_ID);

    if (!settings.presetScrollOptimizationEnabled) {
        existingStyle?.remove();
        return;
    }

    if (existingStyle) {
        existingStyle.textContent = getPresetScrollOptimizationCss();
        return;
    }

    const style = document.createElement('style');
    style.id = PRESET_SCROLL_STYLE_ID;
    style.textContent = getPresetScrollOptimizationCss();
    document.head.append(style);
}

function getPresetScrollOptimizationCss() {
    return `
${PRESET_PROMPT_MANAGER_LIST_SELECTOR} > li.completion_prompt_manager_prompt {
    contain: paint style;
}
`;
}

function applyPresetToggleOptimization() {
    if (extensionState[PRESET_TOGGLE_HANDLER_KEY]) {
        return;
    }

    const handler = (event) => {
        handlePresetPromptToggleClick(event);
    };

    extensionState[PRESET_TOGGLE_HANDLER_KEY] = handler;
    document.addEventListener('click', handler, true);
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
    if (!settings.presetToggleOptimizationEnabled) {
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

    const counts = promptManager.tokenHandler?.getCounts?.();

    if (counts) {
        counts[promptId] = null;
    }

    updatePromptToggleRow(row, toggle, promptOrderEntry.enabled);
    updatePromptTokenCell(row, null);
    void Promise.resolve(promptManager.saveServiceSettings?.()).catch(error => {
        console.debug(`${LOG_PREFIX} Failed to save prompt toggle state`, error);
    });

    refreshPromptManagerTokensDebounced();
}

function handlePresetPromptSaveClick(event) {
    if (!settings.presetToggleOptimizationEnabled) {
        return;
    }

    const target = event.target instanceof Element ? event.target : null;
    const saveButton = target?.closest(PRESET_PROMPT_MANAGER_SAVE_SELECTOR);

    if (!saveButton || !promptManager || typeof promptManager.getPromptById !== 'function') {
        return;
    }

    const promptId = saveButton.dataset.pmPrompt;
    const prompt = promptId ? promptManager.getPromptById(promptId) : null;

    if (!prompt || typeof promptManager.updatePromptWithPromptEditForm !== 'function') {
        return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    promptManager.updatePromptWithPromptEditForm(prompt);
    updateQuickEditPrompt(promptId, prompt);
    updatePromptManagerRowFromPrompt(prompt);
    promptManager.hidePopup?.();
    promptManager.clearEditForm?.();

    void Promise.resolve(promptManager.saveServiceSettings?.()).catch(error => {
        console.debug(`${LOG_PREFIX} Failed to save prompt edits`, error);
    });

    refreshPromptManagerTokensDebounced();
}

function updatePromptToggleRow(row, toggle, isEnabled) {
    row.classList.toggle('completion_prompt_manager_prompt_disabled', !isEnabled);
    toggle.classList.toggle('fa-toggle-on', isEnabled);
    toggle.classList.toggle('fa-toggle-off', !isEnabled);
}

function updatePromptTokenCell(row, value) {
    const tokenCell = row.querySelector('.prompt_manager_prompt_tokens');

    if (!tokenCell) {
        return;
    }

    const displayValue = value ? String(value) : '-';
    const warningSpan = tokenCell.querySelector('span') ?? document.createElement('span');
    warningSpan.className = '';
    warningSpan.title = '';
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
    const row = findPromptManagerRow(prompt.identifier);

    if (!row) {
        return;
    }

    const listEntry = promptManager.getPromptOrderEntry?.(promptManager.activeCharacter, prompt.identifier);
    const isEnabled = listEntry?.enabled ?? true;
    const isImportantPrompt = !prompt.marker && prompt.system_prompt && prompt.injection_position !== INJECTION_POSITION.ABSOLUTE && prompt.forbid_overrides;

    row.classList.toggle('completion_prompt_manager_prompt_disabled', !isEnabled);
    row.classList.toggle('completion_prompt_manager_marker', Boolean(prompt.marker));
    row.classList.toggle('completion_prompt_manager_important', Boolean(isImportantPrompt));

    const nameContainer = row.querySelector('.completion_prompt_manager_prompt_name');

    if (nameContainer) {
        renderPromptNameCell(nameContainer, prompt);
    }

    updatePromptTokenCell(row, null);
}

function findPromptManagerRow(promptId) {
    const list = document.querySelector(PRESET_PROMPT_MANAGER_LIST_SELECTOR);

    if (!list) {
        return null;
    }

    return Array.from(list.querySelectorAll('li.completion_prompt_manager_prompt[data-pm-identifier]'))
        .find(row => row.dataset.pmIdentifier === promptId) ?? null;
}

function renderPromptNameCell(container, prompt) {
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

    const nameElement = document.createElement(promptManager.isPromptInspectionAllowed?.(prompt) ? 'a' : 'span');
    nameElement.title = promptName;
    nameElement.textContent = promptName;

    if (nameElement instanceof HTMLAnchorElement) {
        nameElement.className = 'prompt-manager-inspect-action';
        nameElement.addEventListener('click', promptManager.handleInspect);
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

const refreshPromptManagerTokensDebounced = debounce(async () => {
    if (!settings.presetToggleOptimizationEnabled || !promptManager?.tryGenerate) {
        return;
    }

    try {
        await promptManager.tryGenerate();
        updatePromptManagerTokenDisplay();
    } catch (error) {
        console.debug(`${LOG_PREFIX} Failed to refresh prompt manager token counts`, error);
    }
}, 1000);

function updatePromptManagerTokenDisplay() {
    const counts = promptManager?.tokenHandler?.getCounts?.();
    const list = document.querySelector(PRESET_PROMPT_MANAGER_LIST_SELECTOR);

    if (!counts || !list) {
        return;
    }

    for (const row of list.querySelectorAll('li.completion_prompt_manager_prompt[data-pm-identifier]')) {
        updatePromptTokenCell(row, counts[row.dataset.pmIdentifier] ?? 0);
    }

    const header = document.querySelector('.completion_prompt_manager_header');
    const totalContainer = header?.querySelector(':scope > div:last-child');
    const totalLabel = totalContainer?.querySelector('span');

    if (totalContainer && totalLabel) {
        totalContainer.replaceChildren(totalLabel, document.createTextNode(` ${promptManager.tokenUsage ?? 0} `));
    }
}

function patchAutoCompletePositioning() {
    const originalUpdatePosition = AutoComplete.prototype.updatePosition;

    if (typeof originalUpdatePosition !== 'function' || originalUpdatePosition.__mobileResizeGuardPatched) {
        return;
    }

    function guardedUpdatePosition(...args) {
        if (!this.isActive) {
            return;
        }

        return originalUpdatePosition.apply(this, args);
    }

    guardedUpdatePosition.__mobileResizeGuardPatched = true;
    guardedUpdatePosition.__mobileResizeGuardOriginal = originalUpdatePosition;
    extensionState.originalAutoCompleteUpdatePosition = originalUpdatePosition;
    AutoComplete.prototype.updatePosition = guardedUpdatePosition;
}

function restoreAutoCompletePositioning() {
    const currentUpdatePosition = AutoComplete.prototype.updatePosition;

    if (currentUpdatePosition?.__mobileResizeGuardPatched) {
        AutoComplete.prototype.updatePosition = currentUpdatePosition.__mobileResizeGuardOriginal;
    }
}

function patchPowerUserResizeHandler() {
    if (extensionState.powerUserResizeReplacement) {
        return;
    }

    const resizeHandlers = $._data(window, 'events')?.resize;

    if (!Array.isArray(resizeHandlers)) {
        console.warn(`${LOG_PREFIX} Window resize handlers are unavailable`);
        return;
    }

    const stockHandlerEntry = resizeHandlers.find(({ handler }) => isPowerUserResizeHandler(handler));

    if (!stockHandlerEntry) {
        console.warn(`${LOG_PREFIX} Could not locate the stock power-user resize handler`);
        return;
    }

    $(window).off('resize', stockHandlerEntry.handler);
    extensionState.originalPowerUserResizeHandler = stockHandlerEntry.handler;

    const adjustAutocompleteDebounced = debounce(() => {
        $('.ui-autocomplete-input').each(function () {
            try {
                const widget = $(this).autocomplete('widget')?.[0];
                const isOpen = widget?.style.display !== 'none';

                if (isOpen) {
                    $(this).autocomplete('search');
                }
            } catch {
                // Ignore detached or no-longer-initialized widgets.
            }
        });
    });

    const setHotswapsDebounced = debounce(favsToHotswap);
    const reportZoomLevelDebounced = debounce(() => {
        const zoomLevel = parseFloat(Number(window.devicePixelRatio).toFixed(2)) || 1;
        const winWidth = window.innerWidth;
        const winHeight = window.innerHeight;
        const originalWidth = winWidth * zoomLevel;
        const originalHeight = winHeight * zoomLevel;
        console.debug(`${LOG_PREFIX} Window resize: ${coreTruthWinWidth}x${coreTruthWinHeight} -> ${window.innerWidth}x${window.innerHeight}`);
        console.debug(`${LOG_PREFIX} Zoom: ${zoomLevel}, X:${winWidth}, Y:${winHeight}, original: ${originalWidth}x${originalHeight}`);
        return zoomLevel;
    });

    let coreTruthWinWidth = window.innerWidth;
    let coreTruthWinHeight = window.innerHeight;

    const replacementHandler = async () => {
        if (isMobile()) {
            return;
        }

        adjustAutocompleteDebounced();
        setHotswapsDebounced();
        reportZoomLevelDebounced();

        const scaleY = parseFloat(Number(window.innerHeight / coreTruthWinHeight).toFixed(4));
        const scaleX = parseFloat(Number(window.innerWidth / coreTruthWinWidth).toFixed(4));

        if (Object.keys(power_user.movingUIState).length > 0) {
            for (const elmntName of Object.keys(power_user.movingUIState)) {
                const elmntState = power_user.movingUIState[elmntName];
                const oldHeight = elmntState.height;
                const oldWidth = elmntState.width;
                const oldLeft = elmntState.left;
                const oldTop = elmntState.top;
                const oldBottom = elmntState.bottom;
                const oldRight = elmntState.right;

                const newHeight = Number(oldHeight * scaleY).toFixed(0);
                const newWidth = Number(oldWidth * scaleX).toFixed(0);
                const newLeft = Number(oldLeft * scaleX).toFixed(0);
                const newTop = Number(oldTop * scaleY).toFixed(0);
                const newBottom = Number(oldBottom * scaleY).toFixed(0);
                const newRight = Number(oldRight * scaleX).toFixed(0);

                try {
                    const elmnt = $('#' + $.escapeSelector(elmntName));

                    if (elmnt.length) {
                        elmnt.css('height', newHeight);
                        elmnt.css('width', newWidth);
                        elmnt.css('inset', `${newTop}px ${newRight}px ${newBottom}px ${newLeft}px`);
                        power_user.movingUIState[elmntName].height = newHeight;
                        power_user.movingUIState[elmntName].width = newWidth;
                        power_user.movingUIState[elmntName].top = newTop;
                        power_user.movingUIState[elmntName].bottom = newBottom;
                        power_user.movingUIState[elmntName].left = newLeft;
                        power_user.movingUIState[elmntName].right = newRight;
                    }
                } catch (error) {
                    console.debug(`${LOG_PREFIX} Failed to rescale moving UI element`, elmntName, error);
                }
            }
        }

        saveSettingsDebounced();
        coreTruthWinWidth = window.innerWidth;
        coreTruthWinHeight = window.innerHeight;
    };

    replacementHandler.__mobileResizeGuardReplacement = true;
    extensionState.powerUserResizeReplacement = replacementHandler;
    $(window).on('resize', replacementHandler);
}

function restorePowerUserResizeHandler() {
    const replacementHandler = extensionState.powerUserResizeReplacement;
    const originalHandler = extensionState.originalPowerUserResizeHandler;

    if (replacementHandler) {
        $(window).off('resize', replacementHandler);
        extensionState.powerUserResizeReplacement = null;
    }

    if (typeof originalHandler !== 'function') {
        return;
    }

    const resizeHandlers = $._data(window, 'events')?.resize;
    const hasOriginalHandler = Array.isArray(resizeHandlers)
        && resizeHandlers.some(({ handler }) => handler === originalHandler);

    if (!hasOriginalHandler) {
        $(window).on('resize', originalHandler);
    }
}

function isPowerUserResizeHandler(handler) {
    if (typeof handler !== 'function') {
        return false;
    }

    if (handler.__mobileResizeGuardReplacement) {
        return false;
    }

    const source = String(handler);
    return source.includes('adjustAutocompleteDebounced')
        && source.includes('setHotswapsDebounced')
        && source.includes('power_user.movingUIState');
}

function observeChatManagementPopupCleanup() {
    if (extensionState.chatManagementPopupObserver) {
        return;
    }

    const attachObserver = () => {
        const popup = document.querySelector(CHAT_MANAGEMENT_POPUP_SELECTOR);

        if (!popup) {
            return false;
        }

        let wasVisible = isElementDisplayed(popup);
        const observer = new MutationObserver(() => {
            const isVisible = isElementDisplayed(popup);

            if (wasVisible && !isVisible) {
                clearChatManagementPopupContent(popup);
            }

            wasVisible = isVisible;
        });

        observer.observe(popup, {
            attributes: true,
            attributeFilter: ['style', 'class'],
        });

        extensionState.chatManagementPopupObserver = observer;
        return true;
    };

    if (attachObserver()) {
        return;
    }

    const bodyObserver = new MutationObserver(() => {
        if (attachObserver()) {
            bodyObserver.disconnect();
            extensionState.chatManagementPopupAttachObserver = null;
        }
    });

    bodyObserver.observe(document.body, {
        childList: true,
        subtree: true,
    });

    extensionState.chatManagementPopupAttachObserver = bodyObserver;
}

function isElementDisplayed(element) {
    return getComputedStyle(element).display !== 'none';
}

function clearChatManagementPopupContent(popup) {
    if (!settings.chatListAutoClearEnabled) {
        return;
    }

    fastChatListRequestId += 1;

    const list = popup.querySelector(CHAT_MANAGEMENT_LIST_SELECTOR);

    if (!list || !list.children.length) {
        return;
    }

    list.replaceChildren();
}

function patchFastChatSearchFetch() {
    const originalFetch = globalThis.fetch;

    if (typeof originalFetch !== 'function' || originalFetch[FAST_CHAT_SEARCH_FETCH_KEY]) {
        return;
    }

    async function baiBaiToolkitFetch(input, init) {
        const requestData = await getFastChatSearchRequestData(input, init);

        if (requestData) {
            try {
                return await fetchFastCharacterChatList(originalFetch, requestData);
            } catch (error) {
                console.debug(`${LOG_PREFIX} Fast chat list path failed; falling back to /api/chats/search`, error);
            }
        }

        return originalFetch.apply(this, arguments);
    }

    baiBaiToolkitFetch[FAST_CHAT_SEARCH_FETCH_KEY] = true;
    baiBaiToolkitFetch.__baiBaiToolkitOriginalFetch = originalFetch;
    globalThis.fetch = baiBaiToolkitFetch;
}

async function getFastChatSearchRequestData(input, init) {
    if (!settings.fastChatListEnabled) {
        return null;
    }

    if (!isChatSearchUrl(input)) {
        return null;
    }

    const method = String(init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();

    if (method !== 'POST') {
        return null;
    }

    const body = await readJsonRequestBody(input, init);

    if (!body || typeof body !== 'object') {
        return null;
    }

    const query = String(body.query ?? '');
    const avatarUrl = body.avatar_url;
    const groupId = body.group_id;

    if (query.trim().length !== 0 || groupId || typeof avatarUrl !== 'string' || avatarUrl.length === 0) {
        return null;
    }

    return { avatarUrl };
}

function isChatSearchUrl(input) {
    try {
        const rawUrl = input instanceof Request ? input.url : String(input);
        const url = new URL(rawUrl, location.origin);
        return url.origin === location.origin && url.pathname === '/api/chats/search';
    } catch {
        return false;
    }
}

async function readJsonRequestBody(input, init) {
    const initBody = init?.body;

    if (typeof initBody === 'string') {
        return tryParseJson(initBody);
    }

    if (input instanceof Request) {
        try {
            return await input.clone().json().catch(() => null);
        } catch {
            return null;
        }
    }

    return null;
}

async function fetchFastCharacterChatList(fetchFn, { avatarUrl }) {
    const response = await fetchFn('/api/characters/chats', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({ avatar_url: avatarUrl, simple: true }),
    });

    if (!response.ok) {
        throw new Error(`Unexpected status ${response.status}`);
    }

    const chats = await response.json();
    const searchResults = Array.isArray(chats) ? chats.map(toPlaceholderChatSearchResult).filter(Boolean) : [];
    searchResults.sort((a, b) => getTimestampValue(b.last_mes) - getTimestampValue(a.last_mes));
    const requestId = ++fastChatListRequestId;

    setTimeout(() => {
        markFastChatRowsAsLoading(searchResults, requestId);
        void hydrateFastCharacterChatList(fetchFn, avatarUrl, requestId);
    }, 0);

    return new Response(JSON.stringify(searchResults), {
        status: 200,
        headers: {
            'Content-Type': 'application/json',
        },
    });
}

async function hydrateFastCharacterChatList(fetchFn, avatarUrl, requestId) {
    if (!isCurrentFastChatListRequest(requestId)) {
        return;
    }

    try {
        const chats = await fetchFullCharacterChatList(fetchFn, avatarUrl);
        applyHydratedChatRows(chats, requestId);
    } catch (error) {
        console.debug(`${LOG_PREFIX} Failed to hydrate full chat list metadata`, error);
    }
}

async function fetchFullCharacterChatList(fetchFn, avatarUrl) {
    const response = await fetchFn('/api/characters/chats', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({ avatar_url: avatarUrl }),
    });

    if (!response.ok) {
        throw new Error(`Unexpected status ${response.status}`);
    }

    const chats = await response.json();
    return Array.isArray(chats) ? chats.map(toChatSearchResult).filter(Boolean) : [];
}

function markFastChatRowsAsLoading(chats, requestId) {
    if (!isCurrentFastChatListRequest(requestId)) {
        return;
    }

    for (const chat of chats) {
        const row = findChatListRow(chat.file_name);

        if (!row.length) {
            continue;
        }

        row.find('.chat_file_size').text('(...,');
        row.find('.chat_messages_num').text('... 💬)');
    }
}

function applyHydratedChatRow(chat, requestId) {
    if (!isCurrentFastChatListRequest(requestId)) {
        return;
    }

    const row = findChatListRow(chat.file_name);

    if (!row.length) {
        return;
    }

    row.find('.chat_file_size').text(`(${chat.file_size},`);
    row.find('.chat_messages_num').text(`${chat.message_count} 💬)`);
    row.find('.select_chat_block_mes').text(chat.preview_message);
    row.find('.chat_messages_date').text(timestampToMoment(chat.last_mes).format('lll'));
}

function applyHydratedChatRows(chats, requestId) {
    if (!isCurrentFastChatListRequest(requestId)) {
        return;
    }

    const order = new Map();

    chats.forEach((chat, index) => {
        applyHydratedChatRow(chat, requestId);
        order.set(chat.file_name, {
            index,
            time: getTimestampValue(chat.last_mes),
        });
    });

    sortHydratedChatRows(order);
}

function sortHydratedChatRows(order) {
    const container = $('#select_chat_div');
    const rows = container.children('.select_chat_block_wrapper').get();

    rows.sort((left, right) => {
        const leftName = $(left).find('.select_chat_block').attr('file_name');
        const rightName = $(right).find('.select_chat_block').attr('file_name');
        const leftOrder = order.get(leftName) ?? { time: 0, index: Number.MAX_SAFE_INTEGER };
        const rightOrder = order.get(rightName) ?? { time: 0, index: Number.MAX_SAFE_INTEGER };

        return rightOrder.time - leftOrder.time || leftOrder.index - rightOrder.index;
    });

    container.append(rows);
}

function findChatListRow(fileName) {
    return $('#select_chat_div .select_chat_block')
        .filter((_, element) => $(element).attr('file_name') === fileName)
        .closest('.select_chat_block_wrapper');
}

function isCurrentFastChatListRequest(requestId) {
    return requestId === fastChatListRequestId && String($('#select_chat_search').val() ?? '').trim().length === 0;
}

function toPlaceholderChatSearchResult(chat) {
    if (!chat || typeof chat !== 'object') {
        return null;
    }

    const fileName = getChatSearchFileName(chat);

    if (!fileName) {
        return null;
    }

    return {
        file_name: fileName,
        file_size: '...',
        message_count: '...',
        last_mes: guessLastMesFromFileName(fileName),
        preview_message: '',
    };
}

function toChatSearchResult(chat) {
    if (!chat || typeof chat !== 'object') {
        return null;
    }

    const fileName = getChatSearchFileName(chat);

    if (!fileName) {
        return null;
    }

    const messageCount = Number(chat.chat_items);

    return {
        file_name: fileName,
        file_size: chat.file_size ?? '',
        message_count: Number.isFinite(messageCount) ? messageCount : 0,
        last_mes: normalizeLastMes(chat.last_mes),
        preview_message: getPreviewMessage(chat.mes),
    };
}

function getChatSearchFileName(chat) {
    const value = typeof chat.file_id === 'string' && chat.file_id
        ? chat.file_id
        : chat.file_name;

    if (typeof value !== 'string') {
        return '';
    }

    return value.replace(/\.jsonl$/i, '');
}

function guessLastMesFromFileName(fileName) {
    const text = String(fileName).replace(/\.jsonl$/i, '');
    const match = text.match(/(\d{4})-(\d{1,2})-(\d{1,2})(?:\s*@|@|\s+)?(\d{1,2})h\s*(\d{1,2})m(?:\s*(\d{1,2})s)?(?:\s*(\d{1,3})ms)?/i);

    if (match) {
        const [, year, month, day, hour, minute, second = '0', millisecond = '0'] = match;
        const date = new Date(
            Number(year),
            Number(month) - 1,
            Number(day),
            Number(hour),
            Number(minute),
            Number(second),
            Number(millisecond),
        );

        if (!Number.isNaN(date.getTime())) {
            return date.toISOString();
        }
    }

    return new Date().toISOString();
}

function normalizeLastMes(value) {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return new Date(value).toISOString();
    }

    return value;
}

function getTimestampValue(value) {
    const timestamp = timestampToMoment(value).valueOf();
    return Number.isFinite(timestamp) ? timestamp : 0;
}

function getPreviewMessage(message) {
    const strlen = 400;

    if (typeof message !== 'string' || message === '[The chat is empty]' || message === '[The message is empty]') {
        return '';
    }

    return message.length > strlen
        ? '...' + message.substring(message.length - strlen)
        : message;
}

function tryParseJson(value) {
    try {
        return JSON.parse(value);
    } catch {
        return null;
    }
}
