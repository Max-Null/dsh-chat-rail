# dsh-chat-rail 设计文档（SSiD 消息导航 rail）

> 日期：2026-08-18
> 状态：设计定稿
> 仓库：`H:\MaxNull\WorkStation\dsh-chat-rail`（新），发布名 `@max-null/dsh-chat-rail`
> 决策依据：`seek-soul-in-darkness/docs/决策/2026-08-18-消息导航自研-放弃第三方rail.md`
> 参考实现：`dsh-chat-timeline@0.1.2`（jjxjjjjiik-bot，431 行 client.js）——代码简单，UI 美化 + 冲突修复后自持

---

## 一、目标与不做什么

### 1.1 做什么

SSiD 会话面板右侧的消息导航 rail：
- 每条**用户消息**一根指示条（竖排），scroll spy 高亮当前阅读位置
- hover 展开消息预览面板，点击跳转到对应消息（未渲染历史自动加载）
- 与 better-sidebar 右侧栏**动画同步**（这是本次自研的核心修复点）
- **可见性达标**（指示条清晰可辨，不再"又小又浅"）
- 支持深浅主题，zh/en 双语

### 1.2 不做什么（边界）

- 不做搜索/书签/深链/统计（那是 dsh-milestone 的范畴，SSiD 不需要）
- 不做左侧 rail（SSiD 左侧已有官方 sidebar）
- 不做跨会话导航
- 不依赖 dsh-better-sidebar 作为硬依赖（optional peer：有它则避让，无它则固定 right:12px）

## 二、技术方案

### 2.1 架构（双半端，与 dsh-ssid-panels 同构）

```
src/
  index.ts          host 半端：sessionProjections 投影用户消息锚点
  client/index.tsx  client 半端：conversation.input.dock 注入 TimelineRail 组件
tsdown.config.ts    双产物：lib/index.js (node ESM) + lib/client.js (browser CJS ModuleLoader)
cordis.patch.yml    insert 一行
```

### 2.2 host 半端：用户消息投影

- 通过 `ctx.inject(['sessionProjections'])` 注册投影（dsh-chat-timeline 同款 `dshChatTimeline` 投影思路，但只保留我们需要的字段）。
- 投影从 session log 折叠出 `user` 消息锚点数组：`{ id, seq, created, preview }`（preview = 文本前 80 字，供未渲染历史 tooltip）。
- 排除插件/工具注入的上下文行（只收 `source.kind === 'user'`）。
- stateVersion 管理（刷新后能增量重建）。

### 2.3 client 半端：TimelineRail 组件

**注入槽**：`conversation.input.dock`（官方槽，ui-goal / dsh-chat-timeline 同款）。

**核心修复 1 — 动画同步（与 better-sidebar 共存）**：
- 不跟随"聊天区 rect"（dsh-chat-timeline 的 ResizeObserver 方案有滞后）。
- 改为：`right: calc(var(--dsh-sidebar-width, 0px) + 12px)`。
- better-sidebar 展开时给 `#root` 加 `margin-right: var(--dsh-sidebar-width)` 并带 CSS transition——rail 的 `right` 用**同一个 CSS 变量 + 同一段 transition**，两边动画天然同步，不再"边栏先展开、滚动条后移"。
- 兜底：`ResizeObserver` 观察 `[data-conversation-scroll]` 只在变量方案失效时启用（防御）。

**核心修复 2 — 可见性**：
- 折叠态 rail：宽度 36px，带半透明底色圆角容器（rgba 白底 + blur），指示条 10×3px，颜色 `rgba(0,0,0,.45)`（浅色主题）/ `rgba(255,255,255,.5)`（深色），hover 变品牌色。
- 活跃指示条：品牌色（`var(--dsw-alias-state-business-primary, #4d6bfe)`）+ 微光。
- 折叠态常显（不做"鼠标靠近才出现"——那正是 dsh-chat-timeline 不可见的根因）。

**scroll spy**：监听滚动容器 scroll 事件（防抖 80ms）+ 2s 定时兜底（dsh-chat-timeline 同款，可靠）。

**点击跳转**：目标锚点 id 未渲染 → `loadOlder` 循环补载（上限 10 次）→ `scrollIntoView({ block: 'start' })`。锚点定位依赖 `[data-message-id]` / `[data-chat-anchor-key]`（DSH 节点 DOM 锚点，两个都尝试）。

**展开交互**：hover 展开预览面板（消息文本 + 时间），点击指示条跳转；移出自动收起。不用"点击展开"（与 dsh-chat-timeline 的 hover 展开一致，避免额外状态）。

**i18n**：DSH locale 服务（zh/en），ssid-panels 同款 STRINGS 模式。

### 2.4 CSS 覆盖与主题

- 全部样式类加 `crl_` 前缀（namespace 防冲突），内联在 client.js 注入（dsh-chat-timeline 同款 `<style data-plugin-css>`）。
- 深色主题通过 `body[data-ds-dark-theme]` / `[data-theme='dark']` 选择器适配。

## 三、文件变更清单（新仓库）

| 文件 | 内容 |
|---|---|
| `package.json` | `@max-null/dsh-chat-rail`，双 manifest（dsh.bundle.patch + dsh.client），peer: react/cordis + optional dsh-better-sidebar |
| `tsdown.config.ts` | 双产物（ssid-panels 同款 clientBundle + purity gate） |
| `tsconfig.json` | ssid-panels 同款 |
| `cordis.patch.yml` | `insert: [{id: chat-rail, name: '@max-null/dsh-chat-rail'}]` |
| `src/index.ts` | host 投影 |
| `src/client/index.tsx` | TimelineRail 组件 |
| `docs/设计/2026-08-18-...md` | 本文档 |
| `README.md` | 安装/功能/兼容说明 |

## 四、测试与验证

1. `pnpm build` + `pnpm typecheck` 通过。
2. 装入 ssid profile（package.json dependencies + bundles），重启思灵：
   - rail 出现且可见（浅色主题下指示条清晰）
   - better-sidebar 展开/收起时 rail 与滚动条同步移动（无滞后）
   - 点击历史消息跳转正确（含未渲染历史）
   - 深色主题正常
3. 通过后：移除 dsh-chat-timeline（package.json 两处），自研插件保留。
4. 发布 npm + GitHub（@max-null/dsh-chat-rail，dsh-plugin topic），进 SSiD 预制清单。

## 五、风险与回滚

- **DSH 契约漂移**：`conversation.input.dock` / `sessionProjections` / DOM 锚点是 DSH client 契约，rc.8+ 可能变化 → 与 ssid-panels 同频跟进。
- **回滚**：开发失败可恢复 dsh-chat-timeline（依赖声明已记录）。
- **命名冲突**：awesome 已有 chat-timeline / msg-nav / turn-rail / message-rail 等，`dsh-chat-rail` 无同名（需发布前核验 npm 占用）。

---

> 设计定稿（2026-08-18）。实现顺序：仓库骨架 → host 投影 → client 组件 → 构建 → 装入 ssid 实测 → 移除 dsh-chat-timeline → 发布。
