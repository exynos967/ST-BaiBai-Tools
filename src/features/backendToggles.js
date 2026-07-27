import { saveBaibaokuFastConfig } from './baibaokuPanel.js';
import { applyFastChatGetOptimization } from './fastChat.js';
import { settings } from './state.js';
import { getBaibaokuEarlyBridge } from './theme.js';

async function setBaibaokuSettingsAccelerationEnabled(enabled) {
    const next = Boolean(enabled);
    const previous = settings.baibaokuSettingsAccelerationEnabled !== false;
    const previousLazy = settings.baibaokuLazyThemeLoadingEnabled !== false;
    settings.baibaokuSettingsAccelerationEnabled = next;
    if (!next) {
        settings.baibaokuLazyThemeLoadingEnabled = false;
    }

    const bridge = getBaibaokuEarlyBridge();
    if (typeof bridge?.setSettingsAccelerationEnabled === 'function') {
        bridge.setSettingsAccelerationEnabled(next);
    } else if (bridge) {
        bridge.settingsAccelerationEnabled = next;
    }
    if (!next) {
        if (typeof bridge?.setLazyThemeLoadingEnabled === 'function') {
            bridge.setLazyThemeLoadingEnabled(false);
        } else if (bridge) {
            bridge.lazyThemeLoadingEnabled = false;
            if (typeof bridge.clearSettingsGetCache === 'function') {
                bridge.clearSettingsGetCache('settings-acceleration-disabled');
            }
        }
    }

    try {
        const saved = await saveBaibaokuFastConfig({
            settingsAccelerationEnabled: next,
            ...(!next ? { lazyThemeLoadingEnabled: false } : {}),
        });
        const savedEnabled = saved.settingsAccelerationEnabled !== false;
        const savedLazyEnabled = savedEnabled && saved.lazyThemeLoadingEnabled !== false;
        settings.baibaokuSettingsAccelerationEnabled = savedEnabled;
        settings.baibaokuLazyThemeLoadingEnabled = savedLazyEnabled;
        if (typeof bridge?.setSettingsAccelerationEnabled === 'function') {
            bridge.setSettingsAccelerationEnabled(savedEnabled);
        } else if (bridge) {
            bridge.settingsAccelerationEnabled = savedEnabled;
        }
        if (typeof bridge?.setLazyThemeLoadingEnabled === 'function') {
            bridge.setLazyThemeLoadingEnabled(savedLazyEnabled);
        } else if (bridge) {
            bridge.lazyThemeLoadingEnabled = savedLazyEnabled;
            if (!savedLazyEnabled && typeof bridge.clearSettingsGetCache === 'function') {
                bridge.clearSettingsGetCache('lazy-theme-loading-disabled');
            }
        }
        return saved;
    } catch (error) {
        settings.baibaokuSettingsAccelerationEnabled = previous;
        settings.baibaokuLazyThemeLoadingEnabled = previousLazy;
        if (typeof bridge?.setSettingsAccelerationEnabled === 'function') {
            bridge.setSettingsAccelerationEnabled(previous);
        } else if (bridge) {
            bridge.settingsAccelerationEnabled = previous;
        }
        if (typeof bridge?.setLazyThemeLoadingEnabled === 'function') {
            bridge.setLazyThemeLoadingEnabled(previousLazy);
        } else if (bridge) {
            bridge.lazyThemeLoadingEnabled = previousLazy;
        }
        throw error;
    }
}

async function setBaibaokuLazyThemeLoadingEnabled(enabled) {
    const next = Boolean(enabled);
    const previousLazy = settings.baibaokuLazyThemeLoadingEnabled !== false;
    const previousSettings = settings.baibaokuSettingsAccelerationEnabled !== false;
    settings.baibaokuLazyThemeLoadingEnabled = next;
    if (next) {
        settings.baibaokuSettingsAccelerationEnabled = true;
    }

    const bridge = getBaibaokuEarlyBridge();
    if (typeof bridge?.setLazyThemeLoadingEnabled === 'function') {
        bridge.setLazyThemeLoadingEnabled(next);
    } else if (bridge) {
        bridge.lazyThemeLoadingEnabled = next;
        if (!next && typeof bridge.clearSettingsGetCache === 'function') {
            bridge.clearSettingsGetCache('lazy-theme-loading-disabled');
        }
    }
    if (next) {
        if (typeof bridge?.setSettingsAccelerationEnabled === 'function') {
            bridge.setSettingsAccelerationEnabled(true);
        } else if (bridge) {
            bridge.settingsAccelerationEnabled = true;
        }
    }

    try {
        const saved = await saveBaibaokuFastConfig({
            lazyThemeLoadingEnabled: next,
            ...(next ? { settingsAccelerationEnabled: true } : {}),
        });
        const savedSettingsEnabled = saved.settingsAccelerationEnabled !== false;
        const savedLazyEnabled = savedSettingsEnabled && saved.lazyThemeLoadingEnabled !== false;
        settings.baibaokuLazyThemeLoadingEnabled = savedLazyEnabled;
        settings.baibaokuSettingsAccelerationEnabled = savedSettingsEnabled;
        if (typeof bridge?.setLazyThemeLoadingEnabled === 'function') {
            bridge.setLazyThemeLoadingEnabled(savedLazyEnabled);
        } else if (bridge) {
            bridge.lazyThemeLoadingEnabled = savedLazyEnabled;
            if (!savedLazyEnabled && typeof bridge.clearSettingsGetCache === 'function') {
                bridge.clearSettingsGetCache('lazy-theme-loading-disabled');
            }
        }
        if (typeof bridge?.setSettingsAccelerationEnabled === 'function') {
            bridge.setSettingsAccelerationEnabled(savedSettingsEnabled);
        } else if (bridge) {
            bridge.settingsAccelerationEnabled = savedSettingsEnabled;
        }
        return saved;
    } catch (error) {
        settings.baibaokuLazyThemeLoadingEnabled = previousLazy;
        settings.baibaokuSettingsAccelerationEnabled = previousSettings;
        if (typeof bridge?.setLazyThemeLoadingEnabled === 'function') {
            bridge.setLazyThemeLoadingEnabled(previousLazy);
        } else if (bridge) {
            bridge.lazyThemeLoadingEnabled = previousLazy;
        }
        if (typeof bridge?.setSettingsAccelerationEnabled === 'function') {
            bridge.setSettingsAccelerationEnabled(previousSettings);
        } else if (bridge) {
            bridge.settingsAccelerationEnabled = previousSettings;
        }
        throw error;
    }
}

async function setBaibaokuCharacterListAccelerationEnabled(enabled) {
    const next = Boolean(enabled);
    const previous = settings.fastCharacterListEnabled !== false;
    settings.fastCharacterListEnabled = next;

    const bridge = getBaibaokuEarlyBridge();
    if (typeof bridge?.setCharacterListAccelerationEnabled === 'function') {
        bridge.setCharacterListAccelerationEnabled(next);
    } else if (bridge) {
        bridge.characterListAccelerationEnabled = next;
    }

    try {
        const saved = await saveBaibaokuFastConfig({ characterListAccelerationEnabled: next });
        const savedEnabled = saved.characterListAccelerationEnabled !== false;
        settings.fastCharacterListEnabled = savedEnabled;
        if (typeof bridge?.setCharacterListAccelerationEnabled === 'function') {
            bridge.setCharacterListAccelerationEnabled(savedEnabled);
        } else if (bridge) {
            bridge.characterListAccelerationEnabled = savedEnabled;
        }
        return saved;
    } catch (error) {
        settings.fastCharacterListEnabled = previous;
        if (typeof bridge?.setCharacterListAccelerationEnabled === 'function') {
            bridge.setCharacterListAccelerationEnabled(previous);
        } else if (bridge) {
            bridge.characterListAccelerationEnabled = previous;
        }
        throw error;
    }
}

async function setBaibaokuRecentChatListAccelerationEnabled(enabled) {
    const next = Boolean(enabled);
    const previous = settings.recentChatListAccelerationEnabled !== false;
    settings.recentChatListAccelerationEnabled = next;

    const bridge = getBaibaokuEarlyBridge();
    if (typeof bridge?.setRecentChatListAccelerationEnabled === 'function') {
        bridge.setRecentChatListAccelerationEnabled(next);
    } else if (bridge) {
        bridge.recentChatListAccelerationEnabled = next;
    }

    try {
        const saved = await saveBaibaokuFastConfig({ recentChatListAccelerationEnabled: next });
        const savedEnabled = saved.recentChatListAccelerationEnabled !== false;
        settings.recentChatListAccelerationEnabled = savedEnabled;
        if (typeof bridge?.setRecentChatListAccelerationEnabled === 'function') {
            bridge.setRecentChatListAccelerationEnabled(savedEnabled);
        } else if (bridge) {
            bridge.recentChatListAccelerationEnabled = savedEnabled;
        }
        return saved;
    } catch (error) {
        settings.recentChatListAccelerationEnabled = previous;
        if (typeof bridge?.setRecentChatListAccelerationEnabled === 'function') {
            bridge.setRecentChatListAccelerationEnabled(previous);
        } else if (bridge) {
            bridge.recentChatListAccelerationEnabled = previous;
        }
        throw error;
    }
}

async function setBaibaokuProgressiveChatLoadingEnabled(enabled) {
    const previous = settings.progressiveChatLoadingEnabled === true;
    settings.progressiveChatLoadingEnabled = false;
    applyFastChatGetOptimization();

    try {
        const saved = await saveBaibaokuFastConfig({ progressiveChatLoadingEnabled: false });
        settings.progressiveChatLoadingEnabled = false;
        applyFastChatGetOptimization();
        return saved;
    } catch (error) {
        settings.progressiveChatLoadingEnabled = false;
        applyFastChatGetOptimization();
        throw error;
    }
}

async function setBaibaokuTokenizerBulkCountEnabled(enabled) {
    const next = Boolean(enabled);
    const previous = settings.tokenizerBulkCountEnabled !== false;
    settings.tokenizerBulkCountEnabled = next;

    const bridge = getBaibaokuEarlyBridge();
    if (typeof bridge?.setTokenizerBulkCountEnabled === 'function') {
        bridge.setTokenizerBulkCountEnabled(next);
    } else if (bridge) {
        bridge.tokenizerBulkCountEnabled = next;
    }

    try {
        const saved = await saveBaibaokuFastConfig({ tokenizerBulkCountEnabled: next });
        const savedEnabled = saved.tokenizerBulkCountEnabled !== false;
        settings.tokenizerBulkCountEnabled = savedEnabled;
        if (typeof bridge?.setTokenizerBulkCountEnabled === 'function') {
            bridge.setTokenizerBulkCountEnabled(savedEnabled);
        } else if (bridge) {
            bridge.tokenizerBulkCountEnabled = savedEnabled;
        }
        return saved;
    } catch (error) {
        settings.tokenizerBulkCountEnabled = previous;
        if (typeof bridge?.setTokenizerBulkCountEnabled === 'function') {
            bridge.setTokenizerBulkCountEnabled(previous);
        } else if (bridge) {
            bridge.tokenizerBulkCountEnabled = previous;
        }
        throw error;
    }
}

async function setBaibaokuChatKeyboardScanReductionEnabled(enabled) {
    const next = Boolean(enabled);
    const previous = settings.chatKeyboardScanReductionEnabled !== false;
    settings.chatKeyboardScanReductionEnabled = next;

    const bridge = getBaibaokuEarlyBridge();
    if (typeof bridge?.setChatKeyboardScanReductionEnabled === 'function') {
        bridge.setChatKeyboardScanReductionEnabled(next);
    } else if (bridge) {
        bridge.chatKeyboardScanReductionEnabled = next;
    }

    try {
        const saved = await saveBaibaokuFastConfig({ chatKeyboardScanReductionEnabled: next });
        const savedEnabled = saved.chatKeyboardScanReductionEnabled !== false;
        settings.chatKeyboardScanReductionEnabled = savedEnabled;
        if (typeof bridge?.setChatKeyboardScanReductionEnabled === 'function') {
            bridge.setChatKeyboardScanReductionEnabled(savedEnabled);
        } else if (bridge) {
            bridge.chatKeyboardScanReductionEnabled = savedEnabled;
        }
        return saved;
    } catch (error) {
        settings.chatKeyboardScanReductionEnabled = previous;
        if (typeof bridge?.setChatKeyboardScanReductionEnabled === 'function') {
            bridge.setChatKeyboardScanReductionEnabled(previous);
        } else if (bridge) {
            bridge.chatKeyboardScanReductionEnabled = previous;
        }
        throw error;
    }
}

async function setBaibaokuExtensionManifestBundleEnabled(enabled) {
    const next = Boolean(enabled);
    const previous = settings.extensionManifestBundleEnabled !== false;
    settings.extensionManifestBundleEnabled = next;

    const bridge = getBaibaokuEarlyBridge();
    if (typeof bridge?.setExtensionManifestBundleEnabled === 'function') {
        bridge.setExtensionManifestBundleEnabled(next);
    } else if (bridge) {
        bridge.extensionManifestBundleEnabled = next;
    }

    try {
        const saved = await saveBaibaokuFastConfig({ extensionManifestBundleEnabled: next });
        const savedEnabled = saved.extensionManifestBundleEnabled !== false;
        settings.extensionManifestBundleEnabled = savedEnabled;
        if (typeof bridge?.setExtensionManifestBundleEnabled === 'function') {
            bridge.setExtensionManifestBundleEnabled(savedEnabled);
        } else if (bridge) {
            bridge.extensionManifestBundleEnabled = savedEnabled;
        }
        return saved;
    } catch (error) {
        settings.extensionManifestBundleEnabled = previous;
        if (typeof bridge?.setExtensionManifestBundleEnabled === 'function') {
            bridge.setExtensionManifestBundleEnabled(previous);
        } else if (bridge) {
            bridge.extensionManifestBundleEnabled = previous;
        }
        throw error;
    }
}

export {
    setBaibaokuCharacterListAccelerationEnabled,
    setBaibaokuChatKeyboardScanReductionEnabled,
    setBaibaokuExtensionManifestBundleEnabled,
    setBaibaokuLazyThemeLoadingEnabled,
    setBaibaokuProgressiveChatLoadingEnabled,
    setBaibaokuRecentChatListAccelerationEnabled,
    setBaibaokuSettingsAccelerationEnabled,
    setBaibaokuTokenizerBulkCountEnabled,
};
