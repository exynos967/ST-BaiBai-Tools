import { saveSettings } from '@sillytavern/script';
import { applyPresetPromptCodeMirrorEditorOptimization } from './codeMirror.js';
import { LINKED_PRESET_OPTIMIZATION_OPTIONS } from './constants.js';
import { applyPresetDragOptimization, cancelPromptManagerCustomDragPending, finishPromptManagerCustomDrag } from './dragCustom.js';
import { applyPresetInterfaceCollapse } from './interfaceCollapse.js';
import { applyPresetSaveOptimization, applyPresetToggleOptimization } from './saveToggle.js';
import { applyPresetScrollOptimization } from './scroll.js';
import { applyPresetSwitchOptimization } from './switchFast.js';
import { applyPresetGrouping, rebuildPresetVuePromptListDraggable, refreshPresetVuePromptListControlsLayout } from './vueList.js';

let settings = {};
let extensionState = {};
let LOG_PREFIX = '[BaiBaiToolkit]';
let loadCodeMirrorModules = null;
let codeMirrorHistoryMaxLength = 12000;
let savePresetOptimizationSettings = null;

function configurePresetOptimizations(context = {}) {
    settings = context.settings ?? settings;
    delete settings.presetPromptGroups;
    extensionState = context.extensionState ?? extensionState;
    LOG_PREFIX = context.logPrefix ?? LOG_PREFIX;
    loadCodeMirrorModules = context.loadCodeMirrorModules ?? loadCodeMirrorModules;
    codeMirrorHistoryMaxLength = context.codeMirrorHistoryMaxLength ?? codeMirrorHistoryMaxLength;
    savePresetOptimizationSettings = context.saveSettings ?? savePresetOptimizationSettings;
}

function bindPresetOptimizationSettings({ saveSettings } = {}) {
    savePresetOptimizationSettings = saveSettings ?? savePresetOptimizationSettings;

    const persistSettings = () => {
        if (typeof saveSettings === 'function') {
            saveSettings();
        }
    };

    const bindLinkedPresetOptimizationOption = ({ key, selector }) => {
        $(selector)
            .prop('checked', settings[key] === true)
            .on('input', function () {
                const enabled = Boolean($(this).prop('checked'));
                const changed = syncLinkedPresetOptimizationSettings(enabled);
                syncLinkedPresetOptimizationCheckboxes(enabled);
                if (!changed) {
                    return;
                }
                persistSettings();
                applyLinkedPresetOptimizationSettings();
            });
    };

    LINKED_PRESET_OPTIMIZATION_OPTIONS.forEach(bindLinkedPresetOptimizationOption);

    $('#bai_bai_toolkit_preset_interface_collapse_enabled')
        .prop('checked', settings.presetInterfaceCollapseEnabled === true)
        .on('input', function () {
            settings.presetInterfaceCollapseEnabled = Boolean($(this).prop('checked'));
            persistSettings();
            applyPresetInterfaceCollapse();
        });

    $('#bai_bai_toolkit_preset_switch_optimization_enabled')
        .prop('checked', settings.presetSwitchOptimizationEnabled === true)
        .on('input', function () {
            settings.presetSwitchOptimizationEnabled = Boolean($(this).prop('checked'));
            persistSettings();
            applyPresetSwitchOptimization();
        });

    $('#bai_bai_toolkit_preset_grouping_enabled')
        .prop('checked', settings.presetGroupingEnabled !== false)
        .on('input', function () {
            settings.presetGroupingEnabled = Boolean($(this).prop('checked'));
            persistSettings();
            applyPresetGrouping();
        });

    $('#bai_bai_toolkit_preset_grouping_edit_button_in_menu_enabled')
        .prop('checked', settings.presetGroupingEditButtonInMenuEnabled === true)
        .on('input', function () {
            settings.presetGroupingEditButtonInMenuEnabled = Boolean($(this).prop('checked'));
            persistSettings();
            refreshPresetVuePromptListControlsLayout();
        });

    $('#bai_bai_toolkit_preset_prompt_codemirror_editor_enabled')
        .prop('checked', settings.presetPromptCodeMirrorEditorEnabled)
        .on('input', function () {
            settings.presetPromptCodeMirrorEditorEnabled = Boolean($(this).prop('checked'));
            persistSettings();
            applyPresetPromptCodeMirrorEditorOptimization();
        });

    $('#bai_bai_toolkit_preset_auto_save_after_prompt_edit_enabled')
        .prop('checked', settings.presetAutoSaveAfterPromptEditEnabled)
        .on('input', function () {
            settings.presetAutoSaveAfterPromptEditEnabled = Boolean($(this).prop('checked'));
            persistSettings();
        });
}

function syncLinkedPresetOptimizationSettings(enabled) {
    let changed = false;

    for (const { key } of LINKED_PRESET_OPTIMIZATION_OPTIONS) {
        if (settings[key] !== enabled) {
            settings[key] = enabled;
            changed = true;
        }
    }

    return changed;
}

function syncLinkedPresetOptimizationCheckboxes(enabled) {
    for (const { selector } of LINKED_PRESET_OPTIMIZATION_OPTIONS) {
        $(selector).prop('checked', enabled);
    }
}

function applyLinkedPresetOptimizationSettings() {
    cancelPromptManagerCustomDragPending();
    finishPromptManagerCustomDrag({ cancelled: true });
    rebuildPresetVuePromptListDraggable();
    applyPresetScrollOptimization();
    applyPresetDragOptimization();
    applyPresetSwitchOptimization();
    applyPresetToggleOptimization();
    applyPresetSaveOptimization();
}

export {
    LOG_PREFIX,
    applyLinkedPresetOptimizationSettings,
    bindPresetOptimizationSettings,
    codeMirrorHistoryMaxLength,
    configurePresetOptimizations,
    extensionState,
    loadCodeMirrorModules,
    savePresetOptimizationSettings,
    settings,
    syncLinkedPresetOptimizationCheckboxes,
    syncLinkedPresetOptimizationSettings,
};
