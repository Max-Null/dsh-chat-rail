# L2 验证记录 — dsh-chat-rail 0.6.0 loadThrough 深历史跳转（2026-09-02）

## 环境

- 宿主：SSiD dev（`seek-soul-in-darkness/shell` 源码模式，Electron）
- 内核实体：`@deepseek-ai/dsh 0.1.2-alpha.4`（profile 声明+实体一致，3081 端口）
- 被测实体：`~/.dsh/profiles/ssid/node_modules/@max-null/dsh-chat-rail` lib 热更新（0.6.0 构建产物，未发版）
- 验证方式：`playwright-core` 无头访问 SSiD 内核 web 面（只读消费，不触碰实例进程/进行中会话）
- 会话样本：「插件中心升级与更新决策汇总」（历史会话，43 条用户消息，窗口打开 130 行 → 全量 1525 行锚点）

## 结果（tests/verify-loadthrough.mjs，修正确认判定后）

| 检查 | 结果 | 详情 |
|---|---|---|
| client bundle 加载 | ✅ | style 标记注入成功（alpha.4 内核） |
| chat-rail 导航条 | ✅ | 42 项渲染正常 |
| 官方 TurnNavigator 屏蔽 | ✅ | `nav[aria-label="轮次导航"]` computed display: none |
| 跳首条（深历史） | ✅ | scrollTop 144/45288（ratio 0.003），loadThrough 窗口扩展 130→1525 行 |
| 跳末条 | ✅ | ratio 0.960 |
| chat-rail console warn | ✅ | 0 条（无 "not loaded"） |
| 页面错误 | ✅ | 0 |

## 发现与修复（本次 L2 核心产出）

1. **loadThrough 分页路径本身工作正常**：点击首条后窗口从 130 行扩展到 1525 行（scrollHeight 13582 → 45288），loading 指示、无 warn——alpha.3+ 会话控制器的 `loadThrough(seq)` 精确分页生效。
2. **发现落位被官方 prepend 补偿覆盖（alpha.4 特有竞态）**：轨迹采样（`e2e-landing.mjs`）显示
   scrollTop 12758 → 47601 → 99889 → 145971 → 被覆盖回落 44464（目标行悬在视口上方 5530px）。
   根因：分页期间 chat 视图持续「读者位置补偿 + settle」，`scrollIntoView` 在补偿飞行中落位即被覆盖。
3. **修复**（commit 落位修复）：几何静默等待（3×150ms 稳定）→ 显式 scrollTo（行 rect 差值计算目标）
   → 600ms×4 复查重落（兜底 bottom-follow 拉回）。修复后 ratio 0.003 精准到位。

## 备注

- 验证期间未重启/启停任何 DSH 实例（本会话宿主 web(3080) 禁启停原则）；SSiD dev 实体为热更新（lib 替换），
  **重启 SSiD dev 前必须先 npm 发布 0.6.0 并在 profile 执行 pnpm add**，否则按 lockfile 回滚 0.5.1。
- 验证脚本（repo `tests/`）：`verify-loadthrough.mjs`（主验证）、`e2e-landing.mjs`（落位轨迹诊断）、
  `e2e-jump-diag.mjs` / `e2e-probe.mjs`（会话列表探针）。
