# dsh-chat-rail v0.6.0 发布说明（2026-09-02）

## 版本决策

- **0.5.1 → 0.6.0**（feature）：吃下 DSH `0.1.2-alpha.3` 引入的官方深历史分页新特性—— `loadThrough(seq)` 精确跳转装载器（`0.1.2-alpha.4` 内核定型），替换旧版逐页翻载，同时补齐对 alpha.4 内核的依赖对齐。行为向后兼容：旧内核自动回退。

## 官方新特性背景

- DSH `0.1.2-alpha.1` 引入 TurnNavigator（compact rail）；`alpha.3` 升级为 **full-session turn rail**（全会话轮次导航 + `load-and-jump`），会话控制器新增 `loadThrough(seq)`——按目标 **seq** 精确向后分页（`JUMP_PAGE_MESSAGES = 200` 条/页），一次性把窗口拉到目标位置，替代泛化翻页；`alpha.4` 收尾（固定间距滚动、jump 落点修正、预览卡、memo 防重建）。
- 官方 `loadThrough` 语义：窗口未覆盖目标时内部循环分页直至覆盖；**`loadingOlder` 被普通负载者持有时立即返回（不排队）**，调用方须等待释放后重试；`hasMore` 耗尽仍未达目标即停。
- 内核 web-app bundle 已内置 `@deepseek-ai/dsh-session-turn-outline`（turnOutline 投影），官方 rail 自动获得全会话能力——chat-rail 保持屏蔽官方 rail（aria-label 锚点未变），由本插件统一承担导航。

## 升级内容

### 1. 深历史跳转改走 `loadThrough(seq)`（`src/client/index.tsx`）

- `jumpToMessage` 新增第 7 参数 `targetSeq`（消息的事件 seq：chatRail 投影 `seq` 或节点 `anchorSeq`）。
- 新路径（内核 ≥ alpha.3 且 seq 可用）：
  1. 等待 `loadingOlder` 释放（普通分页者持有时官方不排队，等待其归还）；
  2. 一次 `session.loadThrough(targetSeq)`（200 条/页内部循环，精确到位）；
  3. 轮询目标节点出现（chat 视图组装分页窗口是异步的，上限 5s）；
  4. 失败则 `console.warn` + 快速放弃（不再烧 DOM 轮询）。
- 回退路径（旧内核无 `loadThrough`，或 seq 不可依赖）：原 `loadOlder` 逐页循环（50 条/页、≤120 页 guard、`onProgress` 页数回调）完整保留。
- 调用点传入 `m.seq`，注释标明走官方 jump pager。

### 2. 深历史跳转落位修复（alpha.3+ 分页补偿）

- L2 实测发现（SSiD dev，DSH alpha.4 内核，43 条消息/1500+ 行会话）：`loadThrough` 分页成功后，
  `scrollIntoView` 落位**被官方 prepend 补偿覆盖**——打开会话尾部窗口（130 行），点击第一条后窗口
  扩张到 1525 行（scrollTop 轨迹 12758 → 145971 → 被覆盖回 44464），目标行悬在视口上方 5530px。
- 根因：alpha.3+ 分页期间 chat 视图持续「补偿读者位置」（prepend 高度补偿 + settle），
  `scrollIntoView` 在补偿飞行中执行即被覆盖。
- 修复：落位改为三段防御——
  1. **等几何静默**：scrollTop/scrollHeight 连续 3 次采样（150ms 间隔）不变；
  2. **显式落位**：由行 rect 与视口 rect 差值计算目标 scrollTop（`scrollTo`，reduced-motion 尊重）；
  3. **复查重落**：600ms × 4 次校验行中心落在视口偏移 20% 内，偏离则重落（兜底 bottom-follow 拉回）。
- 实测：jump-first ratio 0.003（scrollTop 144/45288，精准到首条）；jump-last ratio 0.960；console 干净。

### 3. 依赖对齐 DSH `0.1.2-alpha.4`

- peer：`@deepseek-ai/dsh-session-projection` `^0.1.1-rc.1` → `^0.1.2-alpha.4`。
- devDeps：`dsh-client-locale` / `dsh-client-ui-conversation` / `dsh-client-ui-slots` / `dsh-session-projection` 全部 `^0.1.2-alpha.4`；补 `@deepseek-ai/dsh-session@^0.1.2-alpha.4`（alpha.4 系列包的 pre-release peer 链在 pnpm 11 下需显式直装才能解析，否则 `PNPM_NO_MATCHING_VERSION`）。
- `@deepseek-ai/dsh-client-runtime` 保持 `^0.1.1-rc.2`（官方自 alpha.2 移除此运行时包，npm 停更于 rc.2；本插件仅 type-only 引用，运行时仅消费官方 ui 服务）。

## 回归确认（L1）

- `pnpm typecheck` ✅（以 alpha.4 类型面编译）
- `pnpm test` 37/37 ✅（新增 3 例：loadThrough 精确单跳/等待 busy 释放后跳转/无节点快速告警；旧循环 4 例保留）

## 待办

- **L2 实机验证（DSH 0.1.2-alpha.4 内核）**：需把测试环境内核升到 alpha.4（SSiD dev = `seek-soul-in-darkness/shell` 源码模式 + `deepseek-harness` checkout 切 `dsh-v0.1.2-alpha.4` tag → `pnpm install` + `pnpm run build` → 重启）。验证点：① 官方 TurnNavigator 被屏蔽、chat-rail 正常；② 长会话（>1 窗口）点击第一页之外的历史消息 → 一次 loadThrough 精确到位；③ Console 0 error。
