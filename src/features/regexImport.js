import { this_chid } from '@sillytavern/script';
import { renderExtensionTemplateAsync } from '@sillytavern/scripts/extensions';
import { getScriptsByType as getRegexScriptsByType, SCRIPT_TYPES as REGEX_SCRIPT_TYPES } from '@sillytavern/scripts/extensions/regex/engine';
import { selected_group } from '@sillytavern/scripts/group-chats';
import { t } from '@sillytavern/scripts/i18n';
import { callGenericPopup, POPUP_TYPE } from '@sillytavern/scripts/popup';
import { download, getFileText, uuidv4 } from '@sillytavern/scripts/utils';
import { LOG_PREFIX, REGEX_QUICK_OPERATION_IMPORT_HANDLER_KEY } from './constants.js';
import { ensureRegexScriptGroupMeta, getRegexScriptContextFromRow, openOptimizedRegexEditor, updateRegexScriptRowFromScript } from './regexEditor.js';
import { saveRegexGroupSettings } from './regexGroups.js';
import { deleteRegexScriptRow, getRegexListSelectorForScriptType, preventRegexQuickOperationEvent, setRegexScriptRowDisabled } from './regexNative.js';
import { allowRegexScriptTypeAfterEditSave, queueRegexChatReloadAfterPanelClose, saveRegexScriptList } from './regexPending.js';
import { getRegexQuickOperationState } from './regexQuickOps.js';
import { isRegexVueManagerActive, syncRegexVueManagerAfterDataChange, updateRegexBulkControls } from './regexVue.js';
import { extensionState, settings } from './state.js';

function installOptimizedRegexImportHandler() {
    if (extensionState[REGEX_QUICK_OPERATION_IMPORT_HANDLER_KEY]) {
        return;
    }

    const handler = (event) => {
        if (!settings.regexQuickOperationOptimizationEnabled) {
            return;
        }

        const input = event.target instanceof HTMLInputElement ? event.target : null;

        if (!input || input.id !== 'import_regex_file') {
            return;
        }

        preventRegexQuickOperationEvent(event);
        void importRegexFilesOptimized(input);
    };

    extensionState[REGEX_QUICK_OPERATION_IMPORT_HANDLER_KEY] = handler;
    document.addEventListener('change', handler, true);
}

function removeOptimizedRegexImportHandler() {
    const handler = extensionState[REGEX_QUICK_OPERATION_IMPORT_HANDLER_KEY];

    if (!handler) {
        return;
    }

    document.removeEventListener('change', handler, true);
    delete extensionState[REGEX_QUICK_OPERATION_IMPORT_HANDLER_KEY];
}

async function importRegexFilesOptimized(inputElement) {
    const files = Array.from(inputElement.files ?? []);

    if (files.length === 0) {
        inputElement.value = '';
        return;
    }

    let target = REGEX_SCRIPT_TYPES.GLOBAL;

    try {
        const template = $(await renderExtensionTemplateAsync('regex', 'importTarget'));
        template.find('#regex_import_target_global').on('input', () => (target = REGEX_SCRIPT_TYPES.GLOBAL));
        template.find('#regex_import_target_scoped').on('input', () => (target = REGEX_SCRIPT_TYPES.SCOPED));
        template.find('#regex_import_target_preset').on('input', () => (target = REGEX_SCRIPT_TYPES.PRESET));

        await callGenericPopup(template, POPUP_TYPE.TEXT);

        const importedScripts = [];

        for (const file of files) {
            importedScripts.push(...await readOptimizedRegexImportFile(file));
        }

        if (importedScripts.length === 0) {
            return;
        }

        const scripts = getRegexScriptsByType(target);
        const validScripts = [];

        for (const importedScript of importedScripts) {
            const normalizedScript = normalizeOptimizedRegexImportScript(importedScript);

            if (!normalizedScript) {
                continue;
            }

            scripts.push(normalizedScript);
            validScripts.push(normalizedScript);
        }

        if (validScripts.length === 0) {
            return;
        }

        try {
            await saveRegexScriptList(target, scripts);
        } catch (error) {
            for (const script of validScripts) {
                const scriptIndex = scripts.indexOf(script);

                if (scriptIndex !== -1) {
                    scripts.splice(scriptIndex, 1);
                }
            }

            throw error;
        }

        if (isRegexVueManagerActive()) {
            for (const script of validScripts) {
                ensureRegexScriptGroupMeta(target, script.id);
                toastr.success(t`Regex script "${script.scriptName}" imported.`);
            }

            saveRegexGroupSettings();
            await syncRegexVueManagerAfterDataChange();
        } else {
            for (const script of validScripts) {
                await appendOptimizedRegexScriptRow(script, target);
                toastr.success(t`Regex script "${script.scriptName}" imported.`);
            }
        }

        updateRegexBulkControls();
        console.debug(`${LOG_PREFIX} Imported ${validScripts.length} regex scripts without list rebuild`);
    } catch (error) {
        console.debug(`${LOG_PREFIX} Failed to import regex scripts`, error);
        toastr.error(t`Failed to import regex scripts. See console for details.`);
    } finally {
        inputElement.value = '';
    }
}

async function readOptimizedRegexImportFile(file) {
    if (!file) {
        toastr.error('No file provided.');
        return [];
    }

    try {
        const regexScripts = JSON.parse(await getFileText(file));
        return Array.isArray(regexScripts) ? regexScripts : [regexScripts];
    } catch (error) {
        console.log(error);
        toastr.error('Invalid JSON file.');
        return [];
    }
}

function normalizeOptimizedRegexImportScript(regexScript) {
    try {
        if (!regexScript || typeof regexScript !== 'object' || Array.isArray(regexScript)) {
            throw new Error('Invalid regex object.');
        }

        if (!regexScript.scriptName) {
            throw new Error('No script name provided.');
        }

        return {
            ...regexScript,
            id: uuidv4(),
        };
    } catch (error) {
        console.log(error);
        toastr.error(t`Invalid regex object.`);
        return null;
    }
}

async function appendOptimizedRegexScriptRow(script, scriptType) {
    const containerSelector = getRegexListSelectorForScriptType(scriptType);
    const container = containerSelector ? document.querySelector(containerSelector) : null;

    if (!(container instanceof HTMLElement)) {
        return;
    }

    const template = await getOptimizedRegexScriptTemplate();
    const scriptHtml = template.clone();
    hydrateOptimizedRegexScriptRow(scriptHtml, script);
    $(container).append(scriptHtml);
}

async function getOptimizedRegexScriptTemplate() {
    const state = getRegexQuickOperationState();

    if (!state.scriptTemplate) {
        state.scriptTemplate = $(await renderExtensionTemplateAsync('regex', 'scriptTemplate'));
    }

    return state.scriptTemplate;
}

function hydrateOptimizedRegexScriptRow(scriptHtml, script) {
    if (!script.id) {
        script.id = uuidv4();
    }

    scriptHtml.attr('id', script.id);
    updateRegexScriptRowFromScript(scriptHtml.get(0), script);

    scriptHtml.find('.disable_regex').on('input', async function () {
        const row = scriptHtml.get(0);

        if (!(row instanceof HTMLElement)) {
            return;
        }

        await setRegexScriptRowDisabled(row, Boolean($(this).prop('checked')));
    });

    scriptHtml.find('.regex-toggle-on').on('click', function () {
        scriptHtml.find('.disable_regex').prop('checked', true).trigger('input');
    });

    scriptHtml.find('.regex-toggle-off').on('click', function () {
        scriptHtml.find('.disable_regex').prop('checked', false).trigger('input');
    });

    scriptHtml.find('.edit_existing_regex').on('click', async function () {
        const row = scriptHtml.get(0);

        if (row instanceof HTMLElement) {
            await openOptimizedRegexEditor(row);
        }
    });

    scriptHtml.find('.move_to_global').on('click', async function () {
        await moveOptimizedRegexScriptRowWithConfirmation(scriptHtml.get(0), REGEX_SCRIPT_TYPES.GLOBAL);
    });

    scriptHtml.find('.move_to_scoped').on('click', async function () {
        await moveOptimizedRegexScriptRowWithConfirmation(scriptHtml.get(0), REGEX_SCRIPT_TYPES.SCOPED);
    });

    scriptHtml.find('.move_to_preset').on('click', async function () {
        await moveOptimizedRegexScriptRowWithConfirmation(scriptHtml.get(0), REGEX_SCRIPT_TYPES.PRESET);
    });

    scriptHtml.find('.export_regex').on('click', function () {
        exportOptimizedRegexScriptRow(scriptHtml.get(0));
    });

    scriptHtml.find('.delete_regex').on('click', async function () {
        const row = scriptHtml.get(0);

        if (row instanceof HTMLElement) {
            await deleteRegexScriptRow(row);
        }
    });

    scriptHtml.find('.regex_bulk_checkbox').on('change', function () {
        updateRegexBulkControls();
    });

    scriptHtml.find('input[name="regex_expand"]').on('change', function () {
        if (!(this instanceof HTMLInputElement) || !this.checked) {
            return;
        }

        const closeMenuHandler = (event) => {
            if (event.target instanceof HTMLElement && event.target.closest('.regex-script-label')) {
                return;
            }

            this.checked = false;
            document.removeEventListener('click', closeMenuHandler);
        };

        setTimeout(() => {
            document.addEventListener('click', closeMenuHandler, { passive: true, once: false });
        }, 0);
    });
}

async function moveOptimizedRegexScriptRowWithConfirmation(row, toType) {
    if (!(row instanceof HTMLElement)) {
        return;
    }

    const context = getRegexScriptContextFromRow(row);

    if (!context || context.scriptType === toType) {
        return;
    }

    if (toType === REGEX_SCRIPT_TYPES.SCOPED) {
        if (this_chid === undefined) {
            toastr.error(t`No character selected.`);
            return;
        }

        if (selected_group) {
            toastr.error(t`Cannot edit scoped scripts in group chats.`);
            return;
        }
    }

    const confirm = await callGenericPopup(getRegexMoveConfirmationMessage(toType), POPUP_TYPE.CONFIRM);

    if (!confirm) {
        return;
    }

    await moveOptimizedRegexScriptRow(row, toType);
}

function getRegexMoveConfirmationMessage(toType) {
    switch (toType) {
        case REGEX_SCRIPT_TYPES.GLOBAL:
            return t`Are you sure you want to move this regex script to global?`;
        case REGEX_SCRIPT_TYPES.SCOPED:
            return t`Are you sure you want to move this regex script to scoped?`;
        case REGEX_SCRIPT_TYPES.PRESET:
            return t`Are you sure you want to move this regex script to preset?`;
        default:
            return t`Are you sure you want to move this regex script?`;
    }
}

async function moveOptimizedRegexScriptRow(row, toType) {
    const context = getRegexScriptContextFromRow(row);
    const targetSelector = getRegexListSelectorForScriptType(toType);
    const targetList = targetSelector ? document.querySelector(targetSelector) : null;

    if (!context || !(targetList instanceof HTMLElement)) {
        return;
    }

    const targetScripts = getRegexScriptsByType(toType);
    const [movedScript] = context.scripts.splice(context.index, 1);

    if (!movedScript) {
        return;
    }

    targetScripts.push(movedScript);

    try {
        await saveRegexScriptList(toType, targetScripts);
        await saveRegexScriptList(context.scriptType, context.scripts);
        allowRegexScriptTypeAfterEditSave(toType);

        const bulkCheckbox = row.querySelector('.regex_bulk_checkbox');

        if (bulkCheckbox instanceof HTMLInputElement) {
            bulkCheckbox.checked = false;
        }

        targetList.append(row);
        updateRegexBulkControls();
        queueRegexChatReloadAfterPanelClose();
    } catch (error) {
        const targetIndex = targetScripts.indexOf(movedScript);

        if (targetIndex !== -1) {
            targetScripts.splice(targetIndex, 1);
        }

        if (!context.scripts.includes(movedScript)) {
            context.scripts.splice(context.index, 0, movedScript);
        }

        try {
            await saveRegexScriptList(context.scriptType, context.scripts);
            await saveRegexScriptList(toType, targetScripts);
        } catch (rollbackError) {
            console.debug(`${LOG_PREFIX} Failed to roll back regex script move`, rollbackError);
        }

        console.debug(`${LOG_PREFIX} Failed to move regex script`, error);
        toastr.error(t`Failed to move regex script. See console for details.`);
    }
}

function exportOptimizedRegexScriptRow(row) {
    if (!(row instanceof HTMLElement)) {
        return;
    }

    const context = getRegexScriptContextFromRow(row);

    if (!context) {
        return;
    }

    const fileName = `regex-${sanitizeRegexExportFileName(context.script.scriptName || 'script')}.json`;
    const fileData = JSON.stringify(context.script, null, 4);
    download(fileData, fileName, 'application/json');
}

function sanitizeRegexExportFileName(name) {
    return String(name).replace(/[\s.<>:"/\\|?*\x00-\x1F\x7F]/g, '_').toLowerCase();
}

export {
    appendOptimizedRegexScriptRow,
    exportOptimizedRegexScriptRow,
    getOptimizedRegexScriptTemplate,
    getRegexMoveConfirmationMessage,
    hydrateOptimizedRegexScriptRow,
    importRegexFilesOptimized,
    installOptimizedRegexImportHandler,
    moveOptimizedRegexScriptRow,
    moveOptimizedRegexScriptRowWithConfirmation,
    normalizeOptimizedRegexImportScript,
    readOptimizedRegexImportFile,
    removeOptimizedRegexImportHandler,
    sanitizeRegexExportFileName,
};
