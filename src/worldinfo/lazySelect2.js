import { initializeDeferredWorldInfoCharacterFilterOptions, installWorldInfoCharacterFilterOptionObserver, restoreLegacyWorldInfoCharacterFilterAppendPatch } from './characterFilter.js';
import { WORLD_INFO_LAZY_SELECT2_DATASET_KEY, WORLD_INFO_LAZY_SELECT2_PATCH_KEY, WORLD_INFO_LAZY_SELECT2_SELECTOR } from './constants.js';
import { LOG_PREFIX, extensionState, settings, toKebabCase } from './state.js';

function applyWorldInfoLazySelect2Optimization() {
    if (extensionState[WORLD_INFO_LAZY_SELECT2_PATCH_KEY]) {
        return;
    }

    const originalSelect2 = globalThis.jQuery?.fn?.select2;

    if (typeof originalSelect2 !== 'function') {
        console.warn(`${LOG_PREFIX} Select2 is unavailable; World Info lazy select2 optimization was not installed`);
        return;
    }

    function patchedSelect2(...args) {
        if (!shouldAttemptWorldInfoLazySelect2(args)) {
            return originalSelect2.apply(this, args);
        }

        const elements = this.toArray();

        if (!elements.some(element => shouldDeferWorldInfoSelect2(element))) {
            return originalSelect2.apply(this, args);
        }

        elements.forEach(element => {
            const control = $(element);

            if (shouldDeferWorldInfoSelect2(element)) {
                deferWorldInfoSelect2(element, args, originalSelect2);
            } else {
                originalSelect2.apply(control, args);
            }
        });

        return this;
    }

    patchedSelect2.__baiBaiToolkitWorldInfoLazySelect2Patched = true;
    patchedSelect2.__baiBaiToolkitOriginalSelect2 = originalSelect2;
    Object.assign(patchedSelect2, originalSelect2);
    globalThis.jQuery.fn.select2 = patchedSelect2;
    extensionState[WORLD_INFO_LAZY_SELECT2_PATCH_KEY] = true;
}

function applyWorldInfoCharacterFilterOptionsOptimization() {
    restoreLegacyWorldInfoCharacterFilterAppendPatch();
}

function shouldAttemptWorldInfoLazySelect2(args) {
    if (!settings.worldInfoDrawerOptimizationEnabled) {
        return false;
    }

    const firstArg = args[0];
    return typeof firstArg === 'object' && firstArg !== null && !Array.isArray(firstArg);
}

function shouldDeferWorldInfoSelect2(element) {
    if (!(element instanceof HTMLSelectElement)) {
        return false;
    }

    if (!element.matches(WORLD_INFO_LAZY_SELECT2_SELECTOR)) {
        return false;
    }

    if ($(element).data('select2')) {
        return false;
    }

    return element.dataset[WORLD_INFO_LAZY_SELECT2_DATASET_KEY] !== 'true';
}

function deferWorldInfoSelect2(element, args, originalSelect2) {
    element.dataset[WORLD_INFO_LAZY_SELECT2_DATASET_KEY] = 'true';
    element.classList.add('bai-bai-toolkit-lazy-select2');

    const state = {
        args: [...args],
        originalSelect2,
    };

    const activate = (event) => {
        initializeDeferredWorldInfoSelect2(element, { open: event?.type === 'pointerdown' || event?.type === 'mousedown' });
    };

    state.activate = activate;
    installWorldInfoCharacterFilterOptionObserver(element, state);
    extensionState.worldInfoLazySelect2State ??= new WeakMap();
    extensionState.worldInfoLazySelect2State.set(element, state);

    element.addEventListener('pointerdown', activate, { capture: true });
    element.addEventListener('mousedown', activate, { capture: true });
    element.addEventListener('focus', activate, { capture: true });
}

function initializeDeferredWorldInfoSelect2(target, { open = false } = {}) {
    const elements = target instanceof Element
        ? [target]
        : Array.from(target.querySelectorAll?.(`select[data-${toKebabCase(WORLD_INFO_LAZY_SELECT2_DATASET_KEY)}="true"]`) ?? []);

    for (const element of elements) {
        const state = extensionState.worldInfoLazySelect2State?.get(element);

        if (!state) {
            continue;
        }

        element.removeEventListener('pointerdown', state.activate, true);
        element.removeEventListener('mousedown', state.activate, true);
        element.removeEventListener('focus', state.activate, true);
        state.characterFilterOptionObserver?.disconnect();
        state.characterFilterOptionObserver = null;
        delete element.dataset[WORLD_INFO_LAZY_SELECT2_DATASET_KEY];
        element.classList.remove('bai-bai-toolkit-lazy-select2');
        extensionState.worldInfoLazySelect2State.delete(element);

        initializeDeferredWorldInfoCharacterFilterOptions(element);
        state.originalSelect2.apply($(element), state.args);

        if (open && $(element).data('select2')) {
            setTimeout(() => {
                try {
                    $(element).select2('open');
                } catch {
                    // Ignore controls that were detached while the open was queued.
                }
            }, 0);
        }
    }
}

export {
    applyWorldInfoCharacterFilterOptionsOptimization,
    applyWorldInfoLazySelect2Optimization,
    deferWorldInfoSelect2,
    initializeDeferredWorldInfoSelect2,
    shouldAttemptWorldInfoLazySelect2,
    shouldDeferWorldInfoSelect2,
};
