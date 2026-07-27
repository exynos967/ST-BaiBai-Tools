import { getRequestHeaders } from '@sillytavern/script';
import { FAST_CHARACTER_LIST_FETCH_KEY, FAST_SETTINGS_BOOTSTRAP_CACHE_MS, FAST_SETTINGS_BOOTSTRAP_FETCH_KEY, LOG_PREFIX } from './constants.js';
import { buildFetchHeaders, copyFetchRequestOptions, getFetchRequestMethod, getFetchRequestUrl } from './gzipHook.js';
import { hasFetchBody, isPlainEmptyObject, parseJsonOrNull, readFetchJsonBody } from './util.js';

function disableFastSettingsBootstrapFetchHook() {
    const existing = globalThis[FAST_SETTINGS_BOOTSTRAP_FETCH_KEY];

    if (!existing?.wrappedFetch) {
        return;
    }

    existing.isEnabled = () => false;
    existing.cachedBootstrapTextPromise = null;
    existing.cachedBootstrapTextExpiresAt = 0;

    if (globalThis.fetch === existing.wrappedFetch && typeof existing.originalFetch === 'function') {
        globalThis.fetch = existing.originalFetch;
    }
}

function installFastSettingsBootstrapFetchHook() {
    const existing = globalThis[FAST_SETTINGS_BOOTSTRAP_FETCH_KEY];
    if (existing?.wrappedFetch) {
        existing.isEnabled = () => false;
        return existing;
    }

    const originalFetch = globalThis.fetch;

    if (typeof originalFetch !== 'function') {
        return null;
    }

    const state = {
        originalFetch: originalFetch.bind(globalThis),
        wrappedFetch: null,
        cachedBootstrapTextPromise: null,
        cachedBootstrapTextExpiresAt: 0,
        hitCount: 0,
        isEnabled: () => false,
    };

    state.wrappedFetch = async function baiBaiToolkitFastSettingsBootstrapFetch(input, init) {
        try {
            if (!state.isEnabled()) {
                return state.originalFetch(input, init);
            }

            if (!(await isFastSettingsBootstrapRequest(input, init))) {
                return state.originalFetch(input, init);
            }

            state.hitCount += 1;
            console.debug(`${LOG_PREFIX} Fast settings bootstrap intercept #${state.hitCount}`);
            return await fetchFastSettingsBootstrap(state.originalFetch, input, init, state);
        } catch (error) {
            console.debug(`${LOG_PREFIX} Fast settings bootstrap path failed; falling back to /api/settings/get`, error);
            return state.originalFetch(input, init);
        }
    };

    state.wrappedFetch[FAST_SETTINGS_BOOTSTRAP_FETCH_KEY] = true;
    globalThis[FAST_SETTINGS_BOOTSTRAP_FETCH_KEY] = state;
    globalThis.fetch = state.wrappedFetch;
    return state;
}

async function isFastSettingsBootstrapRequest(input, init) {
    const rawUrl = getFetchRequestUrl(input);

    if (!rawUrl || getFetchRequestMethod(input, init) !== 'POST') {
        return false;
    }

    try {
        const url = new URL(rawUrl, location.href);
        if (url.origin !== location.origin || url.pathname !== '/api/settings/get') {
            return false;
        }
    } catch {
        return false;
    }

    const body = await readFetchJsonBody(input, init);
    if (body === null) {
        return !hasFetchBody(input, init);
    }

    return isPlainEmptyObject(body);
}

async function fetchFastSettingsBootstrap(fetchFn, input, init, state) {
    const text = await getFastSettingsBootstrapText(fetchFn, input, init, state);
    return new Response(text, {
        status: 200,
        statusText: 'OK',
        headers: {
            'Content-Type': 'application/json',
        },
    });
}

async function getFastSettingsBootstrapText(fetchFn, input, init, state) {
    const cacheExpired = state.cachedBootstrapTextExpiresAt > 0 && Date.now() > state.cachedBootstrapTextExpiresAt;
    if (!state.cachedBootstrapTextPromise || cacheExpired) {
        state.cachedBootstrapTextPromise = fetchFastSettingsBootstrapText(fetchFn, input, init)
            .then((text) => {
                state.cachedBootstrapTextExpiresAt = Date.now() + FAST_SETTINGS_BOOTSTRAP_CACHE_MS;
                return text;
            })
            .catch((error) => {
                state.cachedBootstrapTextPromise = null;
                state.cachedBootstrapTextExpiresAt = 0;
                throw error;
            });
    }

    return await state.cachedBootstrapTextPromise;
}

async function fetchFastSettingsBootstrapText(fetchFn, input, init) {
    const headers = buildFetchHeaders(input, init);
    const requestHeaders = getRequestHeaders();
    for (const [key, value] of Object.entries(requestHeaders || {})) {
        if (!headers.has(key)) {
            headers.set(key, value);
        }
    }

    const fastInit = {
        ...copyFetchRequestOptions(input, init),
        ...(init || {}),
        method: 'POST',
        headers,
    };
    delete fastInit.body;

    const response = await fetchFn('/api/plugins/baibaoku/v1/settings/fast-bootstrap', fastInit);
    if (!response?.ok) {
        throw new Error(`Unexpected status ${response?.status || 'unknown'}`);
    }

    const text = await response.text();
    const data = parseJsonOrNull(text);
    if (!data || typeof data.settings !== 'string' || !data.bootstrap?.partial) {
        throw new Error('Fast settings bootstrap returned an invalid payload');
    }

    return text;
}

function installFastCharacterListFetchHook() {
    const existing = globalThis[FAST_CHARACTER_LIST_FETCH_KEY];
    if (existing?.wrappedFetch) {
        existing.isEnabled = () => false;
        return existing;
    }

    const originalFetch = globalThis.fetch;

    if (typeof originalFetch !== 'function') {
        return null;
    }

    const state = {
        originalFetch: originalFetch.bind(globalThis),
        wrappedFetch: null,
        isEnabled: () => false,
    };

    state.wrappedFetch = async function baiBaiToolkitFastCharacterListFetch(input, init) {
        try {
            if (!state.isEnabled()) {
                return state.originalFetch(input, init);
            }

            if (!(await isFastCharacterListRequest(input, init))) {
                return state.originalFetch(input, init);
            }

            return await fetchFastCharacterList(state.originalFetch, input, init);
        } catch (error) {
            console.debug(`${LOG_PREFIX} Fast character list path failed; falling back to /api/characters/all`, error);
            return state.originalFetch(input, init);
        }
    };

    state.wrappedFetch[FAST_CHARACTER_LIST_FETCH_KEY] = true;
    globalThis[FAST_CHARACTER_LIST_FETCH_KEY] = state;
    globalThis.fetch = state.wrappedFetch;
    return state;
}

function disableFastCharacterListFetchHook() {
    const existing = globalThis[FAST_CHARACTER_LIST_FETCH_KEY];

    if (!existing?.wrappedFetch) {
        return;
    }

    existing.isEnabled = () => false;

    if (globalThis.fetch === existing.wrappedFetch && typeof existing.originalFetch === 'function') {
        globalThis.fetch = existing.originalFetch;
    }
}

async function isFastCharacterListRequest(input, init) {
    const rawUrl = getFetchRequestUrl(input);

    if (!rawUrl || getFetchRequestMethod(input, init) !== 'POST') {
        return false;
    }

    try {
        const url = new URL(rawUrl, location.href);
        if (url.origin !== location.origin || url.pathname !== '/api/characters/all') {
            return false;
        }
    } catch {
        return false;
    }

    const body = await readFetchJsonBody(input, init);
    return isPlainEmptyObject(body);
}

async function fetchFastCharacterList(fetchFn, input, init) {
    const headers = buildFetchHeaders(input, init);
    const requestHeaders = getRequestHeaders();
    for (const [key, value] of Object.entries(requestHeaders || {})) {
        if (!headers.has(key)) {
            headers.set(key, value);
        }
    }

    const fastInit = {
        ...copyFetchRequestOptions(input, init),
        ...(init || {}),
        method: 'POST',
        headers,
    };
    delete fastInit.body;

    const response = await fetchFn('/api/plugins/baibaoku/v1/characters/fast-all', fastInit);
    if (!response?.ok) {
        throw new Error(`Unexpected status ${response?.status || 'unknown'}`);
    }

    const data = await response.clone().json().catch(() => null);
    if (!Array.isArray(data)) {
        throw new Error('Fast character list returned a non-array payload');
    }

    return response;
}

export {
    disableFastCharacterListFetchHook,
    disableFastSettingsBootstrapFetchHook,
    fetchFastCharacterList,
    fetchFastSettingsBootstrap,
    fetchFastSettingsBootstrapText,
    getFastSettingsBootstrapText,
    installFastCharacterListFetchHook,
    installFastSettingsBootstrapFetchHook,
    isFastCharacterListRequest,
    isFastSettingsBootstrapRequest,
};
