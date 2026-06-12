# Goal — CLI 面收敛：删冗余 flag、统一报表为「默认 HTML / `--text`」

> **DONE — shipped in `0e106ac` / `3c6a63d` / `9f1cfae`.** 全部验收已落地，归档保留作历史记录。

## 目标
tk 的命令面在迭代中堆出大量重复与死 flag（dogfood 时发现）。本 goal 一次性
收敛：删掉确认无用的 flag，统一「报表类」命令的默认行为，去掉跨命令重复。
核心方向（用户决定）：

- **inspect 和 gain 都默认生成 HTML 并打开**；要终端文本时加 `--text`。
- **删除 `gain report` 子命令**（无必要），也**不加 `--details`**——gain 本身就是那份报表。
- A/B 分析里的 #1–#12 全部修。

## 现状（必读）
报表/输出相关：
- `src/inspect/cli.ts` — `inspect` 当前**默认 text**，`--html` 才出 HTML，`--json` 出 JSON。
- `src/cli.ts:251` — `gain report` 派发到 `src/core/ledger.ts::runReport`（四视图，默认 HTML）。
- `src/core/gain.ts:106-112` — `gain` 的 `--json`/`--csv` 与 `--format json|csv|text` **两套写法设同一个 `args.format`**。
- `src/parse.ts:156` + `src/cli.ts:220` — proxy 的 `--report`（mode `report`），help 自标 "Legacy"。

死/重复 flag：
- `src/context/optimizeCli.ts:28,43,58` — `optimize --dry-run` 解析进 `args.dryRun` 但**全代码无人读**（无动作 flag 时本就是 dry-run）。死 flag。
- `--stats` vs `--verbose`（`src/parse.ts` ~104-113）：`--verbose` = `--stats` + raw 路径，超集。
- `--write-advice` 同时在 `inspect`（`src/inspect/cli.ts`）和 `optimize`（`src/context/optimizeCli.ts`）。
- `src/parse.ts:143` — `--no-dedup`：session dedup 默认**开**（`TK_SESSION_DEDUP=0` 或 config `sessionDedup:false` 才关），per-command 关它几乎无意义。

scope 表达分裂：
- `gain --user`（`gain.ts`）/ `gain report --project|--user` / `gain report --scope user|project|runtime` 三套并存。

子命令重复：
- `src/shim/cli.ts` + `src/cli.ts:232` — `tk shim <install|status|uninstall>` 与顶层 `install/uninstall/status` 重复；help 自述「advanced/debug path」。
- `src/context/optimizeCli.ts:160` — `optimize --vscode-settings` 与 optimize「修 inspect 发现」主职无关，是 bolt-on 模式。

## 改动清单

### 已决定（直接做）
1. **`inspect` 默认翻转**：默认出 HTML + 打开；新增 `--text` 走终端文本；移除 `--html`（成为默认）。`--json` 保留（机器可读）。
2. **`gain` 报表化**：默认出 HTML + 打开；`--text` 走终端文本；`--json` 保留。
3. **删除 `gain report` 子命令**（`src/cli.ts:251` 派发 + `src/core/ledger.ts::runReport`），不加 `--details`。`gain` 的 HTML 即承载原 report 的四视图内容。
4. **删 `optimize --dry-run`**（死 flag）。无动作 flag 时默认仍是 plan/preview（文本）。
5. **删 proxy `--report`**（`parse.ts:156`/`cli.ts:220`，legacy）→ 用 `tk gain`。
6. **gain 输出 flag 去重**：移除 `--format`（与 `--json`/`--csv` 重复）；最终 gain 输出口径 = {默认 HTML, `--text`, `--json`}。`--csv` 去留见「待确认」。
7. **合并 `--stats`/`--verbose`**：保留 `--stats`；raw 路径并入（或 `-v`）。删 `--verbose` 作为独立超集。
8. **`--write-advice` 只留在 `inspect`**（advice 是 inspect 产物）；从 `optimize` 移除。
9. **gain scope 统一**为 `--user`（默认 project）。随 `gain report` 删除，`--scope` 一并消失。

### 已决定（续，用户已圈定）
10. **删 `--no-dedup`**（`src/parse.ts:143`）：dedup 默认关，per-command 关它无意义。
11. **`tk shim` 子命令隐藏**：从 `--help` 移除，保留为内部/调试入口（顶层 install/uninstall/status 已覆盖普通用户）。`src/cli.ts:232` 仍可派发，但 help 文本删除该段。
12. **`optimize --vscode-settings` 并入正常流**：移除独立 flag；改为 inspect 把「VS Code 设置可省 token」作为 finding 报出，`optimize --apply` 一并修复。
    - 注意：这是**真实工作量**，不止删 flag——需要一个 inspect 侧的 VS Code 设置分析器产出 finding（参照 `src/context/rules/*`），并让 `runApply` 能落地该类 finding。可作为本 goal 内的独立 slice。
13. **`inspect` flag 瘦身**：删 `--copilot-context`、`--repo-context`、`--telemetry-export`/`--no-telemetry-export`（`src/inspect/cli.ts`）。`--surface` 保留。

## 验收 → verify
- [x] `tk inspect` 默认打开 HTML；`tk inspect --text` 出终端文本；`--html` 不再存在（或报 unknown）。
- [x] `tk gain` 默认打开 HTML；`tk gain --text` 出文本；`tk gain report` 报 unknown subcommand。
- [x] `tk optimize --dry-run`、`tk <cmd> --report`、`tk gain --format` 均报 unknown flag。
- [x] `grep -rn "args.dryRun\|--token-budget" src/` 无命中（dryRun 死字段已清）。
- [x] `--write-advice` 仅在 inspect 生效；optimize 不再接受。
- [x] `tk <cmd> --no-dedup` 报 unknown flag；`tk --help` 不再出现 `tk shim` 段。
- [x] `tk optimize --vscode-settings` 报 unknown flag；VS Code 设置问题改由 `inspect` 报 finding、`optimize --apply` 修复。
- [x] `tk inspect --copilot-context|--repo-context|--telemetry-export` 均报 unknown flag。
- [x] 全套 `pnpm test` 绿；help 文本同步更新，无悬挂 flag。
- [x] 手测：`tk inspect`、`tk gain`、`tk gain --text`、`tk optimize --apply` 各跑一遍，输出符合上述。

## 边界 / 不做
- 不改压缩/gate 逻辑本身，只改 CLI 面与输出口径。
- HTML 生成器复用现有 inspect/report 的 HTML 渲染（HTML reports feature 已存在），不新写一套主题。
- `--csv`（gain）去留：随实现时确认，倾向保留给脚本/表格场景。
- #12 的 VS Code 设置分析器若工作量过大，可拆为本 goal 的后续 slice，先完成 #1–#11/#13 的纯收敛。
