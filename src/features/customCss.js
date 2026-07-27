import { saveSettingsDebounced } from '@sillytavern/script';
import { power_user } from '@sillytavern/scripts/power-user';
import { CUSTOM_CSS_CODEMIRROR_EDITOR_CLASS, CUSTOM_CSS_CODEMIRROR_EDITOR_ID, CUSTOM_CSS_CODEMIRROR_EDITOR_KEY, CUSTOM_CSS_CODEMIRROR_EDITOR_STYLE_ID, CUSTOM_CSS_CODEMIRROR_EXTERNAL_READ_SELECTOR, CUSTOM_CSS_DARK_BACKGROUND_LUMINANCE_THRESHOLD, CUSTOM_CSS_DARK_THEME_CLASS, CUSTOM_CSS_HOST_CLASS, CUSTOM_CSS_HOST_SELECTOR, CUSTOM_CSS_INPUT_ID, CUSTOM_CSS_INPUT_OPTIMIZATION_KEY, CUSTOM_CSS_LAYOUT_CLASS, CUSTOM_CSS_LIGHT_THEME_CLASS, CUSTOM_CSS_MAXIMIZED_CLASS, CUSTOM_CSS_MAXIMIZED_SOURCE_SELECTOR, CUSTOM_CSS_RESTORE_SYNC_SETTLE_DELAYS_MS, CUSTOM_CSS_SETTINGS_PANEL_SELECTOR, CUSTOM_CSS_SOURCE_HIDDEN_CLASS, CUSTOM_CSS_STYLE_ID, DESCRIPTION_CODEMIRROR_HISTORY_MAX_LENGTH } from './constants.js';
import { loadDescriptionCodeMirrorModules } from './descEditor.js';
import { extensionState, settings } from './state.js';
import { beginThemeApplyReflowGuardWindow, cancelThemePrintCharactersIfUnchanged, clearCustomCssCodeMirrorThemeSyncTimers, scheduleCustomCssCodeMirrorThemeSync, snapshotThemePrintCharactersKeys } from './theme.js';

function applyCustomCssInputOptimization() {

    if (settings.customCssShadowPropertyEnabled) {
        installCustomCssShadowPropertyOptimization();
    } else {
        removeCustomCssShadowPropertyOptimization();
    }

    if (settings.customCssInputOptimizationEnabled) {
        installCustomCssInputOptimization();
        installCustomCssCodeMirrorEditorOptimization();
    } else {
        removeCustomCssCodeMirrorEditorOptimization();
        removeCustomCssInputOptimization();
    }
}

function installCustomCssShadowPropertyOptimization() {
    const input = document.getElementById(CUSTOM_CSS_INPUT_ID);
    if (!(input instanceof HTMLTextAreaElement)) {
        return;
    }

    installCustomCssShadowPropertyOnInput(input, String(power_user.custom_css ?? input.value ?? ''));
}

function installCustomCssShadowPropertyOnInput(input, initialValue = '') {
    if (!(input instanceof HTMLTextAreaElement)) {
        return false;
    }

    const originalDescriptor = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value');
    if (!originalDescriptor || typeof originalDescriptor.get !== 'function' || typeof originalDescriptor.set !== 'function') {
        return false;
    }

    if (extensionState.customCssShadowPropertyInstalled && extensionState.customCssShadowPropertyInput === input) {
        input.value = initialValue;
        return true;
    }

    if (extensionState.customCssShadowPropertyInstalled) {
        restoreCustomCssShadowPropertyInput(extensionState.customCssShadowPropertyInput);
    }

    let virtualValue = String(initialValue ?? '');

    // Store original so we can restore later
    extensionState.customCssOriginalValueDescriptor = originalDescriptor;
    extensionState.customCssShadowVirtualValue = virtualValue;

    Object.defineProperty(input, 'value', {
        get: function () {
            return virtualValue;
        },
        set: function (newValue) {
            virtualValue = String(newValue);
            extensionState.customCssShadowVirtualValue = virtualValue;
            // Intentionally DO NOT call original setter to prevent DOM rendering
        },
        configurable: true,
        enumerable: true
    });

    extensionState.customCssShadowPropertyInstalled = true;
    extensionState.customCssShadowPropertyInput = input;

    return true;
}

function syncCustomCssShadowPropertyTarget(value = String(power_user.custom_css ?? '')) {
    if (!settings.customCssShadowPropertyEnabled) {
        return false;
    }

    const input = getCustomCssOriginalInput();

    if (!(input instanceof HTMLTextAreaElement)) {
        return false;
    }

    return installCustomCssShadowPropertyOnInput(input, value);
}

function removeCustomCssShadowPropertyOptimization() {
    if (!extensionState.customCssShadowPropertyInstalled) {
        return;
    }

    restoreCustomCssShadowPropertyInput(extensionState.customCssShadowPropertyInput || document.getElementById(CUSTOM_CSS_INPUT_ID));

    extensionState.customCssOriginalValueDescriptor = null;
    extensionState.customCssShadowPropertyInstalled = false;
    extensionState.customCssShadowPropertyInput = null;
    extensionState.customCssShadowVirtualValue = '';
}

function restoreCustomCssShadowPropertyInput(input) {
    const originalDescriptor = extensionState.customCssOriginalValueDescriptor;

    if (!(input instanceof HTMLTextAreaElement) || !originalDescriptor) {
        return false;
    }

    const currentValue = String(input.value ?? '');
    Object.defineProperty(input, 'value', originalDescriptor);
    input.value = currentValue;

    return true;
}

function installCustomCssInputOptimization() {
    if (extensionState[CUSTOM_CSS_INPUT_OPTIMIZATION_KEY]) {
        return;
    }

    const input = document.getElementById(CUSTOM_CSS_INPUT_ID);

    if (!(input instanceof HTMLTextAreaElement)) {
        return;
    }

    const inputHandler = (event) => {
        const input = getCustomCssInputFromEvent(event);

        if (!input) {
            return;
        }

        event.stopImmediatePropagation();

        if (event.isComposing || extensionState.customCssInputComposing || extensionState.customCssInputCompositionCommitPending) {
            return;
        }

        const codeMirrorSynced = syncCustomCssCodeMirrorFromExternalSource(input);

        commitCustomCssInputValue(input, 'input event');

        if (codeMirrorSynced || !event.isTrusted) {
            flushCustomCssApply('input event');
        }
    };
    const compositionStartHandler = (event) => {
        if (getCustomCssInputFromEvent(event)) {
            clearCustomCssCompositionEndTimer();
            extensionState.customCssInputComposing = true;
            extensionState.customCssInputCompositionCommitPending = false;
        }
    };
    const compositionEndHandler = (event) => {
        const input = getCustomCssInputFromEvent(event);

        if (!input) {
            return;
        }

        clearCustomCssCompositionEndTimer();
        extensionState.customCssInputCompositionCommitPending = true;
        extensionState.customCssCompositionEndTimer = setTimeout(() => {
            extensionState.customCssCompositionEndTimer = null;
            extensionState.customCssInputComposing = false;
            extensionState.customCssInputCompositionCommitPending = false;
            syncCustomCssCodeMirrorFromExternalSource(input);
            commitCustomCssInputValue(input, 'composition end');
        }, 0);
    };
    const flushHandler = (event) => {
        const input = getCustomCssInputFromEvent(event);

        if (input) {
            extensionState.customCssInputComposing = false;
            extensionState.customCssInputCompositionCommitPending = false;
            clearCustomCssCompositionEndTimer();
            commitCustomCssInputValue(input, `${event?.type || 'flush'} event`);
            flushCustomCssApply(`${event?.type || 'flush'} event`);
        }
    };
    const pageLifecycleHandler = (event) => {

        if (isCustomCssPageRestoreEvent(event)) {
            scheduleCustomCssStateRestoreSync(`input optimization ${event?.type || 'restore'}`);
            return;
        }

        flushCurrentCustomCssInput(`input optimization ${event?.type || 'page lifecycle'}`);
    };

    input.addEventListener('input', inputHandler, true);
    input.addEventListener('compositionstart', compositionStartHandler, true);
    input.addEventListener('compositionend', compositionEndHandler, true);
    input.addEventListener('change', flushHandler, true);
    input.addEventListener('blur', flushHandler, true);
    window.addEventListener('pagehide', pageLifecycleHandler);
    window.addEventListener('pageshow', pageLifecycleHandler);
    window.addEventListener('focus', pageLifecycleHandler);

    extensionState[CUSTOM_CSS_INPUT_OPTIMIZATION_KEY] = {
        input,
        inputHandler,
        compositionStartHandler,
        compositionEndHandler,
        flushHandler,
        pageLifecycleHandler,
    };
}

function removeCustomCssInputOptimization() {
    const state = extensionState[CUSTOM_CSS_INPUT_OPTIMIZATION_KEY];

    if (!state) {
        return;
    }

    flushCurrentCustomCssInput('remove input optimization');
    clearCustomCssCompositionEndTimer();
    extensionState.customCssInputComposing = false;
    extensionState.customCssInputCompositionCommitPending = false;
    state.input?.removeEventListener('input', state.inputHandler, true);
    state.input?.removeEventListener('compositionstart', state.compositionStartHandler, true);
    state.input?.removeEventListener('compositionend', state.compositionEndHandler, true);
    state.input?.removeEventListener('change', state.flushHandler, true);
    state.input?.removeEventListener('blur', state.flushHandler, true);
    window.removeEventListener('pagehide', state.pageLifecycleHandler);
    window.removeEventListener('pageshow', state.pageLifecycleHandler);
    window.removeEventListener('focus', state.pageLifecycleHandler);
    clearCustomCssRestoreSyncTimers();
    delete extensionState[CUSTOM_CSS_INPUT_OPTIMIZATION_KEY];
}

function getCustomCssInputFromEvent(event) {
    const target = event.target;

    if (!(target instanceof HTMLTextAreaElement) || target.id !== CUSTOM_CSS_INPUT_ID) {
        return null;
    }

    return target;
}

function commitCustomCssInputValue(input, reason = 'input commit') {
    if (!(input instanceof HTMLTextAreaElement) || input.id !== CUSTOM_CSS_INPUT_ID) {
        return;
    }

    power_user.custom_css = String(input.value);
    saveSettingsDebounced();
}

function clearCustomCssCompositionEndTimer() {
    if (extensionState.customCssCompositionEndTimer) {
        clearTimeout(extensionState.customCssCompositionEndTimer);
        extensionState.customCssCompositionEndTimer = null;
    }
}

function flushCustomCssApply(reason = 'flush custom css apply') {
    applyCustomCssStyleText(reason);
}

function flushCurrentCustomCssInput(reason = 'current input flush') {
    const codeMirrorState = extensionState[CUSTOM_CSS_CODEMIRROR_EDITOR_KEY];

    if (codeMirrorState?.themeSyncPending) {
        syncCustomCssStateFromSettings(`${reason} while theme sync is pending`, {
            forceEditor: true,
            refreshTarget: true,
            clearThemePending: false,
        });
        return;
    }

    if (flushCustomCssCodeMirrorEditor(reason, { apply: true, save: true })) {
        return;
    }

    const input = document.getElementById(CUSTOM_CSS_INPUT_ID);

    if (input instanceof HTMLTextAreaElement) {
        extensionState.customCssInputComposing = false;
        extensionState.customCssInputCompositionCommitPending = false;
        clearCustomCssCompositionEndTimer();
        commitCustomCssInputValue(input, reason);
    }

    flushCustomCssApply(reason);
}

function syncCustomCssStateFromSettings(reason = 'custom css settings sync', {
    forceEditor = false,
    refreshTarget = false,
    clearThemePending = false,
} = {}) {
    const value = String(power_user.custom_css ?? '');

    syncCustomCssShadowPropertyTarget(value);

    const originalInput = getCustomCssOriginalInput();
    let originalInputSynced = true;

    if (originalInput instanceof HTMLTextAreaElement) {
        if (originalInput.value !== value) {
            originalInput.value = value;
        }

        originalInputSynced = originalInput.value === value;
    }

    let state = extensionState[CUSTOM_CSS_CODEMIRROR_EDITOR_KEY];

    if (refreshTarget && state?.enabled) {
        refreshCustomCssCodeMirrorEditorTarget(state);
        state = extensionState[CUSTOM_CSS_CODEMIRROR_EDITOR_KEY];
    }

    let sourceSynced = true;
    let editorSynced = true;

    if (state?.enabled) {
        if (state.source instanceof HTMLTextAreaElement) {
            if (state.source.value !== value) {
                state.source.value = value;
            }

            sourceSynced = state.source.value === value;
        }

        if (state.view) {
            const shouldSyncEditor = forceEditor || state.themeSyncPending || !state.dirty;

            if (shouldSyncEditor) {
                const editorHidden = state.wrapper instanceof HTMLElement
                    && state.wrapper.isConnected
                    && state.wrapper.offsetParent === null;

                if (editorHidden && getCustomCssCodeMirrorValue(state) !== value) {
                    // 编辑器折叠在抽屉里时跳过昂贵的大文档 dispatch(主题切换的 CSS
                    // 往往是整份替换)。只把 source 标记为待同步:抽屉展开的 class 变化
                    // 会触发 editor refresh,由 clean-sync 补齐 doc。themeSyncPending
                    // 保持置位,防止期间的 flush 把陈旧 doc 写回 power_user。
                    state.dirty = false;
                    state.editorThemeSyncDeferred = true;
                    editorSynced = true;
                } else {
                    state.dirty = false;
                    syncCustomCssCodeMirrorFromSource(state, { force: true });
                    state.editorThemeSyncDeferred = false;
                    editorSynced = getCustomCssCodeMirrorValue(state) === value;
                }
            } else {
                editorSynced = getCustomCssCodeMirrorValue(state) === value;
            }
        }
    }

    applyCustomCssStyleText(reason);

    const style = document.getElementById(CUSTOM_CSS_STYLE_ID);
    const styleSynced = style?.textContent === value;
    const complete = originalInputSynced && sourceSynced && editorSynced && styleSynced;

    if (complete && clearThemePending && state && !state.editorThemeSyncDeferred) {
        state.themeSyncPending = false;
    }

    if (!complete) {
    } else {
    }

    return complete;
}

function scheduleCustomCssStateRestoreSync(reason = 'page restore') {
    clearCustomCssRestoreSyncTimers();

    const token = (extensionState.customCssRestoreSyncToken ?? 0) + 1;
    extensionState.customCssRestoreSyncToken = token;
    extensionState.customCssRestoreSyncTimers = [];

    const sync = (phase) => {
        if (extensionState.customCssRestoreSyncToken !== token) {
            return;
        }

        const state = extensionState[CUSTOM_CSS_CODEMIRROR_EDITOR_KEY];
        const complete = syncCustomCssStateFromSettings(`${reason} (${phase})`, {
            forceEditor: Boolean(state?.themeSyncPending),
            refreshTarget: true,
            clearThemePending: true,
        });
    };

    sync('immediate');

    for (const delay of CUSTOM_CSS_RESTORE_SYNC_SETTLE_DELAYS_MS) {
        const timer = setTimeout(() => sync(`timeout ${delay}ms`), delay);
        extensionState.customCssRestoreSyncTimers.push(timer);
    }
}

function clearCustomCssRestoreSyncTimers() {
    for (const timer of extensionState.customCssRestoreSyncTimers || []) {
        clearTimeout(timer);
    }

    extensionState.customCssRestoreSyncTimers = [];
}

function isCustomCssPageRestoreEvent(event) {
    if (event?.type === 'pageshow' || event?.type === 'focus') {
        return true;
    }

    return event?.type === 'visibilitychange' && document.visibilityState !== 'hidden';
}

function applyCustomCssStyleText(reason = 'apply custom css style text') {
    let style = document.getElementById(CUSTOM_CSS_STYLE_ID);
    const value = String(power_user.custom_css ?? '');

    if (!style) {
        style = document.createElement('style');
        style.type = 'text/css';
        style.id = CUSTOM_CSS_STYLE_ID;
        document.head.append(style);
    }

    if (style.textContent !== value) {
        style.textContent = value;
        return true;
    }

    return false;
}

function installCustomCssCodeMirrorEditorOptimization() {
    const state = getCustomCssCodeMirrorEditorState();
    state.enabled = true;

    applyCustomCssCodeMirrorEditorStyle();
    installCustomCssCodeMirrorEditorGlobalListeners(state);
    refreshCustomCssCodeMirrorEditorTarget(state);
    installCustomCssCodeMirrorEditorMutationObserver(state);
}

function removeCustomCssCodeMirrorEditorOptimization() {
    const state = extensionState[CUSTOM_CSS_CODEMIRROR_EDITOR_KEY];

    if (!state) {
        return;
    }

    flushCustomCssCodeMirrorEditor('disable', { apply: true, save: true });
    state.enabled = false;

    if (state.refreshFrame) {
        cancelAnimationFrame(state.refreshFrame);
        state.refreshFrame = 0;
    }

    state.mutationObserver?.disconnect();
    state.mutationObserver = null;
    clearCustomCssCodeMirrorThemeSyncTimers(state);
    detachCustomCssCodeMirrorEditor(state);

    for (const listener of state.globalListeners || []) {
        listener.target.removeEventListener(listener.type, listener.handler, listener.options);
    }

    state.globalListeners = [];
    removeCustomCssCodeMirrorEditorStyle();
    delete extensionState[CUSTOM_CSS_CODEMIRROR_EDITOR_KEY];
}

function getCustomCssCodeMirrorEditorState() {
    if (!extensionState[CUSTOM_CSS_CODEMIRROR_EDITOR_KEY]) {
        extensionState[CUSTOM_CSS_CODEMIRROR_EDITOR_KEY] = {
            enabled: false,
            source: null,
            wrapper: null,
            view: null,
            listeners: [],
            globalListeners: [],
            mutationObserver: null,
            mutationObserverTargets: [],
            refreshFrame: 0,
            dirty: false,
            flushing: false,
            syncingFromSource: false,
            loadingToken: null,
            colorScheme: 'light',
            colorSchemeDirty: true,
            themeSyncPending: false,
            editorThemeSyncDeferred: false,
            themeSyncToken: 0,
            themeSyncTimers: [],
            themeSyncFrames: [],
        };
    }

    return extensionState[CUSTOM_CSS_CODEMIRROR_EDITOR_KEY];
}

function installCustomCssCodeMirrorEditorGlobalListeners(state) {
    if (state.globalListeners.length > 0) {
        return;
    }

    const clickHandler = (event) => {
        const target = event.target;

        if (!(target instanceof Element)) {
            return;
        }

        if (target.closest(CUSTOM_CSS_CODEMIRROR_EXTERNAL_READ_SELECTOR)) {
            syncCustomCssCodeMirrorToSourceForExternalRead(state);
        }

        const nativeScrollButton = target.closest('#native-btn-scroll-new');

        if (nativeScrollButton instanceof HTMLElement) {
            scrollCustomCssCodeMirrorForNativeToolbar(state, nativeScrollButton);
        }

        const nativeSearchItem = target.closest('#native-search-dropdown-new .vce-search-item-new');

        if (nativeSearchItem instanceof HTMLElement) {
            selectCustomCssCodeMirrorNativeSearchResultAfterThemeEditor(state, nativeSearchItem);
        }

        if (target.closest('#vce-css-inject-toggle')) {
            setTimeout(() => {
                syncCustomCssCodeMirrorThemeEditorHeight(state);
            }, 0);
        }

        if (target.closest(`.editor_maximize[data-for="${CUSTOM_CSS_INPUT_ID}"]`)) {
            flushCustomCssCodeMirrorEditor('maximize click', { apply: true, save: true });
            scheduleCustomCssCodeMirrorEditorRefresh(state, { colorSchemeDirty: true });
        }
    };
    const pageLifecycleHandler = (event) => {

        if (isCustomCssPageRestoreEvent(event)) {
            scheduleCustomCssStateRestoreSync(`CodeMirror ${event?.type || 'restore'}`);
            return;
        }

        flushCustomCssCodeMirrorEditor('page lifecycle', { apply: true, save: true });
    };
    // Native theme switches update #customCSS.value programmatically, which does
    // not fire an `input` event, so the editor cannot learn the new CSS from the
    // input pipeline. Re-sync from power_user.custom_css after the theme applies.
    // Bubble phase: on the native path the core `#themes` change handler runs
    // first (applyTheme → applyCustomCSS), then this fires; on the lazy path the
    // guard stops propagation in capture, but that path already syncs explicitly.
    const themeChangeHandler = (event) => {
        const target = event.target;

        if (target instanceof HTMLSelectElement && target.id === 'themes') {
            cancelThemePrintCharactersIfUnchanged(state.themePrintCharactersSnapshot);
            state.themePrintCharactersSnapshot = null;
            scheduleCustomCssCodeMirrorThemeSync();
        }
    };
    // Capture phase runs before the core #themes change handler (applyTheme →
    // applyCustomCSS), so the reflow guard window covers the synchronous apply
    // storm too, not just the async settle work afterwards. The snapshot feeds
    // the bubble handler, which cancels applyTheme's unconditional
    // printCharactersDebounced() when the relevant keys didn't change.
    const themeChangeCaptureHandler = (event) => {
        const target = event.target;

        if (target instanceof HTMLSelectElement && target.id === 'themes') {
            beginThemeApplyReflowGuardWindow();
            state.themePrintCharactersSnapshot = snapshotThemePrintCharactersKeys();
        }
    };
    const addListener = (target, type, handler, options) => {
        if (!(target instanceof EventTarget) || target === document) {
            return;
        }

        target.addEventListener(type, handler, options);
        state.globalListeners.push({ target, type, handler, options });
    };

    for (const target of getCustomCssCodeMirrorListenerTargets()) {
        addListener(target, 'click', clickHandler, true);
    }

    addListener(document.querySelector('#themes'), 'change', themeChangeCaptureHandler, true);
    addListener(document.querySelector('#themes'), 'change', themeChangeHandler, false);
    addListener(window, 'pagehide', pageLifecycleHandler);
    addListener(window, 'pageshow', pageLifecycleHandler);
    addListener(window, 'focus', pageLifecycleHandler);
}

function getCustomCssCodeMirrorListenerTargets() {
    const targets = new Set();
    const add = target => {
        if (target instanceof HTMLElement && target.isConnected) {
            targets.add(target);
        }
    };
    const source = getCustomCssCodeMirrorSource();

    add(document.querySelector(CUSTOM_CSS_HOST_SELECTOR));
    add(document.querySelector(CUSTOM_CSS_SETTINGS_PANEL_SELECTOR));
    add(document.querySelector('#native-search-dropdown-new'));
    add(source?.closest('dialog.popup, .popup'));
    add(source?.parentElement);
    return [...targets];
}

function installCustomCssCodeMirrorEditorMutationObserver(state) {
    if (typeof MutationObserver !== 'function') {
        return;
    }

    if (!state.mutationObserver) {
        state.mutationObserver = new MutationObserver((mutations) => {
            if (areCustomCssCodeMirrorMutationsInternal(state, mutations)
                || !shouldCustomCssCodeMirrorRefreshForMutations(state, mutations)) {
                return;
            }

            scheduleCustomCssCodeMirrorEditorRefresh(state, { colorSchemeDirty: true });
        });
    }

    bindCustomCssCodeMirrorEditorMutationObserver(state);
}

function bindCustomCssCodeMirrorEditorMutationObserver(state) {
    if (!state?.mutationObserver) {
        return;
    }

    const targets = getCustomCssCodeMirrorMutationTargets(state);
    const currentTargets = state.mutationObserverTargets || [];
    const unchanged = currentTargets.length === targets.length
        && currentTargets.every((current, index) => current.target === targets[index].target && current.optionsKey === targets[index].optionsKey);

    if (unchanged) {
        return;
    }

    state.mutationObserver.disconnect();

    for (const { target, options } of targets) {
        state.mutationObserver.observe(target, options);
    }

    state.mutationObserverTargets = targets;
}

function getCustomCssCodeMirrorMutationTargets(state) {
    const targetMap = new Map();
    const hostOptions = {
        attributes: true,
        attributeFilter: ['class', 'style', 'hidden', 'data-for'],
        childList: true,
        subtree: true,
    };
    const parentOptions = {
        childList: true,
        subtree: false,
    };

    const addTarget = (target, optionsKey, options) => {
        if (!(target instanceof Node) || !target.isConnected) {
            return;
        }

        const existing = targetMap.get(target);

        if (!existing || existing.optionsKey === 'parent') {
            targetMap.set(target, { target, optionsKey, options });
        }
    };

    const addLocalRootsForElement = (element) => {
        if (!(element instanceof HTMLElement)) {
            return;
        }

        addTarget(element.parentElement, 'host', hostOptions);
        addTarget(element.parentElement?.parentElement, 'parent', parentOptions);

        const popup = element.closest('dialog.popup');
        addTarget(popup, 'host', hostOptions);
        addTarget(popup?.parentElement, 'parent', parentOptions);
    };

    const liveSource = getCustomCssCodeMirrorSource();
    const host = document.querySelector(CUSTOM_CSS_HOST_SELECTOR);
    const settingsPanel = document.querySelector(CUSTOM_CSS_SETTINGS_PANEL_SELECTOR);

    addLocalRootsForElement(liveSource);
    addLocalRootsForElement(state.source);
    addLocalRootsForElement(state.wrapper);

    if (host instanceof HTMLElement) {
        addTarget(host, 'host', hostOptions);
        addTarget(host.parentElement, 'parent', parentOptions);
    } else if (settingsPanel instanceof HTMLElement) {
        addTarget(settingsPanel, 'host', hostOptions);
        addTarget(settingsPanel.parentElement, 'parent', parentOptions);
    }

    return [...targetMap.values()];
}

function shouldCustomCssCodeMirrorRefreshForMutations(state, mutations) {
    return mutations.some((mutation) => {
        if (isCustomCssCodeMirrorRelevantMutationNode(state, mutation.target)) {
            return true;
        }

        for (const node of mutation.addedNodes) {
            if (isCustomCssCodeMirrorRelevantMutationNode(state, node)) {
                return true;
            }
        }

        for (const node of mutation.removedNodes) {
            if (isCustomCssCodeMirrorRelevantMutationNode(state, node)) {
                return true;
            }
        }

        return false;
    });
}

function isCustomCssCodeMirrorRelevantMutationNode(state, node) {
    if (!(node instanceof Element)) {
        return false;
    }

    if (node.id === CUSTOM_CSS_INPUT_ID
        || node.id === CUSTOM_CSS_CODEMIRROR_EDITOR_ID
        || node.matches(CUSTOM_CSS_HOST_SELECTOR)
        || node.matches(CUSTOM_CSS_SETTINGS_PANEL_SELECTOR)
        || node.matches(CUSTOM_CSS_MAXIMIZED_SOURCE_SELECTOR)) {
        return true;
    }

    if (state.source instanceof HTMLElement
        && (node === state.source || node.contains(state.source) || state.source.contains(node))) {
        return true;
    }

    if (state.wrapper instanceof HTMLElement
        && (node === state.wrapper || node.contains(state.wrapper) || state.wrapper.contains(node))) {
        return true;
    }

    return Boolean(node.querySelector?.([
        `#${CUSTOM_CSS_INPUT_ID}`,
        `#${CUSTOM_CSS_CODEMIRROR_EDITOR_ID}`,
        CUSTOM_CSS_HOST_SELECTOR,
        CUSTOM_CSS_MAXIMIZED_SOURCE_SELECTOR,
    ].join(', ')));
}

function areCustomCssCodeMirrorMutationsInternal(state, mutations) {
    const wrapper = state.wrapper;

    if (!(wrapper instanceof HTMLElement)) {
        return false;
    }

    return mutations.every((mutation) => {
        if (mutation.target instanceof Node && wrapper.contains(mutation.target)) {
            return true;
        }

        for (const node of mutation.addedNodes) {
            if (!(node instanceof Node) || !wrapper.contains(node)) {
                return false;
            }
        }

        for (const node of mutation.removedNodes) {
            if (!(node instanceof Node) || !wrapper.contains(node)) {
                return false;
            }
        }

        return mutation.addedNodes.length > 0 || mutation.removedNodes.length > 0;
    });
}

function scheduleCustomCssCodeMirrorEditorRefresh(state = extensionState[CUSTOM_CSS_CODEMIRROR_EDITOR_KEY], { colorSchemeDirty = false } = {}) {
    if (!state?.enabled) {
        return;
    }

    if (colorSchemeDirty) {
        state.colorSchemeDirty = true;
    }

    if (state.refreshFrame) {
        return;
    }


    state.refreshFrame = requestAnimationFrame(() => {
        state.refreshFrame = 0;
        refreshCustomCssCodeMirrorEditorTarget(state);
    });
}

function refreshCustomCssCodeMirrorEditorTarget(state) {
    if (!state?.enabled) {
        return;
    }

    syncCustomCssShadowPropertyTarget(String(power_user.custom_css ?? ''));

    const source = getCustomCssCodeMirrorSource();

    if (!(source instanceof HTMLTextAreaElement) || !source.isConnected) {
        flushCustomCssCodeMirrorEditor('target removed', { apply: true, save: true });
        detachCustomCssCodeMirrorEditor(state);
        bindCustomCssCodeMirrorEditorMutationObserver(state);
        return;
    }

    if (state.source === source && state.wrapper?.isConnected) {
        updateCustomCssCodeMirrorSourceClasses(state, source, state.wrapper);
        if (state.colorSchemeDirty) {
            updateCustomCssCodeMirrorColorScheme(state, source, state.wrapper);
        }
        if (state.editorThemeSyncDeferred) {
            // 补齐主题切换时因编辑器不可见而推迟的 doc 同步。无条件收敛,避免
            // themeSyncPending 悬置导致后续 flush 一直走“重同步”分支丢弃用户编辑。
            syncCustomCssCodeMirrorFromSource(state, { force: true });
            state.editorThemeSyncDeferred = false;
            state.themeSyncPending = false;
        } else {
            syncCustomCssCodeMirrorFromSourceIfClean(state);
        }
        bindCustomCssCodeMirrorEditorMutationObserver(state);
        return;
    }

    flushCustomCssCodeMirrorEditor('target switch', { apply: true, save: true });
    detachCustomCssCodeMirrorEditor(state);
    attachCustomCssCodeMirrorEditor(state, source);
    bindCustomCssCodeMirrorEditorMutationObserver(state);
}

function getCustomCssCodeMirrorSource() {
    const maximizedSource = document.querySelector(CUSTOM_CSS_MAXIMIZED_SOURCE_SELECTOR);

    if (maximizedSource instanceof HTMLTextAreaElement && maximizedSource.isConnected) {
        return maximizedSource;
    }

    return document.getElementById(CUSTOM_CSS_INPUT_ID);
}

function attachCustomCssCodeMirrorEditor(state, source) {
    const wrapper = document.createElement('div');

    wrapper.id = CUSTOM_CSS_CODEMIRROR_EDITOR_ID;
    wrapper.className = CUSTOM_CSS_CODEMIRROR_EDITOR_CLASS;
    wrapper.textContent = 'Loading CodeMirror...';
    updateCustomCssCodeMirrorSourceClasses(state, source, wrapper);
    updateCustomCssCodeMirrorColorScheme(state, source, wrapper);
    source.classList.add(CUSTOM_CSS_SOURCE_HIDDEN_CLASS);
    source.parentElement?.classList.add(CUSTOM_CSS_HOST_CLASS);
    if (!isCustomCssCodeMirrorMaximizedSource(source)) {
        source.closest('#UI-Customization')?.classList.add(CUSTOM_CSS_LAYOUT_CLASS);
    }
    source.insertAdjacentElement('afterend', wrapper);

    state.source = source;
    state.wrapper = wrapper;
    state.dirty = false;
    syncCustomCssCodeMirrorThemeEditorHeight(state);

    const focusOutHandler = () => {
        setTimeout(() => {
            if (state.dirty && state.wrapper && !state.wrapper.contains(document.activeElement)) {
                flushCustomCssCodeMirrorEditor('blur', { apply: true, save: true });
            }
        }, 0);
    };

    wrapper.addEventListener('focusout', focusOutHandler);

    state.listeners.push(
        { target: wrapper, type: 'focusout', handler: focusOutHandler, options: undefined }
    );

    const loadingToken = {};
    state.loadingToken = loadingToken;

    void loadDescriptionCodeMirrorModules()
        .then((modules) => {
            if (!state.enabled || state.source !== source || state.wrapper !== wrapper || state.loadingToken !== loadingToken || !wrapper.isConnected) {
                return;
            }

            createCustomCssCodeMirrorView(state, source, wrapper, modules);
        })
        .catch((error) => {

            if (state.enabled && state.source === source && state.wrapper === wrapper && state.loadingToken === loadingToken) {
                state.enabled = false;
                detachCustomCssCodeMirrorEditor(state);
                removeCustomCssCodeMirrorEditorStyle();
            }
        });
}

function updateCustomCssCodeMirrorColorScheme(state, source, wrapper) {
    const colorScheme = detectCustomCssCodeMirrorColorScheme(source);

    state.colorScheme = colorScheme;
    state.colorSchemeDirty = false;
    wrapper.classList.toggle(CUSTOM_CSS_DARK_THEME_CLASS, colorScheme === 'dark');
    wrapper.classList.toggle(CUSTOM_CSS_LIGHT_THEME_CLASS, colorScheme !== 'dark');
    wrapper.dataset.colorScheme = colorScheme;

    return colorScheme;
}

function updateCustomCssCodeMirrorSourceClasses(state, source, wrapper) {
    wrapper.classList.toggle(CUSTOM_CSS_MAXIMIZED_CLASS, isCustomCssCodeMirrorMaximizedSource(source));
}

function isCustomCssCodeMirrorMaximizedSource(source) {
    return source instanceof HTMLTextAreaElement && source.matches(CUSTOM_CSS_MAXIMIZED_SOURCE_SELECTOR);
}

function getCustomCssOriginalInput() {
    const input = document.getElementById(CUSTOM_CSS_INPUT_ID);

    return input instanceof HTMLTextAreaElement ? input : null;
}

function detectCustomCssCodeMirrorColorScheme(source) {
    const background = getElementBlendedBackgroundColor(source);
    const luminance = getRelativeColorLuminance(background);

    return luminance < CUSTOM_CSS_DARK_BACKGROUND_LUMINANCE_THRESHOLD ? 'dark' : 'light';
}

function getElementBlendedBackgroundColor(element) {
    const elements = [];

    for (let current = element; current instanceof Element; current = current.parentElement) {
        elements.push(current);
    }

    let blended = { r: 255, g: 255, b: 255, a: 1 };

    for (const current of elements.reverse()) {
        const background = parseCssRgbColor(getComputedStyle(current).backgroundColor);

        if (background?.a > 0) {
            blended = blendColors(background, blended);
        }
    }

    return blended;
}

function parseCssRgbColor(value) {
    if (!value || value === 'transparent') {
        return null;
    }

    const match = value.match(/^rgba?\((.+)\)$/i);

    if (!match) {
        return null;
    }

    const parts = match[1]
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean);

    if (parts.length < 3) {
        return null;
    }

    const readChannel = (part) => {
        if (part.endsWith('%')) {
            return Math.max(0, Math.min(255, (Number.parseFloat(part) / 100) * 255));
        }

        return Math.max(0, Math.min(255, Number.parseFloat(part)));
    };
    const alpha = parts.length >= 4 ? Number.parseFloat(parts[3]) : 1;

    return {
        r: readChannel(parts[0]),
        g: readChannel(parts[1]),
        b: readChannel(parts[2]),
        a: Number.isFinite(alpha) ? Math.max(0, Math.min(1, alpha)) : 1,
    };
}

function blendColors(foreground, background) {
    const alpha = foreground.a + background.a * (1 - foreground.a);

    if (alpha <= 0) {
        return { r: 255, g: 255, b: 255, a: 1 };
    }

    return {
        r: (foreground.r * foreground.a + background.r * background.a * (1 - foreground.a)) / alpha,
        g: (foreground.g * foreground.a + background.g * background.a * (1 - foreground.a)) / alpha,
        b: (foreground.b * foreground.a + background.b * background.a * (1 - foreground.a)) / alpha,
        a: alpha,
    };
}

function getRelativeColorLuminance(color) {
    const normalize = (channel) => {
        const value = channel / 255;

        return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    };

    return 0.2126 * normalize(color.r) + 0.7152 * normalize(color.g) + 0.0722 * normalize(color.b);
}

function createCustomCssCodeMirrorView(state, source, wrapper, modules) {
    const {
        EditorState,
        EditorView,
        keymap,
        defaultKeymap = [],
        history,
        historyKeymap = [],
        css,
        defaultHighlightStyle,
        HighlightStyle,
        syntaxHighlighting,
        classHighlighter,
        tags,
        oneDarkHighlightStyle,
    } = modules;
    const useHistory = source.value.length <= DESCRIPTION_CODEMIRROR_HISTORY_MAX_LENGTH;
    const colorScheme = updateCustomCssCodeMirrorColorScheme(state, source, wrapper);
    const highlightExtension = getCustomCssHighlightExtension({
        colorScheme,
        defaultHighlightStyle,
        HighlightStyle,
        syntaxHighlighting,
        classHighlighter,
        tags,
        oneDarkHighlightStyle,
    });

    const extensions = [
        EditorView.lineWrapping,
        ...(typeof css === 'function' ? [css()] : []),
        ...(highlightExtension ? [highlightExtension] : []),
        EditorView.updateListener.of((update) => {
            if (update.docChanged) {
                if (state.syncingFromSource) {
                    return;
                }

                state.dirty = true;
                syncCustomCssCodeMirrorToSource(state, 'editor doc change');
            }
        }),
        EditorView.theme({
            '&': {
                backgroundColor: 'var(--SmartThemeBlurTintColor)',
                border: '1px solid var(--SmartThemeBorderColor)',
                borderRadius: '4px',
                boxSizing: 'border-box',
                color: 'var(--SmartThemeBodyColor)',
                font: 'inherit',
                maxWidth: '100%',
                minHeight: '180px',
                minWidth: '0',
                overflow: 'hidden',
                textShadow: 'none',
                textAlign: 'left',
                width: '100%',
            },
            '&.cm-focused': {
                outline: 'none',
            },
            '.cm-scroller': {
                fontFamily: 'var(--monoFontFamily, monospace)',
                fontSize: '0.95em',
                lineHeight: '1.35',
                maxWidth: '100%',
                maxHeight: '55vh',
                minHeight: '180px',
                minWidth: '0',
                overflow: 'auto',
                overflowAnchor: 'none',
                overscrollBehavior: 'auto',
                touchAction: 'pan-y',
                WebkitOverflowScrolling: 'touch',
            },
            '.cm-content': {
                caretColor: 'var(--SmartThemeBodyColor)',
                minWidth: '0',
                padding: '8px',
                textShadow: 'none',
                textAlign: 'left',
                minHeight: '180px',
            },
            '.cm-line': {
                padding: '0',
                textAlign: 'left',
            },
        }, { dark: colorScheme === 'dark' }),
    ];

    if (useHistory && typeof history === 'function') {
        extensions.push(history());
    }

    if (typeof keymap?.of === 'function') {
        extensions.push(keymap.of(useHistory ? [...defaultKeymap, ...historyKeymap] : defaultKeymap));
    }

    if (EditorView.contentAttributes?.of) {
        extensions.push(EditorView.contentAttributes.of({
            autocomplete: 'off',
            autocapitalize: 'off',
            autocorrect: 'off',
            spellcheck: 'false',
            'aria-label': '自定义 CSS',
        }));
    }

    wrapper.textContent = '';
    state.view = new EditorView({
        state: EditorState.create({
            doc: source.value || '',
            extensions,
        }),
        parent: wrapper,
    });
    syncCustomCssCodeMirrorThemeEditorHeight(state);
}

function getCustomCssHighlightExtension({ colorScheme, defaultHighlightStyle, HighlightStyle, syntaxHighlighting, classHighlighter, tags, oneDarkHighlightStyle }) {
    if (typeof syntaxHighlighting !== 'function') {
        return null;
    }

    if (classHighlighter) {
        return syntaxHighlighting(classHighlighter, { fallback: true });
    }

    if (colorScheme === 'dark' && oneDarkHighlightStyle) {
        return syntaxHighlighting(oneDarkHighlightStyle, { fallback: true });
    }

    if (defaultHighlightStyle) {
        return syntaxHighlighting(defaultHighlightStyle, { fallback: true });
    }

    if (typeof HighlightStyle !== 'function' || !tags) {
        return null;
    }

    const rules = [];
    const add = (tag, style) => {
        if (Array.isArray(tag)) {
            const existingTags = tag.filter(Boolean);
            if (existingTags.length) {
                rules.push({ tag: existingTags, ...style });
            }
        } else if (tag) {
            rules.push({ tag, ...style });
        }
    };
    const derivedTag = (derive, baseTag) => (typeof derive === 'function' && baseTag ? derive(baseTag) : null);

    add(tags.meta, { color: '#404740' });
    add(tags.link, { textDecoration: 'underline' });
    add(tags.heading, { textDecoration: 'underline', fontWeight: 'bold' });
    add(tags.emphasis, { fontStyle: 'italic' });
    add(tags.strong, { fontWeight: 'bold' });
    add(tags.strikethrough, { textDecoration: 'line-through' });
    add(tags.keyword, { color: '#708' });
    add([tags.atom, tags.bool, tags.url, tags.contentSeparator, tags.labelName], { color: '#219' });
    add([tags.literal, tags.inserted], { color: '#164' });
    add([tags.string, tags.deleted], { color: '#a11' });
    add([tags.regexp, tags.escape, derivedTag(tags.special, tags.string)], { color: '#e40' });
    add(derivedTag(tags.definition, tags.variableName), { color: '#00f' });
    add(derivedTag(tags.local, tags.variableName), { color: '#30a' });
    add([tags.typeName, tags.namespace], { color: '#085' });
    add(tags.className, { color: '#167' });
    add([derivedTag(tags.special, tags.variableName), tags.macroName], { color: '#256' });
    add(derivedTag(tags.definition, tags.propertyName), { color: '#00c' });
    add(tags.comment, { color: '#940' });
    add(tags.invalid, { color: '#f00' });

    return syntaxHighlighting(HighlightStyle.define(rules), { fallback: true });
}

function detachCustomCssCodeMirrorEditor(state) {
    if (!state.source && !state.wrapper && !state.view) {
        return;
    }


    for (const listener of state.listeners || []) {
        listener.target.removeEventListener(listener.type, listener.handler, listener.options);
    }

    state.listeners = [];
    state.view?.destroy?.();
    state.source?.classList.remove(CUSTOM_CSS_SOURCE_HIDDEN_CLASS);
    state.source?.parentElement?.classList.remove(CUSTOM_CSS_HOST_CLASS);
    state.source?.closest('#UI-Customization')?.classList.remove(CUSTOM_CSS_LAYOUT_CLASS);
    state.wrapper?.remove();
    state.source = null;
    state.wrapper = null;
    state.view = null;
    state.dirty = false;
    state.syncingFromSource = false;
    state.loadingToken = null;
    state.themeSyncPending = false;
    state.editorThemeSyncDeferred = false;
    state.themeSyncTimers = [];
    state.themeSyncFrames = [];
}

function getCustomCssCodeMirrorValue(state) {
    return state.view?.state?.doc?.toString?.() ?? '';
}

function getCustomCssCodeMirrorScroller(state) {
    return state.view?.scrollDOM || state.wrapper?.querySelector?.('.cm-scroller') || null;
}

function syncCustomCssCodeMirrorToSourceForExternalRead(state = extensionState[CUSTOM_CSS_CODEMIRROR_EDITOR_KEY]) {
    if (!state?.enabled || !(state.source instanceof HTMLTextAreaElement) || !state.view) {
        return false;
    }

    return syncCustomCssCodeMirrorToSource(state, 'external read');
}

function scrollCustomCssCodeMirrorForNativeToolbar(state, button) {
    if (!state?.enabled || !state.view) {
        return;
    }

    const scroller = getCustomCssCodeMirrorScroller(state);

    if (!(scroller instanceof HTMLElement)) {
        return;
    }

    const shouldScrollUp = button.querySelector('i')?.classList.contains('fa-arrow-up');
    const targetTop = shouldScrollUp ? 0 : scroller.scrollHeight;
    const diff = targetTop - scroller.scrollTop;

    if (Math.abs(diff) > 400) {
        scroller.scrollTop = diff > 0 ? targetTop - 400 : targetTop + 400;
    }

    scroller.scrollTo({
        top: targetTop,
        behavior: 'smooth',
    });
}

function selectCustomCssCodeMirrorNativeSearchResultAfterThemeEditor(state, item) {
    if (!state?.enabled || !state.view) {
        return;
    }

    const lineIndex = Number.parseInt(item.dataset.line || '', 10);

    if (!Number.isFinite(lineIndex) || lineIndex < 0) {
        return;
    }

    const query = String(document.getElementById('native-css-search-new')?.value || '');

    setTimeout(() => {
        selectCustomCssCodeMirrorNativeSearchResult(state, lineIndex, query);
    }, 0);
}

function selectCustomCssCodeMirrorNativeSearchResult(state, lineIndex, query) {
    if (!state?.enabled || !state.view) {
        return false;
    }

    const doc = state.view.state.doc;
    const lineNumber = Math.min(Math.max(lineIndex + 1, 1), doc.lines);
    const line = doc.line(lineNumber);
    const matchIndex = query ? line.text.toLowerCase().indexOf(query.toLowerCase()) : -1;
    const anchor = line.from + Math.max(matchIndex, 0);
    const head = matchIndex >= 0 ? Math.min(anchor + query.length, line.to) : anchor;

    state.view.focus();
    state.view.dispatch({
        selection: {
            anchor,
            head,
        },
        scrollIntoView: true,
    });

    return true;
}

function syncCustomCssCodeMirrorThemeEditorHeight(state) {
    if (!(state?.wrapper instanceof HTMLElement)) {
        return;
    }

    const heightValue = document.getElementById('vce-custom-css-height-inject') ? '60dvh' : '';
    const editor = state.wrapper.querySelector('.cm-editor');
    const scroller = getCustomCssCodeMirrorScroller(state);

    for (const element of [state.wrapper, editor, scroller]) {
        if (element instanceof HTMLElement) {
            element.style.minHeight = heightValue;
        }
    }

    if (scroller instanceof HTMLElement) {
        scroller.style.maxHeight = heightValue;
    }
}

function syncCustomCssCodeMirrorToSource(state, reason = 'CodeMirror sync to source') {
    if (!(state.source instanceof HTMLTextAreaElement) || !state.view) {
        return false;
    }

    const value = getCustomCssCodeMirrorValue(state);
    const sourceChanged = state.source.value !== value;
    let originalChanged = false;
    const settingsChanged = power_user.custom_css !== value;

    if (sourceChanged) {
        state.source.value = value;
    }

    if (isCustomCssCodeMirrorMaximizedSource(state.source)) {
        const originalInput = getCustomCssOriginalInput();
        originalChanged = Boolean(originalInput && originalInput.value !== value);

        if (originalChanged) {
            originalInput.value = value;
        }
    }

    if (settingsChanged) {
        power_user.custom_css = value;
    }

    return sourceChanged || originalChanged || settingsChanged;
}

function syncCustomCssCodeMirrorFromExternalSource(source) {
    const state = extensionState[CUSTOM_CSS_CODEMIRROR_EDITOR_KEY];

    if (!state?.enabled || state.source !== source || !state.view) {
        return false;
    }

    return syncCustomCssCodeMirrorFromSource(state, { force: true });
}

function syncCustomCssCodeMirrorFromSourceIfClean(state) {
    return syncCustomCssCodeMirrorFromSource(state, { force: false });
}

function syncCustomCssCodeMirrorFromSource(state, { force = false } = {}) {
    if ((!force && state.dirty) || !(state.source instanceof HTMLTextAreaElement) || !state.view) {
        return;
    }

    const value = state.source.value || '';
    const current = getCustomCssCodeMirrorValue(state);

    if (current !== value) {
        state.syncingFromSource = true;

        try {
            state.view.dispatch({
                changes: {
                    from: 0,
                    to: state.view.state.doc.length,
                    insert: value,
                },
            });
            state.dirty = false;
        } finally {
            state.syncingFromSource = false;
        }


        return true;
    }

    state.dirty = false;

    return false;
}

function flushCustomCssCodeMirrorEditor(reason, { apply = false, save = true } = {}) {
    const state = extensionState[CUSTOM_CSS_CODEMIRROR_EDITOR_KEY];

    if (!state?.enabled || state.flushing || !(state.source instanceof HTMLTextAreaElement) || !state.view) {
        return false;
    }

    state.flushing = true;

    try {
        // A theme switch is pending re-sync: power_user.custom_css already holds
        // the new theme's CSS, but the editor doc still shows the old one. Writing
        // the doc back here (the tab-hidden flush can beat the rAF that re-syncs,
        // since rAF is frozen while hidden) would clobber the new CSS with the old.
        // Skip the write-back; refill the DOM/editor from custom_css instead.
        // Deferred settle passes will repeat this when the tab returns.
        if (state.themeSyncPending) {
            syncCustomCssStateFromSettings(`${reason} while theme sync is pending`, {
                forceEditor: true,
                refreshTarget: false,
                clearThemePending: false,
            });

            return false;
        }

        const externalMismatch = getCleanCustomCssCodeMirrorExternalMismatch(state);
        if (externalMismatch) {
            syncCustomCssStateFromSettings(`${reason} clean external state before flush`, {
                forceEditor: true,
                refreshTarget: false,
                clearThemePending: false,
            });

            if (apply) {
                flushCustomCssApply(reason);
            }

            return false;
        }

        const changed = syncCustomCssCodeMirrorToSource(state, reason) || state.dirty;
        state.dirty = false;

        if (changed && save) {
            saveSettingsDebounced();
        }

        if (apply) {
            flushCustomCssApply(reason);
        }

        return changed;
    } finally {
        state.flushing = false;
    }
}

function getCleanCustomCssCodeMirrorExternalMismatch(state) {
    if (state?.dirty || !(state?.source instanceof HTMLTextAreaElement) || !state.view) {
        return null;
    }

    const doc = getCustomCssCodeMirrorValue(state);
    const source = String(state.source.value ?? '');
    const powerUserValue = String(power_user.custom_css ?? '');
    const style = String(document.getElementById(CUSTOM_CSS_STYLE_ID)?.textContent ?? '');
    const sourceMatchesPowerUser = source === powerUserValue;
    const styleMatchesPowerUser = style === powerUserValue;
    const docMatchesSource = doc === source;
    const docMatchesPowerUser = doc === powerUserValue;

    if (docMatchesSource && docMatchesPowerUser) {
        return null;
    }

    if (!docMatchesPowerUser && (sourceMatchesPowerUser || styleMatchesPowerUser)) {
        return {
            doc,
            source,
            powerUser: powerUserValue,
            style,
            sourceMatchesPowerUser,
            styleMatchesPowerUser,
        };
    }

    return null;
}

function applyCustomCssCodeMirrorEditorStyle() {
    let style = document.getElementById(CUSTOM_CSS_CODEMIRROR_EDITOR_STYLE_ID);

    if (!style) {
        style = document.createElement('style');
        style.id = CUSTOM_CSS_CODEMIRROR_EDITOR_STYLE_ID;
        document.head.append(style);
    }

    style.textContent = `
#${CUSTOM_CSS_CODEMIRROR_EDITOR_ID} {
    box-sizing: border-box;
    display: block;
    flex: 1 1 auto;
    max-width: 100%;
    min-width: 0;
    overflow: hidden;
    width: 100%;
}

#${CUSTOM_CSS_CODEMIRROR_EDITOR_ID}.${CUSTOM_CSS_MAXIMIZED_CLASS} {
    height: 100%;
    min-height: 0;
}

#${CUSTOM_CSS_CODEMIRROR_EDITOR_ID}.${CUSTOM_CSS_MAXIMIZED_CLASS} .cm-editor,
#${CUSTOM_CSS_CODEMIRROR_EDITOR_ID}.${CUSTOM_CSS_MAXIMIZED_CLASS} .cm-scroller {
    height: 100%;
    max-height: none !important;
    min-height: 0 !important;
}

#${CUSTOM_CSS_CODEMIRROR_EDITOR_ID},
#${CUSTOM_CSS_CODEMIRROR_EDITOR_ID} .cm-editor,
#${CUSTOM_CSS_CODEMIRROR_EDITOR_ID} .cm-scroller,
#${CUSTOM_CSS_CODEMIRROR_EDITOR_ID} .cm-content,
#${CUSTOM_CSS_CODEMIRROR_EDITOR_ID} .cm-line {
    text-align: left !important;
}

#CustomCSS-textAreaBlock.${CUSTOM_CSS_HOST_CLASS},
#UI-Customization.${CUSTOM_CSS_LAYOUT_CLASS} {
    min-width: 0;
}

#CustomCSS-textAreaBlock.${CUSTOM_CSS_HOST_CLASS} {
    align-items: stretch;
}

#${CUSTOM_CSS_CODEMIRROR_EDITOR_ID} .cm-content span {
    color: inherit !important;
    font-family: inherit !important;
    font-size: inherit !important;
    font-style: normal !important;
    font-weight: inherit !important;
    text-decoration: none !important;
    text-shadow: none !important;
}

#${CUSTOM_CSS_CODEMIRROR_EDITOR_ID}.${CUSTOM_CSS_LIGHT_THEME_CLASS} .cm-content .tok-meta {
    color: #404740 !important;
}

#${CUSTOM_CSS_CODEMIRROR_EDITOR_ID}.${CUSTOM_CSS_LIGHT_THEME_CLASS} .cm-content .tok-link,
#${CUSTOM_CSS_CODEMIRROR_EDITOR_ID}.${CUSTOM_CSS_DARK_THEME_CLASS} .cm-content .tok-link {
    text-decoration: underline !important;
}

#${CUSTOM_CSS_CODEMIRROR_EDITOR_ID}.${CUSTOM_CSS_LIGHT_THEME_CLASS} .cm-content .tok-heading {
    font-weight: bold !important;
    text-decoration: underline !important;
}

#${CUSTOM_CSS_CODEMIRROR_EDITOR_ID}.${CUSTOM_CSS_LIGHT_THEME_CLASS} .cm-content .tok-emphasis,
#${CUSTOM_CSS_CODEMIRROR_EDITOR_ID}.${CUSTOM_CSS_DARK_THEME_CLASS} .cm-content .tok-emphasis {
    font-style: italic !important;
}

#${CUSTOM_CSS_CODEMIRROR_EDITOR_ID}.${CUSTOM_CSS_LIGHT_THEME_CLASS} .cm-content .tok-strong,
#${CUSTOM_CSS_CODEMIRROR_EDITOR_ID}.${CUSTOM_CSS_DARK_THEME_CLASS} .cm-content .tok-strong {
    font-weight: bold !important;
}

#${CUSTOM_CSS_CODEMIRROR_EDITOR_ID}.${CUSTOM_CSS_LIGHT_THEME_CLASS} .cm-content .tok-strikethrough,
#${CUSTOM_CSS_CODEMIRROR_EDITOR_ID}.${CUSTOM_CSS_DARK_THEME_CLASS} .cm-content .tok-strikethrough {
    text-decoration: line-through !important;
}

#${CUSTOM_CSS_CODEMIRROR_EDITOR_ID}.${CUSTOM_CSS_LIGHT_THEME_CLASS} .cm-content .tok-keyword {
    color: #708 !important;
}

#${CUSTOM_CSS_CODEMIRROR_EDITOR_ID}.${CUSTOM_CSS_LIGHT_THEME_CLASS} .cm-content .tok-atom,
#${CUSTOM_CSS_CODEMIRROR_EDITOR_ID}.${CUSTOM_CSS_LIGHT_THEME_CLASS} .cm-content .tok-bool,
#${CUSTOM_CSS_CODEMIRROR_EDITOR_ID}.${CUSTOM_CSS_LIGHT_THEME_CLASS} .cm-content .tok-url,
#${CUSTOM_CSS_CODEMIRROR_EDITOR_ID}.${CUSTOM_CSS_LIGHT_THEME_CLASS} .cm-content .tok-labelName {
    color: #219 !important;
}

#${CUSTOM_CSS_CODEMIRROR_EDITOR_ID}.${CUSTOM_CSS_LIGHT_THEME_CLASS} .cm-content .tok-literal,
#${CUSTOM_CSS_CODEMIRROR_EDITOR_ID}.${CUSTOM_CSS_LIGHT_THEME_CLASS} .cm-content .tok-number,
#${CUSTOM_CSS_CODEMIRROR_EDITOR_ID}.${CUSTOM_CSS_LIGHT_THEME_CLASS} .cm-content .tok-inserted {
    color: #164 !important;
}

#${CUSTOM_CSS_CODEMIRROR_EDITOR_ID}.${CUSTOM_CSS_LIGHT_THEME_CLASS} .cm-content .tok-string,
#${CUSTOM_CSS_CODEMIRROR_EDITOR_ID}.${CUSTOM_CSS_LIGHT_THEME_CLASS} .cm-content .tok-deleted {
    color: #a11 !important;
}

#${CUSTOM_CSS_CODEMIRROR_EDITOR_ID}.${CUSTOM_CSS_LIGHT_THEME_CLASS} .cm-content .tok-string2 {
    color: #e40 !important;
}

#${CUSTOM_CSS_CODEMIRROR_EDITOR_ID}.${CUSTOM_CSS_LIGHT_THEME_CLASS} .cm-content .tok-variableName.tok-definition {
    color: #00f !important;
}

#${CUSTOM_CSS_CODEMIRROR_EDITOR_ID}.${CUSTOM_CSS_LIGHT_THEME_CLASS} .cm-content .tok-variableName.tok-local {
    color: #30a !important;
}

#${CUSTOM_CSS_CODEMIRROR_EDITOR_ID}.${CUSTOM_CSS_LIGHT_THEME_CLASS} .cm-content .tok-className {
    color: #167 !important;
}

#${CUSTOM_CSS_CODEMIRROR_EDITOR_ID}.${CUSTOM_CSS_LIGHT_THEME_CLASS} .cm-content .tok-typeName,
#${CUSTOM_CSS_CODEMIRROR_EDITOR_ID}.${CUSTOM_CSS_LIGHT_THEME_CLASS} .cm-content .tok-namespace {
    color: #085 !important;
}

#${CUSTOM_CSS_CODEMIRROR_EDITOR_ID}.${CUSTOM_CSS_LIGHT_THEME_CLASS} .cm-content .tok-variableName2,
#${CUSTOM_CSS_CODEMIRROR_EDITOR_ID}.${CUSTOM_CSS_LIGHT_THEME_CLASS} .cm-content .tok-macroName {
    color: #256 !important;
}

#${CUSTOM_CSS_CODEMIRROR_EDITOR_ID}.${CUSTOM_CSS_LIGHT_THEME_CLASS} .cm-content .tok-propertyName.tok-definition {
    color: #00c !important;
}

#${CUSTOM_CSS_CODEMIRROR_EDITOR_ID}.${CUSTOM_CSS_LIGHT_THEME_CLASS} .cm-content .tok-comment {
    color: #940 !important;
}

#${CUSTOM_CSS_CODEMIRROR_EDITOR_ID}.${CUSTOM_CSS_LIGHT_THEME_CLASS} .cm-content .tok-propertyName {
    color: inherit !important;
}

#${CUSTOM_CSS_CODEMIRROR_EDITOR_ID}.${CUSTOM_CSS_LIGHT_THEME_CLASS} .cm-content .tok-punctuation {
    color: #708 !important;
    font-weight: 600 !important;
}

#${CUSTOM_CSS_CODEMIRROR_EDITOR_ID}.${CUSTOM_CSS_LIGHT_THEME_CLASS} .cm-content .tok-invalid {
    color: #f00 !important;
}

#${CUSTOM_CSS_CODEMIRROR_EDITOR_ID}.${CUSTOM_CSS_DARK_THEME_CLASS} .cm-content .tok-keyword {
    color: #c678dd !important;
}

#${CUSTOM_CSS_CODEMIRROR_EDITOR_ID}.${CUSTOM_CSS_DARK_THEME_CLASS} .cm-content .tok-variableName,
#${CUSTOM_CSS_CODEMIRROR_EDITOR_ID}.${CUSTOM_CSS_DARK_THEME_CLASS} .cm-content .tok-propertyName,
#${CUSTOM_CSS_CODEMIRROR_EDITOR_ID}.${CUSTOM_CSS_DARK_THEME_CLASS} .cm-content .tok-macroName,
#${CUSTOM_CSS_CODEMIRROR_EDITOR_ID}.${CUSTOM_CSS_DARK_THEME_CLASS} .cm-content .tok-deleted {
    color: #e06c75 !important;
}

#${CUSTOM_CSS_CODEMIRROR_EDITOR_ID}.${CUSTOM_CSS_DARK_THEME_CLASS} .cm-content .tok-labelName {
    color: #61afef !important;
}

#${CUSTOM_CSS_CODEMIRROR_EDITOR_ID}.${CUSTOM_CSS_DARK_THEME_CLASS} .cm-content .tok-literal {
    color: #d19a66 !important;
}

#${CUSTOM_CSS_CODEMIRROR_EDITOR_ID}.${CUSTOM_CSS_DARK_THEME_CLASS} .cm-content .tok-variableName.tok-definition,
#${CUSTOM_CSS_CODEMIRROR_EDITOR_ID}.${CUSTOM_CSS_DARK_THEME_CLASS} .cm-content .tok-propertyName.tok-definition {
    color: #abb2bf !important;
}

#${CUSTOM_CSS_CODEMIRROR_EDITOR_ID}.${CUSTOM_CSS_DARK_THEME_CLASS} .cm-content .tok-typeName,
#${CUSTOM_CSS_CODEMIRROR_EDITOR_ID}.${CUSTOM_CSS_DARK_THEME_CLASS} .cm-content .tok-className,
#${CUSTOM_CSS_CODEMIRROR_EDITOR_ID}.${CUSTOM_CSS_DARK_THEME_CLASS} .cm-content .tok-number,
#${CUSTOM_CSS_CODEMIRROR_EDITOR_ID}.${CUSTOM_CSS_DARK_THEME_CLASS} .cm-content .tok-namespace {
    color: #e5c07b !important;
}

#${CUSTOM_CSS_CODEMIRROR_EDITOR_ID}.${CUSTOM_CSS_DARK_THEME_CLASS} .cm-content .tok-operator,
#${CUSTOM_CSS_CODEMIRROR_EDITOR_ID}.${CUSTOM_CSS_DARK_THEME_CLASS} .cm-content .tok-url,
#${CUSTOM_CSS_CODEMIRROR_EDITOR_ID}.${CUSTOM_CSS_DARK_THEME_CLASS} .cm-content .tok-string2 {
    color: #56b6c2 !important;
}

#${CUSTOM_CSS_CODEMIRROR_EDITOR_ID}.${CUSTOM_CSS_DARK_THEME_CLASS} .cm-content .tok-meta,
#${CUSTOM_CSS_CODEMIRROR_EDITOR_ID}.${CUSTOM_CSS_DARK_THEME_CLASS} .cm-content .tok-comment {
    color: #7d8799 !important;
}

#${CUSTOM_CSS_CODEMIRROR_EDITOR_ID}.${CUSTOM_CSS_DARK_THEME_CLASS} .cm-content .tok-atom,
#${CUSTOM_CSS_CODEMIRROR_EDITOR_ID}.${CUSTOM_CSS_DARK_THEME_CLASS} .cm-content .tok-bool,
#${CUSTOM_CSS_CODEMIRROR_EDITOR_ID}.${CUSTOM_CSS_DARK_THEME_CLASS} .cm-content .tok-variableName2 {
    color: #d19a66 !important;
}

#${CUSTOM_CSS_CODEMIRROR_EDITOR_ID}.${CUSTOM_CSS_DARK_THEME_CLASS} .cm-content .tok-string,
#${CUSTOM_CSS_CODEMIRROR_EDITOR_ID}.${CUSTOM_CSS_DARK_THEME_CLASS} .cm-content .tok-inserted {
    color: #98c379 !important;
}

#${CUSTOM_CSS_CODEMIRROR_EDITOR_ID}.${CUSTOM_CSS_DARK_THEME_CLASS} .cm-content .tok-link {
    color: #7d8799 !important;
}

#${CUSTOM_CSS_CODEMIRROR_EDITOR_ID}.${CUSTOM_CSS_DARK_THEME_CLASS} .cm-content .tok-heading {
    color: #e06c75 !important;
    font-weight: bold !important;
}

#${CUSTOM_CSS_CODEMIRROR_EDITOR_ID}.${CUSTOM_CSS_DARK_THEME_CLASS} .cm-content .tok-punctuation {
    color: #c678dd !important;
    font-weight: 600 !important;
}

#${CUSTOM_CSS_CODEMIRROR_EDITOR_ID}.${CUSTOM_CSS_DARK_THEME_CLASS} .cm-content .tok-invalid {
    color: #ffffff !important;
}

.${CUSTOM_CSS_SOURCE_HIDDEN_CLASS} {
    display: none !important;
}
`;
}

function removeCustomCssCodeMirrorEditorStyle() {
    document.getElementById(CUSTOM_CSS_CODEMIRROR_EDITOR_STYLE_ID)?.remove();
}

export {
    applyCustomCssCodeMirrorEditorStyle,
    applyCustomCssInputOptimization,
    applyCustomCssStyleText,
    areCustomCssCodeMirrorMutationsInternal,
    attachCustomCssCodeMirrorEditor,
    bindCustomCssCodeMirrorEditorMutationObserver,
    blendColors,
    clearCustomCssCompositionEndTimer,
    clearCustomCssRestoreSyncTimers,
    commitCustomCssInputValue,
    createCustomCssCodeMirrorView,
    detachCustomCssCodeMirrorEditor,
    detectCustomCssCodeMirrorColorScheme,
    flushCurrentCustomCssInput,
    flushCustomCssApply,
    flushCustomCssCodeMirrorEditor,
    getCleanCustomCssCodeMirrorExternalMismatch,
    getCustomCssCodeMirrorEditorState,
    getCustomCssCodeMirrorListenerTargets,
    getCustomCssCodeMirrorMutationTargets,
    getCustomCssCodeMirrorScroller,
    getCustomCssCodeMirrorSource,
    getCustomCssCodeMirrorValue,
    getCustomCssHighlightExtension,
    getCustomCssInputFromEvent,
    getCustomCssOriginalInput,
    getElementBlendedBackgroundColor,
    getRelativeColorLuminance,
    installCustomCssCodeMirrorEditorGlobalListeners,
    installCustomCssCodeMirrorEditorMutationObserver,
    installCustomCssCodeMirrorEditorOptimization,
    installCustomCssInputOptimization,
    installCustomCssShadowPropertyOnInput,
    installCustomCssShadowPropertyOptimization,
    isCustomCssCodeMirrorMaximizedSource,
    isCustomCssCodeMirrorRelevantMutationNode,
    isCustomCssPageRestoreEvent,
    parseCssRgbColor,
    refreshCustomCssCodeMirrorEditorTarget,
    removeCustomCssCodeMirrorEditorOptimization,
    removeCustomCssCodeMirrorEditorStyle,
    removeCustomCssInputOptimization,
    removeCustomCssShadowPropertyOptimization,
    restoreCustomCssShadowPropertyInput,
    scheduleCustomCssCodeMirrorEditorRefresh,
    scheduleCustomCssStateRestoreSync,
    scrollCustomCssCodeMirrorForNativeToolbar,
    selectCustomCssCodeMirrorNativeSearchResult,
    selectCustomCssCodeMirrorNativeSearchResultAfterThemeEditor,
    shouldCustomCssCodeMirrorRefreshForMutations,
    syncCustomCssCodeMirrorFromExternalSource,
    syncCustomCssCodeMirrorFromSource,
    syncCustomCssCodeMirrorFromSourceIfClean,
    syncCustomCssCodeMirrorThemeEditorHeight,
    syncCustomCssCodeMirrorToSource,
    syncCustomCssCodeMirrorToSourceForExternalRead,
    syncCustomCssShadowPropertyTarget,
    syncCustomCssStateFromSettings,
    updateCustomCssCodeMirrorColorScheme,
    updateCustomCssCodeMirrorSourceClasses,
};
