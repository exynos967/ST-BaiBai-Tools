import {
    chat_metadata,
    characters,
    this_chid,
} from '../../../../script.js';
import { AutoComplete } from '../../../autocomplete/AutoComplete.js';
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
        installWorldInfoMobileHeaderLayoutStyle();
        installWorldInfoMobileHeaderLayoutWatcher(state);
        installWorldInfoMobileLayoutMutationObserver(state);
    } else {
        unmountWorldInfoVueListApp(state);
        restoreWorldInfoVueListPaginationPatch(state);
        removeWorldInfoEditorSelectGrouping(state);
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
            worldInfoEditorSelectGroupingApplying: false,
        };
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
@media (max-width: 600px) {
    #world_popup[data-bai-bai-world-info-popup-layout="true"] > .bai-bai-wi-popup-header {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        column-gap: 8px;
        row-gap: 0;
        margin-top: 20px;
        width: 100%;
        min-width: 0;
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

    #world_popup[data-bai-bai-world-info-popup-layout="true"] > .bai-bai-wi-popup-header > #world_info_pagination {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 8px;
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
