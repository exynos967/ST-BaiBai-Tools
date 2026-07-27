import { SCRIPT_TYPES as REGEX_SCRIPT_TYPES } from '@sillytavern/scripts/extensions/regex/engine';
import { t } from '@sillytavern/scripts/i18n';
import { callGenericPopup, POPUP_TYPE } from '@sillytavern/scripts/popup';
import { LOG_PREFIX, REGEX_CONTAINER_SELECTOR, REGEX_SCRIPT_ROW_SELECTOR } from './constants.js';
import { getRegexScriptContextFromRow, openOptimizedRegexEditor, updateRegexScriptRowDisabled } from './regexEditor.js';
import { allowRegexScriptTypeAfterEditSave, queueRegexChatReloadAfterPanelClose, saveRegexScriptList } from './regexPending.js';
import { getRegexQuickOperationState } from './regexQuickOps.js';
import { areRegexVueManagerTargetsOwned, getRegexVueManagerState, isRegexVueManagerActive, updateRegexBulkControls } from './regexVue.js';
import { settings } from './state.js';

function scheduleNativeRegexSortableGuard(delayMs = 80) {
    if (!settings.regexQuickOperationOptimizationEnabled) {
        return;
    }

    const state = getRegexQuickOperationState();
    clearTimeout(state.nativeSortableGuardTimer);
    state.nativeSortableGuardTimer = setTimeout(() => {
        state.nativeSortableGuardTimer = null;
        guardNativeRegexSortables();
    }, delayMs);
}

function guardNativeRegexSortables() {
    if (!settings.regexQuickOperationOptimizationEnabled) {
        return;
    }

    const manager = getRegexVueManagerState();
    const shouldDisable = Boolean(manager.installing || manager.app || areRegexVueManagerTargetsOwned());

    if (!shouldDisable) {
        return;
    }

    const waitingForNativeSortable = disableNativeRegexSortables();
    const state = getRegexQuickOperationState();

    if (waitingForNativeSortable && (state.nativeSortableGuardRetries ?? 0) < 40) {
        state.nativeSortableGuardRetries = (state.nativeSortableGuardRetries ?? 0) + 1;
        scheduleNativeRegexSortableGuard(250);
    } else {
        state.nativeSortableGuardRetries = 0;
    }
}

function disableNativeRegexSortables() {
    if (typeof $ !== 'function' || typeof $.fn?.sortable !== 'function') {
        return true;
    }

    let waitingForNativeSortable = false;

    for (const { selector } of getRegexScriptListDefinitions()) {
        const list = document.querySelector(selector);

        if (!(list instanceof HTMLElement)) {
            waitingForNativeSortable = true;
            continue;
        }

        try {
            if (!isRegexSortableInitialized(list)) {
                waitingForNativeSortable = true;
                continue;
            }

            if ($(list).sortable('option', 'disabled') !== true) {
                $(list).sortable('disable');
            }
        } catch (error) {
            console.debug(`${LOG_PREFIX} Failed to disable native regex sortable`, error);
        }
    }

    return waitingForNativeSortable;
}

function enableNativeRegexSortables() {
    if (typeof $ !== 'function' || typeof $.fn?.sortable !== 'function') {
        return;
    }

    for (const { selector } of getRegexScriptListDefinitions()) {
        const list = document.querySelector(selector);

        try {
            if (list instanceof HTMLElement && isRegexSortableInitialized(list)) {
                $(list).sortable('enable');
            }
        } catch (error) {
            console.debug(`${LOG_PREFIX} Failed to enable native regex sortable`, error);
        }
    }
}

function isRegexSortableInitialized(list) {
    if (typeof $ !== 'function') {
        return false;
    }

    return Boolean($(list).data('ui-sortable') || $(list).data('sortable'));
}

function getRegexScriptListDefinitions() {
    return [
        { selector: '#saved_regex_scripts', scriptType: REGEX_SCRIPT_TYPES.GLOBAL },
        { selector: '#saved_scoped_scripts', scriptType: REGEX_SCRIPT_TYPES.SCOPED },
        { selector: '#saved_preset_scripts', scriptType: REGEX_SCRIPT_TYPES.PRESET },
    ];
}

function getRegexListSelectorForScriptType(scriptType) {
    return getRegexScriptListDefinitions().find(definition => definition.scriptType === scriptType)?.selector ?? null;
}

function handleRegexQuickOperationClick(event) {
    if (!settings.regexQuickOperationOptimizationEnabled) {
        return;
    }

    if (isRegexVueManagerActive()) {
        return;
    }

    const target = event.target instanceof Element ? event.target : null;
    const row = target?.closest(`${REGEX_CONTAINER_SELECTOR} ${REGEX_SCRIPT_ROW_SELECTOR}`);

    if (!(row instanceof HTMLElement)) {
        return;
    }

    const editButton = target.closest('.edit_existing_regex');

    if (editButton && row.contains(editButton)) {
        preventRegexQuickOperationEvent(event);
        void openOptimizedRegexEditor(row);
        return;
    }

    const toggle = target.closest('.regex-toggle-on, .regex-toggle-off');

    if (toggle && row.contains(toggle)) {
        preventRegexQuickOperationEvent(event);
        void toggleRegexScriptRow(row, toggle);
        return;
    }

    const deleteButton = target.closest('.delete_regex');

    if (deleteButton && row.contains(deleteButton)) {
        preventRegexQuickOperationEvent(event);
        void deleteRegexScriptRow(row);
    }
}

function preventRegexQuickOperationEvent(event) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
}

async function toggleRegexScriptRow(row, toggle) {
    const nextDisabled = toggle.classList.contains('regex-toggle-on');

    await setRegexScriptRowDisabled(row, nextDisabled);
}

async function setRegexScriptRowDisabled(row, nextDisabled) {
    const context = getRegexScriptContextFromRow(row);

    if (!context) {
        return;
    }

    const previousDisabled = Boolean(context.script.disabled ?? false);

    context.script.disabled = nextDisabled;
    updateRegexScriptRowDisabled(row, nextDisabled);

    try {
        await saveRegexScriptList(context.scriptType, context.scripts);
        allowRegexScriptTypeAfterEditSave(context.scriptType);
        queueRegexChatReloadAfterPanelClose();
    } catch (error) {
        context.script.disabled = previousDisabled;
        updateRegexScriptRowDisabled(row, previousDisabled);
        console.debug(`${LOG_PREFIX} Failed to save regex script toggle`, error);
        toastr.error(t`Failed to save regex script state. See console for details.`);
    }
}

async function deleteRegexScriptRow(row) {
    const confirm = await callGenericPopup(t`Are you sure you want to delete this regex script?`, POPUP_TYPE.CONFIRM);

    if (!confirm) {
        return;
    }

    const context = getRegexScriptContextFromRow(row);

    if (!context) {
        return;
    }

    const [removedScript] = context.scripts.splice(context.index, 1);

    try {
        await saveRegexScriptList(context.scriptType, context.scripts);
        row.remove();
        updateRegexBulkControls();
        queueRegexChatReloadAfterPanelClose();
    } catch (error) {
        if (removedScript) {
            context.scripts.splice(context.index, 0, removedScript);
        }

        console.debug(`${LOG_PREFIX} Failed to delete regex script`, error);
        toastr.error(t`Failed to delete regex script. See console for details.`);
    }
}

export {
    deleteRegexScriptRow,
    disableNativeRegexSortables,
    enableNativeRegexSortables,
    getRegexListSelectorForScriptType,
    getRegexScriptListDefinitions,
    guardNativeRegexSortables,
    handleRegexQuickOperationClick,
    isRegexSortableInitialized,
    preventRegexQuickOperationEvent,
    scheduleNativeRegexSortableGuard,
    setRegexScriptRowDisabled,
    toggleRegexScriptRow,
};
