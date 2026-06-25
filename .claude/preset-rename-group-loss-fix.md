# 预设重命名丢失分组信息 — 根因与修复

## 现象
开启「除 codemirror 外的所有预设优化」后,重命名一个**含分组**的预设,重命名后分组信息全部丢失。

## 根因（已用运行时诊断日志确认）
ST 重命名 openai 预设的内部流程（`script.bundle.js` 的 `renamePreset` / preset manager rename 点击处理）：

1. `savePreset(新名)` —— 用 `getPresetSettings()` 建新预设。**`getPresetSettings` 没有 openai 分支,返回空对象**,所以新预设一开始是空的。这一步还会 `updateList(新名)` → 触发 `#settings_preset_openai` 的 `change`。
2. ST 再用 `writePresetExtensionField(新名, 之前读到的 extensions)` 把分组数据补回去。
3. 最后 `$('#update_oai_preset').click()` 落盘（ST 注释自称 "horrible mess"）。

开启**预设切换优化**后,插件的 `deferOpenAiPresetSelectChangeOnMobile` 用 `setTimeout(0)` 把第 1 步触发的 `change` **异步推迟**。等它执行时走 `handleOpenAiPresetChangedBefore` → `applyPromptManagerPresetFieldsEarly(preset)`,其中这行：

```js
oai_settings.extensions = preset.extensions || {};   // 空新预设 → 把 oai_settings.extensions 清空
```

把内存里已有的分组数据（例如 12 组 / 285 prompts）**清成 0**。时序错位导致分组在 `PRESET_RENAMED` 事件之前就已经没了。

## 诊断日志还原的真实时序
| step | 事件 | oai.extensions 分组数 |
|---|---|---|
| 1-2 | `PRESET_RENAMED_BEFORE` | 12 组 / 285 |
| 3 | `OAI_PRESET_CHANGED_BEFORE`（切到新名） | 12 / 285 |
| 4 | `OAI_PRESET_CHANGED_AFTER` | **0 ← 被清空** |
| 5-6 | `PRESET_RENAMED` | 0 |

## 为什么之前的修复失败
GPT 的修复在 **`PRESET_RENAMED`(step5)** 才尝试「读回」分组,但那时 `oai_settings` / `serviceSettings` / 预设对象三处全是 0,无数据可读。它从未在数据还存活的 step1 把分组**暂存**下来。

## 修复方案（暂存 → 写回,不依赖异步时序）
位置：`presetOptimizations.js` 的 `handlePresetPromptGroupRenamedBefore` / `handlePresetPromptGroupRenamed`。

- **`PRESET_RENAMED_BEFORE`（数据完整）**：`captureRenamedPresetGroupStash(oldName, newName)` 把分组状态 `structuredClone` 暂存到 `extensionState.renamedPresetGroupStash`。优先取 `oai_settings.extensions` 里的分组,取不到退回 runtime 状态。
- **`PRESET_RENAMED`（内存已被清空）**：`restoreRenamedPresetGroupStash(newName)` 把暂存数据写回 `oai_settings.extensions` + `serviceSettings`,重建 `presetPromptGroupRuntimeState`,并 `markOpenAiPresetSavePending(newName)`。紧随其后 ST 的 `update_oai_preset` 基于 `oai_settings` 落盘,分组持久化到新预设文件。

关键点：写回发生在 `PRESET_RENAMED` 这个**确定的时间点**,无论那个被 `setTimeout` 推迟的预设切换在它之前还是之后执行,暂存数据都还在。

## 排查方法（如需复现 / 再次定位）
当时在以下位置加了诊断探针，把快照累积进一个缓冲区，重命名结束后定时器一次性 `JSON.stringify` 输出（方便整段复制）：
- `handlePresetPromptGroupRenamedBefore` / `handlePresetPromptGroupRenamed` 进出
- `handleOpenAiPresetChangedBefore` / `handleOpenAiPresetChangedAfter`
- `applyPromptManagerPresetFieldsEarly` 覆盖 `oai_settings.extensions` 前后

每条快照记录 `oai_settings.extensions` / `serviceSettings.extensions` / 预设对象 三处的 `{groups, prompts}` 数量、当前/runtime 预设名、syncKey。看哪一步分组数量从非 0 变 0 即可定位。排查完已全部删除。

## 相关常量 / 函数
- 分组数据存储路径：`oai_settings.extensions.baibaiToolkit.presetPromptGroups`（常量 `PRESET_GROUP_EXTENSION_PATH`）
- 复用的写回辅助：`applyPresetPromptGroupExtensionPayloadToMemory`、`hasPresetPromptGroupStateData`、`getObjectPath`
