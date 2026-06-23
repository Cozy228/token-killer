## 需求 E — Freshness / incremental（新鲜度 / 增量）

> 本节落实「三层 lazy-first 新鲜度模型」：**触发=按读懒检查、默认无常驻 daemon/watcher**；**失效精度=两级（content-hash 快路 + AST 结构指纹分级）+ 下游 BFS + referencer-set diff**；**新鲜度信号一等公民、A/B 双受众**。所有存储落在 node:sqlite（强倾向），整数 `index_generation` 比较即为陈旧判定，零原生编译、零模型出口。
>
> **大跳变调度（D25 / [ADR 0035](../adr/0035-reconciling-freshness-latency-budget-per-layer.md)，2026-06-22）**：HEAD 大跳变后 E9 的 `FULL_UPDATE` **只决定重算哪些层、不决定是否阻塞查询**。首查先跑廉价同步失效闭包（标受影响 facts pending、不重解析），再按预计 p95 成本**延迟预算门控**（<1s inline / 1–2s 服务未受影响 / >2s session 内续算）。此态为 **RECONCILING**（≠ FROZEN，后者仅留给 sync 失败）；新鲜度从 `stale:boolean` 升级为 **per-result/per-layer `resultFreshness`+`completeness`**，受影响依赖结果标 PARTIAL/UNKNOWN/SYNC_REQUIRED，绝不 banner-掩盖旧 edges。
> 与上游一致性约束（来自 DEP MAP）：
> - **承接 A**：图节点带 `file:line`、edges 走 `calls`/`imports`，本节的 BFS 下游重算复用这两类边；陈旧通过 `index_generation` 整数比较实现。
> - **承接 B**：失效分级写回 C 的 `provenance` 列上下文——COSMETIC/comment/docstring-only 变更**不触发** LLM 重生成（B 的 host-paid 生成层），只做廉价的 source-line/lineno 刷新。
> - **冲突裁定（E/F/J/M daemon 姿态）**：**lazy-on-read 为默认且 Required**、stdio 单进程、daemon Unsupported；J8/J9 的陈旧 banner 由本节的懒 mtime 扫描驱动（**非**常驻 watcher）；daemon 仅作 M18 条件分支（Open Decision）。
> - **冲突裁定（C/L 存储位置）**：指纹库 DB 与图 DB 同处**仓外** per-project fingerprint 目录（POSIX `~/.token-killer/projects/<fp>/index.db`，Windows `%LOCALAPPDATA%\token-killer\...`），永不进 `.tk/`。
> - **版本门（A/C/D/L）**：`engines.node ">=22.5.0 <25.0.0"`，FTS5 由 vendored Node 24.x bundle 保证；本节不新增版本约束。

---

### E1 — 默认触发=按读懒检查，无常驻 daemon、无原生 watcher（serves both surfaces）

**(1) 决策**：默认触发是 **lazy on-read 陈旧检查**（Required, default on）——每次 MCP/CLI 查询时对被引用文件做一次廉价 `(path,mtime,size)` 扫描；差异文件才进入 hash/parse。**绝不**默认起 watcher、socket、pidfile、daemon。

**(2) 要动的文件**：
```
src/freshness/                      # 新建目录
  ├─ lazySweep.ts                   # 按读 mtime/size 扫描 + 触发 E3/E4 阶梯
  ├─ fingerprintStore.ts            # E2 file_fingerprint 表读写
  ├─ staleness.ts                   # E14 git+mtime 复合陈旧判定（移植 UA staleness.ts）
  └─ index.ts
src/mcp/server.ts                   # 已存在(F)：每个 tool 调用前调用 lazySweep（E12 banner 注入点）
```

**(3) 可抄代码**（陈旧判定的 git 基线，移植自 UA，已确认 verbatim 存在）：

源: /tmp/tk-research/understand-anything/understand-anything-plugin/packages/core/src/staleness.ts:13（已改写——`KnowledgeGraph` 改为本节 fingerprint store，函数签名保留）
```ts
// src/freshness/staleness.ts
import { execFileSync } from "node:child_process";

export interface StalenessResult { stale: boolean; changedFiles: string[]; }

/** Files changed between a given commit and HEAD; [] on any git error. */
export function getChangedFiles(projectDir: string, lastCommitHash: string): string[] {
  try {
    const output = execFileSync("git", ["diff", `${lastCommitHash}..HEAD`, "--name-only"], {
      cwd: projectDir, encoding: "utf-8",
    });
    return output.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
  } catch { return []; }
}

export function isStale(projectDir: string, lastCommitHash: string): StalenessResult {
  const changedFiles = getChangedFiles(projectDir, lastCommitHash);
  return { stale: changedFiles.length > 0, changedFiles };
}
```

**(4) 具体数值**：未变文件成本 = **1 次 `stat()`**（无 hash、无 parse）；懒扫描在常见全未变场景 < **1ms**；扫描范围 = 当前查询 response 中**被引用的文件**（非全树）。无任何常驻进程/socket/pidfile。

**(5) 有序步骤**：
1. 落 `src/freshness/staleness.ts`（上面 verbatim 移植），单测 git-diff 解析。
2. 落 `lazySweep.ts`：输入候选文件列表，逐个 `stat()`，命中 E3 pre-filter 才升级到 E4。
3. 在 `src/mcp/server.ts` 每个 tool handler 入口调用 `lazySweep` 并把 `pending` 文件交给 E12 banner。

**(6) 测试**：
- 单测 fixture：构造 `<commit>..HEAD` 改了 2 文件 → `isStale().changedFiles.length===2`。
- A-B harness 字段：记录 `lazy_sweep_ms`（全未变路径断言 < 5ms）、`files_stat_only` 计数。

**(7) 证据回指**：UA staleness.ts:13-43；codegraph watch-policy.ts:82-98（#199 证明 watcher 在 Windows-primary 的 WSL2 /mnt 上不可用）；tk MEMORY「inspect scan cache shipped」(path+mtime+size key, cold→warm 6×)。

---

### E2 — 指纹库 schema（node:sqlite）+ 节点 `index_generation` 整数比较（serves both surfaces）

> ⚠️ **D32 / [ADR 0040](../adr/0040-process-model-lease-coordinated-generation-publish.md) 精化**：整数 `index_generation` **降为 published-generation 指针**；**generation identity = (repo revision + worktree digest + schema version + analysis policy version) 元组**（非仅整数）。查询在**短读事务**内读**单一 published generation**；新 generation 作**未发布 staging** 建、经**原子 publish 事务**可见。跨进程 reconcile 由 **DB-backed lease**（非 WAL、非 daemon）协调：仅 lease owner 写 staging，余者服务安全结果/等预算/返回 `RECONCILING`。下文整数比较仍是单进程内 pending 标记的快路，但跨进程新鲜度/发布以 D32 为准。

**(1) 决策**：在 node:sqlite 建 `file_fingerprint` 表 + `meta` 键值表；每个图节点行带 `index_generation INTEGER`，陈旧 = 一次廉价 `WHERE` 整数比较，可把节点标 pending 而不重写。

**(2) 要动的文件**：`src/freshness/fingerprintStore.ts`（DDL+读写）；与 C 的 `index.db` 同库（仓外 per-project 目录，见冲突裁定）。

**(3) 可抄代码**（DDL — 需实现时按 E2 concrete 固化；字段直接对应 UA `FileFingerprint` 结构，见 fingerprint.ts:30-39 已确认）：
```sql
-- src/freshness/fingerprintStore.ts  (node:sqlite exec)
CREATE TABLE IF NOT EXISTS file_fingerprint (
  path             TEXT PRIMARY KEY,
  mtime_ns         INTEGER NOT NULL,
  size             INTEGER NOT NULL,
  content_hash     TEXT NOT NULL,           -- sha256 hex (E4)
  struct_json      TEXT,                    -- AST signature fingerprint (E5); NULL if no parser
  index_generation INTEGER NOT NULL,
  indexed_at       TEXT NOT NULL            -- ISO8601
);
CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL                       -- holds 'indexCommit', 'currentGeneration'
);
-- graph node rows already carry: index_generation INTEGER  (added on the nodes table by C)
-- staleness query: SELECT path FROM file_fingerprint WHERE index_generation < :currentGeneration;
```

UA 的字段来源（已确认 verbatim，证明 struct_json 该装哪些字段）：

源: /tmp/tk-research/understand-anything/understand-anything-plugin/packages/core/src/fingerprint.ts:30
```ts
export interface FileFingerprint {
  filePath: string;
  contentHash: string;
  functions: FunctionFingerprint[];   // {name,params[],returnType?,exported,lineCount}
  classes: ClassFingerprint[];        // {name,methods[],properties[],exported,lineCount}
  imports: ImportFingerprint[];       // {source,specifiers[]}
  exports: string[];
  totalLines: number;
  hasStructuralAnalysis: boolean;     // false ⇒ conservative STRUCTURAL (E16)
}
```

**(4) 具体数值**：`index_generation` 每次 sync **+1**；`meta` 仅 2 行（`indexCommit`、`currentGeneration`）；`struct_json` 为 `FileFingerprint` 减去 `filePath/contentHash` 后的 JSON（即 functions/classes/imports/exports/hasStructuralAnalysis）。

**(5) 有序步骤**：
1. 落 DDL + `upsertFingerprint(fp)` / `loadFingerprint(path)` / `currentGeneration()`。
2. C 的 nodes 表加 `index_generation`（与 C 协调，本节只消费）。
3. sync 收尾 `bumpGeneration()`：`currentGeneration += 1` 并写 `meta`。

**(6) 测试**：单测 upsert 后 `loadFingerprint` 回读一致；`WHERE index_generation < N` 返回 pending 集合断言。

**(7) 证据回指**：UA fingerprint.ts:30-39；强倾向 node:sqlite+FTS5（DEP MAP coherenceNotes 不变量①）。

---

### E3 — 廉价 pre-filter=（mtime_ns, size），未变文件只花一次 stat（serves the codemap agent surface）

**(1) 决策**：只有 `mtime_ns` **或** `size` 与指纹库不同的文件才进入 hash/parse；其余跳过。

**(2) 要动的文件**：`src/freshness/lazySweep.ts`。

**(3) 可抄代码**（tk-adapted，复用 inspect scan-cache 的 key 语义）：
```ts
// src/freshness/lazySweep.ts  (需实现时补 statSync 包装)
import { statSync } from "node:fs";
import { loadFingerprint } from "./fingerprintStore.js";

export function isUnchangedByPreFilter(absPath: string): boolean {
  const fp = loadFingerprint(absPath);
  if (!fp) return false;                          // unknown → must hash/parse
  const st = statSync(absPath, { bigint: true }); // mtimeNs is BigInt
  return fp.mtime_ns === Number(st.mtimeNs) && fp.size === Number(st.size);
}
// if true → changeLevel NONE, skip hash+parse (E4). else → proceed to E4.
```

**(4) 具体数值**：pre-filter 命中=**0 次 read、0 次 parse**，仅 1 次 `stat()`。

**(5) 有序步骤**：1. 实现 `isUnchangedByPreFilter`。2. lazySweep 对每个候选先调它，未命中才进 E4。

**(6) 测试**：fixture 改 mtime 不改内容 → pre-filter 返回 false → 进入 E4 → E4 hash 相同 → 最终 NONE（验证两级协同）。

**(7) 证据回指**：tk MEMORY「inspect scan cache shipped」(key=path+mtime+size, best-effort, ~/.token-killer/inspect-cache)。

---

### E4 — Tier-1 失效=sha256 content-hash 快路（identical ⇒ NONE，跳过 parse）（serves the codemap agent surface）

**(1) 决策**：内容 hash 相同 ⇒ `changeLevel:'NONE'`，跳过所有 tree-sitter parse。捕获 mtime 被 bump 但内容相同的情况（git checkout、formatter no-op）。

**(2) 要动的文件**：`src/freshness/fingerprintStore.ts`（`contentHash`）+ `lazySweep.ts`。

**(3) 可抄代码**（源已确认 verbatim）：

源: /tmp/tk-research/understand-anything/understand-anything-plugin/packages/core/src/fingerprint.ts:70 & :131-140
```ts
import { createHash } from "node:crypto";

/** Compute SHA-256 content hash for a file's content. */
export function contentHash(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

// fast path inside compareFingerprints (fingerprint.ts:137-140):
//   if (oldFp.contentHash === newFp.contentHash) {
//     return { filePath: newFp.filePath, changeLevel: "NONE", details: [] };
//   }
```

**(4) 具体数值**：hash 相同 ⇒ **0** 次 parse、**0** 次 LLM 调用；hash 算法固定 sha256（hex）。

**(5) 有序步骤**：1. 落 `contentHash`。2. lazySweep 在 pre-filter 未命中后读文件、算 hash、与 `file_fingerprint.content_hash` 比；相同 → NONE，更新 mtime/size 但不动图。

**(6) 测试**：fixture `touch` 不改内容 → NONE，断言 parse 计数=0。

**(7) 证据回指**：UA fingerprint.ts:70,138。

---

### E5 — Tier-2 失效=AST 结构指纹 diff → COSMETIC vs STRUCTURAL（serves both surfaces）

**(1) 决策**：内容不同但签名（function name/params/returnType/exported、class name/methods/properties/exported、imports、exports）全相同 ⇒ **COSMETIC**（无图影响、无 LLM 重生成）；任一签名变动 ⇒ **STRUCTURAL**。

**(2) 要动的文件**：`src/freshness/fingerprintStore.ts`（`compareFingerprints` 移植）+ D 的 tree-sitter extractor 产出 `StructuralAnalysis`。

**(3) 可抄代码**（源已确认 verbatim，fingerprint.ts:131-246 完整逻辑，此处给核心判定）：

源: /tmp/tk-research/understand-anything/understand-anything-plugin/packages/core/src/fingerprint.ts:131
```ts
export function compareFingerprints(oldFp: FileFingerprint, newFp: FileFingerprint): FileChangeResult {
  const details: string[] = [];
  // Fast path: identical content (E4)
  if (oldFp.contentHash === newFp.contentHash) {
    return { filePath: newFp.filePath, changeLevel: "NONE", details: [] };
  }
  // Conservative path (E16): no structural analysis ⇒ STRUCTURAL
  if (!oldFp.hasStructuralAnalysis || !newFp.hasStructuralAnalysis) {
    return { filePath: newFp.filePath, changeLevel: "STRUCTURAL",
      details: ["no structural analysis available — conservative classification"] };
  }
  // function signature deltas (add/remove/params/returnType/exported)
  const oldFuncNames = new Set(oldFp.functions.map((f) => f.name));
  const newFuncNames = new Set(newFp.functions.map((f) => f.name));
  for (const name of newFuncNames) if (!oldFuncNames.has(name)) details.push(`new function: ${name}`);
  for (const name of oldFuncNames) if (!newFuncNames.has(name)) details.push(`removed function: ${name}`);
  for (const newFn of newFp.functions) {
    const oldFn = oldFp.functions.find((f) => f.name === newFn.name);
    if (!oldFn) continue;
    if (JSON.stringify(oldFn.params) !== JSON.stringify(newFn.params)) details.push(`params changed: ${newFn.name}`);
    if (oldFn.returnType !== newFn.returnType) details.push(`return type changed: ${newFn.name}`);
    if (oldFn.exported !== newFn.exported) details.push(`export status changed: ${newFn.name}`);
  }
  // class signature deltas (methods/properties set-compare, exported)
  // ... (fingerprint.ts:191-218, methods/properties sorted-set compare)
  // imports/exports set-compare (fingerprint.ts:221-234)
  if (details.length > 0) return { filePath: newFp.filePath, changeLevel: "STRUCTURAL", details };
  return { filePath: newFp.filePath, changeLevel: "COSMETIC",
    details: ["internal logic changed (no structural impact)"] };
}
```

**(4) 具体数值**：COSMETIC ⇒ **0** 次图重算、**0** 次 LLM 调用，仅 source-line/lineno 刷新；签名集合比较用 sorted-set（methods/properties/imports/exports）。

**(5) 有序步骤**：1. 落 `extractFileFingerprint`（fingerprint.ts:79-122）消费 D 的 `StructuralAnalysis`。2. 落 `compareFingerprints`。3. lazySweep 在 E4 未命中后调它得 changeLevel。

**(6) 测试**：fixture (a) 仅改函数体 → COSMETIC；(b) 改 param → STRUCTURAL details 含 `params changed`。

**(7) 证据回指**：UA fingerprint.ts:131-246。

---

### E6 — STRUCTURAL 文件上的 per-symbol ChangeType 分类（serves both surfaces）

**(1) 决策**：对 STRUCTURAL 文件内每个变更符号分类 `ChangeType {NO_CHANGE, COMMENT_ONLY, DOCSTRING_CHANGED, CODE_BODY_CHANGED, API_SIGNATURE_CHANGED, NEW_COMPONENT, REMOVED_COMPONENT}`；只有 `{API_SIGNATURE_CHANGED, NEW_COMPONENT, REMOVED_COMPONENT, CODE_BODY_CHANGED}` 为 important，触发下游图/LLM 重算；COMMENT_ONLY/DOCSTRING_CHANGED **不触发**。

**(2) 要动的文件**：`src/freshness/changeType.ts`（移植 RepoDoc `ChangeType` + `has_important_changes` 门，按本节 enum 用 TS 重写）。

**(3) 可抄代码**（源已确认 verbatim）：

源: /tmp/tk-research/repodoc/repodoc/src/analysis/diff_analysis.py:67 & :202-210
```python
class ChangeType(Enum):
    API_SIGNATURE_CHANGED = "api_signature_changed"
    NEW_COMPONENT = "new_component"
    REMOVED_COMPONENT = "removed_component"
    DOCSTRING_CHANGED = "docstring_changed"
    CODE_BODY_CHANGED = "code_body_changed"
    COMMENT_ONLY = "comment_only"
    NO_CHANGE = "no_change"

# diff_analysis.py:202-210 — the important-changes gate
important_types = {
    ChangeType.API_SIGNATURE_CHANGED, ChangeType.NEW_COMPONENT,
    ChangeType.REMOVED_COMPONENT, ChangeType.CODE_BODY_CHANGED,
}
analysis.has_important_changes = any(
    c.change_type in important_types for c in analysis.changes
)
```

TS 重写（已改写，给 tk 用；逻辑等价）：
```ts
// src/freshness/changeType.ts
export type ChangeType =
  | "NO_CHANGE" | "COMMENT_ONLY" | "DOCSTRING_CHANGED"
  | "CODE_BODY_CHANGED" | "API_SIGNATURE_CHANGED" | "NEW_COMPONENT" | "REMOVED_COMPONENT";
const IMPORTANT_TYPES: ReadonlySet<ChangeType> = new Set([
  "API_SIGNATURE_CHANGED", "NEW_COMPONENT", "REMOVED_COMPONENT", "CODE_BODY_CHANGED",
]);
export function hasImportantChanges(changes: { changeType: ChangeType }[]): boolean {
  return changes.some((c) => IMPORTANT_TYPES.has(c.changeType));
}
// classify: old_params!=new_params → API_SIGNATURE_CHANGED; added name → NEW_COMPONENT;
//   removed → REMOVED_COMPONENT; only docstring differs (both present) → DOCSTRING_CHANGED;
//   else CODE_BODY_CHANGED.
```

**(4) 具体数值**：important 集合**恰 4** 个 ChangeType；COMMENT_ONLY/DOCSTRING_CHANGED ⇒ **0** 次 LLM 调用。

**(5) 有序步骤**：1. 落 `ChangeType` + `hasImportantChanges`。2. 在 STRUCTURAL 文件上跑 per-symbol 分类。3. `!hasImportantChanges` ⇒ 跳过 E7 下游重算的 LLM 部分。

**(6) 测试**：fixture 仅改 docstring → `DOCSTRING_CHANGED` 且 `hasImportantChanges===false`；改签名 → `API_SIGNATURE_CHANGED` 且 true。

**(7) 证据回指**：RepoDoc diff_analysis.py:67-99, 202-210。

---

### E7 — 下游重算集=变更文件自身节点 ∪ 反向 calls/imports BFS（拓扑序）（serves both surfaces）

**(1) 决策**：重算 = 结构变更文件的自身节点 + 沿反向 `calls`/`imports` 边 BFS 到的下游调用者；按拓扑序（依赖先）处理。**拒绝** CodeWiki 的 substring-path/module-ancestor 传播（landscape 评为 coarse and unsound）。

**(2) 要动的文件**：`src/freshness/recompute.ts`（BFS+topo）；消费 A/C 的 `calls`/`imports` 边表。

**(3) 可抄代码**（需实现时补——RepoDoc incremental_updater.py:25-51,136-162 是 Python+networkx，本节用 TS 重写 BFS；给出可粘骨架）：
```ts
// src/freshness/recompute.ts  (已改写：等价于 RepoDoc BFS over REL_CALLS/REL_SEMANTIC_IMPACT)
import { reverseEdges } from "../store/edges.js"; // returns callers/importers of a nodeId

/** affected = ∪_changed( componentsInFile(f) ∪ downstreamVia(calls,imports) ) */
export function downstreamRecomputeSet(changedNodeIds: string[]): string[] {
  const seen = new Set<string>(changedNodeIds);
  const queue = [...changedNodeIds];
  while (queue.length) {
    const id = queue.shift()!;
    for (const upId of reverseEdges(id, ["calls", "imports"])) { // who references me
      if (!seen.has(upId)) { seen.add(upId); queue.push(upId); }
    }
  }
  return topologicalOrder([...seen]); // dependencies first
}
// 需实现时补: topologicalOrder() over the calls/imports DAG (Kahn). RepoDoc uses
// topo_sort.py; tk reimplements in TS. Gap: cycle handling = break-on-revisit (already via `seen`).
```

**(4) 具体数值**：BFS 仅沿 `calls`+`imports` 两类边；重算集上界由 E9 阶梯封顶（≤30 文件或 ≤50%）。

**(5) 有序步骤**：1. 落 `reverseEdges`（查 C 边表）。2. 落 BFS。3. 落 `topologicalOrder`（Kahn）。

**(6) 测试**：fixture 3 节点链 A←B←C，改 A → recompute set = {A,B,C} 且拓扑序 A 先。

**(7) 证据回指**：RepoDoc incremental_updater.py:25-51,136-162；landscape report CodeWiki coarse/unsound 评价。

---

### E8 — caller-side 精度=who_reference_me set-diff（serves both surfaces）

**(1) 决策**：对每个存活节点，比对 referencer-ID 集合：`new⊆old` ⇒ `referencer_not_exist`（有 caller 被删）；否则 `add_new_referencer`（新 caller 出现）；与 `code_changed`（自身源码变）正交。

**(2) 要动的文件**：`src/freshness/referencerDiff.ts`（移植 RepoAgent travel2 逻辑）。

**(3) 可抄代码**（源已确认 verbatim）：

源: /tmp/tk-research/repoagent/repo_agent/doc_meta_info.py:792
```python
if not (set(new_reference_names) == set(old_reference_names)) and (
    result_item.item_status == DocItemStatus.doc_up_to_date):
    if set(new_reference_names) <= set(old_reference_names):  # 旧 referencer 包含新的
        result_item.item_status = DocItemStatus.referencer_not_exist   # caller removed
    else:
        result_item.item_status = DocItemStatus.add_new_referencer     # caller added
```

TS 重写（已改写）：
```ts
// src/freshness/referencerDiff.ts
export type RefStatus = "up_to_date" | "code_changed" | "referencer_not_exist" | "add_new_referencer";
export function diffReferencers(oldRefs: string[], newRefs: string[], status: RefStatus): RefStatus {
  const o = new Set(oldRefs), n = new Set(newRefs);
  const equal = o.size === n.size && [...n].every((x) => o.has(x));
  if (!equal && status === "up_to_date") {
    const subset = [...n].every((x) => o.has(x));     // new ⊆ old
    return subset ? "referencer_not_exist" : "add_new_referencer";
  }
  return status; // independently: if code_content differs elsewhere → set "code_changed"
}
```

**(4) 具体数值**：set-diff 为 O(|refs|)；仅在 `status==up_to_date` 且集合不等时改状态。

**(5) 有序步骤**：1. 落 `diffReferencers`。2. recompute 时对每个存活下游节点取新旧 referencer ID 集合，调它定状态。

**(6) 测试**：fixture old={a,b} new={a} → `referencer_not_exist`；new={a,b,c} → `add_new_referencer`。

**(7) 证据回指**：RepoAgent doc_meta_info.py:786-800；landscape report「best invalidation (two-snapshot ref-set diff)」。

---

### E9 — recompute-scope cap 阶梯：SKIP / PARTIAL / ARCHITECTURE / FULL（serves both surfaces）

**(1) 决策**：`structuralCount = struct + new + deleted`。SKIP if 0；FULL if `>30` 或 `>50%` 项目文件；ARCHITECTURE if 新增/删除 top-level 目录 **或** `>10` 结构文件；否则 PARTIAL。

**(2) 要动的文件**：`src/freshness/changeClassifier.ts`（移植 UA change-classifier.ts）。

**(3) 可抄代码**（源已确认 verbatim）：

源: /tmp/tk-research/understand-anything/understand-anything-plugin/packages/core/src/change-classifier.ts:21
```ts
export function classifyUpdate(analysis: ChangeAnalysis, totalFilesInGraph: number,
  allKnownFiles: string[] = []): UpdateDecision {
  const { newFiles, deletedFiles, structurallyChangedFiles, cosmeticOnlyFiles } = analysis;
  const structuralCount = structurallyChangedFiles.length + newFiles.length + deletedFiles.length;
  if (structuralCount === 0) {
    return { action: "SKIP", filesToReanalyze: [], rerunArchitecture: false, rerunTour: false,
      reason: cosmeticOnlyFiles.length > 0
        ? `${cosmeticOnlyFiles.length} file(s) have cosmetic-only changes (no structural impact)`
        : "No changes detected" };
  }
  const triggeredByCount = structuralCount > 30;
  const triggeredByPercentage = totalFilesInGraph > 0 && structuralCount / totalFilesInGraph > 0.5;
  if (triggeredByCount || triggeredByPercentage) {
    return { action: "FULL_UPDATE", filesToReanalyze: [...structurallyChangedFiles, ...newFiles],
      rerunArchitecture: true, rerunTour: true, reason: `... full rebuild recommended` };
  }
  const hasDirectoryChanges = detectDirectoryChanges(newFiles, deletedFiles, allKnownFiles);
  if (hasDirectoryChanges || structuralCount > 10) {
    return { action: "ARCHITECTURE_UPDATE", filesToReanalyze: [...structurallyChangedFiles, ...newFiles],
      rerunArchitecture: true, rerunTour: true, reason: `... architecture re-analysis needed` };
  }
  return { action: "PARTIAL_UPDATE", filesToReanalyze: [...structurallyChangedFiles, ...newFiles],
    rerunArchitecture: false, rerunTour: false, reason: `... partial` };
}
```

**(4) 具体数值**：阈值固定 **10 / 30 / 50%**；top dir = `dirname(path)` 的首段；PARTIAL 不 rerun architecture/tour。

**(5) 有序步骤**：1. 落 `classifyUpdate` + `detectDirectoryChanges`（change-classifier.ts:94-）。2. recompute 前调它决定 scope，封顶 E7 的 BFS。

**(6) 测试**：fixture 31 结构文件 → FULL；11 文件 → ARCHITECTURE；新增 top dir → ARCHITECTURE；3 文件同目录 → PARTIAL；全 COSMETIC → SKIP。

**(7) 证据回指**：UA change-classifier.ts:21-87。

---

### E10 — git hooks（post-commit/merge/checkout，后台、marker-block 幂等，Required capability; its runtime activation is Optional at runtime）（serves both surfaces）

**(1) 决策**：提供三个 git hook（Required capability; its runtime activation is Optional at runtime），后台跑 `tk sync`、marker-block 包裹幂等、尊重 `core.hooksPath`、`command -v` 守门。这是 commit-precise 路径，避开 DeepWiki 的 hours-days 调度延迟，且**无常驻进程**。

**(2) 要动的文件**：`src/freshness/gitHooks.ts`（移植 codegraph git-hooks.ts，`codegraph`→`tk`）；`tk init` 增 `--git-hooks` 开关。

**(3) 可抄代码**（源已确认 verbatim，移植替换 `codegraph`→`tk`，标已改写）：

源: /tmp/tk-research/codegraph/src/sync/git-hooks.ts:20-86（已改写：CLI 名 codegraph→tk）
```ts
const MARKER_BEGIN = "# >>> tk sync hook >>>";
const MARKER_END   = "# <<< tk sync hook <<<";
export type GitHookName = "post-commit" | "post-merge" | "post-checkout";
export const DEFAULT_SYNC_HOOKS: GitHookName[] = ["post-commit", "post-merge", "post-checkout"];

function gitHooksDir(projectRoot: string): string | null {
  try {
    const out = execFileSync("git", ["rev-parse", "--git-path", "hooks"], {
      cwd: projectRoot, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], windowsHide: true,
    }).trim();
    if (!out) return null;
    return path.isAbsolute(out) ? out : path.resolve(projectRoot, out);
  } catch { return null; }
}

function markerBlock(): string {
  return [
    MARKER_BEGIN,
    "# Keeps the tk index fresh while the live file watcher is off.",
    "# Runs in the background so it never blocks git. Managed by tk.",
    "if command -v tk >/dev/null 2>&1; then",
    "  ( tk sync >/dev/null 2>&1 & ) >/dev/null 2>&1",
    "fi",
    MARKER_END,
  ].join("\n");
}
```

**(4) 具体数值**：默认 hook 集 **3** 个；snippet `( tk sync >/dev/null 2>&1 & )`（后台、永不阻塞 git）；默认 **OFF**，需 `tk init --git-hooks` 显式开启。

**(5) 有序步骤**：1. 移植 git-hooks.ts（含 `stripMarkerBlock` 幂等卸载、git-path hooks 解析）。2. `tk init --git-hooks` 写入；`tk uninstall` 调 strip。

**(6) 测试**：单测重复 install 不重复 marker block；uninstall 保留用户原 hook 内容；非 git repo → skipped。

**(7) 证据回指**：codegraph git-hooks.ts:20-26,74-88；RepoAgent pre-commit hook。

---

### E11 — IndexWatcher（native watcher，Optional-at-runtime 默认关），WSL2 /mnt 硬禁（serves the codemap agent surface）

> **D21 / [ADR 0033](../adr/0033-daemon-decomposed-three-capabilities.md) 三拆**：旧 E11 标题"daemon + native watcher"把三件事捆一起——已拆：① **CrossSessionRepositoryDaemon = Outside current product scope**（codemap 不需要 codegraph 式跨 session 内存图 daemon；tk on-disk node:sqlite + per-session MCP 已是正式暖路径，每 session 开一次 DB 复用 connection/prepared-stmt/bounded-cache；codegraph daemon 带 election/socket/orphan/idle/crash 生命周期 #277/#411，对 tk 只省一次 session 级 open，不值；**重开闸 = 实测 hydration p95>250ms + 频繁重开 + 原型砍 ≥50% first-query**）；② **IndexWatcher = 本节**（Optional-at-runtime 默认关）；③ **CommandProxyResident = 独立 Required capability/Optional-at-runtime**（D20 的 AV spawn 税唯一真解 = shim 不再 spawn Node 改连常驻 proxy runtime；属命令代理子系统、非 codemap）。本节 E11 仅保留 ② IndexWatcher 语义。

**(1) 决策**：native watcher 作显式逃生舱（`TK_WATCH=1` / `tk watch`）——Optional at runtime（默认关），debounce **2000ms**，在 WSL2 `/mnt/<drive>` 挂载与超 fd 上限时**硬禁**。把所有常驻进程 Windows 风险局限在显式接受的用户。**不含** cross-session daemon（Outside-scope，见上 D21）。

**(2) 要动的文件**：`src/freshness/watchPolicy.ts`（移植 codegraph watch-policy.ts，env 名 `CODEGRAPH_*`→`TK_*`）；`src/freshness/watcher.ts`（runtime activation Optional at runtime）。

**(3) 可抄代码**（源已确认 verbatim，移植替换 env 前缀，标已改写）：

源: /tmp/tk-research/codegraph/src/sync/watch-policy.ts:82-98（已改写：CODEGRAPH_NO_WATCH→TK_NO_WATCH 等）
```ts
// Precedence (first match wins):
//  1. TK_NO_WATCH=1    → off  (explicit opt-out always wins)
//  2. TK_WATCH=1       → on   (overrides auto-detection)   [tk: opt-IN, default OFF]
//  3. WSL2 + /mnt/*    → off  (recursive fs.watch is too slow; #199)
export function watchDisabledReason(projectRoot: string, probe: WatchProbe = {}): string | null {
  const env = probe.env ?? process.env;
  if (env.TK_NO_WATCH === "1") return "TK_NO_WATCH=1 is set";
  if (env.TK_WATCH !== "1")    return "watcher is opt-in (set TK_WATCH=1 to enable)"; // tk default OFF
  const isWsl = probe.isWsl ?? detectWsl();
  if (isWsl && isWindowsDriveMount(projectRoot))
    return "project is on a WSL2 /mnt/ drive, where recursive fs.watch is too slow to be reliable";
  return null;
}
```

源: /tmp/tk-research/codegraph/src/sync/watcher.ts:315（debounce 默认值，verbatim）
```ts
this.debounceMs = options.debounceMs ?? 2000;
```

**(4) 具体数值**：debounce 默认 **2000ms**；默认 **OFF**（需 `TK_WATCH=1`）；WSL2 `/mnt/[a-z]` 正则匹配即禁；超 OS fd 硬上限停止新增 watch。

**(5) 有序步骤**：1. 移植 watchPolicy（注意 tk 把 watcher 反转为 opt-IN：缺省即禁）。2. 移植 watcher（fd 上限保护）。3. `tk watch` 命令仅在 `watchDisabledReason===null` 时启动。

**(6) 测试**：单测 无 env → disabled；`TK_WATCH=1`+WSL+/mnt → disabled；`TK_WATCH=1`+非 WSL → enabled。

**(7) 证据回指**：codegraph watcher.ts:315,120；watch-policy.ts（#199 WSL /mnt 禁用）；research「daemon heavy (lockfiles, sockets, Windows pipes)」。

---

### E12 — agent-facing 陈旧 banner + 结构化字段（serves the codemap agent surface）

**(1) 决策**：tool response 前置 banner 列出 pending 文件并指示「Read 这些、其余信任 index」；附结构化 `{stale:bool, pending:string[], indexCommit:string, generation:int}`；另有更罕见的「index 冻结/sync 失效」banner（连懒刷新都跑不了时）。

**(2) 要动的文件**：`src/mcp/server.ts`（response 包装）；`src/freshness/banner.ts`。

**(3) 可抄代码**（源已确认 verbatim，banner 文案移植）：

源: /tmp/tk-research/codegraph/src/mcp/server-instructions.ts:68-69（已改写：CodeGraph→tk）
```ts
// src/freshness/banner.ts
export const STALE_BANNER = (pending: string[]) =>
  `⚠️ Some files referenced below were edited since the last index sync: ${pending.join(", ")} — ` +
  `Read those files directly for accurate content; every file NOT listed is fresh.`;
export const FROZEN_BANNER =
  `⚠️ tk index sync is frozen — Read files directly to confirm anything that may have changed.`;

export interface FreshnessMeta { stale: boolean; pending: string[]; indexCommit: string; generation: number; }
export function wrapResponse(body: string, meta: FreshnessMeta): { text: string; meta: FreshnessMeta } {
  const banner = !meta.stale ? "" : meta.pending.length ? STALE_BANNER(meta.pending) : FROZEN_BANNER;
  return { text: banner ? `${banner}\n\n${body}` : body, meta };
}
```

**(4) 具体数值**：banner 仅列 pending 文件（非全树）；结构化 meta 恰 **4** 字段；frozen banner 仅在懒刷新无法运行时发。

**(5) 有序步骤**：1. 落 banner 文案+`wrapResponse`。2. `server.ts` 每个 tool 出口套 `wrapResponse(body, freshnessMeta)`，meta 来自 E1 lazySweep + E2 generation。

**(6) 测试**：fixture 改 1 文件 → response 以 STALE_BANNER 起、`meta.pending` 含该文件；懒刷新失败 → FROZEN_BANNER。

**(7) 证据回指**：codegraph server-instructions.ts:68-69（failure-mode #3 唯一缓解）。

---

### E13 — human-facing 新鲜度 badge（HTML 报告）（serves the codeguide human surface）

**(1) 决策**：在 `src/report/html.ts`（tk 已有的 HTML 报告面）渲染新鲜度 badge：`indexedAt` 时间戳、`indexCommit` 短 hash、`N files pending re-index`、per-file last-synced；frozen/disabled 态渲染独立红色警告条。复用现有 `#001AFF` 浅色主题。

**(2) 要动的文件**：`src/report/html.ts`（已存在，确认）；数据来自 E2 `meta` + `file_fingerprint`。

**(3) 可抄代码**（需实现时补——`src/report/html.ts` 已有主题，此处给 badge 渲染片段）：
```ts
// src/report/html.ts  (新增 renderFreshnessBadge)
export function renderFreshnessBadge(f: {
  indexedAt: string; indexCommit: string; pending: string[]; frozen: boolean;
}): string {
  const commit7 = f.indexCommit.slice(0, 7);
  if (f.frozen) {
    return `<div class="tk-freshness tk-freshness--frozen" style="background:#fde8e8;color:#b91c1c;padding:8px 12px;border-radius:6px">
      Index frozen — content may be stale</div>`;
  }
  const list = f.pending.length
    ? `<ul>${f.pending.map((p) => `<li><code>${p}</code> — pending re-index</li>`).join("")}</ul>` : "";
  return `<div class="tk-freshness" style="color:#001AFF;font-size:13px">
    Indexed ${f.indexedAt} @ ${commit7} · ${f.pending.length} pending${list}</div>`;
}
// 需实现时补: wire into the existing html.ts report shell (read indexedAt/indexCommit from meta table).
```

**(4) 具体数值**：commit hash 取 **7** 位；badge 文案 `Indexed <indexedAt> @ <commit7> · <N> pending`；frozen 态用红条（`#b91c1c`），正常态用 `#001AFF`。

**(5) 有序步骤**：1. 落 `renderFreshnessBadge`。2. 在 html.ts 报告头注入；pending 列表带 mtime-vs-index delta。

**(6) 测试**：单测 frozen=true → 输出含 `Index frozen`；pending=2 → 含 `2 pending` 与两 `<li>`。

**(7) 证据回指**：UA DocNode version:int（human 可见 staleness）；tk MEMORY「HTML reports feature」(#001AFF light theme)。

---

### E14 — 陈旧基线锚 git commit hash + mtime 实时覆盖（serves both surfaces）

**(1) 决策**：`stale = (HEAD != indexCommit) OR (任一 tracked 文件 mtime/size 与指纹偏离)`；脏/未跟踪文件经 `git status --porcelain` 计入（非仅 `git diff`）。commit hash 抓分支切换/pull，mtime 抓 in-session 保存后未提交编辑。

**(2) 要动的文件**：`src/freshness/staleness.ts`（扩展 E1 的 isStale）。

**(3) 可抄代码**（tk-adapted，组合 UA git-diff 基线 + codegraph mtime 层）：
```ts
// src/freshness/staleness.ts  (扩展 E1)
export function isStaleComposite(projectDir: string, indexCommit: string): StalenessResult {
  const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: projectDir, encoding: "utf-8" }).trim();
  const committed = getChangedFiles(projectDir, indexCommit);            // E1: <indexCommit>..HEAD
  const dirty = execFileSync("git", ["status", "--porcelain"], { cwd: projectDir, encoding: "utf-8" })
    .split("\n").map((l) => l.slice(3).trim()).filter(Boolean);          // staged+unstaged+untracked
  const mtimeDiverged = sweepMtimeDiverged(projectDir);                  // E3 pre-filter over tracked set
  const changedFiles = [...new Set([...committed, ...dirty, ...mtimeDiverged])];
  return { stale: head !== indexCommit || changedFiles.length > 0, changedFiles };
}
// 需实现时补: sweepMtimeDiverged() = tracked files where (mtime_ns,size) ≠ file_fingerprint (E3).
```

**(4) 具体数值**：三源并集 = `git diff <indexCommit>..HEAD` ∪ `git status --porcelain`(脏) ∪ mtime-diverged；任一非空或 `HEAD≠indexCommit` ⇒ stale。

**(5) 有序步骤**：1. 落 `isStaleComposite`。2. `git status --porcelain` 列裁切（前 3 字符是 XY+空格）。3. 接 E3 `sweepMtimeDiverged`。

**(6) 测试**：fixture (a) 切分支 HEAD≠indexCommit → stale；(b) 改文件未提交 → dirty 含该文件 → stale；(c) 全同步 → not stale。

**(7) 证据回指**：UA staleness.ts:34-43（git diff 基线）；codegraph mtime 实时层（VS Code 交互式编辑场景）。

---

### E15 — 脏工作树正确性：fake-file swap 仅用于 commit-state doc，默认 index 反映 live tree（serves both surfaces）

**(1) 决策**：默认 agent index = **当前磁盘内容**（用户正在编辑的 live tree，serves the codemap agent surface）；RepoAgent 的 fake-file swap 仅在显式生成 commit-state doc 时用（serves the codeguide human surface）。守卫：若 `git status` 已含 `*_latest_version` 残留 fake-file 则拒绝。

**(2) 要动的文件**：`src/freshness/commitDocMode.ts`（移植 RepoAgent make_fake_files/delete_fake_files，仅 commit-doc 模式调用）。

**(3) 可抄代码**（源已确认 verbatim；含 stale fake-file 守卫）：

源: /tmp/tk-research/repoagent/repo_agent/utils/meta_info_utils.py:13-79（核心 swap + 守卫，verbatim 片段）
```python
latest_verison_substring = "_latest_version.py"

def make_fake_files():
    delete_fake_files()
    repo = git.Repo(setting.project.target_repo)
    unstaged_changes = repo.index.diff(None)            # 修改未提交
    untracked_files = repo.untracked_files
    # 守卫: 若 git status 已有 fake-file → 报错退出 (stale fake-file)
    for diff_file in unstaged_changes.iter_change_type("M"):
        if diff_file.a_path.endswith(latest_verison_substring):
            logger.error("FAKE_FILE_IN_GIT_STATUS detected! ..."); exit()
        now_file_path = diff_file.a_path
        if now_file_path.endswith(".py"):
            raw_file_content = diff_file.a_blob.data_stream.read().decode("utf-8")  # HEAD blob
            latest_file_path = now_file_path[:-3] + latest_verison_substring
            os.rename(real, latest_file_path)           # real → fake
            with open(now_file_path, "w") as w: w.write(raw_file_content)  # write HEAD content
            file_path_reflections[now_file_path] = latest_file_path
    return file_path_reflections, jump_files
# delete_fake_files() (meta_info_utils.py:82): restore — delete fake, rename back
```

**(4) 具体数值**：默认 index = on-disk live 内容；commit-doc 模式：`real→<f>_latest_version` / 写 HEAD blob / parse / restore；守卫拒绝条件 = 任一 `*_latest_version` 已在 `git status`。

**(5) 有序步骤**：1. 移植 `make_fake_files`/`delete_fake_files`（TS 重写，后缀按语言扩展名而非硬编码 `.py`）。2. 仅在 `tk wiki --commit-state` 类显式命令调用；默认路径不碰。

**(6) 测试**：fixture 脏文件 → commit-doc 模式 parse 的是 HEAD 内容、结束后磁盘恢复 live 内容；残留 fake-file → 拒绝退出。

**(7) 证据回指**：RepoAgent meta_info_utils.py:13-79,82。

---

### E16 — 无 tree-sitter parser 的文件在任何 hash 变更上保守判 STRUCTURAL（serves both surfaces）

**(1) 决策**：configs / 未知语言等无 parser 的文件，指纹只存 content-hash、`hasStructuralAnalysis=false`；任何 hash 变更 → STRUCTURAL（detail 注明 conservative）。绝不静默判 COSMETIC，correctness over token-savings。

**(2) 要动的文件**：`src/freshness/fingerprintStore.ts`（`buildFingerprintStore` 的 no-parser 分支）。

**(3) 可抄代码**（源已确认 verbatim）：

源: /tmp/tk-research/understand-anything/understand-anything-plugin/packages/core/src/fingerprint.ts:266-281
```ts
const analysis = registry.analyzeFile(filePath, content);
if (analysis) {
  files[filePath] = extractFileFingerprint(filePath, content, analysis);
} else {
  // No tree-sitter support: content hash only (conservative)
  files[filePath] = {
    filePath, contentHash: contentHash(content),
    functions: [], classes: [], imports: [], exports: [],
    totalLines: content.split("\n").length,
    hasStructuralAnalysis: false,   // ⇒ compareFingerprints returns STRUCTURAL on any hash change
  };
}
```

**(4) 具体数值**：`hasStructuralAnalysis=false` ⇒ E5 `compareFingerprints` 在 hash 变更上必返 STRUCTURAL，detail = `"no structural analysis available — conservative classification"`。

**(5) 有序步骤**：1. `buildFingerprintStore` 的 `analyzeFile===null` 分支按上构造。2. E5 已有 conservative 短路（fingerprint.ts:144-150）自动接管。

**(6) 测试**：fixture 改一个 `.toml`/`.lock` config → STRUCTURAL（非 COSMETIC），detail 含 conservative 文案。

**(7) 证据回指**：UA fingerprint.ts:144-150,271-281。

---

### Open Decisions

1. **会话首查时 HEAD 大幅移动**（如 `git pull` 200 commits）：静默触发 FULL_UPDATE，还是先发 frozen banner 要求显式 `tk sync`？（成本 vs 惊讶；待用户设触发 FULL 的延迟预算。）
2. **secondary 平台（Claude Code/macOS，watcher 安全）是否在 `tk init` 自动提示开启 git hooks（其运行时启用为 Optional at runtime）**，还是两平台统一默认关以保行为一致？
3. **Windows/NTFS mtime 粒度与时区/DST**：`mtime_ns` 是否够可靠单用，还是必须始终用 size+hash 兜底？（倾向 hash 兜底，但需像 inspect scan-cache 那样做 Windows 现场核验。）
4. **COSMETIC 变更对 HUMAN doc 层的处理**：COSMETIC（内部逻辑）改了行为但没改签名——human 新鲜度 badge 是否要标该节点「doc may be behind」，即便 agent index 视其为 fresh？（A/B 分歧，用户可能想调。）

> 与全局 Open Decisions 关联：daemon/shared-index 分支（M18/F #2/E11）当前 stdio 单进程、daemon Unsupported，该条件分支门控在 K 的 op-count/cold-start 测量——待用户设会翻转它的 cold-start 延迟预算（或确认「永不支持」）。


---

