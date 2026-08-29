# L2 验证记录：屏蔽官方 TurnNavigator（轮次导航）

| 项 | 值 |
|---|---|
| 日期 | 2026-08-30 |
| 环境 | SSiD dev（`seek-soul-in-darkness/shell`，`npm start`），内核 ssid profile 锚点 `@deepseek-ai/dsh` 0.1.2-alpha.1，端口 60909 |
| 被测实体 | `~/.dsh/profiles/ssid/node_modules/@max-null/dsh-chat-rail/lib/`（sync 自 `max-null-plugins/dsh-chat-rail` HEAD `72a58dd`；版本号仍 0.4.0，dev 热更新形态） |
| 结果 | ✅ 通过：官方「轮次导航」竖轨（≥2 轮会话必渲染）在消息流右缘消失；dsh-chat-rail 画卷导航条与收藏/填充按钮正常；Console 0 error（用户确认） |
| 截图 | `docs/verification/2026-08-30-turnnavigator-hide.png` |
| 说明 | 屏蔽规则 = client CSS 注入 `nav[aria-label="轮次导航"],nav[aria-label="Turn navigation"]{display:none !important}`（aria-label 锚点，不用 hash 类名）。旧实体备份 `~/.dsh/profiles/ssid/.bak-chat-rail-0.4.0-20260830/`（可回滚）。 |
| 待办 | npm 发版 0.5.0（连同 HEAD 未发布 5 提交）→ 模板双处声明 → 归档；本次验证改动未 push（commit 72a58dd） |
