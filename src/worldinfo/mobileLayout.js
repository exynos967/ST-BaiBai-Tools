import { WORLD_INFO_SEARCH_REPLACE_PANEL_CLASS } from './constants.js';
import { settings } from './state.js';
import { getWorldInfoVueListOptimizationState } from './vueList.js';

function installWorldInfoMobileHeaderLayoutWatcher(state = getWorldInfoVueListOptimizationState()) {
    if (state.mobileHeaderLayoutHandler) {
        return;
    }

    const mediaQuery = globalThis.matchMedia?.('(max-width: 600px)');
    const handler = () => {
        const list = document.getElementById('world_popup_entries_list');

        if (!(list instanceof HTMLElement)) {
            return;
        }

        if (shouldUseWorldInfoMobileHeaderLayout()) {
            applyWorldInfoPopupLayout();
            applyWorldInfoMobileHeaderLayouts(list);
            applyWorldInfoMobileExpandedLayouts(list);
        } else {
            restoreWorldInfoPopupLayout();
            restoreWorldInfoMobileExpandedLayouts(list);
            restoreWorldInfoMobileHeaderLayouts(list);
        }
    };

    state.mobileHeaderLayoutHandler = handler;
    state.mobileHeaderLayoutMediaQuery = mediaQuery || null;

    if (mediaQuery?.addEventListener) {
        mediaQuery.addEventListener('change', handler);
    } else if (mediaQuery?.addListener) {
        mediaQuery.addListener(handler);
    } else {
        globalThis.addEventListener?.('resize', handler);
    }

    handler();
}

function installWorldInfoMobileLayoutMutationObserver(state = getWorldInfoVueListOptimizationState()) {
    if (state.mobileLayoutMutationObserver) {
        return;
    }

    const list = document.getElementById('world_popup_entries_list');

    if (!(list instanceof HTMLElement) || typeof MutationObserver !== 'function') {
        return;
    }

    const observer = new MutationObserver(mutations => {
        if (!settings.worldInfoListOptimizationEnabled) {
            return;
        }

        let shouldRefresh = false;

        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                if (!(node instanceof Element)) {
                    continue;
                }

                if (node.matches('.world_entry_edit') || node.querySelector?.('.world_entry_edit')) {
                    shouldRefresh = true;
                    break;
                }
            }

            if (shouldRefresh) {
                break;
            }
        }

        if (!shouldRefresh) {
            return;
        }

        if (shouldUseWorldInfoMobileHeaderLayout()) {
            applyWorldInfoPopupLayout();
            applyWorldInfoMobileHeaderLayouts(list);
            applyWorldInfoMobileExpandedLayouts(list);
        } else {
            restoreWorldInfoPopupLayout();
            restoreWorldInfoMobileExpandedLayouts(list);
            restoreWorldInfoMobileHeaderLayouts(list);
        }
    });

    observer.observe(list, { childList: true, subtree: true });
    state.mobileLayoutMutationObserver = observer;
}

function removeWorldInfoMobileLayoutMutationObserver(state = getWorldInfoVueListOptimizationState()) {
    state.mobileLayoutMutationObserver?.disconnect();
    state.mobileLayoutMutationObserver = null;
}

function removeWorldInfoMobileHeaderLayoutWatcher(state = getWorldInfoVueListOptimizationState()) {
    const handler = state.mobileHeaderLayoutHandler;
    const mediaQuery = state.mobileHeaderLayoutMediaQuery;

    if (!handler) {
        return;
    }

    if (mediaQuery?.removeEventListener) {
        mediaQuery.removeEventListener('change', handler);
    } else if (mediaQuery?.removeListener) {
        mediaQuery.removeListener(handler);
    } else {
        globalThis.removeEventListener?.('resize', handler);
    }

    state.mobileHeaderLayoutHandler = null;
    state.mobileHeaderLayoutMediaQuery = null;
}

function shouldUseWorldInfoMobileHeaderLayout() {
    return settings.worldInfoListOptimizationEnabled
        && Boolean(globalThis.matchMedia?.('(max-width: 600px)').matches);
}

function applyWorldInfoMobileHeaderLayouts(root = document) {
    if (!shouldUseWorldInfoMobileHeaderLayout()) {
        restoreWorldInfoMobileHeaderLayouts(root);
        return;
    }

    getWorldInfoEntryElements(root).forEach(entry => {
        applyWorldInfoMobileHeaderLayout(entry);
    });
}

function applyWorldInfoMobileExpandedLayouts(root = document) {
    if (!shouldUseWorldInfoMobileHeaderLayout()) {
        restoreWorldInfoMobileExpandedLayouts(root);
        return;
    }

    getWorldInfoEntryElements(root).forEach(entry => {
        entry.querySelectorAll(':scope .world_entry_edit').forEach(edit => {
            applyWorldInfoMobileExpandedLayout(edit);
        });
    });
}

function applyWorldInfoPopupLayout() {
    if (!shouldUseWorldInfoMobileHeaderLayout()) {
        restoreWorldInfoPopupLayout();
        return;
    }

    const popup = document.getElementById('world_popup');
    const list = document.getElementById('world_popup_entries_list');

    if (!(popup instanceof HTMLElement)
        || !(list instanceof HTMLElement)
        || list.parentElement !== popup
        || popup.dataset.baiBaiWorldInfoPopupLayout === 'true') {
        return;
    }

    const nodesBeforeList = [];
    for (let node = popup.firstChild; node && node !== list; node = node.nextSibling) {
        if (node instanceof HTMLElement && node.classList.contains(WORLD_INFO_SEARCH_REPLACE_PANEL_CLASS)) {
            continue;
        }

        nodesBeforeList.push(node);
    }

    if (!nodesBeforeList.some(node => node instanceof HTMLElement)) {
        return;
    }

    const marker = document.createComment('bai-bai-world-info-popup-layout-placeholder');
    const header = document.createElement('div');
    header.className = 'bai-bai-wi-popup-header';
    const sourceStash = document.createElement('div');
    sourceStash.className = 'bai-bai-wi-popup-source-stash';
    sourceStash.hidden = true;
    const movedNodes = [];

    nodesBeforeList[0].before(marker);
    marker.after(header);
    header.append(sourceStash);
    sourceStash.append(...nodesBeforeList);

    applyWorldInfoPopupHeaderRows(header, sourceStash, movedNodes);

    popup.dataset.baiBaiWorldInfoPopupLayout = 'true';
    popup.__baiBaiWorldInfoPopupLayout = {
        header,
        marker,
        nodesBeforeList,
        movedNodes,
    };
}

function restoreWorldInfoPopupLayout() {
    const popup = document.getElementById('world_popup');
    const state = popup?.__baiBaiWorldInfoPopupLayout;

    if (!(popup instanceof HTMLElement) || !state?.header) {
        return;
    }

    for (const item of state.movedNodes || []) {
        if (item?.node instanceof Node && item.placeholder instanceof Comment && item.placeholder.parentNode) {
            item.placeholder.replaceWith(item.node);
        }
    }

    if (state.marker instanceof Comment && state.marker.parentNode) {
        state.marker.replaceWith(...(state.nodesBeforeList || Array.from(state.header.childNodes)));
    } else if (state.header.parentNode) {
        state.header.before(...(state.nodesBeforeList || Array.from(state.header.childNodes)));
    }

    state.header.remove();
    delete popup.__baiBaiWorldInfoPopupLayout;
    delete popup.dataset.baiBaiWorldInfoPopupLayout;
}

function applyWorldInfoPopupHeaderRows(header, sourceStash, movedNodes) {
    const select = sourceStash.querySelector('#world_editor_select');
    const createButton = sourceStash.querySelector('#world_create_button');
    const orNode = findWorldInfoPopupOrNode(sourceStash, createButton);
    const selectNodes = getWorldInfoPopupControlVisualNodes(select);
    const selectNodeSet = new Set(selectNodes);
    const pushedNodes = new Set();
    const flatNodes = getWorldInfoPopupFlatHeaderNodes(sourceStash);

    for (const node of selectNodes) {
        if (flatNodes.includes(node)) {
            moveWorldInfoPopupLayoutNode(node, header, movedNodes);
            pushedNodes.add(node);
        }
    }

    if (orNode instanceof Node) {
        moveWorldInfoPopupLayoutNode(orNode, header, movedNodes);
        pushedNodes.add(orNode);
    }

    if (createButton instanceof Node) {
        moveWorldInfoPopupLayoutNode(createButton, header, movedNodes);
        pushedNodes.add(createButton);
    }

    for (const node of flatNodes) {
        if (pushedNodes.has(node) || selectNodeSet.has(node)) {
            continue;
        }

        moveWorldInfoPopupLayoutNode(node, header, movedNodes);
        pushedNodes.add(node);
    }
}

function getWorldInfoPopupFlatHeaderNodes(root) {
    const nodes = [];
    collectWorldInfoPopupFlatHeaderNodes(root, nodes);
    return nodes;
}

function collectWorldInfoPopupFlatHeaderNodes(parent, nodes) {
    for (const node of Array.from(parent.childNodes)) {
        if (node.nodeType === Node.TEXT_NODE) {
            if (node.nodeValue?.trim()) {
                nodes.push(node);
            }
            continue;
        }

        if (!(node instanceof HTMLElement)) {
            continue;
        }

        if (isWorldInfoPopupFlatHeaderItem(node)) {
            nodes.push(node);
            continue;
        }

        collectWorldInfoPopupFlatHeaderNodes(node, nodes);
    }
}

function isWorldInfoPopupFlatHeaderItem(element) {
    if (!(element instanceof HTMLElement)) {
        return false;
    }

    if (element.id === 'world_info_pagination') {
        return true;
    }

    if (element.matches([
        '#world_editor_select',
        '#world_create_button',
        '.select2-container',
        '.menu_button',
        'button',
        'input',
        'select',
        'textarea',
        'a[href]',
    ].join(','))) {
        return true;
    }

    return element.childElementCount === 0 && Boolean(element.textContent?.trim());
}

function getWorldInfoPopupControlVisualNodes(control) {
    if (!(control instanceof HTMLElement)) {
        return [];
    }

    const nodes = [control];
    const next = control.nextElementSibling;

    if (next instanceof HTMLElement && next.classList.contains('select2-container')) {
        nodes.push(next);
    }

    return nodes;
}

function moveWorldInfoPopupLayoutNode(node, target, movedNodes) {
    if (!(node instanceof Node) || !(target instanceof HTMLElement)) {
        return;
    }

    const placeholder = document.createComment('bai-bai-world-info-popup-inner-placeholder');
    node.before(placeholder);
    movedNodes.push({ node, placeholder });
    target.append(node);
}

function findWorldInfoPopupOrNode(root, createButton) {
    if (!(root instanceof HTMLElement)) {
        return null;
    }

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
        acceptNode(node) {
            if (node === createButton || createButton?.contains?.(node)) {
                return NodeFilter.FILTER_REJECT;
            }

            const text = node.textContent?.trim();

            if (/^(\u6216|or)$/i.test(text || '')) {
                return NodeFilter.FILTER_ACCEPT;
            }

            return NodeFilter.FILTER_SKIP;
        },
    });

    return walker.nextNode();
}

function applyWorldInfoMobileExpandedLayout(edit) {
    if (!(edit instanceof HTMLElement) || edit.dataset.baiBaiWorldInfoMobileExpandedLayout === 'true') {
        return;
    }

    const mainRow = edit.querySelector(':scope > .flex-container.wide100p.alignitemscenter');
    const keywordsBlock = mainRow?.querySelector(':scope > [name="keywordsAndLogicBlock"]');
    const perEntryOverridesBlock = mainRow?.querySelector(':scope > [name="perEntryOverridesBlock"]');
    const contentBlock = mainRow?.querySelector(':scope > [name="contentAndCharFilterBlock"]');
    const commentContainer = mainRow?.querySelector(':scope > .commentContainer');
    const primaryKeyBlock = keywordsBlock?.querySelector(':scope > .keyprimary');
    const logicBlock = keywordsBlock?.querySelector(':scope > .world_entry_form_control:not(.keyprimary):not(.keysecondary)');
    const secondaryKeyBlock = keywordsBlock?.querySelector(':scope > .keysecondary');
    const contentTextarea = contentBlock?.querySelector('textarea[name="content"]');
    const contentControl = contentTextarea?.closest('.world_entry_form_control');
    const contentHeader = contentControl?.querySelector('label[for="content "] small > span.alignitemscenter');
    const contentTitleGroup = contentHeader?.querySelector(':scope > .alignitemscenter.flex-container');
    const contentMeta = Array.from(contentHeader?.children ?? [])
        .find(child => child instanceof HTMLElement && child !== contentTitleGroup && child.querySelector('.world_entry_form_token_counter'));
    const contentMaximize = contentTitleGroup?.querySelector('.editor_maximize');
    const recursionOptions = Array.from(contentHeader?.children ?? [])
        .find(element => element instanceof HTMLElement && element.querySelector('input[name="excludeRecursion"]'));

    if (!(mainRow instanceof HTMLElement)
        || !(keywordsBlock instanceof HTMLElement)
        || !(primaryKeyBlock instanceof HTMLElement)
        || !(contentBlock instanceof HTMLElement)) {
        return;
    }

    const mobileAdvancedBlock = document.createElement('div');
    mobileAdvancedBlock.className = 'bai-bai-wi-mobile-expanded-advanced flex-container flexFlowColumn flexGap10';

    if (contentHeader instanceof HTMLElement) {
        contentHeader.classList.add('bai-bai-wi-mobile-content-header');
    }

    if (contentTitleGroup instanceof HTMLElement) {
        contentTitleGroup.classList.add('bai-bai-wi-mobile-content-title-group');
    }

    if (contentMeta instanceof HTMLElement) {
        contentMeta.classList.add('bai-bai-wi-mobile-content-meta');
    }

    const tokenGapTextNode = compactWorldInfoMobileTokenGap(contentMeta);
    const contentTextareaRowsState = setWorldInfoMobileContentTextareaRows(contentTextarea, 14);

    if (contentMaximize instanceof HTMLElement) {
        contentMaximize.classList.add('bai-bai-wi-mobile-content-maximize');
        contentHeader?.append(contentMaximize);
    }

    [
        logicBlock,
        secondaryKeyBlock,
        recursionOptions,
    ].forEach(node => {
        if (node instanceof HTMLElement) {
            mobileAdvancedBlock.append(node);
        }
    });

    const extraNodes = [
        mobileAdvancedBlock.childElementCount > 0 ? mobileAdvancedBlock : null,
        perEntryOverridesBlock,
        commentContainer,
        ...Array.from(edit.children).filter(child => child !== mainRow),
    ].filter(node => node instanceof HTMLElement);

    const placeholders = new Map();

    for (const node of extraNodes) {
        const placeholder = document.createComment('bai-bai-world-info-mobile-expanded-placeholder');
        node.before(placeholder);
        placeholders.set(node, placeholder);
    }

    mainRow.classList.add('bai-bai-wi-mobile-expanded-main');

    const extraDrawer = document.createElement('div');
    extraDrawer.className = 'bai-bai-wi-mobile-expanded-extra inline-drawer wide100p flexFlowColumn';

    const extraHeader = document.createElement('div');
    extraHeader.className = 'bai-bai-wi-mobile-expanded-extra-toggle inline-drawer-header inline-drawer-header-pointer';
    const extraTitle = document.createElement('strong');
    extraTitle.textContent = '更多设置';
    const extraIcon = document.createElement('div');
    extraIcon.className = 'fa-solid fa-circle-chevron-down inline-drawer-icon down';
    extraHeader.append(extraTitle, extraIcon);

    const extraContent = document.createElement('div');
    extraContent.className = 'bai-bai-wi-mobile-expanded-extra-content inline-drawer-content flex-container flexFlowColumn flexGap10 paddingBottom5px';
    extraContent.style.display = 'none';
    extraContent.append(...extraNodes);

    const toggleHandler = (event) => {
        event.preventDefault();
        event.stopPropagation();
        const expand = getComputedStyle(extraContent).display === 'none';
        extraContent.style.display = expand ? 'flex' : 'none';
        extraIcon.classList.toggle('down', !expand);
        extraIcon.classList.toggle('up', expand);
        extraIcon.classList.toggle('fa-circle-chevron-down', !expand);
        extraIcon.classList.toggle('fa-circle-chevron-up', expand);
    };

    extraHeader.addEventListener('click', toggleHandler);
    extraDrawer.append(extraHeader, extraContent);
    edit.append(extraDrawer);

    edit.dataset.baiBaiWorldInfoMobileExpandedLayout = 'true';
    edit.__baiBaiWorldInfoMobileExpandedLayout = {
        mainRow,
        keywordsBlock,
        primaryKeyBlock,
        mobileAdvancedBlock,
        logicBlock,
        secondaryKeyBlock,
        contentHeader,
        contentTitleGroup,
        contentMeta,
        contentMaximize,
        tokenGapTextNode,
        contentTextareaRowsState,
        recursionOptions,
        contentBlock,
        extraDrawer,
        extraHeader,
        toggleHandler,
        placeholders,
        extraNodes,
    };
}

function restoreWorldInfoMobileExpandedLayouts(root = document) {
    getWorldInfoEntryElements(root).forEach(entry => {
        entry.querySelectorAll(':scope .world_entry_edit[data-bai-bai-world-info-mobile-expanded-layout="true"]').forEach(edit => {
            restoreWorldInfoMobileExpandedLayout(edit);
        });
    });
}

function compactWorldInfoMobileTokenGap(contentMeta) {
    if (!(contentMeta instanceof HTMLElement)) {
        return null;
    }

    const tokenCounter = contentMeta.querySelector('.world_entry_form_token_counter');
    const gapNode = tokenCounter?.previousSibling;

    if (gapNode?.nodeType !== Node.TEXT_NODE || !/[\s\u00a0]+/.test(gapNode.nodeValue || '')) {
        return null;
    }

    const state = {
        node: gapNode,
        value: gapNode.nodeValue,
    };

    gapNode.nodeValue = '';
    return state;
}

function setWorldInfoMobileContentTextareaRows(textarea, rows) {
    if (!(textarea instanceof HTMLTextAreaElement)) {
        return null;
    }

    const state = {
        textarea,
        rowsAttribute: textarea.getAttribute('rows'),
    };

    textarea.rows = rows;
    return state;
}

function restoreWorldInfoMobileContentTextareaRows(state) {
    if (!(state?.textarea instanceof HTMLTextAreaElement)) {
        return;
    }

    if (state.rowsAttribute === null) {
        state.textarea.removeAttribute('rows');
    } else {
        state.textarea.setAttribute('rows', state.rowsAttribute);
    }
}

function restoreWorldInfoMobileExpandedLayout(edit) {
    const state = edit?.__baiBaiWorldInfoMobileExpandedLayout;

    if (!(edit instanceof HTMLElement) || !state?.extraDrawer) {
        return;
    }

    if (state.keywordsBlock instanceof HTMLElement) {
        [state.primaryKeyBlock, state.logicBlock, state.secondaryKeyBlock].forEach(node => {
            if (node instanceof Node) {
                state.keywordsBlock.append(node);
            }
        });
    }

    const contentHeader = state.contentBlock instanceof HTMLElement
        ? state.contentBlock.querySelector('label[for="content "] small > span.alignitemscenter')
        : null;
    if (contentHeader instanceof HTMLElement && state.recursionOptions instanceof HTMLElement) {
        contentHeader.append(state.recursionOptions);
    }

    if (state.contentTitleGroup instanceof HTMLElement && state.contentMaximize instanceof HTMLElement) {
        state.contentTitleGroup.append(state.contentMaximize);
    }

    if (state.tokenGapTextNode?.node?.nodeType === Node.TEXT_NODE) {
        state.tokenGapTextNode.node.nodeValue = state.tokenGapTextNode.value;
    }

    restoreWorldInfoMobileContentTextareaRows(state.contentTextareaRowsState);

    [
        state.contentHeader,
        state.contentTitleGroup,
        state.contentMeta,
        state.contentMaximize,
    ].forEach(node => {
        if (node instanceof HTMLElement) {
            node.classList.remove(
                'bai-bai-wi-mobile-content-header',
                'bai-bai-wi-mobile-content-title-group',
                'bai-bai-wi-mobile-content-meta',
                'bai-bai-wi-mobile-content-maximize',
            );
        }
    });

    state.mainRow?.classList?.remove('bai-bai-wi-mobile-expanded-main');

    for (const node of state.extraNodes || []) {
        const placeholder = state.placeholders?.get(node);
        if (node instanceof Node && placeholder instanceof Comment && placeholder.parentNode) {
            placeholder.replaceWith(node);
        }
    }

    state.extraHeader?.removeEventListener?.('click', state.toggleHandler);
    state.extraDrawer.remove();
    delete edit.__baiBaiWorldInfoMobileExpandedLayout;
    delete edit.dataset.baiBaiWorldInfoMobileExpandedLayout;
}

function applyWorldInfoMobileHeaderLayout(entry) {
    if (!(entry instanceof HTMLElement) || entry.dataset.baiBaiWorldInfoMobileHeaderLayout === 'true') {
        return;
    }

    const header = entry.querySelector(':scope > .world_entry_form > .inline-drawer > .inline-drawer-header');
    const thinControls = header?.querySelector(':scope > .world_entry_thin_controls');
    const body = thinControls?.querySelector(':scope > .flex-container.alignitemscenter.wide100p');
    const titleStatus = body?.querySelector(':scope > .WIEntryTitleAndStatus');
    const controls = body?.querySelector(':scope > .WIEnteryHeaderControls');
    const dragHandle = header?.querySelector(':scope > .drag-handle');
    const toggle = thinControls?.querySelector(':scope > .inline-drawer-toggle');
    const killSwitch = thinControls?.querySelector(':scope > .killSwitch');
    const moveButton = header?.querySelector(':scope > .move_entry_button');
    const duplicateButton = header?.querySelector(':scope > .duplicate_entry_button');
    const deleteButton = header?.querySelector(':scope > .delete_entry_button');
    const positionBlock = controls?.querySelector(':scope > [name="PositionBlock"]');
    const depthBlock = controls?.querySelector('input[name="depth"]')?.closest('.world_entry_form_control');
    const orderBlock = controls?.querySelector('input[name="order"]')?.closest('.world_entry_form_control');
    const probabilityBlock = controls?.querySelector(':scope > .probabilityContainer');
    const entryStateSelector = titleStatus?.querySelector('select[name="entryStateSelector"]');
    const positionLabel = positionBlock?.querySelector(':scope > label');
    const depthLabel = depthBlock?.querySelector(':scope > label');

    if (!(header instanceof HTMLElement)
        || !(thinControls instanceof HTMLElement)
        || !(titleStatus instanceof HTMLElement)
        || !(controls instanceof HTMLElement)
        || !(toggle instanceof HTMLElement)
        || !(killSwitch instanceof HTMLElement)
        || !(positionBlock instanceof HTMLElement)
        || !(depthBlock instanceof HTMLElement)
        || !(orderBlock instanceof HTMLElement)
        || !(probabilityBlock instanceof HTMLElement)
        || !(positionLabel instanceof HTMLElement)
        || !(depthLabel instanceof HTMLElement)) {
        return;
    }

    const originalNodes = [
        dragHandle,
        thinControls,
        moveButton,
        duplicateButton,
        deleteButton,
    ].filter(node => node instanceof Node);
    const placeholders = new Map();

    for (const node of originalNodes) {
        const placeholder = document.createComment('bai-bai-world-info-mobile-header-placeholder');
        node.before(placeholder);
        placeholders.set(node, placeholder);
    }

    const layout = document.createElement('div');
    layout.className = 'bai-bai-wi-mobile-header';
    const hiddenStash = document.createElement('div');
    hiddenStash.className = 'bai-bai-wi-mobile-hidden-stash';
    hiddenStash.hidden = true;
    hiddenStash.append(thinControls);

    const grid = document.createElement('div');
    grid.className = 'bai-bai-wi-mobile-header-grid';

    const titleCell = document.createElement('div');
    titleCell.className = 'bai-bai-wi-mobile-title-cell';
    titleCell.append(titleStatus);

    const stateCell = document.createElement('div');
    stateCell.className = 'bai-bai-wi-mobile-state-cell';
    if (entryStateSelector instanceof HTMLElement) {
        stateCell.append(entryStateSelector);
    }

    const menuCell = document.createElement('div');
    menuCell.className = 'bai-bai-wi-mobile-menu-cell';
    if (dragHandle instanceof HTMLElement) {
        menuCell.append(dragHandle);
    }

    const positionLabelCell = document.createElement('div');
    positionLabelCell.className = 'bai-bai-wi-mobile-position-label-cell';
    positionLabelCell.append(positionLabel);

    const depthLabelCell = document.createElement('div');
    depthLabelCell.className = 'bai-bai-wi-mobile-depth-label-cell';
    depthLabelCell.append(depthLabel);

    const labelSpacerCell = document.createElement('div');
    labelSpacerCell.className = 'bai-bai-wi-mobile-label-spacer-cell';

    const positionCell = document.createElement('div');
    positionCell.className = 'bai-bai-wi-mobile-position-cell';
    positionCell.append(positionBlock);

    const depthCell = document.createElement('div');
    depthCell.className = 'bai-bai-wi-mobile-depth-cell';
    depthCell.append(depthBlock);

    const enabledCell = document.createElement('div');
    enabledCell.className = 'bai-bai-wi-mobile-enabled-cell';
    enabledCell.append(killSwitch);

    grid.append(
        titleCell, stateCell, menuCell,
        positionLabelCell, depthLabelCell, labelSpacerCell,
        positionCell, depthCell, enabledCell,
    );

    const footer = document.createElement('div');
    footer.className = 'bai-bai-wi-mobile-footer';
    const numberGroup = document.createElement('div');
    numberGroup.className = 'bai-bai-wi-mobile-number-group';
    numberGroup.append(orderBlock, probabilityBlock);

    const actionGroup = document.createElement('div');
    actionGroup.className = 'bai-bai-wi-mobile-action-group';
    [moveButton, duplicateButton, deleteButton].forEach(button => {
        if (button instanceof HTMLElement) {
            actionGroup.append(button);
        }
    });

    const expandSlot = document.createElement('div');
    expandSlot.className = 'bai-bai-wi-mobile-expand-slot';
    expandSlot.append(toggle);

    footer.append(numberGroup, actionGroup, expandSlot);
    layout.append(hiddenStash, grid, footer);
    header.append(layout);

    entry.dataset.baiBaiWorldInfoMobileHeaderLayout = 'true';
    entry.__baiBaiWorldInfoMobileHeaderLayout = {
        placeholders,
        layout,
        hiddenStash,
        nodes: originalNodes,
        thinControls,
        body,
        titleStatus,
        entryStateSelector,
        positionLabel,
        depthLabel,
        controls,
        toggle,
        killSwitch,
        positionBlock,
        depthBlock,
        orderBlock,
        probabilityBlock,
    };
}

function restoreWorldInfoMobileHeaderLayouts(root = document) {
    getWorldInfoEntryElements(root)
        .filter(entry => entry.dataset.baiBaiWorldInfoMobileHeaderLayout === 'true')
        .forEach(entry => {
        restoreWorldInfoMobileHeaderLayout(entry);
    });
}

function getWorldInfoEntryElements(root = document) {
    if (root instanceof HTMLElement && root.matches('#world_popup_entries_list > .world_entry')) {
        return [root];
    }

    if (root instanceof HTMLElement && root.id === 'world_popup_entries_list') {
        return Array.from(root.querySelectorAll(':scope > .world_entry'));
    }

    return Array.from(root.querySelectorAll?.('#world_popup_entries_list > .world_entry') ?? []);
}

function restoreWorldInfoMobileHeaderLayout(entry) {
    const state = entry?.__baiBaiWorldInfoMobileHeaderLayout;

    if (!(entry instanceof HTMLElement) || !state?.layout) {
        return;
    }

    if (state.titleStatus instanceof HTMLElement && state.entryStateSelector instanceof HTMLElement) {
        state.titleStatus.append(state.entryStateSelector);
    }

    if (state.positionBlock instanceof HTMLElement && state.positionLabel instanceof HTMLElement) {
        state.positionBlock.prepend(state.positionLabel);
    }

    if (state.depthBlock instanceof HTMLElement && state.depthLabel instanceof HTMLElement) {
        state.depthBlock.prepend(state.depthLabel);
    }

    if (state.body instanceof HTMLElement && state.titleStatus instanceof HTMLElement && state.controls instanceof HTMLElement) {
        state.body.append(state.titleStatus, state.controls);
    }

    if (state.controls instanceof HTMLElement) {
        [state.positionBlock, state.depthBlock, state.orderBlock, state.probabilityBlock].forEach(node => {
            if (node instanceof Node) {
                state.controls.append(node);
            }
        });
    }

    if (state.thinControls instanceof HTMLElement) {
        [state.toggle, state.killSwitch, state.body].forEach(node => {
            if (node instanceof Node) {
                state.thinControls.append(node);
            }
        });
    }

    for (const node of state.nodes || []) {
        const placeholder = state.placeholders?.get(node);
        if (node instanceof Node && placeholder instanceof Comment && placeholder.parentNode) {
            placeholder.replaceWith(node);
        }
    }

    state.layout.remove();
    delete entry.__baiBaiWorldInfoMobileHeaderLayout;
    delete entry.dataset.baiBaiWorldInfoMobileHeaderLayout;
}

export {
    applyWorldInfoMobileExpandedLayout,
    applyWorldInfoMobileExpandedLayouts,
    applyWorldInfoMobileHeaderLayout,
    applyWorldInfoMobileHeaderLayouts,
    applyWorldInfoPopupHeaderRows,
    applyWorldInfoPopupLayout,
    collectWorldInfoPopupFlatHeaderNodes,
    compactWorldInfoMobileTokenGap,
    findWorldInfoPopupOrNode,
    getWorldInfoEntryElements,
    getWorldInfoPopupControlVisualNodes,
    getWorldInfoPopupFlatHeaderNodes,
    installWorldInfoMobileHeaderLayoutWatcher,
    installWorldInfoMobileLayoutMutationObserver,
    isWorldInfoPopupFlatHeaderItem,
    moveWorldInfoPopupLayoutNode,
    removeWorldInfoMobileHeaderLayoutWatcher,
    removeWorldInfoMobileLayoutMutationObserver,
    restoreWorldInfoMobileContentTextareaRows,
    restoreWorldInfoMobileExpandedLayout,
    restoreWorldInfoMobileExpandedLayouts,
    restoreWorldInfoMobileHeaderLayout,
    restoreWorldInfoMobileHeaderLayouts,
    restoreWorldInfoPopupLayout,
    setWorldInfoMobileContentTextareaRows,
    shouldUseWorldInfoMobileHeaderLayout,
};
