import { this_chid } from '@sillytavern/script';
import { getScriptsByType as getRegexScriptsByType, SCRIPT_TYPES as REGEX_SCRIPT_TYPES } from '@sillytavern/scripts/extensions/regex/engine';
import { selected_group } from '@sillytavern/scripts/group-chats';
import { t } from '@sillytavern/scripts/i18n';
import { callGenericPopup, POPUP_RESULT, POPUP_TYPE } from '@sillytavern/scripts/popup';
import { download, uuidv4 } from '@sillytavern/scripts/utils';
import { LOG_PREFIX, REGEX_PENDING_ASSIGNMENT_GROUP_ID, REGEX_UNGROUPED_GROUP_ID } from './constants.js';
import { cloneRegexGroupScriptsMeta, restoreRegexGroupScriptsMeta, saveRegexScriptsOrderFromModel } from './regexEditor.js';
import { getNormalizedRegexGroupId, getRegexGroupStateForScriptType, getRegexScriptTypeKey, getRegexUngroupedGroupDisplayName, normalizeRegexGroupState, saveRegexGroupSettings } from './regexGroups.js';
import { getRegexMoveConfirmationMessage, sanitizeRegexExportFileName } from './regexImport.js';
import { getRegexScriptListDefinitions } from './regexNative.js';
import { allowRegexScriptTypeAfterEditSave, queueRegexChatReloadAfterPanelClose, saveRegexScriptList } from './regexPending.js';
import { getRegexVueManagerState, syncRegexVueManagerState, updateRegexBulkControls } from './regexVue.js';

async function createRegexVueGroup(scriptType) {
    const name = await callGenericPopup(t`Regex group name`, POPUP_TYPE.INPUT, '', {
        okButton: t`Save`,
        cancelButton: t`Cancel`,
    });

    if (typeof name !== 'string') {
        return;
    }

    const trimmedName = name.trim();

    if (!trimmedName) {
        toastr.warning(t`Group name cannot be empty.`);
        return;
    }

    const groupState = getRegexGroupStateForScriptType(scriptType);
    groupState.groups.push({
        id: uuidv4(),
        name: trimmedName,
        order: groupState.groups.length,
        collapsed: false,
    });

    saveRegexGroupSettings();
    syncRegexVueManagerState();
}

async function renameRegexVueGroup(scriptType, groupId) {
    const groupState = getRegexGroupStateForScriptType(scriptType);
    const group = groupId === REGEX_UNGROUPED_GROUP_ID
        ? groupState.ungrouped
        : groupState.groups.find(item => item.id === groupId);

    if (!group) {
        return;
    }

    const name = await callGenericPopup(t`Regex group name`, POPUP_TYPE.INPUT, group.name || '', {
        okButton: t`Save`,
        cancelButton: t`Cancel`,
    });

    if (typeof name !== 'string') {
        return;
    }

    const trimmedName = name.trim();

    if (!trimmedName) {
        toastr.warning(t`Group name cannot be empty.`);
        return;
    }

    group.name = trimmedName;
    saveRegexGroupSettings();
    syncRegexVueManagerState();
}

function moveRegexVueGroup(scriptType, groupId, direction) {
    if (groupId === REGEX_UNGROUPED_GROUP_ID || groupId === REGEX_PENDING_ASSIGNMENT_GROUP_ID) {
        return;
    }

    const offset = Math.sign(Number(direction));

    if (offset === 0) {
        return;
    }

    const groupState = getRegexGroupStateForScriptType(scriptType);
    normalizeRegexGroupState(groupState);

    const currentIndex = groupState.groups.findIndex(group => group.id === groupId);
    const targetIndex = currentIndex + offset;

    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= groupState.groups.length) {
        return;
    }

    const [group] = groupState.groups.splice(currentIndex, 1);
    groupState.groups.splice(targetIndex, 0, group);
    groupState.groups = groupState.groups.map((item, index) => ({
        ...item,
        order: index,
    }));

    saveRegexGroupSettings();
    syncRegexVueManagerState();
}

async function deleteRegexVueGroup(scriptType, groupId) {
    if (groupId === REGEX_UNGROUPED_GROUP_ID) {
        return;
    }

    const result = await callGenericPopup('要删除这个正则分组吗？\n\n选择“否”会把组内正则移动到默认组。\n选择“是”会连同组内正则一起删除。', POPUP_TYPE.CONFIRM, '', {
        okButton: '是',
        cancelButton: '取消',
        defaultResult: POPUP_RESULT.NEGATIVE,
        customButtons: [
            {
                text: '否',
                result: POPUP_RESULT.CUSTOM1,
            },
        ],
    });

    if (result !== POPUP_RESULT.AFFIRMATIVE && result !== POPUP_RESULT.CUSTOM1) {
        return;
    }

    const groupState = getRegexGroupStateForScriptType(scriptType);
    const shouldDeleteScripts = result === POPUP_RESULT.AFFIRMATIVE;

    groupState.groups = groupState.groups.filter(group => group.id !== groupId);

    if (shouldDeleteScripts) {
        const scripts = getRegexScriptsByType(scriptType);
        const removedScriptIds = new Set();

        for (let index = scripts.length - 1; index >= 0; index--) {
            const scriptId = scripts[index]?.id;

            if (groupState.scripts?.[scriptId]?.groupId === groupId) {
                removedScriptIds.add(scriptId);
                scripts.splice(index, 1);
            }
        }

        for (const scriptId of removedScriptIds) {
            delete groupState.scripts[scriptId];
            delete getRegexVueManagerState().state?.selectedIds?.[scriptId];
        }

        if (removedScriptIds.size > 0) {
            await saveRegexScriptList(scriptType, scripts);
            queueRegexChatReloadAfterPanelClose();
        }
    } else {
        for (const meta of Object.values(groupState.scripts)) {
            if (meta?.groupId === groupId) {
                meta.groupId = REGEX_UNGROUPED_GROUP_ID;
            }
        }
    }

    saveRegexGroupSettings();
    syncRegexVueManagerState();
}

function toggleRegexVueGroupCollapsed(scriptType, groupId) {
    const groupState = getRegexGroupStateForScriptType(scriptType);
    const group = groupId === REGEX_UNGROUPED_GROUP_ID
        ? groupState.ungrouped
        : groupState.groups.find(item => item.id === groupId);

    if (!group) {
        return;
    }

    group.collapsed = !group.collapsed;
    saveRegexGroupSettings();

    if (!setRegexVueGroupCollapsedInModel(scriptType, groupId, group.collapsed)) {
        syncRegexVueManagerState();
    }
}

function setRegexVueGroupCollapsedInModel(scriptType, groupId, collapsed) {
    const manager = getRegexVueManagerState();
    const typeKey = getRegexScriptTypeKey(scriptType);
    const group = manager.state?.lists?.[typeKey]?.groups?.find(item => item.id === groupId);

    if (!group) {
        return false;
    }

    group.collapsed = Boolean(collapsed);
    return true;
}

function setRegexVueScriptSelected(scriptId, selected) {
    const manager = getRegexVueManagerState();

    if (!manager.state || !scriptId) {
        return;
    }

    if (selected) {
        manager.state.selectedIds[scriptId] = true;
    } else {
        delete manager.state.selectedIds[scriptId];
    }

    updateRegexBulkControls();
}

function pruneRegexVueSelection() {
    const manager = getRegexVueManagerState();

    if (!manager.state) {
        return;
    }

    const validIds = new Set();

    for (const { scriptType } of getRegexScriptListDefinitions()) {
        for (const script of getRegexScriptsByType(scriptType)) {
            if (script?.id) {
                validIds.add(script.id);
            }
        }
    }

    for (const scriptId of Object.keys(manager.state.selectedIds)) {
        if (!validIds.has(scriptId)) {
            delete manager.state.selectedIds[scriptId];
        }
    }
}

function getRegexVueSelectedContexts() {
    const manager = getRegexVueManagerState();
    const selectedIds = manager.state?.selectedIds ?? {};
    const contexts = [];

    for (const { scriptType } of getRegexScriptListDefinitions()) {
        const scripts = getRegexScriptsByType(scriptType);

        for (let index = 0; index < scripts.length; index++) {
            const script = scripts[index];

            if (script?.id && selectedIds[script.id]) {
                contexts.push({ scriptType, scripts, index, script });
            }
        }
    }

    return contexts;
}

function getRegexVueSelectedCountForList(model, list) {
    const selectedIds = model?.selectedIds ?? {};

    return (list?.groups ?? []).reduce((count, group) => {
        return count + (group?.scripts ?? []).filter(script => script?.id && selectedIds[script.id]).length;
    }, 0);
}

function getRegexVueSelectedScriptsForType(scriptType) {
    const manager = getRegexVueManagerState();
    const typeKey = getRegexScriptTypeKey(scriptType);
    const list = manager.state?.lists?.[typeKey];
    const selectedIds = manager.state?.selectedIds ?? {};

    if (!list) {
        return getRegexVueSelectedContexts()
            .filter(context => context.scriptType === scriptType)
            .map(context => context.script);
    }

    const scripts = [];

    for (const group of list.groups ?? []) {
        for (const script of group.scripts ?? []) {
            if (script?.id && selectedIds[script.id]) {
                scripts.push(script);
            }
        }
    }

    return scripts;
}

function getAllRegexVueScriptIds() {
    return getRegexScriptListDefinitions()
        .flatMap(({ scriptType }) => getRegexScriptsByType(scriptType))
        .map(script => script?.id)
        .filter(Boolean);
}

function toggleRegexVueBulkSelection() {
    const manager = getRegexVueManagerState();

    if (!manager.state) {
        return;
    }

    const allIds = getAllRegexVueScriptIds();
    const allSelected = allIds.length > 0 && allIds.every(id => manager.state.selectedIds[id]);

    for (const id of Object.keys(manager.state.selectedIds)) {
        delete manager.state.selectedIds[id];
    }

    if (!allSelected) {
        for (const id of allIds) {
            manager.state.selectedIds[id] = true;
        }
    }

    updateRegexBulkControls();
}

async function setRegexVueScriptDisabled(scriptType, scriptId, disabled) {
    const context = getRegexScriptContextById(scriptType, scriptId);

    if (!context) {
        return;
    }

    const modelScript = getRegexVueScriptModelById(scriptType, scriptId);
    const previousDisabled = Boolean(context.script.disabled ?? false);
    const previousModelDisabled = modelScript ? Boolean(modelScript.disabled ?? false) : previousDisabled;

    if (previousModelDisabled === disabled) {
        return;
    }

    if (modelScript) {
        modelScript.disabled = disabled;
    } else {
        context.script.disabled = disabled;
    }

    try {
        await saveRegexScriptList(scriptType, context.scripts);
        allowRegexScriptTypeAfterEditSave(scriptType);
        queueRegexChatReloadAfterPanelClose();
    } catch (error) {
        if (modelScript) {
            modelScript.disabled = previousModelDisabled;
        } else {
            context.script.disabled = previousDisabled;
        }

        console.debug(`${LOG_PREFIX} Failed to save regex script toggle`, error);
        toastr.error(t`Failed to save regex script state. See console for details.`);
    }
}

async function setRegexVueGroupScriptsDisabled(scriptType, groupId, disabled) {
    const manager = getRegexVueManagerState();
    const typeKey = getRegexScriptTypeKey(scriptType);
    const group = manager.state?.lists?.[typeKey]?.groups?.find(item => item.id === groupId);

    if (!group || group.scripts.length === 0) {
        return;
    }

    const scripts = getRegexScriptsByType(scriptType);
    const changedScripts = group.scripts.filter(script => script?.id && Boolean(script.disabled ?? false) !== disabled);

    if (changedScripts.length === 0) {
        return;
    }

    const previousValues = new Map(changedScripts.map(script => [script.id, Boolean(script.disabled ?? false)]));

    for (const script of changedScripts) {
        script.disabled = disabled;
    }

    try {
        await saveRegexScriptList(scriptType, scripts);
        allowRegexScriptTypeAfterEditSave(scriptType);
        queueRegexChatReloadAfterPanelClose();
    } catch (error) {
        for (const script of changedScripts) {
            script.disabled = previousValues.get(script.id) ?? Boolean(script.disabled ?? false);
        }

        console.debug(`${LOG_PREFIX} Failed to save regex group script state`, error);
        toastr.error(t`Failed to save regex script state. See console for details.`);
    }
}

function getRegexVueScriptModelById(scriptType, scriptId) {
    const manager = getRegexVueManagerState();
    const typeKey = getRegexScriptTypeKey(scriptType);
    const list = manager.state?.lists?.[typeKey];

    if (!list || !scriptId) {
        return null;
    }

    for (const group of list.groups ?? []) {
        const script = group.scripts?.find(item => item?.id === scriptId);

        if (script) {
            return script;
        }
    }

    return null;
}

async function bulkToggleRegexVueScripts(enable) {
    const contexts = getRegexVueSelectedContexts().filter(context => Boolean(context.script.disabled ?? false) === enable);

    if (contexts.length === 0) {
        toastr.warning(enable ? t`No regex scripts selected for enabling.` : t`No regex scripts selected for disabling.`);
        return;
    }

    const scriptTypesToSave = new Set();

    for (const context of contexts) {
        context.script.disabled = !enable;
        scriptTypesToSave.add(context.scriptType);
    }

    try {
        for (const scriptType of scriptTypesToSave) {
            await saveRegexScriptList(scriptType, getRegexScriptsByType(scriptType));
            allowRegexScriptTypeAfterEditSave(scriptType);
        }

        syncRegexVueManagerState();
        queueRegexChatReloadAfterPanelClose();
    } catch (error) {
        console.debug(`${LOG_PREFIX} Failed to bulk toggle regex scripts`, error);
        toastr.error(t`Failed to save regex script state. See console for details.`);
        syncRegexVueManagerState();
    }
}

async function moveRegexVueScriptWithConfirmation(fromType, scriptId, toType) {
    if (fromType === toType) {
        return;
    }

    if (!canMoveRegexScriptsToType(toType)) {
        return;
    }

    const confirm = await callGenericPopup(getRegexMoveConfirmationMessage(toType), POPUP_TYPE.CONFIRM);

    if (!confirm) {
        return;
    }

    await moveRegexVueScript(fromType, scriptId, toType);
}

async function moveRegexVueScript(fromType, scriptId, toType) {
    const context = getRegexScriptContextById(fromType, scriptId);

    if (!context || fromType === toType) {
        return;
    }

    const targetScripts = getRegexScriptsByType(toType);
    const [movedScript] = context.scripts.splice(context.index, 1);

    if (!movedScript) {
        return;
    }

    targetScripts.push(movedScript);
    moveRegexScriptGroupMeta(fromType, toType, movedScript.id);

    try {
        await saveRegexScriptList(fromType, context.scripts);
        await saveRegexScriptList(toType, targetScripts);
        allowRegexScriptTypeAfterEditSave(toType);
        delete getRegexVueManagerState().state?.selectedIds?.[movedScript.id];
        syncRegexVueManagerState();
        queueRegexChatReloadAfterPanelClose();
    } catch (error) {
        const targetIndex = targetScripts.indexOf(movedScript);

        if (targetIndex !== -1) {
            targetScripts.splice(targetIndex, 1);
        }

        context.scripts.splice(context.index, 0, movedScript);
        console.debug(`${LOG_PREFIX} Failed to move regex script`, error);
        toastr.error(t`Failed to move regex script. See console for details.`);
        syncRegexVueManagerState();
    }
}

async function bulkMoveRegexVueScripts(toType) {
    const contexts = getRegexVueSelectedContexts();

    if (contexts.length === 0) {
        toastr.warning(t`No regex scripts selected for moving.`);
        return;
    }

    if (!canMoveRegexScriptsToType(toType)) {
        return;
    }

    const confirm = await callGenericPopup(getRegexBulkMoveConfirmationMessage(toType), POPUP_TYPE.CONFIRM);

    if (!confirm) {
        return;
    }

    const selectedIds = new Set(contexts.map(context => context.script.id));
    const movedScripts = [];

    for (const { scriptType } of getRegexScriptListDefinitions()) {
        if (scriptType === toType) {
            continue;
        }

        const scripts = getRegexScriptsByType(scriptType);

        for (let index = scripts.length - 1; index >= 0; index--) {
            const script = scripts[index];

            if (script?.id && selectedIds.has(script.id)) {
                scripts.splice(index, 1);
                movedScripts.unshift({ fromType: scriptType, script });
            }
        }
    }

    if (movedScripts.length === 0) {
        return;
    }

    const targetScripts = getRegexScriptsByType(toType);

    for (const moved of movedScripts) {
        targetScripts.push(moved.script);
        moveRegexScriptGroupMeta(moved.fromType, toType, moved.script.id);
    }

    try {
        for (const { scriptType } of getRegexScriptListDefinitions()) {
            await saveRegexScriptList(scriptType, getRegexScriptsByType(scriptType));
        }

        for (const scriptId of selectedIds) {
            delete getRegexVueManagerState().state?.selectedIds?.[scriptId];
        }

        allowRegexScriptTypeAfterEditSave(toType);
        syncRegexVueManagerState();
        queueRegexChatReloadAfterPanelClose();
    } catch (error) {
        console.debug(`${LOG_PREFIX} Failed to bulk move regex scripts`, error);
        toastr.error(t`Failed to move regex script. See console for details.`);
        syncRegexVueManagerState();
    }
}

async function promptBulkMoveRegexVueSelectedScriptsToGroup(scriptType) {
    const selectedScripts = getRegexVueSelectedScriptsForType(scriptType).filter(script => script?.id);

    if (selectedScripts.length === 0) {
        toastr.warning(t`No regex scripts selected for moving.`);
        return;
    }

    const targets = getRegexGroupMoveTargetOptions(scriptType);

    if (targets.length === 0) {
        toastr.warning(t`No regex groups available.`);
        return;
    }

    const template = $('<div class="bai-bai-regex-move-group-popup"></div>');
    const label = $('<label class="bai-bai-regex-move-group-label"></label>').text(t`目标分组`);
    const select = $('<select class="text_pole bai-bai-regex-move-group-select"></select>');

    for (const target of targets) {
        $('<option></option>')
            .val(target.id)
            .text(target.name)
            .appendTo(select);
    }

    template.append(
        $('<div class="bai-bai-regex-move-group-count"></div>').text(t`已选正则：${selectedScripts.length}`),
        label.append(select),
    );

    const confirmed = await callGenericPopup(template, POPUP_TYPE.CONFIRM, '', {
        okButton: t`移动`,
        cancelButton: t`取消`,
    });

    if (!confirmed) {
        return;
    }

    await bulkMoveRegexVueSelectedScriptsToGroup(scriptType, String(select.val() || ''));
}

function getRegexGroupMoveTargetOptions(scriptType) {
    const groupState = getRegexGroupStateForScriptType(scriptType);
    normalizeRegexGroupState(groupState);

    return [
        ...groupState.groups.map(group => ({
            id: group.id,
            name: group.name || t`Unnamed group`,
        })),
        {
            id: REGEX_UNGROUPED_GROUP_ID,
            name: getRegexUngroupedGroupDisplayName(groupState.ungrouped?.name),
        },
    ];
}

function isRegexGroupMoveTargetValid(scriptType, groupId) {
    if (groupId === REGEX_UNGROUPED_GROUP_ID) {
        return true;
    }

    const groupState = getRegexGroupStateForScriptType(scriptType);
    normalizeRegexGroupState(groupState);

    return groupState.groups.some(group => group.id === groupId);
}

async function bulkMoveRegexVueSelectedScriptsToGroup(scriptType, targetGroupId) {
    const selectedScripts = getRegexVueSelectedScriptsForType(scriptType).filter(script => script?.id);

    if (selectedScripts.length === 0) {
        toastr.warning(t`No regex scripts selected for moving.`);
        return;
    }

    if (!isRegexGroupMoveTargetValid(scriptType, targetGroupId)) {
        toastr.error(t`Target regex group was not found.`);
        return;
    }

    const scripts = getRegexScriptsByType(scriptType);
    const typeKey = getRegexScriptTypeKey(scriptType);
    const groupState = getRegexGroupStateForScriptType(scriptType);
    const previousScripts = scripts.slice();
    const previousGroupScripts = cloneRegexGroupScriptsMeta(groupState.scripts);
    const selectedIds = new Set(selectedScripts.map(script => script.id));
    const existingTargetOrders = Object.entries(groupState.scripts ?? {})
        .filter(([scriptId, meta]) => !selectedIds.has(scriptId) && meta?.groupId === targetGroupId)
        .map(([, meta]) => Number(meta.order))
        .filter(order => Number.isFinite(order));
    let nextOrder = existingTargetOrders.length > 0 ? Math.max(...existingTargetOrders) + 1 : 0;

    for (const script of selectedScripts) {
        groupState.scripts[script.id] = {
            groupId: targetGroupId,
            order: nextOrder,
        };
        nextOrder += 1;
    }
    sortRegexScriptsByGroupMeta(scripts, groupState);

    try {
        saveRegexGroupSettings();
        syncRegexVueManagerState();
        await saveRegexScriptsOrderFromModel(typeKey);

        for (const scriptId of selectedIds) {
            delete getRegexVueManagerState().state?.selectedIds?.[scriptId];
        }

        syncRegexVueManagerState();
    } catch (error) {
        scripts.splice(0, scripts.length, ...previousScripts);
        restoreRegexGroupScriptsMeta(groupState, previousGroupScripts);
        saveRegexGroupSettings();
        console.debug(`${LOG_PREFIX} Failed to bulk move regex scripts to group`, error);
        toastr.error(t`Failed to move regex script. See console for details.`);
        syncRegexVueManagerState();
    }
}

function sortRegexScriptsByGroupMeta(scripts, groupState) {
    if (!Array.isArray(scripts) || !groupState) {
        return false;
    }

    normalizeRegexGroupState(groupState);

    const validGroupIds = new Set((groupState.groups ?? []).map(group => group.id));
    const groupOrder = [
        REGEX_PENDING_ASSIGNMENT_GROUP_ID,
        ...(groupState.groups ?? []).map(group => group.id),
        REGEX_UNGROUPED_GROUP_ID,
    ];
    const buckets = new Map(groupOrder.map(groupId => [groupId, []]));

    for (let index = 0; index < scripts.length; index++) {
        const script = scripts[index];
        const meta = script?.id ? groupState.scripts?.[script.id] : null;
        const groupId = getNormalizedRegexGroupId(meta?.groupId, validGroupIds);
        const order = Number.isFinite(Number(meta?.order)) ? Number(meta.order) : index;

        if (!buckets.has(groupId)) {
            buckets.set(groupId, []);
        }

        buckets.get(groupId).push({ script, order, index });
    }

    const sortedScripts = [];

    for (const groupId of groupOrder) {
        const bucket = buckets.get(groupId) ?? [];
        bucket
            .sort((left, right) => left.order - right.order || left.index - right.index)
            .forEach(item => sortedScripts.push(item.script));
    }

    if (sortedScripts.length !== scripts.length) {
        return false;
    }

    scripts.splice(0, scripts.length, ...sortedScripts);
    return true;
}

function canMoveRegexScriptsToType(toType) {
    if (toType !== REGEX_SCRIPT_TYPES.SCOPED) {
        return true;
    }

    if (this_chid === undefined) {
        toastr.error(t`No character selected.`);
        return false;
    }

    if (selected_group) {
        toastr.error(t`Cannot edit scoped scripts in group chats.`);
        return false;
    }

    return true;
}

function getRegexBulkMoveConfirmationMessage(toType) {
    switch (toType) {
        case REGEX_SCRIPT_TYPES.GLOBAL:
            return t`Are you sure you want to move the selected regex scripts to global?`;
        case REGEX_SCRIPT_TYPES.SCOPED:
            return t`Are you sure you want to move the selected regex scripts to scoped?`;
        case REGEX_SCRIPT_TYPES.PRESET:
            return t`Are you sure you want to move the selected regex scripts to preset?`;
        default:
            return t`Are you sure you want to move the selected regex scripts?`;
    }
}

function moveRegexScriptGroupMeta(fromType, toType, scriptId) {
    const fromGroupState = getRegexGroupStateForScriptType(fromType);
    const toGroupState = getRegexGroupStateForScriptType(toType);
    delete fromGroupState.scripts[scriptId];
    toGroupState.scripts[scriptId] = {
        groupId: REGEX_UNGROUPED_GROUP_ID,
        order: Object.keys(toGroupState.scripts).length,
    };
    saveRegexGroupSettings();
}

async function deleteRegexVueScriptWithConfirmation(scriptType, scriptId) {
    const confirm = await callGenericPopup(t`Are you sure you want to delete this regex script?`, POPUP_TYPE.CONFIRM);

    if (!confirm) {
        return;
    }

    await deleteRegexVueScript(scriptType, scriptId);
}

async function deleteRegexVueScript(scriptType, scriptId) {
    const context = getRegexScriptContextById(scriptType, scriptId);

    if (!context) {
        return;
    }

    const [removedScript] = context.scripts.splice(context.index, 1);

    try {
        await saveRegexScriptList(scriptType, context.scripts);
        delete getRegexGroupStateForScriptType(scriptType).scripts[scriptId];
        delete getRegexVueManagerState().state?.selectedIds?.[scriptId];
        saveRegexGroupSettings();
        syncRegexVueManagerState();
        queueRegexChatReloadAfterPanelClose();
    } catch (error) {
        if (removedScript) {
            context.scripts.splice(context.index, 0, removedScript);
        }

        console.debug(`${LOG_PREFIX} Failed to delete regex script`, error);
        toastr.error(t`Failed to delete regex script. See console for details.`);
        syncRegexVueManagerState();
    }
}

async function bulkDeleteRegexVueScripts() {
    const contexts = getRegexVueSelectedContexts();

    if (contexts.length === 0) {
        toastr.warning(t`No regex scripts selected for deletion.`);
        return;
    }

    const confirm = await callGenericPopup(t`Are you sure you want to delete the selected regex scripts?`, POPUP_TYPE.CONFIRM);

    if (!confirm) {
        return;
    }

    const selectedIds = new Set(contexts.map(context => context.script.id));

    try {
        for (const { scriptType } of getRegexScriptListDefinitions()) {
            const scripts = getRegexScriptsByType(scriptType);

            for (let index = scripts.length - 1; index >= 0; index--) {
                if (selectedIds.has(scripts[index]?.id)) {
                    scripts.splice(index, 1);
                }
            }

            const groupState = getRegexGroupStateForScriptType(scriptType);

            for (const scriptId of selectedIds) {
                delete groupState.scripts[scriptId];
            }

            await saveRegexScriptList(scriptType, scripts);
        }

        for (const scriptId of selectedIds) {
            delete getRegexVueManagerState().state?.selectedIds?.[scriptId];
        }

        saveRegexGroupSettings();
        syncRegexVueManagerState();
        queueRegexChatReloadAfterPanelClose();
    } catch (error) {
        console.debug(`${LOG_PREFIX} Failed to bulk delete regex scripts`, error);
        toastr.error(t`Failed to delete regex script. See console for details.`);
        syncRegexVueManagerState();
    }
}

function exportRegexVueScript(scriptType, scriptId) {
    const context = getRegexScriptContextById(scriptType, scriptId);

    if (!context) {
        return;
    }

    const fileName = `regex-${sanitizeRegexExportFileName(context.script.scriptName || 'script')}.json`;
    download(JSON.stringify(context.script, null, 4), fileName, 'application/json');
}

function exportRegexVueSelectedScripts() {
    const scripts = getRegexVueSelectedContexts().map(context => context.script);

    if (scripts.length === 0) {
        toastr.warning(t`No regex scripts selected for export.`);
        return;
    }

    const fileName = `regex-${new Date().toISOString()}.json`;
    download(JSON.stringify(scripts, null, 4), fileName, 'application/json');
}

function getRegexScriptContextById(scriptType, scriptId) {
    const scripts = getRegexScriptsByType(scriptType);
    const index = scripts.findIndex(script => script?.id === scriptId);

    if (index === -1) {
        return null;
    }

    return {
        scriptType,
        scripts,
        index,
        script: scripts[index],
    };
}

export {
    bulkDeleteRegexVueScripts,
    bulkMoveRegexVueScripts,
    bulkMoveRegexVueSelectedScriptsToGroup,
    bulkToggleRegexVueScripts,
    canMoveRegexScriptsToType,
    createRegexVueGroup,
    deleteRegexVueGroup,
    deleteRegexVueScript,
    deleteRegexVueScriptWithConfirmation,
    exportRegexVueScript,
    exportRegexVueSelectedScripts,
    getAllRegexVueScriptIds,
    getRegexBulkMoveConfirmationMessage,
    getRegexGroupMoveTargetOptions,
    getRegexScriptContextById,
    getRegexVueScriptModelById,
    getRegexVueSelectedContexts,
    getRegexVueSelectedCountForList,
    getRegexVueSelectedScriptsForType,
    isRegexGroupMoveTargetValid,
    moveRegexScriptGroupMeta,
    moveRegexVueGroup,
    moveRegexVueScript,
    moveRegexVueScriptWithConfirmation,
    promptBulkMoveRegexVueSelectedScriptsToGroup,
    pruneRegexVueSelection,
    renameRegexVueGroup,
    setRegexVueGroupCollapsedInModel,
    setRegexVueGroupScriptsDisabled,
    setRegexVueScriptDisabled,
    setRegexVueScriptSelected,
    sortRegexScriptsByGroupMeta,
    toggleRegexVueBulkSelection,
    toggleRegexVueGroupCollapsed,
};
