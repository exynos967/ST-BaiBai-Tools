import { isFetchBlob, isFetchRequest } from './gzipHook.js';

function areStringArraysEqual(left, right) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
        return false;
    }

    return left.every((value, index) => value === right[index]);
}

function toKebabCase(value) {
    return String(value).replace(/[A-Z]/g, match => `-${match.toLowerCase()}`);
}

async function readFetchJsonBody(input, init) {
    if (Object.prototype.hasOwnProperty.call(init || {}, 'body')) {
        const body = init.body;
        if (typeof body === 'string') {
            return parseJsonOrNull(body);
        }

        if (isFetchBlob(body)) {
            return parseJsonOrNull(await body.text());
        }
    }

    if (!isFetchRequest(input) || input.bodyUsed || !input.body) {
        return null;
    }

    try {
        return await input.clone().json().catch(() => null);
    } catch {
        return null;
    }
}

function hasFetchBody(input, init) {
    if (Object.prototype.hasOwnProperty.call(init || {}, 'body')) {
        const body = init.body;
        return body !== undefined && body !== null && body !== '';
    }

    return isFetchRequest(input) && Boolean(input.body);
}

function parseJsonOrNull(text) {
    try {
        return JSON.parse(text);
    } catch {
        return null;
    }
}

function isPlainEmptyObject(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return false;
    }

    return Object.getPrototypeOf(value) === Object.prototype && Object.keys(value).length === 0;
}

export {
    areStringArraysEqual,
    hasFetchBody,
    isPlainEmptyObject,
    parseJsonOrNull,
    readFetchJsonBody,
    toKebabCase,
};
