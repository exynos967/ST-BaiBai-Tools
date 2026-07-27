import * as scriptModule from '@sillytavern/script';
import { event_types, eventSource, saveSettingsDebounced } from '@sillytavern/script';
import { AutoComplete } from '@sillytavern/scripts/autocomplete/AutoComplete';
import { extension_settings } from '@sillytavern/scripts/extensions';
import { power_user } from '@sillytavern/scripts/power-user';
import { favsToHotswap, isMobile } from '@sillytavern/scripts/RossAscends-mods';
import { debounce } from '@sillytavern/scripts/utils';
import { LOG_PREFIX, TRANSLATE_MESSAGE_UPDATED_OPTIMIZATION_KEY } from './constants.js';
import { getFunctionSource } from './perfTrace.js';
import { extensionState, settings } from './state.js';

function applyTranslateMessageUpdatedOptimization() {
    if (settings.translateMessageUpdatedOptimizationEnabled) {
        installTranslateMessageUpdatedOptimization();
    } else {
        restoreTranslateMessageUpdatedOptimization();
    }
}

function getTranslateMessageUpdatedOptimizationState() {
    if (!extensionState.translateMessageUpdatedOptimization || typeof extensionState.translateMessageUpdatedOptimization !== 'object') {
        extensionState.translateMessageUpdatedOptimization = {};
    }

    return extensionState.translateMessageUpdatedOptimization;
}

function installTranslateMessageUpdatedOptimization() {
    const listeners = eventSource?.events?.[event_types.MESSAGE_UPDATED];
    const state = getTranslateMessageUpdatedOptimizationState();

    if (!Array.isArray(listeners)) {
        scheduleTranslateMessageUpdatedOptimizationRetry();
        return;
    }

    let installed = 0;

    for (let index = 0; index < listeners.length; index++) {
        const listener = listeners[index];

        if (listener?.[TRANSLATE_MESSAGE_UPDATED_OPTIMIZATION_KEY] || !isTranslateMessageUpdatedListener(listener)) {
            continue;
        }

        const wrapped = async function baiBaiToolkitTranslateMessageUpdatedGuard(messageId, ...args) {
            if (shouldSkipTranslateMessageUpdatedListener(messageId)) {
                console.debug(`${LOG_PREFIX} Skipped translate MESSAGE_UPDATED listener for message ${messageId}`);
                return;
            }

            return listener.apply(this, [messageId, ...args]);
        };

        wrapped[TRANSLATE_MESSAGE_UPDATED_OPTIMIZATION_KEY] = true;
        wrapped.__baiBaiToolkitOriginalTranslateMessageUpdatedListener = listener;
        listeners[index] = wrapped;
        installed += 1;
    }

    state.installed = listeners.some(listener => listener?.[TRANSLATE_MESSAGE_UPDATED_OPTIMIZATION_KEY]);

    if (!state.installed && !state.retryTimer) {
        scheduleTranslateMessageUpdatedOptimizationRetry();
    }

    if (installed > 0) {
        state.retryCount = 0;
        console.debug(`${LOG_PREFIX} Translate MESSAGE_UPDATED optimization installed (${installed})`);
    }
}

function restoreTranslateMessageUpdatedOptimization() {
    const listeners = eventSource?.events?.[event_types.MESSAGE_UPDATED];
    const state = getTranslateMessageUpdatedOptimizationState();

    if (state.retryTimer) {
        clearTimeout(state.retryTimer);
        state.retryTimer = null;
    }

    if (!Array.isArray(listeners)) {
        state.installed = false;
        return;
    }

    let restored = 0;

    for (let index = 0; index < listeners.length; index++) {
        const listener = listeners[index];

        if (!listener?.[TRANSLATE_MESSAGE_UPDATED_OPTIMIZATION_KEY]) {
            continue;
        }

        const original = listener.__baiBaiToolkitOriginalTranslateMessageUpdatedListener;
        if (typeof original === 'function') {
            listeners[index] = original;
            restored += 1;
        }
    }

    state.installed = false;
    state.retryCount = 0;

    if (restored > 0) {
        console.debug(`${LOG_PREFIX} Translate MESSAGE_UPDATED optimization restored (${restored})`);
    }
}

function scheduleTranslateMessageUpdatedOptimizationRetry() {
    const state = getTranslateMessageUpdatedOptimizationState();

    if (state.retryTimer || !settings.translateMessageUpdatedOptimizationEnabled) {
        return;
    }

    state.retryCount = Number(state.retryCount || 0) + 1;
    if (state.retryCount > 30) {
        console.debug(`${LOG_PREFIX} Translate MESSAGE_UPDATED optimization listener was not found after retries`);
        return;
    }

    state.retryTimer = setTimeout(() => {
        state.retryTimer = null;
        if (settings.translateMessageUpdatedOptimizationEnabled) {
            installTranslateMessageUpdatedOptimization();
        }
    }, 1000);
}

function isTranslateMessageUpdatedListener(listener) {
    if (typeof listener !== 'function') {
        return false;
    }

    const source = getFunctionSource(listener);
    return source.includes('translateFunction')
        && source.includes('shouldTranslateFunction')
        && source.includes('await translateFunction');
}

function shouldSkipTranslateMessageUpdatedListener(messageId) {
    const autoMode = String(extension_settings?.translate?.auto_mode ?? '').toLowerCase();

    if (autoMode !== 'none') {
        return false;
    }

    const index = Number(messageId);
    if (!Number.isInteger(index) || index < 0) {
        return false;
    }

    const message = Array.isArray(scriptModule.chat) ? scriptModule.chat[index] : null;
    if (!message) {
        return false;
    }

    return !message.extra?.display_text;
}

function isExistingCharacterEditForm() {
    return document.querySelector('#form_create')?.getAttribute('actiontype') === 'editcharacter';
}

function patchAutoCompletePositioning() {
    const originalUpdatePosition = AutoComplete.prototype.updatePosition;

    if (typeof originalUpdatePosition !== 'function' || originalUpdatePosition.__mobileResizeGuardPatched) {
        return;
    }

    function guardedUpdatePosition(...args) {
        if (!this.isActive) {
            return;
        }

        return originalUpdatePosition.apply(this, args);
    }

    guardedUpdatePosition.__mobileResizeGuardPatched = true;
    guardedUpdatePosition.__mobileResizeGuardOriginal = originalUpdatePosition;
    extensionState.originalAutoCompleteUpdatePosition = originalUpdatePosition;
    AutoComplete.prototype.updatePosition = guardedUpdatePosition;
}

function restoreAutoCompletePositioning() {
    const currentUpdatePosition = AutoComplete.prototype.updatePosition;

    if (currentUpdatePosition?.__mobileResizeGuardPatched) {
        AutoComplete.prototype.updatePosition = currentUpdatePosition.__mobileResizeGuardOriginal;
    }
}

function patchPowerUserResizeHandler() {
    if (extensionState.powerUserResizeReplacement) {
        return;
    }

    const resizeHandlers = $._data(window, 'events')?.resize;

    if (!Array.isArray(resizeHandlers)) {
        console.warn(`${LOG_PREFIX} Window resize handlers are unavailable`);
        return;
    }

    const stockHandlerEntry = resizeHandlers.find(({ handler }) => isPowerUserResizeHandler(handler));

    if (!stockHandlerEntry) {
        console.warn(`${LOG_PREFIX} Could not locate the stock power-user resize handler`);
        return;
    }

    $(window).off('resize', stockHandlerEntry.handler);
    extensionState.originalPowerUserResizeHandler = stockHandlerEntry.handler;

    const adjustAutocompleteDebounced = debounce(() => {
        $('.ui-autocomplete-input').each(function () {
            try {
                const widget = $(this).autocomplete('widget')?.[0];
                const isOpen = widget?.style.display !== 'none';

                if (isOpen) {
                    $(this).autocomplete('search');
                }
            } catch {
                // Ignore detached or no-longer-initialized widgets.
            }
        });
    });

    const setHotswapsDebounced = debounce(favsToHotswap);
    const reportZoomLevelDebounced = debounce(() => {
        const zoomLevel = parseFloat(Number(window.devicePixelRatio).toFixed(2)) || 1;
        const winWidth = window.innerWidth;
        const winHeight = window.innerHeight;
        const originalWidth = winWidth * zoomLevel;
        const originalHeight = winHeight * zoomLevel;
        console.debug(`${LOG_PREFIX} Window resize: ${coreTruthWinWidth}x${coreTruthWinHeight} -> ${window.innerWidth}x${window.innerHeight}`);
        console.debug(`${LOG_PREFIX} Zoom: ${zoomLevel}, X:${winWidth}, Y:${winHeight}, original: ${originalWidth}x${originalHeight}`);
        return zoomLevel;
    });

    let coreTruthWinWidth = window.innerWidth;
    let coreTruthWinHeight = window.innerHeight;

    const replacementHandler = async () => {
        if (isMobile()) {
            return;
        }

        adjustAutocompleteDebounced();
        setHotswapsDebounced();
        reportZoomLevelDebounced();

        const scaleY = parseFloat(Number(window.innerHeight / coreTruthWinHeight).toFixed(4));
        const scaleX = parseFloat(Number(window.innerWidth / coreTruthWinWidth).toFixed(4));

        if (Object.keys(power_user.movingUIState).length > 0) {
            for (const elmntName of Object.keys(power_user.movingUIState)) {
                const elmntState = power_user.movingUIState[elmntName];
                const oldHeight = elmntState.height;
                const oldWidth = elmntState.width;
                const oldLeft = elmntState.left;
                const oldTop = elmntState.top;
                const oldBottom = elmntState.bottom;
                const oldRight = elmntState.right;

                const newHeight = Number(oldHeight * scaleY).toFixed(0);
                const newWidth = Number(oldWidth * scaleX).toFixed(0);
                const newLeft = Number(oldLeft * scaleX).toFixed(0);
                const newTop = Number(oldTop * scaleY).toFixed(0);
                const newBottom = Number(oldBottom * scaleY).toFixed(0);
                const newRight = Number(oldRight * scaleX).toFixed(0);

                try {
                    const elmnt = $('#' + $.escapeSelector(elmntName));

                    if (elmnt.length) {
                        elmnt.css('height', newHeight);
                        elmnt.css('width', newWidth);
                        elmnt.css('inset', `${newTop}px ${newRight}px ${newBottom}px ${newLeft}px`);
                        power_user.movingUIState[elmntName].height = newHeight;
                        power_user.movingUIState[elmntName].width = newWidth;
                        power_user.movingUIState[elmntName].top = newTop;
                        power_user.movingUIState[elmntName].bottom = newBottom;
                        power_user.movingUIState[elmntName].left = newLeft;
                        power_user.movingUIState[elmntName].right = newRight;
                    }
                } catch (error) {
                    console.debug(`${LOG_PREFIX} Failed to rescale moving UI element`, elmntName, error);
                }
            }
        }

        saveSettingsDebounced();
        coreTruthWinWidth = window.innerWidth;
        coreTruthWinHeight = window.innerHeight;
    };

    replacementHandler.__mobileResizeGuardReplacement = true;
    extensionState.powerUserResizeReplacement = replacementHandler;
    $(window).on('resize', replacementHandler);
}

function restorePowerUserResizeHandler() {
    const replacementHandler = extensionState.powerUserResizeReplacement;
    const originalHandler = extensionState.originalPowerUserResizeHandler;

    if (replacementHandler) {
        $(window).off('resize', replacementHandler);
        extensionState.powerUserResizeReplacement = null;
    }

    if (typeof originalHandler !== 'function') {
        return;
    }

    const resizeHandlers = $._data(window, 'events')?.resize;
    const hasOriginalHandler = Array.isArray(resizeHandlers)
        && resizeHandlers.some(({ handler }) => handler === originalHandler);

    if (!hasOriginalHandler) {
        $(window).on('resize', originalHandler);
    }
}

function isPowerUserResizeHandler(handler) {
    if (typeof handler !== 'function') {
        return false;
    }

    if (handler.__mobileResizeGuardReplacement) {
        return false;
    }

    const source = String(handler);
    return source.includes('adjustAutocompleteDebounced')
        && source.includes('setHotswapsDebounced')
        && source.includes('power_user.movingUIState');
}

export {
    applyTranslateMessageUpdatedOptimization,
    getTranslateMessageUpdatedOptimizationState,
    installTranslateMessageUpdatedOptimization,
    isExistingCharacterEditForm,
    isPowerUserResizeHandler,
    isTranslateMessageUpdatedListener,
    patchAutoCompletePositioning,
    patchPowerUserResizeHandler,
    restoreAutoCompletePositioning,
    restorePowerUserResizeHandler,
    restoreTranslateMessageUpdatedOptimization,
    scheduleTranslateMessageUpdatedOptimizationRetry,
    shouldSkipTranslateMessageUpdatedListener,
};
