import { event_types, eventSource } from '@sillytavern/script';
import { LONG_CHAT_DOM_RENDER_SCROLL_BOTTOM_SETTLE_MS, LONG_CHAT_DOM_RENDER_SCROLL_BOTTOM_STABLE_FRAMES, LONG_CHAT_DOM_RENDER_SCROLL_BOTTOM_TOLERANCE, MESSAGE_COMPLETION_SCROLL_HANDLER_KEY } from './constants.js';
import { applyLongChatDomRenderOptimizationStyle, ensureLongChatDomRenderBottomAnchor, getLongChatDomRenderLatestMessageElement, getLongChatDomRenderLatestMessageStartScrollTop, isLongChatDomRenderAtBottom, removeLongChatDomRenderBottomAnchor } from './longChatRender.js';
import { extensionState, settings } from './state.js';
import { isWelcomePageDisplayed } from './welcomeRecent.js';

function applyMessageCompletionScrollToMiddle() {
    if (settings.messageCompletionScrollToMiddleEnabled === false) {
        removeMessageCompletionScrollToMiddle();
        return;
    }

    installMessageCompletionScrollToMiddle();
}

function getMessageCompletionScrollState() {
    if (!extensionState[MESSAGE_COMPLETION_SCROLL_HANDLER_KEY] || typeof extensionState[MESSAGE_COMPLETION_SCROLL_HANDLER_KEY] !== 'object') {
        extensionState[MESSAGE_COMPLETION_SCROLL_HANDLER_KEY] = {};
    }

    const state = extensionState[MESSAGE_COMPLETION_SCROLL_HANDLER_KEY];
    if (!Array.isArray(state.eventHandlers)) {
        state.eventHandlers = [];
    }
    if (!Array.isArray(state.timers)) {
        state.timers = [];
    }

    return state;
}

function installMessageCompletionScrollToMiddle() {
    const state = getMessageCompletionScrollState();
    if (state.installed || typeof eventSource?.on !== 'function') {
        ensureMessageCompletionScrollChatListener(state);
        return;
    }

    applyLongChatDomRenderOptimizationStyle();

    const generationStartedHandler = () => {
        handleMessageCompletionScrollGenerationStarted(state);
    };
    const generationEndedHandler = (reason = 'generation-ended') => {
        handleMessageCompletionScrollGenerationEnded(state, reason);
    };
    const messageRenderedHandler = () => {
        updateMessageCompletionScrollBottomAnchor(state, 'message-rendered');
    };

    addMessageCompletionScrollEventHandler(event_types.GENERATION_STARTED, generationStartedHandler);
    addMessageCompletionScrollEventHandler(event_types.USER_MESSAGE_RENDERED, messageRenderedHandler);
    addMessageCompletionScrollEventHandler(event_types.CHARACTER_MESSAGE_RENDERED, messageRenderedHandler);
    addMessageCompletionScrollEventHandler(event_types.GENERATION_STOPPED, () => generationEndedHandler('generation-stopped'));
    addMessageCompletionScrollEventHandler(event_types.GENERATION_ENDED, () => generationEndedHandler('generation-ended'));

    state.installed = true;
    ensureMessageCompletionScrollChatListener(state);
}

function addMessageCompletionScrollEventHandler(event, handler) {
    if (!event || typeof handler !== 'function' || typeof eventSource?.on !== 'function') {
        return;
    }

    const state = getMessageCompletionScrollState();
    eventSource.on(event, handler);
    state.eventHandlers.push({ event, handler });
}

function removeMessageCompletionScrollToMiddle() {
    const state = getMessageCompletionScrollState();
    for (const entry of state.eventHandlers || []) {
        eventSource.removeListener?.(entry.event, entry.handler);
    }

    state.eventHandlers = [];
    state.installed = false;
    state.generationActive = false;
    state.shouldScroll = false;
    state.userInteracted = false;
    clearTimeout(state.anchorTimer);
    state.anchorTimer = null;
    clearMessageCompletionScrollTimers(state);
    finishMessageCompletionScrollSettle(state);
    removeLongChatDomRenderBottomAnchor(state);
    detachMessageCompletionScrollChatListener(state);
}

function handleMessageCompletionScrollGenerationStarted(state = getMessageCompletionScrollState()) {
    if (settings.messageCompletionScrollToMiddleEnabled === false) {
        return;
    }

    ensureMessageCompletionScrollChatListener(state);
    const chat = document.querySelector('#chat');
    state.generationToken = Number(state.generationToken || 0) + 1;
    state.scrolledToken = 0;
    state.generationActive = true;
    state.userInteracted = false;
    state.shouldScroll = chat instanceof HTMLElement
        && !isWelcomePageDisplayed(chat)
        && isLongChatDomRenderAtBottom(chat);

    if (state.shouldScroll) {
        updateMessageCompletionScrollBottomAnchor(state, 'generation-started');
    }
}

function handleMessageCompletionScrollGenerationEnded(state = getMessageCompletionScrollState(), reason = 'generation-ended') {
    if (settings.messageCompletionScrollToMiddleEnabled === false || state.scrolledToken === state.generationToken) {
        state.generationActive = false;
        return;
    }

    const chat = document.querySelector('#chat');
    // 生成结束后无条件定位一次:不再要求「开始时在底部」或「结束时在底部」。
    // iOS 上这些底部判定经常因平滑滚动/地址栏伸缩/子像素抖动而落空,导致定位时常不触发。
    // 仍保留的前置条件:用户在生成期间手动翻看了别处(userInteracted)、当前不是欢迎页、聊天容器存在。
    const shouldScroll = Boolean(
        !state.userInteracted
        && chat instanceof HTMLElement
        && !isWelcomePageDisplayed(chat),
    );
    state.generationActive = false;
    state.shouldScroll = false;
    state.scrolledToken = state.generationToken;
    clearTimeout(state.anchorTimer);
    state.anchorTimer = null;

    if (shouldScroll) {
        scheduleMessageCompletionScrollToMiddle(state, reason);
    } else {
        removeLongChatDomRenderBottomAnchor(state);
    }
}

function updateMessageCompletionScrollBottomAnchor(state = getMessageCompletionScrollState(), reason = '') {
    if (!state.generationActive
        || !state.shouldScroll
        || state.userInteracted
        || settings.messageCompletionScrollToMiddleEnabled === false) {
        removeLongChatDomRenderBottomAnchor(state);
        return;
    }

    const chat = document.querySelector('#chat');
    if (!(chat instanceof HTMLElement) || isWelcomePageDisplayed(chat)) {
        return;
    }

    ensureLongChatDomRenderBottomAnchor(chat, state);
    clearTimeout(state.anchorTimer);
    state.anchorTimer = setTimeout(() => {
        state.anchorTimer = null;
        updateMessageCompletionScrollBottomAnchor(state, reason);
    }, 120);
}

function ensureMessageCompletionScrollChatListener(state = getMessageCompletionScrollState()) {
    const chat = document.querySelector('#chat');
    if (!(chat instanceof HTMLElement)) {
        detachMessageCompletionScrollChatListener(state);
        return;
    }

    if (state.chatElement === chat && state.userInteractionHandler) {
        return;
    }

    detachMessageCompletionScrollChatListener(state);
    state.chatElement = chat;
    state.userInteractionHandler = () => {
        // settle 阶段(生成已结束、脚本仍在每帧强制写 scrollTop)也要能被用户打断,
        // 否则 iOS 上脚本会和手指/惯性滚动抢 scrollTop,表现为定位时灵时不灵、猛地回弹,
        // 甚至被顶到顶部触发下拉刷新。
        if (!state.generationActive && !state.scrollSettling) {
            return;
        }
        state.userInteracted = true;
    };
    chat.addEventListener('wheel', state.userInteractionHandler, { passive: true });
    chat.addEventListener('touchstart', state.userInteractionHandler, { passive: true });
    chat.addEventListener('pointerdown', state.userInteractionHandler, { passive: true });
}

function detachMessageCompletionScrollChatListener(state = getMessageCompletionScrollState()) {
    if (state.chatElement instanceof HTMLElement && state.userInteractionHandler) {
        state.chatElement.removeEventListener('wheel', state.userInteractionHandler);
        state.chatElement.removeEventListener('touchstart', state.userInteractionHandler);
        state.chatElement.removeEventListener('pointerdown', state.userInteractionHandler);
    }
    state.chatElement = null;
    state.userInteractionHandler = null;
}

function scheduleMessageCompletionScrollToMiddle(state = getMessageCompletionScrollState(), reason = '') {
    clearMessageCompletionScrollTimers(state);
    const token = Number(state.generationToken || 0);
    state.scrollStartedAt = performance.now();
    state.lastScrollHeight = 0;
    state.lastTargetTop = null;
    state.stableFrames = 0;
    // 进入 settle:标记滚动进行中(让用户触摸能打断),并临时锁住 iOS 的 overscroll 链,
    // 防止脚本强制写 scrollTop 把页面顶到顶部冒泡触发下拉刷新。
    state.scrollSettling = true;
    ensureMessageCompletionScrollOverscrollGuard(state);

    settleMessageCompletionScrollToLatestMessageStart(state, token, reason);
}

function finishMessageCompletionScrollSettle(state = getMessageCompletionScrollState()) {
    state.scrollSettling = false;
    releaseMessageCompletionScrollOverscrollGuard(state);
}

function ensureMessageCompletionScrollOverscrollGuard(state = getMessageCompletionScrollState()) {
    const chat = state.chatElement instanceof HTMLElement
        ? state.chatElement
        : document.querySelector('#chat');
    if (!(chat instanceof HTMLElement) || state.overscrollGuardElement === chat) {
        return;
    }

    state.overscrollGuardElement = chat;
    state.overscrollGuardPrevious = chat.style.overscrollBehavior || '';
    chat.style.overscrollBehavior = 'contain';
}

function releaseMessageCompletionScrollOverscrollGuard(state = getMessageCompletionScrollState()) {
    const chat = state.overscrollGuardElement;
    if (chat instanceof HTMLElement) {
        chat.style.overscrollBehavior = state.overscrollGuardPrevious || '';
    }
    state.overscrollGuardElement = null;
    state.overscrollGuardPrevious = '';
}

function clearMessageCompletionScrollTimers(state = getMessageCompletionScrollState()) {
    clearTimeout(state.anchorTimer);
    state.anchorTimer = null;

    for (const timer of state.timers || []) {
        clearTimeout(timer);
    }
    state.timers = [];

    if (state.frame) {
        cancelAnimationFrame(state.frame);
        state.frame = 0;
    }
}

function settleMessageCompletionScrollToLatestMessageStart(state = getMessageCompletionScrollState(), token, reason = '') {
    if (token !== Number(state.generationToken || 0)
        || settings.messageCompletionScrollToMiddleEnabled === false
        || state.userInteracted) {
        finishMessageCompletionScrollSettle(state);
        return;
    }

    const settled = scrollLatestMessageToMiddleAfterCompletion(state, reason);
    if (settled) {
        finishMessageCompletionScrollSettle(state);
        return;
    }

    state.frame = requestAnimationFrame(() => {
        state.frame = 0;
        settleMessageCompletionScrollToLatestMessageStart(state, token, reason);
    });
}

function scrollLatestMessageToMiddleAfterCompletion(state = getMessageCompletionScrollState(), reason = '') {
    const chat = document.querySelector('#chat');
    if (!(chat instanceof HTMLElement) || isWelcomePageDisplayed(chat) || state.userInteracted) {
        return true;
    }

    const latestMessage = getLongChatDomRenderLatestMessageElement(chat);
    if (!(latestMessage instanceof HTMLElement)) {
        return false;
    }

    removeLongChatDomRenderBottomAnchor(state);
    const now = performance.now();
    const targetTop = getLongChatDomRenderLatestMessageStartScrollTop(chat, latestMessage);
    const distance = Math.abs(chat.scrollTop - targetTop);
    const heightDelta = Math.abs(Number(state.lastScrollHeight || 0) - chat.scrollHeight);
    const targetDelta = Number.isFinite(state.lastTargetTop)
        ? Math.abs(Number(state.lastTargetTop) - targetTop)
        : 0;

    if (distance > LONG_CHAT_DOM_RENDER_SCROLL_BOTTOM_TOLERANCE) {
        chat.scrollTop = targetTop;
        state.stableFrames = 0;
    } else if (heightDelta > LONG_CHAT_DOM_RENDER_SCROLL_BOTTOM_TOLERANCE || targetDelta > LONG_CHAT_DOM_RENDER_SCROLL_BOTTOM_TOLERANCE) {
        state.stableFrames = 0;
    } else {
        state.stableFrames = Number(state.stableFrames || 0) + 1;
    }

    state.lastScrollHeight = chat.scrollHeight;
    state.lastTargetTop = targetTop;
    state.lastScrollReason = reason;

    return now - Number(state.scrollStartedAt || now) >= LONG_CHAT_DOM_RENDER_SCROLL_BOTTOM_SETTLE_MS
        || Number(state.stableFrames || 0) >= LONG_CHAT_DOM_RENDER_SCROLL_BOTTOM_STABLE_FRAMES;
}

export {
    addMessageCompletionScrollEventHandler,
    applyMessageCompletionScrollToMiddle,
    clearMessageCompletionScrollTimers,
    detachMessageCompletionScrollChatListener,
    ensureMessageCompletionScrollChatListener,
    ensureMessageCompletionScrollOverscrollGuard,
    finishMessageCompletionScrollSettle,
    getMessageCompletionScrollState,
    handleMessageCompletionScrollGenerationEnded,
    handleMessageCompletionScrollGenerationStarted,
    installMessageCompletionScrollToMiddle,
    releaseMessageCompletionScrollOverscrollGuard,
    removeMessageCompletionScrollToMiddle,
    scheduleMessageCompletionScrollToMiddle,
    scrollLatestMessageToMiddleAfterCompletion,
    settleMessageCompletionScrollToLatestMessageStart,
    updateMessageCompletionScrollBottomAnchor,
};
