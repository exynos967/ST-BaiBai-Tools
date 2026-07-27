import { event_types, eventSource } from '@sillytavern/script';
import { CHAT_DELETE_EDIT_HANDLER_KEY, CHAT_DELETE_EDIT_WINDOW_MS, CHAT_DELETE_GENERATION_ACTION_HANDLER_KEY, CHAT_DELETE_MESSAGE_DELETED_HANDLER_KEY, CHAT_GENERATION_ACTION_SELECTOR, CHAT_MESSAGE_EDIT_SELECTOR } from './constants.js';
import { createOrEditCharacter, messageEdit } from './hostAliases.js';
import { LOG_PREFIX, extensionState, settings } from './state.js';
import { waitForNextPaint } from './util.js';

function isWelcomeRecentChatDirectOpenCompatibilityMode() {
    return typeof createOrEditCharacter !== 'function';
}

function isChatDeleteEditFlowSupported() {
    return typeof messageEdit === 'function';
}

function applyChatDeleteEditFlowOptimization() {
    if (!isChatDeleteEditFlowSupported()) {
        endChatDeleteEditWindow();
        return;
    }

    if (extensionState[CHAT_DELETE_EDIT_HANDLER_KEY]) {
        return;
    }

    const clickHandler = (event) => {
        handleChatDeleteEditFlowClick(event);
    };
    const generationActionHandler = (event) => {
        handleChatGenerationActionClick(event);
    };
    const messageDeletedHandler = () => {
        scheduleChatDeleteEditWindowEnd(1500);
    };

    extensionState[CHAT_DELETE_EDIT_HANDLER_KEY] = clickHandler;
    extensionState[CHAT_DELETE_GENERATION_ACTION_HANDLER_KEY] = generationActionHandler;
    extensionState[CHAT_DELETE_MESSAGE_DELETED_HANDLER_KEY] = messageDeletedHandler;

    document.addEventListener('click', clickHandler, true);
    document.addEventListener('click', generationActionHandler, true);
    eventSource.on(event_types.MESSAGE_DELETED, messageDeletedHandler);
}

function handleChatDeleteEditFlowClick(event) {
    if (!settings.chatDeleteEditFlowOptimizationEnabled || !isChatDeleteEditFlowSupported()) {
        endChatDeleteEditWindow();
        return;
    }

    const target = event.target instanceof Element ? event.target : null;
    if (!target) {
        return;
    }

    if (target.closest('#dialogue_del_mes_ok')) {
        if (hasSelectedMessageForDeletion()) {
            startChatDeleteEditWindow();
        }
        return;
    }

    const editButton = target.closest(CHAT_MESSAGE_EDIT_SELECTOR);
    if (!editButton || !isChatDeleteEditWindowActive()) {
        return;
    }

    if (hasActiveMessageEditor()) {
        return;
    }

    const messageElement = editButton.closest('.mes[mesid]');
    const messageId = Number(messageElement?.getAttribute('mesid'));
    if (!Number.isInteger(messageId) || messageId < 0) {
        return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    void openMessageEditorDuringDeleteFlow(messageId);
}

function hasSelectedMessageForDeletion() {
    return Boolean(document.querySelector('#chat .mes.selected, #chat .del_checkbox:checked'));
}

function startChatDeleteEditWindow() {
    clearTimeout(extensionState.chatDeleteEditWindowTimer);
    extensionState.chatDeleteEditWindowActive = true;
    extensionState.chatDeleteEditWindowStartedAt = Date.now();
    extensionState.chatDeleteEditWindowTimer = setTimeout(endChatDeleteEditWindow, CHAT_DELETE_EDIT_WINDOW_MS);
}

function scheduleChatDeleteEditWindowEnd(delayMs) {
    if (!extensionState.chatDeleteEditWindowActive) {
        return;
    }

    clearTimeout(extensionState.chatDeleteEditWindowTimer);
    extensionState.chatDeleteEditWindowTimer = setTimeout(endChatDeleteEditWindow, delayMs);
}

function endChatDeleteEditWindow() {
    clearTimeout(extensionState.chatDeleteEditWindowTimer);
    extensionState.chatDeleteEditWindowActive = false;
    extensionState.chatDeleteEditWindowStartedAt = 0;
}

function isChatDeleteEditWindowActive() {
    return Boolean(
        extensionState.chatDeleteEditWindowActive
        && Date.now() - Number(extensionState.chatDeleteEditWindowStartedAt || 0) <= CHAT_DELETE_EDIT_WINDOW_MS,
    );
}

async function openMessageEditorDuringDeleteFlow(messageId) {
    if (!isChatDeleteEditFlowSupported()) {
        return;
    }

    try {
        await messageEdit(messageId);
        const editor = document.querySelector('#curEditTextarea');
        const editedMessage = editor?.closest('.mes[mesid]');
        const editedMessageId = Number(editedMessage?.getAttribute('mesid'));

        if (Number.isInteger(editedMessageId)) {
            extensionState.chatDeleteFastEditorMesId = editedMessageId;
        }
    } catch (error) {
        console.debug(`${LOG_PREFIX} Failed to open message editor after message deletion`, error);
    }
}

function handleChatGenerationActionClick(event) {
    if (!settings.chatDeleteEditFlowOptimizationEnabled || !isChatDeleteEditFlowSupported() || extensionState.chatDeleteEditReplayingAction) {
        return;
    }

    if (!isFastDeleteEditorActive()) {
        return;
    }

    const target = event.target instanceof Element ? event.target : null;
    const action = target?.closest(CHAT_GENERATION_ACTION_SELECTOR);
    if (!action) {
        return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    void commitFastDeleteEditorAndReplayAction(action);
}

function hasActiveMessageEditor() {
    return Boolean(document.querySelector('#curEditTextarea') || document.querySelector('.reasoning_edit_textarea'));
}

function isFastDeleteEditorActive() {
    const editor = document.querySelector('#curEditTextarea');
    const message = editor?.closest('.mes[mesid]');
    const messageId = Number(message?.getAttribute('mesid'));

    return Boolean(
        editor
        && Number.isInteger(messageId)
        && Number(extensionState.chatDeleteFastEditorMesId) === messageId,
    );
}

async function commitFastDeleteEditorAndReplayAction(action) {
    if (!(action instanceof HTMLElement)) {
        return;
    }

    try {
        await commitFastDeleteEditor();
        await waitForNextPaint();
        replayChatGenerationAction(action);
    } catch (error) {
        console.debug(`${LOG_PREFIX} Failed to commit message edit before generation action`, error);
    }
}

async function commitFastDeleteEditor() {
    if (extensionState.chatDeleteEditCommitPromise) {
        return extensionState.chatDeleteEditCommitPromise;
    }

    const doneButton = $('#chat .mes_edit_done:visible').last();
    if (!doneButton.length) {
        extensionState.chatDeleteFastEditorMesId = null;
        return;
    }

    const messageId = Number(doneButton.closest('.mes[mesid]').attr('mesid'));
    const updatedPromise = waitForMessageUpdated(messageId, 3000);

    extensionState.chatDeleteEditCommitPromise = updatedPromise
        .finally(() => {
            extensionState.chatDeleteEditCommitPromise = null;
            extensionState.chatDeleteFastEditorMesId = null;
        });

    doneButton.trigger('click');
    await extensionState.chatDeleteEditCommitPromise;
}

function waitForMessageUpdated(messageId, timeoutMs) {
    return new Promise((resolve) => {
        let settled = false;
        const finish = () => {
            if (settled) {
                return;
            }

            settled = true;
            clearTimeout(timeout);
            eventSource.removeListener?.(event_types.MESSAGE_UPDATED, handler);
            resolve();
        };
        const handler = (updatedMessageId) => {
            if (!Number.isInteger(messageId) || Number(updatedMessageId) === messageId) {
                finish();
            }
        };
        const timeout = setTimeout(finish, timeoutMs);

        eventSource.on(event_types.MESSAGE_UPDATED, handler);
    });
}

function replayChatGenerationAction(action) {
    if (!action.isConnected) {
        return;
    }

    extensionState.chatDeleteEditReplayingAction = true;
    try {
        action.dispatchEvent(new MouseEvent('click', {
            bubbles: true,
            cancelable: true,
            view: window,
        }));
    } finally {
        setTimeout(() => {
            extensionState.chatDeleteEditReplayingAction = false;
        }, 0);
    }
}

export {
    applyChatDeleteEditFlowOptimization,
    commitFastDeleteEditor,
    commitFastDeleteEditorAndReplayAction,
    endChatDeleteEditWindow,
    handleChatDeleteEditFlowClick,
    handleChatGenerationActionClick,
    hasActiveMessageEditor,
    hasSelectedMessageForDeletion,
    isChatDeleteEditFlowSupported,
    isChatDeleteEditWindowActive,
    isFastDeleteEditorActive,
    isWelcomeRecentChatDirectOpenCompatibilityMode,
    openMessageEditorDuringDeleteFlow,
    replayChatGenerationAction,
    scheduleChatDeleteEditWindowEnd,
    startChatDeleteEditWindow,
    waitForMessageUpdated,
};
