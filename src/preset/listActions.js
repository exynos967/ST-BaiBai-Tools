import { t } from '@sillytavern/scripts/i18n';
import { promptManager } from '@sillytavern/scripts/openai';
import { callGenericPopup, POPUP_TYPE } from '@sillytavern/scripts/popup';
import { escapeHtml, uuidv4 } from '@sillytavern/scripts/utils';
import { schedulePresetPromptCodeMirrorEditorRefresh } from './codeMirror.js';
import { PRESET_PROMPT_DELETE_CHOICE_DELETE, PRESET_PROMPT_DELETE_CHOICE_DETACH, PRESET_PROMPT_MANAGER_LIST_SELECTOR, refreshPromptManagerTokensDebounced } from './constants.js';
import { preparePromptManagerCustomDragList } from './dragCustom.js';
import { removeCurrentPresetPromptFavorite, toggleCurrentPresetPromptFavorite } from './favorites.js';
import { addPresetPromptToGlobalLibrary, createPresetGlobalLibraryGroup, deletePresetGlobalLibraryGroup, deletePresetGlobalPromptLibraryItem, deleteSelectedPresetGlobalLibraryItems, editPresetGlobalPromptLibraryItem, getPresetGlobalLibraryGroupIdFromAction, getPresetGlobalLibraryItemIdFromAction, getPresetPromptIdFromAction, insertPresetGlobalPromptLibraryItemToCurrentPreset, insertSelectedPresetGlobalLibraryItemsToCurrentPreset, isPresetPromptAssignedToExistingGroup, moveSelectedPresetGlobalLibraryItemsToGroup, renamePresetGlobalLibraryGroup, togglePresetGlobalLibrarySelectedItem, togglePresetGlobalLibrarySelecting } from './globalLibrary.js';
import { getCurrentPresetPromptOrderIds, getPresetPromptGroupState, normalizePresetPromptGroupState, savePresetPromptGroupSettings } from './groupState.js';
import { flushPendingPresetPromptChanges, markOpenAiPresetSavePending, markPresetPromptServiceSettingsSavePending, removeUnusedPresetPromptGroups } from './pendingChanges.js';
import { saveOpenAiPresetAfterPromptEdit } from './saveToggle.js';
import { LOG_PREFIX, settings } from './state.js';
import { isPromptManagerReadyForFastPresetSwitch, renderPromptManagerListWithoutTokenStats } from './switchFast.js';
import { isPresetGroupingEnabled } from './util.js';
import { getPresetVuePromptListManagerState, getPromptManagerListElement, isPresetVuePromptListManagerActive, syncPresetVuePromptListManagerState } from './vueList.js';
import { startPresetVuePromptGroupRangeSelection } from './vueModel.js';
import { isPresetPromptDeleteOrDetachAllowed } from './vueRender.js';

async function handlePresetPromptActionButtonClick(event, action = null) {
    action ||= event?.currentTarget instanceof Element ? event.currentTarget : null;

    if (!(action instanceof Element)) {
        return;
    }

    const presetAction = action.getAttribute('data-preset-prompt-action');
    const promptId = getPresetPromptIdFromAction(action);

    if (presetAction === 'favorite') {
        event.preventDefault?.();
        event.stopPropagation?.();
        event.stopImmediatePropagation?.();
        closePresetPromptActionMenus();
        toggleCurrentPresetPromptFavorite(promptId);
        return;
    }

    if (presetAction === 'global-library') {
        event.preventDefault?.();
        event.stopPropagation?.();
        event.stopImmediatePropagation?.();
        closePresetPromptActionMenus();
        void addPresetPromptToGlobalLibrary(promptId);
        return;
    }

    if (presetAction === 'group-range') {
        event.preventDefault?.();
        event.stopPropagation?.();
        event.stopImmediatePropagation?.();
        closePresetPromptActionMenus();

        if (!isPresetGroupingEnabled()) {
            toastr.warning(t`请先开启预设分组。`);
            return;
        }

        if (!promptId) {
            toastr.warning(t`没有找到要作为起点的预设条目。`);
            return;
        }

        if (isPresetPromptAssignedToExistingGroup(promptId)) {
            toastr.warning(t`分组内条目暂不支持再次创建分组。`);
            return;
        }

        void startPresetVuePromptGroupRangeSelection(getPresetVuePromptListManagerState().state, { startId: promptId });
        return;
    }

    if (presetAction === 'global-library-new-group') {
        event.preventDefault?.();
        event.stopPropagation?.();
        event.stopImmediatePropagation?.();
        closePresetPromptActionMenus();
        void createPresetGlobalLibraryGroup();
        return;
    }

    if (presetAction === 'global-library-toggle-select') {
        event.preventDefault?.();
        event.stopPropagation?.();
        event.stopImmediatePropagation?.();
        closePresetPromptActionMenus();
        togglePresetGlobalLibrarySelecting();
        return;
    }

    if (presetAction === 'global-library-select-item') {
        event.preventDefault?.();
        event.stopPropagation?.();
        event.stopImmediatePropagation?.();
        togglePresetGlobalLibrarySelectedItem(getPresetGlobalLibraryItemIdFromAction(action));
        return;
    }

    if (presetAction === 'global-library-insert-selected') {
        event.preventDefault?.();
        event.stopPropagation?.();
        event.stopImmediatePropagation?.();
        closePresetPromptActionMenus();
        void insertSelectedPresetGlobalLibraryItemsToCurrentPreset();
        return;
    }

    if (presetAction === 'global-library-move-selected') {
        event.preventDefault?.();
        event.stopPropagation?.();
        event.stopImmediatePropagation?.();
        closePresetPromptActionMenus();
        void moveSelectedPresetGlobalLibraryItemsToGroup();
        return;
    }

    if (presetAction === 'global-library-delete-selected') {
        event.preventDefault?.();
        event.stopPropagation?.();
        event.stopImmediatePropagation?.();
        closePresetPromptActionMenus();
        void deleteSelectedPresetGlobalLibraryItems();
        return;
    }

    if (presetAction === 'global-library-group-rename') {
        event.preventDefault?.();
        event.stopPropagation?.();
        event.stopImmediatePropagation?.();
        closePresetPromptActionMenus();
        void renamePresetGlobalLibraryGroup(getPresetGlobalLibraryGroupIdFromAction(action));
        return;
    }

    if (presetAction === 'global-library-group-delete') {
        event.preventDefault?.();
        event.stopPropagation?.();
        event.stopImmediatePropagation?.();
        closePresetPromptActionMenus();
        void deletePresetGlobalLibraryGroup(getPresetGlobalLibraryGroupIdFromAction(action));
        return;
    }

    if (presetAction === 'global-library-insert') {
        event.preventDefault?.();
        event.stopPropagation?.();
        event.stopImmediatePropagation?.();
        closePresetPromptActionMenus();
        void insertPresetGlobalPromptLibraryItemToCurrentPreset(getPresetGlobalLibraryItemIdFromAction(action));
        return;
    }

    if (presetAction === 'global-library-edit') {
        event.preventDefault?.();
        event.stopPropagation?.();
        event.stopImmediatePropagation?.();
        closePresetPromptActionMenus();
        void editPresetGlobalPromptLibraryItem(getPresetGlobalLibraryItemIdFromAction(action));
        return;
    }

    if (presetAction === 'global-library-delete') {
        event.preventDefault?.();
        event.stopPropagation?.();
        event.stopImmediatePropagation?.();
        closePresetPromptActionMenus();
        void deletePresetGlobalPromptLibraryItem(getPresetGlobalLibraryItemIdFromAction(action));
        return;
    }

    if (presetAction === 'copy') {
        event.preventDefault?.();
        event.stopPropagation?.();
        event.stopImmediatePropagation?.();
        closePresetPromptActionMenus();
        void copyPresetPromptEntryFromAction(action);
        return;
    }

    if (presetAction === 'delete') {
        event.preventDefault?.();
        event.stopPropagation?.();
        event.stopImmediatePropagation?.();
        closePresetPromptActionMenus();

        const choice = await promptPresetPromptDeleteChoice(promptId);

        if (choice === PRESET_PROMPT_DELETE_CHOICE_DELETE) {
            await deleteCurrentPresetPromptEntry(promptId);
            return;
        }

        if (choice !== PRESET_PROMPT_DELETE_CHOICE_DETACH) {
            return;
        }

        removeCurrentPresetPromptFavorite(promptId);
    }

    const isDetachAction = presetAction === 'delete' || action.classList.contains('prompt-manager-detach-action');
    const handler = isDetachAction
        ? promptManager?.handleDetach
        : presetAction === 'inspect' || action.classList.contains('prompt-manager-inspect-action')
            ? promptManager?.handleInspect
            : promptManager?.handleEdit;

    if (typeof handler !== 'function') {
        return;
    }

    event.preventDefault?.();
    event.stopPropagation?.();
    event.stopImmediatePropagation?.();
    closePresetPromptActionMenus();

    const originalSaveServiceSettings = promptManager.saveServiceSettings;

    try {
        if (isDetachAction && typeof originalSaveServiceSettings === 'function') {
            promptManager.saveServiceSettings = () => Promise.resolve();
        }

        handler.call(promptManager, event);
        if (isDetachAction) {
            markPresetPromptServiceSettingsSavePending();
            markOpenAiPresetSavePending();
        }
        schedulePresetPromptCodeMirrorEditorRefresh(undefined, { forceFromSource: true });
    } catch (error) {
        console.debug(`${LOG_PREFIX} Failed to handle prompt manager list action`, error);
    } finally {
        if (isDetachAction && typeof originalSaveServiceSettings === 'function') {
            promptManager.saveServiceSettings = originalSaveServiceSettings;
        }
    }
}

async function promptPresetPromptDeleteChoice(promptId) {
    const prompt = promptManager?.getPromptById?.(promptId);
    const promptName = escapeHtml(String(prompt?.name || promptId || t`这个条目`));
    const canDelete = isPresetPromptDeleteOrDetachAllowed(prompt);
    const customButtons = [
        {
            text: t`仅移除`,
            icon: 'fa-chain-broken',
            result: PRESET_PROMPT_DELETE_CHOICE_DETACH,
        },
    ];

    if (canDelete) {
        customButtons.push({
            text: t`彻底删除`,
            icon: 'fa-trash',
            result: PRESET_PROMPT_DELETE_CHOICE_DELETE,
            classes: ['caution'],
        });
    }

    return callGenericPopup(
        `<div class="bai-bai-preset-prompt-delete-choice">
            <p>${t`要如何处理这个预设条目？`}</p>
            <p><strong>${promptName}</strong></p>
            <p>${t`仅移除会保留条目本体，以后仍可重新添加；彻底删除会从当前预设中删除这个条目定义。`}</p>
        </div>`,
        POPUP_TYPE.TEXT,
        '',
        {
            okButton: false,
            cancelButton: t`取消`,
            customButtons,
        },
    );
}

async function deleteCurrentPresetPromptEntry(promptId) {
    if (!promptId || !promptManager || !Array.isArray(promptManager.serviceSettings?.prompts)) {
        toastr.warning(t`没有找到要删除的预设条目。`);
        return false;
    }

    const prompt = promptManager.getPromptById?.(promptId);

    if (!prompt) {
        toastr.warning(t`没有找到要删除的预设条目。`);
        return false;
    }

    if (!isPresetPromptDeleteOrDetachAllowed(prompt)) {
        toastr.warning(t`这个预设条目不能被彻底删除。`);
        return false;
    }

    const promptIndex = promptManager.serviceSettings.prompts.findIndex(item => item?.identifier === promptId);

    if (promptIndex < 0) {
        toastr.warning(t`没有找到要删除的预设条目。`);
        return false;
    }

    removeCurrentPresetPromptFavorite(promptId);
    promptManager.serviceSettings.prompts.splice(promptIndex, 1);
    removePresetPromptIdFromAllPromptOrders(promptId);
    cleanupDeletedPresetPromptGroupState(promptId);

    const counts = promptManager.tokenHandler?.getCounts?.();
    if (counts && typeof counts === 'object') {
        delete counts[promptId];
    }

    promptManager.hidePopup?.();
    promptManager.clearEditForm?.();
    promptManager.clearInspectForm?.();
    promptManager.log?.(`Deleted prompt: ${prompt.identifier}`);

    markPresetPromptServiceSettingsSavePending();
    markOpenAiPresetSavePending();
    refreshPresetPromptListAfterMutation();
    schedulePresetPromptCodeMirrorEditorRefresh(undefined, { forceFromSource: true });
    refreshPromptManagerTokensDebounced();
    void flushPendingPresetPromptChanges({ includeOpenAiPresetSaves: false }).catch(error => {
        console.debug(`${LOG_PREFIX} Failed to save deleted preset prompt changes`, error);
        toastr.error(t`删除预设条目后保存失败。`);
    });
    toastr.success(t`已彻底删除预设条目。`);
    return true;
}

function removePresetPromptIdFromAllPromptOrders(promptId) {
    let changed = false;
    const promptOrderLists = promptManager?.serviceSettings?.prompt_order;

    if (Array.isArray(promptOrderLists)) {
        for (const list of promptOrderLists) {
            changed = removePresetPromptIdFromOrder(list?.order, promptId) || changed;
        }
    }

    const activeOrder = promptManager?.getPromptOrderForCharacter?.(promptManager.activeCharacter);
    changed = removePresetPromptIdFromOrder(activeOrder, promptId) || changed;
    return changed;
}

function removePresetPromptIdFromOrder(order, promptId) {
    if (!Array.isArray(order)) {
        return false;
    }

    let changed = false;

    for (let index = order.length - 1; index >= 0; index--) {
        if (order[index]?.identifier === promptId) {
            order.splice(index, 1);
            changed = true;
        }
    }

    return changed;
}

function cleanupDeletedPresetPromptGroupState(promptId) {
    const groupState = getPresetPromptGroupState();

    if (!groupState?.prompts || !Object.prototype.hasOwnProperty.call(groupState.prompts, promptId)) {
        return false;
    }

    delete groupState.prompts[promptId];
    removeUnusedPresetPromptGroups(groupState);
    normalizePresetPromptGroupState(groupState, new Set(getCurrentPresetPromptOrderIds()));
    return savePresetPromptGroupSettings();
}

function togglePresetPromptActionMenu(button) {
    const wrapper = button.closest('.prompt_manager_prompt_controls');

    if (!(wrapper instanceof HTMLElement)) {
        return;
    }

    const actions = wrapper.querySelector('.bai-bai-preset-prompt-actions');

    if (!(actions instanceof HTMLElement)) {
        return;
    }

    const wasOpen = actions.classList.contains('bai-bai-preset-prompt-actions-visible');
    closePresetPromptActionMenus({ except: wrapper });
    actions.classList.toggle('bai-bai-preset-prompt-actions-visible', !wasOpen);
    wrapper.querySelector('.bai-bai-preset-prompt-actions-hint')?.classList.toggle('bai-bai-preset-prompt-actions-hint-hidden', !wasOpen);
    wrapper.closest('li.completion_prompt_manager_prompt')?.classList.toggle('bai-bai-preset-prompt-actions-open', !wasOpen);
}

function closePresetPromptActionMenus({ except = null } = {}) {
    document.querySelectorAll(`${PRESET_PROMPT_MANAGER_LIST_SELECTOR} .bai-bai-preset-prompt-actions-visible`).forEach(actions => {
        const wrapper = actions.closest('.prompt_manager_prompt_controls');

        if (wrapper === except) {
            return;
        }

        actions.classList.remove('bai-bai-preset-prompt-actions-visible');
        wrapper?.querySelector('.bai-bai-preset-prompt-actions-hint')?.classList.remove('bai-bai-preset-prompt-actions-hint-hidden');
        wrapper?.closest('li.completion_prompt_manager_prompt')?.classList.remove('bai-bai-preset-prompt-actions-open');
    });
}

async function copyPresetPromptEntryFromAction(action) {
    const row = action.closest(`${PRESET_PROMPT_MANAGER_LIST_SELECTOR} li.completion_prompt_manager_prompt[data-pm-identifier]`);
    const promptId = row?.dataset?.pmIdentifier;

    if (!promptId) {
        return;
    }

    await copyPresetPromptEntry(promptId);
}

async function copyPresetPromptEntry(promptId) {
    if (!promptManager?.activeCharacter || !Array.isArray(promptManager.serviceSettings?.prompts)) {
        toastr.warning(t`当前无法复制这个预设条目。`);
        return false;
    }

    const sourcePrompt = promptManager.getPromptById?.(promptId);
    const promptOrder = promptManager.getPromptOrderForCharacter?.(promptManager.activeCharacter);

    if (!sourcePrompt || !Array.isArray(promptOrder)) {
        toastr.warning(t`没有找到要复制的预设条目。`);
        return false;
    }

    const sourceOrderIndex = promptOrder.findIndex(entry => entry?.identifier === promptId);

    if (sourceOrderIndex < 0) {
        toastr.warning(t`这个预设条目不在当前列表中。`);
        return false;
    }

    const copyId = createUniquePresetPromptIdentifier();
    const sourcePromptIndex = promptManager.serviceSettings.prompts.findIndex(prompt => prompt?.identifier === promptId);
    const promptCopy = structuredClone(sourcePrompt);
    const sourceOrderEntry = promptOrder[sourceOrderIndex] ?? {};
    const orderCopy = {
        ...structuredClone(sourceOrderEntry),
        identifier: copyId,
        enabled: sourceOrderEntry.enabled !== false,
    };

    promptCopy.identifier = copyId;
    promptCopy.name = createPresetPromptCopyName(sourcePrompt.name);

    if (sourcePromptIndex >= 0) {
        promptManager.serviceSettings.prompts.splice(sourcePromptIndex + 1, 0, promptCopy);
    } else {
        promptManager.serviceSettings.prompts.push(promptCopy);
    }

    promptOrder.splice(sourceOrderIndex + 1, 0, orderCopy);
    copyPresetPromptGroupAssignment(promptId, copyId);

    const counts = promptManager.tokenHandler?.getCounts?.();

    if (counts) {
        counts[copyId] = null;
    }

    promptManager.log?.(`Copied prompt: ${promptId} -> ${copyId}.`);
    refreshPresetPromptListAfterCopy();
    markOpenAiPresetSavePending();

    try {
        await saveOpenAiPresetAfterPromptEdit();
        toastr.success(t`已复制预设条目。`);
        refreshPromptManagerTokensDebounced();
        return true;
    } catch (error) {
        console.debug(`${LOG_PREFIX} Failed to save copied preset prompt`, error);
        toastr.error(t`复制预设条目后保存失败。`);
        return false;
    }
}

function createUniquePresetPromptIdentifier() {
    let identifier = uuidv4();

    while (promptManager?.getPromptById?.(identifier)) {
        identifier = uuidv4();
    }

    return identifier;
}

function createPresetPromptCopyName(name) {
    const sourceName = String(name || t`未命名条目`);
    const baseName = `${sourceName} 副本`;
    const existingNames = new Set(
        (promptManager?.serviceSettings?.prompts ?? [])
            .map(prompt => prompt?.name)
            .filter(name => typeof name === 'string'),
    );

    if (!existingNames.has(baseName)) {
        return baseName;
    }

    for (let index = 2; index < 1000; index++) {
        const candidate = `${baseName} ${index}`;

        if (!existingNames.has(candidate)) {
            return candidate;
        }
    }

    return `${baseName} ${Date.now()}`;
}

function copyPresetPromptGroupAssignment(sourcePromptId, copiedPromptId) {
    if (!isPresetGroupingEnabled()) {
        return false;
    }

    const groupState = getPresetPromptGroupState();
    const groupId = groupState.prompts?.[sourcePromptId]?.groupId;

    if (!groupId) {
        return false;
    }

    groupState.prompts[copiedPromptId] = { groupId };
    normalizePresetPromptGroupState(groupState, new Set(getCurrentPresetPromptOrderIds()));
    savePresetPromptGroupSettings();
    return true;
}

function refreshPresetPromptListAfterCopy() {
    refreshPresetPromptListAfterMutation();
}

function refreshPresetPromptListAfterMutation() {
    if (isPresetVuePromptListManagerActive()) {
        syncPresetVuePromptListManagerState();
        preparePromptManagerCustomDragList(getPromptManagerListElement(), {
            signature: getPresetVuePromptListManagerState().lastStructureSignature,
        });
        return;
    }

    if (settings.presetSwitchOptimizationEnabled && isPromptManagerReadyForFastPresetSwitch()) {
        void renderPromptManagerListWithoutTokenStats();
        return;
    }

    promptManager?.render?.();
}

export {
    cleanupDeletedPresetPromptGroupState,
    closePresetPromptActionMenus,
    copyPresetPromptEntry,
    copyPresetPromptEntryFromAction,
    copyPresetPromptGroupAssignment,
    createPresetPromptCopyName,
    createUniquePresetPromptIdentifier,
    deleteCurrentPresetPromptEntry,
    handlePresetPromptActionButtonClick,
    promptPresetPromptDeleteChoice,
    refreshPresetPromptListAfterCopy,
    refreshPresetPromptListAfterMutation,
    removePresetPromptIdFromAllPromptOrders,
    removePresetPromptIdFromOrder,
    togglePresetPromptActionMenu,
};
