import { WORLD_INFO_CHARACTER_FILTER_APPEND_PATCH_KEY, WORLD_INFO_DEFERRED_OPTIONS_DATASET_KEY, WORLD_INFO_LAZY_SELECT2_DATASET_KEY } from './constants.js';
import { extensionState, settings } from './state.js';

function restoreLegacyWorldInfoCharacterFilterAppendPatch() {
    const currentAppend = globalThis.jQuery?.fn?.append;

    if (currentAppend?.__baiBaiToolkitWorldInfoCharacterFilterAppendPatched) {
        globalThis.jQuery.fn.append = currentAppend.__baiBaiToolkitOriginalAppend;
    }

    extensionState[WORLD_INFO_CHARACTER_FILTER_APPEND_PATCH_KEY] = false;
}

function deferWorldInfoCharacterFilterOption(select, option) {
    extensionState.worldInfoDeferredCharacterFilterOptions ??= new WeakMap();

    const options = extensionState.worldInfoDeferredCharacterFilterOptions.get(select) ?? [];
    options.push(option);
    extensionState.worldInfoDeferredCharacterFilterOptions.set(select, options);
    select.dataset[WORLD_INFO_DEFERRED_OPTIONS_DATASET_KEY] = 'true';
}

function installWorldInfoCharacterFilterOptionObserver(select, state) {
    if (!(select instanceof HTMLSelectElement)
        || select.name !== 'characterFilter'
        || typeof MutationObserver !== 'function'
        || state.characterFilterOptionObserver) {
        return;
    }

    const observer = new MutationObserver(mutations => {
        if (!settings.worldInfoDrawerOptimizationEnabled
            || select.dataset[WORLD_INFO_LAZY_SELECT2_DATASET_KEY] !== 'true') {
            return;
        }

        const deferredOptions = [];

        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                collectWorldInfoCharacterFilterOptions(node, deferredOptions);
            }
        }

        deferredOptions.forEach(option => {
            if (select.contains(option)) {
                option.remove();
            }

            deferWorldInfoCharacterFilterOption(select, option);
        });
    });

    observer.observe(select, { childList: true, subtree: true });
    state.characterFilterOptionObserver = observer;
}

function collectWorldInfoCharacterFilterOptions(node, options) {
    if (node instanceof HTMLOptionElement) {
        options.push(node);
        return;
    }

    if (node instanceof HTMLOptGroupElement) {
        node.querySelectorAll('option').forEach(option => {
            if (option instanceof HTMLOptionElement) {
                options.push(option);
            }
        });
    }
}

function initializeDeferredWorldInfoCharacterFilterOptions(select) {
    const options = extensionState.worldInfoDeferredCharacterFilterOptions?.get(select);

    if (!options?.length) {
        return;
    }

    const fragment = document.createDocumentFragment();

    for (const option of options) {
        fragment.append(option);
    }

    extensionState.worldInfoDeferredCharacterFilterOptions.delete(select);
    delete select.dataset[WORLD_INFO_DEFERRED_OPTIONS_DATASET_KEY];
    select.append(fragment);
}

export {
    collectWorldInfoCharacterFilterOptions,
    deferWorldInfoCharacterFilterOption,
    initializeDeferredWorldInfoCharacterFilterOptions,
    installWorldInfoCharacterFilterOptionObserver,
    restoreLegacyWorldInfoCharacterFilterAppendPatch,
};
