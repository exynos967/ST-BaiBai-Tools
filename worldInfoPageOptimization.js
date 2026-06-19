import {
    chat_metadata,
    characters,
    event_types,
    eventSource,
    this_chid,
} from '../../../../script.js';
import { AutoComplete } from '../../../autocomplete/AutoComplete.js';
import { isMobile } from '../../../RossAscends-mods.js';
import { getCharaFilename, resetScrollHeight } from '../../../utils.js';
import { METADATA_KEY as WORLD_INFO_METADATA_KEY, selected_world_info, world_info, world_names } from '../../../world-info.js';

let settings = {};
let extensionState = {};
let LOG_PREFIX = '[BaiBaiToolkit]';
let saveWorldInfoPageOptimizationSettings = null;

const WORLD_INFO_PAGE_APPEND_PATCH_KEY = '__baiBaiToolkitWorldInfoPageAppendPatched';
const WORLD_INFO_FLOATING_AUTOCOMPLETE_PATCH_KEY = '__baiBaiToolkitWorldInfoFloatingAutocompletePatched';
const WORLD_INFO_DEFERRED_MACROS_DATASET_KEY = 'baiBaiToolkitWorldInfoDeferredMacros';
const WORLD_INFO_DEFERRED_MACROS_VALUE_DATASET_KEY = 'baiBaiToolkitWorldInfoDeferredMacrosValue';
const WORLD_INFO_CONTENT_TEXTAREA_SELECTOR = '.world_entry_edit textarea[name="content"][data-macros]';

export function configureWorldInfoPageOptimization(context = {}) {
    settings = context.settings ?? settings;
    extensionState = context.extensionState ?? extensionState;
    LOG_PREFIX = context.logPrefix ?? LOG_PREFIX;
    saveWorldInfoPageOptimizationSettings = context.saveSettings ?? saveWorldInfoPageOptimizationSettings;
}

export function bindWorldInfoPageOptimizationSettings({ saveSettings } = {}) {
    saveWorldInfoPageOptimizationSettings = saveSettings ?? saveWorldInfoPageOptimizationSettings;
}

export function applyWorldInfoPageOptimization() {
    const state = getWorldInfoPageOptimizationState();
    state.enabled = Boolean(settings.worldInfoPageOptimizationEnabled);

    if (!state.enabled) {
        removeWorldInfoPageOptimization(state);
        return;
    }

    patchWorldInfoFloatingAutocompletePosition(state);
    restoreLegacyWorldInfoPageAppendPatch(state);
    installWorldInfoMacroDeferralObserver(state);
    installDeferredMacroActivationListeners(state);

    console.debug(`${LOG_PREFIX} World info page optimization enabled`);
}

function removeWorldInfoPageOptimization(state = getWorldInfoPageOptimizationState()) {
    restoreDeferredWorldInfoMacroTextareas();
    removeDeferredMacroActivationListeners(state);
    removeWorldInfoMacroDeferralObserver(state);
    restoreLegacyWorldInfoPageAppendPatch(state);
    restoreWorldInfoFloatingAutocompletePosition(state);
}

function patchWorldInfoFloatingAutocompletePosition(state) {
    if (state[WORLD_INFO_FLOATING_AUTOCOMPLETE_PATCH_KEY]) {
        return;
    }

    const originalUpdateFloatingPosition = AutoComplete?.prototype?.updateFloatingPosition;

    if (typeof originalUpdateFloatingPosition !== 'function') {
        console.warn(`${LOG_PREFIX} AutoComplete floating positioning is unavailable; World Info autocomplete optimization was not installed`);
        return;
    }

    if (originalUpdateFloatingPosition.__baiBaiToolkitWorldInfoFloatingAutocompletePatched) {
        state[WORLD_INFO_FLOATING_AUTOCOMPLETE_PATCH_KEY] = true;
        return;
    }

    function guardedUpdateFloatingPosition(...args) {
        if (!this.isActive) {
            return;
        }

        return originalUpdateFloatingPosition.apply(this, args);
    }

    guardedUpdateFloatingPosition.__baiBaiToolkitWorldInfoFloatingAutocompletePatched = true;
    guardedUpdateFloatingPosition.__baiBaiToolkitWorldInfoFloatingAutocompleteOriginal = originalUpdateFloatingPosition;
    AutoComplete.prototype.updateFloatingPosition = guardedUpdateFloatingPosition;
    state[WORLD_INFO_FLOATING_AUTOCOMPLETE_PATCH_KEY] = true;
}

function restoreWorldInfoFloatingAutocompletePosition(state) {
    const currentUpdateFloatingPosition = AutoComplete?.prototype?.updateFloatingPosition;

    if (currentUpdateFloatingPosition?.__baiBaiToolkitWorldInfoFloatingAutocompletePatched) {
        AutoComplete.prototype.updateFloatingPosition = currentUpdateFloatingPosition.__baiBaiToolkitWorldInfoFloatingAutocompleteOriginal;
    }

    state[WORLD_INFO_FLOATING_AUTOCOMPLETE_PATCH_KEY] = false;
}

function restoreLegacyWorldInfoPageAppendPatch(state) {
    const currentAppend = globalThis.jQuery?.fn?.append;

    if (currentAppend?.__baiBaiToolkitWorldInfoPageAppendPatched) {
        globalThis.jQuery.fn.append = currentAppend.__baiBaiToolkitWorldInfoPageAppendOriginal;
    }

    state[WORLD_INFO_PAGE_APPEND_PATCH_KEY] = false;
}

function installWorldInfoMacroDeferralObserver(state) {
    if (state.deferredMacroMutationObserver) {
        return;
    }

    const list = document.getElementById('world_popup_entries_list');

    if (!(list instanceof HTMLElement)) {
        return;
    }

    deferWorldInfoMacroTextareas(list);

    if (typeof MutationObserver !== 'function') {
        return;
    }

    const observer = new MutationObserver(mutations => {
        if (!settings.worldInfoPageOptimizationEnabled) {
            return;
        }

        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                deferWorldInfoMacroTextareas(node);
            }
        }
    });

    observer.observe(list, { childList: true, subtree: true });
    state.deferredMacroMutationObserver = observer;
}

function removeWorldInfoMacroDeferralObserver(state) {
    state.deferredMacroMutationObserver?.disconnect();
    state.deferredMacroMutationObserver = null;
}

function deferWorldInfoMacroTextareas(target) {
    if (!(target instanceof Element)) {
        return;
    }

    const outlets = target.matches('#world_popup_entries_list .inline-drawer-outlet')
        ? [target]
        : Array.from(target.querySelectorAll?.('#world_popup_entries_list .inline-drawer-outlet') ?? []);

    outlets.forEach(outlet => {
        outlet.querySelectorAll(WORLD_INFO_CONTENT_TEXTAREA_SELECTOR).forEach(textarea => {
            if (!(textarea instanceof HTMLTextAreaElement) || textarea.dataset[WORLD_INFO_DEFERRED_MACROS_DATASET_KEY] === 'true') {
                return;
            }

            textarea.dataset[WORLD_INFO_DEFERRED_MACROS_DATASET_KEY] = 'true';
            textarea.dataset[WORLD_INFO_DEFERRED_MACROS_VALUE_DATASET_KEY] = textarea.getAttribute('data-macros') ?? '';
            textarea.removeAttribute('data-macros');
        });
    });
}

function installDeferredMacroActivationListeners(state) {
    if (state.deferredMacroActivationHandler) {
        return;
    }

    const handler = (event) => {
        activateDeferredWorldInfoMacroFromEvent(event);
    };

    document.addEventListener('focusin', handler, true);
    document.addEventListener('pointerdown', handler, true);
    document.addEventListener('click', handler, true);

    state.deferredMacroActivationHandler = handler;
}

function removeDeferredMacroActivationListeners(state) {
    const handler = state.deferredMacroActivationHandler;

    if (!handler) {
        return;
    }

    document.removeEventListener('focusin', handler, true);
    document.removeEventListener('pointerdown', handler, true);
    document.removeEventListener('click', handler, true);
    state.deferredMacroActivationHandler = null;
}

function activateDeferredWorldInfoMacroFromEvent(event) {
    const target = event.target instanceof Element ? event.target : null;

    if (!target) {
        return;
    }

    const textarea = findDeferredWorldInfoMacroTextarea(target);

    if (textarea) {
        restoreDeferredWorldInfoMacroTextarea(textarea);
    }
}

function findDeferredWorldInfoMacroTextarea(target) {
    const directTextarea = target.closest?.(`textarea[data-${toKebabCase(WORLD_INFO_DEFERRED_MACROS_DATASET_KEY)}="true"]`);

    if (directTextarea instanceof HTMLTextAreaElement) {
        return directTextarea;
    }

    const maximizeButton = target.closest?.('.editor_maximize[data-for]');
    const sourceId = maximizeButton?.getAttribute('data-for');
    const source = sourceId ? document.getElementById(sourceId) : null;

    return source instanceof HTMLTextAreaElement && source.dataset[WORLD_INFO_DEFERRED_MACROS_DATASET_KEY] === 'true'
        ? source
        : null;
}

function restoreDeferredWorldInfoMacroTextareas() {
    document
        .querySelectorAll(`textarea[data-${toKebabCase(WORLD_INFO_DEFERRED_MACROS_DATASET_KEY)}="true"]`)
        .forEach(textarea => {
            if (textarea instanceof HTMLTextAreaElement) {
                restoreDeferredWorldInfoMacroTextarea(textarea);
            }
        });
}

function restoreDeferredWorldInfoMacroTextarea(textarea) {
    const value = textarea.dataset[WORLD_INFO_DEFERRED_MACROS_VALUE_DATASET_KEY] ?? '';
    textarea.setAttribute('data-macros', value);
    delete textarea.dataset[WORLD_INFO_DEFERRED_MACROS_DATASET_KEY];
    delete textarea.dataset[WORLD_INFO_DEFERRED_MACROS_VALUE_DATASET_KEY];
}

function toKebabCase(value) {
    return String(value).replace(/[A-Z]/g, match => `-${match.toLowerCase()}`);
}

const WORLD_INFO_DRAWER_HANDLER_KEY = '__baiBaiToolkitWorldInfoDrawerHandler';
const WORLD_INFO_DRAWER_ANIMATION_STYLE_ID = 'bai_bai_toolkit_world_info_drawer_animation_style';
const WORLD_INFO_LAZY_SELECT2_PATCH_KEY = '__baiBaiToolkitWorldInfoLazySelect2Patched';
const WORLD_INFO_CHARACTER_FILTER_APPEND_PATCH_KEY = '__baiBaiToolkitWorldInfoCharacterFilterAppendPatched';
const WORLD_INFO_VUE_LIST_OPTIMIZATION_KEY = '__baiBaiToolkitWorldInfoVueListOptimization';
const WORLD_INFO_VUE_LIST_MODULE_PATH = './vendor/vue.esm-browser.prod.js';
const WORLD_INFO_MOBILE_HEADER_LAYOUT_STYLE_ID = 'bai_bai_toolkit_world_info_mobile_header_layout_style';
const WORLD_INFO_EDITOR_SELECT_GROUPING_DATASET_KEY = 'baiBaiToolkitWorldInfoEditorSelectGrouped';
const WORLD_INFO_EDITOR_SELECT_SEARCH_DATASET_KEY = 'baiBaiToolkitWorldInfoEditorSelectSearch';
const WORLD_INFO_EDITOR_SELECT_SEARCH_MOBILE_SUPPRESSED_DATASET_KEY = 'baiBaiToolkitWorldInfoEditorSelectSearchMobileSuppressed';
const WORLD_INFO_EDITOR_SELECT_SEARCH_MOBILE_RESTORE_MS = 450;
const WORLD_INFO_EDITOR_SELECT_STYLE_KEY = '__baiBaiToolkitWorldInfoEditorSelectStyle';
const WORLD_INFO_EDITOR_SELECT_DROPDOWN_CLASS = 'bai-bai-wi-editor-select-dropdown';
const WORLD_INFO_GLOBAL_SELECTOR_STATE_KEY = '__baiBaiToolkitWorldInfoGlobalSelectorState';
const WORLD_INFO_GLOBAL_SELECTOR_DATASET_KEY = 'baiBaiToolkitWorldInfoGlobalSelector';
const WORLD_INFO_GLOBAL_SELECTOR_OPTION_ORDER_DATASET_KEY = 'baiBaiToolkitWorldInfoGlobalSelectorOrder';
const WORLD_INFO_GLOBAL_SELECTOR_DROPDOWN_CLASS = 'bai-bai-wi-global-selector-dropdown';
const WORLD_INFO_GLOBAL_SELECTOR_HOST_CLASS = 'bai-bai-wi-global-selector';
const WORLD_INFO_GLOBAL_SELECTOR_SEARCH_MOBILE_SUPPRESSED_DATASET_KEY = 'baiBaiToolkitWorldInfoGlobalSelectorSearchMobileSuppressed';
const WORLD_INFO_GLOBAL_SELECTOR_TOUCH_SELECT_THRESHOLD_PX = 16;
const WORLD_INFO_ENTRY_DRAWER_TOGGLE_SELECTOR = '#world_popup_entries_list > .world_entry > .world_entry_form > .inline-drawer > .inline-drawer-header .inline-drawer-toggle';
const WORLD_INFO_ENTRY_DRAWER_SELECTOR = '#world_popup_entries_list > .world_entry > .world_entry_form > .inline-drawer';
const WORLD_INFO_LAZY_SELECT2_SELECTOR = '#world_popup_entries_list .world_entry_edit select[name="characterFilter"], #world_popup_entries_list .world_entry_edit select[name="triggers"]';
const WORLD_INFO_LAZY_SELECT2_DATASET_KEY = 'baiBaiToolkitLazySelect2';
const WORLD_INFO_DEFERRED_OPTIONS_DATASET_KEY = 'baiBaiToolkitDeferredOptions';

export function applyWorldInfoDrawerOptimization() {
    installWorldInfoDrawerAnimationStyle();

    if (extensionState[WORLD_INFO_DRAWER_HANDLER_KEY]) {
        return;
    }

    const handler = (event) => {
        handleWorldInfoDrawerToggleClick(event);
    };

    extensionState[WORLD_INFO_DRAWER_HANDLER_KEY] = handler;
    document.addEventListener('click', handler, true);
}

export function applyWorldInfoLazySelect2Optimization() {
    if (extensionState[WORLD_INFO_LAZY_SELECT2_PATCH_KEY]) {
        return;
    }

    const originalSelect2 = globalThis.jQuery?.fn?.select2;

    if (typeof originalSelect2 !== 'function') {
        console.warn(`${LOG_PREFIX} Select2 is unavailable; World Info lazy select2 optimization was not installed`);
        return;
    }

    function patchedSelect2(...args) {
        if (!shouldAttemptWorldInfoLazySelect2(args)) {
            return originalSelect2.apply(this, args);
        }

        const elements = this.toArray();

        if (!elements.some(element => shouldDeferWorldInfoSelect2(element))) {
            return originalSelect2.apply(this, args);
        }

        elements.forEach(element => {
            const control = $(element);

            if (shouldDeferWorldInfoSelect2(element)) {
                deferWorldInfoSelect2(element, args, originalSelect2);
            } else {
                originalSelect2.apply(control, args);
            }
        });

        return this;
    }

    patchedSelect2.__baiBaiToolkitWorldInfoLazySelect2Patched = true;
    patchedSelect2.__baiBaiToolkitOriginalSelect2 = originalSelect2;
    Object.assign(patchedSelect2, originalSelect2);
    globalThis.jQuery.fn.select2 = patchedSelect2;
    extensionState[WORLD_INFO_LAZY_SELECT2_PATCH_KEY] = true;
}

export function applyWorldInfoCharacterFilterOptionsOptimization() {
    restoreLegacyWorldInfoCharacterFilterAppendPatch();
}

export function applyWorldInfoListOptimization() {
    const state = getWorldInfoVueListOptimizationState();
    state.enabled = Boolean(settings.worldInfoListOptimizationEnabled);

    if (state.enabled) {
        installWorldInfoVueListPaginationPatch(state);
        installWorldInfoEditorSelectGrouping(state);
        installWorldInfoEditorSelectSearch(state);
        installWorldInfoGlobalSelectorOptimization(state);
        installWorldInfoMobileHeaderLayoutStyle();
        installWorldInfoMobileHeaderLayoutWatcher(state);
        installWorldInfoMobileLayoutMutationObserver(state);
    } else {
        unmountWorldInfoVueListApp(state);
        restoreWorldInfoVueListPaginationPatch(state);
        removeWorldInfoEditorSelectGrouping(state);
        removeWorldInfoEditorSelectSearch(state);
        removeWorldInfoGlobalSelectorOptimization(state);
        removeWorldInfoMobileLayoutMutationObserver(state);
        removeWorldInfoMobileHeaderLayoutWatcher(state);
        restoreWorldInfoPopupLayout();
        restoreWorldInfoMobileExpandedLayouts();
        restoreWorldInfoMobileHeaderLayouts();
        removeWorldInfoMobileHeaderLayoutStyle();
    }
}

function getWorldInfoVueListOptimizationState() {
    if (!extensionState[WORLD_INFO_VUE_LIST_OPTIMIZATION_KEY] || typeof extensionState[WORLD_INFO_VUE_LIST_OPTIMIZATION_KEY] !== 'object') {
        extensionState[WORLD_INFO_VUE_LIST_OPTIMIZATION_KEY] = {
            enabled: false,
            app: null,
            root: null,
            modulePromise: null,
            renderToken: 0,
            activeAppendCapture: null,
            originalAppend: null,
            patchedAppend: null,
            originalPagination: null,
            patchedPagination: null,
            renderQueue: null,
            mobileHeaderLayoutHandler: null,
            mobileHeaderLayoutMediaQuery: null,
            mobileLayoutMutationObserver: null,
            worldInfoEditorSelectOpenHandler: null,
            worldInfoEditorSelectKeyHandler: null,
            worldInfoEditorSelectSelect2Handler: null,
            worldInfoEditorSelectSearchOpeningHandler: null,
            worldInfoEditorSelectSearchOpenHandler: null,
            worldInfoEditorSelectSearchInteractionGuard: null,
            worldInfoEditorSelectGroupingApplying: false,
            worldInfoGlobalSelectorDropdown: null,
            worldInfoGlobalSelectorSyncHandler: null,
            worldInfoGlobalSelectorTriggerHandler: null,
            worldInfoGlobalSelectorTriggerEvents: null,
            worldInfoGlobalSelectorSelects: new Set(),
        };
    }

    const state = extensionState[WORLD_INFO_VUE_LIST_OPTIMIZATION_KEY];

    state.worldInfoGlobalSelectorDropdown ??= null;
    state.worldInfoGlobalSelectorSyncHandler ??= null;
    state.worldInfoGlobalSelectorTriggerHandler ??= null;
    state.worldInfoGlobalSelectorTriggerEvents ??= null;

    if (!(state.worldInfoGlobalSelectorSelects instanceof Set)) {
        state.worldInfoGlobalSelectorSelects = new Set();
    }

    return extensionState[WORLD_INFO_VUE_LIST_OPTIMIZATION_KEY];
}

function installWorldInfoVueListPaginationPatch(state = getWorldInfoVueListOptimizationState()) {
    if (state.patchedPagination && globalThis.jQuery?.fn?.pagination === state.patchedPagination) {
        return;
    }

    const originalPagination = globalThis.jQuery?.fn?.pagination;

    if (typeof originalPagination !== 'function') {
        console.warn(`${LOG_PREFIX} jQuery.pagination is unavailable; World Info list optimization was not installed`);
        return;
    }

    function patchedPagination(...args) {
        if (settings.worldInfoListOptimizationEnabled && shouldWrapWorldInfoPaginationCall(this, args)) {
            const options = { ...args[0] };
            const nativeCallback = options.callback;

            if (!nativeCallback?.__baiBaiToolkitWorldInfoVueListWrapped) {
                options.callback = function worldInfoVueListPaginationCallback(page, ...callbackArgs) {
                    if (!settings.worldInfoListOptimizationEnabled) {
                        return nativeCallback.call(this, page, ...callbackArgs);
                    }

                    return renderWorldInfoVueListFromNativeCallback(nativeCallback, this, page, callbackArgs);
                };
                options.callback.__baiBaiToolkitWorldInfoVueListWrapped = true;
                options.callback.__baiBaiToolkitWorldInfoVueListOriginal = nativeCallback;
            }

            args[0] = options;
        }

        return originalPagination.apply(this, args);
    }

    patchedPagination.__baiBaiToolkitWorldInfoVueListPatched = true;
    patchedPagination.__baiBaiToolkitOriginalPagination = originalPagination;
    Object.assign(patchedPagination, originalPagination);

    state.originalPagination = originalPagination;
    state.patchedPagination = patchedPagination;
    globalThis.jQuery.fn.pagination = patchedPagination;
}

function restoreWorldInfoVueListPaginationPatch(state = getWorldInfoVueListOptimizationState()) {
    if (!state.patchedPagination || !globalThis.jQuery?.fn) {
        return;
    }

    if (globalThis.jQuery.fn.pagination === state.patchedPagination && typeof state.originalPagination === 'function') {
        globalThis.jQuery.fn.pagination = state.originalPagination;
    }

    state.originalPagination = null;
    state.patchedPagination = null;
}

function installWorldInfoEditorSelectGrouping(state = getWorldInfoVueListOptimizationState()) {
    if (state.worldInfoEditorSelectOpenHandler || !document?.body) {
        return;
    }

    const openHandler = (event) => {
        const select = getWorldInfoEditorSelectFromOpenEvent(event.target);

        if (!select) {
            return;
        }

        applyWorldInfoEditorSelectGrouping(state, select);
    };

    const keyHandler = (event) => {
        if (![' ', 'Enter', 'ArrowDown'].includes(event.key)) {
            return;
        }

        const select = event.target instanceof HTMLSelectElement && event.target.id === 'world_editor_select'
            ? event.target
            : null;

        if (select) {
            applyWorldInfoEditorSelectGrouping(state, select);
        }
    };

    const select2Handler = (event) => {
        const select = event.target instanceof HTMLSelectElement && event.target.id === 'world_editor_select'
            ? event.target
            : null;

        if (select) {
            applyWorldInfoEditorSelectGrouping(state, select);
        }
    };

    document.addEventListener('pointerdown', openHandler, true);
    document.addEventListener('keydown', keyHandler, true);
    globalThis.jQuery?.(document).on('select2:opening.baiBaiToolkitWorldInfoEditorSelectGrouping', '#world_editor_select', select2Handler);

    state.worldInfoEditorSelectOpenHandler = openHandler;
    state.worldInfoEditorSelectKeyHandler = keyHandler;
    state.worldInfoEditorSelectSelect2Handler = select2Handler;
}

function removeWorldInfoEditorSelectGrouping(state = getWorldInfoVueListOptimizationState()) {
    if (state.worldInfoEditorSelectOpenHandler) {
        document.removeEventListener('pointerdown', state.worldInfoEditorSelectOpenHandler, true);
        state.worldInfoEditorSelectOpenHandler = null;
    }

    if (state.worldInfoEditorSelectKeyHandler) {
        document.removeEventListener('keydown', state.worldInfoEditorSelectKeyHandler, true);
        state.worldInfoEditorSelectKeyHandler = null;
    }

    if (state.worldInfoEditorSelectSelect2Handler) {
        globalThis.jQuery?.(document).off('select2:opening.baiBaiToolkitWorldInfoEditorSelectGrouping', '#world_editor_select', state.worldInfoEditorSelectSelect2Handler);
        state.worldInfoEditorSelectSelect2Handler = null;
    }

    restoreWorldInfoEditorSelectOrder(state);
}

function installWorldInfoEditorSelectSearch(state = getWorldInfoVueListOptimizationState()) {
    ensureWorldInfoEditorSelectSearch();

    if (state.worldInfoEditorSelectSearchOpenHandler || !globalThis.jQuery) {
        return;
    }

    const openingHandler = (event) => {
        const select = event.target instanceof HTMLSelectElement && event.target.id === 'world_editor_select'
            ? event.target
            : null;

        if (!select || !isMobile()) {
            return;
        }

        const field = getWorldInfoEditorSelect2SearchField(select);

        if (field) {
            suppressWorldInfoEditorSelectSearchMobileAutoKeyboard(field);
        }
    };

    const openHandler = (event) => {
        const select = event.target instanceof HTMLSelectElement && event.target.id === 'world_editor_select'
            ? event.target
            : null;

        if (!select) {
            return;
        }

        requestAnimationFrame(() => forceWorldInfoEditorSelectSearchField(select));
    };

    globalThis.jQuery(document).on('select2:opening.baiBaiToolkitWorldInfoEditorSelectSearch', '#world_editor_select', openingHandler);
    globalThis.jQuery(document).on('select2:open.baiBaiToolkitWorldInfoEditorSelectSearch', '#world_editor_select', openHandler);
    installWorldInfoEditorSelectSearchInteractionGuard(state);
    state.worldInfoEditorSelectSearchOpeningHandler = openingHandler;
    state.worldInfoEditorSelectSearchOpenHandler = openHandler;
}

function removeWorldInfoEditorSelectSearch(state = getWorldInfoVueListOptimizationState()) {
    removeWorldInfoEditorSelectSearchInteractionGuard(state);

    if (state.worldInfoEditorSelectSearchOpeningHandler) {
        globalThis.jQuery?.(document).off('select2:opening.baiBaiToolkitWorldInfoEditorSelectSearch', '#world_editor_select', state.worldInfoEditorSelectSearchOpeningHandler);
        state.worldInfoEditorSelectSearchOpeningHandler = null;
    }

    if (state.worldInfoEditorSelectSearchOpenHandler) {
        globalThis.jQuery?.(document).off('select2:open.baiBaiToolkitWorldInfoEditorSelectSearch', '#world_editor_select', state.worldInfoEditorSelectSearchOpenHandler);
        state.worldInfoEditorSelectSearchOpenHandler = null;
    }

    const select = document.getElementById('world_editor_select');

    if (!(select instanceof HTMLSelectElement) || select.dataset[WORLD_INFO_EDITOR_SELECT_SEARCH_DATASET_KEY] !== 'true') {
        return;
    }

    const $select = globalThis.jQuery?.(select);

    if ($select?.data?.('select2')) {
        $select.select2('destroy');
    }

    delete select.dataset[WORLD_INFO_EDITOR_SELECT_SEARCH_DATASET_KEY];
}

function installWorldInfoGlobalSelectorOptimization(state = getWorldInfoVueListOptimizationState()) {
    refreshWorldInfoGlobalSelectorOptimization(state);
    installWorldInfoGlobalSelectorSyncHandler(state);
    installWorldInfoGlobalSelectorTriggerHandler(state);
}

function removeWorldInfoGlobalSelectorOptimization(state = getWorldInfoVueListOptimizationState()) {
    removeWorldInfoGlobalSelectorSyncHandler(state);
    removeWorldInfoGlobalSelectorTriggerHandler(state);

    for (const select of Array.from(state.worldInfoGlobalSelectorSelects ?? [])) {
        restoreWorldInfoGlobalSelector(select, state);
    }

    state.worldInfoGlobalSelectorSelects?.clear?.();
}

function installWorldInfoGlobalSelectorSyncHandler(state = getWorldInfoVueListOptimizationState()) {
    if (state.worldInfoGlobalSelectorSyncHandler) {
        return;
    }

    const handler = (event) => {
        if (event?.target instanceof Element
            && !event.target.closest('#WIMultiSelector')
            && event.target.id !== 'world_editor_select') {
            return;
        }

        if (event?.target instanceof HTMLSelectElement
            && event.target[WORLD_INFO_GLOBAL_SELECTOR_STATE_KEY]?.suppressDropdownRefresh) {
            refreshWorldInfoGlobalSelectorDisplay(event.target);
            refreshWorldInfoGlobalSelectorDropdownSelectionState(event.target);
            return;
        }

        syncWorldInfoGlobalSelectorDisplays(state);
    };

    eventSource?.on?.(event_types.WORLDINFO_SETTINGS_UPDATED, handler);
    document.addEventListener('change', handler, true);
    state.worldInfoGlobalSelectorSyncHandler = handler;
}

function removeWorldInfoGlobalSelectorSyncHandler(state = getWorldInfoVueListOptimizationState()) {
    const handler = state.worldInfoGlobalSelectorSyncHandler;

    if (!handler) {
        return;
    }

    eventSource?.removeListener?.(event_types.WORLDINFO_SETTINGS_UPDATED, handler);
    document.removeEventListener('change', handler, true);
    state.worldInfoGlobalSelectorSyncHandler = null;
}

function syncWorldInfoGlobalSelectorDisplays(state = getWorldInfoVueListOptimizationState()) {
    for (const select of Array.from(state.worldInfoGlobalSelectorSelects ?? [])) {
        if (!select.isConnected) {
            restoreWorldInfoGlobalSelector(select, state);
            continue;
        }

        ensureWorldInfoGlobalSelectorOptionOrder(select);
        refreshWorldInfoGlobalSelectorDisplay(select);
        refreshWorldInfoGlobalSelectorDropdown(select, state);
    }
}

function installWorldInfoGlobalSelectorTriggerHandler(state = getWorldInfoVueListOptimizationState()) {
    removeWorldInfoGlobalSelectorTriggerHandler(state);

    if (!document?.body) {
        return;
    }

    const handler = (event) => {
        const displayEl = event.target instanceof Element
            ? event.target.closest(`.${WORLD_INFO_GLOBAL_SELECTOR_HOST_CLASS}.bai-bai-wi-global-selector-display`)
            : null;

        if (!(displayEl instanceof HTMLElement)
            || (event.target instanceof Element && event.target.closest('.bai-bai-wi-global-selector-chip-remove'))) {
            return;
        }

        const select = getWorldInfoGlobalSelectorSelectByDisplay(displayEl, state);

        if (!(select instanceof HTMLSelectElement)) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();
        toggleWorldInfoGlobalSelectorDropdown(select, state);
    };

    const triggerEvents = typeof PointerEvent === 'function'
        ? ['pointerdown']
        : ['mousedown', 'touchend'];

    triggerEvents.forEach(eventName => document.addEventListener(eventName, handler, true));
    state.worldInfoGlobalSelectorTriggerHandler = handler;
    state.worldInfoGlobalSelectorTriggerEvents = triggerEvents;
}

function removeWorldInfoGlobalSelectorTriggerHandler(state = getWorldInfoVueListOptimizationState()) {
    const handler = state.worldInfoGlobalSelectorTriggerHandler;

    if (!handler) {
        return;
    }

    (state.worldInfoGlobalSelectorTriggerEvents ?? ['pointerdown', 'mousedown', 'touchend'])
        .forEach(eventName => document.removeEventListener(eventName, handler, true));
    state.worldInfoGlobalSelectorTriggerHandler = null;
    state.worldInfoGlobalSelectorTriggerEvents = null;
}

function refreshWorldInfoGlobalSelectorOptimization(state = getWorldInfoVueListOptimizationState()) {
    if (!settings.worldInfoListOptimizationEnabled) {
        return;
    }

    getWorldInfoGlobalSelectorSelects().forEach(select => {
        enhanceWorldInfoGlobalSelector(select, state);
    });

    for (const select of Array.from(state.worldInfoGlobalSelectorSelects ?? [])) {
        if (!select.isConnected) {
            restoreWorldInfoGlobalSelector(select, state);
        }
    }
}

function getWorldInfoGlobalSelectorSelects(root = document) {
    return Array.from(root.querySelectorAll?.([
        '#WIMultiSelector select[multiple]',
        'select#WIMultiSelector[multiple]',
    ].join(',')) ?? [])
        .filter(select => select instanceof HTMLSelectElement);
}

function getWorldInfoGlobalSelectorSelectByDisplay(displayEl, state = getWorldInfoVueListOptimizationState()) {
    if (!(displayEl instanceof HTMLElement)) {
        return null;
    }

    for (const select of Array.from(state.worldInfoGlobalSelectorSelects ?? [])) {
        if (select?.[WORLD_INFO_GLOBAL_SELECTOR_STATE_KEY]?.displayEl === displayEl) {
            return select;
        }
    }

    return null;
}

function enhanceWorldInfoGlobalSelector(select, state = getWorldInfoVueListOptimizationState()) {
    if (!(select instanceof HTMLSelectElement) || !select.multiple) {
        return;
    }

    ensureWorldInfoGlobalSelectorOptionOrder(select);
    captureWorldInfoGlobalSelectorTheme(select);

    let selectState = select[WORLD_INFO_GLOBAL_SELECTOR_STATE_KEY];

    if (!selectState) {
        selectState = {
            displayEl: null,
            originalSelectDisplay: select.style.display,
            originalSelect2Display: null,
            changeHandler: null,
            triggerHandler: null,
        };
        select[WORLD_INFO_GLOBAL_SELECTOR_STATE_KEY] = selectState;
        state.worldInfoGlobalSelectorSelects.add(select);

        selectState.changeHandler = () => {
            ensureWorldInfoGlobalSelectorOptionOrder(select);
            refreshWorldInfoGlobalSelectorDisplay(select);
            refreshWorldInfoGlobalSelectorDropdownSelectionState(select);

            if (selectState.suppressDropdownRefresh) {
                selectState.suppressDropdownRefresh = false;
                return;
            }

            refreshWorldInfoGlobalSelectorDropdown(select);
        };
        select.addEventListener('change', selectState.changeHandler);
    }

    replaceWorldInfoGlobalSelectorDisplay(select);
    refreshWorldInfoGlobalSelectorDisplay(select);
    select.dataset[WORLD_INFO_GLOBAL_SELECTOR_DATASET_KEY] = 'true';
}

function restoreWorldInfoGlobalSelector(select, state = getWorldInfoVueListOptimizationState()) {
    const selectState = select?.[WORLD_INFO_GLOBAL_SELECTOR_STATE_KEY];

    if (!(select instanceof HTMLSelectElement) || !selectState) {
        return;
    }

    select.removeEventListener('change', selectState.changeHandler);
    closeWorldInfoGlobalSelectorDropdown(state);

    restoreWorldInfoGlobalSelectorOptionOrder(select);

    const select2Container = getWorldInfoGlobalSelectorSelect2Container(select);

    if (select2Container instanceof HTMLElement) {
        select2Container.style.display = selectState.originalSelect2Display ?? '';
    }

    select.style.display = selectState.originalSelectDisplay ?? '';
    selectState.displayEl?.remove();
    delete select.dataset[WORLD_INFO_GLOBAL_SELECTOR_DATASET_KEY];
    delete select[WORLD_INFO_GLOBAL_SELECTOR_STATE_KEY];
    state.worldInfoGlobalSelectorSelects?.delete?.(select);
}

function captureWorldInfoGlobalSelectorTheme(select) {
    if (!(select instanceof HTMLSelectElement) || select[WORLD_INFO_EDITOR_SELECT_STYLE_KEY]) {
        return;
    }

    const selection = getWorldInfoGlobalSelectorSelect2Container(select)
        ?.querySelector?.('.select2-selection--multiple, .select2-selection');

    if (selection instanceof HTMLElement) {
        captureWorldInfoControlTheme(select, selection);
        return;
    }

    captureWorldInfoEditorSelectTheme(select);
}

function replaceWorldInfoGlobalSelectorDisplay(select) {
    const selectState = select?.[WORLD_INFO_GLOBAL_SELECTOR_STATE_KEY];

    if (!(select instanceof HTMLSelectElement) || !selectState) {
        return;
    }

    if (selectState.displayEl?.isConnected) {
        const select2Container = getWorldInfoGlobalSelectorSelect2Container(select);

        if (select2Container instanceof HTMLElement) {
            selectState.originalSelect2Display ??= select2Container.style.display;
            select2Container.style.display = 'none';
        }

        bindWorldInfoGlobalSelectorDisplayTrigger(select, selectState.displayEl);
        return;
    }

    const displayEl = document.createElement('div');
    displayEl.className = `${WORLD_INFO_GLOBAL_SELECTOR_HOST_CLASS} bai-bai-wi-global-selector-display`;
    displayEl.tabIndex = 0;
    displayEl.role = 'button';
    displayEl.setAttribute('aria-haspopup', 'listbox');
    selectState.displayEl = displayEl;
    bindWorldInfoGlobalSelectorDisplayTrigger(select, displayEl);

    const select2Container = getWorldInfoGlobalSelectorSelect2Container(select);

    if (select2Container instanceof HTMLElement) {
        selectState.originalSelect2Display ??= select2Container.style.display;
        select2Container.style.display = 'none';
        select2Container.before(displayEl);
    } else {
        select.style.display = 'none';
        select.after(displayEl);
    }
}

function bindWorldInfoGlobalSelectorDisplayTrigger(select, displayEl) {
    const selectState = select?.[WORLD_INFO_GLOBAL_SELECTOR_STATE_KEY];

    if (!(select instanceof HTMLSelectElement) || !(displayEl instanceof HTMLElement) || !selectState) {
        return;
    }

    if (selectState.triggerHandler) {
        displayEl.removeEventListener('click', selectState.triggerHandler);
        displayEl.removeEventListener('keydown', selectState.triggerHandler);
    }

    const triggerHandler = (event) => {
        if (event.target instanceof Element && event.target.closest('.bai-bai-wi-global-selector-chip-remove')) {
            return;
        }

        if (event.type === 'keydown' && ![' ', 'Enter', 'ArrowDown'].includes(event.key)) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();

        const state = getWorldInfoVueListOptimizationState();

        if (event.type === 'click' && state.worldInfoGlobalSelectorDropdown?.select === select) {
            return;
        }

        if (event.type === 'click') {
            openWorldInfoGlobalSelectorDropdown(select, state);
            return;
        }

        toggleWorldInfoGlobalSelectorDropdown(select, state);
    };

    displayEl.addEventListener('click', triggerHandler);
    displayEl.addEventListener('keydown', triggerHandler);
    selectState.triggerHandler = triggerHandler;
}

function refreshWorldInfoGlobalSelectorDisplay(select) {
    const selectState = select?.[WORLD_INFO_GLOBAL_SELECTOR_STATE_KEY];
    const displayEl = selectState?.displayEl;

    if (!(select instanceof HTMLSelectElement) || !(displayEl instanceof HTMLElement)) {
        return;
    }

    displayEl.textContent = '';
    const selectedOptions = getWorldInfoGlobalSelectorSelectedOptions(select);

    if (selectedOptions.length === 0) {
        const placeholder = document.createElement('span');
        placeholder.className = 'bai-bai-wi-global-selector-placeholder';
        placeholder.textContent = getWorldInfoGlobalSelectorPlaceholder(select);
        displayEl.append(placeholder);
        return;
    }

    selectedOptions.forEach(option => {
        const chip = document.createElement('span');
        chip.className = 'bai-bai-wi-global-selector-chip';
        chip.dataset.value = option.value;

        const label = document.createElement('span');
        label.className = 'bai-bai-wi-global-selector-chip-label';
        label.textContent = option.textContent?.trim() || option.value;

        const removeButton = document.createElement('button');
        removeButton.className = 'bai-bai-wi-global-selector-chip-remove';
        removeButton.type = 'button';
        removeButton.textContent = '×';
        removeButton.title = '移除';
        removeButton.setAttribute('aria-label', `移除 ${label.textContent}`);
        removeButton.addEventListener('pointerdown', event => {
            event.preventDefault();
            event.stopPropagation();
            option.selected = false;
            selectState.suppressDropdownRefresh = true;
            notifyWorldInfoGlobalSelectorChanged(select);
            refreshWorldInfoGlobalSelectorDisplay(select);
            refreshWorldInfoGlobalSelectorDropdownSelectionState(select);
        });

        chip.append(label, removeButton);
        displayEl.append(chip);
    });
}

function ensureWorldInfoGlobalSelectorOptionOrder(select) {
    const options = Array.from(select.options);
    const existingIndexes = options
        .map(option => Number.parseInt(option.dataset[WORLD_INFO_GLOBAL_SELECTOR_OPTION_ORDER_DATASET_KEY] ?? '', 10))
        .filter(Number.isFinite);
    let nextIndex = existingIndexes.length > 0 ? Math.max(...existingIndexes) + 1 : 0;

    options.forEach(option => {
        if (option.dataset[WORLD_INFO_GLOBAL_SELECTOR_OPTION_ORDER_DATASET_KEY]) {
            return;
        }

        option.dataset[WORLD_INFO_GLOBAL_SELECTOR_OPTION_ORDER_DATASET_KEY] = String(nextIndex);
        nextIndex += 1;
    });
}

function toggleWorldInfoGlobalSelectorDropdown(select, state = getWorldInfoVueListOptimizationState()) {
    if (state.worldInfoGlobalSelectorDropdown?.select === select) {
        closeWorldInfoGlobalSelectorDropdown(state);
        return;
    }

    openWorldInfoGlobalSelectorDropdown(select, state);
}

function openWorldInfoGlobalSelectorDropdown(select, state = getWorldInfoVueListOptimizationState()) {
    const selectState = select?.[WORLD_INFO_GLOBAL_SELECTOR_STATE_KEY];
    const displayEl = selectState?.displayEl;

    if (!(select instanceof HTMLSelectElement) || !(displayEl instanceof HTMLElement)) {
        return;
    }

    ensureWorldInfoGlobalSelectorOptionOrder(select);
    refreshWorldInfoGlobalSelectorDisplay(select);
    closeWorldInfoGlobalSelectorDropdown(state);
    closeNativeWorldInfoGlobalSelectorSelect2(select);

    const dropdown = document.createElement('div');
    dropdown.className = WORLD_INFO_GLOBAL_SELECTOR_DROPDOWN_CLASS;
    dropdown.dataset.baiBaiWorldInfoGlobalSelectorDropdown = 'true';

    const searchBox = document.createElement('div');
    searchBox.className = 'bai-bai-wi-global-selector-search-box';
    const searchInput = document.createElement('input');
    searchInput.className = 'bai-bai-wi-global-selector-search';
    searchInput.type = 'search';
    searchInput.placeholder = '搜索世界书...';
    const clearSearchButton = document.createElement('button');
    clearSearchButton.className = 'bai-bai-wi-global-selector-search-clear';
    clearSearchButton.type = 'button';
    clearSearchButton.textContent = '×';
    clearSearchButton.title = '清空搜索';
    clearSearchButton.setAttribute('aria-label', '清空搜索');
    searchBox.append(searchInput, clearSearchButton);

    if (isMobile()) {
        suppressWorldInfoGlobalSelectorSearchMobileAutoKeyboard(searchInput);
    }

    const optionsContainer = document.createElement('div');
    optionsContainer.className = 'bai-bai-wi-global-selector-options';
    dropdown.append(searchBox, optionsContainer);

    const orderedOptions = getWorldInfoGlobalSelectorOrderedOptions(select);
    const stopDropdownEvent = (event) => event.stopPropagation();
    ['pointerdown', 'mousedown', 'click', 'touchstart', 'touchend'].forEach(eventName => {
        dropdown.addEventListener(eventName, stopDropdownEvent);
    });

    const renderOptions = () => renderWorldInfoGlobalSelectorDropdownOptions(select, optionsContainer, searchInput.value, orderedOptions);
    searchInput.addEventListener('input', renderOptions);
    const clearSearch = (event) => {
        event.preventDefault();
        event.stopPropagation();
        const shouldRefocus = searchInput.value !== '' || document.activeElement === searchInput;
        searchInput.value = '';
        renderOptions();

        if (shouldRefocus) {
            focusWorldInfoEditorSelectSearchFieldFromUserInteraction(searchInput, event);
        }
    };
    clearSearchButton.addEventListener('pointerdown', clearSearch);
    clearSearchButton.addEventListener('click', clearSearch);
    renderOptions();

    const rect = displayEl.getBoundingClientRect();
    const parentDialog = displayEl.closest('dialog');
    const appendTarget = parentDialog instanceof HTMLElement ? parentDialog : document.body;
    const maxHeight = Math.max(160, Math.min(360, window.innerHeight - rect.bottom - 10));

    if (parentDialog instanceof HTMLElement) {
        const scrollContainer = parentDialog.querySelector('.popup-body') || parentDialog;
        const parentRect = parentDialog.getBoundingClientRect();
        Object.assign(dropdown.style, {
            left: `${rect.left - parentRect.left + scrollContainer.scrollLeft}px`,
            maxHeight: `${maxHeight}px`,
            top: `${rect.bottom - parentRect.top + scrollContainer.scrollTop + 2}px`,
            width: `${rect.width}px`,
        });
    } else {
        Object.assign(dropdown.style, {
            left: `${rect.left + window.scrollX}px`,
            maxHeight: `${maxHeight}px`,
            top: `${rect.bottom + window.scrollY + 2}px`,
            width: `${rect.width}px`,
        });
    }

    appendTarget.append(dropdown);
    displayEl.classList.add('bai-bai-wi-global-selector-open');

    const closeHandler = (event) => {
        const target = event.target instanceof Node ? event.target : null;

        if (target && (dropdown.contains(target) || displayEl.contains(target))) {
            return;
        }

        closeWorldInfoGlobalSelectorDropdown(state);
    };
    const keyHandler = (event) => {
        if (event.key === 'Escape') {
            closeWorldInfoGlobalSelectorDropdown(state);
        }
    };
    const scrollHandler = (event) => {
        if (event.target instanceof Node && dropdown.contains(event.target)) {
            return;
        }

        if (document.activeElement instanceof Node && dropdown.contains(document.activeElement)) {
            return;
        }

        closeWorldInfoGlobalSelectorDropdown(state);
    };

    document.addEventListener('pointerdown', closeHandler, true);
    document.addEventListener('keydown', keyHandler, true);
    window.addEventListener('scroll', scrollHandler, true);

    state.worldInfoGlobalSelectorDropdown = {
        select,
        displayEl,
        dropdown,
        optionsContainer,
        orderedOptions,
        searchInput,
        closeHandler,
        keyHandler,
        scrollHandler,
    };

    if (!isMobile()) {
        requestAnimationFrame(() => searchInput.focus({ preventScroll: true }));
    }
}

function closeNativeWorldInfoGlobalSelectorSelect2(select) {
    const $select = globalThis.jQuery?.(select);

    if (!$select?.data?.('select2') || typeof $select.select2 !== 'function') {
        return;
    }

    try {
        $select.select2('close');
    } catch (error) {
        console.debug(`${LOG_PREFIX} Failed to close native global world info select2`, error);
    }
}

function closeWorldInfoGlobalSelectorDropdown(state = getWorldInfoVueListOptimizationState()) {
    const dropdownState = state.worldInfoGlobalSelectorDropdown;

    if (!dropdownState) {
        return;
    }

    document.removeEventListener('pointerdown', dropdownState.closeHandler, true);
    document.removeEventListener('keydown', dropdownState.keyHandler, true);
    window.removeEventListener('scroll', dropdownState.scrollHandler, true);
    dropdownState.displayEl?.classList?.remove?.('bai-bai-wi-global-selector-open');
    dropdownState.dropdown?.remove?.();
    state.worldInfoGlobalSelectorDropdown = null;
}

function refreshWorldInfoGlobalSelectorDropdown(select, state = getWorldInfoVueListOptimizationState()) {
    const dropdownState = state.worldInfoGlobalSelectorDropdown;

    if (!dropdownState || dropdownState.select !== select) {
        return;
    }

    renderWorldInfoGlobalSelectorDropdownOptions(
        select,
        dropdownState.optionsContainer,
        dropdownState.searchInput?.value ?? '',
        dropdownState.orderedOptions,
    );
}

function renderWorldInfoGlobalSelectorDropdownOptions(select, optionsContainer, searchTerm = '', orderedOptions = null) {
    if (!(select instanceof HTMLSelectElement) || !(optionsContainer instanceof HTMLElement)) {
        return;
    }

    optionsContainer.textContent = '';

    const normalizedSearch = String(searchTerm).trim().toLowerCase();
    const sourceOptions = Array.isArray(orderedOptions) ? orderedOptions : getWorldInfoGlobalSelectorOrderedOptions(select);
    const options = sourceOptions
        .filter(option => {
            const text = option.textContent?.trim() || option.value;
            return !normalizedSearch || text.toLowerCase().includes(normalizedSearch);
        });

    if (options.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'bai-bai-wi-global-selector-empty';
        empty.textContent = '没有找到匹配的世界书';
        optionsContainer.append(empty);
        return;
    }

    options.forEach(option => {
        const isSelected = isWorldInfoGlobalSelectorOptionSelected(option);
        optionsContainer.append(createWorldInfoGlobalSelectorOption(select, option, isSelected));
    });
}

function createWorldInfoGlobalSelectorOption(select, option, isSelected) {
    const optionEl = document.createElement('div');
    optionEl.className = 'bai-bai-wi-global-selector-option';
    optionEl.dataset.value = option.value;
    optionEl.role = 'option';
    optionEl.tabIndex = 0;
    optionEl.setAttribute('aria-selected', isSelected ? 'true' : 'false');
    optionEl.classList.toggle('selected', isSelected);
    optionEl.textContent = option.textContent?.trim() || option.value;
    let pointerStart = null;

    const handleSelect = (event) => {
        event.preventDefault();
        event.stopPropagation();
        const selectState = select?.[WORLD_INFO_GLOBAL_SELECTOR_STATE_KEY];

        if (selectState) {
            selectState.suppressDropdownRefresh = true;
        }

        option.selected = !option.selected;
        const nextSelected = isWorldInfoGlobalSelectorOptionSelected(option);
        optionEl.classList.toggle('selected', nextSelected);
        optionEl.setAttribute('aria-selected', nextSelected ? 'true' : 'false');
        notifyWorldInfoGlobalSelectorChanged(select);
        refreshWorldInfoGlobalSelectorDisplay(select);
    };

    optionEl.addEventListener('pointerdown', event => {
        pointerStart = {
            pointerId: event.pointerId,
            pointerType: event.pointerType,
            x: event.clientX,
            y: event.clientY,
            moved: false,
        };
    });
    optionEl.addEventListener('pointermove', event => {
        if (!pointerStart || pointerStart.pointerId !== event.pointerId) {
            return;
        }

        const distance = Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y);

        if (distance > WORLD_INFO_GLOBAL_SELECTOR_TOUCH_SELECT_THRESHOLD_PX) {
            pointerStart.moved = true;
        }
    });
    optionEl.addEventListener('pointerup', event => {
        if (!pointerStart || pointerStart.pointerId !== event.pointerId) {
            return;
        }

        const shouldIgnore = pointerStart.moved && pointerStart.pointerType !== 'mouse';
        pointerStart = null;

        if (shouldIgnore) {
            return;
        }

        handleSelect(event);
    });
    optionEl.addEventListener('pointercancel', () => {
        pointerStart = null;
    });
    optionEl.addEventListener('keydown', event => {
        if (![' ', 'Enter'].includes(event.key)) {
            return;
        }

        handleSelect(event);
    });
    return optionEl;
}

function getWorldInfoGlobalSelectorOrderedOptions(select) {
    return Array.from(select.options)
        .filter(option => option.value !== '' && option.style.display !== 'none')
        .sort((a, b) => getWorldInfoGlobalSelectorOptionOrder(a) - getWorldInfoGlobalSelectorOptionOrder(b));
}

function refreshWorldInfoGlobalSelectorDropdownSelectionState(select, state = getWorldInfoVueListOptimizationState()) {
    const dropdownState = state.worldInfoGlobalSelectorDropdown;

    if (!(select instanceof HTMLSelectElement)
        || !dropdownState
        || dropdownState.select !== select
        || !(dropdownState.optionsContainer instanceof HTMLElement)) {
        return;
    }

    const selectedValues = new Set(Array.from(select.selectedOptions).map(option => option.value));

    dropdownState.optionsContainer
        .querySelectorAll('.bai-bai-wi-global-selector-option')
        .forEach(optionEl => {
            const isSelected = selectedValues.has(optionEl.dataset.value ?? '');
            optionEl.classList.toggle('selected', isSelected);
            optionEl.setAttribute('aria-selected', isSelected ? 'true' : 'false');
        });
}

function getWorldInfoGlobalSelectorSelectedOptions(select) {
    return Array.from(select.selectedOptions)
        .sort((a, b) => getWorldInfoGlobalSelectorOptionOrder(a) - getWorldInfoGlobalSelectorOptionOrder(b));
}

function notifyWorldInfoGlobalSelectorChanged(select) {
    select.dispatchEvent(new Event('input', { bubbles: true }));
    select.dispatchEvent(new Event('change', { bubbles: true }));

    const $select = globalThis.jQuery?.(select);

    if ($select?.data?.('select2')) {
        $select.trigger('change.select2');
    }
}

function restoreWorldInfoGlobalSelectorOptionOrder(select) {
    if (!(select instanceof HTMLSelectElement)) {
        return;
    }

    const children = Array.from(select.children);

    if (!children.every(child => child instanceof HTMLOptionElement)) {
        return;
    }

    const selectedValues = new Set(Array.from(select.selectedOptions).map(option => option.value));
    const fragment = document.createDocumentFragment();

    children
        .slice()
        .sort((a, b) => getWorldInfoGlobalSelectorOptionOrder(a) - getWorldInfoGlobalSelectorOptionOrder(b))
        .forEach(option => {
            delete option.dataset[WORLD_INFO_GLOBAL_SELECTOR_OPTION_ORDER_DATASET_KEY];
            fragment.append(option);
        });

    select.append(fragment);
    Array.from(select.options).forEach(option => {
        option.selected = selectedValues.has(option.value);
    });
}

function isWorldInfoGlobalSelectorOptionSelected(option) {
    if (option.selected) {
        return true;
    }

    const selectedNames = new Set(normalizeWorldInfoNameList(selected_world_info));
    const optionName = getWorldInfoOptionName(option);

    return optionName ? selectedNames.has(optionName) : false;
}

function getWorldInfoGlobalSelectorPlaceholder(select) {
    const placeholder = select.getAttribute('data-placeholder')
        || select.getAttribute('placeholder')
        || select.querySelector('option[value=""]')?.textContent
        || '搜索/选择全局世界书...';

    return String(placeholder).trim() || '搜索/选择全局世界书...';
}

function getWorldInfoGlobalSelectorSelect2Container(select) {
    const select2Container = globalThis.jQuery?.(select).data?.('select2')?.$container?.[0]
        ?? select.nextElementSibling;

    return select2Container instanceof HTMLElement && select2Container.classList.contains('select2-container')
        ? select2Container
        : null;
}

function getWorldInfoGlobalSelectorOptionOrder(option) {
    const parsed = Number.parseInt(option?.dataset?.[WORLD_INFO_GLOBAL_SELECTOR_OPTION_ORDER_DATASET_KEY] ?? '', 10);

    return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
}

function suppressWorldInfoGlobalSelectorSearchMobileAutoKeyboard(field) {
    field.dataset[WORLD_INFO_GLOBAL_SELECTOR_SEARCH_MOBILE_SUPPRESSED_DATASET_KEY] = 'true';
    field.setAttribute('readonly', 'readonly');
    field.setAttribute('inputmode', 'none');

    blurWorldInfoEditorSelectSearchField(field);

    const restoreForUserInput = (event) => {
        restoreWorldInfoGlobalSelectorSearchMobileInput(field);
        focusWorldInfoEditorSelectSearchFieldFromUserInteraction(field, event);
        event.stopPropagation();
    };

    field.addEventListener('pointerdown', restoreForUserInput, { capture: true, once: true });
    field.addEventListener('touchstart', restoreForUserInput, { capture: true, once: true });
    field.addEventListener('mousedown', restoreForUserInput, { capture: true, once: true });

    setTimeout(() => {
        if (field.dataset[WORLD_INFO_GLOBAL_SELECTOR_SEARCH_MOBILE_SUPPRESSED_DATASET_KEY] === 'true') {
            blurWorldInfoEditorSelectSearchField(field);
            restoreWorldInfoGlobalSelectorSearchMobileInput(field);
        }
    }, WORLD_INFO_EDITOR_SELECT_SEARCH_MOBILE_RESTORE_MS);
}

function restoreWorldInfoGlobalSelectorSearchMobileInput(field) {
    if (!(field instanceof HTMLInputElement)
        || field.dataset[WORLD_INFO_GLOBAL_SELECTOR_SEARCH_MOBILE_SUPPRESSED_DATASET_KEY] !== 'true') {
        return;
    }

    field.removeAttribute('readonly');

    if (field.getAttribute('inputmode') === 'none') {
        field.removeAttribute('inputmode');
    }

    delete field.dataset[WORLD_INFO_GLOBAL_SELECTOR_SEARCH_MOBILE_SUPPRESSED_DATASET_KEY];
}

function installWorldInfoEditorSelectSearchInteractionGuard(state = getWorldInfoVueListOptimizationState()) {
    if (state.worldInfoEditorSelectSearchInteractionGuard) {
        return;
    }

    const guard = (event) => {
        const field = event.target instanceof Element
            ? event.target.closest('.select2-container--open .select2-search__field')
            : null;

        if (!(field instanceof HTMLInputElement) || !isMobile() || !isWorldInfoEditorSelectOpen()) {
            return;
        }

        restoreWorldInfoEditorSelectSearchMobileInput(field);
        focusWorldInfoEditorSelectSearchFieldFromUserInteraction(field, event);
        event.stopPropagation();
    };

    for (const eventName of ['pointerdown', 'mousedown', 'touchstart', 'click']) {
        window.addEventListener(eventName, guard, true);
    }

    state.worldInfoEditorSelectSearchInteractionGuard = guard;
}

function removeWorldInfoEditorSelectSearchInteractionGuard(state = getWorldInfoVueListOptimizationState()) {
    const guard = state.worldInfoEditorSelectSearchInteractionGuard;

    if (!guard) {
        return;
    }

    for (const eventName of ['pointerdown', 'mousedown', 'touchstart', 'click']) {
        window.removeEventListener(eventName, guard, true);
    }

    state.worldInfoEditorSelectSearchInteractionGuard = null;
}

function ensureWorldInfoEditorSelectSearch(select = document.getElementById('world_editor_select')) {
    if (!(select instanceof HTMLSelectElement) || typeof globalThis.jQuery?.fn?.select2 !== 'function') {
        return;
    }

    const $select = globalThis.jQuery(select);
    const select2 = $select.data('select2');

    if (select2) {
        select2.options?.set?.('allowClear', false);
        select2.options?.set?.('dropdownCssClass', WORLD_INFO_EDITOR_SELECT_DROPDOWN_CLASS);
        select2.options?.set?.('minimumResultsForSearch', 0);
        select2.options?.set?.('searchInputPlaceholder', 'Search...');
        syncWorldInfoEditorSelect2Theme(select);
        return;
    }

    const placeholder = select.querySelector('option[value=""]')?.textContent?.trim() || '--- Pick to Edit ---';
    captureWorldInfoEditorSelectTheme(select);

    $select.select2({
        width: '100%',
        placeholder,
        searchInputPlaceholder: 'Search...',
        allowClear: false,
        closeOnSelect: true,
        dropdownCssClass: WORLD_INFO_EDITOR_SELECT_DROPDOWN_CLASS,
        multiple: false,
        minimumResultsForSearch: 0,
    });

    select.dataset[WORLD_INFO_EDITOR_SELECT_SEARCH_DATASET_KEY] = 'true';
    syncWorldInfoEditorSelect2Theme(select);
}

function forceWorldInfoEditorSelectSearchField(select = document.getElementById('world_editor_select')) {
    if (!(select instanceof HTMLSelectElement) || !globalThis.jQuery?.(select).data?.('select2')) {
        return;
    }

    const field = document.querySelector('.select2-container--open .select2-search__field');
    syncWorldInfoEditorSelect2Theme(select);
    syncWorldInfoEditorSelectDropdownTheme(select, field);

    if (!(field instanceof HTMLInputElement)) {
        return;
    }

    field.closest('.select2-search')?.classList.remove('select2-search--hide');
    field.placeholder = field.placeholder || 'Search...';
    field.removeAttribute('readonly');

    if (isMobile()) {
        suppressWorldInfoEditorSelectSearchMobileAutoKeyboard(field);
        return;
    }

    field.focus({ preventScroll: true });
}

function syncWorldInfoEditorSelectDropdownTheme(select, field = document.querySelector('.select2-container--open .select2-search__field')) {
    if (!(select instanceof HTMLSelectElement)) {
        return;
    }

    const select2 = globalThis.jQuery?.(select).data?.('select2');
    const dropdown = select2?.dropdown?.$dropdown?.[0];

    if (dropdown instanceof HTMLElement) {
        dropdown.classList.add(WORLD_INFO_EDITOR_SELECT_DROPDOWN_CLASS);
    }

    if (!(field instanceof HTMLInputElement)) {
        return;
    }

    const referenceInput = getWorldInfoEditorSelectSearchReferenceInput();
    const referenceStyle = referenceInput instanceof HTMLElement
        ? getComputedStyle(referenceInput)
        : select[WORLD_INFO_EDITOR_SELECT_STYLE_KEY];

    if (!referenceStyle) {
        return;
    }

    Object.assign(field.style, {
        backgroundColor: referenceStyle.backgroundColor,
        borderBottomColor: referenceStyle.borderBottomColor,
        borderBottomLeftRadius: referenceStyle.borderBottomLeftRadius,
        borderBottomRightRadius: referenceStyle.borderBottomRightRadius,
        borderBottomStyle: referenceStyle.borderBottomStyle,
        borderBottomWidth: referenceStyle.borderBottomWidth,
        borderLeftColor: referenceStyle.borderLeftColor,
        borderLeftStyle: referenceStyle.borderLeftStyle,
        borderLeftWidth: referenceStyle.borderLeftWidth,
        borderRightColor: referenceStyle.borderRightColor,
        borderRightStyle: referenceStyle.borderRightStyle,
        borderRightWidth: referenceStyle.borderRightWidth,
        borderTopColor: referenceStyle.borderTopColor,
        borderTopLeftRadius: referenceStyle.borderTopLeftRadius,
        borderTopRightRadius: referenceStyle.borderTopRightRadius,
        borderTopStyle: referenceStyle.borderTopStyle,
        borderTopWidth: referenceStyle.borderTopWidth,
        boxShadow: referenceStyle.boxShadow,
        color: referenceStyle.color,
        fontFamily: referenceStyle.fontFamily,
        fontSize: referenceStyle.fontSize,
        fontWeight: referenceStyle.fontWeight,
        height: referenceStyle.height,
        lineHeight: referenceStyle.lineHeight,
        opacity: '1',
        paddingBottom: referenceStyle.paddingBottom,
        paddingLeft: referenceStyle.paddingLeft,
        paddingRight: referenceStyle.paddingRight,
        paddingTop: referenceStyle.paddingTop,
    });
}

function getWorldInfoEditorSelectSearchReferenceInput() {
    const directInput = document.getElementById('world_info_search');

    if (directInput instanceof HTMLInputElement) {
        return directInput;
    }

    return document.querySelector('#world_popup input[type="search"], #world_popup input[type="text"], #world_popup input:not([type])');
}

function captureWorldInfoEditorSelectTheme(select) {
    if (!(select instanceof HTMLSelectElement) || select[WORLD_INFO_EDITOR_SELECT_STYLE_KEY]) {
        return;
    }

    captureWorldInfoControlTheme(select, select);
}

function captureWorldInfoControlTheme(target, source) {
    if (!(target instanceof HTMLElement) || !(source instanceof HTMLElement) || target[WORLD_INFO_EDITOR_SELECT_STYLE_KEY]) {
        return;
    }

    const style = getComputedStyle(source);
    target[WORLD_INFO_EDITOR_SELECT_STYLE_KEY] = {
        backgroundColor: style.backgroundColor,
        borderBottomColor: style.borderBottomColor,
        borderBottomLeftRadius: style.borderBottomLeftRadius,
        borderBottomRightRadius: style.borderBottomRightRadius,
        borderBottomStyle: style.borderBottomStyle,
        borderBottomWidth: style.borderBottomWidth,
        borderLeftColor: style.borderLeftColor,
        borderLeftStyle: style.borderLeftStyle,
        borderLeftWidth: style.borderLeftWidth,
        borderRightColor: style.borderRightColor,
        borderRightStyle: style.borderRightStyle,
        borderRightWidth: style.borderRightWidth,
        borderTopColor: style.borderTopColor,
        borderTopLeftRadius: style.borderTopLeftRadius,
        borderTopRightRadius: style.borderTopRightRadius,
        borderTopStyle: style.borderTopStyle,
        borderTopWidth: style.borderTopWidth,
        boxShadow: style.boxShadow,
        color: style.color,
        fontFamily: style.fontFamily,
        fontSize: style.fontSize,
        fontWeight: style.fontWeight,
        height: style.height,
        lineHeight: style.lineHeight,
        minHeight: style.minHeight,
        paddingBottom: style.paddingBottom,
        paddingLeft: style.paddingLeft,
        paddingRight: style.paddingRight,
        paddingTop: style.paddingTop,
    };
}

function syncWorldInfoEditorSelect2Theme(select) {
    if (!(select instanceof HTMLSelectElement)) {
        return;
    }

    const select2 = globalThis.jQuery?.(select).data?.('select2');
    const container = select2?.$container?.[0];
    const selection = container?.querySelector?.('.select2-selection--single');
    const rendered = container?.querySelector?.('.select2-selection__rendered');
    const arrow = container?.querySelector?.('.select2-selection__arrow');
    const arrowMarker = arrow?.querySelector?.('b');
    const capturedStyle = select[WORLD_INFO_EDITOR_SELECT_STYLE_KEY];

    if (!(selection instanceof HTMLElement) || !capturedStyle) {
        return;
    }

    Object.assign(selection.style, {
        backgroundColor: capturedStyle.backgroundColor,
        borderBottomColor: capturedStyle.borderBottomColor,
        borderBottomLeftRadius: capturedStyle.borderBottomLeftRadius,
        borderBottomRightRadius: capturedStyle.borderBottomRightRadius,
        borderBottomStyle: capturedStyle.borderBottomStyle,
        borderBottomWidth: capturedStyle.borderBottomWidth,
        borderLeftColor: capturedStyle.borderLeftColor,
        borderLeftStyle: capturedStyle.borderLeftStyle,
        borderLeftWidth: capturedStyle.borderLeftWidth,
        borderRightColor: capturedStyle.borderRightColor,
        borderRightStyle: capturedStyle.borderRightStyle,
        borderRightWidth: capturedStyle.borderRightWidth,
        borderTopColor: capturedStyle.borderTopColor,
        borderTopLeftRadius: capturedStyle.borderTopLeftRadius,
        borderTopRightRadius: capturedStyle.borderTopRightRadius,
        borderTopStyle: capturedStyle.borderTopStyle,
        borderTopWidth: capturedStyle.borderTopWidth,
        boxShadow: capturedStyle.boxShadow,
        color: capturedStyle.color,
        alignItems: 'center',
        display: 'flex',
        fontFamily: capturedStyle.fontFamily,
        fontSize: capturedStyle.fontSize,
        fontWeight: capturedStyle.fontWeight,
        minHeight: capturedStyle.minHeight,
    });

    if (isUsableCssSize(capturedStyle.height)) {
        selection.style.height = capturedStyle.height;
    }

    if (rendered instanceof HTMLElement) {
        Object.assign(rendered.style, {
            alignItems: 'center',
            color: capturedStyle.color,
            display: 'flex',
            flex: '1 1 auto',
            fontFamily: capturedStyle.fontFamily,
            fontSize: capturedStyle.fontSize,
            fontWeight: capturedStyle.fontWeight,
            lineHeight: 'normal',
            minWidth: '0',
            overflow: 'hidden',
            paddingBottom: '2px',
            paddingLeft: capturedStyle.paddingLeft,
            paddingRight: '28px',
            paddingTop: '2px',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
        });
    }

    if (arrow instanceof HTMLElement) {
        Object.assign(arrow.style, {
            alignItems: 'center',
            color: capturedStyle.color,
            display: 'flex',
            justifyContent: 'center',
            opacity: '0.62',
            right: '8px',
            top: '0',
            width: '18px',
        });

        if (isUsableCssSize(capturedStyle.height)) {
            arrow.style.height = capturedStyle.height;
        }
    }

    if (arrowMarker instanceof HTMLElement) {
        Object.assign(arrowMarker.style, {
            borderColor: 'currentColor transparent transparent transparent',
            borderStyle: 'solid',
            borderWidth: '6px 5px 0 5px',
            height: '0',
            left: 'auto',
            margin: '0',
            position: 'static',
            top: 'auto',
            width: '0',
        });
    }
}

function isUsableCssSize(value) {
    return typeof value === 'string' && value !== '' && value !== 'auto' && value !== '0px' && value !== '1px';
}

function getWorldInfoEditorSelect2SearchField(select) {
    const select2 = globalThis.jQuery?.(select).data?.('select2');
    const field = select2?.dropdown?.$search?.[0] ?? select2?.selection?.$search?.[0] ?? null;

    return field instanceof HTMLInputElement ? field : null;
}

function isWorldInfoEditorSelectOpen() {
    const select = document.getElementById('world_editor_select');
    const select2 = select instanceof HTMLSelectElement
        ? globalThis.jQuery?.(select).data?.('select2')
        : null;

    return Boolean(select2?.isOpen?.());
}

function suppressWorldInfoEditorSelectSearchMobileAutoKeyboard(field) {
    field.dataset[WORLD_INFO_EDITOR_SELECT_SEARCH_MOBILE_SUPPRESSED_DATASET_KEY] = 'true';
    field.setAttribute('readonly', 'readonly');
    field.setAttribute('inputmode', 'none');

    blurWorldInfoEditorSelectSearchField(field);

    const restoreForUserInput = () => restoreWorldInfoEditorSelectSearchMobileInput(field);
    field.addEventListener('pointerdown', restoreForUserInput, { capture: true, once: true });
    field.addEventListener('touchstart', restoreForUserInput, { capture: true, once: true });
    field.addEventListener('mousedown', restoreForUserInput, { capture: true, once: true });

    setTimeout(() => {
        if (field.dataset[WORLD_INFO_EDITOR_SELECT_SEARCH_MOBILE_SUPPRESSED_DATASET_KEY] === 'true') {
            blurWorldInfoEditorSelectSearchField(field);
            restoreWorldInfoEditorSelectSearchMobileInput(field);
        }
    }, WORLD_INFO_EDITOR_SELECT_SEARCH_MOBILE_RESTORE_MS);
}

function restoreWorldInfoEditorSelectSearchMobileInput(field) {
    if (!(field instanceof HTMLInputElement) || field.dataset[WORLD_INFO_EDITOR_SELECT_SEARCH_MOBILE_SUPPRESSED_DATASET_KEY] !== 'true') {
        return;
    }

    field.removeAttribute('readonly');

    if (field.getAttribute('inputmode') === 'none') {
        field.removeAttribute('inputmode');
    }

    delete field.dataset[WORLD_INFO_EDITOR_SELECT_SEARCH_MOBILE_SUPPRESSED_DATASET_KEY];
}

function blurWorldInfoEditorSelectSearchField(field) {
    if (document.activeElement === field) {
        field.blur();
    }

    requestAnimationFrame(() => {
        if (document.activeElement === field) {
            field.blur();
        }
    });
}

function focusWorldInfoEditorSelectSearchFieldFromUserInteraction(field, event) {
    if (event?.type === 'click' || document.activeElement === field) {
        return;
    }

    try {
        field.focus({ preventScroll: true });
    } catch {
        field.focus();
    }
}

function getWorldInfoEditorSelectFromOpenEvent(target) {
    if (!(target instanceof Element)) {
        return null;
    }

    if (target instanceof HTMLSelectElement && target.id === 'world_editor_select') {
        return target;
    }

    const select2Container = target.closest?.('.select2-container');
    const select = select2Container?.previousElementSibling;

    return select instanceof HTMLSelectElement && select.id === 'world_editor_select'
        ? select
        : null;
}

function applyWorldInfoEditorSelectGrouping(state = getWorldInfoVueListOptimizationState(), select = document.getElementById('world_editor_select')) {
    if (!(select instanceof HTMLSelectElement) || state.worldInfoEditorSelectGroupingApplying) {
        return;
    }

    const selectableOptions = Array.from(select.options).filter(option => option.value !== '');

    if (selectableOptions.length === 0) {
        return;
    }

    const selectedValue = select.value;
    const categorizedOptions = categorizeWorldInfoEditorSelectOptions(selectableOptions);
    const nextSignature = getWorldInfoEditorSelectGroupingSignature(categorizedOptions);

    if (select.dataset[WORLD_INFO_EDITOR_SELECT_GROUPING_DATASET_KEY] === 'true'
        && select.dataset.baiBaiToolkitWorldInfoEditorSelectGroupingSignature === nextSignature) {
        return;
    }

    const fragment = document.createDocumentFragment();
    const defaultOptions = Array.from(select.options).filter(option => option.value === '');

    state.worldInfoEditorSelectGroupingApplying = true;

    try {
        defaultOptions.forEach(option => fragment.append(option));

        categorizedOptions.forEach(({ label, options }) => {
            if (options.length === 0) {
                return;
            }

            const group = document.createElement('optgroup');
            group.label = label;
            options.forEach(option => group.append(option));
            fragment.append(group);
        });

        select.replaceChildren(fragment);
        select.value = selectedValue;
        select.dataset[WORLD_INFO_EDITOR_SELECT_GROUPING_DATASET_KEY] = 'true';
        select.dataset.baiBaiToolkitWorldInfoEditorSelectGroupingSignature = nextSignature;
        refreshWorldInfoEditorSelect2(select);
    } finally {
        state.worldInfoEditorSelectGroupingApplying = false;
    }
}

function restoreWorldInfoEditorSelectOrder(state = getWorldInfoVueListOptimizationState()) {
    const select = document.getElementById('world_editor_select');

    if (!(select instanceof HTMLSelectElement) || select.dataset[WORLD_INFO_EDITOR_SELECT_GROUPING_DATASET_KEY] !== 'true') {
        return;
    }

    const selectedValue = select.value;
    const defaultOptions = Array.from(select.options).filter(option => option.value === '');
    const selectableOptions = Array.from(select.options)
        .filter(option => option.value !== '')
        .sort((a, b) => getWorldInfoOptionSortIndex(a) - getWorldInfoOptionSortIndex(b));
    const fragment = document.createDocumentFragment();

    state.worldInfoEditorSelectGroupingApplying = true;

    try {
        defaultOptions.forEach(option => fragment.append(option));
        selectableOptions.forEach(option => fragment.append(option));
        select.replaceChildren(fragment);
        select.value = selectedValue;
        delete select.dataset[WORLD_INFO_EDITOR_SELECT_GROUPING_DATASET_KEY];
        delete select.dataset.baiBaiToolkitWorldInfoEditorSelectGroupingSignature;
        refreshWorldInfoEditorSelect2(select);
    } finally {
        state.worldInfoEditorSelectGroupingApplying = false;
    }
}

function categorizeWorldInfoEditorSelectOptions(options) {
    const optionMap = new Map();
    const nativeOrderNames = [];

    options
        .slice()
        .sort((a, b) => getWorldInfoOptionSortIndex(a) - getWorldInfoOptionSortIndex(b))
        .forEach(option => {
            const name = getWorldInfoOptionName(option);

            if (!name || optionMap.has(name)) {
                return;
            }

            optionMap.set(name, option);
            nativeOrderNames.push(name);
        });

    const pickedNames = new Set();
    const groups = getWorldInfoEditorSelectGroups(nativeOrderNames);

    return groups.map(group => {
        const groupOptions = [];

        group.names.forEach(name => {
            if (pickedNames.has(name)) {
                return;
            }

            const option = optionMap.get(name);

            if (!option) {
                return;
            }

            pickedNames.add(name);
            groupOptions.push(option);
        });

        return { label: group.label, options: groupOptions };
    });
}

function getWorldInfoEditorSelectGroupingSignature(groups) {
    return groups
        .map(group => `${group.label}:${group.options.map(option => option.value).join(',')}`)
        .join('|');
}

function getWorldInfoEditorSelectGroups(nativeOrderNames) {
    const existingNames = new Set(nativeOrderNames);
    const globalNames = normalizeWorldInfoNameList(selected_world_info).filter(name => existingNames.has(name));
    const characterPrimaryNames = normalizeWorldInfoNameList(characters?.[this_chid]?.data?.extensions?.world).filter(name => existingNames.has(name));
    const characterAdditionalNames = getCurrentCharacterAdditionalWorldInfoNames().filter(name => existingNames.has(name));
    const chatNames = normalizeWorldInfoNameList(chat_metadata?.[WORLD_INFO_METADATA_KEY]).filter(name => existingNames.has(name));
    const reservedNames = new Set([
        ...globalNames,
        ...characterPrimaryNames,
        ...characterAdditionalNames,
        ...chatNames,
    ]);
    const otherNames = nativeOrderNames.filter(name => !reservedNames.has(name));

    return [
        { label: '当前开启的全局世界书', names: orderWorldInfoNames(globalNames, nativeOrderNames) },
        { label: '角色卡世界书', names: orderWorldInfoNames(characterPrimaryNames, nativeOrderNames) },
        { label: '附加角色世界书', names: orderWorldInfoNames(characterAdditionalNames, nativeOrderNames) },
        { label: '聊天世界书', names: orderWorldInfoNames(chatNames, nativeOrderNames) },
        { label: '其他世界书', names: otherNames },
    ];
}

function getCurrentCharacterAdditionalWorldInfoNames() {
    if (this_chid === undefined || this_chid === null) {
        return [];
    }

    let fileName = '';

    try {
        fileName = getCharaFilename(this_chid);
    } catch (error) {
        console.debug(`${LOG_PREFIX} Failed to resolve current character lorebook file name`, error);
    }

    if (!fileName) {
        return [];
    }

    const extraCharLore = world_info?.charLore?.find(entry => entry?.name === fileName);
    return normalizeWorldInfoNameList(extraCharLore?.extraBooks);
}

function normalizeWorldInfoNameList(value) {
    const values = Array.isArray(value) ? value : [value];
    const knownWorldNames = new Set(Array.isArray(world_names) ? world_names : []);
    const seen = new Set();

    return values
        .map(name => String(name ?? '').trim())
        .filter(name => {
            if (!name || seen.has(name)) {
                return false;
            }

            if (knownWorldNames.size > 0 && !knownWorldNames.has(name)) {
                return false;
            }

            seen.add(name);
            return true;
        });
}

function orderWorldInfoNames(names, nativeOrderNames) {
    const order = new Map(nativeOrderNames.map((name, index) => [name, index]));

    return names
        .filter((name, index, array) => array.indexOf(name) === index)
        .sort((a, b) => (order.get(a) ?? Number.MAX_SAFE_INTEGER) - (order.get(b) ?? Number.MAX_SAFE_INTEGER));
}

function getWorldInfoOptionName(option) {
    return String(option?.textContent ?? '').trim();
}

function getWorldInfoOptionSortIndex(option) {
    const parsed = Number.parseInt(option?.value ?? '', 10);
    return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
}

function refreshWorldInfoEditorSelect2(select) {
    const $select = globalThis.jQuery?.(select);

    if (!$select?.data?.('select2')) {
        return;
    }

    $select.trigger('change.select2');
}

function shouldWrapWorldInfoPaginationCall(targets, args) {
    const options = args[0];

    return options
        && typeof options === 'object'
        && !Array.isArray(options)
        && typeof options.callback === 'function'
        && targets?.length === 1
        && targets[0] instanceof Element
        && targets[0].id === 'world_info_pagination';
}

function installWorldInfoVueListAppendCapturePatch(state = getWorldInfoVueListOptimizationState()) {
    if (state.patchedAppend && globalThis.jQuery?.fn?.append === state.patchedAppend) {
        return;
    }

    const originalAppend = globalThis.jQuery?.fn?.append;

    if (typeof originalAppend !== 'function') {
        console.warn(`${LOG_PREFIX} jQuery.append is unavailable; World Info list optimization was not installed`);
        return;
    }

    function patchedAppend(...args) {
        const capture = state.activeAppendCapture;

        if (settings.worldInfoListOptimizationEnabled
            && capture?.list
            && this?.length === 1
            && this[0] === capture.list) {
            capture.appendCalls.push(args);
            return this;
        }

        return originalAppend.apply(this, args);
    }

    patchedAppend.__baiBaiToolkitWorldInfoVueListAppendPatched = true;
    patchedAppend.__baiBaiToolkitOriginalAppend = originalAppend;
    Object.assign(patchedAppend, originalAppend);

    state.originalAppend = originalAppend;
    state.patchedAppend = patchedAppend;
    globalThis.jQuery.fn.append = patchedAppend;
}

function restoreWorldInfoVueListAppendCapturePatch(state = getWorldInfoVueListOptimizationState()) {
    if (!state.patchedAppend || !globalThis.jQuery?.fn) {
        return;
    }

    if (globalThis.jQuery.fn.append === state.patchedAppend && typeof state.originalAppend === 'function') {
        globalThis.jQuery.fn.append = state.originalAppend;
    }

    state.activeAppendCapture = null;
    state.originalAppend = null;
    state.patchedAppend = null;
}

async function renderWorldInfoVueListFromNativeCallback(nativeCallback, callbackThis, page, callbackArgs) {
    const state = getWorldInfoVueListOptimizationState();
    const previousRender = state.renderQueue || Promise.resolve();
    const render = previousRender
        .catch(() => { })
        .then(() => renderWorldInfoVueListFromNativeCallbackLocked(state, nativeCallback, callbackThis, page, callbackArgs));
    const cleanup = render.finally(() => {
        if (state.renderQueue === cleanup) {
            state.renderQueue = null;
        }
    });

    state.renderQueue = cleanup;
    return render;
}

async function renderWorldInfoVueListFromNativeCallbackLocked(state, nativeCallback, callbackThis, page, callbackArgs) {
    const list = document.getElementById('world_popup_entries_list');

    if (!settings.worldInfoListOptimizationEnabled || !(list instanceof HTMLElement) || typeof nativeCallback !== 'function') {
        return nativeCallback.call(callbackThis, page, ...callbackArgs);
    }

    unmountWorldInfoVueListApp(state);

    const capture = {
        list,
        appendCalls: [],
    };

    state.activeAppendCapture = capture;
    installWorldInfoVueListAppendCapturePatch(state);
    const append = state.originalAppend;

    try {
        const result = await nativeCallback.call(callbackThis, page, ...callbackArgs);

        if (!settings.worldInfoListOptimizationEnabled) {
            restoreWorldInfoVueListAppendCapturePatch(state);
            appendCapturedWorldInfoListCalls(state, list, capture.appendCalls, append);
            return result;
        }

        if (state.activeAppendCapture !== capture) {
            restoreWorldInfoVueListAppendCapturePatch(state);
            return result;
        }

        state.activeAppendCapture = null;
        restoreWorldInfoVueListAppendCapturePatch(state);

        if (capture.appendCalls.length === 0) {
            return result;
        }

        await mountWorldInfoVueListApp(state, list, capture.appendCalls, append);
        return result;
    } catch (error) {
        console.debug(`${LOG_PREFIX} Failed to render World Info Vue list`, error);
        state.activeAppendCapture = null;
        restoreWorldInfoVueListAppendCapturePatch(state);
        appendCapturedWorldInfoListCalls(state, list, capture.appendCalls, append);
        throw error;
    } finally {
        if (state.activeAppendCapture === capture) {
            state.activeAppendCapture = null;
        }
        restoreWorldInfoVueListAppendCapturePatch(state);
    }
}

async function mountWorldInfoVueListApp(state, list, appendCalls, append) {
    const vue = await loadWorldInfoVueListModule(state);
    const renderToken = ++state.renderToken;

    unmountWorldInfoVueListApp(state);

    state.root = list;
    state.app = vue.createApp(createWorldInfoVueListRootComponent(vue, {
        state,
        list,
        appendCalls,
        append,
        renderToken,
    }));
    state.app.mount(list);
}

function createWorldInfoVueListRootComponent(vue, context) {
    return {
        name: 'BaiBaiWorldInfoVueList',
        setup() {
            vue.onMounted(() => {
                if (context.state.renderToken !== context.renderToken || !settings.worldInfoListOptimizationEnabled) {
                    return;
                }

                appendCapturedWorldInfoListCalls(context.state, context.list, context.appendCalls, context.append);
                refreshWorldInfoVueListAfterAppend(context.list);
            });

            return () => null;
        },
    };
}

function appendCapturedWorldInfoListCalls(state, list, appendCalls, appendOverride = null) {
    if (!(list instanceof HTMLElement) || !Array.isArray(appendCalls) || appendCalls.length === 0) {
        return;
    }

    const append = appendOverride || state.originalAppend;

    if (typeof append !== 'function') {
        for (const args of appendCalls) {
            list.append(...normalizeWorldInfoAppendArguments(args));
        }
        return;
    }

    const target = globalThis.jQuery?.(list);

    if (!target) {
        return;
    }

    for (const args of appendCalls) {
        append.apply(target, args);
    }
}

function normalizeWorldInfoAppendArguments(args) {
    const nodes = [];

    for (const arg of args) {
        if (arg instanceof Node) {
            nodes.push(arg);
        } else if (arg?.jquery && typeof arg.toArray === 'function') {
            nodes.push(...arg.toArray());
        } else if (Array.isArray(arg)) {
            for (const item of arg) {
                if (item instanceof Node) {
                    nodes.push(item);
                } else if (item?.jquery && typeof item.toArray === 'function') {
                    nodes.push(...item.toArray());
                }
            }
        } else if (typeof arg === 'string') {
            const template = document.createElement('template');
            template.innerHTML = arg;
            nodes.push(...template.content.childNodes);
        }
    }

    return nodes;
}

function refreshWorldInfoVueListAfterAppend(list) {
    applyWorldInfoPopupLayout();
    applyWorldInfoMobileHeaderLayouts(list);
    applyWorldInfoMobileExpandedLayouts(list);

    list.querySelectorAll('textarea[name="comment"]').forEach(textarea => {
        if (textarea instanceof HTMLTextAreaElement && !globalThis.CSS?.supports?.('field-sizing', 'content')) {
            void resetScrollHeight(textarea);
        }
    });
}

function installWorldInfoMobileHeaderLayoutWatcher(state = getWorldInfoVueListOptimizationState()) {
    if (state.mobileHeaderLayoutHandler) {
        return;
    }

    const mediaQuery = globalThis.matchMedia?.('(max-width: 600px)');
    const handler = () => {
        const list = document.getElementById('world_popup_entries_list');

        if (!(list instanceof HTMLElement)) {
            return;
        }

        if (shouldUseWorldInfoMobileHeaderLayout()) {
            applyWorldInfoPopupLayout();
            applyWorldInfoMobileHeaderLayouts(list);
            applyWorldInfoMobileExpandedLayouts(list);
        } else {
            restoreWorldInfoPopupLayout();
            restoreWorldInfoMobileExpandedLayouts(list);
            restoreWorldInfoMobileHeaderLayouts(list);
        }
    };

    state.mobileHeaderLayoutHandler = handler;
    state.mobileHeaderLayoutMediaQuery = mediaQuery || null;

    if (mediaQuery?.addEventListener) {
        mediaQuery.addEventListener('change', handler);
    } else if (mediaQuery?.addListener) {
        mediaQuery.addListener(handler);
    } else {
        globalThis.addEventListener?.('resize', handler);
    }

    handler();
}

function installWorldInfoMobileLayoutMutationObserver(state = getWorldInfoVueListOptimizationState()) {
    if (state.mobileLayoutMutationObserver) {
        return;
    }

    const list = document.getElementById('world_popup_entries_list');

    if (!(list instanceof HTMLElement) || typeof MutationObserver !== 'function') {
        return;
    }

    const observer = new MutationObserver(mutations => {
        if (!settings.worldInfoListOptimizationEnabled) {
            return;
        }

        let shouldRefresh = false;

        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                if (!(node instanceof Element)) {
                    continue;
                }

                if (node.matches('.world_entry_edit') || node.querySelector?.('.world_entry_edit')) {
                    shouldRefresh = true;
                    break;
                }
            }

            if (shouldRefresh) {
                break;
            }
        }

        if (!shouldRefresh) {
            return;
        }

        if (shouldUseWorldInfoMobileHeaderLayout()) {
            applyWorldInfoPopupLayout();
            applyWorldInfoMobileHeaderLayouts(list);
            applyWorldInfoMobileExpandedLayouts(list);
        } else {
            restoreWorldInfoPopupLayout();
            restoreWorldInfoMobileExpandedLayouts(list);
            restoreWorldInfoMobileHeaderLayouts(list);
        }
    });

    observer.observe(list, { childList: true, subtree: true });
    state.mobileLayoutMutationObserver = observer;
}

function removeWorldInfoMobileLayoutMutationObserver(state = getWorldInfoVueListOptimizationState()) {
    state.mobileLayoutMutationObserver?.disconnect();
    state.mobileLayoutMutationObserver = null;
}

function removeWorldInfoMobileHeaderLayoutWatcher(state = getWorldInfoVueListOptimizationState()) {
    const handler = state.mobileHeaderLayoutHandler;
    const mediaQuery = state.mobileHeaderLayoutMediaQuery;

    if (!handler) {
        return;
    }

    if (mediaQuery?.removeEventListener) {
        mediaQuery.removeEventListener('change', handler);
    } else if (mediaQuery?.removeListener) {
        mediaQuery.removeListener(handler);
    } else {
        globalThis.removeEventListener?.('resize', handler);
    }

    state.mobileHeaderLayoutHandler = null;
    state.mobileHeaderLayoutMediaQuery = null;
}

function shouldUseWorldInfoMobileHeaderLayout() {
    return settings.worldInfoListOptimizationEnabled
        && Boolean(globalThis.matchMedia?.('(max-width: 600px)').matches);
}

function applyWorldInfoMobileHeaderLayouts(root = document) {
    if (!shouldUseWorldInfoMobileHeaderLayout()) {
        restoreWorldInfoMobileHeaderLayouts(root);
        return;
    }

    getWorldInfoEntryElements(root).forEach(entry => {
        applyWorldInfoMobileHeaderLayout(entry);
    });
}

function applyWorldInfoMobileExpandedLayouts(root = document) {
    if (!shouldUseWorldInfoMobileHeaderLayout()) {
        restoreWorldInfoMobileExpandedLayouts(root);
        return;
    }

    getWorldInfoEntryElements(root).forEach(entry => {
        entry.querySelectorAll(':scope .world_entry_edit').forEach(edit => {
            applyWorldInfoMobileExpandedLayout(edit);
        });
    });
}

function applyWorldInfoPopupLayout() {
    if (!shouldUseWorldInfoMobileHeaderLayout()) {
        restoreWorldInfoPopupLayout();
        return;
    }

    const popup = document.getElementById('world_popup');
    const list = document.getElementById('world_popup_entries_list');

    if (!(popup instanceof HTMLElement)
        || !(list instanceof HTMLElement)
        || list.parentElement !== popup
        || popup.dataset.baiBaiWorldInfoPopupLayout === 'true') {
        return;
    }

    const nodesBeforeList = [];
    for (let node = popup.firstChild; node && node !== list; node = node.nextSibling) {
        nodesBeforeList.push(node);
    }

    if (!nodesBeforeList.some(node => node instanceof HTMLElement)) {
        return;
    }

    const marker = document.createComment('bai-bai-world-info-popup-layout-placeholder');
    const header = document.createElement('div');
    header.className = 'bai-bai-wi-popup-header';
    const sourceStash = document.createElement('div');
    sourceStash.className = 'bai-bai-wi-popup-source-stash';
    sourceStash.hidden = true;
    const movedNodes = [];

    nodesBeforeList[0].before(marker);
    marker.after(header);
    header.append(sourceStash);
    sourceStash.append(...nodesBeforeList);

    applyWorldInfoPopupHeaderRows(header, sourceStash, movedNodes);

    popup.dataset.baiBaiWorldInfoPopupLayout = 'true';
    popup.__baiBaiWorldInfoPopupLayout = {
        header,
        marker,
        nodesBeforeList,
        movedNodes,
    };
}

function restoreWorldInfoPopupLayout() {
    const popup = document.getElementById('world_popup');
    const state = popup?.__baiBaiWorldInfoPopupLayout;

    if (!(popup instanceof HTMLElement) || !state?.header) {
        return;
    }

    for (const item of state.movedNodes || []) {
        if (item?.node instanceof Node && item.placeholder instanceof Comment && item.placeholder.parentNode) {
            item.placeholder.replaceWith(item.node);
        }
    }

    if (state.marker instanceof Comment && state.marker.parentNode) {
        state.marker.replaceWith(...(state.nodesBeforeList || Array.from(state.header.childNodes)));
    } else if (state.header.parentNode) {
        state.header.before(...(state.nodesBeforeList || Array.from(state.header.childNodes)));
    }

    state.header.remove();
    delete popup.__baiBaiWorldInfoPopupLayout;
    delete popup.dataset.baiBaiWorldInfoPopupLayout;
}

function applyWorldInfoPopupHeaderRows(header, sourceStash, movedNodes) {
    const select = sourceStash.querySelector('#world_editor_select');
    const createButton = sourceStash.querySelector('#world_create_button');
    const orNode = findWorldInfoPopupOrNode(sourceStash, createButton);
    const selectNodes = getWorldInfoPopupControlVisualNodes(select);
    const selectNodeSet = new Set(selectNodes);
    const pushedNodes = new Set();
    const flatNodes = getWorldInfoPopupFlatHeaderNodes(sourceStash);

    for (const node of selectNodes) {
        if (flatNodes.includes(node)) {
            moveWorldInfoPopupLayoutNode(node, header, movedNodes);
            pushedNodes.add(node);
        }
    }

    if (orNode instanceof Node) {
        moveWorldInfoPopupLayoutNode(orNode, header, movedNodes);
        pushedNodes.add(orNode);
    }

    if (createButton instanceof Node) {
        moveWorldInfoPopupLayoutNode(createButton, header, movedNodes);
        pushedNodes.add(createButton);
    }

    for (const node of flatNodes) {
        if (pushedNodes.has(node) || selectNodeSet.has(node)) {
            continue;
        }

        moveWorldInfoPopupLayoutNode(node, header, movedNodes);
        pushedNodes.add(node);
    }
}

function getWorldInfoPopupFlatHeaderNodes(root) {
    const nodes = [];
    collectWorldInfoPopupFlatHeaderNodes(root, nodes);
    return nodes;
}

function collectWorldInfoPopupFlatHeaderNodes(parent, nodes) {
    for (const node of Array.from(parent.childNodes)) {
        if (node.nodeType === Node.TEXT_NODE) {
            if (node.nodeValue?.trim()) {
                nodes.push(node);
            }
            continue;
        }

        if (!(node instanceof HTMLElement)) {
            continue;
        }

        if (isWorldInfoPopupFlatHeaderItem(node)) {
            nodes.push(node);
            continue;
        }

        collectWorldInfoPopupFlatHeaderNodes(node, nodes);
    }
}

function isWorldInfoPopupFlatHeaderItem(element) {
    if (!(element instanceof HTMLElement)) {
        return false;
    }

    if (element.id === 'world_info_pagination') {
        return true;
    }

    if (element.matches([
        '#world_editor_select',
        '#world_create_button',
        '.select2-container',
        '.menu_button',
        'button',
        'input',
        'select',
        'textarea',
        'a[href]',
    ].join(','))) {
        return true;
    }

    return element.childElementCount === 0 && Boolean(element.textContent?.trim());
}

function getWorldInfoPopupControlVisualNodes(control) {
    if (!(control instanceof HTMLElement)) {
        return [];
    }

    const nodes = [control];
    const next = control.nextElementSibling;

    if (next instanceof HTMLElement && next.classList.contains('select2-container')) {
        nodes.push(next);
    }

    return nodes;
}

function moveWorldInfoPopupLayoutNode(node, target, movedNodes) {
    if (!(node instanceof Node) || !(target instanceof HTMLElement)) {
        return;
    }

    const placeholder = document.createComment('bai-bai-world-info-popup-inner-placeholder');
    node.before(placeholder);
    movedNodes.push({ node, placeholder });
    target.append(node);
}

function findWorldInfoPopupOrNode(root, createButton) {
    if (!(root instanceof HTMLElement)) {
        return null;
    }

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
        acceptNode(node) {
            if (node === createButton || createButton?.contains?.(node)) {
                return NodeFilter.FILTER_REJECT;
            }

            const text = node.textContent?.trim();

            if (/^(\u6216|or)$/i.test(text || '')) {
                return NodeFilter.FILTER_ACCEPT;
            }

            return NodeFilter.FILTER_SKIP;
        },
    });

    return walker.nextNode();
}

function applyWorldInfoMobileExpandedLayout(edit) {
    if (!(edit instanceof HTMLElement) || edit.dataset.baiBaiWorldInfoMobileExpandedLayout === 'true') {
        return;
    }

    const mainRow = edit.querySelector(':scope > .flex-container.wide100p.alignitemscenter');
    const keywordsBlock = mainRow?.querySelector(':scope > [name="keywordsAndLogicBlock"]');
    const perEntryOverridesBlock = mainRow?.querySelector(':scope > [name="perEntryOverridesBlock"]');
    const contentBlock = mainRow?.querySelector(':scope > [name="contentAndCharFilterBlock"]');
    const commentContainer = mainRow?.querySelector(':scope > .commentContainer');
    const primaryKeyBlock = keywordsBlock?.querySelector(':scope > .keyprimary');
    const logicBlock = keywordsBlock?.querySelector(':scope > .world_entry_form_control:not(.keyprimary):not(.keysecondary)');
    const secondaryKeyBlock = keywordsBlock?.querySelector(':scope > .keysecondary');
    const contentTextarea = contentBlock?.querySelector('textarea[name="content"]');
    const contentControl = contentTextarea?.closest('.world_entry_form_control');
    const contentHeader = contentControl?.querySelector('label[for="content "] small > span.alignitemscenter');
    const contentTitleGroup = contentHeader?.querySelector(':scope > .alignitemscenter.flex-container');
    const contentMeta = Array.from(contentHeader?.children ?? [])
        .find(child => child instanceof HTMLElement && child !== contentTitleGroup && child.querySelector('.world_entry_form_token_counter'));
    const contentMaximize = contentTitleGroup?.querySelector('.editor_maximize');
    const recursionOptions = Array.from(contentHeader?.children ?? [])
        .find(element => element instanceof HTMLElement && element.querySelector('input[name="excludeRecursion"]'));

    if (!(mainRow instanceof HTMLElement)
        || !(keywordsBlock instanceof HTMLElement)
        || !(primaryKeyBlock instanceof HTMLElement)
        || !(contentBlock instanceof HTMLElement)) {
        return;
    }

    const mobileAdvancedBlock = document.createElement('div');
    mobileAdvancedBlock.className = 'bai-bai-wi-mobile-expanded-advanced flex-container flexFlowColumn flexGap10';

    if (contentHeader instanceof HTMLElement) {
        contentHeader.classList.add('bai-bai-wi-mobile-content-header');
    }

    if (contentTitleGroup instanceof HTMLElement) {
        contentTitleGroup.classList.add('bai-bai-wi-mobile-content-title-group');
    }

    if (contentMeta instanceof HTMLElement) {
        contentMeta.classList.add('bai-bai-wi-mobile-content-meta');
    }

    const tokenGapTextNode = compactWorldInfoMobileTokenGap(contentMeta);
    const contentTextareaRowsState = setWorldInfoMobileContentTextareaRows(contentTextarea, 14);

    if (contentMaximize instanceof HTMLElement) {
        contentMaximize.classList.add('bai-bai-wi-mobile-content-maximize');
        contentHeader?.append(contentMaximize);
    }

    [
        logicBlock,
        secondaryKeyBlock,
        recursionOptions,
    ].forEach(node => {
        if (node instanceof HTMLElement) {
            mobileAdvancedBlock.append(node);
        }
    });

    const extraNodes = [
        mobileAdvancedBlock.childElementCount > 0 ? mobileAdvancedBlock : null,
        perEntryOverridesBlock,
        commentContainer,
        ...Array.from(edit.children).filter(child => child !== mainRow),
    ].filter(node => node instanceof HTMLElement);

    const placeholders = new Map();

    for (const node of extraNodes) {
        const placeholder = document.createComment('bai-bai-world-info-mobile-expanded-placeholder');
        node.before(placeholder);
        placeholders.set(node, placeholder);
    }

    mainRow.classList.add('bai-bai-wi-mobile-expanded-main');

    const extraDrawer = document.createElement('div');
    extraDrawer.className = 'bai-bai-wi-mobile-expanded-extra inline-drawer wide100p flexFlowColumn';

    const extraHeader = document.createElement('div');
    extraHeader.className = 'bai-bai-wi-mobile-expanded-extra-toggle inline-drawer-header inline-drawer-header-pointer';
    const extraTitle = document.createElement('strong');
    extraTitle.textContent = '更多设置';
    const extraIcon = document.createElement('div');
    extraIcon.className = 'fa-solid fa-circle-chevron-down inline-drawer-icon down';
    extraHeader.append(extraTitle, extraIcon);

    const extraContent = document.createElement('div');
    extraContent.className = 'bai-bai-wi-mobile-expanded-extra-content inline-drawer-content flex-container flexFlowColumn flexGap10 paddingBottom5px';
    extraContent.style.display = 'none';
    extraContent.append(...extraNodes);

    const toggleHandler = (event) => {
        event.preventDefault();
        event.stopPropagation();
        const expand = getComputedStyle(extraContent).display === 'none';
        extraContent.style.display = expand ? 'flex' : 'none';
        extraIcon.classList.toggle('down', !expand);
        extraIcon.classList.toggle('up', expand);
        extraIcon.classList.toggle('fa-circle-chevron-down', !expand);
        extraIcon.classList.toggle('fa-circle-chevron-up', expand);
    };

    extraHeader.addEventListener('click', toggleHandler);
    extraDrawer.append(extraHeader, extraContent);
    edit.append(extraDrawer);

    edit.dataset.baiBaiWorldInfoMobileExpandedLayout = 'true';
    edit.__baiBaiWorldInfoMobileExpandedLayout = {
        mainRow,
        keywordsBlock,
        primaryKeyBlock,
        mobileAdvancedBlock,
        logicBlock,
        secondaryKeyBlock,
        contentHeader,
        contentTitleGroup,
        contentMeta,
        contentMaximize,
        tokenGapTextNode,
        contentTextareaRowsState,
        recursionOptions,
        contentBlock,
        extraDrawer,
        extraHeader,
        toggleHandler,
        placeholders,
        extraNodes,
    };
}

function restoreWorldInfoMobileExpandedLayouts(root = document) {
    getWorldInfoEntryElements(root).forEach(entry => {
        entry.querySelectorAll(':scope .world_entry_edit[data-bai-bai-world-info-mobile-expanded-layout="true"]').forEach(edit => {
            restoreWorldInfoMobileExpandedLayout(edit);
        });
    });
}

function compactWorldInfoMobileTokenGap(contentMeta) {
    if (!(contentMeta instanceof HTMLElement)) {
        return null;
    }

    const tokenCounter = contentMeta.querySelector('.world_entry_form_token_counter');
    const gapNode = tokenCounter?.previousSibling;

    if (gapNode?.nodeType !== Node.TEXT_NODE || !/[\s\u00a0]+/.test(gapNode.nodeValue || '')) {
        return null;
    }

    const state = {
        node: gapNode,
        value: gapNode.nodeValue,
    };

    gapNode.nodeValue = '';
    return state;
}

function setWorldInfoMobileContentTextareaRows(textarea, rows) {
    if (!(textarea instanceof HTMLTextAreaElement)) {
        return null;
    }

    const state = {
        textarea,
        rowsAttribute: textarea.getAttribute('rows'),
    };

    textarea.rows = rows;
    return state;
}

function restoreWorldInfoMobileContentTextareaRows(state) {
    if (!(state?.textarea instanceof HTMLTextAreaElement)) {
        return;
    }

    if (state.rowsAttribute === null) {
        state.textarea.removeAttribute('rows');
    } else {
        state.textarea.setAttribute('rows', state.rowsAttribute);
    }
}

function restoreWorldInfoMobileExpandedLayout(edit) {
    const state = edit?.__baiBaiWorldInfoMobileExpandedLayout;

    if (!(edit instanceof HTMLElement) || !state?.extraDrawer) {
        return;
    }

    if (state.keywordsBlock instanceof HTMLElement) {
        [state.primaryKeyBlock, state.logicBlock, state.secondaryKeyBlock].forEach(node => {
            if (node instanceof Node) {
                state.keywordsBlock.append(node);
            }
        });
    }

    const contentHeader = state.contentBlock instanceof HTMLElement
        ? state.contentBlock.querySelector('label[for="content "] small > span.alignitemscenter')
        : null;
    if (contentHeader instanceof HTMLElement && state.recursionOptions instanceof HTMLElement) {
        contentHeader.append(state.recursionOptions);
    }

    if (state.contentTitleGroup instanceof HTMLElement && state.contentMaximize instanceof HTMLElement) {
        state.contentTitleGroup.append(state.contentMaximize);
    }

    if (state.tokenGapTextNode?.node?.nodeType === Node.TEXT_NODE) {
        state.tokenGapTextNode.node.nodeValue = state.tokenGapTextNode.value;
    }

    restoreWorldInfoMobileContentTextareaRows(state.contentTextareaRowsState);

    [
        state.contentHeader,
        state.contentTitleGroup,
        state.contentMeta,
        state.contentMaximize,
    ].forEach(node => {
        if (node instanceof HTMLElement) {
            node.classList.remove(
                'bai-bai-wi-mobile-content-header',
                'bai-bai-wi-mobile-content-title-group',
                'bai-bai-wi-mobile-content-meta',
                'bai-bai-wi-mobile-content-maximize',
            );
        }
    });

    state.mainRow?.classList?.remove('bai-bai-wi-mobile-expanded-main');

    for (const node of state.extraNodes || []) {
        const placeholder = state.placeholders?.get(node);
        if (node instanceof Node && placeholder instanceof Comment && placeholder.parentNode) {
            placeholder.replaceWith(node);
        }
    }

    state.extraHeader?.removeEventListener?.('click', state.toggleHandler);
    state.extraDrawer.remove();
    delete edit.__baiBaiWorldInfoMobileExpandedLayout;
    delete edit.dataset.baiBaiWorldInfoMobileExpandedLayout;
}

function applyWorldInfoMobileHeaderLayout(entry) {
    if (!(entry instanceof HTMLElement) || entry.dataset.baiBaiWorldInfoMobileHeaderLayout === 'true') {
        return;
    }

    const header = entry.querySelector(':scope > .world_entry_form > .inline-drawer > .inline-drawer-header');
    const thinControls = header?.querySelector(':scope > .world_entry_thin_controls');
    const body = thinControls?.querySelector(':scope > .flex-container.alignitemscenter.wide100p');
    const titleStatus = body?.querySelector(':scope > .WIEntryTitleAndStatus');
    const controls = body?.querySelector(':scope > .WIEnteryHeaderControls');
    const dragHandle = header?.querySelector(':scope > .drag-handle');
    const toggle = thinControls?.querySelector(':scope > .inline-drawer-toggle');
    const killSwitch = thinControls?.querySelector(':scope > .killSwitch');
    const moveButton = header?.querySelector(':scope > .move_entry_button');
    const duplicateButton = header?.querySelector(':scope > .duplicate_entry_button');
    const deleteButton = header?.querySelector(':scope > .delete_entry_button');
    const positionBlock = controls?.querySelector(':scope > [name="PositionBlock"]');
    const depthBlock = controls?.querySelector('input[name="depth"]')?.closest('.world_entry_form_control');
    const orderBlock = controls?.querySelector('input[name="order"]')?.closest('.world_entry_form_control');
    const probabilityBlock = controls?.querySelector(':scope > .probabilityContainer');
    const entryStateSelector = titleStatus?.querySelector('select[name="entryStateSelector"]');
    const positionLabel = positionBlock?.querySelector(':scope > label');
    const depthLabel = depthBlock?.querySelector(':scope > label');

    if (!(header instanceof HTMLElement)
        || !(thinControls instanceof HTMLElement)
        || !(titleStatus instanceof HTMLElement)
        || !(controls instanceof HTMLElement)
        || !(toggle instanceof HTMLElement)
        || !(killSwitch instanceof HTMLElement)
        || !(positionBlock instanceof HTMLElement)
        || !(depthBlock instanceof HTMLElement)
        || !(orderBlock instanceof HTMLElement)
        || !(probabilityBlock instanceof HTMLElement)
        || !(positionLabel instanceof HTMLElement)
        || !(depthLabel instanceof HTMLElement)) {
        return;
    }

    const originalNodes = [
        dragHandle,
        thinControls,
        moveButton,
        duplicateButton,
        deleteButton,
    ].filter(node => node instanceof Node);
    const placeholders = new Map();

    for (const node of originalNodes) {
        const placeholder = document.createComment('bai-bai-world-info-mobile-header-placeholder');
        node.before(placeholder);
        placeholders.set(node, placeholder);
    }

    const layout = document.createElement('div');
    layout.className = 'bai-bai-wi-mobile-header';
    const hiddenStash = document.createElement('div');
    hiddenStash.className = 'bai-bai-wi-mobile-hidden-stash';
    hiddenStash.hidden = true;
    hiddenStash.append(thinControls);

    const grid = document.createElement('div');
    grid.className = 'bai-bai-wi-mobile-header-grid';

    const titleCell = document.createElement('div');
    titleCell.className = 'bai-bai-wi-mobile-title-cell';
    titleCell.append(titleStatus);

    const stateCell = document.createElement('div');
    stateCell.className = 'bai-bai-wi-mobile-state-cell';
    if (entryStateSelector instanceof HTMLElement) {
        stateCell.append(entryStateSelector);
    }

    const menuCell = document.createElement('div');
    menuCell.className = 'bai-bai-wi-mobile-menu-cell';
    if (dragHandle instanceof HTMLElement) {
        menuCell.append(dragHandle);
    }

    const positionLabelCell = document.createElement('div');
    positionLabelCell.className = 'bai-bai-wi-mobile-position-label-cell';
    positionLabelCell.append(positionLabel);

    const depthLabelCell = document.createElement('div');
    depthLabelCell.className = 'bai-bai-wi-mobile-depth-label-cell';
    depthLabelCell.append(depthLabel);

    const labelSpacerCell = document.createElement('div');
    labelSpacerCell.className = 'bai-bai-wi-mobile-label-spacer-cell';

    const positionCell = document.createElement('div');
    positionCell.className = 'bai-bai-wi-mobile-position-cell';
    positionCell.append(positionBlock);

    const depthCell = document.createElement('div');
    depthCell.className = 'bai-bai-wi-mobile-depth-cell';
    depthCell.append(depthBlock);

    const enabledCell = document.createElement('div');
    enabledCell.className = 'bai-bai-wi-mobile-enabled-cell';
    enabledCell.append(killSwitch);

    grid.append(
        titleCell, stateCell, menuCell,
        positionLabelCell, depthLabelCell, labelSpacerCell,
        positionCell, depthCell, enabledCell,
    );

    const footer = document.createElement('div');
    footer.className = 'bai-bai-wi-mobile-footer';
    const numberGroup = document.createElement('div');
    numberGroup.className = 'bai-bai-wi-mobile-number-group';
    numberGroup.append(orderBlock, probabilityBlock);

    const actionGroup = document.createElement('div');
    actionGroup.className = 'bai-bai-wi-mobile-action-group';
    [moveButton, duplicateButton, deleteButton].forEach(button => {
        if (button instanceof HTMLElement) {
            actionGroup.append(button);
        }
    });

    const expandSlot = document.createElement('div');
    expandSlot.className = 'bai-bai-wi-mobile-expand-slot';
    expandSlot.append(toggle);

    footer.append(numberGroup, actionGroup, expandSlot);
    layout.append(hiddenStash, grid, footer);
    header.append(layout);

    entry.dataset.baiBaiWorldInfoMobileHeaderLayout = 'true';
    entry.__baiBaiWorldInfoMobileHeaderLayout = {
        placeholders,
        layout,
        hiddenStash,
        nodes: originalNodes,
        thinControls,
        body,
        titleStatus,
        entryStateSelector,
        positionLabel,
        depthLabel,
        controls,
        toggle,
        killSwitch,
        positionBlock,
        depthBlock,
        orderBlock,
        probabilityBlock,
    };
}

function restoreWorldInfoMobileHeaderLayouts(root = document) {
    getWorldInfoEntryElements(root)
        .filter(entry => entry.dataset.baiBaiWorldInfoMobileHeaderLayout === 'true')
        .forEach(entry => {
        restoreWorldInfoMobileHeaderLayout(entry);
    });
}

function getWorldInfoEntryElements(root = document) {
    if (root instanceof HTMLElement && root.matches('#world_popup_entries_list > .world_entry')) {
        return [root];
    }

    if (root instanceof HTMLElement && root.id === 'world_popup_entries_list') {
        return Array.from(root.querySelectorAll(':scope > .world_entry'));
    }

    return Array.from(root.querySelectorAll?.('#world_popup_entries_list > .world_entry') ?? []);
}

function restoreWorldInfoMobileHeaderLayout(entry) {
    const state = entry?.__baiBaiWorldInfoMobileHeaderLayout;

    if (!(entry instanceof HTMLElement) || !state?.layout) {
        return;
    }

    if (state.titleStatus instanceof HTMLElement && state.entryStateSelector instanceof HTMLElement) {
        state.titleStatus.append(state.entryStateSelector);
    }

    if (state.positionBlock instanceof HTMLElement && state.positionLabel instanceof HTMLElement) {
        state.positionBlock.prepend(state.positionLabel);
    }

    if (state.depthBlock instanceof HTMLElement && state.depthLabel instanceof HTMLElement) {
        state.depthBlock.prepend(state.depthLabel);
    }

    if (state.body instanceof HTMLElement && state.titleStatus instanceof HTMLElement && state.controls instanceof HTMLElement) {
        state.body.append(state.titleStatus, state.controls);
    }

    if (state.controls instanceof HTMLElement) {
        [state.positionBlock, state.depthBlock, state.orderBlock, state.probabilityBlock].forEach(node => {
            if (node instanceof Node) {
                state.controls.append(node);
            }
        });
    }

    if (state.thinControls instanceof HTMLElement) {
        [state.toggle, state.killSwitch, state.body].forEach(node => {
            if (node instanceof Node) {
                state.thinControls.append(node);
            }
        });
    }

    for (const node of state.nodes || []) {
        const placeholder = state.placeholders?.get(node);
        if (node instanceof Node && placeholder instanceof Comment && placeholder.parentNode) {
            placeholder.replaceWith(node);
        }
    }

    state.layout.remove();
    delete entry.__baiBaiWorldInfoMobileHeaderLayout;
    delete entry.dataset.baiBaiWorldInfoMobileHeaderLayout;
}

function installWorldInfoMobileHeaderLayoutStyle() {
    if (document.getElementById(WORLD_INFO_MOBILE_HEADER_LAYOUT_STYLE_ID)) {
        return;
    }

    const style = document.createElement('style');
    style.id = WORLD_INFO_MOBILE_HEADER_LAYOUT_STYLE_ID;
    style.textContent = `
#world_popup {
    overflow-x: hidden;
}

#WIMultiSelector .bai-bai-wi-global-selector-display {
    align-items: center;
    background-color: var(--SmartThemeBlurTintColor);
    border: 1px solid var(--SmartThemeBorderColor);
    border-radius: 5px;
    box-sizing: border-box;
    color: var(--SmartThemeBodyColor);
    cursor: pointer;
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    min-height: 2.35em;
    max-height: 7.6em;
    min-width: 0;
    overflow-x: hidden;
    overflow-y: auto;
    padding: 4px 6px;
    width: 100%;
}

#WIMultiSelector .bai-bai-wi-global-selector-display.bai-bai-wi-global-selector-open,
#WIMultiSelector .bai-bai-wi-global-selector-display:focus-visible {
    outline: 1px solid color-mix(in srgb, var(--SmartThemeBodyColor) 45%, transparent);
    outline-offset: 1px;
}

#WIMultiSelector .bai-bai-wi-global-selector-placeholder {
    color: var(--SmartThemeBodyColor);
    opacity: 0.62;
    padding: 2px 0;
}

#WIMultiSelector .bai-bai-wi-global-selector-chip {
    align-items: center;
    background-color: color-mix(in srgb, var(--SmartThemeBodyColor) 13%, transparent);
    border: 1px solid color-mix(in srgb, var(--SmartThemeBodyColor) 18%, transparent);
    border-radius: 6px;
    box-sizing: border-box;
    color: var(--SmartThemeBodyColor);
    display: inline-flex;
    gap: 4px;
    line-height: 1.25;
    max-width: 100%;
    min-height: 24px;
    overflow: hidden;
    padding: 3px 5px 3px 8px;
}

#WIMultiSelector .bai-bai-wi-global-selector-chip-label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

#WIMultiSelector .bai-bai-wi-global-selector-chip-remove {
    align-items: center;
    background: transparent;
    border: 0;
    border-radius: 50%;
    color: inherit;
    cursor: pointer;
    display: inline-flex;
    flex: 0 0 auto;
    font-size: 16px;
    height: 20px;
    justify-content: center;
    line-height: 1;
    margin: 0;
    opacity: 0.72;
    padding: 0;
    width: 20px;
}

#WIMultiSelector .bai-bai-wi-global-selector-chip-remove:hover {
    background-color: color-mix(in srgb, var(--SmartThemeBodyColor) 12%, transparent);
    opacity: 1;
}

.${WORLD_INFO_GLOBAL_SELECTOR_DROPDOWN_CLASS} {
    background-color: var(--SmartThemeBlurTintColor);
    border: 1px solid var(--SmartThemeBorderColor);
    border-radius: 5px;
    box-shadow: 0 6px 16px rgba(0, 0, 0, 0.26);
    box-sizing: border-box;
    color: var(--SmartThemeBodyColor);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    position: absolute;
    z-index: 30000;
}

.${WORLD_INFO_GLOBAL_SELECTOR_DROPDOWN_CLASS} .bai-bai-wi-global-selector-search-box {
    border-bottom: 1px solid color-mix(in srgb, var(--SmartThemeBorderColor) 75%, transparent);
    box-sizing: border-box;
    flex: 0 0 auto;
    padding: 6px 8px;
    position: relative;
}

.${WORLD_INFO_GLOBAL_SELECTOR_DROPDOWN_CLASS} .bai-bai-wi-global-selector-search {
    background-color: var(--SmartThemeBlurTintColor) !important;
    border: 1px solid var(--SmartThemeBorderColor) !important;
    border-radius: 4px !important;
    box-sizing: border-box !important;
    color: var(--SmartThemeBodyColor) !important;
    display: block !important;
    font: inherit !important;
    margin: 0 !important;
    min-height: 2.3em !important;
    padding: 4px 34px 4px 8px !important;
    width: 100% !important;
}

.${WORLD_INFO_GLOBAL_SELECTOR_DROPDOWN_CLASS} .bai-bai-wi-global-selector-search::-webkit-search-cancel-button {
    display: none !important;
}

.${WORLD_INFO_GLOBAL_SELECTOR_DROPDOWN_CLASS} .bai-bai-wi-global-selector-search-clear {
    align-items: center !important;
    background: transparent !important;
    border: 0 !important;
    border-radius: 50% !important;
    box-shadow: none !important;
    box-sizing: border-box !important;
    color: var(--SmartThemeBodyColor) !important;
    cursor: pointer !important;
    display: flex !important;
    flex: 0 0 auto !important;
    font-size: 18px !important;
    height: 28px !important;
    justify-content: center !important;
    line-height: 1 !important;
    margin: 0 !important;
    max-width: none !important;
    min-width: 0 !important;
    opacity: 0.7 !important;
    padding: 0 !important;
    position: absolute !important;
    right: 11px !important;
    top: 50% !important;
    transform: translateY(-50%) !important;
    width: 28px !important;
}

.${WORLD_INFO_GLOBAL_SELECTOR_DROPDOWN_CLASS} .bai-bai-wi-global-selector-search-clear:focus,
.${WORLD_INFO_GLOBAL_SELECTOR_DROPDOWN_CLASS} .bai-bai-wi-global-selector-search-clear:focus-visible,
.${WORLD_INFO_GLOBAL_SELECTOR_DROPDOWN_CLASS} .bai-bai-wi-global-selector-search-clear:active {
    background-color: transparent !important;
    box-shadow: none !important;
    outline: none !important;
}

@media (hover: hover) {
    .${WORLD_INFO_GLOBAL_SELECTOR_DROPDOWN_CLASS} .bai-bai-wi-global-selector-search-clear:hover {
        background-color: color-mix(in srgb, var(--SmartThemeBodyColor) 12%, transparent) !important;
        opacity: 1 !important;
    }
}

.bai-bai-wi-global-selector-options {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    padding: 4px 0;
    touch-action: pan-y;
}

.bai-bai-wi-global-selector-option {
    color: var(--SmartThemeBodyColor);
    cursor: pointer;
    line-height: 1.25;
    min-height: 34px;
    padding: 8px 10px;
    touch-action: pan-y;
    user-select: none;
}

.bai-bai-wi-global-selector-option.selected {
    background-color: color-mix(in srgb, var(--SmartThemeBodyColor) 14%, transparent);
    font-weight: 600;
}

.bai-bai-wi-global-selector-option:hover {
    background-color: color-mix(in srgb, var(--SmartThemeBodyColor) 18%, transparent);
}

.bai-bai-wi-global-selector-empty {
    color: var(--SmartThemeBodyColor);
    opacity: 0.62;
    padding: 24px 12px;
    text-align: center;
}

@media (max-width: 600px) {
    #WIMultiSelector .bai-bai-wi-global-selector-display {
        max-height: 6.8em;
        min-height: 2.5em;
    }

    #WIMultiSelector .bai-bai-wi-global-selector-chip {
        min-height: 28px;
        padding: 4px 5px 4px 8px;
    }

    .bai-bai-wi-global-selector-option {
        min-height: 40px;
        padding: 10px 12px;
    }

    #world_popup[data-bai-bai-world-info-popup-layout="true"] > .bai-bai-wi-popup-header {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        column-gap: 8px;
        justify-content: space-between;
        row-gap: 7px;
        margin-top: 20px;
        overflow: hidden;
        width: 100%;
        min-width: 0;
    }

    #world_popup[data-bai-bai-world-info-popup-layout="true"] > .bai-bai-wi-popup-header > * {
        margin-top: 0 !important;
        margin-bottom: 0 !important;
    }

    #world_popup[data-bai-bai-world-info-popup-layout="true"] > .bai-bai-wi-popup-header > .bai-bai-wi-popup-source-stash {
        display: none !important;
    }

    #world_popup[data-bai-bai-world-info-popup-layout="true"] > .bai-bai-wi-popup-header > #world_editor_select,
    #world_popup[data-bai-bai-world-info-popup-layout="true"] > .bai-bai-wi-popup-header > .select2-container {
        flex: 0 0 100%;
        width: 100% !important;
        min-width: 0;
    }

    #world_popup[data-bai-bai-world-info-popup-layout="true"] > .bai-bai-wi-popup-header > .select2-container .select2-selection--single {
        align-items: center !important;
        background-color: var(--SmartThemeBlurTintColor);
        border-color: var(--SmartThemeBorderColor);
        color: var(--SmartThemeBodyColor);
        display: flex !important;
        min-height: 2.25em;
    }

    #world_popup[data-bai-bai-world-info-popup-layout="true"] > .bai-bai-wi-popup-header > .select2-container .select2-selection__rendered {
        align-items: center;
        color: var(--SmartThemeBodyColor);
        display: flex !important;
        flex: 1 1 auto;
        line-height: normal !important;
        min-width: 0;
        overflow: hidden;
        padding-bottom: 2px !important;
        padding-right: 28px !important;
        padding-top: 2px !important;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    #world_popup[data-bai-bai-world-info-popup-layout="true"] > .bai-bai-wi-popup-header > .select2-container .select2-selection__placeholder {
        color: var(--SmartThemeBodyColor);
        opacity: 0.65;
    }

    #world_popup[data-bai-bai-world-info-popup-layout="true"] > .bai-bai-wi-popup-header > .select2-container .select2-selection__clear {
        display: none !important;
    }

    #world_popup[data-bai-bai-world-info-popup-layout="true"] > .bai-bai-wi-popup-header > .select2-container .select2-selection__arrow {
        align-items: center !important;
        color: var(--SmartThemeBodyColor);
        display: flex !important;
        height: 100% !important;
        justify-content: center !important;
        opacity: 0.62;
        right: 8px !important;
        top: 0 !important;
        width: 18px !important;
    }

    #world_popup[data-bai-bai-world-info-popup-layout="true"] > .bai-bai-wi-popup-header > .select2-container .select2-selection__arrow b {
        border-color: currentColor transparent transparent transparent !important;
        border-style: solid !important;
        border-width: 6px 5px 0 5px !important;
        height: 0 !important;
        left: auto !important;
        margin: 0 !important;
        position: static !important;
        top: auto !important;
        width: 0 !important;
    }

    .${WORLD_INFO_EDITOR_SELECT_DROPDOWN_CLASS} .select2-search--dropdown {
        padding: 6px 8px;
    }

    .${WORLD_INFO_EDITOR_SELECT_DROPDOWN_CLASS} .select2-search--dropdown .select2-search__field {
        background-color: var(--SmartThemeBlurTintColor);
        border-color: var(--SmartThemeBorderColor);
        color: var(--SmartThemeBodyColor);
        min-height: 2.25em;
        opacity: 1 !important;
        width: 100%;
    }

    .${WORLD_INFO_EDITOR_SELECT_DROPDOWN_CLASS} .select2-results__group {
        color: var(--SmartThemeBodyColor);
        font-weight: 700;
        padding: 10px 6px 6px;
    }

    .${WORLD_INFO_EDITOR_SELECT_DROPDOWN_CLASS} .select2-results__option {
        padding-left: 6px !important;
    }

    .${WORLD_INFO_EDITOR_SELECT_DROPDOWN_CLASS} .select2-results__option::before,
    .${WORLD_INFO_EDITOR_SELECT_DROPDOWN_CLASS} .select2-results__option::after {
        content: none !important;
        display: none !important;
    }

    .${WORLD_INFO_EDITOR_SELECT_DROPDOWN_CLASS} .select2-results__option input[type="checkbox"],
    .${WORLD_INFO_EDITOR_SELECT_DROPDOWN_CLASS} .select2-results__option .checkbox {
        display: none !important;
    }

    #world_popup[data-bai-bai-world-info-popup-layout="true"] > .bai-bai-wi-popup-header > #world_info_pagination {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 8px;
        line-height: 1;
    }

    #world_popup_entries_list > .world_entry[data-bai-bai-world-info-mobile-header-layout="true"] > .world_entry_form > .inline-drawer > .inline-drawer-header {
        display: block;
        padding: 0;
    }

    #world_popup_entries_list > .world_entry[data-bai-bai-world-info-mobile-header-layout="true"] {
        margin-top: 15px;
    }

    #world_popup_entries_list > .world_entry[data-bai-bai-world-info-mobile-header-layout="true"] > .world_entry_form.wi-card-entry {
        padding-top: 10px;
        padding-bottom: 10px;
    }

    #world_popup_entries_list .bai-bai-wi-mobile-header {
        width: 100%;
        display: flex;
        flex-direction: column;
        gap: 0;
    }

    #world_popup_entries_list .bai-bai-wi-mobile-header-grid {
        display: grid;
        grid-template-columns: minmax(0, 1fr) 46px 20px;
        grid-template-rows: auto auto auto;
        column-gap: 8px;
        row-gap: 0;
        align-items: center;
        width: 100%;
    }

    #world_popup_entries_list .bai-bai-wi-mobile-header textarea,
    #world_popup_entries_list .bai-bai-wi-mobile-header select,
    #world_popup_entries_list .bai-bai-wi-mobile-header input,
    #world_popup_entries_list .bai-bai-wi-mobile-header .menu_button,
    #world_popup_entries_list .bai-bai-wi-mobile-header .inline-drawer-toggle {
        margin: 0 !important;
        box-sizing: border-box;
    }

    #world_popup_entries_list .bai-bai-wi-mobile-title-cell,
    #world_popup_entries_list .bai-bai-wi-mobile-position-cell {
        min-width: 0;
    }

    #world_popup_entries_list .bai-bai-wi-mobile-title-cell .WIEntryTitleAndStatus,
    #world_popup_entries_list .bai-bai-wi-mobile-title-cell .WIEntryTitleAndStatus > .flex-container,
    #world_popup_entries_list .bai-bai-wi-mobile-position-cell [name="PositionBlock"] {
        width: 100%;
    }

    #world_popup_entries_list .bai-bai-wi-mobile-title-cell textarea[name="comment"],
    #world_popup_entries_list .bai-bai-wi-mobile-state-cell select[name="entryStateSelector"] {
        height: 34px !important;
        min-height: 34px !important;
        box-sizing: border-box;
        padding: 3px 6px !important;
    }

    #world_popup_entries_list .bai-bai-wi-mobile-title-cell textarea[name="comment"] {
        font-size: 14px;
        line-height: 20px !important;
        margin: 0 !important;
        padding-top: 6px !important;
        padding-bottom: 6px !important;
    }

    #world_popup_entries_list .bai-bai-wi-mobile-state-cell select[name="entryStateSelector"] {
        font-size: 0.88em;
        margin: 0 !important;
        padding: 0 !important;
        text-align: left;
        text-align-last: left;
        text-indent: 7px;
    }

    #world_popup_entries_list .bai-bai-wi-mobile-position-cell select[name="position"],
    #world_popup_entries_list .bai-bai-wi-mobile-depth-cell input[name="depth"] {
        height: 28px !important;
        min-height: 28px !important;
        box-sizing: border-box;
        padding: 2px 6px !important;
        font-size: 12px !important;
    }

    #world_popup_entries_list .bai-bai-wi-mobile-title-cell textarea[name="comment"],
    #world_popup_entries_list .bai-bai-wi-mobile-position-cell select[name="position"] {
        width: 100%;
        min-width: 0;
    }

    #world_popup_entries_list .bai-bai-wi-mobile-state-cell select[name="entryStateSelector"],
    #world_popup_entries_list .bai-bai-wi-mobile-depth-cell input[name="depth"] {
        width: 46px !important;
        min-width: 46px !important;
        max-width: 46px !important;
    }

    #world_popup_entries_list .bai-bai-wi-mobile-position-label-cell,
    #world_popup_entries_list .bai-bai-wi-mobile-depth-label-cell {
        font-size: 11px;
        line-height: 11px;
        opacity: 0.72;
        margin: 10px 0 3px 0;
        min-height: 11px;
    }

    #world_popup_entries_list .bai-bai-wi-mobile-position-label-cell label,
    #world_popup_entries_list .bai-bai-wi-mobile-depth-label-cell label {
        display: block;
        margin: 0;
        padding: 0;
        line-height: 11px;
        pointer-events: none;
    }

    #world_popup_entries_list .bai-bai-wi-mobile-position-cell,
    #world_popup_entries_list .bai-bai-wi-mobile-depth-cell {
        display: flex;
        flex-direction: column;
        justify-content: center;
        margin-top: 0;
    }

    #world_popup_entries_list .bai-bai-wi-mobile-menu-cell,
    #world_popup_entries_list .bai-bai-wi-mobile-enabled-cell {
        display: flex;
        justify-content: center;
        align-items: center;
    }

    #world_popup_entries_list .bai-bai-wi-mobile-enabled-cell {
        align-self: center;
        min-height: 28px;
        padding-bottom: 0;
    }

    #world_popup_entries_list .bai-bai-wi-mobile-menu-cell .drag-handle {
        min-width: 20px;
        text-align: center;
        cursor: grab;
    }

    #world_popup_entries_list .bai-bai-wi-mobile-footer {
        display: flex;
        align-items: end;
        gap: 8px;
        width: 100%;
        margin-top: 10px;
    }

    #world_popup_entries_list .bai-bai-wi-mobile-number-group,
    #world_popup_entries_list .bai-bai-wi-mobile-action-group {
        display: flex;
        align-items: end;
        gap: 6px;
        min-width: 0;
    }

    #world_popup_entries_list .bai-bai-wi-mobile-action-group {
        padding-top: 14px;
    }

    #world_popup_entries_list .bai-bai-wi-mobile-number-group input[name="order"],
    #world_popup_entries_list .bai-bai-wi-mobile-number-group input[name="probability"] {
        height: 28px !important;
        min-height: 28px !important;
        box-sizing: border-box;
        padding: 2px 6px !important;
        font-size: 12px !important;
        width: 66px !important;
        max-width: 66px !important;
    }

    #world_popup_entries_list .bai-bai-wi-mobile-number-group label {
        font-size: 11px;
        line-height: 11px;
        opacity: 0.72;
        display: block;
        margin: 0 0 3px 0;
        padding: 0;
    }

    #world_popup_entries_list .bai-bai-wi-mobile-action-group .menu_button {
        width: 28px !important;
        min-width: 28px !important;
        max-width: 28px !important;
        height: 28px !important;
        min-height: 28px !important;
        max-height: 28px !important;
        aspect-ratio: 1 / 1;
        box-sizing: border-box;
        flex: 0 0 28px;
        flex-shrink: 0;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 0 !important;
        margin: 0 !important;
        line-height: 1 !important;
        overflow: hidden;
    }

    #world_popup_entries_list .bai-bai-wi-mobile-expand-slot {
        margin-left: auto;
        display: flex;
        align-items: flex-end;
        justify-content: flex-end;
        align-self: flex-end;
    }

    #world_popup_entries_list .bai-bai-wi-mobile-expand-slot .inline-drawer-toggle {
        width: 28px !important;
        min-width: 28px !important;
        max-width: 28px !important;
        height: 28px !important;
        min-height: 28px !important;
        max-height: 28px !important;
        aspect-ratio: 1 / 1;
        box-sizing: border-box;
        flex: 0 0 28px;
        flex-shrink: 0;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 0 !important;
        margin: 0 !important;
        font-size: 21px;
        line-height: 1 !important;
        overflow: hidden;
    }

    #world_popup_entries_list .bai-bai-wi-mobile-expand-slot .inline-drawer-toggle::before {
        position: static !important;
        inset: auto !important;
        display: block !important;
        width: auto !important;
        height: auto !important;
        margin: 0 !important;
        line-height: 1 !important;
        transform: none !important;
        text-align: center !important;
    }

    #world_popup_entries_list .world_entry_edit[data-bai-bai-world-info-mobile-expanded-layout="true"] {
        width: 100%;
        display: flex;
        flex-direction: column;
        gap: 8px;
    }

    #world_popup_entries_list .bai-bai-wi-mobile-expanded-main {
        width: 100%;
        display: flex !important;
        flex-direction: column !important;
        align-items: stretch !important;
        gap: 8px;
    }

    #world_popup_entries_list .bai-bai-wi-mobile-expanded-main [name="keywordsAndLogicBlock"] {
        width: 100%;
        display: block;
    }

    #world_popup_entries_list .bai-bai-wi-mobile-expanded-main [name="keywordsAndLogicBlock"] .keyprimary {
        min-width: 0;
        width: 100%;
    }

    #world_popup_entries_list .bai-bai-wi-mobile-expanded-main [name="keywordsAndLogicBlock"] .keyprimary > small {
        text-align: left !important;
        align-self: flex-start;
        margin: 15px 0 2px 2px;
    }

    #world_popup_entries_list .bai-bai-wi-mobile-expanded-main .switch_input_type_icon {
        display: none !important;
    }

    #world_popup_entries_list .bai-bai-wi-mobile-expanded-advanced {
        width: 100%;
    }

    #world_popup_entries_list .bai-bai-wi-mobile-expanded-advanced .keysecondary,
    #world_popup_entries_list .bai-bai-wi-mobile-expanded-advanced .world_entry_form_control {
        width: 100%;
        min-width: 0;
    }

    #world_popup_entries_list .bai-bai-wi-mobile-expanded-advanced select[name="entryLogicType"] {
        width: 100%;
    }

    #world_popup_entries_list .bai-bai-wi-mobile-expanded-main [name="contentAndCharFilterBlock"] {
        width: 100%;
        display: flex;
    }

    #world_popup_entries_list .bai-bai-wi-mobile-content-header {
        display: flex !important;
        align-items: center;
        gap: 6px;
        width: 100%;
        margin-top: 6px;
    }

    #world_popup_entries_list .bai-bai-wi-mobile-content-title-group {
        justify-content: flex-start;
        min-width: 0;
    }

    #world_popup_entries_list .bai-bai-wi-mobile-content-meta {
        text-align: left;
        opacity: 0.85;
    }

    #world_popup_entries_list .bai-bai-wi-mobile-content-maximize {
        margin-left: auto;
        flex: 0 0 auto;
        margin-top: 0;
        margin-right: 0;
        margin-bottom: 0;
    }

    #world_popup_entries_list .bai-bai-wi-mobile-expanded-main textarea[name="content"] {
        width: 100%;
        min-height: 292px;
        min-height: calc(14lh + 12px);
    }

    #world_popup_entries_list .bai-bai-wi-mobile-expanded-extra {
        width: 100%;
        border-top: 1px solid var(--SmartThemeBorderColor);
        padding-top: 4px;
    }

    #world_popup_entries_list .bai-bai-wi-mobile-expanded-extra-toggle {
        min-height: 30px;
        padding: 4px 0;
    }

    #world_popup_entries_list .bai-bai-wi-mobile-expanded-extra-content {
        width: 100%;
        gap: 8px;
    }

    #world_popup_entries_list .bai-bai-wi-mobile-expanded-extra-content > .flex-container,
    #world_popup_entries_list .bai-bai-wi-mobile-expanded-extra-content [name="perEntryOverridesBlock"] {
        width: 100%;
        flex-flow: column;
        align-items: stretch;
        gap: 6px;
    }

    #world_popup[data-bai-bai-world-info-popup-layout="true"] {
        display: block !important;
        flex-direction: initial !important;
        flex-wrap: initial !important;
        align-items: initial !important;
        justify-content: initial !important;
        gap: initial !important;
        row-gap: initial !important;
    }

    #world_popup[data-bai-bai-world-info-popup-layout="true"] > .bai-bai-wi-popup-header {
        display: flex !important;
        order: initial !important;
    }

    #world_popup[data-bai-bai-world-info-popup-layout="true"] > .bai-bai-wi-popup-header > * {
        order: initial !important;
    }

    #world_popup[data-bai-bai-world-info-popup-layout="true"] > .bai-bai-wi-popup-header > .bai-bai-wi-popup-source-stash {
        display: none !important;
    }

    #world_popup[data-bai-bai-world-info-popup-layout="true"] > #world_popup_entries_list {
        display: block !important;
        order: initial !important;
        width: 100% !important;
    }

    #world_popup_entries_list > .world_entry[data-bai-bai-world-info-mobile-header-layout="true"] {
        min-height: 0 !important;
    }

    #world_popup_entries_list > .world_entry[data-bai-bai-world-info-mobile-header-layout="true"] > .world_entry_form.wi-card-entry {
        position: relative !important;
        padding-top: 10px !important;
        padding-bottom: 10px !important;
    }

    #world_popup_entries_list > .world_entry[data-bai-bai-world-info-mobile-header-layout="true"] .bai-bai-wi-mobile-hidden-stash {
        display: none !important;
    }

    #world_popup_entries_list > .world_entry[data-bai-bai-world-info-mobile-header-layout="true"] .bai-bai-wi-mobile-header,
    #world_popup_entries_list > .world_entry[data-bai-bai-world-info-mobile-header-layout="true"] .bai-bai-wi-mobile-header-grid,
    #world_popup_entries_list > .world_entry[data-bai-bai-world-info-mobile-header-layout="true"] .bai-bai-wi-mobile-footer,
    #world_popup_entries_list > .world_entry[data-bai-bai-world-info-mobile-header-layout="true"] .bai-bai-wi-mobile-title-cell,
    #world_popup_entries_list > .world_entry[data-bai-bai-world-info-mobile-header-layout="true"] .bai-bai-wi-mobile-state-cell,
    #world_popup_entries_list > .world_entry[data-bai-bai-world-info-mobile-header-layout="true"] .bai-bai-wi-mobile-menu-cell,
    #world_popup_entries_list > .world_entry[data-bai-bai-world-info-mobile-header-layout="true"] .bai-bai-wi-mobile-position-cell,
    #world_popup_entries_list > .world_entry[data-bai-bai-world-info-mobile-header-layout="true"] .bai-bai-wi-mobile-depth-cell,
    #world_popup_entries_list > .world_entry[data-bai-bai-world-info-mobile-header-layout="true"] .bai-bai-wi-mobile-enabled-cell,
    #world_popup_entries_list > .world_entry[data-bai-bai-world-info-mobile-header-layout="true"] .bai-bai-wi-mobile-number-group,
    #world_popup_entries_list > .world_entry[data-bai-bai-world-info-mobile-header-layout="true"] .bai-bai-wi-mobile-action-group,
    #world_popup_entries_list > .world_entry[data-bai-bai-world-info-mobile-header-layout="true"] .bai-bai-wi-mobile-expand-slot {
        position: static !important;
        inset: auto !important;
        top: auto !important;
        right: auto !important;
        bottom: auto !important;
        left: auto !important;
        z-index: auto !important;
    }

    #world_popup_entries_list > .world_entry[data-bai-bai-world-info-mobile-header-layout="true"] .bai-bai-wi-mobile-header .drag-handle,
    #world_popup_entries_list > .world_entry[data-bai-bai-world-info-mobile-header-layout="true"] .bai-bai-wi-mobile-header .killSwitch,
    #world_popup_entries_list > .world_entry[data-bai-bai-world-info-mobile-header-layout="true"] .bai-bai-wi-mobile-header .move_entry_button,
    #world_popup_entries_list > .world_entry[data-bai-bai-world-info-mobile-header-layout="true"] .bai-bai-wi-mobile-header .duplicate_entry_button,
    #world_popup_entries_list > .world_entry[data-bai-bai-world-info-mobile-header-layout="true"] .bai-bai-wi-mobile-header .delete_entry_button,
    #world_popup_entries_list > .world_entry[data-bai-bai-world-info-mobile-header-layout="true"] .bai-bai-wi-mobile-header .inline-drawer-toggle {
        position: static !important;
        inset: auto !important;
        top: auto !important;
        right: auto !important;
        bottom: auto !important;
        left: auto !important;
        z-index: auto !important;
    }

    #world_popup_entries_list > .world_entry[data-bai-bai-world-info-mobile-header-layout="true"] .bai-bai-wi-mobile-expand-slot .inline-drawer-toggle::before {
        position: static !important;
        inset: auto !important;
        display: block !important;
        width: auto !important;
        height: auto !important;
        margin: 0 !important;
        line-height: 1 !important;
        transform: none !important;
        text-align: center !important;
    }

    #world_popup_entries_list > .world_entry[data-bai-bai-world-info-mobile-header-layout="true"] .bai-bai-wi-mobile-title-cell .WIEntryTitleAndStatus.flex-container.flex1.alignitemscenter,
    #world_popup_entries_list > .world_entry[data-bai-bai-world-info-mobile-header-layout="true"] .bai-bai-wi-mobile-title-cell .WIEntryTitleAndStatus > .flex-container,
    #world_popup_entries_list > .world_entry[data-bai-bai-world-info-mobile-header-layout="true"] .bai-bai-wi-mobile-position-cell [name="PositionBlock"],
    #world_popup_entries_list > .world_entry[data-bai-bai-world-info-mobile-header-layout="true"] .bai-bai-wi-mobile-depth-cell .world_entry_form_control,
    #world_popup_entries_list > .world_entry[data-bai-bai-world-info-mobile-header-layout="true"] .bai-bai-wi-mobile-number-group .world_entry_form_control,
    #world_popup_entries_list > .world_entry[data-bai-bai-world-info-mobile-header-layout="true"] .bai-bai-wi-mobile-number-group .probabilityContainer {
        min-height: 0 !important;
        margin-right: 0 !important;
    }

    #world_popup_entries_list > .world_entry[data-bai-bai-world-info-mobile-header-layout="true"] .bai-bai-wi-mobile-position-cell .world_entry_form_control[name="PositionBlock"] {
        width: 100% !important;
        min-width: 0 !important;
        max-width: none !important;
    }

    #world_popup_entries_list > .world_entry[data-bai-bai-world-info-mobile-header-layout="true"] .world_entry_edit[data-bai-bai-world-info-mobile-expanded-layout="true"] {
        display: flex !important;
        flex-direction: column !important;
        gap: 8px !important;
    }

    #world_popup_entries_list > .world_entry[data-bai-bai-world-info-mobile-header-layout="true"] .world_entry_edit[data-bai-bai-world-info-mobile-expanded-layout="true"] > .bai-bai-wi-mobile-expanded-main {
        display: flex !important;
    }

    #world_popup_entries_list > .world_entry[data-bai-bai-world-info-mobile-header-layout="true"] .world_entry_edit[data-bai-bai-world-info-mobile-expanded-layout="true"] > .bai-bai-wi-mobile-expanded-extra {
        display: flex !important;
    }

    #world_popup_entries_list > .world_entry[data-bai-bai-world-info-mobile-header-layout="true"] .bai-bai-wi-mobile-expanded-main [name="keywordsAndLogicBlock"] {
        display: block !important;
    }

    #world_popup_entries_list > .world_entry[data-bai-bai-world-info-mobile-header-layout="true"] .bai-bai-wi-mobile-expanded-main [name="contentAndCharFilterBlock"],
    #world_popup_entries_list > .world_entry[data-bai-bai-world-info-mobile-header-layout="true"] .bai-bai-wi-mobile-expanded-main [name="contentAndCharFilterBlock"] .world_entry_form_control {
        display: flex !important;
        flex-direction: column !important;
        align-items: stretch !important;
    }
}
`;
    document.head.append(style);
}

function removeWorldInfoMobileHeaderLayoutStyle() {
    document.getElementById(WORLD_INFO_MOBILE_HEADER_LAYOUT_STYLE_ID)?.remove();
}

function unmountWorldInfoVueListApp(state = getWorldInfoVueListOptimizationState()) {
    if (!state.app) {
        return;
    }

    try {
        state.app.unmount();
    } catch (error) {
        console.debug(`${LOG_PREFIX} Failed to unmount World Info Vue list`, error);
    }

    state.app = null;
    state.root = null;
}

async function loadWorldInfoVueListModule(state = getWorldInfoVueListOptimizationState()) {
    if (!state.modulePromise) {
        state.modulePromise = import(new URL(WORLD_INFO_VUE_LIST_MODULE_PATH, import.meta.url).href);
    }

    return state.modulePromise;
}

export function refreshWorldInfoEditorIfOpen() {
    const refreshButton = document.getElementById('world_refresh');
    const worldEditor = document.getElementById('WorldInfo');

    if (!refreshButton || !worldEditor || getComputedStyle(worldEditor).display === 'none') {
        return;
    }

    setTimeout(() => refreshButton.click(), 0);
}

function restoreLegacyWorldInfoCharacterFilterAppendPatch() {
    const currentAppend = globalThis.jQuery?.fn?.append;

    if (currentAppend?.__baiBaiToolkitWorldInfoCharacterFilterAppendPatched) {
        globalThis.jQuery.fn.append = currentAppend.__baiBaiToolkitOriginalAppend;
    }

    extensionState[WORLD_INFO_CHARACTER_FILTER_APPEND_PATCH_KEY] = false;
}

function deferWorldInfoCharacterFilterOption(select, option) {
    extensionState.worldInfoDeferredCharacterFilterOptions ??= new WeakMap();

    const options = extensionState.worldInfoDeferredCharacterFilterOptions.get(select) ?? [];
    options.push(option);
    extensionState.worldInfoDeferredCharacterFilterOptions.set(select, options);
    select.dataset[WORLD_INFO_DEFERRED_OPTIONS_DATASET_KEY] = 'true';
}

function installWorldInfoCharacterFilterOptionObserver(select, state) {
    if (!(select instanceof HTMLSelectElement)
        || select.name !== 'characterFilter'
        || typeof MutationObserver !== 'function'
        || state.characterFilterOptionObserver) {
        return;
    }

    const observer = new MutationObserver(mutations => {
        if (!settings.worldInfoDrawerOptimizationEnabled
            || select.dataset[WORLD_INFO_LAZY_SELECT2_DATASET_KEY] !== 'true') {
            return;
        }

        const deferredOptions = [];

        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                collectWorldInfoCharacterFilterOptions(node, deferredOptions);
            }
        }

        deferredOptions.forEach(option => {
            if (select.contains(option)) {
                option.remove();
            }

            deferWorldInfoCharacterFilterOption(select, option);
        });
    });

    observer.observe(select, { childList: true, subtree: true });
    state.characterFilterOptionObserver = observer;
}

function collectWorldInfoCharacterFilterOptions(node, options) {
    if (node instanceof HTMLOptionElement) {
        options.push(node);
        return;
    }

    if (node instanceof HTMLOptGroupElement) {
        node.querySelectorAll('option').forEach(option => {
            if (option instanceof HTMLOptionElement) {
                options.push(option);
            }
        });
    }
}

function initializeDeferredWorldInfoCharacterFilterOptions(select) {
    const options = extensionState.worldInfoDeferredCharacterFilterOptions?.get(select);

    if (!options?.length) {
        return;
    }

    const fragment = document.createDocumentFragment();

    for (const option of options) {
        fragment.append(option);
    }

    extensionState.worldInfoDeferredCharacterFilterOptions.delete(select);
    delete select.dataset[WORLD_INFO_DEFERRED_OPTIONS_DATASET_KEY];
    select.append(fragment);
}

function shouldAttemptWorldInfoLazySelect2(args) {
    if (!settings.worldInfoDrawerOptimizationEnabled) {
        return false;
    }

    const firstArg = args[0];
    return typeof firstArg === 'object' && firstArg !== null && !Array.isArray(firstArg);
}

function shouldDeferWorldInfoSelect2(element) {
    if (!(element instanceof HTMLSelectElement)) {
        return false;
    }

    if (!element.matches(WORLD_INFO_LAZY_SELECT2_SELECTOR)) {
        return false;
    }

    if ($(element).data('select2')) {
        return false;
    }

    return element.dataset[WORLD_INFO_LAZY_SELECT2_DATASET_KEY] !== 'true';
}

function deferWorldInfoSelect2(element, args, originalSelect2) {
    element.dataset[WORLD_INFO_LAZY_SELECT2_DATASET_KEY] = 'true';
    element.classList.add('bai-bai-toolkit-lazy-select2');

    const state = {
        args: [...args],
        originalSelect2,
    };

    const activate = (event) => {
        initializeDeferredWorldInfoSelect2(element, { open: event?.type === 'pointerdown' || event?.type === 'mousedown' });
    };

    state.activate = activate;
    installWorldInfoCharacterFilterOptionObserver(element, state);
    extensionState.worldInfoLazySelect2State ??= new WeakMap();
    extensionState.worldInfoLazySelect2State.set(element, state);

    element.addEventListener('pointerdown', activate, { capture: true });
    element.addEventListener('mousedown', activate, { capture: true });
    element.addEventListener('focus', activate, { capture: true });
}

export function initializeDeferredWorldInfoSelect2(target, { open = false } = {}) {
    const elements = target instanceof Element
        ? [target]
        : Array.from(target.querySelectorAll?.(`select[data-${toKebabCase(WORLD_INFO_LAZY_SELECT2_DATASET_KEY)}="true"]`) ?? []);

    for (const element of elements) {
        const state = extensionState.worldInfoLazySelect2State?.get(element);

        if (!state) {
            continue;
        }

        element.removeEventListener('pointerdown', state.activate, true);
        element.removeEventListener('mousedown', state.activate, true);
        element.removeEventListener('focus', state.activate, true);
        state.characterFilterOptionObserver?.disconnect();
        state.characterFilterOptionObserver = null;
        delete element.dataset[WORLD_INFO_LAZY_SELECT2_DATASET_KEY];
        element.classList.remove('bai-bai-toolkit-lazy-select2');
        extensionState.worldInfoLazySelect2State.delete(element);

        initializeDeferredWorldInfoCharacterFilterOptions(element);
        state.originalSelect2.apply($(element), state.args);

        if (open && $(element).data('select2')) {
            setTimeout(() => {
                try {
                    $(element).select2('open');
                } catch {
                    // Ignore controls that were detached while the open was queued.
                }
            }, 0);
        }
    }
}

function installWorldInfoDrawerAnimationStyle() {
    if (document.getElementById(WORLD_INFO_DRAWER_ANIMATION_STYLE_ID)) {
        return;
    }

    const style = document.createElement('style');
    style.id = WORLD_INFO_DRAWER_ANIMATION_STYLE_ID;
    style.textContent = `
#world_popup_entries_list > .world_entry > .world_entry_form > .inline-drawer > .inline-drawer-content.bai-bai-wi-drawer-motion > .world_entry_edit {
    transform-origin: top center;
    transition: opacity 140ms ease, transform 140ms ease;
    will-change: opacity, transform;
}

#world_popup_entries_list > .world_entry > .world_entry_form > .inline-drawer > .inline-drawer-content.bai-bai-wi-drawer-enter > .world_entry_edit,
#world_popup_entries_list > .world_entry > .world_entry_form > .inline-drawer > .inline-drawer-content.bai-bai-wi-drawer-leave > .world_entry_edit {
    opacity: 0;
    transform: translateY(-8px) scaleY(0.985);
}

#world_popup_entries_list > .world_entry > .world_entry_form > .inline-drawer > .inline-drawer-content.bai-bai-wi-drawer-open > .world_entry_edit {
    opacity: 1;
    transform: translateY(0) scaleY(1);
}

#world_popup_entries_list > .world_entry > .world_entry_form > .inline-drawer > .inline-drawer-content.bai-bai-wi-drawer-leave {
    pointer-events: none;
}

@media (prefers-reduced-motion: reduce) {
    #world_popup_entries_list > .world_entry > .world_entry_form > .inline-drawer > .inline-drawer-content.bai-bai-wi-drawer-motion > .world_entry_edit {
        transition-duration: 1ms;
    }
}
`;
    document.head.append(style);
}

function handleWorldInfoDrawerToggleClick(event) {
    const shouldHandleDrawer = settings.worldInfoDrawerOptimizationEnabled || settings.worldInfoListOptimizationEnabled;

    if (!shouldHandleDrawer) {
        return;
    }

    const target = event.target instanceof Element ? event.target : null;
    const toggle = target?.closest(WORLD_INFO_ENTRY_DRAWER_TOGGLE_SELECTOR);

    if (!target || !toggle || !toggle.contains(target)) {
        return;
    }

    if (target.classList.contains('text_pole')) {
        return;
    }

    const drawer = toggle.closest(WORLD_INFO_ENTRY_DRAWER_SELECTOR);
    const icon = drawer?.querySelector(':scope > .inline-drawer-header .inline-drawer-icon');
    const content = drawer?.querySelector(':scope > .inline-drawer-content');

    if (!drawer || !icon || !content) {
        return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    const expand = !isWorldInfoDrawerContentExpanded(content);

    setWorldInfoDrawerIconExpanded(icon, expand);

    if (settings.worldInfoListOptimizationEnabled) {
        animateWorldInfoDrawerContent(drawer, content, expand);
    } else {
        toggleWorldInfoDrawerContentImmediately(drawer, content, expand);
    }
}

function setWorldInfoDrawerIconExpanded(icon, expand) {
    icon.classList.toggle('down', !expand);
    icon.classList.toggle('up', expand);
    icon.classList.toggle('fa-circle-chevron-down', !expand);
    icon.classList.toggle('fa-circle-chevron-up', expand);
}

function isWorldInfoDrawerContentExpanded(content) {
    const state = content?.__baiBaiWorldInfoDrawerAnimation;

    if (state?.phase === 'opening' || state?.phase === 'expanded') {
        return true;
    }

    if (state?.phase === 'closing' || state?.phase === 'collapsed') {
        return false;
    }

    return content instanceof HTMLElement && getComputedStyle(content).display !== 'none';
}

function animateWorldInfoDrawerContent(drawer, content, expand) {
    if (!(drawer instanceof HTMLElement) || !(content instanceof HTMLElement)) {
        return;
    }

    const state = getWorldInfoDrawerAnimationState(content);
    cancelWorldInfoDrawerAnimation(state);

    if (expand && !content.querySelector(':scope > .world_entry_edit')) {
        $(drawer).trigger('inline-drawer-toggle');
    }

    content.style.height = '';
    content.style.display = 'block';
    content.classList.add('bai-bai-wi-drawer-motion');
    state.phase = expand ? 'opening' : 'closing';

    if (expand) {
        content.classList.remove('bai-bai-wi-drawer-open', 'bai-bai-wi-drawer-leave');
        content.classList.add('bai-bai-wi-drawer-enter');
    } else {
        content.classList.remove('bai-bai-wi-drawer-enter');
        content.classList.add('bai-bai-wi-drawer-open');
    }

    state.frameId = requestAnimationFrame(() => {
        state.frameId = null;

        if (state.phase !== (expand ? 'opening' : 'closing')) {
            return;
        }

        if (expand) {
            content.classList.remove('bai-bai-wi-drawer-enter');
            content.classList.add('bai-bai-wi-drawer-open');
        } else {
            content.classList.remove('bai-bai-wi-drawer-open');
            content.classList.add('bai-bai-wi-drawer-leave');
        }

        armWorldInfoDrawerAnimationEnd(content, state, expand);
    });
}

function toggleWorldInfoDrawerContentImmediately(drawer, content, expand) {
    if (!(drawer instanceof HTMLElement) || !(content instanceof HTMLElement)) {
        return;
    }

    const state = content.__baiBaiWorldInfoDrawerAnimation;
    cancelWorldInfoDrawerAnimation(state);

    if (expand && !content.querySelector(':scope > .world_entry_edit')) {
        $(drawer).trigger('inline-drawer-toggle');
    }

    content.classList.remove('bai-bai-wi-drawer-motion', 'bai-bai-wi-drawer-enter', 'bai-bai-wi-drawer-open', 'bai-bai-wi-drawer-leave');
    content.style.display = expand ? 'block' : 'none';
    content.style.height = '';

    if (state) {
        state.phase = expand ? 'expanded' : 'collapsed';
    }

    resetWorldInfoDrawerTextareaHeights(content);
}

function getWorldInfoDrawerAnimationState(content) {
    if (!content.__baiBaiWorldInfoDrawerAnimation) {
        content.__baiBaiWorldInfoDrawerAnimation = {
            phase: getComputedStyle(content).display === 'none' ? 'collapsed' : 'expanded',
            frameId: null,
            fallbackTimer: null,
            transitionHandler: null,
            content: null,
        };
    }

    return content.__baiBaiWorldInfoDrawerAnimation;
}

function cancelWorldInfoDrawerAnimation(state) {
    if (!state) {
        return;
    }

    if (state.frameId !== null) {
        cancelAnimationFrame(state.frameId);
        state.frameId = null;
    }

    if (state.fallbackTimer !== null) {
        clearTimeout(state.fallbackTimer);
        state.fallbackTimer = null;
    }

    if (state.transitionHandler && state.content instanceof HTMLElement) {
        state.content.removeEventListener('transitionend', state.transitionHandler);
    }

    state.transitionHandler = null;
    state.content = null;
}

function armWorldInfoDrawerAnimationEnd(content, state, expand) {
    const expectedPhase = expand ? 'opening' : 'closing';

    const finish = () => {
        if (state.phase !== expectedPhase) {
            return;
        }

        cancelWorldInfoDrawerAnimation(state);
        finishWorldInfoDrawerAnimation(content, state, expand);
    };

    const transitionHandler = (event) => {
        if (!(event.target instanceof HTMLElement)
            || !event.target.matches('.world_entry_edit')
            || !['opacity', 'transform'].includes(event.propertyName)) {
            return;
        }

        finish();
    };

    state.content = content;
    state.transitionHandler = transitionHandler;
    state.fallbackTimer = setTimeout(finish, 220);
    content.addEventListener('transitionend', transitionHandler);
}

function finishWorldInfoDrawerAnimation(content, state, expand) {
    if (expand) {
        state.phase = 'expanded';
        content.style.display = 'block';
        content.classList.remove('bai-bai-wi-drawer-motion', 'bai-bai-wi-drawer-enter', 'bai-bai-wi-drawer-open', 'bai-bai-wi-drawer-leave');
    } else {
        state.phase = 'collapsed';
        content.style.display = 'none';
        content.classList.remove('bai-bai-wi-drawer-motion', 'bai-bai-wi-drawer-enter', 'bai-bai-wi-drawer-open', 'bai-bai-wi-drawer-leave');
    }

    content.style.height = '';

    resetWorldInfoDrawerTextareaHeights(content);
}

function resetWorldInfoDrawerTextareaHeights(content) {
    if (!CSS.supports('field-sizing', 'content')) {
        content.querySelectorAll('textarea.autoSetHeight').forEach(textarea => {
            void resetScrollHeight(textarea);
        });
    }
}

function getWorldInfoPageOptimizationState() {
    if (!extensionState.worldInfoPageOptimization || typeof extensionState.worldInfoPageOptimization !== 'object') {
        extensionState.worldInfoPageOptimization = {};
    }

    return extensionState.worldInfoPageOptimization;
}
