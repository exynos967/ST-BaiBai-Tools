# 预设分组标题行的点击、滑动与拖拽交互说明

这份文档记录预设分组标题行上同时支持「整行点击展开/收缩」「手机端正常滑动页面」「手机端长按拖拽分组」「PC 端整行拖拽」时的实现思路。

目标是以后即使不看当前代码，也能按这份说明重新做出相同手感。

## 交互目标

同一个分组标题行需要同时承担这些行为：

- 点击分组标题行任意非按钮区域：展开或收缩分组。
- 点击右侧功能按钮：执行按钮自己的操作，不触发展开/收缩。
- PC 端按住分组标题行拖动：直接拖拽整个分组。
- 手机端按住分组标题行不动一小段时间：进入「可以拖拽」状态，并给用户反馈。
- 手机端长按就绪后移动：拖拽整个分组。
- 手机端从分组标题行开始上下划动：正常滚动预设面板或页面。
- 拖拽结束、滑动结束、误触取消时：不误触发展开/收缩。

这个需求的难点是：点击、滑动、长按准备、实际拖拽都发生在同一个 DOM 区域上，如果只依赖浏览器默认事件或 Sortable 的默认状态，很容易互相干扰。

## 核心原则

### 1. 点击展开不要直接依赖普通 click

普通 `click` 是浏览器在 `pointerdown` / `pointerup` 之后合成的事件。

在拖拽库存在长按 delay、chosen 状态、fallback 拖拽时，普通 `click` 会出现这些问题：

- 点击标题行时，拖拽库可能先进入准备态，导致展开动画感觉卡顿。
- 拖拽释放后，浏览器仍可能合成 click，导致误触发展开/收缩。
- 手机上滑动后松手，也可能触发 click fallback。

因此展开/收缩应该自己用 pointer 手势判断：

1. `pointerdown` 记录起点坐标。
2. `pointerup` 计算移动距离。
3. 只有移动距离很小、没有滚动、没有拖拽、没有刚结束拖拽时，才执行展开/收缩。

普通 `click` 只作为 fallback，用于少数环境没有完整 pointer 行为时兜底，并且必须有抑制逻辑。

### 2. 不要把 Sortable 的 chosenClass 当作「可以拖」

Sortable 的 `chosenClass` 通常表示元素已经被按住并进入候选状态，但它不一定等于：

- 长按时间已经满足。
- 用户现在松开后不会触发展开。
- 元素已经能被移动拖拽。

如果把描边、震动等提示直接绑在 `chosenClass` 上，就可能出现「提示已经出现，但还不能拖」的问题。

正确做法是自己维护一个「drag ready feedback」状态：

- `pointerdown` 时启动一个和 Sortable delay 一致的定时器。
- 定时器到点后，才显示描边、背景、缩放等提示。
- 定时器到点的含义就是：长按时间满足，用户现在开始移动就应该能拖。
- 如果定时器到点前发生滑动、松手或取消，就清掉定时器。

### 3. 手机端纵向排序不能使用 touch-action: pan-y

分组排序本身就是纵向拖拽。

如果分组标题行设置：

```css
touch-action: pan-y;
```

浏览器会优先把纵向手势交给页面滚动，拖拽库拿不到完整的纵向移动事件，结果就是手机端分组拖不动。

为了让 Sortable 能稳定接管长按后的拖拽，分组标题行的触摸面需要使用：

```css
touch-action: none;
```

但 `touch-action: none` 又会阻止从标题行开始的原生页面滚动。所以必须自己在长按时间到达前识别「这是滑动」，然后手动滚动容器。

### 4. PC 端不要加长按 delay

PC 鼠标拖拽的用户预期是：

- 按下后移动就是拖。
- 单击就是展开/收缩。

如果 PC 端也加长按 delay，点击标题行时会被拖拽库的准备状态拖慢，展开/收缩动画会感觉卡。

PC 端只需要设置一个很小的移动阈值，用来避免鼠标轻微抖动造成误拖。

## 推荐参数

当前实现使用的参数含义如下：

```js
const PRESET_VUE_TOUCH_DRAG_DELAY_MS = 320;
const PRESET_VUE_TOUCH_START_THRESHOLD_PX = 10;
const PRESET_VUE_GROUP_HEADER_TOGGLE_DISTANCE_PX = 6;
const PRESET_VUE_GROUP_HEADER_DRAG_SUPPRESS_MS = 350;
const PRESET_VUE_POINTER_START_THRESHOLD_PX = 4;
```

说明：

- `PRESET_VUE_TOUCH_DRAG_DELAY_MS = 320`
  - 手机端长按 320ms 后进入「可以拖拽」状态。
  - 这个值太短会误伤滑动，太长会感觉拖拽迟钝。

- `PRESET_VUE_TOUCH_START_THRESHOLD_PX = 10`
  - 手机端长按到点前，如果纵向移动超过 10px，就判定为滑动，不再准备拖拽。
  - 这个值负责过滤手指自然抖动。

- `PRESET_VUE_GROUP_HEADER_TOGGLE_DISTANCE_PX = 6`
  - 点击展开/收缩允许的最大移动距离。
  - 如果按下到抬起超过这个距离，就不认为是点击。

- `PRESET_VUE_GROUP_HEADER_DRAG_SUPPRESS_MS = 350`
  - 拖拽结束、滑动取消后，在 350ms 内屏蔽 click fallback。
  - 用来避免释放手指时误触发展开/收缩。

- `PRESET_VUE_POINTER_START_THRESHOLD_PX = 4`
  - PC 鼠标拖拽阈值。
  - 只防轻微抖动，不做长按等待。

## 拖拽库配置

VueDraggable / Sortable 的手势配置需要区分手机和 PC。

推荐结构：

```js
function applyDragGestureOptions(draggableProps) {
    if (isMobile()) {
        Object.assign(draggableProps, {
            delay: TOUCH_DRAG_DELAY_MS,
            delayOnTouchOnly: true,
            touchStartThreshold: TOUCH_START_THRESHOLD_PX,
            fallbackTolerance: TOUCH_START_THRESHOLD_PX,
        });
        return;
    }

    Object.assign(draggableProps, {
        touchStartThreshold: POINTER_START_THRESHOLD_PX,
        fallbackTolerance: POINTER_START_THRESHOLD_PX,
    });
}
```

重点：

- 手机端使用 `delay`。
- `delayOnTouchOnly` 必须为 `true`，避免鼠标也被 delay。
- 手机端 `touchStartThreshold` 和 `fallbackTolerance` 建议保持一致。
- PC 端不要设置 `delay`。
- PC 端只保留较小的 `touchStartThreshold` / `fallbackTolerance`。

## 分组标题行事件模型

分组标题行不要只绑定 `click`，而应该绑定这些事件：

```js
onPointerdown
onPointermoveCapture
onPointerup
onPointercancel
onClick
```

各事件职责：

### pointerdown

负责建立一次手势上下文。

需要记录：

- 当前分组 ID。
- `pointerId`。
- 起点坐标 `x` / `y`。
- 当前时间 `startedAt`。
- 上一次 Y 坐标 `lastY`。
- 是否已经判定为滚动 `scrolling`。
- 可滚动祖先链 `scrollTargets`。

同时：

- 清理旧的 ready feedback。
- 启动新的 ready feedback 定时器。
- 如果点的是右侧按钮、展开按钮、输入框等交互元素，直接忽略。

伪代码：

```js
function onPointerDown(event, groupId) {
    if (isInteractiveTarget(event.target)) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (event.isPrimary === false) return;

    const point = getPoint(event);
    if (!point) return;

    const manager = getManager();
    const feedbackElement = getGroupLi(event.currentTarget);

    clearDragReadyFeedback(manager);
    scheduleDragReadyFeedback(manager, feedbackElement);

    manager.groupHeaderGesture = {
        groupId,
        pointerId: event.pointerId,
        startedAt: Date.now(),
        x: point.clientX,
        y: point.clientY,
        lastY: point.clientY,
        scrolling: false,
        scrollTargets: getScrollableAncestors(event.currentTarget),
    };
}
```

### pointermoveCapture

只在手机端处理，用来兼容滑动。

判断逻辑：

- 如果已经进入真实拖拽，直接返回。
- 如果还没到长按时间，并且纵向移动超过阈值，并且纵向移动大于横向移动，判定为滑动。
- 一旦判定为滑动：
  - 清理 ready feedback。
  - 设置 `gesture.scrolling = true`。
  - 记录 `lastGroupHeaderGestureCanceledAt`。
  - 手动滚动可滚动祖先链。
  - `preventDefault()` 和 `stopPropagation()`，避免拖拽库继续处理这次手势。

伪代码：

```js
function onPointerMoveCapture(event, groupId) {
    if (!isMobile()) return;

    const manager = getManager();
    const gesture = manager.groupHeaderGesture;

    if (!gesture) return;
    if (gesture.groupId !== groupId) return;
    if (gesture.pointerId !== event.pointerId) return;
    if (manager.state?.dragging) return;

    const point = getPoint(event);
    if (!point) return;

    const deltaX = point.clientX - gesture.x;
    const deltaY = point.clientY - gesture.y;
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);
    const beforeLongPress = Date.now() - gesture.startedAt < TOUCH_DRAG_DELAY_MS;

    if (!gesture.scrolling) {
        if (!beforeLongPress) return;
        if (absY <= TOUCH_START_THRESHOLD_PX) return;
        if (absY < absX) return;

        gesture.scrolling = true;
        manager.lastGroupHeaderGestureCanceledAt = Date.now();
        clearDragReadyFeedback(manager);
    }

    scrollGestureTargets(gesture, point);
    event.preventDefault();
    event.stopPropagation();
}
```

这个函数是同时支持「touch-action: none」和「正常滑动页面」的关键。

### pointerup

负责判断这次手势是否应该展开/收缩。

只有满足这些条件才展开/收缩：

- 手势存在。
- groupId 和 pointerId 匹配。
- 目标不是按钮等交互元素。
- 没有判定为滚动。
- 当前没有拖拽。
- 不是刚刚拖拽结束。
- 按下到抬起的移动距离小于点击阈值。

伪代码：

```js
function onPointerUp(event, groupId) {
    const manager = getManager();
    const gesture = manager.groupHeaderGesture;

    if (!gestureMatches(gesture, event, groupId)) return;

    manager.groupHeaderGesture = null;
    clearDragReadyFeedback(manager);

    if (isInteractiveTarget(event.target)) return;
    if (shouldSuppressToggle(manager)) return;

    const point = getPoint(event);
    if (!point) return;

    if (gesture.scrolling) {
        manager.lastGroupHeaderGestureCanceledAt = Date.now();
        return;
    }

    if (distance(gesture, point) > TOGGLE_DISTANCE_PX) {
        manager.lastGroupHeaderGestureCanceledAt = Date.now();
        return;
    }

    event.preventDefault();
    event.stopPropagation();

    manager.lastGroupHeaderToggleAt = Date.now();
    toggleGroupCollapsed(groupId);
}
```

### pointercancel

负责清理手势。

任何取消都应该：

- 清掉 `manager.groupHeaderGesture`。
- 清掉 ready feedback。
- 记录一次 `lastGroupHeaderGestureCanceledAt`。

### click fallback

`click` 只做兜底，不作为主要展开逻辑。

需要检查：

- 是否点在交互元素上。
- 距离上次 pointerup 展开是否很近。
- 距离上次滑动取消是否很近。
- 距离上次拖拽结束是否很近。
- 当前是否正在拖拽。

如果这些条件触发，就 `preventDefault()` / `stopPropagation()`，不要展开。

## 手动滚动祖先链

因为分组标题行需要 `touch-action: none`，浏览器不会自动滚动页面，所以需要手动实现滚动传递。

滚动目标不要只找一个父元素，而应该找一条祖先链：

1. 从当前标题行往上找。
2. 找到 `overflow-y` 是 `auto` / `scroll` / `overlay` 且确实可滚动的元素。
3. 全部收集起来。
4. 最后追加 `document.scrollingElement`。

滚动时：

1. 根据本次移动差值算出 `deltaY`。
2. 先滚最近的容器。
3. 如果它已经滚到边界，计算剩余滚动量。
4. 把剩余滚动量继续传给外层容器。

伪代码：

```js
function getScrollableAncestors(source) {
    const targets = [];
    let current = source.parentElement;

    while (current && current !== document.body && current !== document.documentElement) {
        const style = getComputedStyle(current);
        const canScrollY = /(auto|scroll|overlay)/.test(style.overflowY);

        if (canScrollY && current.scrollHeight > current.clientHeight) {
            targets.push(current);
        }

        current = current.parentElement;
    }

    targets.push(document.scrollingElement || document.documentElement);
    return targets;
}

function scrollGestureTargets(gesture, point) {
    const deltaY = gesture.lastY - point.clientY;
    gesture.lastY = point.clientY;

    let remaining = deltaY;

    for (const target of gesture.scrollTargets) {
        const before = target.scrollTop;
        target.scrollTop += remaining;
        remaining -= target.scrollTop - before;

        if (Math.abs(remaining) < 0.5) break;
    }
}
```

## ready feedback 设计

ready feedback 表示：

> 长按时间已经满足，用户现在移动就应该可以开始拖拽。

它不等于正在拖拽，也不等于 Sortable chosen。

推荐单独维护一个类：

```js
const DRAG_READY_FEEDBACK_CLASS = 'drag-ready-feedback';
```

流程：

1. `pointerdown` 时启动定时器。
2. 定时器时间和 Sortable 的 `delay` 一致。
3. 如果定时器到点前发生滚动、松手、取消，就清掉。
4. 到点后给当前分组 `li` 加 ready class。
5. 同时触发一次短震动。
6. 真正进入 Sortable `onStart` 后，如果 ready 已经提示过，不重复震动。
7. 拖拽结束、pointerup、pointercancel、列表卸载时清理 ready class。

伪代码：

```js
function scheduleDragReadyFeedback(manager, element) {
    if (!isMobile()) return;
    if (!(element instanceof HTMLElement)) return;

    manager.dragReadyFeedbackElement = element;
    manager.dragReadyFeedbackTimer = setTimeout(() => {
        if (manager.groupHeaderGesture?.scrolling) {
            clearDragReadyFeedback(manager);
            return;
        }

        showDragReadyFeedback(manager);
    }, TOUCH_DRAG_DELAY_MS);
}

function showDragReadyFeedback(manager, { notify = true } = {}) {
    clearTimeout(manager.dragReadyFeedbackTimer);
    manager.dragReadyFeedbackTimer = null;

    manager.dragReadyFeedbackElement?.classList.add(DRAG_READY_FEEDBACK_CLASS);

    if (notify && !manager.dragReadyFeedbackNotified) {
        manager.dragReadyFeedbackNotified = true;
        vibrate();
    }
}

function clearDragReadyFeedback(manager) {
    clearTimeout(manager.dragReadyFeedbackTimer);
    manager.dragReadyFeedbackTimer = null;

    manager.dragReadyFeedbackElement?.classList.remove(DRAG_READY_FEEDBACK_CLASS);
    manager.dragReadyFeedbackElement = null;
    manager.dragReadyFeedbackNotified = false;
}
```

## 实际拖拽状态

Sortable 的 `onStart` 和 `onEnd` 仍然负责实际拖拽状态。

`onStart` 应该：

- 清掉当前 header gesture。
- 记录 `lastDragStartedAt`。
- 如果 ready feedback 还没显示，兜底显示一次，但不一定震动。
- 设置 `model.dragging = true`。
- 给 body 加拖拽 class。
- 开启手机端滚动保护。
- 捕获拖拽前列表快照。

`onEnd` 应该：

- 记录 `lastDragEndedAt`。
- 设置 `model.dragging = false`。
- 清理 ready feedback。
- 关闭手机端滚动保护。
- 如果顺序真的变化，再安排保存。

注意：

- ready feedback 代表「可以拖」。
- `model.dragging` 代表「已经进入实际拖拽」。
- 这两个状态不能混为一谈。

## 展开/收缩动画

分组内部条目的展开/收缩动画推荐使用 CSS grid，不推荐用 JS 实时计算高度。

推荐结构是：

```html
<li class="group">
    <div class="group-header">...</div>
    <div class="group-body">
        <div class="group-body-inner">
            <ul class="group-list">...</ul>
        </div>
    </div>
</li>
```

其中：

- `group` 是整个分组容器。
- `group-header` 是固定显示的标题行。
- `group-body` 是负责高度动画的外壳。
- `group-body-inner` 是真正包住内部列表内容的容器。
- `group-list` 是 VueDraggable 挂载的内部条目列表。

核心 CSS：

```css
.group-body {
    display: grid;
    grid-template-rows: 1fr;
    overflow: hidden;
    transition: grid-template-rows 260ms ease, opacity 260ms ease;
}

.group-collapsed .group-body {
    grid-template-rows: 0fr;
    opacity: 0;
}

.group-body-inner {
    min-height: 0;
    overflow: hidden;
}
```

关键点是 `grid-template-rows: 1fr -> 0fr`。

这可以让浏览器自己根据内容高度做插值动画，不需要代码读取 `scrollHeight`，也不会在每次展开/收缩时强制同步布局。

`group-body-inner` 必须有：

```css
min-height: 0;
overflow: hidden;
```

否则 grid item 可能因为默认 `min-height: auto` 撑开父容器，导致 `0fr` 收不起来，表现为动画失效或内容仍然可见。

### 为什么不推荐 JS 计算高度

JS 高度动画常见做法是：

1. 展开前读取 `scrollHeight`。
2. 设置 `height: 0px`。
3. 下一帧设置 `height: ${scrollHeight}px`。
4. 动画结束后再改成 `height: auto`。
5. 收缩时再反向计算。

这种方式在静态内容里可用，但在这个预设分组列表里问题很多：

- 内部是 VueDraggable，拖拽时 DOM 会插入 ghost、chosen、fallback 元素。
- 条目启用状态、token 数、按钮显示、主题 CSS 都可能改变内容高度。
- 展开/收缩过程中如果 Vue 重新渲染，之前计算的高度会过期。
- 读取 `scrollHeight` 会触发布局计算，列表较长时容易造成卡顿。
- 如果在动画中移动条目进出分组，JS 计算高度很容易错。
- 需要监听 `transitionend` 清理内联样式，异常中断时容易留下脏状态。

所以这里推荐 grid 动画。

### grid 动画和 VueDraggable 的配合

VueDraggable 应该挂在内部真实列表上，而不是直接挂在动画外壳上。

推荐：

```html
<div class="group-body">
    <div class="group-body-inner">
        <VueDraggable tag="ul" class="group-list">
            ...
        </VueDraggable>
    </div>
</div>
```

不要让 `group-body` 同时负责：

- grid 高度动画
- Sortable 容器
- 列表 gap
- 拖拽 ghost / fallback 样式

这些职责混在一起时，拖拽库插入占位元素会影响动画容器高度，展开/收缩时也更容易闪烁。

更稳的职责划分是：

- `group-body`：只负责展开/收缩高度。
- `group-body-inner`：只负责裁剪内容。
- `group-list`：只负责内部列表布局和拖拽。

### gap 的处理

分组外层列表和分组内部列表的 gap 要分开处理。

推荐：

- 外层 `#completion_prompt_manager_list` 保持原生主题能控制的 gap。
- 分组容器 `.group` 自己不要继承 `text_pole` 这类原生列表类。
- 分组内部 `.group-list` 用 CSS 变量或从外层读取到的值，确保内部条目 gap 和外部条目一致。

如果直接给 `group-body` 或额外包装层加 gap，很容易出现：

- 收缩时还残留间距。
- 分组内部条目间距和外部不一致。
- 第一个或最后一个条目和标题行之间距离不自然。

比较稳的做法是：

```css
.group {
    display: flex;
    flex-direction: column;
    gap: 0;
    overflow: hidden;
}

.group-list {
    display: flex;
    flex-direction: column;
    gap: var(--preset-list-gap);
}
```

如果收缩时希望标题行和 body 之间没有残留空隙，不要把 gap 放在 `.group` 上，而应该放在真正的条目列表上。

### 动画时间

展开和收缩可以使用不同时间。

一般建议：

- 展开稍短，例如 `180ms`。
- 收缩稍长，例如 `260ms`。

原因是展开时用户是在主动打开内容，反馈应该快；收缩时内容消失，如果太快会显得突兀。

但不要差距过大，否则会让用户感觉展开/收缩不是同一种动画。

### 点击标题行时动画不流畅的原因

如果点击展开按钮很流畅，但点击标题行其他位置不流畅，通常不是 grid 动画本身的问题，而是事件路径不同。

常见原因：

- 展开按钮的 click 直接 `stopPropagation()` 后执行 toggle。
- 标题行其他位置先被 Sortable 的 pointerdown / delay 处理。
- 浏览器合成 click 的时间较晚。
- 拖拽库 chosen 状态或 delay 状态影响了 class 切换时机。

解决方式不是换动画方案，而是让标题行点击也走 pointerup 手势判断：

- `pointerdown` 记录坐标。
- `pointerup` 判断移动距离。
- 判断通过后立即 toggle。
- 普通 click 只作为 fallback。

这样标题行点击和按钮点击触发 toggle 的时机更接近，动画手感也会一致。

## CSS 要点

分组标题行：

```css
.group-header {
    cursor: pointer;
    user-select: none;
    -webkit-user-select: none;
    touch-action: manipulation;
}

@media (pointer: coarse) {
    .group-drag-surface {
        touch-action: none !important;
    }
}
```

ready 和实际拖拽反馈可以共用视觉样式：

```css
.drag-ready-feedback,
body.dragging .sortable-chosen {
    outline: 2px solid color-mix(in srgb, var(--SmartThemeQuoteColor) 75%, transparent);
    outline-offset: -2px;
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--SmartThemeQuoteColor) 35%, transparent);
}

.drag-ready-feedback.group .group-header,
body.dragging .sortable-chosen.group .group-header {
    background: color-mix(in srgb, var(--SmartThemeQuoteColor) 18%, transparent);
}

@media (pointer: coarse) {
    .drag-ready-feedback,
    body.dragging .sortable-chosen {
        transform: scale(0.995);
        transition: transform 120ms ease, outline-color 120ms ease, box-shadow 120ms ease;
    }
}
```

注意：

- 不要只给 `.sortable-chosen` 加 ready 提示。
- ready class 应该由自己的长按定时器控制。
- actual dragging class 可以继续依赖 Sortable `onStart`。

## 震动反馈

震动只作为增强，不应该影响主流程。

推荐：

```js
function vibrateDragFeedback() {
    if (!isMobile()) return;
    if (typeof navigator === 'undefined') return;
    if (typeof navigator.vibrate !== 'function') return;

    try {
        navigator.vibrate(12);
    } catch {
        // 部分 WebView 会暴露 vibrate 但拒绝执行，忽略即可。
    }
}
```

触发时机：

- ready feedback 出现时触发一次。
- 如果没有 ready feedback，但已经进入真实拖拽，可以在 `onStart` 兜底触发一次。
- 如果 ready 时已经震动过，`onStart` 不要重复震动。

## 状态字段建议

一个 manager 里建议维护这些字段：

```js
{
    dragging: false,
    groupHeaderGesture: null,
    lastGroupHeaderToggleAt: 0,
    lastGroupHeaderGestureCanceledAt: 0,
    lastDragStartedAt: 0,
    lastDragEndedAt: 0,
    dragReadyFeedbackTimer: null,
    dragReadyFeedbackElement: null,
    dragReadyFeedbackNotified: false,
}
```

其中：

- `groupHeaderGesture` 保存当前 pointer 手势。
- `lastGroupHeaderToggleAt` 防止 click fallback 重复展开。
- `lastGroupHeaderGestureCanceledAt` 防止滑动后松手误触发 click。
- `lastDragEndedAt` 防止拖拽释放后误触发 click。
- `dragReadyFeedbackTimer` 控制长按 ready。
- `dragReadyFeedbackElement` 记录当前应该加描边的元素。
- `dragReadyFeedbackNotified` 防止 ready 和 onStart 重复震动。

## 必须清理的时机

这些状态不清理会导致残留描边、误触发展开、下一次拖拽异常。

必须清理 ready feedback 的时机：

- pointerup。
- pointercancel。
- 长按前判定为滚动。
- Sortable onEnd。
- Vue 列表卸载。
- 拖拽异常结束并调用 `setDragging(false)`。

必须清理 gesture 的时机：

- pointerup。
- pointercancel。
- Sortable onStart。
- Vue 列表卸载。

必须记录 suppress 时间的时机：

- 滑动判定成立时。
- pointerup 发现移动距离超过点击阈值时。
- pointercancel 时。
- Sortable onEnd 时。

## 推荐事件状态机

```text
Idle
  |
  | pointerdown on group header
  v
Pressed
  | start ready timer
  |
  | move before delay > threshold
  v
Scrolling
  | manual scroll
  | clear ready timer
  | pointerup/cancel
  v
Idle

Pressed
  |
  | delay reached
  v
ReadyToDrag
  | show outline/background/scale
  | vibrate once
  |
  | move
  v
Dragging
  | Sortable onStart
  |
  | Sortable onEnd
  v
Idle

Pressed
  |
  | pointerup with tiny movement
  v
ToggleCollapsed
  |
  v
Idle
```

## 常见错误与对应现象

### 错误：手机端使用 touch-action: pan-y

现象：

- 页面滑动正常。
- 但分组拖不动，尤其纵向拖拽完全不稳定。

原因：

- 浏览器把纵向手势交给滚动，拖拽库拿不到完整移动事件。

### 错误：手机端使用 touch-action: none 但不手动滚动

现象：

- 分组可以拖。
- 但从分组标题行开始无法滚动页面。

原因：

- 浏览器默认滚动被禁止了，没有补偿逻辑。

### 错误：用 click 直接展开/收缩

现象：

- 点击动画发卡。
- 拖拽释放后误展开/收缩。
- 滑动释放后误展开/收缩。

原因：

- click 是合成事件，时机太晚，且不区分之前发生的是点击、滑动还是拖拽。

### 错误：用 chosenClass 显示「可以拖」提示

现象：

- 描边出现了，但还不能立刻拖。

原因：

- chosenClass 出现早于真正 ready 或真正 onStart。

### 错误：PC 端也设置拖拽 delay

现象：

- PC 点击分组标题展开/收缩感觉卡。

原因：

- 鼠标点击也进入了拖拽准备流程。

### 错误：拖拽结束不屏蔽 click fallback

现象：

- 拖完分组后，分组突然展开或收缩。

原因：

- 浏览器在释放后合成了 click。

### 错误：用 JS 计算 height 做分组展开/收缩动画

现象：

- 展开/收缩过程中条目按钮、开关、拖拽把手闪烁。
- 分组内部条目较多时动画卡顿。
- 拖拽后再展开/收缩，动画高度不准。
- 某些主题下收缩不彻底，内部内容还露出一点。

原因：

- JS 读取 `scrollHeight` 会强制布局。
- VueDraggable 会动态插入 ghost、chosen、fallback 元素，导致计算出的高度不稳定。
- Vue 重新渲染、token 刷新、主题样式变化都会让之前计算的高度过期。
- 内联 `height` 需要在 `transitionend` 后清理，动画中断时容易留下脏状态。

推荐：

- 使用 CSS grid 的 `grid-template-rows: 1fr -> 0fr`。
- 动画外壳只负责高度动画。
- 内部再放一个 `min-height: 0; overflow: hidden` 的裁剪容器。
- VueDraggable 挂在最里面的真实 `ul` 上。

## 复刻 checklist

实现同类交互时按这个顺序做：

1. 分清 PC 和手机端拖拽参数。
2. PC 不设置 delay，只设置小移动阈值。
3. 手机设置 delay、touch threshold、fallback tolerance。
4. 分组标题行使用 pointerdown / pointermoveCapture / pointerup / pointercancel。
5. 不把展开/收缩主逻辑绑在普通 click 上。
6. 手机分组拖拽面使用 `touch-action: none`。
7. 长按时间到达前，如果纵向移动超过阈值，手动滚动祖先链。
8. 长按时间到达时显示 ready feedback。
9. ready feedback 不依赖 Sortable chosenClass。
10. Sortable onStart 设置真实 dragging 状态。
11. Sortable onEnd 清理 dragging 和 ready 状态。
12. 滑动、取消、拖拽结束后短时间屏蔽 click fallback。
13. 所有 timer、class、gesture 状态都要在卸载时清理。

## 当前代码中的对应实现

当前仓库里的实现主要位于：

- `presetOptimizations.js`

关键函数：

- `applyPresetVueDragGestureOptions`
- `beginPresetVuePromptGroupHeaderGesture`
- `movePresetVuePromptGroupHeaderGesture`
- `finishPresetVuePromptGroupHeaderGesture`
- `cancelPresetVuePromptGroupHeaderGesture`
- `handlePresetVuePromptGroupHeaderClickFallback`
- `getPresetVuePromptGroupHeaderScrollTargets`
- `scrollPresetVuePromptGroupHeaderGesture`
- `schedulePresetVuePromptDragReadyFeedback`
- `showPresetVuePromptDragReadyFeedback`
- `clearPresetVuePromptDragReadyFeedback`
- `notifyPresetVuePromptDragStarted`
- `setPresetVuePromptDragging`

关键 CSS 类：

- `bai-bai-preset-group-drag-surface`
- `bai-bai-preset-vue-drag-ready-feedback`
- `bai-bai-preset-vue-dragging`
- `bai-bai-preset-vue-sortable-chosen`
- `bai-bai-preset-vue-sortable-fallback`

如果以后要迁移到其他列表或其他插件，建议优先复制这套状态机，而不是只复制 CSS 或 Sortable 参数。
