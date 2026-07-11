import { event_types, eventSource, getCurrentChatId, getRequestHeaders, saveSettings } from '../../../../script.js';
import * as scriptModule from '../../../../script.js';
import { extension_settings } from '../../../extensions.js';
import * as groupChatsModule from '../../../group-chats.js';
import { oai_settings, openai_setting_names, openai_settings, promptManager, settingsToUpdate } from '../../../openai.js';
import { getPresetManager } from '../../../preset-manager.js';
import { getTokenizerModel } from '../../../tokenizers.js';
import { t } from '../../../i18n.js';
import { callGenericPopup, POPUP_TYPE } from '../../../popup.js';
import { INJECTION_POSITION } from '../../../PromptManager.js';
import { isMobile } from '../../../RossAscends-mods.js';
import { renderTemplateAsync } from '../../../templates.js';
import { debounce, escapeHtml, getStringHash, uuidv4 } from '../../../utils.js';

const PRESET_PROMPT_CODEMIRROR_EDITOR_KEY = '__baiBaiToolkitPresetPromptCodeMirrorEditor';
const PRESET_PROMPT_CODEMIRROR_EDITOR_STYLE_ID = 'bai_bai_toolkit_preset_prompt_codemirror_editor_style';
const PRESET_BACKUP_PREVIEW_UI_STYLE_ID = 'bai_bai_toolkit_preset_backup_preview_ui_style';
const PRESET_INTERFACE_COLLAPSE_STYLE_ID = 'bai_bai_toolkit_preset_interface_collapse_style';
const PRESET_SCROLL_STYLE_ID = 'bai_bai_toolkit_preset_scroll_style';
const PRESET_DRAG_STYLE_ID = 'bai_bai_toolkit_preset_drag_style';
const LINKED_PRESET_OPTIMIZATION_OPTIONS = [
    {
        key: 'presetScrollOptimizationEnabled',
        selector: '#bai_bai_toolkit_preset_scroll_optimization_enabled',
    },
    {
        key: 'presetDragOptimizationEnabled',
        selector: '#bai_bai_toolkit_preset_drag_optimization_enabled',
    },
    {
        key: 'presetMobileWholeRowDragEnabled',
        selector: '#bai_bai_toolkit_preset_mobile_whole_row_drag_enabled',
    },
    {
        key: 'presetToggleOptimizationEnabled',
        selector: '#bai_bai_toolkit_preset_toggle_optimization_enabled',
    },
];
const PRESET_BACKUP_PREVIEW_APP_KEY = '__baiBaiToolkitPresetBackupPreviewApp';
const PRESET_BACKUP_PREVIEW_UI_KEY = '__baiBaiToolkitPresetBackupPreviewUi';
const PRESET_INTERFACE_COLLAPSE_OBSERVER_KEY = '__baiBaiToolkitPresetInterfaceCollapseObserver';
const PRESET_INTERFACE_COLLAPSE_EXTERNAL_TOGGLE_HANDLER_KEY = '__baiBaiToolkitPresetInterfaceCollapseExternalToggleHandler';
const PRESET_DRAG_HANDLER_KEY = '__baiBaiToolkitPresetDragHandler';
const PRESET_DRAG_PATCH_KEY = '__baiBaiToolkitPresetDragPatch';
const PRESET_AUTO_BACKUP_FETCH_KEY = '__baiBaiToolkitPresetAutoBackupFetch';
const PRESET_SWITCH_BEFORE_HANDLER_KEY = '__baiBaiToolkitPresetSwitchBeforeHandler';
const PRESET_SWITCH_HANDLER_KEY = '__baiBaiToolkitPresetSwitchHandler';
const PRESET_MODEL_CHANGE_HANDLER_KEY = '__baiBaiToolkitPresetModelChangeHandler';
const PRESET_CHAT_LOADED_HANDLER_KEY = '__baiBaiToolkitPresetChatLoadedHandler';
const PRESET_CONTEXT_TOKEN_REFRESH_KEY = '__baiBaiToolkitPresetContextTokenRefresh';
const PRESET_GROUP_PRESET_DELETED_HANDLER_KEY = '__baiBaiToolkitPresetGroupPresetDeletedHandler';
const PRESET_GROUP_PRESET_IMPORT_HANDLER_KEY = '__baiBaiToolkitPresetGroupPresetImportHandler';
const PRESET_GROUP_PRESET_RENAMED_HANDLER_KEY = '__baiBaiToolkitPresetGroupPresetRenamedHandler';
const PRESET_AUTO_BACKUP_RENAME_HANDLER_KEY = '__baiBaiToolkitPresetAutoBackupRenameHandler';
const PRESET_SELECT_CHANGE_HANDLER_KEY = '__baiBaiToolkitPresetSelectChangeHandler';
const PRESET_DELETE_HANDLER_KEY = '__baiBaiToolkitPresetDeleteHandler';
const PRESET_LIST_ACTION_HANDLER_KEY = '__baiBaiToolkitPresetListActionHandler';
const PRESET_TOGGLE_HANDLER_KEY = '__baiBaiToolkitPresetToggleHandler';
const PRESET_SAVE_HANDLER_KEY = '__baiBaiToolkitPresetSaveHandler';
const PRESET_UPDATE_PENDING_CHANGES_HANDLER_KEY = '__baiBaiToolkitPresetUpdatePendingChangesHandler';
const PRESET_EXPORT_PENDING_CHANGES_HANDLER_KEY = '__baiBaiToolkitPresetExportPendingChangesHandler';
const PRESET_VUE_LIST_MANAGER_KEY = '__baiBaiToolkitPresetVueListManager';
const PRESET_VUE_LIST_RENDER_PATCH_KEY = '__baiBaiToolkitPresetVueListRenderPatch';
const PRESET_GROUP_GENERATION_GATE_PATCH_KEY = '__baiBaiToolkitPresetGroupGenerationGatePatch';
const PRESET_VUE_TOUCH_SCROLL_GUARD_KEY = '__baiBaiToolkitPresetVueTouchScrollGuard';
const PRESET_VUE_DRAG_PLACEMENT_LISTENER_KEY = '__baiBaiToolkitPresetVueDragPlacementListener';
const PRESET_VUE_GROUP_HEADER_CUSTOM_DRAG_LISTENER_KEY = '__baiBaiToolkitPresetVueGroupHeaderCustomDragListener';
const PRESET_VUE_DYNAMIC_DRAG_DELAY_HANDLER_KEY = '__baiBaiToolkitPresetVueDynamicDragDelayHandler';
const PRESET_PENDING_CHANGES_LIFECYCLE_HANDLER_KEY = '__baiBaiToolkitPresetPendingChangesLifecycleHandler';
const PRESET_VUE_LIST_HOST_CLASS = 'bai-bai-preset-vue-list-host';
const PRESET_VUE_DRAGGING_BODY_CLASS = 'bai-bai-preset-vue-dragging';
const PRESET_VUE_DRAG_READY_FEEDBACK_CLASS = 'bai-bai-preset-vue-drag-ready-feedback';
const PRESET_VUE_GROUP_DROP_TARGET_CLASS = 'bai-bai-preset-drop-target';
const PRESET_VUE_TOP_LEVEL_DRAGGABLE_CLASS = 'bai-bai-preset-top-level-draggable';
const PRESET_VUE_GROUP_CHILD_DRAGGABLE_CLASS = 'bai-bai-preset-group-child-draggable';
const PRESET_VUE_TOP_LEVEL_DRAGGABLE_SELECTOR = `>li:is(.${PRESET_VUE_TOP_LEVEL_DRAGGABLE_CLASS},.completion_prompt_manager_prompt_draggable)`;
const PRESET_VUE_LIST_GAP_VARIABLE = '--bai-bai-preset-list-gap';
const PRESET_VUE_MODULE_PATH = './vendor/vue.esm-browser.prod.js';
const PRESET_VUE_DRAGGABLE_MODULE_PATH = './vendor/vue-draggable-next.esm-browser.prod.js';
const PRESET_VUE_HEADER_ENTRY_ID = '__bai_bai_preset_header';
const PRESET_VUE_SEPARATOR_ENTRY_ID = '__bai_bai_preset_separator';
const PRESET_VUE_GLOBAL_LIBRARY_ENTRY_ID = '__bai_bai_preset_global_library';
const PRESET_VUE_FAVORITES_ENTRY_ID = '__bai_bai_preset_favorites';
const PRESET_GROUP_EXTENSION_PATH = 'baibaiToolkit.presetPromptGroups';
const PRESET_FAVORITES_EXTENSION_PATH = 'baibaiToolkit.presetPromptFavorites';
const PRESET_GLOBAL_LIBRARY_DATABASE = 'bai-bai-toolkit';
const PRESET_GLOBAL_LIBRARY_STORE = 'preset-global-prompts';
const PRESET_GLOBAL_LIBRARY_KEY = 'library';
const PRESET_GLOBAL_LIBRARY_VERSION = 2;
const PRESET_VUE_GLOBAL_LIBRARY_DRAG_GROUP = 'bai-bai-global-library';
const PRESET_COMPAT_ENTRY_GROUPING_EXTENSION_PATH = 'entryGrouping';
const PRESET_VUE_EXPAND_ANIMATION_MS = 180;
const PRESET_VUE_COLLAPSE_ANIMATION_MS = 180;
const PRESET_VUE_BODY_HEIGHT_ANIMATION_MS = 180;
const PRESET_VUE_BODY_HEIGHT_EASING = 'cubic-bezier(0.2, 0, 0, 1)';
const PRESET_VUE_DRAG_ANIMATION_MS = 180;
const PRESET_VUE_EMPTY_INSERT_THRESHOLD_PX = 40;
const PRESET_VUE_GROUP_DROP_TARGET_MIN_HEIGHT_PX = 44;
const PRESET_PENDING_CHANGES_VISIBILITY_CHECK_DELAY_MS = 120;
const PRESET_PENDING_CHANGES_VISIBILITY_FALLBACK_DELAY_MS = 1000;
const PRESET_PENDING_CHANGES_FOCUSOUT_CHECK_DELAY_MS = 60;
const PRESET_RENAME_SAVE_GATE_TIMEOUT_MS = 30000;
const PRESET_GROUP_COMPAT_CHOICE_RESULT_BASE = 1001;
const PRESET_VUE_POINTER_START_THRESHOLD_PX = 4;
const PRESET_VUE_TOUCH_DRAG_DELAY_MS = 320;
const PRESET_VUE_TOUCH_START_THRESHOLD_PX = 10;
const PRESET_VUE_GROUP_HEADER_TOGGLE_DISTANCE_PX = 6;
const PRESET_VUE_GROUP_HEADER_DRAG_SUPPRESS_MS = 350;
const PRESET_DRAG_LONG_PRESS_MS = 300;
const PRESET_PROMPT_DELETE_CHOICE_DETACH = 2201;
const PRESET_PROMPT_DELETE_CHOICE_DELETE = 2202;

function isPresetGenerationActive() {
    if (typeof scriptModule.isGenerating === 'function') {
        try {
            return Boolean(scriptModule.isGenerating());
        } catch {
            return false;
        }
    }

    return Boolean(scriptModule.is_send_press || groupChatsModule.is_group_generating);
}
const PRESET_DRAG_CANCEL_DISTANCE_PX = 12;
const PRESET_DRAG_CLICK_SUPPRESS_MS = 500;
const PRESET_INTERFACE_COLLAPSE_WRAPPER_ID = 'bai_bai_toolkit_preset_interface_collapse_wrapper';
const PRESET_INTERFACE_COLLAPSE_CONTENT_CLASS = 'bai-bai-preset-interface-collapse-content';
const PRESET_INTERFACE_COLLAPSE_PLACEHOLDER_PREFIX = 'bai_bai_toolkit_preset_interface_collapse_placeholder';
const PRESET_INTERFACE_COLLAPSE_BLOCK_ATTR = 'data-bai-bai-preset-interface-collapse-block';
const PRESET_INTERFACE_COLLAPSE_RETRY_MS = 250;
const PRESET_INTERFACE_COLLAPSE_RETRY_LIMIT = 20;
const LAYOUT_EXTENSION_SETTINGS_KEY = 'SillyTavern-Layout';
const LAYOUT_PRESET_COLLAPSE_WRAPPER_ID = 'te-preset-wrapper';
const PRESET_INTERFACE_COLLAPSE_MUTATION_SELECTOR = [
    `#${PRESET_INTERFACE_COLLAPSE_WRAPPER_ID}`,
    `#${LAYOUT_PRESET_COLLAPSE_WRAPPER_ID}`,
    '#range_block_openai',
    '#openai_settings',
    '#te_collapse_preset',
    '#te-placeholder-preset-1',
    '#te-placeholder-preset-2',
    '#te-placeholder-preset-3',
    `[${PRESET_INTERFACE_COLLAPSE_BLOCK_ATTR}]`,
    `[id^="${PRESET_INTERFACE_COLLAPSE_PLACEHOLDER_PREFIX}_"]`,
].join(', ');
const OPENAI_PRESET_SELECT_SELECTOR = '#settings_preset_openai';
const OPENAI_PRESET_DELETE_SELECTOR = '#delete_oai_preset';
const OPENAI_PRESET_UPDATE_SELECTOR = '#update_oai_preset';
const OPENAI_PRESET_EXPORT_SELECTOR = '#export_oai_preset';
const OPENAI_SETTINGS_SELECTOR = '#openai_settings';
const LEFT_NAV_PANEL_SELECTOR = '#left-nav-panel';
const PRESET_BACKUP_PREVIEW_UI_ID = 'bai_bai_toolkit_preset_backup_preview';
const PRESET_BACKUP_PREVIEW_CLOSING_CLASS = 'bai-bai-preset-backup-closing';
const PRESET_PROMPT_MANAGER_LIST_SELECTOR = '#completion_prompt_manager_list';
const PRESET_VUE_GROUP_DROP_SURFACE_SELECTOR = `${PRESET_PROMPT_MANAGER_LIST_SELECTOR} .bai-bai-preset-group-body, ${PRESET_PROMPT_MANAGER_LIST_SELECTOR} .bai-bai-preset-group-body-inner, ${PRESET_PROMPT_MANAGER_LIST_SELECTOR} .bai-bai-preset-group-list`;
const PRESET_PROMPT_MANAGER_SAVE_SELECTOR = '#completion_prompt_manager_popup_entry_form_save';
const PRESET_PROMPT_MANAGER_RESET_SELECTOR = '#completion_prompt_manager_popup_entry_form_reset';
const PRESET_PROMPT_MANAGER_CLOSE_SELECTOR = '#completion_prompt_manager_popup_entry_form_close, #completion_prompt_manager_popup_close_button';
const PRESET_PROMPT_EDITOR_SOURCE_ID = 'completion_prompt_manager_popup_entry_form_prompt';
const PRESET_PROMPT_EDITOR_SOURCE_SELECTOR = '#completion_prompt_manager_popup_entry_form_prompt';
const PRESET_PROMPT_MAXIMIZED_SOURCE_SELECTOR = 'textarea.maximized_textarea[data-for="completion_prompt_manager_popup_entry_form_prompt"]';
const PRESET_PROMPT_CODEMIRROR_EDITOR_ID = 'bai_bai_preset_prompt_codemirror_editor';
const PRESET_PROMPT_CODEMIRROR_EDITOR_CLASS = 'bai-bai-toolkit-preset-prompt-codemirror-editor';
const PRESET_PROMPT_SOURCE_HIDDEN_CLASS = 'bai-bai-toolkit-preset-prompt-source-hidden';
const PRESET_PROMPT_CODEMIRROR_READONLY_CLASS = 'bai-bai-toolkit-preset-prompt-readonly';
const PRESET_PROMPT_CODEMIRROR_MAXIMIZED_CLASS = 'bai-bai-toolkit-preset-prompt-maximized';
const PRESET_DRAG_INTERACTIVE_SELECTOR = '.prompt_manager_prompt_controls, .bai-bai-preset-prompt-actions-hint, .bai-bai-preset-prompt-actions, .bai-bai-preset-prompt-action-button, [data-preset-prompt-action], .prompt-manager-detach-action, .prompt-manager-inspect-action, .prompt-manager-edit-action, .prompt-manager-toggle-action, .bai-bai-preset-group-actions, .bai-bai-preset-group-toggle, a, button, input, select, textarea, [contenteditable="true"]';
const BAIBAOKU_TOKENIZER_BULK_COUNT_URL = '/api/plugins/baibaoku/v1/tokenizers/bulk-count';
const OPENAI_TOKENIZER_BULK_BRIDGE_KEY = '__baibaokuTokenizerBulkBridge';
const OPENAI_TOKENIZER_BULK_CACHE_LIMIT = 5000;
const OPENAI_TOKENIZER_BULK_AJAX_BATCH_DELAY_MS = 8;
const OPENAI_TOKENIZER_BULK_PREPARE_CHUNK_SIZE = 80;
const OPENAI_TOKENIZER_BULK_PREPARE_MAX_MESSAGES = 800;
const OPENAI_TOKENIZER_BULK_FAILURE_THRESHOLD = 3;
const OPENAI_TOKENIZER_BULK_CIRCUIT_BREAKER_MS = 45000;
const PROMPT_MANAGER_TOKEN_REFRESH_QUEUE_KEY = '__baiBaiToolkitPromptManagerTokenRefreshQueue';
const PROMPT_MANAGER_TOKEN_REFRESH_DEFAULT_DELAY_MS = 1000;
const PROMPT_MANAGER_TOKEN_REFRESH_FAST_DELAY_MS = 250;
const PROMPT_MANAGER_TOKEN_REFRESH_BUSY_DELAY_MS = 1500;
const PRESET_SAVE_URL = '/api/presets/save';
const PRESET_BACKUP_SAVE_URL = '/api/plugins/baibaoku/v1/preset-backups/save';
const PRESET_BACKUP_PREVIEW_LIST_URL = '/api/plugins/baibaoku/v1/preset-backups/save/list';
const PRESET_BACKUP_PREVIEW_RENAME_URL = '/api/plugins/baibaoku/v1/preset-backups/save/rename';
const PRESET_BACKUP_PREVIEW_NOTE_URL = '/api/plugins/baibaoku/v1/preset-backups/save/note';
const PRESET_BACKUP_PREVIEW_DELETE_URL = '/api/plugins/baibaoku/v1/preset-backups/save/delete';
const PRESET_BACKUP_PREVIEW_DOWNLOAD_URL = '/api/plugins/baibaoku/v1/preset-backups/download';
const PRESET_CHAT_LOAD_RENDER_SUPPRESS_MS = 2000;
const PRESET_CONTEXT_TOKEN_REFRESH_DELAY_MS = 80;
const PRESET_CONTEXT_TOKEN_REFRESH_RETRY_MS = 250;
const PRESET_CONTEXT_TOKEN_REFRESH_MAX_ATTEMPTS = 8;
const PRESET_CONTEXT_TOKEN_REFRESH_SELF_SUPPRESS_MS = 750;
const PRESET_DRAG_READY_CLASS = 'bai-bai-toolkit-preset-drag-ready';
const PRESET_DRAG_ACTIVE_CLASS = 'bai-bai-toolkit-preset-drag-active';
const PRESET_DRAG_SOURCE_CLASS = 'bai-bai-toolkit-preset-drag-source';
const PRESET_DRAG_CLONE_CLASS = 'bai-bai-toolkit-preset-drag-clone';
const PRESET_DRAG_INDICATOR_CLASS = 'bai-bai-toolkit-preset-drag-indicator';
const FORCE_EDIT_PROMPTS = new Set([
    'charDescription',
    'charPersonality',
    'scenario',
    'personaDescription',
    'worldInfoBefore',
    'worldInfoAfter',
]);
const FORCE_TOGGLE_PROMPTS = new Set([
    'charDescription',
    'charPersonality',
    'scenario',
    'personaDescription',
    'worldInfoBefore',
    'worldInfoAfter',
    'main',
    'chatHistory',
    'dialogueExamples',
]);
const PRESET_CONTEXT_INJECTION_PROMPT_IDS = new Set([
    'chatHistory',
    'worldInfoBefore',
    'worldInfoAfter',
    'charDescription',
    'charPersonality',
    'scenario',
    'personaDescription',
    'dialogueExamples',
]);
const PRESET_EFFECTIVE_TOKEN_HEADER_CLASS = 'bai-bai-preset-effective-token-header';
const PRESET_EFFECTIVE_TOKEN_HEADER_PENDING_TEXT = '预设总Token: 计算中';
const PRESET_EFFECTIVE_TOKEN_HEADER_TITLE = '已启用预设条目 Token 总数（不含聊天记录、世界书、角色信息等上下文注入）';

const PRESET_BACKUP_PREVIEW_PAGE_SIZE = 5;
const PRESET_BACKUP_PREVIEW_NOTE_MAX_LENGTH = 500;
const PRESET_BACKUP_PREVIEW_BATCH_DELETE_CONCURRENCY = 6;
const PRESET_BACKUP_PREVIEW_EXPAND_ANIMATION_MS = 180;
let presetAutoBackupBackendAvailable = true;

let settings = {};
let extensionState = {};
let LOG_PREFIX = '[BaiBaiToolkit]';
let loadCodeMirrorModules = null;
let codeMirrorHistoryMaxLength = 12000;
let savePresetOptimizationSettings = null;

export function configurePresetOptimizations(context = {}) {
    settings = context.settings ?? settings;
    delete settings.presetPromptGroups;
    extensionState = context.extensionState ?? extensionState;
    LOG_PREFIX = context.logPrefix ?? LOG_PREFIX;
    loadCodeMirrorModules = context.loadCodeMirrorModules ?? loadCodeMirrorModules;
    codeMirrorHistoryMaxLength = context.codeMirrorHistoryMaxLength ?? codeMirrorHistoryMaxLength;
    savePresetOptimizationSettings = context.saveSettings ?? savePresetOptimizationSettings;
}

export function installOpenAITokenizerBulkBridge() {
    const state = getOpenAITokenizerBulkState();
    const bridge = globalThis[OPENAI_TOKENIZER_BULK_BRIDGE_KEY] && typeof globalThis[OPENAI_TOKENIZER_BULK_BRIDGE_KEY] === 'object'
        ? globalThis[OPENAI_TOKENIZER_BULK_BRIDGE_KEY]
        : {};

    bridge.installed = true;
    bridge.version = '0.1';
    bridge.prepareOpenAIMessages = prepareOpenAITokenizerBulkMessages;
    bridge.prepareWorldInfoBudgetCounts = prepareOpenAITokenizerWorldInfoBudgetCounts;
    bridge.clear = () => state.cache.clear();
    bridge.getStats = () => ({ ...state.stats, cacheSize: state.cache.size });
    bridge.isEnabled = isOpenAITokenizerBulkEnabled;
    globalThis[OPENAI_TOKENIZER_BULK_BRIDGE_KEY] = bridge;

    installOpenAITokenizerBulkAjaxPatch();
}

export function bindPresetOptimizationSettings({ saveSettings } = {}) {
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

function loadPresetCodeMirrorModules() {
    if (typeof loadCodeMirrorModules !== 'function') {
        return Promise.reject(new Error('CodeMirror module loader is not configured'));
    }

    return loadCodeMirrorModules();
}

function getPresetCodeMirrorHistoryMaxLength() {
    return Number(codeMirrorHistoryMaxLength) || 12000;
}

function dispatchDescriptionEditorSourceInput(source) {
    let event = null;

    try {
        event = typeof InputEvent === 'function'
            ? new InputEvent('input', {
                bubbles: true,
                inputType: 'insertReplacementText',
                data: '',
            })
            : null;
    } catch {
        event = null;
    }

    event ||= new Event('input', { bubbles: true });

    source.dispatchEvent(event);
}

function applyPresetAutoBackup() {
    installPresetAutoBackupFetchHook();
    installPresetRenameBackupSuppressionListener();
}

// 独立监听 PRESET_RENAMED_BEFORE 来开启备份抑制窗口,只依赖自动备份本身是否可用,
// 与分组开关解耦(分组关闭、仅装了后端柏宝库时也能去重)。窗口关闭由 update guard 驱动。
function installPresetRenameBackupSuppressionListener() {
    if (extensionState[PRESET_AUTO_BACKUP_RENAME_HANDLER_KEY] || !event_types.PRESET_RENAMED_BEFORE) {
        return;
    }

    const handler = (event) => {
        if (event?.apiId !== 'openai' || !event.oldName || !event.newName) {
            return;
        }

        beginPresetRenameBackupSuppression();
    };

    extensionState[PRESET_AUTO_BACKUP_RENAME_HANDLER_KEY] = handler;
    eventSource.on(event_types.PRESET_RENAMED_BEFORE, handler);
}

function setPresetAutoBackupBackendAvailable(available) {
    presetAutoBackupBackendAvailable = available !== false;
    installPresetAutoBackupFetchHook();
}

function installPresetAutoBackupFetchHook() {
    const existing = globalThis[PRESET_AUTO_BACKUP_FETCH_KEY];

    if (existing?.wrappedFetch) {
        existing.isEnabled = () => settings.presetAutoBackupEnabled !== false && presetAutoBackupBackendAvailable;
        existing.skipCount = Number(existing.skipCount) || 0;
        return existing;
    }

    const originalFetch = globalThis.fetch;

    if (typeof originalFetch !== 'function') {
        return null;
    }

    const state = {
        originalFetch: originalFetch.bind(globalThis),
        wrappedFetch: null,
        skipCount: 0,
        isEnabled: () => settings.presetAutoBackupEnabled !== false && presetAutoBackupBackendAvailable,
    };

    state.wrappedFetch = function baiBaiToolkitPresetAutoBackupFetch(input, init) {
        const isPresetSaveRequest = isPresetAutoBackupSourceRequest(input, init);

        if (state.isEnabled() && isPresetSaveRequest) {
            if (state.renameSuppress) {
                // 重命名进行中:不立即备份,只同步记住最后一次保存内容,窗口关闭时再补一次。
                capturePresetRenameBackupBodySync(state, input, init);
            } else if (state.skipCount > 0) {
                state.skipCount -= 1;
            } else {
                void schedulePresetAutoBackupFromRequest(state, input, init);
            }
        }

        const requestPromise = state.originalFetch(input, init);

        if (isPresetSaveRequest) {
            const body = readPresetSaveBodySync(init);

            if (isOpenAiPresetSaveBody(body)) {
                trackOpenAiPresetSaveRequest(state, body, requestPromise);
            }
        }

        return requestPromise;
    };

    state.wrappedFetch[PRESET_AUTO_BACKUP_FETCH_KEY] = true;
    globalThis[PRESET_AUTO_BACKUP_FETCH_KEY] = state;
    globalThis.fetch = state.wrappedFetch;
    return state;
}

function skipNextPresetAutoBackup() {
    const state = installPresetAutoBackupFetchHook();

    if (state) {
        state.skipCount += 1;
    }

    return state;
}

function isPresetAutoBackupSourceRequest(input, init) {
    if (getPresetAutoBackupFetchMethod(input, init) !== 'POST') {
        return false;
    }

    const url = getPresetAutoBackupFetchUrl(input);

    if (!url) {
        return false;
    }

    if (!url.includes(PRESET_SAVE_URL)) {
        return false;
    }

    try {
        return new URL(url, location.href).pathname === PRESET_SAVE_URL;
    } catch {
        return false;
    }
}

async function schedulePresetAutoBackupFromRequest(state, input, init) {
    const body = await readPresetAutoBackupJsonBody(input, init);

    if (!isPresetAutoBackupBody(body)) {
        return;
    }

    await sendPresetAutoBackup(state, body);
}

async function sendPresetAutoBackup(state, body) {
    try {
        await state.originalFetch(PRESET_BACKUP_SAVE_URL, {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify(body),
        });
    } catch (error) {
        console.debug(`${LOG_PREFIX} Failed to create preset auto backup`, error);
    }
}

// 重命名期间会连续触发多次 /api/presets/save(ST 的"先建空预设→写回扩展→update 落盘"流程)。
// 这里开一个抑制窗口:窗口内不逐次备份,只同步记住最后一次保存的内容;窗口由事件关闭
// (update 收尾 click,见 installPresetUpdatePendingChangesGuard),关闭时只补一次最终结果备份。
// 全程不依赖定时器。
function beginPresetRenameBackupSuppression() {
    const state = installPresetAutoBackupFetchHook();

    if (!state) {
        return;
    }

    state.renameSuppress = { lastBody: null };
}

// 同步记录本次保存内容。重命名期间的所有 /save 的 init.body 都是 JSON 字符串,可直接解析。
function capturePresetRenameBackupBodySync(state, input, init) {
    if (!state.renameSuppress) {
        return;
    }

    const body = readPresetSaveBodySync(init);

    if (isPresetAutoBackupBody(body)) {
        state.renameSuppress.lastBody = body;
    }
}

function readPresetSaveBodySync(init) {
    try {
        const raw = init && typeof init.body === 'string' ? init.body : null;
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

function isOpenAiPresetSaveBody(body) {
    return Boolean(isPresetAutoBackupBody(body) && body.apiId === 'openai');
}

function trackOpenAiPresetSaveRequest(state, body, requestPromise) {
    if (!(state.activeOpenAiPresetSaveRequests instanceof Map)) {
        state.activeOpenAiPresetSaveRequests = new Map();
    }

    const presetName = body.name;
    const requests = state.activeOpenAiPresetSaveRequests.get(presetName) ?? new Set();
    // The caller still has post-fetch work (response.json + in-memory preset cache updates).
    // Keep the request active through the next task so rename cannot overtake that continuation.
    const trackedPromise = Promise.resolve(requestPromise).then(
        response => new Promise(resolve => setTimeout(resolve, 0, response)),
        error => new Promise((_, reject) => setTimeout(reject, 0, error)),
    );
    requests.add(trackedPromise);
    state.activeOpenAiPresetSaveRequests.set(presetName, requests);

    const renameGate = getOpenAiPresetRenameSaveGate();

    if (renameGate && (presetName === renameGate.oldName || presetName === renameGate.newName)) {
        renameGate.latestSaveRequest = {
            presetName,
            revision: getPresetPromptSaveRevision(presetName),
            promise: trackedPromise,
        };
    }

    const cleanup = () => {
        requests.delete(trackedPromise);

        if (!requests.size) {
            state.activeOpenAiPresetSaveRequests.delete(presetName);
        }
    };

    trackedPromise.then(cleanup, cleanup);
}

function getActiveOpenAiPresetSaveRequests(presetName) {
    const state = globalThis[PRESET_AUTO_BACKUP_FETCH_KEY];
    const requests = state?.activeOpenAiPresetSaveRequests?.get(presetName);
    return requests instanceof Set ? Array.from(requests) : [];
}

// 关闭抑制窗口并补一次最终结果备份。幂等:重复调用时窗口已关,直接返回。
function flushPresetRenameBackup() {
    const state = globalThis[PRESET_AUTO_BACKUP_FETCH_KEY];

    if (!state?.renameSuppress) {
        return;
    }

    const body = state.renameSuppress.lastBody;
    state.renameSuppress = null;

    if (state.isEnabled() && isPresetAutoBackupBody(body)) {
        void sendPresetAutoBackup(state, body);
    }
}

function isPresetRenameInProgress() {
    return Boolean(globalThis[PRESET_AUTO_BACKUP_FETCH_KEY]?.renameSuppress);
}

function getOpenAiPresetRenameSaveGate() {
    const gate = extensionState.openAiPresetRenameSaveGate;
    return gate && typeof gate === 'object' ? gate : null;
}

function isOpenAiPresetRenameSaveGateActive() {
    return Boolean(getOpenAiPresetRenameSaveGate());
}

function beginOpenAiPresetRenameSaveGate(oldName, newName) {
    const existingGate = getOpenAiPresetRenameSaveGate();

    if (existingGate) {
        settleOpenAiPresetRenameSaveGate(existingGate, getOpenAiPresetRenameFallbackName(existingGate));
    }

    installPresetAutoBackupFetchHook();

    let resolveCompletion;
    const gate = {
        oldName,
        newName,
        renamed: false,
        latestSaveRequest: null,
        finalSavedRevision: null,
        deferredSaveTail: Promise.resolve(),
        completionPromise: new Promise(resolve => {
            resolveCompletion = resolve;
        }),
        resolveCompletion: null,
        timeout: 0,
    };

    gate.resolveCompletion = resolveCompletion;
    gate.timeout = setTimeout(() => {
        if (getOpenAiPresetRenameSaveGate() !== gate) {
            return;
        }

        console.debug(`${LOG_PREFIX} Preset rename save gate timed out`, {
            oldName: gate.oldName,
            newName: gate.newName,
            renamed: gate.renamed,
        });
        settleOpenAiPresetRenameSaveGate(gate, getOpenAiPresetRenameFallbackName(gate));
    }, PRESET_RENAME_SAVE_GATE_TIMEOUT_MS);
    extensionState.openAiPresetRenameSaveGate = gate;

    const activeRequests = [
        ...getActiveOpenAiPresetSaveRequests(oldName),
        ...getActiveOpenAiPresetSaveRequests(newName),
    ];

    return Promise.allSettled(Array.from(new Set(activeRequests)));
}

function markOpenAiPresetRenameSaveGateRenamed(oldName, newName) {
    const gate = getOpenAiPresetRenameSaveGate();

    if (!gate || gate.oldName !== oldName || gate.newName !== newName) {
        return false;
    }

    gate.renamed = true;
    return true;
}

function getOpenAiPresetRenameFallbackName(gate) {
    if (gate?.renamed || oai_settings?.preset_settings_openai === gate?.newName) {
        return gate?.newName;
    }

    return gate?.oldName;
}

function settleOpenAiPresetRenameSaveGate(gate, resolvedPresetName) {
    if (!gate || getOpenAiPresetRenameSaveGate() !== gate) {
        return false;
    }

    clearTimeout(gate.timeout);
    delete extensionState.openAiPresetRenameSaveGate;
    gate.resolveCompletion(resolvedPresetName);
    return true;
}

async function finishOpenAiPresetRenameSaveGateAfterFinalSave() {
    const gate = getOpenAiPresetRenameSaveGate();

    if (!gate || !gate.renamed) {
        return;
    }

    const finalSaveRequest = gate.latestSaveRequest;
    let saved = false;

    if (finalSaveRequest?.promise) {
        try {
            const response = await finalSaveRequest.promise;
            saved = response?.ok !== false;
        } catch (error) {
            console.debug(`${LOG_PREFIX} Failed to finish the final renamed preset save`, error);
        }
    }

    if (saved && Number.isFinite(finalSaveRequest.revision)) {
        gate.finalSavedRevision = finalSaveRequest.revision;
        clearPendingPresetPromptChangesForSavedRevision(
            finalSaveRequest.presetName,
            finalSaveRequest.revision,
        );
    }

    settleOpenAiPresetRenameSaveGate(gate, gate.newName);
}

function getOpenAiPresetSaveStateName(presetName) {
    const gate = getOpenAiPresetRenameSaveGate();

    if (!gate || (presetName !== gate.oldName && presetName !== gate.newName)) {
        return presetName;
    }

    return gate.renamed ? gate.newName : gate.oldName;
}

function isPresetAutoBackupBody(body) {
    return Boolean(
        body
        && typeof body === 'object'
        && !Array.isArray(body)
        && typeof body.name === 'string'
        && body.name.trim()
        && body.preset
        && typeof body.preset === 'object',
    );
}

async function readPresetAutoBackupJsonBody(input, init) {
    if (Object.prototype.hasOwnProperty.call(init || {}, 'body')) {
        return readPresetAutoBackupJsonValue(init.body);
    }

    if (!isPresetAutoBackupRequest(input) || input.bodyUsed || !input.body) {
        return null;
    }

    try {
        return await input.clone().json().catch(() => null);
    } catch {
        return null;
    }
}

async function readPresetAutoBackupJsonValue(value) {
    if (typeof value === 'string') {
        return parsePresetAutoBackupJson(value);
    }

    if (typeof Blob === 'function' && value instanceof Blob) {
        return parsePresetAutoBackupJson(await value.text());
    }

    return null;
}

function parsePresetAutoBackupJson(text) {
    try {
        return JSON.parse(text);
    } catch {
        return null;
    }
}

function getPresetAutoBackupFetchUrl(input) {
    if (typeof input === 'string') {
        return input;
    }

    if (input instanceof URL) {
        return input.href;
    }

    if (isPresetAutoBackupRequest(input)) {
        return input.url;
    }

    return '';
}

function getPresetAutoBackupFetchMethod(input, init) {
    return String(init?.method || (isPresetAutoBackupRequest(input) ? input.method : '') || 'GET').toUpperCase();
}

function isPresetAutoBackupRequest(value) {
    return typeof Request === 'function' && value instanceof Request;
}

function applyPresetBackupPreviewUi() {
    applyPresetBackupPreviewUiStyle();
    insertPresetBackupPreviewUi();
    installPresetBackupPreviewUiObserver();
}

function insertPresetBackupPreviewUi() {
    const target = document.querySelector(OPENAI_SETTINGS_SELECTOR);

    if (!(target instanceof HTMLElement) || !target.parentElement) {
        return false;
    }

    let host = document.getElementById(PRESET_BACKUP_PREVIEW_UI_ID);

    if (!(host instanceof HTMLElement)) {
        host = document.createElement('div');
        host.id = PRESET_BACKUP_PREVIEW_UI_ID;
        host.className = 'bai-bai-preset-backup-preview';
    }

    void mountPresetBackupPreviewVueApp(host);

    if (host.nextElementSibling !== target || host.parentElement !== target.parentElement) {
        target.parentElement.insertBefore(host, target);
    }

    return true;
}

function installPresetBackupPreviewUiObserver() {
    if (extensionState[PRESET_BACKUP_PREVIEW_UI_KEY] || typeof MutationObserver !== 'function' || !document.body) {
        return;
    }

    const state = { observer: null, pending: false };
    const sync = () => {
        state.pending = false;
        insertPresetBackupPreviewUi();
    };
    const scheduleSync = () => {
        if (state.pending) {
            return;
        }

        state.pending = true;

        if (typeof requestAnimationFrame === 'function') {
            requestAnimationFrame(sync);
        } else {
            setTimeout(sync, 0);
        }
    };
    const observer = new MutationObserver(scheduleSync);

    state.observer = observer;

    observer.observe(document.body, { childList: true, subtree: true });
    extensionState[PRESET_BACKUP_PREVIEW_UI_KEY] = state;
}

async function mountPresetBackupPreviewVueApp(host) {
    if (!(host instanceof HTMLElement) || extensionState[PRESET_BACKUP_PREVIEW_APP_KEY]?.host === host) {
        return;
    }

    const existing = extensionState[PRESET_BACKUP_PREVIEW_APP_KEY];

    if (existing?.app) {
        try {
            existing.app.unmount();
        } catch (error) {
            console.debug(`${LOG_PREFIX} Failed to unmount preset backup preview app`, error);
        }
    }

    try {
        const vue = await loadPresetVueModule();

        if (!document.documentElement.contains(host)) {
            return;
        }

        const state = createPresetBackupPreviewModel();
        const app = vue.createApp(createPresetBackupPreviewRootComponent(vue, state));
        app.mount(host);
        extensionState[PRESET_BACKUP_PREVIEW_APP_KEY] = { host, app, state };
    } catch (error) {
        console.debug(`${LOG_PREFIX} Failed to mount preset backup preview Vue app`, error);
    }
}

function createPresetBackupPreviewModel() {
    return {
        items: [],
        query: '',
        page: 1,
        hasLoaded: false,
        loading: false,
        status: '',
        composing: false,
        renameDialogOpen: false,
        renameTarget: null,
        renameValue: '',
        renameComposing: false,
        renaming: false,
        noteDialogOpen: false,
        noteTarget: null,
        noteValue: '',
        noteComposing: false,
        savingNote: false,
        deleteDialogOpen: false,
        deleteTarget: null,
        deleting: false,
        selectionMode: false,
        selectedFileNames: [],
        batchDeleting: false,
        importingFileName: '',
        closing: false,
        animating: false,
    };
}

function createPresetBackupPreviewRootComponent(vue, model) {
    const h = vue.h;

    return {
        name: 'PresetBackupPreview',
        data() {
            return model;
        },
        computed: {
            normalizedQuery() {
                return this.query.trim().toLowerCase();
            },
            filteredItems() {
                if (!this.normalizedQuery) {
                    return this.items;
                }

                return this.items.filter(item => item.searchText.includes(this.normalizedQuery));
            },
            pageCount() {
                return Math.max(1, Math.ceil(this.filteredItems.length / PRESET_BACKUP_PREVIEW_PAGE_SIZE));
            },
            safePage() {
                return Math.min(Math.max(1, this.page), this.pageCount);
            },
            pagedItems() {
                const page = this.safePage;
                const start = (page - 1) * PRESET_BACKUP_PREVIEW_PAGE_SIZE;
                return this.filteredItems.slice(start, start + PRESET_BACKUP_PREVIEW_PAGE_SIZE);
            },
            selectedCount() {
                return this.selectedFileNames.length;
            },
            pageAllSelected() {
                const pageItems = this.pagedItems;

                return pageItems.length > 0 && pageItems.every(item => this.selectedFileNames.includes(item.fileName));
            },
            displayStatus() {
                if (this.status) {
                    return this.status;
                }

                const total = this.items.length;
                const visibleCount = this.filteredItems.length;

                if (total <= 0) {
                    return '';
                }

                const firstVisible = visibleCount > 0 ? (this.safePage - 1) * PRESET_BACKUP_PREVIEW_PAGE_SIZE + 1 : 0;
                const lastVisible = visibleCount > 0 ? Math.min(this.safePage * PRESET_BACKUP_PREVIEW_PAGE_SIZE, visibleCount) : 0;

                return this.normalizedQuery
                    ? `\u663e\u793a ${firstVisible}-${lastVisible} / ${visibleCount} \u4e2a\u5339\u914d\u5907\u4efd\uff0c\u5171 ${total} \u4e2a\u5907\u4efd`
                    : `\u663e\u793a ${firstVisible}-${lastVisible} / ${total} \u4e2a\u5907\u4efd`;
            },
        },
        watch: {
            page() {
                this.clampPage();
            },
            filteredItems() {
                this.clampPage();
            },
        },
        methods: {
            clampPage() {
                const nextPage = Math.min(Math.max(1, this.page), this.pageCount);

                if (nextPage !== this.page) {
                    this.page = nextPage;
                }
            },
            setQuery(value) {
                this.query = String(value ?? '');
                this.page = 1;
            },
            onSearchInput(event) {
                if (event?.isComposing || this.composing) {
                    return;
                }

                this.setQuery(event?.target?.value ?? '');
            },
            onSearchCompositionStart() {
                this.composing = true;
            },
            onSearchCompositionEnd(event) {
                this.composing = false;
                this.setQuery(event?.target?.value ?? '');
            },
            async refresh() {
                if (this.loading) {
                    return;
                }

                this.loading = true;
                this.status = '\u6b63\u5728\u5237\u65b0\u5907\u4efd\u5217\u8868...';

                try {
                    this.items = await fetchPresetBackupPreviewItems();
                    this.page = 1;
                    this.hasLoaded = true;
                    this.status = '';
                } catch (error) {
                    console.warn(`${LOG_PREFIX} Failed to refresh preset backups`, error);
                    this.status = `\u5237\u65b0\u5931\u8d25\uff1a${error?.message || '\u672a\u77e5\u9519\u8bef'}`;
                    this.hasLoaded = true;
                } finally {
                    this.loading = false;
                }
            },
            prevPage() {
                this.page = Math.max(1, this.safePage - 1);
            },
            nextPage() {
                this.page = Math.min(this.pageCount, this.safePage + 1);
            },
            openRenameDialog(item) {
                if (!item || this.renaming || this.deleting || this.importingFileName) {
                    return;
                }

                this.deleteDialogOpen = false;
                this.deleteTarget = null;
                this.renameTarget = item;
                this.renameValue = item.name || '';
                this.renameComposing = false;
                this.renameDialogOpen = true;
                this.status = '';

                vue.nextTick(() => {
                    const input = this.$refs.renameInput;

                    if (input instanceof HTMLInputElement) {
                        input.focus();
                        input.select();
                    }
                });
            },
            closeRenameDialog(force = false) {
                if (this.renaming && !force) {
                    return;
                }

                this.renameDialogOpen = false;
                this.renameTarget = null;
                this.renameValue = '';
                this.renameComposing = false;
            },
            openDeleteDialog(item) {
                if (!item || this.deleting || this.renaming || this.importingFileName) {
                    return;
                }

                this.renameDialogOpen = false;
                this.renameTarget = null;
                this.deleteTarget = item;
                this.deleteDialogOpen = true;
                this.status = '';
            },
            closeDeleteDialog(force = false) {
                if ((this.deleting || this.batchDeleting) && !force) {
                    return;
                }

                this.deleteDialogOpen = false;
                this.deleteTarget = null;
            },
            openNoteDialog(item) {
                if (!item || this.savingNote || this.renaming || this.deleting || this.batchDeleting || this.importingFileName) {
                    return;
                }

                this.renameDialogOpen = false;
                this.renameTarget = null;
                this.deleteDialogOpen = false;
                this.deleteTarget = null;
                this.noteTarget = item;
                this.noteValue = item.note || '';
                this.noteComposing = false;
                this.noteDialogOpen = true;
                this.status = '';

                vue.nextTick(() => {
                    const input = this.$refs.noteInput;

                    if (input instanceof HTMLTextAreaElement) {
                        input.focus();
                        const length = input.value.length;
                        input.setSelectionRange(length, length);
                    }
                });
            },
            closeNoteDialog(force = false) {
                if (this.savingNote && !force) {
                    return;
                }

                this.noteDialogOpen = false;
                this.noteTarget = null;
                this.noteValue = '';
                this.noteComposing = false;
            },
            onNoteInput(event) {
                this.noteValue = String(event?.target?.value ?? '').slice(0, PRESET_BACKUP_PREVIEW_NOTE_MAX_LENGTH);
            },
            onNoteCompositionStart() {
                this.noteComposing = true;
            },
            onNoteCompositionEnd(event) {
                this.noteComposing = false;
                this.onNoteInput(event);
            },
            async confirmNote() {
                const target = this.noteTarget;

                if (!target || this.savingNote) {
                    return;
                }

                const note = this.noteValue.trim();
                this.savingNote = true;
                this.status = note ? '正在保存备注...' : '正在清除备注...';

                try {
                    const updated = normalizePresetBackupPreviewItem(await updatePresetBackupPreviewNote(target.fileName, note));

                    this.items = this.items.map(item => item.fileName === target.fileName
                        ? (updated || {
                            ...item,
                            note,
                            searchText: `${item.name} ${note} ${item.createdAt}`.toLowerCase(),
                        })
                        : item);
                    this.status = note ? '已保存备注' : '已清除备注';
                    this.closeNoteDialog(true);
                } catch (error) {
                    console.warn(`${LOG_PREFIX} Failed to update preset backup note`, error);
                    this.status = `备注保存失败：${error?.message || '未知错误'}`;
                } finally {
                    this.savingNote = false;
                }
            },
            onRenameInput(event) {
                this.renameValue = String(event?.target?.value ?? '');
            },
            onRenameCompositionStart() {
                this.renameComposing = true;
            },
            onRenameCompositionEnd(event) {
                this.renameComposing = false;
                this.onRenameInput(event);
            },
            onRenameKeydown(event) {
                if (event?.key !== 'Enter' || event.isComposing || this.renameComposing) {
                    return;
                }

                event.preventDefault();
                void this.confirmRename();
            },
            async confirmRename() {
                const target = this.renameTarget;
                const showName = this.renameValue.trim();

                if (!target || this.renaming) {
                    return;
                }

                if (!showName) {
                    this.status = '\u5907\u4efd\u540d\u79f0\u4e0d\u80fd\u4e3a\u7a7a';
                    return;
                }

                this.renaming = true;
                this.status = '\u6b63\u5728\u91cd\u547d\u540d\u5907\u4efd...';

                try {
                    const updated = normalizePresetBackupPreviewItem(await renamePresetBackupPreviewItem(target.fileName, showName));

                    this.items = this.items.map(item => item.fileName === target.fileName
                        ? (updated || {
                            ...item,
                            name: formatPresetBackupPreviewDisplayName(showName),
                            searchText: `${formatPresetBackupPreviewDisplayName(showName)} ${item.note || ''} ${item.createdAt}`.toLowerCase(),
                        })
                        : item);
                    this.status = `\u5df2\u91cd\u547d\u540d\uff1a${formatPresetBackupPreviewDisplayName(showName)}`;
                    this.closeRenameDialog(true);
                } catch (error) {
                    console.warn(`${LOG_PREFIX} Failed to rename preset backup`, error);
                    this.status = `\u91cd\u547d\u540d\u5931\u8d25\uff1a${error?.message || '\u672a\u77e5\u9519\u8bef'}`;
                } finally {
                    this.renaming = false;
                }
            },
            async confirmDelete() {
                const target = this.deleteTarget;

                if (!target || this.deleting) {
                    return;
                }

                this.deleting = true;
                this.status = '\u6b63\u5728\u5220\u9664\u5907\u4efd...';

                try {
                    await deletePresetBackupPreviewItem(target.fileName);
                    this.items = this.items.filter(item => item.fileName !== target.fileName);
                    this.status = `\u5df2\u5220\u9664\uff1a${target.name || target.fileName}`;
                    this.closeDeleteDialog(true);
                } catch (error) {
                    console.warn(`${LOG_PREFIX} Failed to delete preset backup`, error);
                    this.status = `\u5220\u9664\u5931\u8d25\uff1a${error?.message || '\u672a\u77e5\u9519\u8bef'}`;
                } finally {
                    this.deleting = false;
                }
            },
            toggleSelectionMode() {
                if (this.deleting || this.batchDeleting || this.renaming || this.savingNote || this.importingFileName) {
                    return;
                }

                this.selectionMode = !this.selectionMode;
                this.selectedFileNames = [];
                this.status = '';

                if (this.selectionMode) {
                    this.renameDialogOpen = false;
                    this.noteDialogOpen = false;
                    this.deleteDialogOpen = false;
                }
            },
            exitSelectionMode() {
                if (this.batchDeleting) {
                    return;
                }

                this.selectionMode = false;
                this.selectedFileNames = [];
            },
            toggleSelect(item) {
                if (!item || this.batchDeleting) {
                    return;
                }

                this.selectedFileNames = this.selectedFileNames.includes(item.fileName)
                    ? this.selectedFileNames.filter(fileName => fileName !== item.fileName)
                    : [...this.selectedFileNames, item.fileName];
            },
            toggleSelectPage() {
                if (this.batchDeleting) {
                    return;
                }

                const pageFileNames = this.pagedItems.map(item => item.fileName);

                if (this.pageAllSelected) {
                    this.selectedFileNames = this.selectedFileNames.filter(fileName => !pageFileNames.includes(fileName));
                } else {
                    const merged = new Set(this.selectedFileNames);
                    pageFileNames.forEach(fileName => merged.add(fileName));
                    this.selectedFileNames = Array.from(merged);
                }
            },
            openBatchDeleteDialog() {
                if (this.batchDeleting || this.selectedFileNames.length <= 0) {
                    return;
                }

                this.deleteTarget = null;
                this.deleteDialogOpen = true;
                this.status = '';
            },
            async confirmBatchDelete() {
                if (this.batchDeleting || this.selectedFileNames.length <= 0) {
                    return;
                }

                // \u6279\u91cf\u5220\u9664\u590d\u7528\u5355\u6761\u5220\u9664\u63a5\u53e3\uff0c\u5bf9\u6ca1\u6709\u6279\u91cf\u63a5\u53e3\u7684\u65e7\u540e\u7aef\u5929\u7136\u517c\u5bb9\uff1b
                // \u8fd9\u91cc\u7528\u6709\u4e0a\u9650\u7684\u5e76\u53d1\u6c60\u5e76\u53d1\u5220\u9664\uff0c\u907f\u514d\u4e00\u6b21\u9009\u5f88\u591a\u65f6\u7529\u51fa\u8fc7\u591a\u5e76\u53d1\u8bf7\u6c42\u3002
                const targets = this.items.filter(item => this.selectedFileNames.includes(item.fileName));
                const total = targets.length;
                this.batchDeleting = true;
                this.status = `\u6b63\u5728\u5220\u9664\uff1a0 / ${total}`;

                let done = 0;
                let failed = 0;
                const failedFileNames = [];
                const queue = targets.slice();

                const worker = async () => {
                    while (queue.length > 0) {
                        const target = queue.shift();

                        if (!target) {
                            continue;
                        }

                        try {
                            await deletePresetBackupPreviewItem(target.fileName);
                            this.items = this.items.filter(item => item.fileName !== target.fileName);
                            this.selectedFileNames = this.selectedFileNames.filter(fileName => fileName !== target.fileName);
                            done += 1;
                        } catch (error) {
                            console.warn(`${LOG_PREFIX} Failed to delete preset backup in batch`, error);
                            failed += 1;
                            failedFileNames.push(target.fileName);
                        }

                        this.status = `\u6b63\u5728\u5220\u9664\uff1a${done + failed} / ${total}`;
                    }
                };

                const workerCount = Math.min(PRESET_BACKUP_PREVIEW_BATCH_DELETE_CONCURRENCY, total);
                await Promise.all(Array.from({ length: workerCount }, () => worker()));

                this.batchDeleting = false;
                this.deleteDialogOpen = false;
                this.deleteTarget = null;
                // \u5931\u8d25\u7684\u9879\u4fdd\u6301\u9009\u4e2d\uff0c\u65b9\u4fbf\u7528\u6237\u91cd\u8bd5\uff1b\u5168\u90e8\u6210\u529f\u624d\u9000\u51fa\u9009\u62e9\u6a21\u5f0f\u3002
                this.selectedFileNames = failedFileNames;
                this.status = failed > 0
                    ? `\u5df2\u5220\u9664 ${done} \u4e2a\uff0c${failed} \u4e2a\u5931\u8d25`
                    : `\u5df2\u5220\u9664 ${done} \u4e2a\u5907\u4efd`;

                if (this.selectedFileNames.length <= 0) {
                    this.selectionMode = false;
                }
            },
            async importBackup(item) {
                if (!item || this.importingFileName) {
                    return;
                }

                this.importingFileName = item.fileName;
                this.status = `\u6b63\u5728\u5bfc\u5165\uff1a${item.name || item.fileName}`;

                try {
                    const result = await downloadPresetBackupPreviewItem(item.fileName);
                    const { apiId, name, preset } = normalizePresetBackupImportPayload(result, item);
                    const manager = getPresetManager(apiId);

                    if (!manager || typeof manager.savePreset !== 'function') {
                        throw new Error(`Preset manager not found: ${apiId}`);
                    }

                    const importName = getUniquePresetBackupImportName(manager, name);
                    const skipState = skipNextPresetAutoBackup();
                    const skipCountBeforeSave = skipState?.skipCount ?? 0;

                    try {
                        await manager.savePreset(importName, preset);
                    } finally {
                        if (skipState && skipState.skipCount >= skipCountBeforeSave) {
                            skipState.skipCount = Math.max(0, skipCountBeforeSave - 1);
                        }
                    }

                    this.status = `\u5df2\u5bfc\u5165\u5e76\u5207\u6362\uff1a${importName}`;
                } catch (error) {
                    console.warn(`${LOG_PREFIX} Failed to import preset backup`, error);
                    this.status = `\u5bfc\u5165\u5931\u8d25\uff1a${error?.message || '\u672a\u77e5\u9519\u8bef'}`;
                } finally {
                    this.importingFileName = '';
                }
            },
            setActionStatus(action, item) {
                const name = item?.name || '\u8fd9\u4e2a\u5907\u4efd';
                const labels = {
                    delete: '\u5220\u9664\u63a5\u53e3\u5f85\u63a5\u5165\uff1a',
                    download: '\u4e0b\u8f7d\u63a5\u53e3\u5f85\u63a5\u5165\uff1a',
                };

                this.status = `${labels[action] || ''}${name}`;
            },
            toggleDetails(event) {
                event?.preventDefault();
                togglePresetBackupPreviewDetails(this.$refs.details, this);
            },
        },
        render() {
            return h('details', {
                ref: 'details',
                class: {
                    'bai-bai-preset-backup-details': true,
                    [PRESET_BACKUP_PREVIEW_CLOSING_CLASS]: this.closing,
                },
            }, [
                h('summary', {
                    class: 'bai-bai-preset-backup-summary',
                    onClick: this.toggleDetails,
                }, [
                    h('span', { class: 'bai-bai-preset-backup-title' }, [
                        h('i', { class: 'fa-solid fa-clock-rotate-left' }),
                        h('span', '\u81ea\u52a8\u5907\u4efd\u9884\u8bbe'),
                    ]),
                    h('span', { class: 'bai-bai-preset-backup-summary-meta' }, [
                        h('small', '\u5907\u4efd\u5217\u8868'),
                        h('i', { class: 'fa-solid fa-chevron-right bai-bai-preset-backup-chevron' }),
                    ]),
                ]),
                h('div', { class: 'bai-bai-preset-backup-body' }, [
                    h('div', { class: 'bai-bai-preset-backup-toolbar' }, [
                        h('label', { class: 'bai-bai-preset-backup-search' }, [
                            h('i', { class: 'fa-solid fa-magnifying-glass' }),
                            h('input', {
                                class: 'text_pole',
                                type: 'search',
                                autocomplete: 'off',
                                style: 'padding-left: 36px !important; background: transparent !important;',
                                placeholder: '\u641c\u7d22\u5907\u4efd\u9884\u8bbe',
                                value: this.query,
                                onInput: this.onSearchInput,
                                onCompositionstart: this.onSearchCompositionStart,
                                onCompositionend: this.onSearchCompositionEnd,
                            }),
                        ]),
                        h('button', {
                            class: {
                                menu_button: true,
                                menu_button_icon: true,
                                'bai-bai-preset-backup-batch-toggle': true,
                                'bai-bai-preset-backup-batch-active': this.selectionMode,
                            },
                            type: 'button',
                            title: this.selectionMode ? '\u9000\u51fa\u6279\u91cf\u7ba1\u7406' : '\u6279\u91cf\u7ba1\u7406',
                            disabled: this.loading || this.batchDeleting,
                            onClick: this.toggleSelectionMode,
                        }, [h('i', { class: 'fa-solid fa-list-check' })]),
                        h('button', {
                            class: {
                                menu_button: true,
                                menu_button_icon: true,
                                'bai-bai-preset-backup-refresh': true,
                                'bai-bai-preset-backup-refreshing': this.loading,
                            },
                            type: 'button',
                            title: '\u5237\u65b0\u5907\u4efd\u5217\u8868',
                            disabled: this.loading,
                            onClick: this.refresh,
                        }, [h('i', { class: 'fa-solid fa-rotate-right' })]),
                    ]),
                    this.selectionMode ? renderPresetBackupSelectionBar(h, this) : null,
                    h('div', { class: 'bai-bai-preset-backup-list', role: 'list' }, this.pagedItems.length
                        ? this.pagedItems.map(item => renderPresetBackupPreviewItem(h, this, item))
                        : [h('div', { class: 'bai-bai-preset-backup-empty' }, this.hasLoaded
                            ? '\u6682\u65e0\u5907\u4efd\u6570\u636e'
                            : [
                                h('span', '\u5237\u65b0\u83b7\u53d6\u5907\u4efd\u6570\u636e'),
                                h('span', '\u4fdd\u5b58\u9884\u8bbe\u65f6\u81ea\u52a8\u521b\u5efa\u5907\u4efd'),
                            ])]),
                    h('div', { class: 'bai-bai-preset-backup-footer' }, [
                        h('div', { class: 'bai-bai-preset-backup-status' }, this.displayStatus),
                        h('div', { class: 'bai-bai-preset-backup-pagination', 'aria-label': '\u5907\u4efd\u5206\u9875' }, [
                            h('button', {
                                class: 'menu_button menu_button_icon',
                                type: 'button',
                                title: '\u4e0a\u4e00\u9875',
                                disabled: this.safePage <= 1 || this.filteredItems.length <= 0,
                                onClick: this.prevPage,
                            }, [h('i', { class: 'fa-solid fa-chevron-left' })]),
                            h('span', { class: 'bai-bai-preset-backup-page-label' }, `${this.safePage} / ${this.pageCount}`),
                            h('button', {
                                class: 'menu_button menu_button_icon',
                                type: 'button',
                                title: '\u4e0b\u4e00\u9875',
                                disabled: this.safePage >= this.pageCount || this.filteredItems.length <= 0,
                                onClick: this.nextPage,
                            }, [h('i', { class: 'fa-solid fa-chevron-right' })]),
                        ]),
                    ]),
                    this.renameDialogOpen ? renderPresetBackupRenameDialog(h, this) : null,
                    this.noteDialogOpen ? renderPresetBackupNoteDialog(h, this) : null,
                    this.deleteDialogOpen ? renderPresetBackupDeleteDialog(h, this) : null,
                ]),
            ]);
        },
    };
}

function renderPresetBackupPreviewItem(h, view, item) {
    const selectionMode = view.selectionMode;
    const selected = selectionMode && view.selectedFileNames.includes(item.fileName);

    return h('div', {
        key: item.id,
        class: {
            'bai-bai-preset-backup-item': true,
            'bai-bai-preset-backup-item-selectable': selectionMode,
            'bai-bai-preset-backup-item-selected': selected,
        },
        role: 'listitem',
        onClick: selectionMode ? () => view.toggleSelect(item) : undefined,
    }, [
        selectionMode
            ? h('span', {
                class: {
                    'bai-bai-preset-backup-item-check': true,
                    'bai-bai-preset-backup-item-check-on': selected,
                },
            }, [h('i', { class: selected ? 'fa-solid fa-square-check' : 'fa-regular fa-square' })])
            : null,
        h('div', { class: 'bai-bai-preset-backup-item-main' }, [
            h('div', { class: 'bai-bai-preset-backup-item-row bai-bai-preset-backup-item-row-top' }, [
                h('strong', {
                    class: 'bai-bai-preset-backup-item-name',
                    title: item.name,
                }, item.name),
                selectionMode ? null : h('div', { class: 'bai-bai-preset-backup-item-actions' }, [
                    renderPresetBackupPreviewActionButton(h, {
                        className: 'bai-bai-preset-backup-delete',
                        icon: 'fa-solid fa-trash',
                        title: '\u5220\u9664\u5907\u4efd',
                        onClick: () => view.openDeleteDialog(item),
                    }),
                    renderPresetBackupPreviewActionButton(h, {
                        icon: 'fa-solid fa-pen-to-square',
                        title: '\u91cd\u547d\u540d\u5907\u4efd',
                        onClick: () => view.openRenameDialog(item),
                    }),
                    renderPresetBackupPreviewActionButton(h, {
                        className: view.importingFileName === item.fileName ? 'bai-bai-preset-backup-importing' : '',
                        icon: view.importingFileName === item.fileName ? 'fa-solid fa-spinner' : 'fa-solid fa-download',
                        title: '\u5bfc\u5165\u5907\u4efd\u5e76\u5207\u6362',
                        disabled: Boolean(view.importingFileName),
                        onClick: () => view.importBackup(item),
                    }),
                ]),
            ]),
            h('div', { class: 'bai-bai-preset-backup-item-row bai-bai-preset-backup-item-meta' }, [
                h('small', { class: 'bai-bai-preset-backup-item-time' }, [
                    h('i', { class: 'fa-regular fa-clock' }),
                    h('span', item.createdAt),
                ]),
                renderPresetBackupPreviewNote(h, view, item),
            ]),
        ]),
    ]);
}

function renderPresetBackupSelectionBar(h, view) {
    return h('div', { class: 'bai-bai-preset-backup-selection-bar' }, [
        h('button', {
            class: 'bai-bai-preset-backup-select-all',
            type: 'button',
            disabled: view.batchDeleting || view.pagedItems.length <= 0,
            onClick: () => view.toggleSelectPage(),
        }, [
            h('i', { class: view.pageAllSelected ? 'fa-solid fa-square-check' : 'fa-regular fa-square' }),
            h('span', view.pageAllSelected ? '\u53d6\u6d88\u672c\u9875' : '\u5168\u9009\u672c\u9875'),
        ]),
        h('span', { class: 'bai-bai-preset-backup-selection-count' }, `\u5df2\u9009 ${view.selectedCount} \u9879`),
        h('div', { class: 'bai-bai-preset-backup-selection-actions' }, [
            h('button', {
                class: 'menu_button bai-bai-preset-backup-dialog-button',
                type: 'button',
                disabled: view.batchDeleting,
                onClick: () => view.exitSelectionMode(),
            }, '\u9000\u51fa'),
            h('button', {
                class: 'menu_button bai-bai-preset-backup-dialog-button bai-bai-preset-backup-dialog-danger',
                type: 'button',
                disabled: view.batchDeleting || view.selectedCount <= 0,
                onClick: () => view.openBatchDeleteDialog(),
            }, [
                h('i', { class: 'fa-solid fa-trash' }),
                h('span', view.batchDeleting ? '\u5220\u9664\u4e2d...' : `\u5220\u9664\u6240\u9009 (${view.selectedCount})`),
            ]),
        ]),
    ]);
}

function renderPresetBackupPreviewNote(h, view, item) {
    const hasNote = Boolean(item.note);
    const onClick = event => {
        if (view.selectionMode) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();
        view.openNoteDialog(item);
    };

    if (hasNote) {
        return h('button', {
            type: 'button',
            class: 'bai-bai-preset-backup-item-note',
            title: `${item.note}\n（点击编辑备注）`,
            onClick,
        }, [
            h('i', { class: 'fa-regular fa-pen-to-square' }),
            h('span', { class: 'bai-bai-preset-backup-item-note-text' }, item.note),
        ]);
    }

    return h('button', {
        type: 'button',
        class: 'bai-bai-preset-backup-item-note bai-bai-preset-backup-item-note-empty',
        title: '添加备注',
        onClick,
    }, [
        h('i', { class: 'fa-solid fa-plus' }),
        h('span', '备注'),
    ]);
}

function renderPresetBackupNoteDialog(h, view) {
    const targetName = view.noteTarget?.name || '这个备份';
    const length = view.noteValue.length;

    return h('div', {
        class: 'bai-bai-preset-backup-dialog-layer',
        onClick: event => {
            if (event.target === event.currentTarget) {
                view.closeNoteDialog();
            }
        },
    }, [
        h('div', {
            class: 'bai-bai-preset-backup-dialog',
            role: 'dialog',
            'aria-modal': 'true',
            'aria-label': '编辑备注',
            onClick: event => event.stopPropagation(),
        }, [
            h('div', { class: 'bai-bai-preset-backup-dialog-head' }, [
                h('strong', '编辑备注'),
                h('button', {
                    class: 'menu_button menu_button_icon',
                    type: 'button',
                    title: '关闭',
                    disabled: view.savingNote,
                    onClick: () => view.closeNoteDialog(),
                }, [h('i', { class: 'fa-solid fa-xmark' })]),
            ]),
            h('div', { class: 'bai-bai-preset-backup-dialog-message' }, [
                h('span', '为'),
                h('strong', { title: targetName }, targetName),
                h('span', '记录这次改动'),
            ]),
            h('textarea', {
                ref: 'noteInput',
                class: 'text_pole bai-bai-preset-backup-dialog-input bai-bai-preset-backup-note-textarea',
                rows: 4,
                maxlength: PRESET_BACKUP_PREVIEW_NOTE_MAX_LENGTH,
                placeholder: '例如：改了正则和开场白，删了两条无用条目…',
                autocomplete: 'off',
                value: view.noteValue,
                disabled: view.savingNote,
                onInput: view.onNoteInput,
                onCompositionstart: view.onNoteCompositionStart,
                onCompositionend: view.onNoteCompositionEnd,
            }),
            h('div', { class: 'bai-bai-preset-backup-note-counter' }, `${length} / ${PRESET_BACKUP_PREVIEW_NOTE_MAX_LENGTH}`),
            h('div', { class: 'bai-bai-preset-backup-dialog-actions' }, [
                h('button', {
                    class: 'menu_button bai-bai-preset-backup-dialog-button',
                    type: 'button',
                    disabled: view.savingNote,
                    onClick: () => view.closeNoteDialog(),
                }, '取消'),
                h('button', {
                    class: 'menu_button bai-bai-preset-backup-dialog-button',
                    type: 'button',
                    disabled: view.savingNote,
                    onClick: () => view.confirmNote(),
                }, view.savingNote ? '保存中...' : '保存'),
            ]),
        ]),
    ]);
}

function renderPresetBackupDeleteDialog(h, view) {
    const isBatch = !view.deleteTarget && view.selectionMode;
    const targetName = view.deleteTarget?.name || '\u8fd9\u4e2a\u5907\u4efd';
    const busy = isBatch ? view.batchDeleting : view.deleting;

    return h('div', {
        class: 'bai-bai-preset-backup-dialog-layer',
        onClick: event => {
            if (event.target === event.currentTarget) {
                view.closeDeleteDialog();
            }
        },
    }, [
        h('div', {
            class: 'bai-bai-preset-backup-dialog',
            role: 'dialog',
            'aria-modal': 'true',
            'aria-label': '\u5220\u9664\u5907\u4efd',
            onClick: event => event.stopPropagation(),
        }, [
            h('div', { class: 'bai-bai-preset-backup-dialog-head' }, [
                h('strong', isBatch ? '\u6279\u91cf\u5220\u9664\u5907\u4efd' : '\u5220\u9664\u5907\u4efd'),
                h('button', {
                    class: 'menu_button menu_button_icon',
                    type: 'button',
                    title: '\u5173\u95ed',
                    disabled: busy,
                    onClick: () => view.closeDeleteDialog(),
                }, [h('i', { class: 'fa-solid fa-xmark' })]),
            ]),
            isBatch
                ? h('div', { class: 'bai-bai-preset-backup-dialog-message' }, [
                    h('span', `\u786e\u5b9a\u8981\u5220\u9664\u9009\u4e2d\u7684 ${view.selectedCount} \u4e2a\u5907\u4efd\u5417\uff1f\u6b64\u64cd\u4f5c\u4e0d\u53ef\u6062\u590d\u3002`),
                ])
                : h('div', { class: 'bai-bai-preset-backup-dialog-message' }, [
                    h('span', '\u786e\u5b9a\u8981\u5220\u9664\u8fd9\u4e2a\u5907\u4efd\u5417\uff1f'),
                    h('strong', { title: targetName }, targetName),
                ]),
            h('div', { class: 'bai-bai-preset-backup-dialog-actions' }, [
                h('button', {
                    class: 'menu_button bai-bai-preset-backup-dialog-button',
                    type: 'button',
                    disabled: busy,
                    onClick: () => view.closeDeleteDialog(),
                }, '\u53d6\u6d88'),
                h('button', {
                    class: 'menu_button bai-bai-preset-backup-dialog-button bai-bai-preset-backup-dialog-danger',
                    type: 'button',
                    disabled: busy,
                    onClick: () => (isBatch ? view.confirmBatchDelete() : view.confirmDelete()),
                }, busy ? '\u5220\u9664\u4e2d...' : '\u5220\u9664'),
            ]),
        ]),
    ]);
}

function renderPresetBackupRenameDialog(h, view) {
    return h('div', {
        class: 'bai-bai-preset-backup-dialog-layer',
        onClick: event => {
            if (event.target === event.currentTarget) {
                view.closeRenameDialog();
            }
        },
    }, [
        h('div', {
            class: 'bai-bai-preset-backup-dialog',
            role: 'dialog',
            'aria-modal': 'true',
            'aria-label': '\u91cd\u547d\u540d\u5907\u4efd',
            onClick: event => event.stopPropagation(),
        }, [
            h('div', { class: 'bai-bai-preset-backup-dialog-head' }, [
                h('strong', '\u91cd\u547d\u540d\u5907\u4efd'),
                h('button', {
                    class: 'menu_button menu_button_icon',
                    type: 'button',
                    title: '\u5173\u95ed',
                    disabled: view.renaming,
                    onClick: () => view.closeRenameDialog(),
                }, [h('i', { class: 'fa-solid fa-xmark' })]),
            ]),
            h('input', {
                ref: 'renameInput',
                class: 'text_pole bai-bai-preset-backup-dialog-input',
                type: 'text',
                autocomplete: 'off',
                value: view.renameValue,
                disabled: view.renaming,
                onInput: view.onRenameInput,
                onCompositionstart: view.onRenameCompositionStart,
                onCompositionend: view.onRenameCompositionEnd,
                onKeydown: view.onRenameKeydown,
            }),
            h('div', { class: 'bai-bai-preset-backup-dialog-actions' }, [
                h('button', {
                    class: 'menu_button bai-bai-preset-backup-dialog-button',
                    type: 'button',
                    disabled: view.renaming,
                    onClick: () => view.closeRenameDialog(),
                }, '\u53d6\u6d88'),
                h('button', {
                    class: 'menu_button bai-bai-preset-backup-dialog-button',
                    type: 'button',
                    disabled: view.renaming || !view.renameValue.trim(),
                    onClick: () => view.confirmRename(),
                }, view.renaming ? '\u4fdd\u5b58\u4e2d...' : '\u4fdd\u5b58'),
            ]),
        ]),
    ]);
}

function renderPresetBackupPreviewActionButton(h, { className = '', icon, title, disabled = false, onClick }) {
    return h('button', {
        class: ['menu_button', 'menu_button_icon', className],
        type: 'button',
        title,
        disabled,
        onClick,
    }, [h('i', { class: icon })]);
}

async function fetchPresetBackupPreviewItems() {
    const response = await fetch(PRESET_BACKUP_PREVIEW_LIST_URL, {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({}),
    });

    if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
    }

    const payload = await response.json();
    const rawItems = Array.isArray(payload?.data?.items)
        ? payload.data.items
        : Array.isArray(payload?.items)
            ? payload.items
            : [];

    return rawItems
        .map(normalizePresetBackupPreviewItem)
        .filter(Boolean);
}

async function renamePresetBackupPreviewItem(fileName, showName) {
    const response = await fetch(PRESET_BACKUP_PREVIEW_RENAME_URL, {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({ fileName, showName }),
    });

    if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
    }

    const payload = await response.json();
    return payload?.data ?? payload;
}

async function updatePresetBackupPreviewNote(fileName, note) {
    const response = await fetch(PRESET_BACKUP_PREVIEW_NOTE_URL, {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({ fileName, note }),
    });

    if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
    }

    const payload = await response.json();
    return payload?.data ?? payload;
}

async function deletePresetBackupPreviewItem(fileName) {
    const response = await fetch(PRESET_BACKUP_PREVIEW_DELETE_URL, {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({ fileName }),
    });

    if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
    }

    return response.json().catch(() => ({}));
}

async function downloadPresetBackupPreviewItem(fileName) {
    const response = await fetch(PRESET_BACKUP_PREVIEW_DOWNLOAD_URL, {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({ fileName }),
    });

    if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
    }

    const payload = await response.json();
    return payload?.data ?? payload;
}

function normalizePresetBackupImportPayload(result, item) {
    const body = result?.body && typeof result.body === 'object' ? result.body : result;
    const apiId = typeof body?.apiId === 'string' && body.apiId.trim() ? body.apiId.trim() : 'openai';
    const preset = body?.preset && typeof body.preset === 'object' ? body.preset : body;
    const resultShowName = typeof result?.showName === 'string' && result.showName !== result?.fileName
        ? result.showName
        : '';
    const name = String(
        resultShowName
        || body?.name
        || item?.name
        || formatPresetBackupPreviewDisplayName(item?.fileName || ''),
    ).trim();

    if (!preset || typeof preset !== 'object' || Array.isArray(preset)) {
        throw new Error('Invalid preset backup data');
    }

    return {
        apiId,
        name: name || '\u5907\u4efd\u9884\u8bbe',
        preset: clonePresetBackupImportPreset(preset),
    };
}

function clonePresetBackupImportPreset(preset) {
    if (typeof structuredClone === 'function') {
        return structuredClone(preset);
    }

    return JSON.parse(JSON.stringify(preset));
}

function getUniquePresetBackupImportName(manager, name) {
    const baseName = String(name || '\u5907\u4efd\u9884\u8bbe').trim() || '\u5907\u4efd\u9884\u8bbe';
    const existingNames = typeof manager.getAllPresets === 'function'
        ? manager.getAllPresets().map(value => String(value))
        : [];
    const existing = new Set(existingNames);

    if (!existing.has(baseName)) {
        return baseName;
    }

    for (let index = 1; index <= 999; index += 1) {
        const nextName = `${baseName} ${index}`;

        if (!existing.has(nextName)) {
            return nextName;
        }
    }

    return `${baseName} ${Date.now()}`;
}

function normalizePresetBackupPreviewItem(item) {
    if (!item || typeof item !== 'object') {
        return null;
    }

    const fileName = String(item.fileName || item.name || '').trim();

    if (!fileName) {
        return null;
    }

    const rawName = String(item.showName || item.displayName || item.presetName || '').trim();
    const name = rawName && rawName !== fileName
        ? rawName
        : formatPresetBackupPreviewDisplayName(fileName);
    const createdAt = formatPresetBackupPreviewTime(item.createdAt ?? item.createdAtMs);
    const note = typeof item.note === 'string' ? item.note.trim() : '';

    return {
        id: fileName,
        name,
        fileName,
        note,
        createdAt,
        searchText: `${name} ${note} ${createdAt}`.toLowerCase(),
    };
}

function formatPresetBackupPreviewDisplayName(fileName) {
    const withoutExtension = String(fileName || '').replace(/\.json$/i, '');
    const timestampNameMatch = /^\d{8}_\d{6}__(.+)$/.exec(withoutExtension);

    if (timestampNameMatch?.[1]) {
        return timestampNameMatch[1];
    }

    return withoutExtension || String(fileName || '');
}

function formatPresetBackupPreviewTime(value) {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return new Date(value).toLocaleString();
    }

    if (typeof value === 'string' && value.trim()) {
        const date = new Date(value);

        if (Number.isFinite(date.getTime())) {
            return date.toLocaleString();
        }

        return value.trim();
    }

    return '\u65f6\u95f4\u672a\u77e5';
}

function togglePresetBackupPreviewDetails(details, model = null) {
    const summary = details?.querySelector?.('.bai-bai-preset-backup-summary');

    if (!(details instanceof HTMLDetailsElement) || !(summary instanceof HTMLElement)) {
        if (details instanceof HTMLDetailsElement) {
            details.open = !details.open;
        }
        return;
    }

    const shouldReduceMotion = typeof matchMedia === 'function'
        && matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (shouldReduceMotion || typeof details.animate !== 'function') {
        details.open = !details.open;
        return;
    }

    if (model?.animating) {
        return;
    }

    const isClosing = details.open;

    if (model) {
        model.animating = true;
        model.closing = isClosing;
    }

    details.style.overflow = 'hidden';

    const startHeight = details.offsetHeight;
    const endHeight = isClosing ? summary.offsetHeight : (() => {
        details.style.height = `${startHeight}px`;
        details.open = true;
        return details.scrollHeight;
    })();

    details.style.height = `${startHeight}px`;

    const animation = details.animate(
        { height: [`${startHeight}px`, `${endHeight}px`] },
        {
            duration: PRESET_BACKUP_PREVIEW_EXPAND_ANIMATION_MS,
            easing: 'ease',
        },
    );

    const cleanup = () => {
        details.style.height = '';
        details.style.overflow = '';

        if (model) {
            model.animating = false;
            model.closing = false;
        }
    };

    animation.onfinish = () => {
        if (startHeight > endHeight) {
            details.open = false;
        }

        cleanup();
    };

    animation.oncancel = cleanup;
}
function applyPresetBackupPreviewUiStyle() {
    let style = document.getElementById(PRESET_BACKUP_PREVIEW_UI_STYLE_ID);

    if (!style) {
        style = document.createElement('style');
        style.id = PRESET_BACKUP_PREVIEW_UI_STYLE_ID;
        document.head.append(style);
    }

    style.textContent = `
#${PRESET_BACKUP_PREVIEW_UI_ID} {
    box-sizing: border-box;
    margin: 0 0 8px;
}

#${PRESET_BACKUP_PREVIEW_UI_ID} *,
#${PRESET_BACKUP_PREVIEW_UI_ID} *::before,
#${PRESET_BACKUP_PREVIEW_UI_ID} *::after {
    box-sizing: border-box;
}

#${PRESET_BACKUP_PREVIEW_UI_ID} .bai-bai-preset-backup-details {
    border: 1px solid var(--SmartThemeBorderColor);
    border-radius: 8px;
    background: color-mix(in srgb, var(--SmartThemeBlurTintColor) 40%, transparent);
    overflow: hidden;
}

#${PRESET_BACKUP_PREVIEW_UI_ID} .bai-bai-preset-backup-summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    min-height: 38px;
    padding: 8px 10px;
    cursor: pointer;
    list-style: none;
    user-select: none;
}

#${PRESET_BACKUP_PREVIEW_UI_ID} .bai-bai-preset-backup-summary::-webkit-details-marker {
    display: none;
}

#${PRESET_BACKUP_PREVIEW_UI_ID} .bai-bai-preset-backup-title,
#${PRESET_BACKUP_PREVIEW_UI_ID} .bai-bai-preset-backup-summary-meta {
    display: inline-flex;
    align-items: center;
    min-width: 0;
    gap: 6px;
}

#${PRESET_BACKUP_PREVIEW_UI_ID} .bai-bai-preset-backup-title {
    font-weight: 700;
}

#${PRESET_BACKUP_PREVIEW_UI_ID} .bai-bai-preset-backup-title i {
    color: var(--SmartThemeQuoteColor);
}

#${PRESET_BACKUP_PREVIEW_UI_ID} .bai-bai-preset-backup-summary-meta {
    flex: 0 0 auto;
    opacity: 0.72;
}

#${PRESET_BACKUP_PREVIEW_UI_ID} .bai-bai-preset-backup-chevron {
    transition: transform 0.16s ease;
}

#${PRESET_BACKUP_PREVIEW_UI_ID} details[open]:not(.${PRESET_BACKUP_PREVIEW_CLOSING_CLASS}) .bai-bai-preset-backup-chevron {
    transform: rotate(90deg);
}

#${PRESET_BACKUP_PREVIEW_UI_ID} .bai-bai-preset-backup-body {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 0 10px 10px;
}

#${PRESET_BACKUP_PREVIEW_UI_ID} .bai-bai-preset-backup-toolbar {
    display: flex;
    align-items: center;
    gap: 6px;
}

#${PRESET_BACKUP_PREVIEW_UI_ID} .bai-bai-preset-backup-search {
    position: relative;
    display: flex;
    align-items: center;
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
}

#${PRESET_BACKUP_PREVIEW_UI_ID} .bai-bai-preset-backup-search i {
    position: absolute;
    left: 12px;
    z-index: 1;
    opacity: 0.62;
    pointer-events: none;
}

#${PRESET_BACKUP_PREVIEW_UI_ID} .bai-bai-preset-backup-search input.text_pole[type="search"] {
    width: 100%;
    min-width: 0;
    padding-left: 36px !important;
    background: transparent !important;
}

#${PRESET_BACKUP_PREVIEW_UI_ID} .bai-bai-preset-backup-refresh {
    flex: 0 0 auto;
}

#${PRESET_BACKUP_PREVIEW_UI_ID} .bai-bai-preset-backup-refreshing i {
    animation: bai-bai-preset-backup-spin 0.45s linear infinite;
}

#${PRESET_BACKUP_PREVIEW_UI_ID} .bai-bai-preset-backup-importing i {
    animation: bai-bai-preset-backup-spin 0.55s linear infinite;
}

#${PRESET_BACKUP_PREVIEW_UI_ID} .bai-bai-preset-backup-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding-right: 2px;
}

#${PRESET_BACKUP_PREVIEW_UI_ID} .bai-bai-preset-backup-item {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 46px;
    padding: 7px 8px;
    border: 1px solid var(--SmartThemeBorderColor);
    border-radius: 6px;
}

#${PRESET_BACKUP_PREVIEW_UI_ID} .bai-bai-preset-backup-item[hidden],
#${PRESET_BACKUP_PREVIEW_UI_ID} .bai-bai-preset-backup-empty[hidden] {
    display: none !important;
}

#${PRESET_BACKUP_PREVIEW_UI_ID} .bai-bai-preset-backup-item-main {
    display: flex;
    flex-direction: column;
    gap: 3px;
    flex: 1 1 auto;
    min-width: 0;
}

#${PRESET_BACKUP_PREVIEW_UI_ID} .bai-bai-preset-backup-item-row {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
}

#${PRESET_BACKUP_PREVIEW_UI_ID} .bai-bai-preset-backup-item-row-top {
    justify-content: space-between;
}

#${PRESET_BACKUP_PREVIEW_UI_ID} .bai-bai-preset-backup-item-name {
    display: block;
    flex: 1 1 auto;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    line-height: 1.25;
}

#${PRESET_BACKUP_PREVIEW_UI_ID} .bai-bai-preset-backup-item-meta {
    gap: 8px;
}

#${PRESET_BACKUP_PREVIEW_UI_ID} .bai-bai-preset-backup-item-time {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    flex: 0 0 auto;
    opacity: 0.72;
    line-height: 1.2;
}

#${PRESET_BACKUP_PREVIEW_UI_ID} .bai-bai-preset-backup-item-note {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    min-width: 0;
    flex: 1 1 auto;
    margin: 0;
    padding: 1px 6px;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 5px;
    color: inherit;
    font-size: 0.86em;
    line-height: 1.2;
    cursor: pointer;
    transition: background 0.12s ease, border-color 0.12s ease, opacity 0.12s ease;
}

#${PRESET_BACKUP_PREVIEW_UI_ID} .bai-bai-preset-backup-item-note:hover {
    background: var(--white20a, rgba(255, 255, 255, 0.08));
    border-color: var(--SmartThemeBorderColor);
}

#${PRESET_BACKUP_PREVIEW_UI_ID} .bai-bai-preset-backup-item-note i {
    flex: 0 0 auto;
    opacity: 0.75;
}

#${PRESET_BACKUP_PREVIEW_UI_ID} .bai-bai-preset-backup-item-note-text {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

#${PRESET_BACKUP_PREVIEW_UI_ID} .bai-bai-preset-backup-item-note-empty {
    opacity: 0.5;
}

#${PRESET_BACKUP_PREVIEW_UI_ID} .bai-bai-preset-backup-item-note-empty:hover {
    opacity: 0.85;
}

#${PRESET_BACKUP_PREVIEW_UI_ID} .bai-bai-preset-backup-note-textarea {
    width: 100%;
    resize: vertical;
    min-height: calc(var(--mainFontSize) * 4.5);
    line-height: 1.4;
}

#${PRESET_BACKUP_PREVIEW_UI_ID} .bai-bai-preset-backup-note-counter {
    margin-top: -2px;
    font-size: 0.8em;
    text-align: right;
    opacity: 0.6;
}

#${PRESET_BACKUP_PREVIEW_UI_ID} .bai-bai-preset-backup-batch-active {
    color: var(--SmartThemeQuoteColor, #6c9eff);
}

#${PRESET_BACKUP_PREVIEW_UI_ID} .bai-bai-preset-backup-selection-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    padding: 6px 8px;
    margin-bottom: 2px;
    border: 1px solid var(--SmartThemeBorderColor);
    border-radius: 6px;
    background: var(--black30a, rgba(0, 0, 0, 0.12));
}

#${PRESET_BACKUP_PREVIEW_UI_ID} .bai-bai-preset-backup-select-all {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 2px 8px;
    margin: 0;
    background: transparent;
    border: 1px solid var(--SmartThemeBorderColor);
    border-radius: 5px;
    color: inherit;
    cursor: pointer;
}

#${PRESET_BACKUP_PREVIEW_UI_ID} .bai-bai-preset-backup-select-all:disabled {
    opacity: 0.5;
    cursor: default;
}

#${PRESET_BACKUP_PREVIEW_UI_ID} .bai-bai-preset-backup-selection-count {
    flex: 1 1 auto;
    min-width: 0;
    font-size: 0.86em;
    opacity: 0.8;
}

#${PRESET_BACKUP_PREVIEW_UI_ID} .bai-bai-preset-backup-selection-actions {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    flex: 0 0 auto;
}

#${PRESET_BACKUP_PREVIEW_UI_ID} .bai-bai-preset-backup-selection-actions .menu_button {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    margin: 0;
}

#${PRESET_BACKUP_PREVIEW_UI_ID} .bai-bai-preset-backup-item-selectable {
    cursor: pointer;
}

#${PRESET_BACKUP_PREVIEW_UI_ID} .bai-bai-preset-backup-item-selected {
    border-color: var(--SmartThemeQuoteColor, #6c9eff);
    background: var(--white20a, rgba(255, 255, 255, 0.06));
}

#${PRESET_BACKUP_PREVIEW_UI_ID} .bai-bai-preset-backup-item-check {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    font-size: 1.1em;
    opacity: 0.7;
}

#${PRESET_BACKUP_PREVIEW_UI_ID} .bai-bai-preset-backup-item-check-on {
    color: var(--SmartThemeQuoteColor, #6c9eff);
    opacity: 1;
}

#${PRESET_BACKUP_PREVIEW_UI_ID} .bai-bai-preset-backup-item-actions {
    display: inline-flex;
    align-items: center;
    flex: 0 0 auto;
    gap: 4px;
}

#${PRESET_BACKUP_PREVIEW_UI_ID} .bai-bai-preset-backup-item-actions .menu_button,
#${PRESET_BACKUP_PREVIEW_UI_ID} .bai-bai-preset-backup-refresh,
#${PRESET_BACKUP_PREVIEW_UI_ID} .bai-bai-preset-backup-batch-toggle,
#${PRESET_BACKUP_PREVIEW_UI_ID} .bai-bai-preset-backup-pagination .menu_button,
#${PRESET_BACKUP_PREVIEW_UI_ID} .bai-bai-preset-backup-dialog-head .menu_button {
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    inline-size: calc(var(--mainFontSize) * 1.8) !important;
    block-size: calc(var(--mainFontSize) * 1.8) !important;
    min-inline-size: calc(var(--mainFontSize) * 1.8) !important;
    min-block-size: calc(var(--mainFontSize) * 1.8) !important;
    margin: 0 !important;
    padding: 0 !important;
    line-height: 1 !important;
}

#${PRESET_BACKUP_PREVIEW_UI_ID} .bai-bai-preset-backup-delete {
    color: #d86666;
}

#${PRESET_BACKUP_PREVIEW_UI_ID} .bai-bai-preset-backup-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    min-height: 64px;
    padding: 10px;
    border: 1px dashed var(--SmartThemeBorderColor);
    border-radius: 6px;
    text-align: center;
    opacity: 0.72;
}

#${PRESET_BACKUP_PREVIEW_UI_ID} .bai-bai-preset-backup-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    min-height: calc(var(--mainFontSize) * 1.8);
}

#${PRESET_BACKUP_PREVIEW_UI_ID} .bai-bai-preset-backup-status {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 0.86em;
    opacity: 0.72;
}

#${PRESET_BACKUP_PREVIEW_UI_ID} .bai-bai-preset-backup-pagination {
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    gap: 8px;
}

#${PRESET_BACKUP_PREVIEW_UI_ID} .bai-bai-preset-backup-page-label {
    min-width: 4.6em;
    text-align: center;
    font-size: 0.9em;
    opacity: 0.78;
}

#${PRESET_BACKUP_PREVIEW_UI_ID} .bai-bai-preset-backup-dialog-layer {
    position: absolute;
    inset: 0;
    z-index: 12;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100%;
    padding: 10px;
    background: color-mix(in srgb, var(--SmartThemeBlurTintColor) 46%, transparent);
    backdrop-filter: blur(2px);
    animation: bai-bai-preset-backup-layer-in 0.14s ease both;
}

#${PRESET_BACKUP_PREVIEW_UI_ID} .bai-bai-preset-backup-dialog {
    display: flex;
    flex-direction: column;
    gap: 10px;
    width: min(100%, 360px);
    padding: 12px;
    border: 1px solid var(--SmartThemeBorderColor);
    border-radius: 8px;
    background: var(--SmartThemeBlurTintColor);
    box-shadow: 0 12px 32px color-mix(in srgb, #000 28%, transparent);
    animation: bai-bai-preset-backup-dialog-in 0.18s ease both;
}

#${PRESET_BACKUP_PREVIEW_UI_ID} .bai-bai-preset-backup-dialog-head,
#${PRESET_BACKUP_PREVIEW_UI_ID} .bai-bai-preset-backup-dialog-actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
}

#${PRESET_BACKUP_PREVIEW_UI_ID} .bai-bai-preset-backup-dialog-input {
    width: 100%;
    min-width: 0;
}

#${PRESET_BACKUP_PREVIEW_UI_ID} .bai-bai-preset-backup-dialog-message {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
    line-height: 1.35;
}

#${PRESET_BACKUP_PREVIEW_UI_ID} .bai-bai-preset-backup-dialog-message strong {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

#${PRESET_BACKUP_PREVIEW_UI_ID} .bai-bai-preset-backup-dialog-actions {
    justify-content: flex-end;
}

#${PRESET_BACKUP_PREVIEW_UI_ID} .bai-bai-preset-backup-dialog-button {
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    flex: 0 0 auto !important;
    min-width: 4.8em !important;
    width: auto !important;
    max-width: none !important;
    min-height: calc(var(--mainFontSize) * 2) !important;
    padding: 0 12px !important;
    line-height: 1.2 !important;
    white-space: nowrap !important;
    writing-mode: horizontal-tb !important;
}

#${PRESET_BACKUP_PREVIEW_UI_ID} .bai-bai-preset-backup-dialog-danger {
    color: #d86666 !important;
}

@keyframes bai-bai-preset-backup-spin {
    from {
        transform: rotate(0deg);
    }

    to {
        transform: rotate(360deg);
    }
}

@keyframes bai-bai-preset-backup-layer-in {
    from {
        opacity: 0;
    }

    to {
        opacity: 1;
    }
}

@keyframes bai-bai-preset-backup-dialog-in {
    from {
        opacity: 0;
        transform: translateY(8px) scale(0.97);
    }

    to {
        opacity: 1;
        transform: translateY(0) scale(1);
    }
}

@media (max-width: 600px) {
    #${PRESET_BACKUP_PREVIEW_UI_ID} .bai-bai-preset-backup-dialog-layer {
        position: fixed;
        inset: 0;
        min-height: 100dvh;
        padding: 18px;
        background: color-mix(in srgb, var(--SmartThemeBlurTintColor) 60%, transparent);
    }

    #${PRESET_BACKUP_PREVIEW_UI_ID} .bai-bai-preset-backup-dialog {
        width: min(100%, 420px);
    }

    #${PRESET_BACKUP_PREVIEW_UI_ID} .bai-bai-preset-backup-footer {
        gap: 6px;
    }
}
`;
}

function applyPresetScrollOptimization() {
    const existingStyle = document.getElementById(PRESET_SCROLL_STYLE_ID);

    if (!settings.presetScrollOptimizationEnabled) {
        existingStyle?.remove();
        return;
    }

    if (existingStyle) {
        existingStyle.textContent = getPresetScrollOptimizationCss();
        return;
    }

    const style = document.createElement('style');
    style.id = PRESET_SCROLL_STYLE_ID;
    style.textContent = getPresetScrollOptimizationCss();
    document.head.append(style);
}

function getPresetScrollOptimizationCss() {
    return `
${PRESET_PROMPT_MANAGER_LIST_SELECTOR} > li.completion_prompt_manager_prompt {
    contain: paint style;
}
`;
}

function applyPresetInterfaceCollapse() {
    if (!settings.presetInterfaceCollapseEnabled) {
        removePresetInterfaceCollapseExternalToggleHandler();
        removePresetInterfaceCollapseObserver();
        unwrapPresetInterfaceCollapse();
        removePresetInterfaceCollapseStyle();
        return;
    }

    applyPresetInterfaceCollapseStyle();
    installPresetInterfaceCollapseExternalToggleHandler();
    syncPresetInterfaceCollapse({ resetRetries: true });
}

function syncPresetInterfaceCollapse({ resetRetries = false } = {}) {
    if (!settings.presetInterfaceCollapseEnabled) {
        return false;
    }

    if (resetRetries) {
        resetPresetInterfaceCollapseRetry({ clearLayoutRuntimeAbsent: true });
    }

    const layoutCollapse = getLayoutPresetCollapseState();

    if (layoutCollapse.active) {
        unwrapPresetInterfaceCollapse();
        disconnectPresetInterfaceCollapseObserver();

        if (!layoutCollapse.confirmed) {
            schedulePresetInterfaceCollapseRetry();
        }

        return true;
    }

    const wrapped = wrapPresetInterfaceCollapse();
    bindPresetInterfaceCollapseObserver();

    if (wrapped) {
        resetPresetInterfaceCollapseRetry();
    }

    if (!wrapped && !document.getElementById(PRESET_INTERFACE_COLLAPSE_WRAPPER_ID)) {
        schedulePresetInterfaceCollapseRetry();
    }

    return wrapped;
}

function getPresetInterfaceCollapseObserverState() {
    let state = extensionState[PRESET_INTERFACE_COLLAPSE_OBSERVER_KEY];

    if (!state) {
        state = {
            observer: null,
            target: null,
            observers: [],
            targets: [],
            timer: null,
            retryTimer: null,
            retryCount: 0,
        };
        extensionState[PRESET_INTERFACE_COLLAPSE_OBSERVER_KEY] = state;
    }

    return state;
}

function bindPresetInterfaceCollapseObserver() {
    if (typeof MutationObserver !== 'function') {
        return;
    }

    const targets = getPresetInterfaceCollapseObserverTargets();
    const state = getPresetInterfaceCollapseObserverState();

    if (!targets.length) {
        disconnectPresetInterfaceCollapseObserver(state);
        schedulePresetInterfaceCollapseRetry();
        return;
    }

    if (arePresetInterfaceCollapseObserverTargetsSame(state, targets)) {
        return;
    }

    disconnectPresetInterfaceCollapseObserver(state);

    state.targets = targets;
    state.observers = targets.map(({ element, subtree }) => {
        const observer = new MutationObserver((mutations) => {
            if (shouldSyncPresetInterfaceCollapseForMutations(mutations)) {
                queuePresetInterfaceCollapseSync();
            }
        });
        observer.observe(element, {
            childList: true,
            subtree,
        });
        return observer;
    });
}

function arePresetInterfaceCollapseObserverTargetsSame(state, targets) {
    return Array.isArray(state.targets)
        && Array.isArray(state.observers)
        && state.observers.length > 0
        && state.targets.length === targets.length
        && state.targets.every((target, index) => (
            target.element === targets[index].element
            && target.subtree === targets[index].subtree
        ));
}

function disconnectPresetInterfaceCollapseObserver(state = extensionState[PRESET_INTERFACE_COLLAPSE_OBSERVER_KEY]) {
    if (!state) {
        return;
    }

    if (state.timer) {
        clearTimeout(state.timer);
        state.timer = null;
    }

    state.observer?.disconnect?.();
    state.observer = null;
    state.target = null;

    if (Array.isArray(state.observers)) {
        for (const observer of state.observers) {
            observer?.disconnect?.();
        }
    }

    state.observers = [];
    state.targets = [];
}

function shouldSyncPresetInterfaceCollapseForMutations(mutations) {
    for (const mutation of mutations) {
        if (isPresetInterfaceCollapseRelevantMutationTarget(mutation.target)) {
            return true;
        }

        for (const node of mutation.addedNodes) {
            if (isPresetInterfaceCollapseRelevantMutationNode(node)) {
                return true;
            }
        }

        for (const node of mutation.removedNodes) {
            if (isPresetInterfaceCollapseRelevantMutationNode(node)) {
                return true;
            }
        }
    }

    return false;
}

function isPresetInterfaceCollapseRelevantMutationTarget(node) {
    if (!(node instanceof Element)) {
        return false;
    }

    return node.matches(PRESET_INTERFACE_COLLAPSE_MUTATION_SELECTOR)
        || Boolean(node.closest(PRESET_INTERFACE_COLLAPSE_MUTATION_SELECTOR));
}

function isPresetInterfaceCollapseRelevantMutationNode(node) {
    if (!(node instanceof Element)) {
        return false;
    }

    return node.matches(PRESET_INTERFACE_COLLAPSE_MUTATION_SELECTOR)
        || Boolean(node.querySelector(PRESET_INTERFACE_COLLAPSE_MUTATION_SELECTOR));
}

function getPresetInterfaceCollapseObserverTargets() {
    const wrapper = document.getElementById(PRESET_INTERFACE_COLLAPSE_WRAPPER_ID);
    const layoutWrapper = document.getElementById(LAYOUT_PRESET_COLLAPSE_WRAPPER_ID);
    const rangeBlock = document.querySelector('#range_block_openai');
    const openAiSettings = document.querySelector(OPENAI_SETTINGS_SELECTOR);
    const layoutToggle = document.querySelector('#te_collapse_preset');
    const leftPanel = document.querySelector(LEFT_NAV_PANEL_SELECTOR);
    const candidates = [rangeBlock, openAiSettings, wrapper, layoutWrapper, layoutToggle]
        .filter(element => element instanceof HTMLElement && element.isConnected);

    if (!candidates.length) {
        return leftPanel instanceof HTMLElement
            ? [{ element: leftPanel, subtree: true }]
            : [];
    }

    return buildPresetInterfaceCollapseObserverTargets(candidates);
}

function buildPresetInterfaceCollapseObserverTargets(candidates) {
    const targets = [];
    const addTarget = (element, subtree = false) => {
        if (!(element instanceof HTMLElement) || !element.isConnected) {
            return;
        }

        if (element === document.body || element === document.documentElement) {
            return;
        }

        const existing = targets.find(target => target.element === element);

        if (existing) {
            existing.subtree = existing.subtree || subtree;
            return;
        }

        targets.push({ element, subtree });
    };

    for (const element of candidates) {
        addTarget(element);
        addTarget(element.parentElement);

        if (element.id === PRESET_INTERFACE_COLLAPSE_WRAPPER_ID) {
            addTarget(element.querySelector(`.${PRESET_INTERFACE_COLLAPSE_CONTENT_CLASS}`));
        }
    }

    return targets;
}

function removePresetInterfaceCollapseObserver() {
    const state = extensionState[PRESET_INTERFACE_COLLAPSE_OBSERVER_KEY];

    if (!state) {
        return;
    }

    if (state.timer) {
        clearTimeout(state.timer);
    }

    if (state.retryTimer) {
        clearTimeout(state.retryTimer);
    }

    disconnectPresetInterfaceCollapseObserver(state);
    delete extensionState[PRESET_INTERFACE_COLLAPSE_OBSERVER_KEY];
}

function queuePresetInterfaceCollapseSync() {
    if (!settings.presetInterfaceCollapseEnabled) {
        return;
    }

    const state = getPresetInterfaceCollapseObserverState();

    if (state.timer) {
        clearTimeout(state.timer);
    }

    state.timer = setTimeout(() => {
        state.timer = null;
        syncPresetInterfaceCollapse();
    }, 80);
}

function schedulePresetInterfaceCollapseRetry() {
    if (!settings.presetInterfaceCollapseEnabled) {
        return;
    }

    const state = getPresetInterfaceCollapseObserverState();

    if (state.retryTimer || state.retryCount >= PRESET_INTERFACE_COLLAPSE_RETRY_LIMIT) {
        if (state.retryCount >= PRESET_INTERFACE_COLLAPSE_RETRY_LIMIT) {
            state.layoutRuntimeAbsent = true;
            if (isPresetInterfaceCollapseBroadFallbackObserver(state)) {
                disconnectPresetInterfaceCollapseObserver(state);
            }
        }

        return;
    }

    state.retryCount += 1;
    state.retryTimer = setTimeout(() => {
        state.retryTimer = null;
        syncPresetInterfaceCollapse();
    }, PRESET_INTERFACE_COLLAPSE_RETRY_MS);
}

function isPresetInterfaceCollapseBroadFallbackObserver(state) {
    return Array.isArray(state?.targets)
        && state.targets.some(target => (
            target?.subtree === true
            && target.element?.matches?.(LEFT_NAV_PANEL_SELECTOR) === true
        ));
}

function resetPresetInterfaceCollapseRetry({ clearLayoutRuntimeAbsent = false } = {}) {
    const state = extensionState[PRESET_INTERFACE_COLLAPSE_OBSERVER_KEY];

    if (!state) {
        return;
    }

    if (state.retryTimer) {
        clearTimeout(state.retryTimer);
        state.retryTimer = null;
    }

    state.retryCount = 0;

    if (clearLayoutRuntimeAbsent) {
        state.layoutRuntimeAbsent = false;
    }
}

function installPresetInterfaceCollapseExternalToggleHandler() {
    if (extensionState[PRESET_INTERFACE_COLLAPSE_EXTERNAL_TOGGLE_HANDLER_KEY]) {
        return;
    }

    const handler = event => {
        const target = event.target instanceof Element
            ? event.target.closest('#te_collapse_preset')
            : null;

        if (!(target instanceof HTMLInputElement)) {
            return;
        }

        if (target.checked) {
            unwrapPresetInterfaceCollapse();
        }

        setTimeout(() => syncPresetInterfaceCollapse({ resetRetries: true }), 0);
        setTimeout(() => syncPresetInterfaceCollapse(), 120);
    };

    document.addEventListener('input', handler, true);
    document.addEventListener('change', handler, true);
    extensionState[PRESET_INTERFACE_COLLAPSE_EXTERNAL_TOGGLE_HANDLER_KEY] = handler;
}

function removePresetInterfaceCollapseExternalToggleHandler() {
    const handler = extensionState[PRESET_INTERFACE_COLLAPSE_EXTERNAL_TOGGLE_HANDLER_KEY];

    if (!handler) {
        return;
    }

    document.removeEventListener('input', handler, true);
    document.removeEventListener('change', handler, true);
    delete extensionState[PRESET_INTERFACE_COLLAPSE_EXTERNAL_TOGGLE_HANDLER_KEY];
}

function getLayoutPresetCollapseState() {
    if (document.getElementById(LAYOUT_PRESET_COLLAPSE_WRAPPER_ID)) {
        return { active: true, confirmed: true };
    }

    const toggle = document.querySelector('#te_collapse_preset');

    if (toggle instanceof HTMLInputElement) {
        return { active: toggle.checked, confirmed: true };
    }

    if (extension_settings?.[LAYOUT_EXTENSION_SETTINGS_KEY]?.collapsePreset === true) {
        const state = extensionState[PRESET_INTERFACE_COLLAPSE_OBSERVER_KEY];
        if (state?.layoutRuntimeAbsent) {
            return { active: false, confirmed: false };
        }

        const stillWaitingForLayoutRuntime = !state || state.retryCount < PRESET_INTERFACE_COLLAPSE_RETRY_LIMIT;

        if (!stillWaitingForLayoutRuntime && state) {
            state.layoutRuntimeAbsent = true;
        }

        return { active: stillWaitingForLayoutRuntime, confirmed: false };
    }

    return { active: false, confirmed: false };
}

function wrapPresetInterfaceCollapse() {
    if (document.getElementById(PRESET_INTERFACE_COLLAPSE_WRAPPER_ID)) {
        return true;
    }

    if (document.getElementById(LAYOUT_PRESET_COLLAPSE_WRAPPER_ID)) {
        return false;
    }

    const blocks = getPresetInterfaceCollapseBlocks();

    if (!blocks.length) {
        return false;
    }

    removePresetInterfaceCollapsePlaceholders();

    const wrapper = document.createElement('div');
    wrapper.id = PRESET_INTERFACE_COLLAPSE_WRAPPER_ID;
    wrapper.className = 'inline-drawer wide100p flexFlowColumn';
    wrapper.innerHTML = `
        <div class="inline-drawer-toggle inline-drawer-header userSettingsInnerExpandable">
            <b><span>预设设置</span></b>
            <div class="fa-solid fa-circle-chevron-down inline-drawer-icon down"></div>
        </div>
        <div class="inline-drawer-content ${PRESET_INTERFACE_COLLAPSE_CONTENT_CLASS}" style="display:none;"></div>
    `;

    const firstBlock = blocks[0]?.element;

    if (!(firstBlock instanceof HTMLElement) || !firstBlock.parentElement) {
        return false;
    }

    const placeholderKeys = new Set();

    for (const block of blocks) {
        if (!placeholderKeys.has(block.key)) {
            const placeholder = document.createElement('div');
            placeholder.id = getPresetInterfaceCollapsePlaceholderId(block.key);
            placeholder.hidden = true;
            placeholder.dataset.baiBaiPresetInterfaceCollapsePlaceholder = 'true';
            block.element.before(placeholder);
            placeholderKeys.add(block.key);
        }

        block.element.setAttribute(PRESET_INTERFACE_COLLAPSE_BLOCK_ATTR, block.key);
    }

    const firstPlaceholder = document.getElementById(getPresetInterfaceCollapsePlaceholderId(blocks[0].key));
    const content = wrapper.querySelector(`.${PRESET_INTERFACE_COLLAPSE_CONTENT_CLASS}`);

    if (!(firstPlaceholder instanceof HTMLElement) || !(content instanceof HTMLElement)) {
        removePresetInterfaceCollapsePlaceholders();
        return false;
    }

    firstPlaceholder.before(wrapper);

    for (const block of blocks) {
        content.append(block.element);
    }

    return true;
}

function unwrapPresetInterfaceCollapse() {
    const wrapper = document.getElementById(PRESET_INTERFACE_COLLAPSE_WRAPPER_ID);

    if (!(wrapper instanceof HTMLElement)) {
        removePresetInterfaceCollapsePlaceholders();
        return;
    }

    const content = wrapper.querySelector(`.${PRESET_INTERFACE_COLLAPSE_CONTENT_CLASS}`);

    for (const key of ['1', '2', '3']) {
        const placeholder = document.getElementById(getPresetInterfaceCollapsePlaceholderId(key));
        const movedBlocks = content instanceof HTMLElement
            ? Array.from(content.children).filter(child => child.getAttribute?.(PRESET_INTERFACE_COLLAPSE_BLOCK_ATTR) === key)
            : [];

        for (const block of movedBlocks) {
            block.removeAttribute(PRESET_INTERFACE_COLLAPSE_BLOCK_ATTR);
        }

        if (placeholder instanceof HTMLElement) {
            placeholder.replaceWith(...movedBlocks);
        } else if (movedBlocks.length) {
            wrapper.before(...movedBlocks);
        }
    }

    wrapper.remove();
    removePresetInterfaceCollapsePlaceholders();
}

function getPresetInterfaceCollapseBlocks() {
    const openAiSettings = document.querySelector(OPENAI_SETTINGS_SELECTOR);

    if (!(openAiSettings instanceof HTMLElement)) {
        return [];
    }

    const entries = [];
    const rangeBlock = document.querySelector('#range_block_openai');

    if (rangeBlock instanceof HTMLElement && !rangeBlock.closest(`#${PRESET_INTERFACE_COLLAPSE_WRAPPER_ID}`)) {
        entries.push({ key: '1', element: rangeBlock });
    }

    const firstOpenAiSettingsBlock = openAiSettings.querySelector(':scope > div');

    if (firstOpenAiSettingsBlock instanceof HTMLElement && !firstOpenAiSettingsBlock.closest(`#${PRESET_INTERFACE_COLLAPSE_WRAPPER_ID}`)) {
        entries.push({ key: '2', element: firstOpenAiSettingsBlock });
    }

    for (const block of openAiSettings.querySelectorAll(':scope > div.range-block.m-t-1')) {
        if (block instanceof HTMLElement && !block.closest(`#${PRESET_INTERFACE_COLLAPSE_WRAPPER_ID}`)) {
            entries.push({ key: '3', element: block });
        }
    }

    return filterTopLevelPresetInterfaceCollapseBlocks(entries);
}

function filterTopLevelPresetInterfaceCollapseBlocks(entries) {
    const result = [];

    for (const entry of entries) {
        const element = entry.element;

        if (!(element instanceof HTMLElement) || !element.isConnected) {
            continue;
        }

        if (result.some(item => item.element === element)) {
            continue;
        }

        if (result.some(item => item.element.contains(element))) {
            continue;
        }

        for (let index = result.length - 1; index >= 0; index -= 1) {
            if (element.contains(result[index].element)) {
                result.splice(index, 1);
            }
        }

        result.push(entry);
    }

    return result;
}

function getPresetInterfaceCollapsePlaceholderId(key) {
    return `${PRESET_INTERFACE_COLLAPSE_PLACEHOLDER_PREFIX}_${key}`;
}

function removePresetInterfaceCollapsePlaceholders() {
    for (const key of ['1', '2', '3']) {
        document.getElementById(getPresetInterfaceCollapsePlaceholderId(key))?.remove();
    }
}

function applyPresetInterfaceCollapseStyle() {
    let style = document.getElementById(PRESET_INTERFACE_COLLAPSE_STYLE_ID);

    if (!style) {
        style = document.createElement('style');
        style.id = PRESET_INTERFACE_COLLAPSE_STYLE_ID;
        document.head.append(style);
    }

    style.textContent = `
#${PRESET_INTERFACE_COLLAPSE_WRAPPER_ID} {
    margin-bottom: 8px;
}

#${PRESET_INTERFACE_COLLAPSE_WRAPPER_ID} > .${PRESET_INTERFACE_COLLAPSE_CONTENT_CLASS} {
    padding-top: 6px;
}
`;
}

function removePresetInterfaceCollapseStyle() {
    document.getElementById(PRESET_INTERFACE_COLLAPSE_STYLE_ID)?.remove();
}

function applyPresetDragOptimization() {
    if (!settings.presetDragOptimizationEnabled) {
        cancelPromptManagerCustomDragPending();
        finishPromptManagerCustomDrag({ cancelled: true });
        removePresetDragOptimizationHandlers();

        if (isPresetGroupingEnabled()) {
            applyPresetDragOptimizationCss();
        } else {
            clearPromptManagerCustomDragList();
            applyPresetDragOptimizationCss();
            restorePromptManagerStockDraggable();
        }
        return;
    }

    cancelPromptManagerCustomDragPending();
    finishPromptManagerCustomDrag({ cancelled: true });

    patchPromptManagerDraggable();
    applyPresetDragOptimizationCss();

    if (isPresetGroupingEnabled()) {
        removePresetDragOptimizationHandlers();
        return;
    }

    installPresetDragOptimizationHandlers();
    preparePromptManagerCustomDragList();
}

function applyPresetGrouping() {
    installPresetExportPendingChangesGuard();
    installPresetUpdatePendingChangesGuard();
    applyPresetGroupRenameCleanup();

    if (!isPresetGroupingEnabled()) {
        flushPendingPresetPromptChangesSafely();
        removePresetPromptGroupGenerationGatePatch();
        removePresetVuePromptListManager();
        applyPresetDragOptimizationCss();

        if (settings.presetDragOptimizationEnabled) {
            applyPresetDragOptimization();
        } else {
            restorePromptManagerStockDraggable();
        }
        return;
    }

    removePresetDragOptimizationHandlers();
    installPresetPromptGroupGenerationGatePatch();
    patchPromptManagerDraggable();
    applyPresetDragOptimizationCss();
    void installPresetVuePromptListManager();
}

function installPresetExportPendingChangesGuard() {
    if (extensionState[PRESET_EXPORT_PENDING_CHANGES_HANDLER_KEY]) {
        return;
    }

    const handler = event => {
        const target = event.target instanceof Element
            ? event.target.closest(OPENAI_PRESET_EXPORT_SELECTOR)
            : null;

        if (!(target instanceof HTMLElement)) {
            return;
        }

        if (extensionState.presetExportPendingChangesBypass) {
            extensionState.presetExportPendingChangesBypass = false;
            return;
        }

        if (!hasPendingPresetPromptChanges()) {
            return;
        }

        event.preventDefault();
        event.stopImmediatePropagation();

        void confirmSavePendingPresetChangesBeforeExport(target);
    };

    extensionState[PRESET_EXPORT_PENDING_CHANGES_HANDLER_KEY] = handler;
    document.addEventListener('click', handler, true);
}

function installPresetUpdatePendingChangesGuard() {
    if (extensionState[PRESET_UPDATE_PENDING_CHANGES_HANDLER_KEY]) {
        return;
    }

    const handler = event => {
        const target = event.target instanceof Element
            ? event.target.closest(OPENAI_PRESET_UPDATE_SELECTOR)
            : null;

        if (!(target instanceof HTMLElement)) {
            return;
        }

        // 重命名收尾:ST 的 jQuery update 处理器已经发出最终保存。拦掉随后触发的原生
        // re-click,等待该保存和内存缓存更新完成后再释放重命名期间积压的插件保存。
        if (isOpenAiPresetRenameSaveGateActive() || isPresetRenameInProgress()) {
            event.preventDefault();
            event.stopImmediatePropagation();
            flushPresetRenameBackup();

            if (isOpenAiPresetRenameSaveGateActive()) {
                void finishOpenAiPresetRenameSaveGateAfterFinalSave();
            } else {
                clearPendingPresetPromptChangesForPreset(oai_settings?.preset_settings_openai);
            }

            return;
        }

        if (!hasPendingPresetPromptChanges()) {
            void saveSettingsAfterOpenAiPresetUpdate(oai_settings?.preset_settings_openai);
            return;
        }

        event.preventDefault();
        event.stopImmediatePropagation();

        void saveOpenAiPresetAfterPendingRuntimeCommit();
    };

    extensionState[PRESET_UPDATE_PENDING_CHANGES_HANDLER_KEY] = handler;
    document.addEventListener('click', handler, true);
}

async function saveOpenAiPresetAfterPendingRuntimeCommit() {
    const currentPresetName = oai_settings?.preset_settings_openai;
    if (!currentPresetName) {
        return;
    }

    const saveState = getOpenAiPresetSaveRequestState(currentPresetName);
    const requestedRevision = getPresetPromptSaveRevision(currentPresetName);
    syncOpenAiPromptManagerStateToSettings();
    saveState.requestedRevision = Math.max(saveState.requestedRevision ?? -1, requestedRevision);
    saveState.requestedSnapshot = getChatCompletionPresetFromSettings(oai_settings);

    if (saveState.promise) {
        await saveState.promise.catch(() => {});
        return;
    }

    const savePromise = runOpenAiPresetSaveRequestQueue(saveState);
    saveState.promise = savePromise;

    try {
        await savePromise;
    } catch (error) {
        if (hasAutoFlushPendingPresetPromptChanges()) {
            schedulePendingPresetPromptChangesFlushCheck();
        }
        console.debug(`${LOG_PREFIX} Failed to save pending preset prompt changes`, error);
        toastr.error(t`Failed to save preset prompt changes. See console for details.`);
    } finally {
        if (saveState.promise === savePromise) {
            saveState.promise = null;
        }

        if (!saveState.promise && saveState.requestedRevision === null && saveState.requestedSnapshot === null) {
            const states = getOpenAiPresetSaveRequestStates();

            for (const [presetName, state] of states.entries()) {
                if (state === saveState) {
                    states.delete(presetName);
                }
            }
        }
    }
}

async function runOpenAiPresetSaveRequestQueue(saveState) {
    let saved = false;

    while (saveState.requestedRevision !== null) {
        const requestedRevision = saveState.requestedRevision;
        const requestedSnapshot = saveState.requestedSnapshot;
        saveState.requestedRevision = null;
        saveState.requestedSnapshot = null;

        let presetName = saveState.presetName;
        await commitPendingPresetPromptChangesToRuntime(presetName);
        presetName = saveState.presetName;

        let savedRevision = requestedRevision;
        let presetSnapshot = requestedSnapshot;

        if (oai_settings?.preset_settings_openai === presetName) {
            syncOpenAiPromptManagerStateToSettings();
            savedRevision = getPresetPromptSaveRevision(presetName);
            presetSnapshot = getChatCompletionPresetFromSettings(oai_settings);
        }

        if (!presetSnapshot) {
            throw new Error(`Unable to capture OpenAI preset snapshot for ${presetName}`);
        }

        await saveOpenAiPresetSnapshot(presetName, presetSnapshot, { revision: savedRevision });
        clearPendingPresetPromptChangesForSavedRevision(saveState.presetName, savedRevision);

        if (saveState.requestedRevision !== null && saveState.requestedRevision <= savedRevision) {
            saveState.requestedRevision = null;
            saveState.requestedSnapshot = null;
        }

        await saveSettings();
        saved = true;
    }

    if (saved) {
        toastr.success(t`Preset updated`);
    }
}

async function saveSettingsAfterOpenAiPresetUpdate(
    presetName = oai_settings?.preset_settings_openai,
    waitForSave = waitForOpenAiPresetUpdateRequest(presetName),
) {
    try {
        await waitForSave;
        syncCurrentOpenAiPresetCacheFromSettings(presetName);
        await saveSettings();
    } catch (error) {
        console.debug(`${LOG_PREFIX} Failed to save settings after preset save`, error);
    }
}

function syncOpenAiPromptManagerStateToSettings() {
    const serviceSettings = promptManager?.serviceSettings;

    if (!serviceSettings || serviceSettings === oai_settings) {
        return false;
    }

    let changed = false;

    if (Array.isArray(serviceSettings.prompts)) {
        oai_settings.prompts = serviceSettings.prompts;
        changed = true;
    }

    if (Array.isArray(serviceSettings.prompt_order)) {
        oai_settings.prompt_order = serviceSettings.prompt_order;
        changed = true;
    }

    if (serviceSettings.extensions && typeof serviceSettings.extensions === 'object') {
        oai_settings.extensions = serviceSettings.extensions;
        changed = true;
    }

    return changed;
}

function getChatCompletionPresetFromSettings(settings = oai_settings) {
    const presetBody = {};

    for (const [presetKey, [, settingsKey]] of Object.entries(settingsToUpdate ?? {})) {
        presetBody[presetKey] = settings?.[settingsKey];
    }

    return structuredClone(presetBody);
}

function saveOpenAiPresetSnapshot(presetName, presetSnapshot, { revision = null } = {}) {
    const renameGate = getOpenAiPresetRenameSaveGate();

    if (renameGate && (presetName === renameGate.oldName || presetName === renameGate.newName)) {
        const deferredSave = renameGate.deferredSaveTail
            .catch(() => {})
            .then(async () => {
                const resolvedPresetName = await renameGate.completionPromise;

                if (
                    Number.isFinite(revision)
                    && Number.isFinite(renameGate.finalSavedRevision)
                    && revision <= renameGate.finalSavedRevision
                ) {
                    return;
                }

                await performOpenAiPresetSnapshotSave(resolvedPresetName, presetSnapshot);
            });
        renameGate.deferredSaveTail = deferredSave;
        return deferredSave;
    }

    return performOpenAiPresetSnapshotSave(presetName, presetSnapshot);
}

async function performOpenAiPresetSnapshotSave(presetName, presetSnapshot) {
    const presetManager = getPresetManager('openai');

    if (presetManager && typeof presetManager.savePreset === 'function') {
        await presetManager.savePreset(presetName, presetSnapshot, { skipUpdate: true });
    } else {
        const response = await fetch('/api/presets/save', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({
                apiId: 'openai',
                name: presetName,
                preset: presetSnapshot,
            }),
        });

        if (!response.ok) {
            throw new Error('OpenAI preset update request failed');
        }
    }

    syncOpenAiPresetCacheFromSnapshot(presetName, presetSnapshot);
}

function syncOpenAiPresetCacheFromSnapshot(presetName, presetSnapshot) {
    if (!presetName || !presetSnapshot || !Array.isArray(openai_settings)) {
        return false;
    }

    const value = openai_setting_names?.[presetName];

    if (value === undefined || value === null) {
        return false;
    }

    const preset = structuredClone(presetSnapshot);

    if (openai_settings[value] && typeof openai_settings[value] === 'object') {
        Object.assign(openai_settings[value], preset);
    } else {
        openai_settings[value] = preset;
    }

    return true;
}

function syncCurrentOpenAiPresetCacheFromSettings(presetName = oai_settings?.preset_settings_openai) {
    syncOpenAiPromptManagerStateToSettings();
    const preset = getChatCompletionPresetFromSettings(oai_settings);
    return syncOpenAiPresetCacheFromSnapshot(presetName, preset);
}

async function confirmSavePendingPresetChangesBeforeExport(exportButton) {
    if (extensionState.presetExportPendingChangesPromptOpen) {
        return;
    }

    extensionState.presetExportPendingChangesPromptOpen = true;

    try {
        const confirmed = await callGenericPopup(t`当前预设有未保存的更改。要先保存后再导出吗？`, POPUP_TYPE.CONFIRM);

        if (!confirmed) {
            return;
        }

        await flushPendingPresetPromptChanges({ includeOpenAiPresetSaves: true });

        extensionState.presetExportPendingChangesBypass = true;
        exportButton.click();
    } catch (error) {
        console.debug(`${LOG_PREFIX} Failed to save pending preset changes before export`, error);
        toastr.error(t`Failed to save preset changes before export. See console for details.`);
    } finally {
        extensionState.presetExportPendingChangesPromptOpen = false;
    }
}

function isPresetGroupingEnabled() {
    return settings.presetGroupingEnabled !== false;
}

function installPresetDragOptimizationHandlers() {
    if (extensionState[PRESET_DRAG_HANDLER_KEY]) {
        return;
    }

    const handlers = {
        pointerdown: handlePresetPromptDragPointerDown,
        mousedown: handlePresetPromptDragMouseDown,
        touchstart: handlePresetPromptDragTouchStart,
        click: handlePresetPromptDragClick,
    };

    document.addEventListener('pointerdown', handlers.pointerdown, true);
    document.addEventListener('mousedown', handlers.mousedown, true);
    document.addEventListener('touchstart', handlers.touchstart, { capture: true, passive: false });
    document.addEventListener('click', handlers.click, true);
    extensionState[PRESET_DRAG_HANDLER_KEY] = handlers;
}

function removePresetDragOptimizationHandlers() {
    const handlers = extensionState[PRESET_DRAG_HANDLER_KEY];

    if (!handlers) {
        return;
    }

    document.removeEventListener('pointerdown', handlers.pointerdown, true);
    document.removeEventListener('mousedown', handlers.mousedown, true);
    document.removeEventListener('touchstart', handlers.touchstart, true);
    document.removeEventListener('click', handlers.click, true);
    delete extensionState[PRESET_DRAG_HANDLER_KEY];
}

function applyPresetDragOptimizationCss() {
    const existingStyle = document.getElementById(PRESET_DRAG_STYLE_ID);

    if (!settings.presetDragOptimizationEnabled && !isPresetGroupingEnabled()) {
        existingStyle?.remove();
        return;
    }

    const css = `
${PRESET_PROMPT_MANAGER_LIST_SELECTOR}.${PRESET_DRAG_READY_CLASS} li.completion_prompt_manager_prompt {
    user-select: none;
}

#completion_prompt_manager ${PRESET_PROMPT_MANAGER_LIST_SELECTOR}.${PRESET_DRAG_READY_CLASS} li.completion_prompt_manager_prompt .drag-handle {
    display: flex !important;
    touch-action: none !important;
    cursor: grab !important;
}

${PRESET_PROMPT_MANAGER_LIST_SELECTOR}.${PRESET_DRAG_ACTIVE_CLASS} li.completion_prompt_manager_prompt span span span,
.${PRESET_VUE_DRAGGING_BODY_CLASS} #completion_prompt_manager ${PRESET_PROMPT_MANAGER_LIST_SELECTOR} li.completion_prompt_manager_prompt span span span {
    transition: none;
    filter: none;
}

.${PRESET_VUE_LIST_HOST_CLASS} {
    display: contents;
}

#completion_prompt_manager ${PRESET_PROMPT_MANAGER_LIST_SELECTOR} .bai-bai-preset-list-head-actions,
#completion_prompt_manager ${PRESET_PROMPT_MANAGER_LIST_SELECTOR} .bai-bai-preset-group-actions {
    display: flex;
    justify-content: flex-end;
    align-items: center;
    gap: 4px;
}

#completion_prompt_manager ${PRESET_PROMPT_MANAGER_LIST_SELECTOR} .bai-bai-preset-list-head-actions .menu_button {
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    flex: 0 0 calc(var(--mainFontSize) * 1.65) !important;
    inline-size: calc(var(--mainFontSize) * 1.65) !important;
    block-size: calc(var(--mainFontSize) * 1.65) !important;
    min-inline-size: calc(var(--mainFontSize) * 1.65) !important;
    min-block-size: calc(var(--mainFontSize) * 1.65) !important;
    margin: 0 !important;
    padding: 0 !important;
    line-height: 1 !important;
}

#completion_prompt_manager ${PRESET_PROMPT_MANAGER_LIST_SELECTOR}.bai-bai-preset-drag-locked li.completion_prompt_manager_prompt .drag-handle,
#completion_prompt_manager ${PRESET_PROMPT_MANAGER_LIST_SELECTOR}.bai-bai-preset-drag-locked .bai-bai-preset-group-header {
    cursor: default !important;
}

#completion_prompt_manager ${PRESET_PROMPT_MANAGER_LIST_SELECTOR} .bai-bai-preset-favorites {
    display: flex;
    flex-direction: column;
    gap: 0;
    padding: 0;
    border: 1px solid var(--SmartThemeBorderColor);
    border-radius: 8px;
    background: color-mix(in srgb, var(--SmartThemeBlurTintColor) 45%, transparent);
    overflow: hidden;
}

#completion_prompt_manager ${PRESET_PROMPT_MANAGER_LIST_SELECTOR} .bai-bai-preset-favorites-collapsed {
    gap: 0;
}

#completion_prompt_manager ${PRESET_PROMPT_MANAGER_LIST_SELECTOR} .bai-bai-preset-favorites-header {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    align-items: center;
    padding: 10px 7px;
    border-bottom: 1px solid color-mix(in srgb, var(--SmartThemeBorderColor) 70%, transparent);
    background: color-mix(in srgb, var(--SmartThemeBlurTintColor) 75%, transparent);
    cursor: pointer;
    user-select: none;
    -webkit-user-select: none;
}

#completion_prompt_manager ${PRESET_PROMPT_MANAGER_LIST_SELECTOR} .bai-bai-preset-favorites-collapsed .bai-bai-preset-favorites-header {
    border-bottom-color: transparent;
}

#completion_prompt_manager ${PRESET_PROMPT_MANAGER_LIST_SELECTOR} .bai-bai-preset-favorites-title {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 5px;
    min-width: 0;
    overflow: hidden;
    white-space: normal;
}

#completion_prompt_manager ${PRESET_PROMPT_MANAGER_LIST_SELECTOR} .bai-bai-preset-favorites-title strong {
    overflow-wrap: anywhere;
}

#completion_prompt_manager ${PRESET_PROMPT_MANAGER_LIST_SELECTOR} .bai-bai-preset-favorites-count {
    opacity: 0.65;
    white-space: nowrap;
}

#completion_prompt_manager ${PRESET_PROMPT_MANAGER_LIST_SELECTOR} .bai-bai-preset-favorites-toggle {
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    flex: 0 0 calc(var(--mainFontSize) * 1.65) !important;
    inline-size: calc(var(--mainFontSize) * 1.65) !important;
    block-size: calc(var(--mainFontSize) * 1.65) !important;
    min-inline-size: calc(var(--mainFontSize) * 1.65) !important;
    min-block-size: calc(var(--mainFontSize) * 1.65) !important;
    box-sizing: border-box !important;
    border: 0 !important;
    box-shadow: none !important;
    background: transparent !important;
    margin: 0 !important;
    padding: 0 !important;
    font-size: calc(var(--mainFontSize) * 0.9) !important;
    line-height: 1 !important;
    transform: rotate(0deg);
    transform-origin: center;
    transition: transform ${PRESET_VUE_EXPAND_ANIMATION_MS}ms ease;
}

#completion_prompt_manager ${PRESET_PROMPT_MANAGER_LIST_SELECTOR} .bai-bai-preset-favorites-collapsed .bai-bai-preset-favorites-toggle {
    transform: rotate(-90deg);
    transition-duration: ${PRESET_VUE_COLLAPSE_ANIMATION_MS}ms;
}

#completion_prompt_manager ${PRESET_PROMPT_MANAGER_LIST_SELECTOR} .bai-bai-preset-favorites-body {
    display: grid;
    grid-template-rows: 1fr;
    min-height: 0;
    overflow: hidden;
    transition: grid-template-rows ${PRESET_VUE_BODY_HEIGHT_ANIMATION_MS}ms ${PRESET_VUE_BODY_HEIGHT_EASING};
}

#completion_prompt_manager ${PRESET_PROMPT_MANAGER_LIST_SELECTOR} .bai-bai-preset-favorites-collapsed .bai-bai-preset-favorites-body {
    grid-template-rows: 0fr;
    pointer-events: none;
}

#completion_prompt_manager ${PRESET_PROMPT_MANAGER_LIST_SELECTOR} .bai-bai-preset-favorites-body-inner {
    min-height: 0;
    overflow: hidden;
}

#completion_prompt_manager ${PRESET_PROMPT_MANAGER_LIST_SELECTOR} .bai-bai-preset-favorites-list {
    display: flex;
    flex-direction: column;
    gap: var(${PRESET_VUE_LIST_GAP_VARIABLE}, 6px);
    margin: 0;
    padding: var(${PRESET_VUE_LIST_GAP_VARIABLE}, 6px);
    list-style: none;
    min-height: 0;
    overflow: hidden;
}

#completion_prompt_manager ${PRESET_PROMPT_MANAGER_LIST_SELECTOR} .bai-bai-preset-favorite-prompt .bai-bai-preset-favorite-row-marker {
    cursor: default !important;
}

#completion_prompt_manager ${PRESET_PROMPT_MANAGER_LIST_SELECTOR}.${PRESET_DRAG_READY_CLASS} .bai-bai-preset-favorite-prompt .bai-bai-preset-favorite-row-marker {
    cursor: default !important;
}

#completion_prompt_manager ${PRESET_PROMPT_MANAGER_LIST_SELECTOR} .bai-bai-preset-global-library-prompt .bai-bai-preset-global-library-row-marker {
    cursor: default !important;
}

#completion_prompt_manager ${PRESET_PROMPT_MANAGER_LIST_SELECTOR}.${PRESET_DRAG_READY_CLASS} .bai-bai-preset-global-library-prompt .bai-bai-preset-global-library-row-marker {
    cursor: default !important;
}

#completion_prompt_manager ${PRESET_PROMPT_MANAGER_LIST_SELECTOR} .bai-bai-preset-prompt-favorite-toggle-active {
    color: #f5c542 !important;
    opacity: 1 !important;
}

#completion_prompt_manager ${PRESET_PROMPT_MANAGER_LIST_SELECTOR} .bai-bai-preset-prompt-favorite-toggle:not(.bai-bai-preset-prompt-favorite-toggle-active) {
    opacity: 0.48;
}

#completion_prompt_manager ${PRESET_PROMPT_MANAGER_LIST_SELECTOR} .bai-bai-preset-global-library,
#completion_prompt_manager ${PRESET_PROMPT_MANAGER_LIST_SELECTOR} .bai-bai-preset-group {
    display: flex;
    flex-direction: column;
    gap: 0;
    padding: 0;
    border: 1px solid var(--SmartThemeBorderColor);
    border-radius: 8px;
    background: color-mix(in srgb, var(--SmartThemeBlurTintColor) 45%, transparent);
    overflow: hidden;
}

#completion_prompt_manager ${PRESET_PROMPT_MANAGER_LIST_SELECTOR} .bai-bai-preset-global-library-collapsed,
#completion_prompt_manager ${PRESET_PROMPT_MANAGER_LIST_SELECTOR} .bai-bai-preset-group-collapsed {
    gap: 0;
}

#completion_prompt_manager ${PRESET_PROMPT_MANAGER_LIST_SELECTOR} .bai-bai-preset-group-powered-off {
    opacity: 0.72;
}

#completion_prompt_manager ${PRESET_PROMPT_MANAGER_LIST_SELECTOR} .bai-bai-preset-group-powered-off .bai-bai-preset-group-header {
    background: color-mix(in srgb, var(--SmartThemeBlurTintColor) 52%, transparent);
}

#completion_prompt_manager ${PRESET_PROMPT_MANAGER_LIST_SELECTOR} .bai-bai-preset-group-header {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    padding: 10px 7px;
    border: 0;
    border-bottom: 1px solid color-mix(in srgb, var(--SmartThemeBorderColor) 70%, transparent);
    background: color-mix(in srgb, var(--SmartThemeBlurTintColor) 75%, transparent);
    cursor: pointer;
    user-select: none;
    -webkit-user-select: none;
    touch-action: manipulation;
}

#completion_prompt_manager ${PRESET_PROMPT_MANAGER_LIST_SELECTOR} .bai-bai-preset-global-library-collapsed .bai-bai-preset-group-header,
#completion_prompt_manager ${PRESET_PROMPT_MANAGER_LIST_SELECTOR} .bai-bai-preset-group-collapsed .bai-bai-preset-group-header {
    border-bottom-color: transparent;
}

@media (pointer: coarse) {
    #completion_prompt_manager ${PRESET_PROMPT_MANAGER_LIST_SELECTOR} .bai-bai-preset-group-drag-surface {
        touch-action: pan-y !important;
    }
}

#completion_prompt_manager ${PRESET_PROMPT_MANAGER_LIST_SELECTOR} .bai-bai-preset-group-title {
    display: flex;
    align-items: center;
    gap: 4px;
    min-width: 0;
    overflow: hidden;
    white-space: normal;
    font-size: calc(var(--mainFontSize) * 1);
}

#completion_prompt_manager ${PRESET_PROMPT_MANAGER_LIST_SELECTOR} .bai-bai-preset-group-title-content {
    display: flex;
    align-items: flex-end;
    flex-wrap: wrap;
    gap: 6px;
    min-width: 0;
    overflow: hidden;
    white-space: normal;
}

#completion_prompt_manager ${PRESET_PROMPT_MANAGER_LIST_SELECTOR} .bai-bai-preset-group-actions {
    gap: 3px;
}

#completion_prompt_manager ${PRESET_PROMPT_MANAGER_LIST_SELECTOR} .bai-bai-preset-group-toggle,
#completion_prompt_manager ${PRESET_PROMPT_MANAGER_LIST_SELECTOR} .bai-bai-preset-group-action-button {
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    flex: 0 0 calc(var(--mainFontSize) * 1.65) !important;
    inline-size: calc(var(--mainFontSize) * 1.65) !important;
    block-size: calc(var(--mainFontSize) * 1.65) !important;
    min-inline-size: calc(var(--mainFontSize) * 1.65) !important;
    min-block-size: calc(var(--mainFontSize) * 1.65) !important;
    box-sizing: border-box !important;
    border: 0 !important;
    box-shadow: none !important;
    background: transparent !important;
    margin: 0 !important;
    padding: 0 !important;
    font-size: calc(var(--mainFontSize) * 0.9) !important;
    line-height: 1 !important;
}

#completion_prompt_manager ${PRESET_PROMPT_MANAGER_LIST_SELECTOR} .bai-bai-preset-group-toggle {
    transform: rotate(0deg);
    transform-origin: center;
    transition: transform ${PRESET_VUE_EXPAND_ANIMATION_MS}ms ease;
}

#completion_prompt_manager ${PRESET_PROMPT_MANAGER_LIST_SELECTOR} .bai-bai-preset-global-library-collapsed .bai-bai-preset-group-toggle,
#completion_prompt_manager ${PRESET_PROMPT_MANAGER_LIST_SELECTOR} .bai-bai-preset-group-collapsed .bai-bai-preset-group-toggle {
    transform: rotate(-90deg);
    transition-duration: ${PRESET_VUE_COLLAPSE_ANIMATION_MS}ms;
}

#completion_prompt_manager ${PRESET_PROMPT_MANAGER_LIST_SELECTOR} .bai-bai-preset-group-enable-toggle {
    font-size: calc(var(--mainFontSize) * 1.05) !important;
}

#completion_prompt_manager ${PRESET_PROMPT_MANAGER_LIST_SELECTOR} .bai-bai-preset-group-title-content strong {
    flex: 0 1 auto;
    min-width: 0;
    overflow: visible;
    overflow-wrap: anywhere;
    white-space: normal;
}

#completion_prompt_manager ${PRESET_PROMPT_MANAGER_LIST_SELECTOR} .bai-bai-preset-group-count {
    flex: 0 0 auto;
    opacity: 0.65;
    font-size: calc(var(--mainFontSize) * 0.82);
    white-space: nowrap;
}

#completion_prompt_manager ${PRESET_PROMPT_MANAGER_LIST_SELECTOR} li.completion_prompt_manager_list_head,
#completion_prompt_manager ${PRESET_PROMPT_MANAGER_LIST_SELECTOR} li.completion_prompt_manager_prompt {
    grid-template-columns: minmax(0, 1fr) max-content max-content !important;
    column-gap: 6px !important;
}

#completion_prompt_manager ${PRESET_PROMPT_MANAGER_LIST_SELECTOR} li.completion_prompt_manager_prompt .completion_prompt_manager_prompt_name {
    min-width: 0 !important;
    white-space: normal !important;
    overflow: visible !important;
    overflow-wrap: anywhere !important;
    word-break: break-word !important;
}

#completion_prompt_manager ${PRESET_PROMPT_MANAGER_LIST_SELECTOR} li.completion_prompt_manager_prompt.bai-bai-preset-prompt-actions-open .completion_prompt_manager_prompt_name {
    visibility: hidden !important;
    pointer-events: none !important;
}

#completion_prompt_manager ${PRESET_PROMPT_MANAGER_LIST_SELECTOR} li.completion_prompt_manager_prompt .prompt-manager-inspect-action {
    display: inline;
    min-width: 0;
    max-width: 100%;
    white-space: normal !important;
    overflow-wrap: anywhere !important;
    word-break: break-word !important;
}

#completion_prompt_manager ${PRESET_PROMPT_MANAGER_LIST_SELECTOR} .bai-bai-preset-prompt-name-visual-only {
    pointer-events: none !important;
    cursor: inherit !important;
}

#completion_prompt_manager ${PRESET_PROMPT_MANAGER_LIST_SELECTOR} li.completion_prompt_manager_list_head {
    grid-template-columns: minmax(0, 1fr) max-content !important;
    align-items: center !important;
}

#completion_prompt_manager ${PRESET_PROMPT_MANAGER_LIST_SELECTOR} li.completion_prompt_manager_list_head .bai-bai-preset-list-head-actions {
    justify-self: end !important;
    align-self: center !important;
}

#completion_prompt_manager ${PRESET_PROMPT_MANAGER_LIST_SELECTOR} li.completion_prompt_manager_list_head .prompt_manager_prompt_tokens,
#completion_prompt_manager ${PRESET_PROMPT_MANAGER_LIST_SELECTOR} li.completion_prompt_manager_prompt .prompt_manager_prompt_tokens {
    inline-size: max-content !important;
    min-inline-size: 2.2em !important;
    width: auto !important;
    justify-self: end !important;
}

#completion_prompt_manager ${PRESET_PROMPT_MANAGER_LIST_SELECTOR} li.completion_prompt_manager_prompt .prompt_manager_prompt_controls {
    display: inline-flex !important;
    align-items: center !important;
    justify-content: flex-end !important;
    flex-direction: row !important;
    gap: 4px !important;
    position: relative;
    flex-wrap: nowrap !important;
    white-space: nowrap !important;
    min-inline-size: max-content !important;
    filter: none !important;
}

#completion_prompt_manager ${PRESET_PROMPT_MANAGER_LIST_SELECTOR} .bai-bai-preset-prompt-icon-button,
#completion_prompt_manager ${PRESET_PROMPT_MANAGER_LIST_SELECTOR} .bai-bai-preset-prompt-action-button {
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    flex: 0 0 calc(var(--mainFontSize) * 1.65) !important;
    inline-size: calc(var(--mainFontSize) * 1.65) !important;
    block-size: calc(var(--mainFontSize) * 1.65) !important;
    min-inline-size: calc(var(--mainFontSize) * 1.65) !important;
    min-block-size: calc(var(--mainFontSize) * 1.65) !important;
    box-sizing: border-box !important;
    border: 0 !important;
    box-shadow: none !important;
    background: transparent !important;
    margin: 0 !important;
    padding: 0 !important;
    font-size: calc(var(--mainFontSize) * 1) !important;
    line-height: 1 !important;
    cursor: pointer !important;
    white-space: nowrap !important;
    filter: none !important;
}

#completion_prompt_manager ${PRESET_PROMPT_MANAGER_LIST_SELECTOR} .bai-bai-preset-prompt-actions-hint-hidden {
    display: none !important;
}

#completion_prompt_manager ${PRESET_PROMPT_MANAGER_LIST_SELECTOR} .bai-bai-preset-prompt-actions {
    display: none !important;
    position: absolute !important;
    inset-inline-end: calc(100% + 4px) !important;
    inset-block-start: 50% !important;
    transform: translateY(-50%) !important;
    z-index: 8 !important;
    align-items: center !important;
    justify-content: flex-end !important;
    flex-direction: row !important;
    flex-wrap: nowrap !important;
    gap: 4px !important;
    flex: 0 0 auto !important;
    inline-size: max-content !important;
    min-inline-size: 0 !important;
    max-inline-size: calc(100vw - 48px) !important;
    box-sizing: border-box !important;
    padding: 0 !important;
    border: 0 !important;
    border-radius: 0 !important;
    background: transparent !important;
    box-shadow: none !important;
    white-space: nowrap !important;
    opacity: 0;
    transition: opacity var(--animation-duration-2x, 160ms) ease-in-out;
    filter: none !important;
}

#completion_prompt_manager ${PRESET_PROMPT_MANAGER_LIST_SELECTOR} .bai-bai-preset-prompt-actions-visible {
    display: inline-flex !important;
    opacity: 1 !important;
}

#completion_prompt_manager ${PRESET_PROMPT_MANAGER_LIST_SELECTOR} .bai-bai-preset-prompt-action-button.caution {
    color: var(--SmartThemeEmColor) !important;
}

#completion_prompt_manager ${PRESET_PROMPT_MANAGER_LIST_SELECTOR} .bai-bai-preset-prompt-action-button[data-preset-prompt-action="delete"] {
    color: #ff4d4f !important;
}

#completion_prompt_manager ${PRESET_PROMPT_MANAGER_LIST_SELECTOR} .prompt-manager-remove-action,
#completion_prompt_manager ${PRESET_PROMPT_MANAGER_LIST_SELECTOR} .prompt-manager-copy-action {
    display: none !important;
}

#completion_prompt_manager ${PRESET_PROMPT_MANAGER_LIST_SELECTOR} .bai-bai-preset-group-body {
    display: grid;
    grid-template-rows: 1fr;
    min-height: 0;
    overflow: hidden;
    transition: grid-template-rows ${PRESET_VUE_BODY_HEIGHT_ANIMATION_MS}ms ${PRESET_VUE_BODY_HEIGHT_EASING};
}

#completion_prompt_manager ${PRESET_PROMPT_MANAGER_LIST_SELECTOR} .bai-bai-preset-global-library-collapsed .bai-bai-preset-group-body,
#completion_prompt_manager ${PRESET_PROMPT_MANAGER_LIST_SELECTOR} .bai-bai-preset-group-collapsed .bai-bai-preset-group-body {
    grid-template-rows: 0fr;
    pointer-events: none;
}

#completion_prompt_manager ${PRESET_PROMPT_MANAGER_LIST_SELECTOR} .bai-bai-preset-group-body-inner {
    min-height: 0;
    overflow: hidden;
}

#completion_prompt_manager ${PRESET_PROMPT_MANAGER_LIST_SELECTOR} .bai-bai-preset-group-list {
    display: flex;
    flex-direction: column;
    gap: var(${PRESET_VUE_LIST_GAP_VARIABLE}, 6px);
    margin: 0;
    padding: var(${PRESET_VUE_LIST_GAP_VARIABLE}, 6px);
    list-style: none;
    min-height: 0;
    overflow: hidden;
}

#completion_prompt_manager ${PRESET_PROMPT_MANAGER_LIST_SELECTOR} .bai-bai-preset-group-list-empty {
    min-height: 12px;
    border: 1px dashed color-mix(in srgb, var(--SmartThemeBorderColor) 70%, transparent);
}

#completion_prompt_manager ${PRESET_PROMPT_MANAGER_LIST_SELECTOR} .bai-bai-preset-global-library-empty {
    padding: 8px 10px;
    color: var(--SmartThemeBodyColor);
    opacity: 0.65;
    font-size: calc(var(--mainFontSize) * 0.92);
    overflow-wrap: anywhere;
}

#completion_prompt_manager .bai-bai-preset-global-library-outside {
    display: flex;
    flex-direction: column;
    gap: 0;
    width: 100%;
    inline-size: 100%;
    max-width: 100%;
    box-sizing: border-box;
    margin: var(${PRESET_VUE_LIST_GAP_VARIABLE}, 6px) 0 var(${PRESET_VUE_LIST_GAP_VARIABLE}, 6px);
    padding: 0;
    border: 1px solid var(--SmartThemeBorderColor);
    border-radius: 8px;
    background: color-mix(in srgb, var(--SmartThemeBlurTintColor) 45%, transparent);
    overflow: hidden;
}

#completion_prompt_manager .bai-bai-preset-global-library-outside.bai-bai-preset-global-library-collapsed {
    gap: 0;
}

#completion_prompt_manager .bai-bai-preset-global-library-outside .bai-bai-preset-group-header {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    padding: 10px 7px;
    border: 0;
    border-bottom: 1px solid color-mix(in srgb, var(--SmartThemeBorderColor) 70%, transparent);
    background: color-mix(in srgb, var(--SmartThemeBlurTintColor) 75%, transparent);
    cursor: pointer;
    user-select: none;
    -webkit-user-select: none;
    touch-action: manipulation;
}

#completion_prompt_manager .bai-bai-preset-global-library-outside.bai-bai-preset-global-library-collapsed .bai-bai-preset-group-header {
    border-bottom-color: transparent;
}

#completion_prompt_manager .bai-bai-preset-global-library-outside .bai-bai-preset-group-title,
#completion_prompt_manager .bai-bai-preset-global-library-outside .bai-bai-preset-group-title-content {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    overflow: hidden;
    white-space: normal;
}

#completion_prompt_manager .bai-bai-preset-global-library-outside .bai-bai-preset-group-title-content {
    flex-wrap: wrap;
}

#completion_prompt_manager .bai-bai-preset-global-library-outside .bai-bai-preset-group-toggle,
#completion_prompt_manager .bai-bai-preset-global-library-outside .bai-bai-preset-prompt-action-button {
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    flex: 0 0 calc(var(--mainFontSize) * 1.65) !important;
    inline-size: calc(var(--mainFontSize) * 1.65) !important;
    block-size: calc(var(--mainFontSize) * 1.65) !important;
    min-inline-size: calc(var(--mainFontSize) * 1.65) !important;
    min-block-size: calc(var(--mainFontSize) * 1.65) !important;
    box-sizing: border-box !important;
    border: 0 !important;
    box-shadow: none !important;
    background: transparent !important;
    margin: 0 !important;
    padding: 0 !important;
    line-height: 1 !important;
}

#completion_prompt_manager .bai-bai-preset-global-library-outside .bai-bai-preset-group-toggle {
    transform: rotate(0deg);
    transform-origin: center;
    transition: transform ${PRESET_VUE_EXPAND_ANIMATION_MS}ms ease;
}

#completion_prompt_manager .bai-bai-preset-global-library-outside.bai-bai-preset-global-library-collapsed .bai-bai-preset-group-toggle {
    transform: rotate(-90deg);
    transition-duration: ${PRESET_VUE_COLLAPSE_ANIMATION_MS}ms;
}

#completion_prompt_manager .bai-bai-preset-global-library-outside .bai-bai-preset-group-body {
    display: grid;
    grid-template-rows: 1fr;
    min-height: 0;
    overflow: hidden;
    transition: grid-template-rows ${PRESET_VUE_BODY_HEIGHT_ANIMATION_MS}ms ${PRESET_VUE_BODY_HEIGHT_EASING};
}

#completion_prompt_manager .bai-bai-preset-global-library-outside.bai-bai-preset-global-library-collapsed .bai-bai-preset-group-body {
    grid-template-rows: 0fr;
    pointer-events: none;
}

#completion_prompt_manager .bai-bai-preset-global-library-outside .bai-bai-preset-group-body-inner {
    min-height: 0;
    overflow: hidden;
}

#completion_prompt_manager .bai-bai-preset-global-library-outside .bai-bai-preset-global-library-list {
    display: flex;
    flex-direction: column;
    gap: var(${PRESET_VUE_LIST_GAP_VARIABLE}, 6px);
    margin: 0;
    padding: var(${PRESET_VUE_LIST_GAP_VARIABLE}, 6px);
    list-style: none;
    min-height: 0;
    overflow: hidden;
}

#completion_prompt_manager .bai-bai-preset-global-library-outside li.completion_prompt_manager_prompt {
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) max-content max-content !important;
    align-items: center !important;
    column-gap: 6px !important;
    width: 100%;
    box-sizing: border-box;
    padding: 0.5em 0.5em 0.5em 20px;
    border: 1px solid var(--SmartThemeBorderColor);
    position: relative;
}

#completion_prompt_manager .bai-bai-preset-global-library-outside li.completion_prompt_manager_prompt .completion_prompt_manager_prompt_name {
    min-width: 0 !important;
    white-space: normal !important;
    overflow: visible !important;
    overflow-wrap: anywhere !important;
    word-break: break-word !important;
}

#completion_prompt_manager .bai-bai-preset-global-library-outside li.completion_prompt_manager_prompt .prompt_manager_prompt_controls {
    display: inline-flex !important;
    align-items: center !important;
    justify-content: flex-end !important;
    gap: 4px !important;
    min-inline-size: max-content !important;
}

#completion_prompt_manager .bai-bai-preset-global-library-outside li.completion_prompt_manager_prompt .prompt_manager_prompt_tokens {
    inline-size: max-content !important;
    min-inline-size: 2.2em !important;
    width: auto !important;
    justify-self: end !important;
    text-align: right;
}

#completion_prompt_manager .bai-bai-preset-global-library-outside .bai-bai-preset-global-library-row-marker {
    position: absolute;
    height: 100%;
    top: 0;
    padding: 0 5px;
    display: flex !important;
    align-items: center;
    cursor: default !important;
}

#completion_prompt_manager .bai-bai-preset-global-library-outside .bai-bai-preset-global-library-empty {
    padding: 8px 10px;
    color: var(--SmartThemeBodyColor);
    opacity: 0.65;
    font-size: calc(var(--mainFontSize) * 0.92);
    overflow-wrap: anywhere;
}

/* 空分组作为拖放目标需要一点高度 */
#completion_prompt_manager .bai-bai-preset-global-library-outside .bai-bai-preset-global-library-list.bai-bai-preset-group-list-empty {
    min-height: 24px;
    border: 1px dashed color-mix(in srgb, var(--SmartThemeBorderColor) 70%, transparent);
    border-radius: 4px;
}

/* 库内分组文件夹 */
#completion_prompt_manager .bai-bai-preset-global-library-outside .bai-bai-preset-global-library-group {
    border: 1px solid var(--SmartThemeBorderColor);
    border-radius: 6px;
    overflow: hidden;
}

#completion_prompt_manager .bai-bai-preset-global-library-outside .bai-bai-preset-global-library-group-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
    padding: 6px 8px;
    cursor: pointer;
    background: color-mix(in srgb, var(--SmartThemeBodyColor) 6%, transparent);
}

#completion_prompt_manager .bai-bai-preset-global-library-outside .bai-bai-preset-global-library-group-header .bai-bai-preset-group-title {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
}

#completion_prompt_manager .bai-bai-preset-global-library-outside .bai-bai-preset-global-library-group-header .bai-bai-preset-group-title-content {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    overflow: hidden;
}

#completion_prompt_manager .bai-bai-preset-global-library-outside .bai-bai-preset-global-library-group-header strong {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

#completion_prompt_manager .bai-bai-preset-global-library-outside .bai-bai-preset-global-library-group-icon {
    opacity: 0.75;
}

#completion_prompt_manager .bai-bai-preset-global-library-outside .bai-bai-preset-global-library-group-header .bai-bai-preset-group-actions {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    flex: none;
}

/* 分组折叠(纯 CSS,复用外层库的 grid-template-rows 动画约束) */
#completion_prompt_manager .bai-bai-preset-global-library-outside .bai-bai-preset-global-library-group.bai-bai-preset-group-collapsed .bai-bai-preset-group-body {
    grid-template-rows: 0fr;
    pointer-events: none;
}

#completion_prompt_manager .bai-bai-preset-global-library-outside .bai-bai-preset-global-library-group.bai-bai-preset-group-collapsed .bai-bai-preset-group-toggle {
    transform: rotate(-90deg);
    transition-duration: ${PRESET_VUE_COLLAPSE_ANIMATION_MS}ms;
}

/* 顶部库 header 的按钮区 */
#completion_prompt_manager .bai-bai-preset-global-library-outside .bai-bai-preset-global-library-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
}

#completion_prompt_manager .bai-bai-preset-global-library-outside .bai-bai-preset-global-library-header .bai-bai-preset-group-actions {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    flex: none;
}

#completion_prompt_manager .bai-bai-preset-global-library-outside .bai-bai-preset-global-library-select-active {
    background: color-mix(in srgb, var(--SmartThemeQuoteColor) 30%, transparent);
}

/* 多选操作条 */
#completion_prompt_manager .bai-bai-preset-global-library-outside .bai-bai-preset-global-library-selection-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    flex-wrap: wrap;
    padding: 6px 8px;
    margin-bottom: 6px;
    border: 1px dashed var(--SmartThemeBorderColor);
    border-radius: 6px;
    background: color-mix(in srgb, var(--SmartThemeQuoteColor) 14%, transparent);
}

#completion_prompt_manager .bai-bai-preset-global-library-outside .bai-bai-preset-global-library-selection-count {
    font-size: calc(var(--mainFontSize) * 0.92);
    opacity: 0.85;
}

#completion_prompt_manager .bai-bai-preset-global-library-outside .bai-bai-preset-global-library-selection-actions {
    display: inline-flex;
    align-items: center;
    gap: 6px;
}

/* 行内复选框 */
#completion_prompt_manager .bai-bai-preset-global-library-outside .bai-bai-preset-global-library-select-box {
    cursor: pointer !important;
    opacity: 0.8;
}

#completion_prompt_manager .bai-bai-preset-global-library-outside .bai-bai-preset-global-library-select-box-checked {
    opacity: 1;
    color: var(--SmartThemeQuoteColor);
}

#completion_prompt_manager .bai-bai-preset-global-library-outside li.bai-bai-preset-global-library-prompt-selected {
    background: color-mix(in srgb, var(--SmartThemeQuoteColor) 16%, transparent);
    border-color: var(--SmartThemeQuoteColor);
}

#completion_prompt_manager.bai-bai-preset-global-library-dialog-host {
    position: relative;
}

#completion_prompt_manager .bai-bai-preset-global-library-dialog-layer {
    position: fixed;
    inset: auto;
    top: var(--bai-bai-preset-global-library-dialog-top, 0);
    left: var(--bai-bai-preset-global-library-dialog-left, 0);
    z-index: 40;
    display: flex;
    align-items: center;
    justify-content: center;
    inline-size: var(--bai-bai-preset-global-library-dialog-width, 100vw);
    block-size: var(--bai-bai-preset-global-library-dialog-height, 100dvh);
    min-height: 0;
    padding: 10px;
    background: color-mix(in srgb, var(--SmartThemeBlurTintColor) 46%, transparent);
    backdrop-filter: blur(2px);
    animation: bai-bai-preset-global-library-layer-in 0.14s ease both;
}

#completion_prompt_manager .bai-bai-preset-global-library-dialog {
    display: flex;
    flex-direction: column;
    gap: 10px;
    width: min(100%, 420px);
    max-height: min(78vh, 560px);
    padding: 12px;
    border: 1px solid var(--SmartThemeBorderColor);
    border-radius: 8px;
    background: var(--SmartThemeBlurTintColor);
    box-shadow: 0 12px 32px color-mix(in srgb, #000 28%, transparent);
    animation: bai-bai-preset-global-library-dialog-in 0.18s ease both;
}

#completion_prompt_manager .bai-bai-preset-global-library-dialog-head,
#completion_prompt_manager .bai-bai-preset-global-library-dialog-actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
}

#completion_prompt_manager .bai-bai-preset-global-library-dialog-head strong {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

#completion_prompt_manager .bai-bai-preset-global-library-dialog-body {
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-width: 0;
    overflow: auto;
}

#completion_prompt_manager .bai-bai-preset-global-library-dialog-message {
    line-height: 1.35;
    overflow-wrap: anywhere;
}

#completion_prompt_manager .bai-bai-preset-global-library-dialog-field {
    display: flex;
    flex-direction: column;
    gap: 5px;
    min-width: 0;
}

#completion_prompt_manager .bai-bai-preset-global-library-dialog-field label {
    opacity: 0.78;
    font-size: calc(var(--mainFontSize) * 0.9);
}

#completion_prompt_manager .bai-bai-preset-global-library-dialog-field .text_pole,
#completion_prompt_manager .bai-bai-preset-global-library-dialog-field select {
    width: 100% !important;
    min-width: 0 !important;
}

#completion_prompt_manager .bai-bai-preset-global-library-dialog-field textarea {
    width: 100% !important;
    min-width: 0 !important;
    min-height: 260px;
    resize: vertical;
}

#completion_prompt_manager .bai-bai-preset-global-library-dialog-actions {
    justify-content: flex-end;
}

#completion_prompt_manager .bai-bai-preset-global-library-dialog-button {
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    flex: 0 0 auto !important;
    min-width: 4.8em !important;
    width: auto !important;
    min-height: calc(var(--mainFontSize) * 2) !important;
    padding: 0 12px !important;
    line-height: 1.2 !important;
    white-space: nowrap !important;
    max-width: none !important;
    writing-mode: horizontal-tb !important;
}

#completion_prompt_manager .bai-bai-preset-global-library-dialog-danger {
    color: #d86666 !important;
}

@keyframes bai-bai-preset-global-library-layer-in {
    from {
        opacity: 0;
    }

    to {
        opacity: 1;
    }
}

@keyframes bai-bai-preset-global-library-dialog-in {
    from {
        opacity: 0;
        transform: translateY(8px) scale(0.97);
    }

    to {
        opacity: 1;
        transform: translateY(0) scale(1);
    }
}

@media (max-width: 600px) {
    #completion_prompt_manager .bai-bai-preset-global-library-dialog-layer {
        position: fixed;
        inset: 0;
        z-index: 50000;
        inline-size: auto;
        block-size: auto;
        min-height: 100dvh;
        padding: 18px;
        background: color-mix(in srgb, var(--SmartThemeBlurTintColor) 60%, transparent);
    }

    #completion_prompt_manager .bai-bai-preset-global-library-dialog {
        width: min(100%, 420px);
        max-height: calc(100dvh - 36px);
    }
}

body.${PRESET_VUE_DRAGGING_BODY_CLASS} #completion_prompt_manager ${PRESET_PROMPT_MANAGER_LIST_SELECTOR} .bai-bai-preset-group-list-empty {
    min-height: ${PRESET_VUE_GROUP_DROP_TARGET_MIN_HEIGHT_PX}px;
}

#completion_prompt_manager ${PRESET_PROMPT_MANAGER_LIST_SELECTOR} .bai-bai-preset-group.${PRESET_VUE_GROUP_DROP_TARGET_CLASS} {
    border-color: var(--SmartThemeQuoteColor);
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--SmartThemeQuoteColor) 65%, transparent);
}

#completion_prompt_manager ${PRESET_PROMPT_MANAGER_LIST_SELECTOR} .bai-bai-preset-group.${PRESET_VUE_GROUP_DROP_TARGET_CLASS} .bai-bai-preset-group-header,
#completion_prompt_manager ${PRESET_PROMPT_MANAGER_LIST_SELECTOR} .bai-bai-preset-group.${PRESET_VUE_GROUP_DROP_TARGET_CLASS} .bai-bai-preset-group-list {
    background-color: color-mix(in srgb, var(--SmartThemeQuoteColor) 12%, transparent);
}

#completion_prompt_manager ${PRESET_PROMPT_MANAGER_LIST_SELECTOR} .bai-bai-preset-range-selectable {
    cursor: crosshair !important;
}

#completion_prompt_manager ${PRESET_PROMPT_MANAGER_LIST_SELECTOR} .bai-bai-preset-range-selectable * {
    cursor: crosshair !important;
}

#completion_prompt_manager ${PRESET_PROMPT_MANAGER_LIST_SELECTOR} .bai-bai-preset-range-selectable .prompt_manager_prompt_controls {
    pointer-events: none;
    opacity: 0.45;
}

#completion_prompt_manager ${PRESET_PROMPT_MANAGER_LIST_SELECTOR} .bai-bai-preset-range-start,
#completion_prompt_manager ${PRESET_PROMPT_MANAGER_LIST_SELECTOR} .bai-bai-preset-range-end,
#completion_prompt_manager ${PRESET_PROMPT_MANAGER_LIST_SELECTOR} .bai-bai-preset-range-inside {
    outline: 2px solid var(--SmartThemeQuoteColor);
    outline-offset: -2px;
}

.${PRESET_DRAG_SOURCE_CLASS} {
    visibility: hidden !important;
}

.${PRESET_DRAG_CLONE_CLASS} {
    position: fixed !important;
    box-sizing: border-box !important;
    margin: 0 !important;
    pointer-events: none !important;
    z-index: 50000 !important;
    cursor: grabbing !important;
    opacity: 0.96;
    box-shadow: 0 8px 22px rgba(0, 0, 0, 0.35);
    will-change: transform;
}

.${PRESET_DRAG_CLONE_CLASS} .drag-handle {
    cursor: grabbing !important;
}

.${PRESET_DRAG_CLONE_CLASS}.completion_prompt_manager_prompt,
.bai-bai-preset-vue-sortable-ghost.completion_prompt_manager_prompt,
.bai-bai-preset-vue-sortable-fallback.completion_prompt_manager_prompt,
.bai-bai-preset-vue-sortable-drag.completion_prompt_manager_prompt {
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) max-content max-content !important;
    column-gap: 6px !important;
    align-items: center !important;
    padding-left: 20px !important;
    list-style: none !important;
    list-style-type: none !important;
}

.${PRESET_DRAG_CLONE_CLASS}.completion_prompt_manager_prompt::marker,
.bai-bai-preset-vue-sortable-ghost.completion_prompt_manager_prompt::marker,
.bai-bai-preset-vue-sortable-fallback.completion_prompt_manager_prompt::marker,
.bai-bai-preset-vue-sortable-drag.completion_prompt_manager_prompt::marker {
    content: "" !important;
    font-size: 0 !important;
}

.${PRESET_DRAG_CLONE_CLASS} .prompt_manager_prompt_controls,
.bai-bai-preset-vue-sortable-ghost .prompt_manager_prompt_controls,
.bai-bai-preset-vue-sortable-fallback .prompt_manager_prompt_controls,
.bai-bai-preset-vue-sortable-drag .prompt_manager_prompt_controls {
    display: inline-flex !important;
    align-items: center !important;
    justify-content: flex-end !important;
    flex-direction: row !important;
    gap: 4px !important;
    flex-wrap: nowrap !important;
    white-space: nowrap !important;
    min-inline-size: max-content !important;
}

.${PRESET_DRAG_CLONE_CLASS} .drag-handle,
.bai-bai-preset-vue-sortable-ghost .drag-handle,
.bai-bai-preset-vue-sortable-fallback .drag-handle,
.bai-bai-preset-vue-sortable-drag .drag-handle {
    position: absolute !important;
    left: 0 !important;
    top: 0 !important;
    height: 100% !important;
    padding: 0 5px !important;
    display: flex !important;
    align-items: center !important;
}

.${PRESET_DRAG_CLONE_CLASS} .completion_prompt_manager_prompt_name,
.bai-bai-preset-vue-sortable-ghost .completion_prompt_manager_prompt_name,
.bai-bai-preset-vue-sortable-fallback .completion_prompt_manager_prompt_name,
.bai-bai-preset-vue-sortable-drag .completion_prompt_manager_prompt_name {
    min-width: 0 !important;
    white-space: nowrap !important;
    overflow: hidden !important;
}

.${PRESET_DRAG_CLONE_CLASS} .bai-bai-preset-prompt-icon-button,
.${PRESET_DRAG_CLONE_CLASS} .bai-bai-preset-prompt-action-button,
.bai-bai-preset-vue-sortable-ghost .bai-bai-preset-prompt-icon-button,
.bai-bai-preset-vue-sortable-ghost .bai-bai-preset-prompt-action-button,
.bai-bai-preset-vue-sortable-fallback .bai-bai-preset-prompt-icon-button,
.bai-bai-preset-vue-sortable-fallback .bai-bai-preset-prompt-action-button,
.bai-bai-preset-vue-sortable-drag .bai-bai-preset-prompt-icon-button,
.bai-bai-preset-vue-sortable-drag .bai-bai-preset-prompt-action-button {
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    flex: 0 0 calc(var(--mainFontSize) * 1.65) !important;
    inline-size: calc(var(--mainFontSize) * 1.65) !important;
    block-size: calc(var(--mainFontSize) * 1.65) !important;
    min-inline-size: calc(var(--mainFontSize) * 1.65) !important;
    min-block-size: calc(var(--mainFontSize) * 1.65) !important;
    box-sizing: border-box !important;
    border: 0 !important;
    box-shadow: none !important;
    background: transparent !important;
    margin: 0 !important;
    padding: 0 !important;
    font-size: calc(var(--mainFontSize) * 1) !important;
    line-height: 1 !important;
    white-space: nowrap !important;
}

.${PRESET_DRAG_CLONE_CLASS}.completion_prompt_manager_prompt:not(.completion_prompt_manager_prompt_disabled) .prompt-manager-toggle-action,
.bai-bai-preset-vue-sortable-ghost.completion_prompt_manager_prompt:not(.completion_prompt_manager_prompt_disabled) .prompt-manager-toggle-action,
.bai-bai-preset-vue-sortable-fallback.completion_prompt_manager_prompt:not(.completion_prompt_manager_prompt_disabled) .prompt-manager-toggle-action,
.bai-bai-preset-vue-sortable-drag.completion_prompt_manager_prompt:not(.completion_prompt_manager_prompt_disabled) .prompt-manager-toggle-action {
    color: var(--SmartThemeQuoteColor) !important;
}

.${PRESET_DRAG_CLONE_CLASS} .prompt_manager_prompt_tokens,
.bai-bai-preset-vue-sortable-ghost .prompt_manager_prompt_tokens,
.bai-bai-preset-vue-sortable-fallback .prompt_manager_prompt_tokens,
.bai-bai-preset-vue-sortable-drag .prompt_manager_prompt_tokens {
    inline-size: max-content !important;
    min-inline-size: 2.2em !important;
    width: auto !important;
    justify-self: end !important;
    text-align: right !important;
    font-size: calc(var(--mainFontSize) * 0.9) !important;
}

.${PRESET_DRAG_CLONE_CLASS} .bai-bai-preset-prompt-actions,
.bai-bai-preset-vue-sortable-ghost .bai-bai-preset-prompt-actions,
.bai-bai-preset-vue-sortable-fallback .bai-bai-preset-prompt-actions,
.bai-bai-preset-vue-sortable-drag .bai-bai-preset-prompt-actions {
    display: none !important;
    opacity: 0 !important;
}

.${PRESET_DRAG_CLONE_CLASS} .prompt-manager-remove-action,
.${PRESET_DRAG_CLONE_CLASS} .prompt-manager-copy-action,
.bai-bai-preset-vue-sortable-ghost .prompt-manager-remove-action,
.bai-bai-preset-vue-sortable-ghost .prompt-manager-copy-action,
.bai-bai-preset-vue-sortable-fallback .prompt-manager-remove-action,
.bai-bai-preset-vue-sortable-fallback .prompt-manager-copy-action,
.bai-bai-preset-vue-sortable-drag .prompt-manager-remove-action,
.bai-bai-preset-vue-sortable-drag .prompt-manager-copy-action {
    display: none !important;
}

.${PRESET_DRAG_CLONE_CLASS} .bai-bai-preset-prompt-actions-hint,
.${PRESET_DRAG_CLONE_CLASS} .bai-bai-preset-prompt-actions-hint-hidden,
.bai-bai-preset-vue-sortable-ghost .bai-bai-preset-prompt-actions-hint,
.bai-bai-preset-vue-sortable-ghost .bai-bai-preset-prompt-actions-hint-hidden,
.bai-bai-preset-vue-sortable-fallback .bai-bai-preset-prompt-actions-hint,
.bai-bai-preset-vue-sortable-fallback .bai-bai-preset-prompt-actions-hint-hidden,
.bai-bai-preset-vue-sortable-drag .bai-bai-preset-prompt-actions-hint,
.bai-bai-preset-vue-sortable-drag .bai-bai-preset-prompt-actions-hint-hidden {
    display: inline-flex !important;
}

.${PRESET_DRAG_INDICATOR_CLASS} {
    position: fixed;
    height: 2px;
    border-radius: 999px;
    pointer-events: none;
    z-index: 50001;
    background: var(--SmartThemeQuoteColor);
    box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.25), 0 0 10px var(--SmartThemeQuoteColor);
}

.bai-bai-preset-vue-sortable-ghost {
    opacity: 0.35;
}

body.${PRESET_VUE_DRAGGING_BODY_CLASS} #completion_prompt_manager ${PRESET_PROMPT_MANAGER_LIST_SELECTOR} .bai-bai-preset-vue-sortable-ghost,
body.${PRESET_VUE_DRAGGING_BODY_CLASS} #completion_prompt_manager ${PRESET_PROMPT_MANAGER_LIST_SELECTOR} .bai-bai-preset-vue-sortable-chosen {
    visibility: hidden !important;
}

.bai-bai-preset-vue-sortable-ghost.bai-bai-preset-group .bai-bai-preset-group-body {
    visibility: hidden !important;
}

.bai-bai-preset-vue-sortable-fallback.bai-bai-preset-group {
    display: flex !important;
    flex-direction: column !important;
    gap: 0 !important;
    box-sizing: border-box !important;
    padding: 0 !important;
    border: 1px solid var(--SmartThemeBorderColor) !important;
    border-radius: 8px !important;
    background: color-mix(in srgb, var(--SmartThemeBlurTintColor) 45%, transparent) !important;
    overflow: hidden !important;
    height: auto !important;
    min-height: 0 !important;
}

.bai-bai-preset-vue-sortable-fallback .bai-bai-preset-group-header {
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) auto !important;
    align-items: center !important;
    box-sizing: border-box !important;
    padding: 10px 7px !important;
    border: 0 !important;
    background: color-mix(in srgb, var(--SmartThemeBlurTintColor) 75%, transparent) !important;
    cursor: grabbing !important;
    user-select: none !important;
    -webkit-user-select: none !important;
}

.bai-bai-preset-vue-sortable-fallback .bai-bai-preset-group-title {
    display: flex !important;
    align-items: center !important;
    gap: 4px !important;
    min-width: 0 !important;
    overflow: hidden !important;
    white-space: normal !important;
    font-size: calc(var(--mainFontSize) * 1) !important;
}

.bai-bai-preset-vue-sortable-fallback .bai-bai-preset-group-title-content {
    display: flex !important;
    align-items: flex-end !important;
    flex-wrap: wrap !important;
    gap: 6px !important;
    min-width: 0 !important;
    overflow: hidden !important;
    white-space: normal !important;
}

.bai-bai-preset-vue-sortable-fallback .bai-bai-preset-group-title-content strong {
    flex: 0 1 auto !important;
    min-width: 0 !important;
    overflow: visible !important;
    overflow-wrap: anywhere !important;
    white-space: normal !important;
}

.bai-bai-preset-vue-sortable-fallback .bai-bai-preset-group-actions {
    display: flex !important;
    justify-content: flex-end !important;
    align-items: center !important;
    gap: 3px !important;
}

.bai-bai-preset-vue-sortable-fallback .bai-bai-preset-group-toggle,
.bai-bai-preset-vue-sortable-fallback .bai-bai-preset-group-action-button {
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    flex: 0 0 calc(var(--mainFontSize) * 1.65) !important;
    inline-size: calc(var(--mainFontSize) * 1.65) !important;
    block-size: calc(var(--mainFontSize) * 1.65) !important;
    min-inline-size: calc(var(--mainFontSize) * 1.65) !important;
    min-block-size: calc(var(--mainFontSize) * 1.65) !important;
    box-sizing: border-box !important;
    border: 0 !important;
    box-shadow: none !important;
    background: transparent !important;
    margin: 0 !important;
    padding: 0 !important;
    font-size: calc(var(--mainFontSize) * 0.9) !important;
    line-height: 1 !important;
}

.bai-bai-preset-vue-sortable-fallback .bai-bai-preset-group-enable-toggle {
    font-size: calc(var(--mainFontSize) * 1.05) !important;
}

.bai-bai-preset-vue-sortable-fallback .bai-bai-preset-group-count {
    flex: 0 0 auto !important;
    opacity: 0.65 !important;
    font-size: calc(var(--mainFontSize) * 0.82) !important;
    white-space: nowrap !important;
}

.bai-bai-preset-vue-sortable-fallback.bai-bai-preset-group .bai-bai-preset-group-body {
    display: none !important;
}

.bai-bai-preset-vue-sortable-chosen,
.bai-bai-preset-vue-sortable-drag {
    cursor: grabbing !important;
}

body.${PRESET_VUE_DRAGGING_BODY_CLASS} #completion_prompt_manager ${PRESET_PROMPT_MANAGER_LIST_SELECTOR} .bai-bai-preset-vue-sortable-chosen,
#completion_prompt_manager ${PRESET_PROMPT_MANAGER_LIST_SELECTOR} .${PRESET_VUE_DRAG_READY_FEEDBACK_CLASS} {
    outline: 2px solid color-mix(in srgb, var(--SmartThemeQuoteColor) 75%, transparent) !important;
    outline-offset: -2px !important;
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--SmartThemeQuoteColor) 35%, transparent) !important;
}

body.${PRESET_VUE_DRAGGING_BODY_CLASS} #completion_prompt_manager ${PRESET_PROMPT_MANAGER_LIST_SELECTOR} .bai-bai-preset-vue-sortable-chosen.bai-bai-preset-group .bai-bai-preset-group-header,
body.${PRESET_VUE_DRAGGING_BODY_CLASS} #completion_prompt_manager ${PRESET_PROMPT_MANAGER_LIST_SELECTOR} li.completion_prompt_manager_prompt.bai-bai-preset-vue-sortable-chosen,
#completion_prompt_manager ${PRESET_PROMPT_MANAGER_LIST_SELECTOR} .${PRESET_VUE_DRAG_READY_FEEDBACK_CLASS}.bai-bai-preset-group .bai-bai-preset-group-header,
#completion_prompt_manager ${PRESET_PROMPT_MANAGER_LIST_SELECTOR} li.completion_prompt_manager_prompt.${PRESET_VUE_DRAG_READY_FEEDBACK_CLASS} {
    background: color-mix(in srgb, var(--SmartThemeQuoteColor) 18%, transparent) !important;
}

@media (pointer: coarse) {
    body.${PRESET_VUE_DRAGGING_BODY_CLASS} #completion_prompt_manager ${PRESET_PROMPT_MANAGER_LIST_SELECTOR} .bai-bai-preset-vue-sortable-chosen,
    #completion_prompt_manager ${PRESET_PROMPT_MANAGER_LIST_SELECTOR} .${PRESET_VUE_DRAG_READY_FEEDBACK_CLASS} {
        transform: scale(0.995);
        transition: transform 120ms ease, outline-color 120ms ease, box-shadow 120ms ease;
    }
}
`;

    if (existingStyle) {
        existingStyle.textContent = css;
        return;
    }

    const style = document.createElement('style');
    style.id = PRESET_DRAG_STYLE_ID;
    style.textContent = css;
    document.head.append(style);
}

function patchPromptManagerDraggable() {
    const manager = promptManager;

    if (!manager || typeof manager.makeDraggable !== 'function') {
        return false;
    }

    const existingPatch = extensionState[PRESET_DRAG_PATCH_KEY];

    if (existingPatch?.manager === manager && manager.makeDraggable === existingPatch.patched) {
        return true;
    }

    if (manager.makeDraggable.__baiBaiToolkitPresetDragPatched) {
        extensionState[PRESET_DRAG_PATCH_KEY] = {
            manager,
            original: manager.makeDraggable.__baiBaiToolkitOriginalMakeDraggable,
            patched: manager.makeDraggable,
        };
        return true;
    }

    const originalMakeDraggable = manager.makeDraggable;
    const patchedMakeDraggable = function (...args) {
        if (isPresetVuePromptListManagerActive()) {
            const list = this?.listElement instanceof HTMLElement
                ? this.listElement
                : document.querySelector(PRESET_PROMPT_MANAGER_LIST_SELECTOR);
            disablePromptManagerStockSortable(list);
            preparePromptManagerCustomDragList(list);
            return undefined;
        }

        if (!settings.presetDragOptimizationEnabled) {
            return originalMakeDraggable.apply(this, args);
        }

        const list = this?.listElement instanceof HTMLElement
            ? this.listElement
            : document.querySelector(PRESET_PROMPT_MANAGER_LIST_SELECTOR);
        preparePromptManagerCustomDragList(list);
        return undefined;
    };

    patchedMakeDraggable.__baiBaiToolkitPresetDragPatched = true;
    patchedMakeDraggable.__baiBaiToolkitOriginalMakeDraggable = originalMakeDraggable;
    manager.makeDraggable = patchedMakeDraggable;
    extensionState[PRESET_DRAG_PATCH_KEY] = {
        manager,
        original: originalMakeDraggable,
        patched: patchedMakeDraggable,
    };

    return true;
}

function restorePromptManagerStockDraggable() {
    if (!promptManager || typeof promptManager.makeDraggable !== 'function') {
        return;
    }

    try {
        promptManager.makeDraggable();
    } catch (error) {
        console.debug(`${LOG_PREFIX} Failed to restore prompt manager sorting`, error);
    }
}

function preparePromptManagerCustomDragList(
    list = document.querySelector(PRESET_PROMPT_MANAGER_LIST_SELECTOR),
    { signature = '' } = {},
) {
    if (!(list instanceof HTMLElement)) {
        return false;
    }

    if (!settings.presetDragOptimizationEnabled && !isPresetGroupingEnabled()) {
        list.classList.remove(PRESET_DRAG_READY_CLASS, PRESET_DRAG_ACTIVE_CLASS);
        return false;
    }

    const manager = getPresetVuePromptListManagerState();
    const prepareSignature = signature || '';
    if (
        prepareSignature
        && manager.dragPreparedList === list
        && manager.dragPreparedSignature === prepareSignature
        && list.classList.contains(PRESET_DRAG_READY_CLASS)
    ) {
        return true;
    }

    disablePromptManagerStockSortable(list);
    list.classList.add(PRESET_DRAG_READY_CLASS);
    syncPresetVuePromptListGapVariable(list);
    list.querySelectorAll('li.completion_prompt_manager_prompt .drag-handle')
        .forEach(handle => handle.classList.add('ui-sortable-handle'));
    manager.dragPreparedList = list;
    manager.dragPreparedSignature = prepareSignature;
    return true;
}

function readPresetVuePromptListGapValue(list) {
    const styles = getComputedStyle(list);
    const gap = styles.rowGap && styles.rowGap !== 'normal'
        ? styles.rowGap
        : styles.gap;

    return gap && gap !== 'normal' ? gap : '';
}

function applyPresetVuePromptListGapValue(list, gap) {
    if (!(list instanceof HTMLElement)) {
        return;
    }

    if (gap) {
        list.style.setProperty(PRESET_VUE_LIST_GAP_VARIABLE, gap);
    } else {
        list.style.removeProperty(PRESET_VUE_LIST_GAP_VARIABLE);
    }
}

function syncPresetVuePromptListGapVariable(list) {
    if (!(list instanceof HTMLElement)) {
        return;
    }

    const manager = getPresetVuePromptListManagerState();

    // Cache hit: the gap only changes on theme/font edits (rare, off the hot path),
    // so reuse the last measured value and just write the CSS variable. This write
    // does not force a synchronous layout, so the per-render reflow is eliminated.
    if (manager.cachedListGapList === list && manager.cachedListGap !== null) {
        applyPresetVuePromptListGapValue(list, manager.cachedListGap);
        return;
    }

    // Cache miss: defer the getComputedStyle read to the next animation frame.
    // Layout already runs at that point, so reading the gap there piggybacks on
    // it instead of triggering an extra forced reflow inside the render path.
    if (manager.listGapReadFrame !== null || typeof requestAnimationFrame !== 'function') {
        // No rAF available (or one already queued): fall back to an immediate read once.
        if (typeof requestAnimationFrame !== 'function') {
            const gap = readPresetVuePromptListGapValue(list);
            manager.cachedListGap = gap;
            manager.cachedListGapList = list;
            applyPresetVuePromptListGapValue(list, gap);
        }
        return;
    }

    manager.listGapReadFrame = requestAnimationFrame(() => {
        manager.listGapReadFrame = null;

        if (!(list instanceof HTMLElement) || !list.isConnected) {
            return;
        }

        const gap = readPresetVuePromptListGapValue(list);
        manager.cachedListGap = gap;
        manager.cachedListGapList = list;
        applyPresetVuePromptListGapValue(list, gap);
    });
}

function invalidatePresetVuePromptListGapCache() {
    const manager = getPresetVuePromptListManagerState();
    manager.cachedListGap = null;
    manager.cachedListGapList = null;

    if (manager.listGapReadFrame !== null && typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(manager.listGapReadFrame);
    }

    manager.listGapReadFrame = null;
}

function clearPromptManagerCustomDragList() {
    const list = document.querySelector(PRESET_PROMPT_MANAGER_LIST_SELECTOR);

    if (!(list instanceof HTMLElement)) {
        return;
    }

    list.classList.remove(PRESET_DRAG_READY_CLASS, PRESET_DRAG_ACTIVE_CLASS);
    invalidatePresetVuePromptListGapCache();
}

function disablePromptManagerStockSortable(list) {
    if (!(list instanceof HTMLElement) || typeof globalThis.jQuery?.fn?.sortable !== 'function') {
        return;
    }

    try {
        const sortableList = $(list);

        if (sortableList.sortable('instance') !== undefined) {
            sortableList.sortable('destroy');
        }
    } catch (error) {
        console.debug(`${LOG_PREFIX} Failed to disable stock prompt manager sorting`, error);
    }
}

async function installPresetVuePromptListManager() {
    if (!isPresetGroupingEnabled()) {
        return;
    }

    const manager = getPresetVuePromptListManagerState();
    manager.enabled = true;
    installPresetPromptGroupGenerationGatePatch();
    installPresetVuePromptListRenderPatch();
    patchPromptManagerDraggable();
    applyPresetDragOptimizationCss();
    installPresetVueDynamicDragDelayHandlers();

    if (manager.installing) {
        return manager.installing;
    }

    manager.installing = (async () => {
        if (!isPromptManagerReadyForVuePromptList()) {
            schedulePresetVuePromptListManagerSync(250);
            return;
        }

        if (manager.app && manager.host?.isConnected && manager.root?.isConnected) {
            syncPresetVuePromptListManagerState();
            preparePromptManagerCustomDragList(manager.root, { signature: manager.lastStructureSignature });
            return;
        }

        if (manager.app) {
            unmountPresetVuePromptListApp(manager);
        }

        const list = getPromptManagerListElement() ?? ensurePromptManagerListAfterVueHost();

        if (!(list instanceof HTMLElement)) {
            schedulePresetVuePromptListManagerSync(250);
            return;
        }

        const { host, listClassName } = replacePromptManagerListWithVueHost(list);
        const vue = await loadPresetVueModule();
        const vueDraggableNext = await loadPresetVueDraggableModule();
        manager.vue = vue;
        manager.vueDraggableNext = vueDraggableNext;
        manager.host = host;
        manager.state = vue.reactive(createPresetVuePromptListModel());
        manager.state.listClassName = listClassName;
        manager.app = vue.createApp(createPresetVuePromptListRootComponent(vue, vueDraggableNext, manager.state));

        manager.app.mount(host);
        manager.root = host.querySelector(PRESET_PROMPT_MANAGER_LIST_SELECTOR);
        if (manager.root instanceof HTMLElement && promptManager) {
            promptManager.listElement = manager.root;
        }
        syncPresetVuePromptListManagerState();
        preparePromptManagerCustomDragList(manager.root, { signature: manager.lastStructureSignature });
        void loadPresetGlobalPromptLibrary().catch(error => {
            console.debug(`${LOG_PREFIX} Failed to load preset global prompt library`, error);
        });
    })();

    try {
        await manager.installing;
    } catch (error) {
        console.debug(`${LOG_PREFIX} Failed to install preset Vue prompt list manager`, error);
        toastr.error(t`Failed to install preset prompt list manager. See console for details.`);
        removePresetVuePromptListManager();
    } finally {
        manager.installing = null;
    }
}

function removePresetVuePromptListManager({ skipRestore = false } = {}) {
    const manager = getPresetVuePromptListManagerState();
    const shouldRestoreList = !skipRestore && Boolean(
        manager.app
        || manager.host?.isConnected
        || document.querySelector(`.${PRESET_VUE_LIST_HOST_CLASS}`),
    );

    manager.enabled = false;
    clearTimeout(manager.syncTimer);
    manager.syncTimer = null;
    clearPresetVuePromptOrderSaveSchedule(manager);
    setPresetVuePromptDragScrollGuardEnabled(false);
    document.body?.classList.remove(PRESET_VUE_DRAGGING_BODY_CLASS);

    if (!settings.presetSwitchOptimizationEnabled) {
        removePresetVuePromptListRenderPatch();
    }
    removePresetVueDynamicDragDelayHandlers();

    unmountPresetVuePromptListApp(manager);

    manager.installing = null;
    document.getElementById(PRESET_DRAG_STYLE_ID)?.remove();

    if (shouldRestoreList) {
        void restorePromptManagerListAfterVueRemove();
    }
}

function unmountPresetVuePromptListApp(manager = getPresetVuePromptListManagerState()) {
    clearPresetVuePromptOrderSaveSchedule(manager);
    setPresetVuePromptDragScrollGuardEnabled(false);
    clearPresetVuePromptGroupBodyUnmountTimers(manager);
    cancelPresetVuePromptBodyHeightAnimations(manager);

    if (manager.app) {
        try {
            manager.app.unmount();
        } catch (error) {
            console.debug(`${LOG_PREFIX} Failed to unmount preset Vue prompt list manager`, error);
        }
    }

    manager.app = null;
    manager.state = null;
    manager.root = null;
    manager.dragSnapshot = null;
    clearPresetVuePromptManualDragState(manager);
    manager.currentTopLevelDropIndex = null;
    manager.currentDropTargetGroupId = null;
    manager.draggedPromptId = null;
    cancelPresetVuePromptGroupHeaderCustomDrag(manager, { suppress: false });
    clearPresetVuePromptDragReadyFeedback(manager);
    manager.groupHeaderGesture = null;
    manager.groupHeaderCustomDrag = null;
    manager.lastGroupHeaderToggleAt = 0;
    manager.lastGroupHeaderGestureCanceledAt = 0;
    manager.lastDragStartedAt = 0;
    manager.lastDragEndedAt = 0;
    manager.lastSyncSignature = '';
    manager.lastStructureSignature = '';
    manager.lastRenderPatchSyncCycle = 0;
    manager.dragPreparedList = null;
    manager.dragPreparedSignature = '';
    invalidatePresetVuePromptListGapCache();
}

function getPresetVuePromptListManagerState() {
    if (!extensionState[PRESET_VUE_LIST_MANAGER_KEY] || typeof extensionState[PRESET_VUE_LIST_MANAGER_KEY] !== 'object') {
        extensionState[PRESET_VUE_LIST_MANAGER_KEY] = {
            app: null,
            host: null,
            root: null,
            state: null,
            vue: null,
            vueDraggableNext: null,
            modulePromise: null,
            draggableModulePromise: null,
            installing: null,
            syncTimer: null,
            saveTimer: null,
            saveFrame: null,
            pendingOrderSave: false,
            dragSnapshot: null,
            pendingServiceSettingsSave: false,
            pendingGroupSettingsSave: false,
            pendingChangesSavePromise: null,
            pendingChangesSaveInFlight: false,
            pendingPresetPromptServiceSaves: null,
            pendingPresetPromptGroupSaves: null,
            pendingOpenAiPresetSaves: null,
            presetPromptSaveRevisions: null,
            nextPresetPromptSaveRevision: 0,
            openAiPresetSaveRequestStates: null,
            pendingVisibilityTimer: null,
            pendingVisibilityObserver: null,
            groupBodyUnmountTimers: null,
            globalLibraryCollapsed: true,
            globalLibraryItems: [],
            globalLibraryGroups: [],
            globalLibrarySelecting: false,
            globalLibrarySelectedIds: null,
            globalLibraryLoaded: false,
            globalLibraryLoading: false,
            globalLibraryError: null,
            globalLibraryLoadPromise: null,
            globalLibrarySavePromise: null,
            globalLibraryBridgePromise: null,
            dragReadyFeedbackTimer: null,
            dragReadyFeedbackElement: null,
            dragReadyFeedbackNotified: false,
            currentDropTargetGroupId: null,
            currentDropTargetElement: null,
            currentTopLevelDropIndex: null,
            draggedPromptId: null,
            draggedItem: null,
            dragPlacement: null,
            dragIndicatorElement: null,
            dragIndicatorRectKey: null,
            dragPlacementFrame: null,
            dragLayoutCache: null,
            dragScrollContainer: null,
            dragAutoScrollFrame: null,
            lastDragPoint: null,
            groupHeaderGesture: null,
            groupHeaderCustomDrag: null,
            lastGroupHeaderToggleAt: 0,
            lastGroupHeaderGestureCanceledAt: 0,
            lastDragStartedAt: 0,
            lastDragEndedAt: 0,
            enabled: false,
            lastSyncSignature: '',
            lastStructureSignature: '',
            lastRenderPatchSyncCycle: 0,
            dragPreparedList: null,
            dragPreparedSignature: '',
            cachedListGap: null,
            cachedListGapList: null,
            listGapReadFrame: null,
            bodyHeightAnimations: [],
            bodyHeightTransitionCycle: 0,
        };
    }

    return extensionState[PRESET_VUE_LIST_MANAGER_KEY];
}

function isPresetVuePromptListManagerActive() {
    const manager = getPresetVuePromptListManagerState();
    return Boolean(manager.app && manager.state);
}

function isPresetVuePromptListDragging() {
    return Boolean(getPresetVuePromptListManagerState().state?.dragging);
}

function isPromptManagerReadyForVuePromptList() {
    return Boolean(
        promptManager
        && promptManager.serviceSettings
        && typeof promptManager.getPromptOrderForCharacter === 'function'
        && typeof promptManager.removePromptOrderForCharacter === 'function'
        && typeof promptManager.addPromptOrderForCharacter === 'function'
        && typeof promptManager.saveServiceSettings === 'function'
        && (getPromptManagerListElement() instanceof HTMLElement || getPresetVueListHostElement() instanceof HTMLElement),
    );
}

function schedulePresetVuePromptListManagerSync(delayMs = 80) {
    if (!isPresetGroupingEnabled()) {
        return;
    }

    const manager = getPresetVuePromptListManagerState();
    clearTimeout(manager.syncTimer);
    manager.syncTimer = setTimeout(() => {
        manager.syncTimer = null;
        void installPresetVuePromptListManager();
    }, delayMs);
}

async function loadPresetVueModule() {
    const manager = getPresetVuePromptListManagerState();

    if (!manager.modulePromise) {
        manager.modulePromise = import(new URL(PRESET_VUE_MODULE_PATH, import.meta.url).href);
    }

    return manager.modulePromise;
}

async function loadPresetVueDraggableModule() {
    const manager = getPresetVuePromptListManagerState();

    if (!manager.draggableModulePromise) {
        manager.draggableModulePromise = import(new URL(PRESET_VUE_DRAGGABLE_MODULE_PATH, import.meta.url).href);
    }

    return manager.draggableModulePromise;
}

function getPromptManagerListElement() {
    const manager = getPresetVuePromptListManagerState();

    if (manager.root instanceof HTMLElement && manager.root.isConnected) {
        return manager.root;
    }

    if (promptManager?.listElement instanceof HTMLElement && promptManager.listElement.isConnected) {
        return promptManager.listElement;
    }

    const list = document.querySelector(PRESET_PROMPT_MANAGER_LIST_SELECTOR);

    if (list instanceof HTMLElement && promptManager) {
        promptManager.listElement = list;
    }

    return list;
}

function getPresetVueListHostElement() {
    const manager = getPresetVuePromptListManagerState();

    if (manager.host instanceof HTMLElement && manager.host.isConnected) {
        return manager.host;
    }

    const host = document.querySelector(`.${PRESET_VUE_LIST_HOST_CLASS}`);
    return host instanceof HTMLElement ? host : null;
}

function replacePromptManagerListWithVueHost(list) {
    const host = document.createElement('div');
    host.className = PRESET_VUE_LIST_HOST_CLASS;
    list.replaceWith(host);
    return {
        host,
        listClassName: getPresetVuePromptListClassName(list),
    };
}

function getPresetVuePromptListClassName(list) {
    const classes = new Set(String(list?.className || 'text_pole').split(/\s+/).filter(Boolean));
    classes.add('text_pole');
    classes.add(PRESET_DRAG_READY_CLASS);
    return Array.from(classes).join(' ');
}

function ensurePromptManagerListAfterVueHost() {
    const manager = getPresetVuePromptListManagerState();

    if (manager.root instanceof HTMLElement && manager.root.isConnected) {
        return manager.root;
    }

    const host = getPresetVueListHostElement();

    if (host instanceof HTMLElement) {
        const existingList = host.querySelector(PRESET_PROMPT_MANAGER_LIST_SELECTOR);

        if (existingList instanceof HTMLElement) {
            manager.host = host;
            manager.root = existingList;

            if (promptManager) {
                promptManager.listElement = existingList;
            }

            return existingList;
        }

        const list = document.createElement('ul');
        list.id = PRESET_PROMPT_MANAGER_LIST_SELECTOR.slice(1);
        list.className = 'text_pole';
        host.replaceWith(list);
        manager.host = null;
        manager.root = list;

        if (promptManager) {
            promptManager.listElement = list;
        }

        return list;
    }

    return getPromptManagerListElement();
}

async function restorePromptManagerListAfterVueRemove() {
    const list = ensurePromptManagerListAfterVueHost();

    if (!(list instanceof HTMLElement) || !promptManager || typeof promptManager.renderPromptManagerListItems !== 'function') {
        return;
    }

    list.replaceChildren();

    try {
        await promptManager.renderPromptManagerListItems();
        restorePromptManagerDragAfterVueRemove();
    } catch (error) {
        console.debug(`${LOG_PREFIX} Failed to restore prompt manager list after Vue remove`, error);
    }
}

function restorePromptManagerDragAfterVueRemove() {
    if (isPresetGroupingEnabled()) {
        return;
    }

    const list = getPromptManagerListElement();

    if (settings.presetDragOptimizationEnabled) {
        patchPromptManagerDraggable();
        installPresetDragOptimizationHandlers();
        preparePromptManagerCustomDragList(list);
        return;
    }

    removePresetDragOptimizationHandlers();
    clearPromptManagerCustomDragList();
    restorePromptManagerStockDraggable();
}

function installPresetVuePromptListRenderPatch() {
    if (!promptManager || typeof promptManager.renderPromptManagerListItems !== 'function') {
        return false;
    }

    const existingPatch = extensionState[PRESET_VUE_LIST_RENDER_PATCH_KEY];

    if (existingPatch?.manager === promptManager && promptManager.renderPromptManagerListItems === existingPatch.patched) {
        return true;
    }

    if (promptManager.renderPromptManagerListItems.__baiBaiToolkitPresetVueListPatched) {
        extensionState[PRESET_VUE_LIST_RENDER_PATCH_KEY] = {
            manager: promptManager,
            original: promptManager.renderPromptManagerListItems.__baiBaiToolkitOriginalRenderPromptManagerListItems,
            patched: promptManager.renderPromptManagerListItems,
        };
        return true;
    }

    const originalRenderPromptManagerListItems = promptManager.renderPromptManagerListItems;
    const patchedRenderPromptManagerListItems = async function (...args) {
        if (!isPresetGroupingEnabled()) {
            if (settings.presetSwitchOptimizationEnabled && isPromptManagerReadyForFastPresetSwitch()) {
                await renderPromptManagerListItemsFast();
                schedulePromptManagerDraggableInit();
                return undefined;
            }

            return originalRenderPromptManagerListItems.apply(this, args);
        }

        await installPresetVuePromptListManager();
        syncPresetVuePromptListManagerState();
        const manager = getPresetVuePromptListManagerState();
        manager.lastRenderPatchSyncCycle = extensionState.presetPromptManagerFastRenderCycle || 0;
        preparePromptManagerCustomDragList(getPromptManagerListElement(), { signature: manager.lastStructureSignature });
        return undefined;
    };

    patchedRenderPromptManagerListItems.__baiBaiToolkitPresetVueListPatched = true;
    patchedRenderPromptManagerListItems.__baiBaiToolkitOriginalRenderPromptManagerListItems = originalRenderPromptManagerListItems;
    promptManager.renderPromptManagerListItems = patchedRenderPromptManagerListItems;
    extensionState[PRESET_VUE_LIST_RENDER_PATCH_KEY] = {
        manager: promptManager,
        original: originalRenderPromptManagerListItems,
        patched: patchedRenderPromptManagerListItems,
    };
    return true;
}

function removePresetVuePromptListRenderPatch() {
    const patch = extensionState[PRESET_VUE_LIST_RENDER_PATCH_KEY];

    if (!patch) {
        return;
    }

    if (patch.manager?.renderPromptManagerListItems === patch.patched) {
        patch.manager.renderPromptManagerListItems = patch.original;
    }

    delete extensionState[PRESET_VUE_LIST_RENDER_PATCH_KEY];
}

function installPresetPromptGroupGenerationGatePatch() {
    if (
        !promptManager
        || typeof promptManager.getPromptCollection !== 'function'
        || typeof promptManager.isPromptDisabledForActiveCharacter !== 'function'
    ) {
        return false;
    }

    const existingPatch = extensionState[PRESET_GROUP_GENERATION_GATE_PATCH_KEY];

    if (
        existingPatch?.manager === promptManager
        && promptManager.getPromptCollection === existingPatch.patchedGetPromptCollection
        && promptManager.isPromptDisabledForActiveCharacter === existingPatch.patchedIsPromptDisabledForActiveCharacter
    ) {
        return true;
    }

    if (
        promptManager.getPromptCollection[PRESET_GROUP_GENERATION_GATE_PATCH_KEY]
        && promptManager.isPromptDisabledForActiveCharacter[PRESET_GROUP_GENERATION_GATE_PATCH_KEY]
    ) {
        extensionState[PRESET_GROUP_GENERATION_GATE_PATCH_KEY] = {
            manager: promptManager,
            originalGetPromptCollection: promptManager.getPromptCollection.__baiBaiToolkitOriginalGetPromptCollection,
            patchedGetPromptCollection: promptManager.getPromptCollection,
            originalIsPromptDisabledForActiveCharacter: promptManager.isPromptDisabledForActiveCharacter.__baiBaiToolkitOriginalIsPromptDisabledForActiveCharacter,
            patchedIsPromptDisabledForActiveCharacter: promptManager.isPromptDisabledForActiveCharacter,
        };
        return true;
    }

    const originalGetPromptCollection = promptManager.getPromptCollection;
    const originalIsPromptDisabledForActiveCharacter = promptManager.isPromptDisabledForActiveCharacter;

    const patchedGetPromptCollection = function (...args) {
        if (!isPresetGroupingEnabled()) {
            return originalGetPromptCollection.apply(this, args);
        }

        const poweredOffPromptIds = getPresetPromptGroupPoweredOffPromptIds();

        if (!poweredOffPromptIds.size) {
            return originalGetPromptCollection.apply(this, args);
        }

        const restoreEntries = temporarilyDisablePresetPromptOrderEntriesForGroupGate(this, poweredOffPromptIds);

        try {
            const collection = originalGetPromptCollection.apply(this, args);
            patchPromptCollectionAddForPresetGroupGate(collection, poweredOffPromptIds);
            return collection;
        } finally {
            restorePresetPromptOrderEntriesForGroupGate(restoreEntries);
        }
    };

    const patchedIsPromptDisabledForActiveCharacter = function (...args) {
        const stockDisabled = originalIsPromptDisabledForActiveCharacter.apply(this, args);

        if (stockDisabled || !isPresetGroupingEnabled()) {
            return stockDisabled;
        }

        return isPresetPromptDisabledByGroupGate(args[0]);
    };

    patchedGetPromptCollection[PRESET_GROUP_GENERATION_GATE_PATCH_KEY] = true;
    patchedGetPromptCollection.__baiBaiToolkitOriginalGetPromptCollection = originalGetPromptCollection;
    patchedIsPromptDisabledForActiveCharacter[PRESET_GROUP_GENERATION_GATE_PATCH_KEY] = true;
    patchedIsPromptDisabledForActiveCharacter.__baiBaiToolkitOriginalIsPromptDisabledForActiveCharacter = originalIsPromptDisabledForActiveCharacter;

    promptManager.getPromptCollection = patchedGetPromptCollection;
    promptManager.isPromptDisabledForActiveCharacter = patchedIsPromptDisabledForActiveCharacter;
    extensionState[PRESET_GROUP_GENERATION_GATE_PATCH_KEY] = {
        manager: promptManager,
        originalGetPromptCollection,
        patchedGetPromptCollection,
        originalIsPromptDisabledForActiveCharacter,
        patchedIsPromptDisabledForActiveCharacter,
    };
    return true;
}

function removePresetPromptGroupGenerationGatePatch() {
    const patch = extensionState[PRESET_GROUP_GENERATION_GATE_PATCH_KEY];

    if (!patch) {
        return;
    }

    if (patch.manager?.getPromptCollection === patch.patchedGetPromptCollection) {
        patch.manager.getPromptCollection = patch.originalGetPromptCollection;
    }

    if (patch.manager?.isPromptDisabledForActiveCharacter === patch.patchedIsPromptDisabledForActiveCharacter) {
        patch.manager.isPromptDisabledForActiveCharacter = patch.originalIsPromptDisabledForActiveCharacter;
    }

    delete extensionState[PRESET_GROUP_GENERATION_GATE_PATCH_KEY];
}

function getPresetPromptGroupPoweredOffPromptIds(validPromptIds = getCurrentPresetPromptOrderIds()) {
    if (!isPresetGroupingEnabled() || !validPromptIds.length) {
        return new Set();
    }

    const validPromptIdSet = new Set(validPromptIds);
    const groupState = getPresetPromptGroupState();
    normalizePresetPromptGroupState(groupState, validPromptIdSet);
    const poweredOffGroupIds = new Set(
        groupState.groups
            .filter(group => group?.enabled === false)
            .map(group => group.id),
    );

    if (!poweredOffGroupIds.size) {
        return new Set();
    }

    const poweredOffPromptIds = new Set();

    for (const [promptId, meta] of Object.entries(groupState.prompts ?? {})) {
        if (validPromptIdSet.size && !validPromptIdSet.has(promptId)) {
            continue;
        }

        if (poweredOffGroupIds.has(meta?.groupId)) {
            poweredOffPromptIds.add(promptId);
        }
    }

    return poweredOffPromptIds;
}

function isPresetPromptDisabledByGroupGate(promptId) {
    if (!promptId) {
        return false;
    }

    return getPresetPromptGroupPoweredOffPromptIds().has(String(promptId));
}

function temporarilyDisablePresetPromptOrderEntriesForGroupGate(manager, promptIds) {
    const promptOrder = typeof manager?.getPromptOrderForCharacter === 'function'
        ? manager.getPromptOrderForCharacter(manager.activeCharacter)
        : [];
    const restoreEntries = [];

    for (const entry of promptOrder ?? []) {
        if (!entry?.identifier || !promptIds.has(entry.identifier) || entry.enabled === false) {
            continue;
        }

        restoreEntries.push({ entry, enabled: entry.enabled });
        entry.enabled = false;
    }

    return restoreEntries;
}

function restorePresetPromptOrderEntriesForGroupGate(restoreEntries) {
    for (const restoreEntry of restoreEntries ?? []) {
        if (restoreEntry?.entry) {
            restoreEntry.entry.enabled = restoreEntry.enabled;
        }
    }
}

function patchPromptCollectionAddForPresetGroupGate(collection, poweredOffPromptIds) {
    if (!collection || typeof collection.add !== 'function' || collection.add[PRESET_GROUP_GENERATION_GATE_PATCH_KEY]) {
        return collection;
    }

    const originalAdd = collection.add;
    const patchedAdd = function (...prompts) {
        const allowedPrompts = prompts.filter(prompt => !prompt?.identifier || !poweredOffPromptIds.has(prompt.identifier));

        if (!allowedPrompts.length) {
            return undefined;
        }

        return originalAdd.apply(this, allowedPrompts);
    };

    patchedAdd[PRESET_GROUP_GENERATION_GATE_PATCH_KEY] = true;
    patchedAdd.__baiBaiToolkitOriginalPromptCollectionAdd = originalAdd;
    collection.add = patchedAdd;
    return collection;
}

function createPresetVuePromptListModel() {
    return {
        globalLibrary: null,
        items: [],
        listClassName: `text_pole ${PRESET_DRAG_READY_CLASS}`,
        renderKey: 0,
        reclaimKey: 0,
        mountedGroupBodies: {},
        dragging: false,
        rangeSelection: {
            active: false,
            name: '',
            startId: null,
            endId: null,
            hoverId: null,
        },
    };
}

function syncPresetVuePromptListManagerState() {
    const manager = getPresetVuePromptListManagerState();

    if (!manager.state) {
        return false;
    }

    repairPresetPromptOrderDuplicatesIfNeeded();
    repairPresetPromptGroupStateIfNeeded();
    syncCurrentPresetPromptGroupStateToPresetExtensionField({ persist: false });

    const { renderSignature, structureSignature } = getPresetVuePromptListSyncSignatures(manager);
    if (renderSignature && manager.lastSyncSignature === renderSignature) {
        syncPresetVueGlobalLibrarySelectionState(manager.state);
        manager.lastStructureSignature = structureSignature;
        return true;
    }

    syncPresetVueGlobalLibraryModelState(manager.state);
    manager.state.items = buildPresetVuePromptListItems();
    syncPresetVuePromptGroupBodyMountState(manager.state);
    manager.lastSyncSignature = renderSignature;
    manager.lastStructureSignature = structureSignature;
    return true;
}

// 当某次结构变更已通过命令式方式就地同步到 DOM 与 Vue model 后,
// 调用此函数把签名基线推进到当前状态,使随后的 syncPresetVuePromptListManagerState
// 短路命中、不再触发整列重建。
function markPresetVuePromptListSyncSignatureCurrent() {
    const manager = getPresetVuePromptListManagerState();

    if (!manager.state) {
        return false;
    }

    const { renderSignature, structureSignature } = getPresetVuePromptListSyncSignatures(manager);
    manager.lastSyncSignature = renderSignature;
    manager.lastStructureSignature = structureSignature;
    return true;
}

// 「分组后把编辑按钮收进菜单」开关只影响条目控件的渲染位置(不改条目数据),
// 普通 sync 会因签名命中而短路,这里清空签名基线强制整列重渲染一次。仅在分组已挂载时生效。
function refreshPresetVuePromptListControlsLayout() {
    const manager = getPresetVuePromptListManagerState();

    if (!manager.state) {
        return;
    }

    manager.lastSyncSignature = '';
    syncPresetVuePromptListManagerState();
}

function getPresetVuePromptListSyncSignatures(manager = getPresetVuePromptListManagerState()) {
    const promptOrder = promptManager?.getPromptOrderForCharacter?.(promptManager.activeCharacter) ?? [];
    const prompts = Array.isArray(promptManager?.serviceSettings?.prompts)
        ? promptManager.serviceSettings.prompts.filter(Boolean)
        : [];
    const promptById = new Map(prompts.map(prompt => [prompt.identifier, prompt]));
    const groupState = getPresetPromptGroupState();
    const favoriteState = getCurrentPresetPromptFavoritesState(
        promptOrder.map(entry => entry?.identifier).filter(Boolean),
    );
    const toggleDisabled = promptManager?.configuration?.toggleDisabled ?? [];
    const overriddenPrompts = Array.isArray(promptManager?.overriddenPrompts) ? promptManager.overriddenPrompts : [];
    const promptParts = promptOrder.map((entry, index) => {
        const prompt = promptById.get(entry?.identifier);
        return [
            index,
            entry?.identifier || '',
            entry?.enabled === false ? 0 : 1,
            prompt?.name || '',
            prompt?.role || '',
            prompt?.marker ? 1 : 0,
            prompt?.system_prompt ? 1 : 0,
            prompt?.forbid_overrides ? 1 : 0,
            prompt?.injection_position ?? '',
            prompt?.injection_depth ?? '',
        ].join(':');
    });
    const groupSignature = JSON.stringify({
        groups: groupState.groups ?? [],
        prompts: groupState.prompts ?? {},
    });
    const favoriteSignature = JSON.stringify(favoriteState);
    const globalLibrarySignature = JSON.stringify({
        collapsed: Boolean(manager.globalLibraryCollapsed),
        loading: Boolean(manager.globalLibraryLoading),
        loaded: Boolean(manager.globalLibraryLoaded),
        error: manager.globalLibraryError ? String(manager.globalLibraryError) : '',
        groups: normalizePresetGlobalPromptLibraryGroups(manager.globalLibraryGroups)
            .map(group => [group.id || '', group.name || '', group.collapsed ? 1 : 0]),
        items: normalizePresetGlobalPromptLibraryItems(manager.globalLibraryItems)
            .map(item => [
                item.id || '',
                item.name || '',
                item.groupId || '',
                getStringHash(String(item.content ?? '')),
            ]),
    });
    const structureSignature = getStringHash([
        promptParts.join('|'),
        groupSignature,
        favoriteSignature,
        globalLibrarySignature,
        Array.from(toggleDisabled).join('|'),
        overriddenPrompts.join('|'),
    ].join('||'));
    // Token 数变化不再纳入 renderSignature:token 显示走命令式 DOM 更新
    // (updatePromptManagerTokenDisplay),避免每次 token 重算都重建整个 Vue 列表。
    const renderSignature = structureSignature;

    return { renderSignature, structureSignature };
}

function rebuildPresetVuePromptListDraggable() {
    const manager = getPresetVuePromptListManagerState();

    if (!manager.state) {
        return false;
    }

    manager.state.renderKey += 1;
    return true;
}

function isPresetVuePromptDragLocked() {
    return settings.presetVueDragLocked === true;
}

function togglePresetVuePromptDragLocked() {
    const nextLocked = !isPresetVuePromptDragLocked();
    settings.presetVueDragLocked = nextLocked;

    if (nextLocked) {
        cancelPromptManagerCustomDragPending();
        finishPromptManagerCustomDrag({ cancelled: true });
        cancelPresetVuePromptGroupHeaderCustomDrag(getPresetVuePromptListManagerState());
        setPresetVuePromptDragging(getPresetVuePromptListManagerState().state, false);
        getPresetVuePromptListManagerState().dragSnapshot = null;
    }

    rebuildPresetVuePromptListDraggable();

    if (typeof savePresetOptimizationSettings === 'function') {
        savePresetOptimizationSettings();
    }
}

function syncPresetVuePromptGroupBodyMountState(model) {
    if (!model || !Array.isArray(model.items)) {
        return;
    }

    if (!model.mountedGroupBodies || typeof model.mountedGroupBodies !== 'object') {
        model.mountedGroupBodies = {};
    }

    const manager = getPresetVuePromptListManagerState();
    const validGroupIds = new Set();
    const mountItems = [
        model.globalLibrary,
        ...model.items,
    ].filter(Boolean);

    for (const item of mountItems) {
        const mountId = getPresetVuePromptBodyMountId(item);

        if (!mountId) {
            continue;
        }

        validGroupIds.add(mountId);

        if (!item.collapsed) {
            clearPresetVuePromptGroupBodyUnmountTimer(manager, mountId);
            model.mountedGroupBodies[mountId] = true;
            continue;
        }

        if (!hasPresetVuePromptGroupBodyUnmountTimer(manager, mountId)) {
            delete model.mountedGroupBodies[mountId];
        }
    }

    for (const groupId of Object.keys(model.mountedGroupBodies)) {
        if (!validGroupIds.has(groupId)) {
            delete model.mountedGroupBodies[groupId];
            clearPresetVuePromptGroupBodyUnmountTimer(manager, groupId);
        }
    }
}

function getPresetVuePromptBodyMountId(item) {
    if (item?.type === 'group' && item.groupId) {
        return item.groupId;
    }

    if (item?.type === 'favorites') {
        return PRESET_VUE_FAVORITES_ENTRY_ID;
    }

    if (item?.type === 'global-library') {
        return PRESET_VUE_GLOBAL_LIBRARY_ENTRY_ID;
    }

    return null;
}

function getPresetVuePromptGroupBodyUnmountTimers(manager = getPresetVuePromptListManagerState()) {
    if (!(manager.groupBodyUnmountTimers instanceof Map)) {
        manager.groupBodyUnmountTimers = new Map();
    }

    return manager.groupBodyUnmountTimers;
}

function hasPresetVuePromptGroupBodyUnmountTimer(manager, groupId) {
    return manager.groupBodyUnmountTimers instanceof Map && manager.groupBodyUnmountTimers.has(groupId);
}

function clearPresetVuePromptGroupBodyUnmountTimer(manager, groupId) {
    if (!(manager.groupBodyUnmountTimers instanceof Map)) {
        return;
    }

    const timer = manager.groupBodyUnmountTimers.get(groupId);

    if (timer) {
        clearTimeout(timer);
    }

    manager.groupBodyUnmountTimers.delete(groupId);
}

function clearPresetVuePromptGroupBodyUnmountTimers(manager = getPresetVuePromptListManagerState()) {
    if (!(manager.groupBodyUnmountTimers instanceof Map)) {
        return;
    }

    for (const timer of manager.groupBodyUnmountTimers.values()) {
        clearTimeout(timer);
    }

    manager.groupBodyUnmountTimers.clear();
}

function setPresetVuePromptGroupBodyMounted(model, groupId, mounted) {
    if (!model || !groupId) {
        return;
    }

    if (!model.mountedGroupBodies || typeof model.mountedGroupBodies !== 'object') {
        model.mountedGroupBodies = {};
    }

    if (mounted) {
        model.mountedGroupBodies[groupId] = true;
        return;
    }

    delete model.mountedGroupBodies[groupId];
}

// 展开/收起的高度动画改为纯 CSS 驱动(grid-template-rows: 0fr↔1fr,见样式表)。
// 这里只负责执行状态变更(mount/collapsed 切换),动画交给浏览器,
// 避免 JS 用 WAAPI 对 body 跑 height 动画时触发的合成层漏绘 bug(展开后空白)。
function runPresetVuePromptBodyHeightTransition(mountId, expanding, mutator) {
    if (typeof mutator !== 'function') {
        return undefined;
    }

    return mutator();
}

// 保留为安全空操作:外部(卸载、开始拖拽)仍会调用它,纯 CSS 方案下无需取消任何 JS 动画。
function cancelPresetVuePromptBodyHeightAnimations() {
}


function isPresetVuePromptGroupBodyMounted(model, item) {
    const mountId = getPresetVuePromptBodyMountId(item);

    if (!mountId) {
        return false;
    }

    return item.collapsed
        ? Boolean(model?.mountedGroupBodies?.[mountId])
        : true;
}

function schedulePresetVuePromptGroupBodyUnmount(groupId) {
    const manager = getPresetVuePromptListManagerState();
    const model = manager.state;

    if (!model || !groupId) {
        return;
    }

    clearPresetVuePromptGroupBodyUnmountTimer(manager, groupId);

    const timer = setTimeout(() => {
        clearPresetVuePromptGroupBodyUnmountTimer(manager, groupId);

        const groupItem = [
            model.globalLibrary,
            ...(model.items ?? []),
        ].find(item => getPresetVuePromptBodyMountId(item) === groupId);

        if (!groupItem || groupItem.collapsed) {
            setPresetVuePromptGroupBodyMounted(model, groupId, false);
        }
    }, PRESET_VUE_COLLAPSE_ANIMATION_MS);

    getPresetVuePromptGroupBodyUnmountTimers(manager).set(groupId, timer);
}

function repairPresetPromptOrderDuplicatesIfNeeded() {
    if (!isPromptManagerReadyForCustomDrag()) {
        return false;
    }

    const promptOrder = promptManager.getPromptOrderForCharacter(promptManager.activeCharacter) ?? [];
    const seenPromptIds = new Set();
    const repairedPromptOrder = [];
    let changed = false;

    for (const entry of promptOrder) {
        const identifier = entry?.identifier;

        if (!identifier) {
            changed = true;
            continue;
        }

        if (seenPromptIds.has(identifier)) {
            changed = true;
            continue;
        }

        seenPromptIds.add(identifier);
        repairedPromptOrder.push(entry);
    }

    if (!changed) {
        return false;
    }

    promptManager.removePromptOrderForCharacter(promptManager.activeCharacter);
    promptManager.addPromptOrderForCharacter(promptManager.activeCharacter, repairedPromptOrder);
    markPresetPromptServiceSettingsSavePending();
    return true;
}

function repairPresetPromptGroupStateIfNeeded() {
    if (!isPromptManagerReadyForCustomDrag()) {
        return false;
    }

    const groupState = getPresetPromptGroupState();
    const validPromptIds = new Set(
        (promptManager.getPromptOrderForCharacter(promptManager.activeCharacter) ?? [])
            .map(entry => entry?.identifier)
            .filter(Boolean),
    );
    const before = JSON.stringify({
        groups: groupState.groups,
        prompts: groupState.prompts,
    });

    normalizePresetPromptGroupState(groupState, validPromptIds);

    const after = JSON.stringify({
        groups: groupState.groups,
        prompts: groupState.prompts,
    });

    if (before === after) {
        return false;
    }

    savePresetPromptGroupSettings();
    return true;
}

function getPresetGlobalLibrarySelectedIds(manager = getPresetVuePromptListManagerState()) {
    if (!(manager.globalLibrarySelectedIds instanceof Set)) {
        manager.globalLibrarySelectedIds = new Set();
    }

    return manager.globalLibrarySelectedIds;
}

function buildPresetVueGlobalLibraryItem() {
    const manager = getPresetVuePromptListManagerState();
    const items = normalizePresetGlobalPromptLibraryItems(manager.globalLibraryItems);
    const groups = normalizePresetGlobalPromptLibraryGroups(manager.globalLibraryGroups);
    const validGroupIds = new Set(groups.map(group => group.id));
    const selectedIds = getPresetGlobalLibrarySelectedIds(manager);
    const selecting = Boolean(manager.globalLibrarySelecting);
    const ungrouped = [];
    const childrenByGroupId = new Map(groups.map(group => [group.id, []]));
    let selectedCount = 0;

    for (const item of items) {
        const groupId = item.groupId && validGroupIds.has(item.groupId) ? item.groupId : null;
        const selected = selectedIds.has(item.id);
        const node = {
            id: item.id,
            name: item.name,
            content: item.content,
            groupId,
            type: 'global-library-prompt',
            selecting,
            selected,
        };

        if (selected) {
            selectedCount += 1;
        }

        if (groupId) {
            childrenByGroupId.get(groupId)?.push(node);
        } else {
            ungrouped.push(node);
        }
    }

    const groupNodes = groups.map(group => {
        const children = childrenByGroupId.get(group.id) ?? [];

        return {
            id: `global-library-group:${group.id}`,
            type: 'global-library-group',
            groupId: group.id,
            name: group.name,
            collapsed: Boolean(group.collapsed),
            count: children.length,
            children,
        };
    });

    return {
        id: PRESET_VUE_GLOBAL_LIBRARY_ENTRY_ID,
        type: 'global-library',
        count: items.length,
        selecting,
        selectedCount,
        collapsed: Boolean(manager.globalLibraryCollapsed),
        loading: Boolean(manager.globalLibraryLoading),
        error: manager.globalLibraryError ? String(manager.globalLibraryError) : '',
        hasGroups: groupNodes.length > 0,
        ungrouped,
        groups: groupNodes,
    };
}

function syncPresetVueGlobalLibraryModelState(model) {
    if (!model) {
        return;
    }

    const nextLibrary = buildPresetVueGlobalLibraryItem();

    if (!model.globalLibrary) {
        model.globalLibrary = nextLibrary;
        return;
    }

    const library = model.globalLibrary;
    library.id = nextLibrary.id;
    library.type = nextLibrary.type;
    library.count = nextLibrary.count;
    library.selecting = nextLibrary.selecting;
    library.selectedCount = nextLibrary.selectedCount;
    library.collapsed = nextLibrary.collapsed;
    library.loading = nextLibrary.loading;
    library.error = nextLibrary.error;
    library.hasGroups = nextLibrary.hasGroups;
    library.ungrouped = syncPresetVueGlobalLibraryNodeList(library.ungrouped, nextLibrary.ungrouped);
    library.groups = syncPresetVueGlobalLibraryGroupList(library.groups, nextLibrary.groups);
}

function syncPresetVueGlobalLibraryNodeList(currentList, nextList) {
    const currentById = new Map(
        (Array.isArray(currentList) ? currentList : [])
            .filter(item => item?.id)
            .map(item => [item.id, item]),
    );
    const synced = nextList.map(nextItem => {
        const currentItem = currentById.get(nextItem.id);

        if (!currentItem) {
            return nextItem;
        }

        currentItem.name = nextItem.name;
        currentItem.content = nextItem.content;
        currentItem.groupId = nextItem.groupId;
        currentItem.type = nextItem.type;
        currentItem.selecting = nextItem.selecting;
        currentItem.selected = nextItem.selected;
        return currentItem;
    });

    if (Array.isArray(currentList)) {
        currentList.splice(0, currentList.length, ...synced);
        return currentList;
    }

    return synced;
}

function syncPresetVueGlobalLibraryGroupList(currentList, nextList) {
    const currentById = new Map(
        (Array.isArray(currentList) ? currentList : [])
            .filter(group => group?.groupId)
            .map(group => [group.groupId, group]),
    );
    const synced = nextList.map(nextGroup => {
        const currentGroup = currentById.get(nextGroup.groupId);

        if (!currentGroup) {
            return nextGroup;
        }

        currentGroup.id = nextGroup.id;
        currentGroup.type = nextGroup.type;
        currentGroup.groupId = nextGroup.groupId;
        currentGroup.name = nextGroup.name;
        currentGroup.collapsed = nextGroup.collapsed;
        currentGroup.count = nextGroup.count;
        currentGroup.children = syncPresetVueGlobalLibraryNodeList(currentGroup.children, nextGroup.children);
        return currentGroup;
    });

    if (Array.isArray(currentList)) {
        currentList.splice(0, currentList.length, ...synced);
        return currentList;
    }

    return synced;
}

function syncPresetVueGlobalLibrarySelectionState(model = getPresetVuePromptListManagerState().state) {
    const library = model?.globalLibrary;

    if (!library) {
        return false;
    }

    const manager = getPresetVuePromptListManagerState();
    const selectedIds = getPresetGlobalLibrarySelectedIds(manager);
    const selecting = Boolean(manager.globalLibrarySelecting);
    let selectedCount = 0;
    const syncNode = node => {
        if (!node?.id) {
            return;
        }

        const selected = selectedIds.has(node.id);
        node.selecting = selecting;
        node.selected = selected;

        if (selected) {
            selectedCount += 1;
        }
    };

    for (const node of library.ungrouped ?? []) {
        syncNode(node);
    }

    for (const group of library.groups ?? []) {
        for (const node of group.children ?? []) {
            syncNode(node);
        }
    }

    library.selecting = selecting;
    library.selectedCount = selectedCount;
    return true;
}

function buildPresetVuePromptListItems() {
    const promptOrder = promptManager.getPromptOrderForCharacter?.(promptManager.activeCharacter) ?? [];
    const promptOrderIds = promptOrder.map(entry => entry?.identifier).filter(Boolean);
    const prompts = Array.isArray(promptManager.serviceSettings?.prompts)
        ? promptManager.serviceSettings.prompts.filter(Boolean)
        : [];
    const promptById = new Map(prompts.map(prompt => [prompt.identifier, prompt]));
    const groupState = getPresetPromptGroupState();
    normalizePresetPromptGroupState(groupState, new Set(promptOrderIds));
    const groupsById = new Map(groupState.groups.map(group => [group.id, group]));
    const favoriteState = getCurrentPresetPromptFavoritesState(promptOrderIds);
    const favoritePromptIds = new Set(favoriteState.promptIds);
    const counts = promptManager.tokenHandler?.getCounts?.() ?? {};
    const tokenBudget = promptManager.serviceSettings.openai_max_context - promptManager.serviceSettings.openai_max_tokens;
    const isTokenUsageWarning = promptManager.tokenUsage > tokenBudget * 0.8;
    const promptItems = promptOrder
        .map((orderEntry, index) => {
            const prompt = promptById.get(orderEntry?.identifier);

            if (!prompt?.identifier) {
                return null;
            }

            const listEntry = promptManager.getPromptOrderEntry?.(promptManager.activeCharacter, prompt.identifier) ?? orderEntry;
            const groupId = groupState.prompts?.[prompt.identifier]?.groupId;
            const group = groupsById.get(groupId) ?? null;
            const tokens = counts[prompt.identifier] ?? 0;
            const { warningClass, warningTitle } = getPromptTokenWarning({
                prompt,
                tokens,
                isTokenUsageWarning,
            });

            return {
                id: prompt.identifier,
                type: 'prompt',
                groupId: group?.id ?? null,
                prompt,
                orderEntry: listEntry,
                enabled: listEntry?.enabled !== false,
                favorite: favoritePromptIds.has(prompt.identifier),
                tokens,
                calculatedTokens: tokens ? String(tokens) : '-',
                warningClass,
                warningTitle,
                index,
            };
        })
        .filter(Boolean);

    const favoriteChildren = promptItems
        .filter(item => item.favorite)
        .map(item => ({
            ...item,
            favoriteMirror: true,
        }));
    const items = [
        { id: PRESET_VUE_HEADER_ENTRY_ID, type: 'header' },
        { id: PRESET_VUE_SEPARATOR_ENTRY_ID, type: 'separator' },
    ];

    if (favoriteChildren.length > 0) {
        items.push({
            id: PRESET_VUE_FAVORITES_ENTRY_ID,
            type: 'favorites',
            count: favoriteChildren.length,
            collapsed: Boolean(favoriteState.collapsed),
            children: favoriteChildren,
        });
    }

    const groupItemsById = new Map();

    for (const item of promptItems) {
        if (item.groupId) {
            const group = groupsById.get(item.groupId);
            let groupItem = groupItemsById.get(item.groupId);

            if (!groupItem) {
                groupItem = {
                    id: `group:${item.groupId}`,
                    type: 'group',
                    groupId: item.groupId,
                    group,
                    name: group?.name ?? t`未命名分组`,
                    collapsed: Boolean(group?.collapsed),
                    enabled: group?.enabled !== false,
                    count: 0,
                    children: [],
                };
                groupItemsById.set(item.groupId, groupItem);
                items.push(groupItem);
            }

            groupItem.children.push(item);
            groupItem.count = groupItem.children.length;
            continue;
        }

        items.push(item);
    }

    return items;
}

function createPresetVuePromptListRootComponent(vue, vueDraggableNext, model) {
    const { h } = vue;

    return {
        name: 'BaiBaiPresetPromptListRoot',
        render() {
            return [
                renderPresetVuePromptGlobalLibrary(h, vueDraggableNext, model.globalLibrary, { outsideList: true }),
                renderPresetVuePromptDraggable(h, vueDraggableNext, model),
            ];
        },
    };
}

function renderPresetVuePromptListHeader(h, model) {
    const prefix = promptManager?.configuration?.prefix ?? '';
    const selecting = Boolean(model?.rangeSelection?.active);
    const dragLocked = isPresetVuePromptDragLocked();

    return h('li', { class: `${prefix}prompt_manager_list_head`, key: 'header' }, [
        h('span', {
            class: PRESET_EFFECTIVE_TOKEN_HEADER_CLASS,
            title: PRESET_EFFECTIVE_TOKEN_HEADER_TITLE,
        }, formatPresetEffectiveTokenHeaderText(calculatePresetEffectivePromptTokenTotal())),
        h('span', { class: 'bai-bai-preset-list-head-actions' }, [
            selecting
                ? h('span', {
                    class: 'menu_button fa-solid fa-xmark',
                    title: t`取消分组选择`,
                    onClick: event => {
                        event.preventDefault();
                        event.stopPropagation();
                        cancelPresetVuePromptGroupRangeSelection(model);
                    },
                })
                : h('span', {
                    class: 'menu_button fa-solid fa-folder-plus',
                    title: t`创建预设分组`,
                    onClick: event => {
                        event.preventDefault();
                        event.stopPropagation();
                        void startPresetVuePromptGroupRangeSelection(model);
                    },
                }),
            h('span', {
                class: [
                    'menu_button',
                    'fa-solid',
                    dragLocked ? 'fa-lock' : 'fa-lock-open',
                    'bai-bai-preset-drag-lock-toggle',
                    dragLocked ? 'bai-bai-preset-drag-lock-toggle-active' : '',
                ],
                title: dragLocked ? t`解锁预设拖拽` : t`锁定预设拖拽`,
                'aria-pressed': dragLocked ? 'true' : 'false',
                onClick: event => {
                    event.preventDefault();
                    event.stopPropagation();
                    togglePresetVuePromptDragLocked();
                },
            }),
        ]),
    ]);
}

function renderPresetVuePromptListSeparator(h) {
    const prefix = promptManager?.configuration?.prefix ?? '';

    return h('li', { class: `${prefix}prompt_manager_list_separator`, key: 'separator' }, [
        h('hr'),
    ]);
}

function renderPresetVuePromptDraggable(h, vueDraggableNext, model) {
    const handleSelector = getPresetVuePromptDragHandleSelector();
    const dragLocked = isPresetVuePromptDragLocked();
    const rangeSelecting = Boolean(model?.rangeSelection?.active);
    const dragDisabled = dragLocked || rangeSelecting;
    const draggableProps = {
        tag: 'ul',
        id: PRESET_PROMPT_MANAGER_LIST_SELECTOR.slice(1),
        class: [
            model.listClassName,
            dragLocked ? 'bai-bai-preset-drag-locked' : '',
        ],
        list: model.items,
        group: {
            name: 'bai-bai-preset-prompts',
            pull: !dragDisabled,
            put: dragDisabled ? false : canPutPresetVuePromptIntoTopLevelList,
        },
        draggable: PRESET_VUE_TOP_LEVEL_DRAGGABLE_SELECTOR,
        filter: PRESET_DRAG_INTERACTIVE_SELECTOR,
        preventOnFilter: false,
        sort: false,
        disabled: dragDisabled,
        animation: 0,
        emptyInsertThreshold: PRESET_VUE_EMPTY_INSERT_THRESHOLD_PX,
        dragoverBubble: false,
        bubbleScroll: false,
        forceFallback: true,
        fallbackOnBody: true,
        fallbackClass: 'bai-bai-preset-vue-sortable-fallback',
        ghostClass: 'bai-bai-preset-vue-sortable-ghost',
        chosenClass: 'bai-bai-preset-vue-sortable-chosen',
        dragClass: 'bai-bai-preset-vue-sortable-drag',
        move: isPresetVuePromptTopLevelDragMoveAllowed,
        onChoose: () => {
            closePresetPromptActionMenus();
        },
        key: `draggable-${model.renderKey}`,
        onStart: event => beginPresetVuePromptManualDrag(model, event),
        onEnd: event => {
            const manager = getPresetVuePromptListManagerState();
            manager.lastDragEndedAt = Date.now();
            const manualDrop = finishPresetVuePromptManualDrag(model, event);
            setPresetVuePromptDragging(model, false);
            manager.draggedPromptId = null;
            manager.draggedItem = null;
            manager.currentDropTargetGroupId = null;
            manager.currentTopLevelDropIndex = null;
            const modelChanged = consumePresetVuePromptDragChange(model);
            if (manualDrop || modelChanged) {
                schedulePresetVuePromptOrderSaveAfterDrop();
            }
        },
    };
    applyPresetVueDragGestureOptions(draggableProps);

    if (handleSelector) {
        draggableProps.handle = handleSelector;
    }

    return h(vueDraggableNext.VueDraggableNext, draggableProps, {
        default: () => model.items.map(item => renderPresetVuePromptEntry(h, vueDraggableNext, item)),
    });
}

function isPresetVuePromptTopLevelDragMoveAllowed(event, originalEvent) {
    const manager = getPresetVuePromptListManagerState();

    if (isPresetVuePromptDragLocked()) {
        clearPresetVuePromptManualDragPlacement(manager);
        return false;
    }

    if (manager.state?.rangeSelection?.active) {
        clearPresetVuePromptManualDragPlacement(manager);
        return false;
    }

    const dragged = manager.draggedItem ?? event?.draggedContext?.element;

    if (dragged?.type !== 'prompt' && dragged?.type !== 'group') {
        clearPresetVuePromptManualDragPlacement(manager);
        return false;
    }

    updatePresetVuePromptManualDragPlacementFromEvent(originalEvent ?? event?.originalEvent ?? event);
    return false;
}

function isPresetVuePromptGroupDragMoveAllowed(event, originalEvent) {
    const manager = getPresetVuePromptListManagerState();

    if (isPresetVuePromptDragLocked()) {
        clearPresetVuePromptManualDragPlacement(manager);
        return false;
    }

    if (manager.state?.rangeSelection?.active) {
        clearPresetVuePromptManualDragPlacement(manager);
        return false;
    }

    const dragged = manager.draggedItem ?? event?.draggedContext?.element;

    if (dragged?.type !== 'prompt') {
        clearPresetVuePromptManualDragPlacement(manager);
        return false;
    }

    updatePresetVuePromptManualDragPlacementFromEvent(originalEvent ?? event?.originalEvent ?? event);
    return false;
}

function canPutPresetVuePromptIntoGroupList(to, from, dragElement) {
    if (isPresetVuePromptDragLocked()) {
        return false;
    }

    return dragElement instanceof HTMLElement && dragElement.matches('li.completion_prompt_manager_prompt_draggable');
}

function canPutPresetVuePromptIntoTopLevelList(to, from, dragElement) {
    if (isPresetVuePromptDragLocked()) {
        return false;
    }

    if (!(to instanceof HTMLElement) || to.id !== PRESET_PROMPT_MANAGER_LIST_SELECTOR.slice(1)) {
        return false;
    }

    if (!(dragElement instanceof HTMLElement)) {
        return false;
    }

    return dragElement.matches('li.completion_prompt_manager_prompt_draggable')
        || dragElement.matches(`li.${PRESET_VUE_TOP_LEVEL_DRAGGABLE_CLASS}`);
}

function setPresetVuePromptDropTargetFromList(listElement) {
    const target = listElement instanceof HTMLElement
        ? listElement.closest('.bai-bai-preset-group')
        : null;

    setPresetVuePromptDropTarget(target);
}

function setPresetVuePromptDropTarget(target) {
    const manager = getPresetVuePromptListManagerState();
    const currentTarget = manager.currentDropTargetElement instanceof HTMLElement
        ? manager.currentDropTargetElement
        : null;

    if (currentTarget === target) {
        manager.currentDropTargetGroupId = target instanceof HTMLElement
            ? target.dataset.presetGroupId || null
            : null;
        return;
    }

    clearPresetVuePromptDropTarget();

    if (target instanceof HTMLElement) {
        target.classList.add(PRESET_VUE_GROUP_DROP_TARGET_CLASS);
        manager.currentDropTargetElement = target;
        manager.currentDropTargetGroupId = target.dataset.presetGroupId || null;
    }
}

function getPresetVuePromptNestedGroupDropTargetFromMoveEvent(event, originalEvent) {
    const to = event?.to;

    if (!(to instanceof HTMLElement) || to.id !== PRESET_PROMPT_MANAGER_LIST_SELECTOR.slice(1)) {
        return null;
    }

    return getPresetVuePromptGroupDropTargetAtPoint(getPresetDragPoint(originalEvent ?? event?.originalEvent));
}

function getPresetVuePromptExpandedGroupDropTargetAtPoint(point) {
    if (!point) {
        return null;
    }

    const candidates = [];
    const margin = PRESET_VUE_EMPTY_INSERT_THRESHOLD_PX;

    for (const group of document.querySelectorAll(`${PRESET_PROMPT_MANAGER_LIST_SELECTOR} .bai-bai-preset-group:not(.bai-bai-preset-group-collapsed)`)) {
        if (!(group instanceof HTMLElement)) {
            continue;
        }

        const surface = group.querySelector('.bai-bai-preset-group-list, .bai-bai-preset-group-body');

        if (!(surface instanceof HTMLElement)) {
            continue;
        }

        const rect = surface.getBoundingClientRect();
        const left = rect.left - margin;
        const right = rect.right + margin;
        const top = rect.top - margin / 2;
        const bottom = rect.bottom + margin;

        if (point.clientX < left || point.clientX > right || point.clientY < top || point.clientY > bottom) {
            continue;
        }

        const verticalDistance = point.clientY < rect.top
            ? rect.top - point.clientY
            : point.clientY > rect.bottom
                ? point.clientY - rect.bottom
                : 0;

        candidates.push({ group, verticalDistance });
    }

    candidates.sort((left, right) => left.verticalDistance - right.verticalDistance);
    return candidates[0]?.group ?? null;
}

function getPresetVuePromptGroupDropTargetAtPoint(point) {
    const strictTarget = getPresetVuePromptStrictGroupDropTargetAtPoint(point);

    if (strictTarget) {
        return strictTarget;
    }

    return getPresetVuePromptExpandedGroupDropTargetAtPoint(point);
}

function getPresetVuePromptStrictGroupDropTargetAtPoint(point) {
    if (!point) {
        return null;
    }

    const elements = typeof document.elementsFromPoint === 'function'
        ? document.elementsFromPoint(point.clientX, point.clientY)
        : [document.elementFromPoint(point.clientX, point.clientY)].filter(Boolean);

    for (const element of elements) {
        if (!(element instanceof Element)) {
            continue;
        }

        if (element.closest('.bai-bai-preset-vue-sortable-fallback, .bai-bai-preset-vue-sortable-drag')) {
            continue;
        }

        const surface = element.closest(PRESET_VUE_GROUP_DROP_SURFACE_SELECTOR);
        const group = surface instanceof HTMLElement
            ? surface.closest('.bai-bai-preset-group')
            : null;

        if (group instanceof HTMLElement && !group.classList.contains('bai-bai-preset-group-collapsed')) {
            return group;
        }
    }

    return null;
}

function clearPresetVuePromptDropTarget() {
    const manager = getPresetVuePromptListManagerState();
    manager.currentDropTargetGroupId = null;

    if (manager.currentDropTargetElement instanceof HTMLElement) {
        manager.currentDropTargetElement.classList.remove(PRESET_VUE_GROUP_DROP_TARGET_CLASS);
        manager.currentDropTargetElement = null;
    }
}

function getPresetVuePromptIdFromDragEvent(event) {
    const item = event?.item;

    if (!(item instanceof HTMLElement)) {
        return null;
    }

    return item.dataset.pmIdentifier || null;
}

function beginPresetVuePromptManualDrag(model, event) {
    return beginPresetVuePromptManualDragWithItem(model, getPresetVuePromptDragItemFromEvent(event), event?.originalEvent ?? event);
}

function beginPresetVuePromptManualDragWithItem(model, draggedItem, event) {
    const manager = getPresetVuePromptListManagerState();
    const list = getPromptManagerListElement();

    if (isPresetVuePromptDragLocked() || !model || !draggedItem) {
        return false;
    }

    manager.groupHeaderGesture = null;
    manager.currentTopLevelDropIndex = null;
    manager.currentDropTargetGroupId = null;
    manager.currentDropTargetElement = null;
    manager.draggedItem = draggedItem;
    manager.draggedPromptId = manager.draggedItem?.type === 'prompt' ? manager.draggedItem.id : null;
    manager.dragLayoutCache = createPresetVuePromptManualDragLayoutCache(model, manager.draggedItem);
    manager.dragScrollContainer = list instanceof HTMLElement
        ? getPromptManagerDragScrollContainer(list)
        : document.scrollingElement;
    manager.lastDragStartedAt = Date.now();
    showPresetVuePromptDragReadyFeedback(manager, { notify: false });
    setPresetVuePromptDragging(model, true);
    notifyPresetVuePromptDragStarted();
    capturePresetVuePromptDragSnapshot(model);
    startPresetVuePromptManualDragPlacementListeners(manager);
    updatePresetVuePromptManualDragPlacementFromEvent(event);
    return true;
}

function finishPresetVuePromptManualDrag(model, event = null) {
    const manager = getPresetVuePromptListManagerState();
    const point = getPresetDragPoint(event?.originalEvent ?? event);

    if (point) {
        manager.lastDragPoint = point;
        updatePresetVuePromptManualDragPlacement(model, point);
    }

    const placement = manager.dragPlacement;
    const changed = applyPresetVuePromptManualDrop(model, placement);

    clearPresetVuePromptManualDragState(manager);
    return changed;
}

function getPresetVuePromptDragItemFromEvent(event) {
    const item = event?.item;
    const contextElement = event?.draggedContext?.element;

    if (item instanceof HTMLElement) {
        if (item.classList.contains('bai-bai-preset-group') && item.dataset.presetGroupId) {
            return { type: 'group', id: item.dataset.presetGroupId };
        }

        if (item.dataset.pmIdentifier) {
            return { type: 'prompt', id: item.dataset.pmIdentifier };
        }
    }

    if (contextElement?.type === 'group' && contextElement.groupId) {
        return { type: 'group', id: contextElement.groupId };
    }

    if (contextElement?.type === 'prompt' && contextElement.id) {
        return { type: 'prompt', id: contextElement.id };
    }

    return null;
}

function startPresetVuePromptManualDragPlacementListeners(manager = getPresetVuePromptListManagerState()) {
    stopPresetVuePromptManualDragPlacementListeners();

    const pointermove = event => updatePresetVuePromptManualDragPlacementFromEvent(event);
    const mousemove = event => {
        if (manager.draggedItem) {
            updatePresetVuePromptManualDragPlacementFromEvent(event);
        }
    };
    const touchmove = event => updatePresetVuePromptManualDragPlacementFromEvent(event);

    document.addEventListener('pointermove', pointermove, true);
    document.addEventListener('mousemove', mousemove, true);
    document.addEventListener('touchmove', touchmove, { capture: true, passive: true });
    extensionState[PRESET_VUE_DRAG_PLACEMENT_LISTENER_KEY] = { pointermove, mousemove, touchmove };
}

function stopPresetVuePromptManualDragPlacementListeners() {
    const listeners = extensionState[PRESET_VUE_DRAG_PLACEMENT_LISTENER_KEY];

    if (!listeners) {
        return;
    }

    document.removeEventListener('pointermove', listeners.pointermove, true);
    document.removeEventListener('mousemove', listeners.mousemove, true);
    document.removeEventListener('touchmove', listeners.touchmove, true);
    delete extensionState[PRESET_VUE_DRAG_PLACEMENT_LISTENER_KEY];
}

function updatePresetVuePromptManualDragPlacementFromEvent(event) {
    const point = getPresetDragPoint(event);
    const manager = getPresetVuePromptListManagerState();

    if (!point) {
        return false;
    }

    manager.lastDragPoint = point;
    schedulePresetVuePromptManualDragPlacementFrame(manager);
    return true;
}

function schedulePresetVuePromptManualDragPlacementFrame(manager = getPresetVuePromptListManagerState()) {
    if (manager.dragPlacementFrame) {
        return;
    }

    manager.dragPlacementFrame = requestAnimationFrame(() => {
        manager.dragPlacementFrame = null;
        updatePresetVuePromptManualDragPlacement(manager.state, manager.lastDragPoint);
        schedulePresetVuePromptManualDragAutoScroll(manager);
    });
}

function updatePresetVuePromptManualDragPlacement(model, point) {
    const manager = getPresetVuePromptListManagerState();
    const draggedItem = manager.draggedItem;

    if (!model || !point || !draggedItem) {
        clearPresetVuePromptManualDragPlacement(manager);
        return false;
    }

    const placement = getPresetVuePromptManualDragPlacementAtPoint(model, draggedItem, point);

    if (!placement) {
        clearPresetVuePromptManualDragPlacement(manager);
        return false;
    }

    manager.dragPlacement = placement;
    manager.currentTopLevelDropIndex = placement.targetType === 'top-level' ? placement.index : null;

    if (placement.targetType === 'group') {
        setPresetVuePromptDropTarget(placement.groupElement);
    } else {
        clearPresetVuePromptDropTarget();
    }

    updatePresetVuePromptManualDragIndicator(manager, placement);
    return true;
}

function getPresetVuePromptManualDragPlacementAtPoint(model, draggedItem, point) {
    const layout = getPresetVuePromptManualDragLayoutCache(model, draggedItem);

    if (!layout) {
        return null;
    }

    if (draggedItem.type === 'prompt') {
        const groupPlacement = getPresetVuePromptManualGroupDropPlacementAtPoint(model, draggedItem, point, layout);

        if (groupPlacement) {
            return groupPlacement;
        }
    }

    return getPresetVuePromptManualTopLevelDropPlacementAtPoint(model, draggedItem, point, layout);
}

function getPresetVuePromptManualGroupDropPlacementAtPoint(model, draggedItem, point, layout) {
    const groupLayout = getPresetVuePromptManualGroupLayoutAtPoint(layout, point);
    const groupElement = groupLayout?.groupElement;
    const groupId = groupLayout?.groupId ?? null;

    if (!groupId || !(groupElement instanceof HTMLElement)) {
        return null;
    }

    const groupItem = getPresetVuePromptGroupItem(model, groupId);

    if (!groupItem) {
        return null;
    }

    const index = getPresetVuePromptManualDropIndexFromLayout(groupLayout, point);

    return {
        targetType: 'group',
        groupId,
        groupElement,
        containerElement: groupLayout.containerElement,
        containerRect: groupLayout.containerRect,
        children: groupLayout.children,
        index,
        indicatorRect: getPresetVuePromptManualIndicatorRectFromLayout(groupLayout, index),
        draggedItem,
    };
}

function getPresetVuePromptManualTopLevelDropPlacementAtPoint(model, draggedItem, point, layout) {
    const topLayout = layout?.topLevel;

    if (!topLayout) {
        return null;
    }

    const rect = topLayout.containerRect;
    const margin = PRESET_VUE_EMPTY_INSERT_THRESHOLD_PX;

    if (
        point.clientX < rect.left - margin
        || point.clientX > rect.right + margin
        || point.clientY < rect.top - margin
        || point.clientY > rect.bottom + margin
    ) {
        return null;
    }

    const index = getPresetVuePromptManualDropIndexFromLayout(topLayout, point, {
        minIndex: getPresetVuePromptTopLevelContentStartIndex(model),
    });

    return {
        targetType: 'top-level',
        containerElement: topLayout.containerElement,
        containerRect: topLayout.containerRect,
        children: topLayout.children,
        index,
        indicatorRect: getPresetVuePromptManualIndicatorRectFromLayout(topLayout, index),
        draggedItem,
    };
}

function getPresetVuePromptManualDragLayoutCache(model, draggedItem) {
    const manager = getPresetVuePromptListManagerState();
    const cache = manager.dragLayoutCache;

    if (
        cache
        && cache.draggedItem?.type === draggedItem?.type
        && cache.draggedItem?.id === draggedItem?.id
        && getPresetVuePromptManualDragLayoutScrollSignature(cache) === cache.scrollSignature
    ) {
        return cache;
    }

    manager.dragLayoutCache = createPresetVuePromptManualDragLayoutCache(model, draggedItem);
    return manager.dragLayoutCache;
}

function createPresetVuePromptManualDragLayoutCache(model, draggedItem) {
    if (!model || !draggedItem) {
        return null;
    }

    const list = getPromptManagerListElement();

    if (!(list instanceof HTMLElement)) {
        return null;
    }

    const groups = [];

    for (const groupElement of list.querySelectorAll('.bai-bai-preset-group:not(.bai-bai-preset-group-collapsed)')) {
        if (!(groupElement instanceof HTMLElement)) {
            continue;
        }

        const groupId = groupElement.dataset.presetGroupId;
        const containerElement = groupElement.querySelector('.bai-bai-preset-group-list');
        const hitElement = groupElement.querySelector('.bai-bai-preset-group-body, .bai-bai-preset-group-list');

        if (!groupId || !(containerElement instanceof HTMLElement) || !(hitElement instanceof HTMLElement)) {
            continue;
        }

        groups.push({
            groupId,
            groupElement,
            hitRect: getPresetVuePromptManualElementRect(hitElement),
            ...createPresetVuePromptManualContainerLayout(containerElement, draggedItem),
        });
    }

    const cache = {
        draggedItem: { ...draggedItem },
        topLevel: createPresetVuePromptManualContainerLayout(list, draggedItem),
        groups,
        scrollSignature: '',
    };

    cache.scrollSignature = getPresetVuePromptManualDragLayoutScrollSignature(cache);
    return cache;
}

function createPresetVuePromptManualContainerLayout(containerElement, draggedItem) {
    return {
        containerElement,
        containerRect: getPresetVuePromptManualElementRect(containerElement),
        children: getPresetVuePromptManualDropChildren(containerElement, draggedItem)
            .map(element => ({
                element,
                rect: getPresetVuePromptManualElementRect(element),
            })),
    };
}

function getPresetVuePromptManualElementRect(element) {
    const rect = element.getBoundingClientRect();

    return {
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
    };
}

function getPresetVuePromptManualDragLayoutScrollSignature(cache) {
    const parts = [window.scrollX || 0, window.scrollY || 0];
    const seen = new Set();
    const add = element => {
        if (!(element instanceof HTMLElement) || seen.has(element)) {
            return;
        }

        seen.add(element);
        parts.push(element.scrollLeft || 0, element.scrollTop || 0);
    };

    add(cache?.topLevel?.containerElement);

    for (const group of cache?.groups ?? []) {
        add(group.containerElement);
    }

    return parts.join(':');
}

function getPresetVuePromptManualGroupLayoutAtPoint(layout, point) {
    if (!layout || !point) {
        return null;
    }

    const margin = PRESET_VUE_EMPTY_INSERT_THRESHOLD_PX;
    let bestGroup = null;
    let bestDistance = Infinity;

    for (const group of layout.groups ?? []) {
        const rect = group.hitRect;

        if (
            point.clientX < rect.left - margin
            || point.clientX > rect.right + margin
            || point.clientY < rect.top - margin / 2
            || point.clientY > rect.bottom + margin
        ) {
            continue;
        }

        const verticalDistance = point.clientY < rect.top
            ? rect.top - point.clientY
            : point.clientY > rect.bottom
                ? point.clientY - rect.bottom
                : 0;

        if (verticalDistance < bestDistance) {
            bestDistance = verticalDistance;
            bestGroup = group;
        }
    }

    return bestGroup;
}

function getPresetVuePromptManualDropIndexFromLayout(containerLayout, point, { minIndex = 0 } = {}) {
    const children = containerLayout?.children ?? [];
    let index = 0;

    for (const child of children) {
        const rect = child.rect;

        if (point.clientY < rect.top + rect.height / 2) {
            return Math.max(minIndex, Math.min(index, children.length));
        }

        index += 1;
    }

    return Math.max(minIndex, children.length);
}

function getPresetVuePromptManualIndicatorRectFromLayout(containerLayout, index) {
    const containerRect = containerLayout?.containerRect;

    if (!containerRect) {
        return null;
    }

    const children = containerLayout.children ?? [];
    const target = children[index];
    let top = containerRect.top;

    if (target) {
        top = target.rect.top;
    } else if (children.length) {
        top = children[children.length - 1].rect.bottom;
    }

    return {
        left: containerRect.left,
        top,
        width: containerRect.width,
    };
}

function schedulePresetVuePromptManualDragAutoScroll(manager = getPresetVuePromptListManagerState()) {
    if (manager.dragAutoScrollFrame || !manager.draggedItem || !manager.lastDragPoint) {
        return;
    }

    manager.dragAutoScrollFrame = requestAnimationFrame(() => {
        manager.dragAutoScrollFrame = null;

        if (!manager.draggedItem || !manager.lastDragPoint) {
            return;
        }

        const scrolled = autoScrollPresetVuePromptManualDragContainer(manager);

        if (!scrolled) {
            return;
        }

        manager.dragLayoutCache = null;
        schedulePresetVuePromptManualDragPlacementFrame(manager);
        schedulePresetVuePromptManualDragAutoScroll(manager);
    });
}

function autoScrollPresetVuePromptManualDragContainer(manager = getPresetVuePromptListManagerState()) {
    const container = manager.dragScrollContainer;
    const point = manager.lastDragPoint;

    if (!container || !point) {
        return false;
    }

    return autoScrollPromptManagerDragContainer({
        scrollContainer: container,
        clientY: point.clientY,
    });
}

function getPresetVuePromptManualDropIndex(containerElement, point, draggedItem, { minIndex = 0 } = {}) {
    const children = getPresetVuePromptManualDropChildren(containerElement, draggedItem);
    let index = 0;

    for (const child of children) {
        const rect = child.getBoundingClientRect();

        if (point.clientY < rect.top + rect.height / 2) {
            return Math.max(minIndex, Math.min(index, children.length));
        }

        index += 1;
    }

    return Math.max(minIndex, children.length);
}

function getPresetVuePromptManualDropChildren(containerElement, draggedItem) {
    return Array.from(containerElement?.children ?? []).filter(child => child instanceof HTMLElement
        && !isPresetVuePromptTransientDragElement(child)
        && !isPresetVuePromptDraggedDomElement(child, draggedItem));
}

function isPresetVuePromptDraggedDomElement(element, draggedItem) {
    if (!(element instanceof HTMLElement) || !draggedItem) {
        return false;
    }

    if (draggedItem.type === 'group') {
        return element.classList.contains('bai-bai-preset-group')
            && element.dataset.presetGroupId === draggedItem.id;
    }

    return draggedItem.type === 'prompt' && element.dataset.pmIdentifier === draggedItem.id;
}

function getPresetVuePromptGroupItem(model, groupId) {
    return (model?.items ?? []).find(item => item?.type === 'group' && item.groupId === groupId) ?? null;
}

function updatePresetVuePromptManualDragIndicator(manager, placement) {
    const indicator = ensurePresetVuePromptManualDragIndicator(manager);
    const rect = placement?.indicatorRect ?? getPresetVuePromptManualDragIndicatorRect(placement);

    if (!indicator || !rect) {
        clearPresetVuePromptManualDragIndicator(manager);
        return;
    }

    const rectKey = `${Math.round(rect.left)}:${Math.round(rect.top)}:${Math.round(rect.width)}`;

    if (manager.dragIndicatorRectKey === rectKey) {
        return;
    }

    manager.dragIndicatorRectKey = rectKey;
    indicator.style.left = `${rect.left}px`;
    indicator.style.top = `${Math.round(rect.top - 1)}px`;
    indicator.style.width = `${rect.width}px`;
}

function ensurePresetVuePromptManualDragIndicator(manager = getPresetVuePromptListManagerState()) {
    if (manager.dragIndicatorElement instanceof HTMLElement && manager.dragIndicatorElement.isConnected) {
        return manager.dragIndicatorElement;
    }

    const indicator = document.createElement('div');
    indicator.className = PRESET_DRAG_INDICATOR_CLASS;
    document.body.append(indicator);
    manager.dragIndicatorElement = indicator;
    return indicator;
}

function getPresetVuePromptManualDragIndicatorRect(placement) {
    const container = placement?.containerElement;

    if (!(container instanceof HTMLElement)) {
        return null;
    }

    const containerRect = container.getBoundingClientRect();
    const children = getPresetVuePromptManualDropChildren(container, placement.draggedItem);
    const target = children[placement.index];
    let top = containerRect.top;

    if (target instanceof HTMLElement) {
        top = target.getBoundingClientRect().top;
    } else if (children.length) {
        top = children[children.length - 1].getBoundingClientRect().bottom;
    }

    return {
        left: containerRect.left,
        top,
        width: containerRect.width,
    };
}

function clearPresetVuePromptManualDragIndicator(manager = getPresetVuePromptListManagerState()) {
    manager.dragIndicatorElement?.remove?.();
    manager.dragIndicatorElement = null;
    manager.dragIndicatorRectKey = null;
}

function clearPresetVuePromptManualDragPlacement(manager = getPresetVuePromptListManagerState()) {
    manager.dragPlacement = null;
    manager.currentTopLevelDropIndex = null;
    clearPresetVuePromptDropTarget();
    clearPresetVuePromptManualDragIndicator(manager);
}

function clearPresetVuePromptManualDragState(manager = getPresetVuePromptListManagerState()) {
    stopPresetVuePromptManualDragPlacementListeners();

    if (manager.dragPlacementFrame) {
        cancelAnimationFrame(manager.dragPlacementFrame);
        manager.dragPlacementFrame = null;
    }

    if (manager.dragAutoScrollFrame) {
        cancelAnimationFrame(manager.dragAutoScrollFrame);
        manager.dragAutoScrollFrame = null;
    }

    clearPresetVuePromptManualDragPlacement(manager);
    manager.draggedItem = null;
    manager.dragLayoutCache = null;
    manager.dragScrollContainer = null;
    manager.lastDragPoint = null;
}

function applyPresetVuePromptManualDrop(model, placement) {
    const draggedItem = placement?.draggedItem;

    if (!model || !draggedItem) {
        return false;
    }

    if (draggedItem.type === 'group') {
        return movePresetVuePromptGroupToTopLevelIndex(model, draggedItem.id, placement.index);
    }

    if (draggedItem.type !== 'prompt') {
        return false;
    }

    if (placement.targetType === 'group') {
        return movePresetVuePromptToGroupIndex(model, draggedItem.id, placement.groupId, placement.index);
    }

    return movePresetVuePromptToTopLevelIndex(model, draggedItem.id, placement.index);
}

function movePresetVuePromptGroupToTopLevelIndex(model, groupId, index) {
    if (!Array.isArray(model?.items) || !groupId) {
        return false;
    }

    const before = getPresetVuePromptTopLevelItemKeys(model);
    const sourceIndex = model.items.findIndex(item => item?.type === 'group' && item.groupId === groupId);

    if (sourceIndex < 0) {
        return false;
    }

    const [groupItem] = model.items.splice(sourceIndex, 1);
    model.items.splice(clampPresetVuePromptTopLevelDropIndex(model, index), 0, groupItem);
    return !areStringArraysEqual(before, getPresetVuePromptTopLevelItemKeys(model));
}

function movePresetVuePromptToGroupIndex(model, promptId, groupId, index) {
    if (!Array.isArray(model?.items) || !promptId || !groupId) {
        return false;
    }

    const groupItem = getPresetVuePromptGroupItem(model, groupId);

    if (!groupItem) {
        return false;
    }

    const before = getPresetVuePromptListSnapshot(model);
    const promptItem = removePresetVuePromptItemFromModel(model, promptId);

    if (!promptItem) {
        return false;
    }

    promptItem.groupId = groupId;
    groupItem.children = Array.isArray(groupItem.children) ? groupItem.children : [];
    groupItem.children.splice(Math.max(0, Math.min(Number(index) || 0, groupItem.children.length)), 0, promptItem);
    groupItem.count = groupItem.children.length;

    const after = getPresetVuePromptListSnapshot(model);
    return !areStringArraysEqual(before.order, after.order)
        || !arePresetVuePromptGroupAssignmentsEqual(before.assignments, after.assignments);
}

function movePresetVuePromptToTopLevelIndex(model, promptId, index) {
    if (!Array.isArray(model?.items) || !promptId) {
        return false;
    }

    const before = getPresetVuePromptListSnapshot(model);
    const promptItem = removePresetVuePromptItemFromModel(model, promptId);

    if (!promptItem) {
        return false;
    }

    promptItem.groupId = null;
    model.items.splice(clampPresetVuePromptTopLevelDropIndex(model, index), 0, promptItem);

    const after = getPresetVuePromptListSnapshot(model);
    return !areStringArraysEqual(before.order, after.order)
        || !arePresetVuePromptGroupAssignmentsEqual(before.assignments, after.assignments);
}

function getPresetVuePromptTopLevelItemKeys(model) {
    return (model?.items ?? []).map(item => {
        if (item?.type === 'group') {
            return `group:${item.groupId}`;
        }

        if (item?.type === 'prompt') {
            return `prompt:${item.id}`;
        }

        return `static:${item?.type ?? ''}`;
    });
}

function applyPresetVuePromptDropTargetFallback(model, event = null) {
    const manager = getPresetVuePromptListManagerState();
    const promptId = manager.draggedPromptId;
    const groupId = manager.currentDropTargetGroupId;

    if (!model || !promptId || !groupId) {
        return false;
    }

    const pointGroup = getPresetVuePromptGroupDropTargetAtPoint(getPresetDragPoint(event?.originalEvent ?? event));

    if (pointGroup instanceof HTMLElement && pointGroup.dataset.presetGroupId !== groupId) {
        return false;
    }

    if (!pointGroup && event) {
        return false;
    }

    const groupItem = model.items?.find(item => item?.type === 'group' && item.groupId === groupId);

    if (!groupItem) {
        return false;
    }

    if ((groupItem.children ?? []).some(child => child?.type === 'prompt' && child.id === promptId)) {
        return false;
    }

    const promptItem = removePresetVuePromptItemFromModel(model, promptId);

    if (!promptItem) {
        return false;
    }

    promptItem.groupId = groupId;
    groupItem.children = Array.isArray(groupItem.children) ? groupItem.children : [];
    groupItem.children.push(promptItem);
    groupItem.count = groupItem.children.length;
    return true;
}

function applyPresetVuePromptTopLevelDropFallback(model, event = null) {
    const manager = getPresetVuePromptListManagerState();
    const promptId = manager.draggedPromptId;

    if (!model || !promptId || !isPresetVuePromptNestedInGroup(model, promptId)) {
        return false;
    }

    const point = getPresetDragPoint(event?.originalEvent ?? event);

    if (getPresetVuePromptGroupDropTargetAtPoint(point)) {
        return false;
    }

    const pointDropIndex = getPresetVuePromptTopLevelDropIndexAtPoint(model, point);
    const dropIndex = Number.isFinite(pointDropIndex)
        ? pointDropIndex
        : manager.currentTopLevelDropIndex;

    if (!Number.isFinite(dropIndex)) {
        return false;
    }

    const promptItem = removePresetVuePromptItemFromModel(model, promptId);

    if (!promptItem) {
        return false;
    }

    promptItem.groupId = null;
    model.items.splice(clampPresetVuePromptTopLevelDropIndex(model, dropIndex), 0, promptItem);
    return true;
}

function isPresetVuePromptNestedInGroup(model, promptId) {
    if (!Array.isArray(model?.items) || !promptId) {
        return false;
    }

    return model.items.some(item => item?.type === 'group'
        && Array.isArray(item.children)
        && item.children.some(child => child?.type === 'prompt' && child.id === promptId));
}

function getPresetVuePromptTopLevelDropIndexAtPoint(model, point) {
    if (!point || !Array.isArray(model?.items)) {
        return null;
    }

    const list = getPromptManagerListElement();

    if (!(list instanceof HTMLElement)) {
        return null;
    }

    const listRect = list.getBoundingClientRect();
    const margin = PRESET_VUE_EMPTY_INSERT_THRESHOLD_PX;

    if (
        point.clientX < listRect.left - margin
        || point.clientX > listRect.right + margin
        || point.clientY < listRect.top - margin
        || point.clientY > listRect.bottom + margin
    ) {
        return null;
    }

    let modelIndex = 0;

    for (const child of Array.from(list.children)) {
        if (!(child instanceof HTMLElement) || isPresetVuePromptTransientDragElement(child)) {
            continue;
        }

        const rect = child.getBoundingClientRect();

        if (point.clientY < rect.top + rect.height / 2) {
            return clampPresetVuePromptTopLevelDropIndex(model, modelIndex);
        }

        modelIndex += 1;
    }

    return model.items.length;
}

function isPresetVuePromptTransientDragElement(element) {
    return element.classList.contains('bai-bai-preset-vue-sortable-fallback')
        || element.classList.contains('bai-bai-preset-vue-sortable-ghost')
        || element.classList.contains('bai-bai-preset-vue-sortable-chosen')
        || element.classList.contains('bai-bai-preset-vue-sortable-drag');
}

function clampPresetVuePromptTopLevelDropIndex(model, index) {
    const minIndex = getPresetVuePromptTopLevelContentStartIndex(model);
    const maxIndex = Array.isArray(model?.items) ? model.items.length : minIndex;
    return Math.max(minIndex, Math.min(Number(index) || minIndex, maxIndex));
}

function getPresetVuePromptTopLevelContentStartIndex(model) {
    if (!Array.isArray(model?.items)) {
        return 2;
    }

    let index = 0;

    while (index < model.items.length) {
        const type = model.items[index]?.type;

        if (type !== 'header' && type !== 'global-library' && type !== 'favorites' && type !== 'separator') {
            break;
        }

        index += 1;
    }

    return index;
}

function removePresetVuePromptItemFromModel(model, promptId) {
    if (!Array.isArray(model?.items) || !promptId) {
        return null;
    }

    for (const item of model.items) {
        if (item?.type !== 'group' || !Array.isArray(item.children)) {
            continue;
        }

        const index = item.children.findIndex(child => child?.type === 'prompt' && child.id === promptId);

        if (index >= 0) {
            const [promptItem] = item.children.splice(index, 1);
            item.count = item.children.length;
            return promptItem;
        }
    }

    const topLevelIndex = model.items.findIndex(item => item?.type === 'prompt' && item.id === promptId);

    if (topLevelIndex < 0) {
        return null;
    }

    const [promptItem] = model.items.splice(topLevelIndex, 1);
    return promptItem;
}

function capturePresetVuePromptDragSnapshot(model) {
    getPresetVuePromptListManagerState().dragSnapshot = getPresetVuePromptListSnapshot(model);
}

function consumePresetVuePromptDragChange(model) {
    const manager = getPresetVuePromptListManagerState();
    const snapshot = manager.dragSnapshot;
    manager.dragSnapshot = null;

    if (!snapshot) {
        return false;
    }

    const sanitized = sanitizePresetVuePromptListModel(model);
    const current = getPresetVuePromptListSnapshot(model);
    return sanitized
        || !areStringArraysEqual(snapshot.order, current.order)
        || !arePresetVuePromptGroupAssignmentsEqual(snapshot.assignments, current.assignments);
}

function getPresetVuePromptListSnapshot(model) {
    return {
        order: getPresetVuePromptFlatIds(model),
        assignments: getPresetVuePromptGroupAssignmentsFromModel(model),
    };
}

function arePresetVuePromptGroupAssignmentsEqual(left = {}, right = {}) {
    const promptIds = new Set([...Object.keys(left), ...Object.keys(right)]);

    for (const promptId of promptIds) {
        if ((left[promptId] ?? null) !== (right[promptId] ?? null)) {
            return false;
        }
    }

    return true;
}

function renderPresetVuePromptEntry(h, vueDraggableNext, item) {
    if (item?.type === 'header') {
        return renderPresetVuePromptListHeader(h, getPresetVuePromptListManagerState().state);
    }

    if (item?.type === 'separator') {
        return renderPresetVuePromptListSeparator(h);
    }

    if (item?.type === 'global-library') {
        return renderPresetVuePromptGlobalLibrary(h, vueDraggableNext, item);
    }

    if (item?.type === 'favorites') {
        return renderPresetVuePromptFavorites(h, item);
    }

    if (item?.type === 'group') {
        return renderPresetVuePromptGroup(h, vueDraggableNext, item);
    }

    return renderPresetVuePromptRow(h, item, { topLevel: true });
}

function renderPresetVuePromptGlobalLibrary(h, vueDraggableNext, item, { outsideList = false } = {}) {
    if (!item) {
        return null;
    }

    const model = getPresetVuePromptListManagerState().state;
    const mounted = isPresetVuePromptGroupBodyMounted(model, item);
    const selecting = Boolean(item.selecting);
    const tag = outsideList ? 'div' : 'li';
    const bodyContent = (() => {
        if (!mounted) {
            return [];
        }

        if (item.loading) {
            return [h('div', { class: 'bai-bai-preset-global-library-empty' }, t`全局库加载中...`)];
        }

        if (item.error) {
            return [h('div', { class: 'bai-bai-preset-global-library-empty' }, t`全局库加载失败`)];
        }

        if (item.count === 0 && !item.hasGroups) {
            return [h('div', { class: 'bai-bai-preset-global-library-empty' }, t`暂无全局条目`)];
        }

        const sections = [];

        if (selecting) {
            sections.push(renderPresetVueGlobalLibrarySelectionBar(h, item));
        }

        sections.push(renderPresetVueGlobalLibraryDraggable(h, vueDraggableNext, item.ungrouped, { groupId: null }));

        for (const group of item.groups) {
            sections.push(renderPresetVueGlobalLibraryGroup(h, vueDraggableNext, group));
        }

        return sections;
    })();

    return h(tag, {
        class: [
            'bai-bai-preset-global-library',
            outsideList ? 'bai-bai-preset-global-library-outside' : '',
            item.collapsed ? 'bai-bai-preset-global-library-collapsed' : '',
            selecting ? 'bai-bai-preset-global-library-selecting' : '',
        ],
        key: PRESET_VUE_GLOBAL_LIBRARY_ENTRY_ID,
    }, [
        h('div', {
            class: 'bai-bai-preset-group-header bai-bai-preset-global-library-header',
            onClick: event => {
                event.preventDefault();
                event.stopPropagation();
                togglePresetVuePromptGlobalLibraryCollapsed();
            },
        }, [
            h('span', { class: 'bai-bai-preset-group-title', title: t`全局库` }, [
                h('span', {
                    class: [
                        'menu_button',
                        'bai-bai-preset-group-toggle',
                        'fa-solid',
                        'fa-chevron-down',
                    ],
                    title: item.collapsed ? t`展开全局库` : t`收起全局库`,
                }),
                h('span', { class: 'bai-bai-preset-group-title-content' }, [
                    h('strong', null, t`全局库`),
                    h('small', { class: 'bai-bai-preset-group-count' }, `(${item.count})`),
                ]),
            ]),
            h('span', { class: 'bai-bai-preset-group-actions' }, [
                renderPresetVuePromptActionButton(h, {
                    action: 'global-library-new-group',
                    icon: 'fa-folder-plus',
                    text: t`新建分组`,
                    onClick: event => {
                        event.stopPropagation();
                        handlePresetPromptActionButtonClick(event);
                    },
                }),
                renderPresetVuePromptActionButton(h, {
                    action: 'global-library-toggle-select',
                    icon: selecting ? 'fa-square-check' : 'fa-list-check',
                    text: selecting ? t`退出多选` : t`多选`,
                    extraClasses: selecting ? ['bai-bai-preset-global-library-select-active'] : [],
                    onClick: event => {
                        event.stopPropagation();
                        handlePresetPromptActionButtonClick(event);
                    },
                }),
            ]),
        ]),
        h('div', {
            class: 'bai-bai-preset-group-body',
            'aria-hidden': item.collapsed ? 'true' : 'false',
        }, [
            h('div', { class: 'bai-bai-preset-group-body-inner' }, bodyContent),
        ]),
    ]);
}

function renderPresetVueGlobalLibrarySelectionBar(h, item) {
    const selectedCount = item.selectedCount ?? 0;

    return h('div', { class: 'bai-bai-preset-global-library-selection-bar', key: 'global-library-selection-bar' }, [
        h('span', { class: 'bai-bai-preset-global-library-selection-count' }, `${t`已选`} ${selectedCount}`),
        h('span', { class: 'bai-bai-preset-global-library-selection-actions' }, [
            renderPresetVuePromptActionButton(h, {
                action: 'global-library-insert-selected',
                icon: 'fa-plus',
                text: t`添加选中到当前预设`,
                onClick: event => handlePresetPromptActionButtonClick(event),
            }),
            renderPresetVuePromptActionButton(h, {
                action: 'global-library-move-selected',
                icon: 'fa-folder-tree',
                text: t`移动选中到分组`,
                onClick: event => handlePresetPromptActionButtonClick(event),
            }),
            renderPresetVuePromptActionButton(h, {
                action: 'global-library-delete-selected',
                icon: 'fa-trash',
                text: t`删除选中`,
                caution: true,
                onClick: event => handlePresetPromptActionButtonClick(event),
            }),
        ]),
    ]);
}

function buildPresetVueGlobalLibraryDraggableProps(list, { groupId }) {
    const handleSelector = getPresetVuePromptDragHandleSelector();
    const selecting = Boolean(getPresetVuePromptListManagerState().state?.globalLibrary?.selecting);
    const dragDisabled = selecting;
    const draggableProps = {
        tag: 'ul',
        class: [
            'bai-bai-preset-group-list',
            'bai-bai-preset-global-library-list',
            list.length ? '' : 'bai-bai-preset-group-list-empty',
        ],
        list,
        group: {
            name: PRESET_VUE_GLOBAL_LIBRARY_DRAG_GROUP,
            pull: !dragDisabled,
            put: dragDisabled ? false : canPutPresetVueGlobalLibraryItem,
        },
        draggable: 'li.completion_prompt_manager_prompt_draggable',
        filter: PRESET_DRAG_INTERACTIVE_SELECTOR,
        preventOnFilter: false,
        sort: true,
        disabled: dragDisabled,
        animation: 0,
        emptyInsertThreshold: PRESET_VUE_EMPTY_INSERT_THRESHOLD_PX,
        forceFallback: true,
        fallbackOnBody: true,
        fallbackClass: 'bai-bai-preset-vue-sortable-fallback',
        ghostClass: 'bai-bai-preset-vue-sortable-ghost',
        chosenClass: 'bai-bai-preset-vue-sortable-chosen',
        dragClass: 'bai-bai-preset-vue-sortable-drag',
        'data-global-library-group-id': groupId || '',
        onChoose: () => {
            closePresetPromptActionMenus();
        },
        onStart: () => notifyPresetVuePromptDragStarted(),
        onEnd: () => {
            void handlePresetGlobalLibraryDrop();
        },
    };
    applyPresetVueDragGestureOptions(draggableProps);

    if (handleSelector) {
        draggableProps.handle = handleSelector;
    }

    return draggableProps;
}

function renderPresetVueGlobalLibraryDraggable(h, vueDraggableNext, list, { groupId }) {
    const items = Array.isArray(list) ? list : [];
    const selecting = Boolean(getPresetVuePromptListManagerState().state?.globalLibrary?.selecting);

    if (selecting || !vueDraggableNext?.VueDraggableNext) {
        return h('ul', {
            class: [
                'bai-bai-preset-group-list',
                'bai-bai-preset-global-library-list',
                items.length ? '' : 'bai-bai-preset-group-list-empty',
            ],
            'data-global-library-group-id': groupId || '',
        }, items.map(child => renderPresetVuePromptGlobalLibraryRow(h, child)));
    }

    const draggableProps = buildPresetVueGlobalLibraryDraggableProps(items, { groupId });

    return h(vueDraggableNext.VueDraggableNext, draggableProps, {
        default: () => items.map(child => renderPresetVuePromptGlobalLibraryRow(h, child)),
    });
}

function canPutPresetVueGlobalLibraryItem(to, from, dragElement) {
    return dragElement instanceof HTMLElement && dragElement.matches('li.completion_prompt_manager_prompt_draggable');
}

function renderPresetVueGlobalLibraryGroup(h, vueDraggableNext, group) {
    return h('div', {
        class: [
            'bai-bai-preset-group',
            'bai-bai-preset-global-library-group',
            group.collapsed ? 'bai-bai-preset-group-collapsed' : '',
        ],
        'data-preset-global-library-group-id': group.groupId,
        key: group.id,
    }, [
        h('div', {
            class: 'bai-bai-preset-group-header bai-bai-preset-global-library-group-header',
            onClick: event => {
                event.preventDefault();
                event.stopPropagation();
                togglePresetGlobalLibraryGroupCollapsed(group.groupId);
            },
        }, [
            h('span', { class: 'bai-bai-preset-group-title', title: group.name }, [
                h('span', {
                    class: [
                        'menu_button',
                        'bai-bai-preset-group-toggle',
                        'fa-solid',
                        'fa-chevron-down',
                    ],
                    title: group.collapsed ? t`展开分组` : t`收起分组`,
                }),
                h('span', { class: 'bai-bai-preset-group-title-content' }, [
                    h('span', { class: 'fa-solid fa-folder bai-bai-preset-global-library-group-icon' }),
                    h('strong', null, group.name),
                    h('small', { class: 'bai-bai-preset-group-count' }, `(${group.count})`),
                ]),
            ]),
            h('span', { class: 'bai-bai-preset-group-actions' }, [
                renderPresetVuePromptActionButton(h, {
                    action: 'global-library-group-rename',
                    icon: 'fa-pencil',
                    text: t`重命名分组`,
                    onClick: event => {
                        event.stopPropagation();
                        handlePresetPromptActionButtonClick(event);
                    },
                }),
                renderPresetVuePromptActionButton(h, {
                    action: 'global-library-group-delete',
                    icon: 'fa-trash',
                    text: t`删除分组`,
                    caution: true,
                    onClick: event => {
                        event.stopPropagation();
                        handlePresetPromptActionButtonClick(event);
                    },
                }),
            ]),
        ]),
        h('div', {
            class: 'bai-bai-preset-group-body',
            'aria-hidden': group.collapsed ? 'true' : 'false',
        }, [
            h('div', { class: 'bai-bai-preset-group-body-inner' }, group.collapsed ? [] : [
                renderPresetVueGlobalLibraryDraggable(h, vueDraggableNext, group.children, { groupId: group.groupId }),
            ]),
        ]),
    ]);
}

function renderPresetVuePromptGlobalLibraryRow(h, item) {
    const prefix = promptManager?.configuration?.prefix ?? '';
    const name = item.name || t`未命名条目`;
    const selecting = Boolean(item.selecting);
    const selected = Boolean(item.selected);
    const leadingCell = selecting
        ? h('span', {
            class: [
                'bai-bai-preset-global-library-row-marker',
                'bai-bai-preset-global-library-select-box',
                selected ? 'bai-bai-preset-global-library-select-box-checked' : '',
                'fa-solid',
                selected ? 'fa-square-check' : 'fa-square',
            ],
            'data-preset-prompt-action': 'global-library-select-item',
            title: selected ? t`取消选择` : t`选择`,
            onClick: event => handlePresetPromptActionButtonClick(event),
        })
        : h('span', {
            class: 'drag-handle ui-sortable-handle bai-bai-preset-global-library-row-marker',
            title: t`拖动以移动到分组`,
        }, '\u2630');

    return h('li', {
        class: [
            `${prefix}prompt_manager_prompt`,
            'completion_prompt_manager_prompt_draggable',
            'bai-bai-preset-global-library-prompt',
            selected ? 'bai-bai-preset-global-library-prompt-selected' : '',
        ],
        'data-preset-global-library-id': item.id,
        key: `global-library:${item.id}`,
    }, [
        leadingCell,
        h('span', {
            class: `${prefix}prompt_manager_prompt_name`,
            title: name,
            'data-pm-name': name,
        }, [
            h('span', null, name),
        ]),
        h('span', null, [
            h('span', { class: 'prompt_manager_prompt_controls' }, [
                renderPresetVuePromptActionButton(h, {
                    action: 'global-library-delete',
                    icon: 'fa-trash',
                    text: t`删除全局库条目`,
                    caution: true,
                    onClick: event => handlePresetPromptActionButtonClick(event),
                }),
                renderPresetVuePromptActionButton(h, {
                    action: 'global-library-edit',
                    icon: 'fa-pencil',
                    text: t`编辑全局库条目`,
                    onClick: event => handlePresetPromptActionButtonClick(event),
                }),
                renderPresetVuePromptActionButton(h, {
                    action: 'global-library-insert',
                    icon: 'fa-plus',
                    text: t`添加到当前预设`,
                    onClick: event => handlePresetPromptActionButtonClick(event),
                }),
            ]),
        ]),
        h('span', { class: 'prompt_manager_prompt_tokens' }, '-'),
    ]);
}

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

function renderPresetVuePromptGroup(h, vueDraggableNext, item) {
    const handleSelector = getPresetVuePromptDragHandleSelector();
    const groupEnabled = isPresetVuePromptGroupEnabled(item);
    const dragLocked = isPresetVuePromptDragLocked();
    const rangeSelecting = Boolean(getPresetVuePromptListManagerState().state?.rangeSelection?.active);
    const dragDisabled = dragLocked || rangeSelecting;
    const draggableProps = {
        tag: 'ul',
        class: [
            'bai-bai-preset-group-list',
            item.children?.length ? '' : 'bai-bai-preset-group-list-empty',
        ],
        list: item.children,
        group: {
            name: 'bai-bai-preset-prompts',
            pull: !dragDisabled,
            put: dragDisabled ? false : canPutPresetVuePromptIntoGroupList,
        },
        draggable: 'li.completion_prompt_manager_prompt_draggable',
        filter: PRESET_DRAG_INTERACTIVE_SELECTOR,
        preventOnFilter: false,
        sort: false,
        disabled: dragDisabled,
        animation: 0,
        emptyInsertThreshold: PRESET_VUE_EMPTY_INSERT_THRESHOLD_PX,
        dragoverBubble: true,
        bubbleScroll: false,
        forceFallback: true,
        fallbackOnBody: true,
        fallbackClass: 'bai-bai-preset-vue-sortable-fallback',
        ghostClass: 'bai-bai-preset-vue-sortable-ghost',
        chosenClass: 'bai-bai-preset-vue-sortable-chosen',
        dragClass: 'bai-bai-preset-vue-sortable-drag',
        move: isPresetVuePromptGroupDragMoveAllowed,
        onChoose: () => {
            closePresetPromptActionMenus();
        },
        onStart: event => beginPresetVuePromptManualDrag(getPresetVuePromptListManagerState().state, event),
        onEnd: event => {
            const manager = getPresetVuePromptListManagerState();
            const model = manager.state;
            manager.lastDragEndedAt = Date.now();
            const manualDrop = finishPresetVuePromptManualDrag(model, event);
            setPresetVuePromptDragging(model, false);
            manager.draggedPromptId = null;
            manager.draggedItem = null;
            manager.currentDropTargetGroupId = null;
            manager.currentTopLevelDropIndex = null;
            const modelChanged = consumePresetVuePromptDragChange(model);
            if (manualDrop || modelChanged) {
                schedulePresetVuePromptOrderSaveAfterDrop();
            }
        },
    };
    applyPresetVueDragGestureOptions(draggableProps);

    if (handleSelector) {
        draggableProps.handle = handleSelector;
    }

    return h('li', {
        class: [
            PRESET_VUE_TOP_LEVEL_DRAGGABLE_CLASS,
            'bai-bai-preset-group',
            item.collapsed ? 'bai-bai-preset-group-collapsed' : '',
            groupEnabled ? '' : 'bai-bai-preset-group-powered-off',
        ],
        'data-preset-group-id': item.groupId,
        key: item.id,
    }, [
        h('div', {
            class: 'bai-bai-preset-group-header bai-bai-preset-group-drag-surface',
            onPointerdown: event => beginPresetVuePromptGroupHeaderGesture(event, item.groupId),
            onPointermoveCapture: event => movePresetVuePromptGroupHeaderGesture(event, item.groupId),
            onPointerup: event => finishPresetVuePromptGroupHeaderGesture(event, item.groupId),
            onPointercancel: () => cancelPresetVuePromptGroupHeaderGesture(item.groupId),
            onClick: event => handlePresetVuePromptGroupHeaderClickFallback(event, item.groupId),
        }, [
            h('span', { class: 'bai-bai-preset-group-title', title: item.name }, [
                h('span', {
                    class: [
                        'menu_button',
                        'bai-bai-preset-group-toggle',
                        'fa-solid',
                        'fa-chevron-down',
                    ],
                    title: item.collapsed ? t`展开分组` : t`收起分组`,
                    onClick: event => {
                        event.preventDefault();
                        event.stopPropagation();
                        togglePresetVuePromptGroupCollapsed(item.groupId);
                    },
                }),
                h('span', { class: 'bai-bai-preset-group-title-content' }, [
                    h('strong', null, item.name),
                    h('small', { class: 'bai-bai-preset-group-count' }, formatPresetVuePromptGroupCount(item)),
                ]),
            ]),
            h('span', { class: 'bai-bai-preset-group-actions' }, [
                h('span', {
                    class: [
                        'menu_button',
                        'fa-solid',
                        'bai-bai-preset-group-action-button',
                        'bai-bai-preset-group-enable-toggle',
                        groupEnabled ? 'fa-toggle-on' : 'fa-toggle-off',
                    ],
                    title: groupEnabled ? t`关闭分组供电` : t`开启分组供电`,
                    onClick: event => {
                        event.preventDefault();
                        event.stopPropagation();
                        togglePresetVuePromptGroupEnabled(item.groupId);
                    },
                }),
                h('span', {
                    class: 'menu_button fa-solid fa-pencil bai-bai-preset-group-action-button',
                    title: t`重命名分组`,
                    onClick: event => {
                        event.preventDefault();
                        event.stopPropagation();
                        void renamePresetVuePromptGroup(item.groupId);
                    },
                }),
                h('span', {
                    class: 'menu_button fa-solid fa-trash bai-bai-preset-group-action-button',
                    title: t`删除分组`,
                    onClick: event => {
                        event.preventDefault();
                        event.stopPropagation();
                        void deletePresetVuePromptGroup(item.groupId);
                    },
                }),
            ]),
        ]),
        renderPresetVuePromptGroupBody(h, vueDraggableNext, item, draggableProps),
    ]);
}

function isPresetVuePromptGroupEnabled(item) {
    return item?.enabled !== false && item?.group?.enabled !== false;
}

function formatPresetVuePromptGroupCount(item) {
    const children = Array.isArray(item?.children) ? item.children : [];
    const total = children.length || Number(item?.count) || 0;
    const enabled = children.filter(child => child?.enabled !== false && child?.orderEntry?.enabled !== false).length;
    return `(${enabled}/${total})`;
}

function beginPresetVuePromptGroupHeaderGesture(event, groupId) {
    if (isPresetVuePromptDragLocked()) {
        return;
    }

    if (isPresetVuePromptGroupHeaderInteractiveEvent(event)) {
        return;
    }

    if (event.pointerType === 'mouse' && event.button !== 0) {
        return;
    }

    if (event.isPrimary === false) {
        return;
    }

    const point = getPresetVuePointerEventPoint(event);

    if (!point) {
        return;
    }

    const manager = getPresetVuePromptListManagerState();
    const feedbackElement = getPresetVuePromptGroupHeaderFeedbackElement(event.currentTarget);
    const startedAt = Date.now();

    cancelPresetVuePromptGroupHeaderCustomDrag(manager, { suppress: false });
    clearPresetVuePromptDragReadyFeedback(manager);
    manager.groupHeaderGesture = {
        groupId,
        pointerId: event.pointerId,
        startedAt,
        x: point.clientX,
        y: point.clientY,
        lastX: point.clientX,
        lastY: point.clientY,
        scrolling: false,
        dragging: false,
        feedbackElement,
        readyTimer: null,
    };

    if (isMobile() && feedbackElement instanceof HTMLElement) {
        manager.dragReadyFeedbackElement = feedbackElement;
        manager.dragReadyFeedbackNotified = false;
        manager.groupHeaderGesture.readyTimer = window.setTimeout(() => {
            beginPresetVuePromptGroupHeaderCustomDrag(manager, manager.groupHeaderGesture);
        }, PRESET_VUE_TOUCH_DRAG_DELAY_MS);
    }
}

function movePresetVuePromptGroupHeaderGesture(event, groupId) {
    const manager = getPresetVuePromptListManagerState();
    const gesture = manager.groupHeaderGesture;

    if (!gesture || gesture.groupId !== groupId || gesture.pointerId !== event.pointerId || manager.state?.dragging) {
        return;
    }

    const point = getPresetVuePointerEventPoint(event);

    if (!point) {
        return;
    }

    gesture.lastX = point.clientX;
    gesture.lastY = point.clientY;

    const deltaX = point.clientX - gesture.x;
    const deltaY = point.clientY - gesture.y;
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);

    if (gesture.dragging) {
        updatePresetVuePromptManualDragPlacementFromEvent(event);

        if (event.cancelable) {
            event.preventDefault();
        }

        event.stopPropagation();
        return;
    }

    if (!isMobile()) {
        return;
    }

    if (Math.max(absX, absY) <= PRESET_VUE_TOUCH_START_THRESHOLD_PX) {
        return;
    }

    gesture.scrolling = true;
    manager.lastGroupHeaderGestureCanceledAt = Date.now();
    clearPresetVuePromptGroupHeaderGestureTimer(gesture);
    clearPresetVuePromptDragReadyFeedback(manager);
}

function finishPresetVuePromptGroupHeaderGesture(event, groupId) {
    const manager = getPresetVuePromptListManagerState();
    const gesture = manager.groupHeaderGesture;

    if (manager.groupHeaderCustomDrag?.pointerId === event.pointerId) {
        finishPresetVuePromptGroupHeaderCustomDrag(event);
        return;
    }

    if (!gesture || gesture.groupId !== groupId || gesture.pointerId !== event.pointerId) {
        return;
    }

    manager.groupHeaderGesture = null;
    clearPresetVuePromptGroupHeaderGestureTimer(gesture);
    clearPresetVuePromptDragReadyFeedback(manager);

    if (isPresetVuePromptGroupHeaderInteractiveEvent(event) || shouldSuppressPresetVuePromptGroupHeaderToggle(manager)) {
        return;
    }

    const point = getPresetVuePointerEventPoint(event);

    if (!point || gesture.scrolling || getPresetVuePointDistance(gesture, point) > PRESET_VUE_GROUP_HEADER_TOGGLE_DISTANCE_PX) {
        manager.lastGroupHeaderGestureCanceledAt = Date.now();
        return;
    }

    if (event.cancelable) {
        event.preventDefault();
    }

    event.stopPropagation();
    manager.lastGroupHeaderToggleAt = Date.now();
    togglePresetVuePromptGroupCollapsed(groupId);
}

function cancelPresetVuePromptGroupHeaderGesture(groupId) {
    const manager = getPresetVuePromptListManagerState();

    if (manager.groupHeaderCustomDrag?.groupId === groupId) {
        cancelPresetVuePromptGroupHeaderCustomDrag(manager);
    }

    if (manager.groupHeaderGesture?.groupId === groupId) {
        clearPresetVuePromptGroupHeaderGestureTimer(manager.groupHeaderGesture);
        manager.groupHeaderGesture = null;
        manager.lastGroupHeaderGestureCanceledAt = Date.now();
        clearPresetVuePromptDragReadyFeedback(manager);
    }
}

function handlePresetVuePromptGroupHeaderClickFallback(event, groupId) {
    const manager = getPresetVuePromptListManagerState();

    if (isPresetVuePromptGroupHeaderInteractiveEvent(event)) {
        return;
    }

    const now = Date.now();

    if (
        now - (manager.lastGroupHeaderToggleAt || 0) < PRESET_VUE_GROUP_HEADER_DRAG_SUPPRESS_MS
        || now - (manager.lastGroupHeaderGestureCanceledAt || 0) < PRESET_VUE_GROUP_HEADER_DRAG_SUPPRESS_MS
        || shouldSuppressPresetVuePromptGroupHeaderToggle(manager)
    ) {
        if (event.cancelable) {
            event.preventDefault();
        }

        event.stopPropagation();
        return;
    }

    manager.lastGroupHeaderToggleAt = now;
    togglePresetVuePromptGroupCollapsed(groupId);
}

function shouldSuppressPresetVuePromptGroupHeaderToggle(manager) {
    return Boolean(
        manager.state?.dragging
        || Date.now() - (manager.lastDragEndedAt || 0) < PRESET_VUE_GROUP_HEADER_DRAG_SUPPRESS_MS,
    );
}

function isPresetVuePromptGroupHeaderInteractiveEvent(event) {
    const target = event.target instanceof Element ? event.target : null;
    return Boolean(target?.closest('.bai-bai-preset-group-actions, .bai-bai-preset-group-toggle'));
}

function getPresetVuePointerEventPoint(event) {
    if (typeof event?.clientX !== 'number' || typeof event?.clientY !== 'number') {
        return null;
    }

    return {
        clientX: event.clientX,
        clientY: event.clientY,
    };
}

function getPresetVuePointDistance(start, end) {
    return Math.hypot(end.clientX - start.x, end.clientY - start.y);
}

function getPresetVuePromptGroupHeaderFeedbackElement(source) {
    if (!(source instanceof Element)) {
        return null;
    }

    return source.closest(`li.${PRESET_VUE_TOP_LEVEL_DRAGGABLE_CLASS}`);
}

function clearPresetVuePromptGroupHeaderGestureTimer(gesture) {
    if (gesture?.readyTimer) {
        clearTimeout(gesture.readyTimer);
        gesture.readyTimer = null;
    }
}

function beginPresetVuePromptGroupHeaderCustomDrag(manager, gesture) {
    if (!isMobile() || !manager || manager.groupHeaderGesture !== gesture || !gesture || gesture.scrolling || gesture.dragging) {
        return false;
    }

    const model = manager.state;
    const point = {
        clientX: gesture.lastX ?? gesture.x,
        clientY: gesture.lastY ?? gesture.y,
    };

    clearPresetVuePromptGroupHeaderGestureTimer(gesture);
    gesture.dragging = true;
    manager.groupHeaderCustomDrag = {
        groupId: gesture.groupId,
        pointerId: gesture.pointerId,
    };

    const started = beginPresetVuePromptManualDragWithItem(
        model,
        { type: 'group', id: gesture.groupId },
        point,
    );

    if (!started) {
        cancelPresetVuePromptGroupHeaderCustomDrag(manager);
        return false;
    }

    startPresetVuePromptGroupHeaderCustomDragEndListeners(manager);
    return true;
}

function startPresetVuePromptGroupHeaderCustomDragEndListeners(manager = getPresetVuePromptListManagerState()) {
    stopPresetVuePromptGroupHeaderCustomDragEndListeners();

    const pointerup = event => {
        const customDrag = manager.groupHeaderCustomDrag;

        if (!customDrag || customDrag.pointerId !== event.pointerId) {
            return;
        }

        finishPresetVuePromptGroupHeaderCustomDrag(event);
    };
    const pointercancel = event => {
        const customDrag = manager.groupHeaderCustomDrag;

        if (!customDrag || customDrag.pointerId !== event.pointerId) {
            return;
        }

        cancelPresetVuePromptGroupHeaderCustomDrag(manager);
    };
    const touchend = event => {
        if (manager.groupHeaderCustomDrag) {
            finishPresetVuePromptGroupHeaderCustomDrag(event);
        }
    };
    const touchcancel = () => {
        if (manager.groupHeaderCustomDrag) {
            cancelPresetVuePromptGroupHeaderCustomDrag(manager);
        }
    };

    document.addEventListener('pointerup', pointerup, true);
    document.addEventListener('pointercancel', pointercancel, true);
    document.addEventListener('touchend', touchend, true);
    document.addEventListener('touchcancel', touchcancel, true);
    extensionState[PRESET_VUE_GROUP_HEADER_CUSTOM_DRAG_LISTENER_KEY] = {
        pointerup,
        pointercancel,
        touchend,
        touchcancel,
    };
}

function stopPresetVuePromptGroupHeaderCustomDragEndListeners() {
    const listeners = extensionState[PRESET_VUE_GROUP_HEADER_CUSTOM_DRAG_LISTENER_KEY];

    if (!listeners) {
        return;
    }

    document.removeEventListener('pointerup', listeners.pointerup, true);
    document.removeEventListener('pointercancel', listeners.pointercancel, true);
    document.removeEventListener('touchend', listeners.touchend, true);
    document.removeEventListener('touchcancel', listeners.touchcancel, true);
    delete extensionState[PRESET_VUE_GROUP_HEADER_CUSTOM_DRAG_LISTENER_KEY];
}

function finishPresetVuePromptGroupHeaderCustomDrag(event = null) {
    const manager = getPresetVuePromptListManagerState();
    const model = manager.state;

    if (!manager.groupHeaderCustomDrag) {
        return;
    }

    stopPresetVuePromptGroupHeaderCustomDragEndListeners();

    if (event?.cancelable) {
        event.preventDefault();
    }

    event?.stopPropagation?.();

    manager.lastDragEndedAt = Date.now();
    const manualDrop = finishPresetVuePromptManualDrag(model, event);
    setPresetVuePromptDragging(model, false);
    manager.draggedPromptId = null;
    manager.draggedItem = null;
    manager.currentDropTargetGroupId = null;
    manager.currentTopLevelDropIndex = null;
    manager.groupHeaderCustomDrag = null;
    manager.groupHeaderGesture = null;
    manager.lastGroupHeaderGestureCanceledAt = Date.now();

    const modelChanged = consumePresetVuePromptDragChange(model);

    if (manualDrop || modelChanged) {
        schedulePresetVuePromptOrderSaveAfterDrop();
    }
}

function cancelPresetVuePromptGroupHeaderCustomDrag(
    manager = getPresetVuePromptListManagerState(),
    { suppress = true } = {},
) {
    stopPresetVuePromptGroupHeaderCustomDragEndListeners();

    if (manager.groupHeaderGesture) {
        clearPresetVuePromptGroupHeaderGestureTimer(manager.groupHeaderGesture);
    }

    if (manager.groupHeaderCustomDrag) {
        manager.dragSnapshot = null;
        setPresetVuePromptDragging(manager.state, false);
    }

    clearPresetVuePromptDragReadyFeedback(manager);
    manager.groupHeaderCustomDrag = null;
    manager.groupHeaderGesture = null;

    if (suppress) {
        manager.lastGroupHeaderGestureCanceledAt = Date.now();
    }
}

function showPresetVuePromptDragReadyFeedback(manager, { notify = true } = {}) {
    if (manager.dragReadyFeedbackTimer) {
        clearTimeout(manager.dragReadyFeedbackTimer);
        manager.dragReadyFeedbackTimer = null;
    }

    if (manager.dragReadyFeedbackElement instanceof HTMLElement) {
        manager.dragReadyFeedbackElement.classList.add(PRESET_VUE_DRAG_READY_FEEDBACK_CLASS);
    }

    if (notify && !manager.dragReadyFeedbackNotified) {
        manager.dragReadyFeedbackNotified = true;
        vibratePresetVuePromptDragFeedback();
    }
}

function clearPresetVuePromptDragReadyFeedback(manager = getPresetVuePromptListManagerState()) {
    if (manager.dragReadyFeedbackTimer) {
        clearTimeout(manager.dragReadyFeedbackTimer);
        manager.dragReadyFeedbackTimer = null;
    }

    if (manager.dragReadyFeedbackElement instanceof HTMLElement) {
        manager.dragReadyFeedbackElement.classList.remove(PRESET_VUE_DRAG_READY_FEEDBACK_CLASS);
    }

    manager.dragReadyFeedbackElement = null;
    manager.dragReadyFeedbackNotified = false;
}

function renderPresetVuePromptGroupBody(h, vueDraggableNext, item, draggableProps) {
    const model = getPresetVuePromptListManagerState().state;
    const mounted = isPresetVuePromptGroupBodyMounted(model, item);

    return h('div', {
        class: 'bai-bai-preset-group-body',
        'aria-hidden': item.collapsed ? 'true' : 'false',
    }, [
        h('div', { class: 'bai-bai-preset-group-body-inner' }, mounted ? [
            h(vueDraggableNext.VueDraggableNext, draggableProps, {
                default: () => (item.children ?? []).map(child => renderPresetVuePromptRow(h, child, { groupChild: true })),
            }),
        ] : []),
    ]);
}

function installPresetVueDynamicDragDelayHandlers() {
    if (extensionState[PRESET_VUE_DYNAMIC_DRAG_DELAY_HANDLER_KEY]) {
        return;
    }

    const handler = event => configurePresetVueSortableDragDelayForEvent(event);

    document.addEventListener('pointerdown', handler, true);
    document.addEventListener('touchstart', handler, true);
    extensionState[PRESET_VUE_DYNAMIC_DRAG_DELAY_HANDLER_KEY] = { handler };
}

function removePresetVueDynamicDragDelayHandlers() {
    const state = extensionState[PRESET_VUE_DYNAMIC_DRAG_DELAY_HANDLER_KEY];

    if (!state?.handler) {
        return;
    }

    document.removeEventListener('pointerdown', state.handler, true);
    document.removeEventListener('touchstart', state.handler, true);
    delete extensionState[PRESET_VUE_DYNAMIC_DRAG_DELAY_HANDLER_KEY];
}

function configurePresetVueSortableDragDelayForEvent(event) {
    if (!isMobile()) {
        return;
    }

    if (isPresetVuePromptDragLocked()) {
        return;
    }

    if (getPresetVuePromptListManagerState().state?.rangeSelection?.active) {
        return;
    }

    const target = event.target instanceof Element ? event.target : null;

    if (!target) {
        return;
    }

    const list = target.closest(`${PRESET_PROMPT_MANAGER_LIST_SELECTOR}, .bai-bai-preset-group-list`);

    if (!(list instanceof HTMLElement)) {
        return;
    }

    const sortable = getPresetVueSortableInstance(list);

    if (!sortable || typeof sortable.option !== 'function') {
        return;
    }

    const immediateHandle = Boolean(target.closest('.drag-handle'));
    const threshold = immediateHandle
        ? PRESET_VUE_POINTER_START_THRESHOLD_PX
        : PRESET_VUE_TOUCH_START_THRESHOLD_PX;

    sortable.option('delay', immediateHandle ? 0 : PRESET_VUE_TOUCH_DRAG_DELAY_MS);
    sortable.option('touchStartThreshold', threshold);
    sortable.option('fallbackTolerance', threshold);
}

function getPresetVueSortableInstance(element) {
    for (const key of Object.keys(element)) {
        const value = element[key];

        if (key.startsWith('Sortable') && value && typeof value.option === 'function') {
            return value;
        }
    }

    return null;
}

function applyPresetVueDragGestureOptions(draggableProps) {
    if (isMobile()) {
        Object.assign(draggableProps, {
            delay: PRESET_VUE_TOUCH_DRAG_DELAY_MS,
            delayOnTouchOnly: true,
            touchStartThreshold: PRESET_VUE_TOUCH_START_THRESHOLD_PX,
            fallbackTolerance: PRESET_VUE_TOUCH_START_THRESHOLD_PX,
        });
        return;
    }

    Object.assign(draggableProps, {
        touchStartThreshold: PRESET_VUE_POINTER_START_THRESHOLD_PX,
        fallbackTolerance: PRESET_VUE_POINTER_START_THRESHOLD_PX,
    });
}

function notifyPresetVuePromptDragStarted() {
    const manager = getPresetVuePromptListManagerState();

    if (manager.dragReadyFeedbackNotified) {
        return;
    }

    vibratePresetVuePromptDragFeedback();
}

function vibratePresetVuePromptDragFeedback() {
    if (!isMobile() || typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') {
        return;
    }

    try {
        navigator.vibrate(12);
    } catch {
        // Some embedded webviews expose vibrate but reject it.
    }
}

function getPresetVuePromptDragHandleSelector() {
    if (isPresetVuePromptDragLocked()) {
        return '__bai_bai_preset_drag_locked__';
    }

    if (!isMobile()) {
        return '';
    }

    return settings.presetMobileWholeRowDragEnabled
        ? 'li.completion_prompt_manager_prompt_draggable'
        : '.drag-handle';
}

function setPresetVuePromptDragging(model, dragging) {
    if (!model) {
        if (!dragging) {
            clearPresetVuePromptDragReadyFeedback();
            clearPresetVuePromptManualDragState();
            clearPresetVuePromptDropTarget();
            setPresetVuePromptDragScrollGuardEnabled(false);
            document.body?.classList.remove(PRESET_VUE_DRAGGING_BODY_CLASS);
            getPromptManagerListElement()?.classList.remove(PRESET_DRAG_ACTIVE_CLASS);
        }
        return;
    }

    if (dragging) {
        cancelPresetVuePromptBodyHeightAnimations();
        closePresetPromptActionMenus();
        clearPromptManagerCustomDragPending();
        disablePromptManagerStockSortable(getPromptManagerListElement());
    }

    model.dragging = Boolean(dragging);
    document.body?.classList.toggle(PRESET_VUE_DRAGGING_BODY_CLASS, model.dragging);
    getPromptManagerListElement()?.classList.toggle(PRESET_DRAG_ACTIVE_CLASS, model.dragging);
    setPresetVuePromptDragScrollGuardEnabled(model.dragging);

    if (!model.dragging) {
        clearPresetVuePromptDragReadyFeedback();
        clearPresetVuePromptManualDragState();
        clearPresetVuePromptDropTarget();
    }

    if (!model.dragging && extensionState.promptManagerTokenRefreshPendingAfterDrag) {
        extensionState.promptManagerTokenRefreshPendingAfterDrag = false;
        refreshPromptManagerTokensDebounced();
    }
}

function setPresetVuePromptDragScrollGuardEnabled(enabled) {
    if (!isMobile()) {
        return;
    }

    const existing = extensionState[PRESET_VUE_TOUCH_SCROLL_GUARD_KEY];

    if (enabled) {
        if (existing?.touchmove) {
            return;
        }

        const touchmove = event => {
            if (!isPresetVuePromptListDragging()) {
                return;
            }

            if (event.cancelable) {
                event.preventDefault();
            }
        };

        document.addEventListener('touchmove', touchmove, { capture: true, passive: false });
        extensionState[PRESET_VUE_TOUCH_SCROLL_GUARD_KEY] = { touchmove };
        return;
    }

    if (!existing?.touchmove) {
        return;
    }

    document.removeEventListener('touchmove', existing.touchmove, true);
    delete extensionState[PRESET_VUE_TOUCH_SCROLL_GUARD_KEY];
}

function renderPresetVuePromptRow(h, item, { topLevel = false, groupChild = false, favoriteMirror = false } = {}) {
    const prefix = promptManager?.configuration?.prefix ?? '';
    const prompt = item.prompt;
    const isEnabled = item.enabled !== false && item.orderEntry?.enabled !== false;
    const markerClass = prompt.marker ? `${prefix}prompt_manager_marker` : '';
    const importantClass = getPromptImportantClass(prompt, prefix);
    const manager = getPresetVuePromptListManagerState();
    const rangeClasses = favoriteMirror ? [] : getPresetVuePromptRangeClasses(manager.state, item);

    return h('li', {
        class: [
            `${prefix}prompt_manager_prompt`,
            favoriteMirror ? 'bai-bai-preset-favorite-prompt' : `${prefix}prompt_manager_prompt_draggable`,
            topLevel ? PRESET_VUE_TOP_LEVEL_DRAGGABLE_CLASS : '',
            groupChild ? PRESET_VUE_GROUP_CHILD_DRAGGABLE_CLASS : '',
            isEnabled ? '' : `${prefix}prompt_manager_prompt_disabled`,
            markerClass,
            importantClass,
            ...rangeClasses,
        ],
        'data-pm-identifier': prompt.identifier,
        'data-preset-group-id': item.groupId || '',
        'data-preset-favorite-mirror': favoriteMirror ? 'true' : undefined,
        key: favoriteMirror ? `favorite:${prompt.identifier}` : prompt.identifier,
        onClickCapture: favoriteMirror ? undefined : event => handlePresetVuePromptRangeSelectionClick(manager.state, item, event),
        onClick: favoriteMirror ? undefined : event => handlePresetVuePromptRangeSelectionClick(manager.state, item, event),
        onMouseenter: favoriteMirror ? undefined : () => updatePresetVuePromptRangeSelectionHover(manager.state, item),
    }, [
        favoriteMirror
            ? h('span', {
                class: 'drag-handle ui-sortable-handle bai-bai-preset-favorite-row-marker',
                title: t`收藏快捷项不可拖拽`,
            }, '\u2630')
            : h('span', { class: 'drag-handle ui-sortable-handle' }, '\u2630'),
        renderPresetVuePromptNameCell(h, prompt, prefix, { allowInspect: !favoriteMirror }),
        h('span', null, [
            h('span', { class: 'prompt_manager_prompt_controls' }, renderPresetVuePromptControls(h, prompt, item, { favoriteMirror })),
        ]),
        h('span', {
            class: 'prompt_manager_prompt_tokens',
            'data-pm-tokens': item.calculatedTokens,
        }, [
            h('span', {
                class: item.warningClass,
                title: item.warningTitle,
            }, ' '),
            item.calculatedTokens,
        ]),
    ]);
}

function renderPresetVuePromptNameCell(h, prompt, prefix, { allowInspect = true } = {}) {
    const promptName = prompt.name ?? '';
    const isMarkerPrompt = prompt.marker && prompt.injection_position !== INJECTION_POSITION.ABSOLUTE;
    const isSystemPrompt = !prompt.marker && prompt.system_prompt && prompt.injection_position !== INJECTION_POSITION.ABSOLUTE && !prompt.forbid_overrides;
    const isImportantPrompt = !prompt.marker && prompt.system_prompt && prompt.injection_position !== INJECTION_POSITION.ABSOLUTE && prompt.forbid_overrides;
    const isUserPrompt = !prompt.marker && !prompt.system_prompt && prompt.injection_position !== INJECTION_POSITION.ABSOLUTE;
    const isInjectionPrompt = prompt.injection_position === INJECTION_POSITION.ABSOLUTE;
    const isOverriddenPrompt = Array.isArray(promptManager.overriddenPrompts) && promptManager.overriddenPrompts.includes(prompt.identifier);
    const iconLookup = prompt.role === 'system' && (prompt.marker || prompt.system_prompt) ? '' : prompt.role;
    const promptRoles = {
        assistant: { roleIcon: 'fa-robot', roleTitle: 'Prompt will be sent as Assistant' },
        user: { roleIcon: 'fa-user', roleTitle: 'Prompt will be sent as User' },
    };
    const role = promptRoles[iconLookup];
    const children = [];

    if (isMarkerPrompt) children.push(renderPresetVueIcon(h, 'fa-fw fa-solid fa-thumb-tack', 'Marker'), ' ');
    if (isSystemPrompt) children.push(renderPresetVueIcon(h, 'fa-fw fa-solid fa-square-poll-horizontal', 'Global Prompt'), ' ');
    if (isImportantPrompt) children.push(renderPresetVueIcon(h, 'fa-fw fa-solid fa-star', 'Important Prompt'), ' ');
    if (isUserPrompt) children.push(renderPresetVueIcon(h, 'fa-fw fa-solid fa-asterisk', 'Preset Prompt'), ' ');
    if (isInjectionPrompt) children.push(renderPresetVueIcon(h, 'fa-fw fa-solid fa-syringe', 'In-Chat Injection'), ' ');

    const canInspect = promptManager.isPromptInspectionAllowed?.(prompt);
    children.push(allowInspect && canInspect
        ? h('a', { title: promptName, class: 'prompt-manager-inspect-action' }, promptName)
        : h('span', {
            title: promptName,
            class: canInspect ? 'prompt-manager-inspect-action bai-bai-preset-prompt-name-visual-only' : '',
        }, promptName));

    if (role) {
        children.push(' ', h('span', {
            'data-role': prompt.role,
            class: `fa-xs fa-solid ${role.roleIcon}`,
            title: role.roleTitle,
        }));
    }

    if (isInjectionPrompt) {
        children.push(' ', h('small', { class: 'prompt-manager-injection-depth' }, `@ ${prompt.injection_depth?.toString?.() ?? ''}`));
    }

    if (isOverriddenPrompt) {
        children.push(' ', h('small', {
            class: 'fa-solid fa-address-card prompt-manager-overridden',
            title: 'Pulled from a character card',
        }));
    }

    return h('span', {
        class: `${prefix}prompt_manager_prompt_name`,
        'data-pm-name': promptName,
    }, children);
}

function renderPresetVueIcon(h, className, title) {
    return h('span', { class: className, title });
}

function getPresetPromptGroupState() {
    const presetName = getPresetPromptGroupRuntimePresetName();

    if (
        extensionState.presetPromptGroupRuntimePresetName !== presetName
        || !extensionState.presetPromptGroupRuntimeState
        || typeof extensionState.presetPromptGroupRuntimeState !== 'object'
    ) {
        const loaded = loadCurrentPresetPromptGroupStateFromPreset();
        extensionState.presetPromptGroupRuntimePresetName = presetName;
        extensionState.presetPromptGroupRuntimeState = loaded.state;

        if (loaded.shouldPersist) {
            savePresetPromptGroupSettings({ immediate: true });
        }
    }

    return extensionState.presetPromptGroupRuntimeState;
}

function getPresetPromptGroupRuntimePresetName() {
    return oai_settings?.preset_settings_openai || 'current';
}

function createEmptyPresetPromptGroupState() {
    return {
        groups: [],
        prompts: {},
    };
}

function loadCurrentPresetPromptGroupStateFromPreset() {
    const validPromptIds = getCurrentPresetPromptOrderIds();
    const importedState = readCurrentPresetPromptGroupExtensionState(validPromptIds);

    if (importedState) {
        return {
            state: importedState,
            shouldPersist: false,
        };
    }

    const compatCandidates = getCompatPresetPromptGroupStateCandidates(validPromptIds);

    if (compatCandidates.length > 1) {
        schedulePresetPromptGroupCompatChoice(compatCandidates, validPromptIds);
        return {
            state: createEmptyPresetPromptGroupState(),
            shouldPersist: false,
        };
    }

    const compatCandidate = compatCandidates[0];

    if (compatCandidate) {
        return {
            state: compatCandidate.state,
            shouldPersist: true,
        };
    }

    return {
        state: createEmptyPresetPromptGroupState(),
        shouldPersist: false,
    };
}

function hasPresetPromptGroupStateData(state) {
    return Boolean(
        Array.isArray(state?.groups) && state.groups.length > 0
        && state?.prompts && typeof state.prompts === 'object'
        && Object.keys(state.prompts).length > 0,
    );
}

function normalizePresetPromptGroupState(groupState, validPromptIds = null) {
    const seenGroupIds = new Set();
    groupState.groups = groupState.groups
        .filter(group => group && typeof group === 'object' && group.id)
        .map((group, index) => ({
            id: String(group.id),
            name: String(group.name || t`未命名分组`),
            order: Number.isFinite(Number(group.order)) ? Number(group.order) : index,
            collapsed: Boolean(group.collapsed),
            enabled: group.enabled !== false,
        }))
        .sort((a, b) => a.order - b.order)
        .filter(group => {
            if (seenGroupIds.has(group.id)) {
                return false;
            }

            seenGroupIds.add(group.id);
            return true;
        })
        .map((group, index) => ({ ...group, order: index }));

    const validGroupIds = new Set(groupState.groups.map(group => group.id));
    const normalizedPrompts = {};

    for (const [promptId, meta] of Object.entries(groupState.prompts ?? {})) {
        const groupId = meta?.groupId;

        if (!groupId || !validGroupIds.has(groupId)) {
            continue;
        }

        if (validPromptIds instanceof Set && !validPromptIds.has(promptId)) {
            continue;
        }

        normalizedPrompts[promptId] = { groupId };
    }

    groupState.prompts = normalizedPrompts;
}

function readCurrentPresetPromptGroupExtensionState(validPromptIds = getCurrentPresetPromptOrderIds()) {
    const value = readCurrentPresetExtensionField(PRESET_GROUP_EXTENSION_PATH);

    if (!value || typeof value !== 'object') {
        return null;
    }

    const groupState = {
        groups: Array.isArray(value.groups)
            ? structuredClone(value.groups)
            : [],
        prompts: value.prompts && typeof value.prompts === 'object' ? structuredClone(value.prompts) : {},
    };

    normalizePresetPromptGroupState(groupState, new Set(validPromptIds));
    return hasPresetPromptGroupStateData(groupState) ? groupState : null;
}

function getCompatPresetPromptGroupStateCandidates(validPromptIds = getCurrentPresetPromptOrderIds()) {
    const entryGrouping = readCurrentPresetExtensionField(PRESET_COMPAT_ENTRY_GROUPING_EXTENSION_PATH);

    if (!entryGrouping || !validPromptIds.length) {
        return [];
    }

    return [
        {
            formatName: t`起止范围格式`,
            state: convertCompatEntryGroupingRangeToPresetPromptGroupState(entryGrouping, validPromptIds),
        },
        {
            formatName: t`成员列表格式`,
            state: convertCompatEntryGroupingMembersToPresetPromptGroupState(entryGrouping, validPromptIds),
        },
    ].filter(candidate => hasPresetPromptGroupStateData(candidate.state));
}

function getCompatEntryGroupingEntries(entryGrouping) {
    if (Array.isArray(entryGrouping)) {
        return entryGrouping;
    }

    if (!entryGrouping || typeof entryGrouping !== 'object') {
        return [];
    }

    for (const key of ['groups', 'entries', 'entryGroups', 'items']) {
        if (Array.isArray(entryGrouping[key])) {
            return entryGrouping[key];
        }
    }

    return [];
}

function convertCompatEntryGroupingRangeToPresetPromptGroupState(entryGrouping, promptIds = getCurrentPresetPromptOrderIds()) {
    const entries = getCompatEntryGroupingEntries(entryGrouping);

    if (!entries.length || !promptIds.length) {
        return null;
    }

    const validPromptIds = new Set(promptIds);
    const groupState = {
        groups: [],
        prompts: {},
    };
    const assignedPromptIds = new Set();

    for (const [index, entry] of entries.entries()) {
        if (!entry || typeof entry !== 'object') {
            continue;
        }

        const startIndex = promptIds.indexOf(entry.startIdentifier);
        const endIndex = promptIds.indexOf(entry.endIdentifier);

        if (startIndex < 0 || endIndex < 0) {
            continue;
        }

        const exclusive = String(entry.mode || 'inclusive').toLowerCase() === 'exclusive';
        const from = Math.min(startIndex, endIndex) + (exclusive ? 1 : 0);
        const to = Math.max(startIndex, endIndex) - (exclusive ? 1 : 0);

        if (from > to) {
            continue;
        }

        const groupId = String(entry.id || uuidv4());
        groupState.groups.push({
            id: groupId,
            name: String(entry.name || t`未命名分组`),
            order: index,
            collapsed: true,
            enabled: true,
        });

        for (const promptId of promptIds.slice(from, to + 1)) {
            if (!validPromptIds.has(promptId) || assignedPromptIds.has(promptId)) {
                continue;
            }

            assignedPromptIds.add(promptId);
            groupState.prompts[promptId] = { groupId };
        }
    }

    normalizePresetPromptGroupState(groupState, validPromptIds);
    return hasPresetPromptGroupStateData(groupState) ? groupState : null;
}

function convertCompatEntryGroupingMembersToPresetPromptGroupState(entryGrouping, promptIds = getCurrentPresetPromptOrderIds()) {
    const entries = getCompatEntryGroupingEntries(entryGrouping);

    if (!entries.length || !promptIds.length) {
        return null;
    }

    const validPromptIds = new Set(promptIds);
    const groupState = {
        groups: [],
        prompts: {},
    };
    const assignedPromptIds = new Set();

    for (const [index, entry] of entries.entries()) {
        if (!entry || typeof entry !== 'object' || !Array.isArray(entry.memberIdentifiers)) {
            continue;
        }

        const memberIds = entry.memberIdentifiers
            .map(identifier => String(identifier || ''))
            .filter(identifier => validPromptIds.has(identifier) && !assignedPromptIds.has(identifier));

        if (!memberIds.length) {
            continue;
        }

        const memberIdSet = new Set(memberIds);
        const groupId = String(entry.id || uuidv4());
        groupState.groups.push({
            id: groupId,
            name: String(entry.name || t`未命名分组`),
            order: index,
            collapsed: true,
            enabled: true,
        });

        for (const promptId of promptIds) {
            if (!memberIdSet.has(promptId)) {
                continue;
            }

            assignedPromptIds.add(promptId);
            groupState.prompts[promptId] = { groupId };
        }
    }

    normalizePresetPromptGroupState(groupState, validPromptIds);
    return hasPresetPromptGroupStateData(groupState) ? groupState : null;
}

function schedulePresetPromptGroupCompatChoice(candidates, validPromptIds = getCurrentPresetPromptOrderIds()) {
    const presetName = getPresetPromptGroupRuntimePresetName();
    const choiceKey = getPresetPromptGroupCompatChoiceKey(presetName, candidates, validPromptIds);

    if (
        extensionState.presetPromptGroupCompatChoicePendingKey === choiceKey
        || extensionState.presetPromptGroupCompatChoiceDismissedKey === choiceKey
    ) {
        return false;
    }

    extensionState.presetPromptGroupCompatChoicePendingKey = choiceKey;
    void choosePresetPromptGroupCompatCandidate(candidates, validPromptIds, presetName, choiceKey);
    return true;
}

function getPresetPromptGroupCompatChoiceKey(presetName, candidates, validPromptIds) {
    const candidateKey = candidates
        .map(candidate => {
            const groupNames = candidate.state.groups.map(group => group.name).join(',');
            return `${candidate.formatName}:${candidate.state.groups.length}:${Object.keys(candidate.state.prompts).length}:${groupNames}`;
        })
        .join('|');

    return `${presetName}:${validPromptIds.length}:${candidateKey}`;
}

async function choosePresetPromptGroupCompatCandidate(candidates, validPromptIds, presetName, choiceKey) {
    try {
        const popupResult = await callGenericPopup(
            renderPresetPromptGroupCompatChoicePopup(candidates),
            POPUP_TYPE.TEXT,
            '',
            {
                okButton: false,
                cancelButton: t`取消`,
                allowVerticalScrolling: true,
                wider: true,
                customButtons: candidates.map((candidate, index) => ({
                    text: t`使用分组${getPresetPromptGroupCompatChoiceLetter(index)}`,
                    result: PRESET_GROUP_COMPAT_CHOICE_RESULT_BASE + index,
                    tooltip: candidate.formatName,
                })),
            },
        );
        const selectedIndex = Number(popupResult) - PRESET_GROUP_COMPAT_CHOICE_RESULT_BASE;
        const selectedCandidate = candidates[selectedIndex];

        if (!selectedCandidate) {
            extensionState.presetPromptGroupCompatChoiceDismissedKey = choiceKey;
            return;
        }

        if (getPresetPromptGroupRuntimePresetName() !== presetName) {
            return;
        }

        extensionState.presetPromptGroupRuntimePresetName = presetName;
        extensionState.presetPromptGroupRuntimeState = selectedCandidate.state;
        normalizePresetPromptGroupState(extensionState.presetPromptGroupRuntimeState, new Set(validPromptIds));
        savePresetPromptGroupSettings({ immediate: true });
        syncPresetVuePromptListManagerState();
    } finally {
        if (extensionState.presetPromptGroupCompatChoicePendingKey === choiceKey) {
            delete extensionState.presetPromptGroupCompatChoicePendingKey;
        }
    }
}

function renderPresetPromptGroupCompatChoicePopup(candidates) {
    const lines = candidates
        .map((candidate, index) => {
            const letter = getPresetPromptGroupCompatChoiceLetter(index);
            const groups = candidate.state.groups ?? [];
            const groupNames = groups.map(group => group.name).filter(Boolean);
            const previewNames = groupNames.slice(0, 6).map(name => escapeHtml(name));
            const suffix = groupNames.length > previewNames.length ? '...' : '';
            const preview = [...previewNames, suffix].filter(Boolean).join('、') || t`无`;

            return `<p><strong>${t`分组`}${letter}</strong>${t`有${groups.length}个分组`}：${preview}</p>`;
        })
        .join('');

    return `
        <div class="bai-bai-preset-group-import-choice">
            <p>${t`检测到当前预设同时包含两种可兼容的分组格式，请选择要导入的分组。`}</p>
            ${lines}
        </div>
    `;
}

function getPresetPromptGroupCompatChoiceLetter(index) {
    return String.fromCharCode(65 + index);
}

function getCurrentPresetPromptOrderIds() {
    return (promptManager?.getPromptOrderForCharacter?.(promptManager.activeCharacter) ?? [])
        .map(entry => entry?.identifier)
        .filter(Boolean);
}

function createEmptyPresetGlobalPromptLibrary() {
    return {
        version: PRESET_GLOBAL_LIBRARY_VERSION,
        items: [],
        groups: [],
    };
}

function normalizePresetGlobalPromptLibrary(value) {
    const sourceItems = Array.isArray(value)
        ? value
        : Array.isArray(value?.items)
            ? value.items
            : [];
    const sourceGroups = Array.isArray(value?.groups) ? value.groups : [];
    const groups = normalizePresetGlobalPromptLibraryGroups(sourceGroups);
    const validGroupIds = new Set(groups.map(group => group.id));

    return {
        version: PRESET_GLOBAL_LIBRARY_VERSION,
        items: normalizePresetGlobalPromptLibraryItems(sourceItems, validGroupIds),
        groups,
    };
}

function normalizePresetGlobalPromptLibraryGroups(groups) {
    if (!Array.isArray(groups)) {
        return [];
    }

    const seenIds = new Set();
    const normalizedGroups = [];

    for (const group of groups) {
        if (!group || typeof group !== 'object') {
            continue;
        }

        let id = String(group.id || '').trim();

        if (!id || seenIds.has(id)) {
            id = uuidv4();
        }

        seenIds.add(id);
        normalizedGroups.push({
            id,
            name: normalizePresetGlobalPromptLibraryName(group.name),
            collapsed: Boolean(group.collapsed),
        });
    }

    return normalizedGroups;
}

function normalizePresetGlobalPromptLibraryItems(items, validGroupIds = null) {
    if (!Array.isArray(items)) {
        return [];
    }

    const seenIds = new Set();
    const normalizedItems = [];

    for (const item of items) {
        if (!item || typeof item !== 'object') {
            continue;
        }

        let id = String(item.id || '').trim();

        if (!id || seenIds.has(id)) {
            id = uuidv4();
        }

        seenIds.add(id);

        const rawGroupId = String(item.groupId || '').trim();
        const groupId = rawGroupId && (!validGroupIds || validGroupIds.has(rawGroupId))
            ? rawGroupId
            : null;

        normalizedItems.push({
            id,
            name: normalizePresetGlobalPromptLibraryName(item.name),
            content: typeof item.content === 'string' ? item.content : String(item.content ?? ''),
            groupId,
        });
    }

    return normalizedItems;
}

function normalizePresetGlobalPromptLibraryName(name) {
    return String(name || '').trim() || t`未命名条目`;
}

async function ensureBaiBaoKuBridge() {
    const existing = globalThis.BaiBaoKu;

    if (existing && typeof existing.database === 'function') {
        return existing;
    }

    if (typeof document === 'undefined') {
        throw new Error('BaiBaoKu frontend bridge is not available.');
    }

    const manager = getPresetVuePromptListManagerState();

    if (manager.globalLibraryBridgePromise) {
        return manager.globalLibraryBridgePromise;
    }

    manager.globalLibraryBridgePromise = new Promise((resolve, reject) => {
        let settled = false;
        let timeoutId = null;

        const settle = (callback, value) => {
            if (settled) {
                return;
            }

            settled = true;
            window.removeEventListener('baibaoku:ready', handleReady);

            if (timeoutId) {
                clearTimeout(timeoutId);
            }

            callback(value);
        };
        const handleReady = event => {
            const bridge = event?.detail || globalThis.BaiBaoKu;

            if (bridge && typeof bridge.database === 'function') {
                settle(resolve, bridge);
            }
        };
        const script = document.createElement('script');

        script.src = '/api/plugins/baibaoku/v1/client.js';
        script.async = true;
        script.dataset.baiBaiToolkitBaibaokuClient = 'true';
        script.addEventListener('load', () => {
            const bridge = globalThis.BaiBaoKu;

            if (bridge && typeof bridge.database === 'function') {
                settle(resolve, bridge);
            }
        }, { once: true });
        script.addEventListener('error', () => {
            settle(reject, new Error('Failed to load BaiBaoKu frontend bridge.'));
        }, { once: true });

        window.addEventListener('baibaoku:ready', handleReady);
        timeoutId = setTimeout(() => {
            const bridge = globalThis.BaiBaoKu;

            if (bridge && typeof bridge.database === 'function') {
                settle(resolve, bridge);
                return;
            }

            settle(reject, new Error('BaiBaoKu frontend bridge timed out.'));
        }, 5000);

        document.head.appendChild(script);
    }).finally(() => {
        manager.globalLibraryBridgePromise = null;
    });

    return manager.globalLibraryBridgePromise;
}

async function getPresetGlobalPromptLibraryDatabase() {
    const bridge = await ensureBaiBaoKuBridge();

    if (typeof bridge.isAvailable === 'function' && !await bridge.isAvailable()) {
        throw new Error('BaiBaoKu backend is not available.');
    }

    const database = bridge.database(PRESET_GLOBAL_LIBRARY_DATABASE);

    if (!database || typeof database.get !== 'function' || typeof database.set !== 'function') {
        throw new Error('BaiBaoKu database API is not available.');
    }

    return database;
}

function setPresetGlobalPromptLibraryRuntimeState(library, { loaded = true, loading = false, error = null } = {}) {
    const manager = getPresetVuePromptListManagerState();
    const normalized = normalizePresetGlobalPromptLibrary(library);

    manager.globalLibraryItems = normalized.items;
    manager.globalLibraryGroups = normalized.groups;
    manager.globalLibraryLoaded = loaded;
    manager.globalLibraryLoading = loading;
    manager.globalLibraryError = error;
    pruneGlobalLibrarySelectionToItems(manager);

    syncPresetVuePromptListManagerState();
    return normalized;
}

function pruneGlobalLibrarySelectionToItems(manager = getPresetVuePromptListManagerState()) {
    const selectedIds = getPresetGlobalLibrarySelectedIds(manager);

    if (selectedIds.size === 0) {
        return;
    }

    const validIds = new Set(
        normalizePresetGlobalPromptLibraryItems(manager.globalLibraryItems).map(item => item.id),
    );

    for (const id of Array.from(selectedIds)) {
        if (!validIds.has(id)) {
            selectedIds.delete(id);
        }
    }
}

async function loadPresetGlobalPromptLibrary({ force = false, showLoading = true } = {}) {
    const manager = getPresetVuePromptListManagerState();

    if (!force && manager.globalLibraryLoaded) {
        return normalizePresetGlobalPromptLibrary({ items: manager.globalLibraryItems, groups: manager.globalLibraryGroups });
    }

    if (!force && manager.globalLibraryLoadPromise) {
        return manager.globalLibraryLoadPromise;
    }

    manager.globalLibraryError = null;

    if (showLoading) {
        manager.globalLibraryLoading = true;
        syncPresetVuePromptListManagerState();
    }

    manager.globalLibraryLoadPromise = (async () => {
        try {
            const database = await getPresetGlobalPromptLibraryDatabase();
            const result = await database.get(PRESET_GLOBAL_LIBRARY_STORE, PRESET_GLOBAL_LIBRARY_KEY);
            const library = normalizePresetGlobalPromptLibrary(result?.exists ? result.value : createEmptyPresetGlobalPromptLibrary());

            setPresetGlobalPromptLibraryRuntimeState(library, { loaded: true, loading: false, error: null });
            return library;
        } catch (error) {
            manager.globalLibraryLoading = false;
            manager.globalLibraryLoaded = false;
            manager.globalLibraryError = error?.message || String(error);
            syncPresetVuePromptListManagerState();
            throw error;
        } finally {
            manager.globalLibraryLoadPromise = null;
        }
    })();

    return manager.globalLibraryLoadPromise;
}

async function updatePresetGlobalPromptLibrary(mutator) {
    const manager = getPresetVuePromptListManagerState();
    const previousSave = manager.globalLibrarySavePromise || Promise.resolve();
    const run = async () => {
        const currentLibrary = await loadPresetGlobalPromptLibrary({ force: true, showLoading: false });
        const draft = normalizePresetGlobalPromptLibrary(currentLibrary);
        const nextLibrary = normalizePresetGlobalPromptLibrary(await mutator(draft) || draft);
        const database = await getPresetGlobalPromptLibraryDatabase();

        await database.set(PRESET_GLOBAL_LIBRARY_STORE, PRESET_GLOBAL_LIBRARY_KEY, nextLibrary);
        setPresetGlobalPromptLibraryRuntimeState(nextLibrary, { loaded: true, loading: false, error: null });
        return nextLibrary;
    };

    const savePromise = previousSave.then(run, run);
    const trackedPromise = savePromise.finally(() => {
        if (manager.globalLibrarySavePromise === trackedPromise) {
            manager.globalLibrarySavePromise = null;
        }
    });

    manager.globalLibrarySavePromise = trackedPromise;
    return manager.globalLibrarySavePromise;
}

async function getPresetGlobalPromptLibraryItem(itemId) {
    if (!itemId) {
        return null;
    }

    const library = await loadPresetGlobalPromptLibrary();
    return library.items.find(item => item.id === itemId) ?? null;
}

function getPresetGlobalLibraryDialogHost() {
    return document.querySelector('#completion_prompt_manager')
        || document.querySelector(OPENAI_SETTINGS_SELECTOR)
        || document.body;
}

function isPresetGlobalLibraryDialogOpen() {
    return (extensionState.presetGlobalLibraryDialogOpenCount ?? 0) > 0;
}

function beginPresetGlobalLibraryDialogOpen() {
    extensionState.presetGlobalLibraryDialogOpenCount = (extensionState.presetGlobalLibraryDialogOpenCount ?? 0) + 1;
}

function endPresetGlobalLibraryDialogOpen() {
    const next = (extensionState.presetGlobalLibraryDialogOpenCount ?? 0) - 1;
    extensionState.presetGlobalLibraryDialogOpenCount = Math.max(0, next);

    if (extensionState.presetGlobalLibraryDialogOpenCount > 0) {
        return;
    }

    if (extensionState.presetPromptListRebuildDeferredByDialog) {
        extensionState.presetPromptListRebuildDeferredByDialog = false;

        if (settings.presetSwitchOptimizationEnabled && isPromptManagerReadyForFastPresetSwitch()) {
            void renderPromptManagerListWithoutTokenStats();
        }
    }
}

function shouldAutoFocusPresetGlobalLibraryDialog() {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
        return true;
    }

    return !window.matchMedia('(pointer: coarse)').matches;
}

function isPresetGlobalLibraryDialogMobileLayout() {
    return Boolean(
        typeof window !== 'undefined'
        && typeof window.matchMedia === 'function'
        && window.matchMedia('(max-width: 600px)').matches
    );
}

function clearPresetGlobalLibraryDialogLayerBounds(layer) {
    if (!(layer instanceof HTMLElement)) {
        return;
    }

    layer.style.removeProperty('--bai-bai-preset-global-library-dialog-top');
    layer.style.removeProperty('--bai-bai-preset-global-library-dialog-left');
    layer.style.removeProperty('--bai-bai-preset-global-library-dialog-width');
    layer.style.removeProperty('--bai-bai-preset-global-library-dialog-height');
}

function updatePresetGlobalLibraryDialogLayerBounds(host, layer) {
    if (!(host instanceof HTMLElement) || !(layer instanceof HTMLElement)) {
        return;
    }

    if (isPresetGlobalLibraryDialogMobileLayout()) {
        clearPresetGlobalLibraryDialogLayerBounds(layer);
        return;
    }

    const viewportWidth = window.innerWidth || document.documentElement?.clientWidth || 0;
    const viewportHeight = window.innerHeight || document.documentElement?.clientHeight || 0;

    if (!viewportWidth || !viewportHeight) {
        return;
    }

    const rect = host.getBoundingClientRect();
    const visibleVertically = rect.bottom > 0 && rect.top < viewportHeight;
    const visibleTop = visibleVertically ? Math.max(0, rect.top) : 0;
    const visibleBottom = visibleVertically ? Math.min(viewportHeight, rect.bottom) : viewportHeight;
    const width = Math.max(280, Math.min(rect.width || 420, viewportWidth));
    const left = Math.min(Math.max(0, rect.left), Math.max(0, viewportWidth - width));
    const availableHeight = Math.max(240, viewportHeight - visibleTop);
    const height = Math.min(availableHeight, Math.max(320, visibleBottom - visibleTop));
    const top = Math.min(visibleTop, Math.max(0, viewportHeight - height));

    layer.style.setProperty('--bai-bai-preset-global-library-dialog-top', `${top}px`);
    layer.style.setProperty('--bai-bai-preset-global-library-dialog-left', `${left}px`);
    layer.style.setProperty('--bai-bai-preset-global-library-dialog-width', `${width}px`);
    layer.style.setProperty('--bai-bai-preset-global-library-dialog-height', `${height}px`);
}

function showPresetGlobalLibraryDialog({
    title,
    message = '',
    fields = [],
    confirmText = t`确定`,
    cancelText = t`取消`,
    danger = false,
} = {}) {
    const host = getPresetGlobalLibraryDialogHost();

    if (!(host instanceof HTMLElement)) {
        return Promise.resolve(null);
    }

    beginPresetGlobalLibraryDialogOpen();

    return new Promise(resolve => {
        const values = {};
        const previousHostPosition = host.style.position;
        const hadHostClass = host.classList.contains('bai-bai-preset-global-library-dialog-host');
        const layer = document.createElement('div');
        const dialog = document.createElement('div');
        const head = document.createElement('div');
        const titleElement = document.createElement('strong');
        const closeButton = document.createElement('span');
        const body = document.createElement('div');
        const actions = document.createElement('div');
        const cancelButton = document.createElement('span');
        const confirmButton = document.createElement('span');
        let updateDialogLayerBounds = null;

        let cleanedUp = false;
        const cleanup = result => {
            if (cleanedUp) {
                return;
            }
            cleanedUp = true;
            endPresetGlobalLibraryDialogOpen();
            document.removeEventListener('keydown', handleKeydown, true);

            if (updateDialogLayerBounds) {
                window.removeEventListener('resize', updateDialogLayerBounds);
                document.removeEventListener('scroll', updateDialogLayerBounds, true);
            }

            layer.remove();

            if (!hadHostClass && !host.querySelector('.bai-bai-preset-global-library-dialog-layer')) {
                host.classList.remove('bai-bai-preset-global-library-dialog-host');
                host.style.position = previousHostPosition;
            }

            resolve(result);
        };
        const confirm = () => cleanup({ ...values });
        const cancel = () => cleanup(null);
        const handleKeydown = event => {
            if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                cancel();
                return;
            }

            if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                event.preventDefault();
                event.stopPropagation();
                confirm();
            }
        };
        const stopPropagation = event => event.stopPropagation();

        host.classList.add('bai-bai-preset-global-library-dialog-host');
        layer.className = 'bai-bai-preset-global-library-dialog-layer';
        dialog.className = 'bai-bai-preset-global-library-dialog';
        dialog.tabIndex = -1;
        head.className = 'bai-bai-preset-global-library-dialog-head';
        body.className = 'bai-bai-preset-global-library-dialog-body';
        actions.className = 'bai-bai-preset-global-library-dialog-actions';
        titleElement.textContent = title || '';
        closeButton.className = 'menu_button fa-solid fa-xmark bai-bai-preset-global-library-dialog-button';
        closeButton.title = t`取消`;
        cancelButton.className = 'menu_button bai-bai-preset-global-library-dialog-button';
        cancelButton.textContent = cancelText;
        confirmButton.className = [
            'menu_button',
            'bai-bai-preset-global-library-dialog-button',
            danger ? 'bai-bai-preset-global-library-dialog-danger' : '',
        ].filter(Boolean).join(' ');
        confirmButton.textContent = confirmText;

        if (message) {
            const messageElement = document.createElement('div');

            messageElement.className = 'bai-bai-preset-global-library-dialog-message';
            messageElement.textContent = message;
            body.appendChild(messageElement);
        }

        for (const field of fields) {
            if (!field?.id) {
                continue;
            }

            const fieldWrapper = document.createElement('div');
            const label = document.createElement('label');
            let control = null;

            fieldWrapper.className = 'bai-bai-preset-global-library-dialog-field';
            label.textContent = field.label || field.id;
            label.setAttribute('for', `bai_bai_preset_global_library_${field.id}`);
            fieldWrapper.appendChild(label);

            if (field.type === 'textarea') {
                control = document.createElement('textarea');
                control.rows = Number(field.rows) || 8;
            } else if (field.type === 'select') {
                control = document.createElement('select');

                for (const option of field.options ?? []) {
                    const optionElement = document.createElement('option');

                    optionElement.value = String(option.value ?? '');
                    optionElement.textContent = String(option.label ?? option.value ?? '');
                    control.appendChild(optionElement);
                }
            } else {
                control = document.createElement('input');
                control.type = 'text';
            }

            control.id = `bai_bai_preset_global_library_${field.id}`;
            control.classList.add('text_pole');
            control.value = String(field.value ?? '');
            values[field.id] = control.value;
            control.addEventListener('input', () => {
                values[field.id] = control.value;
            });
            control.addEventListener('change', () => {
                values[field.id] = control.value;
            });
            fieldWrapper.appendChild(control);
            body.appendChild(fieldWrapper);
        }

        closeButton.addEventListener('click', cancel);
        cancelButton.addEventListener('click', cancel);
        confirmButton.addEventListener('click', confirm);
        layer.addEventListener('click', event => {
            if (event.target === layer) {
                cancel();
            }
        });
        dialog.addEventListener('mousedown', stopPropagation);
        dialog.addEventListener('pointerdown', stopPropagation);
        dialog.addEventListener('click', stopPropagation);
        document.addEventListener('keydown', handleKeydown, true);

        head.append(titleElement, closeButton);
        actions.append(cancelButton, confirmButton);
        dialog.append(head, body, actions);
        layer.appendChild(dialog);
        host.appendChild(layer);
        updateDialogLayerBounds = () => updatePresetGlobalLibraryDialogLayerBounds(host, layer);
        updateDialogLayerBounds();
        window.addEventListener('resize', updateDialogLayerBounds);
        document.addEventListener('scroll', updateDialogLayerBounds, true);

        if (shouldAutoFocusPresetGlobalLibraryDialog()) {
            dialog.focus({ preventScroll: true });
        }
    });
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

function readCurrentPresetExtensionField(path) {
    const settingsValue = getObjectPath(oai_settings?.extensions, path);

    if (settingsValue !== null && settingsValue !== undefined) {
        return settingsValue;
    }

    const presetName = oai_settings?.preset_settings_openai;
    const presetManager = getPresetManager('openai');

    if (presetManager && presetName) {
        const preset = presetManager.getCompletionPresetByName?.(presetName);
        const presetValue = getObjectPath(preset?.extensions, path);

        if (presetValue !== null && presetValue !== undefined) {
            return presetValue;
        }
    }

    return null;
}

function getObjectPath(source, path) {
    if (!source || typeof source !== 'object') {
        return null;
    }

    return String(path || '')
        .split('.')
        .filter(Boolean)
        .reduce((value, key) => (value && typeof value === 'object' ? value[key] : undefined), source) ?? null;
}

function setObjectPath(target, path, value) {
    if (!target || typeof target !== 'object') {
        return;
    }

    const parts = String(path || '').split('.').filter(Boolean);
    let cursor = target;

    for (let index = 0; index < parts.length - 1; index++) {
        const key = parts[index];

        if (!cursor[key] || typeof cursor[key] !== 'object') {
            cursor[key] = {};
        }

        cursor = cursor[key];
    }

    cursor[parts[parts.length - 1]] = value;
}

function savePresetPromptGroupSettings({ force = false } = {}) {
    const payload = getCurrentPresetPromptGroupExtensionPayload();
    const changed = syncCurrentPresetPromptGroupStateToPresetExtensionField({ force, persist: false, payload });

    if (changed) {
        markPresetPromptGroupSettingsSavePending(payload);
    }

    return changed;
}

function getCurrentPresetPromptGroupExtensionPayload() {
    const presetName = oai_settings?.preset_settings_openai;

    if (!presetName) {
        return null;
    }

    const promptIds = getCurrentPresetPromptOrderIds();

    if (!promptIds.length) {
        return null;
    }

    const groupState = getSerializableCurrentPresetPromptGroupState(promptIds);
    const existingPresetGroupState = readCurrentPresetExtensionField(PRESET_GROUP_EXTENSION_PATH);

    if (!hasPresetPromptGroupStateData(groupState) && !existingPresetGroupState) {
        return null;
    }

    const serialized = JSON.stringify(groupState);
    return {
        presetName,
        groupState,
        syncKey: `${presetName}:${serialized}`,
    };
}

function applyPresetPromptGroupExtensionPayloadToMemory(payload) {
    if (!payload) {
        return;
    }

    if (oai_settings?.preset_settings_openai === payload.presetName) {
        oai_settings.extensions = oai_settings.extensions && typeof oai_settings.extensions === 'object'
            ? oai_settings.extensions
            : {};
        setObjectPath(oai_settings.extensions, PRESET_GROUP_EXTENSION_PATH, payload.groupState);

        if (promptManager?.serviceSettings && typeof promptManager.serviceSettings === 'object') {
            promptManager.serviceSettings.extensions = promptManager.serviceSettings.extensions && typeof promptManager.serviceSettings.extensions === 'object'
                ? promptManager.serviceSettings.extensions
                : {};
            setObjectPath(promptManager.serviceSettings.extensions, PRESET_GROUP_EXTENSION_PATH, payload.groupState);
        }
    }

}

function syncCurrentPresetPromptGroupStateToPresetExtensionField({ force = false, persist = true, payload = null } = {}) {
    payload ||= getCurrentPresetPromptGroupExtensionPayload();

    if (!payload) {
        return false;
    }

    if (!force && persist && extensionState.presetPromptGroupExtensionSyncKey === payload.syncKey) {
        return false;
    }

    applyPresetPromptGroupExtensionPayloadToMemory(payload);

    if (persist) {
        extensionState.presetPromptGroupExtensionSyncKey = payload.syncKey;
    }

    return true;
}

async function flushCurrentPresetPromptGroupSettings({ force = false } = {}) {
    const payload = getCurrentPresetPromptGroupExtensionPayload();

    if (!payload) {
        return false;
    }

    if (!force && extensionState.presetPromptGroupExtensionSyncKey === payload.syncKey) {
        return false;
    }

    applyPresetPromptGroupExtensionPayloadToMemory(payload);
    extensionState.presetPromptGroupExtensionSyncKey = payload.syncKey;
    markOpenAiPresetSavePending(payload.presetName);
    await saveSettings();

    return true;
}

function getSerializableCurrentPresetPromptGroupState(promptIds = getCurrentPresetPromptOrderIds()) {
    const groupState = getPresetPromptGroupState();
    const serializable = {
        version: 1,
        groups: structuredClone(groupState.groups ?? []),
        prompts: structuredClone(groupState.prompts ?? {}),
    };

    normalizePresetPromptGroupState(serializable, new Set(promptIds));
    return serializable;
}

async function startPresetVuePromptGroupRangeSelection(model, { startId = null } = {}) {
    const promptIds = getPresetVuePromptFlatIds(model);

    if (promptIds.length === 0) {
        toastr.warning(t`没有可用于分组的预设条目。`);
        return;
    }

    if (startId && !promptIds.includes(startId)) {
        toastr.warning(t`不能将这个预设条目作为分组起点。`);
        return;
    }

    model.rangeSelection = {
        active: true,
        name: '',
        startId,
        endId: null,
        hoverId: startId,
    };
    getPresetVuePromptListManagerState().dragSnapshot = null;
    toastr.info(startId ? t`请选择分组的结束条目。` : t`请选择分组的起始条目。`);
}

function cancelPresetVuePromptGroupRangeSelection(model) {
    if (!model) {
        return;
    }

    model.rangeSelection = {
        active: false,
        name: '',
        startId: null,
        endId: null,
        hoverId: null,
    };
}

function handlePresetVuePromptRangeSelectionClick(model, item, event) {
    if (!model?.rangeSelection?.active || item?.type !== 'prompt') {
        return;
    }

    event.preventDefault?.();
    event.stopPropagation?.();
    event.stopImmediatePropagation?.();

    if (model.rangeSelection.endId) {
        return;
    }

    if (!model.rangeSelection.startId) {
        model.rangeSelection.startId = item.id;
        model.rangeSelection.hoverId = item.id;
        toastr.info(t`请选择分组的结束条目。`);
        return;
    }

    if (model.rangeSelection.startId === item.id && !model.rangeSelection.endId) {
        model.rangeSelection.startId = null;
        model.rangeSelection.hoverId = null;
        toastr.info(t`已取消起点选择，请重新选择分组的起始条目。`);
        return;
    }

    model.rangeSelection.endId = item.id;
    void finishPresetVuePromptGroupRangeSelection(model);
}

function updatePresetVuePromptRangeSelectionHover(model, item) {
    if (!model?.rangeSelection?.active || !model.rangeSelection.startId || model.rangeSelection.endId || item?.type !== 'prompt') {
        return;
    }

    model.rangeSelection.hoverId = item.id;
}

async function finishPresetVuePromptGroupRangeSelection(model) {
    const rangeIds = getPresetVuePromptRangeIds(model);

    if (rangeIds.length === 0) {
        toastr.warning(t`没有选中可分组的预设条目。`);
        cancelPresetVuePromptGroupRangeSelection(model);
        return;
    }

    const name = await callGenericPopup(t`预设分组名称`, POPUP_TYPE.INPUT, model.rangeSelection?.name || '', {
        okButton: t`创建分组`,
        cancelButton: t`取消`,
    });

    if (!model?.rangeSelection?.active) {
        return;
    }

    if (typeof name !== 'string') {
        model.rangeSelection.endId = null;
        return;
    }

    const trimmedName = name.trim();

    if (!trimmedName) {
        toastr.warning(t`分组名称不能为空。`);
        model.rangeSelection.endId = null;
        return;
    }

    const groupState = getPresetPromptGroupState();
    normalizePresetPromptGroupState(groupState, new Set(getPresetVuePromptFlatIds(model)));
    const groupId = uuidv4();
    model.rangeSelection.name = trimmedName;
    groupState.groups.push({
        id: groupId,
        name: trimmedName,
        order: groupState.groups.length,
        collapsed: true,
        enabled: true,
    });

    for (const promptId of rangeIds) {
        groupState.prompts[promptId] = { groupId };
    }

    removeUnusedPresetPromptGroups(groupState);
    getPresetVuePromptListManagerState().dragSnapshot = null;
    cancelPresetVuePromptGroupRangeSelection(model);
    savePresetPromptGroupSettings();
    syncPresetVuePromptListManagerState();
}

function getPresetVuePromptFlatIds(model = getPresetVuePromptListManagerState().state) {
    const seenPromptIds = new Set();
    const promptIds = [];

    for (const item of getPresetVuePromptItemsFromModel(model)) {
        if (!item?.id || seenPromptIds.has(item.id)) {
            continue;
        }

        seenPromptIds.add(item.id);
        promptIds.push(item.id);
    }

    return promptIds;
}

function getPresetVuePromptItemsFromModel(
    model = getPresetVuePromptListManagerState().state,
    { includeFavoriteMirrors = false } = {},
) {
    const promptItems = [];

    for (const item of model?.items ?? []) {
        if (item?.type === 'prompt') {
            promptItems.push(item);
            continue;
        }

        if (item?.type === 'favorites') {
            if (includeFavoriteMirrors) {
                promptItems.push(...(item.children ?? []).filter(child => child?.type === 'prompt'));
            }
            continue;
        }

        if (item?.type === 'global-library') {
            continue;
        }

        if (item?.type === 'group') {
            promptItems.push(...(item.children ?? []).filter(child => child?.type === 'prompt'));
        }
    }

    return promptItems;
}

function sanitizePresetVuePromptListModel(model) {
    if (!Array.isArray(model?.items)) {
        return false;
    }

    const nextItems = [];
    const seenPromptIds = new Set();
    const seenStaticIds = new Set();
    const groupById = new Map();
    let changed = false;

    const pushPromptOnce = (promptItem, targetItems, groupId = null) => {
        if (!promptItem?.id || promptItem.type !== 'prompt') {
            changed = true;
            return;
        }

        if (seenPromptIds.has(promptItem.id)) {
            changed = true;
            return;
        }

        seenPromptIds.add(promptItem.id);
        if ((promptItem.groupId ?? null) !== (groupId ?? null)) {
            promptItem.groupId = groupId ?? null;
            changed = true;
        }
        targetItems.push(promptItem);
    };

    for (const item of model.items) {
        if (
            item?.type === 'header'
            || item?.type === 'separator'
            || item?.type === 'global-library'
            || item?.type === 'favorites'
        ) {
            if (seenStaticIds.has(item.type)) {
                changed = true;
                continue;
            }

            seenStaticIds.add(item.type);
            nextItems.push(item);
            continue;
        }

        if (item?.type === 'prompt') {
            pushPromptOnce(item, nextItems, null);
            continue;
        }

        if (item?.type === 'group') {
            const children = Array.isArray(item.children) ? [...item.children] : [];

            if (!item.groupId) {
                changed = true;
                continue;
            }

            let groupItem = groupById.get(item.groupId);

            if (!groupItem) {
                groupItem = item;
                groupItem.children = [];
                groupById.set(item.groupId, groupItem);
                nextItems.push(groupItem);
            } else {
                changed = true;
            }

            for (const child of children) {
                pushPromptOnce(child, groupItem.children, item.groupId);
            }

            groupItem.count = groupItem.children.length;
            continue;
        }

        changed = true;
    }

    if (!changed && nextItems.length === model.items.length) {
        return false;
    }

    model.items = nextItems;
    return true;
}

function getPresetVuePromptRangeIds(model, { includeHover = false } = {}) {
    const selection = model?.rangeSelection;
    const rangeEndId = selection?.endId || (includeHover ? selection?.hoverId : null);

    if (!selection?.startId || !rangeEndId) {
        return [];
    }

    const ids = getPresetVuePromptFlatIds(model);
    const startIndex = ids.indexOf(selection.startId);
    const endIndex = ids.indexOf(rangeEndId);

    if (startIndex < 0 || endIndex < 0) {
        return [];
    }

    const from = Math.min(startIndex, endIndex);
    const to = Math.max(startIndex, endIndex);
    return ids.slice(from, to + 1);
}

function getPresetVuePromptRangeClasses(model, item) {
    const selection = model?.rangeSelection;

    if (!selection?.active || item?.type !== 'prompt') {
        return [];
    }

    const classes = ['bai-bai-preset-range-selectable'];

    if (selection.startId === item.id) {
        classes.push('bai-bai-preset-range-start');
    }

    if ((selection.endId || selection.hoverId) === item.id && selection.startId) {
        classes.push('bai-bai-preset-range-end');
    }

    const rangeIds = getPresetVuePromptRangeIds(model, { includeHover: true });

    if (rangeIds.includes(item.id)) {
        classes.push('bai-bai-preset-range-inside');
    }

    return classes;
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

function togglePresetVuePromptGlobalLibraryCollapsed() {
    const manager = getPresetVuePromptListManagerState();
    const model = manager.state;
    const nextCollapsed = !manager.globalLibraryCollapsed;
    const mountId = PRESET_VUE_GLOBAL_LIBRARY_ENTRY_ID;

    runPresetVuePromptBodyHeightTransition(mountId, !nextCollapsed, () => {
        manager.globalLibraryCollapsed = nextCollapsed;

        if (!nextCollapsed) {
            clearPresetVuePromptGroupBodyUnmountTimer(manager, mountId);
            setPresetVuePromptGroupBodyMounted(model, mountId, true);
        }

        const modelLibrary = model?.globalLibrary;

        if (modelLibrary) {
            modelLibrary.collapsed = nextCollapsed;
        }

        if (nextCollapsed) {
            schedulePresetVuePromptGroupBodyUnmount(mountId);
        }

        markPresetVuePromptListSyncSignatureCurrent();
    });
}

function togglePresetGlobalLibrarySelecting() {
    const manager = getPresetVuePromptListManagerState();
    manager.globalLibrarySelecting = !manager.globalLibrarySelecting;

    if (!manager.globalLibrarySelecting) {
        getPresetGlobalLibrarySelectedIds(manager).clear();
    }

    syncPresetVueGlobalLibrarySelectionState(manager.state);
}

function togglePresetGlobalLibrarySelectedItem(itemId) {
    if (!itemId) {
        return;
    }

    const manager = getPresetVuePromptListManagerState();
    const selectedIds = getPresetGlobalLibrarySelectedIds(manager);

    if (selectedIds.has(itemId)) {
        selectedIds.delete(itemId);
    } else {
        selectedIds.add(itemId);
    }

    syncPresetVueGlobalLibrarySelectionState(manager.state);
}

function getPresetGlobalLibrarySelectedItemIds() {
    const manager = getPresetVuePromptListManagerState();
    const selectedIds = getPresetGlobalLibrarySelectedIds(manager);
    // 按库内条目顺序返回,保证批量插入顺序稳定。
    return normalizePresetGlobalPromptLibraryItems(manager.globalLibraryItems)
        .map(item => item.id)
        .filter(id => selectedIds.has(id));
}

async function insertSelectedPresetGlobalLibraryItemsToCurrentPreset() {
    const ids = getPresetGlobalLibrarySelectedItemIds();

    if (ids.length === 0) {
        toastr.warning(t`请先选择要添加的条目。`);
        return;
    }

    const inserted = await insertPresetGlobalLibraryItemsToCurrentPreset(ids);

    if (inserted) {
        togglePresetGlobalLibrarySelecting();
    }
}

async function moveSelectedPresetGlobalLibraryItemsToGroup() {
    const ids = getPresetGlobalLibrarySelectedItemIds();

    if (ids.length === 0) {
        toastr.warning(t`请先选择要移动的条目。`);
        return;
    }

    const library = await loadPresetGlobalPromptLibrary();
    const result = await showPresetGlobalLibraryDialog({
        title: t`移动选中到分组`,
        fields: [{
            id: 'target',
            type: 'select',
            label: t`目标分组`,
            value: '',
            options: [
                { value: '', label: t`未分组` },
                ...library.groups.map(group => ({ value: group.id, label: group.name })),
            ],
        }],
        confirmText: t`移动`,
        cancelText: t`取消`,
    });

    if (!result) {
        return;
    }

    const targetGroupId = String(result.target || '').trim() || null;
    const idSet = new Set(ids);

    try {
        await updatePresetGlobalPromptLibrary(currentLibrary => {
            const validGroupIds = new Set(currentLibrary.groups.map(group => group.id));
            const groupId = targetGroupId && validGroupIds.has(targetGroupId) ? targetGroupId : null;
            currentLibrary.items = currentLibrary.items.map(item => idSet.has(item.id)
                ? { ...item, groupId }
                : item);
            return currentLibrary;
        });
        toastr.success(t`已移动 ${ids.length} 条。`);
        togglePresetGlobalLibrarySelecting();
    } catch (error) {
        console.debug(`${LOG_PREFIX} Failed to move selected global library items`, error);
        toastr.error(t`移动条目失败。`);
    }
}

async function deleteSelectedPresetGlobalLibraryItems() {
    const ids = getPresetGlobalLibrarySelectedItemIds();

    if (ids.length === 0) {
        toastr.warning(t`请先选择要删除的条目。`);
        return;
    }

    const confirmed = await showPresetGlobalLibraryDialog({
        title: t`删除选中`,
        message: t`要删除选中的 ${ids.length} 条全局库条目吗？`,
        confirmText: t`删除`,
        cancelText: t`取消`,
        danger: true,
    });

    if (!confirmed) {
        return;
    }

    const idSet = new Set(ids);

    try {
        await updatePresetGlobalPromptLibrary(currentLibrary => {
            currentLibrary.items = currentLibrary.items.filter(item => !idSet.has(item.id));
            return currentLibrary;
        });
        toastr.success(t`已删除 ${ids.length} 条。`);
        togglePresetGlobalLibrarySelecting();
    } catch (error) {
        console.debug(`${LOG_PREFIX} Failed to delete selected global library items`, error);
        toastr.error(t`删除条目失败。`);
    }
}

function togglePresetVuePromptGroupCollapsed(groupId) {
    const groupState = getPresetPromptGroupState();
    const group = groupState.groups.find(group => group.id === groupId);

    if (!group) {
        return;
    }

    const manager = getPresetVuePromptListManagerState();
    const model = manager.state;
    const nextCollapsed = !group.collapsed;

    runPresetVuePromptBodyHeightTransition(groupId, !nextCollapsed, () => {
        if (!nextCollapsed) {
            clearPresetVuePromptGroupBodyUnmountTimer(manager, groupId);
            setPresetVuePromptGroupBodyMounted(model, groupId, true);
        }

        group.collapsed = nextCollapsed;
        const modelGroup = model?.items?.find(item => item?.type === 'group' && item.groupId === groupId);

        if (modelGroup) {
            modelGroup.collapsed = group.collapsed;

            if (modelGroup.group) {
                modelGroup.group.collapsed = group.collapsed;
            }
        }

        if (nextCollapsed) {
            schedulePresetVuePromptGroupBodyUnmount(groupId);
        }

        savePresetPromptGroupSettings();
    });
}

function togglePresetVuePromptGroupEnabled(groupId) {
    const manager = getPresetVuePromptListManagerState();
    const groupState = getPresetPromptGroupState();
    const group = groupState.groups.find(group => group.id === groupId);

    if (!group) {
        return;
    }

    group.enabled = group.enabled === false;
    const groupItem = manager.state?.items?.find(item => item?.type === 'group' && item.groupId === groupId);

    if (groupItem) {
        groupItem.enabled = group.enabled;

        if (groupItem.group) {
            groupItem.group.enabled = group.enabled;
        }
    }

    updatePresetEffectiveTokenHeaderDisplay();
    savePresetPromptGroupSettings();
    refreshPromptManagerTokensDebounced();
}

async function renamePresetVuePromptGroup(groupId) {
    const groupState = getPresetPromptGroupState();
    const group = groupState.groups.find(group => group.id === groupId);

    if (!group) {
        return;
    }

    const name = await callGenericPopup(t`预设分组名称`, POPUP_TYPE.INPUT, group.name || '', {
        okButton: t`保存`,
        cancelButton: t`取消`,
    });

    if (typeof name !== 'string') {
        return;
    }

    const trimmedName = name.trim();

    if (!trimmedName) {
        toastr.warning(t`分组名称不能为空。`);
        return;
    }

    group.name = trimmedName;
    savePresetPromptGroupSettings();
    syncPresetVuePromptListManagerState();
}

async function deletePresetVuePromptGroup(groupId) {
    const groupState = getPresetPromptGroupState();
    const group = groupState.groups.find(group => group.id === groupId);

    if (!group) {
        return;
    }

    const confirmed = await callGenericPopup(t`要删除这个预设分组吗？预设条目会保留在原位置。`, POPUP_TYPE.CONFIRM);

    if (!confirmed) {
        return;
    }

    groupState.groups = groupState.groups.filter(group => group.id !== groupId);

    for (const [promptId, meta] of Object.entries(groupState.prompts ?? {})) {
        if (meta?.groupId === groupId) {
            delete groupState.prompts[promptId];
        }
    }

    normalizePresetPromptGroupState(groupState, new Set(getPresetVuePromptFlatIds()));
    savePresetPromptGroupSettings();
    syncPresetVuePromptListManagerState();
}

function renderPresetVuePromptControls(h, prompt, item, { favoriteMirror = false } = {}) {
    const canEdit = promptManager.isPromptEditAllowed?.(prompt) ?? (FORCE_EDIT_PROMPTS.has(prompt.identifier) || !prompt.marker);
    const canToggle = promptManager.isPromptToggleAllowed?.(prompt) ?? (
        prompt.marker && !FORCE_TOGGLE_PROMPTS.has(prompt.identifier)
            ? false
            : !(promptManager.configuration.toggleDisabled ?? []).includes(prompt.identifier)
    );
    const isEnabled = item.enabled !== false && item.orderEntry?.enabled !== false;
    const isFavorite = item.favorite !== false && (item.favorite || isCurrentPresetPromptFavorite(prompt.identifier));
    const favoriteToggle = renderPresetVuePromptActionButton(h, {
        action: 'favorite',
        icon: 'fa-star',
        text: isFavorite ? t`取消收藏` : t`收藏`,
        extraClasses: [
            'bai-bai-preset-prompt-favorite-toggle',
            isFavorite ? 'bai-bai-preset-prompt-favorite-toggle-active' : '',
        ],
        onClick: event => handlePresetPromptActionButtonClick(event),
    });
    const persistentFavoriteToggle = isFavorite
        ? renderPresetVuePromptActionButton(h, {
            action: 'favorite',
            icon: 'fa-star',
            text: t`取消收藏`,
            extraClasses: [
                'bai-bai-preset-prompt-favorite-toggle',
                'bai-bai-preset-prompt-favorite-toggle-active',
                'bai-bai-preset-prompt-favorite-toggle-persistent',
            ],
            onClick: event => handlePresetPromptActionButtonClick(event),
        })
        : null;
    const editButton = canEdit
        ? renderPresetVuePromptActionButton(h, {
            action: 'edit',
            icon: 'fa-pencil',
            text: t`编辑`,
            onClick: event => handlePresetPromptActionButtonClick(event),
        })
        : null;
    // 默认(关)时编辑按钮平铺在省略号菜单右侧,点一次即可编辑;开启时才收进收缩菜单。
    const editButtonInMenu = settings.presetGroupingEditButtonInMenuEnabled === true;

    const globalLibraryButton = renderPresetVuePromptActionButton(h, {
        action: 'global-library',
        icon: 'fa-database',
        text: t`添加到全局库`,
        onClick: event => handlePresetPromptActionButtonClick(event),
    });
    const groupRangeButton = isPresetGroupingEnabled() && !item.groupId
        ? renderPresetVuePromptActionButton(h, {
            action: 'group-range',
            icon: 'fa-folder-plus',
            text: t`以此条目创建分组`,
            onClick: event => handlePresetPromptActionButtonClick(event),
        })
        : null;

    if (favoriteMirror) {
        return [
            persistentFavoriteToggle,
            editButton,
            canToggle
                ? h('span', {
                    title: isEnabled ? t`关闭条目` : t`开启条目`,
                    class: [
                        'menu_button',
                        'bai-bai-preset-prompt-icon-button',
                        'prompt-manager-toggle-action',
                        isEnabled ? 'fa-solid fa-toggle-on' : 'fa-solid fa-toggle-off',
                    ],
                })
                : null,
        ].filter(Boolean);
    }

    return [
        persistentFavoriteToggle,
        h('span', {
            title: t`更多操作`,
            class: 'menu_button bai-bai-preset-prompt-icon-button bai-bai-preset-prompt-actions-hint fa-solid fa-ellipsis',
            onClick: event => {
                event.preventDefault();
                event.stopPropagation();
                event.stopImmediatePropagation?.();
                togglePresetPromptActionMenu(event.currentTarget);
            },
        }),
        h('span', { class: 'bai-bai-preset-prompt-actions' }, [
            favoriteToggle,
            groupRangeButton,
            globalLibraryButton,
            renderPresetVuePromptActionButton(h, {
                action: 'delete',
                icon: 'fa-trash',
                text: t`删除或移除`,
                caution: true,
                onClick: event => handlePresetPromptActionButtonClick(event),
            }),
            renderPresetVuePromptActionButton(h, {
                action: 'copy',
                icon: 'fa-copy',
                text: t`复制`,
                onClick: event => handlePresetPromptActionButtonClick(event),
            }),
            editButtonInMenu ? editButton : null,
        ].filter(Boolean)),
        editButtonInMenu ? null : editButton,
        canToggle
            ? h('span', {
                title: isEnabled ? t`关闭条目` : t`开启条目`,
                class: [
                    'menu_button',
                    'bai-bai-preset-prompt-icon-button',
                    'prompt-manager-toggle-action',
                    isEnabled ? 'fa-solid fa-toggle-on' : 'fa-solid fa-toggle-off',
                ],
            })
            : null,
    ];
}

function isPresetPromptDeleteOrDetachAllowed(prompt) {
    return Boolean(prompt && (promptManager?.isPromptDeletionAllowed?.(prompt) ?? prompt.system_prompt === false));
}

function renderPresetVuePromptActionButton(h, { action, icon, text, caution = false, extraClasses = [], onClick = null }) {
    return h('span', {
        class: [
            'menu_button',
            'bai-bai-preset-prompt-action-button',
            'fa-solid',
            icon,
            caution ? 'caution' : '',
            ...extraClasses,
        ],
        title: text,
        'data-preset-prompt-action': action,
        onClick,
    });
}

// 与 ST 原生 PromptManager 的平铺菜单逐字节一致(detach / edit / toggle),不可用时回退占位
// <span class="fa-solid"></span>。「切换预设快速刷新」只负责快速重渲染列表,菜单形态与原生无异;
// 收缩式菜单只归预设分组(走 Vue 的 renderPresetVuePromptControls)。
// 参考 public/scripts/PromptManager.js renderPromptManagerListItems 的 controls 区块。
function renderNativePromptControlsHtml({ canDelete, canEdit, canToggle, isEnabled }) {
    const detachSpanHtml = canDelete
        ? '<span title="Remove" class="prompt-manager-detach-action caution fa-solid fa-chain-broken fa-xs"></span>'
        : '<span class="fa-solid"></span>';
    const editSpanHtml = canEdit
        ? '<span title="edit" class="prompt-manager-edit-action fa-solid fa-pencil fa-xs"></span>'
        : '<span class="fa-solid"></span>';
    const toggleSpanHtml = canToggle
        ? `<span class="prompt-manager-toggle-action ${isEnabled ? 'fa-solid fa-toggle-on' : 'fa-solid fa-toggle-off'}"></span>`
        : '<span class="fa-solid"></span>';

    return `
        ${detachSpanHtml}
        ${editSpanHtml}
        ${toggleSpanHtml}
    `;
}

function schedulePresetVuePromptOrderSaveAfterDrop() {
    const manager = getPresetVuePromptListManagerState();
    clearPresetVuePromptOrderSaveSchedule(manager);
    void Promise.resolve(savePresetVuePromptOrderFromModel())
        .catch(error => {
            manager.pendingOrderSave = true;
            markPresetPromptChangesSavePending();
            console.debug(`${LOG_PREFIX} Failed to sync preset prompt order after drop`, error);
        });
}

function clearPresetVuePromptOrderSaveSchedule(manager = getPresetVuePromptListManagerState()) {
    if (manager.saveFrame !== null && typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(manager.saveFrame);
    }

    if (manager.saveTimer !== null) {
        clearTimeout(manager.saveTimer);
    }

    manager.saveFrame = null;
    manager.saveTimer = null;
    manager.pendingOrderSave = false;
}

async function flushScheduledPresetVuePromptOrderSave() {
    const manager = getPresetVuePromptListManagerState();

    if (!hasScheduledPresetVuePromptOrderSave(manager)) {
        return false;
    }

    clearPresetVuePromptOrderSaveSchedule(manager);
    try {
        await savePresetVuePromptOrderFromModel();
        return true;
    } catch (error) {
        manager.pendingOrderSave = true;
        throw error;
    }
}

function hasScheduledPresetVuePromptOrderSave(manager = getPresetVuePromptListManagerState()) {
    return Boolean(manager.pendingOrderSave || manager.saveFrame !== null || manager.saveTimer !== null);
}

function getPendingPresetPromptServiceSaves(manager = getPresetVuePromptListManagerState()) {
    if (!(manager.pendingPresetPromptServiceSaves instanceof Map)) {
        manager.pendingPresetPromptServiceSaves = new Map();
    }

    return manager.pendingPresetPromptServiceSaves;
}

function getPendingPresetPromptGroupSaves(manager = getPresetVuePromptListManagerState()) {
    if (!(manager.pendingPresetPromptGroupSaves instanceof Map)) {
        manager.pendingPresetPromptGroupSaves = new Map();
    }

    return manager.pendingPresetPromptGroupSaves;
}

function getPendingOpenAiPresetSaves(manager = getPresetVuePromptListManagerState()) {
    if (!(manager.pendingOpenAiPresetSaves instanceof Set)) {
        manager.pendingOpenAiPresetSaves = new Set();
    }

    return manager.pendingOpenAiPresetSaves;
}

function getPresetPromptSaveRevisions(manager = getPresetVuePromptListManagerState()) {
    if (!(manager.presetPromptSaveRevisions instanceof Map)) {
        manager.presetPromptSaveRevisions = new Map();
    }

    return manager.presetPromptSaveRevisions;
}

function getPresetPromptSaveRevision(presetName, manager = getPresetVuePromptListManagerState()) {
    if (!presetName) {
        return 0;
    }

    return getPresetPromptSaveRevisions(manager).get(presetName) ?? 0;
}

function markPresetPromptSaveRevisionChanged(presetName, manager = getPresetVuePromptListManagerState()) {
    if (!presetName) {
        return 0;
    }

    manager.nextPresetPromptSaveRevision = Number(manager.nextPresetPromptSaveRevision) || 0;
    manager.nextPresetPromptSaveRevision += 1;
    getPresetPromptSaveRevisions(manager).set(presetName, manager.nextPresetPromptSaveRevision);
    return manager.nextPresetPromptSaveRevision;
}

function getOpenAiPresetSaveRequestStates(manager = getPresetVuePromptListManagerState()) {
    if (!(manager.openAiPresetSaveRequestStates instanceof Map)) {
        manager.openAiPresetSaveRequestStates = new Map();
    }

    return manager.openAiPresetSaveRequestStates;
}

function getOpenAiPresetSaveRequestState(presetName, manager = getPresetVuePromptListManagerState()) {
    const states = getOpenAiPresetSaveRequestStates(manager);
    presetName = getOpenAiPresetSaveStateName(presetName);

    if (!states.has(presetName)) {
        states.set(presetName, {
            presetName,
            requestedRevision: null,
            requestedSnapshot: null,
            promise: null,
        });
    }

    const state = states.get(presetName);
    state.presetName = presetName;
    return state;
}

function markOpenAiPresetSavePending(presetName = oai_settings?.preset_settings_openai) {
    if (!presetName) {
        return;
    }

    markPresetPromptSaveRevisionChanged(presetName);
    getPendingOpenAiPresetSaves().add(presetName);
}

function markPresetPromptServiceSettingsSavePending() {
    const manager = getPresetVuePromptListManagerState();
    const entry = createPendingPresetPromptServiceSaveEntry();

    if (!entry) {
        return;
    }

    markPresetPromptSaveRevisionChanged(entry.presetName, manager);
    getPendingPresetPromptServiceSaves(manager).set(entry.presetName, entry);
    manager.pendingServiceSettingsSave = true;
    markPresetPromptChangesSavePending();
}

function createPendingPresetPromptServiceSaveEntry() {
    const presetName = getPresetPromptGroupRuntimePresetName();
    const promptOrder = promptManager?.serviceSettings?.prompt_order ?? oai_settings?.prompt_order;

    if (!presetName || !promptOrder) {
        return null;
    }

    return {
        presetName,
        promptOrder: structuredClone(promptOrder),
    };
}

function markPresetPromptGroupSettingsSavePending(payload = null) {
    const manager = getPresetVuePromptListManagerState();
    payload ||= getCurrentPresetPromptGroupExtensionPayload();

    if (!payload) {
        return;
    }

    markPresetPromptSaveRevisionChanged(payload.presetName, manager);
    getPendingPresetPromptGroupSaves(manager).set(payload.presetName, {
        presetName: payload.presetName,
        groupState: structuredClone(payload.groupState),
        syncKey: payload.syncKey,
    });
    manager.pendingGroupSettingsSave = true;
    markPresetPromptChangesSavePending();
}

function markPresetPromptChangesSavePending() {
    installPresetPendingChangesLifecycleGuard();
    schedulePendingPresetPromptChangesFlushCheck(0);
}

function hasPendingPresetPromptChanges() {
    const manager = getPresetVuePromptListManagerState();
    return Boolean(
        hasAutoFlushPendingPresetPromptChanges(manager)
        || getPendingOpenAiPresetSaves(manager).size > 0,
    );
}

function hasAutoFlushPendingPresetPromptChanges(manager = getPresetVuePromptListManagerState()) {
    return Boolean(
        hasScheduledPresetVuePromptOrderSave(manager)
        || manager.pendingServiceSettingsSave
        || manager.pendingGroupSettingsSave
        || getPendingPresetPromptServiceSaves(manager).size > 0
        || getPendingPresetPromptGroupSaves(manager).size > 0,
    );
}

function clearPendingPresetPromptChanges() {
    const manager = getPresetVuePromptListManagerState();
    clearPresetVuePromptOrderSaveSchedule(manager);
    manager.pendingServiceSettingsSave = false;
    manager.pendingGroupSettingsSave = false;
    getPendingPresetPromptServiceSaves(manager).clear();
    getPendingPresetPromptGroupSaves(manager).clear();
    getPendingOpenAiPresetSaves(manager).clear();
    removePresetPromptManagerVisibilityWatch();
}

function clearPendingPresetPromptChangesForPreset(presetName) {
    if (!presetName) {
        clearPendingPresetPromptChanges();
        return;
    }

    const manager = getPresetVuePromptListManagerState();
    clearPresetVuePromptOrderSaveSchedule(manager);

    const pendingServiceSaves = getPendingPresetPromptServiceSaves(manager);
    const pendingGroupSaves = getPendingPresetPromptGroupSaves(manager);
    const pendingPresetSaves = getPendingOpenAiPresetSaves(manager);
    const groupEntry = pendingGroupSaves.get(presetName);

    pendingServiceSaves.delete(presetName);
    pendingGroupSaves.delete(presetName);
    pendingPresetSaves.delete(presetName);

    if (groupEntry?.syncKey && oai_settings?.preset_settings_openai === presetName) {
        extensionState.presetPromptGroupExtensionSyncKey = groupEntry.syncKey;
    }

    manager.pendingServiceSettingsSave = pendingServiceSaves.size > 0;
    manager.pendingGroupSettingsSave = pendingGroupSaves.size > 0;

    if (hasAutoFlushPendingPresetPromptChanges()) {
        schedulePendingPresetPromptChangesFlushCheck();
    } else {
        removePresetPromptManagerVisibilityWatch();
    }
}

function clearPendingPresetPromptChangesForSavedRevision(presetName, savedRevision) {
    if (!presetName || getPresetPromptSaveRevision(presetName) !== savedRevision) {
        return false;
    }

    const manager = getPresetVuePromptListManagerState();
    const pendingServiceSaves = getPendingPresetPromptServiceSaves(manager);
    const pendingGroupSaves = getPendingPresetPromptGroupSaves(manager);
    const pendingPresetSaves = getPendingOpenAiPresetSaves(manager);
    const groupEntry = pendingGroupSaves.get(presetName);

    pendingServiceSaves.delete(presetName);
    pendingGroupSaves.delete(presetName);
    pendingPresetSaves.delete(presetName);

    if (groupEntry?.syncKey && oai_settings?.preset_settings_openai === presetName) {
        extensionState.presetPromptGroupExtensionSyncKey = groupEntry.syncKey;
    }

    manager.pendingServiceSettingsSave = pendingServiceSaves.size > 0;
    manager.pendingGroupSettingsSave = pendingGroupSaves.size > 0;

    if (hasAutoFlushPendingPresetPromptChanges()) {
        schedulePendingPresetPromptChangesFlushCheck();
    } else {
        removePresetPromptManagerVisibilityWatch();
    }

    return true;
}

async function commitPendingPresetPromptChangesToRuntime(presetName = oai_settings?.preset_settings_openai) {
    const manager = getPresetVuePromptListManagerState();

    if (manager.pendingChangesSavePromise) {
        await manager.pendingChangesSavePromise;
    }

    await flushScheduledPresetVuePromptOrderSave();

    if (!presetName) {
        return;
    }

    applyPendingPresetPromptServiceSaveToMemory(getPendingPresetPromptServiceSaves(manager).get(presetName));
    applyPendingPresetPromptGroupSaveToMemory(getPendingPresetPromptGroupSaves(manager).get(presetName));
}

function applyPendingPresetPromptServiceSaveToMemory(entry) {
    if (!entry?.presetName || !entry.promptOrder) {
        return false;
    }

    const promptOrder = structuredClone(entry.promptOrder);

    if (oai_settings?.preset_settings_openai === entry.presetName) {
        oai_settings.prompt_order = structuredClone(promptOrder);
        if (promptManager) {
            promptManager.serviceSettings = oai_settings;
        }
    }

    return true;
}

function applyPendingPresetPromptGroupSaveToMemory(entry) {
    if (!entry?.presetName || !entry.groupState) {
        return false;
    }

    applyPresetPromptGroupExtensionPayloadToMemory({
        presetName: entry.presetName,
        groupState: structuredClone(entry.groupState),
        syncKey: entry.syncKey || `${entry.presetName}:${JSON.stringify(entry.groupState)}`,
    });

    return true;
}

function installPresetPendingChangesLifecycleGuard() {
    if (extensionState[PRESET_PENDING_CHANGES_LIFECYCLE_HANDLER_KEY]) {
        return;
    }

    const beforeUnloadHandler = (event) => {
        const manager = getPresetVuePromptListManagerState();

        if (!hasAutoFlushPendingPresetPromptChanges(manager) && !manager.pendingChangesSaveInFlight && !manager.pendingChangesSavePromise) {
            return;
        }

        void flushPendingPresetPromptChanges({ includeOpenAiPresetSaves: false }).catch(error => {
            console.debug(`${LOG_PREFIX} Failed to flush preset prompt changes before unload`, error);
        });
        event.preventDefault();
        event.returnValue = '';
        return '';
    };

    const pageLifecycleHandler = (event) => {
        if (event?.type === 'visibilitychange' && document.visibilityState !== 'hidden') {
            return;
        }

        if (!hasAutoFlushPendingPresetPromptChanges()) {
            return;
        }

        void flushPendingPresetPromptChanges({ includeOpenAiPresetSaves: false }).catch(error => {
            console.debug(`${LOG_PREFIX} Failed to flush preset prompt changes during page lifecycle event`, error);
        });
    };
    let lastLeftNavPointerDownAt = 0;
    const leftNavPointerDownHandler = (event) => {
        if (isNodeInsideLeftNavPanel(event.target)) {
            lastLeftNavPointerDownAt = Date.now();
        } else {
            lastLeftNavPointerDownAt = 0;
        }
    };
    const leftNavFocusOutHandler = (event) => {
        if (!hasAutoFlushPendingPresetPromptChanges() || !isNodeInsideLeftNavPanel(event.target)) {
            return;
        }

        if (isNodeInsideLeftNavPanel(event.relatedTarget)) {
            return;
        }

        setTimeout(() => {
            if (!hasAutoFlushPendingPresetPromptChanges()) {
                return;
            }

            if (isFocusInsideLeftNavPanel()) {
                return;
            }

            if (lastLeftNavPointerDownAt && Date.now() - lastLeftNavPointerDownAt < 300) {
                return;
            }

            void flushPendingPresetPromptChanges({ includeOpenAiPresetSaves: false }).catch(error => {
                console.debug(`${LOG_PREFIX} Failed to flush preset prompt changes after left panel focusout`, error);
            });
        }, PRESET_PENDING_CHANGES_FOCUSOUT_CHECK_DELAY_MS);
    };

    extensionState[PRESET_PENDING_CHANGES_LIFECYCLE_HANDLER_KEY] = {
        beforeUnloadHandler,
        pageLifecycleHandler,
        leftNavPointerDownHandler,
        leftNavFocusOutHandler,
    };

    window.addEventListener('beforeunload', beforeUnloadHandler);
    window.addEventListener('pagehide', pageLifecycleHandler);
    document.addEventListener('visibilitychange', pageLifecycleHandler);
    document.addEventListener('pointerdown', leftNavPointerDownHandler, true);
    document.addEventListener('focusout', leftNavFocusOutHandler, true);
}

function schedulePendingPresetPromptChangesFlushCheck(delayMs = PRESET_PENDING_CHANGES_VISIBILITY_CHECK_DELAY_MS) {
    const manager = getPresetVuePromptListManagerState();
    installPresetPromptManagerVisibilityObserver();
    clearTimeout(manager.pendingVisibilityTimer);
    manager.pendingVisibilityTimer = setTimeout(() => {
        manager.pendingVisibilityTimer = null;
        checkPendingPresetPromptChangesFlush();
    }, delayMs);
}

function installPresetPromptManagerVisibilityObserver() {
    const manager = getPresetVuePromptListManagerState();

    if (manager.pendingVisibilityObserver || typeof MutationObserver !== 'function') {
        return;
    }

    const observer = new MutationObserver(() => {
        schedulePendingPresetPromptChangesFlushCheck();
    });

    manager.pendingVisibilityObserver = observer;

    for (const target of getPresetPromptManagerVisibilityTargets()) {
        observer.observe(target, {
            attributes: true,
            attributeFilter: ['class', 'style', 'hidden', 'aria-hidden'],
        });
    }
}

function removePresetPromptManagerVisibilityWatch() {
    const manager = getPresetVuePromptListManagerState();
    clearTimeout(manager.pendingVisibilityTimer);
    manager.pendingVisibilityTimer = null;

    if (manager.pendingVisibilityObserver) {
        manager.pendingVisibilityObserver.disconnect();
        manager.pendingVisibilityObserver = null;
    }
}

function getPresetPromptManagerVisibilityTargets() {
    const targets = [];
    const seen = new Set();
    const add = element => {
        if (element instanceof HTMLElement && !seen.has(element)) {
            seen.add(element);
            targets.push(element);
        }
    };
    const container = promptManager?.containerElement instanceof HTMLElement
        ? promptManager.containerElement
        : document.querySelector('#completion_prompt_manager');

    add(container);

    if (container instanceof HTMLElement) {
        for (let element = container.parentElement; element && element !== document.body; element = element.parentElement) {
            add(element);
        }
    }

    return targets;
}

function checkPendingPresetPromptChangesFlush() {
    if (!hasAutoFlushPendingPresetPromptChanges()) {
        removePresetPromptManagerVisibilityWatch();
        return;
    }

    if (!isPresetPromptManagerVisible()) {
        flushPendingPresetPromptChangesSafely();
        return;
    }

    schedulePendingPresetPromptChangesFlushCheck(PRESET_PENDING_CHANGES_VISIBILITY_FALLBACK_DELAY_MS);
}

function isPresetPromptManagerVisible() {
    const container = promptManager?.containerElement instanceof HTMLElement
        ? promptManager.containerElement
        : document.querySelector('#completion_prompt_manager');

    return isPresetVisibilityElementVisible(container);
}

function isPresetVisibilityElementVisible(element) {
    if (!(element instanceof HTMLElement) || !element.isConnected || element.getClientRects().length === 0) {
        return false;
    }

    const style = getComputedStyle(element);
    return style.display !== 'none' && style.visibility !== 'hidden';
}

function getLeftNavPanelElement() {
    return document.querySelector(LEFT_NAV_PANEL_SELECTOR);
}

function isNodeInsideLeftNavPanel(node) {
    const leftNavPanel = getLeftNavPanelElement();
    return Boolean(leftNavPanel instanceof HTMLElement && node instanceof Node && leftNavPanel.contains(node));
}

function isFocusInsideLeftNavPanel() {
    return isNodeInsideLeftNavPanel(document.activeElement);
}

function flushPendingPresetPromptChangesSafely() {
    void flushPendingPresetPromptChanges({ includeOpenAiPresetSaves: false }).catch(error => {
        console.debug(`${LOG_PREFIX} Failed to flush preset prompt changes`, error);
        toastr.error(t`Failed to save preset prompt changes. See console for details.`);
    });
}

async function flushPendingPresetPromptChanges({ includeOpenAiPresetSaves = false } = {}) {
    const manager = getPresetVuePromptListManagerState();

    if (manager.pendingChangesSavePromise) {
        return manager.pendingChangesSavePromise;
    }

    await flushScheduledPresetVuePromptOrderSave();

    const pendingServiceSaves = Array.from(getPendingPresetPromptServiceSaves(manager).values());
    const pendingGroupSaves = Array.from(getPendingPresetPromptGroupSaves(manager).values());
    const pendingPresetSaves = includeOpenAiPresetSaves
        ? Array.from(getPendingOpenAiPresetSaves(manager).values())
        : [];
    const shouldSaveServiceSettings = pendingServiceSaves.length > 0 || Boolean(manager.pendingServiceSettingsSave);
    const shouldSaveGroups = pendingGroupSaves.length > 0 || Boolean(manager.pendingGroupSettingsSave);
    const shouldSavePreset = pendingPresetSaves.length > 0;

    if (!shouldSaveServiceSettings && !shouldSaveGroups && !shouldSavePreset) {
        removePresetPromptManagerVisibilityWatch();
        return;
    }

    manager.pendingChangesSaveInFlight = true;
    const savePromise = (async () => {
        try {
            manager.pendingServiceSettingsSave = false;
            manager.pendingGroupSettingsSave = false;
            manager.pendingPresetPromptServiceSaves = new Map();
            manager.pendingPresetPromptGroupSaves = new Map();
            if (includeOpenAiPresetSaves) {
                manager.pendingOpenAiPresetSaves = new Set();
            }

            const presetNamesNeedingPresetSave = new Set(pendingPresetSaves);
            let shouldSaveSettingsOnly = false;

            for (const entry of pendingServiceSaves) {
                if (applyPendingPresetPromptServiceSaveToMemory(entry)) {
                    presetNamesNeedingPresetSave.add(entry.presetName);
                    shouldSaveSettingsOnly = true;
                }
            }

            for (const entry of pendingGroupSaves) {
                if (applyPendingPresetPromptGroupSaveToMemory(entry)) {
                    presetNamesNeedingPresetSave.add(entry.presetName);
                    shouldSaveSettingsOnly = true;
                }
            }

            if ((shouldSaveServiceSettings || shouldSaveGroups) && !presetNamesNeedingPresetSave.size) {
                presetNamesNeedingPresetSave.add(oai_settings?.preset_settings_openai);
                shouldSaveSettingsOnly = true;
            }

            if (includeOpenAiPresetSaves) {
                for (const presetName of presetNamesNeedingPresetSave) {
                    await flushPendingOpenAiPresetSave(presetName);
                }
            } else if (shouldSaveSettingsOnly) {
                for (const presetName of presetNamesNeedingPresetSave) {
                    if (presetName) {
                        getPendingOpenAiPresetSaves(manager).add(presetName);
                    }
                }

                await saveSettings();
            }
        } catch (error) {
            manager.pendingServiceSettingsSave = manager.pendingServiceSettingsSave || shouldSaveServiceSettings;
            manager.pendingGroupSettingsSave = manager.pendingGroupSettingsSave || shouldSaveGroups;

            for (const entry of pendingServiceSaves) {
                getPendingPresetPromptServiceSaves(manager).set(entry.presetName, entry);
            }

            for (const entry of pendingGroupSaves) {
                getPendingPresetPromptGroupSaves(manager).set(entry.presetName, entry);
            }

            if (includeOpenAiPresetSaves) {
                for (const presetName of pendingPresetSaves) {
                    getPendingOpenAiPresetSaves(manager).add(presetName);
                }
            }

            throw error;
        } finally {
            manager.pendingChangesSaveInFlight = false;
        }
    })();

    manager.pendingChangesSavePromise = savePromise;

    try {
        await savePromise;
    } finally {
        if (manager.pendingChangesSavePromise === savePromise) {
            manager.pendingChangesSavePromise = null;
        }

        if (hasAutoFlushPendingPresetPromptChanges()) {
            schedulePendingPresetPromptChangesFlushCheck();
        } else {
            removePresetPromptManagerVisibilityWatch();
        }
    }
}

async function flushPendingOpenAiPresetSave(presetName) {
    if (!presetName || oai_settings?.preset_settings_openai !== presetName) {
        return;
    }

    await triggerOpenAiPresetUpdateAndWait(presetName);
    await saveSettings();
}

async function flushPendingPresetPromptServiceSave(entry) {
    if (!applyPendingPresetPromptServiceSaveToMemory(entry)) {
        return;
    }

    markOpenAiPresetSavePending(entry.presetName);
    await saveSettings();
}

async function flushPendingPresetPromptGroupSave(entry) {
    if (!applyPendingPresetPromptGroupSaveToMemory(entry)) {
        return;
    }

    markOpenAiPresetSavePending(entry.presetName);
    await saveSettings();
}

async function savePresetVuePromptOrderFromModel() {
    if (!isPromptManagerReadyForCustomDrag()) {
        return;
    }

    const manager = getPresetVuePromptListManagerState();
    if (!manager.state) {
        return;
    }

    sanitizePresetVuePromptListModel(manager.state);
    const promptOrder = promptManager.getPromptOrderForCharacter(promptManager.activeCharacter) ?? [];
    const beforeOrder = promptOrder.map(entry => entry?.identifier).filter(Boolean);
    const nextAssignments = getPresetVuePromptGroupAssignmentsFromModel(manager.state);
    const afterOrder = getPresetVuePromptFlatIds(manager.state);

    if (areStringArraysEqual(beforeOrder, afterOrder)) {
        savePresetVuePromptGroupAssignments(nextAssignments);
        return;
    }

    const idToObjectMap = new Map(promptOrder.filter(Boolean).map(entry => [entry.identifier, entry]));
    const updatedPromptOrder = afterOrder
        .map(identifier => idToObjectMap.get(identifier))
        .filter(Boolean);

    promptManager.removePromptOrderForCharacter(promptManager.activeCharacter);
    promptManager.addPromptOrderForCharacter(promptManager.activeCharacter, updatedPromptOrder);
    promptManager.log?.(`Prompt order updated for ${promptManager.activeCharacter?.name ?? 'OpenAI preset'}.`);
    savePresetVuePromptGroupAssignments(nextAssignments, { persist: false });
    markPresetPromptServiceSettingsSavePending();
    savePresetPromptGroupSettings();
}

function getPresetVuePromptGroupAssignmentsFromModel(model) {
    const assignments = {};

    for (const item of model?.items ?? []) {
        if (item?.type === 'group') {
            for (const child of item.children ?? []) {
                if (child?.type === 'prompt' && !Object.prototype.hasOwnProperty.call(assignments, child.id)) {
                    assignments[child.id] = item.groupId;
                }
            }
            continue;
        }

        if (item?.type === 'prompt' && !Object.prototype.hasOwnProperty.call(assignments, item.id)) {
            assignments[item.id] = null;
        }
    }

    return assignments;
}

function savePresetVuePromptGroupAssignments(assignments, { persist = true } = {}) {
    const groupState = getPresetPromptGroupState();
    const validPromptIds = new Set(getPresetVuePromptFlatIds());
    normalizePresetPromptGroupState(groupState, validPromptIds);
    const validGroupIds = new Set(groupState.groups.map(group => group.id));
    const nextPrompts = {};
    const usedGroupIds = new Set();

    for (const promptId of validPromptIds) {
        const groupId = assignments?.[promptId];

        if (!groupId || !validGroupIds.has(groupId)) {
            continue;
        }

        nextPrompts[promptId] = { groupId };
        usedGroupIds.add(groupId);
    }

    groupState.prompts = nextPrompts;
    groupState.groups = groupState.groups.filter(group => usedGroupIds.has(group.id));
    normalizePresetPromptGroupState(groupState, validPromptIds);

    if (persist) {
        savePresetPromptGroupSettings();
    }
}

function removeUnusedPresetPromptGroups(groupState) {
    const usedGroupIds = new Set(
        Object.values(groupState.prompts ?? {})
            .map(meta => meta?.groupId)
            .filter(Boolean),
    );

    groupState.groups = groupState.groups.filter(group => usedGroupIds.has(group.id));
}

function updatePresetVuePromptItemEnabled(promptId, enabled) {
    const manager = getPresetVuePromptListManagerState();
    const items = getPresetVuePromptItemsFromModel(manager.state, { includeFavoriteMirrors: true })
        .filter(item => item?.id === promptId);

    if (!items.length) {
        return false;
    }

    for (const item of items) {
        item.enabled = Boolean(enabled);

        if (item.orderEntry) {
            item.orderEntry.enabled = Boolean(enabled);
        }
    }

    return true;
}

function handlePresetPromptDragPointerDown(event) {
    if (!settings.presetDragOptimizationEnabled || !isPrimaryPresetDragButton(event)) {
        return;
    }

    if (isMobile()) {
        return;
    }

    const dragTarget = getPresetPromptDragTarget(event.target);

    if (!dragTarget) {
        return;
    }

    if (beginPromptManagerCustomDrag(event, dragTarget, getPresetDragPoint(event))) {
        extensionState.promptManagerCustomDragSuppressCompatUntil = Date.now() + 300;
        preventPresetDragEvent(event);
    }
}

function handlePresetPromptDragMouseDown(event) {
    if (!settings.presetDragOptimizationEnabled || !isPrimaryPresetDragButton(event)) {
        return;
    }

    if (isMobile()) {
        return;
    }

    const dragTarget = getPresetPromptDragTarget(event.target);

    if (!dragTarget) {
        return;
    }

    if (extensionState.promptManagerCustomDragState || shouldSuppressPromptManagerCompatDragEvent()) {
        preventPresetDragEvent(event);
        return;
    }

    if (typeof PointerEvent === 'function') {
        return;
    }

    if (beginPromptManagerCustomDrag(event, dragTarget, getPresetDragPoint(event))) {
        preventPresetDragEvent(event);
    }
}

function handlePresetPromptDragTouchStart(event) {
    if (!settings.presetDragOptimizationEnabled) {
        return;
    }

    const dragTarget = getPresetPromptDragTarget(event.target);

    if (!dragTarget) {
        return;
    }

    if (isMobile()) {
        startPromptManagerCustomDragPending(event, dragTarget, getPresetDragPoint(event));
        return;
    }

    if (extensionState.promptManagerCustomDragState || shouldSuppressPromptManagerCompatDragEvent()) {
        preventPresetDragEvent(event);
        return;
    }

    if (beginPromptManagerCustomDrag(event, dragTarget, getPresetDragPoint(event))) {
        preventPresetDragEvent(event);
    }
}

function shouldSuppressPromptManagerCompatDragEvent() {
    return Date.now() < (extensionState.promptManagerCustomDragSuppressCompatUntil ?? 0);
}

function handlePresetPromptDragClick(event) {
    if (Date.now() >= (extensionState.promptManagerCustomDragSuppressClickUntil ?? 0)) {
        return;
    }

    const target = event.target instanceof Element ? event.target : null;

    if (!target?.closest(PRESET_PROMPT_MANAGER_LIST_SELECTOR)) {
        return;
    }

    preventPresetDragEvent(event);
}

function startPromptManagerCustomDragPending(event, dragTarget, point) {
    if (!point || extensionState.promptManagerCustomDragState || extensionState.promptManagerCustomDragPendingState) {
        return false;
    }

    const pendingState = {
        dragTarget,
        sourceEvent: event,
        pointerId: typeof event.pointerId === 'number' ? event.pointerId : null,
        startX: point.clientX,
        startY: point.clientY,
        timer: 0,
    };

    pendingState.timer = setTimeout(() => {
        activatePromptManagerCustomDragPending();
    }, PRESET_DRAG_LONG_PRESS_MS);

    extensionState.promptManagerCustomDragPendingState = pendingState;
    document.addEventListener('pointermove', handlePromptManagerCustomDragPendingPointerMove, true);
    document.addEventListener('pointerup', handlePromptManagerCustomDragPendingPointerEnd, true);
    document.addEventListener('pointercancel', handlePromptManagerCustomDragPendingPointerCancel, true);
    document.addEventListener('touchmove', handlePromptManagerCustomDragPendingTouchMove, { capture: true, passive: true });
    document.addEventListener('touchend', handlePromptManagerCustomDragPendingTouchEnd, true);
    document.addEventListener('touchcancel', handlePromptManagerCustomDragPendingTouchCancel, true);
    document.addEventListener('keydown', handlePromptManagerCustomDragPendingKeyDown, true);
    return true;
}

function activatePromptManagerCustomDragPending() {
    const pendingState = extensionState.promptManagerCustomDragPendingState;

    if (!pendingState) {
        return;
    }

    clearPromptManagerCustomDragPending();

    const started = beginPromptManagerCustomDrag(
        pendingState.sourceEvent,
        pendingState.dragTarget,
        {
            clientX: pendingState.startX,
            clientY: pendingState.startY,
        },
        {
            suppressNextClick: true,
        },
    );

    if (started) {
        extensionState.promptManagerCustomDragSuppressCompatUntil = Date.now() + 300;
    }
}

function handlePromptManagerCustomDragPendingPointerMove(event) {
    const pendingState = extensionState.promptManagerCustomDragPendingState;

    if (!pendingState || pendingState.pointerId === null || event.pointerId !== pendingState.pointerId) {
        return;
    }

    updatePromptManagerCustomDragPendingFromEvent(event);
}

function handlePromptManagerCustomDragPendingTouchMove(event) {
    if (extensionState.promptManagerCustomDragPendingState?.pointerId !== null) {
        return;
    }

    updatePromptManagerCustomDragPendingFromEvent(event);
}

function updatePromptManagerCustomDragPendingFromEvent(event) {
    const pendingState = extensionState.promptManagerCustomDragPendingState;
    const point = getPresetDragPoint(event);

    if (!pendingState || !point) {
        return;
    }

    const distance = Math.hypot(point.clientX - pendingState.startX, point.clientY - pendingState.startY);

    if (distance > PRESET_DRAG_CANCEL_DISTANCE_PX) {
        cancelPromptManagerCustomDragPending();
    }
}

function handlePromptManagerCustomDragPendingPointerEnd(event) {
    const pendingState = extensionState.promptManagerCustomDragPendingState;

    if (!pendingState || pendingState.pointerId === null || event.pointerId !== pendingState.pointerId) {
        return;
    }

    cancelPromptManagerCustomDragPending();
}

function handlePromptManagerCustomDragPendingPointerCancel(event) {
    handlePromptManagerCustomDragPendingPointerEnd(event);
}

function handlePromptManagerCustomDragPendingTouchEnd() {
    if (extensionState.promptManagerCustomDragPendingState?.pointerId !== null) {
        return;
    }

    cancelPromptManagerCustomDragPending();
}

function handlePromptManagerCustomDragPendingTouchCancel() {
    handlePromptManagerCustomDragPendingTouchEnd();
}

function handlePromptManagerCustomDragPendingKeyDown(event) {
    if (event.key === 'Escape') {
        cancelPromptManagerCustomDragPending();
    }
}

function cancelPromptManagerCustomDragPending() {
    clearPromptManagerCustomDragPending();
}

function clearPromptManagerCustomDragPending() {
    const pendingState = extensionState.promptManagerCustomDragPendingState;

    if (!pendingState) {
        return;
    }

    clearTimeout(pendingState.timer);
    delete extensionState.promptManagerCustomDragPendingState;
    document.removeEventListener('pointermove', handlePromptManagerCustomDragPendingPointerMove, true);
    document.removeEventListener('pointerup', handlePromptManagerCustomDragPendingPointerEnd, true);
    document.removeEventListener('pointercancel', handlePromptManagerCustomDragPendingPointerCancel, true);
    document.removeEventListener('touchmove', handlePromptManagerCustomDragPendingTouchMove, true);
    document.removeEventListener('touchend', handlePromptManagerCustomDragPendingTouchEnd, true);
    document.removeEventListener('touchcancel', handlePromptManagerCustomDragPendingTouchCancel, true);
    document.removeEventListener('keydown', handlePromptManagerCustomDragPendingKeyDown, true);
}

function getPresetPromptDragTarget(target) {
    if (!(target instanceof Element)) {
        return null;
    }

    const row = target.closest(`${PRESET_PROMPT_MANAGER_LIST_SELECTOR} li.completion_prompt_manager_prompt[data-pm-identifier]`);
    const list = row?.closest(PRESET_PROMPT_MANAGER_LIST_SELECTOR);
    const handle = row?.querySelector('.drag-handle') ?? row;
    const touchedHandle = target.closest(`${PRESET_PROMPT_MANAGER_LIST_SELECTOR} li.completion_prompt_manager_prompt .drag-handle`);

    if (!(handle instanceof HTMLElement) || !(row instanceof HTMLElement) || !(list instanceof HTMLElement)) {
        return null;
    }

    if (isMobile() && !settings.presetMobileWholeRowDragEnabled && !(touchedHandle instanceof HTMLElement)) {
        return null;
    }

    if (target.closest(PRESET_DRAG_INTERACTIVE_SELECTOR)) {
        return null;
    }

    if (!row.classList.contains('completion_prompt_manager_prompt_draggable')) {
        return null;
    }

    return { handle, row, list };
}

function isPrimaryPresetDragButton(event) {
    return typeof event.button !== 'number' || event.button === 0;
}

function getPresetDragPoint(event) {
    const touch = event?.touches?.[0] ?? event?.changedTouches?.[0];

    if (touch) {
        return {
            clientX: touch.clientX,
            clientY: touch.clientY,
        };
    }

    if (typeof event?.clientX === 'number' && typeof event?.clientY === 'number') {
        return {
            clientX: event.clientX,
            clientY: event.clientY,
        };
    }

    return null;
}

function preparePromptManagerDragClone(sourceRow, clone, rect) {
    copyComputedStylesForDragClone(sourceRow, clone);
    clone.classList.remove(PRESET_DRAG_SOURCE_CLASS);
    clone.classList.add(PRESET_DRAG_CLONE_CLASS);
    clone.style.setProperty('position', 'fixed', 'important');
    clone.style.setProperty('box-sizing', 'border-box', 'important');
    clone.style.setProperty('left', `${rect.left}px`, 'important');
    clone.style.setProperty('top', `${rect.top}px`, 'important');
    clone.style.setProperty('width', `${rect.width}px`, 'important');
    clone.style.setProperty('height', `${rect.height}px`, 'important');
    clone.style.setProperty('margin', '0', 'important');
    clone.style.setProperty('pointer-events', 'none', 'important');
    clone.style.setProperty('z-index', '50000', 'important');
    clone.style.setProperty('cursor', 'grabbing', 'important');
    clone.style.setProperty('transform', 'translate3d(0, 0, 0)', 'important');
    clone.querySelectorAll('.drag-handle').forEach(handle => {
        if (handle instanceof HTMLElement) {
            handle.style.setProperty('cursor', 'grabbing', 'important');
        }
    });
}

function copyComputedStylesForDragClone(source, clone) {
    const sourceElements = [source, ...source.querySelectorAll('*')];
    const cloneElements = [clone, ...clone.querySelectorAll('*')];

    for (let index = 0; index < sourceElements.length; index++) {
        const sourceElement = sourceElements[index];
        const cloneElement = cloneElements[index];

        if (!(sourceElement instanceof Element) || !(cloneElement instanceof HTMLElement)) {
            continue;
        }

        const computed = getComputedStyle(sourceElement);

        for (let propertyIndex = 0; propertyIndex < computed.length; propertyIndex++) {
            const property = computed[propertyIndex];

            cloneElement.style.setProperty(
                property,
                computed.getPropertyValue(property),
                computed.getPropertyPriority(property),
            );
        }
    }
}

function beginPromptManagerCustomDrag(event, { handle, row, list }, point, { suppressNextClick = false } = {}) {
    if (!point || extensionState.promptManagerCustomDragState || !isPromptManagerReadyForCustomDrag()) {
        return false;
    }

    if (!preparePromptManagerCustomDragList(list)) {
        return false;
    }

    const rows = getPromptManagerDraggableRows(list);
    const sourceIndex = rows.indexOf(row);

    if (sourceIndex < 0 || rows.length < 2) {
        return false;
    }

    const rowRect = row.getBoundingClientRect();
    const clone = row.cloneNode(true);
    const indicator = document.createElement('div');
    const scrollContainer = getPromptManagerDragScrollContainer(list);

    preparePromptManagerDragClone(row, clone, rowRect);
    indicator.className = PRESET_DRAG_INDICATOR_CLASS;

    document.body.append(clone, indicator);
    row.classList.add(PRESET_DRAG_SOURCE_CLASS);
    list.classList.add(PRESET_DRAG_ACTIVE_CLASS);

    const state = {
        list,
        row,
        rows,
        clone,
        indicator,
        handle,
        pointerId: typeof event.pointerId === 'number' ? event.pointerId : null,
        sourceIndex,
        dropIndex: sourceIndex,
        startLeft: rowRect.left,
        startTop: rowRect.top,
        offsetX: point.clientX - rowRect.left,
        offsetY: point.clientY - rowRect.top,
        clientX: point.clientX,
        clientY: point.clientY,
        scrollContainer,
        frame: 0,
        autoScrollFrame: 0,
        moved: false,
        suppressNextClick,
        originalBodyCursor: document.body.style.cursor,
    };

    extensionState.promptManagerCustomDragState = state;
    document.body.style.cursor = 'grabbing';

    if (typeof handle.setPointerCapture === 'function' && state.pointerId !== null) {
        try {
            handle.setPointerCapture(state.pointerId);
        } catch {
            // Pointer capture is opportunistic; document listeners handle the fallback.
        }
    }

    document.addEventListener('pointermove', handlePromptManagerCustomDragPointerMove, true);
    document.addEventListener('pointerup', handlePromptManagerCustomDragPointerUp, true);
    document.addEventListener('pointercancel', handlePromptManagerCustomDragPointerCancel, true);
    document.addEventListener('mousemove', handlePromptManagerCustomDragMouseMove, true);
    document.addEventListener('mouseup', handlePromptManagerCustomDragMouseUp, true);
    document.addEventListener('touchmove', handlePromptManagerCustomDragTouchMove, { capture: true, passive: false });
    document.addEventListener('touchend', handlePromptManagerCustomDragTouchEnd, true);
    document.addEventListener('touchcancel', handlePromptManagerCustomDragTouchCancel, true);
    document.addEventListener('keydown', handlePromptManagerCustomDragKeyDown, true);

    schedulePromptManagerDragFrame(state);
    return true;
}

function isPromptManagerReadyForCustomDrag() {
    return Boolean(
        promptManager
        && typeof promptManager.getPromptOrderForCharacter === 'function'
        && typeof promptManager.removePromptOrderForCharacter === 'function'
        && typeof promptManager.addPromptOrderForCharacter === 'function'
        && typeof promptManager.saveServiceSettings === 'function'
        && promptManager.activeCharacter,
    );
}

function getPromptManagerDraggableRows(list) {
    return Array.from(list.querySelectorAll('li.completion_prompt_manager_prompt[data-pm-identifier].completion_prompt_manager_prompt_draggable'))
        .filter(row => !row.classList.contains(PRESET_DRAG_CLONE_CLASS));
}

function handlePromptManagerCustomDragPointerMove(event) {
    const state = extensionState.promptManagerCustomDragState;

    if (!state || state.pointerId === null || event.pointerId !== state.pointerId) {
        return;
    }

    updatePromptManagerCustomDragFromEvent(event);
}

function handlePromptManagerCustomDragMouseMove(event) {
    if (extensionState.promptManagerCustomDragState?.pointerId !== null) {
        return;
    }

    updatePromptManagerCustomDragFromEvent(event);
}

function handlePromptManagerCustomDragTouchMove(event) {
    if (extensionState.promptManagerCustomDragState?.pointerId !== null) {
        return;
    }

    updatePromptManagerCustomDragFromEvent(event);
}

function updatePromptManagerCustomDragFromEvent(event) {
    const state = extensionState.promptManagerCustomDragState;
    const point = getPresetDragPoint(event);

    if (!state || !point) {
        return;
    }

    preventPresetDragEvent(event);
    state.clientX = point.clientX;
    state.clientY = point.clientY;
    state.moved = true;
    schedulePromptManagerDragFrame(state);
}

function handlePromptManagerCustomDragPointerUp(event) {
    const state = extensionState.promptManagerCustomDragState;

    if (!state || state.pointerId === null || event.pointerId !== state.pointerId) {
        return;
    }

    preventPresetDragEvent(event);
    finishPromptManagerCustomDrag();
}

function handlePromptManagerCustomDragMouseUp(event) {
    const state = extensionState.promptManagerCustomDragState;

    if (!state || state.pointerId !== null) {
        return;
    }

    preventPresetDragEvent(event);
    finishPromptManagerCustomDrag();
}

function handlePromptManagerCustomDragTouchEnd(event) {
    const state = extensionState.promptManagerCustomDragState;

    if (!state || state.pointerId !== null) {
        return;
    }

    preventPresetDragEvent(event);
    finishPromptManagerCustomDrag();
}

function handlePromptManagerCustomDragPointerCancel(event) {
    const state = extensionState.promptManagerCustomDragState;

    if (!state || state.pointerId === null || event.pointerId !== state.pointerId) {
        return;
    }

    preventPresetDragEvent(event);
    finishPromptManagerCustomDrag({ cancelled: true });
}

function handlePromptManagerCustomDragTouchCancel(event) {
    if (!extensionState.promptManagerCustomDragState) {
        return;
    }

    preventPresetDragEvent(event);
    finishPromptManagerCustomDrag({ cancelled: true });
}

function handlePromptManagerCustomDragKeyDown(event) {
    if (event.key !== 'Escape' || !extensionState.promptManagerCustomDragState) {
        return;
    }

    preventPresetDragEvent(event);
    finishPromptManagerCustomDrag({ cancelled: true });
}

function schedulePromptManagerDragFrame(state) {
    if (state.frame) {
        return;
    }

    state.frame = requestAnimationFrame(() => {
        state.frame = 0;
        updatePromptManagerDragFrame(state);
    });
}

function updatePromptManagerDragFrame(state) {
    if (extensionState.promptManagerCustomDragState !== state) {
        return;
    }

    const nextLeft = state.clientX - state.offsetX;
    const nextTop = state.clientY - state.offsetY;
    const translateX = nextLeft - state.startLeft;
    const translateY = nextTop - state.startTop;

    state.clone.style.setProperty('transform', `translate3d(${translateX}px, ${translateY}px, 0)`, 'important');
    state.dropIndex = getPromptManagerDropIndex(state, state.clientY);
    updatePromptManagerDragIndicator(state);
    schedulePromptManagerDragAutoScroll(state);
}

function getPromptManagerDropIndex(state, clientY) {
    const candidates = state.rows.filter(row => row !== state.row);

    for (let index = 0; index < candidates.length; index++) {
        const rect = candidates[index].getBoundingClientRect();

        if (clientY < rect.top + rect.height / 2) {
            return index;
        }
    }

    return candidates.length;
}

function updatePromptManagerDragIndicator(state) {
    const candidates = state.rows.filter(row => row !== state.row);
    const listRect = state.list.getBoundingClientRect();
    const target = candidates[state.dropIndex];
    let top = listRect.top;

    if (target instanceof HTMLElement) {
        top = target.getBoundingClientRect().top;
    } else if (candidates.length) {
        const lastRect = candidates[candidates.length - 1].getBoundingClientRect();
        top = lastRect.bottom;
    }

    state.indicator.style.left = `${listRect.left}px`;
    state.indicator.style.top = `${Math.round(top - 1)}px`;
    state.indicator.style.width = `${listRect.width}px`;
}

function schedulePromptManagerDragAutoScroll(state) {
    if (state.autoScrollFrame) {
        return;
    }

    state.autoScrollFrame = requestAnimationFrame(() => {
        state.autoScrollFrame = 0;

        if (extensionState.promptManagerCustomDragState !== state) {
            return;
        }

        const scrolled = autoScrollPromptManagerDragContainer(state);

        if (scrolled) {
            schedulePromptManagerDragFrame(state);
            schedulePromptManagerDragAutoScroll(state);
        }
    });
}

function autoScrollPromptManagerDragContainer(state) {
    const container = state.scrollContainer;

    if (!container) {
        return false;
    }

    const edgeSize = 56;
    const maxStep = 18;
    const rect = container === document.scrollingElement
        ? { top: 0, bottom: window.innerHeight }
        : container.getBoundingClientRect();
    let delta = 0;

    if (state.clientY < rect.top + edgeSize) {
        delta = -Math.ceil((1 - ((state.clientY - rect.top) / edgeSize)) * maxStep);
    } else if (state.clientY > rect.bottom - edgeSize) {
        delta = Math.ceil((1 - ((rect.bottom - state.clientY) / edgeSize)) * maxStep);
    }

    if (!delta) {
        return false;
    }

    if (container === document.scrollingElement) {
        const before = window.scrollY;
        window.scrollBy(0, delta);
        return window.scrollY !== before;
    }

    const before = container.scrollTop;
    container.scrollTop += delta;
    return container.scrollTop !== before;
}

function getPromptManagerDragScrollContainer(list) {
    const candidates = [
        promptManager?.containerElement?.closest?.('.scrollableInner'),
        list.closest('.scrollableInner'),
        list.closest('.drawer-content'),
        document.scrollingElement,
    ];

    return candidates.find(element => element instanceof HTMLElement) ?? document.scrollingElement;
}

function finishPromptManagerCustomDrag({ cancelled = false } = {}) {
    const state = extensionState.promptManagerCustomDragState;

    if (!state) {
        return;
    }

    delete extensionState.promptManagerCustomDragState;
    document.removeEventListener('pointermove', handlePromptManagerCustomDragPointerMove, true);
    document.removeEventListener('pointerup', handlePromptManagerCustomDragPointerUp, true);
    document.removeEventListener('pointercancel', handlePromptManagerCustomDragPointerCancel, true);
    document.removeEventListener('mousemove', handlePromptManagerCustomDragMouseMove, true);
    document.removeEventListener('mouseup', handlePromptManagerCustomDragMouseUp, true);
    document.removeEventListener('touchmove', handlePromptManagerCustomDragTouchMove, true);
    document.removeEventListener('touchend', handlePromptManagerCustomDragTouchEnd, true);
    document.removeEventListener('touchcancel', handlePromptManagerCustomDragTouchCancel, true);
    document.removeEventListener('keydown', handlePromptManagerCustomDragKeyDown, true);

    if (state.frame) {
        cancelAnimationFrame(state.frame);
    }

    if (state.autoScrollFrame) {
        cancelAnimationFrame(state.autoScrollFrame);
    }

    if (typeof state.handle.releasePointerCapture === 'function' && state.pointerId !== null) {
        try {
            state.handle.releasePointerCapture(state.pointerId);
        } catch {
            // Pointer capture may already be released by the browser.
        }
    }

    state.clone.remove();
    state.indicator.remove();
    state.row.classList.remove(PRESET_DRAG_SOURCE_CLASS);
    state.list.classList.remove(PRESET_DRAG_ACTIVE_CLASS);
    document.body.style.cursor = state.originalBodyCursor;

    if (state.suppressNextClick) {
        extensionState.promptManagerCustomDragSuppressClickUntil = Date.now() + PRESET_DRAG_CLICK_SUPPRESS_MS;
    }

    if (!cancelled && state.moved) {
        movePromptManagerDraggedRow(state);
    }

    if (extensionState.promptManagerTokenRefreshPendingAfterDrag) {
        extensionState.promptManagerTokenRefreshPendingAfterDrag = false;
        refreshPromptManagerTokensDebounced();
    }
}

function movePromptManagerDraggedRow(state) {
    const candidates = state.rows.filter(row => row !== state.row);
    const reference = candidates[state.dropIndex] ?? null;

    if (reference === state.row) {
        return;
    }

    const beforeOrder = state.rows.map(row => row.dataset.pmIdentifier).filter(Boolean);

    if (reference) {
        state.list.insertBefore(state.row, reference);
    } else {
        state.list.append(state.row);
    }

    const afterOrder = getPromptManagerDraggableRows(state.list).map(row => row.dataset.pmIdentifier).filter(Boolean);

    if (!areStringArraysEqual(beforeOrder, afterOrder)) {
        savePromptManagerDraggedOrder(state.list);
    }
}

function savePromptManagerDraggedOrder(list) {
    if (!isPromptManagerReadyForCustomDrag()) {
        return;
    }

    const promptOrder = promptManager.getPromptOrderForCharacter(promptManager.activeCharacter) ?? [];
    const idToObjectMap = new Map(promptOrder.filter(Boolean).map(prompt => [prompt.identifier, prompt]));
    const updatedPromptOrder = getPromptManagerDraggableRows(list)
        .map(row => idToObjectMap.get(row.dataset.pmIdentifier))
        .filter(Boolean);

    promptManager.removePromptOrderForCharacter(promptManager.activeCharacter);
    promptManager.addPromptOrderForCharacter(promptManager.activeCharacter, updatedPromptOrder);
    promptManager.log?.(`Prompt order updated for ${promptManager.activeCharacter?.name ?? 'OpenAI preset'}.`);
    markPresetPromptServiceSettingsSavePending();
}

function areStringArraysEqual(left, right) {
    return left.length === right.length && left.every((value, index) => value === right[index]);
}

function preventPresetDragEvent(event) {
    event.preventDefault?.();
    event.stopPropagation?.();
    event.stopImmediatePropagation?.();
}

function applyPresetSwitchOptimization() {
    if (!settings.presetSwitchOptimizationEnabled) {
        removePresetSwitchOptimization();
        return;
    }

    applyPresetSelectChangeDeferral();
    applyPresetDeleteSelectionOptimization();
    applyPresetListActionDelegation();
    installPresetVuePromptListRenderPatch();
    applyPresetGroupDeletedCleanup();
    applyPresetGroupImportCleanup();
    applyPresetGroupRenameCleanup();
    applyPresetSwitchBeforeOptimization();
    applyPresetModelChangeTokenRefreshOptimization();
    applyPresetChatLoadedTokenRefreshOptimization();

    if (extensionState[PRESET_SWITCH_HANDLER_KEY]) {
        return;
    }

    const handler = async () => {
        await handleOpenAiPresetChangedAfter();
    };

    extensionState[PRESET_SWITCH_HANDLER_KEY] = handler;

    if (typeof eventSource.makeFirst === 'function') {
        eventSource.makeFirst(event_types.OAI_PRESET_CHANGED_AFTER, handler);
    } else {
        eventSource.on(event_types.OAI_PRESET_CHANGED_AFTER, handler);
    }
}

// 切换优化关闭时的卸载。各事件代理(select/click/delete 等)内部都已按 settings 二次判定,
// 关掉后即静默,无需逐个解绑;真正会留下可见副作用的是 render patch——它会接管
// renderPromptManagerListItems 走快速刷新。单独关切换优化时(分组也关)必须主动拆掉 patch
// 并重渲染一次,让列表回到 ST 原生渲染。
// 分组开启时 patch 归分组管理(installPresetVuePromptListRenderPatch 由 applyPresetGrouping 装),
// 此处不拆。
function removePresetSwitchOptimization() {
    if (isPresetGroupingEnabled()) {
        return;
    }

    removePresetVuePromptListRenderPatch();

    if (!promptManager || typeof promptManager.renderPromptManagerListItems !== 'function') {
        return;
    }

    // patch 已拆,这次 renderPromptManagerListItems 会走 ST 原生实现重渲染列表。
    void Promise.resolve(promptManager.renderPromptManagerListItems()).catch(error => {
        console.debug(`${LOG_PREFIX} Failed to re-render prompt manager after disabling preset switch optimization`, error);
    });
}

function applyPresetGroupDeletedCleanup() {
    if (extensionState[PRESET_GROUP_PRESET_DELETED_HANDLER_KEY]) {
        return;
    }

    const handler = (event) => {
        if (event?.apiId !== 'openai' || !event?.name) {
            return;
        }

        resetPresetPromptGroupRuntimeState(event.name);
    };

    extensionState[PRESET_GROUP_PRESET_DELETED_HANDLER_KEY] = handler;
    eventSource.on(event_types.PRESET_DELETED, handler);
}

function applyPresetGroupImportCleanup() {
    if (extensionState[PRESET_GROUP_PRESET_IMPORT_HANDLER_KEY]) {
        return;
    }

    const handler = (event) => {
        const presetName = event?.presetName;

        if (!presetName) {
            return;
        }

        collapseImportedPresetPromptGroups(event?.data);
        resetPresetPromptGroupRuntimeState(presetName);
    };

    extensionState[PRESET_GROUP_PRESET_IMPORT_HANDLER_KEY] = handler;
    eventSource.on(event_types.OAI_PRESET_IMPORT_READY, handler);
}

function applyPresetGroupRenameCleanup() {
    if (
        extensionState[PRESET_GROUP_PRESET_RENAMED_HANDLER_KEY]
        || !event_types.PRESET_RENAMED_BEFORE
        || !event_types.PRESET_RENAMED
    ) {
        return;
    }

    const beforeHandler = event => handlePresetPromptGroupRenamedBefore(event);
    const renamedHandler = event => {
        handlePresetPromptGroupRenamed(event);
    };

    extensionState[PRESET_GROUP_PRESET_RENAMED_HANDLER_KEY] = { beforeHandler, renamedHandler };
    eventSource.on(event_types.PRESET_RENAMED_BEFORE, beforeHandler);
    eventSource.on(event_types.PRESET_RENAMED, renamedHandler);
}

async function handlePresetPromptGroupRenamedBefore(event) {
    if (event?.apiId !== 'openai' || !event.oldName || !event.newName) {
        return;
    }

    const activeSaveRequests = beginOpenAiPresetRenameSaveGate(event.oldName, event.newName);

    try {
        await activeSaveRequests;

        if (!isPresetGroupingEnabled()) {
            return;
        }

        await flushScheduledPresetVuePromptOrderSave();
        if (extensionState.presetPromptGroupRuntimePresetName === event.oldName) {
            syncCurrentPresetPromptGroupStateToPresetExtensionField({ force: true, persist: false });
        }

        // ST 重命名 openai 预设时,会先保存一个空的新预设并触发预设切换;在开启预设切换
        // 优化后该切换被异步推迟,等它执行时会用空预设覆盖 oai_settings.extensions,导致分组丢失。
        // 这里在数据仍完整时(RENAMED_BEFORE)把分组状态深拷贝暂存,等 RENAMED 时再写回。
        extensionState.renamedPresetGroupStash = captureRenamedPresetGroupStash(event.oldName, event.newName);
    } catch (error) {
        console.debug(`${LOG_PREFIX} Failed to prepare preset prompt groups before preset rename`, error);
    }
}

function captureRenamedPresetGroupStash(oldName, newName) {
    const live = getObjectPath(oai_settings?.extensions, PRESET_GROUP_EXTENSION_PATH);
    const source = hasPresetPromptGroupStateData(live)
        ? live
        : (extensionState.presetPromptGroupRuntimePresetName === oldName ? extensionState.presetPromptGroupRuntimeState : null);

    if (!hasPresetPromptGroupStateData(source)) {
        return null;
    }

    return {
        newName,
        groupState: structuredClone(source),
    };
}

function restoreRenamedPresetGroupStash(newName) {
    const stash = extensionState.renamedPresetGroupStash;
    delete extensionState.renamedPresetGroupStash;

    if (!stash || stash.newName !== newName || !hasPresetPromptGroupStateData(stash.groupState)) {
        return false;
    }

    const groupState = structuredClone(stash.groupState);
    const payload = {
        presetName: newName,
        groupState,
        syncKey: `${newName}:${JSON.stringify(groupState)}`,
    };

    // 写回 oai_settings.extensions / serviceSettings(当前预设已是新名),随后的
    // update_oai_preset 会基于 oai_settings 落盘,从而把分组持久化到新预设文件。
    applyPresetPromptGroupExtensionPayloadToMemory(payload);
    extensionState.presetPromptGroupExtensionSyncKey = payload.syncKey;
    extensionState.presetPromptGroupRuntimePresetName = newName;
    extensionState.presetPromptGroupRuntimeState = structuredClone(groupState);
    markOpenAiPresetSavePending(newName);
    return true;
}

function handlePresetPromptGroupRenamed(event) {
    if (event?.apiId !== 'openai' || !event.oldName || !event.newName) {
        return;
    }

    migratePendingPresetPromptSavesAfterRename(event.oldName, event.newName);
    markOpenAiPresetRenameSaveGateRenamed(event.oldName, event.newName);

    if (!isPresetGroupingEnabled()) {
        return;
    }

    if (extensionState.presetPromptGroupRuntimePresetName === event.oldName) {
        extensionState.presetPromptGroupRuntimePresetName = event.newName;
    } else if (extensionState.presetPromptGroupRuntimePresetName === event.newName) {
        resetPresetPromptGroupRuntimeState(event.newName);
    }

    delete extensionState.presetPromptGroupExtensionSyncKey;

    // 把 RENAMED_BEFORE 暂存的分组数据写回新预设(此时内存中的分组已被异步预设切换清空)。
    restoreRenamedPresetGroupStash(event.newName);

    if (isPresetVuePromptListManagerActive()) {
        syncPresetVuePromptListManagerState();
        preparePromptManagerCustomDragList(getPromptManagerListElement(), {
            signature: getPresetVuePromptListManagerState().lastStructureSignature,
        });
    } else {
        schedulePresetVuePromptListManagerSync(0);
    }
}

function migratePendingPresetPromptSavesAfterRename(oldName, newName) {
    const manager = getPresetVuePromptListManagerState();
    migratePendingPresetPromptSaveMapAfterRename(getPendingPresetPromptServiceSaves(manager), oldName, newName);
    migratePendingPresetPromptSaveMapAfterRename(getPendingPresetPromptGroupSaves(manager), oldName, newName);
    migratePendingOpenAiPresetSaveSetAfterRename(getPendingOpenAiPresetSaves(manager), oldName, newName);
    migratePendingPresetPromptSaveRevisionAfterRename(getPresetPromptSaveRevisions(manager), oldName, newName);
    migrateOpenAiPresetSaveRequestStateAfterRename(getOpenAiPresetSaveRequestStates(manager), oldName, newName);
}

function migratePendingPresetPromptSaveMapAfterRename(map, oldName, newName) {
    if (!(map instanceof Map) || !map.has(oldName)) {
        return false;
    }

    const entry = map.get(oldName);
    map.delete(oldName);

    if (!entry || typeof entry !== 'object') {
        return false;
    }

    const migratedEntry = {
        ...entry,
        presetName: newName,
    };

    if (migratedEntry.groupState) {
        migratedEntry.syncKey = `${newName}:${JSON.stringify(migratedEntry.groupState)}`;
    }

    map.set(newName, migratedEntry);
    return true;
}

function migratePendingOpenAiPresetSaveSetAfterRename(set, oldName, newName) {
    if (!(set instanceof Set) || !set.has(oldName)) {
        return false;
    }

    set.delete(oldName);
    set.add(newName);
    return true;
}

function migratePendingPresetPromptSaveRevisionAfterRename(map, oldName, newName) {
    if (!(map instanceof Map) || !map.has(oldName)) {
        return false;
    }

    const revision = map.get(oldName);
    map.delete(oldName);
    map.set(newName, Math.max(Number(map.get(newName)) || 0, Number(revision) || 0));
    return true;
}

function migrateOpenAiPresetSaveRequestStateAfterRename(map, oldName, newName) {
    if (!(map instanceof Map) || !map.has(oldName)) {
        return false;
    }

    const sourceState = map.get(oldName);
    const targetState = map.get(newName);
    map.delete(oldName);

    if (!sourceState || typeof sourceState !== 'object') {
        return false;
    }

    sourceState.presetName = newName;

    if (!targetState || targetState === sourceState) {
        map.set(newName, sourceState);
        return true;
    }

    const sourceRevision = Number(sourceState.requestedRevision);
    const targetRevision = Number(targetState.requestedRevision);

    if (
        sourceState.requestedRevision !== null
        && (targetState.requestedRevision === null || sourceRevision >= targetRevision)
    ) {
        targetState.requestedRevision = sourceState.requestedRevision;
        targetState.requestedSnapshot = sourceState.requestedSnapshot;
    }

    targetState.presetName = newName;

    if (!targetState.promise && sourceState.promise) {
        map.set(newName, sourceState);
    } else {
        map.set(newName, targetState);
    }

    return true;
}

function collapseImportedPresetPromptGroups(presetData) {
    const groups = getObjectPath(presetData?.extensions, PRESET_GROUP_EXTENSION_PATH)?.groups;

    if (!Array.isArray(groups)) {
        return false;
    }

    for (const group of groups) {
        if (group && typeof group === 'object') {
            group.collapsed = true;
        }
    }

    return true;
}

function resetPresetPromptGroupRuntimeState(presetName = null) {
    if (presetName && extensionState.presetPromptGroupRuntimePresetName !== presetName) {
        return;
    }

    delete extensionState.presetPromptGroupRuntimePresetName;
    delete extensionState.presetPromptGroupRuntimeState;
}

function applyPresetModelChangeTokenRefreshOptimization() {
    if (extensionState[PRESET_MODEL_CHANGE_HANDLER_KEY]) {
        return;
    }

    const handler = () => {
        void handleChatCompletionModelChangedForPromptManager();
    };

    extensionState[PRESET_MODEL_CHANGE_HANDLER_KEY] = handler;

    if (typeof eventSource.makeFirst === 'function') {
        eventSource.makeFirst(event_types.CHATCOMPLETION_MODEL_CHANGED, handler);
    } else {
        eventSource.on(event_types.CHATCOMPLETION_MODEL_CHANGED, handler);
    }
}

function applyPresetChatLoadedTokenRefreshOptimization() {
    if (extensionState[PRESET_CHAT_LOADED_HANDLER_KEY]) {
        return;
    }

    const registrations = [];
    const register = (eventType, reason, {
        suppressMs = 0,
        delayMs = PRESET_CONTEXT_TOKEN_REFRESH_DELAY_MS,
        allowNoContext = false,
        requireVisible = true,
    } = {}) => {
        if (!eventType || typeof eventSource?.on !== 'function') {
            return;
        }

        const handler = () => {
            schedulePromptManagerContextTokenRefresh(reason, { suppressMs, delayMs, allowNoContext, requireVisible });
        };

        registrations.push({ eventType, handler });

        if (typeof eventSource.makeFirst === 'function') {
            eventSource.makeFirst(eventType, handler);
        } else {
            eventSource.on(eventType, handler);
        }
    };

    register(event_types.CHAT_LOADED, 'chat load', { suppressMs: PRESET_CHAT_LOAD_RENDER_SUPPRESS_MS, delayMs: 0 });
    register(event_types.CHAT_CHANGED, 'chat changed', { suppressMs: PRESET_CHAT_LOAD_RENDER_SUPPRESS_MS, allowNoContext: true });
    register('groupSelected', 'group selected', { suppressMs: PRESET_CHAT_LOAD_RENDER_SUPPRESS_MS, allowNoContext: true });
    register(event_types.CHARACTER_EDITED, 'character edited', { suppressMs: PRESET_CHAT_LOAD_RENDER_SUPPRESS_MS });
    register(event_types.CHARACTER_DELETED, 'character deleted', { suppressMs: PRESET_CHAT_LOAD_RENDER_SUPPRESS_MS });
    register(event_types.MESSAGE_SENT, 'message sent', { delayMs: PROMPT_MANAGER_TOKEN_REFRESH_BUSY_DELAY_MS });
    register(event_types.MESSAGE_RECEIVED, 'message received', { suppressMs: PRESET_CHAT_LOAD_RENDER_SUPPRESS_MS, delayMs: PROMPT_MANAGER_TOKEN_REFRESH_BUSY_DELAY_MS });
    register(event_types.MESSAGE_EDITED, 'message edited', { suppressMs: PRESET_CHAT_LOAD_RENDER_SUPPRESS_MS, delayMs: PROMPT_MANAGER_TOKEN_REFRESH_BUSY_DELAY_MS });
    register(event_types.MESSAGE_UPDATED, 'message updated', { delayMs: PROMPT_MANAGER_TOKEN_REFRESH_BUSY_DELAY_MS });
    register(event_types.MESSAGE_DELETED, 'message deleted', { suppressMs: PRESET_CHAT_LOAD_RENDER_SUPPRESS_MS, delayMs: PROMPT_MANAGER_TOKEN_REFRESH_BUSY_DELAY_MS });
    register(event_types.MESSAGE_SWIPED, 'message swiped', { delayMs: PROMPT_MANAGER_TOKEN_REFRESH_BUSY_DELAY_MS });
    register(event_types.MESSAGE_SWIPE_DELETED, 'message swipe deleted', { delayMs: PROMPT_MANAGER_TOKEN_REFRESH_BUSY_DELAY_MS });
    register(event_types.GENERATION_ENDED, 'generation ended', { delayMs: PROMPT_MANAGER_TOKEN_REFRESH_FAST_DELAY_MS });
    register(event_types.WORLDINFO_SETTINGS_UPDATED, 'world info settings updated', { suppressMs: PRESET_CHAT_LOAD_RENDER_SUPPRESS_MS });
    register(event_types.WORLDINFO_UPDATED, 'world info updated');
    register(event_types.WORLDINFO_FORCE_ACTIVATE, 'world info force activate');
    register(event_types.WORLDINFO_SCAN_DONE, 'world info scan done');
    register(event_types.PERSONA_CHANGED, 'persona changed');
    register(event_types.PERSONA_CREATED, 'persona created');
    register(event_types.PERSONA_UPDATED, 'persona updated');
    register(event_types.PERSONA_RENAMED, 'persona renamed');
    register(event_types.PERSONA_DELETED, 'persona deleted');
    register(event_types.CHATCOMPLETION_SOURCE_CHANGED, 'chat completion source changed', { suppressMs: PRESET_CHAT_LOAD_RENDER_SUPPRESS_MS });
    register(event_types.SETTINGS_UPDATED, 'settings updated', { delayMs: 250 });

    const tokenSettingsHandler = event => {
        const target = event.target instanceof Element ? event.target : null;
        if (!target?.matches?.('#openai_max_context, #openai_max_tokens')) {
            return;
        }

        schedulePromptManagerContextTokenRefresh('token budget changed', {
            suppressMs: PRESET_CHAT_LOAD_RENDER_SUPPRESS_MS,
            delayMs: PRESET_CONTEXT_TOKEN_REFRESH_DELAY_MS,
            requireVisible: true,
        });
    };

    document.addEventListener('change', tokenSettingsHandler, true);

    extensionState[PRESET_CHAT_LOADED_HANDLER_KEY] = {
        registrations,
        tokenSettingsHandler,
    };

    schedulePromptManagerContextTokenRefresh('initial prompt manager token refresh', {
        delayMs: 250,
        allowNoContext: true,
    });
}

function schedulePromptManagerContextTokenRefresh(reason, {
    suppressMs = 0,
    delayMs = PRESET_CONTEXT_TOKEN_REFRESH_DELAY_MS,
    allowNoContext = false,
    requireVisible = true,
} = {}) {
    if (!settings.presetSwitchOptimizationEnabled) {
        return;
    }

    if (requireVisible && !isPromptManagerTokenPanelVisible()) {
        return;
    }

    const state = getPresetContextTokenRefreshState();
    const now = Date.now();
    if (state.inFlight || now < Number(state.suppressUntil || 0)) {
        return;
    }

    const hasContext = hasPromptManagerTokenContext();
    if (!hasContext && !allowNoContext) {
        return;
    }

    if (suppressMs > 0) {
        suppressPromptManagerDebouncedRender(suppressMs);
    }

    state.reason = reason || 'context change';
    state.attempt = 0;
    state.allowNoContext = Boolean(allowNoContext);
    state.requireVisible = Boolean(requireVisible);

    clearTimeout(state.timer);
    state.timer = setTimeout(() => {
        state.timer = null;
        void runPromptManagerContextTokenRefresh(state.reason, state.attempt, state.allowNoContext, state.requireVisible);
    }, Math.max(0, Number(delayMs) || 0));
}

function hasPromptManagerTokenContext() {
    return Boolean(getCurrentChatId?.());
}

function getPresetContextTokenRefreshState() {
    if (!extensionState[PRESET_CONTEXT_TOKEN_REFRESH_KEY] || typeof extensionState[PRESET_CONTEXT_TOKEN_REFRESH_KEY] !== 'object') {
        extensionState[PRESET_CONTEXT_TOKEN_REFRESH_KEY] = {
            timer: null,
            reason: '',
            attempt: 0,
            allowNoContext: false,
            requireVisible: true,
            inFlight: false,
            suppressUntil: 0,
        };
    }

    return extensionState[PRESET_CONTEXT_TOKEN_REFRESH_KEY];
}

async function handleChatCompletionModelChangedForPromptManager() {
    if (!settings.presetSwitchOptimizationEnabled || !isPromptManagerReadyForFastPresetSwitch()) {
        return;
    }

    try {
        suppressPromptManagerDebouncedRender();
        await renderPromptManagerListWithoutTokenStats();
        refreshPromptManagerTokensAfterPresetSwitchDebounced();
    } catch (error) {
        console.debug(`${LOG_PREFIX} Failed to fast-refresh prompt manager after model change`, error);
    }
}

async function runPromptManagerContextTokenRefresh(reason, attempt = 0, allowNoContext = false, requireVisible = true) {
    if (!settings.presetSwitchOptimizationEnabled) {
        return;
    }

    try {
        if (requireVisible && !isPromptManagerTokenPanelVisible()) {
            return;
        }

        if (isPresetGenerationActive()) {
            return;
        }

        if (!isPromptManagerReadyForFastPresetSwitch()) {
            if (attempt >= PRESET_CONTEXT_TOKEN_REFRESH_MAX_ATTEMPTS) {
                return;
            }

            const state = getPresetContextTokenRefreshState();
            state.reason = reason || state.reason || 'context change';
            state.attempt = attempt + 1;
            state.allowNoContext = Boolean(allowNoContext);
            state.requireVisible = Boolean(requireVisible);
            clearTimeout(state.timer);
            state.timer = setTimeout(() => {
                state.timer = null;
                void runPromptManagerContextTokenRefresh(state.reason, state.attempt, state.allowNoContext, state.requireVisible);
            }, PRESET_CONTEXT_TOKEN_REFRESH_RETRY_MS);
            return;
        }

        if (!hasPromptManagerTokenContext()) {
            if (allowNoContext) {
                await refreshPromptManagerTokensForMissingContext();
            }
            return;
        }

        await fastRefreshPromptManagerTokensAfterContextChange(reason || 'context change', { markPending: false, forceVisible: !requireVisible });
    } catch (error) {
        console.debug(`${LOG_PREFIX} Failed to fast-refresh prompt manager after ${reason}`, error);
    }
}

async function refreshPromptManagerTokensForMissingContext() {
    const contextRefreshState = getPresetContextTokenRefreshState();
    const queueState = getPromptManagerTokenRefreshQueueState();
    contextRefreshState.inFlight = true;
    const startedSignature = getPromptManagerTokenRefreshSignature();
    const startedEffectiveTokenCountSignature = getPresetEffectiveTokenCountSignature();
    const startedEffectiveTokenCountsCurrent = arePromptManagerTokenCountsCurrent();
    queueState.lastSignature = '';
    if (!startedEffectiveTokenCountsCurrent) {
        queueState.lastEffectiveTokenCountSignature = '';
        updatePresetEffectiveTokenHeaderDisplay(null);
    }

    try {
        const refreshed = await refreshPromptManagerStaticTokensWithoutChatContext();
        if (refreshed) {
            const completedSignature = getPromptManagerTokenRefreshSignature();
            const completedEffectiveTokenCountSignature = getPresetEffectiveTokenCountSignature();

            if (startedSignature && completedSignature === startedSignature) {
                queueState.lastSignature = startedSignature;
            } else {
                queueState.lastSignature = '';
                queueState.pendingAfterFlight = true;
            }

            if (startedEffectiveTokenCountSignature && completedEffectiveTokenCountSignature === startedEffectiveTokenCountSignature) {
                queueState.lastEffectiveTokenCountSignature = startedEffectiveTokenCountSignature;
            } else if (startedEffectiveTokenCountSignature) {
                queueState.lastEffectiveTokenCountSignature = '';
                updatePresetEffectiveTokenHeaderDisplay(null);
                queueState.pendingAfterFlight = true;
            }
        }
        if (isPresetVuePromptListManagerActive()) {
            // Vue 列表已激活时,跳过 ST 原生 renderPromptManagerListWithoutTokenStats:
            // 它内部的 promptManager.renderPromptManager() 会重建整个面板 DOM、抹掉
            // Vue host,迫使列表从零重装(丢失当前状态、并造成卡顿)。结构已在 Vue model 中,
            // token 数走命令式 DOM 更新即可。
            syncPresetVuePromptListManagerState();
        } else {
            await renderPromptManagerListWithoutTokenStats();
        }
        schedulePromptManagerTokenDisplayUpdate();
    } catch (error) {
        console.debug(`${LOG_PREFIX} Failed to refresh prompt manager after leaving chat`, error);
    } finally {
        contextRefreshState.inFlight = false;
        contextRefreshState.suppressUntil = Date.now() + PRESET_CONTEXT_TOKEN_REFRESH_SELF_SUPPRESS_MS;
    }
}

async function refreshPromptManagerStaticTokensWithoutChatContext() {
    if (!promptManager?.tokenHandler || typeof promptManager.getPromptCollection !== 'function') {
        return false;
    }

    const tokenHandler = promptManager.tokenHandler;
    if (typeof tokenHandler.resetCounts !== 'function' || typeof tokenHandler.getCounts !== 'function') {
        return false;
    }

    tokenHandler.resetCounts();
    const counts = tokenHandler.getCounts();

    for (const prompt of promptManager.serviceSettings?.prompts || []) {
        if (prompt?.identifier) {
            counts[prompt.identifier] = 0;
        }
    }

    const promptCollection = promptManager.getPromptCollection('normal');
    const prompts = Array.isArray(promptCollection?.collection) ? promptCollection.collection : [];
    const entries = prompts
        .filter(prompt => prompt?.identifier && typeof prompt.content === 'string' && prompt.content.length > 0)
        .map(prompt => ({
            identifier: prompt.identifier,
            message: {
                role: prompt.role || 'system',
                content: prompt.content,
            },
        }));

    if (entries.length > 0) {
        if (!isOpenAITokenizerBulkEnabled()) {
            return false;
        }

        const model = getTokenizerModel();
        const rawCounts = await getOpenAITokenizerBulkCountsUsingCache(model, entries);
        rawCounts.forEach((count, index) => {
            counts[entries[index].identifier] = normalizeOpenAITokenizerPromptManagerCount(count, model);
        });
    }

    promptManager.tokenUsage = typeof tokenHandler.getTotal === 'function' ? tokenHandler.getTotal() : 0;
    return true;
}

async function getOpenAITokenizerBulkCountsUsingCache(model, entries) {
    const results = new Array(entries.length);
    const misses = [];

    for (let index = 0; index < entries.length; index += 1) {
        const entry = entries[index];
        const key = getOpenAITokenizerCacheKey(model, entry.message);
        const cached = getOpenAITokenizerBulkState().cache.get(key);

        if (typeof cached === 'number') {
            results[index] = cached;
            continue;
        }

        misses.push({
            index,
            key,
            message: entry.message,
        });
    }

    if (misses.length > 0) {
        const counts = await fetchOpenAITokenizerBulkCounts(model, misses);
        counts.forEach((count, missIndex) => {
            const miss = misses[missIndex];
            setOpenAITokenizerBulkCache(miss.key, count);
            results[miss.index] = count;
        });
    }

    return results.map(count => Number(count) || 0);
}

function normalizeOpenAITokenizerPromptManagerCount(rawCount, model) {
    const count = Number(rawCount);
    if (!Number.isFinite(count)) {
        return 0;
    }

    return Math.max(0, count - (model === 'claude' ? 1 : 3));
}

async function fastRefreshPromptManagerTokensAfterContextChange(reason, { markPending = true, forceVisible = false } = {}) {
    try {
        if (!isPromptManagerReadyForFastPresetSwitch()) {
            return;
        }

        if (!forceVisible && !isPromptManagerTokenPanelVisible()) {
            return;
        }

        await renderPromptManagerListWithoutTokenStats();
        if (markPending) {
            markPromptManagerTokensPending();
        }
        schedulePromptManagerTokenRefresh(reason || 'context change token refresh', {
            delayMs: PROMPT_MANAGER_TOKEN_REFRESH_FAST_DELAY_MS,
            forceVisible,
        });
    } catch (error) {
        console.debug(`${LOG_PREFIX} Failed to fast-refresh prompt manager after ${reason}`, error);
    }
}

function applyPresetDeleteSelectionOptimization() {
    if (extensionState[PRESET_DELETE_HANDLER_KEY]) {
        return;
    }

    const handler = (event) => {
        handleOpenAiPresetDeleteClick(event);
    };

    extensionState[PRESET_DELETE_HANDLER_KEY] = handler;
    document.addEventListener('click', handler, true);
}

function applyPresetListActionDelegation() {
    if (extensionState[PRESET_LIST_ACTION_HANDLER_KEY]) {
        return;
    }

    const handler = (event) => {
        handlePresetListActionClick(event);
    };

    extensionState[PRESET_LIST_ACTION_HANDLER_KEY] = handler;
    document.addEventListener('click', handler, true);
}

function applyPresetSwitchBeforeOptimization() {
    if (extensionState[PRESET_SWITCH_BEFORE_HANDLER_KEY]) {
        return;
    }

    const handler = async (event) => {
        await handleOpenAiPresetChangedBefore(event);
    };

    extensionState[PRESET_SWITCH_BEFORE_HANDLER_KEY] = handler;

    if (typeof eventSource.makeLast === 'function') {
        eventSource.makeLast(event_types.OAI_PRESET_CHANGED_BEFORE, handler);
    } else {
        eventSource.on(event_types.OAI_PRESET_CHANGED_BEFORE, handler);
    }
}

function applyPresetSelectChangeDeferral() {
    if (extensionState[PRESET_SELECT_CHANGE_HANDLER_KEY]) {
        return;
    }

    const handler = (event) => {
        deferOpenAiPresetSelectChangeOnMobile(event);
    };

    extensionState[PRESET_SELECT_CHANGE_HANDLER_KEY] = handler;
    document.addEventListener('change', handler, true);
}

function deferOpenAiPresetSelectChangeOnMobile(event) {
    if (!settings.presetSwitchOptimizationEnabled || !isMobile()) {
        return;
    }

    const select = event.target instanceof HTMLSelectElement ? event.target : null;

    if (!select?.matches(OPENAI_PRESET_SELECT_SELECTOR) || extensionState.allowOpenAiPresetSelectChange) {
        return;
    }

    event.stopPropagation();
    event.stopImmediatePropagation();
    select.blur();

    setTimeout(() => {
        extensionState.allowOpenAiPresetSelectChange = true;
        try {
            $(select).trigger('change');
        } finally {
            extensionState.allowOpenAiPresetSelectChange = false;
        }
    }, 0);
}

function handleOpenAiPresetDeleteClick(event) {
    if (!settings.presetSwitchOptimizationEnabled) {
        return;
    }

    const target = event.target instanceof Element ? event.target : null;
    const button = target?.closest(OPENAI_PRESET_DELETE_SELECTOR);

    if (!button) {
        return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    void deleteOpenAiPresetSelectingNext();
}

async function deleteOpenAiPresetSelectingNext() {
    const confirm = await callGenericPopup(t`Delete the preset? This action is irreversible and your current settings will be overwritten.`, POPUP_TYPE.CONFIRM);

    if (!confirm) {
        return;
    }

    const select = document.querySelector(OPENAI_PRESET_SELECT_SELECTOR);
    const nameToDelete = oai_settings.preset_settings_openai;

    if (!(select instanceof HTMLSelectElement) || !nameToDelete) {
        return;
    }

    clearPendingPresetPromptChanges();

    const deletedIndex = Math.max(0, select.selectedIndex);
    const value = openai_setting_names?.[nameToDelete];

    if (value !== undefined) {
        select.querySelector(`option[value="${escapeCssSelectorValue(value)}"]`)?.remove();
    } else if (select.selectedIndex >= 0) {
        select.options[select.selectedIndex]?.remove();
    }

    delete openai_setting_names[nameToDelete];
    oai_settings.preset_settings_openai = null;

    if (Object.keys(openai_setting_names).length && select.options.length) {
        const nextIndex = deletedIndex < select.options.length ? deletedIndex : 0;
        select.selectedIndex = nextIndex;
        oai_settings.preset_settings_openai = select.options[nextIndex]?.text ?? null;
        $(select).trigger('change');
    }

    const response = await fetch('/api/presets/delete', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({ apiId: 'openai', name: nameToDelete }),
    });

    if (!response.ok) {
        toastr.warning(t`Preset was not deleted from server`);
    } else {
        toastr.success(t`Preset deleted`);
        await eventSource.emit(event_types.PRESET_DELETED, { apiId: 'openai', name: nameToDelete });
    }

    await saveSettings();
}

function escapeCssSelectorValue(value) {
    const text = String(value);
    return typeof globalThis.CSS?.escape === 'function'
        ? globalThis.CSS.escape(text)
        : text.replace(/["\\]/g, '\\$&');
}

function handlePresetListActionClick(event) {
    if (!settings.presetSwitchOptimizationEnabled && !isPresetGroupingEnabled()) {
        return;
    }

    const target = event.target instanceof Element ? event.target : null;

    if (!target) {
        closePresetPromptActionMenus();
        return;
    }

    const menuButton = target.closest(`${PRESET_PROMPT_MANAGER_LIST_SELECTOR} .bai-bai-preset-prompt-actions-hint`);

    if (menuButton instanceof HTMLElement) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        togglePresetPromptActionMenu(menuButton);
        return;
    }

    if (!target.closest(`${PRESET_PROMPT_MANAGER_LIST_SELECTOR} .bai-bai-preset-prompt-actions, ${PRESET_PROMPT_MANAGER_LIST_SELECTOR} .bai-bai-preset-prompt-actions-hint`)) {
        closePresetPromptActionMenus();
    }

    if (!target.closest(PRESET_PROMPT_MANAGER_LIST_SELECTOR)) {
        return;
    }

    if (handlePresetVuePromptRangeSelectionDelegatedClick(event, target)) {
        return;
    }

    const action = target.closest('[data-preset-prompt-action], .prompt-manager-detach-action, .prompt-manager-inspect-action, .prompt-manager-edit-action');

    if (!action) {
        return;
    }

    handlePresetPromptActionButtonClick(event, action);
}

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

async function addPresetPromptToGlobalLibrary(promptId) {
    if (!promptId) {
        toastr.warning(t`没有找到要添加到全局库的条目。`);
        return false;
    }

    const sourcePrompt = promptManager?.getPromptById?.(promptId);

    if (!sourcePrompt) {
        toastr.warning(t`没有找到要添加到全局库的条目。`);
        return false;
    }

    const item = {
        id: uuidv4(),
        name: normalizePresetGlobalPromptLibraryName(sourcePrompt.name),
        content: typeof sourcePrompt.content === 'string' ? sourcePrompt.content : String(sourcePrompt.content ?? ''),
    };

    try {
        await updatePresetGlobalPromptLibrary(library => {
            library.items.push(item);
            return library;
        });
        toastr.success(t`已添加到全局库。`);
        return true;
    } catch (error) {
        console.debug(`${LOG_PREFIX} Failed to add preset prompt to global library`, error);
        toastr.error(t`添加到全局库失败。`);
        return false;
    }
}

async function insertPresetGlobalPromptLibraryItemToCurrentPreset(itemId) {
    return insertPresetGlobalLibraryItemsToCurrentPreset(itemId ? [itemId] : []);
}

async function insertPresetGlobalLibraryItemsToCurrentPreset(itemIds) {
    const ids = Array.isArray(itemIds) ? itemIds.filter(Boolean) : [];

    if (ids.length === 0) {
        toastr.warning(t`没有要添加的全局库条目。`);
        return false;
    }

    if (
        !promptManager?.activeCharacter
        || !Array.isArray(promptManager.serviceSettings?.prompts)
        || typeof promptManager.addPrompt !== 'function'
    ) {
        toastr.warning(t`当前无法添加全局库条目。`);
        return false;
    }

    const promptOrder = promptManager.getPromptOrderForCharacter?.(promptManager.activeCharacter);

    if (!Array.isArray(promptOrder)) {
        toastr.warning(t`当前预设列表不可用。`);
        return false;
    }

    const library = await loadPresetGlobalPromptLibrary();
    const itemsById = new Map(library.items.map(item => [item.id, item]));
    const items = ids.map(id => itemsById.get(id)).filter(Boolean);

    if (items.length === 0) {
        toastr.warning(t`没有找到要添加的全局库条目。`);
        return false;
    }

    const target = await choosePresetGlobalPromptInsertTarget();

    if (!target) {
        return false;
    }

    const counts = promptManager.tokenHandler?.getCounts?.();
    // 目标为「预设顶部」时,insertPresetGlobalPromptOrderEntry 用 unshift,
    // 逆序插入才能让整批保持选择顺序;分组目标则顺序追加在组末,正序即可。
    const ordered = target?.type === 'group' ? items : items.slice().reverse();

    for (const item of ordered) {
        const promptId = createUniquePresetPromptIdentifier();
        const promptName = createPresetGlobalPromptInsertName(item.name);

        promptManager.addPrompt({
            name: promptName,
            role: 'system',
            content: item.content,
        }, promptId);

        insertPresetGlobalPromptOrderEntry(promptOrder, { identifier: promptId, enabled: true }, target);

        if (counts) {
            counts[promptId] = null;
        }

        promptManager.log?.(`Added global library prompt: ${item.id} -> ${promptId}.`);
    }

    refreshPresetPromptListAfterCopy();

    try {
        markPresetPromptServiceSettingsSavePending();
        await flushPendingPresetPromptChanges({ includeOpenAiPresetSaves: false });
        toastr.success(items.length > 1 ? t`已添加 ${items.length} 条到当前预设。` : t`已添加到当前预设。`);
        refreshPromptManagerTokensDebounced();
        return true;
    } catch (error) {
        console.debug(`${LOG_PREFIX} Failed to save global library prompt insert`, error);
        toastr.error(t`添加到当前预设后保存失败。`);
        return false;
    }
}

async function choosePresetGlobalPromptInsertTarget() {
    const groupState = getPresetPromptGroupState();
    const groups = Array.isArray(groupState?.groups)
        ? groupState.groups.filter(group => group?.id && String(group.name || '').trim())
        : [];

    if (!groups.length) {
        return { type: 'top' };
    }

    const result = await showPresetGlobalLibraryDialog({
        title: t`添加到当前预设`,
        fields: [{
            id: 'target',
            type: 'select',
            label: t`添加位置`,
            value: 'top',
            options: [
                { value: 'top', label: t`独立在预设最上方` },
                ...groups.map(group => ({
                    value: group.id,
                    label: group.name,
                })),
            ],
        }],
        confirmText: t`添加`,
        cancelText: t`取消`,
    });

    if (!result) {
        return null;
    }

    return result.target === 'top'
        ? { type: 'top' }
        : { type: 'group', groupId: result.target };
}

function insertPresetGlobalPromptOrderEntry(promptOrder, orderEntry, target) {
    if (!Array.isArray(promptOrder) || !orderEntry?.identifier) {
        return;
    }

    if (target?.type !== 'group' || !target.groupId) {
        promptOrder.unshift(orderEntry);
        return;
    }

    const groupState = getPresetPromptGroupState();
    const groupExists = Array.isArray(groupState.groups)
        && groupState.groups.some(group => group?.id === target.groupId);

    if (!groupExists) {
        promptOrder.unshift(orderEntry);
        return;
    }

    if (!groupState.prompts || typeof groupState.prompts !== 'object') {
        groupState.prompts = {};
    }

    const groupPromptIds = new Set(
        Object.entries(groupState.prompts ?? {})
            .filter(([, meta]) => meta?.groupId === target.groupId)
            .map(([promptId]) => promptId),
    );
    let insertIndex = 0;

    for (let index = 0; index < promptOrder.length; index += 1) {
        if (groupPromptIds.has(promptOrder[index]?.identifier)) {
            insertIndex = index + 1;
        }
    }

    promptOrder.splice(insertIndex, 0, orderEntry);
    groupState.prompts[orderEntry.identifier] = { groupId: target.groupId };
    savePresetPromptGroupSettings({ force: true });
}

function createPresetGlobalPromptInsertName(name) {
    const baseName = normalizePresetGlobalPromptLibraryName(name);
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

async function editPresetGlobalPromptLibraryItem(itemId) {
    const item = await getPresetGlobalPromptLibraryItem(itemId);

    if (!item) {
        toastr.warning(t`没有找到这个全局库条目。`);
        return false;
    }

    const result = await showPresetGlobalLibraryDialog({
        title: t`编辑全局库条目`,
        fields: [
            {
                id: 'name',
                type: 'text',
                label: t`名称`,
                value: item.name,
            },
            {
                id: 'content',
                type: 'textarea',
                label: t`内容`,
                value: item.content,
                rows: 16,
            },
        ],
        confirmText: t`保存`,
        cancelText: t`取消`,
    });

    if (!result) {
        return false;
    }

    const normalizedName = normalizePresetGlobalPromptLibraryName(result.name);
    const nextContent = typeof result.content === 'string' ? result.content : String(result.content ?? '');

    try {
        await updatePresetGlobalPromptLibrary(library => {
            library.items = library.items.map(entry => entry.id === itemId
                ? {
                    id: entry.id,
                    name: normalizedName,
                    content: nextContent,
                }
                : entry);
            return library;
        });
        toastr.success(t`已更新全局库条目。`);
        return true;
    } catch (error) {
        console.debug(`${LOG_PREFIX} Failed to edit preset global library item`, error);
        toastr.error(t`更新全局库条目失败。`);
        return false;
    }
}

async function deletePresetGlobalPromptLibraryItem(itemId) {
    const item = await getPresetGlobalPromptLibraryItem(itemId);

    if (!item) {
        toastr.warning(t`没有找到这个全局库条目。`);
        return false;
    }

    const confirmed = await showPresetGlobalLibraryDialog({
        title: t`删除全局库条目`,
        message: t`要删除这个全局库条目吗？`,
        confirmText: t`删除`,
        cancelText: t`取消`,
        danger: true,
    });

    if (!confirmed) {
        return false;
    }

    try {
        await updatePresetGlobalPromptLibrary(library => {
            library.items = library.items.filter(entry => entry.id !== itemId);
            return library;
        });
        toastr.success(t`已删除全局库条目。`);
        return true;
    } catch (error) {
        console.debug(`${LOG_PREFIX} Failed to delete preset global library item`, error);
        toastr.error(t`删除全局库条目失败。`);
        return false;
    }
}

// 拖拽落地:vue-draggable 已就地改动 model.globalLibrary 的 ungrouped / groups[].children,
// 从中读出每个条目的最终归属与顺序,写回权威 library 并持久化。失败时重载还原。
async function handlePresetGlobalLibraryDrop() {
    const model = getPresetVuePromptListManagerState().state;
    const library = model?.globalLibrary;

    if (!library) {
        return;
    }

    const desired = [];
    const seen = new Set();
    const pushNode = (node, groupId) => {
        if (!node?.id || seen.has(node.id)) {
            return;
        }
        seen.add(node.id);
        desired.push({ id: node.id, groupId: groupId || null });
    };

    for (const node of Array.isArray(library.ungrouped) ? library.ungrouped : []) {
        pushNode(node, null);
    }

    for (const group of Array.isArray(library.groups) ? library.groups : []) {
        for (const node of Array.isArray(group.children) ? group.children : []) {
            pushNode(node, group.groupId);
        }
    }

    const desiredById = new Map(desired.map(entry => [entry.id, entry.groupId]));

    try {
        await updatePresetGlobalPromptLibrary(currentLibrary => {
            const validGroupIds = new Set(currentLibrary.groups.map(group => group.id));
            const remaining = currentLibrary.items.slice();
            const reordered = [];

            for (const entry of desired) {
                const index = remaining.findIndex(item => item.id === entry.id);

                if (index === -1) {
                    continue;
                }

                const [item] = remaining.splice(index, 1);
                item.groupId = entry.groupId && validGroupIds.has(entry.groupId) ? entry.groupId : null;
                reordered.push(item);
            }

            for (const item of remaining) {
                if (desiredById.has(item.id)) {
                    const groupId = desiredById.get(item.id);
                    item.groupId = groupId && validGroupIds.has(groupId) ? groupId : null;
                }
                reordered.push(item);
            }

            currentLibrary.items = reordered;
            return currentLibrary;
        });
    } catch (error) {
        console.debug(`${LOG_PREFIX} Failed to persist global library drag`, error);
        toastr.error(t`移动全局库条目失败。`);
        void loadPresetGlobalPromptLibrary({ force: true, showLoading: false });
    }
}

async function createPresetGlobalLibraryGroup() {
    const result = await showPresetGlobalLibraryDialog({
        title: t`新建分组`,
        fields: [{
            id: 'name',
            type: 'text',
            label: t`分组名称`,
            value: '',
        }],
        confirmText: t`创建`,
        cancelText: t`取消`,
    });

    if (!result) {
        return false;
    }

    const name = normalizePresetGlobalPromptLibraryName(result.name);

    try {
        await updatePresetGlobalPromptLibrary(library => {
            library.groups.push({ id: uuidv4(), name, collapsed: false });
            return library;
        });
        toastr.success(t`已新建分组。`);
        return true;
    } catch (error) {
        console.debug(`${LOG_PREFIX} Failed to create global library group`, error);
        toastr.error(t`新建分组失败。`);
        return false;
    }
}

async function renamePresetGlobalLibraryGroup(groupId) {
    if (!groupId) {
        return false;
    }

    const library = await loadPresetGlobalPromptLibrary();
    const group = library.groups.find(entry => entry.id === groupId);

    if (!group) {
        toastr.warning(t`没有找到这个分组。`);
        return false;
    }

    const result = await showPresetGlobalLibraryDialog({
        title: t`重命名分组`,
        fields: [{
            id: 'name',
            type: 'text',
            label: t`分组名称`,
            value: group.name,
        }],
        confirmText: t`保存`,
        cancelText: t`取消`,
    });

    if (!result) {
        return false;
    }

    const name = normalizePresetGlobalPromptLibraryName(result.name);

    try {
        await updatePresetGlobalPromptLibrary(currentLibrary => {
            currentLibrary.groups = currentLibrary.groups.map(entry => entry.id === groupId
                ? { ...entry, name }
                : entry);
            return currentLibrary;
        });
        toastr.success(t`已重命名分组。`);
        return true;
    } catch (error) {
        console.debug(`${LOG_PREFIX} Failed to rename global library group`, error);
        toastr.error(t`重命名分组失败。`);
        return false;
    }
}

async function deletePresetGlobalLibraryGroup(groupId) {
    if (!groupId) {
        return false;
    }

    const library = await loadPresetGlobalPromptLibrary();
    const group = library.groups.find(entry => entry.id === groupId);

    if (!group) {
        toastr.warning(t`没有找到这个分组。`);
        return false;
    }

    const confirmed = await showPresetGlobalLibraryDialog({
        title: t`删除分组`,
        message: t`删除分组后,组内条目会移到未分组,条目本身不会被删除。确定删除吗？`,
        confirmText: t`删除`,
        cancelText: t`取消`,
        danger: true,
    });

    if (!confirmed) {
        return false;
    }

    try {
        await updatePresetGlobalPromptLibrary(currentLibrary => {
            currentLibrary.groups = currentLibrary.groups.filter(entry => entry.id !== groupId);
            currentLibrary.items = currentLibrary.items.map(item => item.groupId === groupId
                ? { ...item, groupId: null }
                : item);
            return currentLibrary;
        });
        toastr.success(t`已删除分组。`);
        return true;
    } catch (error) {
        console.debug(`${LOG_PREFIX} Failed to delete global library group`, error);
        toastr.error(t`删除分组失败。`);
        return false;
    }
}

function togglePresetGlobalLibraryGroupCollapsed(groupId) {
    if (!groupId) {
        return;
    }

    // UI-only state: expanding/collapsing global-library groups must not hit storage.
    const model = getPresetVuePromptListManagerState().state;
    const modelGroup = model?.globalLibrary?.groups?.find(group => group.groupId === groupId);
    const nextCollapsed = modelGroup ? !modelGroup.collapsed : true;

    if (modelGroup) {
        modelGroup.collapsed = nextCollapsed;
    }

    const manager = getPresetVuePromptListManagerState();
    manager.globalLibraryGroups = normalizePresetGlobalPromptLibraryGroups(manager.globalLibraryGroups)
        .map(group => group.id === groupId ? { ...group, collapsed: nextCollapsed } : group);
    markPresetVuePromptListSyncSignatureCurrent();
}

function getPresetGlobalLibraryItemIdFromAction(action) {
    const row = action instanceof Element
        ? action.closest('.bai-bai-preset-global-library-prompt[data-preset-global-library-id]')
        : null;

    return row?.dataset?.presetGlobalLibraryId || null;
}

function getPresetGlobalLibraryGroupIdFromAction(action) {
    const group = action instanceof Element
        ? action.closest('[data-preset-global-library-group-id]')
        : null;

    return group?.dataset?.presetGlobalLibraryGroupId || null;
}

function getPresetPromptIdFromAction(action) {
    const row = action instanceof Element
        ? action.closest(`${PRESET_PROMPT_MANAGER_LIST_SELECTOR} li.completion_prompt_manager_prompt[data-pm-identifier]`)
        : null;

    return row?.dataset?.pmIdentifier || null;
}

function isPresetPromptAssignedToExistingGroup(promptId) {
    if (!promptId) {
        return false;
    }

    const groupState = getPresetPromptGroupState();
    const groupId = groupState.prompts?.[promptId]?.groupId;

    return Boolean(groupId && groupState.groups?.some(group => group?.id === groupId));
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

async function handleOpenAiPresetChangedBefore(event) {
    extensionState.openAiPresetSwitchEarlyRendered = false;
    clearPendingPresetPromptChangesForPreset(event?.presetNameBefore);
    resetPresetPromptGroupRuntimeState();

    if (!settings.presetSwitchOptimizationEnabled || !isPromptManagerReadyForFastPresetSwitch()) {
        return;
    }

    const preset = event?.preset;

    if (!preset || typeof preset !== 'object' || (!Array.isArray(preset.prompts) && !Array.isArray(preset.prompt_order))) {
        return;
    }

    try {
        applyPromptManagerPresetFieldsEarly(preset);
        await renderPromptManagerListWithoutTokenStats();
        markPromptManagerTokensPending();
        extensionState.openAiPresetSwitchEarlyRendered = true;
        await waitForNextPaint();
    } catch (error) {
        extensionState.openAiPresetSwitchEarlyRendered = false;
        console.debug(`${LOG_PREFIX} Failed to early-render prompt manager after preset switch`, error);
    }
}

async function handleOpenAiPresetChangedAfter() {
    if (!settings.presetSwitchOptimizationEnabled || !isPromptManagerReadyForFastPresetSwitch()) {
        if (isPresetGroupingEnabled()) {
            syncPresetVuePromptListManagerState();
        }
        return;
    }

    try {
        if (!extensionState.openAiPresetSwitchEarlyRendered) {
            await renderPromptManagerListWithoutTokenStats();
            markPromptManagerTokensPending();
        }

        suppressPromptManagerDebouncedRender();
        if (isPresetGroupingEnabled()) {
            syncPresetVuePromptListManagerState();
        }
        refreshPromptManagerTokensAfterPresetSwitchDebounced();
    } catch (error) {
        console.debug(`${LOG_PREFIX} Failed to fast-render prompt manager after preset switch`, error);
    } finally {
        extensionState.openAiPresetSwitchEarlyRendered = false;
    }
}

function isPromptManagerReadyForFastPresetSwitch() {
    return Boolean(
        promptManager
        && typeof promptManager.renderDebounced === 'function'
        && typeof promptManager.renderPromptManager === 'function'
        && typeof promptManager.renderPromptManagerListItems === 'function'
        && promptManager.containerElement
        && promptManager.serviceSettings,
    );
}

function applyPromptManagerPresetFieldsEarly(preset) {
    if (Array.isArray(preset.prompts)) {
        oai_settings.prompts = structuredClone(preset.prompts);
    }

    if (Array.isArray(preset.prompt_order)) {
        oai_settings.prompt_order = structuredClone(preset.prompt_order);
    }

    oai_settings.extensions = preset.extensions && typeof preset.extensions === 'object'
        ? structuredClone(preset.extensions)
        : {};

    promptManager.serviceSettings = oai_settings;
    promptManager.sanitizeServiceSettings?.();
}

async function renderPromptManagerListWithoutTokenStats() {
    if (isPresetGlobalLibraryDialogOpen()) {
        // 全局库弹窗挂在 #completion_prompt_manager 容器内,而 promptManager.renderPromptManager()
        // 会清空该容器,会把正在编辑/选择的弹窗一起删掉。弹窗打开期间推迟重建,关闭后补一次。
        extensionState.presetPromptListRebuildDeferredByDialog = true;
        return;
    }

    installPresetVuePromptListRenderPatch();
    const scrollContainer = promptManager.containerElement.closest('.scrollableInner');
    const scrollTop = scrollContainer?.scrollTop;
    const renderCycle = (extensionState.presetPromptManagerFastRenderCycle ?? 0) + 1;

    extensionState.presetPromptManagerFastRenderCycle = renderCycle;

    try {
        promptManager.error = null;
        await promptManager.renderPromptManager();
        await renderPromptManagerListItemsFast({ skipVueSyncIfCurrentCycle: true });
        schedulePromptManagerDraggableInit();

        if (typeof scrollTop === 'number') {
            scrollContainer?.scrollTo(0, scrollTop);
        }

        flushPromptManagerTokenRefreshIfPendingVisible('prompt manager rendered');
    } finally {
        if (extensionState.presetPromptManagerFastRenderCycle === renderCycle) {
            extensionState.presetPromptManagerFastRenderCycle = 0;
        }
    }
}

async function renderPromptManagerListItemsFast({ skipVueSyncIfCurrentCycle = false } = {}) {
    if (isPresetGroupingEnabled()) {
        const manager = getPresetVuePromptListManagerState();

        if (
            skipVueSyncIfCurrentCycle
            && manager.lastRenderPatchSyncCycle
            && manager.lastRenderPatchSyncCycle === extensionState.presetPromptManagerFastRenderCycle
            && isPresetVuePromptListManagerActive()
        ) {
            preparePromptManagerCustomDragList(getPromptManagerListElement(), { signature: manager.lastStructureSignature });
            return;
        }

        await installPresetVuePromptListManager();

        if (syncPresetVuePromptListManagerState()) {
            preparePromptManagerCustomDragList(getPromptManagerListElement(), { signature: manager.lastStructureSignature });
            return;
        }
    }

    const promptManagerList = promptManager.listElement;

    if (!promptManager.serviceSettings?.prompts || !promptManagerList) {
        return;
    }

    const { prefix } = promptManager.configuration;
    const promptOrder = promptManager.getPromptOrderForCharacter?.(promptManager.activeCharacter) ?? [];
    const prompts = promptManager.serviceSettings.prompts.filter(Boolean);
    const promptById = new Map(prompts.map(prompt => [prompt.identifier, prompt]));
    const orderEntryById = new Map(promptOrder.filter(Boolean).map(entry => [entry.identifier, entry]));
    const counts = promptManager.tokenHandler?.getCounts?.() ?? {};
    const toggleDisabled = new Set(promptManager.configuration.toggleDisabled ?? []);
    const overriddenPrompts = new Set(Array.isArray(promptManager.overriddenPrompts) ? promptManager.overriddenPrompts : []);
    const tokenBudget = promptManager.serviceSettings.openai_max_context - promptManager.serviceSettings.openai_max_tokens;
    const isTokenUsageWarning = promptManager.tokenUsage > tokenBudget * 0.8;

    let listItemHtml = await renderTemplateAsync('promptManagerListHeader', { prefix });

    for (const orderEntry of promptOrder) {
        const prompt = promptById.get(orderEntry?.identifier);

        if (!prompt) {
            continue;
        }

        const listEntry = orderEntryById.get(prompt.identifier) ?? orderEntry;
        const enabledClass = listEntry?.enabled ? '' : `${prefix}prompt_manager_prompt_disabled`;
        const draggableClass = `${prefix}prompt_manager_prompt_draggable`;
        const markerClass = prompt.marker ? `${prefix}prompt_manager_marker` : '';
        const tokens = counts[prompt.identifier] ?? 0;
        const { warningClass, warningTitle } = getPromptTokenWarning({
            prompt,
            tokens,
            isTokenUsageWarning,
        });

        const calculatedTokens = tokens ? tokens : '-';
        const canDelete = isPresetPromptDeleteOrDetachAllowed(prompt);
        const canEdit = FORCE_EDIT_PROMPTS.has(prompt.identifier) || !prompt.marker;
        const canToggle = prompt.marker && !FORCE_TOGGLE_PROMPTS.has(prompt.identifier)
            ? false
            : !toggleDisabled.has(prompt.identifier);
        // 切换优化的快速刷新只在「未开启分组」时走到这里(分组开启会在上面委派给 Vue 后 return)。
        // 渲染 ST 原生平铺菜单,而非收缩菜单——收缩菜单是预设分组专属。
        const controlsHtml = renderNativePromptControlsHtml({
            canDelete,
            canEdit,
            canToggle,
            isEnabled: listEntry?.enabled !== false,
        });

        listItemHtml += renderPromptManagerListRow({
            prefix,
            prompt,
            enabledClass,
            draggableClass,
            markerClass,
            importantClass: getPromptImportantClass(prompt, prefix),
            controlsHtml,
            warningClass,
            warningTitle,
            calculatedTokens,
            isOverriddenPrompt: overriddenPrompts.has(prompt.identifier),
        });
    }

    promptManagerList.innerHTML = listItemHtml;
}

function renderPromptManagerListRow({
    prefix,
    prompt,
    enabledClass,
    draggableClass,
    markerClass,
    importantClass,
    controlsHtml,
    warningClass,
    warningTitle,
    calculatedTokens,
    isOverriddenPrompt,
}) {
    const encodedId = escapeHtml(prompt.identifier);
    const encodedName = escapeHtml(prompt.name ?? '');
    const isMarkerPrompt = prompt.marker && prompt.injection_position !== INJECTION_POSITION.ABSOLUTE;
    const isSystemPrompt = !prompt.marker && prompt.system_prompt && prompt.injection_position !== INJECTION_POSITION.ABSOLUTE && !prompt.forbid_overrides;
    const isImportantPrompt = !prompt.marker && prompt.system_prompt && prompt.injection_position !== INJECTION_POSITION.ABSOLUTE && prompt.forbid_overrides;
    const isUserPrompt = !prompt.marker && !prompt.system_prompt && prompt.injection_position !== INJECTION_POSITION.ABSOLUTE;
    const isInjectionPrompt = prompt.injection_position === INJECTION_POSITION.ABSOLUTE;
    const iconLookup = prompt.role === 'system' && (prompt.marker || prompt.system_prompt) ? '' : prompt.role;
    const promptRoles = {
        assistant: { roleIcon: 'fa-robot', roleTitle: 'Prompt will be sent as Assistant' },
        user: { roleIcon: 'fa-user', roleTitle: 'Prompt will be sent as User' },
    };
    const roleIcon = promptRoles[iconLookup]?.roleIcon || '';
    const roleTitle = promptRoles[iconLookup]?.roleTitle || '';

    return `
        <li class="${prefix}prompt_manager_prompt ${draggableClass} ${enabledClass} ${markerClass} ${importantClass}" data-pm-identifier="${encodedId}">
            <span class="drag-handle">☰</span>
            <span class="${prefix}prompt_manager_prompt_name" data-pm-name="${encodedName}">
                ${isMarkerPrompt ? '<span class="fa-fw fa-solid fa-thumb-tack" title="Marker"></span>' : ''}
                ${isSystemPrompt ? '<span class="fa-fw fa-solid fa-square-poll-horizontal" title="Global Prompt"></span>' : ''}
                ${isImportantPrompt ? '<span class="fa-fw fa-solid fa-star" title="Important Prompt"></span>' : ''}
                ${isUserPrompt ? '<span class="fa-fw fa-solid fa-asterisk" title="Preset Prompt"></span>' : ''}
                ${isInjectionPrompt ? '<span class="fa-fw fa-solid fa-syringe" title="In-Chat Injection"></span>' : ''}
                ${promptManager.isPromptInspectionAllowed?.(prompt) ? `<a title="${encodedName}" class="prompt-manager-inspect-action">${encodedName}</a>` : `<span title="${encodedName}">${encodedName}</span>`}
                ${roleIcon ? `<span data-role="${escapeHtml(prompt.role)}" class="fa-xs fa-solid ${roleIcon}" title="${roleTitle}"></span>` : ''}
                ${isInjectionPrompt ? `<small class="prompt-manager-injection-depth">@ ${escapeHtml(prompt.injection_depth?.toString?.() ?? '')}</small>` : ''}
                ${isOverriddenPrompt ? '<small class="fa-solid fa-address-card prompt-manager-overridden" title="Pulled from a character card"></small>' : ''}
            </span>
            <span>
                <span class="prompt_manager_prompt_controls">
                    ${controlsHtml}
                </span>
            </span>
            <span class="prompt_manager_prompt_tokens" data-pm-tokens="${calculatedTokens}"><span class="${warningClass}" title="${warningTitle}"> </span>${calculatedTokens}</span>
        </li>
    `;
}

function getPromptImportantClass(prompt, prefix) {
    return !prompt.marker && prompt.system_prompt && prompt.injection_position !== INJECTION_POSITION.ABSOLUTE && prompt.forbid_overrides
        ? `${prefix}prompt_manager_important`
        : '';
}

function getPromptTokenWarning({ prompt, tokens, isTokenUsageWarning }) {
    const result = { warningClass: '', warningTitle: '' };

    if (!isTokenUsageWarning || prompt.identifier !== 'chatHistory') {
        return result;
    }

    if (tokens <= promptManager.configuration.dangerTokenThreshold) {
        result.warningClass = 'fa-solid tooltip fa-triangle-exclamation text_danger';
        result.warningTitle = 'Very little of your chat history is being sent, consider deactivating some other prompts.';
    } else if (tokens <= promptManager.configuration.warningTokenThreshold) {
        result.warningClass = 'fa-solid tooltip fa-triangle-exclamation text_warning';
        result.warningTitle = 'Only a few messages worth chat history is being sent.';
    }

    return result;
}

function getPresetEffectiveTokenGroupContext() {
    if (!isPresetGroupingEnabled()) {
        return null;
    }

    const groupState = getPresetPromptGroupState();
    const groups = Array.isArray(groupState?.groups) ? groupState.groups : [];
    return {
        promptGroups: groupState?.prompts ?? {},
        groupsById: new Map(groups.map(group => [String(group?.id ?? ''), group])),
    };
}

function isPresetPromptIncludedInEffectiveTokenTotal(prompt, orderEntry, groupContext = null) {
    const promptId = prompt?.identifier;

    if (!promptId || orderEntry?.enabled === false || PRESET_CONTEXT_INJECTION_PROMPT_IDS.has(promptId)) {
        return false;
    }

    if (!isPresetGroupingEnabled()) {
        return true;
    }

    const context = groupContext ?? getPresetEffectiveTokenGroupContext();
    const groupId = context?.promptGroups?.[promptId]?.groupId;

    if (!groupId) {
        return true;
    }

    const group = context?.groupsById?.get(String(groupId));

    return group?.enabled !== false;
}

function normalizePresetEffectiveTokenCount(value) {
    if (value === null) {
        return null;
    }

    if (value === undefined) {
        return 0;
    }

    const tokens = Number(value);
    return Number.isFinite(tokens) && tokens >= 0 ? Math.round(tokens) : 0;
}

function getPresetEffectiveTokenCountSignature() {
    try {
        const serviceSettings = promptManager?.serviceSettings ?? oai_settings;
        const prompts = Array.isArray(serviceSettings?.prompts)
            ? serviceSettings.prompts.filter(Boolean)
            : [];
        const promptOrder = promptManager?.getPromptOrderForCharacter?.(promptManager.activeCharacter) ?? [];
        const promptById = new Map(prompts.map(prompt => [prompt.identifier, prompt]));
        const promptParts = [];

        for (const orderEntry of promptOrder) {
            const promptId = orderEntry?.identifier || '';
            if (!promptId || PRESET_CONTEXT_INJECTION_PROMPT_IDS.has(promptId)) {
                continue;
            }

            const prompt = promptById.get(promptId);

            promptParts.push([
                promptId,
                prompt?.role || '',
                prompt?.marker ? 1 : 0,
                getStringHash(String(prompt?.content ?? '')),
            ].join(':'));
        }

        return [
            getTokenizerModel(),
            promptParts.join('|'),
        ].join('||');
    } catch (error) {
        console.debug(`${LOG_PREFIX} Failed to build preset effective token count signature`, error);
        return '';
    }
}

function arePromptManagerTokenCountsCurrent() {
    const signature = getPresetEffectiveTokenCountSignature();
    const queueState = getPromptManagerTokenRefreshQueueState();

    return Boolean(
        signature
        && queueState.lastEffectiveTokenCountSignature
        && signature === queueState.lastEffectiveTokenCountSignature
    );
}

function calculatePresetEffectivePromptTokenTotal() {
    const counts = promptManager?.tokenHandler?.getCounts?.();
    const promptOrder = promptManager?.getPromptOrderForCharacter?.(promptManager.activeCharacter) ?? [];
    const prompts = Array.isArray(promptManager?.serviceSettings?.prompts)
        ? promptManager.serviceSettings.prompts.filter(Boolean)
        : [];

    if (!counts || !promptOrder.length || !prompts.length) {
        return null;
    }

    const promptById = new Map(prompts.map(prompt => [prompt.identifier, prompt]));
    const allowCurrentCounts = arePromptManagerTokenCountsCurrent();

    if (!allowCurrentCounts) {
        return null;
    }

    const groupContext = getPresetEffectiveTokenGroupContext();
    let total = 0;
    let includedCount = 0;

    for (const orderEntry of promptOrder) {
        const prompt = promptById.get(orderEntry?.identifier);

        if (!isPresetPromptIncludedInEffectiveTokenTotal(prompt, orderEntry, groupContext)) {
            continue;
        }

        includedCount += 1;
        const tokens = normalizePresetEffectiveTokenCount(counts[prompt.identifier]);

        if (tokens === null) {
            return null;
        }

        total += tokens;
    }

    return includedCount > 0 ? Math.round(total) : 0;
}

function formatPresetEffectiveTokenHeaderText(value) {
    if (value === null || value === undefined) {
        return PRESET_EFFECTIVE_TOKEN_HEADER_PENDING_TEXT;
    }

    const total = Number(value);
    return `预设总Token: ${Number.isFinite(total) ? Math.max(0, Math.round(total)) : 0}`;
}

function updatePresetEffectiveTokenHeaderDisplay(value = undefined) {
    if (!isPresetGroupingEnabled()) {
        return false;
    }

    const list = document.querySelector(PRESET_PROMPT_MANAGER_LIST_SELECTOR);
    const label = list?.querySelector(`li.completion_prompt_manager_list_head span.${PRESET_EFFECTIVE_TOKEN_HEADER_CLASS}`);

    if (!label) {
        return false;
    }

    const nextText = formatPresetEffectiveTokenHeaderText(
        value === undefined ? calculatePresetEffectivePromptTokenTotal() : value,
    );

    if (label.textContent !== nextText) {
        label.textContent = nextText;
    }

    if (label.title !== PRESET_EFFECTIVE_TOKEN_HEADER_TITLE) {
        label.title = PRESET_EFFECTIVE_TOKEN_HEADER_TITLE;
    }

    return true;
}

function schedulePromptManagerDraggableInit() {
    const initId = (extensionState.promptManagerDraggableInitId ?? 0) + 1;
    extensionState.promptManagerDraggableInitId = initId;

    setTimeout(() => {
        if (extensionState.promptManagerDraggableInitId !== initId) {
            return;
        }

        try {
            patchPromptManagerDraggable();
            promptManager.makeDraggable?.();
            preparePromptManagerCustomDragList();
        } catch (error) {
            console.debug(`${LOG_PREFIX} Failed to initialize prompt manager sorting`, error);
        }
    }, 0);
}

function waitForNextPaint() {
    return new Promise(resolve => {
        let settled = false;
        const finish = () => {
            if (settled) {
                return;
            }

            settled = true;
            clearTimeout(fallback);
            resolve();
        };
        const fallback = setTimeout(finish, 80);

        if (typeof requestAnimationFrame !== 'function') {
            finish();
            return;
        }

        requestAnimationFrame(() => setTimeout(finish, 0));
    });
}

function suppressPromptManagerDebouncedRender(restoreDelayMs = 0) {
    const originalRenderDebounced = promptManager.renderDebounced;

    if (typeof originalRenderDebounced !== 'function' || originalRenderDebounced.__baiBaiToolkitPresetSwitchSuppressed) {
        return;
    }

    const suppressedRenderDebounced = () => { };
    suppressedRenderDebounced.__baiBaiToolkitPresetSwitchSuppressed = true;
    suppressedRenderDebounced.__baiBaiToolkitOriginalRenderDebounced = originalRenderDebounced;
    promptManager.renderDebounced = suppressedRenderDebounced;

    setTimeout(() => {
        if (promptManager?.renderDebounced === suppressedRenderDebounced) {
            promptManager.renderDebounced = originalRenderDebounced;
        }
    }, Math.max(0, Number(restoreDelayMs) || 0));
}

function applyPresetToggleOptimization() {
    if (!extensionState[PRESET_TOGGLE_HANDLER_KEY]) {
        const handler = (event) => {
            handlePresetPromptToggleClick(event);
        };

        extensionState[PRESET_TOGGLE_HANDLER_KEY] = handler;
        document.addEventListener('click', handler, true);
    }
}

function applyPresetSaveOptimization() {
    if (extensionState[PRESET_SAVE_HANDLER_KEY]) {
        return;
    }

    const handler = (event) => {
        handlePresetPromptSaveClick(event);
    };

    extensionState[PRESET_SAVE_HANDLER_KEY] = handler;
    document.addEventListener('click', handler, true);
}

function handlePresetPromptToggleClick(event) {
    // 分组模式下的条目列表由插件自行渲染(Vue),开关按钮没有 ST 原生 click 监听,
    // 只能靠此委托处理器响应。因此开启分组时也必须处理,即使 toggle 优化开关本身是关的。
    if (!settings.presetToggleOptimizationEnabled && !isPresetGroupingEnabled()) {
        return;
    }

    const target = event.target instanceof Element ? event.target : null;
    const toggle = target?.closest(`${PRESET_PROMPT_MANAGER_LIST_SELECTOR} .prompt-manager-toggle-action`);

    if (!toggle) {
        return;
    }

    const row = toggle.closest('li.completion_prompt_manager_prompt');
    const promptId = row?.dataset?.pmIdentifier;

    if (!row || !promptId || !promptManager?.activeCharacter || typeof promptManager.getPromptOrderEntry !== 'function') {
        return;
    }

    const promptOrderEntry = promptManager.getPromptOrderEntry(promptManager.activeCharacter, promptId);

    if (!promptOrderEntry) {
        return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    promptOrderEntry.enabled = !promptOrderEntry.enabled;

    for (const promptRow of findPromptManagerRows(promptId)) {
        updatePromptToggleRow(promptRow, promptRow.querySelector('.prompt-manager-toggle-action'), promptOrderEntry.enabled);
    }

    // DOM 与 Vue model 已就地同步;若成功,刷新签名基线,
    // 避免随后的 token 刷新把这次结构变更当作需要整列重建。
    const vueUpdated = updatePresetVuePromptItemEnabled(promptId, promptOrderEntry.enabled);
    if (vueUpdated && isPresetVuePromptListManagerActive()) {
        markPresetVuePromptListSyncSignatureCurrent();
    }
    updatePresetEffectiveTokenHeaderDisplay();
    markPresetPromptServiceSettingsSavePending();
    markOpenAiPresetSavePending();

    refreshPromptManagerTokensDebounced();
}

function handlePresetPromptSaveClick(event) {
    const target = event.target instanceof Element ? event.target : null;
    const saveButton = target?.closest(PRESET_PROMPT_MANAGER_SAVE_SELECTOR);

    if (!saveButton) {
        return;
    }

    flushPresetPromptCodeMirrorEditor('optimized save click');

    if (!settings.presetToggleOptimizationEnabled || !promptManager || typeof promptManager.getPromptById !== 'function') {
        scheduleOpenAiPresetSaveAfterPromptEdit();
        return;
    }

    const promptId = saveButton.dataset.pmPrompt;
    const prompt = promptId ? promptManager.getPromptById(promptId) : null;

    if (!prompt || typeof promptManager.updatePromptWithPromptEditForm !== 'function') {
        scheduleOpenAiPresetSaveAfterPromptEdit();
        return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    promptManager.updatePromptWithPromptEditForm(prompt);
    markOpenAiPresetSavePending();
    updateQuickEditPrompt(promptId, prompt);
    updatePromptManagerRowFromPrompt(prompt);
    promptManager.hidePopup?.();
    promptManager.clearEditForm?.();

    void saveOpenAiPresetAfterPromptEdit({ allowPresetAutoSave: true })
        .catch(error => {
            console.debug(`${LOG_PREFIX} Failed to save prompt edits`, error);
        });

    refreshPromptManagerTokensDebounced();
}

function scheduleOpenAiPresetSaveAfterPromptEdit() {
    setTimeout(() => {
        void saveOpenAiPresetAfterPromptEdit({ allowPresetAutoSave: true })
            .catch(error => {
                console.debug(`${LOG_PREFIX} Failed to prepare prompt edit preset save`, error);
            });
    }, 0);
}

async function saveOpenAiPresetAfterPromptEdit({ allowPresetAutoSave = false } = {}) {
    markPresetPromptServiceSettingsSavePending();
    markOpenAiPresetSavePending();

    if (!allowPresetAutoSave || !settings.presetAutoSaveAfterPromptEditEnabled) {
        return false;
    }

    await flushPendingPresetPromptChanges({ includeOpenAiPresetSaves: true });
    return true;
}

async function triggerOpenAiPresetUpdateAndWait(presetName = oai_settings?.preset_settings_openai) {
    syncOpenAiPromptManagerStateToSettings();
    const revision = getPresetPromptSaveRevision(presetName);
    const presetSnapshot = getChatCompletionPresetFromSettings(oai_settings);
    await saveOpenAiPresetSnapshot(presetName, presetSnapshot, { revision });
}

function waitForOpenAiPresetUpdateRequest(presetName) {
    if (typeof globalThis.fetch !== 'function') {
        return waitForOpenAiPresetUpdateFallback();
    }

    const originalFetch = globalThis.fetch;
    let captured = false;
    let settled = false;
    let timeout = 0;

    return new Promise((resolve, reject) => {
        const cleanup = () => {
            if (globalThis.fetch === patchedFetch) {
                globalThis.fetch = originalFetch;
            }

            if (timeout) {
                clearTimeout(timeout);
                timeout = 0;
            }
        };

        const settle = (handler, value) => {
            if (settled) {
                return;
            }

            settled = true;
            cleanup();
            handler(value);
        };

        const patchedFetch = function (...args) {
            const result = originalFetch.apply(this, args);

            if (!captured && isOpenAiPresetSaveRequest(args[0], args[1], presetName)) {
                captured = true;
                Promise.resolve(result)
                    .then(response => {
                        if (response?.ok) {
                            settle(resolve, true);
                            return;
                        }

                        settle(reject, new Error('OpenAI preset update request failed'));
                    })
                    .catch(error => settle(reject, error));
            }

            return result;
        };

        globalThis.fetch = patchedFetch;
        timeout = setTimeout(() => settle(resolve, false), 1200);
    });
}

function isOpenAiPresetSaveRequest(resource, init, presetName) {
    const url = typeof resource === 'string'
        ? resource
        : typeof resource?.url === 'string'
            ? resource.url
            : '';

    if (!url.includes('/api/presets/save')) {
        return false;
    }

    const method = String(init?.method || resource?.method || 'GET').toUpperCase();
    if (method !== 'POST') {
        return false;
    }

    if (typeof init?.body !== 'string') {
        return true;
    }

    try {
        const payload = JSON.parse(init.body);

        if (payload?.apiId && payload.apiId !== 'openai') {
            return false;
        }

        if (presetName && payload?.name && payload.name !== presetName) {
            return false;
        }
    } catch {
        return true;
    }

    return true;
}

function waitForOpenAiPresetUpdateFallback() {
    return new Promise(resolve => setTimeout(resolve, 1200));
}

function updatePromptToggleRow(row, toggle, isEnabled) {
    row.classList.toggle('completion_prompt_manager_prompt_disabled', !isEnabled);

    if (toggle) {
        toggle.classList.toggle('fa-toggle-on', isEnabled);
        toggle.classList.toggle('fa-toggle-off', !isEnabled);
    }
}

function updatePromptTokenCell(row, value, warning = null) {
    const tokenCell = row.querySelector('.prompt_manager_prompt_tokens');

    if (!tokenCell) {
        return;
    }

    const warningClass = warning?.warningClass ?? '';
    const warningTitle = warning?.warningTitle ?? '';
    const displayValue = value ? String(value) : '-';
    const existingWarning = tokenCell.querySelector('span');
    if (tokenCell.dataset.pmTokens === displayValue
        && tokenCell.textContent?.trim() === displayValue
        && (existingWarning?.className ?? '') === warningClass
        && (existingWarning?.title ?? '') === warningTitle) {
        return;
    }

    const warningSpan = existingWarning ?? document.createElement('span');
    warningSpan.className = warningClass;
    warningSpan.title = warningTitle;
    warningSpan.textContent = ' ';
    tokenCell.dataset.pmTokens = displayValue;
    tokenCell.replaceChildren(warningSpan, document.createTextNode(displayValue));
}

function updateQuickEditPrompt(promptId, prompt) {
    if (!['main', 'nsfw', 'jailbreak'].includes(promptId)) {
        return;
    }

    promptManager.updateQuickEdit?.(promptId, prompt);
}

function updatePromptManagerRowFromPrompt(prompt) {
    const rows = findPromptManagerRows(prompt.identifier);

    if (!rows.length) {
        return;
    }

    const listEntry = promptManager.getPromptOrderEntry?.(promptManager.activeCharacter, prompt.identifier);
    const isEnabled = listEntry?.enabled ?? true;
    const isImportantPrompt = !prompt.marker && prompt.system_prompt && prompt.injection_position !== INJECTION_POSITION.ABSOLUTE && prompt.forbid_overrides;

    for (const row of rows) {
        row.classList.toggle('completion_prompt_manager_prompt_disabled', !isEnabled);
        row.classList.toggle('completion_prompt_manager_marker', Boolean(prompt.marker));
        row.classList.toggle('completion_prompt_manager_important', Boolean(isImportantPrompt));

        const nameContainer = row.querySelector('.completion_prompt_manager_prompt_name');

        if (nameContainer) {
            renderPromptNameCell(nameContainer, prompt, {
                allowInspect: row.dataset.presetFavoriteMirror !== 'true',
            });
        }

        updatePromptTokenCell(row, null);
    }
}

function findPromptManagerRow(promptId) {
    return findPromptManagerRows(promptId)[0] ?? null;
}

function findPromptManagerRows(promptId) {
    const list = document.querySelector(PRESET_PROMPT_MANAGER_LIST_SELECTOR);

    if (!list) {
        return [];
    }

    return Array.from(list.querySelectorAll('li.completion_prompt_manager_prompt[data-pm-identifier]'))
        .filter(row => row.dataset.pmIdentifier === promptId);
}

function renderPromptNameCell(container, prompt, { allowInspect = true } = {}) {
    const promptName = prompt.name ?? '';
    const isMarkerPrompt = prompt.marker && prompt.injection_position !== INJECTION_POSITION.ABSOLUTE;
    const isSystemPrompt = !prompt.marker && prompt.system_prompt && prompt.injection_position !== INJECTION_POSITION.ABSOLUTE && !prompt.forbid_overrides;
    const isImportantPrompt = !prompt.marker && prompt.system_prompt && prompt.injection_position !== INJECTION_POSITION.ABSOLUTE && prompt.forbid_overrides;
    const isUserPrompt = !prompt.marker && !prompt.system_prompt && prompt.injection_position !== INJECTION_POSITION.ABSOLUTE;
    const isInjectionPrompt = prompt.injection_position === INJECTION_POSITION.ABSOLUTE;
    const isOverriddenPrompt = Array.isArray(promptManager.overriddenPrompts) && promptManager.overriddenPrompts.includes(prompt.identifier);
    const iconLookup = prompt.role === 'system' && (prompt.marker || prompt.system_prompt) ? '' : prompt.role;
    const promptRoles = {
        assistant: { roleIcon: 'fa-robot', roleTitle: 'Prompt will be sent as Assistant' },
        user: { roleIcon: 'fa-user', roleTitle: 'Prompt will be sent as User' },
    };
    const role = promptRoles[iconLookup];

    container.dataset.pmName = promptName;
    container.replaceChildren();

    if (isMarkerPrompt) appendIcon(container, 'fa-fw fa-solid fa-thumb-tack', 'Marker');
    if (isSystemPrompt) appendIcon(container, 'fa-fw fa-solid fa-square-poll-horizontal', 'Global Prompt');
    if (isImportantPrompt) appendIcon(container, 'fa-fw fa-solid fa-star', 'Important Prompt');
    if (isUserPrompt) appendIcon(container, 'fa-fw fa-solid fa-asterisk', 'Preset Prompt');
    if (isInjectionPrompt) appendIcon(container, 'fa-fw fa-solid fa-syringe', 'In-Chat Injection');

    const canInspect = promptManager.isPromptInspectionAllowed?.(prompt);
    const nameElement = document.createElement(allowInspect && canInspect ? 'a' : 'span');
    nameElement.title = promptName;
    nameElement.textContent = promptName;

    if (nameElement instanceof HTMLAnchorElement) {
        nameElement.className = 'prompt-manager-inspect-action';
        nameElement.addEventListener('click', promptManager.handleInspect);
    } else if (canInspect) {
        nameElement.className = 'prompt-manager-inspect-action bai-bai-preset-prompt-name-visual-only';
    }

    container.append(nameElement);

    if (role) {
        const roleIcon = document.createElement('span');
        roleIcon.dataset.role = prompt.role;
        roleIcon.className = `fa-xs fa-solid ${role.roleIcon}`;
        roleIcon.title = role.roleTitle;
        container.append(document.createTextNode(' '), roleIcon);
    }

    if (isInjectionPrompt) {
        const depth = document.createElement('small');
        depth.className = 'prompt-manager-injection-depth';
        depth.textContent = `@ ${prompt.injection_depth}`;
        container.append(document.createTextNode(' '), depth);
    }

    if (isOverriddenPrompt) {
        const overridden = document.createElement('small');
        overridden.className = 'fa-solid fa-address-card prompt-manager-overridden';
        overridden.title = 'Pulled from a character card';
        container.append(document.createTextNode(' '), overridden);
    }
}

function appendIcon(container, className, title) {
    const icon = document.createElement('span');
    icon.className = className;
    icon.title = title;
    container.append(icon, document.createTextNode(' '));
}

const refreshPromptManagerTokensDebounced = (reason = 'prompt manager token refresh') => {
    schedulePromptManagerTokenRefresh(reason, { delayMs: PROMPT_MANAGER_TOKEN_REFRESH_DEFAULT_DELAY_MS });
};
const refreshPromptManagerTokensAfterPresetSwitchDebounced = (reason = 'prompt manager token refresh after preset switch') => {
    schedulePromptManagerTokenRefresh(reason, { delayMs: PROMPT_MANAGER_TOKEN_REFRESH_FAST_DELAY_MS, forceVisible: true });
};

function getPromptManagerTokenRefreshQueueState() {
    if (!extensionState[PROMPT_MANAGER_TOKEN_REFRESH_QUEUE_KEY] || typeof extensionState[PROMPT_MANAGER_TOKEN_REFRESH_QUEUE_KEY] !== 'object') {
        extensionState[PROMPT_MANAGER_TOKEN_REFRESH_QUEUE_KEY] = {
            timer: null,
            reason: '',
            inFlight: false,
            pendingAfterFlight: false,
            pendingWhileHidden: false,
            lastSignature: '',
            lastEffectiveTokenCountSignature: '',
            force: false,
            forceVisible: false,
            displayFrame: 0,
            pendingFrame: 0,
        };
    }

    const state = extensionState[PROMPT_MANAGER_TOKEN_REFRESH_QUEUE_KEY];
    if (typeof state.lastEffectiveTokenCountSignature !== 'string') {
        state.lastEffectiveTokenCountSignature = typeof state.lastEffectiveTokenSignature === 'string'
            ? state.lastEffectiveTokenSignature
            : '';
    }

    if (Object.prototype.hasOwnProperty.call(state, 'lastEffectiveTokenSignature')) {
        delete state.lastEffectiveTokenSignature;
    }

    return state;
}

function schedulePromptManagerTokenRefresh(reason = 'prompt manager token refresh', {
    delayMs = PROMPT_MANAGER_TOKEN_REFRESH_DEFAULT_DELAY_MS,
    force = false,
    forceVisible = false,
} = {}) {
    const state = getPromptManagerTokenRefreshQueueState();
    state.reason = reason || state.reason || 'prompt manager token refresh';
    state.force = Boolean(state.force || force);
    state.forceVisible = Boolean(state.forceVisible || forceVisible);

    if (!isPromptManagerTokenRefreshEnabled()) {
        clearTimeout(state.timer);
        state.timer = null;
        return;
    }

    if (extensionState.promptManagerCustomDragState || isPresetVuePromptListDragging()) {
        extensionState.promptManagerTokenRefreshPendingAfterDrag = true;
        return;
    }

    if (isPresetGenerationActive()) {
        clearTimeout(state.timer);
        state.timer = setTimeout(() => {
            state.timer = null;
            schedulePromptManagerTokenRefresh(state.reason || reason, {
                delayMs: PROMPT_MANAGER_TOKEN_REFRESH_BUSY_DELAY_MS,
                force: state.force,
                forceVisible: state.forceVisible,
            });
        }, PROMPT_MANAGER_TOKEN_REFRESH_BUSY_DELAY_MS);
        return;
    }

    if (state.inFlight) {
        state.pendingAfterFlight = true;
        return;
    }

    if (!state.forceVisible && !isPromptManagerTokenPanelVisible()) {
        state.pendingWhileHidden = true;
        return;
    }

    clearTimeout(state.timer);
    state.timer = setTimeout(() => {
        state.timer = null;
        void runScheduledPromptManagerTokenRefresh();
    }, Math.max(0, Number(delayMs) || 0));
}

function flushPromptManagerTokenRefreshIfPendingVisible(reason = 'prompt manager visible') {
    const state = getPromptManagerTokenRefreshQueueState();
    if (!state.pendingWhileHidden || !isPromptManagerTokenPanelVisible()) {
        return;
    }

    state.pendingWhileHidden = false;
    schedulePromptManagerTokenRefresh(reason, {
        delayMs: PROMPT_MANAGER_TOKEN_REFRESH_FAST_DELAY_MS,
        force: true,
        forceVisible: true,
    });
}

async function runScheduledPromptManagerTokenRefresh() {
    const state = getPromptManagerTokenRefreshQueueState();
    if (state.inFlight) {
        state.pendingAfterFlight = true;
        return;
    }

    state.inFlight = true;
    state.pendingAfterFlight = false;

    try {
        await refreshPromptManagerTokens({
            reason: state.reason,
            force: state.force,
            forceVisible: state.forceVisible,
        });
    } finally {
        state.inFlight = false;
        state.force = false;
        state.forceVisible = false;

        if (state.pendingAfterFlight) {
            state.pendingAfterFlight = false;
            schedulePromptManagerTokenRefresh(state.reason || 'pending prompt manager token refresh', {
                delayMs: PROMPT_MANAGER_TOKEN_REFRESH_DEFAULT_DELAY_MS,
                force: true,
                forceVisible: true,
            });
        }
    }
}

async function refreshPromptManagerTokens({ reason = 'prompt manager token refresh', force = false, forceVisible = false } = {}) {
    if (!isPromptManagerTokenRefreshEnabled()) {
        return;
    }

    if (extensionState.promptManagerCustomDragState || isPresetVuePromptListDragging()) {
        extensionState.promptManagerTokenRefreshPendingAfterDrag = true;
        return;
    }

    if (isPresetGenerationActive()) {
        return;
    }

    if (!forceVisible && !isPromptManagerTokenPanelVisible()) {
        getPromptManagerTokenRefreshQueueState().pendingWhileHidden = true;
        return;
    }

    if (!hasPromptManagerTokenContext()) {
        await refreshPromptManagerTokensForMissingContext();
        return;
    }

    try {
        const contextRefreshState = getPresetContextTokenRefreshState();
        const queueState = getPromptManagerTokenRefreshQueueState();
        const signature = getPromptManagerTokenRefreshSignature();
        if (!force && signature && signature === queueState.lastSignature && arePromptManagerTokenCountsComplete()) {
            queueState.lastEffectiveTokenCountSignature = getPresetEffectiveTokenCountSignature();
            schedulePromptManagerTokenDisplayUpdate();
            return;
        }

        contextRefreshState.inFlight = true;
        const startedAt = performance.now?.() ?? Date.now();
        const startedSignature = signature;
        const startedEffectiveTokenCountSignature = getPresetEffectiveTokenCountSignature();
        const startedEffectiveTokenCountsCurrent = arePromptManagerTokenCountsCurrent();
        queueState.lastSignature = '';
        if (!startedEffectiveTokenCountsCurrent) {
            queueState.lastEffectiveTokenCountSignature = '';
            updatePresetEffectiveTokenHeaderDisplay(null);
        }
        await promptManager.tryGenerate();
        const completedSignature = getPromptManagerTokenRefreshSignature();
        const completedEffectiveTokenCountSignature = getPresetEffectiveTokenCountSignature();
        if (startedSignature && completedSignature === startedSignature) {
            queueState.lastSignature = startedSignature;
        } else {
            queueState.lastSignature = '';
            queueState.pendingAfterFlight = true;
        }
        if (startedEffectiveTokenCountSignature && completedEffectiveTokenCountSignature === startedEffectiveTokenCountSignature) {
            queueState.lastEffectiveTokenCountSignature = startedEffectiveTokenCountSignature;
        } else if (startedEffectiveTokenCountSignature) {
            queueState.lastEffectiveTokenCountSignature = '';
            updatePresetEffectiveTokenHeaderDisplay(null);
            queueState.pendingAfterFlight = true;
        }
        if (isPresetVuePromptListManagerActive()) {
            syncPresetVuePromptListManagerState();
        }
        schedulePromptManagerTokenDisplayUpdate();
        console.debug(`${LOG_PREFIX} Prompt manager token refresh completed after ${reason}: ${Math.round((performance.now?.() ?? Date.now()) - startedAt)}ms`);
    } catch (error) {
        console.debug(`${LOG_PREFIX} Failed to refresh prompt manager token counts`, error);
    } finally {
        const contextRefreshState = getPresetContextTokenRefreshState();
        contextRefreshState.inFlight = false;
        contextRefreshState.suppressUntil = Date.now() + PRESET_CONTEXT_TOKEN_REFRESH_SELF_SUPPRESS_MS;
    }
}

function isPromptManagerTokenPanelVisible() {
    if (document.visibilityState === 'hidden') {
        return false;
    }

    const list = document.querySelector(PRESET_PROMPT_MANAGER_LIST_SELECTOR);
    const container = promptManager?.containerElement;

    if (!(list instanceof HTMLElement) || !(container instanceof HTMLElement)) {
        return false;
    }

    if (!list.isConnected || !container.isConnected) {
        return false;
    }

    const rect = container.getBoundingClientRect();
    return Boolean(rect.width > 0 && rect.height > 0 && getComputedStyle(container).display !== 'none');
}

function getPromptManagerTokenRefreshSignature() {
    try {
        const serviceSettings = promptManager?.serviceSettings ?? oai_settings;
        const prompts = Array.isArray(serviceSettings?.prompts) ? serviceSettings.prompts : [];
        const promptOrder = Array.isArray(serviceSettings?.prompt_order)
            ? serviceSettings.prompt_order
            : promptManager?.getPromptOrderForCharacter?.(promptManager?.activeCharacter) ?? [];
        const promptParts = prompts.map(prompt => [
            prompt?.identifier || '',
            prompt?.role || '',
            prompt?.enabled === false ? 0 : 1,
            prompt?.marker ? 1 : 0,
            getStringHash(String(prompt?.content ?? '')),
        ].join(':'));
        const orderParts = promptOrder.map(entry => [
            entry?.identifier || '',
            entry?.enabled === false ? 0 : 1,
        ].join(':'));
        const chat = Array.isArray(scriptModule.chat) ? scriptModule.chat : [];
        const lastMessage = chat[chat.length - 1];
        const lastMessageSignature = lastMessage
            ? [
                chat.length,
                lastMessage.send_date || '',
                getStringHash(String(lastMessage.mes ?? lastMessage.content ?? '').slice(-512)),
            ].join(':')
            : `${chat.length}:`;

        return [
            getTokenizerModel(),
            getCurrentChatId?.() || '',
            serviceSettings?.preset_settings_openai || oai_settings?.preset_settings_openai || '',
            serviceSettings?.openai_max_context ?? '',
            serviceSettings?.openai_max_tokens ?? '',
            promptParts.join('|'),
            orderParts.join('|'),
            lastMessageSignature,
        ].join('||');
    } catch (error) {
        console.debug(`${LOG_PREFIX} Failed to build prompt manager token refresh signature`, error);
        return '';
    }
}

function arePromptManagerTokenCountsComplete() {
    const counts = promptManager?.tokenHandler?.getCounts?.();
    const list = document.querySelector(PRESET_PROMPT_MANAGER_LIST_SELECTOR);

    if (!counts || !list) {
        return false;
    }

    const rows = Array.from(list.querySelectorAll('li.completion_prompt_manager_prompt[data-pm-identifier]'));
    if (rows.length === 0) {
        return false;
    }

    return rows.every(row => {
        const identifier = row.dataset.pmIdentifier;
        return identifier && Number.isFinite(Number(counts[identifier]));
    });
}

function schedulePromptManagerTokenDisplayUpdate() {
    const state = getPromptManagerTokenRefreshQueueState();
    if (state.displayFrame) {
        return;
    }

    state.displayFrame = requestAnimationFrame(() => {
        state.displayFrame = 0;
        updatePromptManagerTokenDisplay();
    });
}

function schedulePromptManagerTokensPending() {
    const state = getPromptManagerTokenRefreshQueueState();
    if (state.pendingFrame) {
        return;
    }

    state.pendingFrame = requestAnimationFrame(() => {
        state.pendingFrame = 0;
        markPromptManagerTokensPendingNow();
    });
}

function handlePresetVuePromptRangeSelectionDelegatedClick(event, target) {
    const manager = getPresetVuePromptListManagerState();
    const model = manager.state;

    if (!model?.rangeSelection?.active) {
        return false;
    }

    const row = target.closest(`${PRESET_PROMPT_MANAGER_LIST_SELECTOR} li.completion_prompt_manager_prompt[data-pm-identifier]`);

    if (!(row instanceof HTMLElement)) {
        return false;
    }

    const item = getPresetVuePromptItemsFromModel(model).find(item => item?.id === row.dataset.pmIdentifier);

    if (!item) {
        return false;
    }

    handlePresetVuePromptRangeSelectionClick(model, item, event);
    return true;
}

function getOpenAITokenizerBulkState() {
    if (!extensionState.openAITokenizerBulkBridge || typeof extensionState.openAITokenizerBulkBridge !== 'object') {
        extensionState.openAITokenizerBulkBridge = {};
    }

    const state = extensionState.openAITokenizerBulkBridge;
    if (!(state.cache instanceof Map)) {
        state.cache = new Map();
    }
    if (!state.stats || typeof state.stats !== 'object') {
        state.stats = {
            prepareCalls: 0,
            prepareMessages: 0,
            prepareEmpty: 0,
            prepareErrors: 0,
            ajaxBatches: 0,
            ajaxBatchMessages: 0,
            ajaxHits: 0,
            ajaxMisses: 0,
            ajaxFallbacks: 0,
            ajaxErrors: 0,
            worldInfoPrepareCalls: 0,
            worldInfoPrepareMessages: 0,
            worldInfoPrepareEmpty: 0,
            worldInfoPrepareErrors: 0,
        };
    }
    for (const key of ['prepareCalls', 'prepareMessages', 'prepareEmpty', 'prepareErrors', 'ajaxBatches', 'ajaxBatchMessages', 'ajaxHits', 'ajaxMisses', 'ajaxFallbacks', 'ajaxErrors', 'worldInfoPrepareCalls', 'worldInfoPrepareMessages', 'worldInfoPrepareEmpty', 'worldInfoPrepareErrors']) {
        if (typeof state.stats[key] !== 'number') {
            state.stats[key] = 0;
        }
    }
    if (typeof state.failureCount !== 'number') {
        state.failureCount = 0;
    }
    if (typeof state.disabledUntil !== 'number') {
        state.disabledUntil = 0;
    }

    return state;
}

function isOpenAITokenizerBulkCircuitOpen(state = getOpenAITokenizerBulkState()) {
    return Date.now() < Number(state.disabledUntil || 0);
}

function recordOpenAITokenizerBulkSuccess(state = getOpenAITokenizerBulkState()) {
    state.failureCount = 0;
    state.disabledUntil = 0;
}

function recordOpenAITokenizerBulkFailure(state = getOpenAITokenizerBulkState(), error = null) {
    state.failureCount = Number(state.failureCount || 0) + 1;
    if (state.failureCount >= OPENAI_TOKENIZER_BULK_FAILURE_THRESHOLD) {
        state.disabledUntil = Date.now() + OPENAI_TOKENIZER_BULK_CIRCUIT_BREAKER_MS;
        console.debug(`${LOG_PREFIX} OpenAI tokenizer bulk disabled temporarily after repeated failures`, error);
    }
}

function installOpenAITokenizerBulkAjaxPatch() {
    const state = getOpenAITokenizerBulkState();
    if (state.ajaxPatched) {
        return;
    }

    const jq = globalThis.jQuery;
    if (!jq || typeof jq.ajax !== 'function') {
        console.debug(`${LOG_PREFIX} jQuery.ajax unavailable; OpenAI tokenizer bulk bridge was not installed`);
        return;
    }

    const originalAjax = jq.ajax;
    state.originalAjax = originalAjax;
    jq.ajax = function baiBaiOpenAITokenizerBulkAjax(...args) {
        const request = normalizeJQueryAjaxRequest(args);
        if (!request || !shouldInterceptOpenAITokenizerCount(request.options)) {
            return originalAjax.apply(this, args);
        }

        const intercepted = handleOpenAITokenizerBulkAjax(this, args, request.options);
        return intercepted || originalAjax.apply(this, args);
    };

    state.ajaxPatched = true;
}

function normalizeJQueryAjaxRequest(args) {
    const first = args[0];
    if (typeof first === 'string') {
        return {
            options: {
                ...(args[1] && typeof args[1] === 'object' ? args[1] : {}),
                url: first,
            },
        };
    }

    if (first && typeof first === 'object') {
        return { options: first };
    }

    return null;
}

function shouldInterceptOpenAITokenizerCount(options) {
    if (!isOpenAITokenizerBulkEnabled() || options?.async === false) {
        return false;
    }

    const method = String(options?.method || options?.type || 'GET').toUpperCase();
    if (method !== 'POST') {
        return false;
    }

    const url = toOpenAITokenizerUrl(options?.url);
    return Boolean(url && url.origin === location.origin && url.pathname === '/api/tokenizers/openai/count');
}

function handleOpenAITokenizerBulkAjax(thisArg, args, options) {
    const hitPromise = getOpenAITokenizerBulkAjaxHit(options);
    if (!hitPromise) {
        return null;
    }

    const state = getOpenAITokenizerBulkState();
    return hitPromise
        .then(hit => {
            if (!hit) {
                state.stats.ajaxFallbacks += 1;
                return state.originalAjax.apply(thisArg, args);
            }

            state.stats.ajaxHits += 1;
            const payload = { token_count: hit.count };
            callJQueryAjaxCallback(options.success, payload, 'success', null);
            callJQueryAjaxCallback(options.complete, null, 'success');
            return payload;
        })
        .catch(error => {
            state.stats.ajaxErrors += 1;
            console.debug(`${LOG_PREFIX} OpenAI tokenizer bulk ajax fallback`, error);
            return state.originalAjax.apply(thisArg, args);
        });
}

function getOpenAITokenizerBulkAjaxHit(options) {
    const state = getOpenAITokenizerBulkState();
    const url = toOpenAITokenizerUrl(options?.url);
    const message = getOpenAITokenizerAjaxMessage(options);
    const model = url?.searchParams?.get('model') || getTokenizerModel();

    if (!message || !model) {
        state.stats.ajaxMisses += 1;
        return null;
    }

    const key = getOpenAITokenizerCacheKey(model, message);
    const cached = state.cache.get(key);
    if (typeof cached === 'number') {
        return Promise.resolve({ count: cached });
    }

    if (!state.pending) {
        return enqueueOpenAITokenizerBulkAjaxCount(model, message, key);
    }

    return Promise.resolve(state.pending).then(() => {
        const next = state.cache.get(key);
        if (typeof next === 'number') {
            return { count: next };
        }

        return enqueueOpenAITokenizerBulkAjaxCount(model, message, key);
    });
}

function enqueueOpenAITokenizerBulkAjaxCount(model, message, key) {
    const state = getOpenAITokenizerBulkState();

    if (!state.ajaxBatch || typeof state.ajaxBatch !== 'object') {
        state.ajaxBatch = {
            entries: [],
            byKey: new Map(),
            timer: null,
        };
    }
    if (!(state.ajaxBatch.byKey instanceof Map)) {
        state.ajaxBatch.byKey = new Map();
    }
    if (!Array.isArray(state.ajaxBatch.entries)) {
        state.ajaxBatch.entries = [];
    }

    const existing = state.ajaxBatch.byKey.get(key);
    if (existing?.promise) {
        return existing.promise;
    }

    let resolveEntry;
    let rejectEntry;
    const promise = new Promise((resolve, reject) => {
        resolveEntry = resolve;
        rejectEntry = reject;
    });
    const entry = {
        model,
        message,
        key,
        promise,
        resolve: resolveEntry,
        reject: rejectEntry,
    };

    state.ajaxBatch.entries.push(entry);
    state.ajaxBatch.byKey.set(key, entry);

    if (!state.ajaxBatch.timer) {
        state.ajaxBatch.timer = setTimeout(flushOpenAITokenizerBulkAjaxBatch, OPENAI_TOKENIZER_BULK_AJAX_BATCH_DELAY_MS);
    }

    return promise;
}

function flushOpenAITokenizerBulkAjaxBatch() {
    const state = getOpenAITokenizerBulkState();
    const batch = state.ajaxBatch;

    if (!batch || !Array.isArray(batch.entries) || batch.entries.length === 0) {
        if (batch) {
            batch.timer = null;
        }
        return;
    }

    const entries = batch.entries.splice(0, batch.entries.length);
    batch.byKey?.clear?.();
    batch.timer = null;

    const entriesByModel = new Map();
    for (const entry of entries) {
        const group = entriesByModel.get(entry.model) ?? [];
        group.push(entry);
        entriesByModel.set(entry.model, group);
    }

    for (const [model, group] of entriesByModel.entries()) {
        state.stats.ajaxBatches += 1;
        state.stats.ajaxBatchMessages += group.length;
        void fetchOpenAITokenizerBulkCounts(model, group)
            .then(counts => {
                counts.forEach((count, index) => {
                    const entry = group[index];
                    setOpenAITokenizerBulkCache(entry.key, count);
                    entry.resolve({ count });
                });
            })
            .catch(error => {
                state.stats.ajaxMisses += group.length;
                for (const entry of group) {
                    entry.reject(error);
                }
            });
    }
}

function getOpenAITokenizerAjaxMessage(options) {
    try {
        const data = typeof options?.data === 'string' ? JSON.parse(options.data) : options?.data;
        if (!Array.isArray(data) || data.length !== 1) {
            return null;
        }

        return normalizeOpenAITokenizerMessage(data[0], { allowEmptyContent: true });
    } catch {
        return null;
    }
}

async function prepareOpenAITokenizerBulkMessages(context = {}) {
    const state = getOpenAITokenizerBulkState();
    state.stats.prepareCalls += 1;

    if (!isOpenAITokenizerBulkEnabled()) {
        return false;
    }

    const model = getTokenizerModel();
    const messages = await collectOpenAITokenizerBulkMessages(context);
    const uniqueMessages = [];
    const seen = new Set();
    const keyCache = new Map();

    for (let index = 0; index < messages.length; index += 1) {
        if (index > 0 && index % OPENAI_TOKENIZER_BULK_PREPARE_CHUNK_SIZE === 0) {
            await waitForNextPaint();
        }

        const message = messages[index];
        const key = getOpenAITokenizerCacheKey(model, message, keyCache);
        if (seen.has(key) || state.cache.has(key)) {
            continue;
        }

        seen.add(key);
        uniqueMessages.push({ key, message });
    }

    if (uniqueMessages.length === 0) {
        state.stats.prepareEmpty += 1;
        return true;
    }

    const pending = fetchOpenAITokenizerBulkCounts(model, uniqueMessages)
        .then(counts => {
            counts.forEach((count, index) => {
                setOpenAITokenizerBulkCache(uniqueMessages[index].key, count);
            });
            state.stats.prepareMessages += uniqueMessages.length;
            return true;
        })
        .catch(error => {
            state.stats.prepareErrors += 1;
            throw error;
        })
        .finally(() => {
            if (state.pending === pending) {
                state.pending = null;
            }
        });

    state.pending = pending;
    return pending;
}

async function prepareOpenAITokenizerWorldInfoBudgetCounts(context = {}) {
    const state = getOpenAITokenizerBulkState();
    state.stats.worldInfoPrepareCalls += 1;

    if (!isOpenAITokenizerBulkEnabled()) {
        return false;
    }

    const model = getTokenizerModel();
    const messages = collectOpenAITokenizerWorldInfoBudgetMessages(context);
    const uniqueMessages = [];
    const seen = new Set();
    const keyCache = new Map();

    for (const message of messages) {
        const key = getOpenAITokenizerCacheKey(model, message, keyCache);
        if (seen.has(key) || state.cache.has(key)) {
            continue;
        }

        seen.add(key);
        uniqueMessages.push({ key, message });
    }

    if (uniqueMessages.length === 0) {
        state.stats.worldInfoPrepareEmpty += 1;
        return true;
    }

    const pending = fetchOpenAITokenizerBulkCounts(model, uniqueMessages)
        .then(counts => {
            counts.forEach((count, index) => {
                setOpenAITokenizerBulkCache(uniqueMessages[index].key, count);
            });
            state.stats.worldInfoPrepareMessages += uniqueMessages.length;
            return true;
        })
        .catch(error => {
            state.stats.worldInfoPrepareErrors += 1;
            throw error;
        })
        .finally(() => {
            if (state.pending === pending) {
                state.pending = null;
            }
        });

    state.pending = pending;
    return pending;
}

function collectOpenAITokenizerWorldInfoBudgetMessages(context = {}) {
    const texts = [];
    const seenTexts = new Set();
    const addText = (text) => {
        if (texts.length >= OPENAI_TOKENIZER_BULK_PREPARE_MAX_MESSAGES) {
            return false;
        }

        if (typeof text !== 'string' || text.length === 0 || seenTexts.has(text)) {
            return true;
        }

        seenTexts.add(text);
        texts.push(text);
        return true;
    };

    addText(context.textToScan);

    let states = [''];
    const entries = Array.isArray(context.entries) ? context.entries : [];
    for (const entry of entries) {
        if (texts.length >= OPENAI_TOKENIZER_BULK_PREPARE_MAX_MESSAGES) {
            break;
        }

        const content = typeof entry?.content === 'string' ? entry.content : '';
        const nextStates = [];
        const seenStates = new Set();
        const pushState = (value) => {
            if (seenStates.has(value)) {
                return;
            }
            seenStates.add(value);
            nextStates.push(value);
        };

        if (entry?.maySkip) {
            for (const state of states) {
                pushState(state);
            }
        }

        for (const state of states) {
            pushState(`${state}${content}\n`);
        }

        states = nextStates.slice(0, OPENAI_TOKENIZER_BULK_PREPARE_MAX_MESSAGES);

        if (!entry?.ignoreBudget) {
            for (const state of states) {
                if (!addText(state)) {
                    break;
                }
            }
        }
    }

    return texts
        .map(text => normalizeOpenAITokenizerMessage({ role: 'system', content: text }, { allowEmptyContent: true }))
        .filter(Boolean);
}

async function collectOpenAITokenizerBulkMessages(context) {
    const entries = [];
    let processed = 0;
    const add = async (message, options = {}) => {
        if (entries.length >= OPENAI_TOKENIZER_BULK_PREPARE_MAX_MESSAGES) {
            return false;
        }

        const normalized = normalizeOpenAITokenizerMessage(message, options);
        if (normalized) {
            entries.push(normalized);
        }

        processed += 1;
        if (processed % OPENAI_TOKENIZER_BULK_PREPARE_CHUNK_SIZE === 0) {
            await waitForNextPaint();
        }

        return entries.length < OPENAI_TOKENIZER_BULK_PREPARE_MAX_MESSAGES;
    };

    await add({ role: 'system', content: context.newChatContent });
    await add({ role: 'user', content: context.sendIfEmpty });
    await add({ role: 'system', content: context.newExampleChatContent });

    await collectPromptCollectionTokenMessages(context.prompts, add);
    await collectChatHistoryTokenMessages(context, add);
    await collectDialogueExampleTokenMessages(context.messageExamples, add);

    return entries;
}

async function collectPromptCollectionTokenMessages(prompts, add) {
    const collection = Array.isArray(prompts?.collection) ? prompts.collection : [];
    for (const prompt of collection) {
        if (!await add({
            role: prompt?.role || 'system',
            content: prompt?.content,
        })) {
            return;
        }
    }
}

async function collectChatHistoryTokenMessages(context, add) {
    const sourceMessages = Array.isArray(context.messages) ? context.messages : [];
    const namesInCompletion = Number(context.oaiSettings?.names_behavior) === 1;
    const manager = context.promptManager || promptManager;

    for (let index = 0; index < sourceMessages.length; index++) {
        const source = sourceMessages[index];
        if (!source || typeof source !== 'object') {
            continue;
        }

        const prompt = {
            ...source,
            identifier: `chatHistory-${sourceMessages.length - index}`,
        };
        const prepared = preparePromptForOpenAITokenizerBulk(prompt, manager);
        const message = {
            role: prepared?.role || source.role || 'system',
            content: prepared?.content ?? source.content,
        };

        if (!await add(message)) {
            return;
        }

        if (namesInCompletion && source.name) {
            const name = typeof manager?.isValidName === 'function' && manager.isValidName(source.name)
                ? source.name
                : typeof manager?.sanitizeName === 'function'
                    ? manager.sanitizeName(source.name)
                    : source.name;
            if (!await add({ ...message, name })) {
                return;
            }
        }

        if (Array.isArray(source.invocations)) {
            for (const invocation of source.invocations) {
                if (!await add({ role: 'tool', content: invocation?.result || '[No content]' })) {
                    return;
                }
            }
        }
    }
}

async function collectDialogueExampleTokenMessages(messageExamples, add) {
    if (!Array.isArray(messageExamples)) {
        return;
    }

    for (const dialogue of messageExamples) {
        if (!Array.isArray(dialogue)) {
            continue;
        }

        for (const prompt of dialogue) {
            const message = {
                role: 'system',
                content: prompt?.content || '',
            };
            if (!await add(message)) {
                return;
            }
            if (prompt?.name) {
                if (!await add({ ...message, name: prompt.name })) {
                    return;
                }
            }
        }
    }
}

function preparePromptForOpenAITokenizerBulk(prompt, manager) {
    try {
        if (typeof manager?.preparePrompt === 'function') {
            return manager.preparePrompt(prompt);
        }
    } catch (error) {
        console.debug(`${LOG_PREFIX} Failed to prepare OpenAI tokenizer bulk prompt`, error);
    }

    return prompt;
}

function normalizeOpenAITokenizerMessage(message, { allowEmptyContent = false } = {}) {
    if (!message || typeof message !== 'object') {
        return null;
    }

    const normalized = {};
    normalized.role = message.role || 'system';

    if (Object.prototype.hasOwnProperty.call(message, 'content') && message.content !== undefined) {
        normalized.content = message.content;
    }
    if (message.name !== undefined && message.name !== null && message.name !== '') {
        normalized.name = message.name;
    }
    if (message.tool_calls !== undefined) {
        normalized.tool_calls = message.tool_calls;
    }
    if (message.reasoning !== undefined && message.reasoning !== null && message.reasoning !== '') {
        normalized.reasoning = message.reasoning;
    }

    const hasContent = Object.prototype.hasOwnProperty.call(normalized, 'content');
    const hasToolCalls = Object.prototype.hasOwnProperty.call(normalized, 'tool_calls');
    if (!hasContent && !hasToolCalls) {
        return null;
    }

    if (!allowEmptyContent && typeof normalized.content === 'string' && normalized.content.length === 0 && !hasToolCalls && !normalized.name) {
        return null;
    }

    return normalized;
}

async function fetchOpenAITokenizerBulkCounts(model, entries) {
    const state = getOpenAITokenizerBulkState();
    if (isOpenAITokenizerBulkCircuitOpen(state)) {
        throw new Error('BaiBaoKu bulk count is temporarily disabled after repeated failures');
    }

    const headers = new Headers(getRequestHeaders());
    headers.set('content-type', 'application/json');

    try {
        const response = await fetch(BAIBAOKU_TOKENIZER_BULK_COUNT_URL, {
            method: 'POST',
            headers,
            cache: 'no-store',
            body: JSON.stringify({
                model,
                messages: entries.map(entry => entry.message),
            }),
        });
        const payload = await response.json().catch(() => null);
        const counts = payload?.data?.counts;

        if (!response.ok || payload?.ok !== true || !Array.isArray(counts) || counts.length !== entries.length) {
            throw new Error(payload?.error?.message || `BaiBaoKu bulk count failed: HTTP ${response.status}`);
        }

        recordOpenAITokenizerBulkSuccess(state);
        return counts.map(count => Number(count));
    } catch (error) {
        recordOpenAITokenizerBulkFailure(state, error);
        throw error;
    }
}

function setOpenAITokenizerBulkCache(key, count) {
    const value = Number(count);
    if (!key || !Number.isFinite(value)) {
        return;
    }

    const state = getOpenAITokenizerBulkState();
    state.cache.set(key, value);
    while (state.cache.size > OPENAI_TOKENIZER_BULK_CACHE_LIMIT) {
        const oldestKey = state.cache.keys().next().value;
        state.cache.delete(oldestKey);
    }
}

function getOpenAITokenizerCacheKey(model, message, roundCache = null) {
    const serialized = JSON.stringify(message);
    const cacheKey = `${model}:${serialized}`;

    if (roundCache instanceof Map && roundCache.has(cacheKey)) {
        return roundCache.get(cacheKey);
    }

    const key = `${model}-${getStringHash(serialized)}`;
    roundCache?.set?.(cacheKey, key);
    return key;
}

function isOpenAITokenizerBulkEnabled() {
    if (settings.tokenizerBulkCountEnabled === false) {
        return false;
    }

    if (isOpenAITokenizerBulkCircuitOpen()) {
        return false;
    }

    const earlyBridge = globalThis.__baibaokuEarlyBridge;
    if (typeof earlyBridge?.isTokenizerBulkCountEnabled === 'function') {
        return earlyBridge.isTokenizerBulkCountEnabled() !== false;
    }

    return earlyBridge?.tokenizerBulkCountEnabled !== false;
}

function toOpenAITokenizerUrl(value) {
    try {
        if (typeof value === 'string') return new URL(value, location.href);
        if (value instanceof URL) return new URL(value.href, location.href);
        if (value && typeof value.url === 'string') return new URL(value.url, location.href);
    } catch {
        return null;
    }

    return null;
}

function callJQueryAjaxCallback(callback, ...args) {
    if (typeof callback !== 'function') {
        return;
    }

    try {
        callback(...args);
    } catch (error) {
        console.debug(`${LOG_PREFIX} OpenAI tokenizer bulk ajax callback failed`, error);
    }
}

function isPromptManagerTokenRefreshEnabled() {
    return Boolean(
        promptManager?.tryGenerate
        && (settings.presetToggleOptimizationEnabled || settings.presetSwitchOptimizationEnabled),
    );
}

function markPromptManagerTokensPending() {
    schedulePromptManagerTokensPending();
}

function markPromptManagerTokensPendingNow() {
    const list = document.querySelector(PRESET_PROMPT_MANAGER_LIST_SELECTOR);

    if (!list) {
        return;
    }

    for (const row of list.querySelectorAll('li.completion_prompt_manager_prompt[data-pm-identifier]')) {
        updatePromptTokenCell(row, null);
    }

    const header = document.querySelector('.completion_prompt_manager_header');
    const totalContainer = header?.querySelector(':scope > div:last-child');
    const totalLabel = totalContainer?.querySelector('span');

    if (totalContainer && totalLabel) {
        const nextText = ' - ';
        if (totalContainer.textContent?.replace(totalLabel.textContent || '', '') !== nextText) {
            totalContainer.replaceChildren(totalLabel, document.createTextNode(nextText));
        }
    }

    updatePresetEffectiveTokenHeaderDisplay(arePromptManagerTokenCountsCurrent() ? undefined : null);
}

function updatePromptManagerTokenDisplay() {
    const counts = promptManager?.tokenHandler?.getCounts?.();
    const list = document.querySelector(PRESET_PROMPT_MANAGER_LIST_SELECTOR);

    if (!counts || !list) {
        return;
    }

    const prompts = Array.isArray(promptManager?.serviceSettings?.prompts)
        ? promptManager.serviceSettings.prompts.filter(Boolean)
        : [];
    const promptById = new Map(prompts.map(prompt => [prompt.identifier, prompt]));
    const tokenBudget = (promptManager?.serviceSettings?.openai_max_context ?? 0)
        - (promptManager?.serviceSettings?.openai_max_tokens ?? 0);
    const isTokenUsageWarning = (promptManager?.tokenUsage ?? 0) > tokenBudget * 0.8;

    for (const row of list.querySelectorAll('li.completion_prompt_manager_prompt[data-pm-identifier]')) {
        const identifier = row.dataset.pmIdentifier;
        const tokens = counts[identifier] ?? 0;
        const prompt = promptById.get(identifier);
        const warning = prompt
            ? getPromptTokenWarning({ prompt, tokens, isTokenUsageWarning })
            : null;
        updatePromptTokenCell(row, tokens, warning);
    }

    const header = document.querySelector('.completion_prompt_manager_header');
    const totalContainer = header?.querySelector(':scope > div:last-child');
    const totalLabel = totalContainer?.querySelector('span');

    if (totalContainer && totalLabel) {
        const nextText = ` ${promptManager.tokenUsage ?? 0} `;
        if (totalContainer.textContent?.replace(totalLabel.textContent || '', '') !== nextText) {
            totalContainer.replaceChildren(totalLabel, document.createTextNode(nextText));
        }
    }

    updatePresetEffectiveTokenHeaderDisplay(calculatePresetEffectivePromptTokenTotal());
}

function applyPresetPromptCodeMirrorEditorOptimization() {
    if (settings.presetPromptCodeMirrorEditorEnabled) {
        installPresetPromptCodeMirrorEditorOptimization();
    } else {
        removePresetPromptCodeMirrorEditorOptimization();
    }
}

function installPresetPromptCodeMirrorEditorOptimization() {
    const state = getPresetPromptCodeMirrorEditorState();
    state.enabled = true;

    applyPresetPromptCodeMirrorEditorStyle();
    installPresetPromptCodeMirrorEditorGlobalListeners(state);
    refreshPresetPromptCodeMirrorEditorTarget(state);
    installPresetPromptCodeMirrorEditorMutationObserver(state);
}

function removePresetPromptCodeMirrorEditorOptimization() {
    const state = extensionState[PRESET_PROMPT_CODEMIRROR_EDITOR_KEY];

    if (!state) {
        return;
    }

    flushPresetPromptCodeMirrorEditor('disable');
    state.enabled = false;

    if (state.refreshFrame) {
        cancelAnimationFrame(state.refreshFrame);
        state.refreshFrame = 0;
    }

    state.mutationObserver?.disconnect();
    state.mutationObserver = null;
    detachPresetPromptCodeMirrorEditor(state);

    for (const listener of state.globalListeners || []) {
        listener.target.removeEventListener(listener.type, listener.handler, listener.options);
    }

    state.globalListeners = [];
    removePresetPromptCodeMirrorEditorStyle();
    delete extensionState[PRESET_PROMPT_CODEMIRROR_EDITOR_KEY];
}

function getPresetPromptCodeMirrorEditorState() {
    if (!extensionState[PRESET_PROMPT_CODEMIRROR_EDITOR_KEY]) {
        extensionState[PRESET_PROMPT_CODEMIRROR_EDITOR_KEY] = {
            enabled: false,
            source: null,
            wrapper: null,
            view: null,
            listeners: [],
            globalListeners: [],
            mutationObserver: null,
            mutationObserverTargets: [],
            refreshFrame: 0,
            dirty: false,
            flushing: false,
            syncingFromSource: false,
            loadingToken: null,
            sourceValue: '',
            disabled: false,
            forceSyncFromSource: false,
        };
    }

    return extensionState[PRESET_PROMPT_CODEMIRROR_EDITOR_KEY];
}

function installPresetPromptCodeMirrorEditorGlobalListeners(state) {
    if (state.globalListeners.length > 0) {
        return;
    }

    const clickHandler = (event) => {
        const target = event.target instanceof Element ? event.target : null;

        if (!target) {
            return;
        }

        if (target.closest(PRESET_PROMPT_MANAGER_SAVE_SELECTOR)) {
            flushPresetPromptCodeMirrorEditor('save click');
        }

        if (target.closest(`.editor_maximize[data-for="${PRESET_PROMPT_EDITOR_SOURCE_ID}"]`)) {
            flushPresetPromptCodeMirrorEditor('maximize click');
            schedulePresetPromptCodeMirrorEditorRefresh(state, { forceFromSource: true });
        }

        if (
            target.closest(PRESET_PROMPT_MANAGER_RESET_SELECTOR)
            || target.closest(PRESET_PROMPT_MANAGER_CLOSE_SELECTOR)
            || target.closest(`${PRESET_PROMPT_MANAGER_LIST_SELECTOR} [data-preset-prompt-action], ${PRESET_PROMPT_MANAGER_LIST_SELECTOR} .prompt-manager-edit-action, ${PRESET_PROMPT_MANAGER_LIST_SELECTOR} .prompt-manager-inspect-action, ${PRESET_PROMPT_MANAGER_LIST_SELECTOR} .prompt-manager-detach-action`)
            || target.closest('#completion_prompt_manager .completion_prompt_manager_footer .menu_button')
        ) {
            schedulePresetPromptCodeMirrorEditorRefresh(state, { forceFromSource: true });
        }
    };
    const blurHandler = (event) => {
        const target = event.target instanceof HTMLTextAreaElement ? event.target : null;

        if (target?.id?.endsWith('_prompt_quick_edit_textarea')) {
            schedulePresetPromptCodeMirrorEditorRefresh(state, { forceFromSource: true });
        }
    };
    const pageLifecycleHandler = () => {
        flushPresetPromptCodeMirrorEditor('page lifecycle');
    };
    const addListener = (target, type, handler, options) => {
        if (!(target instanceof EventTarget) || target === document) {
            return;
        }

        target.addEventListener(type, handler, options);
        state.globalListeners.push({ target, type, handler, options });
    };

    for (const target of getPresetPromptCodeMirrorListenerTargets()) {
        addListener(target, 'click', clickHandler, true);
        addListener(target, 'blur', blurHandler, true);
    }

    addListener(window, 'pagehide', pageLifecycleHandler);
}

function installPresetPromptCodeMirrorEditorMutationObserver(state) {
    if (typeof MutationObserver !== 'function') {
        return;
    }

    if (!state.mutationObserver) {
        state.mutationObserver = new MutationObserver((mutations) => {
            if (
                arePresetPromptCodeMirrorMutationsInternal(state, mutations)
                || arePresetPromptCodeMirrorMutationsPresetListOnly(state, mutations)
            ) {
                return;
            }

            schedulePresetPromptCodeMirrorEditorRefresh(state);
        });
    }

    bindPresetPromptCodeMirrorEditorMutationObserver(state);
}

function getPresetPromptCodeMirrorListenerTargets() {
    const targets = new Set();
    const add = target => {
        if (target instanceof HTMLElement && target.isConnected) {
            targets.add(target);
        }
    };
    const source = getPresetPromptCodeMirrorSource();

    add(document.querySelector('#completion_prompt_manager'));
    add(document.querySelector(OPENAI_SETTINGS_SELECTOR));
    add(source?.closest('form'));
    add(source?.closest('dialog.popup, .popup, #completion_prompt_manager'));
    add(source?.parentElement);
    return [...targets];
}

function bindPresetPromptCodeMirrorEditorMutationObserver(state) {
    if (!state?.mutationObserver) {
        return;
    }

    const targets = getPresetPromptCodeMirrorMutationTargets(state);
    const currentTargets = state.mutationObserverTargets || [];
    const unchanged = currentTargets.length === targets.length
        && currentTargets.every((current, index) => current.target === targets[index].target && current.optionsKey === targets[index].optionsKey);

    if (unchanged) {
        return;
    }

    state.mutationObserver.disconnect();

    for (const { target, options } of targets) {
        state.mutationObserver.observe(target, options);
    }

    state.mutationObserverTargets = targets;
}

function getPresetPromptCodeMirrorMutationTargets(state) {
    const targetMap = new Map();
    const hostOptions = {
        attributes: true,
        attributeFilter: ['class', 'style', 'hidden', 'data-for', 'disabled'],
        childList: true,
        subtree: true,
    };
    const parentOptions = {
        childList: true,
        subtree: false,
    };
    const addTarget = (target, optionsKey, options) => {
        if (!(target instanceof Node) || !target.isConnected || target === document) {
            return;
        }

        const existing = targetMap.get(target);

        if (!existing || existing.optionsKey === 'parent') {
            targetMap.set(target, { target, optionsKey, options });
        }
    };
    const addLocalRootsForElement = element => {
        if (!(element instanceof HTMLElement)) {
            return;
        }

        addTarget(element.parentElement, 'host', hostOptions);
        addTarget(element.parentElement?.parentElement, 'parent', parentOptions);
        addTarget(element.closest('form'), 'host', hostOptions);
        addTarget(element.closest('dialog.popup, .popup'), 'host', hostOptions);
    };
    const source = getPresetPromptCodeMirrorSource();
    const managerRoot = document.querySelector('#completion_prompt_manager');

    addLocalRootsForElement(source);
    addLocalRootsForElement(state.source);
    addLocalRootsForElement(state.wrapper);

    if (managerRoot instanceof HTMLElement) {
        addTarget(managerRoot, 'host', hostOptions);
    }

    return [...targetMap.values()];
}

function arePresetPromptCodeMirrorMutationsInternal(state, mutations) {
    const wrapper = state.wrapper;

    if (!(wrapper instanceof HTMLElement)) {
        return false;
    }

    return mutations.every((mutation) => {
        if (mutation.target instanceof Node && wrapper.contains(mutation.target)) {
            return true;
        }

        for (const node of mutation.addedNodes) {
            if (!(node instanceof Node) || !wrapper.contains(node)) {
                return false;
            }
        }

        for (const node of mutation.removedNodes) {
            if (!(node instanceof Node) || !wrapper.contains(node)) {
                return false;
            }
        }

        return mutation.addedNodes.length > 0 || mutation.removedNodes.length > 0;
    });
}

function arePresetPromptCodeMirrorMutationsPresetListOnly(state, mutations) {
    if (!mutations?.length) {
        return false;
    }

    const isEditorNode = node => {
        if (!(node instanceof Node)) {
            return false;
        }

        const source = state.source;
        const wrapper = state.wrapper;

        return (
            source instanceof Node
            && (node === source || node.contains?.(source) || source.contains?.(node))
        ) || (
            wrapper instanceof Node
            && (node === wrapper || node.contains?.(wrapper) || wrapper.contains?.(node))
        );
    };
    const isPresetListNode = node => {
        if (!(node instanceof Node)) {
            return false;
        }

        const element = node instanceof Element ? node : node.parentElement;

        return Boolean(element?.closest?.(`${PRESET_PROMPT_MANAGER_LIST_SELECTOR}, .bai-bai-preset-global-library`));
    };

    return Array.from(mutations).every(mutation => {
        const nodes = [
            mutation.target,
            ...Array.from(mutation.addedNodes ?? []),
            ...Array.from(mutation.removedNodes ?? []),
        ].filter(node => node instanceof Node);

        return nodes.length > 0
            && nodes.every(node => !isEditorNode(node) && isPresetListNode(node));
    });
}

function schedulePresetPromptCodeMirrorEditorRefresh(state = extensionState[PRESET_PROMPT_CODEMIRROR_EDITOR_KEY], { forceFromSource = false } = {}) {
    if (!state?.enabled) {
        return;
    }

    if (forceFromSource) {
        state.forceSyncFromSource = true;
    }

    if (state.refreshFrame) {
        return;
    }

    state.refreshFrame = requestAnimationFrame(() => {
        state.refreshFrame = 0;
        refreshPresetPromptCodeMirrorEditorTarget(state);
    });
}

function refreshPresetPromptCodeMirrorEditorTarget(state) {
    if (!state?.enabled) {
        return;
    }

    const source = getPresetPromptCodeMirrorSource();

    if (!(source instanceof HTMLTextAreaElement) || !source.isConnected) {
        detachPresetPromptCodeMirrorEditor(state);
        bindPresetPromptCodeMirrorEditorMutationObserver(state);
        return;
    }

    if (state.source === source && state.wrapper?.isConnected) {
        const disabled = isPresetPromptCodeMirrorSourceDisabled(source);

        if (state.disabled !== disabled) {
            detachPresetPromptCodeMirrorEditor(state);
            attachPresetPromptCodeMirrorEditor(state, source);
            return;
        }

        updatePresetPromptCodeMirrorSourceClasses(state, source, state.wrapper);
        bindPresetPromptCodeMirrorEditorMutationObserver(state);

        if (state.forceSyncFromSource) {
            state.forceSyncFromSource = false;
            syncPresetPromptCodeMirrorFromSource(state, { force: true });
            return;
        }

        syncPresetPromptCodeMirrorFromSourceIfClean(state);
        return;
    }

    detachPresetPromptCodeMirrorEditor(state);
    attachPresetPromptCodeMirrorEditor(state, source);
    bindPresetPromptCodeMirrorEditorMutationObserver(state);
}

function getPresetPromptCodeMirrorSource() {
    const maximizedSource = document.querySelector(PRESET_PROMPT_MAXIMIZED_SOURCE_SELECTOR);

    if (maximizedSource instanceof HTMLTextAreaElement && maximizedSource.isConnected) {
        return maximizedSource;
    }

    return document.querySelector(PRESET_PROMPT_EDITOR_SOURCE_SELECTOR);
}

function attachPresetPromptCodeMirrorEditor(state, source) {
    const wrapper = document.createElement('div');

    wrapper.id = PRESET_PROMPT_CODEMIRROR_EDITOR_ID;
    wrapper.className = PRESET_PROMPT_CODEMIRROR_EDITOR_CLASS;
    wrapper.textContent = 'Loading CodeMirror...';
    updatePresetPromptCodeMirrorSourceClasses(state, source, wrapper);
    source.classList.add(PRESET_PROMPT_SOURCE_HIDDEN_CLASS);
    source.insertAdjacentElement('afterend', wrapper);

    state.source = source;
    state.wrapper = wrapper;
    state.dirty = false;
    state.sourceValue = source.value || '';
    state.disabled = isPresetPromptCodeMirrorSourceDisabled(source);
    state.forceSyncFromSource = false;

    const focusOutHandler = () => {
        setTimeout(() => {
            if (state.dirty && state.wrapper && !state.wrapper.contains(document.activeElement)) {
                flushPresetPromptCodeMirrorEditor('blur');
            }
        }, 0);
    };
    const sourceInputHandler = () => {
        schedulePresetPromptCodeMirrorEditorRefresh(state, { forceFromSource: true });
    };

    wrapper.addEventListener('focusout', focusOutHandler);
    source.addEventListener('input', sourceInputHandler, true);

    state.listeners.push(
        { target: wrapper, type: 'focusout', handler: focusOutHandler, options: undefined },
        { target: source, type: 'input', handler: sourceInputHandler, options: true },
    );

    const loadingToken = {};
    state.loadingToken = loadingToken;

    void loadPresetCodeMirrorModules()
        .then((modules) => {
            if (!state.enabled || state.source !== source || state.wrapper !== wrapper || state.loadingToken !== loadingToken || !wrapper.isConnected) {
                return;
            }

            createPresetPromptCodeMirrorView(state, source, wrapper, modules);
        })
        .catch((error) => {
            console.warn(`${LOG_PREFIX} CodeMirror preset prompt editor failed; falling back to stock textarea.`, error);

            if (state.enabled && state.source === source && state.wrapper === wrapper && state.loadingToken === loadingToken) {
                settings.presetPromptCodeMirrorEditorEnabled = false;
                saveExtensionSettings();
                $('#bai_bai_toolkit_preset_prompt_codemirror_editor_enabled').prop('checked', false);
                removePresetPromptCodeMirrorEditorOptimization();
            }
        });
}

function updatePresetPromptCodeMirrorSourceClasses(state, source, wrapper) {
    const disabled = isPresetPromptCodeMirrorSourceDisabled(source);
    const maximized = isPresetPromptCodeMirrorMaximizedSource(source);

    state.disabled = disabled;
    wrapper.classList.toggle(PRESET_PROMPT_CODEMIRROR_READONLY_CLASS, disabled);
    wrapper.classList.toggle(PRESET_PROMPT_CODEMIRROR_MAXIMIZED_CLASS, maximized);
    wrapper.setAttribute('aria-disabled', String(disabled));
}

function isPresetPromptCodeMirrorSourceDisabled(source) {
    if (!(source instanceof HTMLTextAreaElement)) {
        return false;
    }

    if (source.disabled) {
        return true;
    }

    if (!isPresetPromptCodeMirrorMaximizedSource(source)) {
        return false;
    }

    return document.getElementById(PRESET_PROMPT_EDITOR_SOURCE_ID)?.disabled === true;
}

function isPresetPromptCodeMirrorMaximizedSource(source) {
    return source instanceof HTMLTextAreaElement && source.matches(PRESET_PROMPT_MAXIMIZED_SOURCE_SELECTOR);
}

function createPresetPromptCodeMirrorView(state, source, wrapper, modules) {
    const {
        EditorState,
        EditorView,
        keymap,
        defaultKeymap = [],
        history,
        historyKeymap = [],
    } = modules;
    const useHistory = source.value.length <= getPresetCodeMirrorHistoryMaxLength();
    const disabled = isPresetPromptCodeMirrorSourceDisabled(source);
    const extensions = [
        EditorView.lineWrapping,
        EditorView.updateListener.of((update) => {
            if (!update.docChanged || state.syncingFromSource) {
                return;
            }

            state.dirty = true;
            if (syncPresetPromptCodeMirrorToSource(state) && isPresetPromptCodeMirrorMaximizedSource(state.source)) {
                dispatchDescriptionEditorSourceInput(state.source);
            }
        }),
        EditorView.theme({
            '&': {
                backgroundColor: 'var(--SmartThemeBlurTintColor)',
                border: '1px solid var(--SmartThemeBorderColor)',
                borderRadius: '4px',
                boxSizing: 'border-box',
                color: 'var(--SmartThemeBodyColor)',
                font: 'inherit',
                maxWidth: '100%',
                minHeight: 'min(34vh, 360px)',
                minWidth: '0',
                overflow: 'hidden',
                textShadow: 'none',
                textAlign: 'left',
                width: '100%',
            },
            '&.cm-focused': {
                outline: 'none',
            },
            '.cm-scroller': {
                fontFamily: 'inherit',
                lineHeight: '1.35',
                maxHeight: 'min(44vh, 440px)',
                minHeight: 'min(34vh, 360px)',
                minWidth: '0',
                overflow: 'auto',
                overflowAnchor: 'none',
                overscrollBehavior: 'auto',
                touchAction: 'pan-y',
                WebkitOverflowScrolling: 'touch',
            },
            '.cm-content': {
                caretColor: 'var(--SmartThemeBodyColor)',
                minWidth: '0',
                padding: '8px',
                textShadow: 'none',
                textAlign: 'left',
                minHeight: 'min(34vh, 360px)',
            },
            '.cm-line': {
                padding: '0',
                textAlign: 'left',
            },
        }),
    ];

    if (disabled && EditorState.readOnly?.of) {
        extensions.push(EditorState.readOnly.of(true));
    }

    if (EditorView.editable?.of) {
        extensions.push(EditorView.editable.of(!disabled));
    }

    if (useHistory && typeof history === 'function') {
        extensions.push(history());
    }

    if (typeof keymap?.of === 'function') {
        extensions.push(keymap.of(useHistory ? [...defaultKeymap, ...historyKeymap] : defaultKeymap));
    }

    if (EditorView.contentAttributes?.of) {
        extensions.push(EditorView.contentAttributes.of({
            autocomplete: 'off',
            autocapitalize: 'off',
            autocorrect: 'off',
            spellcheck: 'false',
            'aria-label': source.getAttribute('aria-label') || 'Preset prompt',
            'aria-readonly': String(disabled),
        }));
    }

    wrapper.textContent = '';
    state.view = new EditorView({
        state: EditorState.create({
            doc: source.value || '',
            extensions,
        }),
        parent: wrapper,
    });
}

function detachPresetPromptCodeMirrorEditor(state) {
    if (!state.source && !state.wrapper && !state.view) {
        return;
    }

    for (const listener of state.listeners || []) {
        listener.target.removeEventListener(listener.type, listener.handler, listener.options);
    }

    state.listeners = [];
    state.view?.destroy?.();
    state.source?.classList.remove(PRESET_PROMPT_SOURCE_HIDDEN_CLASS);
    state.wrapper?.remove();
    state.source = null;
    state.wrapper = null;
    state.view = null;
    state.dirty = false;
    state.syncingFromSource = false;
    state.loadingToken = null;
    state.sourceValue = '';
    state.disabled = false;
    state.forceSyncFromSource = false;
}

function getPresetPromptCodeMirrorValue(state) {
    return state.view?.state?.doc?.toString?.() ?? '';
}

function syncPresetPromptCodeMirrorToSource(state) {
    if (!(state.source instanceof HTMLTextAreaElement) || !state.view) {
        return false;
    }

    const value = getPresetPromptCodeMirrorValue(state);
    const changed = state.source.value !== value;

    if (changed) {
        state.source.value = value;
    }

    state.sourceValue = value;

    return changed;
}

function syncPresetPromptCodeMirrorFromSourceIfClean(state) {
    return syncPresetPromptCodeMirrorFromSource(state, { force: false });
}

function syncPresetPromptCodeMirrorFromSource(state, { force = false } = {}) {
    if ((!force && state.dirty) || !(state.source instanceof HTMLTextAreaElement) || !state.view) {
        return false;
    }

    const value = state.source.value || '';
    const current = getPresetPromptCodeMirrorValue(state);

    if (current !== value) {
        state.syncingFromSource = true;

        try {
            state.view.dispatch({
                changes: {
                    from: 0,
                    to: state.view.state.doc.length,
                    insert: value,
                },
            });
            state.dirty = false;
            state.sourceValue = value;
        } finally {
            state.syncingFromSource = false;
        }

        return true;
    }

    state.dirty = false;
    state.sourceValue = value;

    return false;
}

function flushPresetPromptCodeMirrorEditor(reason, { dispatchInput = false } = {}) {
    const state = extensionState[PRESET_PROMPT_CODEMIRROR_EDITOR_KEY];

    if (!state?.enabled || state.flushing || !(state.source instanceof HTMLTextAreaElement) || !state.view) {
        return false;
    }

    state.flushing = true;

    try {
        const changed = syncPresetPromptCodeMirrorToSource(state) || state.dirty;
        state.dirty = false;

        if (changed && dispatchInput) {
            dispatchDescriptionEditorSourceInput(state.source);
        }

        if (changed) {
            console.debug(`${LOG_PREFIX} CodeMirror preset prompt editor flushed after ${reason}`);
        }

        return changed;
    } finally {
        state.flushing = false;
    }
}

function applyPresetPromptCodeMirrorEditorStyle() {
    let style = document.getElementById(PRESET_PROMPT_CODEMIRROR_EDITOR_STYLE_ID);

    if (!style) {
        style = document.createElement('style');
        style.id = PRESET_PROMPT_CODEMIRROR_EDITOR_STYLE_ID;
        document.head.append(style);
    }

    style.textContent = `
#${PRESET_PROMPT_CODEMIRROR_EDITOR_ID} {
    box-sizing: border-box;
    display: block;
    width: 100%;
}

#${PRESET_PROMPT_CODEMIRROR_EDITOR_ID}.${PRESET_PROMPT_CODEMIRROR_READONLY_CLASS} {
    opacity: 0.72;
}

#${PRESET_PROMPT_CODEMIRROR_EDITOR_ID}.${PRESET_PROMPT_CODEMIRROR_MAXIMIZED_CLASS} {
    flex: 1 1 auto;
    height: 100%;
    min-height: 0;
}

#${PRESET_PROMPT_CODEMIRROR_EDITOR_ID}.${PRESET_PROMPT_CODEMIRROR_MAXIMIZED_CLASS} .cm-editor,
#${PRESET_PROMPT_CODEMIRROR_EDITOR_ID}.${PRESET_PROMPT_CODEMIRROR_MAXIMIZED_CLASS} .cm-scroller {
    height: 100%;
    max-height: none !important;
    min-height: 0 !important;
}

#${PRESET_PROMPT_CODEMIRROR_EDITOR_ID},
#${PRESET_PROMPT_CODEMIRROR_EDITOR_ID} .cm-editor,
#${PRESET_PROMPT_CODEMIRROR_EDITOR_ID} .cm-scroller,
#${PRESET_PROMPT_CODEMIRROR_EDITOR_ID} .cm-content,
#${PRESET_PROMPT_CODEMIRROR_EDITOR_ID} .cm-line {
    text-align: left !important;
}

.${PRESET_PROMPT_SOURCE_HIDDEN_CLASS} {
    display: none !important;
}
`;
}

function removePresetPromptCodeMirrorEditorStyle() {
    document.getElementById(PRESET_PROMPT_CODEMIRROR_EDITOR_STYLE_ID)?.remove();
}

export {
    applyPresetAutoBackup,
    applyPresetBackupPreviewUi,
    applyPresetDragOptimization,
    applyPresetGrouping,
    applyPresetInterfaceCollapse,
    applyPresetPromptCodeMirrorEditorOptimization,
    applyPresetSaveOptimization,
    applyPresetScrollOptimization,
    applyPresetSwitchOptimization,
    applyPresetToggleOptimization,
    cancelPromptManagerCustomDragPending,
    finishPromptManagerCustomDrag,
    setPresetAutoBackupBackendAvailable,
};
