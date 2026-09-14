# dsh-chat-rail v0.6.4 发布说明（2026-09-14）

## 版本决策

- **0.6.3 → 0.6.4**（chore）：打包配置收窄——npm 包不再携带开发期验证截图。
  不涉及运行时代码，无行为变化。

## 变更

- `package.json` 的 `files` 新增否定模式 `!docs/shots/rail-ssid-dev-*`，把 9/7 的开发期验证截图
  （`rail-ssid-dev-*.png` 三张，共 440 KB）排除出分发包。
- 效果：包体积 **542.1 kB → 113.1 kB**（−79%），文件数 **12 → 9**。
- README 引用的 `rail-fav-1.png` / `rail-fav-2.png` 仍随包发布（npm 页面截图正常）；
  三张验证截图保留在仓库 `docs/shots/`——`docs/verification/` 与历史发布说明继续按原路径引用，
  只是不再随 npm 包分发。
- 依据：手册 §9 第 7 条只要求 README 引用的截图随包发布；验证截图属于仓库证据，不必进分发包。

## 验证

- `npm pack --dry-run`：**9 文件 / 113.1 kB**；`rail-ssid-dev-*` 全部排除，
  `rail-fav-1.png` / `rail-fav-2.png` / `lib/*` / `cordis.patch.yml` / `README.md` 均在包内 ✅
- `pnpm typecheck` ✅ · `pnpm test` **50/50** ✅（本次不改运行时代码，回归确认）

## 后续清理（同日）

- 上述三张验证截图随后**从仓库删除**：`docs/shots/` 回归「只放 README 引用的发布资产」。
  它们见证的修复链以 `docs/verification/验证记录-2026-09-07-chat-rail修复链L2.md` 的文字留痕为准——
  图是 0.6.1 时代的旧 UI，留在发布资产目录里既占体积、又容易与当前形态混淆。
- `files` 的否定模式**保留**：`docs/shots` 整目录入包的前提下，它阻止将来同类图放回该目录时误入分发包。
- 该清理不改变分发包内容（图本就被排除），故不另起版本。
