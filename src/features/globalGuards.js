import { PAGE_RESTORE_SELECTION_GUARD_KEY } from './constants.js';
import { extensionState } from './state.js';

function installPageRestoreSelectionGuard() {
    if (extensionState[PAGE_RESTORE_SELECTION_GUARD_KEY]) {
        return;
    }

    const handler = (event) => {
        if (event?.type === 'visibilitychange' && document.visibilityState !== 'hidden') {
            return;
        }

        clearNonEditableTextSelectionForPageRestore();
    };

    document.addEventListener('visibilitychange', handler, true);
    window.addEventListener('pagehide', handler, true);
    extensionState[PAGE_RESTORE_SELECTION_GUARD_KEY] = { handler };
}

function clearNonEditableTextSelectionForPageRestore() {
    const selection = typeof document.getSelection === 'function' ? document.getSelection() : null;

    if (!selection || selection.rangeCount === 0) {
        return;
    }

    const anchor = getSelectionElement(selection.anchorNode);
    const focus = getSelectionElement(selection.focusNode);

    if (isEditableSelectionElement(anchor) || isEditableSelectionElement(focus)) {
        return;
    }

    try {
        selection.removeAllRanges();
    } catch {
        // Selection cleanup is best effort; page restore should never depend on it.
    }
}

function getSelectionElement(node) {
    if (node instanceof Element) {
        return node;
    }

    return node?.parentElement instanceof Element ? node.parentElement : null;
}

function isEditableSelectionElement(element) {
    if (!(element instanceof HTMLElement)) {
        return false;
    }

    return Boolean(
        element.isContentEditable
        || element.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]')
    );
}

export {
    clearNonEditableTextSelectionForPageRestore,
    getSelectionElement,
    installPageRestoreSelectionGuard,
    isEditableSelectionElement,
};
