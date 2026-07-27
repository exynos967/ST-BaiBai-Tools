// 预设优化功能的公共出口(由原 presetOptimizations.js 拆分而来)
export { applyPresetAutoBackup, setPresetAutoBackupBackendAvailable } from './autoBackup.js';
export { applyPresetBackupPreviewUi } from './backupPreview.js';
export { applyPresetPromptCodeMirrorEditorOptimization } from './codeMirror.js';
export { applyPresetDragOptimization, cancelPromptManagerCustomDragPending, finishPromptManagerCustomDrag } from './dragCustom.js';
export { applyPresetInterfaceCollapse } from './interfaceCollapse.js';
export { applyPresetSaveOptimization, applyPresetToggleOptimization } from './saveToggle.js';
export { applyPresetScrollOptimization } from './scroll.js';
export { bindPresetOptimizationSettings, configurePresetOptimizations } from './state.js';
export { applyPresetSwitchOptimization } from './switchFast.js';
export { installOpenAITokenizerBulkBridge } from './tokenizer.js';
export { applyPresetGrouping } from './vueList.js';
