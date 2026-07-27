import { event_types, eventSource } from '@sillytavern/script';
import { MESSAGE_EDIT_BOTTOM_ACTIONS_CLASS, MESSAGE_EDIT_BOTTOM_ACTIONS_CONTROL_SCOPE_SELECTOR, MESSAGE_EDIT_BOTTOM_ACTIONS_RELEVANT_SELECTOR, MESSAGE_EDIT_BOTTOM_ACTIONS_STATE_KEY, MESSAGE_EDIT_BOTTOM_ACTIONS_STYLE_ID, MESSAGE_EDIT_BOTTOM_ACTION_SCROLL_RESTORE_DELAYS } from './constants.js';
import { extensionState, settings } from './state.js';

function applyMessageEditBottomActions() {
    if (settings.messageEditBottomActionsEnabled === false) {
        removeMessageEditBottomActions();
        return;
    }

    installMessageEditBottomActions();
    scheduleMessageEditBottomActionsUpdate();
}

function getMessageEditBottomActionsState() {
    if (!extensionState[MESSAGE_EDIT_BOTTOM_ACTIONS_STATE_KEY] || typeof extensionState[MESSAGE_EDIT_BOTTOM_ACTIONS_STATE_KEY] !== 'object') {
        extensionState[MESSAGE_EDIT_BOTTOM_ACTIONS_STATE_KEY] = {};
    }

    return extensionState[MESSAGE_EDIT_BOTTOM_ACTIONS_STATE_KEY];
}

function installMessageEditBottomActions() {
    ensureMessageEditBottomActionsStyle();

    const state = getMessageEditBottomActionsState();
    const chat = document.querySelector('#chat');
    if (!(chat instanceof HTMLElement) || typeof MutationObserver !== 'function') {
        clearTimeout(state.retryTimer);
        state.retryTimer = setTimeout(() => {
            state.retryTimer = null;
            applyMessageEditBottomActions();
        }, 1000);
        return;
    }

    if (state.observer && state.chatElement === chat) {
        return;
    }

    state.observer?.disconnect();
    state.chatElement = chat;
    state.observer = new MutationObserver((mutations) => {
        if (isMessageEditBottomActionsMutationRelevant(mutations)) {
            scheduleMessageEditBottomActionsUpdate();
        }
    });
    state.observer.observe(chat, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['style', 'class'],
    });
}

function isMessageEditBottomActionsMutationRelevant(mutations) {
    for (const mutation of mutations) {
        if (isMessageEditBottomActionsMutationTargetRelevant(mutation)) {
            return true;
        }

        for (const node of mutation.addedNodes) {
            if (isMessageEditBottomActionsNodeRelevant(node)) {
                return true;
            }
        }

        for (const node of mutation.removedNodes) {
            if (isMessageEditBottomActionsNodeRelevant(node)) {
                return true;
            }
        }
    }

    return false;
}

function isMessageEditBottomActionsMutationTargetRelevant(mutation) {
    const target = mutation.target;
    if (!(target instanceof Element)) {
        return false;
    }

    if (target.matches(MESSAGE_EDIT_BOTTOM_ACTIONS_RELEVANT_SELECTOR)
        || target.closest(MESSAGE_EDIT_BOTTOM_ACTIONS_CONTROL_SCOPE_SELECTOR)) {
        return true;
    }

    const message = target.closest('.mes');
    return message instanceof HTMLElement && Boolean(message.querySelector('#curEditTextarea'));
}

function isMessageEditBottomActionsNodeRelevant(node) {
    if (!(node instanceof Element)) {
        return false;
    }

    return node.matches(MESSAGE_EDIT_BOTTOM_ACTIONS_RELEVANT_SELECTOR)
        || Boolean(node.querySelector(MESSAGE_EDIT_BOTTOM_ACTIONS_RELEVANT_SELECTOR));
}

function removeMessageEditBottomActions() {
    const state = getMessageEditBottomActionsState();
    state.observer?.disconnect();
    state.observer = null;
    state.chatElement = null;
    clearTimeout(state.retryTimer);
    state.retryTimer = null;
    if (state.updateFrame) {
        cancelAnimationFrame(state.updateFrame);
        state.updateFrame = 0;
    }

    document.getElementById(MESSAGE_EDIT_BOTTOM_ACTIONS_STYLE_ID)?.remove();
    document.querySelectorAll(`#chat .${MESSAGE_EDIT_BOTTOM_ACTIONS_CLASS}`).forEach(container => container.remove());
}

function scheduleMessageEditBottomActionsUpdate() {
    const state = getMessageEditBottomActionsState();
    if (state.updateFrame) {
        return;
    }

    state.updateFrame = requestAnimationFrame(() => {
        state.updateFrame = 0;
        updateMessageEditBottomActions();
    });
}

function updateMessageEditBottomActions() {
    if (settings.messageEditBottomActionsEnabled === false) {
        removeMessageEditBottomActions();
        return;
    }

    const chat = document.querySelector('#chat');
    if (!(chat instanceof HTMLElement)) {
        installMessageEditBottomActions();
        return;
    }

    const state = getMessageEditBottomActionsState();
    if (!state.observer || state.chatElement !== chat || !document.getElementById(MESSAGE_EDIT_BOTTOM_ACTIONS_STYLE_ID)) {
        installMessageEditBottomActions();
    }

    const activeEditor = chat.querySelector('#curEditTextarea');
    cleanupInactiveMessageEditBottomActions(activeEditor);

    if (!(activeEditor instanceof HTMLElement)) {
        return;
    }

    ensureMessageEditBottomActionsForEditor(activeEditor);
}

function cleanupInactiveMessageEditBottomActions(activeEditor) {
    const activeMessage = activeEditor instanceof HTMLElement ? activeEditor.closest('.mes') : null;
    document.querySelectorAll(`#chat .${MESSAGE_EDIT_BOTTOM_ACTIONS_CLASS}`).forEach(container => {
        if (container.closest('.mes') !== activeMessage) {
            container.remove();
        }
    });
}

function ensureMessageEditBottomActionsForEditor(editor) {
    const message = editor.closest('.mes');
    const host = editor.parentElement;
    if (!(message instanceof HTMLElement) || !(host instanceof HTMLElement)) {
        return;
    }

    const topConfirm = message.querySelector('.mes_edit_buttons .mes_edit_done');
    const topCancel = message.querySelector('.mes_edit_buttons .mes_edit_cancel');
    if (!(topConfirm instanceof HTMLElement) || !(topCancel instanceof HTMLElement)) {
        return;
    }

    const existingContainers = Array.from(message.querySelectorAll(`.${MESSAGE_EDIT_BOTTOM_ACTIONS_CLASS}`));
    let container = existingContainers.find(element => element.parentElement === host);
    for (const element of existingContainers) {
        if (element !== container) {
            element.remove();
        }
    }

    if (!(container instanceof HTMLElement)) {
        container = document.createElement('div');
        container.className = MESSAGE_EDIT_BOTTOM_ACTIONS_CLASS;
        container.dataset.baiBaiToolkit = 'message-edit-bottom-actions';
    }

    if (container.parentElement !== host || container.previousElementSibling !== editor) {
        editor.insertAdjacentElement('afterend', container);
    }

    if (container.dataset.ready === 'true') {
        return;
    }

    const bottomConfirm = cloneMessageEditBottomAction(topConfirm, 'bottom-confirm');
    const bottomCancel = cloneMessageEditBottomAction(topCancel, 'bottom-cancel');
    container.replaceChildren(bottomCancel, bottomConfirm);
    container.dataset.ready = 'true';
}

function cloneMessageEditBottomAction(source, actionName) {
    const clone = source.cloneNode(false);
    clone.dataset.baiBaiToolkitBottomAction = actionName;
    clone.removeAttribute('id');
    clone.addEventListener('click', () => {
        scheduleMessageEditBottomActionScrollRestore(clone);
    }, true);
    return clone;
}

function scheduleMessageEditBottomActionScrollRestore(button) {
    const snapshot = captureMessageEditBottomActionScrollSnapshot(button);
    if (!snapshot) {
        return;
    }

    const restore = () => {
        restoreMessageEditBottomActionScroll(snapshot);
    };

    requestAnimationFrame(() => {
        restore();
        requestAnimationFrame(restore);
    });

    for (const delay of MESSAGE_EDIT_BOTTOM_ACTION_SCROLL_RESTORE_DELAYS) {
        setTimeout(restore, delay);
    }

    installMessageEditBottomActionUpdatedRestore(snapshot, restore);
}

function captureMessageEditBottomActionScrollSnapshot(button) {
    const chat = document.querySelector('#chat');
    const message = button instanceof HTMLElement ? button.closest('.mes[mesid]') : null;

    if (!(chat instanceof HTMLElement) || !(message instanceof HTMLElement)) {
        return null;
    }

    const chatRect = chat.getBoundingClientRect();
    const messageRect = message.getBoundingClientRect();
    return {
        messageId: message.getAttribute('mesid'),
        bottomInChat: messageRect.bottom - chatRect.top,
    };
}

function installMessageEditBottomActionUpdatedRestore(snapshot, restore) {
    if (typeof eventSource?.on !== 'function' || !event_types.MESSAGE_UPDATED) {
        return;
    }

    let cleanupTimer = null;
    const cleanup = () => {
        clearTimeout(cleanupTimer);
        eventSource.removeListener?.(event_types.MESSAGE_UPDATED, updatedHandler);
    };
    const updatedHandler = (messageId) => {
        if (String(messageId) !== String(snapshot.messageId)) {
            return;
        }

        cleanup();
        restore();
        setTimeout(restore, 0);
        setTimeout(restore, 50);
        setTimeout(restore, 160);
    };

    eventSource.on(event_types.MESSAGE_UPDATED, updatedHandler);
    cleanupTimer = setTimeout(cleanup, 5000);
}

function restoreMessageEditBottomActionScroll(snapshot) {
    const chat = document.querySelector('#chat');
    if (!(chat instanceof HTMLElement) || snapshot?.messageId == null) {
        return;
    }

    const messageId = escapeMessageEditBottomActionSelectorValue(String(snapshot.messageId));
    const message = document.querySelector(`#chat .mes[mesid="${messageId}"]`);
    if (!(message instanceof HTMLElement)) {
        return;
    }

    const chatRect = chat.getBoundingClientRect();
    const messageRect = message.getBoundingClientRect();
    const currentBottomInChat = messageRect.bottom - chatRect.top;
    const delta = currentBottomInChat - Number(snapshot.bottomInChat);

    if (Math.abs(delta) > 1) {
        chat.scrollTop += delta;
    }
}

function escapeMessageEditBottomActionSelectorValue(value) {
    if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
        return CSS.escape(value);
    }

    return value.replace(/["\\]/g, '\\$&');
}

function ensureMessageEditBottomActionsStyle() {
    let style = document.getElementById(MESSAGE_EDIT_BOTTOM_ACTIONS_STYLE_ID);
    if (!style) {
        style = document.createElement('style');
        style.id = MESSAGE_EDIT_BOTTOM_ACTIONS_STYLE_ID;
        document.head.append(style);
    }

    const css = `
#chat .${MESSAGE_EDIT_BOTTOM_ACTIONS_CLASS} {
    display: flex;
    justify-content: flex-end;
    align-items: center;
    gap: 6px;
    width: 100%;
    margin-top: 8px;
}

#chat .${MESSAGE_EDIT_BOTTOM_ACTIONS_CLASS} .menu_button {
    flex: 0 0 auto;
    opacity: 0.5;
    padding: 0;
    font-size: 1rem;
    height: 2rem;
    margin-top: 0;
    margin-bottom: 0;
    aspect-ratio: 1 / 1;
    display: flex;
    justify-content: center;
    align-items: center;
}

#chat .${MESSAGE_EDIT_BOTTOM_ACTIONS_CLASS} .menu_button:hover {
    opacity: 1;
}
`;

    if (style.textContent !== css) {
        style.textContent = css;
    }
}

export {
    applyMessageEditBottomActions,
    captureMessageEditBottomActionScrollSnapshot,
    cleanupInactiveMessageEditBottomActions,
    cloneMessageEditBottomAction,
    ensureMessageEditBottomActionsForEditor,
    ensureMessageEditBottomActionsStyle,
    escapeMessageEditBottomActionSelectorValue,
    getMessageEditBottomActionsState,
    installMessageEditBottomActionUpdatedRestore,
    installMessageEditBottomActions,
    isMessageEditBottomActionsMutationRelevant,
    isMessageEditBottomActionsMutationTargetRelevant,
    isMessageEditBottomActionsNodeRelevant,
    removeMessageEditBottomActions,
    restoreMessageEditBottomActionScroll,
    scheduleMessageEditBottomActionScrollRestore,
    scheduleMessageEditBottomActionsUpdate,
    updateMessageEditBottomActions,
};
