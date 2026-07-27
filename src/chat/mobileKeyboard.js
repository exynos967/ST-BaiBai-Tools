import { isMobile } from '@sillytavern/scripts/RossAscends-mods';
import { CHAT_MESSAGE_EDIT_SELECTOR, MOBILE_AUTO_KEYBOARD_DIRECT_FOCUS_WINDOW_MS, MOBILE_AUTO_KEYBOARD_FOCUS_PATCH_KEY, MOBILE_AUTO_KEYBOARD_HANDLER_KEY, MOBILE_AUTO_KEYBOARD_JQUERY_FOCUS_PATCH_KEY, MOBILE_AUTO_KEYBOARD_JQUERY_TRIGGER_PATCH_KEY, MOBILE_AUTO_KEYBOARD_TARGET_SELECTOR, MOBILE_CHAT_ENTRY_KEYBOARD_TARGET_SELECTOR, MOBILE_DIRECT_KEYBOARD_TARGET_SELECTOR, MOBILE_MESSAGE_EDIT_CARET_CONTEXT_LINES, MOBILE_MESSAGE_EDIT_CARET_VISIBLE_PADDING, MOBILE_MESSAGE_EDIT_EDITOR_SCROLL_INTENT_MS, MOBILE_MESSAGE_EDIT_SCROLL_RESTORE_DELAYS, MOBILE_MESSAGE_EDIT_SCROLL_RESTORE_TOLERANCE, MOBILE_MESSAGE_EDIT_SCROLL_TOP_PATCH_KEY, MOBILE_MESSAGE_EDIT_SELECTOR } from './constants.js';
import { LOG_PREFIX, extensionState, settings } from './state.js';

function applyMobileAutoKeyboardSuppression() {
    patchMobileAutoKeyboardFocus();
    patchMobileAutoKeyboardJQueryFocus();

    if (extensionState[MOBILE_AUTO_KEYBOARD_HANDLER_KEY]) {
        return;
    }

    const directFocusIntentHandler = (event) => {
        markMobileAutoKeyboardDirectFocusIntent(event);
    };
    const pointerUpHandler = (event) => {
        handleMobileAutoKeyboardPointerUp(event);
    };
    const focusInHandler = (event) => {
        handleMobileAutoKeyboardFocusIn(event);
    };
    const pageLifecycleHandler = (event) => {
        handleMobileAutoKeyboardPageLifecycle(event);
    };

    extensionState[MOBILE_AUTO_KEYBOARD_HANDLER_KEY] = {
        directFocusIntentHandler,
        pointerUpHandler,
        focusInHandler,
        pageLifecycleHandler,
    };

    document.addEventListener('pointerdown', directFocusIntentHandler, true);
    document.addEventListener('mousedown', directFocusIntentHandler, true);
    document.addEventListener('touchstart', directFocusIntentHandler, true);
    document.addEventListener('pointerup', pointerUpHandler, true);
    document.addEventListener('touchend', pointerUpHandler, true);
    document.addEventListener('mouseup', pointerUpHandler, true);
    document.addEventListener('focusin', focusInHandler, true);
    document.addEventListener('visibilitychange', pageLifecycleHandler, true);
    window.addEventListener('pagehide', pageLifecycleHandler, true);
    window.addEventListener('pageshow', pageLifecycleHandler, true);
    window.addEventListener('focus', pageLifecycleHandler, true);
}

function applyMobileMessageEditScrollGuard() {
    if (!isMobileMessageEditScrollGuardEnabled()) {
        stopMobileMessageEditScrollGuard({ removeEntryObservers: true });
        return;
    }

    patchMobileMessageEditChatScrollTop();
    installMobileMessageEditScrollGuardObservers();
    scheduleMobileMessageEditScrollGuardUpdate('apply');
}

function patchMobileMessageEditChatScrollTop() {
    const target = getMobileMessageEditScrollTopDescriptorTarget();

    if (
        !target?.descriptor?.get
        || !target.descriptor?.set
        || target.descriptor.set[MOBILE_MESSAGE_EDIT_SCROLL_TOP_PATCH_KEY]
    ) {
        return;
    }

    const { prototype, descriptor } = target;

    function guardedScrollTopSetter(value) {
        if (shouldBlockMobileMessageEditChatScrollTop(this, value)) {
            return;
        }

        return descriptor.set.call(this, value);
    }

    guardedScrollTopSetter[MOBILE_MESSAGE_EDIT_SCROLL_TOP_PATCH_KEY] = true;
    guardedScrollTopSetter.__baiBaiToolkitOriginalScrollTopSetter = descriptor.set;

    Object.defineProperty(prototype, 'scrollTop', {
        ...descriptor,
        set: guardedScrollTopSetter,
    });
}

function getMobileMessageEditScrollTopDescriptorTarget() {
    const prototypes = [
        globalThis.Element?.prototype,
        globalThis.HTMLElement?.prototype,
    ].filter(Boolean);

    for (const prototype of prototypes) {
        const descriptor = Object.getOwnPropertyDescriptor(prototype, 'scrollTop');

        if (descriptor?.get && descriptor?.set) {
            return { prototype, descriptor };
        }
    }

    return null;
}

function shouldBlockMobileMessageEditChatScrollTop(element, value) {
    if (extensionState.mobileMessageEditScrollRestoreActive) {
        return false;
    }

    if (!(element instanceof HTMLElement) || element.id !== 'chat') {
        return false;
    }

    const guard = getActiveMobileMessageEditScrollGuard();

    if (!guard || guard.chat !== element || Date.now() < Number(guard.userScrollIntentUntil || 0)) {
        return false;
    }

    const nextScrollTop = Number(value);

    if (!Number.isFinite(nextScrollTop)) {
        return false;
    }

    return Math.abs(nextScrollTop - Number(guard.scrollTop || 0)) > MOBILE_MESSAGE_EDIT_SCROLL_RESTORE_TOLERANCE;
}

function installMobileMessageEditScrollGuardObservers() {
    if (extensionState.mobileMessageEditScrollGuardObserversInstalled) {
        if (extensionState.mobileMessageEditScrollGuardEntryHandler) {
            return;
        }
        stopMobileMessageEditScrollGuard({ removeEntryObservers: true });
    }

    const entryHandler = (event) => {
        handleMobileMessageEditScrollGuardEntryEvent(event);
    };
    const focusInHandler = (event) => {
        handleMobileMessageEditScrollGuardFocusIn(event);
    };
    const focusOutHandler = () => {
        scheduleMobileMessageEditScrollGuardUpdate('focusout', 0);
        scheduleMobileMessageEditScrollGuardUpdate('focusout settle', 80);
    };

    document.addEventListener('pointerdown', entryHandler, true);
    document.addEventListener('mousedown', entryHandler, true);
    document.addEventListener('touchstart', entryHandler, { capture: true, passive: true });
    document.addEventListener('click', entryHandler, true);
    document.addEventListener('focusin', focusInHandler, true);
    document.addEventListener('focusout', focusOutHandler, true);

    extensionState.mobileMessageEditScrollGuardEntryHandler = entryHandler;
    extensionState.mobileMessageEditScrollGuardFocusInHandler = focusInHandler;
    extensionState.mobileMessageEditScrollGuardFocusOutHandler = focusOutHandler;
    extensionState.mobileMessageEditScrollGuardObserversInstalled = true;
}

function removeMobileMessageEditScrollGuardObservers() {
    if (!extensionState.mobileMessageEditScrollGuardObserversInstalled) {
        return;
    }

    const entryHandler = extensionState.mobileMessageEditScrollGuardEntryHandler;
    const focusInHandler = extensionState.mobileMessageEditScrollGuardFocusInHandler;
    const focusOutHandler = extensionState.mobileMessageEditScrollGuardFocusOutHandler;
    const legacyUpdateHandler = extensionState.mobileMessageEditScrollGuardUpdateHandler;
    const legacyResizeHandler = extensionState.mobileMessageEditScrollGuardResizeHandler;
    const legacyUserScrollIntentHandler = extensionState.mobileMessageEditScrollGuardUserScrollIntentHandler;

    if (entryHandler) {
        document.removeEventListener('pointerdown', entryHandler, true);
        document.removeEventListener('mousedown', entryHandler, true);
        document.removeEventListener('touchstart', entryHandler, true);
        document.removeEventListener('click', entryHandler, true);
    }
    if (focusInHandler) {
        document.removeEventListener('focusin', focusInHandler, true);
    }
    if (focusOutHandler) {
        document.removeEventListener('focusout', focusOutHandler, true);
    }
    if (legacyUpdateHandler) {
        document.removeEventListener('focusin', legacyUpdateHandler, true);
        document.removeEventListener('focusout', legacyUpdateHandler, true);
    }
    if (legacyUserScrollIntentHandler) {
        document.removeEventListener('touchmove', legacyUserScrollIntentHandler, true);
        document.removeEventListener('wheel', legacyUserScrollIntentHandler, true);
    }
    if (legacyResizeHandler) {
        window.removeEventListener('resize', legacyResizeHandler, true);
        window.visualViewport?.removeEventListener('resize', legacyResizeHandler, true);
    }

    extensionState.mobileMessageEditScrollGuardMutationObserver?.disconnect();
    extensionState.mobileMessageEditScrollGuardMutationObserver = null;
    extensionState.mobileMessageEditScrollGuardMutationElement = null;
    extensionState.mobileMessageEditScrollGuardResizeObserver?.disconnect();
    extensionState.mobileMessageEditScrollGuardResizeObserver = null;
    extensionState.mobileMessageEditScrollGuardResizeElement = null;

    if (extensionState.mobileMessageEditScrollGuardUpdateFrame) {
        cancelAnimationFrame(extensionState.mobileMessageEditScrollGuardUpdateFrame);
        extensionState.mobileMessageEditScrollGuardUpdateFrame = 0;
    }
    clearTimeout(extensionState.mobileMessageEditScrollGuardUpdateTimer);
    extensionState.mobileMessageEditScrollGuardUpdateTimer = null;

    delete extensionState.mobileMessageEditScrollGuardEntryHandler;
    delete extensionState.mobileMessageEditScrollGuardFocusInHandler;
    delete extensionState.mobileMessageEditScrollGuardFocusOutHandler;
    delete extensionState.mobileMessageEditScrollGuardUpdateHandler;
    extensionState.mobileMessageEditScrollGuardResizeHandler = null;
    extensionState.mobileMessageEditScrollGuardUserScrollIntentHandler = null;
    extensionState.mobileMessageEditScrollGuardActiveListenersInstalled = false;
    extensionState.mobileMessageEditScrollGuardObserversInstalled = false;
}

function handleMobileMessageEditScrollGuardEntryEvent(event) {
    if (!isMobileMessageEditScrollGuardEnabled()) {
        return;
    }

    const target = event.target instanceof Element ? event.target : null;
    if (!target) {
        return;
    }

    const editor = target.closest(MOBILE_MESSAGE_EDIT_SELECTOR);
    if (editor instanceof HTMLElement) {
        captureMobileMessageEditScrollGuard('edit interaction', editor, {
            force: event.type !== 'click' || !hasActiveMobileMessageEditScrollGuardForEditor(editor),
        });
        markMobileMessageEditEditorScrollIntent(editor);
        return;
    }

    if (target.closest(CHAT_MESSAGE_EDIT_SELECTOR)) {
        scheduleMobileMessageEditScrollGuardUpdate('edit button');
        scheduleMobileMessageEditScrollGuardUpdate('edit button settle', 80);
    }
}

function handleMobileMessageEditScrollGuardFocusIn(event) {
    const target = event.target;

    if (isMobileMessageEditScrollGuardEnabled()
        && target instanceof HTMLElement
        && target.matches(MOBILE_MESSAGE_EDIT_SELECTOR)) {
        captureMobileMessageEditScrollGuard('edit focusin', target, {
            force: !hasActiveMobileMessageEditScrollGuardForEditor(target),
        });
        return;
    }

    scheduleMobileMessageEditScrollGuardUpdate('focusin');
}

function ensureMobileMessageEditScrollGuardActiveObservers(guard = getActiveMobileMessageEditScrollGuard()) {
    const chat = guard?.chat;

    if (!(chat instanceof HTMLElement)) {
        return;
    }

    ensureMobileMessageEditScrollGuardMutationObserver(chat);
    ensureMobileMessageEditScrollGuardActiveListeners();

    if (typeof ResizeObserver !== 'function') {
        return;
    }

    if (extensionState.mobileMessageEditScrollGuardResizeElement === chat) {
        return;
    }

    extensionState.mobileMessageEditScrollGuardResizeObserver?.disconnect();

    const resizeObserver = new ResizeObserver((entries) => {
        const entry = entries.find(value => value.target === chat) || entries[0];
        handleMobileMessageEditChatResize(entry?.contentRect?.height);
    });

    resizeObserver.observe(chat);
    extensionState.mobileMessageEditScrollGuardResizeObserver = resizeObserver;
    extensionState.mobileMessageEditScrollGuardResizeElement = chat;
}

function ensureMobileMessageEditScrollGuardMutationObserver(chat) {
    if (!(chat instanceof HTMLElement) || typeof MutationObserver !== 'function') {
        return;
    }

    if (extensionState.mobileMessageEditScrollGuardMutationElement === chat) {
        return;
    }

    extensionState.mobileMessageEditScrollGuardMutationObserver?.disconnect();

    const mutationObserver = new MutationObserver(() => {
        scheduleMobileMessageEditScrollGuardUpdate('chat mutation');
    });

    mutationObserver.observe(chat, {
        childList: true,
        subtree: true,
    });

    extensionState.mobileMessageEditScrollGuardMutationObserver = mutationObserver;
    extensionState.mobileMessageEditScrollGuardMutationElement = chat;
}

function ensureMobileMessageEditScrollGuardActiveListeners() {
    if (extensionState.mobileMessageEditScrollGuardActiveListenersInstalled) {
        return;
    }

    const resizeHandler = () => {
        handleMobileMessageEditViewportResize();
    };
    const userScrollIntentHandler = () => {
        handleMobileMessageEditUserScrollIntent();
    };
    const editorScrollIntentHandler = (event) => {
        handleMobileMessageEditEditorScrollIntent(event);
    };

    document.addEventListener('touchmove', userScrollIntentHandler, { capture: true, passive: true });
    document.addEventListener('touchmove', editorScrollIntentHandler, { capture: true, passive: true });
    document.addEventListener('wheel', userScrollIntentHandler, { capture: true, passive: true });
    document.addEventListener('wheel', editorScrollIntentHandler, { capture: true, passive: true });
    document.addEventListener('scroll', editorScrollIntentHandler, true);
    window.addEventListener('resize', resizeHandler, true);
    window.visualViewport?.addEventListener('resize', resizeHandler, true);

    extensionState.mobileMessageEditScrollGuardResizeHandler = resizeHandler;
    extensionState.mobileMessageEditScrollGuardUserScrollIntentHandler = userScrollIntentHandler;
    extensionState.mobileMessageEditScrollGuardEditorScrollIntentHandler = editorScrollIntentHandler;
    extensionState.mobileMessageEditScrollGuardActiveListenersInstalled = true;
}

function stopMobileMessageEditScrollGuardActiveObservers() {
    extensionState.mobileMessageEditScrollGuardMutationObserver?.disconnect();
    extensionState.mobileMessageEditScrollGuardMutationObserver = null;
    extensionState.mobileMessageEditScrollGuardMutationElement = null;

    extensionState.mobileMessageEditScrollGuardResizeObserver?.disconnect();
    extensionState.mobileMessageEditScrollGuardResizeObserver = null;
    extensionState.mobileMessageEditScrollGuardResizeElement = null;

    const resizeHandler = extensionState.mobileMessageEditScrollGuardResizeHandler;
    const userScrollIntentHandler = extensionState.mobileMessageEditScrollGuardUserScrollIntentHandler;
    const editorScrollIntentHandler = extensionState.mobileMessageEditScrollGuardEditorScrollIntentHandler;

    if (userScrollIntentHandler) {
        document.removeEventListener('touchmove', userScrollIntentHandler, true);
        document.removeEventListener('wheel', userScrollIntentHandler, true);
    }
    if (editorScrollIntentHandler) {
        document.removeEventListener('touchmove', editorScrollIntentHandler, true);
        document.removeEventListener('wheel', editorScrollIntentHandler, true);
        document.removeEventListener('scroll', editorScrollIntentHandler, true);
    }
    if (resizeHandler) {
        window.removeEventListener('resize', resizeHandler, true);
        window.visualViewport?.removeEventListener('resize', resizeHandler, true);
    }

    extensionState.mobileMessageEditScrollGuardResizeHandler = null;
    extensionState.mobileMessageEditScrollGuardUserScrollIntentHandler = null;
    extensionState.mobileMessageEditScrollGuardEditorScrollIntentHandler = null;
    extensionState.mobileMessageEditScrollGuardActiveListenersInstalled = false;
}

function scheduleMobileMessageEditScrollGuardUpdate(reason = '', delayMs = 0) {
    if (!isMobileMessageEditScrollGuardEnabled()) {
        stopMobileMessageEditScrollGuard();
        return;
    }

    if (delayMs > 0) {
        clearTimeout(extensionState.mobileMessageEditScrollGuardUpdateTimer);
        extensionState.mobileMessageEditScrollGuardUpdateTimer = setTimeout(() => {
            extensionState.mobileMessageEditScrollGuardUpdateTimer = null;
            scheduleMobileMessageEditScrollGuardUpdate(reason);
        }, delayMs);
        return;
    }

    if (extensionState.mobileMessageEditScrollGuardUpdateFrame) {
        return;
    }

    extensionState.mobileMessageEditScrollGuardUpdateFrame = requestAnimationFrame(() => {
        extensionState.mobileMessageEditScrollGuardUpdateFrame = 0;
        refreshMobileMessageEditScrollGuard(reason || 'scheduled update');
    });
}

function refreshMobileMessageEditScrollGuard(reason = '') {
    const targetEditor = document.querySelector(MOBILE_MESSAGE_EDIT_SELECTOR);

    if (targetEditor instanceof HTMLElement) {
        captureMobileMessageEditScrollGuard(reason || 'refresh', targetEditor);
        return;
    }

    stopMobileMessageEditScrollGuard();
}

function captureMobileMessageEditScrollGuard(reason, editor = null, { force = false } = {}) {
    if (!isMobileMessageEditScrollGuardEnabled()) {
        stopMobileMessageEditScrollGuard();
        return;
    }

    const targetEditor = editor instanceof HTMLElement && editor.matches(MOBILE_MESSAGE_EDIT_SELECTOR)
        ? editor
        : document.querySelector(MOBILE_MESSAGE_EDIT_SELECTOR);
    const chat = document.querySelector('#chat');

    if (!(targetEditor instanceof HTMLElement) || !(chat instanceof HTMLElement)) {
        stopMobileMessageEditScrollGuard();
        return;
    }

    const existingGuard = extensionState.mobileMessageEditScrollGuard;

    if (
        !force
        && existingGuard?.editor === targetEditor
        && existingGuard?.chat === chat
    ) {
        ensureMobileMessageEditScrollGuardActiveObservers(existingGuard);
        return;
    }

    clearMobileMessageEditScrollRestoreTimers(existingGuard);
    extensionState.mobileMessageEditScrollGuard = {
        editor: targetEditor,
        chat,
        scrollTop: chat.scrollTop,
        chatHeight: chat.offsetHeight,
        capturedAt: Date.now(),
        reason,
        restoreTimers: [],
        restoreScheduled: false,
        restoreReason: '',
        caretVisibleTimers: [],
        caretVisibleCheckScheduled: false,
        userScrollIntentUntil: 0,
        editorScrollIntentUntil: 0,
    };
    ensureMobileMessageEditScrollGuardActiveObservers(extensionState.mobileMessageEditScrollGuard);
}

function stopMobileMessageEditScrollGuard({ removeEntryObservers = false } = {}) {
    const guard = extensionState.mobileMessageEditScrollGuard;
    clearMobileMessageEditScrollRestoreTimers(guard);

    stopMobileMessageEditScrollGuardActiveObservers();

    extensionState.mobileMessageEditScrollGuard = null;

    if (removeEntryObservers) {
        removeMobileMessageEditScrollGuardObservers();
    }
}

function clearMobileMessageEditScrollRestoreTimers(guard = extensionState.mobileMessageEditScrollGuard) {
    if (guard?.restoreTimers?.length) {
        guard.restoreTimers.forEach(timer => clearTimeout(timer));
        guard.restoreTimers = [];
    }
    clearMobileMessageEditCaretVisibleTimers(guard);
    if (guard) {
        guard.restoreScheduled = false;
        guard.restoreReason = '';
    }
}

function clearMobileMessageEditCaretVisibleTimers(guard = extensionState.mobileMessageEditScrollGuard) {
    if (guard?.caretVisibleTimers?.length) {
        guard.caretVisibleTimers.forEach(timer => clearTimeout(timer));
        guard.caretVisibleTimers = [];
    }
    if (guard) {
        guard.caretVisibleCheckScheduled = false;
    }
}

function handleMobileMessageEditChatResize(observedHeight = null) {
    const guard = getActiveMobileMessageEditScrollGuard();

    if (!guard) {
        scheduleMobileMessageEditScrollGuardUpdate('chat resize without guard');
        return;
    }

    const numericHeight = Number(observedHeight);
    const nextHeight = Number.isFinite(numericHeight)
        ? numericHeight
        : guard.chat.offsetHeight;
    const heightDelta = nextHeight - Number(guard.chatHeight || 0);
    guard.chatHeight = nextHeight;

    if (Math.abs(heightDelta) <= MOBILE_MESSAGE_EDIT_SCROLL_RESTORE_TOLERANCE) {
        return;
    }

    scheduleMobileMessageEditScrollRestore(`chat resize ${heightDelta}`);
}

function handleMobileMessageEditViewportResize() {
    const guard = getActiveMobileMessageEditScrollGuard();

    if (!guard) {
        return;
    }

    scheduleMobileMessageEditScrollRestore('viewport resize');
}

function handleMobileMessageEditUserScrollIntent() {
    const guard = getActiveMobileMessageEditScrollGuard();

    if (!guard) {
        return;
    }

    guard.userScrollIntentUntil = Date.now() + 700;
}

function hasActiveMobileMessageEditScrollGuardForEditor(editor) {
    const guard = getActiveMobileMessageEditScrollGuard();

    return Boolean(guard && guard.editor === editor);
}

function handleMobileMessageEditEditorScrollIntent(event) {
    const target = event?.target instanceof Element ? event.target : null;
    const editor = target?.closest?.(MOBILE_MESSAGE_EDIT_SELECTOR);

    if (editor instanceof HTMLElement) {
        markMobileMessageEditEditorScrollIntent(editor);
    }
}

function markMobileMessageEditEditorScrollIntent(editor) {
    const guard = getActiveMobileMessageEditScrollGuard();

    if (!guard || guard.editor !== editor) {
        return;
    }

    guard.editorScrollIntentUntil = Date.now() + MOBILE_MESSAGE_EDIT_EDITOR_SCROLL_INTENT_MS;
    clearMobileMessageEditCaretVisibleTimers(guard);
}

function scheduleMobileMessageEditScrollRestore(reason) {
    const guard = getActiveMobileMessageEditScrollGuard();

    if (!guard) {
        return;
    }

    guard.restoreReason = reason || guard.restoreReason || 'restore';

    if (guard.restoreScheduled) {
        return;
    }

    guard.restoreScheduled = true;

    queueMicrotask(() => restoreMobileMessageEditScroll(guard.restoreReason));
    requestAnimationFrame(() => restoreMobileMessageEditScroll(guard.restoreReason));

    for (const delay of MOBILE_MESSAGE_EDIT_SCROLL_RESTORE_DELAYS) {
        const timer = setTimeout(() => {
            guard.restoreTimers = guard.restoreTimers.filter(value => value !== timer);
            restoreMobileMessageEditScroll(guard.restoreReason);
            if (guard.restoreTimers.length === 0) {
                guard.restoreScheduled = false;
                guard.restoreReason = '';
            }
        }, delay);

        guard.restoreTimers.push(timer);
    }
}

function restoreMobileMessageEditScroll(reason) {
    const guard = getActiveMobileMessageEditScrollGuard();

    if (!guard || Date.now() < Number(guard.userScrollIntentUntil || 0)) {
        return;
    }

    const desiredScrollTop = Number(guard.scrollTop || 0);

    if (Math.abs(guard.chat.scrollTop - desiredScrollTop) <= MOBILE_MESSAGE_EDIT_SCROLL_RESTORE_TOLERANCE) {
        return;
    }

    try {
        extensionState.mobileMessageEditScrollRestoreActive = true;
        guard.chat.scrollTop = desiredScrollTop;
        console.debug(`${LOG_PREFIX} Restored message edit chat scroll after ${reason}: ${desiredScrollTop}`);
    } finally {
        extensionState.mobileMessageEditScrollRestoreActive = false;
    }
}

function ensureMobileMessageEditCaretVisible(editor) {
    if (!(editor instanceof HTMLTextAreaElement)
        || !editor.isConnected
        || editor.scrollHeight <= editor.clientHeight
        || typeof editor.selectionStart !== 'number'
        || shouldSuppressMobileMessageEditCaretScroll(editor)) {
        return;
    }

    const caretOffset = Math.max(0, Math.min(editor.selectionStart, editor.value.length));
    const caretTop = getTextareaCaretContentTop(editor, caretOffset);

    if (!Number.isFinite(caretTop)) {
        scrollMessageEditTextareaCaretApproximatelyIntoView(editor, caretOffset);
        return;
    }

    const style = getComputedStyle(editor);
    const lineHeight = getTextareaNumericLineHeight(style);
    const padding = MOBILE_MESSAGE_EDIT_CARET_VISIBLE_PADDING;
    const bottomContext = padding + (lineHeight * MOBILE_MESSAGE_EDIT_CARET_CONTEXT_LINES);
    const visibleTop = editor.scrollTop + padding;
    const visibleBottom = editor.scrollTop + editor.clientHeight - bottomContext;
    const caretBottom = caretTop + lineHeight;

    if (caretTop < visibleTop) {
        editor.scrollTop = Math.max(0, caretTop - padding);
    } else if (caretBottom > visibleBottom) {
        editor.scrollTop = Math.min(
            editor.scrollHeight - editor.clientHeight,
            caretBottom - editor.clientHeight + bottomContext,
        );
    }
}

function shouldSuppressMobileMessageEditCaretScroll(editor) {
    const guard = getActiveMobileMessageEditScrollGuard();

    return Boolean(
        guard
        && guard.editor === editor
        && Date.now() < Number(guard.editorScrollIntentUntil || 0),
    );
}

function getTextareaCaretContentTop(editor, caretOffset) {
    const marker = document.createElement('span');
    marker.textContent = '\u200b';

    const mirror = document.createElement('div');
    const style = getComputedStyle(editor);
    const properties = [
        'boxSizing',
        'width',
        'fontFamily',
        'fontSize',
        'fontWeight',
        'fontStyle',
        'fontVariant',
        'fontStretch',
        'lineHeight',
        'letterSpacing',
        'textTransform',
        'textIndent',
        'textAlign',
        'textRendering',
        'textSizeAdjust',
        'tabSize',
        'paddingTop',
        'paddingRight',
        'paddingBottom',
        'paddingLeft',
        'borderTopWidth',
        'borderRightWidth',
        'borderBottomWidth',
        'borderLeftWidth',
    ];

    for (const property of properties) {
        mirror.style[property] = style[property];
    }

    mirror.style.position = 'absolute';
    mirror.style.visibility = 'hidden';
    mirror.style.pointerEvents = 'none';
    mirror.style.whiteSpace = 'pre-wrap';
    mirror.style.overflowWrap = 'break-word';
    mirror.style.wordWrap = 'break-word';
    mirror.style.overflow = 'hidden';
    mirror.style.top = '0';
    mirror.style.left = '-9999px';
    mirror.style.height = 'auto';
    mirror.style.minHeight = '0';
    mirror.style.maxHeight = 'none';
    mirror.style.width = `${editor.offsetWidth}px`;

    const before = editor.value.slice(0, caretOffset);
    mirror.append(document.createTextNode(before.length > 0 ? before : '\u200b'), marker);
    document.body.append(mirror);

    try {
        const markerTop = marker.offsetTop;
        const borderTop = parseFloat(style.borderTopWidth) || 0;
        return markerTop - borderTop;
    } finally {
        mirror.remove();
    }
}

function getTextareaNumericLineHeight(style) {
    const parsed = parseFloat(style.lineHeight);

    if (Number.isFinite(parsed)) {
        return parsed;
    }

    const fontSize = parseFloat(style.fontSize);
    return Number.isFinite(fontSize) ? fontSize * 1.2 : 20;
}

function scrollMessageEditTextareaCaretApproximatelyIntoView(editor, caretOffset) {
    if (editor.scrollHeight <= editor.clientHeight || editor.value.length === 0) {
        return;
    }

    const style = getComputedStyle(editor);
    const lineHeight = getTextareaNumericLineHeight(style);
    const contextOffset = MOBILE_MESSAGE_EDIT_CARET_VISIBLE_PADDING
        + (lineHeight * MOBILE_MESSAGE_EDIT_CARET_CONTEXT_LINES);
    const targetTop = Math.round(
        (editor.scrollHeight - editor.clientHeight)
        * caretOffset
        / editor.value.length,
    ) - contextOffset;

    editor.scrollTop = Math.max(0, Math.min(targetTop, editor.scrollHeight - editor.clientHeight));
}

function getActiveMobileMessageEditScrollGuard() {
    const guard = extensionState.mobileMessageEditScrollGuard;

    if (!guard) {
        return null;
    }

    if (
        !isMobileMessageEditScrollGuardEnabled()
        || !(guard.editor instanceof HTMLElement)
        || !(guard.chat instanceof HTMLElement)
        || !guard.editor.isConnected
        || !guard.chat.isConnected
        || !guard.editor.matches(MOBILE_MESSAGE_EDIT_SELECTOR)
    ) {
        stopMobileMessageEditScrollGuard();
        return null;
    }

    return guard;
}

function isMobileMessageEditScrollGuardEnabled() {
    return Boolean(settings.mobileMessageEditScrollGuardEnabled);
}

function patchMobileAutoKeyboardFocus() {
    const originalFocus = HTMLElement.prototype.focus;

    if (typeof originalFocus !== 'function' || originalFocus[MOBILE_AUTO_KEYBOARD_FOCUS_PATCH_KEY]) {
        return;
    }

    function guardedFocus(...args) {
        if (shouldSuppressMobileAutoKeyboardFocus(this)) {
            return undefined;
        }

        return originalFocus.apply(this, args);
    }

    guardedFocus[MOBILE_AUTO_KEYBOARD_FOCUS_PATCH_KEY] = true;
    guardedFocus.__baiBaiToolkitOriginalFocus = originalFocus;
    HTMLElement.prototype.focus = guardedFocus;
}

function patchMobileAutoKeyboardJQueryFocus() {
    const jQueryPrototype = globalThis.jQuery?.fn || globalThis.$?.fn;

    if (!jQueryPrototype) {
        return;
    }

    const originalFocus = jQueryPrototype.focus;
    if (typeof originalFocus === 'function' && !originalFocus[MOBILE_AUTO_KEYBOARD_JQUERY_FOCUS_PATCH_KEY]) {
        function guardedJQueryFocus(...args) {
            if (args.length === 0 && shouldSuppressMobileAutoKeyboardJQueryCollection(this)) {
                return this;
            }

            // PC Auto-Scroll Guard: Inject {preventScroll: true} for `#curEditTextarea` on PC or Mobile
            if (this.length > 0 && this[0].id === 'curEditTextarea' && isMobileMessageEditScrollGuardEnabled()) {
                args = [{ preventScroll: true }];
            }

            return originalFocus.apply(this, args);
        }

        guardedJQueryFocus[MOBILE_AUTO_KEYBOARD_JQUERY_FOCUS_PATCH_KEY] = true;
        guardedJQueryFocus.__baiBaiToolkitOriginalFocus = originalFocus;
        jQueryPrototype.focus = guardedJQueryFocus;
    }

    const originalTrigger = jQueryPrototype.trigger;
    if (typeof originalTrigger === 'function' && !originalTrigger[MOBILE_AUTO_KEYBOARD_JQUERY_TRIGGER_PATCH_KEY]) {
        function guardedJQueryTrigger(...args) {
            if (isMobileAutoKeyboardFocusTrigger(args[0]) && shouldSuppressMobileAutoKeyboardJQueryCollection(this)) {
                return this;
            }

            return originalTrigger.apply(this, args);
        }

        guardedJQueryTrigger[MOBILE_AUTO_KEYBOARD_JQUERY_TRIGGER_PATCH_KEY] = true;
        guardedJQueryTrigger.__baiBaiToolkitOriginalTrigger = originalTrigger;
        jQueryPrototype.trigger = guardedJQueryTrigger;
    }
}

function markMobileAutoKeyboardDirectFocusIntent(event) {
    const keyboardTarget = event.target instanceof Element
        ? event.target.closest(MOBILE_DIRECT_KEYBOARD_TARGET_SELECTOR)
        : null;
    const editTarget = event.target instanceof Element
        ? event.target.closest(MOBILE_MESSAGE_EDIT_SELECTOR)
        : null;

    if (isMobileMessageEditScrollGuardEnabled() && editTarget instanceof HTMLElement) {
        captureMobileMessageEditScrollGuard('direct edit focus intent', editTarget, { force: true });
        markMobileMessageEditEditorScrollIntent(editTarget);

        // Record coordinates to distinguish between scroll and click
        const touch = event.touches?.[0] || event;
        extensionState.mobileAutoKeyboardTouchStartX = touch.clientX;
        extensionState.mobileAutoKeyboardTouchStartY = touch.clientY;
    }

    if (!isMobile()) {
        return;
    }

    if (keyboardTarget instanceof HTMLElement && shouldTrackMobileAutoKeyboardDirectFocusIntent(keyboardTarget)) {
        extensionState.mobileAutoKeyboardDirectFocusTarget = keyboardTarget;
        extensionState.mobileAutoKeyboardDirectFocusAt = Date.now();
    }
}

function handleMobileAutoKeyboardPointerUp(event) {
    if (!isMobileMessageEditScrollGuardEnabled()) {
        return;
    }

    const editTarget = event.target instanceof Element
        ? event.target.closest(MOBILE_MESSAGE_EDIT_SELECTOR)
        : null;

    if (editTarget instanceof HTMLElement) {
        // Only focus if the pointer didn't move significantly (it was a click, not a swipe)
        let isSwipe = false;

        if (event.type === 'touchend' && typeof extensionState.mobileAutoKeyboardTouchStartX === 'number') {
            const touch = event.changedTouches?.[0] || event;
            const deltaX = Math.abs(touch.clientX - extensionState.mobileAutoKeyboardTouchStartX);
            const deltaY = Math.abs(touch.clientY - extensionState.mobileAutoKeyboardTouchStartY);

            // If moved more than 10 pixels, consider it a swipe
            if (deltaX > 10 || deltaY > 10) {
                isSwipe = true;
            }
        }

        extensionState.mobileAutoKeyboardTouchStartX = null;
        extensionState.mobileAutoKeyboardTouchStartY = null;

        if (!isSwipe) {
            focusMobileMessageEditWithoutScroll(event, editTarget);
        }
    }
}

function focusMobileMessageEditWithoutScroll(event, editor) {
    if (
        document.activeElement === editor
        || Date.now() - Number(extensionState.mobileMessageEditPreventScrollFocusAt || 0) <= 300
    ) {
        return;
    }

    extensionState.mobileMessageEditPreventScrollFocusAt = Date.now();

    try {
        editor.focus({ preventScroll: true });
    } catch {
        editor.focus();
    }
}

function handleMobileAutoKeyboardFocusIn(event) {
    const target = event.target;

    if (!(target instanceof HTMLElement)) {
        return;
    }

    if (isMobileMessageEditScrollGuardEnabled() && target.matches(MOBILE_MESSAGE_EDIT_SELECTOR)) {
        captureMobileMessageEditScrollGuard('edit focusin', target, {
            force: !hasActiveMobileMessageEditScrollGuardForEditor(target),
        });
    }

    if (!shouldSuppressMobileAutoKeyboardFocus(target)) {
        return;
    }

    blurMobileAutoKeyboardTarget(target);
}

function blurMobileAutoKeyboardTarget(target) {
    if (document.activeElement === target) {
        target.blur();
    }

    const blurAgain = () => {
        if (document.activeElement === target && shouldSuppressMobileAutoKeyboardFocus(target)) {
            target.blur();
        }
    };

    if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(blurAgain);
    } else {
        setTimeout(blurAgain, 0);
    }
}

function shouldSuppressMobileAutoKeyboardFocus(element) {
    return Boolean(
        isMobile()
        && element instanceof HTMLElement
        && isMobileAutoKeyboardSuppressionTarget(element)
        && !isRecentMobileAutoKeyboardDirectFocusIntent(element),
    );
}

function shouldTrackMobileAutoKeyboardDirectFocusIntent(element) {
    return Boolean(
        settings.mobileAutoKeyboardSuppressionEnabled
        && element.matches(MOBILE_DIRECT_KEYBOARD_TARGET_SELECTOR)
    );
}

function isMobileAutoKeyboardSuppressionTarget(element) {
    return Boolean(
        settings.mobileAutoKeyboardSuppressionEnabled
        && (
            element.matches(MOBILE_AUTO_KEYBOARD_TARGET_SELECTOR)
            || element.matches(MOBILE_CHAT_ENTRY_KEYBOARD_TARGET_SELECTOR)
        )
    );
}

function isRecentMobileAutoKeyboardDirectFocusIntent(element) {
    return Boolean(
        extensionState.mobileAutoKeyboardDirectFocusTarget === element
        && Date.now() - Number(extensionState.mobileAutoKeyboardDirectFocusAt || 0) <= MOBILE_AUTO_KEYBOARD_DIRECT_FOCUS_WINDOW_MS,
    );
}

function shouldSuppressMobileAutoKeyboardJQueryCollection(collection) {
    const element = collection?.[0];
    return element instanceof HTMLElement && shouldSuppressMobileAutoKeyboardFocus(element);
}

function isMobileAutoKeyboardFocusTrigger(type) {
    const eventType = typeof type === 'string'
        ? type
        : typeof type?.type === 'string'
            ? type.type
            : '';
    const normalizedType = eventType.split('.')[0];

    return normalizedType === 'focus' || normalizedType === 'focusin';
}

function handleMobileAutoKeyboardPageLifecycle(event) {
    if (!settings.mobileAutoKeyboardSuppressionEnabled || !isMobile()) {
        return;
    }

    if (event?.type === 'pagehide' || document.visibilityState === 'hidden') {
        clearMobileAutoKeyboardDirectFocusIntent();
    }

    scheduleMobileChatEntryKeyboardBlur();
}

function scheduleMobileChatEntryKeyboardBlur() {
    blurMobileChatEntryKeyboardTargetIfNeeded();

    const blurAgain = () => {
        blurMobileChatEntryKeyboardTargetIfNeeded();
    };

    if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(blurAgain);
    } else {
        setTimeout(blurAgain, 0);
    }

    setTimeout(blurAgain, 100);
}

function blurMobileChatEntryKeyboardTargetIfNeeded() {
    const target = document.activeElement;
    if (target instanceof HTMLElement && target.matches(MOBILE_CHAT_ENTRY_KEYBOARD_TARGET_SELECTOR) && shouldSuppressMobileAutoKeyboardFocus(target)) {
        target.blur();
    }
}

function clearMobileAutoKeyboardDirectFocusIntent() {
    extensionState.mobileAutoKeyboardDirectFocusTarget = null;
    extensionState.mobileAutoKeyboardDirectFocusAt = 0;
}

export {
    applyMobileAutoKeyboardSuppression,
    applyMobileMessageEditScrollGuard,
    blurMobileAutoKeyboardTarget,
    blurMobileChatEntryKeyboardTargetIfNeeded,
    captureMobileMessageEditScrollGuard,
    clearMobileAutoKeyboardDirectFocusIntent,
    clearMobileMessageEditCaretVisibleTimers,
    clearMobileMessageEditScrollRestoreTimers,
    ensureMobileMessageEditCaretVisible,
    ensureMobileMessageEditScrollGuardActiveListeners,
    ensureMobileMessageEditScrollGuardActiveObservers,
    ensureMobileMessageEditScrollGuardMutationObserver,
    focusMobileMessageEditWithoutScroll,
    getActiveMobileMessageEditScrollGuard,
    getMobileMessageEditScrollTopDescriptorTarget,
    getTextareaCaretContentTop,
    getTextareaNumericLineHeight,
    handleMobileAutoKeyboardFocusIn,
    handleMobileAutoKeyboardPageLifecycle,
    handleMobileAutoKeyboardPointerUp,
    handleMobileMessageEditChatResize,
    handleMobileMessageEditEditorScrollIntent,
    handleMobileMessageEditScrollGuardEntryEvent,
    handleMobileMessageEditScrollGuardFocusIn,
    handleMobileMessageEditUserScrollIntent,
    handleMobileMessageEditViewportResize,
    hasActiveMobileMessageEditScrollGuardForEditor,
    installMobileMessageEditScrollGuardObservers,
    isMobileAutoKeyboardFocusTrigger,
    isMobileAutoKeyboardSuppressionTarget,
    isMobileMessageEditScrollGuardEnabled,
    isRecentMobileAutoKeyboardDirectFocusIntent,
    markMobileAutoKeyboardDirectFocusIntent,
    markMobileMessageEditEditorScrollIntent,
    patchMobileAutoKeyboardFocus,
    patchMobileAutoKeyboardJQueryFocus,
    patchMobileMessageEditChatScrollTop,
    refreshMobileMessageEditScrollGuard,
    removeMobileMessageEditScrollGuardObservers,
    restoreMobileMessageEditScroll,
    scheduleMobileChatEntryKeyboardBlur,
    scheduleMobileMessageEditScrollGuardUpdate,
    scheduleMobileMessageEditScrollRestore,
    scrollMessageEditTextareaCaretApproximatelyIntoView,
    shouldBlockMobileMessageEditChatScrollTop,
    shouldSuppressMobileAutoKeyboardFocus,
    shouldSuppressMobileAutoKeyboardJQueryCollection,
    shouldSuppressMobileMessageEditCaretScroll,
    shouldTrackMobileAutoKeyboardDirectFocusIntent,
    stopMobileMessageEditScrollGuard,
    stopMobileMessageEditScrollGuardActiveObservers,
};
