> **[2026-07-04 P28] PARTIALLY SUPERSEDED** — the D18 DDL/table naming here (nodes/edges/fact_claims/…) is replaced by `CONTEXA-IMPL.md` §2 (entities/claims/links/conflicts/memory/handles). Carried facts that survive: sha256 content_hash; embeddings = Unsupported. The engines band is amended to ≥22.5 no-ceiling (P28).

## 需求 C — Index base & storage（索引底座与存储）

本节是 A「one structural codemap store」的物理实现。A 决定了「单一结构化 codemap 存储 = node:sqlite + FTS5，每个 node 带 file:line span，两套同等渲染 surface（codemap = agent，codeguide = human）」；B 决定了「字段级 provenance（static|llm|template），检索只过 static」。C 把这两条落成可建表的 DDL、可粘贴的连接代码、迁移脚手架与存储位置。所有代码块已逐一对照 `/tmp/tk-research/` clone 与 tk 仓库源文件确认存在后再粘贴。

> **跨需求版本闸（已在 DEP MAP 收口，C 服从 D 的 band）**：`engines.node = ">=22.5.0 <25.0.0"`，vendored Node 固定 24.x；解析进程强制 `--liftoff-only`（D10），user-Node 22.5–23 走 `--disable-warning` re-exec（L7）。C2 原文写的「>=22.5 无上限」**被 D 的 band 覆写**，本节统一采用 band。
> **存储位置闸（已在 DEP MAP 收口）**：重二进制 DB 永远 **out-of-tree**；`.tk/` 仅放 human 共享产物（wiki）与 gitignore 的本地 staging。A1 concrete 里残留的 `.tk/codegraph.db` 字符串作废，改为 out-of-tree。

---

### C1 — 引擎 = node:sqlite DatabaseSync + better-sqlite3 形状的薄 adapter　【(serves both surfaces)】

**(1) 决策**：引擎用 `node:sqlite` 的 `DatabaseSync`，外面套一层 better-sqlite3 形状的薄 adapter（补 `.pragma()`/`.transaction()`/`open`），`require('node:sqlite')` 懒加载，缺失时抛出精确的「requires Node >= 22.5.0 <25.0.0」错误。adapter 形状让以后换引擎不动查询代码。拒绝 better-sqlite3（unmaintained）/ Ladybug / Kuzu-native——它们都要 per-platform `.node` 原生二进制，违反 Windows-primary 的「零原生编译」硬锚。

**(2) 要动的文件**：
```
src/codemap/                       (新目录)
├── db/
│   ├── sqlite-adapter.ts            新建 (抄 codegraph 的 NodeSqliteAdapter)
│   ├── connection.ts                新建 (DatabaseConnection: initialize/open/pragma/maintenance)
│   ├── schema.sql                   新建 (C5/C6/C7/C8 全部 DDL)
│   ├── migrations.ts                新建 (C9 单调迁移)
│   └── queries.ts                   新建 (C7 FTS escape + bm25)
```

**(3) 可抄代码**（源: `/tmp/tk-research/codegraph/src/db/sqlite-adapter.ts:50-128`，license unrestricted，**已改写**：加入 band 上界 + 精确报错）：
```ts
// src/codemap/db/sqlite-adapter.ts
export type SqliteBackend = 'node-sqlite';

// 已改写：原文直接 require，这里加版本探测 + 精确报错（band 闸）
function requireNodeSqlite(): { DatabaseSync: any } {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('node:sqlite');
  } catch {
    throw new Error(
      'token-killer codegraph requires Node >= 22.5.0 <25.0.0 (node:sqlite). ' +
        'Your Node lacks node:sqlite — use the vendored-Node bundle, or upgrade Node.'
    );
  }
}

// 源: sqlite-adapter.ts:50（NodeSqliteAdapter，verbatim 形状）
class NodeSqliteAdapter {
  private _db: any;
  constructor(dbPath: string) {
    const { DatabaseSync } = requireNodeSqlite();
    this._db = new DatabaseSync(dbPath);
  }
  get open(): boolean { return this._db.isOpen; }
  prepare(sql: string) {
    const stmt = this._db.prepare(sql);
    return {
      run: (...p: any[]) => { const r = stmt.run(...p); return { changes: Number(r?.changes ?? 0), lastInsertRowid: r?.lastInsertRowid ?? 0 }; },
      get: (...p: any[]) => stmt.get(...p),
      all: (...p: any[]) => stmt.all(...p),
      iterate: (...p: any[]) => stmt.iterate(...p),
    };
  }
  exec(sql: string): void { this._db.exec(sql); }
  pragma(str: string, options?: { simple?: boolean }): any {
    const trimmed = str.trim();
    if (trimmed.includes('=')) { this._db.exec(`PRAGMA ${trimmed}`); return; }
    const row = this._db.prepare(`PRAGMA ${trimmed}`).get();
    if (options?.simple) return row && typeof row === 'object' ? Object.values(row)[0] : row;
    return row;
  }
  transaction<T>(fn: (...a: any[]) => T): (...a: any[]) => T {
    return (...a: any[]) => {
      this._db.exec('BEGIN');
      try { const r = fn(...a); this._db.exec('COMMIT'); return r; }
      catch (e) { this._db.exec('ROLLBACK'); throw e; }
    };
  }
  close(): void { if (this._db.isOpen) this._db.close(); }
}

export function createDatabase(dbPath: string): { db: NodeSqliteAdapter; backend: SqliteBackend } {
  return { db: new NodeSqliteAdapter(dbPath), backend: 'node-sqlite' };
}
```

**(4) 具体数值**：版本 band `>=22.5.0 <25.0.0`；vendored Node `24.x`；缺失即抛错（不静默降级）。

**(5) 有序步骤**：① 建 `src/codemap/db/sqlite-adapter.ts`，粘上面代码；② 在临时脚本里 `createDatabase(':memory:')` 跑通 `prepare/exec/pragma` 三件套。

**(6) 测试**：unit `adapter.spec.ts`——在 Node ≥22.5 上 `createDatabase(':memory:').db.pragma('journal_mode',{simple:true})` 返回非空；mock 掉 `require('node:sqlite')` 抛错时断言报错文案含 `>=22.5.0 <25.0.0`。

**(7) 证据回指**：`/tmp/tk-research/codegraph/src/db/sqlite-adapter.ts:50-128`（已逐行核对，形状一致）。

---

### C2 — 版本闸 = `>=22.5.0 <25.0.0`，低于则走 vendored Node 24 bundle　【(serves both surfaces)】

**(1) 决策**：`package.json` 的 `engines.node` 写 `">=22.5.0 <25.0.0"`（band 由 D/L 收口，**覆写** C2 原文的「无上限」）。Claude Code/Mac 依赖宿主 Node；VS Code Copilot/Windows 宿主 Node 可能 <22.5——发自包含 bundle（vendored Node 24，无 `.node` 文件），与 codegraph 的分发模式一致（research line 123）。解析进程强制 `--liftoff-only`（D10）；user-Node 22.5–23 路径加 `--disable-warning=ExperimentalWarning` re-exec（L7）。Node 25 被排除（WASM OOM，D 决议）。

**(2) 要动的文件**：`package.json`（改 `engines.node`）；vendored bundle 的打包由 L 拥有，C 只声明 band 与 `--liftoff-only` 约束。

**(3) 可抄代码**（tk-adapted，无现成 clone 源——属配置）：
```json
// package.json (片段)
{ "engines": { "node": ">=22.5.0 <25.0.0" } }
```
启动门卫（**已改写**，tk-adapted）：
```ts
// src/codemap/db/version-gate.ts
export function assertNodeBand(): void {
  const [maj, min] = process.versions.node.split('.').map(Number);
  const ok = (maj > 22 || (maj === 22 && min >= 5)) && maj < 25;
  if (!ok) throw new Error(
    `node:sqlite codegraph needs Node >=22.5.0 <25.0.0; got ${process.versions.node}. ` +
    `Use the vendored-Node bundle.`);
}
```

**(4) 具体数值**：下界 `22.5.0`；上界 `<25.0.0`；vendored `24.x`；bundle 体积约 50MB（C 自身一项 Open Decision，待 Windows 安装基测量后定是否总是 vendored）。

**(5) 有序步骤**：① 改 `engines.node`；② 加 `version-gate.ts` 并在 codegraph 入口首调；③ L 负责 vendored bundle（C 不实现，依赖 L 通道）。

**(6) 测试**：unit——`assertNodeBand()` 在伪造 `process.versions.node='25.0.0'` 时抛错；A/B harness field `node_version` 记录实测宿主版本。

**(7) 证据回指**：codegraph 分发模式 research line 123；band 由 DEP MAP conflict 决议（A+D+L）。

---

### C3 — 索引位置 = OUT-OF-TREE，复用 tk 现有 `~/.token-killer/projects/<fingerprint>/`　【(serves both surfaces)】

**(1) 决策**：DB 放 `~/.token-killer/projects/<project_fingerprint>/index.db`（POSIX）/ `%LOCALAPPDATA%\token-killer\...`（Windows，同一约定平台映射）——**不**进 repo。dir `0o700`、file `0o600`。`project_fingerprint` 直接复用 tk 已有的 `projectFingerprint(cwd)`（`repo:<sha256前12>`）。fingerprint 子目录自动隔离 Win-native vs WSL 共享同一 tree。`.tk/` 仅放 human wiki 产物（H/I）与 gitignore staging，**不放 DB**（DEP MAP C↔L 收口）。

**(2) 要动的文件**：
```
src/codemap/db/location.ts          新建 (indexDbPath + TK_INDEX_DIR override 校验)
```

**(3) 可抄代码**（源: tk `src/core/dataDir.ts:76-120` 的 `tokenKillerHome`/`projectFingerprint` 已核对存在；override 校验**源**: `/tmp/tk-research/codegraph/src/directory.ts:36-55`，**已改写**为 tk 风格）：
```ts
// src/codemap/db/location.ts
import path from 'node:path';
import { mkdirSync, chmodSync } from 'node:fs';
import { tokenKillerHome, projectFingerprint } from '../../core/dataDir.js';

// 源: codegraph directory.ts:36-55 — override 必须是 plain segment（已改写：env 名 TK_INDEX_DIR）
function validIndexSegment(raw: string | undefined): string | undefined {
  const v = raw?.trim();
  if (!v) return undefined;
  const invalid = v === '.' || v.includes('..') || v.includes('/') || v.includes('\\') || path.isAbsolute(v);
  if (invalid) { process.stderr.write(`[tk] Ignoring invalid TK_INDEX_DIR="${v}" (plain segment only)\n`); return undefined; }
  return v;
}

export function indexDbPath(cwd: string): string {
  const fp = projectFingerprint(cwd);                      // repo:<sha256[:12]>
  const seg = validIndexSegment(process.env.TK_INDEX_DIR) ?? 'index.db';
  const dir = path.join(tokenKillerHome(), 'projects', fp);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  chmodSync(dir, 0o700);
  return path.join(dir, seg);                              // ...projects/repo:abc123/index.db
}
```

**(4) 具体数值**：dir `0o700`，file `0o600`；fingerprint = `repo:` + sha256 前 12 hex；DB 三件套 `index.db` / `index.db-wal` / `index.db-shm` 全在该 fingerprint 目录下。

**(5) 有序步骤**：① 建 `location.ts`；② `connection.ts` 用 `indexDbPath(cwd)` 而非任何 in-repo 路径。

**(6) 测试**：unit——`indexDbPath('/some/repo')` 落在 `tokenKillerHome()/projects/repo:*/` 下；`TK_INDEX_DIR='../evil'` 被拒回退 `index.db`；断言目录 mode `0o700`。

**(7) 证据回指**：tk `src/core/dataDir.ts:76-120`（核对存在）；codegraph `src/directory.ts:36-55`（核对存在）。

---

### C4 — 连接 PRAGMA 固定顺序（busy_timeout 必须最先）　【(serves both surfaces)】

**(1) 决策**：固定顺序 `busy_timeout=5000` **最先**，再 `foreign_keys=ON`、`journal_mode=WAL`、`synchronous=NORMAL`、`cache_size=-64000`(64MB)、`temp_store=MEMORY`、`mmap_size=268435456`(256MB)。busy_timeout 必须先于 journal_mode，否则并发写会抛 `database is locked` 而非 WAIT（codegraph issue #238）。5s 够正常增量 sync；旧的 120s 看起来像 agent 卡死。`tk status` 暴露 effective `journal_mode`——WSL2 `/mnt` 与网络盘上 WAL 可能静默失效。

**(2) 要动的文件**：`src/codemap/db/connection.ts`（`configureConnection`）。

**(3) 可抄代码**（源: `/tmp/tk-research/codegraph/src/db/index.ts:30-38`，verbatim 核对一致）：
```ts
// src/codemap/db/connection.ts
function configureConnection(db: { pragma(s: string): any }): void {
  db.pragma('busy_timeout = 5000');      // MUST be first — 否则并发写抛 locked
  db.pragma('foreign_keys = ON');
  db.pragma('journal_mode = WAL');       // node:sqlite 在所有平台支持 WAL
  db.pragma('synchronous = NORMAL');     // WAL 下安全
  db.pragma('cache_size = -64000');      // 64 MB page cache
  db.pragma('temp_store = MEMORY');
  db.pragma('mmap_size = 268435456');    // 256 MB mmap I/O
}
export function effectiveJournalMode(db: { pragma(s: string, o?: any): any }): string {
  return String(db.pragma('journal_mode', { simple: true }) ?? 'unknown');
}
```

**(4) 具体数值**：`busy_timeout=5000`ms；`cache_size=-64000`(64MB)；`mmap_size=268435456`(256MB)；`synchronous=NORMAL`。

**(5) 有序步骤**：① 加 `configureConnection`；② `tk status` 调 `effectiveJournalMode` 并显示——若非 `wal` 给一行告警。

**(6) 测试**：unit——`:memory:` 上配完后 `journal_mode` 读到 `memory`/`wal`（按盘）；真实文件 DB 上断言 `wal`；mock 并发写验 5s WAIT 不抛 locked。

**(7) 证据回指**：`/tmp/tk-research/codegraph/src/db/index.ts:30-38`（核对一致，注释内含 #238）。

---

### C5 — nodes 表 = 单一 generic 表，kind discriminator 覆盖 code+doc+concept　【(serves both surfaces)】

**(1) 决策**：单一 `nodes` 表，`id TEXT PK` + `kind TEXT` 区分子类型。kind 枚举在 codegraph 21 种 code kind 之上**扩 `doc`/`concept`**，让 repodoc 的 `CodeNode/DocNode/ConceptNode` collapse 进一张表——一个 FTS 索引、一个查询面同时服务 codeguide（human surface）与 codemap（agent surface）。每个 node 带 `file_path/start_line/end_line/start_column/end_column`（A2 信任原语 file:line）。`version`+`content_hash` 承载 repodoc `DocNode.version` 的 staleness，不另开 doc 表。**加 `provenance TEXT`**（B 的字段级契约：`static|llm|template`，检索只过 static）。

**(2) 要动的文件**：`src/codemap/db/schema.sql`（nodes 段）。

**(3) 可抄代码**（源: `/tmp/tk-research/codegraph/src/db/schema.sql:20-42` 核对一致；**已改写**：补 `content_hash`/`version`/`provenance`，kind 注释扩 doc/concept）：
```sql
-- src/codemap/db/schema.sql  (源: codegraph schema.sql:20-42，已改写补 3 列)
CREATE TABLE IF NOT EXISTS nodes (
    id              TEXT PRIMARY KEY,
    kind            TEXT NOT NULL,          -- function|method|class|interface|struct|enum|...|file|doc|concept
    name            TEXT NOT NULL,
    qualified_name  TEXT NOT NULL,
    file_path       TEXT NOT NULL,
    language        TEXT NOT NULL,
    start_line      INTEGER NOT NULL,
    end_line        INTEGER NOT NULL,
    start_column    INTEGER NOT NULL,
    end_column      INTEGER NOT NULL,
    docstring       TEXT,
    signature       TEXT,
    visibility      TEXT,
    is_exported     INTEGER DEFAULT 0,
    is_async        INTEGER DEFAULT 0,
    is_static       INTEGER DEFAULT 0,
    is_abstract     INTEGER DEFAULT 0,
    decorators      TEXT,                   -- JSON array
    type_parameters TEXT,                   -- JSON array
    return_type     TEXT,
    -- 已改写补充：staleness + provenance（B 字段级契约）
    content_hash    TEXT,                   -- blake3/sha256 of node source span (C8 用 sha256)
    version         INTEGER NOT NULL DEFAULT 1,   -- 源: repodoc DocNode.version=1
    provenance      TEXT NOT NULL DEFAULT 'static', -- static|llm|template (B1)
    updated_at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_nodes_kind            ON nodes(kind);
CREATE INDEX IF NOT EXISTS idx_nodes_name            ON nodes(name);
CREATE INDEX IF NOT EXISTS idx_nodes_qualified_name  ON nodes(qualified_name);
CREATE INDEX IF NOT EXISTS idx_nodes_file_path       ON nodes(file_path);
CREATE INDEX IF NOT EXISTS idx_nodes_file_line       ON nodes(file_path, start_line);
CREATE INDEX IF NOT EXISTS idx_nodes_lower_name      ON nodes(lower(name));
CREATE INDEX IF NOT EXISTS idx_nodes_provenance      ON nodes(provenance);  -- B: WHERE provenance='static'
```
repodoc 异构节点字段来源（源: `/tmp/tk-research/repodoc/repodoc/src/graph/models.py:35-51`，核对一致）：
```python
# DocNode.version / ConceptNode.confidence 是我们 kind 扩展的依据
class DocNode(BaseModel):
    content: str
    format: str        # "markdown" | "mermaid"
    version: int = 1   # <-- 我们采为 nodes.version
class ConceptNode(BaseModel):
    confidence: float = 1.0  # 0.0..1.0  -> 落进 nodes 的 metadata/edge.metadata
```

**(4) 具体数值**：`version DEFAULT 1`；`provenance DEFAULT 'static'`；kind 枚举 ≥23 值（21 code + `doc` + `concept`）；`ConceptNode.confidence` 范围 `0.0–1.0`。

**(5) 有序步骤**：① 写 nodes DDL；② 加 doc/concept 行的写入路径（D 填表时按 kind 分流）；③ 检索层 `WHERE provenance='static'`（B1）。

**(6) 测试**：unit fixture——插 1 个 `kind='function'`+1 个 `kind='doc'`(version=2)+1 个 `kind='concept'`，`SELECT * WHERE provenance='static'` 三行都在；断言每行 `start_line/end_line` 非空（A2 file:line 不变式）。

**(7) 证据回指**：`schema.sql:20-42`、`repodoc/src/graph/models.py:35-51`（均核对一致）。

---

### C6 — edges 表 = 单一 generic 表，kind 覆盖 code 与 doc/concept 关系　【(serves both surfaces)】

**(1) 决策**：单一 `edges` 表，`kind TEXT` 一列让新关系是「值」而非 DDL 变更。`provenance` 区分 resolver-derived vs literal edge（J 的 edge 诚实性）。`ON DELETE CASCADE` 在 node 重建时自动清边。repodoc 的 `describes`/`semantic_impact` 同表承载 doc↔code 链。

**(2) 要动的文件**：`src/codemap/db/schema.sql`（edges 段）。

**(3) 可抄代码**（源: `/tmp/tk-research/codegraph/src/db/schema.sql:45-56`，verbatim 核对一致）：
```sql
-- src/codemap/db/schema.sql  (源: codegraph schema.sql:45-56，verbatim)
CREATE TABLE IF NOT EXISTS edges (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    source      TEXT NOT NULL,
    target      TEXT NOT NULL,
    kind        TEXT NOT NULL,   -- calls|imports|extends|implements|contains|defines|accesses|overrides|describes|semantic_impact
    metadata    TEXT,            -- JSON: confidence/weight 等
    line        INTEGER,
    col         INTEGER,
    provenance  TEXT DEFAULT NULL,  -- resolver-derived vs literal (J)
    FOREIGN KEY (source) REFERENCES nodes(id) ON DELETE CASCADE,
    FOREIGN KEY (target) REFERENCES nodes(id) ON DELETE CASCADE
);
-- 复合索引覆盖 source-only/target-only 左前缀扫描（codegraph 设计：窄索引是写放大死重）
CREATE INDEX IF NOT EXISTS idx_edges_source_kind ON edges(source, kind);
CREATE INDEX IF NOT EXISTS idx_edges_target_kind ON edges(target, kind);
CREATE INDEX IF NOT EXISTS idx_edges_kind        ON edges(kind);
```

**(4) 具体数值**：edge kind ≥10 值；`provenance DEFAULT NULL`（NULL=未标注，检索/信任层按需过滤）。

**(5) 有序步骤**：① 写 edges DDL；② 写入时填 `provenance`（D 解析器对 resolver 推断的 calls 标 `resolved`，literal import 标 `literal`）。

**(6) 测试**：unit——插 source/target 两 node + 一条 `kind='calls'` edge，删 source node 后 `SELECT COUNT(*) FROM edges`=0（CASCADE 生效）；插一条 `describes` edge 验 doc↔code 同表。

**(7) 证据回指**：`/tmp/tk-research/codegraph/src/db/schema.sql:45-56`（verbatim 核对）。

---

### C7 — FTS5 = 单一 external-content 虚表 + 3 触发器 + bm25 加权 + 查询转义　【(serves both surfaces)】

**(1) 决策**：一个 external-content FTS5 虚表 `nodes_fts(content='nodes', content_rowid='rowid')`，索引 `name,qualified_name,docstring,signature`（doc 内容经 doc-kind 行进入）。`tokenize='porter unicode61'`——porter 给 human 自然语言 doc 搜索，重 name 权重给 agent 精确符号搜索。3 触发器（ai/ad/au）保持同步。查询 `bm25(nodes_fts, 0, 20, 5, 1, 2)`（id=0,name=20,qualified_name=5,docstring=1,signature=2）。转义：`::`→空格，再 strip `['"*():^]` 与 `AND/OR/NOT/NEAR`。**FTS5 缺失保护（C↔L 收口新增）**：vendored-Node bundle 的 SQLite 已知带 FTS5；仅 npm-shim-on-user-Node 路径需 LIKE-scan 兜底——`CREATE VIRTUAL TABLE` 失败时 catch 并标记 `ftsAvailable=false`，检索降级为 `WHERE name LIKE ?`。

**(2) 要动的文件**：`src/codemap/db/schema.sql`（FTS 段+触发器）；`src/codemap/db/queries.ts`（转义+bm25+LIKE 兜底）。

**(3) 可抄代码**（DDL+触发器 源: `/tmp/tk-research/codegraph/src/db/schema.sql:98-124` verbatim；tokenizer 源: `/tmp/tk-research/code-graph-mcp/src/storage/schema.rs:63-67` 核对 `porter unicode61`，**已改写**合并 tokenizer）：
```sql
-- src/codemap/db/schema.sql (源: codegraph schema.sql:98-124；已改写加 tokenize)
CREATE VIRTUAL TABLE IF NOT EXISTS nodes_fts USING fts5(
    id, name, qualified_name, docstring, signature,
    content='nodes', content_rowid='rowid',
    tokenize='porter unicode61'        -- 源: code-graph-mcp schema.rs:67
);
CREATE TRIGGER IF NOT EXISTS nodes_ai AFTER INSERT ON nodes BEGIN
  INSERT INTO nodes_fts(rowid,id,name,qualified_name,docstring,signature)
  VALUES (NEW.rowid,NEW.id,NEW.name,NEW.qualified_name,NEW.docstring,NEW.signature);
END;
CREATE TRIGGER IF NOT EXISTS nodes_ad AFTER DELETE ON nodes BEGIN
  INSERT INTO nodes_fts(nodes_fts,rowid,id,name,qualified_name,docstring,signature)
  VALUES ('delete',OLD.rowid,OLD.id,OLD.name,OLD.qualified_name,OLD.docstring,OLD.signature);
END;
CREATE TRIGGER IF NOT EXISTS nodes_au AFTER UPDATE ON nodes BEGIN
  INSERT INTO nodes_fts(nodes_fts,rowid,id,name,qualified_name,docstring,signature)
  VALUES ('delete',OLD.rowid,OLD.id,OLD.name,OLD.qualified_name,OLD.docstring,OLD.signature);
  INSERT INTO nodes_fts(rowid,id,name,qualified_name,docstring,signature)
  VALUES (NEW.rowid,NEW.id,NEW.name,NEW.qualified_name,NEW.docstring,NEW.signature);
END;
```
查询转义 + bm25（源: `/tmp/tk-research/codegraph/src/db/queries.ts:999-1022` verbatim 核对）：
```ts
// src/codemap/db/queries.ts  (源: codegraph queries.ts:999-1022)
const ftsQuery = query
  .replace(/::/g, ' ')                  // Rust/C++/Ruby 限定符分隔（#173）
  .replace(/['"*():^]/g, '')            // 去 FTS5 特殊字符
  .split(/\s+/)
  .filter(t => t.length > 0)
  .filter(t => !/^(AND|OR|NOT|NEAR)$/i.test(t))  // 去布尔算子防注入
  .map(t => `"${t}"*`)                  // 每词前缀匹配
  .join(' OR ');
const ftsLimit = Math.max(limit * 5, 100);   // 取 5x 供 post-hoc rescore
const sql = `
  SELECT nodes.*, bm25(nodes_fts, 0, 20, 5, 1, 2) AS score
  FROM nodes_fts JOIN nodes ON nodes_fts.id = nodes.id
  WHERE nodes_fts MATCH ? AND nodes.provenance = 'static'   -- 已改写：B1 只过 static
  ORDER BY score LIMIT ?`;
```
FTS 缺失兜底（**已改写**，tk-adapted，无现成 clone 源——需实现时补完整探测）：
```ts
// 需实现时补：初始化时 try CREATE VIRTUAL TABLE，失败 → ftsAvailable=false
// 检索层：ftsAvailable ? 上面 bm25 SQL : `SELECT * FROM nodes WHERE name LIKE ? AND provenance='static' LIMIT ?`
```

**(4) 具体数值**：bm25 权重 `id=0,name=20,qualified_name=5,docstring=1,signature=2`；`ftsLimit=max(limit*5,100)`；tokenizer `porter unicode61`。

**(5) 有序步骤**：① 建 FTS 虚表+3 触发器；② 写转义+bm25 查询；③ 加 `ftsAvailable` 探测 + LIKE 兜底。

**(6) 测试**：unit fixture——插 `name='AuthService'`，搜 `auth` 命中（前缀+porter）；搜 `stage_apply::run` 不塌成 `stage_applyrun`（#173）；插 `provenance='llm'` 行验其**不**进 bm25 结果（B1）；mock CREATE VIRTUAL TABLE 抛错验 LIKE 兜底返回行。

**(7) 证据回指**：`schema.sql:98-124`、`queries.ts:999-1022`、`code-graph-mcp/src/storage/schema.rs:63-67`（均核对一致）。

---

### C8 — 辅助表 files / unresolved_refs / project_metadata / schema_versions / meta　【(serves both surfaces)】

**(1) 决策**：`files(path PK,content_hash,language,size,modified_at,indexed_at,node_count,errors JSON)` = 增量 staleness 闸；`unresolved_refs(...)` 让 call-resolution 步骤（在 nodes 建好之后跑）延迟解析跨文件 callee；`project_metadata(key PK,value,updated_at)`；`schema_versions(version PK,...)`；`meta(key PK,value)` 现在就保留，让未来 sqlite-vec embedding swap 可检测而无破坏性迁移（code-graph-mcp `META_KEY_EMBEDDING_DIM/_MODEL`）。`content_hash` 用 **sha256**（`node:crypto` 零依赖；Open Decision：除非大仓实测 blake3 吞吐显著胜，否则不 vendoring blake3）。

**(2) 要动的文件**：`src/codemap/db/schema.sql`（辅助表段）。

**(3) 可抄代码**（files/unresolved_refs 源: `/tmp/tk-research/codegraph/src/db/schema.sql:59-82` verbatim 核对；meta 源: `/tmp/tk-research/code-graph-mcp/src/storage/schema.rs:90` + `META_KEY_EMBEDDING_DIM` 行 4-5 核对）：
```sql
-- src/codemap/db/schema.sql (源: codegraph schema.sql:59-82，verbatim)
CREATE TABLE IF NOT EXISTS files (
    path          TEXT PRIMARY KEY,
    content_hash  TEXT NOT NULL,
    language      TEXT NOT NULL,
    size          INTEGER NOT NULL,
    modified_at   INTEGER NOT NULL,
    indexed_at    INTEGER NOT NULL,
    node_count    INTEGER DEFAULT 0,
    errors        TEXT            -- JSON array
);
CREATE TABLE IF NOT EXISTS unresolved_refs (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    from_node_id   TEXT NOT NULL,
    reference_name TEXT NOT NULL,
    reference_kind TEXT NOT NULL,
    line           INTEGER NOT NULL,
    col            INTEGER NOT NULL,
    candidates     TEXT,          -- JSON array
    file_path      TEXT NOT NULL DEFAULT '',
    language       TEXT NOT NULL DEFAULT 'unknown',
    FOREIGN KEY (from_node_id) REFERENCES nodes(id) ON DELETE CASCADE
);
-- 已改写新增：tk 自有 project_metadata + 预留 meta（源: code-graph-mcp schema.rs:90 meta 表形状）
CREATE TABLE IF NOT EXISTS project_metadata (
    key TEXT PRIMARY KEY, value TEXT, updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS schema_versions (
    version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL, description TEXT
);
CREATE TABLE IF NOT EXISTS meta (   -- v2 sqlite-vec 预留（META_KEY_EMBEDDING_DIM/_MODEL）
    key TEXT PRIMARY KEY, value TEXT NOT NULL
);
```
content_hash 计算（**已改写**，tk-adapted，node:crypto 零依赖）：
```ts
// src/codemap/db/hash.ts
import { createHash } from 'node:crypto';
export const contentHash = (bytes: Buffer | string) =>
  createHash('sha256').update(bytes).digest('hex');
// reindex iff hash 变 OR (mtime+size) 变
```

**(4) 具体数值**：`content_hash` = sha256 hex（64 字符）；reindex 触发条件 = `hash 变` 或 `mtime+size 变`（双闸，二者任一）。

**(5) 有序步骤**：① 写 4 张辅助表 DDL；② 加 `hash.ts`；③ 增量 sync 用 `files.content_hash` + `files.modified_at` 做闸（E 消费）。

**(6) 测试**：unit——写一行 `files`，同 hash 同 mtime 时 `needsReindex()=false`，改 size 后 `=true`；`meta` 写 `embedding_dim` 读回；A/B harness field `reindex_skipped_count`。

**(7) 证据回指**：`codegraph/src/db/schema.sql:59-82`、`code-graph-mcp/src/storage/schema.rs:4-5,90`（均核对一致）。

---

### C9 — 迁移 = 单调 schema_versions，additive ALTER-only，开库时事务内跑　【(serves both surfaces)】

**(1) 决策**：`schema_versions` 表记录版本；`CURRENT_SCHEMA_VERSION` 常量；additive ALTER-only 迁移在开库时事务内逐条跑；fresh init 直接 stamp 当前版本，让迁移不重放。每条迁移 `{version,description,up}` 跑在 `db.transaction()`；init 用 `INSERT OR IGNORE` 记 CURRENT，fresh db 跳过 replay。

**(2) 要动的文件**：`src/codemap/db/migrations.ts`；`src/codemap/db/connection.ts`（`initialize`/`open` 调 `runMigrations`）。

**(3) 可抄代码**（`runMigrations` 源: `/tmp/tk-research/codegraph/src/db/migrations.ts:107-124` verbatim；init stamp 源: `/tmp/tk-research/codegraph/src/db/index.ts:50-56` 核对）：
```ts
// src/codemap/db/migrations.ts  (源: codegraph migrations.ts:107-124)
export const CURRENT_SCHEMA_VERSION = 1;
interface Migration { version: number; description: string; up(db: any): void; }
const migrations: Migration[] = [
  // 示例：v2 = additive ALTER（ALTER TABLE ... ADD COLUMN only）
  // { version: 2, description: 'add nodes.embedding slot', up: db => db.exec('ALTER TABLE nodes ADD COLUMN embedding BLOB') },
];
function recordMigration(db: any, version: number, description: string): void {
  db.prepare('INSERT INTO schema_versions (version, applied_at, description) VALUES (?, ?, ?)')
    .run(version, Date.now(), description);
}
export function runMigrations(db: any, fromVersion: number): void {
  const pending = migrations.filter(m => m.version > fromVersion);
  if (pending.length === 0) return;
  pending.sort((a, b) => a.version - b.version);
  for (const m of pending) {
    db.transaction(() => { m.up(db); recordMigration(db, m.version, m.description); })();
  }
}
```
init 时 stamp（源: `/tmp/tk-research/codegraph/src/db/index.ts:50-56` 核对一致）：
```ts
// connection.ts initialize() 末尾
const cur = getCurrentVersion(db);
if (cur < CURRENT_SCHEMA_VERSION) {
  db.prepare('INSERT OR IGNORE INTO schema_versions (version, applied_at, description) VALUES (?, ?, ?)')
    .run(CURRENT_SCHEMA_VERSION, Date.now(), 'Initial schema includes all migrations');
}
```

**(4) 具体数值**：`CURRENT_SCHEMA_VERSION=1`；迁移仅 `ALTER TABLE ... ADD COLUMN`（additive-only，保旧索引可读）。

**(5) 有序步骤**：① 加 `migrations.ts`；② `open()` 调 `runMigrations(db, getCurrentVersion(db))`；③ `initialize()` 末尾 stamp。

**(6) 测试**：unit——fresh init 后 `getCurrentVersion()=1` 且迁移数组为空时 `runMigrations` no-op；伪造一个新增 schema 版本的 ALTER，旧库开启后该列存在且 `schema_versions` 多一行；重开第二次不再跑（幂等）。

**(7) 证据回指**：`codegraph/src/db/migrations.ts:107-124`、`index.ts:50-56`（核对一致）。

---

### C10 — bulk 后维护 = PRAGMA optimize + wal_checkpoint(PASSIVE) best-effort　【(serves both surfaces)】

**(1) 决策**：每次 `indexAll`/`sync` 后跑 `PRAGMA optimize` + `PRAGMA wal_checkpoint(PASSIVE)`，二者 best-effort（吞错）。完整 `VACUUM`+`ANALYZE` 仅在显式 `tk optimize`。WAL 大索引跑会涨过 1000 页默认阈值；PASSIVE checkpoint 折回主库且不阻塞读者；`PRAGMA optimize` 只 re-ANALYZE 变过的表给 planner 新统计。

**(2) 要动的文件**：`src/codemap/db/connection.ts`（`runMaintenance`）。

**(3) 可抄代码**（源: `/tmp/tk-research/codegraph/src/db/index.ts:207-218` verbatim 核对一致）：
```ts
// src/codemap/db/connection.ts  (源: codegraph index.ts:207-218)
runMaintenance(): void {
  try { this.db.exec('PRAGMA optimize'); } catch { /* ignore */ }
  try { this.db.exec('PRAGMA wal_checkpoint(PASSIVE)'); } catch { /* ignore — 非 WAL 模式 */ }
}
```

**(4) 具体数值**：WAL 自动 checkpoint 阈值 1000 页（PASSIVE 主动折回）；`VACUUM`+`ANALYZE` 仅 `tk optimize` 手动触发。

**(5) 有序步骤**：① 加 `runMaintenance`；② indexAll/sync 收尾调用；③ `tk optimize` 子命令跑 VACUUM+ANALYZE。

**(6) 测试**：unit——大批量插入后 `runMaintenance()` 不抛；非 WAL（`:memory:`）上 checkpoint 失败被吞、流程继续。

**(7) 证据回指**：`/tmp/tk-research/codegraph/src/db/index.ts:207-218`（verbatim 核对）。

---

### C11 — Windows 文件锁与清理：WAL 读不阻写 + EBUSY 重试 rm + 拒索引 $HOME/根　【(serves both surfaces)】

**(1) 决策**：WAL 下读者永不阻塞写者；跨进程写 wait out `busy_timeout`。索引目录清理/重建用 `rm(dir,{recursive,force,maxRetries:5,retryDelay:100})` 扛 EBUSY（tk 自身 Windows 历史：子进程退出后仍持 handle）。**绝不**索引 `$HOME` 或文件系统根（codegraph #845 把 FD 打爆）。`.db`+`.db-wal`+`.db-shm` 全在 fingerprint 目录下。

**(2) 要动的文件**：`src/codemap/db/cleanup.ts`（rm 包装 + 根/HOME 守卫）。

**(3) 可抄代码**（**已改写**，tk-adapted——源自 tk MEMORY「Windows EBUSY: spawn-test temp cleanup needs retries」既定 pattern，无单一 clone 行号）：
```ts
// src/codemap/db/cleanup.ts
import { rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

export async function removeIndexDir(dir: string): Promise<void> {
  // tk Windows 历史：child 退出后仍持 .db-wal/.db-shm handle → 裸 force-rm 偶发 EBUSY
  await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}

// 拒索引 $HOME / 文件系统根（codegraph #845）
export function refuseDangerousRoot(target: string): void {
  const resolved = path.resolve(target);
  const home = os.homedir();
  const fsRoot = path.parse(resolved).root;
  if (resolved === home || resolved === fsRoot) {
    throw new Error(`token-killer refuses to index "${resolved}" (home or filesystem root).`);
  }
}
```

**(4) 具体数值**：`rm` `maxRetries:5`、`retryDelay:100`ms；拒索引集合 = {`os.homedir()`, 文件系统根}。

**(5) 有序步骤**：① 加 `removeIndexDir`/`refuseDangerousRoot`；② 索引入口先调 `refuseDangerousRoot(targetRepo)`；③ reindex/cleanup 走 `removeIndexDir`。

**(6) 测试**：unit——`refuseDangerousRoot(os.homedir())` 抛错、普通 repo 路径不抛；Windows CI job 上对含 open WAL 的临时 DB 目录调 `removeIndexDir` 成功（断言 5 次重试容忍 EBUSY，复用 tk PR#37 windows-22 经验）。

**(7) 证据回指**：tk MEMORY `windows-ebusy-spawn-test-cleanup.md`、`fixes-prioritize-distributed-field.md`；codegraph #845（disccussion 引）。

---

### 决策汇总 / 被推翻的 prior leans

- **覆写 ADR-0014**（node:sqlite「CONTINGENT on install-base check」）→ 升级为 COMMITTED：node:sqlite 是唯一同时满足全部硬锚的引擎（零原生编译对 Windows-primary 是强制；gitnexus 的 `LadybugDB native binary (lbugjs.node) is missing`，源: `/tmp/tk-research/gitnexus/gitnexus/src/core/lbug/native-check.ts:34,39` 核对，证明替代方案在 Windows 上直接挂）。install-base 风险由 C2 vendored-Node-24 bundle 中和。
- **覆写 ADR-0015**（graph-DB / WASM 替代仍开）→ 判给 node:sqlite：gitnexus 的 WASM 路径只浏览器可用，其 CLI/MCP 路径（我们的真实目标面）仍要原生 `lbugjs.node`，并带 PolyForm-NC 许可。Cypher graph-DB 作为默认被拒。
- **覆写 prior「per-type tables for richness」**→ 用 generic 单 `nodes(kind)`/`edges(kind)`，让 code+doc+concept（需求 A）共享一个 FTS 索引、加 kind 是值而非 DDL 迁移。Ladybug 的 31 张 per-type 表作为 Outside-current-product-scope 的 view 保留。
- **确认并固化 prior「index out-of-tree」**→ 永久 + 具体化为 `~/.token-killer/projects/<fingerprint>/index.db`，复用 tk 既有 0700/0600 存储，非过渡态、非 in-repo。
- **D18 / [ADR 0030](../../adr/0030-physical-schema-claims-serving-tiers.md) 扩展**：上面的 generic `nodes(kind)`/`edges(kind)` 是**物化 serving 层**（ranking/behavior/projection 只读它，借 Kythe serving table + codegraph 热路径）。其上游加 **raw 层 `fact_claims`**（append-only，借 Kythe `Entry`/Wikibase Statement）+ **tk 独有 `arbitration_decisions`/`decision_claims`** 仲裁账本 + `identity_bindings` + `dependency_index`（claim→decision→edge 反向索引）+ generations。即"generic 单表"只管 serving 层，claim/arbitration 分离层叠在其上（ADR 0019 要求，非单 provenance tag）。

### Open Decisions（C 自身）

1. **embeddings** ✅ **闭合（D30 #8）**：**Unsupported**（确认 Outside current product scope）。`meta(key,value)` + nullable 列槽预留保留（无破坏性迁移），开启需 no-egress/no-API-key embedding 源、且属范围外——开启前再定（设计上已定 out）。
2. **bundled-Node 分发粒度** ⏳ **measurement-gated（非设计开放）**：VS Code Copilot/Windows 能否依赖用户 Node（≥22.5）vs 必须总 vendored Node 24（~50MB）——需先测真实 Windows 安装基 Node 版本（接 §17 #5 declare-only 闸 + D30 L：pin 一个 24.x LTS）。
3. **content_hash 算法** ✅ **闭合（D30 #5 / E4）**：**sha256**（零依赖 `node:crypto`），不 vendoring blake3。
4. **跨需求版本闸确认**：`>=22.5.0 <25.0.0` + vendored Node 24.x 作为单一锚（A/C/D/L 原各自独立 open，现已收口），请确认接受。

---

