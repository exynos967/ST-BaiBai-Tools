import { getRequestHeaders } from '@sillytavern/script';
import { timestampToMoment } from '@sillytavern/scripts/utils';
import { BAIBAOKU_FAST_CHAT_BACKUPS_LIST_URL, BAIBAOKU_FAST_SEARCH_URL, CHAT_BACKUP_ITEM_INTRINSIC_FALLBACK_PX, CHAT_BACKUP_ITEM_INTRINSIC_SIZE_VAR, CHAT_BACKUP_ITEM_SELECTOR, CHAT_BACKUP_LIST_SELECTOR, CHAT_MANAGEMENT_LIST_SELECTOR, CHAT_MANAGEMENT_POPUP_SELECTOR, FAST_CHAT_BACKUPS_FETCH_KEY, FAST_CHAT_LIST_SCROLL_STYLE_ID, FAST_CHAT_SEARCH_FETCH_KEY, NATIVE_CHAT_BACKUPS_LIST_URL } from './constants.js';
import { LOG_PREFIX, extensionState, settings } from './state.js';
let fastChatListRequestId = 0;

function applyFastChatListScrollOptimization() {
    const existingStyle = document.getElementById(FAST_CHAT_LIST_SCROLL_STYLE_ID);

    if (!settings.chatListScrollOptimizationEnabled) {
        existingStyle?.remove();
        clearChatBackupItemIntrinsicHeightMeasurement();
        return;
    }

    if (!existingStyle) {
        const style = document.createElement('style');
        style.id = FAST_CHAT_LIST_SCROLL_STYLE_ID;
        style.textContent = `
${CHAT_MANAGEMENT_POPUP_SELECTOR} ${CHAT_MANAGEMENT_LIST_SELECTOR} > .select_chat_block_wrapper {
    content-visibility: auto;
    contain: layout paint style;
    contain-intrinsic-size: 72px;
}

${CHAT_MANAGEMENT_POPUP_SELECTOR} ${CHAT_BACKUP_LIST_SELECTOR} > ${CHAT_BACKUP_ITEM_SELECTOR} {
    content-visibility: auto;
    contain: layout paint style;
    contain-intrinsic-size: auto var(${CHAT_BACKUP_ITEM_INTRINSIC_SIZE_VAR}, ${CHAT_BACKUP_ITEM_INTRINSIC_FALLBACK_PX}px);
}
`;
        document.head.append(style);
    }

    const popup = document.querySelector(CHAT_MANAGEMENT_POPUP_SELECTOR);
    if (popup) {
        observeChatBackupListIntrinsicHeight(popup);
    }
}

function observeChatBackupListIntrinsicHeight(popup) {
    if (!(popup instanceof Element)) {
        return false;
    }

    const list = popup.querySelector(CHAT_BACKUP_LIST_SELECTOR);
    if (list instanceof HTMLElement) {
        extensionState.chatBackupListAttachObserver?.disconnect();
        extensionState.chatBackupListAttachObserver = null;

        if (extensionState.chatBackupListObserverTarget !== list) {
            extensionState.chatBackupListMutationObserver?.disconnect();
            extensionState.chatBackupListResizeObserver?.disconnect();

            extensionState.chatBackupListObserverTarget = list;
            extensionState.chatBackupListMutationObserver = new MutationObserver(() => {
                scheduleChatBackupItemIntrinsicHeightMeasurement(popup);
            });
            extensionState.chatBackupListMutationObserver.observe(list, {
                childList: true,
            });

            extensionState.chatBackupListResizeObserver = typeof ResizeObserver === 'function'
                ? new ResizeObserver(() => {
                    scheduleChatBackupItemIntrinsicHeightMeasurement(popup);
                })
                : null;
            extensionState.chatBackupListResizeObserver?.observe(list);
        }

        scheduleChatBackupItemIntrinsicHeightMeasurement(popup);
        return true;
    }

    if (extensionState.chatBackupListAttachObserver) {
        return false;
    }

    const attachObserver = new MutationObserver(() => {
        if (observeChatBackupListIntrinsicHeight(popup)) {
            attachObserver.disconnect();
            if (extensionState.chatBackupListAttachObserver === attachObserver) {
                extensionState.chatBackupListAttachObserver = null;
            }
        }
    });
    attachObserver.observe(popup, {
        childList: true,
        subtree: true,
    });
    extensionState.chatBackupListAttachObserver = attachObserver;
    return false;
}

function scheduleChatBackupItemIntrinsicHeightMeasurement(popup) {
    if (!settings.chatListScrollOptimizationEnabled || !(popup instanceof Element)) {
        return;
    }

    if (extensionState.chatBackupItemMeasureFrame !== undefined
        && extensionState.chatBackupItemMeasureFrame !== null) {
        return;
    }

    extensionState.chatBackupItemMeasureFrame = requestAnimationFrame(() => {
        extensionState.chatBackupItemMeasureFrame = null;
        measureChatBackupItemIntrinsicHeight(popup);
    });
}

function measureChatBackupItemIntrinsicHeight(popup) {
    const list = popup.querySelector(CHAT_BACKUP_LIST_SELECTOR);
    if (!(list instanceof HTMLElement)) {
        return;
    }

    if (!list.classList.contains('open')) {
        return;
    }

    const listRect = list.getBoundingClientRect();
    const item = list.firstElementChild;

    if (!(item instanceof HTMLElement) || !item.matches(CHAT_BACKUP_ITEM_SELECTOR)) {
        return;
    }

    const itemRect = item.getBoundingClientRect();
    if (itemRect.height <= 0 || itemRect.bottom <= listRect.top || itemRect.top >= listRect.bottom) {
        return;
    }

    const measuredHeight = Math.ceil(itemRect.height);
    if (!Number.isFinite(measuredHeight) || measuredHeight <= 0) {
        return;
    }

    const previousHeight = Number(list.dataset.baiBaiToolkitBackupItemHeight || 0);
    if (previousHeight === measuredHeight) {
        return;
    }

    list.dataset.baiBaiToolkitBackupItemHeight = String(measuredHeight);
    list.style.setProperty(CHAT_BACKUP_ITEM_INTRINSIC_SIZE_VAR, `${measuredHeight}px`);
}

function clearChatBackupItemIntrinsicHeightMeasurement() {
    if (extensionState.chatBackupItemMeasureFrame !== undefined
        && extensionState.chatBackupItemMeasureFrame !== null) {
        cancelAnimationFrame(extensionState.chatBackupItemMeasureFrame);
    }

    extensionState.chatBackupItemMeasureFrame = null;
    extensionState.chatBackupListAttachObserver?.disconnect();
    extensionState.chatBackupListAttachObserver = null;
    extensionState.chatBackupListMutationObserver?.disconnect();
    extensionState.chatBackupListMutationObserver = null;
    extensionState.chatBackupListResizeObserver?.disconnect();
    extensionState.chatBackupListResizeObserver = null;
    extensionState.chatBackupListObserverTarget = null;
}

function observeChatManagementPopupCleanup() {
    if (extensionState.chatManagementPopupObserver) {
        return true;
    }

    const popup = document.querySelector(CHAT_MANAGEMENT_POPUP_SELECTOR);
    if (!popup) {
        return false;
    }

    let wasVisible = isElementDisplayed(popup);
    const observer = new MutationObserver(() => {
        const isVisible = isElementDisplayed(popup);

        if (wasVisible && !isVisible) {
            clearChatManagementPopupContent(popup);
        }

        if (!wasVisible && isVisible) {
            scheduleChatBackupItemIntrinsicHeightMeasurement(popup);
        }
        wasVisible = isVisible;
    });

    observer.observe(popup, {
        attributes: true,
        attributeFilter: ['style', 'class'],
    });

    observeChatBackupListIntrinsicHeight(popup);
    extensionState.chatManagementPopupObserver = observer;
    return true;
}

function isElementDisplayed(element) {
    return getComputedStyle(element).display !== 'none';
}

function clearChatManagementPopupContent(popup) {
    if (!settings.chatListAutoClearEnabled) {
        return;
    }

    fastChatListRequestId += 1;

    const list = popup.querySelector(CHAT_MANAGEMENT_LIST_SELECTOR);

    if (!list || !list.children.length) {
        return;
    }

    list.replaceChildren();
}

function patchFastChatSearchFetch() {
    const originalFetch = globalThis.fetch;

    if (typeof originalFetch !== 'function' || originalFetch[FAST_CHAT_SEARCH_FETCH_KEY]) {
        return;
    }

    async function baiBaiToolkitFetch(input, init) {
        const requestData = await getFastChatSearchRequestData(input, init);

        if (requestData) {
            try {
                return await fetchFastSearchList(originalFetch, requestData);
            } catch (error) {
                console.debug(`${LOG_PREFIX} Backend fast-search path failed; trying legacy fast path`, error);

                // The legacy fast path only covers character chats. Group chats fall
                // straight back to the original /api/chats/search below.
                if (requestData.avatarUrl) {
                    try {
                        return await fetchFastCharacterChatList(originalFetch, { avatarUrl: requestData.avatarUrl });
                    } catch (legacyError) {
                        console.debug(`${LOG_PREFIX} Legacy fast chat list path failed; falling back to /api/chats/search`, legacyError);
                    }
                }
            }
        }

        return originalFetch.apply(this, arguments);
    }

    baiBaiToolkitFetch[FAST_CHAT_SEARCH_FETCH_KEY] = true;
    baiBaiToolkitFetch.__baiBaiToolkitOriginalFetch = originalFetch;
    globalThis.fetch = baiBaiToolkitFetch;
}

function patchFastChatBackupsFetch() {
    const originalFetch = globalThis.fetch;

    if (typeof originalFetch !== 'function' || originalFetch[FAST_CHAT_BACKUPS_FETCH_KEY]) {
        return;
    }

    async function baiBaiToolkitChatBackupsFetch(input, init) {
        if (isChatBackupsListRequest(input, init)) {
            observeChatManagementPopupCleanup();
            try {
                return await fetchFastChatBackupsList(originalFetch, input, init);
            } catch (error) {
                if (error?.name === 'AbortError') {
                    throw error;
                }
                console.debug(`${LOG_PREFIX} Fast chat backup list failed; falling back to native endpoint`, error);
            }
        }

        return originalFetch.apply(this, arguments);
    }

    baiBaiToolkitChatBackupsFetch[FAST_CHAT_BACKUPS_FETCH_KEY] = true;
    baiBaiToolkitChatBackupsFetch.__baiBaiToolkitOriginalFetch = originalFetch;
    globalThis.fetch = baiBaiToolkitChatBackupsFetch;
}

function isChatBackupsListRequest(input, init) {
    try {
        const rawUrl = input instanceof Request ? input.url : String(input);
        const url = new URL(rawUrl, location.origin);
        const method = String(init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
        return method === 'POST'
            && url.origin === location.origin
            && url.pathname === NATIVE_CHAT_BACKUPS_LIST_URL;
    } catch {
        return false;
    }
}

async function fetchFastChatBackupsList(fetchFn, input, init) {
    const signal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
    const response = await fetchFn(BAIBAOKU_FAST_CHAT_BACKUPS_LIST_URL, {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({}),
        signal,
    });

    if (!response.ok) {
        throw new Error(`Unexpected status ${response.status}`);
    }

    return response;
}

async function getFastChatSearchRequestData(input, init) {
    if (!settings.fastChatListEnabled) {
        return null;
    }

    if (!isChatSearchUrl(input)) {
        return null;
    }

    const method = String(init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();

    if (method !== 'POST') {
        return null;
    }

    const body = await readJsonRequestBody(input, init);

    if (!body || typeof body !== 'object') {
        return null;
    }

    const query = String(body.query ?? '');
    const avatarUrl = body.avatar_url;
    const groupId = body.group_id;

    if (query.trim().length !== 0) {
        return null;
    }

    const hasAvatar = typeof avatarUrl === 'string' && avatarUrl.length > 0;
    const hasGroup = typeof groupId === 'string' && groupId.length > 0;

    if (!hasAvatar && !hasGroup) {
        return null;
    }

    return {
        avatarUrl: hasAvatar ? avatarUrl : undefined,
        groupId: hasGroup ? groupId : undefined,
    };
}

function isChatSearchUrl(input) {
    try {
        const rawUrl = input instanceof Request ? input.url : String(input);
        const url = new URL(rawUrl, location.origin);
        return url.origin === location.origin && url.pathname === '/api/chats/search';
    } catch {
        return false;
    }
}

async function readJsonRequestBody(input, init) {
    const initBody = init?.body;

    if (typeof initBody === 'string') {
        return tryParseJson(initBody);
    }

    if (input instanceof Request) {
        try {
            return await input.clone().json().catch(() => null);
        } catch {
            return null;
        }
    }

    return null;
}

async function fetchFastSearchList(fetchFn, { avatarUrl, groupId }) {
    const requestBody = { query: '' };

    if (groupId) {
        requestBody.group_id = groupId;
    } else {
        requestBody.avatar_url = avatarUrl;
    }

    const response = await fetchFn(BAIBAOKU_FAST_SEARCH_URL, {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
        throw new Error(`Unexpected status ${response.status}`);
    }

    const results = await response.json();

    if (!Array.isArray(results)) {
        throw new Error('fast-search returned a non-array payload');
    }

    // Backend fast-search returns the complete payload in one shot, matching ST's
    // /api/chats/search response shape, so no placeholder/hydrate pass is needed.
    // ST sorts the results itself (see script.js search consumer), so return as-is.
    return new Response(JSON.stringify(results), {
        status: 200,
        headers: {
            'Content-Type': 'application/json',
        },
    });
}

async function fetchFastCharacterChatList(fetchFn, { avatarUrl }) {
    const response = await fetchFn('/api/characters/chats', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({ avatar_url: avatarUrl, simple: true }),
    });

    if (!response.ok) {
        throw new Error(`Unexpected status ${response.status}`);
    }

    const chats = await response.json();
    const searchResults = Array.isArray(chats) ? chats.map(toPlaceholderChatSearchResult).filter(Boolean) : [];
    searchResults.sort((a, b) => getTimestampValue(b.last_mes) - getTimestampValue(a.last_mes));
    const requestId = ++fastChatListRequestId;

    setTimeout(() => {
        markFastChatRowsAsLoading(searchResults, requestId);
        void hydrateFastCharacterChatList(fetchFn, avatarUrl, requestId);
    }, 0);

    return new Response(JSON.stringify(searchResults), {
        status: 200,
        headers: {
            'Content-Type': 'application/json',
        },
    });
}

async function hydrateFastCharacterChatList(fetchFn, avatarUrl, requestId) {
    if (!isCurrentFastChatListRequest(requestId)) {
        return;
    }

    try {
        const chats = await fetchFullCharacterChatList(fetchFn, avatarUrl);
        applyHydratedChatRows(chats, requestId);
    } catch (error) {
        console.debug(`${LOG_PREFIX} Failed to hydrate full chat list metadata`, error);
    }
}

async function fetchFullCharacterChatList(fetchFn, avatarUrl) {
    const response = await fetchFn('/api/characters/chats', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({ avatar_url: avatarUrl }),
    });

    if (!response.ok) {
        throw new Error(`Unexpected status ${response.status}`);
    }

    const chats = await response.json();
    return Array.isArray(chats) ? chats.map(toChatSearchResult).filter(Boolean) : [];
}

function markFastChatRowsAsLoading(chats, requestId) {
    if (!isCurrentFastChatListRequest(requestId)) {
        return;
    }

    for (const chat of chats) {
        const row = findChatListRow(chat.file_name);

        if (!row.length) {
            continue;
        }

        row.find('.chat_file_size').text('(...,');
        row.find('.chat_messages_num').text('... 💬)');
    }
}

function applyHydratedChatRow(chat, requestId) {
    if (!isCurrentFastChatListRequest(requestId)) {
        return;
    }

    const row = findChatListRow(chat.file_name);

    if (!row.length) {
        return;
    }

    row.find('.chat_file_size').text(`(${chat.file_size},`);
    row.find('.chat_messages_num').text(`${chat.message_count} 💬)`);
    row.find('.select_chat_block_mes').text(chat.preview_message);
    row.find('.chat_messages_date').text(timestampToMoment(chat.last_mes).format('lll'));
}

function applyHydratedChatRows(chats, requestId) {
    if (!isCurrentFastChatListRequest(requestId)) {
        return;
    }

    const order = new Map();

    chats.forEach((chat, index) => {
        applyHydratedChatRow(chat, requestId);
        order.set(chat.file_name, {
            index,
            time: getTimestampValue(chat.last_mes),
        });
    });

    sortHydratedChatRows(order);
}

function sortHydratedChatRows(order) {
    const container = $('#select_chat_div');
    const rows = container.children('.select_chat_block_wrapper').get();

    rows.sort((left, right) => {
        const leftName = $(left).find('.select_chat_block').attr('file_name');
        const rightName = $(right).find('.select_chat_block').attr('file_name');
        const leftOrder = order.get(leftName) ?? { time: 0, index: Number.MAX_SAFE_INTEGER };
        const rightOrder = order.get(rightName) ?? { time: 0, index: Number.MAX_SAFE_INTEGER };

        return rightOrder.time - leftOrder.time || leftOrder.index - rightOrder.index;
    });

    container.append(rows);
}

function findChatListRow(fileName) {
    return $('#select_chat_div .select_chat_block')
        .filter((_, element) => $(element).attr('file_name') === fileName)
        .closest('.select_chat_block_wrapper');
}

function isCurrentFastChatListRequest(requestId) {
    return requestId === fastChatListRequestId && String($('#select_chat_search').val() ?? '').trim().length === 0;
}

function toPlaceholderChatSearchResult(chat) {
    if (!chat || typeof chat !== 'object') {
        return null;
    }

    const fileName = getChatSearchFileName(chat);

    if (!fileName) {
        return null;
    }

    return {
        file_name: fileName,
        file_size: '...',
        message_count: '...',
        last_mes: guessLastMesFromFileName(fileName),
        preview_message: '',
    };
}

function toChatSearchResult(chat) {
    if (!chat || typeof chat !== 'object') {
        return null;
    }

    const fileName = getChatSearchFileName(chat);

    if (!fileName) {
        return null;
    }

    const messageCount = Number(chat.chat_items);

    return {
        file_name: fileName,
        file_size: chat.file_size ?? '',
        message_count: Number.isFinite(messageCount) ? messageCount : 0,
        last_mes: normalizeLastMes(chat.last_mes),
        preview_message: getPreviewMessage(chat.mes),
    };
}

function getChatSearchFileName(chat) {
    const value = typeof chat.file_id === 'string' && chat.file_id
        ? chat.file_id
        : chat.file_name;

    if (typeof value !== 'string') {
        return '';
    }

    return value.replace(/\.jsonl$/i, '');
}

function guessLastMesFromFileName(fileName) {
    const text = String(fileName).replace(/\.jsonl$/i, '');
    const match = text.match(/(\d{4})-(\d{1,2})-(\d{1,2})(?:\s*@|@|\s+)?(\d{1,2})h\s*(\d{1,2})m(?:\s*(\d{1,2})s)?(?:\s*(\d{1,3})ms)?/i);

    if (match) {
        const [, year, month, day, hour, minute, second = '0', millisecond = '0'] = match;
        const date = new Date(
            Number(year),
            Number(month) - 1,
            Number(day),
            Number(hour),
            Number(minute),
            Number(second),
            Number(millisecond),
        );

        if (!Number.isNaN(date.getTime())) {
            return date.toISOString();
        }
    }

    return new Date().toISOString();
}

function normalizeLastMes(value) {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return new Date(value).toISOString();
    }

    return value;
}

function getTimestampValue(value) {
    const timestamp = timestampToMoment(value).valueOf();
    return Number.isFinite(timestamp) ? timestamp : 0;
}

function getPreviewMessage(message) {
    const strlen = 400;

    if (typeof message !== 'string' || message === '[The chat is empty]' || message === '[The message is empty]') {
        return '';
    }

    return message.length > strlen
        ? '...' + message.substring(message.length - strlen)
        : message;
}

function tryParseJson(value) {
    try {
        return JSON.parse(value);
    } catch {
        return null;
    }
}

export {
    applyFastChatListScrollOptimization,
    applyHydratedChatRow,
    applyHydratedChatRows,
    clearChatBackupItemIntrinsicHeightMeasurement,
    clearChatManagementPopupContent,
    fastChatListRequestId,
    fetchFastCharacterChatList,
    fetchFastChatBackupsList,
    fetchFastSearchList,
    fetchFullCharacterChatList,
    findChatListRow,
    getChatSearchFileName,
    getFastChatSearchRequestData,
    getPreviewMessage,
    getTimestampValue,
    guessLastMesFromFileName,
    hydrateFastCharacterChatList,
    isChatBackupsListRequest,
    isChatSearchUrl,
    isCurrentFastChatListRequest,
    isElementDisplayed,
    markFastChatRowsAsLoading,
    measureChatBackupItemIntrinsicHeight,
    normalizeLastMes,
    observeChatBackupListIntrinsicHeight,
    observeChatManagementPopupCleanup,
    patchFastChatBackupsFetch,
    patchFastChatSearchFetch,
    readJsonRequestBody,
    scheduleChatBackupItemIntrinsicHeightMeasurement,
    sortHydratedChatRows,
    toChatSearchResult,
    toPlaceholderChatSearchResult,
    tryParseJson,
};
