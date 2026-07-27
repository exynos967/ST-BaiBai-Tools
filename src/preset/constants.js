import { schedulePromptManagerTokenRefresh } from './tokenizer.js';

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

const refreshPromptManagerTokensDebounced = (reason = 'prompt manager token refresh') => {
    schedulePromptManagerTokenRefresh(reason, { delayMs: PROMPT_MANAGER_TOKEN_REFRESH_DEFAULT_DELAY_MS });
};
const refreshPromptManagerTokensAfterPresetSwitchDebounced = (reason = 'prompt manager token refresh after preset switch') => {
    schedulePromptManagerTokenRefresh(reason, { delayMs: PROMPT_MANAGER_TOKEN_REFRESH_FAST_DELAY_MS, forceVisible: true });
};

export {
    BAIBAOKU_TOKENIZER_BULK_COUNT_URL,
    FORCE_EDIT_PROMPTS,
    FORCE_TOGGLE_PROMPTS,
    LAYOUT_EXTENSION_SETTINGS_KEY,
    LAYOUT_PRESET_COLLAPSE_WRAPPER_ID,
    LEFT_NAV_PANEL_SELECTOR,
    LINKED_PRESET_OPTIMIZATION_OPTIONS,
    OPENAI_PRESET_DELETE_SELECTOR,
    OPENAI_PRESET_EXPORT_SELECTOR,
    OPENAI_PRESET_SELECT_SELECTOR,
    OPENAI_PRESET_UPDATE_SELECTOR,
    OPENAI_SETTINGS_SELECTOR,
    OPENAI_TOKENIZER_BULK_AJAX_BATCH_DELAY_MS,
    OPENAI_TOKENIZER_BULK_BRIDGE_KEY,
    OPENAI_TOKENIZER_BULK_CACHE_LIMIT,
    OPENAI_TOKENIZER_BULK_CIRCUIT_BREAKER_MS,
    OPENAI_TOKENIZER_BULK_FAILURE_THRESHOLD,
    OPENAI_TOKENIZER_BULK_PREPARE_CHUNK_SIZE,
    OPENAI_TOKENIZER_BULK_PREPARE_MAX_MESSAGES,
    PRESET_AUTO_BACKUP_FETCH_KEY,
    PRESET_AUTO_BACKUP_RENAME_HANDLER_KEY,
    PRESET_BACKUP_PREVIEW_APP_KEY,
    PRESET_BACKUP_PREVIEW_BATCH_DELETE_CONCURRENCY,
    PRESET_BACKUP_PREVIEW_CLOSING_CLASS,
    PRESET_BACKUP_PREVIEW_DELETE_URL,
    PRESET_BACKUP_PREVIEW_DOWNLOAD_URL,
    PRESET_BACKUP_PREVIEW_EXPAND_ANIMATION_MS,
    PRESET_BACKUP_PREVIEW_LIST_URL,
    PRESET_BACKUP_PREVIEW_NOTE_MAX_LENGTH,
    PRESET_BACKUP_PREVIEW_NOTE_URL,
    PRESET_BACKUP_PREVIEW_PAGE_SIZE,
    PRESET_BACKUP_PREVIEW_RENAME_URL,
    PRESET_BACKUP_PREVIEW_UI_ID,
    PRESET_BACKUP_PREVIEW_UI_KEY,
    PRESET_BACKUP_PREVIEW_UI_STYLE_ID,
    PRESET_BACKUP_SAVE_URL,
    PRESET_CHAT_LOADED_HANDLER_KEY,
    PRESET_CHAT_LOAD_RENDER_SUPPRESS_MS,
    PRESET_COMPAT_ENTRY_GROUPING_EXTENSION_PATH,
    PRESET_CONTEXT_INJECTION_PROMPT_IDS,
    PRESET_CONTEXT_TOKEN_REFRESH_DELAY_MS,
    PRESET_CONTEXT_TOKEN_REFRESH_KEY,
    PRESET_CONTEXT_TOKEN_REFRESH_MAX_ATTEMPTS,
    PRESET_CONTEXT_TOKEN_REFRESH_RETRY_MS,
    PRESET_CONTEXT_TOKEN_REFRESH_SELF_SUPPRESS_MS,
    PRESET_DELETE_HANDLER_KEY,
    PRESET_DRAG_ACTIVE_CLASS,
    PRESET_DRAG_CANCEL_DISTANCE_PX,
    PRESET_DRAG_CLICK_SUPPRESS_MS,
    PRESET_DRAG_CLONE_CLASS,
    PRESET_DRAG_HANDLER_KEY,
    PRESET_DRAG_INDICATOR_CLASS,
    PRESET_DRAG_INTERACTIVE_SELECTOR,
    PRESET_DRAG_LONG_PRESS_MS,
    PRESET_DRAG_PATCH_KEY,
    PRESET_DRAG_READY_CLASS,
    PRESET_DRAG_SOURCE_CLASS,
    PRESET_DRAG_STYLE_ID,
    PRESET_EFFECTIVE_TOKEN_HEADER_CLASS,
    PRESET_EFFECTIVE_TOKEN_HEADER_PENDING_TEXT,
    PRESET_EFFECTIVE_TOKEN_HEADER_TITLE,
    PRESET_EXPORT_PENDING_CHANGES_HANDLER_KEY,
    PRESET_FAVORITES_EXTENSION_PATH,
    PRESET_GLOBAL_LIBRARY_DATABASE,
    PRESET_GLOBAL_LIBRARY_KEY,
    PRESET_GLOBAL_LIBRARY_STORE,
    PRESET_GLOBAL_LIBRARY_VERSION,
    PRESET_GROUP_COMPAT_CHOICE_RESULT_BASE,
    PRESET_GROUP_EXTENSION_PATH,
    PRESET_GROUP_GENERATION_GATE_PATCH_KEY,
    PRESET_GROUP_PRESET_DELETED_HANDLER_KEY,
    PRESET_GROUP_PRESET_IMPORT_HANDLER_KEY,
    PRESET_GROUP_PRESET_RENAMED_HANDLER_KEY,
    PRESET_INTERFACE_COLLAPSE_BLOCK_ATTR,
    PRESET_INTERFACE_COLLAPSE_CONTENT_CLASS,
    PRESET_INTERFACE_COLLAPSE_EXTERNAL_TOGGLE_HANDLER_KEY,
    PRESET_INTERFACE_COLLAPSE_MUTATION_SELECTOR,
    PRESET_INTERFACE_COLLAPSE_OBSERVER_KEY,
    PRESET_INTERFACE_COLLAPSE_PLACEHOLDER_PREFIX,
    PRESET_INTERFACE_COLLAPSE_RETRY_LIMIT,
    PRESET_INTERFACE_COLLAPSE_RETRY_MS,
    PRESET_INTERFACE_COLLAPSE_STYLE_ID,
    PRESET_INTERFACE_COLLAPSE_WRAPPER_ID,
    PRESET_LIST_ACTION_HANDLER_KEY,
    PRESET_MODEL_CHANGE_HANDLER_KEY,
    PRESET_PENDING_CHANGES_FOCUSOUT_CHECK_DELAY_MS,
    PRESET_PENDING_CHANGES_LIFECYCLE_HANDLER_KEY,
    PRESET_PENDING_CHANGES_VISIBILITY_CHECK_DELAY_MS,
    PRESET_PENDING_CHANGES_VISIBILITY_FALLBACK_DELAY_MS,
    PRESET_PROMPT_CODEMIRROR_EDITOR_CLASS,
    PRESET_PROMPT_CODEMIRROR_EDITOR_ID,
    PRESET_PROMPT_CODEMIRROR_EDITOR_KEY,
    PRESET_PROMPT_CODEMIRROR_EDITOR_STYLE_ID,
    PRESET_PROMPT_CODEMIRROR_MAXIMIZED_CLASS,
    PRESET_PROMPT_CODEMIRROR_READONLY_CLASS,
    PRESET_PROMPT_DELETE_CHOICE_DELETE,
    PRESET_PROMPT_DELETE_CHOICE_DETACH,
    PRESET_PROMPT_EDITOR_SOURCE_ID,
    PRESET_PROMPT_EDITOR_SOURCE_SELECTOR,
    PRESET_PROMPT_MANAGER_CLOSE_SELECTOR,
    PRESET_PROMPT_MANAGER_LIST_SELECTOR,
    PRESET_PROMPT_MANAGER_RESET_SELECTOR,
    PRESET_PROMPT_MANAGER_SAVE_SELECTOR,
    PRESET_PROMPT_MAXIMIZED_SOURCE_SELECTOR,
    PRESET_PROMPT_SOURCE_HIDDEN_CLASS,
    PRESET_RENAME_SAVE_GATE_TIMEOUT_MS,
    PRESET_SAVE_HANDLER_KEY,
    PRESET_SAVE_URL,
    PRESET_SCROLL_STYLE_ID,
    PRESET_SELECT_CHANGE_HANDLER_KEY,
    PRESET_SWITCH_BEFORE_HANDLER_KEY,
    PRESET_SWITCH_HANDLER_KEY,
    PRESET_TOGGLE_HANDLER_KEY,
    PRESET_UPDATE_PENDING_CHANGES_HANDLER_KEY,
    PRESET_VUE_BODY_HEIGHT_ANIMATION_MS,
    PRESET_VUE_BODY_HEIGHT_EASING,
    PRESET_VUE_COLLAPSE_ANIMATION_MS,
    PRESET_VUE_DRAGGING_BODY_CLASS,
    PRESET_VUE_DRAG_ANIMATION_MS,
    PRESET_VUE_DRAG_PLACEMENT_LISTENER_KEY,
    PRESET_VUE_DRAG_READY_FEEDBACK_CLASS,
    PRESET_VUE_DYNAMIC_DRAG_DELAY_HANDLER_KEY,
    PRESET_VUE_EMPTY_INSERT_THRESHOLD_PX,
    PRESET_VUE_EXPAND_ANIMATION_MS,
    PRESET_VUE_FAVORITES_ENTRY_ID,
    PRESET_VUE_GLOBAL_LIBRARY_DRAG_GROUP,
    PRESET_VUE_GLOBAL_LIBRARY_ENTRY_ID,
    PRESET_VUE_GROUP_CHILD_DRAGGABLE_CLASS,
    PRESET_VUE_GROUP_DROP_SURFACE_SELECTOR,
    PRESET_VUE_GROUP_DROP_TARGET_CLASS,
    PRESET_VUE_GROUP_DROP_TARGET_MIN_HEIGHT_PX,
    PRESET_VUE_GROUP_HEADER_CUSTOM_DRAG_LISTENER_KEY,
    PRESET_VUE_GROUP_HEADER_DRAG_SUPPRESS_MS,
    PRESET_VUE_GROUP_HEADER_TOGGLE_DISTANCE_PX,
    PRESET_VUE_HEADER_ENTRY_ID,
    PRESET_VUE_LIST_GAP_VARIABLE,
    PRESET_VUE_LIST_HOST_CLASS,
    PRESET_VUE_LIST_MANAGER_KEY,
    PRESET_VUE_LIST_RENDER_PATCH_KEY,
    PRESET_VUE_POINTER_START_THRESHOLD_PX,
    PRESET_VUE_SEPARATOR_ENTRY_ID,
    PRESET_VUE_TOP_LEVEL_DRAGGABLE_CLASS,
    PRESET_VUE_TOP_LEVEL_DRAGGABLE_SELECTOR,
    PRESET_VUE_TOUCH_DRAG_DELAY_MS,
    PRESET_VUE_TOUCH_SCROLL_GUARD_KEY,
    PRESET_VUE_TOUCH_START_THRESHOLD_PX,
    PROMPT_MANAGER_TOKEN_REFRESH_BUSY_DELAY_MS,
    PROMPT_MANAGER_TOKEN_REFRESH_DEFAULT_DELAY_MS,
    PROMPT_MANAGER_TOKEN_REFRESH_FAST_DELAY_MS,
    PROMPT_MANAGER_TOKEN_REFRESH_QUEUE_KEY,
    refreshPromptManagerTokensAfterPresetSwitchDebounced,
    refreshPromptManagerTokensDebounced,
};
