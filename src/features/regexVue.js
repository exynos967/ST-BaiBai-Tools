import { getScriptsByType as getRegexScriptsByType, SCRIPT_TYPES as REGEX_SCRIPT_TYPES } from '@sillytavern/scripts/extensions/regex/engine';
import { t } from '@sillytavern/scripts/i18n';
import { isMobile } from '@sillytavern/scripts/RossAscends-mods';
import { LOG_PREFIX, REGEX_CONTAINER_SELECTOR, REGEX_PENDING_ASSIGNMENT_GROUP_ID, REGEX_UNGROUPED_GROUP_ID, REGEX_VUE_DRAGGING_BODY_CLASS, REGEX_VUE_DRAG_INDICATOR_CLASS, REGEX_VUE_DROP_TARGET_CLASS, REGEX_VUE_EMPTY_INSERT_THRESHOLD_PX, REGEX_VUE_GROUP_COLLAPSE_ANIMATION_MS, REGEX_VUE_GROUP_EXPAND_ANIMATION_MS, REGEX_VUE_GROUP_HEADER_DRAG_SUPPRESS_MS, REGEX_VUE_GROUP_HEADER_TOGGLE_DISTANCE_PX, REGEX_VUE_MANAGER_ROOT_ID, REGEX_VUE_MANAGER_STYLE_ID, REGEX_VUE_POINTER_START_THRESHOLD_PX, REGEX_VUE_TOUCH_START_THRESHOLD_PX } from './constants.js';
import { openOptimizedRegexEditorById, restoreRegexRowsAfterVueManagerRemove, saveRegexScriptsOrderFromModelSafely } from './regexEditor.js';
import { createRegexVueGroup, deleteRegexVueGroup, deleteRegexVueScriptWithConfirmation, exportRegexVueScript, getAllRegexVueScriptIds, getRegexVueSelectedContexts, getRegexVueSelectedCountForList, moveRegexVueGroup, moveRegexVueScriptWithConfirmation, promptBulkMoveRegexVueSelectedScriptsToGroup, pruneRegexVueSelection, renameRegexVueGroup, setRegexVueGroupScriptsDisabled, setRegexVueScriptDisabled, setRegexVueScriptSelected, toggleRegexVueGroupCollapsed } from './regexGroupOps.js';
import { getRegexGroupStateForScriptType, getRegexScriptTypeFromKey, getRegexScriptTypeKey, getRegexUngroupedGroupDisplayName, hydrateCurrentRegexPresetGroupStateFromExtension, normalizeRegexGroupState, saveRegexGroupSettings, syncRegexGroupScriptOrderMetaFromScriptArray } from './regexGroups.js';
import { disableNativeRegexSortables, enableNativeRegexSortables, getRegexScriptListDefinitions, scheduleNativeRegexSortableGuard } from './regexNative.js';
import { getRegexQuickOperationState } from './regexQuickOps.js';
import { settings } from './state.js';
import { areStringArraysEqual } from './util.js';

async function installRegexVueManager() {
    if (!settings.regexQuickOperationOptimizationEnabled) {
        return;
    }

    const manager = getRegexVueManagerState();

    if (manager.installing) {
        return manager.installing;
    }

    manager.installing = (async () => {
        if (!areRegexVueManagerTargetsReady()) {
            scheduleRegexVueManagerSync(250);
            return;
        }

        installRegexVueManagerStyle();
        disableNativeRegexSortables();

        if (manager.app) {
            if (!areRegexVueManagerTargetsOwned()) {
                reclaimRegexVueManagerTargets();
                scheduleNativeRegexSortableGuard(250);
                return;
            }

            syncRegexVueManagerState();
            scheduleNativeRegexSortableGuard(250);
            return;
        }

        const vue = await loadRegexVueModule();
        const vueDraggableNext = await loadRegexVueDraggableModule();
        manager.vue = vue;
        manager.vueDraggableNext = vueDraggableNext;
        manager.root = ensureRegexVueManagerRoot();
        manager.state = vue.reactive(createRegexVueManagerModel());
        manager.app = vue.createApp(createRegexVueManagerRootComponent(vue, vueDraggableNext, manager.state));

        clearRegexVueManagerTargets();
        manager.app.mount(manager.root);
        syncRegexVueManagerState();
        scheduleNativeRegexSortableGuard(250);
        updateRegexBulkControls();
    })();

    try {
        await manager.installing;
    } catch (error) {
        console.debug(`${LOG_PREFIX} Failed to install regex Vue manager`, error);
        toastr.error(t`Failed to install regex list manager. See console for details.`);

        if (!manager.app) {
            enableNativeRegexSortables();
        }
    } finally {
        manager.installing = null;
    }
}

function removeRegexVueManager() {
    const manager = getRegexVueManagerState();

    clearTimeout(manager.syncTimer);
    manager.syncTimer = null;
    clearRegexVueScriptManualDragState(manager);
    manager.groupHeaderGesture = null;
    setRegexVueDragCursorActive(false);

    if (manager.app) {
        try {
            manager.app.unmount();
        } catch (error) {
            console.debug(`${LOG_PREFIX} Failed to unmount regex Vue manager`, error);
        }
    }

    manager.app = null;
    manager.state = null;
    manager.root?.remove();
    manager.root = null;
    manager.installing = null;
    document.getElementById(REGEX_VUE_MANAGER_STYLE_ID)?.remove();
    void restoreRegexRowsAfterVueManagerRemove().finally(() => {
        enableNativeRegexSortables();
    });
}

function getRegexVueManagerState() {
    const state = getRegexQuickOperationState();

    if (!state.vueManager || typeof state.vueManager !== 'object') {
        state.vueManager = {
            app: null,
            root: null,
            state: null,
            vue: null,
            modulePromise: null,
            installing: null,
            syncTimer: null,
            suppressObserver: false,
            dragging: false,
            draggedScript: null,
            dragPlacement: null,
            dragLayoutCache: null,
            dragPlacementFrame: null,
            dragAutoScrollFrame: null,
            dragIndicatorElement: null,
            dragIndicatorRectKey: null,
            dragScrollContainer: null,
            lastDragPoint: null,
            lastDragEndedAt: 0,
            groupHeaderGesture: null,
            lastGroupHeaderToggleAt: 0,
            lastGroupHeaderGestureCanceledAt: 0,
        };
    }

    return state.vueManager;
}

function isRegexVueManagerActive() {
    return Boolean(getRegexVueManagerState().app && getRegexVueManagerState().state);
}

function areRegexVueManagerTargetsReady() {
    return getRegexScriptListDefinitions().every(({ selector }) => document.querySelector(selector) instanceof HTMLElement);
}

function scheduleRegexVueManagerSync(delayMs = 80) {
    if (!settings.regexQuickOperationOptimizationEnabled) {
        return;
    }

    const manager = getRegexVueManagerState();

    if (manager.suppressObserver) {
        return;
    }

    clearTimeout(manager.syncTimer);
    manager.syncTimer = setTimeout(() => {
        manager.syncTimer = null;

        if (!areRegexVueManagerTargetsReady()) {
            scheduleRegexVueManagerSync(250);
            return;
        }

        if (isRegexVueManagerActive() && areRegexVueManagerTargetsOwned()) {
            return;
        }

        void installRegexVueManager();
    }, delayMs);
}

async function loadRegexVueModule() {
    const manager = getRegexVueManagerState();

    if (!manager.modulePromise) {
        manager.modulePromise = import('vue');
    }

    return manager.modulePromise;
}

async function loadRegexVueDraggableModule() {
    const manager = getRegexVueManagerState();

    if (!manager.draggableModulePromise) {
        manager.draggableModulePromise = import('vue-draggable-next');
    }

    return manager.draggableModulePromise;
}

function ensureRegexVueManagerRoot() {
    let root = document.getElementById(REGEX_VUE_MANAGER_ROOT_ID);

    if (!root) {
        root = document.createElement('div');
        root.id = REGEX_VUE_MANAGER_ROOT_ID;
        root.className = 'displayNone';
        document.querySelector(REGEX_CONTAINER_SELECTOR)?.append(root);
    }

    return root;
}

function clearRegexVueManagerTargets() {
    const manager = getRegexVueManagerState();
    manager.suppressObserver = true;

    try {
        for (const { selector } of getRegexScriptListDefinitions()) {
            const target = document.querySelector(selector);

            if (target instanceof HTMLElement) {
                target.replaceChildren();
            }
        }
    } finally {
        setTimeout(() => {
            manager.suppressObserver = false;
        }, 0);
    }
}

function areRegexVueManagerTargetsOwned() {
    return getRegexScriptListDefinitions().every(({ selector }) => {
        const target = document.querySelector(selector);
        return target instanceof HTMLElement && target.querySelector(':scope > .bai-bai-regex-vue-list');
    });
}

function reclaimRegexVueManagerTargets() {
    const manager = getRegexVueManagerState();

    if (!manager.state) {
        return;
    }

    clearRegexVueManagerTargets();
    manager.state.reclaimKey += 1;
    updateRegexBulkControls();
}

function createRegexVueManagerModel() {
    return {
        renderKey: 0,
        reclaimKey: 0,
        lists: {
            global: createEmptyRegexVueListModel('global'),
            preset: createEmptyRegexVueListModel('preset'),
            scoped: createEmptyRegexVueListModel('scoped'),
        },
        selectedIds: {},
    };
}

function createEmptyRegexVueListModel(typeKey) {
    return {
        typeKey,
        scriptType: getRegexScriptTypeFromKey(typeKey),
        groups: [],
    };
}

function syncRegexVueManagerState() {
    const manager = getRegexVueManagerState();

    if (!manager.state) {
        return;
    }

    manager.state.lists.global = buildRegexVueListModel(REGEX_SCRIPT_TYPES.GLOBAL);
    manager.state.lists.preset = buildRegexVueListModel(REGEX_SCRIPT_TYPES.PRESET);
    manager.state.lists.scoped = buildRegexVueListModel(REGEX_SCRIPT_TYPES.SCOPED);
    pruneRegexVueSelection();
    manager.state.renderKey += 1;
    updateRegexBulkControls();
}

function syncRegexVueScopedListFromContext() {
    const manager = getRegexVueManagerState();

    if (!manager.state) {
        return;
    }

    manager.state.lists.scoped = buildRegexVueListModel(REGEX_SCRIPT_TYPES.SCOPED);
    pruneRegexVueSelection();
    updateRegexBulkControls();
}

function syncRegexVuePresetListFromContext({ forcePortableHydration = false } = {}) {
    const manager = getRegexVueManagerState();

    if (!manager.state) {
        return;
    }

    hydrateCurrentRegexPresetGroupStateFromExtension({ force: forcePortableHydration });
    manager.state.lists.preset = buildRegexVueListModel(REGEX_SCRIPT_TYPES.PRESET);
    pruneRegexVueSelection();
    updateRegexBulkControls();
}

async function syncRegexVueManagerAfterDataChange() {
    if (isRegexVueManagerActive()) {
        syncRegexVueManagerState();
    }
}

function buildRegexVueListModel(scriptType) {
    const typeKey = getRegexScriptTypeKey(scriptType);
    const scripts = getRegexScriptsByType(scriptType);
    if (scriptType === REGEX_SCRIPT_TYPES.PRESET) {
        hydrateCurrentRegexPresetGroupStateFromExtension();
    }
    const groupState = getRegexGroupStateForScriptType(scriptType);
    normalizeRegexGroupState(groupState);
    if (syncRegexGroupScriptOrderMetaFromScriptArray(groupState, scripts)) {
        saveRegexGroupSettings();
    }

    const groupsById = new Map();
    const realGroups = groupState.groups
        .slice()
        .sort((a, b) => Number(a.order ?? 0) - Number(b.order ?? 0))
        .map(group => ({
            id: group.id,
            name: group.name || t`Unnamed group`,
            collapsed: Boolean(group.collapsed),
            isUngrouped: false,
            scripts: [],
        }));

    for (const group of realGroups) {
        groupsById.set(group.id, group);
    }

    const pendingAssignment = {
        id: REGEX_PENDING_ASSIGNMENT_GROUP_ID,
        name: '',
        collapsed: false,
        isUngrouped: false,
        isPendingAssignment: true,
        scripts: [],
    };

    const ungrouped = {
        id: REGEX_UNGROUPED_GROUP_ID,
        name: getRegexUngroupedGroupDisplayName(groupState.ungrouped?.name),
        collapsed: Boolean(groupState.ungrouped?.collapsed),
        isUngrouped: true,
        isPendingAssignment: false,
        scripts: [],
    };

    for (let index = 0; index < scripts.length; index++) {
        const script = scripts[index];
        const meta = groupState.scripts?.[script?.id] ?? {};
        const targetGroup = meta.groupId === REGEX_PENDING_ASSIGNMENT_GROUP_ID
            ? pendingAssignment
            : groupsById.get(meta.groupId) ?? ungrouped;
        targetGroup.scripts.push({
            script,
            order: Number.isFinite(Number(meta.order)) ? Number(meta.order) : index,
        });
    }

    const groups = [pendingAssignment, ...realGroups, ungrouped]
        .map(group => ({
            ...group,
            scripts: group.scripts
                .sort((a, b) => a.order - b.order)
                .map(item => item.script),
        }))
        .filter(group => !group.isPendingAssignment || group.scripts.length > 0)
        .filter(group => !group.isUngrouped || group.scripts.length > 0 || realGroups.length === 0);

    return {
        typeKey,
        scriptType,
        groups,
    };
}

function createRegexVueManagerRootComponent(vue, vueDraggableNext, model) {
    const { h, Teleport, Fragment } = vue;

    return {
        name: 'BaiBaiRegexManagerRoot',
        render() {
            return h(Fragment, null, [
                renderRegexVueTeleport(h, vueDraggableNext, Teleport, model, 'global', '#saved_regex_scripts'),
                renderRegexVueTeleport(h, vueDraggableNext, Teleport, model, 'preset', '#saved_preset_scripts'),
                renderRegexVueTeleport(h, vueDraggableNext, Teleport, model, 'scoped', '#saved_scoped_scripts'),
            ]);
        },
    };
}

function renderRegexVueTeleport(h, vueDraggableNext, Teleport, model, typeKey, selector) {
    return h(Teleport, { to: selector }, [
        renderRegexVueList(h, vueDraggableNext, model, typeKey),
    ]);
}

function renderRegexVueList(h, vueDraggableNext, model, typeKey) {
    const list = model.lists[typeKey];
    const scriptCount = list.groups.reduce((count, group) => count + group.scripts.length, 0);
    const children = [
        renderRegexVueListToolbar(h, model, list),
    ];

    if (scriptCount === 0) {
        children.push(h('div', { class: 'bai-bai-regex-empty-list', key: 'empty' }, t`No scripts found`));
    }

    const groupChildren = list.groups.map(group => {
        const showGroupHeader = !group.isPendingAssignment;
        const groupChildren = [];

        if (showGroupHeader) {
            groupChildren.push(renderRegexVueGroupHeader(h, list, group));
        }

        groupChildren.push(renderRegexVueGroupBody(h, vueDraggableNext, model, list, group));

        return h('div', {
            class: [
                'bai-bai-regex-group',
                showGroupHeader ? 'bai-bai-regex-group-framed' : '',
                group.collapsed ? 'bai-bai-regex-group-collapsed' : '',
                group.isUngrouped ? 'bai-bai-regex-group-ungrouped' : '',
                group.isPendingAssignment ? 'bai-bai-regex-group-pending-assignment' : '',
            ],
            'data-regex-group-id': group.id,
            key: group.id,
        }, groupChildren);
    });

    children.push(h('div', {
        class: 'bai-bai-regex-groups flex-container flexFlowColumn',
        key: 'groups',
    }, groupChildren));

    return h('div', {
        class: 'bai-bai-regex-vue-list flex-container flexFlowColumn',
        'data-regex-type': typeKey,
        key: `${typeKey}-reclaim-${model.reclaimKey}`,
    }, children);
}

function renderRegexVueGroupBody(h, vueDraggableNext, model, list, group) {
    const rowRender = () => group.scripts.map(script => renderRegexVueScriptRow(h, model, list, script));
    const draggableProps = {
        class: [
            'bai-bai-regex-group-list flex-container flexFlowColumn',
            group.scripts.length === 0 ? 'bai-bai-regex-group-list-empty' : '',
        ],
        'data-regex-type': list.typeKey,
        'data-regex-group-id': group.id,
        list: group.scripts,
        group: { name: `bai-bai-regex-scripts-${list.typeKey}`, pull: true, put: true },
        draggable: '.regex-script-label',
        handle: '.bai-bai-regex-script-drag-handle',
        itemKey: 'id',
        sort: false,
        animation: 0,
        emptyInsertThreshold: REGEX_VUE_EMPTY_INSERT_THRESHOLD_PX,
        forceFallback: true,
        fallbackOnBody: true,
        fallbackClass: 'bai-bai-regex-sortable-fallback',
        ghostClass: 'bai-bai-regex-sortable-ghost',
        chosenClass: 'bai-bai-regex-sortable-chosen',
        dragClass: 'bai-bai-regex-sortable-drag',
        move: event => handleRegexVueScriptDragMove(event, list.typeKey),
        key: `list-${group.id}`,
        onChoose: () => setRegexVueDragCursorActive(true),
        onStart: event => beginRegexVueScriptManualDrag(model, event, list.typeKey),
        onUnchoose: () => {
            if (!getRegexVueManagerState().dragging) {
                setRegexVueDragCursorActive(false);
            }
        },
        onEnd: event => {
            const changed = finishRegexVueScriptManualDrag(model, event, list.typeKey);
            setRegexVueDragCursorActive(false);

            if (changed) {
                saveRegexScriptsOrderFromModelSafely(list.typeKey);
            }
        },
    };

    applyRegexVueDragGestureOptions(draggableProps);

    return h('div', {
        class: [
            'bai-bai-regex-group-body flex-container flexFlowColumn',
            group.scripts.length === 0 ? 'bai-bai-regex-group-body-empty' : '',
        ],
        'data-regex-type': list.typeKey,
        'data-regex-group-id': group.id,
        key: `body-${group.id}`,
        'aria-hidden': group.collapsed ? 'true' : 'false',
    }, [
        h('div', { class: 'bai-bai-regex-group-body-inner' }, [
            h(vueDraggableNext.VueDraggableNext, draggableProps, { default: rowRender }),
        ]),
    ]);
}

function renderRegexVueListToolbar(h, model, list) {
    const selectedCount = getRegexVueSelectedCountForList(model, list);
    const hasSelectedScripts = selectedCount > 0;

    return h('div', { class: 'bai-bai-regex-list-toolbar flex-container', key: 'toolbar' }, [
        h('div', {
            class: 'bai-bai-regex-list-toolbar-btn bai-bai-regex-create-group-btn',
            title: t`Create regex group`,
            onClick: () => void createRegexVueGroup(list.scriptType),
        }, [
            h('i', { class: 'fa-solid fa-folder-plus margin-r5' }),
            h('span', null, t`Create Group`),
        ]),
        h('div', {
            class: [
                'bai-bai-regex-list-toolbar-btn',
                'bai-bai-regex-bulk-move-group-btn',
                hasSelectedScripts ? '' : 'disabled',
            ],
            title: hasSelectedScripts
                ? t`将已选正则移动到分组`
                : t`先选择要移动的正则`,
            onClick: () => {
                if (!hasSelectedScripts) {
                    toastr.warning(t`No regex scripts selected for moving.`);
                    return;
                }

                void promptBulkMoveRegexVueSelectedScriptsToGroup(list.scriptType);
            },
        }, [
            h('i', { class: 'fa-solid fa-folder-tree margin-r5' }),
            h('span', null, t`移动到分组...`),
        ]),
    ]);
}

function renderRegexVueGroupHeader(h, list, group) {
    const scriptCount = group.scripts.length;
    const enabledCount = group.scripts.filter(script => !Boolean(script?.disabled ?? false)).length;
    const allDisabled = scriptCount > 0 && enabledCount === 0;
    const realGroupIds = list.groups
        .filter(item => !item.isUngrouped && !item.isPendingAssignment)
        .map(item => item.id);
    const groupIndex = realGroupIds.indexOf(group.id);
    const canMoveGroupUp = groupIndex > 0;
    const canMoveGroupDown = groupIndex >= 0 && groupIndex < realGroupIds.length - 1;

    return h('div', {
        class: ['bai-bai-regex-group-header', 'flex-container', 'flexnowrap', group.collapsed ? 'collapsed' : ''],
        key: `header-${group.id}`,
        onPointerdown: event => beginRegexVueGroupHeaderGesture(event, list.scriptType, group.id),
        onPointermoveCapture: event => moveRegexVueGroupHeaderGesture(event, list.scriptType, group.id),
        onPointerup: event => finishRegexVueGroupHeaderGesture(event, list.scriptType, group.id),
        onPointercancel: () => cancelRegexVueGroupHeaderGesture(list.scriptType, group.id),
        onClick: event => handleRegexVueGroupHeaderClickFallback(event, list.scriptType, group.id),
    }, [
        h('span', {
            class: ['bai-bai-regex-group-toggle fa-solid fa-chevron-down'],
            title: group.collapsed ? t`Expand` : t`Collapse`,
            onClick: event => {
                event.preventDefault();
                event.stopPropagation();
                toggleRegexVueGroupCollapsed(list.scriptType, group.id);
            },
        }),
        h('div', { class: 'bai-bai-regex-group-title flex-container flex1 overflow-hidden' }, [
            h('strong', { class: 'bai-bai-regex-group-name overflow-hidden', title: group.name }, group.name),
            h('small', { class: 'bai-bai-regex-group-count' }, String(group.scripts.length)),
        ]),
        h('label', {
            class: 'checkbox flex-container margin-r5',
            title: allDisabled ? t`Enable all scripts in group` : t`Disable all scripts in group`,
            onClick: event => event.stopPropagation(),
        }, [
            h('input', {
                type: 'checkbox',
                class: 'disable_regex',
                checked: allDisabled,
                disabled: scriptCount === 0,
                onChange: event => void setRegexVueGroupScriptsDisabled(list.scriptType, group.id, Boolean(event.target?.checked)),
            }),
            h('span', {
                class: 'regex-toggle-on fa-solid fa-toggle-on',
                title: t`Disable all scripts in group`,
                onClick: event => {
                    event.preventDefault();
                    event.stopPropagation();
                    void setRegexVueGroupScriptsDisabled(list.scriptType, group.id, true);
                },
            }),
            h('span', {
                class: 'regex-toggle-off fa-solid fa-toggle-off',
                title: t`Enable all scripts in group`,
                onClick: event => {
                    event.preventDefault();
                    event.stopPropagation();
                    void setRegexVueGroupScriptsDisabled(list.scriptType, group.id, false);
                },
            }),
        ]),
        !group.isUngrouped && h('div', {
            class: ['menu_button', 'bai-bai-regex-group-move-btn', 'fa-solid', 'fa-arrow-up', canMoveGroupUp ? '' : 'disabled'],
            title: canMoveGroupUp ? t`Move group up` : t`Already first group`,
            onClick: event => {
                event.preventDefault();
                event.stopPropagation();
                moveRegexVueGroup(list.scriptType, group.id, -1);
            },
        }),
        !group.isUngrouped && h('div', {
            class: ['menu_button', 'bai-bai-regex-group-move-btn', 'fa-solid', 'fa-arrow-down', canMoveGroupDown ? '' : 'disabled'],
            title: canMoveGroupDown ? t`Move group down` : t`Already last group`,
            onClick: event => {
                event.preventDefault();
                event.stopPropagation();
                moveRegexVueGroup(list.scriptType, group.id, 1);
            },
        }),
        h('div', {
            class: 'menu_button fa-solid fa-pencil',
            title: t`Rename group`,
            onClick: () => void renameRegexVueGroup(list.scriptType, group.id),
        }),
        !group.isUngrouped && h('div', {
            class: 'menu_button fa-solid fa-trash',
            title: t`Delete group`,
            onClick: () => void deleteRegexVueGroup(list.scriptType, group.id),
        }),
    ].filter(Boolean));
}

function beginRegexVueGroupHeaderGesture(event, scriptType, groupId) {
    if (isRegexVueGroupHeaderInteractiveEvent(event)) {
        return;
    }

    if (event.pointerType === 'mouse' && event.button !== 0) {
        return;
    }

    if (event.isPrimary === false) {
        return;
    }

    const point = getRegexVuePointerEventPoint(event);

    if (!point) {
        return;
    }

    const manager = getRegexVueManagerState();
    manager.groupHeaderGesture = {
        scriptType,
        groupId,
        pointerId: event.pointerId,
        x: point.clientX,
        y: point.clientY,
        canceled: false,
    };
}

function moveRegexVueGroupHeaderGesture(event, scriptType, groupId) {
    const manager = getRegexVueManagerState();
    const gesture = manager.groupHeaderGesture;

    if (!gesture || gesture.scriptType !== scriptType || gesture.groupId !== groupId || gesture.pointerId !== event.pointerId) {
        return;
    }

    const point = getRegexVuePointerEventPoint(event);

    if (!point) {
        return;
    }

    if (getRegexVuePointDistance(gesture, point) > REGEX_VUE_GROUP_HEADER_TOGGLE_DISTANCE_PX) {
        gesture.canceled = true;
        manager.lastGroupHeaderGestureCanceledAt = Date.now();
    }
}

function finishRegexVueGroupHeaderGesture(event, scriptType, groupId) {
    const manager = getRegexVueManagerState();
    const gesture = manager.groupHeaderGesture;

    if (!gesture || gesture.scriptType !== scriptType || gesture.groupId !== groupId || gesture.pointerId !== event.pointerId) {
        return;
    }

    manager.groupHeaderGesture = null;

    if (isRegexVueGroupHeaderInteractiveEvent(event) || shouldSuppressRegexVueGroupHeaderToggle(manager)) {
        return;
    }

    const point = getRegexVuePointerEventPoint(event);

    if (!point || gesture.canceled || getRegexVuePointDistance(gesture, point) > REGEX_VUE_GROUP_HEADER_TOGGLE_DISTANCE_PX) {
        manager.lastGroupHeaderGestureCanceledAt = Date.now();
        return;
    }

    if (event.cancelable) {
        event.preventDefault();
    }

    event.stopPropagation();
    manager.lastGroupHeaderToggleAt = Date.now();
    toggleRegexVueGroupCollapsed(scriptType, groupId);
}

function cancelRegexVueGroupHeaderGesture(scriptType, groupId) {
    const manager = getRegexVueManagerState();

    if (manager.groupHeaderGesture?.scriptType === scriptType && manager.groupHeaderGesture?.groupId === groupId) {
        manager.groupHeaderGesture = null;
        manager.lastGroupHeaderGestureCanceledAt = Date.now();
    }
}

function handleRegexVueGroupHeaderClickFallback(event, scriptType, groupId) {
    const manager = getRegexVueManagerState();

    if (isRegexVueGroupHeaderInteractiveEvent(event)) {
        return;
    }

    const now = Date.now();

    if (
        now - (manager.lastGroupHeaderToggleAt || 0) < REGEX_VUE_GROUP_HEADER_DRAG_SUPPRESS_MS
        || now - (manager.lastGroupHeaderGestureCanceledAt || 0) < REGEX_VUE_GROUP_HEADER_DRAG_SUPPRESS_MS
        || shouldSuppressRegexVueGroupHeaderToggle(manager)
    ) {
        if (event.cancelable) {
            event.preventDefault();
        }

        event.stopPropagation();
        return;
    }

    manager.lastGroupHeaderToggleAt = now;
    toggleRegexVueGroupCollapsed(scriptType, groupId);
}

function shouldSuppressRegexVueGroupHeaderToggle(manager = getRegexVueManagerState()) {
    return Boolean(
        manager.dragging
        || Date.now() - (manager.lastDragEndedAt || 0) < REGEX_VUE_GROUP_HEADER_DRAG_SUPPRESS_MS,
    );
}

function isRegexVueGroupHeaderInteractiveEvent(event) {
    const target = event.target instanceof Element ? event.target : null;
    return Boolean(target?.closest('.bai-bai-regex-group-toggle, .menu_button, .checkbox, input, label, button, select, textarea, a, [contenteditable="true"]'));
}

function getRegexVuePointerEventPoint(event) {
    if (typeof event?.clientX !== 'number' || typeof event?.clientY !== 'number') {
        return null;
    }

    return {
        clientX: event.clientX,
        clientY: event.clientY,
    };
}

function getRegexVuePointDistance(start, end) {
    return Math.hypot(end.clientX - start.x, end.clientY - start.y);
}

function renderRegexVueScriptRow(h, model, list, script) {
    const checked = Boolean(model.selectedIds[script.id]);

    return h('div', {
        id: script.id,
        key: script.id,
        class: 'regex-script-label flex-container flexnowrap',
        'data-regex-script-id': script.id,
        'data-regex-type': list.typeKey,
    }, [
        h('input', {
            type: 'checkbox',
            class: 'regex_bulk_checkbox',
            checked,
            onChange: event => setRegexVueScriptSelected(script.id, Boolean(event.target?.checked)),
        }),
        h('span', { class: 'menu-handle bai-bai-regex-script-drag-handle' }, '\u2630'),
        h('div', {
            class: 'regex_script_name flex1 overflow-hidden',
            title: script.scriptName || '',
        }, script.scriptName || ''),
        h('div', { class: 'flex-container flexnowrap' }, [
            h('label', { class: 'checkbox flex-container margin-r5', for: 'regex_disable' }, [
                h('input', {
                    type: 'checkbox',
                    name: 'regex_disable',
                    class: 'disable_regex',
                    checked: Boolean(script.disabled ?? false),
                    onChange: event => void setRegexVueScriptDisabled(list.scriptType, script.id, Boolean(event.target?.checked)),
                }),
                h('span', {
                    class: 'regex-toggle-on fa-solid fa-toggle-on',
                    title: t`Disable script`,
                    onClick: event => {
                        event.preventDefault();
                        event.stopPropagation();
                        void setRegexVueScriptDisabled(list.scriptType, script.id, true);
                    },
                }),
                h('span', {
                    class: 'regex-toggle-off fa-solid fa-toggle-off',
                    title: t`Enable script`,
                    onClick: event => {
                        event.preventDefault();
                        event.stopPropagation();
                        void setRegexVueScriptDisabled(list.scriptType, script.id, false);
                    },
                }),
            ]),
            h('label', { class: 'menu_button regex_script_expand', title: t`Show more options` }, [
                h('input', { type: 'checkbox', name: 'regex_expand' }),
                h('span', { class: 'fa-solid fa-ellipsis' }),
            ]),
            h('div', { class: 'flex-container regex_script_buttons' }, [
                h('div', {
                    class: 'move_to_global menu_button',
                    title: t`Move to global scripts`,
                    onClick: () => void moveRegexVueScriptWithConfirmation(list.scriptType, script.id, REGEX_SCRIPT_TYPES.GLOBAL),
                }, [h('i', { class: 'fa-solid fa-globe' })]),
                h('div', {
                    class: 'move_to_preset menu_button',
                    title: t`Move to preset scripts`,
                    onClick: () => void moveRegexVueScriptWithConfirmation(list.scriptType, script.id, REGEX_SCRIPT_TYPES.PRESET),
                }, [h('i', { class: 'fa-solid fa-sliders' })]),
                h('div', {
                    class: 'move_to_scoped menu_button',
                    title: t`Move to scoped scripts`,
                    onClick: () => void moveRegexVueScriptWithConfirmation(list.scriptType, script.id, REGEX_SCRIPT_TYPES.SCOPED),
                }, [h('i', { class: 'fa-solid fa-address-card' })]),
                h('div', {
                    class: 'export_regex menu_button',
                    title: t`Export script`,
                    onClick: () => exportRegexVueScript(list.scriptType, script.id),
                }, [h('i', { class: 'fa-solid fa-file-export' })]),
            ]),
            h('div', {
                class: 'edit_existing_regex menu_button',
                title: t`Edit script`,
                onClick: () => void openOptimizedRegexEditorById(list.scriptType, script.id),
            }, [h('i', { class: 'fa-solid fa-pencil' })]),
            h('div', {
                class: 'delete_regex menu_button',
                title: t`Delete script`,
                onClick: () => void deleteRegexVueScriptWithConfirmation(list.scriptType, script.id),
            }, [h('i', { class: 'fa-solid fa-trash' })]),
        ]),
    ]);
}

function isRegexVueScriptDragMoveAllowed(event, typeKey) {
    const scriptType = getRegexScriptTypeFromKey(typeKey);
    const draggedScript = event?.draggedContext?.element;
    const to = event?.to;
    const from = event?.from;

    if (scriptType === null || !draggedScript?.id || !(to instanceof HTMLElement) || !(from instanceof HTMLElement)) {
        return false;
    }

    if (!to.matches('.bai-bai-regex-group-list') || !from.matches('.bai-bai-regex-group-list')) {
        return false;
    }

    if (to.dataset.regexType !== typeKey || from.dataset.regexType !== typeKey) {
        return false;
    }

    return getRegexScriptsByType(scriptType).some(script => script?.id === draggedScript.id);
}

function handleRegexVueScriptDragMove(event, typeKey) {
    const allowed = isRegexVueScriptDragMoveAllowed(event, typeKey);

    if (allowed) {
        updateRegexVueScriptManualDragPlacementFromEvent(event?.originalEvent ?? event);
    }

    return false;
}

function applyRegexVueDragGestureOptions(draggableProps) {
    Object.assign(draggableProps, {
        touchStartThreshold: isMobile() ? REGEX_VUE_TOUCH_START_THRESHOLD_PX : REGEX_VUE_POINTER_START_THRESHOLD_PX,
        fallbackTolerance: isMobile() ? REGEX_VUE_TOUCH_START_THRESHOLD_PX : REGEX_VUE_POINTER_START_THRESHOLD_PX,
    });
}

function beginRegexVueScriptManualDrag(model, event, typeKey) {
    const manager = getRegexVueManagerState();
    const list = model?.lists?.[typeKey];
    const draggedScript = getRegexVueScriptDragItemFromEvent(event, typeKey);

    manager.groupHeaderGesture = null;
    clearRegexVueScriptManualDragState(manager);

    if (!list || !draggedScript) {
        setRegexVueDragCursorActive(true);
        return;
    }

    setRegexVueScriptManualDragging(true, manager);
    manager.draggedScript = draggedScript;
    manager.dragLayoutCache = createRegexVueScriptManualDragLayoutCache(list, draggedScript);
    manager.dragScrollContainer = getRegexVueDragScrollContainer(getRegexVueListElement(typeKey));
    manager.lastDragStartedAt = Date.now();
    setRegexVueDragCursorActive(true);
    startRegexVueScriptManualDragPlacementListeners(manager);
    updateRegexVueScriptManualDragPlacementFromEvent(event?.originalEvent ?? event);
}

function finishRegexVueScriptManualDrag(model, event = null, typeKey = null) {
    const manager = getRegexVueManagerState();
    const dragTypeKey = typeKey || manager.draggedScript?.typeKey;
    const list = dragTypeKey ? model?.lists?.[dragTypeKey] : null;
    const point = getRegexVueDragPoint(event?.originalEvent ?? event);

    if (point) {
        manager.lastDragPoint = point;
        updateRegexVueScriptManualDragPlacement(list, point);
    }

    const changed = applyRegexVueScriptManualDrop(list, manager.dragPlacement);
    setRegexVueScriptManualDragging(false, manager);
    manager.lastDragEndedAt = Date.now();
    clearRegexVueScriptManualDragState(manager);
    return changed;
}

function getRegexVueScriptDragItemFromEvent(event, typeKey) {
    const item = event?.item;
    const contextElement = event?.draggedContext?.element;
    const from = event?.from;
    const scriptId = item instanceof HTMLElement
        ? item.dataset.regexScriptId
        : contextElement?.id;
    const sourceGroupId = from instanceof HTMLElement
        ? from.dataset.regexGroupId
        : item instanceof HTMLElement
            ? item.closest('.bai-bai-regex-group-list')?.dataset.regexGroupId
            : null;

    if (!scriptId || !sourceGroupId) {
        return null;
    }

    return {
        typeKey,
        scriptId,
        sourceGroupId,
    };
}

function startRegexVueScriptManualDragPlacementListeners(manager = getRegexVueManagerState()) {
    stopRegexVueScriptManualDragPlacementListeners(manager);

    const pointermove = event => updateRegexVueScriptManualDragPlacementFromEvent(event);
    const mousemove = event => {
        if (manager.draggedScript) {
            updateRegexVueScriptManualDragPlacementFromEvent(event);
        }
    };
    const touchmove = event => updateRegexVueScriptManualDragPlacementFromEvent(event);

    document.addEventListener('pointermove', pointermove, true);
    document.addEventListener('mousemove', mousemove, true);
    document.addEventListener('touchmove', touchmove, { capture: true, passive: true });
    manager.dragPlacementListeners = { pointermove, mousemove, touchmove };
}

function stopRegexVueScriptManualDragPlacementListeners(manager = getRegexVueManagerState()) {
    const listeners = manager.dragPlacementListeners;

    if (!listeners) {
        return;
    }

    document.removeEventListener('pointermove', listeners.pointermove, true);
    document.removeEventListener('mousemove', listeners.mousemove, true);
    document.removeEventListener('touchmove', listeners.touchmove, true);
    manager.dragPlacementListeners = null;
}

function updateRegexVueScriptManualDragPlacementFromEvent(event) {
    const point = getRegexVueDragPoint(event);
    const manager = getRegexVueManagerState();

    if (!point) {
        return false;
    }

    manager.lastDragPoint = point;
    scheduleRegexVueScriptManualDragPlacementFrame(manager);
    return true;
}

function scheduleRegexVueScriptManualDragPlacementFrame(manager = getRegexVueManagerState()) {
    if (manager.dragPlacementFrame) {
        return;
    }

    manager.dragPlacementFrame = requestAnimationFrame(() => {
        manager.dragPlacementFrame = null;
        const typeKey = manager.draggedScript?.typeKey;
        const list = typeKey ? manager.state?.lists?.[typeKey] : null;
        updateRegexVueScriptManualDragPlacement(list, manager.lastDragPoint);
        scheduleRegexVueScriptManualDragAutoScroll(manager);
    });
}

function updateRegexVueScriptManualDragPlacement(list, point) {
    const manager = getRegexVueManagerState();
    const draggedScript = manager.draggedScript;

    if (!list || !point || !draggedScript) {
        clearRegexVueScriptManualDragPlacement(manager);
        return false;
    }

    const placement = getRegexVueScriptManualDragPlacementAtPoint(list, draggedScript, point);

    if (!placement) {
        clearRegexVueScriptManualDragPlacement(manager);
        return false;
    }

    manager.dragPlacement = placement;
    setRegexVueDropTargetFromList(placement.groupElement);
    updateRegexVueScriptManualDragIndicator(manager, placement);
    return true;
}

function getRegexVueScriptManualDragPlacementAtPoint(list, draggedScript, point) {
    const layout = getRegexVueScriptManualDragLayoutCache(list, draggedScript);
    const groupLayout = getRegexVueScriptManualGroupLayoutAtPoint(layout, point);

    if (!groupLayout) {
        return null;
    }

    const index = getRegexVueScriptManualDropIndexFromLayout(groupLayout, point);

    return {
        targetType: 'group',
        typeKey: list.typeKey,
        groupId: groupLayout.groupId,
        groupElement: groupLayout.groupElement,
        containerElement: groupLayout.containerElement,
        containerRect: groupLayout.containerRect,
        children: groupLayout.children,
        index,
        indicatorRect: getRegexVueScriptManualIndicatorRectFromLayout(groupLayout, index),
        draggedScript,
    };
}

function getRegexVueScriptManualDragLayoutCache(list, draggedScript) {
    const manager = getRegexVueManagerState();
    const cache = manager.dragLayoutCache;

    if (
        cache
        && cache.draggedScript?.typeKey === draggedScript?.typeKey
        && cache.draggedScript?.scriptId === draggedScript?.scriptId
        && getRegexVueScriptManualDragLayoutScrollSignature(cache) === cache.scrollSignature
    ) {
        return cache;
    }

    manager.dragLayoutCache = createRegexVueScriptManualDragLayoutCache(list, draggedScript);
    return manager.dragLayoutCache;
}

function createRegexVueScriptManualDragLayoutCache(list, draggedScript) {
    const listElement = getRegexVueListElement(list?.typeKey);

    if (!list || !draggedScript || !(listElement instanceof HTMLElement)) {
        return null;
    }

    const groups = [];

    for (const groupElement of listElement.querySelectorAll('.bai-bai-regex-group:not(.bai-bai-regex-group-collapsed)')) {
        if (!(groupElement instanceof HTMLElement)) {
            continue;
        }

        const groupId = groupElement.dataset.regexGroupId;
        const containerElement = groupElement.querySelector('.bai-bai-regex-group-list');

        if (!groupId || !(containerElement instanceof HTMLElement)) {
            continue;
        }

        groups.push({
            groupId,
            groupElement,
            hitRect: getRegexVueElementRect(groupElement),
            ...createRegexVueScriptManualContainerLayout(containerElement, draggedScript),
        });
    }

    const cache = {
        draggedScript: { ...draggedScript },
        groups,
        scrollSignature: '',
    };

    cache.scrollSignature = getRegexVueScriptManualDragLayoutScrollSignature(cache);
    return cache;
}

function createRegexVueScriptManualContainerLayout(containerElement, draggedScript) {
    return {
        containerElement,
        containerRect: getRegexVueElementRect(containerElement),
        children: getRegexVueScriptManualDropChildren(containerElement, draggedScript)
            .map(element => ({
                element,
                rect: getRegexVueElementRect(element),
            })),
    };
}

function getRegexVueElementRect(element) {
    const rect = element.getBoundingClientRect();

    return {
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
    };
}

function getRegexVueScriptManualDragLayoutScrollSignature(cache) {
    const parts = [window.scrollX || 0, window.scrollY || 0];
    const seen = new Set();

    for (const group of cache?.groups ?? []) {
        const element = group.containerElement;

        if (!(element instanceof HTMLElement) || seen.has(element)) {
            continue;
        }

        seen.add(element);
        parts.push(element.scrollLeft || 0, element.scrollTop || 0);
    }

    return parts.join(':');
}

function getRegexVueScriptManualGroupLayoutAtPoint(layout, point) {
    if (!layout || !point) {
        return null;
    }

    const margin = REGEX_VUE_EMPTY_INSERT_THRESHOLD_PX;
    let bestGroup = null;
    let bestDistance = Infinity;

    for (const group of layout.groups ?? []) {
        const rect = group.hitRect;

        if (
            point.clientX < rect.left - margin
            || point.clientX > rect.right + margin
            || point.clientY < rect.top - margin / 2
            || point.clientY > rect.bottom + margin
        ) {
            continue;
        }

        const verticalDistance = point.clientY < rect.top
            ? rect.top - point.clientY
            : point.clientY > rect.bottom
                ? point.clientY - rect.bottom
                : 0;

        if (verticalDistance < bestDistance) {
            bestDistance = verticalDistance;
            bestGroup = group;
        }
    }

    return bestGroup;
}

function getRegexVueScriptManualDropIndexFromLayout(containerLayout, point) {
    const children = containerLayout?.children ?? [];
    let index = 0;

    for (const child of children) {
        const rect = child.rect;

        if (point.clientY < rect.top + rect.height / 2) {
            return Math.max(0, Math.min(index, children.length));
        }

        index += 1;
    }

    return children.length;
}

function getRegexVueScriptManualIndicatorRectFromLayout(containerLayout, index) {
    const containerRect = containerLayout?.containerRect;

    if (!containerRect) {
        return null;
    }

    const children = containerLayout.children ?? [];
    const target = children[index];
    let top = containerRect.top;

    if (target) {
        top = target.rect.top;
    } else if (children.length) {
        top = children[children.length - 1].rect.bottom;
    }

    return {
        left: containerRect.left,
        top,
        width: containerRect.width,
    };
}

function getRegexVueScriptManualDropChildren(containerElement, draggedScript) {
    return Array.from(containerElement?.children ?? []).filter(child => child instanceof HTMLElement
        && !isRegexVueTransientDragElement(child)
        && !isRegexVueDraggedDomElement(child, draggedScript));
}

function isRegexVueTransientDragElement(element) {
    return element.classList.contains('bai-bai-regex-sortable-fallback')
        || element.classList.contains('bai-bai-regex-sortable-ghost')
        || element.classList.contains('bai-bai-regex-sortable-chosen')
        || element.classList.contains('bai-bai-regex-sortable-drag');
}

function isRegexVueDraggedDomElement(element, draggedScript) {
    return Boolean(
        element instanceof HTMLElement
        && draggedScript?.scriptId
        && element.dataset.regexScriptId === draggedScript.scriptId,
    );
}

function updateRegexVueScriptManualDragIndicator(manager, placement) {
    const indicator = ensureRegexVueScriptManualDragIndicator(manager);
    const rect = placement?.indicatorRect;

    if (!indicator || !rect) {
        clearRegexVueScriptManualDragIndicator(manager);
        return;
    }

    const rectKey = `${Math.round(rect.left)}:${Math.round(rect.top)}:${Math.round(rect.width)}`;

    if (manager.dragIndicatorRectKey === rectKey) {
        return;
    }

    manager.dragIndicatorRectKey = rectKey;
    indicator.style.left = `${rect.left}px`;
    indicator.style.top = `${Math.round(rect.top - 1)}px`;
    indicator.style.width = `${rect.width}px`;
}

function ensureRegexVueScriptManualDragIndicator(manager = getRegexVueManagerState()) {
    if (manager.dragIndicatorElement instanceof HTMLElement && manager.dragIndicatorElement.isConnected) {
        return manager.dragIndicatorElement;
    }

    const indicator = document.createElement('div');
    indicator.className = REGEX_VUE_DRAG_INDICATOR_CLASS;
    document.body.append(indicator);
    manager.dragIndicatorElement = indicator;
    return indicator;
}

function clearRegexVueScriptManualDragIndicator(manager = getRegexVueManagerState()) {
    manager.dragIndicatorElement?.remove?.();
    manager.dragIndicatorElement = null;
    manager.dragIndicatorRectKey = null;
}

function clearRegexVueScriptManualDragPlacement(manager = getRegexVueManagerState()) {
    manager.dragPlacement = null;
    clearRegexVueDropTarget();
    clearRegexVueScriptManualDragIndicator(manager);
}

function clearRegexVueScriptManualDragState(manager = getRegexVueManagerState()) {
    stopRegexVueScriptManualDragPlacementListeners(manager);

    if (manager.dragPlacementFrame) {
        cancelAnimationFrame(manager.dragPlacementFrame);
        manager.dragPlacementFrame = null;
    }

    if (manager.dragAutoScrollFrame) {
        cancelAnimationFrame(manager.dragAutoScrollFrame);
        manager.dragAutoScrollFrame = null;
    }

    clearRegexVueScriptManualDragPlacement(manager);
    setRegexVueScriptManualDragging(false, manager);
    manager.draggedScript = null;
    manager.dragLayoutCache = null;
    manager.dragScrollContainer = null;
    manager.lastDragPoint = null;
}

function applyRegexVueScriptManualDrop(list, placement) {
    const draggedScript = placement?.draggedScript;
    const targetGroupId = placement?.groupId;

    if (!list || !draggedScript?.scriptId || !targetGroupId) {
        return false;
    }

    const targetGroup = list.groups.find(group => group.id === targetGroupId);

    if (!targetGroup) {
        return false;
    }

    const before = getRegexVueListSnapshot(list);
    const script = removeRegexVueScriptFromListModel(list, draggedScript.scriptId);

    if (!script) {
        return false;
    }

    targetGroup.scripts = Array.isArray(targetGroup.scripts) ? targetGroup.scripts : [];
    targetGroup.scripts.splice(Math.max(0, Math.min(Number(placement.index) || 0, targetGroup.scripts.length)), 0, script);
    return !areStringArraysEqual(before, getRegexVueListSnapshot(list));
}

function removeRegexVueScriptFromListModel(list, scriptId) {
    for (const group of list?.groups ?? []) {
        const scripts = Array.isArray(group.scripts) ? group.scripts : [];
        const index = scripts.findIndex(script => script?.id === scriptId);

        if (index >= 0) {
            return scripts.splice(index, 1)[0];
        }
    }

    return null;
}

function getRegexVueListSnapshot(list) {
    return (list?.groups ?? []).flatMap(group => (group.scripts ?? []).map(script => `${group.id}:${script?.id ?? ''}`));
}

function scheduleRegexVueScriptManualDragAutoScroll(manager = getRegexVueManagerState()) {
    if (manager.dragAutoScrollFrame || !manager.draggedScript || !manager.lastDragPoint) {
        return;
    }

    manager.dragAutoScrollFrame = requestAnimationFrame(() => {
        manager.dragAutoScrollFrame = null;

        if (!manager.draggedScript || !manager.lastDragPoint) {
            return;
        }

        const scrolled = autoScrollRegexVueScriptManualDragContainer(manager);

        if (!scrolled) {
            return;
        }

        manager.dragLayoutCache = null;
        scheduleRegexVueScriptManualDragPlacementFrame(manager);
        scheduleRegexVueScriptManualDragAutoScroll(manager);
    });
}

function autoScrollRegexVueScriptManualDragContainer(manager = getRegexVueManagerState()) {
    const container = manager.dragScrollContainer;
    const point = manager.lastDragPoint;

    if (!container || !point) {
        return false;
    }

    const rect = container === document.scrollingElement || container === document.documentElement || container === document.body
        ? { top: 0, bottom: window.innerHeight || document.documentElement.clientHeight || 0 }
        : container.getBoundingClientRect();
    const edge = 56;
    const maxStep = 18;
    let delta = 0;

    if (point.clientY < rect.top + edge) {
        delta = -Math.ceil(maxStep * (1 - Math.max(0, point.clientY - rect.top) / edge));
    } else if (point.clientY > rect.bottom - edge) {
        delta = Math.ceil(maxStep * (1 - Math.max(0, rect.bottom - point.clientY) / edge));
    }

    if (!delta) {
        return false;
    }

    const before = container.scrollTop;
    container.scrollTop += delta;
    return container.scrollTop !== before;
}

function getRegexVueDragScrollContainer(source) {
    let current = source instanceof Element ? source.parentElement : null;

    while (current && current !== document.body && current !== document.documentElement) {
        const style = getComputedStyle(current);
        const canScrollY = /(auto|scroll|overlay)/.test(style.overflowY);

        if (canScrollY && current.scrollHeight > current.clientHeight) {
            return current;
        }

        current = current.parentElement;
    }

    return document.scrollingElement || document.documentElement;
}

function getRegexVueListElement(typeKey) {
    if (!typeKey) {
        return null;
    }

    return document.querySelector(`.bai-bai-regex-vue-list[data-regex-type="${typeKey}"]`);
}

function getRegexVueDragPoint(event) {
    if (!event) {
        return null;
    }

    if (typeof event.clientX === 'number' && typeof event.clientY === 'number') {
        return {
            clientX: event.clientX,
            clientY: event.clientY,
        };
    }

    const touch = event.touches?.[0] ?? event.changedTouches?.[0];

    if (touch && typeof touch.clientX === 'number' && typeof touch.clientY === 'number') {
        return {
            clientX: touch.clientX,
            clientY: touch.clientY,
        };
    }

    return null;
}

function setRegexVueScriptManualDragging(active, manager = getRegexVueManagerState()) {
    manager.dragging = Boolean(active);
    document.body?.classList.toggle(REGEX_VUE_DRAGGING_BODY_CLASS, Boolean(active));
}

function setRegexVueDragCursorActive(active) {
    document.body?.classList.toggle('bai-bai-regex-drag-cursor-active', Boolean(active));

    if (!active) {
        clearRegexVueDropTarget();
    }
}

function setRegexVueDropTargetFromList(listElement) {
    const target = listElement instanceof HTMLElement
        ? listElement.closest('.bai-bai-regex-group')
        : null;
    const currentTarget = document.querySelector(`.${REGEX_VUE_DROP_TARGET_CLASS}`);

    if (currentTarget === target) {
        return;
    }

    clearRegexVueDropTarget();

    if (target instanceof HTMLElement) {
        target.classList.add(REGEX_VUE_DROP_TARGET_CLASS);
    }
}

function clearRegexVueDropTarget() {
    document.querySelectorAll(`.${REGEX_VUE_DROP_TARGET_CLASS}`).forEach(element => {
        element.classList.remove(REGEX_VUE_DROP_TARGET_CLASS);
    });
}

function installRegexVueManagerStyle() {
    if (document.getElementById(REGEX_VUE_MANAGER_STYLE_ID)) {
        return;
    }

    const style = document.createElement('style');
    style.id = REGEX_VUE_MANAGER_STYLE_ID;
    style.textContent = `
.bai-bai-regex-vue-list {
    gap: 2px;
}

.bai-bai-regex-groups {
    gap: 2px;
}

.bai-bai-regex-list-toolbar {
    justify-content: stretch;
    margin-bottom: 4px;
    gap: 4px;
}

.bai-bai-regex-list-toolbar-btn {
    cursor: pointer;
    text-align: center;
    padding: 6px;
    border: 1px dashed var(--SmartThemeBorderColor);
    border-radius: 10px;
    opacity: 0.7;
    transition: opacity 0.2s, background-color 0.2s;
    flex: 1;
}

.bai-bai-regex-list-toolbar-btn:not(.disabled):hover {
    opacity: 1;
    background-color: var(--SmartThemeBlurTintColor);
}

.bai-bai-regex-list-toolbar-btn.disabled {
    cursor: default;
    opacity: 0.35;
}

.bai-bai-regex-move-group-popup {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.bai-bai-regex-move-group-label {
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.bai-bai-regex-move-group-select {
    width: 100%;
}

.bai-bai-regex-empty-list {
    font-size: 0.95em;
    opacity: 0.7;
    text-align: center;
}

#regex_container #saved_regex_scripts,
#regex_container #saved_scoped_scripts,
#regex_container #saved_preset_scripts,
.bai-bai-regex-vue-list,
.bai-bai-regex-vue-list *,
.bai-bai-regex-sortable-ghost,
.bai-bai-regex-sortable-chosen,
.bai-bai-regex-sortable-drag,
.bai-bai-regex-sortable-fallback {
    cursor: default !important;
}

.bai-bai-regex-vue-list .regex-script-label,
.bai-bai-regex-vue-list .regex_script_name {
    cursor: default !important;
}

.bai-bai-regex-vue-list .bai-bai-regex-script-drag-handle {
    cursor: grab !important;
    touch-action: none;
    user-select: none;
}

.bai-bai-regex-vue-list .bai-bai-regex-script-drag-handle:active {
    cursor: grabbing !important;
}

.bai-bai-regex-vue-list .menu_button,
.bai-bai-regex-vue-list .regex-toggle-on,
.bai-bai-regex-vue-list .regex-toggle-off,
.bai-bai-regex-vue-list .regex_bulk_checkbox,
.bai-bai-regex-vue-list .regex_script_expand {
    cursor: pointer !important;
}

.bai-bai-regex-group {
    display: flex;
    flex-direction: column;
    gap: 2px;
}

.bai-bai-regex-group-framed {
    border: 1px solid var(--SmartThemeBorderColor);
    border-radius: 10px;
    gap: 0;
    margin-top: 6px;
    transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.bai-bai-regex-group-framed .bai-bai-regex-group-body {
    display: grid !important;
    grid-template-rows: 1fr;
    overflow: hidden;
    opacity: 1;
    padding: 0;
    border-bottom-left-radius: 10px;
    border-bottom-right-radius: 10px;
    transition: grid-template-rows ${REGEX_VUE_GROUP_EXPAND_ANIMATION_MS}ms ease, opacity ${REGEX_VUE_GROUP_EXPAND_ANIMATION_MS}ms ease, background-color 0.15s ease;
}

.bai-bai-regex-group-collapsed .bai-bai-regex-group-body {
    grid-template-rows: 0fr;
    opacity: 0;
    pointer-events: none;
    transition-duration: ${REGEX_VUE_GROUP_COLLAPSE_ANIMATION_MS}ms;
}

.bai-bai-regex-group-body-inner {
    min-height: 0;
    overflow: hidden;
}

.bai-bai-regex-group-list {
    gap: 0;
    min-height: 8px;
    transition: min-height 0.15s ease, background-color 0.15s ease;
}

body.${REGEX_VUE_DRAGGING_BODY_CLASS} .bai-bai-regex-group-framed:not(.bai-bai-regex-group-collapsed) .bai-bai-regex-group-list-empty {
    min-height: 44px;
}

.bai-bai-regex-group.bai-bai-regex-drop-target {
    outline: 2px solid var(--SmartThemeQuoteColor);
    outline-offset: 1px;
}

.bai-bai-regex-group.bai-bai-regex-drop-target.bai-bai-regex-group-framed {
    border-color: var(--SmartThemeQuoteColor);
    box-shadow: 0 0 0 1px var(--SmartThemeQuoteColor);
}

.bai-bai-regex-group.bai-bai-regex-drop-target .bai-bai-regex-group-header,
.bai-bai-regex-group.bai-bai-regex-drop-target .bai-bai-regex-group-body {
    background-color: var(--SmartThemeChatTintColor);
}

.bai-bai-regex-group-framed .regex-script-label {
    border: none !important;
    border-radius: 0 !important;
    border-top: 1px solid var(--SmartThemeBorderColor) !important;
    margin: 0 !important;
    box-shadow: none !important;
    padding-left: 10px;
    padding-right: 10px;
}

.bai-bai-regex-group-framed .regex-script-label:first-child {
    border-top: none !important;
}

.bai-bai-regex-group-framed .regex-script-label:last-child {
    margin-bottom: 2px !important;
}

.bai-bai-regex-group-header {
    align-items: center;
    padding: 6px 10px;
    opacity: 0.95;
    background-color: var(--SmartThemeBlurTintColor);
    border-top-left-radius: 9px;
    border-top-right-radius: 9px;
    border-bottom: 1px solid var(--SmartThemeBorderColor);
    cursor: pointer;
    user-select: none;
    touch-action: manipulation;
}

.bai-bai-regex-group-header:hover {
    background-color: var(--SmartThemeChatTintColor);
}

.bai-bai-regex-group-toggle {
    width: 18px;
    text-align: center;
    transition: transform 0.2s ease;
    display: inline-block;
}

.bai-bai-regex-group-title {
    align-items: end;
    gap: 4px;
    min-width: 0;
}

.bai-bai-regex-group-name {
    min-width: 0;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.bai-bai-regex-group-count {
    flex: 0 0 auto;
    opacity: 0.75;
}

.bai-bai-regex-group-move-btn {
    flex: 0 0 auto;
}

.bai-bai-regex-vue-list .bai-bai-regex-group-move-btn.disabled {
    cursor: default !important;
    opacity: 0.35;
}

.bai-bai-regex-group-header.collapsed .bai-bai-regex-group-toggle {
    transform: rotate(-90deg);
}

.bai-bai-regex-group-header.collapsed {
    border-bottom: none;
    border-bottom-left-radius: 9px;
    border-bottom-right-radius: 9px;
    transition: border-radius 0.2s;
}

.bai-bai-regex-sortable-ghost {
    opacity: 0.35;
}

body.${REGEX_VUE_DRAGGING_BODY_CLASS} #regex_container .bai-bai-regex-sortable-ghost,
body.${REGEX_VUE_DRAGGING_BODY_CLASS} #regex_container .bai-bai-regex-sortable-chosen {
    visibility: hidden !important;
}

.bai-bai-regex-sortable-chosen {
    cursor: grabbing !important;
}

.bai-bai-regex-sortable-drag {
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);
    cursor: grabbing !important;
    opacity: 0.95;
}

.bai-bai-regex-sortable-fallback {
    cursor: grabbing !important;
}

.${REGEX_VUE_DRAG_INDICATOR_CLASS} {
    position: fixed;
    height: 2px;
    border-radius: 999px;
    pointer-events: none;
    z-index: 50001;
    background: var(--SmartThemeQuoteColor);
    box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.25), 0 0 10px var(--SmartThemeQuoteColor);
}

body.bai-bai-regex-drag-cursor-active #regex_container,
body.bai-bai-regex-drag-cursor-active #regex_container *,
body.bai-bai-regex-drag-cursor-active .bai-bai-regex-sortable-ghost,
body.bai-bai-regex-drag-cursor-active .bai-bai-regex-sortable-chosen,
body.bai-bai-regex-drag-cursor-active .bai-bai-regex-sortable-drag,
body.bai-bai-regex-drag-cursor-active .bai-bai-regex-sortable-fallback {
    cursor: grabbing !important;
}

@media (prefers-reduced-motion: reduce) {
    .bai-bai-regex-group-framed,
    .bai-bai-regex-group-framed .bai-bai-regex-group-body,
    .bai-bai-regex-group-list,
    .bai-bai-regex-group-toggle {
        transition: none !important;
    }
}
`;
    document.head.append(style);
}

function updateRegexBulkControls() {
    if (isRegexVueManagerActive()) {
        updateRegexVueBulkControls();
        return;
    }

    const checkboxes = $(`${REGEX_CONTAINER_SELECTOR} .regex_bulk_checkbox`);
    const allAreChecked = checkboxes.length > 0 && checkboxes.length === checkboxes.filter(':checked').length;
    const selectAllIcon = $('#bulk_select_all_toggle').find('i');

    selectAllIcon.toggleClass('fa-check-double', !allAreChecked);
    selectAllIcon.toggleClass('fa-minus', allAreChecked);

    const hasGlobalScripts = $('#saved_regex_scripts .regex-script-label:has(.regex_bulk_checkbox:checked)').length > 0;
    const hasScopedScripts = $('#saved_scoped_scripts .regex-script-label:has(.regex_bulk_checkbox:checked)').length > 0;
    const hasPresetScripts = $('#saved_preset_scripts .regex-script-label:has(.regex_bulk_checkbox:checked)').length > 0;

    $('#bulk_regex_move_to_global').toggle(hasScopedScripts || hasPresetScripts);
    $('#bulk_regex_move_to_scoped').toggle(hasGlobalScripts || hasPresetScripts);
    $('#bulk_regex_move_to_preset').toggle(hasGlobalScripts || hasScopedScripts);
}

function updateRegexVueBulkControls() {
    const manager = getRegexVueManagerState();
    const selectedContexts = getRegexVueSelectedContexts();
    const allIds = getAllRegexVueScriptIds();
    const selectedIds = manager.state?.selectedIds ?? {};
    const allAreChecked = allIds.length > 0 && allIds.every(id => selectedIds[id]);
    const selectAllIcon = $('#bulk_select_all_toggle').find('i');

    selectAllIcon.toggleClass('fa-check-double', !allAreChecked);
    selectAllIcon.toggleClass('fa-minus', allAreChecked);

    const hasGlobalScripts = selectedContexts.some(context => context.scriptType === REGEX_SCRIPT_TYPES.GLOBAL);
    const hasScopedScripts = selectedContexts.some(context => context.scriptType === REGEX_SCRIPT_TYPES.SCOPED);
    const hasPresetScripts = selectedContexts.some(context => context.scriptType === REGEX_SCRIPT_TYPES.PRESET);

    $('#bulk_regex_move_to_global').toggle(hasScopedScripts || hasPresetScripts);
    $('#bulk_regex_move_to_scoped').toggle(hasGlobalScripts || hasPresetScripts);
    $('#bulk_regex_move_to_preset').toggle(hasGlobalScripts || hasScopedScripts);
}

export {
    applyRegexVueDragGestureOptions,
    applyRegexVueScriptManualDrop,
    areRegexVueManagerTargetsOwned,
    areRegexVueManagerTargetsReady,
    autoScrollRegexVueScriptManualDragContainer,
    beginRegexVueGroupHeaderGesture,
    beginRegexVueScriptManualDrag,
    buildRegexVueListModel,
    cancelRegexVueGroupHeaderGesture,
    clearRegexVueDropTarget,
    clearRegexVueManagerTargets,
    clearRegexVueScriptManualDragIndicator,
    clearRegexVueScriptManualDragPlacement,
    clearRegexVueScriptManualDragState,
    createEmptyRegexVueListModel,
    createRegexVueManagerModel,
    createRegexVueManagerRootComponent,
    createRegexVueScriptManualContainerLayout,
    createRegexVueScriptManualDragLayoutCache,
    ensureRegexVueManagerRoot,
    ensureRegexVueScriptManualDragIndicator,
    finishRegexVueGroupHeaderGesture,
    finishRegexVueScriptManualDrag,
    getRegexVueDragPoint,
    getRegexVueDragScrollContainer,
    getRegexVueElementRect,
    getRegexVueListElement,
    getRegexVueListSnapshot,
    getRegexVueManagerState,
    getRegexVuePointDistance,
    getRegexVuePointerEventPoint,
    getRegexVueScriptDragItemFromEvent,
    getRegexVueScriptManualDragLayoutCache,
    getRegexVueScriptManualDragLayoutScrollSignature,
    getRegexVueScriptManualDragPlacementAtPoint,
    getRegexVueScriptManualDropChildren,
    getRegexVueScriptManualDropIndexFromLayout,
    getRegexVueScriptManualGroupLayoutAtPoint,
    getRegexVueScriptManualIndicatorRectFromLayout,
    handleRegexVueGroupHeaderClickFallback,
    handleRegexVueScriptDragMove,
    installRegexVueManager,
    installRegexVueManagerStyle,
    isRegexVueDraggedDomElement,
    isRegexVueGroupHeaderInteractiveEvent,
    isRegexVueManagerActive,
    isRegexVueScriptDragMoveAllowed,
    isRegexVueTransientDragElement,
    loadRegexVueDraggableModule,
    loadRegexVueModule,
    moveRegexVueGroupHeaderGesture,
    reclaimRegexVueManagerTargets,
    removeRegexVueManager,
    removeRegexVueScriptFromListModel,
    renderRegexVueGroupBody,
    renderRegexVueGroupHeader,
    renderRegexVueList,
    renderRegexVueListToolbar,
    renderRegexVueScriptRow,
    renderRegexVueTeleport,
    scheduleRegexVueManagerSync,
    scheduleRegexVueScriptManualDragAutoScroll,
    scheduleRegexVueScriptManualDragPlacementFrame,
    setRegexVueDragCursorActive,
    setRegexVueDropTargetFromList,
    setRegexVueScriptManualDragging,
    shouldSuppressRegexVueGroupHeaderToggle,
    startRegexVueScriptManualDragPlacementListeners,
    stopRegexVueScriptManualDragPlacementListeners,
    syncRegexVueManagerAfterDataChange,
    syncRegexVueManagerState,
    syncRegexVuePresetListFromContext,
    syncRegexVueScopedListFromContext,
    updateRegexBulkControls,
    updateRegexVueBulkControls,
    updateRegexVueScriptManualDragIndicator,
    updateRegexVueScriptManualDragPlacement,
    updateRegexVueScriptManualDragPlacementFromEvent,
};
