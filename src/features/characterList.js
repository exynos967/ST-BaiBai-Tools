import { event_types, eventSource } from '@sillytavern/script';
import { AVATAR_LAZY_LOAD_APPEND_TARGET_SELECTOR, AVATAR_LAZY_LOAD_NATIVE_APPEND_TARGET_SELECTOR, AVATAR_LAZY_LOAD_RELATIVE_SELECTOR, AVATAR_LAZY_LOAD_SELECTOR, CHARACTER_LIST_AVATAR_LAZY_LOAD_KEY, CHARACTER_LIST_AVATAR_LAZY_LOAD_STYLE_ID, CHARACTER_LIST_LAZY_AVATAR_LOADED_CLASS, CHARACTER_LIST_LAZY_AVATAR_PENDING_CLASS, CHARACTER_LIST_LAZY_AVATAR_PLACEHOLDER_SRC, CHARACTER_LIST_LAZY_AVATAR_ROOT_MARGIN, CHARACTER_LIST_LAZY_AVATAR_SHELL_CLASS, CHARACTER_LIST_LAZY_AVATAR_SRC_DATASET_KEY, CHARACTER_LIST_SELECTOR, CHARACTER_SEARCH_OPTIMIZATION_KEY, LOG_PREFIX, PERSONA_LIST_SELECTOR, WELCOME_RECENT_CHAT_SELECTOR } from './constants.js';
import { extensionState, settings } from './state.js';
import { toKebabCase } from './util.js';

function applyCharacterSearchInputOptimization() {
    const state = extensionState[CHARACTER_SEARCH_OPTIMIZATION_KEY] || {
        installed: false,
        isComposing: false,
        debounceTimer: null,
    };
    extensionState[CHARACTER_SEARCH_OPTIMIZATION_KEY] = state;

    // Retry finding the input if it's not available immediately (e.g. ST not fully initialized)
    const originalInput = document.getElementById('character_search_bar');
    if (!originalInput) {
        if (!state.retryTimer) {
            state.retryTimer = setTimeout(() => {
                state.retryTimer = null;
                applyCharacterSearchInputOptimization();
            }, 1000);
        }
        return;
    }

    if (settings.characterSearchInputOptimizationEnabled) {
        if (!state.installed) {
            installCharacterSearchInputOptimization(state, originalInput);
        }
    } else {
        if (state.installed) {
            removeCharacterSearchInputOptimization(state, originalInput);
        }
    }
}

function installCharacterSearchInputOptimization(state, originalInput) {
    if (state.installed) return;

    state.installed = true;
    state.isComposing = false;
    state.isBypassingSync = false;

    state.compositionStartHandler = (e) => {
        if (e.target === originalInput) {
            state.isComposing = true;
        }
    };

    state.compositionEndHandler = (e) => {
        if (e.target === originalInput) {
            state.isComposing = false;
            triggerCharacterSearch(state, originalInput);
        }
    };

    state.inputCaptureHandler = (e) => {
        if (e.target !== originalInput) return;

        // If we fired this event intentionally, let it pass to ST's handler
        if (state.isBypassingSync) return;

        // If this event was not triggered by user interaction (e.g. ST clears input using val('').trigger('input'))
        // we should let it pass immediately, so other UI logic isn't artificially delayed by 300ms.
        if (!e.isTrusted) return;

        // Otherwise intercept and stop it
        e.stopImmediatePropagation();
        e.stopPropagation();

        if (!state.isComposing) {
            triggerCharacterSearch(state, originalInput);
        }
    };

    // We must use capture: true to intercept the events before ST's jQuery listeners get them
    originalInput.addEventListener('compositionstart', state.compositionStartHandler, true);
    originalInput.addEventListener('compositionend', state.compositionEndHandler, true);
    originalInput.addEventListener('input', state.inputCaptureHandler, true);
}

function triggerCharacterSearch(state, originalInput, timeout = 300) {
    clearTimeout(state.debounceTimer);

    state.debounceTimer = setTimeout(() => {
        if (!state.installed) return;

        // Fire a synthetic input event that our capture handler will let through
        state.isBypassingSync = true;

        if (window.jQuery) {
            window.jQuery(originalInput).trigger('input');
        } else {
            originalInput.dispatchEvent(new Event('input', { bubbles: true }));
        }

        state.isBypassingSync = false;
    }, timeout);
}

function removeCharacterSearchInputOptimization(state, originalInput) {
    if (state.retryTimer) {
        clearTimeout(state.retryTimer);
        state.retryTimer = null;
    }

    if (!state.installed) return;

    originalInput.removeEventListener('compositionstart', state.compositionStartHandler, true);
    originalInput.removeEventListener('compositionend', state.compositionEndHandler, true);
    originalInput.removeEventListener('input', state.inputCaptureHandler, true);

    clearTimeout(state.debounceTimer);

    state.installed = false;
}

function getCharacterListAvatarLazyLoadState() {
    if (!extensionState[CHARACTER_LIST_AVATAR_LAZY_LOAD_KEY] || typeof extensionState[CHARACTER_LIST_AVATAR_LAZY_LOAD_KEY] !== 'object') {
        extensionState[CHARACTER_LIST_AVATAR_LAZY_LOAD_KEY] = {};
    }

    return extensionState[CHARACTER_LIST_AVATAR_LAZY_LOAD_KEY];
}

function applyCharacterListAvatarLazyLoadOptimization() {
    if (settings.characterListAvatarLazyLoadEnabled) {
        installCharacterListAvatarLazyLoadOptimization();
    } else {
        restoreCharacterListAvatarLazyLoadOptimization();
    }
}

function installCharacterListAvatarLazyLoadOptimization() {
    const state = getCharacterListAvatarLazyLoadState();
    state.enabled = true;

    installCharacterListAvatarLazyLoadStyle();

    if (typeof IntersectionObserver !== 'function') {
        applyNativeCharacterListImageHints();
        console.warn(`${LOG_PREFIX} IntersectionObserver is unavailable; character list avatar lazy loading fell back to native image hints`);
        return;
    }

    installCharacterListAvatarIntersectionObserver(state);
    installCharacterListAvatarAppendPatch(state);
    installCharacterListAvatarNativeAppendPatch(state);
    installCharacterListAvatarMutationObserver(state);
    installCharacterListAvatarPageLoadedHandler(state);
    scheduleProcessCharacterListAvatars(state);
}

function restoreCharacterListAvatarLazyLoadOptimization() {
    const state = getCharacterListAvatarLazyLoadState();
    state.enabled = false;

    if (state.processTimer) {
        clearTimeout(state.processTimer);
        state.processTimer = null;
    }

    state.mutationObserver?.disconnect();
    state.mutationObserver = null;
    state.intersectionObserver?.disconnect();
    state.intersectionObserver = null;

    if (state.characterPageLoadedHandler) {
        eventSource.removeListener?.(event_types.CHARACTER_PAGE_LOADED, state.characterPageLoadedHandler);
        state.characterPageLoadedHandler = null;
    }

    restoreCharacterListAvatarAppendPatch(state);
    restoreCharacterListAvatarNativeAppendPatch(state);
    restorePendingCharacterListAvatars();
    removeCharacterListAvatarLazyLoadStyle();
}

function installCharacterListAvatarAppendPatch(state) {
    const originalAppend = globalThis.jQuery?.fn?.append;

    if (typeof originalAppend !== 'function' || state.patchedAppend === originalAppend) {
        return;
    }

    if (state.patchedAppend && globalThis.jQuery.fn.append === state.patchedAppend) {
        return;
    }

    function patchedAppend(...args) {
        if (settings.characterListAvatarLazyLoadEnabled && shouldPrepareCharacterListAppend(this)) {
            prepareCharacterListAvatarAppendArguments(args, state);
        }

        const result = originalAppend.apply(this, args);

        if (settings.characterListAvatarLazyLoadEnabled && shouldPrepareCharacterListAppend(this)) {
            scheduleProcessCharacterListAvatars(state);
        }

        return result;
    }

    patchedAppend.__baiBaiToolkitCharacterListAvatarLazyLoadPatched = true;
    patchedAppend.__baiBaiToolkitOriginalAppend = originalAppend;
    Object.assign(patchedAppend, originalAppend);

    state.originalAppend = originalAppend;
    state.patchedAppend = patchedAppend;
    globalThis.jQuery.fn.append = patchedAppend;
}

function restoreCharacterListAvatarAppendPatch(state) {
    if (!state.patchedAppend || !globalThis.jQuery?.fn) {
        return;
    }

    if (globalThis.jQuery.fn.append === state.patchedAppend && typeof state.originalAppend === 'function') {
        globalThis.jQuery.fn.append = state.originalAppend;
    }

    state.originalAppend = null;
    state.patchedAppend = null;
}

function installCharacterListAvatarNativeAppendPatch(state) {
    const originalAppend = typeof Element !== 'undefined' ? Element.prototype.append : null;

    if (typeof originalAppend !== 'function' || state.patchedNativeAppend === originalAppend) {
        return;
    }

    if (state.patchedNativeAppend && Element.prototype.append === state.patchedNativeAppend) {
        return;
    }

    function patchedNativeAppend(...args) {
        if (settings.characterListAvatarLazyLoadEnabled && shouldPrepareCharacterListNativeAppend(this)) {
            prepareCharacterListAvatarAppendArguments(args, state);
        }

        const result = originalAppend.apply(this, args);

        if (settings.characterListAvatarLazyLoadEnabled && shouldPrepareCharacterListNativeAppend(this)) {
            scheduleProcessCharacterListAvatars(state);
        }

        return result;
    }

    patchedNativeAppend.__baiBaiToolkitCharacterListAvatarLazyLoadPatched = true;
    patchedNativeAppend.__baiBaiToolkitOriginalAppend = originalAppend;

    state.originalNativeAppend = originalAppend;
    state.patchedNativeAppend = patchedNativeAppend;
    Element.prototype.append = patchedNativeAppend;
}

function restoreCharacterListAvatarNativeAppendPatch(state) {
    if (!state.patchedNativeAppend || typeof Element === 'undefined') {
        return;
    }

    if (Element.prototype.append === state.patchedNativeAppend && typeof state.originalNativeAppend === 'function') {
        Element.prototype.append = state.originalNativeAppend;
    }

    state.originalNativeAppend = null;
    state.patchedNativeAppend = null;
}

function shouldPrepareCharacterListAppend(targets) {
    if (!targets || typeof targets.length !== 'number') {
        return false;
    }

    for (const target of targets) {
        if (target instanceof Element && target.matches(AVATAR_LAZY_LOAD_APPEND_TARGET_SELECTOR)) {
            return true;
        }
    }

    return false;
}

function shouldPrepareCharacterListNativeAppend(target) {
    return target instanceof Element && target.matches(AVATAR_LAZY_LOAD_NATIVE_APPEND_TARGET_SELECTOR);
}

function prepareCharacterListAvatarAppendArguments(args, state) {
    for (const arg of args) {
        prepareCharacterListAvatarAppendArgument(arg, state);
    }
}

function prepareCharacterListAvatarAppendArgument(arg, state) {
    if (!arg) {
        return;
    }

    if (arg instanceof Node) {
        deferCharacterListAvatarNode(arg, state, { requireListContainer: false, observe: false });
        return;
    }

    if (arg.jquery && typeof arg.each === 'function') {
        arg.each((_, element) => {
            if (element instanceof Node) {
                deferCharacterListAvatarNode(element, state, { requireListContainer: false, observe: false });
            }
        });
        return;
    }

    if (Array.isArray(arg)) {
        for (const item of arg) {
            prepareCharacterListAvatarAppendArgument(item, state);
        }
    }
}

function installCharacterListAvatarMutationObserver(state) {
    if (state.mutationObserver) {
        return;
    }

    const root = document.body || document.documentElement;

    if (!root) {
        return;
    }

    state.mutationObserver = new MutationObserver((mutations) => {
        if (!settings.characterListAvatarLazyLoadEnabled || !state.enabled) {
            return;
        }

        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                deferCharacterListAvatarNode(node, state);
            }
        }
    });

    state.mutationObserver.observe(root, { childList: true, subtree: true });
}

function installCharacterListAvatarPageLoadedHandler(state) {
    if (state.characterPageLoadedHandler) {
        return;
    }

    state.characterPageLoadedHandler = () => scheduleProcessCharacterListAvatars(state);
    eventSource.on(event_types.CHARACTER_PAGE_LOADED, state.characterPageLoadedHandler);
}

function installCharacterListAvatarIntersectionObserver(state) {
    if (state.intersectionObserver) {
        return;
    }

    state.intersectionObserver = new IntersectionObserver((entries) => {
        for (const entry of entries) {
            if (entry.isIntersecting || entry.intersectionRatio > 0) {
                loadCharacterListAvatar(entry.target, state);
            }
        }
    }, {
        root: null,
        rootMargin: CHARACTER_LIST_LAZY_AVATAR_ROOT_MARGIN,
        threshold: 0,
    });
}

function scheduleProcessCharacterListAvatars(state) {
    // 角色列表渲染期间本函数被逐条 append 高频调用;定时器已挂就直接合并,
    // 避免每条都 clearTimeout+setTimeout 的重排开销。
    if (state.processTimer) {
        return;
    }

    // 主题切换窗口内 class/节点风暴会反复触发本调度;推迟到窗口结束后合并为一次全扫。
    const themeGuard = extensionState.themeApplyReflowGuard;
    const themeWindowRemaining = themeGuard ? themeGuard.windowUntil - Date.now() : 0;
    const delay = themeWindowRemaining > 0 ? themeWindowRemaining : 0;

    state.processTimer = setTimeout(() => {
        state.processTimer = null;
        processCharacterListAvatars(state);
    }, delay);
}

function processCharacterListAvatars(state) {
    if (!settings.characterListAvatarLazyLoadEnabled || !state.enabled) {
        return;
    }

    if (typeof IntersectionObserver !== 'function') {
        applyNativeCharacterListImageHints();
        return;
    }

    if (!state.intersectionObserver) {
        installCharacterListAvatarIntersectionObserver(state);
    }

    document.querySelectorAll(AVATAR_LAZY_LOAD_SELECTOR).forEach(img => {
        deferCharacterListAvatarImage(img, state, { requireListContainer: true, observe: true });
    });
}

function deferCharacterListAvatarNode(node, state, { requireListContainer = true, observe = true } = {}) {
    if (!(node instanceof Element)) {
        return;
    }

    if (node instanceof HTMLImageElement) {
        deferCharacterListAvatarImage(node, state, { requireListContainer, observe });
    }

    const selector = requireListContainer ? AVATAR_LAZY_LOAD_SELECTOR : AVATAR_LAZY_LOAD_RELATIVE_SELECTOR;
    node.querySelectorAll?.(selector).forEach(img => {
        deferCharacterListAvatarImage(img, state, { requireListContainer, observe });
    });
}

function deferCharacterListAvatarImage(img, state, { requireListContainer = true, observe = true } = {}) {
    if (!(img instanceof HTMLImageElement)) {
        return;
    }

    if (requireListContainer && !img.matches(AVATAR_LAZY_LOAD_SELECTOR)) {
        return;
    }

    if (!requireListContainer && !img.matches(AVATAR_LAZY_LOAD_RELATIVE_SELECTOR)) {
        return;
    }

    const pendingSrc = img.dataset[CHARACTER_LIST_LAZY_AVATAR_SRC_DATASET_KEY];

    if (pendingSrc) {
        observeCharacterListAvatar(img, state, observe);
        return;
    }

    const src = img.getAttribute('src') || '';

    if (!isCharacterListAvatarThumbnailUrl(src)) {
        applyCharacterListImageHints(img);
        return;
    }

    img.dataset[CHARACTER_LIST_LAZY_AVATAR_SRC_DATASET_KEY] = src;
    img.setAttribute('src', CHARACTER_LIST_LAZY_AVATAR_PLACEHOLDER_SRC);
    img.classList.add(CHARACTER_LIST_LAZY_AVATAR_PENDING_CLASS);
    img.classList.remove(CHARACTER_LIST_LAZY_AVATAR_LOADED_CLASS);
    img.closest('.avatar')?.classList.add(CHARACTER_LIST_LAZY_AVATAR_SHELL_CLASS);
    applyCharacterListImageHints(img);
    observeCharacterListAvatar(img, state, observe);
}

function observeCharacterListAvatar(img, state, observe) {
    if (!observe || !state?.intersectionObserver || !document.documentElement.contains(img)) {
        return;
    }

    state.intersectionObserver.observe(img);
}

function loadCharacterListAvatar(target, state = getCharacterListAvatarLazyLoadState()) {
    if (!(target instanceof HTMLImageElement)) {
        return;
    }

    const src = target.dataset[CHARACTER_LIST_LAZY_AVATAR_SRC_DATASET_KEY];

    if (!src) {
        state?.intersectionObserver?.unobserve(target);
        return;
    }

    state?.intersectionObserver?.unobserve(target);
    target.dataset[CHARACTER_LIST_LAZY_AVATAR_SRC_DATASET_KEY] = '';
    delete target.dataset[CHARACTER_LIST_LAZY_AVATAR_SRC_DATASET_KEY];
    target.classList.remove(CHARACTER_LIST_LAZY_AVATAR_PENDING_CLASS);
    target.classList.add(CHARACTER_LIST_LAZY_AVATAR_LOADED_CLASS);
    target.closest('.avatar')?.classList.remove(CHARACTER_LIST_LAZY_AVATAR_SHELL_CLASS);
    target.setAttribute('src', src);
    applyCharacterListImageHints(target);
}

function restorePendingCharacterListAvatars() {
    const datasetSelector = `img[data-${toKebabCase(CHARACTER_LIST_LAZY_AVATAR_SRC_DATASET_KEY)}]`;
    document.querySelectorAll(datasetSelector).forEach(img => loadCharacterListAvatar(img));
    document.querySelectorAll(`.${CHARACTER_LIST_LAZY_AVATAR_PENDING_CLASS}`).forEach(img => {
        img.classList.remove(CHARACTER_LIST_LAZY_AVATAR_PENDING_CLASS);
    });
    document.querySelectorAll(`.${CHARACTER_LIST_LAZY_AVATAR_SHELL_CLASS}`).forEach(element => {
        element.classList.remove(CHARACTER_LIST_LAZY_AVATAR_SHELL_CLASS);
    });
}

function applyNativeCharacterListImageHints() {
    document.querySelectorAll(AVATAR_LAZY_LOAD_SELECTOR).forEach(img => {
        if (img instanceof HTMLImageElement) {
            applyCharacterListImageHints(img);
        }
    });
}

function applyCharacterListImageHints(img) {
    img.loading = 'lazy';
    img.decoding = 'async';
    img.setAttribute('fetchpriority', 'low');
}

function isCharacterListAvatarThumbnailUrl(src) {
    if (!src || src === CHARACTER_LIST_LAZY_AVATAR_PLACEHOLDER_SRC) {
        return false;
    }

    try {
        const url = new URL(src, location.origin);
        const type = url.searchParams.get('type');
        return url.origin === location.origin
            && url.pathname === '/thumbnail'
            && (type === 'avatar' || type === 'persona')
            && url.searchParams.has('file');
    } catch {
        return false;
    }
}

function installCharacterListAvatarLazyLoadStyle() {
    let style = document.getElementById(CHARACTER_LIST_AVATAR_LAZY_LOAD_STYLE_ID);

    if (!style) {
        style = document.createElement('style');
        style.id = CHARACTER_LIST_AVATAR_LAZY_LOAD_STYLE_ID;
        document.head.append(style);
    }

    style.textContent = `
${CHARACTER_LIST_SELECTOR} .character_select {
    content-visibility: auto;
    contain-intrinsic-size: 72px;
}

${PERSONA_LIST_SELECTOR} .avatar-container,
${WELCOME_RECENT_CHAT_SELECTOR} {
    content-visibility: auto;
    contain-intrinsic-size: 72px;
}

body.charListGrid ${CHARACTER_LIST_SELECTOR} .character_select {
    contain-intrinsic-size: 160px 120px;
}

${CHARACTER_LIST_SELECTOR} .${CHARACTER_LIST_LAZY_AVATAR_SHELL_CLASS},
${PERSONA_LIST_SELECTOR} .${CHARACTER_LIST_LAZY_AVATAR_SHELL_CLASS},
${WELCOME_RECENT_CHAT_SELECTOR} .${CHARACTER_LIST_LAZY_AVATAR_SHELL_CLASS} {
    background: var(--SmartThemeBlurTintColor);
}

${CHARACTER_LIST_SELECTOR} img.${CHARACTER_LIST_LAZY_AVATAR_PENDING_CLASS},
${PERSONA_LIST_SELECTOR} img.${CHARACTER_LIST_LAZY_AVATAR_PENDING_CLASS},
${WELCOME_RECENT_CHAT_SELECTOR} img.${CHARACTER_LIST_LAZY_AVATAR_PENDING_CLASS} {
    opacity: 0.01;
}

${CHARACTER_LIST_SELECTOR} img.${CHARACTER_LIST_LAZY_AVATAR_LOADED_CLASS},
${PERSONA_LIST_SELECTOR} img.${CHARACTER_LIST_LAZY_AVATAR_LOADED_CLASS},
${WELCOME_RECENT_CHAT_SELECTOR} img.${CHARACTER_LIST_LAZY_AVATAR_LOADED_CLASS} {
    opacity: 1;
    transition: opacity 120ms ease;
}
`;
}

function removeCharacterListAvatarLazyLoadStyle() {
    document.getElementById(CHARACTER_LIST_AVATAR_LAZY_LOAD_STYLE_ID)?.remove();
}

export {
    applyCharacterListAvatarLazyLoadOptimization,
    applyCharacterListImageHints,
    applyCharacterSearchInputOptimization,
    applyNativeCharacterListImageHints,
    deferCharacterListAvatarImage,
    deferCharacterListAvatarNode,
    getCharacterListAvatarLazyLoadState,
    installCharacterListAvatarAppendPatch,
    installCharacterListAvatarIntersectionObserver,
    installCharacterListAvatarLazyLoadOptimization,
    installCharacterListAvatarLazyLoadStyle,
    installCharacterListAvatarMutationObserver,
    installCharacterListAvatarNativeAppendPatch,
    installCharacterListAvatarPageLoadedHandler,
    installCharacterSearchInputOptimization,
    isCharacterListAvatarThumbnailUrl,
    loadCharacterListAvatar,
    observeCharacterListAvatar,
    prepareCharacterListAvatarAppendArgument,
    prepareCharacterListAvatarAppendArguments,
    processCharacterListAvatars,
    removeCharacterListAvatarLazyLoadStyle,
    removeCharacterSearchInputOptimization,
    restoreCharacterListAvatarAppendPatch,
    restoreCharacterListAvatarLazyLoadOptimization,
    restoreCharacterListAvatarNativeAppendPatch,
    restorePendingCharacterListAvatars,
    scheduleProcessCharacterListAvatars,
    shouldPrepareCharacterListAppend,
    shouldPrepareCharacterListNativeAppend,
    triggerCharacterSearch,
};
