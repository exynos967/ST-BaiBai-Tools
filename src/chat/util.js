import { LONG_CHAT_DOM_RENDER_FORCE_DISABLED } from './constants.js';
import { getLongChatMessageTextLength } from './longChatRender.js';
import { settings } from './state.js';

function waitForNextPaint() {
    return new Promise(resolve => {
        let settled = false;
        const finish = () => {
            if (settled) {
                return;
            }

            settled = true;
            clearTimeout(fallback);
            resolve();
        };
        const fallback = setTimeout(finish, 80);

        if (typeof requestAnimationFrame !== 'function') {
            finish();
            return;
        }

        requestAnimationFrame(() => setTimeout(finish, 0));
    });
}

function calculateVisibleMessageTextStats(chat, visibleMessages = [...document.querySelectorAll('#chat .mes')]) {
    let visibleTextChars = 0;
    let maxVisibleChars = 0;
    let maxVisibleMesId = 'none';

    for (const element of visibleMessages) {
        const mesId = element.getAttribute('mesid') ?? '';
        const index = Number(mesId);
        const message = Number.isInteger(index) ? chat[index] : null;
        const chars = getLongChatMessageTextLength(message);

        visibleTextChars += chars;
        if (chars > maxVisibleChars) {
            maxVisibleChars = chars;
            maxVisibleMesId = mesId || 'none';
        }
    }

    return { visibleTextChars, maxVisibleChars, maxVisibleMesId };
}

function getLongChatDomRenderSnapshot() {
    if (LONG_CHAT_DOM_RENDER_FORCE_DISABLED) {
        return 'longDom=disabled';
    }

    if (!settings.longChatDomRenderOptimizationEnabled) {
        return 'longDom=off';
    }

    const chat = document.querySelector('#chat');
    if (!(chat instanceof HTMLElement)) {
        return 'longDom=pending';
    }

    const optimized = chat.classList.contains('bai-bai-toolkit-long-chat-render-optimized');
    const contained = chat.querySelectorAll('.mes.bai-bai-toolkit-long-chat-contained').length;
    return `longDom=${optimized ? 'on' : 'idle'}:${contained}`;
}

export {
    calculateVisibleMessageTextStats,
    getLongChatDomRenderSnapshot,
    waitForNextPaint,
};
