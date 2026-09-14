# dsh-chat-rail v0.6.3 发布说明（2026-09-14）

## 版本决策

- **0.6.2 → 0.6.3**（fix + 收纳两处未发布的本地改动）。
- 依据：npm 上的 `0.6.2` 发布于 2026-09-14T05:02（UTC 09-13T21:02），内容 = 本地提交
  `e674973`（导航条四项改造：右缘锚定会话列 / 空间自适应隐藏 / 「提问&回答」收进 hover tip /
  收藏开关改通栏 header）。此后本地还有两项改动未随包发布，故发 **0.6.3**：
  `3bedd82`（tip 内问答归属修复）与时序上更晚的会话区滚动条隐藏。

## 修复

### 1. tip 内「提问&回答」的归属（`3bedd82`）

- 现象：同一条提问会出现在它之前**所有**更早消息的 hover tip 里。
- 根因：归属判据只有 `qa.seq >= message.seq`（下界），没有上界。
- 修复：`qaWithinMessage()` 增加上界——问答归给它前面**最近**的那条消息
  （`qa.seq >= self.seq && qa.seq < nextMessage.seq`），并补单元测试。

### 2. 会话区 Y 轴滚动条隐藏

- 现象（用户报告）：会话面板右缘又出现一条滚动条，与导航条的位置指示功能重复。
- 取证：**不是插件回归**——chat-rail 全历史只有 `.crl_nav` / `.crl_list`（rail 自身）的滚动条
  规则；会话区滚动条是官方既有设计（`ConversationRoot.module.css` 的 `scrollbar-gutter: stable`
  + ui-theme `scrollbar.css` 的 8px 样式，`rc.1` 与 `0.1.5-rc.2` 两版一致）。观感变化来自官方
  0.1.5 新增的 `margin-right: 2px` 与 track 内缩——bar 从「紧贴内容边缘」变成「离边缘 2px」的独立一条。
- 修复：把会话区滚动条 **thumb 画成透明**（`[data-conversation-scroll]::-webkit-scrollbar-thumb`）。
  刻意**不**把宽度压成 0：那会连带回收官方 `scrollbar-gutter: stable` 的 8px 槽位，内容区变宽、
  输入卡横移（官方无条件保留槽位正是为此）。track 官方本就透明，故只需 thumb 一条；`thumb:hover`
  一并列出以免特异性/注入顺序决定 hover 态。也不写 `scrollbar-width`——ui-theme 注释记录：
  非 `auto` 的 `scrollbar-width` 会让 Chromium 丢弃该元素全部 `::-webkit-scrollbar*` 规则。

## 文档与截图

- **README 全面更新**：介绍段（tip 问答区 + 收藏）、对比表（右缘锚定 / 空间退场 / 通栏 header /
  tip 问答，新增「空间不足」行）、兼容性节（右缘锚定会话列、空间退场阈值 260px、滚动条隐藏、
  官方轮次导航对比开关、SSiD v0.3.0 / 内核 `0.1.5-rc.2` 验证声明）、交互与收藏节、架构节、
  「SSID 系列」节补齐。
- **简介（npm `description`）**：补「收藏过滤」，与当前能力对齐。
- **截图**：`docs/shots/rail-fav-1.png`（画卷展开「只显示收藏」：通栏 header + 黄色收藏条）、
  `rail-fav-2.png`（消息操作按钮 ★/➕/复制 + 折叠态导航条）更新为 0.6.2 后的实际形态。
- 新增验证记录：`docs/verification/验证记录-2026-09-14-会话区滚动条隐藏.md`。

## 验证

### L1（仓库）

| 项 | 结果 |
|---|---|
| `pnpm typecheck` | ✅ exit 0 |
| `pnpm test` | ✅ **50/50** |
| `pnpm build` | ✅ 产物含新规则 |

### L2（SSiD dev 实测，内核 `0.1.5-rc.2`）

| # | 检查项 | 结果 |
|---|---|---|
| ① | 滚动条绘制 | ✅ 会话区右缘 12×320 条带全为背景色（无滚动条色） |
| ② | 用户侧截图复核 | ✅ 会话区右缘 8px 区域主色 = 背景色 RGB(233,238,246)、占比 0.79–0.8，无滚动条色 |
| ③ | 布局零位移 | ✅ `offsetWidth-clientWidth` 仍为 8（槽位保留）；`clientWidth 990` 与改动前一致；composer 位置未变 |
| ④ | 滚动能力 | ✅ `scrollTop 665 → 865` 正常 |
| ⑤ | 采样方法有效性 | ✅ 对照：自造容器注入红 thumb → 全屏扫描检出 182 红像素 |
| ⑥ | console | ✅ 0 error |

- 实体同步：`lib/{client.js,client.js.map,index.mjs}` → web / ssid 双 profile，MD5 三处一致。
- 详见 `docs/verification/验证记录-2026-09-14-会话区滚动条隐藏.md`（含取证表与验证边界）。

## 备注

- 本版全部为插件侧改动，与内核升级无关。
- 两处改动均已随 0.6.3 同步到 SSiD profile（`~/.dsh/profiles/{web,ssid}`）；SSiD v0.3.0
  （待发布）的归档在重建时会带入 0.6.3 实体。
