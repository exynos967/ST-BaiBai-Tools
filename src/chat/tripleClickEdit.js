import * as scriptModule from '@sillytavern/script';
import { MESSAGE_EDIT_BOTTOM_ACTIONS_RELEVANT_SELECTOR } from './constants.js';
import { ensureMobileMessageEditCaretVisible } from './mobileKeyboard.js';
import { settings } from './state.js';

function applyMessageTripleClickEdit() {
    const chatElement = document.getElementById('chat');
    if (!chatElement) return;

    chatElement.removeEventListener('click', handleMessageTripleClickEdit);

    if (settings.messageDoubleClickEditEnabled || settings.messageTripleClickEditEnabled) {
        chatElement.addEventListener('click', handleMessageTripleClickEdit);
    }
}

function handleMessageTripleClickEdit(e) {
    if (!isMessageClickEditTrigger(e) || !(e.target instanceof Element)) {
        return;
    }

    // Ignore clicks on edit controls (textarea, native/bottom confirm/cancel buttons).
    // These can live inside `.mes_text`, so a fast click on them would otherwise be
    // misread as another multi-click and re-trigger the native `.mes_edit` handler,
    // which saves the message (stripping blank lines) and reopens the editor.
    if (e.target.closest(MESSAGE_EDIT_BOTTOM_ACTIONS_RELEVANT_SELECTOR)) {
        return;
    }

    // Already editing: re-triggering the edit button would force a save + reopen.
    if (document.querySelector('#chat #curEditTextarea')) {
        return;
    }

    const mesText = e.target.closest('.mes_text');
    if (!(mesText instanceof HTMLElement)) {
        return;
    }

    const mes = mesText.closest('.mes[mesid]');
    if (!(mes instanceof HTMLElement)) {
        return;
    }

    const editBtn = mes.querySelector('.mes_button.mes_edit');
    if (!(editBtn instanceof HTMLElement)) {
        return;
    }

    const caretOffset = getMessageTripleClickRawCaretOffset(e, mes, mesText);
    editBtn.click();

    if (Number.isInteger(caretOffset)) {
        scheduleMessageTripleClickEditorCaret(mes, caretOffset);
    }

    // Clear text selection created by repeated clicking.
    const selection = window.getSelection();
    if (selection) {
        selection.removeAllRanges();
    }
}

function isMessageClickEditTrigger(event) {
    return Boolean(
        (settings.messageDoubleClickEditEnabled && event.detail === 2)
        || (settings.messageTripleClickEditEnabled && event.detail === 3),
    );
}

function getMessageTripleClickRawCaretOffset(event, mes, mesText) {
    const messageId = Number(mes.getAttribute('mesid'));
    const rawText = Number.isInteger(messageId) && messageId >= 0
        ? scriptModule.chat?.[messageId]?.mes
        : null;

    if (typeof rawText !== 'string' || rawText.length === 0) {
        return null;
    }

    const pointer = getMessageTripleClickPointer(event);
    if (!pointer) {
        return null;
    }

    const caretRange = getCaretRangeFromPoint(pointer.clientX, pointer.clientY);
    if (!caretRange || !isRangeInsideElement(caretRange, mesText)) {
        return null;
    }

    const renderedText = mesText.textContent || '';
    if (!renderedText) {
        return null;
    }

    const renderedOffset = getRangeTextOffset(mesText, caretRange);
    if (!Number.isInteger(renderedOffset)) {
        return null;
    }

    const clickedTextInfo = getCaretTextNodeInfo(caretRange);
    return mapRenderedMessageOffsetToRawOffset(rawText, renderedText, renderedOffset, clickedTextInfo)
        ?? estimateRawCaretOffsetByRenderedRatio(rawText, renderedText, renderedOffset);
}

function getMessageTripleClickPointer(event) {
    const touch = event.changedTouches?.[0] || event.touches?.[0];
    if (touch && Number.isFinite(touch.clientX) && Number.isFinite(touch.clientY)) {
        return touch;
    }

    if (Number.isFinite(event.clientX) && Number.isFinite(event.clientY)) {
        return event;
    }

    return null;
}

function getCaretRangeFromPoint(clientX, clientY) {
    if (typeof document.caretRangeFromPoint === 'function') {
        return document.caretRangeFromPoint(clientX, clientY);
    }

    if (typeof document.caretPositionFromPoint === 'function') {
        const position = document.caretPositionFromPoint(clientX, clientY);
        if (position) {
            const range = document.createRange();
            range.setStart(position.offsetNode, position.offset);
            range.setEnd(position.offsetNode, position.offset);
            return range;
        }
    }

    return null;
}

function isRangeInsideElement(range, element) {
    const container = range.startContainer;
    return container === element || element.contains(container);
}

function getRangeTextOffset(container, range) {
    try {
        const prefixRange = document.createRange();
        prefixRange.selectNodeContents(container);
        prefixRange.setEnd(range.startContainer, range.startOffset);
        return prefixRange.toString().length;
    } catch {
        return null;
    }
}

function getCaretTextNodeInfo(range) {
    if (range.startContainer?.nodeType !== Node.TEXT_NODE) {
        return null;
    }

    return {
        text: range.startContainer.textContent || '',
        offset: Math.max(0, Math.min(range.startOffset, (range.startContainer.textContent || '').length)),
    };
}

function mapRenderedMessageOffsetToRawOffset(rawText, renderedText, renderedOffset, clickedTextInfo = null) {
    const rawProjection = buildRawMessageTextProjection(rawText);
    const rawComparable = buildComparableTextIndex(rawProjection.text, rawProjection.offsets);
    const renderedComparable = buildComparableTextIndex(renderedText);
    const renderedComparableOffset = getComparableOffsetBeforeSourceOffset(renderedComparable, renderedOffset);

    if (!rawComparable.text || !renderedComparable.text) {
        return null;
    }

    if (rawComparable.text === renderedComparable.text) {
        return getRawOffsetForComparableOffset(rawComparable, rawText, renderedComparableOffset);
    }

    const contextOffset = findRawOffsetByComparableContext(
        rawComparable,
        rawText,
        renderedComparable,
        renderedComparableOffset,
    );

    if (Number.isInteger(contextOffset)) {
        return contextOffset;
    }

    const clickedTextOffset = findRawOffsetByClickedText(
        rawComparable,
        rawText,
        clickedTextInfo,
        renderedComparable,
        renderedComparableOffset,
    );

    if (Number.isInteger(clickedTextOffset)) {
        return clickedTextOffset;
    }

    return null;
}

function estimateRawCaretOffsetByRenderedRatio(rawText, renderedText, renderedOffset) {
    if (!renderedText.length) {
        return null;
    }

    return Math.max(0, Math.min(rawText.length, Math.round(rawText.length * renderedOffset / renderedText.length)));
}

function buildRawMessageTextProjection(rawText) {
    const text = [];
    const offsets = [];
    let index = 0;
    let atLineStart = true;

    while (index < rawText.length) {
        if (atLineStart) {
            const fenceEnd = getMarkdownFenceLineEnd(rawText, index);
            if (Number.isInteger(fenceEnd)) {
                index = fenceEnd;
                atLineStart = true;
                continue;
            }

            const skippedIndex = skipMarkdownLinePrefix(rawText, index);
            if (skippedIndex > index) {
                index = skippedIndex;
                atLineStart = false;
                continue;
            }
        }

        const char = rawText[index];
        const nextChar = rawText[index + 1];

        if (char === '\n') {
            appendProjectedChar(text, offsets, char, index);
            index += 1;
            atLineStart = true;
            continue;
        }

        if (rawText.startsWith('<!--', index)) {
            const commentEnd = rawText.indexOf('-->', index + 4);
            index = commentEnd === -1 ? rawText.length : commentEnd + 3;
            atLineStart = false;
            continue;
        }

        if (char === '<') {
            const tagEnd = rawText.indexOf('>', index + 1);
            const tagText = tagEnd !== -1 ? rawText.slice(index, tagEnd + 1) : '';
            if (tagEnd !== -1 && isProjectedHtmlTag(tagText)) {
                if (/^<\s*br\b/i.test(tagText)) {
                    appendProjectedChar(text, offsets, '\n', index);
                }
                index = tagEnd + 1;
                atLineStart = false;
                continue;
            }
        }

        const entity = decodeHtmlEntityAt(rawText, index);
        if (entity) {
            appendProjectedChar(text, offsets, entity.text, index);
            index += entity.length;
            atLineStart = false;
            continue;
        }

        if (char === '!' && nextChar === '[') {
            const imageEnd = findMarkdownLinkEnd(rawText, index + 1);
            if (Number.isInteger(imageEnd)) {
                index = imageEnd;
                atLineStart = false;
                continue;
            }
        }

        if (char === '[') {
            const link = getMarkdownLinkParts(rawText, index);
            if (link) {
                appendProjectedRawRange(text, offsets, rawText, link.textStart, link.textEnd);
                index = link.end;
                atLineStart = false;
                continue;
            }
        }

        appendProjectedChar(text, offsets, char, index);
        index += 1;
        atLineStart = false;
    }

    return { text: text.join(''), offsets };
}

function appendProjectedRawRange(text, offsets, rawText, start, end) {
    for (let index = start; index < end; index++) {
        appendProjectedChar(text, offsets, rawText[index], index);
    }
}

function appendProjectedChar(text, offsets, char, rawOffset) {
    text.push(char);
    offsets.push(rawOffset);
}

function getMarkdownFenceLineEnd(rawText, index) {
    const lineEnd = getLineEnd(rawText, index);
    const line = rawText.slice(index, lineEnd);

    if (!/^[ \t]{0,3}(```+|~~~+)/.test(line)) {
        return null;
    }

    return lineEnd < rawText.length ? lineEnd + 1 : lineEnd;
}

function skipMarkdownLinePrefix(rawText, index) {
    const lineEnd = getLineEnd(rawText, index);
    const line = rawText.slice(index, lineEnd);
    let offset = 0;

    const quoteMatch = line.match(/^(?:[ \t]{0,3}>\s*)+/);
    if (quoteMatch) {
        offset += quoteMatch[0].length;
    }

    const rest = line.slice(offset);
    const headingMatch = rest.match(/^[ \t]{0,3}#{1,6}[ \t]+/);
    if (headingMatch) {
        return index + offset + headingMatch[0].length;
    }

    const listMatch = rest.match(/^[ \t]{0,3}(?:[-+*]|\d{1,9}[.)])[ \t]+(?:\[[ xX]\][ \t]+)?/);
    if (listMatch) {
        return index + offset + listMatch[0].length;
    }

    return index + offset;
}

function getLineEnd(text, index) {
    const lineEnd = text.indexOf('\n', index);
    return lineEnd === -1 ? text.length : lineEnd;
}

function decodeHtmlEntityAt(text, index) {
    const namedEntities = {
        amp: '&',
        apos: "'",
        gt: '>',
        lt: '<',
        nbsp: ' ',
        quot: '"',
    };

    const match = text.slice(index, index + 16).match(/^&(#x[\da-f]+|#\d+|[a-z]+);/i);
    if (!match) {
        return null;
    }

    const token = match[1];
    let decoded = namedEntities[token.toLowerCase()];

    if (!decoded && token[0] === '#') {
        const codePoint = token[1]?.toLowerCase() === 'x'
            ? Number.parseInt(token.slice(2), 16)
            : Number.parseInt(token.slice(1), 10);
        if (Number.isFinite(codePoint)) {
            try {
                decoded = String.fromCodePoint(codePoint);
            } catch {
                decoded = null;
            }
        }
    }

    return decoded ? { text: decoded, length: match[0].length } : null;
}

function isProjectedHtmlTag(text) {
    return /^<\/?[a-z][\w:-]*(?:\s[^>]*)?\/?>$/i.test(text);
}

function getMarkdownLinkParts(rawText, index) {
    const textEnd = findUnescapedChar(rawText, ']', index + 1);
    if (textEnd === -1 || rawText[textEnd + 1] !== '(') {
        return null;
    }

    const linkEnd = findMarkdownLinkDestinationEnd(rawText, textEnd + 2);
    if (linkEnd === -1) {
        return null;
    }

    return {
        textStart: index + 1,
        textEnd,
        end: linkEnd + 1,
    };
}

function findMarkdownLinkEnd(rawText, index) {
    const parts = getMarkdownLinkParts(rawText, index);
    return parts ? parts.end : null;
}

function findMarkdownLinkDestinationEnd(rawText, index) {
    let depth = 0;

    for (let cursor = index; cursor < rawText.length; cursor++) {
        if (rawText[cursor] === '\\') {
            cursor += 1;
            continue;
        }

        if (rawText[cursor] === '(') {
            depth += 1;
            continue;
        }

        if (rawText[cursor] === ')') {
            if (depth === 0) {
                return cursor;
            }
            depth -= 1;
        }
    }

    return -1;
}

function findUnescapedChar(text, char, index) {
    for (let cursor = index; cursor < text.length; cursor++) {
        if (text[cursor] === '\\') {
            cursor += 1;
            continue;
        }

        if (text[cursor] === char) {
            return cursor;
        }
    }

    return -1;
}

function buildComparableTextIndex(text, rawOffsets = null) {
    const comparable = [];
    const comparableToRaw = [];
    const sourceToComparable = new Array(text.length + 1);

    for (let index = 0; index < text.length; index++) {
        sourceToComparable[index] = comparable.length;

        if (!isComparableMessageChar(text[index])) {
            continue;
        }

        comparable.push(normalizeComparableMessageChar(text[index]));
        comparableToRaw.push(rawOffsets?.[index] ?? index);
    }

    sourceToComparable[text.length] = comparable.length;

    return {
        text: comparable.join(''),
        comparableToRaw,
        sourceToComparable,
    };
}

function isComparableMessageChar(char) {
    return !/[\s`*_~]/.test(char);
}

function normalizeComparableMessageChar(char) {
    return char;
}

function getComparableOffsetBeforeSourceOffset(index, sourceOffset) {
    const clampedOffset = Math.max(0, Math.min(sourceOffset, index.sourceToComparable.length - 1));
    return index.sourceToComparable[clampedOffset] ?? 0;
}

function getRawOffsetForComparableOffset(rawComparable, rawText, comparableOffset) {
    if (comparableOffset <= 0) {
        return 0;
    }

    if (comparableOffset >= rawComparable.comparableToRaw.length) {
        return rawText.length;
    }

    return rawComparable.comparableToRaw[comparableOffset];
}

function findRawOffsetByComparableContext(rawComparable, rawText, renderedComparable, renderedComparableOffset) {
    for (const radius of [80, 48, 28, 16, 10]) {
        const start = Math.max(0, renderedComparableOffset - radius);
        const end = Math.min(renderedComparable.text.length, renderedComparableOffset + radius);
        const needle = renderedComparable.text.slice(start, end);

        if (needle.length < 6) {
            continue;
        }

        const matchIndex = findBestComparableOccurrence(
            rawComparable.text,
            needle,
            getExpectedComparableOffset(rawComparable, renderedComparable, renderedComparableOffset),
        );

        if (matchIndex !== -1) {
            return getRawOffsetForComparableOffset(
                rawComparable,
                rawText,
                matchIndex + (renderedComparableOffset - start),
            );
        }
    }

    return null;
}

function findRawOffsetByClickedText(rawComparable, rawText, clickedTextInfo, renderedComparable, renderedComparableOffset) {
    if (!clickedTextInfo?.text) {
        return null;
    }

    const clickedComparable = buildComparableTextIndex(clickedTextInfo.text);
    if (clickedComparable.text.length < 3) {
        return null;
    }

    const clickedComparableOffset = getComparableOffsetBeforeSourceOffset(clickedComparable, clickedTextInfo.offset);
    const matchIndex = findBestComparableOccurrence(
        rawComparable.text,
        clickedComparable.text,
        getExpectedComparableOffset(rawComparable, renderedComparable, renderedComparableOffset),
    );

    if (matchIndex === -1) {
        return null;
    }

    return getRawOffsetForComparableOffset(rawComparable, rawText, matchIndex + clickedComparableOffset);
}

function getExpectedComparableOffset(rawComparable, renderedComparable, renderedComparableOffset) {
    if (renderedComparable.text.length === 0) {
        return 0;
    }

    return Math.round(renderedComparableOffset / renderedComparable.text.length * rawComparable.text.length);
}

function findBestComparableOccurrence(haystack, needle, expectedIndex) {
    let bestIndex = -1;
    let bestDistance = Number.POSITIVE_INFINITY;
    let index = haystack.indexOf(needle);

    while (index !== -1) {
        const distance = Math.abs(index - expectedIndex);
        if (distance < bestDistance) {
            bestIndex = index;
            bestDistance = distance;
        }

        index = haystack.indexOf(needle, index + 1);
    }

    return bestIndex;
}

function scheduleMessageTripleClickEditorCaret(mes, rawOffset) {
    const messageId = Number(mes.getAttribute('mesid'));
    let attempts = 0;

    const tryApply = () => {
        attempts += 1;

        const editor = document.querySelector('#curEditTextarea');
        const editorMes = editor?.closest?.('.mes[mesid]');
        const editorMessageId = Number(editorMes?.getAttribute('mesid'));

        if (editor instanceof HTMLTextAreaElement && Number.isInteger(editorMessageId) && editorMessageId === messageId) {
            const initialValue = editor.value;
            applyMessageTripleClickEditorCaret(editor, rawOffset, initialValue);
            requestAnimationFrame(() => applyMessageTripleClickEditorCaret(editor, rawOffset, initialValue));
            setTimeout(() => applyMessageTripleClickEditorCaret(editor, rawOffset, initialValue), 60);
            setTimeout(() => applyMessageTripleClickEditorCaret(editor, rawOffset, initialValue), 180);
            return;
        }

        if (attempts < 20) {
            setTimeout(tryApply, 25);
        }
    };

    tryApply();
}

function applyMessageTripleClickEditorCaret(editor, rawOffset, initialValue) {
    if (!editor.isConnected || editor.value !== initialValue) {
        return;
    }

    const caretOffset = Math.max(0, Math.min(rawOffset, editor.value.length));

    try {
        editor.focus({ preventScroll: true });
    } catch {
        editor.focus();
    }

    editor.setSelectionRange(caretOffset, caretOffset);
    scrollMessageTripleClickEditorCaretIntoView(editor, caretOffset);
}

function scrollMessageTripleClickEditorCaretIntoView(editor, caretOffset) {
    if (editor instanceof HTMLTextAreaElement) {
        ensureMobileMessageEditCaretVisible(editor);
        return;
    }

    if (editor.scrollHeight <= editor.clientHeight || editor.value.length === 0) {
        return;
    }

    const targetTop = Math.round(
        (editor.scrollHeight - editor.clientHeight)
        * caretOffset
        / editor.value.length,
    );

    editor.scrollTop = Math.max(0, Math.min(targetTop, editor.scrollHeight - editor.clientHeight));
}

export {
    appendProjectedChar,
    appendProjectedRawRange,
    applyMessageTripleClickEdit,
    applyMessageTripleClickEditorCaret,
    buildComparableTextIndex,
    buildRawMessageTextProjection,
    decodeHtmlEntityAt,
    estimateRawCaretOffsetByRenderedRatio,
    findBestComparableOccurrence,
    findMarkdownLinkDestinationEnd,
    findMarkdownLinkEnd,
    findRawOffsetByClickedText,
    findRawOffsetByComparableContext,
    findUnescapedChar,
    getCaretRangeFromPoint,
    getCaretTextNodeInfo,
    getComparableOffsetBeforeSourceOffset,
    getExpectedComparableOffset,
    getLineEnd,
    getMarkdownFenceLineEnd,
    getMarkdownLinkParts,
    getMessageTripleClickPointer,
    getMessageTripleClickRawCaretOffset,
    getRangeTextOffset,
    getRawOffsetForComparableOffset,
    handleMessageTripleClickEdit,
    isComparableMessageChar,
    isMessageClickEditTrigger,
    isProjectedHtmlTag,
    isRangeInsideElement,
    mapRenderedMessageOffsetToRawOffset,
    normalizeComparableMessageChar,
    scheduleMessageTripleClickEditorCaret,
    scrollMessageTripleClickEditorCaretIntoView,
    skipMarkdownLinePrefix,
};
