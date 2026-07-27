import { event_types, eventSource } from '@sillytavern/script';
import { isMobile } from '@sillytavern/scripts/RossAscends-mods';
import { selected_world_info } from '@sillytavern/scripts/world-info';
import { WORLD_INFO_EDITOR_SELECT_SEARCH_MOBILE_RESTORE_MS, WORLD_INFO_EDITOR_SELECT_STYLE_KEY, WORLD_INFO_GLOBAL_SELECTOR_DATASET_KEY, WORLD_INFO_GLOBAL_SELECTOR_DROPDOWN_CLASS, WORLD_INFO_GLOBAL_SELECTOR_HOST_CLASS, WORLD_INFO_GLOBAL_SELECTOR_OPTION_ORDER_DATASET_KEY, WORLD_INFO_GLOBAL_SELECTOR_SEARCH_MOBILE_SUPPRESSED_DATASET_KEY, WORLD_INFO_GLOBAL_SELECTOR_STATE_KEY, WORLD_INFO_GLOBAL_SELECTOR_TOUCH_SELECT_THRESHOLD_PX } from './constants.js';
import { blurWorldInfoEditorSelectSearchField, captureWorldInfoControlTheme, captureWorldInfoEditorSelectTheme, focusWorldInfoEditorSelectSearchFieldFromUserInteraction, getWorldInfoOptionName, normalizeWorldInfoNameList } from './editorSelect.js';
import { LOG_PREFIX, settings } from './state.js';
import { getWorldInfoVueListOptimizationState } from './vueList.js';

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

export {
    bindWorldInfoGlobalSelectorDisplayTrigger,
    captureWorldInfoGlobalSelectorTheme,
    closeNativeWorldInfoGlobalSelectorSelect2,
    closeWorldInfoGlobalSelectorDropdown,
    createWorldInfoGlobalSelectorOption,
    enhanceWorldInfoGlobalSelector,
    ensureWorldInfoGlobalSelectorOptionOrder,
    getWorldInfoGlobalSelectorOptionOrder,
    getWorldInfoGlobalSelectorOrderedOptions,
    getWorldInfoGlobalSelectorPlaceholder,
    getWorldInfoGlobalSelectorSelect2Container,
    getWorldInfoGlobalSelectorSelectByDisplay,
    getWorldInfoGlobalSelectorSelectedOptions,
    getWorldInfoGlobalSelectorSelects,
    installWorldInfoGlobalSelectorOptimization,
    installWorldInfoGlobalSelectorSyncHandler,
    installWorldInfoGlobalSelectorTriggerHandler,
    isWorldInfoGlobalSelectorOptionSelected,
    notifyWorldInfoGlobalSelectorChanged,
    openWorldInfoGlobalSelectorDropdown,
    refreshWorldInfoGlobalSelectorDisplay,
    refreshWorldInfoGlobalSelectorDropdown,
    refreshWorldInfoGlobalSelectorDropdownSelectionState,
    refreshWorldInfoGlobalSelectorOptimization,
    removeWorldInfoGlobalSelectorOptimization,
    removeWorldInfoGlobalSelectorSyncHandler,
    removeWorldInfoGlobalSelectorTriggerHandler,
    renderWorldInfoGlobalSelectorDropdownOptions,
    replaceWorldInfoGlobalSelectorDisplay,
    restoreWorldInfoGlobalSelector,
    restoreWorldInfoGlobalSelectorOptionOrder,
    restoreWorldInfoGlobalSelectorSearchMobileInput,
    suppressWorldInfoGlobalSelectorSearchMobileAutoKeyboard,
    syncWorldInfoGlobalSelectorDisplays,
    toggleWorldInfoGlobalSelectorDropdown,
};
