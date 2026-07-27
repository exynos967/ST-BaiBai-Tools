
let settings = {};
let extensionState = {};
let LOG_PREFIX = '[\u67cf\u5b9d\u7bb1]';
let recordLongDomRefresh = null;

function configureChatOptimizations(context = {}) {
    settings = context.settings ?? settings;
    extensionState = context.extensionState ?? extensionState;
    LOG_PREFIX = context.logPrefix ?? LOG_PREFIX;
    recordLongDomRefresh = context.recordLongDomRefresh ?? recordLongDomRefresh;
}

export {
    LOG_PREFIX,
    configureChatOptimizations,
    extensionState,
    recordLongDomRefresh,
    settings,
};
