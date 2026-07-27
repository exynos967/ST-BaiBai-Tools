// 聊天优化功能的公共出口(由原 chatOptimizations.js 拆分而来)
export { applyWorldInfoDrawerOptimization } from './drawer.js';
export { applyWorldInfoCharacterFilterOptionsOptimization, applyWorldInfoLazySelect2Optimization, initializeDeferredWorldInfoSelect2 } from './lazySelect2.js';
export { applyWorldInfoPageOptimization, refreshWorldInfoEditorIfOpen } from './pageCore.js';
export { bindWorldInfoPageOptimizationSettings, configureWorldInfoPageOptimization } from './state.js';
export { applyWorldInfoListOptimization } from './vueList.js';
