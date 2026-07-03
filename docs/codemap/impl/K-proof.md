## 需求 K — Proof：如何诚实地证明 A（理解/协作）与 B（token 优化）两者都成立

本节构建一套 **two-track / two-job** 的证明工坊，唯一不变量是：**绝不报告任何无法机械推导的数字（never report a number we cannot mechanically derive）**。Job B（agent 找代码 = token 优化）在 SECONDARY 宿主（Claude Code headless，唯一干净的 uncached-token 跑测器）上离线 A/B 测量；PRIMARY 宿主（VS Code Copilot / Windows）token 结构上不可测，只产出 Track-2 opportunity facts。Job A（人类理解/协作）走独立的 small-N 任务协议，不用 token。

被测系统（system-under-test）即上游 A 的检索流水线 + F 的 MCP 工具面 + B 的「static 层唯一权威」边界——K 的全部测量都建立在 `B1 provenance 过滤`（find-code 路径只走 `provenance='static'`，确定性）之上，因此 Job B 的测量臂里**不含任何 LLM 生成**，B 的叙事生成单独走 Job-A 协议。

依赖前置（来自 DEP MAP）：
- 跑测器 = `F2 tk mcp`，工具面消融通过 `F10 TK_MCP_TOOLS` 环境变量（空 = WITHOUT 臂）。
- 测量臂只在 Claude Code（K2/K3），PRIMARY 走 Track-2（K7），二者通过 `K12 loop-avoidance host-agnostic` 假设桥接（明文打印，不隐藏）。
- 输出预算单位沿用 `G1` 字符档（13000/18000/24000），token 化是 K 测到 Copilot inline cap 之后的 refinement，不阻塞当前能力。

---

### K1 PRIMARY Job-B 指标 = `uncached_input_tokens` 增量 — (serves the codemap agent surface)

**(1) 决策**：Job B 的头条指标是 `uncached_input_tokens = input_tokens − cached_input_tokens` 的逐臂值，报告 `Δ = WITHOUT − WITH`；total-incl-cached 仅作 SECONDARY 审计列，永不做头条。**OVERRULES** codegraph README 的 `Tokens = total tokens processed (input incl. cached + output)` 头条（其「64% fewer tokens」≈97% 在测 cache replay，compendium risk #10）。

**(2) 要动的文件**：
```
scripts/eval/                      ← 新建评测工坊根目录
  metrics.ts                       ← uncached delta / median / spread 计算（纯函数）
  README.md                        ← 口径说明 + 诚实声明
```

**(3) 可抄代码**：codegraph 的方法学原文（确认存在，VERBATIM）——作为我们**改写**的对照基线，我们把它的 total 头条替换为 uncached：

```text
源: /tmp/tk-research/codegraph/README.md:214 （VERBATIM，作为被 OVERRULE 的对照）
**Methodology.** Each arm is `claude -p` (Claude Opus 4.8) run headlessly against the
repo with `--strict-mcp-config`: **WITH** = CodeGraph's MCP server enabled,
**WITHOUT** = an empty MCP config. Built-in Read/Grep/Bash stay available to both.
Same question per repo, **4 runs per arm, median reported**. Cost = the run's
`total_cost_usd`; Tokens = total tokens processed (input incl. cached + output); ...
```

tk 改写后的 uncached 口径计算（已改写，tk 新代码）：

```ts
// 源: scripts/eval/metrics.ts （tk 新建；口径改写自 codegraph methodology）
// PRIMARY = uncached delta；total 仅作审计列，永不做头条。
export interface ArmUsage {
  input_tokens: number;            // Anthropic: 已排除 cache_read
  cache_read_input_tokens: number;
  cache_creation_input_tokens: number;
  output_tokens: number;
}

/** uncached = input − cache_read（若宿主把 cache_read 折进 input，显式相减）。 */
export function uncached(u: ArmUsage): number {
  return u.input_tokens - u.cache_read_input_tokens;
}

/** 头条行：4 次/臂取中位数的 (WITHOUT − WITH) uncached 增量。 */
export function headlineUncachedDelta(
  withRuns: ArmUsage[],
  withoutRuns: ArmUsage[],
): { delta: number; withMed: number; withoutMed: number; cacheShareWith: number } {
  const wu = withRuns.map(uncached);
  const ou = withoutRuns.map(uncached);
  const withMed = median(wu);
  const withoutMed = median(ou);
  // 审计：把 cache 占比一起打出来，让读者自查 cache replay 份额
  const cacheShareWith =
    median(withRuns.map((r) => r.cache_read_input_tokens)) /
    Math.max(1, median(withRuns.map((r) => r.input_tokens)));
  return { delta: withoutMed - withMed, withMed, withoutMed, cacheShareWith };
}

export function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
```

**(4) 具体数值**：4 次/臂；头条 = median(WITHOUT.uncached − WITH.uncached)；同时打印 WITH/WITHOUT 的 raw uncached + total + cache_read 三列；cache_share 超过 90% 时报告必须标注「total 列已被 cache replay 主导，勿引用」。

**(5) 有序步骤**：
1. 实现 `metrics.ts`（`uncached` / `median` / `headlineUncachedDelta`）——独立可测，不依赖跑测器。
2. 在 README 写明「PRIMARY=uncached，total=审计列」口径。

**(6) 测试**：单测 fixture——给定 `input=10000, cache_read=9700` ⇒ `uncached=300`；断言头条用的是 300 不是 10000；断言 `cacheShareWith≈0.97` 触发标注。

**(7) 证据回指**：codegraph README.md:214（VERBATIM 已确认）；compendium §11 risk #10（cache-read >97%）。

---

### K2 测量臂跑测器 = Claude Code headless — (serves the codemap agent surface)

**(1) 决策**：唯一测量跑测器 = `claude -p --output-format json`（提供 input/output/cache_read/cache_creation）。Copilot CLI 与 VS Code Copilot **明确不是跑测器**（零 token 可见性）。**OVERRULES**「在 primary 宿主证明 B」的旧前提（2026-06-20 sweep 证实 Copilot 零 token）。

**(2) 要动的文件**：
```
scripts/eval/
  capture.ts                       ← 解析 claude -p 的 type:result JSON usage 块
```

**(3) 可抄代码**：repodoc 的 provider usage 抽取（确认存在，VERBATIM）作为「读 usage 块」的范式：

```python
# 源: /tmp/tk-research/repodoc/repodoc/src/llm.py:73 （VERBATIM）
    usage = response.usage
    token_usage: TokenUsage = {
        "prompt_tokens": usage.prompt_tokens if usage else 0,
        "completion_tokens": usage.completion_tokens if usage else 0,
        "total_tokens": usage.total_tokens if usage else 0,
    }
```

tk 对 Claude Code result JSON 的抽取（已改写为 TS，多出 cache_read/cache_creation）：

```ts
// 源: scripts/eval/capture.ts （tk 新建；范式改写自 repodoc llm.py:73）
import type { ArmUsage } from "./metrics.js";

/** 从 claude -p --output-format json 的最后一条 type:"result" 取 usage。 */
export function extractUsage(resultJson: string): ArmUsage {
  const lines = resultJson.trim().split("\n").map((l) => JSON.parse(l));
  const result = [...lines].reverse().find((m) => m.type === "result");
  if (!result?.usage) throw new Error("no usage block in claude -p result");
  const u = result.usage;
  return {
    input_tokens: u.input_tokens ?? 0,
    cache_read_input_tokens: u.cache_read_input_tokens ?? 0,
    cache_creation_input_tokens: u.cache_creation_input_tokens ?? 0,
    output_tokens: u.output_tokens ?? 0,
  };
}
```

**(4) 具体数值**：每臂从最终 `type:"result"` JSON 的 `usage` 块取 4 字段；`uncached = input_tokens`（Anthropic 已排除 cache_read；若宿主折叠则显式减 cache_read）。

**(5) 有序步骤**：
1. 实现 `extractUsage`——独立可测（喂固定 JSON fixture）。

**(6) 测试**：fixture = 一段含两条非 result 行 + 一条 `type:"result"` 且带 `usage` 的 JSONL；断言取到最后一条、四字段正确；缺 usage 块时抛错。

**(7) 证据回指**：repodoc llm.py:73（VERBATIM 已确认）；MEMORY host-token-visibility-measurement（Claude Code headless = 唯一干净跑测器）。

---

### K3 A/B 协议 = strict-mcp-config，MCP on/off，4 次/臂取中位数 — (serves the codemap agent surface)

**(1) 决策**：`--strict-mcp-config`；WITH = tk MCP server 启用，WITHOUT = 空 MCP config（`F10 TK_MCP_TOOLS=""`）；内置 Read/Grep/Bash/Glob 两臂都保留；同一 repo 同一 prompt；`--permission-mode bypassPermissions`；4 次/臂；报告 MEDIAN + min/max。模仿 codegraph 协议，改进为 uncached-primary + spread。

**(2) 要动的文件**：
```
scripts/eval/
  run-ab.ts                        ← A/B 跑测主循环
  configs/with.json                ← tk MCP 启用的 strict-mcp-config
  configs/without.json             ← 空 MCP config
```

**(3) 可抄代码**：tk A/B 跑测循环（已改写，对应 codegraph methodology 的协议）：

```ts
// 源: scripts/eval/run-ab.ts （tk 新建；协议改写自 codegraph README.md:214）
import { execFileSync } from "node:child_process";
import { extractUsage } from "./capture.js";
import { headlineUncachedDelta } from "./metrics.js";

const RUNS_PER_ARM = 4;
const ARMS = { with: "scripts/eval/configs/with.json", without: "scripts/eval/configs/without.json" };

export function runAb(question: string, cwd: string) {
  const out: Record<string, ReturnType<typeof extractUsage>[]> = { with: [], without: [] };
  for (const arm of ["with", "without"] as const) {
    for (let i = 1; i <= RUNS_PER_ARM; i++) {
      const json = execFileSync("claude", [
        "-p", question,
        "--strict-mcp-config", "--mcp-config", ARMS[arm],
        "--output-format", "json",
        "--permission-mode", "bypassPermissions",
      ], { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
      out[arm].push(extractUsage(json));
    }
  }
  return headlineUncachedDelta(out.with, out.without);
}
```

WITHOUT 臂的空配置（tk 新建，即 `TK_MCP_TOOLS=""` 的等价物）：

```json
// 源: scripts/eval/configs/without.json （tk 新建）
{ "mcpServers": {} }
```

**(4) 具体数值**：`RUNS_PER_ARM = 4`；`--permission-mode bypassPermissions`；`maxBuffer = 64MiB`；报告含 median + min + max（spread）；高方差大 repo cell 可上调到 8（见 Open Decisions）。

**(5) 有序步骤**：
1. 写 `configs/with.json`（启用 `tk mcp`）、`configs/without.json`（空）。
2. 实现 `runAb`，串起 K2 抽取 + K1 计算。

**(6) 测试**：以一个 mock `claude` 脚本（PATH 注入，回放固定 result JSON）跑 `runAb`，断言 8 次调用、median delta 与预期一致；断言 strict-mcp-config 参数确实传入。

**(7) 证据回指**：codegraph README.md:214（VERBATIM 已确认）。

---

### K4 安全指标 = fallback-replay → omission_bug_rate — (serves the codemap agent surface)

**(1) 决策**：安全用 `omission_bug_rate`（fallback-replay），**不用压缩比**。流程：(1) projection 层 ON 跑任务；(2) 失败或带可疑重试成功时，定位该层引入的投影证据；(3) 从同一 checkpoint 重跑、仅把那些输出升级为 raw/exact；(4) 若任务 failure→success 或修正了事实性遗漏，记一个 context-omission bug。`omission_bug_rate = omission_bugs / tasks`。**OVERRULES** 把压缩比当价值证明。

**(2) 要动的文件**：
```
scripts/eval/
  fallback-replay.ts               ← checkpoint 重放 + flip 判定
```

**(3) 可抄代码**：compendium §11 的方法原文（确认存在，VERBATIM），作为流程权威定义：

```text
源: /Users/ziyu/Workspace/token-killer/docs/codemap/archive/research/low-token-agent-research-compendium-20260618.md:478 （VERBATIM）
**Safety via fallback replay (the cleanest documented method).** (1) Run the task
with the projection layer enabled. (2) If the run fails — or succeeds with suspicious
retries — identify the projected evidence the layer introduced. (3) Re-run from the
same checkpoint with only those outputs escalated to raw/larger-exact form. (4) If the
task flips failure→success or the answer fixes a factual omission, count a **context
omission bug**.
```

tk 实现骨架（需实现时补——依赖 K6 task oracle 落地后才能判 flip）：

```ts
// 源: scripts/eval/fallback-replay.ts （tk 新建；流程权威 = compendium:478）
// 需实现时补：escalate() 与 evalOracle() 依赖 F 的 MCP 工具面 + K6 oracle 就位。
export interface ReplayInput {
  checkpointTranscript: string;     // 投影工具结果之前的轨迹
  projectedToolCall: { tool: string; args: unknown };  // 被怀疑的投影证据
  cwd: string;
  oracle: TaskOracle;               // K6: FAIL_TO_PASS 或 answer-key
}
export function fallbackReplay(inp: ReplayInput): { omissionBug: boolean } {
  // 1) 升级：同一工具调用改 --level minimal / raw read 同一 range
  const escalated = escalate(inp.projectedToolCall);          // 需实现时补
  // 2) 从 checkpoint 重跑
  const replayed = resumeFrom(inp.checkpointTranscript, escalated, inp.cwd); // 需实现时补
  // 3) flip 判定：failure→success
  const before = evalOracle(inp.oracle, /* projection-on result */ undefined);
  const after = evalOracle(inp.oracle, replayed);             // 需实现时补
  return { omissionBug: !before && after };
}
```

**Gap（需实现时补）**：`escalate/resumeFrom/evalOracle` 三个原语依赖 F 的 MCP 工具能按 `(tool,args,level)` 重发、以及 K6 的 oracle 就位；当前只锁定接口与 flip 判定逻辑。

**(4) 具体数值**：checkpoint = 投影工具结果之前的轨迹；escalation = 同一调用改 `--level minimal` / raw read 同一 range；flip 由 task oracle（FAIL_TO_PASS 或 answer-key 匹配）判定；`omission_bug_rate = omission_bugs / tasks`。

**(5) 有序步骤**：
1. 锁定 `ReplayInput` 接口与 flip 判定（!before && after）——可独立单测（mock oracle）。
2. 待 F/K6 就位后补 `escalate/resumeFrom/evalOracle`。

**(6) 测试**：单测——mock `evalOracle` 让 before=false / after=true，断言 `omissionBug=true`；before=true 时永远 false。

**(7) 证据回指**：compendium:478（VERBATIM 已确认）；SWE-ContextBench + arXiv 2604.22750（token 花费不预测表现，坏上下文有害）。

---

### K5 检索质量 = localization F1（FastContext 式），与任务质量分开报 — (serves both surfaces)

**(1) 决策**：检索精度用 localization F1：predicted set = tk search/explore surface 的 `{file, line-range}` 指针；oracle set = patch 触碰的 files+lines。F1 over (file, line-range) 重叠。与端到端任务质量**分开**报（Cody methodology）。

**(2) 要动的文件**：
```
scripts/eval/
  localization-f1.ts               ← P/R/F1 over (file,line-range)
```

**(3) 可抄代码**：FastContext 方法依据（确认存在，VERBATIM）+ tk 计算实现：

```text
源: /Users/ziyu/Workspace/token-killer/docs/codemap/archive/research/low-token-agent-research-compendium-20260618.md:355 （VERBATIM）
- **FastContext (Microsoft, arXiv 2606.14066).** **Repo exploration = 56.2% of tool-use
  turns.** A dedicated **4B–30B exploration subagent** (SFT on Sonnet trajectories + **RL
  with patch-derived location rewards**, file/line F1) separated from the solver, returns
  **only file paths + line ranges**, never the exploratory trace.
```

```ts
// 源: scripts/eval/localization-f1.ts （tk 新建；口径依据 = compendium:355 FastContext）
export interface Span { file: string; start: number; end: number; }

function intersects(a: Span, b: Span): boolean {
  return a.file === b.file && a.start <= b.end && b.start <= a.end;
}

/** 预测 range 与任一 oracle range 相交即记 hit。 */
export function localizationF1(pred: Span[], oracle: Span[]) {
  const predHit = pred.filter((p) => oracle.some((o) => intersects(p, o))).length;
  const oracleHit = oracle.filter((o) => pred.some((p) => intersects(p, o))).length;
  const precision = pred.length ? predHit / pred.length : 0;
  const recall = oracle.length ? oracleHit / oracle.length : 0;
  const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
  return { precision, recall, f1 };
}
```

**(4) 具体数值**：line-range 相交即 hit；`precision = |pred∩oracle|/|pred|`；`recall = |pred∩oracle|/|oracle|`；`F1 = 2PR/(P+R)`；oracle 取自 gold patch hunks。

**(5) 有序步骤**：
1. 实现 `localizationF1`——纯函数，独立可测。

**(6) 测试**：pred=`[a.ts:10-20]`，oracle=`[a.ts:15-18, b.ts:1-5]` ⇒ precision=1.0、recall=0.5、F1≈0.667。

**(7) 证据回指**：compendium:355（VERBATIM 已确认）。

---

### K6 任务正确性 = FAIL_TO_PASS + PASS_TO_PASS — (serves the codemap agent surface)

**(1) 决策**：带 patch 的任务用 SWE-bench 式 `FAIL_TO_PASS`（修前失败/修后通过）+ `PASS_TO_PASS`（修前通过/修后仍通过）。任务记为 solved 当且仅当 **所有 FAIL_TO_PASS 通过 且 所有 PASS_TO_PASS 仍通过**。**语料源（grilling D11 / Q10，全文 [ADR 0023](../../adr/0023-benchmark-architecture.md)）= 复用两 harness、拆分证明责任**：Job-B 端到端用 **SWE-bench 官方切片**（GitNexus 3 臂 baseline/tk-native/tk-projection）+ 同记 whole-task uncached/cost/tool-calls/reads/searches/projection；**语言/图能力另由 K16 的 per-language 问题集证明**，SWE-bench 语言分布须披露但不背全语言覆盖责任。**tk 自有 repo = regression only**（CI 回归/筛选/快消融，永不作主对外基准）。

**(2) 要动的文件**：
```
scripts/eval/
  task-oracle.ts                   ← 跑 f2p/p2p 测试集，判 solved
  tasks/manifest.jsonl             ← 任务清单（见 K14）
```

**(3) 可抄代码**：tk 实现（需实现时补——测试 runner 依赖具体 task repo 的测试命令）：

```ts
// 源: scripts/eval/task-oracle.ts （tk 新建）
// 需实现时补：runTests() 依赖每个 task repo 的测试命令（来自 manifest）。
export interface TaskOracle {
  f2p: string[];                    // FAIL_TO_PASS 测试名
  p2p: string[];                    // PASS_TO_PASS 测试名
  testCmd: string;                  // 例如 "pytest -q" / "vitest run"
}
export function isSolved(oracle: TaskOracle, cwd: string): boolean {
  const results = runTests(oracle.testCmd, cwd);          // 需实现时补 → {name:pass}
  const f2pPass = oracle.f2p.every((t) => results[t] === true);
  const p2pPass = oracle.p2p.every((t) => results[t] === true);
  return f2pPass && p2pPass;
}
```

**Gap**：`runTests` 解析每个 task repo 的测试输出为 `{name: pass}`——按 manifest 的 `testCmd` 实现，框架相关。

**(4) 具体数值**：solved = `(∀ f2p: pass) ∧ (∀ p2p: pass)`；`success_rate` 逐臂报告，永远与 token 增量配对呈现（Pareto，绝不单报 token）。

**(5) 有序步骤**：
1. 锁定 `TaskOracle` 接口 + `isSolved` 逻辑——独立单测（mock results）。
2. 按首个 task repo 的测试框架补 `runTests`。

**(6) 测试**：mock results 全 true ⇒ solved=true；任一 f2p=false ⇒ false；任一 p2p=false ⇒ false。

**(7) 证据回指**：SWE-ContextBench / SWE-bench 标准（compendium §11）。

---

### K7 Track-2 在线 opportunity facts（不可测的 PRIMARY 宿主）— (serves the codemap agent surface)

**(1) 决策**：VS Code Copilot 宿主 token 不可测，Job B 在此**不用 token 证明**，改由 tk MCP server 发出 per-tool `{call_count, payload_bytes, est_payload_tokens, avoided_raw_reads, dedup_hits}`，打 `estimate_kind:"opportunity"` 标签，**永不**汇入 `saved_tokens`、**永不**作为 saving % 打印。采用 Serena 立场。

**(2) 要动的文件**：
```
src/mcp/opportunity-ledger.ts      ← MCP server 发出 opportunity 行（新建）
src/core/aggregate.ts              ← 复用现有 estimate_kind 区分（不改语义）
```

**(3) 可抄代码**：tk 现有「measured 不混 estimate」纪律（确认存在，VERBATIM）——这是把 Track-1/Track-2 隔开的强制机制：

```ts
// 源: /Users/ziyu/Workspace/token-killer/src/core/aggregate.ts:9 （VERBATIM）
export type GainSummary = {
  // metrics-ledger §5: these numbers are MEASURED, not heuristic.
  estimate_kind: "measured";
  commands: number;
  raw_tokens: number;
  output_tokens: number;
  saved_tokens: number;
  savings_pct: number;
```

新增的 opportunity 行类型（tk 新建，刻意用不同 `estimate_kind`，永不被 aggregate 求和）：

```ts
// 源: src/mcp/opportunity-ledger.ts （tk 新建；与 aggregate.ts 的 measured 区分）
export type OpportunityRow = {
  estimate_kind: "opportunity";    // ≠ "measured" → aggregate 永不汇总
  ts: string;
  tool: string;
  call_count: number;
  payload_bytes: number;
  est_payload_tokens: number;      // 仅估算，不冒充测量
  avoided_raw_reads: number;
  dedup_hits: number;
};
```

**(4) 具体数值**：ledger 行 = `{ts, tool, call_count, payload_bytes, est_payload_tokens, estimate_kind:'opportunity', avoided_raw_reads, dedup_hits}`；`gain/report` 把这些放在「opportunity (not measured savings)」标题下，与 measured ① ledger 视觉隔离。

**(5) 有序步骤**：
1. 定义 `OpportunityRow`（区别于 measured）——独立可测。
2. MCP server 每次工具调用追加一行；gain/report 单独区块渲染。

**(6) 测试**：断言 aggregate 求和时遇 `estimate_kind:"opportunity"` 行不计入 `saved_tokens`（守住「永不混算」不变量）；断言 report 把它放独立标题下。

**(7) 证据回指**：aggregate.ts:9（VERBATIM 已确认）；Serena 立场（codegraph call-sequence-analysis.md）。

---

### K8 per-operation token_usage 日志（full-vs-incremental 分母）— (serves both surfaces)

**(1) 决策**：freshness 便宜的证明分母 = 一条 JSONL 操作日志，键 `{operation_type, git_commit, duration, total/prompt/completion tokens, llm_calls, components_processed, files_generated, status}`；`incremental_ratio = incremental.total_tokens / full.total_tokens`（同一 commit）。

**(2) 要动的文件**：
```
scripts/eval/
  op-log.ts                        ← log_operation 等价物（JSONL 追加）
```

**(3) 可抄代码**：repodoc 的 `log_operation`（确认存在，VERBATIM）作为字段权威：

```python
# 源: /tmp/tk-research/repodoc/repodoc/pipeline/generator.py:863 （VERBATIM）
            "token_usage": {
                "total_tokens": token_usage["total"],
                "prompt_tokens": token_usage["prompt"],
                "completion_tokens": token_usage["completion"],
                "llm_calls": len(token_usage["history"]),
                "calls": token_usage["history"],
            },
...
        log_operation(
            output_dir=self.config.output_dir,
            operation_type="full_generation",
            repo_path=self.config.repo_path,
            git_commit=git_commit,
            duration_seconds=total_duration,
            total_tokens=token_usage["total"],
            prompt_tokens=token_usage["prompt"],
            completion_tokens=token_usage["completion"],
            llm_calls=len(token_usage["history"]),
            components_processed=len(self.components),
            files_generated=len(all_files),
            status="success",
```

tk TS 等价物（已改写）：

```ts
// 源: scripts/eval/op-log.ts （tk 新建；字段权威 = repodoc generator.py:863）
import { appendFileSync } from "node:fs";
export type OperationType = "full_generation" | "incremental";
export function logOperation(path: string, row: {
  operation_type: OperationType; git_commit: string; duration_seconds: number;
  total_tokens: number; prompt_tokens: number; completion_tokens: number;
  llm_calls: number; components_processed: number; files_generated: number;
  status: "success" | "error";
}) {
  appendFileSync(path, JSON.stringify({ ts: new Date().toISOString(), ...row }) + "\n");
}
export function incrementalRatio(full: { total_tokens: number }, inc: { total_tokens: number }) {
  return inc.total_tokens / Math.max(1, full.total_tokens);
}
```

**(4) 具体数值**：`incremental_ratio = incremental.total_tokens / full.total_tokens`（matched commit）；`status ∈ {success, error}`。

**(5) 有序步骤**：
1. 实现 `logOperation` + `incrementalRatio`——独立可测。

**(6) 测试**：full.total=10000、inc.total=500 ⇒ ratio=0.05；断言 JSONL 行可解析、含 git_commit。

**(7) 证据回指**：repodoc generator.py:863（VERBATIM 已确认）。

---

### K9 Job-A（人类理解/协作）证明 = small-N 任务协议，不用 token — (serves the codeguide human surface)

**(1) 决策**：Job A 走独立 small-N 协议（非 token）。两项度量：(a) find-correct-file rate——给人一个问题 + 仅人类 surface，记 hit@1 + time-to-correct-file；(b) comprehension——固定问题集对照 oracle answer key，`score = correct/total`。一律打印 N + 「small-N indicative, not benchmark-grade」标注。**采用 Serena 拒绝伪造 comprehension % 的诚实立场。**

**(1b) grader/corpus**（grilling D11 / Q10，全文 [ADR 0023](../../adr/0023-benchmark-architecture.md)）：无分档品牌。两样——自动 **regression tasks**（内部手写 tk-repo + host-agent，防导航/查询退化，**不作人类理解 claim**）+ 小规模 **blind human study**（外部 corpus + 评审者**非**功能作者、**不知**实验分组，baseline vs Human Inspector 比 hit@1/time-to-file/answer correctness，存分歧记录）。人类价值**只能**由盲测证明,永报 `N / repos / tasks`,**绝不**输出泛化 "comprehension +X%"。host-agent 不能证明人类理解。

**(2) 要动的文件**：
```
scripts/eval/
  job-a.ts                         ← hit@1 / time-to-file / comprehension 计分
  job-a-questions.jsonl            ← 问题 + oracle file / answer key（见 stillOpen）
```

**(3) 可抄代码**：tk 计分实现（已改写，纯函数）：

```ts
// 源: scripts/eval/job-a.ts （tk 新建）
export interface JobARecord {
  question_id: string;
  first_file_opened: string;       // 人类打开的第一个文件
  oracle_file: string;
  time_to_correct_file_s: number;  // 找到正确文件的秒数
  answer_correct?: boolean;        // 对照 answer key
}
export function jobAScores(records: JobARecord[]) {
  const N = records.length;
  const hit1 = records.filter((r) => r.first_file_opened === r.oracle_file).length / N;
  const timeMed = median(records.map((r) => r.time_to_correct_file_s));
  const graded = records.filter((r) => r.answer_correct !== undefined);
  const comprehension = graded.length
    ? graded.filter((r) => r.answer_correct).length / graded.length
    : undefined;
  return {
    N, hit_at_1: hit1, time_to_correct_file_median_s: timeMed, comprehension_score: comprehension,
    label: "small-N indicative, not benchmark-grade",  // 强制诚实标注
  };
}
function median(xs: number[]) {
  const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2);
  return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : 0;
}
```

**(4) 具体数值**：`hit@1 = (首个打开文件=oracle 文件的题数)/N`；time-to-correct-file 取中位数（秒）；`comprehension_score = correct/total`；输出永远带 `N` 与 `"small-N indicative"` 标注。

**(5) 有序步骤**：
1. 实现 `jobAScores`——纯函数，独立可测。
2. 手写 `job-a-questions.jsonl`（题 + oracle file + answer key）——Open Decisions：语料来源与 grader 待用户定。

**(6) 测试**：3 题、2 题首开=oracle ⇒ hit@1≈0.667；断言输出含 `label` 字段；comprehension 无 graded 时为 undefined（不伪造）。

**(7) 证据回指**：MEMORY measurement-harness-design（Serena 拒绝 token benchmark）；K9 dossier。

---

### K10 per-run 遥测 SCHEMA（sqlite `eval_run`）— (serves both surfaces)

**(1) 决策**：存原始 per-run 行（不预聚合），用 compendium §11 指标集，落 node:sqlite，让 median/spread/Pareto 可重算可审计。

**(2) 要动的文件**：
```
scripts/eval/
  schema.sql                       ← eval_run DDL
  store.ts                         ← node:sqlite 写入
```

**(3) 可抄代码**：DDL（tk 新建，字段集 = compendium §11，沿用 C 的 node:sqlite 不变量）：

```sql
-- 源: scripts/eval/schema.sql （tk 新建；字段集 = compendium §11 telemetry table）
CREATE TABLE IF NOT EXISTS eval_run (
  run_id                   TEXT,
  arm                      TEXT,    -- 'with' | 'without'
  repo                     TEXT,
  task_id                  TEXT,
  run_index                INTEGER,
  raw_bytes                INTEGER,
  filtered_bytes           INTEGER,
  input_tokens             INTEGER,
  output_tokens            INTEGER,
  cached_input_tokens      INTEGER,
  uncached_input_tokens    INTEGER,
  tool_calls               INTEGER,
  file_reads               INTEGER,
  duplicate_reads          INTEGER,
  search_calls             INTEGER,
  search_result_usefulness REAL,
  distinct_files_touched   INTEGER,
  success                  INTEGER, -- bool 0/1
  fallback_count           INTEGER,
  omission_bug             INTEGER, -- bool 0/1
  latency_ms               INTEGER
);
```

```ts
// 源: scripts/eval/store.ts （tk 新建；node:sqlite，沿用 C 的存储基座）
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
export function openEvalDb(path: string): DatabaseSync {
  const db = new DatabaseSync(path);
  db.exec(readFileSync("scripts/eval/schema.sql", "utf8"));
  return db;
}
```

**(4) 具体数值**：每个 (run_id, arm, run_index) 一行；success/omission_bug 存 0/1；不存聚合值（中位数运行时重算）。

**(5) 有序步骤**：
1. 落 `schema.sql` + `openEvalDb`——独立可测（建表即验）。

**(6) 测试**：openEvalDb 后插一行再 SELECT，断言 20 列齐全、`uncached_input_tokens` 可独立读出。

**(7) 证据回指**：compendium §11 telemetry table（:472-475 已确认含 cached/uncached 字段）。

---

### K11 操作定义锁定：duplicate_reads / search_result_usefulness — (serves the codemap agent surface)

**(1) 决策**：`duplicate_reads` 键 `(normalized_path, selector_type, selector_value, file_hash)`——区分「改动后同路径」与「未变同路径」。`search_result_usefulness = 1` 当某 search 的任一 top candidate 在后续 `k=5` 个工具动作内被 read/edit/出现在 final diff/在 final answer 被命名，否则 0。

**(2) 要动的文件**：
```
scripts/eval/
  trajectory-metrics.ts            ← 上述两定义的机械计算
```

**(3) 可抄代码**：tk 实现（已改写）：

```ts
// 源: scripts/eval/trajectory-metrics.ts （tk 新建；定义 = compendium §11）
import { createHash } from "node:crypto";
type SelectorType = "whole" | "range" | "symbol";
export interface ReadEvent {
  normalized_path: string; selector_type: SelectorType; selector_value: string;
  file_bytes: Buffer;
}
export function dupKey(e: ReadEvent): string {
  const fileHash = createHash("sha256").update(e.file_bytes).digest("hex");
  return [e.normalized_path, e.selector_type, e.selector_value, fileHash].join("|");
}
export function countDuplicateReads(reads: ReadEvent[]): number {
  const seen = new Set<string>(); let dups = 0;
  for (const r of reads) { const k = dupKey(r); if (seen.has(k)) dups++; else seen.add(k); }
  return dups;
}

const USEFULNESS_WINDOW = 5;
export interface ToolEvent { kind: string; refs: string[]; } // refs = 涉及的 file/symbol
export function searchUsefulness(
  candidates: string[], trajectory: ToolEvent[], searchIdx: number,
): 0 | 1 {
  const window = trajectory.slice(searchIdx + 1, searchIdx + 1 + USEFULNESS_WINDOW);
  return window.some((ev) => ev.refs.some((r) => candidates.includes(r))) ? 1 : 0;
}
```

**(4) 具体数值**：`k = 5`；`file_hash = sha256(file bytes at read time)`；`selector_type ∈ {whole, range, symbol}`；usefulness 扫描同轨迹后续 5 个工具事件。

**(5) 有序步骤**：
1. 实现 `dupKey/countDuplicateReads/searchUsefulness`——纯函数，独立可测。

**(6) 测试**：同路径同 selector 同 hash 两次 ⇒ dups=1；同路径但 file_bytes 变 ⇒ dups=0；candidate 在第 6 个动作才出现 ⇒ usefulness=0（窗口边界）。

**(7) 证据回指**：compendium §11 operational definitions。

---

### K12 transfer footer = 对象①（proxy-only token 数字）的披露单位 — (serves both surfaces)

**(1) 决策**（refined by Q10 / [ADR 0022](../../adr/0022-measurement-and-claim-boundaries.md)）：transfer footer 盖 **对外报的 uncached token 数字**——它 target 永远测不了,只能明文声明。footer 内容 5 条:measurement host=Claude Code headless;primary target=VS Code Copilot/Windows;compatible task-level target token telemetry=unavailable;target-host token effect=unknown;**no equivalent Copilot token reduction is claimed**。W2 loop-avoidance 仅作 **mechanism hypothesis**(非已验证 target token 声称)。产品默认 config 的转移不靠 footer,而由 K15 的**周期性 Copilot 复核**(portable 信号 target 可观测)处理——无运行时自动反证/状态机。

**(2) 要动的文件**：
```
scripts/eval/
  report.ts                        ← 报告渲染，强制带 transfer footer（仅对象①）
```

**(3) 可抄代码**：tk 报告 footer（tk 新建，强制声明，5 条）：

```ts
// 源: scripts/eval/report.ts （tk 新建；仅用于对象① proxy-only token 数字）
export const TRANSFER_FOOTER = [
  "Measurement host: Claude Code headless.",
  "Primary target: VS Code Copilot on Windows.",
  "Compatible task-level target token telemetry: unavailable.",
  "Target-host token effect: unknown.",
  "No equivalent Copilot token reduction is claimed.",
  "(loop-avoidance W2 = mechanism hypothesis, not a verified target token claim;",
  " config-level transfer is falsified by the K16 target-side checker, not this footer.)",
].join("\n");

export function renderHeadline(delta: number, withMed: number, withoutMed: number): string {
  return [
    `uncached Δ (WITHOUT − WITH) = ${delta} tokens`,
    `  WITH med=${withMed}  WITHOUT med=${withoutMed}`,
    "",
    TRANSFER_FOOTER,   // 每个被转移的 token 数字都带它
  ].join("\n");
}
```

**(4) 具体数值**：footer 文本固定 5 条;任何对 Copilot 的 **token** 转移声称必须紧邻此 footer,否则视为违反诚实不变量。footer **不**用于对象②（config 默认走 provenance + K16 finding）。

**(5) 有序步骤**：
1. 实现 `renderHeadline` 强制拼接 `TRANSFER_FOOTER`——独立可测。

**(6) 测试**：断言 `renderHeadline(...)` 输出必含 `TRANSFER_FOOTER` 全 5 条；断言无 footer 的 token-数字渲染路径不存在（grep 测试）。

**(7) 证据回指**：[ADR 0022](../../adr/0022-measurement-and-claim-boundaries.md)（host 边界 + footer）；MEMORY measurement-harness-design（W2 = A/B-only，transfer 是假设）。

---

### K13 系统变体消融阶梯 — (serves the codemap agent surface)

**(1) 决策**：对比变体（OUTER ladder）= `S0 baseline · S1 +output-compression · S2 +smart-read · S3 +repo-map/graph · S4 +symbol-index`。每变体一个独立 WITH config，隔离每检索技术贡献；无 embeddings/gateway 变体（leans 范围外）。**所有 K13 cell 用同一把锁定的 projection config**（cell 间绝不变更 = 保守 Code-only graph projection 或上次 validated 生产配置）——K13 只测**检索技术**增量，不把 graph 建设与 projection 策略混淆。D7 四路 profile 消融是 `+graph` 臂的 **INNER 消融**，二者嵌套不平铺，组合方式见 K17 / [ADR 0024](../../adr/0024-ablation-protocol.md)。

**(2) 要动的文件**：
```
scripts/eval/configs/
  baseline.json                    ← TK_MCP_TOOLS=""
  v-compress.json                  ← 仅输出压缩
  v-smartread.json                 ← + smart-read
  v-graph.json                     ← + repo-map/graph
  v-symbol.json                    ← + symbol-index
```

**(3) 可抄代码**：变体配置（tk 新建，靠 `F10 TK_MCP_TOOLS` 选择工具子集）：

```jsonc
// 源: scripts/eval/configs/v-graph.json （tk 新建；每变体 = strict-mcp-config 的 TK_MCP_TOOLS 子集）
{
  "mcpServers": {
    "tk": {
      "command": "tk", "args": ["mcp"],
      "env": { "TK_MCP_TOOLS": "tk_explore,tk_search,tk_node,tk_callers" }  // graph 全量
    }
  }
}
// baseline.json: TK_MCP_TOOLS=""（等价空 MCP）
// v-symbol.json: TK_MCP_TOOLS="tk_node"（仅符号索引）
```

**(4) 具体数值**：5 个变体；每个共享同一 baseline 比较；头条 uncached delta 逐变体 vs baseline 呈现——加 token 但不加 success 的层可见地是 non-win。

**(5) 有序步骤**：
1. 写 5 个 config（TK_MCP_TOOLS 子集递增）。
2. 用 K3 `runAb` 逐变体跑，复用 K1 计算。

**(6) 测试**：断言每个 config 解析合法、`TK_MCP_TOOLS` 子集互不相同；smoke：baseline 与 v-graph delta 可分别算出。

**(7) 证据回指**：compendium §11 system variants；F10 TK_MCP_TOOLS 消融钩子。

---

### K14 基准任务 11 类 + A/B 路由 — (serves both surfaces)

**(1) 决策**：任务 11 类——locate implementation · understand module architecture · follow call chain · modify function · add test · fix failing test · debug build error · inspect git diff · update config · understand component state flow · trace API route→service→database。Job-A 度量取 `locate / understand-architecture / state-flow` 子集；Job-B success_rate 取 patch-bearing 子集（modify / add-test / fix）。

**(2) 要动的文件**：
```
scripts/eval/tasks/
  manifest.jsonl                   ← {task_id, category, repo, question, oracle...}
  route.ts                         ← category → A/B scorer 路由
```

**(3) 可抄代码**：任务清单 schema + 路由（tk 新建）：

```jsonc
// 源: scripts/eval/tasks/manifest.jsonl （tk 新建；一行一任务）
{ "task_id": "loc-1", "category": "locate_implementation", "repo": "token-killer",
  "question": "Where is uncached token delta computed?", "oracle_files": ["scripts/eval/metrics.ts"] }
{ "task_id": "mod-1", "category": "modify_function", "repo": "token-killer",
  "gold_patch": "patches/mod-1.diff", "f2p_tests": ["metrics.uncached"], "p2p_tests": ["metrics.median"] }
```

```ts
// 源: scripts/eval/tasks/route.ts （tk 新建）
const JOB_A = new Set(["locate_implementation", "understand_module_architecture",
  "understand_component_state_flow"]);
const JOB_B = new Set(["modify_function", "add_test", "fix_failing_test"]);
export function scorerFor(category: string): "A" | "B" | "both" {
  if (JOB_A.has(category)) return "A";
  if (JOB_B.has(category)) return "B";
  return "both";   // follow_call_chain / debug_build / inspect_diff / update_config / trace_route
}
```

**(4) 具体数值**：11 类；manifest 字段 = `{task_id, category, repo, question, oracle_answer|gold_patch, f2p_tests[], p2p_tests[], oracle_files[]}`；category 标签路由到 A 或 B scorer。

**(5) 有序步骤**：
1. 落 `manifest.jsonl` schema + `scorerFor` 路由——独立可测。
2. 逐步填充各类任务（patch-bearing 类需 gold_patch + tests）。

**(6) 测试**：`scorerFor("locate_implementation")==="A"`；`scorerFor("modify_function")==="B"`；`scorerFor("follow_call_chain")==="both"`；断言每行 manifest 必含 category。

**(7) 证据回指**：compendium §11 task categories。

---

### K15 measurement & claim boundaries — (serves both surfaces)

**(1) 决策**（grilling D10 / Q10，全文 [ADR 0022](../../adr/0022-measurement-and-claim-boundaries.md)）：每个 host 只证它能证的，**绝不让一个 host 的数字冒充另一 host**。Claude Code = token proxy（唯一干净 whole-task uncached，附 footer 声明非 Copilot 数）；VS Code Copilot = target observational facts（tool_calls/avoided_reads/payload，`estimate_kind:"opportunity"`，永不汇入 `saved_tokens`）；human = portable task metrics（hit@1/time-to-file/answer correctness）。

**(2) 默认配置闸**（D10 产品形状部分）：层挣得某 profile 默认输出预算 = (1) correctness 非回归（硬闸）+ (2) portable utility（Copilot/人类可观测）决定默认 + (3) proxy whole-task uncached 仅作**成本约束 + 辅助 tie-breaker**，绝不单独定默认。配置选定后**周期性在 Copilot 用 observational facts 复核**——无运行时自动反证引擎、无 validation-status 状态机、无自动 demotion（target 数据是观察性的、易受任务分布扰动，供周期复核，不驱动实时行为）。

**(3) 证据回指**：[ADR 0022](../../adr/0022-measurement-and-claim-boundaries.md)；[ADR 0020](../../adr/0020-selection-vs-projection.md)（earning-budget by ablation）；[ADR 0016](../../adr/0016-measurement-before-feature.md)（uncached 口径）。

---

### K16 benchmark architecture — (serves both surfaces; K 的主体)

**(1) 决策**（grilling D11 / Q10，全文 [ADR 0023](../../adr/0023-benchmark-architecture.md)）：复用两套已验证参考 harness，每套只做**一个可证伪声称**，不自建 benchmark 分级：
- **Agent 端到端 = GitNexus 式 SWE-bench harness**：3 臂 `baseline / tk-native / tk-projection`，SWE-bench 官方 F2P/P2P 判 resolve，同记 whole-task uncached / cost / tool·API calls。证'agent 是否更易完成真实修复任务 + token 是否降'。**SWE-bench 的 Python 偏向只须在报告披露，不得用于声明 TS/JS 端到端收益。**
- **Backend 能力 = Codebase-Memory 式多仓问题集**：TS/TSX/JS、Python、Go 各代表性真实 OSS repo，固定可机械验证问题（symbol location / callers·callees / flow / impact / Domain candidates / Evidence arbitration），记 PASS/PARTIAL/FAIL。证'声明语言上 Code/Behavior/Domain/Evidence 是否正确'，**不与** SWE-bench 混成一个指标。

**(2) tk 自有 repo = regression only**（CI 回归/功能检查/快消融，永不作主对外基准）。

**(3) Human Inspector（codeguide）**：无分档品牌。只两样——自动 **regression tasks**（防导航/查询退化，不作人类理解 claim）+ 小规模 **blind human study**（评审≠作者、不知分组）比 baseline vs Human Inspector 的 hit@1 / time-to-file / answer correctness；永报 `N / repos / tasks`，绝不输出泛化 "comprehension +X%"。

**(4) 要动的文件**：`scripts/eval/harness-swebench.ts`（GitNexus 3 臂）；`scripts/eval/harness-langsuite.ts`（per-language runner）；`scripts/eval/human-study.ts`（盲测记录）；复用 K6 oracle + K10 schema。

**(5) 证据回指**：[ADR 0023](../../adr/0023-benchmark-architecture.md)；GitNexus SWE-bench 评测模式；Codebase Memory repository question suite。

---

### K17 ablation protocol — (serves the codemap agent surface)

**(1) 决策**（grilling D12 / Q10，全文 [ADR 0024](../../adr/0024-ablation-protocol.md)）：K13 与 D7 **不是笛卡尔矩阵**——D7 的投影臂活在 K13 的 `+graph` 臂内。K13 测**检索技术**（baseline/+compression/+smart-read/+graph/+symbol，全 cell 锁同一 projection control，隔离技术 vs 投影）；D7 在 graph 臂内测**投影**（Code-only vs 四层，per profile）。**不跑全矩阵**：K13 winner 与 D7 winner 各自独立选出后，对 baseline 做**一次组合确认**（correctness 非回归、预期收益仍在、token 不实质反向）。ablation 嵌入 K16 两 harness（K13 在 SWE-bench 对照臂、D7 在固定 task slice）。

**(2) 要动的文件**：`scripts/eval/ablation.ts`（K13 锁投影阶梯 → D7 graph 臂内 → 一次组合确认）；复用 K16 harness。

**(3) 证据回指**：[ADR 0024](../../adr/0024-ablation-protocol.md)；[ADR 0020](../../adr/0020-selection-vs-projection.md)。

---

### 跨 K 子决策的诚实不变量（acceptance gate）

1. **never report a number we cannot mechanically derive**——measured（K1-K6, K8, K10-K11）走 Claude Code 实测；opportunity（K7）打不同 `estimate_kind` 永不汇总；Job-A 自动任务只作 regression（不作人类理解 claim），人类价值仅小规模盲测、永报 N/repos/tasks。
2. **uncached not total**（K1）——OVERRULES codegraph total 头条；统一 = whole-task uncached（total 仅审计列）。
3. **每个 token 增量必与非回归 success_rate 配对**（K6 Pareto），绝不单报 token。
4. **host boundary**（K15 / [ADR 0022](../../adr/0022-measurement-and-claim-boundaries.md)）——Claude=token proxy(footer 标注，不冒充 Copilot) / Copilot=observational facts(`estimate_kind:"opportunity"`，永不汇入 saved) / human=portable task metrics；一个 host 的数字绝不冒充另一 host。
5. 全工坊只写 JSONL/sqlite ledger，**自身不跑任何模型**（无 API key、无 model egress）；Job-A 评分由 host-agent（regression）或盲测人类（study），永不用 tool-embedded model。
6. **default by correctness + portable utility**（K15 / [ADR 0022](../../adr/0022-measurement-and-claim-boundaries.md)）——层挣默认预算须 correctness 非回归(硬闸) + portable utility(Copilot/人类可观测)；proxy uncached 仅成本约束/tie-breaker，绝不单独定默认；配置周期性在 Copilot 复核（无运行时自动反证/降级状态机）。
7. **claim boundary = 两类结论**（K16 / [ADR 0023](../../adr/0023-benchmark-architecture.md)）——K 对外只声称 ① 真实任务上 tk 提高成功率/降低 agent 成本 ② 声明的语言与图能力真工作；通用 comprehension %、单一 blended score、跨语言/跨 host 外推一律 out of bounds。
8. **ablation embeds, no matrix**（K17 / [ADR 0024](../../adr/0024-ablation-protocol.md)）——K13 测技术(锁投影)、D7 graph 臂内测投影；不跑全矩阵，final config 对 baseline 确认一次；tk 自有 repo = regression only。

### Open Decisions

> **✅ Need-K 全部闭合 → Q10 完成（D10–D12 / [ADR 0022](../../adr/0022-measurement-and-claim-boundaries.md)–[0024](../../adr/0024-ablation-protocol.md)）。** K 收敛为三件事:**在哪个 host 能证什么**(K15)、**用哪两套现成 benchmark**(K16)、**少量消融如何嵌入**(K17)。对外结论只两类:① 真实任务上 tk 提高成功率/降低 agent 成本;② 声明的语言与图能力真工作。其余(通用 comprehension %、单一 blended score、跨语言/跨 host 外推)一律 out of bounds。
> 已降为评估协议细节(非产品架构):token 口径计算、run 预算(4/臂+自适应)、premiumRequests 丢弃、Job-A host-agent vs 盲测人类、SWE-bench 语言披露。


---

