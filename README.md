# @max-null/dsh-chat-rail

本插件属于 **`@max-null/*` 插件系列**——这一系列共同构成 **[SSID（思灵 · Seek Soul in Darkness）](https://github.com/Max-Null/seek-soul-in-darkness)** 桌面体验。SSID 是整合它们的盒：`dsh-capture` · `dsh-chat-rail` · `dsh-chinese-thinking` · `dsh-draft-polish` · `dsh-guardian` · `dsh-habit` · `dsh-memory` · `dsh-node-appearance` · `dsh-plugin-center` · `dsh-quick-toolbar` · `dsh-skill-mcp-center` · `dsh-ssid-panels` · `dsh-ssid-zh-ui` · `dsh-achievements`。

This plugin belongs to the **`@max-null/*` family** — a set of plugins that together form the **[SSID (思灵 · Seek Soul in Darkness)](https://github.com/Max-Null/seek-soul-in-darkness)** desktop experience.

面向 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的**画卷式消息导航栏**：会话面板右侧的一条竖排导航，每条用户消息一个指示点，scroll-spy 跟随阅读位置，hover 展开画卷查看消息列表，点击跳转任意历史消息。

> 不同于市面上"面板弹出式"的导航插件，dsh-chat-rail 采用**画卷式展开**：收起时是一条干净的竖条，hover 时从右往左平滑展开，像打开画卷一样。

## 截图

| 画卷展开（收藏过滤 + 收藏导航条） | 消息操作按钮（收藏 ★ / 填充 ➕ / 复制） |
|---|---|
| ![rail-fav-1](docs/shots/rail-fav-1.png) | ![rail-fav-2](docs/shots/rail-fav-2.png) |

## 为什么比市面上的导航栏优秀

市面上的会话导航插件（chat-timeline / milestone / msg-nav / turn-rail…）大多只做"指示条 + 点击跳转"，在真实使用中有一堆体验问题。dsh-chat-rail 针对每一个问题给出了答案：

| 能力 | 市面同类 | dsh-chat-rail |
|---|---|---|
| **与侧边栏/底栏共存** | ❌ 展开时与 better-sidebar 错位、遮挡 | ✅ **跟随 CSS 变量动画同步避让**：`--dsh-sidebar-width` / `--dsh-sidebar-height`，与面板共享同一 transition，右栏/底栏展开收起时导航无缝跟随，互不遮挡 |
| **展开形态** | ❌ 面板突兀弹出，高度错位 | ✅ **画卷式展开**：单容器从右往左平滑展开，高度天然一致 |
| **阅读位置跟随** | 高亮点会跑出显示区 | ✅ **导航条自动滚动，高亮点持续居中**：无论会话滚到哪里，当前消息的指示点始终在导航可视区中央 |
| **切换会话定位** | 回到顶部 | ✅ 自动定位到新会话当前阅读位置 |
| **消息预览** | 浏览器原生 title（与悬停双重提示） | ✅ **自绘 tip 面板**：完整内容、动画结束后精准定位、无原生 title 干扰 |
| **消息信息** | 只有预览文本 | ✅ **编号 + 相对时间 + 文本三列对齐**：编号固定宽、时间靠右，文本区域最大化且整齐 |
| **长会话跳转** | 干等卡死 | ✅ **加载反馈**：跳转远距离消息时显示 spinner + "加载中"，收起态只留图标 |
| **消息收藏** | ❌ 大多数只能看不能存 | ✅ **收藏 + 快速填充**：消息行星标收藏（黄色导航条联动）、只显示收藏过滤、加号一键全文+附件回填输入框 |
| **主题适配** | 部分 | ✅ 全部使用 DSH 主题变量（`--dsw-alias-*`），浅深色无缝适配 |
| **无侧边栏兜底** | ❌ 依赖特定插件 | ✅ 纯 DSH 环境开箱即用，固定右缘 + 垂直居中 |

## 兼容性（重点）

- **与 dsh-better-sidebar 深度兼容**：导航栏的右缘和垂直位置跟随 better-sidebar 的 `--dsh-sidebar-width` / `--dsh-sidebar-height` CSS 变量，右栏和底栏展开/收起时导航与面板**共享同一段 transition 动画同步移动**，永不错位、永不遮挡（包括底栏右上角的收起按钮）。
- **无 better-sidebar 也能用**：变量缺失时走 CSS fallback（右缘 12px + 垂直居中），纯 DSH 环境开箱即用。
- 需要 DSH ≥ `0.1.0-rc.6`。

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
- **hover 消息项**：左侧弹出完整内容 tip 面板（含图消息在文本上方显示图片缩略图）
- **点击消息项**：跳转到会话中对应消息（未加载的历史自动翻页补载）
- **滚动会话**：高亮点跟随，导航条自动滚动保持居中
- **含图消息**：展开态显示柔和图片角标（收起态不显示，保持竖条干净）

### 收藏与快速填充（v0.4.0）

- **消息操作按钮**：每条用户消息的复制按钮左侧新增两个按钮
  - **星 ★**：收藏/取消收藏该消息（收藏后变成黄色实心星）；收藏状态按会话持久化（localStorage），刷新与重启后保留
  - **加号 ＋**：一键把该消息**全文 + 附件**填入输入框（草稿设为消息全文，历史图片经官方附件通道回填入输入框）
- **导航条联动**：收藏的消息指示条显示为**黄色**；展开态在标题前显示小星标
- **只显示收藏**：导航条顶部新增星形过滤开关，点击点亮（黄色实心）后导航栏只显示已收藏的消息；再点恢复全部

## 架构

- **host 半端**（`lib/index.mjs`）：注册 `chatRail` 会话投影——从 session log 折叠用户消息锚点 `{ seq, time, text, id }`（排除插件/工具注入的上下文行）
- **client 半端**（`lib/client.js`）：`conversation.input.dock` 槽注入，portal 渲染到 body
- 数据源优先序：`chatRail` 投影 → 已加载聊天节点 → 后台 loadOlder 循环

## SSID 系列

## 开发

```bash
pnpm install
pnpm typecheck   # tsc 严格类型检查
pnpm build       # 产出 lib/
```

## License

MIT
