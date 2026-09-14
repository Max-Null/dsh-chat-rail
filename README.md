# @max-null/dsh-chat-rail

本插件属于 **`@max-null/*` 插件系列**——这一系列共同构成 **[SSID（思灵 · Seek Soul in Darkness）](https://github.com/Max-Null/seek-soul-in-darkness)** 桌面体验。SSID 是整合它们的盒：`dsh-capture` · `dsh-chat-rail` · `dsh-chinese-thinking` · `dsh-draft-polish` · `dsh-guardian` · `dsh-habit` · `dsh-memory` · `dsh-node-appearance` · `dsh-plugin-center` · `dsh-quick-toolbar` · `dsh-skill-mcp-center` · `dsh-ssid-panels` · `dsh-ssid-zh-ui` · `dsh-achievements`。

This plugin belongs to the **`@max-null/*` family** — a set of plugins that together form the **[SSID (思灵 · Seek Soul in Darkness)](https://github.com/Max-Null/seek-soul-in-darkness)** desktop experience.

面向 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的**画卷式消息导航栏**：会话面板右侧的一条竖排导航，每条用户消息一个指示点，scroll-spy 跟随阅读位置，hover 展开画卷查看消息列表，点击跳转任意历史消息；消息 hover tip 内嵌「提问&回答」直达区，收藏 + 一键回填输入框。

> 不同于市面上"面板弹出式"的导航插件，dsh-chat-rail 采用**画卷式展开**：收起时是一条干净的竖条，hover 时从右往左平滑展开，像打开画卷一样。

## 截图

| 画卷展开：只显示收藏（通栏 header + 黄色收藏条） | 消息操作按钮（收藏 ★ / 填充 ➕ / 复制）+ 折叠态导航条 |
|---|---|
| ![rail-fav-1](docs/shots/rail-fav-1.png) | ![rail-fav-2](docs/shots/rail-fav-2.png) |

## 为什么比市面上的导航栏优秀

市面上的会话导航插件（chat-timeline / milestone / msg-nav / turn-rail…）大多只做"指示条 + 点击跳转"，在真实使用中有一堆体验问题。dsh-chat-rail 针对每一个问题给出了答案：

| 能力 | 市面同类 | dsh-chat-rail |
|---|---|---|
| **与侧边栏/底栏共存** | ❌ 展开时与 better-sidebar 错位、遮挡 | ✅ **锚定会话区右列 + 底栏变量避让**：导航条实时跟随会话列右缘，官方右侧边栏 push 展开时会话列左移、导航**同步左移**（共享同一段过渡动画），不再被压在面板下面；底栏展开收起按 `--dsh-sidebar-height` 垂直避让，互不遮挡 |
| **空间不足** | ❌ 依然悬浮，遮挡会话 | ✅ **自动退场**：会话区剩余宽度不足（<260px，如窄屏右侧边栏完全遮住会话）时导航条整体淡出，空间恢复即回来 |
| **展开形态** | ❌ 面板突兀弹出，高度错位 | ✅ **画卷式展开**：单容器从右往左平滑展开，高度天然一致 |
| **阅读位置跟随** | 高亮点会跑出显示区 | ✅ **导航条自动滚动，高亮点持续居中**：无论会话滚到哪里，当前消息的指示点始终在导航可视区中央 |
| **切换会话定位** | 回到顶部 | ✅ 自动定位到新会话当前阅读位置 |
| **消息预览** | 浏览器原生 title（与悬停双重提示） | ✅ **自绘 tip 面板**：完整内容、动画结束后精准定位、无原生 title 干扰；含图消息在文本上方显示缩略图，tip 底部还有**「提问&回答」直达区** |
| **消息信息** | 只有预览文本 | ✅ **编号 + 相对时间 + 文本三列对齐**：编号固定宽、时间靠右，文本区域最大化且整齐 |
| **长会话跳转** | 干等卡死 | ✅ **加载反馈**：跳转远距离消息时显示 spinner + "加载中"，收起态只留图标 |
| **消息收藏** | ❌ 大多数只能看不能存 | ✅ **收藏 + 快速填充**：消息行星标收藏（黄色导航条联动）、「只显示收藏」为面板**通栏 header**（折叠/展开同构、贴顶不遮条目）、加号一键全文+附件回填输入框 |
| **主题适配** | 部分 | ✅ 全部使用 DSH 主题变量（`--dsw-alias-*`），浅深色无缝适配 |
| **无侧边栏兜底** | ❌ 依赖特定插件 | ✅ 纯 DSH 环境开箱即用，锚定会话区右缘 + 垂直居中 |

## 兼容性（重点）

- **与 dsh-better-sidebar 深度兼容**：底栏展开/收起时导航按 `--dsh-sidebar-height` 垂直避让，与面板**共享同一段 transition 动画同步移动**，永不错位（包括底栏右上角的收起按钮）。
- **右缘锚定会话区右列**：导航条实时测量会话列右缘定位——官方右侧边栏默认 push 展开时会话列左移，导航**同步左移**（同段过渡动画），不再被压在文件面板下面；不再依赖恒为 0 的 `--dsh-sidebar-width`。
- **空间不足自动退场**：会话区剩余宽度 < 260px 时（如窄屏右侧边栏完全遮住会话），导航条整体淡出，空间恢复即回来。
- **会话区滚动条隐藏**：会话区（`[data-conversation-scroll]`）自带的 Y 轴滚动条被本插件画成透明——它与导航条的位置指示功能重复，官方内核 `0.1.5` 起又把 bar 从「紧贴内容边缘」改为「离边缘 2px」，观感上更显眼。只覆盖 thumb 颜色、**保留官方 8px 槽位**（`scrollbar-gutter: stable` 是官方为输入卡跨视图不位移而保留的），滚轮/触控板滚动不受影响。
- **无 better-sidebar 也能用**：变量缺失时走 CSS fallback（垂直居中 + 视口右缘），纯 DSH 环境开箱即用。
- **与 DSH 自带轮次导航协同**：DSH `0.1.2-alpha.1+` 自带 TurnNavigator（轮次导航竖轨）。安装本插件后自动隐藏官方竖轨（aria-label 双文案锚点，不依赖构建 hash），由本插件统一承担会话导航；未安装本插件时官方导航照常显示。设置卡片另提供**「使用官方轮次导航条（对比模式）」**开关，可随时切回官方竖轨对比（免重启生效）。
- **深历史跳转（DSH `0.1.2-alpha.3+` 内核）**：会话历史按窗口分页加载（`hasMore`）时，点击跳转走官方 `loadThrough(seq)` 精确跳转装载器（200 条/页一次到位），替代旧版逐页 `loadOlder`（50 条/页）循环；旧内核无 `loadThrough` 时自动回退逐页循环。
- 需要 DSH ≥ `0.1.0-rc.6`；随 SSiD v0.3.0（内核 `0.1.5-rc.2`）完整适配验证。

## 安装

```bash
dsh plugin --profile <name> add @max-null/dsh-chat-rail
```

或手动加入 profile 的 `package.json` dependencies + `dsh.profile.bundles`：

```yaml
- id: chat-rail
  name: '@max-null/dsh-chat-rail'
```

## 交互

- **hover 导航条**：画卷展开，显示编号 / 相对时间 / 消息预览
- **hover 消息项**：左侧弹出完整内容 tip 面板（含图消息在文本上方显示图片缩略图；tip 底部**「提问&回答」区**列出该消息内的提问——SVG 图标 + 单行问题，点击直达提问/回答位置）
- **点击消息项**：跳转到会话中对应消息（未加载的历史自动补载；DSH `0.1.2-alpha.3+` 走官方 `loadThrough` 精确跳转，旧内核回退逐页循环）
- **滚动会话**：高亮点跟随，导航条自动滚动保持居中
- **含图消息**：展开态显示柔和图片角标（收起态不显示，保持竖条干净）

### 收藏与快速填充

- **消息操作按钮**：每条用户消息的复制按钮左侧新增两个按钮
  - **星 ★**：收藏/取消收藏该消息（收藏后变成黄色实心星）；收藏状态按会话持久化（localStorage），刷新与重启后保留
  - **加号 ＋**：一键把该消息**全文 + 附件**填入输入框（草稿设为消息全文，历史图片经官方附件通道回填入输入框）
- **导航条联动**：收藏的消息指示条显示为**黄色**；展开态在标题前显示小星标
- **只显示收藏**：过滤开关是导航面板的**通栏 header**（星标 + 文案 + 底部分隔线，折叠/展开同构、贴顶），点击点亮（黄色实心）后导航栏只显示已收藏的消息；再点恢复全部。列表在 header 之下独立滚动，开关不压住条目；无收藏时不显示该开关，过滤中取消最后一条收藏会自动退出过滤

## 架构

- **host 半端**（`lib/index.mjs`）：注册 `chatRail` 会话投影——从 session log 折叠用户消息锚点 `{ seq, time, text, id }`（排除插件/工具注入的上下文行）
- **client 半端**（`lib/client.js`）：`conversation.input.dock` 槽注入，portal 渲染到 body；右缘实时测量会话列定位（ResizeObserver + 兜底采样），侧边栏 push 展开时跟随移动，空间不足时淡出
- 数据源优先序：`chatRail` 投影 → 已加载聊天节点 → 后台 loadOlder 循环

## SSID 系列

本插件是 **[SSID（思灵 · Seek Soul in Darkness）](https://github.com/Max-Null/seek-soul-in-darkness)** 全家桶的一员；也可以单独安装到任意 DSH profile——除设置卡片外不依赖其它同系列插件（右侧边栏避让、导航条定位都走官方 DOM 契约，缺失时自动降级）。

## 开发

```bash
pnpm install
pnpm typecheck   # tsc 严格类型检查
pnpm build       # 产出 lib/
```

## License

MIT
