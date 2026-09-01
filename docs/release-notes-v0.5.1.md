# dsh-chat-rail v0.5.1 发布说明（2026-09-01）

## 版本决策

- **0.5.0 → 0.5.1**（patch）：修复「点击导航跳转失效」——DSH `0.1.2-alpha.2` 数据通道迁移导致的回归，非 break。

## 问题与根因

- **现象**：点击导航条任意历史消息，提示"加载中…"后无跳转；Console 出现
  `[chat-rail] jumpToMessage: node "13:input-message…" not loaded after N page(s)`。
- **根因**：DSH `0.1.2-alpha.2` 把 Conversation 目标数据移出 Session 快照——`session.getSnapshot()` 不再携带
  `chat.nodes`（官方注释：*excluding Conversation target data*），Chat 节点迁入
  `uiConversation` 服务的 `'chat'` 视图目标（`ChatSnapshot.nodes` keyed store）。
  chat-rail 的"目标是否已加载"探测仍读 `snapshot.chat.nodes` → 恒为空 → 总认为未加载 →
  翻页到 `hasMore` 耗尽仍找不到 → 放弃滚动。收集（fallback）与 tip 全文/图片读取同病。

## 修复（0c3b0de）

- **双数据通道适配**：优先官方 `uiConversation.binding(sessionId).target('chat')` 的
  `ChatSnapshot.nodes.get(key)`（当前 DSH），回退旧版 `chat.nodes` Map（旧 DSH 兼容，未变行为）。
  - `chatNodeOf`：统一节点解析（新 store / 旧 map）
  - `jumpToMessage`：新增 `nodeOf` 实时探测参数（每次判读当前快照，命中即停翻页并滚动）
  - `collectFromNodes` / `railMessageOfNode`：适配两种数据面（user/steering 行，按键排序）
  - `fullTextOf` / `tipImagesOf`：改走 `chatNodeOf`
  - `apply`：`ctx.inject(['uiConversation'], …)` 可选注入（cordis 独立 fiber，服务缺席不阻塞插件）
- 新增 `tests/client-nodes.spec.ts`（11 例）：双通道节点解析/收集 + jumpToMessage 翻页判定。

## 回归确认（L1）

- `pnpm typecheck` ✅
- `pnpm test` 34/34 ✅
- L2 实测（web 环境，DSH 0.1.2-alpha.2）：点击历史消息跳转正常、翻页补载正常、Console 0 error ✅
