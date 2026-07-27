import { LOG_PREFIX, SAVE_REQUEST_GZIP_FETCH_KEY, SAVE_REQUEST_GZIP_PATHS } from './constants.js';
import { getPerformanceTraceStackSummary, recordPerformanceTraceGzipCompression } from './perfTrace.js';
import { settings } from './state.js';

function installSaveRequestGzipFetchHook() {
    const existing = globalThis[SAVE_REQUEST_GZIP_FETCH_KEY];
    if (existing?.wrappedFetch) {
        existing.isEnabled = () => settings.saveRequestGzipEnabled !== false;
        return existing;
    }

    const originalFetch = globalThis.fetch;

    if (typeof originalFetch !== 'function') {
        return null;
    }

    const state = {
        originalFetch: originalFetch.bind(globalThis),
        wrappedFetch: null,
        isEnabled: () => settings.saveRequestGzipEnabled !== false,
    };

    state.wrappedFetch = async function baiBaiToolkitSaveRequestGzipFetch(input, init) {
        try {
            if (!state.isEnabled()) {
                return state.originalFetch(input, init);
            }

            const gzipUrl = getSaveRequestGzipUrl(input);
            if (!gzipUrl) {
                return state.originalFetch(input, init);
            }

            const method = getFetchRequestMethod(input, init);
            if (!['POST', 'PUT', 'PATCH'].includes(method)) {
                return state.originalFetch(input, init);
            }

            const originalHeaders = buildFetchHeaders(input, init);
            if (originalHeaders.has('Content-Encoding')) {
                return state.originalFetch(input, init);
            }

            const bodyInfo = await getCompressibleFetchBody(input, init);
            if (!bodyInfo) {
                return state.originalFetch(input, init);
            }

            const compressedBody = await gzipFetchBody(bodyInfo.body, {
                method,
                path: gzipUrl.pathname,
                caller: getPerformanceTraceStackSummary(),
            });
            if (!compressedBody) {
                return state.originalFetch(input, init);
            }

            const headers = new Headers(originalHeaders);
            if (bodyInfo.contentType && !headers.has('Content-Type')) {
                headers.set('Content-Type', bodyInfo.contentType);
            }
            headers.set('Content-Encoding', 'gzip');
            headers.delete('Content-Length');

            const compressedInit = {
                ...(init || {}),
                method,
                headers,
                body: compressedBody,
            };

            try {
                const response = await state.originalFetch(input, compressedInit);
                if (!response?.ok) {
                    console.warn(`${LOG_PREFIX} Gzip save request returned ${response?.status || 'non-OK'}, retrying uncompressed.`);
                    const retry = buildUncompressedSaveRequestRetry(input, init, method, originalHeaders, bodyInfo);
                    return state.originalFetch(retry.input, retry.init);
                }
                return response;
            } catch (error) {
                console.warn(`${LOG_PREFIX} Gzip save request failed, retrying uncompressed:`, error);
                const retry = buildUncompressedSaveRequestRetry(input, init, method, originalHeaders, bodyInfo);
                return state.originalFetch(retry.input, retry.init);
            }
        } catch (error) {
            console.warn(`${LOG_PREFIX} Gzip save request skipped:`, error);
            return state.originalFetch(input, init);
        }
    };

    state.wrappedFetch[SAVE_REQUEST_GZIP_FETCH_KEY] = true;
    globalThis[SAVE_REQUEST_GZIP_FETCH_KEY] = state;
    globalThis.fetch = state.wrappedFetch;
    return state;
}

function getSaveRequestGzipUrl(input) {
    const rawUrl = getFetchRequestUrl(input);

    if (!rawUrl) {
        return null;
    }

    try {
        const url = new URL(rawUrl, location.href);
        const isSavePath = [...SAVE_REQUEST_GZIP_PATHS].some((path) => {
            return url.pathname === path || url.pathname.endsWith(path);
        });

        if (!isSavePath || isLocalOrPrivateHost(url.hostname)) {
            return null;
        }

        return url;
    } catch {
        return null;
    }
}

function getFetchRequestUrl(input) {
    if (typeof input === 'string') {
        return input;
    }

    if (typeof URL !== 'undefined' && input instanceof URL) {
        return input.href;
    }

    if (isFetchRequest(input)) {
        return input.url;
    }

    return '';
}

function getFetchRequestMethod(input, init) {
    return String(init?.method || (isFetchRequest(input) ? input.method : '') || 'GET').toUpperCase();
}

function buildFetchHeaders(input, init) {
    if (init?.headers) {
        return new Headers(init.headers);
    }

    if (isFetchRequest(input)) {
        return new Headers(input.headers);
    }

    return new Headers();
}

function copyFetchRequestOptions(input, init) {
    const requestOptions = {};
    if (!isFetchRequest(input)) {
        return requestOptions;
    }

    const optionKeys = [
        'cache',
        'credentials',
        'integrity',
        'keepalive',
        'mode',
        'redirect',
        'referrer',
        'referrerPolicy',
        'signal',
    ];

    for (const key of optionKeys) {
        if (init && Object.prototype.hasOwnProperty.call(init, key)) {
            continue;
        }

        const value = input[key];
        if (value !== undefined) {
            requestOptions[key] = value;
        }
    }

    return requestOptions;
}

function normalizeFetchBody(body) {
    if (body == null) {
        return null;
    }

    if (typeof body === 'string') {
        return body.length > 0 ? { body, contentType: 'text/plain;charset=UTF-8' } : null;
    }

    if (isFetchBlob(body)) {
        return body.size > 0 ? { body, contentType: body.type || '' } : null;
    }

    if (typeof ArrayBuffer !== 'undefined' && body instanceof ArrayBuffer) {
        return body.byteLength > 0 ? { body, contentType: '' } : null;
    }

    if (typeof ArrayBuffer !== 'undefined' && ArrayBuffer.isView(body)) {
        return body.byteLength > 0 ? { body, contentType: '' } : null;
    }

    if (isFetchUrlSearchParams(body)) {
        const text = body.toString();
        return text.length > 0 ? { body: text, contentType: 'application/x-www-form-urlencoded;charset=UTF-8' } : null;
    }

    if (isFetchFormData(body) || isFetchReadableStream(body)) {
        return null;
    }

    return null;
}

async function getCompressibleFetchBody(input, init) {
    if (Object.prototype.hasOwnProperty.call(init || {}, 'body')) {
        return normalizeFetchBody(init.body);
    }

    if (!isFetchRequest(input) || input.bodyUsed || !input.body) {
        return null;
    }

    const bodyBlob = await input.clone().blob();
    return bodyBlob.size > 0 ? { body: bodyBlob, contentType: bodyBlob.type || '' } : null;
}

async function gzipFetchBody(body, traceInfo = {}) {
    if (typeof CompressionStream !== 'function') {
        return null;
    }

    const source = isFetchBlob(body) ? body : new Blob([body]);
    const startedAt = performance.now();

    try {
        const compressedStream = source.stream().pipeThrough(new CompressionStream('gzip'));
        const compressedBlob = await new Response(compressedStream).blob();
        recordPerformanceTraceGzipCompression({
            ...traceInfo,
            startedAt,
            duration: performance.now() - startedAt,
            originalBytes: source.size,
            compressedBytes: compressedBlob.size,
        });

        return compressedBlob.size > 0 ? compressedBlob : null;
    } catch (error) {
        recordPerformanceTraceGzipCompression({
            ...traceInfo,
            startedAt,
            duration: performance.now() - startedAt,
            originalBytes: source.size,
            compressedBytes: 0,
            caller: `${traceInfo?.caller || ''} error=${error?.message || error}`,
        });
        throw error;
    }
}

function buildUncompressedSaveRequestRetry(input, init, method, originalHeaders, bodyInfo) {
    const headers = new Headers(originalHeaders);
    headers.delete('Content-Encoding');
    headers.delete('Content-Length');

    if (bodyInfo.contentType && !headers.has('Content-Type')) {
        headers.set('Content-Type', bodyInfo.contentType);
    }

    return {
        input: isFetchRequest(input) ? input.url : input,
        init: {
            ...copyFetchRequestOptions(input, init),
            ...(init || {}),
            method,
            headers,
            body: bodyInfo.body,
        },
    };
}

function isFetchRequest(value) {
    return typeof Request !== 'undefined' && value instanceof Request;
}

function isFetchBlob(value) {
    return typeof Blob !== 'undefined' && value instanceof Blob;
}

function isFetchUrlSearchParams(value) {
    return typeof URLSearchParams !== 'undefined' && value instanceof URLSearchParams;
}

function isFetchFormData(value) {
    return typeof FormData !== 'undefined' && value instanceof FormData;
}

function isFetchReadableStream(value) {
    return typeof ReadableStream !== 'undefined' && value instanceof ReadableStream;
}

function isLocalOrPrivateHost(hostname) {
    const host = normalizeHostname(hostname);

    if (!host) {
        return false;
    }

    if (host === 'localhost' || host.endsWith('.localhost')) {
        return true;
    }

    const ipv4Parts = parseIpv4Address(host);
    if (ipv4Parts) {
        return isLocalOrPrivateIpv4(ipv4Parts);
    }

    return isLocalOrPrivateIpv6(host);
}

function normalizeHostname(hostname) {
    return String(hostname || '')
        .trim()
        .toLowerCase()
        .replace(/^\[|\]$/g, '')
        .replace(/\.+$/g, '');
}

function parseIpv4Address(host) {
    const parts = host.split('.');

    if (parts.length !== 4) {
        return null;
    }

    const octets = [];
    for (const part of parts) {
        if (!/^\d{1,3}$/.test(part)) {
            return null;
        }

        const value = Number(part);
        if (!Number.isInteger(value) || value < 0 || value > 255) {
            return null;
        }

        octets.push(value);
    }

    return octets;
}

function isLocalOrPrivateIpv4([first, second]) {
    return first === 0
        || first === 10
        || first === 127
        || (first === 169 && second === 254)
        || (first === 172 && second >= 16 && second <= 31)
        || (first === 192 && second === 168);
}

function isLocalOrPrivateIpv6(host) {
    if (!host.includes(':')) {
        return false;
    }

    if (host === '::1' || host === '0:0:0:0:0:0:0:1') {
        return true;
    }

    if (host.startsWith('::ffff:')) {
        const ipv4Parts = parseIpv4Address(host.slice(7));
        return ipv4Parts ? isLocalOrPrivateIpv4(ipv4Parts) : false;
    }

    const firstGroup = host.split(':')[0];
    if (!/^[0-9a-f]{1,4}$/.test(firstGroup)) {
        return false;
    }

    const firstValue = parseInt(firstGroup, 16);
    return (firstValue & 0xfe00) === 0xfc00
        || (firstValue & 0xffc0) === 0xfe80;
}

export {
    buildFetchHeaders,
    buildUncompressedSaveRequestRetry,
    copyFetchRequestOptions,
    getCompressibleFetchBody,
    getFetchRequestMethod,
    getFetchRequestUrl,
    getSaveRequestGzipUrl,
    gzipFetchBody,
    installSaveRequestGzipFetchHook,
    isFetchBlob,
    isFetchFormData,
    isFetchReadableStream,
    isFetchRequest,
    isFetchUrlSearchParams,
    isLocalOrPrivateHost,
    isLocalOrPrivateIpv4,
    isLocalOrPrivateIpv6,
    normalizeFetchBody,
    normalizeHostname,
    parseIpv4Address,
};
