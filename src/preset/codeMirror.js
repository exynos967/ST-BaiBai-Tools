import { OPENAI_SETTINGS_SELECTOR, PRESET_PROMPT_CODEMIRROR_EDITOR_CLASS, PRESET_PROMPT_CODEMIRROR_EDITOR_ID, PRESET_PROMPT_CODEMIRROR_EDITOR_KEY, PRESET_PROMPT_CODEMIRROR_EDITOR_STYLE_ID, PRESET_PROMPT_CODEMIRROR_MAXIMIZED_CLASS, PRESET_PROMPT_CODEMIRROR_READONLY_CLASS, PRESET_PROMPT_EDITOR_SOURCE_ID, PRESET_PROMPT_EDITOR_SOURCE_SELECTOR, PRESET_PROMPT_MANAGER_CLOSE_SELECTOR, PRESET_PROMPT_MANAGER_LIST_SELECTOR, PRESET_PROMPT_MANAGER_RESET_SELECTOR, PRESET_PROMPT_MANAGER_SAVE_SELECTOR, PRESET_PROMPT_MAXIMIZED_SOURCE_SELECTOR, PRESET_PROMPT_SOURCE_HIDDEN_CLASS } from './constants.js';
import { LOG_PREFIX, codeMirrorHistoryMaxLength, extensionState, loadCodeMirrorModules, savePresetOptimizationSettings, settings } from './state.js';

function loadPresetCodeMirrorModules() {
    if (typeof loadCodeMirrorModules !== 'function') {
        return Promise.reject(new Error('CodeMirror module loader is not configured'));
    }

    return loadCodeMirrorModules();
}

function getPresetCodeMirrorHistoryMaxLength() {
    return Number(codeMirrorHistoryMaxLength) || 12000;
}

function dispatchDescriptionEditorSourceInput(source) {
    let event = null;

    try {
        event = typeof InputEvent === 'function'
            ? new InputEvent('input', {
                bubbles: true,
                inputType: 'insertReplacementText',
                data: '',
            })
            : null;
    } catch {
        event = null;
    }

    event ||= new Event('input', { bubbles: true });

    source.dispatchEvent(event);
}

function applyPresetPromptCodeMirrorEditorOptimization() {
    if (settings.presetPromptCodeMirrorEditorEnabled) {
        installPresetPromptCodeMirrorEditorOptimization();
    } else {
        removePresetPromptCodeMirrorEditorOptimization();
    }
}

function installPresetPromptCodeMirrorEditorOptimization() {
    const state = getPresetPromptCodeMirrorEditorState();
    state.enabled = true;

    applyPresetPromptCodeMirrorEditorStyle();
    installPresetPromptCodeMirrorEditorGlobalListeners(state);
    refreshPresetPromptCodeMirrorEditorTarget(state);
    installPresetPromptCodeMirrorEditorMutationObserver(state);
}

function removePresetPromptCodeMirrorEditorOptimization() {
    const state = extensionState[PRESET_PROMPT_CODEMIRROR_EDITOR_KEY];

    if (!state) {
        return;
    }

    flushPresetPromptCodeMirrorEditor('disable');
    state.enabled = false;

    if (state.refreshFrame) {
        cancelAnimationFrame(state.refreshFrame);
        state.refreshFrame = 0;
    }

    state.mutationObserver?.disconnect();
    state.mutationObserver = null;
    detachPresetPromptCodeMirrorEditor(state);

    for (const listener of state.globalListeners || []) {
        listener.target.removeEventListener(listener.type, listener.handler, listener.options);
    }

    state.globalListeners = [];
    removePresetPromptCodeMirrorEditorStyle();
    delete extensionState[PRESET_PROMPT_CODEMIRROR_EDITOR_KEY];
}

function getPresetPromptCodeMirrorEditorState() {
    if (!extensionState[PRESET_PROMPT_CODEMIRROR_EDITOR_KEY]) {
        extensionState[PRESET_PROMPT_CODEMIRROR_EDITOR_KEY] = {
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
            sourceValue: '',
            disabled: false,
            forceSyncFromSource: false,
        };
    }

    return extensionState[PRESET_PROMPT_CODEMIRROR_EDITOR_KEY];
}

function installPresetPromptCodeMirrorEditorGlobalListeners(state) {
    if (state.globalListeners.length > 0) {
        return;
    }

    const clickHandler = (event) => {
        const target = event.target instanceof Element ? event.target : null;

        if (!target) {
            return;
        }

        if (target.closest(PRESET_PROMPT_MANAGER_SAVE_SELECTOR)) {
            flushPresetPromptCodeMirrorEditor('save click');
        }

        if (target.closest(`.editor_maximize[data-for="${PRESET_PROMPT_EDITOR_SOURCE_ID}"]`)) {
            flushPresetPromptCodeMirrorEditor('maximize click');
            schedulePresetPromptCodeMirrorEditorRefresh(state, { forceFromSource: true });
        }

        if (
            target.closest(PRESET_PROMPT_MANAGER_RESET_SELECTOR)
            || target.closest(PRESET_PROMPT_MANAGER_CLOSE_SELECTOR)
            || target.closest(`${PRESET_PROMPT_MANAGER_LIST_SELECTOR} [data-preset-prompt-action], ${PRESET_PROMPT_MANAGER_LIST_SELECTOR} .prompt-manager-edit-action, ${PRESET_PROMPT_MANAGER_LIST_SELECTOR} .prompt-manager-inspect-action, ${PRESET_PROMPT_MANAGER_LIST_SELECTOR} .prompt-manager-detach-action`)
            || target.closest('#completion_prompt_manager .completion_prompt_manager_footer .menu_button')
        ) {
            schedulePresetPromptCodeMirrorEditorRefresh(state, { forceFromSource: true });
        }
    };
    const blurHandler = (event) => {
        const target = event.target instanceof HTMLTextAreaElement ? event.target : null;

        if (target?.id?.endsWith('_prompt_quick_edit_textarea')) {
            schedulePresetPromptCodeMirrorEditorRefresh(state, { forceFromSource: true });
        }
    };
    const pageLifecycleHandler = () => {
        flushPresetPromptCodeMirrorEditor('page lifecycle');
    };
    const addListener = (target, type, handler, options) => {
        if (!(target instanceof EventTarget) || target === document) {
            return;
        }

        target.addEventListener(type, handler, options);
        state.globalListeners.push({ target, type, handler, options });
    };

    for (const target of getPresetPromptCodeMirrorListenerTargets()) {
        addListener(target, 'click', clickHandler, true);
        addListener(target, 'blur', blurHandler, true);
    }

    addListener(window, 'pagehide', pageLifecycleHandler);
}

function installPresetPromptCodeMirrorEditorMutationObserver(state) {
    if (typeof MutationObserver !== 'function') {
        return;
    }

    if (!state.mutationObserver) {
        state.mutationObserver = new MutationObserver((mutations) => {
            if (
                arePresetPromptCodeMirrorMutationsInternal(state, mutations)
                || arePresetPromptCodeMirrorMutationsPresetListOnly(state, mutations)
            ) {
                return;
            }

            schedulePresetPromptCodeMirrorEditorRefresh(state);
        });
    }

    bindPresetPromptCodeMirrorEditorMutationObserver(state);
}

function getPresetPromptCodeMirrorListenerTargets() {
    const targets = new Set();
    const add = target => {
        if (target instanceof HTMLElement && target.isConnected) {
            targets.add(target);
        }
    };
    const source = getPresetPromptCodeMirrorSource();

    add(document.querySelector('#completion_prompt_manager'));
    add(document.querySelector(OPENAI_SETTINGS_SELECTOR));
    add(source?.closest('form'));
    add(source?.closest('dialog.popup, .popup, #completion_prompt_manager'));
    add(source?.parentElement);
    return [...targets];
}

function bindPresetPromptCodeMirrorEditorMutationObserver(state) {
    if (!state?.mutationObserver) {
        return;
    }

    const targets = getPresetPromptCodeMirrorMutationTargets(state);
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

function getPresetPromptCodeMirrorMutationTargets(state) {
    const targetMap = new Map();
    const hostOptions = {
        attributes: true,
        attributeFilter: ['class', 'style', 'hidden', 'data-for', 'disabled'],
        childList: true,
        subtree: true,
    };
    const parentOptions = {
        childList: true,
        subtree: false,
    };
    const addTarget = (target, optionsKey, options) => {
        if (!(target instanceof Node) || !target.isConnected || target === document) {
            return;
        }

        const existing = targetMap.get(target);

        if (!existing || existing.optionsKey === 'parent') {
            targetMap.set(target, { target, optionsKey, options });
        }
    };
    const addLocalRootsForElement = element => {
        if (!(element instanceof HTMLElement)) {
            return;
        }

        addTarget(element.parentElement, 'host', hostOptions);
        addTarget(element.parentElement?.parentElement, 'parent', parentOptions);
        addTarget(element.closest('form'), 'host', hostOptions);
        addTarget(element.closest('dialog.popup, .popup'), 'host', hostOptions);
    };
    const source = getPresetPromptCodeMirrorSource();
    const managerRoot = document.querySelector('#completion_prompt_manager');

    addLocalRootsForElement(source);
    addLocalRootsForElement(state.source);
    addLocalRootsForElement(state.wrapper);

    if (managerRoot instanceof HTMLElement) {
        addTarget(managerRoot, 'host', hostOptions);
    }

    return [...targetMap.values()];
}

function arePresetPromptCodeMirrorMutationsInternal(state, mutations) {
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

function arePresetPromptCodeMirrorMutationsPresetListOnly(state, mutations) {
    if (!mutations?.length) {
        return false;
    }

    const isEditorNode = node => {
        if (!(node instanceof Node)) {
            return false;
        }

        const source = state.source;
        const wrapper = state.wrapper;

        return (
            source instanceof Node
            && (node === source || node.contains?.(source) || source.contains?.(node))
        ) || (
            wrapper instanceof Node
            && (node === wrapper || node.contains?.(wrapper) || wrapper.contains?.(node))
        );
    };
    const isPresetListNode = node => {
        if (!(node instanceof Node)) {
            return false;
        }

        const element = node instanceof Element ? node : node.parentElement;

        return Boolean(element?.closest?.(`${PRESET_PROMPT_MANAGER_LIST_SELECTOR}, .bai-bai-preset-global-library`));
    };

    return Array.from(mutations).every(mutation => {
        const nodes = [
            mutation.target,
            ...Array.from(mutation.addedNodes ?? []),
            ...Array.from(mutation.removedNodes ?? []),
        ].filter(node => node instanceof Node);

        return nodes.length > 0
            && nodes.every(node => !isEditorNode(node) && isPresetListNode(node));
    });
}

function schedulePresetPromptCodeMirrorEditorRefresh(state = extensionState[PRESET_PROMPT_CODEMIRROR_EDITOR_KEY], { forceFromSource = false } = {}) {
    if (!state?.enabled) {
        return;
    }

    if (forceFromSource) {
        state.forceSyncFromSource = true;
    }

    if (state.refreshFrame) {
        return;
    }

    state.refreshFrame = requestAnimationFrame(() => {
        state.refreshFrame = 0;
        refreshPresetPromptCodeMirrorEditorTarget(state);
    });
}

function refreshPresetPromptCodeMirrorEditorTarget(state) {
    if (!state?.enabled) {
        return;
    }

    const source = getPresetPromptCodeMirrorSource();

    if (!(source instanceof HTMLTextAreaElement) || !source.isConnected) {
        detachPresetPromptCodeMirrorEditor(state);
        bindPresetPromptCodeMirrorEditorMutationObserver(state);
        return;
    }

    if (state.source === source && state.wrapper?.isConnected) {
        const disabled = isPresetPromptCodeMirrorSourceDisabled(source);

        if (state.disabled !== disabled) {
            detachPresetPromptCodeMirrorEditor(state);
            attachPresetPromptCodeMirrorEditor(state, source);
            return;
        }

        updatePresetPromptCodeMirrorSourceClasses(state, source, state.wrapper);
        bindPresetPromptCodeMirrorEditorMutationObserver(state);

        if (state.forceSyncFromSource) {
            state.forceSyncFromSource = false;
            syncPresetPromptCodeMirrorFromSource(state, { force: true });
            return;
        }

        syncPresetPromptCodeMirrorFromSourceIfClean(state);
        return;
    }

    detachPresetPromptCodeMirrorEditor(state);
    attachPresetPromptCodeMirrorEditor(state, source);
    bindPresetPromptCodeMirrorEditorMutationObserver(state);
}

function getPresetPromptCodeMirrorSource() {
    const maximizedSource = document.querySelector(PRESET_PROMPT_MAXIMIZED_SOURCE_SELECTOR);

    if (maximizedSource instanceof HTMLTextAreaElement && maximizedSource.isConnected) {
        return maximizedSource;
    }

    return document.querySelector(PRESET_PROMPT_EDITOR_SOURCE_SELECTOR);
}

function attachPresetPromptCodeMirrorEditor(state, source) {
    const wrapper = document.createElement('div');

    wrapper.id = PRESET_PROMPT_CODEMIRROR_EDITOR_ID;
    wrapper.className = PRESET_PROMPT_CODEMIRROR_EDITOR_CLASS;
    wrapper.textContent = 'Loading CodeMirror...';
    updatePresetPromptCodeMirrorSourceClasses(state, source, wrapper);
    source.classList.add(PRESET_PROMPT_SOURCE_HIDDEN_CLASS);
    source.insertAdjacentElement('afterend', wrapper);

    state.source = source;
    state.wrapper = wrapper;
    state.dirty = false;
    state.sourceValue = source.value || '';
    state.disabled = isPresetPromptCodeMirrorSourceDisabled(source);
    state.forceSyncFromSource = false;

    const focusOutHandler = () => {
        setTimeout(() => {
            if (state.dirty && state.wrapper && !state.wrapper.contains(document.activeElement)) {
                flushPresetPromptCodeMirrorEditor('blur');
            }
        }, 0);
    };
    const sourceInputHandler = () => {
        schedulePresetPromptCodeMirrorEditorRefresh(state, { forceFromSource: true });
    };

    wrapper.addEventListener('focusout', focusOutHandler);
    source.addEventListener('input', sourceInputHandler, true);

    state.listeners.push(
        { target: wrapper, type: 'focusout', handler: focusOutHandler, options: undefined },
        { target: source, type: 'input', handler: sourceInputHandler, options: true },
    );

    const loadingToken = {};
    state.loadingToken = loadingToken;

    void loadPresetCodeMirrorModules()
        .then((modules) => {
            if (!state.enabled || state.source !== source || state.wrapper !== wrapper || state.loadingToken !== loadingToken || !wrapper.isConnected) {
                return;
            }

            createPresetPromptCodeMirrorView(state, source, wrapper, modules);
        })
        .catch((error) => {
            console.warn(`${LOG_PREFIX} CodeMirror preset prompt editor failed; falling back to stock textarea.`, error);

            if (state.enabled && state.source === source && state.wrapper === wrapper && state.loadingToken === loadingToken) {
                settings.presetPromptCodeMirrorEditorEnabled = false;
                if (typeof savePresetOptimizationSettings === 'function') {
                    savePresetOptimizationSettings();
                }
                $('#bai_bai_toolkit_preset_prompt_codemirror_editor_enabled').prop('checked', false);
                removePresetPromptCodeMirrorEditorOptimization();
            }
        });
}

function updatePresetPromptCodeMirrorSourceClasses(state, source, wrapper) {
    const disabled = isPresetPromptCodeMirrorSourceDisabled(source);
    const maximized = isPresetPromptCodeMirrorMaximizedSource(source);

    state.disabled = disabled;
    wrapper.classList.toggle(PRESET_PROMPT_CODEMIRROR_READONLY_CLASS, disabled);
    wrapper.classList.toggle(PRESET_PROMPT_CODEMIRROR_MAXIMIZED_CLASS, maximized);
    wrapper.setAttribute('aria-disabled', String(disabled));
}

function isPresetPromptCodeMirrorSourceDisabled(source) {
    if (!(source instanceof HTMLTextAreaElement)) {
        return false;
    }

    if (source.disabled) {
        return true;
    }

    if (!isPresetPromptCodeMirrorMaximizedSource(source)) {
        return false;
    }

    return document.getElementById(PRESET_PROMPT_EDITOR_SOURCE_ID)?.disabled === true;
}

function isPresetPromptCodeMirrorMaximizedSource(source) {
    return source instanceof HTMLTextAreaElement && source.matches(PRESET_PROMPT_MAXIMIZED_SOURCE_SELECTOR);
}

function createPresetPromptCodeMirrorView(state, source, wrapper, modules) {
    const {
        EditorState,
        EditorView,
        keymap,
        defaultKeymap = [],
        history,
        historyKeymap = [],
    } = modules;
    const useHistory = source.value.length <= getPresetCodeMirrorHistoryMaxLength();
    const disabled = isPresetPromptCodeMirrorSourceDisabled(source);
    const extensions = [
        EditorView.lineWrapping,
        EditorView.updateListener.of((update) => {
            if (!update.docChanged || state.syncingFromSource) {
                return;
            }

            state.dirty = true;
            if (syncPresetPromptCodeMirrorToSource(state) && isPresetPromptCodeMirrorMaximizedSource(state.source)) {
                dispatchDescriptionEditorSourceInput(state.source);
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
                minHeight: 'min(34vh, 360px)',
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
                fontFamily: 'inherit',
                lineHeight: '1.35',
                maxHeight: 'min(44vh, 440px)',
                minHeight: 'min(34vh, 360px)',
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
                minHeight: 'min(34vh, 360px)',
            },
            '.cm-line': {
                padding: '0',
                textAlign: 'left',
            },
        }),
    ];

    if (disabled && EditorState.readOnly?.of) {
        extensions.push(EditorState.readOnly.of(true));
    }

    if (EditorView.editable?.of) {
        extensions.push(EditorView.editable.of(!disabled));
    }

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
            'aria-label': source.getAttribute('aria-label') || 'Preset prompt',
            'aria-readonly': String(disabled),
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
}

function detachPresetPromptCodeMirrorEditor(state) {
    if (!state.source && !state.wrapper && !state.view) {
        return;
    }

    for (const listener of state.listeners || []) {
        listener.target.removeEventListener(listener.type, listener.handler, listener.options);
    }

    state.listeners = [];
    state.view?.destroy?.();
    state.source?.classList.remove(PRESET_PROMPT_SOURCE_HIDDEN_CLASS);
    state.wrapper?.remove();
    state.source = null;
    state.wrapper = null;
    state.view = null;
    state.dirty = false;
    state.syncingFromSource = false;
    state.loadingToken = null;
    state.sourceValue = '';
    state.disabled = false;
    state.forceSyncFromSource = false;
}

function getPresetPromptCodeMirrorValue(state) {
    return state.view?.state?.doc?.toString?.() ?? '';
}

function syncPresetPromptCodeMirrorToSource(state) {
    if (!(state.source instanceof HTMLTextAreaElement) || !state.view) {
        return false;
    }

    const value = getPresetPromptCodeMirrorValue(state);
    const changed = state.source.value !== value;

    if (changed) {
        state.source.value = value;
    }

    state.sourceValue = value;

    return changed;
}

function syncPresetPromptCodeMirrorFromSourceIfClean(state) {
    return syncPresetPromptCodeMirrorFromSource(state, { force: false });
}

function syncPresetPromptCodeMirrorFromSource(state, { force = false } = {}) {
    if ((!force && state.dirty) || !(state.source instanceof HTMLTextAreaElement) || !state.view) {
        return false;
    }

    const value = state.source.value || '';
    const current = getPresetPromptCodeMirrorValue(state);

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
            state.sourceValue = value;
        } finally {
            state.syncingFromSource = false;
        }

        return true;
    }

    state.dirty = false;
    state.sourceValue = value;

    return false;
}

function flushPresetPromptCodeMirrorEditor(reason, { dispatchInput = false } = {}) {
    const state = extensionState[PRESET_PROMPT_CODEMIRROR_EDITOR_KEY];

    if (!state?.enabled || state.flushing || !(state.source instanceof HTMLTextAreaElement) || !state.view) {
        return false;
    }

    state.flushing = true;

    try {
        const changed = syncPresetPromptCodeMirrorToSource(state) || state.dirty;
        state.dirty = false;

        if (changed && dispatchInput) {
            dispatchDescriptionEditorSourceInput(state.source);
        }

        if (changed) {
            console.debug(`${LOG_PREFIX} CodeMirror preset prompt editor flushed after ${reason}`);
        }

        return changed;
    } finally {
        state.flushing = false;
    }
}

function applyPresetPromptCodeMirrorEditorStyle() {
    let style = document.getElementById(PRESET_PROMPT_CODEMIRROR_EDITOR_STYLE_ID);

    if (!style) {
        style = document.createElement('style');
        style.id = PRESET_PROMPT_CODEMIRROR_EDITOR_STYLE_ID;
        document.head.append(style);
    }

    style.textContent = `
#${PRESET_PROMPT_CODEMIRROR_EDITOR_ID} {
    box-sizing: border-box;
    display: block;
    width: 100%;
}

#${PRESET_PROMPT_CODEMIRROR_EDITOR_ID}.${PRESET_PROMPT_CODEMIRROR_READONLY_CLASS} {
    opacity: 0.72;
}

#${PRESET_PROMPT_CODEMIRROR_EDITOR_ID}.${PRESET_PROMPT_CODEMIRROR_MAXIMIZED_CLASS} {
    flex: 1 1 auto;
    height: 100%;
    min-height: 0;
}

#${PRESET_PROMPT_CODEMIRROR_EDITOR_ID}.${PRESET_PROMPT_CODEMIRROR_MAXIMIZED_CLASS} .cm-editor,
#${PRESET_PROMPT_CODEMIRROR_EDITOR_ID}.${PRESET_PROMPT_CODEMIRROR_MAXIMIZED_CLASS} .cm-scroller {
    height: 100%;
    max-height: none !important;
    min-height: 0 !important;
}

#${PRESET_PROMPT_CODEMIRROR_EDITOR_ID},
#${PRESET_PROMPT_CODEMIRROR_EDITOR_ID} .cm-editor,
#${PRESET_PROMPT_CODEMIRROR_EDITOR_ID} .cm-scroller,
#${PRESET_PROMPT_CODEMIRROR_EDITOR_ID} .cm-content,
#${PRESET_PROMPT_CODEMIRROR_EDITOR_ID} .cm-line {
    text-align: left !important;
}

.${PRESET_PROMPT_SOURCE_HIDDEN_CLASS} {
    display: none !important;
}
`;
}

function removePresetPromptCodeMirrorEditorStyle() {
    document.getElementById(PRESET_PROMPT_CODEMIRROR_EDITOR_STYLE_ID)?.remove();
}

export {
    applyPresetPromptCodeMirrorEditorOptimization,
    applyPresetPromptCodeMirrorEditorStyle,
    arePresetPromptCodeMirrorMutationsInternal,
    arePresetPromptCodeMirrorMutationsPresetListOnly,
    attachPresetPromptCodeMirrorEditor,
    bindPresetPromptCodeMirrorEditorMutationObserver,
    createPresetPromptCodeMirrorView,
    detachPresetPromptCodeMirrorEditor,
    dispatchDescriptionEditorSourceInput,
    flushPresetPromptCodeMirrorEditor,
    getPresetCodeMirrorHistoryMaxLength,
    getPresetPromptCodeMirrorEditorState,
    getPresetPromptCodeMirrorListenerTargets,
    getPresetPromptCodeMirrorMutationTargets,
    getPresetPromptCodeMirrorSource,
    getPresetPromptCodeMirrorValue,
    installPresetPromptCodeMirrorEditorGlobalListeners,
    installPresetPromptCodeMirrorEditorMutationObserver,
    installPresetPromptCodeMirrorEditorOptimization,
    isPresetPromptCodeMirrorMaximizedSource,
    isPresetPromptCodeMirrorSourceDisabled,
    loadPresetCodeMirrorModules,
    refreshPresetPromptCodeMirrorEditorTarget,
    removePresetPromptCodeMirrorEditorOptimization,
    removePresetPromptCodeMirrorEditorStyle,
    schedulePresetPromptCodeMirrorEditorRefresh,
    syncPresetPromptCodeMirrorFromSource,
    syncPresetPromptCodeMirrorFromSourceIfClean,
    syncPresetPromptCodeMirrorToSource,
    updatePresetPromptCodeMirrorSourceClasses,
};
