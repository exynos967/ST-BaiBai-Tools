import { DESCRIPTION_CODEMIRROR_BLUR_SAVE_DELAY_MS, DESCRIPTION_CODEMIRROR_EDITOR_CLASS, DESCRIPTION_CODEMIRROR_EDITOR_ID, DESCRIPTION_CODEMIRROR_EDITOR_KEY, DESCRIPTION_CODEMIRROR_EDITOR_STYLE_ID, DESCRIPTION_CODEMIRROR_HISTORY_MAX_LENGTH, DESCRIPTION_CODEMIRROR_MODULES_KEY, DESCRIPTION_EDITOR_SOURCE_HIDDEN_CLASS, DESCRIPTION_EDITOR_SOURCE_SELECTOR, LOG_PREFIX } from './constants.js';
import { isExistingCharacterEditForm } from './miscPatches.js';
import { extensionState, saveExtensionSettings, settings } from './state.js';

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

function applyDescriptionCodeMirrorEditorOptimization() {
    if (settings.descriptionCodeMirrorEditorEnabled) {
        installDescriptionCodeMirrorEditorOptimization();
    } else {
        removeDescriptionCodeMirrorEditorOptimization();
    }
}

function installDescriptionCodeMirrorEditorOptimization() {
    const state = getDescriptionCodeMirrorEditorState();
    state.enabled = true;

    applyDescriptionCodeMirrorEditorStyle();
    installDescriptionCodeMirrorEditorGlobalListeners(state);
    refreshDescriptionCodeMirrorEditorTarget(state);
    installDescriptionCodeMirrorEditorMutationObserver(state);
}

function removeDescriptionCodeMirrorEditorOptimization() {
    const state = extensionState[DESCRIPTION_CODEMIRROR_EDITOR_KEY];

    if (!state) {
        return;
    }

    flushDescriptionCodeMirrorEditor('disable', { dispatchInput: false, save: false });
    state.enabled = false;
    clearDescriptionCodeMirrorEditorTimer(state);

    if (state.refreshFrame) {
        cancelAnimationFrame(state.refreshFrame);
        state.refreshFrame = 0;
    }

    state.mutationObserver?.disconnect();
    state.mutationObserver = null;
    detachDescriptionCodeMirrorEditor(state);

    for (const listener of state.globalListeners || []) {
        listener.target.removeEventListener(listener.type, listener.handler, listener.options);
    }

    state.globalListeners = [];
    removeDescriptionCodeMirrorEditorStyle();
    delete extensionState[DESCRIPTION_CODEMIRROR_EDITOR_KEY];
}

function getDescriptionCodeMirrorEditorState() {
    if (!extensionState[DESCRIPTION_CODEMIRROR_EDITOR_KEY]) {
        extensionState[DESCRIPTION_CODEMIRROR_EDITOR_KEY] = {
            enabled: false,
            source: null,
            wrapper: null,
            view: null,
            listeners: [],
            globalListeners: [],
            mutationObserver: null,
            mutationObserverTargets: [],
            refreshFrame: 0,
            timer: 0,
            dirty: false,
            flushing: false,
            loadingToken: null,
        };
    }

    return extensionState[DESCRIPTION_CODEMIRROR_EDITOR_KEY];
}

function installDescriptionCodeMirrorEditorGlobalListeners(state) {
    if (state.globalListeners.length > 0) {
        return;
    }

    const clickHandler = (event) => {
        if (event.target instanceof Element && event.target.closest('#create_button')) {
            flushDescriptionCodeMirrorEditor('manual save click', { dispatchInput: false, save: false });
        }
    };
    const submitHandler = (event) => {
        if (event.target instanceof HTMLFormElement && event.target.matches('#form_create')) {
            flushDescriptionCodeMirrorEditor('form submit', { dispatchInput: false, save: false });
        }
    };
    const pageLifecycleHandler = () => {
        flushDescriptionCodeMirrorEditor('page lifecycle', { dispatchInput: false, save: false });
    };
    const addListener = (target, type, handler, options) => {
        if (!(target instanceof EventTarget) || target === document) {
            return;
        }

        target.addEventListener(type, handler, options);
        state.globalListeners.push({ target, type, handler, options });
    };

    for (const target of getDescriptionCodeMirrorListenerTargets()) {
        addListener(target, 'click', clickHandler, true);
        addListener(target, 'submit', submitHandler, true);
    }

    addListener(window, 'pagehide', pageLifecycleHandler);
}

function installDescriptionCodeMirrorEditorMutationObserver(state) {
    if (typeof MutationObserver !== 'function') {
        return;
    }

    if (!state.mutationObserver) {
        state.mutationObserver = new MutationObserver((mutations) => {
            if (areDescriptionCodeMirrorMutationsInternal(state, mutations)) {
                return;
            }

            scheduleDescriptionCodeMirrorEditorRefresh(state);
        });
    }

    bindDescriptionCodeMirrorEditorMutationObserver(state);
}

function getDescriptionCodeMirrorListenerTargets() {
    const targets = new Set();
    const add = target => {
        if (target instanceof HTMLElement && target.isConnected) {
            targets.add(target);
        }
    };
    const source = document.querySelector(DESCRIPTION_EDITOR_SOURCE_SELECTOR);

    add(document.querySelector('#form_create'));
    add(source?.closest('form'));
    add(source?.parentElement);
    return [...targets];
}

function bindDescriptionCodeMirrorEditorMutationObserver(state) {
    if (!state?.mutationObserver) {
        return;
    }

    const targets = getDescriptionCodeMirrorMutationTargets(state);
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

function getDescriptionCodeMirrorMutationTargets(state) {
    const targetMap = new Map();
    const hostOptions = {
        attributes: true,
        attributeFilter: ['class', 'style', 'hidden', 'disabled'],
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
    };
    const source = document.querySelector(DESCRIPTION_EDITOR_SOURCE_SELECTOR);

    addLocalRootsForElement(source);
    addLocalRootsForElement(state.source);
    addLocalRootsForElement(state.wrapper);
    addTarget(document.querySelector('#form_create'), 'host', hostOptions);
    return [...targetMap.values()];
}

function areDescriptionCodeMirrorMutationsInternal(state, mutations) {
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

function scheduleDescriptionCodeMirrorEditorRefresh(state = extensionState[DESCRIPTION_CODEMIRROR_EDITOR_KEY]) {
    if (!state?.enabled || state.refreshFrame) {
        return;
    }

    state.refreshFrame = requestAnimationFrame(() => {
        state.refreshFrame = 0;
        refreshDescriptionCodeMirrorEditorTarget(state);
    });
}

function refreshDescriptionCodeMirrorEditorTarget(state) {
    if (!state?.enabled) {
        return;
    }

    const source = document.querySelector(DESCRIPTION_EDITOR_SOURCE_SELECTOR);

    if (!(source instanceof HTMLTextAreaElement) || !source.isConnected) {
        detachDescriptionCodeMirrorEditor(state);
        bindDescriptionCodeMirrorEditorMutationObserver(state);
        return;
    }

    if (state.source === source && state.wrapper?.isConnected) {
        bindDescriptionCodeMirrorEditorMutationObserver(state);
        syncDescriptionCodeMirrorFromSourceIfClean(state);
        return;
    }

    detachDescriptionCodeMirrorEditor(state);
    attachDescriptionCodeMirrorEditor(state, source);
    bindDescriptionCodeMirrorEditorMutationObserver(state);
}

function attachDescriptionCodeMirrorEditor(state, source) {
    const wrapper = document.createElement('div');

    wrapper.id = DESCRIPTION_CODEMIRROR_EDITOR_ID;
    wrapper.className = DESCRIPTION_CODEMIRROR_EDITOR_CLASS;
    wrapper.textContent = 'Loading CodeMirror...';
    source.classList.add(DESCRIPTION_EDITOR_SOURCE_HIDDEN_CLASS);
    source.insertAdjacentElement('afterend', wrapper);

    state.source = source;
    state.wrapper = wrapper;
    state.dirty = false;

    const focusOutHandler = () => {
        setTimeout(() => {
            if (state.dirty && state.wrapper && !state.wrapper.contains(document.activeElement)) {
                scheduleDescriptionCodeMirrorEditorFlush(state, 'blur', DESCRIPTION_CODEMIRROR_BLUR_SAVE_DELAY_MS);
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

            createDescriptionCodeMirrorView(state, source, wrapper, modules);
        })
        .catch((error) => {
            console.warn(`${LOG_PREFIX} CodeMirror description editor failed; falling back to stock textarea.`, error);

            if (state.enabled && state.source === source && state.wrapper === wrapper && state.loadingToken === loadingToken) {
                settings.descriptionCodeMirrorEditorEnabled = false;
                saveExtensionSettings();
                $('#bai_bai_toolkit_description_codemirror_editor_enabled').prop('checked', false);
                removeDescriptionCodeMirrorEditorOptimization();
            }
        });
}

async function loadDescriptionCodeMirrorModules() {
    if (extensionState[DESCRIPTION_CODEMIRROR_MODULES_KEY]) {
        return extensionState[DESCRIPTION_CODEMIRROR_MODULES_KEY];
    }

    const [stateModule, viewModule, commandsModule, cssModule, languageModule, highlightModule, oneDarkModule] = await Promise.all([
        import('@codemirror/state'),
        import('@codemirror/view'),
        import('@codemirror/commands'),
        import('@codemirror/lang-css').catch(() => ({})),
        import('@codemirror/language').catch(() => ({})),
        import('@lezer/highlight').catch(() => ({})),
        import('@codemirror/theme-one-dark').catch(() => ({})),
    ]);

    const modules = {
        EditorState: stateModule.EditorState,
        EditorView: viewModule.EditorView,
        keymap: viewModule.keymap,
        defaultKeymap: commandsModule.defaultKeymap,
        history: commandsModule.history,
        historyKeymap: commandsModule.historyKeymap,
        css: cssModule.css,
        defaultHighlightStyle: languageModule.defaultHighlightStyle,
        HighlightStyle: languageModule.HighlightStyle,
        syntaxHighlighting: languageModule.syntaxHighlighting,
        classHighlighter: highlightModule.classHighlighter,
        tags: highlightModule.tags,
        oneDarkHighlightStyle: oneDarkModule.oneDarkHighlightStyle,
        oneDarkTheme: oneDarkModule.oneDarkTheme,
        oneDarkColor: oneDarkModule.color,
    };

    if (!modules.EditorState || !modules.EditorView) {
        throw new Error('CodeMirror modules did not expose EditorState/EditorView');
    }

    extensionState[DESCRIPTION_CODEMIRROR_MODULES_KEY] = modules;
    return modules;
}

function createDescriptionCodeMirrorView(state, source, wrapper, modules) {
    const {
        EditorState,
        EditorView,
        keymap,
        defaultKeymap = [],
        history,
        historyKeymap = [],
    } = modules;
    const useHistory = source.value.length <= DESCRIPTION_CODEMIRROR_HISTORY_MAX_LENGTH;

    const extensions = [
        EditorView.lineWrapping,
        EditorView.updateListener.of((update) => {
            if (update.docChanged) {
                state.dirty = true;
            }
        }),
        EditorView.theme({
            '&': {
                backgroundColor: 'var(--SmartThemeBlurTintColor)',
                border: '1px solid var(--SmartThemeBorderColor)',
                borderRadius: '4px',
                contain: 'layout paint style',
                color: 'var(--SmartThemeBodyColor)',
                font: 'inherit',
                minHeight: 'min(42vh, 420px)',
                textShadow: 'none',
            },
            '&.cm-focused': {
                outline: 'none',
            },
            '.cm-scroller': {
                fontFamily: 'inherit',
                lineHeight: '1.35',
                maxHeight: '55vh',
                minHeight: 'min(42vh, 420px)',
                overflow: 'auto',
                overflowAnchor: 'none',
                overscrollBehavior: 'auto',
                touchAction: 'pan-y',
                WebkitOverflowScrolling: 'touch',
            },
            '.cm-content': {
                caretColor: 'var(--SmartThemeBodyColor)',
                contain: 'layout paint style',
                padding: '8px',
                textShadow: 'none',
                minHeight: 'min(42vh, 420px)',
            },
            '.cm-line': {
                padding: '0',
            },
        }),
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
            'aria-label': source.getAttribute('aria-label') || '角色描述',
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

function detachDescriptionCodeMirrorEditor(state) {
    if (!state.source && !state.wrapper && !state.view) {
        return;
    }

    clearDescriptionCodeMirrorEditorTimer(state);

    for (const listener of state.listeners || []) {
        listener.target.removeEventListener(listener.type, listener.handler, listener.options);
    }

    state.listeners = [];
    state.view?.destroy?.();
    state.source?.classList.remove(DESCRIPTION_EDITOR_SOURCE_HIDDEN_CLASS);
    state.wrapper?.remove();
    state.source = null;
    state.wrapper = null;
    state.view = null;
    state.dirty = false;
    state.loadingToken = null;
}

function getDescriptionCodeMirrorValue(state) {
    return state.view?.state?.doc?.toString?.() ?? '';
}

function syncDescriptionCodeMirrorToSourceSilently(state) {
    if (!(state.source instanceof HTMLTextAreaElement) || !state.view) {
        return false;
    }

    const value = getDescriptionCodeMirrorValue(state);
    const changed = state.source.value !== value;

    if (changed) {
        state.source.value = value;
    }

    return changed;
}

function syncDescriptionCodeMirrorFromSourceIfClean(state) {
    if (state.dirty || !(state.source instanceof HTMLTextAreaElement) || !state.view) {
        return;
    }

    const value = state.source.value || '';
    const current = getDescriptionCodeMirrorValue(state);

    if (current !== value) {
        state.view.dispatch({
            changes: {
                from: 0,
                to: state.view.state.doc.length,
                insert: value,
            },
        });
        state.dirty = false;
    }
}

function scheduleDescriptionCodeMirrorEditorFlush(state, reason, delayMs) {
    if (!state?.enabled || state.flushing) {
        return;
    }

    clearDescriptionCodeMirrorEditorTimer(state);
    state.timer = setTimeout(() => {
        state.timer = 0;
        flushDescriptionCodeMirrorEditor(`deferred ${reason}`, { dispatchInput: true, save: true });
    }, delayMs);
}

function clearDescriptionCodeMirrorEditorTimer(state) {
    if (state?.timer) {
        clearTimeout(state.timer);
        state.timer = 0;
    }
}

function flushDescriptionCodeMirrorEditor(reason, { dispatchInput = true, save = true } = {}) {
    const state = extensionState[DESCRIPTION_CODEMIRROR_EDITOR_KEY];

    if (!state?.enabled || state.flushing || !(state.source instanceof HTMLTextAreaElement) || !state.view) {
        return false;
    }

    clearDescriptionCodeMirrorEditorTimer(state);
    state.flushing = true;

    try {
        const changed = syncDescriptionCodeMirrorToSourceSilently(state) || state.dirty;
        state.dirty = false;

        if (changed && dispatchInput) {
            dispatchDescriptionEditorSourceInput(state.source);
        }

        if (changed && save && isExistingCharacterEditForm()) {
            document.querySelector('#create_button')?.click();
            console.debug(`${LOG_PREFIX} CodeMirror description editor flushed after ${reason}`);
        }

        return changed;
    } finally {
        state.flushing = false;
    }
}

function applyDescriptionCodeMirrorEditorStyle() {
    let style = document.getElementById(DESCRIPTION_CODEMIRROR_EDITOR_STYLE_ID);

    if (!style) {
        style = document.createElement('style');
        style.id = DESCRIPTION_CODEMIRROR_EDITOR_STYLE_ID;
        document.head.append(style);
    }

    style.textContent = `
#${DESCRIPTION_CODEMIRROR_EDITOR_ID} {
    box-sizing: border-box;
    display: block;
    width: 100%;
}

.${DESCRIPTION_EDITOR_SOURCE_HIDDEN_CLASS} {
    display: none !important;
}
`;
}

function removeDescriptionCodeMirrorEditorStyle() {
    document.getElementById(DESCRIPTION_CODEMIRROR_EDITOR_STYLE_ID)?.remove();
}

export {
    applyDescriptionCodeMirrorEditorOptimization,
    applyDescriptionCodeMirrorEditorStyle,
    areDescriptionCodeMirrorMutationsInternal,
    attachDescriptionCodeMirrorEditor,
    bindDescriptionCodeMirrorEditorMutationObserver,
    clearDescriptionCodeMirrorEditorTimer,
    createDescriptionCodeMirrorView,
    detachDescriptionCodeMirrorEditor,
    dispatchDescriptionEditorSourceInput,
    flushDescriptionCodeMirrorEditor,
    getDescriptionCodeMirrorEditorState,
    getDescriptionCodeMirrorListenerTargets,
    getDescriptionCodeMirrorMutationTargets,
    getDescriptionCodeMirrorValue,
    installDescriptionCodeMirrorEditorGlobalListeners,
    installDescriptionCodeMirrorEditorMutationObserver,
    installDescriptionCodeMirrorEditorOptimization,
    loadDescriptionCodeMirrorModules,
    refreshDescriptionCodeMirrorEditorTarget,
    removeDescriptionCodeMirrorEditorOptimization,
    removeDescriptionCodeMirrorEditorStyle,
    scheduleDescriptionCodeMirrorEditorFlush,
    scheduleDescriptionCodeMirrorEditorRefresh,
    syncDescriptionCodeMirrorFromSourceIfClean,
    syncDescriptionCodeMirrorToSourceSilently,
};
