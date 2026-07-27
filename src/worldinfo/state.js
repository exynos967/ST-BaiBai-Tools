
let settings = {};
let extensionState = {};
let LOG_PREFIX = '[BaiBaiToolkit]';
let saveWorldInfoPageOptimizationSettings = null;

function configureWorldInfoPageOptimization(context = {}) {
    settings = context.settings ?? settings;
    extensionState = context.extensionState ?? extensionState;
    LOG_PREFIX = context.logPrefix ?? LOG_PREFIX;
    saveWorldInfoPageOptimizationSettings = context.saveSettings ?? saveWorldInfoPageOptimizationSettings;
}

function bindWorldInfoPageOptimizationSettings({ saveSettings } = {}) {
    saveWorldInfoPageOptimizationSettings = saveSettings ?? saveWorldInfoPageOptimizationSettings;
}

function toKebabCase(value) {
    return String(value).replace(/[A-Z]/g, match => `-${match.toLowerCase()}`);
}

function getWorldInfoPageOptimizationState() {
    if (!extensionState.worldInfoPageOptimization || typeof extensionState.worldInfoPageOptimization !== 'object') {
        extensionState.worldInfoPageOptimization = {};
    }

    return extensionState.worldInfoPageOptimization;
}

export {
    LOG_PREFIX,
    bindWorldInfoPageOptimizationSettings,
    configureWorldInfoPageOptimization,
    extensionState,
    getWorldInfoPageOptimizationState,
    saveWorldInfoPageOptimizationSettings,
    settings,
    toKebabCase,
};
