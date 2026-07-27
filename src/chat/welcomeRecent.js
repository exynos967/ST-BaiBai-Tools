import { characters, getCurrentChatId, openCharacterChat, saveSettingsDebounced, selectCharacterById, setActiveCharacter, this_chid } from '@sillytavern/script';
import { t } from '@sillytavern/scripts/i18n';
import { WELCOME_PANEL_SELECTOR, WELCOME_RECENT_CHAT_ACTION_SELECTOR, WELCOME_RECENT_CHAT_DIRECT_OPEN_CURRENT_HANDLER_KEY, WELCOME_RECENT_CHAT_DIRECT_OPEN_HANDLER_KEY, WELCOME_RECENT_CHAT_SELECTOR } from './constants.js';
import { createOrEditCharacter, unshallowCharacter } from './hostAliases.js';
import { LOG_PREFIX, extensionState, settings } from './state.js';

function applyWelcomeRecentChatDirectOpenOptimization() {
    const existingHandler = extensionState[WELCOME_RECENT_CHAT_DIRECT_OPEN_HANDLER_KEY];

    if (existingHandler?.[WELCOME_RECENT_CHAT_DIRECT_OPEN_CURRENT_HANDLER_KEY]) {
        return;
    }

    if (typeof existingHandler === 'function') {
        document.removeEventListener('click', existingHandler, true);
    }

    const clickHandler = (event) => {
        handleWelcomeRecentChatDirectOpenClick(event);
    };
    clickHandler[WELCOME_RECENT_CHAT_DIRECT_OPEN_CURRENT_HANDLER_KEY] = true;

    extensionState[WELCOME_RECENT_CHAT_DIRECT_OPEN_HANDLER_KEY] = clickHandler;
    document.addEventListener('click', clickHandler, true);
}

function handleWelcomeRecentChatDirectOpenClick(event) {
    if (!settings.welcomeRecentChatDirectOpenEnabled) {
        return;
    }

    const target = event.target instanceof Element ? event.target : null;
    if (!target || target.closest(WELCOME_RECENT_CHAT_ACTION_SELECTOR)) {
        return;
    }

    const item = target.closest(WELCOME_RECENT_CHAT_SELECTOR);
    if (!(item instanceof HTMLElement)) {
        return;
    }

    const avatarId = item.getAttribute('data-avatar');
    const groupId = item.getAttribute('data-group');
    const fileName = item.getAttribute('data-file');

    if (!avatarId || !fileName || groupId) {
        return;
    }

    const characterId = characters.findIndex(character => character?.avatar === avatarId);
    if (characterId === -1) {
        return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    if (extensionState.welcomeRecentChatDirectOpenPromise) {
        return;
    }

    extensionState.welcomeRecentChatDirectOpenPromise = openWelcomeRecentCharacterChatDirectly(characterId, avatarId, fileName)
        .finally(() => {
            extensionState.welcomeRecentChatDirectOpenPromise = null;
        });
}

async function openWelcomeRecentCharacterChatDirectly(characterId, avatarId, fileName) {
    try {
        await ensureWelcomeRecentChatCharacterHydrated(characterId);

        const character = characters[characterId];
        if (!character) {
            console.error(`${LOG_PREFIX} Character not found for avatar ID: ${avatarId}`);
            return;
        }

        if (String(this_chid) === String(characterId)) {
            setActiveCharacter(avatarId);
            saveSettingsDebounced();

            if (isWelcomeRecentChatAlreadyDisplayed(fileName)) {
                console.debug(`${LOG_PREFIX} Chat ${fileName} is already open.`);
                return;
            }

            await openCharacterChat(fileName);
            return;
        }

        const previousChat = character.chat;
        character.chat = fileName;

        await selectCharacterById(characterId);

        if (String(this_chid) !== String(characterId)) {
            if (character.chat === fileName && previousChat !== fileName) {
                character.chat = previousChat;
            }
            return;
        }

        setActiveCharacter(avatarId);
        saveSettingsDebounced();

        if (getCurrentChatId() !== fileName) {
            await openCharacterChat(fileName);
            return;
        }

        if (previousChat !== fileName) {
            if (typeof createOrEditCharacter === 'function') {
                await createOrEditCharacter(new CustomEvent('newChat'));
            } else {
                await openCharacterChat(fileName);
            }
        }
    } catch (error) {
        console.error(`${LOG_PREFIX} Error opening recent chat`, error);
        toastr.error(t`Failed to open recent chat. See console for details.`);
    }
}

async function ensureWelcomeRecentChatCharacterHydrated(characterId) {
    if (typeof unshallowCharacter !== 'function' || !characters[characterId]?.shallow) {
        return;
    }

    // ST replaces shallow character objects during getChat(), so expand before writing character.chat.
    await unshallowCharacter(characterId);
}

function isWelcomeRecentChatAlreadyDisplayed(fileName) {
    return getCurrentChatId() === fileName && !isWelcomePageDisplayed();
}

function isWelcomePageDisplayed(root = document) {
    if (!(root instanceof Document || root instanceof Element)) {
        return false;
    }

    return Boolean(root.querySelector(WELCOME_PANEL_SELECTOR));
}

export {
    applyWelcomeRecentChatDirectOpenOptimization,
    ensureWelcomeRecentChatCharacterHydrated,
    handleWelcomeRecentChatDirectOpenClick,
    isWelcomePageDisplayed,
    isWelcomeRecentChatAlreadyDisplayed,
    openWelcomeRecentCharacterChatDirectly,
};
