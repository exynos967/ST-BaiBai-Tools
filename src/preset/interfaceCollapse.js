import { extension_settings } from '@sillytavern/scripts/extensions';
import { LAYOUT_EXTENSION_SETTINGS_KEY, LAYOUT_PRESET_COLLAPSE_WRAPPER_ID, LEFT_NAV_PANEL_SELECTOR, OPENAI_SETTINGS_SELECTOR, PRESET_INTERFACE_COLLAPSE_BLOCK_ATTR, PRESET_INTERFACE_COLLAPSE_CONTENT_CLASS, PRESET_INTERFACE_COLLAPSE_EXTERNAL_TOGGLE_HANDLER_KEY, PRESET_INTERFACE_COLLAPSE_MUTATION_SELECTOR, PRESET_INTERFACE_COLLAPSE_OBSERVER_KEY, PRESET_INTERFACE_COLLAPSE_PLACEHOLDER_PREFIX, PRESET_INTERFACE_COLLAPSE_RETRY_LIMIT, PRESET_INTERFACE_COLLAPSE_RETRY_MS, PRESET_INTERFACE_COLLAPSE_STYLE_ID, PRESET_INTERFACE_COLLAPSE_WRAPPER_ID } from './constants.js';
import { extensionState, settings } from './state.js';

function applyPresetInterfaceCollapse() {
    if (!settings.presetInterfaceCollapseEnabled) {
        removePresetInterfaceCollapseExternalToggleHandler();
        removePresetInterfaceCollapseObserver();
        unwrapPresetInterfaceCollapse();
        removePresetInterfaceCollapseStyle();
        return;
    }

    applyPresetInterfaceCollapseStyle();
    installPresetInterfaceCollapseExternalToggleHandler();
    syncPresetInterfaceCollapse({ resetRetries: true });
}

function syncPresetInterfaceCollapse({ resetRetries = false } = {}) {
    if (!settings.presetInterfaceCollapseEnabled) {
        return false;
    }

    if (resetRetries) {
        resetPresetInterfaceCollapseRetry({ clearLayoutRuntimeAbsent: true });
    }

    const layoutCollapse = getLayoutPresetCollapseState();

    if (layoutCollapse.active) {
        unwrapPresetInterfaceCollapse();
        disconnectPresetInterfaceCollapseObserver();

        if (!layoutCollapse.confirmed) {
            schedulePresetInterfaceCollapseRetry();
        }

        return true;
    }

    const wrapped = wrapPresetInterfaceCollapse();
    bindPresetInterfaceCollapseObserver();

    if (wrapped) {
        resetPresetInterfaceCollapseRetry();
    }

    if (!wrapped && !document.getElementById(PRESET_INTERFACE_COLLAPSE_WRAPPER_ID)) {
        schedulePresetInterfaceCollapseRetry();
    }

    return wrapped;
}

function getPresetInterfaceCollapseObserverState() {
    let state = extensionState[PRESET_INTERFACE_COLLAPSE_OBSERVER_KEY];

    if (!state) {
        state = {
            observer: null,
            target: null,
            observers: [],
            targets: [],
            timer: null,
            retryTimer: null,
            retryCount: 0,
        };
        extensionState[PRESET_INTERFACE_COLLAPSE_OBSERVER_KEY] = state;
    }

    return state;
}

function bindPresetInterfaceCollapseObserver() {
    if (typeof MutationObserver !== 'function') {
        return;
    }

    const targets = getPresetInterfaceCollapseObserverTargets();
    const state = getPresetInterfaceCollapseObserverState();

    if (!targets.length) {
        disconnectPresetInterfaceCollapseObserver(state);
        schedulePresetInterfaceCollapseRetry();
        return;
    }

    if (arePresetInterfaceCollapseObserverTargetsSame(state, targets)) {
        return;
    }

    disconnectPresetInterfaceCollapseObserver(state);

    state.targets = targets;
    state.observers = targets.map(({ element, subtree }) => {
        const observer = new MutationObserver((mutations) => {
            if (shouldSyncPresetInterfaceCollapseForMutations(mutations)) {
                queuePresetInterfaceCollapseSync();
            }
        });
        observer.observe(element, {
            childList: true,
            subtree,
        });
        return observer;
    });
}

function arePresetInterfaceCollapseObserverTargetsSame(state, targets) {
    return Array.isArray(state.targets)
        && Array.isArray(state.observers)
        && state.observers.length > 0
        && state.targets.length === targets.length
        && state.targets.every((target, index) => (
            target.element === targets[index].element
            && target.subtree === targets[index].subtree
        ));
}

function disconnectPresetInterfaceCollapseObserver(state = extensionState[PRESET_INTERFACE_COLLAPSE_OBSERVER_KEY]) {
    if (!state) {
        return;
    }

    if (state.timer) {
        clearTimeout(state.timer);
        state.timer = null;
    }

    state.observer?.disconnect?.();
    state.observer = null;
    state.target = null;

    if (Array.isArray(state.observers)) {
        for (const observer of state.observers) {
            observer?.disconnect?.();
        }
    }

    state.observers = [];
    state.targets = [];
}

function shouldSyncPresetInterfaceCollapseForMutations(mutations) {
    for (const mutation of mutations) {
        if (isPresetInterfaceCollapseRelevantMutationTarget(mutation.target)) {
            return true;
        }

        for (const node of mutation.addedNodes) {
            if (isPresetInterfaceCollapseRelevantMutationNode(node)) {
                return true;
            }
        }

        for (const node of mutation.removedNodes) {
            if (isPresetInterfaceCollapseRelevantMutationNode(node)) {
                return true;
            }
        }
    }

    return false;
}

function isPresetInterfaceCollapseRelevantMutationTarget(node) {
    if (!(node instanceof Element)) {
        return false;
    }

    return node.matches(PRESET_INTERFACE_COLLAPSE_MUTATION_SELECTOR)
        || Boolean(node.closest(PRESET_INTERFACE_COLLAPSE_MUTATION_SELECTOR));
}

function isPresetInterfaceCollapseRelevantMutationNode(node) {
    if (!(node instanceof Element)) {
        return false;
    }

    return node.matches(PRESET_INTERFACE_COLLAPSE_MUTATION_SELECTOR)
        || Boolean(node.querySelector(PRESET_INTERFACE_COLLAPSE_MUTATION_SELECTOR));
}

function getPresetInterfaceCollapseObserverTargets() {
    const wrapper = document.getElementById(PRESET_INTERFACE_COLLAPSE_WRAPPER_ID);
    const layoutWrapper = document.getElementById(LAYOUT_PRESET_COLLAPSE_WRAPPER_ID);
    const rangeBlock = document.querySelector('#range_block_openai');
    const openAiSettings = document.querySelector(OPENAI_SETTINGS_SELECTOR);
    const layoutToggle = document.querySelector('#te_collapse_preset');
    const leftPanel = document.querySelector(LEFT_NAV_PANEL_SELECTOR);
    const candidates = [rangeBlock, openAiSettings, wrapper, layoutWrapper, layoutToggle]
        .filter(element => element instanceof HTMLElement && element.isConnected);

    if (!candidates.length) {
        return leftPanel instanceof HTMLElement
            ? [{ element: leftPanel, subtree: true }]
            : [];
    }

    return buildPresetInterfaceCollapseObserverTargets(candidates);
}

function buildPresetInterfaceCollapseObserverTargets(candidates) {
    const targets = [];
    const addTarget = (element, subtree = false) => {
        if (!(element instanceof HTMLElement) || !element.isConnected) {
            return;
        }

        if (element === document.body || element === document.documentElement) {
            return;
        }

        const existing = targets.find(target => target.element === element);

        if (existing) {
            existing.subtree = existing.subtree || subtree;
            return;
        }

        targets.push({ element, subtree });
    };

    for (const element of candidates) {
        addTarget(element);
        addTarget(element.parentElement);

        if (element.id === PRESET_INTERFACE_COLLAPSE_WRAPPER_ID) {
            addTarget(element.querySelector(`.${PRESET_INTERFACE_COLLAPSE_CONTENT_CLASS}`));
        }
    }

    return targets;
}

function removePresetInterfaceCollapseObserver() {
    const state = extensionState[PRESET_INTERFACE_COLLAPSE_OBSERVER_KEY];

    if (!state) {
        return;
    }

    if (state.timer) {
        clearTimeout(state.timer);
    }

    if (state.retryTimer) {
        clearTimeout(state.retryTimer);
    }

    disconnectPresetInterfaceCollapseObserver(state);
    delete extensionState[PRESET_INTERFACE_COLLAPSE_OBSERVER_KEY];
}

function queuePresetInterfaceCollapseSync() {
    if (!settings.presetInterfaceCollapseEnabled) {
        return;
    }

    const state = getPresetInterfaceCollapseObserverState();

    if (state.timer) {
        clearTimeout(state.timer);
    }

    state.timer = setTimeout(() => {
        state.timer = null;
        syncPresetInterfaceCollapse();
    }, 80);
}

function schedulePresetInterfaceCollapseRetry() {
    if (!settings.presetInterfaceCollapseEnabled) {
        return;
    }

    const state = getPresetInterfaceCollapseObserverState();

    if (state.retryTimer || state.retryCount >= PRESET_INTERFACE_COLLAPSE_RETRY_LIMIT) {
        if (state.retryCount >= PRESET_INTERFACE_COLLAPSE_RETRY_LIMIT) {
            state.layoutRuntimeAbsent = true;
            if (isPresetInterfaceCollapseBroadFallbackObserver(state)) {
                disconnectPresetInterfaceCollapseObserver(state);
            }
        }

        return;
    }

    state.retryCount += 1;
    state.retryTimer = setTimeout(() => {
        state.retryTimer = null;
        syncPresetInterfaceCollapse();
    }, PRESET_INTERFACE_COLLAPSE_RETRY_MS);
}

function isPresetInterfaceCollapseBroadFallbackObserver(state) {
    return Array.isArray(state?.targets)
        && state.targets.some(target => (
            target?.subtree === true
            && target.element?.matches?.(LEFT_NAV_PANEL_SELECTOR) === true
        ));
}

function resetPresetInterfaceCollapseRetry({ clearLayoutRuntimeAbsent = false } = {}) {
    const state = extensionState[PRESET_INTERFACE_COLLAPSE_OBSERVER_KEY];

    if (!state) {
        return;
    }

    if (state.retryTimer) {
        clearTimeout(state.retryTimer);
        state.retryTimer = null;
    }

    state.retryCount = 0;

    if (clearLayoutRuntimeAbsent) {
        state.layoutRuntimeAbsent = false;
    }
}

function installPresetInterfaceCollapseExternalToggleHandler() {
    if (extensionState[PRESET_INTERFACE_COLLAPSE_EXTERNAL_TOGGLE_HANDLER_KEY]) {
        return;
    }

    const handler = event => {
        const target = event.target instanceof Element
            ? event.target.closest('#te_collapse_preset')
            : null;

        if (!(target instanceof HTMLInputElement)) {
            return;
        }

        if (target.checked) {
            unwrapPresetInterfaceCollapse();
        }

        setTimeout(() => syncPresetInterfaceCollapse({ resetRetries: true }), 0);
        setTimeout(() => syncPresetInterfaceCollapse(), 120);
    };

    document.addEventListener('input', handler, true);
    document.addEventListener('change', handler, true);
    extensionState[PRESET_INTERFACE_COLLAPSE_EXTERNAL_TOGGLE_HANDLER_KEY] = handler;
}

function removePresetInterfaceCollapseExternalToggleHandler() {
    const handler = extensionState[PRESET_INTERFACE_COLLAPSE_EXTERNAL_TOGGLE_HANDLER_KEY];

    if (!handler) {
        return;
    }

    document.removeEventListener('input', handler, true);
    document.removeEventListener('change', handler, true);
    delete extensionState[PRESET_INTERFACE_COLLAPSE_EXTERNAL_TOGGLE_HANDLER_KEY];
}

function getLayoutPresetCollapseState() {
    if (document.getElementById(LAYOUT_PRESET_COLLAPSE_WRAPPER_ID)) {
        return { active: true, confirmed: true };
    }

    const toggle = document.querySelector('#te_collapse_preset');

    if (toggle instanceof HTMLInputElement) {
        return { active: toggle.checked, confirmed: true };
    }

    if (extension_settings?.[LAYOUT_EXTENSION_SETTINGS_KEY]?.collapsePreset === true) {
        const state = extensionState[PRESET_INTERFACE_COLLAPSE_OBSERVER_KEY];
        if (state?.layoutRuntimeAbsent) {
            return { active: false, confirmed: false };
        }

        const stillWaitingForLayoutRuntime = !state || state.retryCount < PRESET_INTERFACE_COLLAPSE_RETRY_LIMIT;

        if (!stillWaitingForLayoutRuntime && state) {
            state.layoutRuntimeAbsent = true;
        }

        return { active: stillWaitingForLayoutRuntime, confirmed: false };
    }

    return { active: false, confirmed: false };
}

function wrapPresetInterfaceCollapse() {
    if (document.getElementById(PRESET_INTERFACE_COLLAPSE_WRAPPER_ID)) {
        return true;
    }

    if (document.getElementById(LAYOUT_PRESET_COLLAPSE_WRAPPER_ID)) {
        return false;
    }

    const blocks = getPresetInterfaceCollapseBlocks();

    if (!blocks.length) {
        return false;
    }

    removePresetInterfaceCollapsePlaceholders();

    const wrapper = document.createElement('div');
    wrapper.id = PRESET_INTERFACE_COLLAPSE_WRAPPER_ID;
    wrapper.className = 'inline-drawer wide100p flexFlowColumn';
    wrapper.innerHTML = `
        <div class="inline-drawer-toggle inline-drawer-header userSettingsInnerExpandable">
            <b><span>预设设置</span></b>
            <div class="fa-solid fa-circle-chevron-down inline-drawer-icon down"></div>
        </div>
        <div class="inline-drawer-content ${PRESET_INTERFACE_COLLAPSE_CONTENT_CLASS}" style="display:none;"></div>
    `;

    const firstBlock = blocks[0]?.element;

    if (!(firstBlock instanceof HTMLElement) || !firstBlock.parentElement) {
        return false;
    }

    const placeholderKeys = new Set();

    for (const block of blocks) {
        if (!placeholderKeys.has(block.key)) {
            const placeholder = document.createElement('div');
            placeholder.id = getPresetInterfaceCollapsePlaceholderId(block.key);
            placeholder.hidden = true;
            placeholder.dataset.baiBaiPresetInterfaceCollapsePlaceholder = 'true';
            block.element.before(placeholder);
            placeholderKeys.add(block.key);
        }

        block.element.setAttribute(PRESET_INTERFACE_COLLAPSE_BLOCK_ATTR, block.key);
    }

    const firstPlaceholder = document.getElementById(getPresetInterfaceCollapsePlaceholderId(blocks[0].key));
    const content = wrapper.querySelector(`.${PRESET_INTERFACE_COLLAPSE_CONTENT_CLASS}`);

    if (!(firstPlaceholder instanceof HTMLElement) || !(content instanceof HTMLElement)) {
        removePresetInterfaceCollapsePlaceholders();
        return false;
    }

    firstPlaceholder.before(wrapper);

    for (const block of blocks) {
        content.append(block.element);
    }

    return true;
}

function unwrapPresetInterfaceCollapse() {
    const wrapper = document.getElementById(PRESET_INTERFACE_COLLAPSE_WRAPPER_ID);

    if (!(wrapper instanceof HTMLElement)) {
        removePresetInterfaceCollapsePlaceholders();
        return;
    }

    const content = wrapper.querySelector(`.${PRESET_INTERFACE_COLLAPSE_CONTENT_CLASS}`);

    for (const key of ['1', '2', '3']) {
        const placeholder = document.getElementById(getPresetInterfaceCollapsePlaceholderId(key));
        const movedBlocks = content instanceof HTMLElement
            ? Array.from(content.children).filter(child => child.getAttribute?.(PRESET_INTERFACE_COLLAPSE_BLOCK_ATTR) === key)
            : [];

        for (const block of movedBlocks) {
            block.removeAttribute(PRESET_INTERFACE_COLLAPSE_BLOCK_ATTR);
        }

        if (placeholder instanceof HTMLElement) {
            placeholder.replaceWith(...movedBlocks);
        } else if (movedBlocks.length) {
            wrapper.before(...movedBlocks);
        }
    }

    wrapper.remove();
    removePresetInterfaceCollapsePlaceholders();
}

function getPresetInterfaceCollapseBlocks() {
    const openAiSettings = document.querySelector(OPENAI_SETTINGS_SELECTOR);

    if (!(openAiSettings instanceof HTMLElement)) {
        return [];
    }

    const entries = [];
    const rangeBlock = document.querySelector('#range_block_openai');

    if (rangeBlock instanceof HTMLElement && !rangeBlock.closest(`#${PRESET_INTERFACE_COLLAPSE_WRAPPER_ID}`)) {
        entries.push({ key: '1', element: rangeBlock });
    }

    const firstOpenAiSettingsBlock = openAiSettings.querySelector(':scope > div');

    if (firstOpenAiSettingsBlock instanceof HTMLElement && !firstOpenAiSettingsBlock.closest(`#${PRESET_INTERFACE_COLLAPSE_WRAPPER_ID}`)) {
        entries.push({ key: '2', element: firstOpenAiSettingsBlock });
    }

    for (const block of openAiSettings.querySelectorAll(':scope > div.range-block.m-t-1')) {
        if (block instanceof HTMLElement && !block.closest(`#${PRESET_INTERFACE_COLLAPSE_WRAPPER_ID}`)) {
            entries.push({ key: '3', element: block });
        }
    }

    return filterTopLevelPresetInterfaceCollapseBlocks(entries);
}

function filterTopLevelPresetInterfaceCollapseBlocks(entries) {
    const result = [];

    for (const entry of entries) {
        const element = entry.element;

        if (!(element instanceof HTMLElement) || !element.isConnected) {
            continue;
        }

        if (result.some(item => item.element === element)) {
            continue;
        }

        if (result.some(item => item.element.contains(element))) {
            continue;
        }

        for (let index = result.length - 1; index >= 0; index -= 1) {
            if (element.contains(result[index].element)) {
                result.splice(index, 1);
            }
        }

        result.push(entry);
    }

    return result;
}

function getPresetInterfaceCollapsePlaceholderId(key) {
    return `${PRESET_INTERFACE_COLLAPSE_PLACEHOLDER_PREFIX}_${key}`;
}

function removePresetInterfaceCollapsePlaceholders() {
    for (const key of ['1', '2', '3']) {
        document.getElementById(getPresetInterfaceCollapsePlaceholderId(key))?.remove();
    }
}

function applyPresetInterfaceCollapseStyle() {
    let style = document.getElementById(PRESET_INTERFACE_COLLAPSE_STYLE_ID);

    if (!style) {
        style = document.createElement('style');
        style.id = PRESET_INTERFACE_COLLAPSE_STYLE_ID;
        document.head.append(style);
    }

    style.textContent = `
#${PRESET_INTERFACE_COLLAPSE_WRAPPER_ID} {
    margin-bottom: 8px;
}

#${PRESET_INTERFACE_COLLAPSE_WRAPPER_ID} > .${PRESET_INTERFACE_COLLAPSE_CONTENT_CLASS} {
    padding-top: 6px;
}
`;
}

function removePresetInterfaceCollapseStyle() {
    document.getElementById(PRESET_INTERFACE_COLLAPSE_STYLE_ID)?.remove();
}

export {
    applyPresetInterfaceCollapse,
    applyPresetInterfaceCollapseStyle,
    arePresetInterfaceCollapseObserverTargetsSame,
    bindPresetInterfaceCollapseObserver,
    buildPresetInterfaceCollapseObserverTargets,
    disconnectPresetInterfaceCollapseObserver,
    filterTopLevelPresetInterfaceCollapseBlocks,
    getLayoutPresetCollapseState,
    getPresetInterfaceCollapseBlocks,
    getPresetInterfaceCollapseObserverState,
    getPresetInterfaceCollapseObserverTargets,
    getPresetInterfaceCollapsePlaceholderId,
    installPresetInterfaceCollapseExternalToggleHandler,
    isPresetInterfaceCollapseBroadFallbackObserver,
    isPresetInterfaceCollapseRelevantMutationNode,
    isPresetInterfaceCollapseRelevantMutationTarget,
    queuePresetInterfaceCollapseSync,
    removePresetInterfaceCollapseExternalToggleHandler,
    removePresetInterfaceCollapseObserver,
    removePresetInterfaceCollapsePlaceholders,
    removePresetInterfaceCollapseStyle,
    resetPresetInterfaceCollapseRetry,
    schedulePresetInterfaceCollapseRetry,
    shouldSyncPresetInterfaceCollapseForMutations,
    syncPresetInterfaceCollapse,
    unwrapPresetInterfaceCollapse,
    wrapPresetInterfaceCollapse,
};
