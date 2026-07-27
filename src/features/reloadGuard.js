import * as scriptModule from '@sillytavern/script';
import { getCurrentChatId } from '@sillytavern/script';
import { selected_group } from '@sillytavern/scripts/group-chats';
import { LOG_PREFIX, RELOAD_GREETING_GUARD_KEY } from './constants.js';
import { settings } from './state.js';

/**
 * 缓解酒馆丢失聊天问题:切换正则触发 reloadCurrentChat 时,若那次 /api/chats/get 偶发
 * 失败/读空,ST 的 getChatResult 会把"只剩问候语"覆盖写回磁盘,造成聊天记录永久丢失。
 *
 * 这里包装 reloadChatMutex.callback(即 reloadCurrentChatUnsafe):reload 前对内存聊天
 * 做浅拷贝快照,reload 后检测到"聊天身份未变 + 之前有历史 + 消息数反而变少"则判定为该
 * bug,自动把内存恢复回去并强制重存覆盖那条问候语。
 *
 * 触发点唯一(切正则/切预设),开销仅一次 chat.slice() 浅拷贝(复制引用,非序列化),
 * 普通发消息路径完全不经过。可通过设置项 chatLossMitigationEnabled 关闭(运行时生效)。
 */
/**
 * 检测当前 ST 是否支持聊天丢失缓解。
 * 该功能依赖 reloadChatMutex(ST 1.16.0 起把 reloadCurrentChat 包装为 SimpleMutex 才引入),
 * 低版本无此导出,功能无法安装。直接特性探测比解析版本字符串更可靠。
 * @returns {boolean}
 */
function isChatLossMitigationSupported() {
    const mutex = scriptModule.reloadChatMutex;
    return !!mutex && typeof mutex.callback === 'function';
}

function installReloadGreetingGuard() {
    try {
        if (!isChatLossMitigationSupported()) {
            console.debug(`${LOG_PREFIX} 当前 ST 版本低于 1.16.0,聊天丢失缓解不可用,已跳过`);
            return;
        }
        const mutex = scriptModule.reloadChatMutex;
        if (mutex.callback[RELOAD_GREETING_GUARD_KEY]) {
            return;
        }

        const original = mutex.callback;
        async function guardedReload(...args) {
            const snapshot = takeReloadSnapshot();
            try {
                return await original.apply(mutex, args);
            } finally {
                try {
                    await maybeRecoverFromGreetingOverwrite(snapshot);
                } catch (error) {
                    console.error(`${LOG_PREFIX} 聊天丢失缓解执行失败:`, error);
                }
            }
        }
        guardedReload[RELOAD_GREETING_GUARD_KEY] = true;
        guardedReload.__baiBaiToolkitOriginal = original;
        mutex.callback = guardedReload;
        console.debug(`${LOG_PREFIX} 已启用缓解酒馆丢失聊天问题`);
    } catch (error) {
        console.error(`${LOG_PREFIX} 启用缓解酒馆丢失聊天问题失败:`, error);
    }
}

/**
 * 在 reload 清空内存之前,对当前聊天做快照。
 * @returns {null | {valid: boolean, inGroup: boolean, chatId: any, length: number, integrity: any, messages: any[], metadata: any}}
 */
function takeReloadSnapshot() {
    try {
        if (settings.chatLossMitigationEnabled === false) {
            return null;
        }
        const inGroup = !!selected_group;
        const inChar = scriptModule.this_chid !== undefined;
        if (!inGroup && !inChar) {
            // neutral / 临时聊天:reload 不会注入问候语并保存,跳过
            return null;
        }

        const c = scriptModule.chat;
        return {
            valid: true,
            inGroup,
            chatId: getCurrentChatId(),
            length: Array.isArray(c) ? c.length : 0,
            integrity: scriptModule.chat_metadata?.integrity,
            messages: Array.isArray(c) ? c.slice() : [],   // 仅浅拷贝引用,不序列化
            metadata: scriptModule.chat_metadata,          // 旧 metadata 引用(getChat 会重赋绑定)
        };
    } catch (error) {
        console.error(`${LOG_PREFIX} 聊天快照失败:`, error);
        return null;
    }
}

/**
 * 判定 reload 后是否发生了"读失败被问候语覆盖"。要求全部条件成立,对正常删除/切换零误判。
 * @param {ReturnType<typeof takeReloadSnapshot>} snap
 * @returns {boolean}
 */
function shouldRecoverChat(snap) {
    if (!snap || !snap.valid) {
        return false;
    }
    // 聊天身份必须未变(否则是用户主动导航/切聊天)
    if (snap.inGroup !== !!selected_group) {
        return false;
    }
    if (getCurrentChatId() !== snap.chatId) {
        return false;
    }
    if (!snap.inGroup && scriptModule.this_chid === undefined) {
        return false;
    }
    // 之前必须确有真实历史(>1 条),否则无可恢复
    if (snap.length <= 1) {
        return false;
    }

    const now = scriptModule.chat;
    if (!Array.isArray(now)) {
        return false;
    }

    // 核心判据:本守卫只在 reloadCurrentChat 内运行,而正常删除/编辑消息都不走 reload。
    // 一次成功的 reload 会从磁盘原样读回等量消息;若 reload 后消息数反而变少,
    // 说明那次 /api/chats/get 读失败/读空,触发了 ST 用问候语覆盖的 bug。
    // 不依赖 integrity(catch 失败路径不会重置 chat_metadata,integrity 不变)
    // 也不依赖问候语精确条数(可能是 1 条,也可能含角色卡多开场白)。
    return now.length < snap.length;
}

/**
 * 检测并恢复被问候语覆盖的聊天记录。
 * @param {ReturnType<typeof takeReloadSnapshot>} snap
 */
async function maybeRecoverFromGreetingOverwrite(snap) {
    if (!shouldRecoverChat(snap)) {
        return;
    }

    console.warn(`${LOG_PREFIX} 检测到切换正则触发酒馆 BUG 导致聊天被覆盖(原 ${snap.length} 条),正在自动恢复…`);

    // 1) 原地恢复内存中的消息数组(chat 是只读绑定,不能赋值,只能 splice)
    const c = scriptModule.chat;
    c.splice(0, c.length, ...snap.messages);

    // 2) 原地把旧 metadata 写回当前(被 getChat 重赋的)对象,并恢复原 integrity
    const meta = scriptModule.chat_metadata;
    if (meta && snap.metadata) {
        for (const key of Object.keys(snap.metadata)) {
            meta[key] = snap.metadata[key];
        }
    }
    if (meta && snap.integrity) {
        meta.integrity = snap.integrity;
    }

    // 3) 先重新渲染恢复后的消息(即使后续写盘失败,用户也能立刻看到记录还在)
    await scriptModule.printMessages();

    // 4) 强制重存覆盖磁盘上那条问候语。
    //    磁盘当前是问候语文件,普通保存可能 integrity mismatch → ST 弹 OVERWRITE 弹窗;
    //    这里用已验证的内存历史覆盖已损坏的问候语文件,force 是安全的。
    //    若导致 get 失败的故障同时让 save 失败,内存与界面已恢复,留日志提示用户。
    let saved = false;
    try {
        scriptModule.cancelDebouncedChatSave();
        if (snap.inGroup) {
            // 群聊:saveChat 对群聊会 throw,走 saveChatConditional(内部处理群聊)
            await scriptModule.saveChatConditional();
        } else {
            await scriptModule.saveChat({ force: true });
        }
        saved = true;
    } catch (error) {
        console.error(`${LOG_PREFIX} 聊天记录已在内存恢复,但重新写盘失败:`, error);
    }

    try {
        if (saved) {
            toastr.success(`柏宝箱已拦截一次酒馆 BUG 导致的聊天记录丢失,已自动恢复 ${c.length} 条消息`);
        } else {
            toastr.warning('柏宝箱已在界面恢复聊天记录,但写盘失败,请检查后端连接后手动保存一次');
        }
    } catch { /* toastr 不可用时忽略 */ }

    console.warn(`${LOG_PREFIX} 聊天记录已恢复(${c.length} 条),写盘${saved ? '成功' : '失败'}`);
}

export {
    installReloadGreetingGuard,
    isChatLossMitigationSupported,
    maybeRecoverFromGreetingOverwrite,
    shouldRecoverChat,
    takeReloadSnapshot,
};
