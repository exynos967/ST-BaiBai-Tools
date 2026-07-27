import { saveSettings } from '@sillytavern/script';
import { t } from '@sillytavern/scripts/i18n';
import { oai_settings, promptManager } from '@sillytavern/scripts/openai';
import { PRESET_FAVORITES_EXTENSION_PATH, PRESET_VUE_FAVORITES_ENTRY_ID } from './constants.js';
import { preparePromptManagerCustomDragList } from './dragCustom.js';
import { getCurrentPresetPromptOrderIds } from './groupState.js';
import { markOpenAiPresetSavePending } from './pendingChanges.js';
import { LOG_PREFIX } from './state.js';
import { areStringArraysEqual, readCurrentPresetExtensionField, setObjectPath } from './util.js';
import { clearPresetVuePromptGroupBodyUnmountTimer, getPresetVuePromptListManagerState, getPromptManagerListElement, isPresetVuePromptGroupBodyMounted, runPresetVuePromptBodyHeightTransition, schedulePresetVuePromptGroupBodyUnmount, setPresetVuePromptGroupBodyMounted, syncPresetVuePromptListManagerState } from './vueList.js';
import { renderPresetVuePromptRow } from './vueRender.js';

function renderPresetVuePromptFavorites(h, item) {
    const children = Array.isArray(item?.children) ? item.children : [];
    const model = getPresetVuePromptListManagerState().state;
    const mounted = isPresetVuePromptGroupBodyMounted(model, item);

    if (!children.length) {
        return null;
    }

    return h('li', {
        class: [
            'bai-bai-preset-favorites',
            item.collapsed ? 'bai-bai-preset-favorites-collapsed' : '',
        ],
        key: PRESET_VUE_FAVORITES_ENTRY_ID,
    }, [
        h('div', {
            class: 'bai-bai-preset-favorites-header',
            onClick: event => {
                event.preventDefault();
                event.stopPropagation();
                togglePresetVuePromptFavoritesCollapsed();
            },
        }, [
            h('span', { class: 'bai-bai-preset-favorites-title' }, [
                h('span', {
                    class: [
                        'menu_button',
                        'bai-bai-preset-favorites-toggle',
                        'fa-solid',
                        'fa-chevron-down',
                    ],
                    title: item.collapsed ? t`展开收藏` : t`收起收藏`,
                }),
                h('span', { class: 'fa-solid fa-star bai-bai-preset-favorites-icon', title: t`收藏` }),
                h('strong', null, t`收藏`),
                h('small', { class: 'bai-bai-preset-favorites-count' }, `(${children.length})`),
            ]),
        ]),
        h('div', {
            class: 'bai-bai-preset-favorites-body',
            'aria-hidden': item.collapsed ? 'true' : 'false',
        }, [
            h('div', { class: 'bai-bai-preset-favorites-body-inner' }, mounted ? [
                h('ul', { class: 'bai-bai-preset-favorites-list' }, children.map(child => renderPresetVuePromptRow(h, child, {
                    favoriteMirror: true,
                }))),
            ] : []),
        ]),
    ]);
}

function getCurrentPresetPromptFavorites(validPromptIds = getCurrentPresetPromptOrderIds()) {
    return getCurrentPresetPromptFavoritesState(validPromptIds).promptIds;
}

function getCurrentPresetPromptFavoritesState(validPromptIds = getCurrentPresetPromptOrderIds()) {
    return normalizePresetPromptFavoritesState(
        readCurrentPresetExtensionField(PRESET_FAVORITES_EXTENSION_PATH),
        validPromptIds,
    );
}

function normalizePresetPromptFavoritesState(value, validPromptIds = getCurrentPresetPromptOrderIds()) {
    return {
        version: 1,
        promptIds: normalizePresetPromptFavorites(value, validPromptIds),
        collapsed: Boolean(value && typeof value === 'object' && !Array.isArray(value) && value.collapsed),
    };
}

function normalizePresetPromptFavorites(value, validPromptIds = getCurrentPresetPromptOrderIds()) {
    const source = Array.isArray(value)
        ? value
        : Array.isArray(value?.promptIds)
            ? value.promptIds
            : [];
    const validPromptIdSet = validPromptIds instanceof Set
        ? validPromptIds
        : new Set((validPromptIds ?? []).filter(Boolean));
    const shouldFilter = validPromptIdSet.size > 0;
    const seen = new Set();
    const favorites = [];

    for (const rawPromptId of source) {
        const promptId = String(rawPromptId || '');

        if (!promptId || seen.has(promptId)) {
            continue;
        }

        if (shouldFilter && !validPromptIdSet.has(promptId)) {
            continue;
        }

        seen.add(promptId);
        favorites.push(promptId);
    }

    return favorites;
}

function isCurrentPresetPromptFavorite(promptId) {
    return Boolean(promptId && getCurrentPresetPromptFavorites().includes(promptId));
}

function toggleCurrentPresetPromptFavorite(promptId) {
    if (!promptId) {
        return false;
    }

    const favorites = getCurrentPresetPromptFavorites();
    const nextFavorites = favorites.includes(promptId)
        ? favorites.filter(id => id !== promptId)
        : [...favorites, promptId];

    if (!setCurrentPresetPromptFavorites(nextFavorites)) {
        return favorites.includes(promptId);
    }

    syncPresetVuePromptListManagerState();
    preparePromptManagerCustomDragList(getPromptManagerListElement(), {
        signature: getPresetVuePromptListManagerState().lastStructureSignature,
    });
    return nextFavorites.includes(promptId);
}

function removeCurrentPresetPromptFavorite(promptId) {
    if (!promptId) {
        return false;
    }

    const favorites = getCurrentPresetPromptFavorites();

    if (!favorites.includes(promptId)) {
        return false;
    }

    return setCurrentPresetPromptFavorites(favorites.filter(id => id !== promptId));
}

function setCurrentPresetPromptFavorites(favoriteIds, { persist = true } = {}) {
    return setCurrentPresetPromptFavoritesState({ promptIds: favoriteIds }, { persist });
}

function setCurrentPresetPromptFavoritesState(nextState, { persist = true } = {}) {
    const presetName = oai_settings?.preset_settings_openai;

    if (!presetName) {
        return false;
    }

    const validPromptIds = getCurrentPresetPromptOrderIds();
    const currentState = getCurrentPresetPromptFavoritesState(validPromptIds);
    const normalizedState = {
        version: 1,
        promptIds: normalizePresetPromptFavorites(nextState?.promptIds, validPromptIds),
        collapsed: nextState?.collapsed === undefined ? currentState.collapsed : Boolean(nextState.collapsed),
    };

    if (
        currentState.collapsed === normalizedState.collapsed
        && areStringArraysEqual(currentState.promptIds, normalizedState.promptIds)
    ) {
        return false;
    }

    applyPresetPromptFavoritesToMemory(presetName, normalizedState);

    if (persist) {
        markOpenAiPresetSavePending(presetName);
        void saveSettings().catch(error => {
            console.debug(`${LOG_PREFIX} Failed to save preset prompt favorites`, error);
        });
    }

    return true;
}

function applyPresetPromptFavoritesToMemory(presetName, favoritesState) {
    const normalizedState = normalizePresetPromptFavoritesState(favoritesState, getCurrentPresetPromptOrderIds());

    if (oai_settings?.preset_settings_openai === presetName) {
        oai_settings.extensions = oai_settings.extensions && typeof oai_settings.extensions === 'object'
            ? oai_settings.extensions
            : {};
        setObjectPath(oai_settings.extensions, PRESET_FAVORITES_EXTENSION_PATH, normalizedState);

        if (promptManager?.serviceSettings && typeof promptManager.serviceSettings === 'object') {
            promptManager.serviceSettings.extensions = promptManager.serviceSettings.extensions && typeof promptManager.serviceSettings.extensions === 'object'
                ? promptManager.serviceSettings.extensions
                : {};
            setObjectPath(promptManager.serviceSettings.extensions, PRESET_FAVORITES_EXTENSION_PATH, normalizedState);
        }
    }

}

function togglePresetVuePromptFavoritesCollapsed() {
    const manager = getPresetVuePromptListManagerState();
    const model = manager.state;
    const favoritesState = getCurrentPresetPromptFavoritesState();
    const nextCollapsed = !favoritesState.collapsed;
    const mountId = PRESET_VUE_FAVORITES_ENTRY_ID;

    runPresetVuePromptBodyHeightTransition(mountId, !nextCollapsed, () => {
        if (!nextCollapsed) {
            clearPresetVuePromptGroupBodyUnmountTimer(manager, mountId);
            setPresetVuePromptGroupBodyMounted(model, mountId, true);
        }

        const modelFavorites = model?.items?.find(item => item?.type === 'favorites');

        if (modelFavorites) {
            modelFavorites.collapsed = nextCollapsed;
        }

        if (nextCollapsed) {
            schedulePresetVuePromptGroupBodyUnmount(mountId);
        }

        setCurrentPresetPromptFavoritesState({
            promptIds: favoritesState.promptIds,
            collapsed: nextCollapsed,
        });
    });
}

export {
    applyPresetPromptFavoritesToMemory,
    getCurrentPresetPromptFavorites,
    getCurrentPresetPromptFavoritesState,
    isCurrentPresetPromptFavorite,
    normalizePresetPromptFavorites,
    normalizePresetPromptFavoritesState,
    removeCurrentPresetPromptFavorite,
    renderPresetVuePromptFavorites,
    setCurrentPresetPromptFavorites,
    setCurrentPresetPromptFavoritesState,
    toggleCurrentPresetPromptFavorite,
    togglePresetVuePromptFavoritesCollapsed,
};
