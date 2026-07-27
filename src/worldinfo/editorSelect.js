import { characters, chat_metadata, this_chid } from '@sillytavern/script';
import { isMobile } from '@sillytavern/scripts/RossAscends-mods';
import { getCharaFilename } from '@sillytavern/scripts/utils';
import { METADATA_KEY as WORLD_INFO_METADATA_KEY, selected_world_info, world_info, world_names } from '@sillytavern/scripts/world-info';
import { WORLD_INFO_EDITOR_SELECT_DROPDOWN_CLASS, WORLD_INFO_EDITOR_SELECT_GROUPING_DATASET_KEY, WORLD_INFO_EDITOR_SELECT_SEARCH_DATASET_KEY, WORLD_INFO_EDITOR_SELECT_SEARCH_MOBILE_RESTORE_MS, WORLD_INFO_EDITOR_SELECT_SEARCH_MOBILE_SUPPRESSED_DATASET_KEY, WORLD_INFO_EDITOR_SELECT_STYLE_KEY } from './constants.js';
import { LOG_PREFIX } from './state.js';
import { getWorldInfoVueListOptimizationState } from './vueList.js';

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

export {
    applyWorldInfoEditorSelectGrouping,
    blurWorldInfoEditorSelectSearchField,
    captureWorldInfoControlTheme,
    captureWorldInfoEditorSelectTheme,
    categorizeWorldInfoEditorSelectOptions,
    ensureWorldInfoEditorSelectSearch,
    focusWorldInfoEditorSelectSearchFieldFromUserInteraction,
    forceWorldInfoEditorSelectSearchField,
    getCurrentCharacterAdditionalWorldInfoNames,
    getWorldInfoEditorSelect2SearchField,
    getWorldInfoEditorSelectFromOpenEvent,
    getWorldInfoEditorSelectGroupingSignature,
    getWorldInfoEditorSelectGroups,
    getWorldInfoEditorSelectSearchReferenceInput,
    getWorldInfoOptionName,
    getWorldInfoOptionSortIndex,
    installWorldInfoEditorSelectGrouping,
    installWorldInfoEditorSelectSearch,
    installWorldInfoEditorSelectSearchInteractionGuard,
    isUsableCssSize,
    isWorldInfoEditorSelectOpen,
    normalizeWorldInfoNameList,
    orderWorldInfoNames,
    refreshWorldInfoEditorSelect2,
    removeWorldInfoEditorSelectGrouping,
    removeWorldInfoEditorSelectSearch,
    removeWorldInfoEditorSelectSearchInteractionGuard,
    restoreWorldInfoEditorSelectOrder,
    restoreWorldInfoEditorSelectSearchMobileInput,
    suppressWorldInfoEditorSelectSearchMobileAutoKeyboard,
    syncWorldInfoEditorSelect2Theme,
    syncWorldInfoEditorSelectDropdownTheme,
};
