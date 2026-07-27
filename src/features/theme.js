import * as scriptModule from '@sillytavern/script';
import { getRequestHeaders, saveSettingsDebounced } from '@sillytavern/script';
import { applyPowerUserSettings, power_user } from '@sillytavern/scripts/power-user';
import { cancelDebounce } from '@sillytavern/scripts/utils';
import { BAIBAOKU_EARLY_BRIDGE_KEY, BAIBAOKU_THEME_COLOR_BINDINGS, BAIBAOKU_THEME_GET_URL, BAIBAOKU_THEME_LOADING_FIXED_CLASS, BAIBAOKU_THEME_LOADING_HOST_CLASS, BAIBAOKU_THEME_LOADING_OVERLAY_CLASS, BAIBAOKU_THEME_LOADING_SPINNER_CLASS, BAIBAOKU_THEME_LOADING_STYLE_ID, BAIBAOKU_THEME_POWER_USER_KEYS, CUSTOM_CSS_CODEMIRROR_EDITOR_KEY, CUSTOM_CSS_THEME_SYNC_SETTLE_DELAYS_MS, LAZY_THEME_CHANGE_GUARD_KEY, LOG_PREFIX, THEME_APPLY_REFLOW_GUARD_METRICS, THEME_APPLY_REFLOW_GUARD_PATCH_KEY, THEME_APPLY_REFLOW_GUARD_WINDOW_MS, THEME_CACHE_SYNC_FETCH_KEY, THEME_DELETE_PATH, THEME_MANAGER_BACKGROUND_BINDINGS_KEY, THEME_MANAGER_BACKGROUND_SELECTOR, THEME_MANAGER_PANEL_SELECTOR, THEME_MANAGER_THEME_ITEM_SELECTOR, THEME_SAVE_PATH } from './constants.js';
import { syncCustomCssStateFromSettings } from './customCss.js';
import { getFetchRequestMethod, getFetchRequestUrl, isFetchRequest } from './gzipHook.js';
import { extensionState, settings } from './state.js';
const baibaokuThemePageCache = new Map();

function getBaibaokuEarlyBridge() {
    const bridge = globalThis[BAIBAOKU_EARLY_BRIDGE_KEY];
    return bridge && typeof bridge === 'object' ? bridge : null;
}

function getLazyThemeChangeGuardState() {
    if (!globalThis[LAZY_THEME_CHANGE_GUARD_KEY] || typeof globalThis[LAZY_THEME_CHANGE_GUARD_KEY] !== 'object') {
        globalThis[LAZY_THEME_CHANGE_GUARD_KEY] = {
            installed: false,
            handler: null,
            pending: null,
            replaying: false,
            currentThemeName: '',
            loadingToken: null,
            loadingHost: null,
            loadingOverlay: null,
        };
    }

    return globalThis[LAZY_THEME_CHANGE_GUARD_KEY];
}

async function fetchBaibaokuThemeByName(name) {
    const response = await fetch(BAIBAOKU_THEME_GET_URL, {
        method: 'POST',
        cache: 'no-store',
        headers: getRequestHeaders(),
        body: JSON.stringify({ name }),
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
        const error = new Error(payload?.message || `Theme request failed: ${response.status}`);
        error.status = response.status;
        error.payload = payload;
        throw error;
    }

    const theme = payload?.data;
    if (!theme || typeof theme !== 'object' || Array.isArray(theme)) {
        throw new Error('Theme response payload is invalid');
    }

    return theme;
}

async function loadBaibaokuThemeByName(name) {
    const cacheKey = String(name || '').trim();
    if (cacheKey && baibaokuThemePageCache.has(cacheKey)) {
        return baibaokuThemePageCache.get(cacheKey);
    }

    const theme = await fetchBaibaokuThemeByName(name);
    if (cacheKey) {
        baibaokuThemePageCache.set(cacheKey, theme);
    }
    return theme;
}

function cacheBaibaokuCurrentThemeSnapshot(name) {
    const cacheKey = String(name || '').trim();
    if (!cacheKey || baibaokuThemePageCache.has(cacheKey)) {
        return false;
    }

    const theme = { name: cacheKey };
    for (const key of BAIBAOKU_THEME_POWER_USER_KEYS) {
        if (power_user[key] !== undefined) {
            theme[key] = power_user[key];
        }
    }

    baibaokuThemePageCache.set(cacheKey, theme);
    return true;
}

function getThemeMutationRequestPath(input, init) {
    if (getFetchRequestMethod(input, init) !== 'POST') {
        return '';
    }

    const rawUrl = getFetchRequestUrl(input);
    if (!rawUrl) {
        return '';
    }

    try {
        const pathname = new URL(rawUrl, location.href).pathname;
        return pathname === THEME_SAVE_PATH || pathname === THEME_DELETE_PATH ? pathname : '';
    } catch {
        return '';
    }
}

async function getThemeMutationRequestBody(input, init) {
    try {
        if (typeof init?.body === 'string') {
            return JSON.parse(init.body);
        }

        if (isFetchRequest(input) && !init?.body) {
            return await input.clone().json();
        }
    } catch {
        // 请求体解析失败时走 catch 后的兜底清空。
    }

    return null;
}

function syncThemePageCacheAfterMutation(pathname, body) {
    const state = getLazyThemeChangeGuardState();
    const name = typeof body?.name === 'string' ? body.name.trim() : '';

    if (!name) {
        // 拿不到主题名就整体清空,宁可让下次切换重新请求,也不能留陈旧条目。
        baibaokuThemePageCache.clear();
        return;
    }

    if (pathname === THEME_DELETE_PATH) {
        baibaokuThemePageCache.delete(name);
        if (state.currentThemeName === name) {
            state.currentThemeName = '';
        }
        return;
    }

    // 原生 saveTheme 的请求体就是完整主题对象,直接覆盖缓存;
    // 同时更新 currentThemeName:保存后 power_user.theme 已指向该主题,
    // 之后切走时的快照逻辑要以它为“当前主题”。
    baibaokuThemePageCache.set(name, { ...body, name });
    state.currentThemeName = name;
}

// 原生“更新/另存美化主题”(POST /api/themes/save)和删除主题不经过柏宝库,
// 页面缓存 baibaokuThemePageCache 若不同步,保存后切走再切回会命中修改前的
// 旧缓存,并经 applyTheme + saveSettingsDebounced 把旧值写回 settings,表现
// 为“保存的修改丢了”。这里拦截成功响应,用请求体刷新缓存。
function installThemePageCacheSyncFetchHook() {
    const existing = globalThis[THEME_CACHE_SYNC_FETCH_KEY];
    if (existing?.wrappedFetch) {
        return existing;
    }

    const originalFetch = globalThis.fetch;
    if (typeof originalFetch !== 'function') {
        return null;
    }

    const state = {
        originalFetch: originalFetch.bind(globalThis),
        wrappedFetch: null,
    };

    state.wrappedFetch = async function baiBaiToolkitThemeCacheSyncFetch(input, init) {
        let pathname = '';
        let body = null;

        try {
            pathname = getThemeMutationRequestPath(input, init);
            if (pathname) {
                // 先取请求体:Request 流只能读一次,等响应回来后可能已被消费。
                body = await getThemeMutationRequestBody(input, init);
            }
        } catch {
            pathname = '';
        }

        const response = await state.originalFetch(input, init);

        if (pathname && response?.ok) {
            try {
                syncThemePageCacheAfterMutation(pathname, body);
            } catch (error) {
                console.warn(`${LOG_PREFIX} Failed to sync theme page cache after ${pathname}:`, error);
                baibaokuThemePageCache.clear();
            }
        }

        return response;
    };

    state.wrappedFetch[THEME_CACHE_SYNC_FETCH_KEY] = true;
    globalThis[THEME_CACHE_SYNC_FETCH_KEY] = state;
    globalThis.fetch = state.wrappedFetch;
    return state;
}

function applyBaibaokuThemeColorBindings() {
    for (const { key, selector, variable, metaTheme } of BAIBAOKU_THEME_COLOR_BINDINGS) {
        const value = power_user[key];
        if (value === undefined) {
            continue;
        }

        if (selector) {
            $(selector).attr('color', value);
        }

        if (variable) {
            document.documentElement.style.setProperty(variable, String(value));
        }

        if (key === 'main_text_color') {
            const colorMatch = String(value).match(/\(([^)]+)\)/);
            const colorParts = colorMatch ? colorMatch[1].split(',').map(part => part.trim()) : [];
            if (colorParts.length >= 4) {
                document.documentElement.style.setProperty('--SmartThemeCheckboxBgColorR', colorParts[0]);
                document.documentElement.style.setProperty('--SmartThemeCheckboxBgColorG', colorParts[1]);
                document.documentElement.style.setProperty('--SmartThemeCheckboxBgColorB', colorParts[2]);
                document.documentElement.style.setProperty('--SmartThemeCheckboxBgColorA', colorParts[3]);
            }
        }

        if (metaTheme) {
            document.querySelector('meta[name=theme-color]')?.setAttribute('content', String(value));
        }
    }
}

function applyBaibaokuThemeSelectState() {
    $('#chat_display').val(power_user.chat_display);
    $(`#chat_display option[value=${power_user.chat_display}]`).prop('selected', true);
    $('#toastr_position').val(power_user.toastr_position);
    $(`#toastr_position option[value="${power_user.toastr_position}"]`).prop('selected', true);
    $('#media_display').val(power_user.media_display);
}

function ensureBaibaokuSelectOption(selectId, value, text = value) {
    const select = document.getElementById(selectId);
    if (!(select instanceof HTMLSelectElement) || !value) {
        return null;
    }

    const existing = Array.from(select.options).find(option => option.value === value);
    if (existing) {
        return existing;
    }

    const option = document.createElement('option');
    option.value = value;
    option.textContent = text;
    select.append(option);
    return option;
}

function refreshBaibaokuSelectDisplay(selectId) {
    const select = document.getElementById(selectId);
    if (!(select instanceof HTMLSelectElement)) {
        return;
    }

    const selectedOption = select.options[select.selectedIndex] || null;
    const selectedText = selectedOption?.textContent || select.value;
    const $select = $(`#${selectId}`);
    if (typeof $select.select2 === 'function' && ($select.data('select2') || $select.hasClass('select2-hidden-accessible'))) {
        $select.trigger('change.select2');
        const rendered = $select.data('select2')?.$container?.find?.('.select2-selection__rendered');
        if (rendered?.length && selectedText) {
            rendered.text(selectedText).attr('title', selectedText);
        }
    }
}

function setBaibaokuSelectValue(selectId, value, text = value) {
    const select = document.getElementById(selectId);
    const option = ensureBaibaokuSelectOption(selectId, value, text);
    if (!(select instanceof HTMLSelectElement) || !option) {
        return;
    }

    option.selected = true;
    select.value = value;
    $(`#${selectId}`).val(value);
    refreshBaibaokuSelectDisplay(selectId);
}

function applyBaibaokuThemeLoadingStyle() {
    let style = document.getElementById(BAIBAOKU_THEME_LOADING_STYLE_ID);
    if (!style) {
        style = document.createElement('style');
        style.id = BAIBAOKU_THEME_LOADING_STYLE_ID;
        document.head.append(style);
    }

    style.textContent = `
.${BAIBAOKU_THEME_LOADING_HOST_CLASS} {
    position: relative;
}

.${BAIBAOKU_THEME_LOADING_OVERLAY_CLASS} {
    align-items: center;
    background: rgba(20, 22, 26, 0.62);
    border-radius: 6px;
    box-sizing: border-box;
    color: #ffffff;
    display: flex;
    font-size: 13px;
    font-weight: 600;
    gap: 8px;
    inset: 0;
    justify-content: center;
    line-height: 1.4;
    min-height: 42px;
    padding: 10px 12px;
    pointer-events: auto;
    position: absolute;
    text-align: center;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.45);
    z-index: 30;
}

.${BAIBAOKU_THEME_LOADING_FIXED_CLASS} {
    border-radius: 0;
    min-height: 0;
    position: fixed;
    z-index: 10000;
}

.${BAIBAOKU_THEME_LOADING_SPINNER_CLASS} {
    animation: bai-bai-toolkit-theme-loading-spin 0.75s linear infinite;
    border: 2px solid rgba(255, 255, 255, 0.42);
    border-radius: 50%;
    border-top-color: #ffffff;
    flex: 0 0 auto;
    height: 16px;
    width: 16px;
}

@keyframes bai-bai-toolkit-theme-loading-spin {
    to {
        transform: rotate(360deg);
    }
}

@media (prefers-reduced-motion: reduce) {
    .${BAIBAOKU_THEME_LOADING_SPINNER_CLASS} {
        animation: none;
    }
}
`;
}

function getBaibaokuThemeLoadingHost(target) {
    if (target instanceof Element) {
        const localHost = target.closest('#UI-presets-block, #UI-Theme-Block');
        if (localHost instanceof HTMLElement) {
            return localHost;
        }
    }

    return document.body;
}

function showBaibaokuThemeLoadingOverlay(state, target) {
    const token = {};
    const host = getBaibaokuThemeLoadingHost(target);
    if (!(host instanceof HTMLElement)) {
        state.loadingToken = token;
        return token;
    }

    applyBaibaokuThemeLoadingStyle();
    hideBaibaokuThemeLoadingOverlay(state);

    const fixed = host === document.body;
    const overlay = document.createElement('div');
    overlay.className = fixed
        ? `${BAIBAOKU_THEME_LOADING_OVERLAY_CLASS} ${BAIBAOKU_THEME_LOADING_FIXED_CLASS}`
        : BAIBAOKU_THEME_LOADING_OVERLAY_CLASS;
    overlay.setAttribute('role', 'status');
    overlay.setAttribute('aria-live', 'polite');
    overlay.innerHTML = `<span class="${BAIBAOKU_THEME_LOADING_SPINNER_CLASS}" aria-hidden="true"></span><span>正在加载美化主题...</span>`;

    if (!fixed) {
        host.classList.add(BAIBAOKU_THEME_LOADING_HOST_CLASS);
    }
    host.append(overlay);

    state.loadingToken = token;
    state.loadingHost = host;
    state.loadingOverlay = overlay;
    return token;
}

function hideBaibaokuThemeLoadingOverlay(state, token = null) {
    if (token && state.loadingToken !== token) {
        return;
    }

    state.loadingOverlay?.remove();
    if (state.loadingHost instanceof HTMLElement && state.loadingHost !== document.body) {
        state.loadingHost.classList.remove(BAIBAOKU_THEME_LOADING_HOST_CLASS);
    }

    state.loadingToken = null;
    state.loadingHost = null;
    state.loadingOverlay = null;
}

function setBaibaokuThemeSelectBusy(target, busy) {
    if (target instanceof HTMLSelectElement) {
        target.disabled = busy;
    }

    const $themes = $('#themes');
    $themes.prop('disabled', busy);
    if (typeof $themes.select2 === 'function' && ($themes.data('select2') || $themes.hasClass('select2-hidden-accessible'))) {
        $themes.trigger('change.select2');
    }
}

function syncCustomCssCodeMirrorFromThemeChange() {

    return syncCustomCssStateFromSettings('theme change', {
        forceEditor: true,
        refreshTarget: true,
        clearThemePending: true,
    });
}

function scheduleCustomCssCodeMirrorThemeSync() {
    beginThemeApplyReflowGuardWindow();

    const state = extensionState[CUSTOM_CSS_CODEMIRROR_EDITOR_KEY];

    if (!state?.enabled) {
        syncCustomCssStateFromSettings('theme change without CodeMirror', {
            forceEditor: false,
            refreshTarget: false,
            clearThemePending: false,
        });
        return;
    }

    const token = (state?.themeSyncToken ?? 0) + 1;

    // Mark synchronously, before the rAF is even registered. A theme switch has
    // already written the new CSS into power_user.custom_css, so the editor's
    // current doc is stale. If a page-lifecycle flush fires before the deferred
    // sync runs (e.g. the tab is hidden right after switching, which also freezes
    // rAF), this flag tells the flush to NOT write the stale doc back over the
    // fresh custom_css. The flag is cleared once the sync has pulled the new CSS
    // into the doc.
    state.themeSyncPending = true;
    state.themeSyncToken = token;
    state.themeSyncTimers ||= [];
    state.themeSyncFrames ||= [];
    clearCustomCssCodeMirrorThemeSyncTimers(state);

    const sync = (phase = 'settle') => {
        if (state?.enabled && state.themeSyncToken !== token) {
            return;
        }

        try {
            const complete = syncCustomCssCodeMirrorFromThemeChange();

            if (complete) {
                clearCustomCssCodeMirrorThemeSyncTimers(state);
            }
        } catch (error) {
        }
    };

    // 不做 microtask 首发:它会跑在主题 apply 同一个长任务里(实测在 mousedown
    // 任务内加 200ms+),而 themeSyncPending 已防止期间的陈旧写回。rAF 首发落在
    // apply 任务之外,settle 定时器兜底 rAF 被冻结(标签页隐藏)的情况。
    if (typeof requestAnimationFrame === 'function') {
        const frame = requestAnimationFrame(() => sync('animation frame'));
        state.themeSyncFrames.push(frame);
    } else {
        queueCustomCssThemeSyncPass(state, token, () => sync('microtask'));
    }

    for (const delay of CUSTOM_CSS_THEME_SYNC_SETTLE_DELAYS_MS) {
        const timer = setTimeout(() => sync(`timeout ${delay}ms`), delay);
        state.themeSyncTimers.push(timer);
    }
}

function queueCustomCssThemeSyncPass(state, token, callback) {
    const run = () => {
        if (state?.enabled && state.themeSyncToken !== token) {
            return;
        }

        callback();
    };

    if (typeof queueMicrotask === 'function') {
        queueMicrotask(run);
    } else {
        const timer = setTimeout(run, 0);
        if (state?.enabled) {
            state.themeSyncTimers ||= [];
            state.themeSyncTimers.push(timer);
        }
    }
}

// 原生 applyTheme 对 bogus_folders / zoomed_avatar_magnification 两个键不比对
// 新旧值就调 printCharactersDebounced(),100ms 后触发角色列表全量重建(实测在
// 主题切换的脏样式窗口里单次 1.4s+)。bogus_folders 真的会改变列表结构,变了
// 就放行;zoomed_avatar_magnification 只在点击头像放大那一刻被读取(script.js
// 的 zoom 逻辑),完全不影响角色列表 DOM——它引发的重刷无条件取消。
function snapshotThemePrintCharactersKeys() {
    // 快照为 null 时 cancel 直接跳过——与守卫窗口共用“切换美化优化”开关。
    if (!settings.customCssShadowPropertyEnabled) {
        return null;
    }

    return {
        bogusFolders: power_user.bogus_folders,
    };
}

function cancelThemePrintCharactersIfUnchanged(snapshot) {
    if (!snapshot || power_user.bogus_folders !== snapshot.bogusFolders) {
        return;
    }

    const printCharactersDebounced = scriptModule.printCharactersDebounced;

    if (typeof printCharactersDebounced === 'function') {
        cancelDebounce(printCharactersDebounced);
    }
}

function getThemeApplyReflowGuardState() {
    if (!extensionState.themeApplyReflowGuard) {
        extensionState.themeApplyReflowGuard = {
            installed: false,
            windowUntil: 0,
            cache: null,
            originalGetters: null,
            originalScrollTopSetter: null,
            pendingScrollTop: null,
            scrollTopFlushFrame: 0,
            endTimer: null,
        };
    }

    return extensionState.themeApplyReflowGuard;
}

// 主题切换会连续多次改写全局样式,期间任何对 #chat 的 scrollHeight/clientHeight
// 读取都会强制整个文档同步 style recalc + layout(实测单次可达数百毫秒)。窗口
// 开始时样式尚未失效、读取便宜,先预热缓存;窗口内一律返回缓存值,绝不在脏样
// 式上重读。窗口外零开销。
function beginThemeApplyReflowGuardWindow() {
    // 整套主题切换守卫(reflow 缓存、scrollTop 延迟写、printCharacters 取消、
    // 头像重扫推迟)统一挂在“切换美化优化”开关下:关闭即完全原生行为。
    // 窗口从不开启时,prototype 补丁也不会安装。
    if (!settings.customCssShadowPropertyEnabled) {
        return;
    }

    const state = getThemeApplyReflowGuardState();
    const windowActive = Date.now() < state.windowUntil && state.cache;
    state.windowUntil = Date.now() + THEME_APPLY_REFLOW_GUARD_WINDOW_MS;

    // 窗口已激活时只延长期限:此刻样式多半已脏,重新预热反而会强制一次全页布局。
    // (捕获阶段的首次 begin 在样式失效前预热,后续 begin 沿用那份缓存。)
    if (windowActive) {
        return;
    }

    state.cache = new Map();
    installThemeApplyReflowGuard(state);
    prewarmThemeApplyReflowGuardCache(state);
}

function prewarmThemeApplyReflowGuardCache(state) {
    const chat = document.getElementById('chat');

    if (!(chat instanceof HTMLElement) || !state.cache) {
        return;
    }

    for (const metric of THEME_APPLY_REFLOW_GUARD_METRICS) {
        const originalGet = state.originalGetters?.[metric];

        if (typeof originalGet === 'function') {
            state.cache.set(metric, { value: originalGet.call(chat), at: Date.now() });
        }
    }
}

function installThemeApplyReflowGuard(state) {
    if (state.installed) {
        return;
    }

    const prototype = globalThis.Element?.prototype;

    if (!prototype) {
        return;
    }

    for (const metric of THEME_APPLY_REFLOW_GUARD_METRICS) {
        const descriptor = Object.getOwnPropertyDescriptor(prototype, metric);

        if (!descriptor?.get || descriptor.get[THEME_APPLY_REFLOW_GUARD_PATCH_KEY]) {
            continue;
        }

        const originalGet = descriptor.get;

        state.originalGetters ||= {};
        state.originalGetters[metric] = originalGet;

        function guardedMetricGetter() {
            if (this instanceof HTMLElement && this.id === 'chat' && Date.now() < state.windowUntil && state.cache) {
                const entry = state.cache.get(metric);

                if (entry) {
                    return entry.value;
                }

                // 缓存未预热(切换时 #chat 不存在等边角情况):读一次并整窗复用。
                // 窗口内绝不重读——中途样式已脏,重读就是一次全文档强制布局。
                const value = originalGet.call(this);
                state.cache.set(metric, { value, at: Date.now() });
                return value;
            }

            return originalGet.call(this);
        }

        guardedMetricGetter[THEME_APPLY_REFLOW_GUARD_PATCH_KEY] = true;
        guardedMetricGetter.__baiBaiToolkitOriginalMetricGetter = originalGet;

        Object.defineProperty(prototype, metric, {
            ...descriptor,
            get: guardedMetricGetter,
        });
    }

    installThemeApplyScrollTopWriteDeferral(state, prototype);

    state.installed = true;
}

// 窗口内对 #chat 的 scrollTop 写入同样会在脏样式上强制 style recalc(实测单次
// 200ms+)。把写入合并推迟到下一帧:浏览器先完成正常的样式/布局管线,rAF 里的
// 写入就只是廉价的滚动位移。多次写入只保留最后一次(自动滚底本就幂等)。
function installThemeApplyScrollTopWriteDeferral(state, prototype) {
    const descriptor = Object.getOwnPropertyDescriptor(prototype, 'scrollTop');

    if (!descriptor?.set || descriptor.set[THEME_APPLY_REFLOW_GUARD_PATCH_KEY]) {
        return;
    }

    const originalSet = descriptor.set;

    function themeWindowScrollTopSetter(value) {
        if (this instanceof HTMLElement && this.id === 'chat' && Date.now() < state.windowUntil) {
            state.pendingScrollTop = { element: this, value };

            if (!state.scrollTopFlushFrame && typeof requestAnimationFrame === 'function') {
                state.scrollTopFlushFrame = requestAnimationFrame(() => {
                    state.scrollTopFlushFrame = 0;
                    const pending = state.pendingScrollTop;
                    state.pendingScrollTop = null;

                    if (pending?.element?.isConnected) {
                        originalSet.call(pending.element, pending.value);
                    }
                });
            }

            return;
        }

        return originalSet.call(this, value);
    }

    themeWindowScrollTopSetter[THEME_APPLY_REFLOW_GUARD_PATCH_KEY] = true;
    themeWindowScrollTopSetter.__baiBaiToolkitOriginalScrollTopSetter = originalSet;

    Object.defineProperty(prototype, 'scrollTop', {
        ...descriptor,
        set: themeWindowScrollTopSetter,
    });
}

function clearCustomCssCodeMirrorThemeSyncTimers(state = extensionState[CUSTOM_CSS_CODEMIRROR_EDITOR_KEY]) {
    if (!state) {
        return;
    }

    for (const timer of state.themeSyncTimers || []) {
        clearTimeout(timer);
    }

    if (typeof cancelAnimationFrame === 'function') {
        for (const frame of state.themeSyncFrames || []) {
            cancelAnimationFrame(frame);
        }
    }

    state.themeSyncTimers = [];
    state.themeSyncFrames = [];
}

function getThemeManagerBackgroundBindings() {
    try {
        const raw = localStorage.getItem(THEME_MANAGER_BACKGROUND_BINDINGS_KEY);
        if (!raw) {
            return null;
        }

        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
    } catch (error) {
        console.debug(`${LOG_PREFIX} Failed to read Theme Manager background bindings`, error);
        return null;
    }
}

function syncThemeManagerActiveTheme(themeName) {
    if (!themeName || !document.querySelector(THEME_MANAGER_PANEL_SELECTOR)) {
        return false;
    }

    document.querySelectorAll(THEME_MANAGER_THEME_ITEM_SELECTOR).forEach((item) => {
        if (item instanceof HTMLElement) {
            item.classList.toggle('active', item.dataset.value === themeName);
        }
    });

    return true;
}

function applyThemeManagerBoundBackground(themeName) {
    const bindings = getThemeManagerBackgroundBindings();
    const boundBackground = typeof bindings?.[themeName] === 'string' ? bindings[themeName] : '';
    if (!boundBackground) {
        return false;
    }

    const backgroundElement = Array.from(document.querySelectorAll(THEME_MANAGER_BACKGROUND_SELECTOR))
        .find((element) => element instanceof HTMLElement && element.getAttribute('bgfile') === boundBackground);

    if (!(backgroundElement instanceof HTMLElement)) {
        console.debug(`${LOG_PREFIX} Theme Manager bound background was not found: ${boundBackground}`);
        return false;
    }

    backgroundElement.click();
    return true;
}

function syncThemeManagerAfterLazyThemeApply(themeName) {
    if (!themeName || !document.querySelector(THEME_MANAGER_PANEL_SELECTOR)) {
        return;
    }

    syncThemeManagerActiveTheme(themeName);
    applyThemeManagerBoundBackground(themeName);
}

function applyBaibaokuThemeObject(theme, fallbackName) {
    const themeName = typeof theme?.name === 'string' && theme.name ? theme.name : fallbackName;
    if (!themeName) {
        throw new Error('Theme name is missing');
    }

    beginThemeApplyReflowGuardWindow();
    const themePrintCharactersSnapshot = snapshotThemePrintCharactersKeys();
    baibaokuThemePageCache.set(themeName, { ...theme, name: themeName });

    const applyNativeTheme = globalThis.baibaokuApplyNativeTheme;
    const hydrateTheme = globalThis.baibaokuHydrateTheme;
    let applyPath = 'unknown';


    extensionState.customCssThemeApplyDepth = (extensionState.customCssThemeApplyDepth || 0) + 1;

    try {
        if (typeof applyNativeTheme === 'function' && typeof hydrateTheme === 'function') {
            applyPath = 'native bridge';
            // Preferred path: hydrate the native `themes` array with the freshly
            // fetched full theme, then delegate to the native applyTheme so lazy
            // switching runs the exact same code path as a normal theme switch.
            // This avoids the chronic "this style switched but that one didn't"
            // drift that comes from maintaining a parallel subset of applyTheme.
            hydrateTheme({ ...theme, name: themeName });
            power_user.theme = themeName;
            setBaibaokuSelectValue('themes', themeName);
            applyNativeTheme(themeName);
            saveSettingsDebounced();
        } else {
            applyPath = 'fallback';
            // Fallback for when the backend theme bridge has not patched
            // power-user.js (older install, patch failed, etc.). Keep the legacy
            // best-effort application so behavior never regresses to "no switch".
            const oldChatDisplay = power_user.chat_display;
            const oldToastrPosition = power_user.toastr_position;
            power_user.theme = themeName;
            for (const key of BAIBAOKU_THEME_POWER_USER_KEYS) {
                if (theme[key] !== undefined) {
                    power_user[key] = theme[key];
                }
            }

            setBaibaokuSelectValue('themes', themeName);
            applyBaibaokuThemeColorBindings();
            applyBaibaokuThemeSelectState();
            applyPowerUserSettings();
            setBaibaokuSelectValue('themes', themeName);
            applyBaibaokuThemeColorBindings();
            applyBaibaokuThemeSelectState();
            if (oldChatDisplay !== power_user.chat_display) {
                $('#chat_display').trigger('change');
            }
            if (oldToastrPosition !== power_user.toastr_position) {
                $('#toastr_position').trigger('change');
            }
            saveSettingsDebounced();
        }

    } catch (error) {
        throw error;
    } finally {
        extensionState.customCssThemeApplyDepth = Math.max(0, (extensionState.customCssThemeApplyDepth || 1) - 1);
    }

    cancelThemePrintCharactersIfUnchanged(themePrintCharactersSnapshot);
    scheduleCustomCssCodeMirrorThemeSync();
    syncThemeManagerAfterLazyThemeApply(themeName);
}

// 守卫窗口原来只在 #themes 的 change capture 阶段开启,但主题管理器等扩展的
// 切换入口是点击条目 → 同步开始应用主题 → 之后才 dispatch change:开窗时样式
// 已脏,预热读取本身变成一次全文档强制布局(实测 6x 节流下 1.2s)。改为在
// pointerdown capture 阶段就开窗——此刻任何处理器都还没跑、样式干净,预热
// 只是一次廉价读取;后续 mousedown/click/change 里的应用风暴全程命中缓存。
// pointerdown 在 mouse/touch/pen 上都先于 mousedown 与 click。
function installThemeSwitchPointerdownPrewarm() {
    const state = getLazyThemeChangeGuardState();
    if (state.pointerdownPrewarmInstalled || typeof document === 'undefined') {
        return;
    }

    document.addEventListener('pointerdown', (event) => {
        const target = event?.target;
        if (target instanceof Element
            && target.closest('#themes, #UI-presets-block, #theme-manager-panel')) {
            // 内部自带“切换美化优化”开关与窗口激活判断,重复调用只延长期限。
            beginThemeApplyReflowGuardWindow();
        }
    }, true);

    state.pointerdownPrewarmInstalled = true;
}

function applyBaibaokuLazyThemeLoadingOptimization() {
    installThemePageCacheSyncFetchHook();
    installThemeSwitchPointerdownPrewarm();

    const state = getLazyThemeChangeGuardState();
    if (state.installed || typeof document === 'undefined') {
        return;
    }

    state.handler = function baiBaiToolkitLazyThemeChangeGuard(event) {
        const target = event?.target;
        if (!(target instanceof HTMLSelectElement) || target.id !== 'themes' || state.replaying) {
            return;
        }

        const themeName = String(target.value || '');
        if (!themeName) {
            return;
        }


        if (settings.baibaokuSettingsAccelerationEnabled === false || settings.baibaokuLazyThemeLoadingEnabled === false) {
            state.currentThemeName = themeName;
            return;
        }

        const bridge = getBaibaokuEarlyBridge();
        if (!bridge?.installed) {
            state.currentThemeName = themeName;
            return;
        }

        event.preventDefault();
        event.stopImmediatePropagation();

        const previousThemeName = state.currentThemeName || String(power_user?.theme || '');
        let cachedPreviousTheme = false;
        if (previousThemeName && previousThemeName !== themeName) {
            cachedPreviousTheme = cacheBaibaokuCurrentThemeSnapshot(previousThemeName);
        }
        const loadingToken = showBaibaokuThemeLoadingOverlay(state, target);
        setBaibaokuThemeSelectBusy(target, true);

        state.pending = loadBaibaokuThemeByName(themeName)
            .then((theme) => {
                applyBaibaokuThemeObject(theme, themeName);
                state.currentThemeName = themeName;
            })
            .catch((error) => {
                if (error?.status === 404 && typeof bridge.clearSettingsGetCache === 'function') {
                    bridge.clearSettingsGetCache('theme-not-found');
                }
                if (previousThemeName) {
                    setBaibaokuSelectValue('themes', previousThemeName);
                }
                if (globalThis.toastr?.error) {
                    globalThis.toastr.error(`美化主题加载失败：${error?.message || String(error)}`, '柏宝库');
                }
            })
            .finally(() => {
                if (state.loadingToken === loadingToken) {
                    setBaibaokuThemeSelectBusy(target, false);
                    state.pending = null;
                }
                hideBaibaokuThemeLoadingOverlay(state, loadingToken);
            });
    };

    document.addEventListener('change', state.handler, true);
    state.installed = true;
}

export {
    applyBaibaokuLazyThemeLoadingOptimization,
    applyBaibaokuThemeColorBindings,
    applyBaibaokuThemeLoadingStyle,
    applyBaibaokuThemeObject,
    applyBaibaokuThemeSelectState,
    applyThemeManagerBoundBackground,
    baibaokuThemePageCache,
    beginThemeApplyReflowGuardWindow,
    cacheBaibaokuCurrentThemeSnapshot,
    cancelThemePrintCharactersIfUnchanged,
    clearCustomCssCodeMirrorThemeSyncTimers,
    ensureBaibaokuSelectOption,
    fetchBaibaokuThemeByName,
    getBaibaokuEarlyBridge,
    getBaibaokuThemeLoadingHost,
    getLazyThemeChangeGuardState,
    getThemeApplyReflowGuardState,
    getThemeManagerBackgroundBindings,
    hideBaibaokuThemeLoadingOverlay,
    installThemeApplyReflowGuard,
    installThemeApplyScrollTopWriteDeferral,
    installThemePageCacheSyncFetchHook,
    installThemeSwitchPointerdownPrewarm,
    loadBaibaokuThemeByName,
    prewarmThemeApplyReflowGuardCache,
    queueCustomCssThemeSyncPass,
    refreshBaibaokuSelectDisplay,
    scheduleCustomCssCodeMirrorThemeSync,
    setBaibaokuSelectValue,
    setBaibaokuThemeSelectBusy,
    showBaibaokuThemeLoadingOverlay,
    snapshotThemePrintCharactersKeys,
    syncCustomCssCodeMirrorFromThemeChange,
    syncThemeManagerActiveTheme,
    syncThemeManagerAfterLazyThemeApply,
};
