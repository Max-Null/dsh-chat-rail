# dsh-chat-rail v0.5.0 发布说明（2026-08-30）

## 版本决策

- **0.4.0 → 0.5.0**（minor）：新功能「安装后自动屏蔽 DSH 官方轮次导航」+ 1 个收藏粘性修复，非 break。

## 相对于 npm 0.4.0 的增量

- **feat(client)：屏蔽官方 TurnNavigator（轮次导航）**——DSH `0.1.2-alpha.1+` 自带轮次导航竖轨（与右键 messages 同名右缘位置；仅轮次维度）。安装本插件后自动隐藏官方竖轨，由本插件统一承担会话导航。锚点用 **aria-label 中英双文案**（`轮次导航` / `Turn navigation`），不用 CSS module 类名（`hkplfa_slot` 这类 hash 随构建漂移）。
  - L2 实测（SSiD dev）通过：官方竖轨消失、导航/收藏功能正常、console 0 error。记录：`docs/验证记录-2026-08-30-屏蔽官方TurnNavigator.md`（含截图）。
- **fix(client)：收藏开关粘性正确**——收藏开关粘住胶囊顶部（含 padding 区域），行不再从顶部透过（8658e46）。
- docs：家族清单同步（header-unify → quick-toolbar 迁出）、L2 留痕。

## 回归确认（L1）

- `pnpm typecheck` ✅
- `pnpm test` 22/22 ✅
