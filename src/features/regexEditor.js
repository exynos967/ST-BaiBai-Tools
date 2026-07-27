import { renderExtensionTemplateAsync } from '@sillytavern/scripts/extensions';
import { getScriptsByType as getRegexScriptsByType, runRegexScript, SCRIPT_TYPES as REGEX_SCRIPT_TYPES, substitute_find_regex } from '@sillytavern/scripts/extensions/regex/engine';
import { t } from '@sillytavern/scripts/i18n';
import { callGenericPopup, POPUP_TYPE } from '@sillytavern/scripts/popup';
import { regexFromString, setInfoBlock, uuidv4 } from '@sillytavern/scripts/utils';
import { LOG_PREFIX, REGEX_PENDING_ASSIGNMENT_GROUP_ID, REGEX_SCRIPT_LIST_SELECTOR, REGEX_UNGROUPED_GROUP_ID } from './constants.js';
import { canMoveRegexScriptsToType, getRegexScriptContextById, getRegexVueScriptModelById } from './regexGroupOps.js';
import { getRegexGroupStateForScriptType, getRegexScriptTypeFromKey, getRegexScriptTypeKey, saveRegexGroupSettings } from './regexGroups.js';
import { appendOptimizedRegexScriptRow } from './regexImport.js';
import { getRegexScriptListDefinitions } from './regexNative.js';
import { allowRegexScriptTypeAfterEditSave, queueRegexChatReloadAfterPanelClose, saveRegexScriptList } from './regexPending.js';
import { areRegexVueManagerTargetsReady, getRegexVueManagerState, isRegexVueManagerActive, syncRegexVueManagerAfterDataChange, syncRegexVueManagerState, updateRegexBulkControls } from './regexVue.js';

async function openOptimizedRegexEditorForType(scriptType) {
    if (scriptType === REGEX_SCRIPT_TYPES.SCOPED && !canMoveRegexScriptsToType(scriptType)) {
        return;
    }

    await openOptimizedRegexEditorWithScript(scriptType, createDefaultRegexEditorScript());
}

async function openOptimizedRegexEditorById(scriptType, scriptId) {
    const context = getRegexScriptContextById(scriptType, scriptId);

    if (!context) {
        return;
    }

    await openOptimizedRegexEditorWithScript(scriptType, context.script);
}

function createDefaultRegexEditorScript() {
    return {
        id: uuidv4(),
        scriptName: '',
        findRegex: '',
        replaceString: '',
        trimStrings: [],
        placement: [1],
        disabled: false,
        markdownOnly: true,
        promptOnly: false,
        runOnEdit: true,
        substituteRegex: substitute_find_regex.NONE,
        minDepth: null,
        maxDepth: null,
    };
}

async function openOptimizedRegexEditorWithScript(scriptType, script) {
    const isExisting = Boolean(getRegexScriptContextById(scriptType, script.id));

    if (isExisting && !script.scriptName) {
        toastr.error('This script doesn\'t have a name! Please delete it.');
        return;
    }

    const editorHtml = $(await renderExtensionTemplateAsync('regex', 'editor'));
    fillOptimizedRegexEditor(editorHtml, script);
    installOptimizedRegexEditorPreview(editorHtml);

    const popupResult = await callGenericPopup(editorHtml, POPUP_TYPE.CONFIRM, '', {
        okButton: t`Save`,
        cancelButton: t`Cancel`,
        allowVerticalScrolling: true,
    });

    if (!popupResult) {
        return;
    }

    const updatedScript = readOptimizedRegexEditorScript(editorHtml, script);

    if (!updatedScript.scriptName) {
        toastr.error(t`Could not save regex script: The script name was undefined or empty!`);
        return;
    }

    if (updatedScript.findRegex.length === 0) {
        toastr.warning(t`This regex script will not work, but was saved anyway: A find regex isn't present.`);
    }

    if (updatedScript.placement.length === 0) {
        toastr.warning(t`This regex script will not work, but was saved anyway: One "Affects" checkbox must be selected!`);
    }

    const scripts = getRegexScriptsByType(scriptType);
    const existingIndex = scripts.findIndex(item => item?.id === updatedScript.id);
    const previousScript = existingIndex === -1 ? null : { ...scripts[existingIndex] };

    if (existingIndex === -1) {
        scripts.push(updatedScript);
    } else {
        Object.assign(scripts[existingIndex], updatedScript);
    }

    try {
        await saveRegexScriptList(scriptType, scripts);
        allowRegexScriptTypeAfterEditSave(scriptType);
        const scriptGroupMetaChanged = ensureRegexScriptGroupMeta(scriptType, updatedScript.id, { pendingAssignment: existingIndex === -1 });
        const currentOrderPreserved = preserveRegexVueCurrentOrderInGroupMeta(scriptType);
        const groupMetaChanged = scriptGroupMetaChanged || currentOrderPreserved;
        if (groupMetaChanged) {
            saveRegexGroupSettings();
        }
        if (existingIndex === -1) {
            await syncRegexVueManagerAfterDataChange();
        } else {
            updateRegexVueScriptModelAfterEdit(scriptType, updatedScript.id, scripts[existingIndex]);
        }
        queueRegexChatReloadAfterPanelClose();
    } catch (error) {
        if (existingIndex === -1) {
            const insertedIndex = scripts.findIndex(item => item?.id === updatedScript.id);

            if (insertedIndex !== -1) {
                scripts.splice(insertedIndex, 1);
            }
        } else {
            Object.assign(scripts[existingIndex], previousScript);
            updateRegexVueScriptModelAfterEdit(scriptType, updatedScript.id, scripts[existingIndex]);
        }

        console.debug(`${LOG_PREFIX} Failed to save regex script`, error);
        toastr.error(t`Failed to save regex script. See console for details.`);
        if (existingIndex === -1) {
            syncRegexVueManagerState();
        }
    }
}

function updateRegexVueScriptModelAfterEdit(scriptType, scriptId, script) {
    const modelScript = getRegexVueScriptModelById(scriptType, scriptId);

    if (!modelScript || !script) {
        return false;
    }

    if (modelScript !== script) {
        Object.assign(modelScript, script);
    }

    return true;
}

function preserveRegexVueCurrentOrderInGroupMeta(scriptType) {
    const manager = getRegexVueManagerState();
    const typeKey = getRegexScriptTypeKey(scriptType);
    const list = manager.state?.lists?.[typeKey];

    if (!list) {
        return false;
    }

    const groupState = getRegexGroupStateForScriptType(scriptType);
    let changed = false;

    for (const group of list.groups ?? []) {
        const groupId = group.isPendingAssignment
            ? REGEX_PENDING_ASSIGNMENT_GROUP_ID
            : group.isUngrouped
                ? REGEX_UNGROUPED_GROUP_ID
                : group.id;

        let order = 0;

        for (const script of group.scripts ?? []) {
            if (!script?.id) {
                continue;
            }

            const previousMeta = groupState.scripts[script.id];
            const nextMeta = { groupId, order };

            if (
                previousMeta?.groupId !== nextMeta.groupId
                || Number(previousMeta?.order) !== nextMeta.order
            ) {
                groupState.scripts[script.id] = nextMeta;
                changed = true;
            }

            order += 1;
        }
    }

    return changed;
}

function ensureRegexScriptGroupMeta(scriptType, scriptId, { pendingAssignment = false } = {}) {
    if (!scriptId) {
        return false;
    }

    const groupState = getRegexGroupStateForScriptType(scriptType);
    const existingMeta = groupState.scripts[scriptId];

    if (!existingMeta || typeof existingMeta !== 'object') {
        groupState.scripts[scriptId] = {
            groupId: pendingAssignment ? REGEX_PENDING_ASSIGNMENT_GROUP_ID : REGEX_UNGROUPED_GROUP_ID,
            order: Object.keys(groupState.scripts).length,
        };
        return true;
    }

    let changed = false;

    if (!existingMeta.groupId) {
        existingMeta.groupId = REGEX_UNGROUPED_GROUP_ID;
        changed = true;
    }

    if (!Number.isFinite(Number(existingMeta.order))) {
        existingMeta.order = Object.keys(groupState.scripts).length;
        changed = true;
    }

    return changed;
}

async function restoreRegexRowsAfterVueManagerRemove() {
    if (!areRegexVueManagerTargetsReady()) {
        return;
    }

    for (const { selector, scriptType } of getRegexScriptListDefinitions()) {
        const list = document.querySelector(selector);

        if (!(list instanceof HTMLElement)) {
            continue;
        }

        list.replaceChildren();

        for (const script of getRegexScriptsByType(scriptType)) {
            await appendOptimizedRegexScriptRow(script, scriptType);
        }
    }

    updateRegexBulkControls();
}

async function openOptimizedRegexEditor(row) {
    const context = getRegexScriptContextFromRow(row);

    if (!context) {
        return;
    }

    if (isRegexVueManagerActive()) {
        await openOptimizedRegexEditorById(context.scriptType, context.scriptId);
        return;
    }

    if (!context.script.scriptName) {
        toastr.error('This script doesn\'t have a name! Please delete it.');
        return;
    }

    const editorHtml = $(await renderExtensionTemplateAsync('regex', 'editor'));
    fillOptimizedRegexEditor(editorHtml, context.script);
    installOptimizedRegexEditorPreview(editorHtml);

    const popupResult = await callGenericPopup(editorHtml, POPUP_TYPE.CONFIRM, '', {
        okButton: t`Save`,
        cancelButton: t`Cancel`,
        allowVerticalScrolling: true,
    });

    if (!popupResult) {
        return;
    }

    const updatedScript = readOptimizedRegexEditorScript(editorHtml, context.script);

    if (!updatedScript.scriptName) {
        toastr.error(t`Could not save regex script: The script name was undefined or empty!`);
        return;
    }

    if (updatedScript.findRegex.length === 0) {
        toastr.warning(t`This regex script will not work, but was saved anyway: A find regex isn't present.`);
    }

    if (updatedScript.placement.length === 0) {
        toastr.warning(t`This regex script will not work, but was saved anyway: One "Affects" checkbox must be selected!`);
    }

    const previousScript = context.scripts[context.index];
    context.scripts[context.index] = updatedScript;

    try {
        await saveRegexScriptList(context.scriptType, context.scripts);
        allowRegexScriptTypeAfterEditSave(context.scriptType);
        updateRegexScriptRowFromScript(row, updatedScript);
        queueRegexChatReloadAfterPanelClose();
    } catch (error) {
        context.scripts[context.index] = previousScript;
        console.debug(`${LOG_PREFIX} Failed to save regex script edit`, error);
        toastr.error(t`Failed to save regex script. See console for details.`);
    }
}

function fillOptimizedRegexEditor(editorHtml, script) {
    editorHtml.find('.regex_script_name').val(script.scriptName || '');
    editorHtml.find('.find_regex').val(script.findRegex || '');
    editorHtml.find('.regex_replace_string').val(script.replaceString || '');
    editorHtml.find('.regex_trim_strings').val(Array.isArray(script.trimStrings) ? script.trimStrings.join('\n') : '');
    editorHtml.find('input[name="disabled"]').prop('checked', Boolean(script.disabled ?? false));
    editorHtml.find('input[name="only_format_display"]').prop('checked', Boolean(script.markdownOnly ?? false));
    editorHtml.find('input[name="only_format_prompt"]').prop('checked', Boolean(script.promptOnly ?? false));
    editorHtml.find('input[name="run_on_edit"]').prop('checked', Boolean(script.runOnEdit ?? false));
    editorHtml.find('select[name="substitute_regex"]').val(script.substituteRegex ?? substitute_find_regex.NONE);
    editorHtml.find('input[name="min_depth"]').val(Number.isNaN(script.minDepth) ? '' : script.minDepth ?? '');
    editorHtml.find('input[name="max_depth"]').val(Number.isNaN(script.maxDepth) ? '' : script.maxDepth ?? '');

    for (const placement of Array.isArray(script.placement) ? script.placement : []) {
        editorHtml.find(`input[name="replace_position"][value="${placement}"]`).prop('checked', true);
    }
}

function installOptimizedRegexEditorPreview(editorHtml) {
    const updateTestResult = () => {
        updateOptimizedRegexInfoBlock(editorHtml);

        if (!editorHtml.find('#regex_test_mode').is(':visible')) {
            return;
        }

        const testScript = {
            id: 'bai-bai-toolkit-regex-test',
            scriptName: String(editorHtml.find('.regex_script_name').val()),
            findRegex: String(editorHtml.find('.find_regex').val()),
            replaceString: String(editorHtml.find('.regex_replace_string').val()),
            trimStrings: splitRegexTrimStrings(editorHtml.find('.regex_trim_strings').val()),
            substituteRegex: Number(editorHtml.find('select[name="substitute_regex"]').val()),
            disabled: false,
            promptOnly: false,
            markdownOnly: false,
            runOnEdit: false,
            minDepth: null,
            maxDepth: null,
            placement: null,
        };
        const rawTestString = String(editorHtml.find('#regex_test_input').val());
        const result = runRegexScript(testScript, rawTestString);
        editorHtml.find('#regex_test_output').text(result);
    };

    editorHtml.find('#regex_test_mode_toggle').on('click', function () {
        editorHtml.find('#regex_test_mode').toggleClass('displayNone');
        updateTestResult();
    });

    editorHtml.find('input, textarea, select').on('input', updateTestResult);
    updateOptimizedRegexInfoBlock(editorHtml);
}

function updateOptimizedRegexInfoBlock(editorHtml) {
    const infoBlock = editorHtml.find('.info-block').get(0);
    const infoBlockFlagsHint = editorHtml.find('#regex_info_block_flags_hint');
    const findRegex = String(editorHtml.find('.find_regex').val());

    infoBlockFlagsHint.hide();

    if (!findRegex) {
        setInfoBlock(infoBlock, t`Find Regex is empty`, 'info');
        return;
    }

    try {
        const regex = regexFromString(findRegex);

        if (!regex) {
            throw new Error(t`Invalid Find Regex`);
        }

        const flagInfo = [];
        flagInfo.push(regex.flags.includes('g') ? t`Applies to all matches` : t`Applies to the first match`);
        flagInfo.push(regex.flags.includes('i') ? t`Case insensitive` : t`Case sensitive`);

        setInfoBlock(infoBlock, flagInfo.join('. '), 'hint');
        infoBlockFlagsHint.show();
    } catch (error) {
        setInfoBlock(infoBlock, error.message, 'error');
    }
}

function readOptimizedRegexEditorScript(editorHtml, existingScript) {
    return {
        ...existingScript,
        id: String(existingScript.id),
        scriptName: String(editorHtml.find('.regex_script_name').val()),
        findRegex: String(editorHtml.find('.find_regex').val()),
        replaceString: String(editorHtml.find('.regex_replace_string').val()),
        trimStrings: splitRegexTrimStrings(editorHtml.find('.regex_trim_strings').val()),
        placement: editorHtml
            .find('input[name="replace_position"]')
            .filter(':checked')
            .map(function () { return parseInt($(this).val().toString()); })
            .get()
            .filter(value => !isNaN(value)) || [],
        disabled: Boolean(editorHtml.find('input[name="disabled"]').prop('checked')),
        markdownOnly: Boolean(editorHtml.find('input[name="only_format_display"]').prop('checked')),
        promptOnly: Boolean(editorHtml.find('input[name="only_format_prompt"]').prop('checked')),
        runOnEdit: Boolean(editorHtml.find('input[name="run_on_edit"]').prop('checked')),
        substituteRegex: Number(editorHtml.find('select[name="substitute_regex"]').val()),
        minDepth: parseInt(String(editorHtml.find('input[name="min_depth"]').val())),
        maxDepth: parseInt(String(editorHtml.find('input[name="max_depth"]').val())),
    };
}

function splitRegexTrimStrings(value) {
    return String(value).split('\n').filter(item => item.length !== 0) || [];
}

function getRegexScriptContextFromRow(row) {
    const scriptId = row.id;
    const list = row.closest(REGEX_SCRIPT_LIST_SELECTOR);
    const scriptType = getRegexScriptTypeFromList(list);

    if (!scriptId || scriptType === null) {
        return null;
    }

    const scripts = getRegexScriptsByType(scriptType);
    const index = scripts.findIndex(script => script?.id === scriptId);

    if (index === -1) {
        return null;
    }

    return {
        row,
        list,
        scriptId,
        scriptType,
        scripts,
        index,
        script: scripts[index],
    };
}

function getRegexScriptTypeFromList(list) {
    if (!(list instanceof HTMLElement)) {
        return null;
    }

    switch (list.id) {
        case 'saved_regex_scripts':
            return REGEX_SCRIPT_TYPES.GLOBAL;
        case 'saved_scoped_scripts':
            return REGEX_SCRIPT_TYPES.SCOPED;
        case 'saved_preset_scripts':
            return REGEX_SCRIPT_TYPES.PRESET;
        default:
            return null;
    }
}

async function saveRegexScriptsOrderFromModel(typeKey) {
    const scriptType = getRegexScriptTypeFromKey(typeKey);

    if (scriptType === null) {
        return;
    }

    const manager = getRegexVueManagerState();
    if (!manager.state) return;

    const list = manager.state.lists[typeKey];
    if (!list) return;

    const scripts = getRegexScriptsByType(scriptType);
    const scriptIds = new Set(scripts.map(script => script?.id).filter(Boolean));
    const scriptById = new Map(scripts.filter(script => script?.id).map(script => [script.id, script]));
    const seen = new Set();
    const reorderedScripts = [];
    const groupState = getRegexGroupStateForScriptType(scriptType);
    const previousScripts = scripts.slice();
    const previousGroupScripts = cloneRegexGroupScriptsMeta(groupState.scripts);
    let mappedScriptCount = 0;

    for (const group of list.groups) {
        let order = 0;
        const groupId = group.isPendingAssignment
            ? REGEX_PENDING_ASSIGNMENT_GROUP_ID
            : group.isUngrouped
                ? REGEX_UNGROUPED_GROUP_ID
                : group.id;

        for (const script of group.scripts) {
            if (!script?.id || !scriptIds.has(script.id) || seen.has(script.id)) {
                continue;
            }

            const sourceScript = scriptById.get(script.id);

            if (!sourceScript) {
                continue;
            }

            seen.add(script.id);
            reorderedScripts.push(sourceScript);
            groupState.scripts[script.id] = { groupId, order };
            order += 1;
            mappedScriptCount += 1;
        }
    }

    if (scripts.length > 0 && mappedScriptCount === 0) {
        console.debug(`${LOG_PREFIX} Regex Vue order save skipped because the drag model contains no known scripts`);
        toastr.error(t`Regex order was not saved because the drag result was invalid.`);
        restoreRegexGroupScriptsMeta(groupState, previousGroupScripts);
        syncRegexVueManagerState();
        return;
    }

    for (const script of scripts) {
        if (script?.id && !seen.has(script.id)) {
            reorderedScripts.push(script);
        }
    }

    if (reorderedScripts.length !== scripts.length) {
        console.debug(`${LOG_PREFIX} Regex Vue order save skipped because model and data lengths differ`);
        restoreRegexGroupScriptsMeta(groupState, previousGroupScripts);
        syncRegexVueManagerState();
        return;
    }

    scripts.splice(0, scripts.length, ...reorderedScripts);

    try {
        await saveRegexScriptList(scriptType, scripts);
        saveRegexGroupSettings();
        queueRegexChatReloadAfterPanelClose();
    } catch (error) {
        scripts.splice(0, scripts.length, ...previousScripts);
        restoreRegexGroupScriptsMeta(groupState, previousGroupScripts);
        throw error;
    }
}

function cloneRegexGroupScriptsMeta(scriptsMeta) {
    const clone = {};

    for (const [scriptId, meta] of Object.entries(scriptsMeta ?? {})) {
        clone[scriptId] = meta && typeof meta === 'object' ? { ...meta } : meta;
    }

    return clone;
}

function restoreRegexGroupScriptsMeta(groupState, scriptsMeta) {
    groupState.scripts = cloneRegexGroupScriptsMeta(scriptsMeta);
}

function saveRegexScriptsOrderFromModelSafely(typeKey) {
    void saveRegexScriptsOrderFromModel(typeKey).catch(error => {
        console.debug(`${LOG_PREFIX} Failed to save regex script order`, error);
        toastr.error(t`Failed to save regex script order. See console for details.`);
        syncRegexVueManagerState();
    });
}

function updateRegexScriptRowDisabled(row, disabled) {
    const checkbox = row.querySelector('.disable_regex');

    if (checkbox instanceof HTMLInputElement) {
        checkbox.checked = disabled;
    }
}

function updateRegexScriptRowFromScript(row, script) {
    row.id = script.id;
    const name = script.scriptName || '';
    const nameElement = row.querySelector('.regex_script_name');

    if (nameElement instanceof HTMLElement) {
        nameElement.textContent = name;
        nameElement.title = name;
    }

    updateRegexScriptRowDisabled(row, Boolean(script.disabled ?? false));
}

export {
    cloneRegexGroupScriptsMeta,
    createDefaultRegexEditorScript,
    ensureRegexScriptGroupMeta,
    fillOptimizedRegexEditor,
    getRegexScriptContextFromRow,
    getRegexScriptTypeFromList,
    installOptimizedRegexEditorPreview,
    openOptimizedRegexEditor,
    openOptimizedRegexEditorById,
    openOptimizedRegexEditorForType,
    openOptimizedRegexEditorWithScript,
    preserveRegexVueCurrentOrderInGroupMeta,
    readOptimizedRegexEditorScript,
    restoreRegexGroupScriptsMeta,
    restoreRegexRowsAfterVueManagerRemove,
    saveRegexScriptsOrderFromModel,
    saveRegexScriptsOrderFromModelSafely,
    splitRegexTrimStrings,
    updateOptimizedRegexInfoBlock,
    updateRegexScriptRowDisabled,
    updateRegexScriptRowFromScript,
    updateRegexVueScriptModelAfterEdit,
};
