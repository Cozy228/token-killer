# Codegraph 实施 ACTION 计划 (2026-06-20)

## 如何使用本报告(How to use this report)

> **本报告有"分层权威性",务必按此顺序读、按此优先级取信:**
>
> 1. **`## 用户已拍板决策(2026-06-20)`(最高优先级)** —— 9 项 + M25 license 已定稿。**正文 A–M 与附录若与此节冲突,一律以此节为准。**
> 2. **`## 决策总表`** —— 13 需求一句话决策速览。
> 3. **`## 跨需求实施路线`** —— 有序、依赖感知的落地步骤(测量针提前)。
> 4. **`# 源指南索引` + `# 官方文档复核清单`** —— 读哪个 clone/文件、借鉴/避免什么、动手前先核哪些官方文档。
> 5. **`# 各需求 ACTION 明细(A–M)`** —— 逐需求 copyable 代码(决策 + 文件 + 代码 + 数值 + 步骤 + 测试)。
> 6. **`# 附录 A1`**(PageRank/SCIP/gitnexus 可抄实现)、**`# 附录 A2`**(gitnexus 全量可抄清单)—— 范围扩张项与 gitnexus 挖矿的真实代码。
>
> ### 正文尚未回写、实施前必须以顶部为准的已知冲突点
> 正文 A–M 为 2026-06-20 综合初稿,以下几处仍是**旧推荐**,已被顶部拍板推翻 —— 实施时以顶部 + 本清单为准:
>
> | 位置 | 正文旧写法 | 现行(以此为准) |
> |---|---|---|
> | **L 分发** | 双通道(薄 shim + vendored bundle 为主) | **declare-only `>=22.5` + C7 兜底**,vendored 仅可选(决策 #1) |
> | **A/G 排序** | 无 PageRank / PageRank OUT | **PageRank v1 默认 ON**,实现见附录 A1(决策 #8) |
> | **D 语言** | 仅 tree-sitter、SCIP OUT | **SCIP opt-in 进 v1**(探测到 indexer 才用,否则回退),实现见附录 A1 |
> | **M18 / M25** | "defer SCIP/PageRank";license 硬边界 0 行 | 不再 defer;license **自用放宽** + `[非分发安全]` 书签(M25 已更新) |
> | **L 代码签名** | (若提)Authenticode/notarize v1 必需 | **v1 不签,用 npm provenance**;仅分发 vendored bundle 时才签(决策 #9) |
>
> 凡冲突,**顶部拍板 > 正文**。正文保留是为证据与推导链完整,不是最终口径。

## 范围说明

本文是一份"可直接开建"的实施计划：把 13 个需求 A–M 的已承诺决策（committed）落成有序、可独立发布、可测试的工程路线图。脊柱是 **一个底座、两份食谱、两个前端（ONE BACKEND, TWO DIETS, TWO FRONT-ENDS）**：一个结构化代码图谱底座（tree-sitter → node:sqlite + FTS5 类型化属性图，每个节点带 file:line span），由两份渲染食谱消费——Agent 食谱（混合检索，服务 B＝找代码/省 token）与 Human 食谱（ASCII/HTML 树 + 协作 wiki，服务 A＝理解项目 + 协作）；两个前端分别是 VS Code 扩展（主目标 Windows）与 `tk` CLI（次目标 macOS/终端宿主）。A 与 B 全程同等重要，每个 serves='both' 的需求在 v1 同时交付其人类侧与 Agent 侧，人类/协作绝不延后到 v2。

## 固定锚点（不可推翻）

1. **目标平台**：主＝VS Code Copilot on Windows；次＝Claude Code on macOS。
2. **目标**：项目本地智能工具，两件同等重要的工作——(A) 帮人理解项目 + **协作**；(B) 帮 Agent 高效找代码/文件＝token 优化。A、B 共重，人类/协作不是 v2 补丁。

## 强倾向（推翻需"明显更优 + 量化证据"）

- **存储 = node:sqlite (+ FTS5)**。better-sqlite3 因失维被排除为默认；只有在查询力/可移植性/体积三者全胜且零原生编译时才可换底座。
- **LLM = "Understand-Anything 式"**：借宿主已有 LLM（slash-command / 重新提示）或本地订阅 CLI（CodeWiki caw 走 claude/codex OAuth）。**绝不内置 API key，无模型出网，无 API token 花费**；任何需要 LLM 的能力都设计成"喂给宿主 Agent 去生成 / 让用户订阅买单"，不嵌入模型。

## 跨需求已闭合的版本锚点

- **Node 闸门 = `engines.node ">=22.5.0 <25.0.0"`，vendored Node 锁定 24.x LTS 线**：A 承诺 tree-sitter WASM 作为提取器（D1），由此确定 WASM 已随包发布 → 排除 Node 25（WASM OOM），解析进程强制 `--liftoff-only`（D10），用户 Node 22.5–23 路径走 `--disable-warning` 自重入（L7）。这把 A/C/D/L 各自悬而未决的版本问题合并为一个锚点。
- **索引库出树（out-of-tree）**：图谱 DB 落在用户态 `~/.token-killer/projects/<fingerprint>/index.db`（POSIX）/ `%LOCALAPPDATA%\token-killer\...`（Windows），复用 tk 现有 0700/0600 store；repo 内 `.tk/` 只放人类共享产物（wiki.json、wiki/pages/**、ONBOARDING.md）和机器本地且 gitignore 的暂存（proposed/**、cache/**）。
- **唯一交付载体**：VS Code 扩展同时承载 F 的 Agent 工具（LM Tool API + 编程式 MCP）、H 的 HTML 查看器、I 的协作回写；CLI 是跨宿主后端（`tk mcp` + `tk wiki`）。

详细的逐需求章节（A–M）随后给出；本前置部分只锚定全局不变量与版本/路径/载体约定。

## 用户已拍板决策（2026-06-20 交互确认 — 优先级高于文末"仍待用户拍"与下文各需求原推荐）

下列 9 项原列在文末"仍待用户拍"，现已由用户逐项确认。**其中第 1、8 项推翻了本文原推荐，以本节为准。**

| # | 项（需求） | 已拍决定（committed） | 与原文推荐 |
|---|---|---|---|
| 1 | Node 运行时（L/C/D） | **declare-only**：tk `engines >= 22.5.0`，不强制自带 Node；极少数无 FTS5 的 build 走 C7 的 LIKE 扫描兜底；vendored-Node bundle 仅作可选逃生口。上限 `< 25` 重新定性为"未测保守"而非已证实的 WASM OOM（原 OOM 断言未经核实）。**实测依据**：官方 Node 22.22.2 上 `node:sqlite`（免 flag，仅 ExperimentalWarning）+ FTS5 create/insert/MATCH 全通，内置 SQLite 3.51.2。 | **推翻**：原倾向双通道/vendored 为主 → declare-only 为主 |
| 2 | 协作编辑器（I） | VS Code 原生文件编辑 + file-watcher 自动回写；HTML 查看器保持只读（不建 Tiptap web 编辑器）。 | 同 |
| 3 | 控制文件（I） | JSONC（tk 已解析、VS Code schema 补全）。 | 同 |
| 4 | Daemon（E/M18） | v1 **永不 daemon**，惰性 on-read 刷新；watcher 仅 opt-in、WSL2 硬禁。 | 同 |
| 5 | 输出单位（G/K） | 先用 **char 分级**（13000/18000/24000），待 K 在 Claude Code 测出 VS Code Copilot 真实内联帽后再换算 token。 | 同 |
| 6 | 证明（K） | **codegraph 的 `scripts/agent-eval/` A/B 跑器 + `__tests__/evaluation/test-cases.ts` 为主证据**（7 真实仓 with/without、uncached token A/B 中位数）；**SWE-bench 作外部交叉验证**（借 repograph 已接好的 SWE-agent/agentless，自动评分 FAIL_TO_PASS/PASS_TO_PASS）。 | 更具体（指到 clone 真实文件） |
| 7 | Agent 交付面（F） | **两个都做**：VS Code 扩展（LM Tool API）为主吃 VS Code/Windows + 已开 MCP 的组织；手写零依赖 stdio JSON-RPC MCP 吃 Claude Code/Mac。 | 同（一后端两前端） |
| 8 | 高级特性（A/D/M） | **embedding 仍 OUT**；**PageRank + SCIP 均进 v1**。PageRank 默认开（纯计算、零出网、为人/agent 的概览与 repo-map 排序）。SCIP 设为 **opt-in 增强**（检测到 `scip-*` indexer 才消费其编译级调用图，否则回退 tree-sitter 启发式 —— 不强制装 indexer，保住 Windows 零安装主目标）。 | **推翻**：原推荐三者全 OUT → PageRank+SCIP 进（SCIP 限 opt-in） |
| 9 | 代码签名（L） | v1 **不做 OS 代码签名**（declare-only 下分发是纯 JS npm 包、无 .exe，不触发 SmartScreen）；用免费 **npm provenance**（`npm publish --provenance`，Sigstore 来源证明）。仅在将来发布可选 vendored bundle 时才为那个二进制引入 Authenticode/notarize。 | 由第 1 项联动确定（原文列为开放） |

**因第 8 项需后续补全 copyable 代码的需求**（本节方向已拍，但下文对应章节仍按原"全 OUT"推荐书写 —— 实施时以本节为准，相应章节待补）：
- **A 核心方法**：补 PageRank 排序落地（结构图 + centrality 排序；参考 aider `repomap.py` 的 personalized PageRank）。
- **D 语言覆盖**：补 SCIP opt-in 路线（探测 `scip-typescript`/`scip-python` 等是否在 PATH → 有则消费 SCIP 索引提升调用图精度，无则回退 tree-sitter）。
- **M 横切**：M18 "拒 embeddings/RL、defer SCIP/PageRank" → SCIP/PageRank 不再 defer，改记 v1 in-scope（SCIP opt-in）。

**另：M25 license 边界也已推翻（用户确认本工具自用、不分发）** —— license 拷贝边界放宽，gitnexus/codewiki/repodoc 等任何源均可直接抄用；仅给非 permissive 源（gitnexus PolyForm-NC、codewiki/repodoc 无 license）的逐字片段加 `[非分发安全]` 书签，供将来若转为公开发布时一键重写。详见下文 M25。

## 决策总表

| 需求 | 一句话决策（committed） | 服务 |
|---|---|---|
| **A** 核心方法 | 单一结构化代码图谱底座（tree-sitter → node:sqlite+FTS5 类型图，节点带 file:line），喂两份食谱：Agent buildContext 混合检索 + Human ASCII/HTML 树；无 embeddings、v1 无 PageRank、LSP 非核心，打包只作检索内的压缩函数 | 两者 |
| **B** 智能来源 | 混合：确定性静态核（权威、永远在线、独占找代码路径）+ 宿主借用/订阅 CLI 生成层（opt-in、宿主付费、仅叙事）+ 纯 Node 兜底；边界落在**字段级 provenance 列**，检索只过滤 static，LLM 字段永不改检索结果；不发 key 不花 token | 两者 |
| **C** 索引与存储 | node:sqlite(DatabaseSync) + FTS5 外部内容虚表，每项目一 .db，出树存放；通用 nodes(kind)/edges(kind) 异构表 + provenance/版本/内容哈希列；WAL+busy_timeout+monotonic 迁移；v1 无 embeddings 表，预留 meta 表 + nullable 槽位 | 两者 |
| **D** 语言覆盖 | web-tree-sitter(WASM) + tree-sitter-wasms 预编译，无原生绑定；每语言 typed config 对象 + 单一核心 walker；22 语言注册分三档（tier-1 11 种 CI 把关）；单一可回收 worker + 生命周期常数逐字采用；Node 闸 `>=22.5.0 <25.0.0` + `--liftoff-only` | 两者 |
| **E** 新鲜度/增量 | 三层惰性优先模型，默认无常驻 daemon：lazy-on-read mtime 检查触发、可选 git hook 精确刷新、watcher 仅 opt-in（WSL2 硬禁）；两级失效（内容哈希快路 + AST 结构指纹 + 下游 BFS + referencer set-diff）；新鲜度信号一等公民，Agent banner 与 Human 徽章同版交付 | 两者 |
| **F** Agent 交付面 | 单后端两前端：主＝VS Code 扩展注册 tk_explore/node/search/callers(+map)（LM Tool API + 编程式 MCP，因企业 raw-MCP 默认锁）；次＝`tk mcp` 手写零依赖 stdio JSON-RPC；默认 4 工具（小库降 3），其余 TK_MCP_TOOLS 门控；≤9KB steering playbook | B |
| **G** 输出 token 经济 | 全部 G1–G16：单一结构化答案按仓库规模分级 char 预算上限（13000/18000/24000，<~24K 宿主内联帽），小文件 leaf-verbatim 带行号，大流容器折叠 + 骨架化，precompute-once + include_content=false 按需取体，按仓库规模封顶调用数；每次省略都是重查工具而非 Read 的可升级项 + 诚实低置信交还 | B |
| **H** 人类理解面 | 自包含单文件内联 JSON 的 HTML 查看器，复用 tk html.ts；只读（编辑走 I 的原生文件回写） | A |
| **I** 协作 | 文件支撑、git 异步、无服务端，根于 `.tk/`：wiki.json(JSONC) 控制文件 + 逐页 provenance（filePaths/importance/sourceCommit + path:Lx-Ly 深链）+ proposed↔pages 暂存回写（300ms 去抖、last-write-wins）+ human-fence 逐字往返 + 零 LLM Kahn-topo tour + git-diff 陈旧度 + .gitignore 团队/本地分割 | A |
| **J** 正确性/信任 | 五层信任契约锚于同一 node:sqlite：每答带不可选 file:line+cols；每边带 provenance{tree-sitter/scip/heuristic}+synthesizedBy 规则标签；二元高/低检索分级 + 诚实交还脚注；content_hash+mtime 显式陈旧三级 banner（fail-open）；emit 前存在性门控（无伪造路径）；显拒 DeepWiki 无锚 RAG | 两者 |
| **K** 证明 | 两轨两工作 + 一条诚实不变量：Job B 在 Claude Code headless（唯一干净未缓存 token runner）跑离线 A/B（MCP on/off，4 跑/臂，中位数），**主指标 = uncached_input_tokens 差**（推翻 codegraph 的含缓存 total）；安全靠 fallback-replay 的 omission_bug_rate；主机宿主用 Track-2 机会事实（永不汇入 saved_tokens）；Job A 用小 N 任务协议明标"指示性" | 两者 |
| **L** 分发/运行时 | 双通道：主＝`npm i -g token-killer` 极薄 CJS shim（用户自带 Node 运行）+ 各平台 vendored-Node bundle 作 optionalDependencies + GitHub Releases 自愈下载；备＝独立安装脚本拉同一 .zip/.tar.gz；vendored Node 锁 24.x（≥22.5 硬底）；22.5 bootstrap 硬阻断；Windows 直调 node.exe 不经 .cmd；tk Windows 既有修复列为强制不变量 | 两者 |
| **M** 横切最佳实践 | 采用 M1–M17（三上下文类压缩边界为治理法、诚实低置信交还、provenance 标记、陈旧 banner、AST ChangeType、referencer set-diff、metadata-first、签名折叠、cheap-outline MCP 阶梯、声明式控制文件、订阅/宿主 LLM、uncached 主指标、fallback-replay）；M18 拒 embeddings/RL 默认、defer daemon/watcher；M19–M25 黑名单（eval LLM 输出、前缀祖先增量、幻觉图、裸 dump、种子默认管理员、12k token/查询、抄许可受限代码） | 两者 |

## 跨需求实施路线(有序、依赖感知)

实施按 dep map 的 resolutionOrder（A→B→C→D→G→E→J→F→H→I→L→K→M）展开，但**测量脚手架按目标提前**（K 的最小切片在地基之后立刻立起，作为后续所有声明的度量针），**L 的版本/打包不变量最先固化**（它给 C/D 提供可运行的 Node + SQLite + FTS5）。每个步骤独立可发布、可测试。

### 阶段 0 — 版本与运行时地基（L 子集，先于一切）
- **0.1** 固化跨需求版本锚点：`engines.node ">=22.5.0 <25.0.0"`，bootstrap 硬阻断（非仅 engines 警告），env override（L6）。可测：低版本 Node 启动给出 banner 并退出。
- **0.2** vendored Node 24.x bundle + shim 包骨架（npm 极薄 CJS shim 由用户 Node 启动；bundle 作 optionalDependencies）。可测：shim 在任意 Node 启动并定位到 bundle 的 node.exe（Windows 直调，不经 .cmd，L5）；bundle 的 SQLite 自带 FTS5（覆盖 A 的 FTS5 开放项）。
- **0.3** tk Windows 既有修复列为强制不变量（PATHEXT 纯 Node 扫描、EBUSY maxRetries、GBK 边界解码、pathToFileURL、绝不 npx，L8）。可测：现有 Windows 移植测试套全绿。

### 阶段 1 — 物理底座（C，由 A 的图模型驱动）
- **1.1** node:sqlite(DatabaseSync) 打开 + PRAGMA（WAL/busy_timeout=5000/synchronous=NORMAL/mmap/cache）。可测：DB 创建 + PRAGMA 生效。
- **1.2** schema：通用 `nodes(kind)` / `edges(kind)` 异构表 + **provenance 列（B1 字段级契约）** + file:line/cols 列（A2/J1）+ content_hash/modified_at/indexed_at/index_generation（E/J）+ DocNode.version。monotonic `schema_versions`，additive ALTER-only。可测：建表 + 一次空迁移幂等。
- **1.3** FTS5 external-content 虚表（content='nodes'，porter unicode61，3 同步触发器，bm25 列权重）over (name, qualified_name, docstring, signature)；附 LIKE-scan 兜底守卫（C7，覆盖 npm-shim-on-user-Node 万一缺 FTS5 的路径）。可测：插入节点 → FTS 命中 + 触发器同步 + 兜底路径。
- **1.4** 预留 `meta(key,value)` 表 + nullable embedding 槽位（v2 sqlite-vec 不破迁移）。可测：槽位存在、v1 不写。

### 阶段 2 — 填充底座（D，图谱需要符号）
- **2.1** web-tree-sitter(WASM) 加载器 + 单一可回收 worker；生命周期常数逐字采用（WORKER_RECYCLE_INTERVAL=250、PARSER_RESET_INTERVAL=5000、PARSE_TIMEOUT_MS=10000 基础按 +10000/100KB、MAX_FILE_SIZE=1MB skip、FILE_IO_BATCH_SIZE=10）；OOM→worker exit(1)+父重生，timeout→reject-first+terminate；解析进程 `--liftoff-only`（缺则自重入一次）。可测：解析一文件出 AST；注入 OOM/timeout 走对路径。
- **2.2** 每语言 typed `LanguageExtractor` config 对象 + 单一核心 walker dispatch（非裸 .scm）；产出 nodes/edges 填入 1.2 的字段，provenance='tree-sitter'。可测：tier-1 每语言（TS/TSX/JS/JSX/Python/Go/Rust/Java/C/C++/C#）小样本解析在 CI 把关。
- **2.3** 检测＝扩展名映射优先（58 条）+ .h 歧义 8KB 内容嗅探；grammar LAZY+SEQUENTIAL 仅加载项目中出现的语言；C# 及损坏 ABI 的语言走 vendored .wasm。可测：混合语言项目只加载所需 grammar。

### 阶段 3 — Agent 食谱 + 测量针先立（A 检索管线 + K 最小切片 + G 输出经济）
- **3.1** Agent buildContext 混合检索（A）：NL query regex 抽符号（去 stoplist）→ 3 通道 FTS+exact+prefix max-score 合并 → contains/calls 边 depth-1 BFS → 自适应代码块抽取（容器→签名 outline，叶函数→verbatim）→ 紧凑 Markdown。**检索 WHERE provenance='static'（B1）**。可测：query→子图→Markdown 端到端，且 LLM 字段永不进入排序。
- **3.2** 输出 token 经济（G，操作化 A6/A7）：分级 char 预算（13000/18000/24000，G1 为唯一数字来源）+ <~24K 内联帽不变量 + leaf-verbatim 带行号 + 容器折叠/骨架化（默认 ON + env kill-switch）+ include_content=false locations-first + 按仓库规模封顶调用数 + retention-first 可升级省略 + 低置信交还 sentinel。可测：每档预算下答案不越界、不外溢再 Read。
- **3.3** **K 最小切片（测量针先立，按目标提前）**：Claude Code headless 离线 A/B 跑器骨架，主指标 uncached_input_tokens 差（input − cache_read），4 跑/臂中位数 + min/max；fallback-replay → omission_bug_rate；measured 行 `estimate_kind:"measured"`。此切片立即用于度量 3.1/3.2 的真实收益，且后续每个声明都过它。可测：跑器对 MCP-on/off 出可复现 token 差；空任务出 0 差基线。

### 阶段 4 — 新鲜度（E，惰性失效底座的图）
- **4.1** lazy-on-read 触发 + (path,mtime,size,sha256) 指纹 store（`file_fingerprint` 表）；每次 query 廉价 mtime 扫；可选 git post-commit/merge/checkout hook（幂等 marker-block）；watcher 仅 opt-in 默认 OFF，WSL2 /mnt 硬禁。可测：改文件→下次 query 检出陈旧；watcher 关闭为默认。
- **4.2** 两级失效：内容哈希快路（sha256 同→skip）；AST 结构指纹 diff 分类 COSMETIC/STRUCTURAL + ChangeType 六态；重算＝结构变更文件自身节点 + calls/imports 下游 BFS + referencer set-diff（code_changed vs referencer 变更）；classify-update 阶梯 SKIP/PARTIAL(≤10)/ARCHITECTURE(>10 或新增删顶级目录)/FULL(>30 或 >50%)。可测：注入各类变更走对档位；comment/docstring-only 不触发 LLM 重生。
- **4.3** 新鲜度信号双受众同版交付：Agent banner（"⚠️ 以下文件已自上次同步后编辑…直接 Read"）+ `pending[]`/`indexCommit`/`stale` 结构字段；Human HTML 徽章（indexedAt+indexCommit+N pending+逐文件 last-synced）；"index frozen"罕见 banner。可测：Agent 与 Human 两面同时显示陈旧。

### 阶段 5 — 信任契约（J，把锚点/provenance 升为 v1 验收线）
- **5.1** 硬锚：每节点/答案非可选 file_path+startLine/endLine/cols；emit 前 fileExists/readFile→null 存在性门控（无伪造路径，J11）。可测：人为坏路径被拦截、不外发。
- **5.2** provenance：每边 provenance∈{tree-sitter,scip,heuristic} + heuristic 边带 synthesizedBy（18 名词表）+ registeredAt file:line，渲染为可读标签非裸箭头；每 resolved ref 带 resolvedBy+0-1 置信。可测：heuristic 边带规则标签。
- **5.3** 分级 + 交还：二元高/低检索分级（≥2 个 len≥3 query 词无佐证入口才触发，单关键词豁免）；LOW 时附诚实交还脚注路由 explore/search/files。显拒 DeepWiki 无锚 RAG。可测：弱检索触发 LOW 脚注；单符号查询不误触发。

### 阶段 6 — 三交付面收敛到一个扩展（F → H → I，按依赖顺序）
- **6.1（F）** 单后端两前端：次目标先行——`tk mcp` 手写零依赖 newline-delimited JSON-RPC stdio MCP（非官方 SDK）；默认 4 工具（explore 主 + node + search + callers，小库 <500 文件降 explore/search/node 3 件），其余 TK_MCP_TOOLS 门控；NO-INDEX→空 tools/list + 'inactive' 指引（success-shaped 非 isError）；≤9KB steering playbook；**TK_MCP_TOOLS 空＝without-tools 基线臂**（喂给 K）。可测：Claude Code 连上、4 工具可调、空 env 出干净 without 臂。F8 的 maxOutputChars **import G1 常量**不重定义。
- **6.2（F 主）** VS Code 扩展：LM Tool API 注册 tk_explore/node/search/callers(+map) + 同后端编程式 MCP（因企业 raw-MCP 默认锁）。可测：扩展在 VS Code 暴露工具、调用打到同一图后端。
- **6.3（H）** 自包含单文件内联 JSON HTML 查看器（复用 tk html.ts），**由扩展打开**（H1 embed() 输出），渲染 A 的同一子图为 ASCII/HTML 树 + entry-point + 相关符号 + lazy-expand 导航 + E 的新鲜度徽章。**只读**。可测：扩展打开查看器、离线自包含。
- **6.4（I）** 协作回写经扩展 diff-view + file-watcher 落地（VS-Code-native 文件，非自建编辑器）：`.tk/wiki.json`(JSONC) 控制文件（DeepWiki schema，caps 30 页/60 团队/100 notes/10k 字，fail-loud exit 2）+ 逐页 provenance + proposed→pages 提升（`tk wiki accept` + 300ms 去抖回写，last-write-wins）+ tk:human-start/end fence 逐字往返（orphan 救回不丢）+ 零 LLM Kahn-topo tour→`docs/ONBOARDING.md` + git-diff 陈旧度（surface-not-auto-regen）+ `.tk/.gitignore` 团队/本地分割 + `tk wiki impact <ref>` 只读 PR context（零 GitHub egress）；所有 IO 经 resolveFilePath 封闭 + EBUSY-safe rm。可测：regen→proposed→accept→人编辑→回写往返；human-fence 保留逐字。

### 阶段 7 — 智能生成层（B 生成层，叠在静态核上）
- **7.1** 生成层永远花宿主 token：把静态结构喂宿主 Agent（主：VS Code Copilot `/tk understand`；次：Claude Code）或本地订阅 CLI（caw 式 claude/codex），tk **构造 prompt + 解析校验**输出，自身绝不调模型 API。可测：无宿主/CLI 时降级——出完整静态图 + 模板派生（非生成）摘要，叙事字段标 absent 而非编造。
- **7.2** 确定性校验器永远跑（cross-ref 完整性、悬挂边丢弃、schema 填充）；LLM review 仅 `--review` 门控；任何 LLM 图/产物过校验器或移除（B6）；LLM 字段 provenance-tag 且重锚 file:line，绝不作检索 ground truth。可测：B7 no-LLM 模式 = K 的 baseline。

### 阶段 8 — 分发收尾（L 全量）
- **8.1** 双通道完成：npm 主通道（shim + optionalDependencies bundle + GitHub Releases 自愈下载，防 cnpm/企业镜像丢 optional dep）+ 独立安装脚本备通道（irm|iex / curl|sh 拉同一 .zip/.tar.gz，无需 Node）。可测：模拟丢 optional dep 走自愈下载。
- **8.2** 用户 Node 22.5–23 路径 `--disable-warning=ExperimentalWarning` 守护自重入（env-flag 防死循环）；bundle 24 路径由 launcher flag 抑制无需重入。可测：22.5 用户 Node 不再泄漏 node:sqlite ExperimentalWarning。

### 阶段 9 — 完整证明（K 全量 + M 治理叠加）
- **9.1（K）** Job B 全量：离线 A/B（uncached_input_token 主指标 + tool_calls/file_reads/search_calls/distinct_files/latency 次指标）；Job B 安全＝omission_bug_rate；Job B 质量＝localization F1 + FAIL_TO_PASS/PASS_TO_PASS（与端到端任务质量分开报）。主机宿主＝Track-2 机会事实（call_count/payload_bytes/avoided_raw_reads/dedup，`estimate_kind:"opportunity"`，永不汇入 saved_tokens），靠 W2 loop-avoidance host-agnostic 假设迁移。可测：measured 与 opportunity 两类行永不相加（ledger 强制）。
- **9.2（K）** Job A 小 N 任务协议：find-correct-file rate（time-to-correct-file + hit@1）+ onboarding 理解题对答案键评分，明标"small-N 指示性非 benchmark-grade"；Serena 立场——无法机械求得的 token 数拒绝编造，改报 call-count/payload-size/前置步骤。可测：Job A 输出带 N 与"指示性"标签。
- **9.3（M）** 横切治理叠加：M1 三上下文类压缩边界为治理法贯穿全部；M19–M25 黑名单作 lint/审查清单（拒 eval LLM 输出、前缀祖先增量、幻觉图、裸 dump、种子默认管理员、12k token/查询、抄许可受限代码——mine pattern not code）。可测：黑名单项有对应防护/检测。

---

# 源指南索引(Source Guidance Index)

> 把全文分散的 `源:<clone-path:line>` 引用按"项目"汇总,一眼看清**读哪个文件、借鉴什么、避免什么、能不能抄进发布物**。clone 在 `/tmp/tk-research/`。可抄性:✅=permissive 可抄(署名);🟡=无 license / 受限,自用可抄但标 `[非分发安全]`、分发前重写;❌=禁(PolyForm 商用)。

| 源(license / 可抄性) | 喂需求 | 读哪个文件 | 借鉴什么 | 避免什么 |
|---|---|---|---|---|
| **codegraph** (MIT ✅) — 参考实现 | A/C/D/F/G/J/K | `src/db`(DDL/FTS5)、`src/context`(buildContext)、`src/mcp`(工具)、`src/resolution`(调用解析)、`src/extraction`(tree-sitter)、`__tests__/evaluation` + `scripts/agent-eval`(A/B 跑器) | 整套底座:node:sqlite schema、signature-collapse 输出经济、4-tool MCP、provenance 标签、token A/B 协议 | 几乎无 —— 它是范本 |
| **aider** (Apache-2.0 ✅,未 clone,web) | A | `aider/repomap.py` `get_ranked_tags` | personalized PageRank + rank 分发到定义 + mul 权重 | networkx/Python 依赖 → 纯 TS 重写(附录 A1) |
| **tree-sitter-analyzer** (MIT ✅) | A/D | `.../project_index/_pagerank.py`、`tree_sitter_analyzer/` | 无依赖幂迭代 PageRank 参考;tree-sitter 抽取 | — |
| **repomaster** (MIT ✅) | A | `src/core/importance_analyzer.py` | personalization 单点偏置写法(旁证) | 别把 PageRank 当综合分一项硬抄 |
| **gitnexus** (PolyForm-NC 🟡) | A/B/C/D/E/F/G/H/K | 见**附录 A2**(resolution/cfg/mcp/server+web/storage/incremental/augmentation/wiki/eval) | 调用解析、CFG/数据流、impact/precompute、17→少工具、1 后端 N 前端 viewer | Kuzu/lbug 原生绑定(Windows native-build)、embeddings、17-tool sprawl、**再分发其代码**(`[非分发安全]`) |
| **repodoc** (无 license 🟡) | B/C/E/J | `repodoc/src`(AST-diff)、HeterogeneousGraph schema、`llm.py`/`utils.py`(derive+validate) | AST ChangeType 增量、异构图 schema、derive-not-generate+validate+fallback | 逐字抄(重写)、脆弱 LLM-输出解析、`eval()` |
| **repoagent** (Apache-2.0 ✅) | E | `repo_agent/`(referencer-set diff + fake-file) | 最精准失效:referencer set-diff + fake-file trick | 脆弱 LLM-输出解析 |
| **understand-anything** (MIT ✅) | B/H | `GraphView.tsx`/`KnowledgeGraphView.tsx`、slash-command 委托 | 两级 lazy-expand + aggregate edges + tours + persona;slash-command 把生成委托回宿主 | 1580-LOC 巨组件别照搬结构 |
| **codewiki** (无 license 🟡) | B/H | `caw_toolkit.py`/`caw_backend.py`、`viewer_template.html` | caw 调本地 claude/codex(OAuth/工具组关闭)、自包含 inline-JSON HTML | 逐字抄(重写)、path-substring 增量(M20)、脆弱 LLM 解析 |
| **davia** (MIT ✅) | I | `.../editor.tsx` + tiptap | file-backed 可编辑回环、300ms 去抖回写、无 DB | 130k raw dump 无图 |
| **DeepWiki** (闭源,web) | F/I | 产品文档 | 3-tool ladder(structure→contents→ask)、`.devin/wiki.json` 控制文件 + 硬 caps | 定时重生的小时级延迟 |
| **deepwiki-open** (MIT ✅,反面为主) | M | — | (反面教材) | 幻觉 mermaid、2280-LOC 巨组件、FAISS embeddings |
| **opendeepwiki** (MIT ✅,反面为主) | M | — | (反面教材) | `LIKE '%q%'` 搜索、12k-token/query LLM 摘要、明文 creds、默认 admin |
| **repograph** (Apache-2.0 ✅) | K | `SWE-agent/` + `agentless/`、`eval/` | SWE-bench/HumanEval 跑法 + 自动评分(FAIL/PASS_TO_PASS) | Python 移植(复用协议而非端口) |
| **Serena / SCIP** (闭源/spec,web) | D/K | SCIP spec、Serena | LSP/SCIP 编译级精度(D opt-in);拒 token-benchmark 改报 call-count 的姿态(K) | 强制装 indexer(改 opt-in) |
| **论文** SWE-ContextBench / FastContext / Codebase-Memory | K | arXiv | uncached-delta 主指标、localization F1、cache>97% 陷阱 | 把含缓存 total 当指标 |

# 官方文档复核清单(Official docs to re-check)

> 全文大量实现判断依赖外部官方行为;动手前**逐条复核当前官方文档**(链接已于 2026-06-20 核实)。

### VS Code 扩展 / Agent 面(需求 F —— 主交付路径的命门)
- **Language Model Tool API** — https://code.visualstudio.com/api/extension-guides/ai/tools — 复核 `vscode.lm.registerTool` + package.json `languageModelTools` 贡献点 + `lm.tools` 列表 + `prepareInvocation` 确认对话。**这是 tk 在 VS Code 上的主要 agent 面。**
- **Language Model API** — https://code.visualstudio.com/api/extension-guides/ai/language-model — 借宿主模型(需求 B)的接口。
- **MCP developer guide** — https://code.visualstudio.com/api/extension-guides/ai/mcp — 扩展内编程式注册 MCP(tk 的次交付面)。

### VS Code MCP 配置 / 企业策略(需求 F —— 决定"扩展为主 vs MCP 为主"的闸)
- **MCP configuration reference** — https://code.visualstudio.com/docs/agents/reference/mcp-configuration — `mcp.json` 形状(`.vscode/mcp.json` / 用户态、`servers`/`inputs`/`sandbox`)。
- **Add / manage MCP servers** — https://code.visualstudio.com/docs/agent-customization/mcp-servers
- **Manage AI settings in enterprise environments** — https://code.visualstudio.com/docs/enterprise/ai-settings — **复核 `ChatMCP` 策略(MCP 从哪装)+ `McpGalleryServiceUrl`(私有 registry)+ `enterpriseManaged`/XAA。** 这条决定企业是否默认禁 MCP → 直接定 F 的"扩展为主"是否成立。
- **Centrally manage VS Code settings with policies** — https://code.visualstudio.com/docs/enterprise/policies

### 运行时 / 存储(需求 C / L)
- **Node `node:sqlite`** — https://nodejs.org/api/sqlite.html (v22.x: https://nodejs.org/docs/latest-v22.x/api/sqlite.html) — 复核:已**不需 `--experimental-sqlite` flag、仍 experimental(仅 warning)**;`DatabaseSync` API;**FTS5 不在 node 文档里(是 SQLite 编译选项)** —— tk 已于 2026-06-20 实测官方 Node 22.22.2 内置 SQLite 3.51.2 带 FTS5,但**每个 Node 版本/bundle 都要重测**(declare-only 的 C7 LIKE 兜底正为此)。

### 分发 / license(需求 L / M25)
- **npm provenance** — https://docs.npmjs.com/generating-provenance-statements — `npm publish --provenance`(Sigstore),declare-only 下的"可信"机制(决策 #9)。
- **SCIP spec** — https://github.com/sourcegraph/scip — SCIP opt-in 消费 `index.scip` 的 protobuf schema(需求 D / 附录 A1)。
- **PolyForm Noncommercial** — https://polyformproject.org/licenses/noncommercial/1.0.0/ — gitnexus `[非分发安全]` 边界依据(M25)。

# 各需求 ACTION 明细(A–M)

## 需求 A — Core method（这份"智能"是什么形态）

**总纲（与 DEP MAP coherence 一致）：ONE BACKEND, TWO DIETS。** 唯一存储 = node:sqlite + FTS5 单文件里的一张 typed property graph（nodes + edges + nodes_fts），每个 node 携带可解析的 `file:line` span。两套渲染 diet 共享同一张子图：Agent diet（服务 B，确定性混合检索）与 Human diet（服务 A，ASCII/HTML 树）。embeddings、PageRank、LSP-as-core 全部排除出 v1。packing（signature-collapse）不是底座，是 Agent diet 内部的压缩函数。下游 C 是这张图的物理落地、D 是填图的 WASM tree-sitter 抽取器、F 是把 Agent diet 暴露成 MCP 工具、H 渲染 Human diet、G/J 塑形与背书输出。

> 跨需求版本闸（A 此前标 stillOpen，现由 D+A 关闭）：因 A 承诺 tree-sitter **WASM** 作抽取器（D1），L 的"是否 ship WASM"被定性回答=是 → 单一闸 `engines.node ">=22.5.0 <25.0.0"`，vendored Node 钉 24.x LTS，解析进程强制 `--liftoff-only`。FTS5 由 vendored-Node bundle 保证存在；仅 npm-shim-on-user-Node 路径需 C7 的 `LIKE`-scan 兜底。DB 路径走 out-of-tree（per-project fingerprint 目录于 user store），`.tk/` 树只放 human 工件（wiki）+ gitignored staging——**修正 A1 旧串 `.tk/codegraph.db` → out-of-tree 路径**。

---

### 决策 A1 — BASE = typed property graph（非 flat ranked repo-map、非 AST-chunk index）   服务两者

(1) **决策**：底座是 node/edge typed property graph，单一真相源；ranked-map 与 chunk view 是按需投影、绝不二次落库。embeddings/PageRank/LSP-as-core 出局 v1。

(2) **要动的文件**（tk repo）：
```
src/codegraph/
  db/schema.sql          # 新建：node/edge/fts DDL（决策 A2/A3/A4）
  db/open.ts             # 新建：node:sqlite 打开 + applySchema()，DB 路径由 C 提供（out-of-tree）
  context/build.ts       # 新建：Agent diet 管线（A5/A6/A7/A10）
  context/format.ts      # 新建：formatSubgraphTree（A8 human diet 数据源）
  context/markers.ts     # 新建：LOW_CONFIDENCE_MARKER 叶子常量（A10）
src/report/html.ts       # 已存在(791 行)：接入 Human diet 渲染（A8）
```
DB 物理位置归 C（`~/.token-killer/projects/<fp>/index.db` POSIX / `%LOCALAPPDATA%\token-killer\...` Windows），A 只要求"同一子图喂两套 diet"。

(3) **可抄代码**（已确认存在）：见 A2/A3/A4 的 DDL 与 A6 的 budgets 常量。

(5) **有序步骤**：① 落 schema.sql（A2/A3/A4，可独立测）→ ② db/open.ts 打开+建表 → ③ build.ts 管线（A5）→ ④ format.ts + markers.ts（A8/A10）→ ⑤ 接 html.ts（A8）。

(6) **测试**：建空库后 `SELECT name FROM sqlite_master` 必含 `nodes/edges/nodes_fts` + 3 触发器；A-B harness 记录 `tool_calls`、`uncached_delta_tokens`（vs grep 基线）。

(7) **证据回指**：`/tmp/tk-research/codegraph/src/db/schema.sql`；research §10.2（structural-graph 唯一全绿行）。

---

### 决策 A2 — Node 模型（每个 node 带可解析 file:line span）   服务两者

(1) **决策**：node 表字段如下；`file:line` span 让图同时充当 Read 后端（返回字节一致源码），`return_type` 保留用于 method-call 的 receiver-type 推断。

(4) **具体数值**：kind 枚举 ~21 种；FTS 覆盖 4 字段（name/qualified_name/docstring/signature）；布尔列 INTEGER 0/1。

(3) **可抄代码**（源: `/tmp/tk-research/codegraph/src/db/schema.sql:20`，verbatim，license MIT 无限制）：
```sql
-- Nodes: Code symbols (functions, classes, variables, etc.)
CREATE TABLE IF NOT EXISTS nodes (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    name TEXT NOT NULL,
    qualified_name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    language TEXT NOT NULL,
    start_line INTEGER NOT NULL,
    end_line INTEGER NOT NULL,
    start_column INTEGER NOT NULL,
    end_column INTEGER NOT NULL,
    docstring TEXT,
    signature TEXT,
    visibility TEXT,
    is_exported INTEGER DEFAULT 0,
    is_async INTEGER DEFAULT 0,
    is_static INTEGER DEFAULT 0,
    is_abstract INTEGER DEFAULT 0,
    decorators TEXT, -- JSON array
    type_parameters TEXT, -- JSON array
    return_type TEXT, -- normalized return/result type name (receiver-type inference)
    updated_at INTEGER NOT NULL
);
-- Node indexes (源: schema.sql:89)
CREATE INDEX IF NOT EXISTS idx_nodes_kind ON nodes(kind);
CREATE INDEX IF NOT EXISTS idx_nodes_name ON nodes(name);
CREATE INDEX IF NOT EXISTS idx_nodes_qualified_name ON nodes(qualified_name);
CREATE INDEX IF NOT EXISTS idx_nodes_file_path ON nodes(file_path);
CREATE INDEX IF NOT EXISTS idx_nodes_language ON nodes(language);
CREATE INDEX IF NOT EXISTS idx_nodes_file_line ON nodes(file_path, start_line);
CREATE INDEX IF NOT EXISTS idx_nodes_lower_name ON nodes(lower(name));
```

(6) **测试**：插入一个 fixture node，按 `(file_path, start_line)` 查回 → `read --max-lines` 同区间字节一致（Read 后端等价断言）。

(7) **证据回指**：schema.sql:20 / :89。下游 J1（file:line 是唯一信任原语）、C5。

---

### 决策 A3 — Edge 模型（provenance 标记 heuristic 边，FK ON DELETE CASCADE）   服务两者

(1) **决策**：edge 11 种 kind；启发式/合成边必须 `provenance='heuristic'` + metadata.synthesizedBy；FK CASCADE 保增量重建一致。

(4) **具体数值**：3 个复合索引 `idx_edges_kind / (source,kind) / (target,kind)` + `idx_edges_provenance`；narrow source-only/target-only 索引故意省略（左前缀扫描覆盖）。

(3) **可抄代码**（源: `/tmp/tk-research/codegraph/src/db/schema.sql:45` 与 :126，verbatim）：
```sql
-- Edges: Relationships between nodes
CREATE TABLE IF NOT EXISTS edges (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL,
    target TEXT NOT NULL,
    kind TEXT NOT NULL,
    metadata TEXT, -- JSON object
    line INTEGER,
    col INTEGER,
    provenance TEXT DEFAULT NULL,
    FOREIGN KEY (source) REFERENCES nodes(id) ON DELETE CASCADE,
    FOREIGN KEY (target) REFERENCES nodes(id) ON DELETE CASCADE
);
-- idx_edges_source / idx_edges_target intentionally omitted —
-- (source, kind) and (target, kind) composites cover source-only/target-only
-- lookups via SQLite left-prefix scan; narrow indexes are dead weight on writes.
CREATE INDEX IF NOT EXISTS idx_edges_kind ON edges(kind);
CREATE INDEX IF NOT EXISTS idx_edges_source_kind ON edges(source, kind);
CREATE INDEX IF NOT EXISTS idx_edges_target_kind ON edges(target, kind);
CREATE INDEX IF NOT EXISTS idx_edges_provenance ON edges(provenance);  -- 源: schema.sql:145
```
> 注：打开连接后须 `PRAGMA foreign_keys=ON`（node:sqlite 默认关闭），否则 CASCADE 不生效——**需实现时在 db/open.ts 补一行 PRAGMA**（schema.sql 仅声明 FK 约束，未含 PRAGMA）。

(6) **测试**：插入 node+若干 edge → `DELETE FROM nodes WHERE id=?` 后该 node 的边数=0（CASCADE 断言）；插一条 `provenance='heuristic'` 边，按 `idx_edges_provenance` 过滤可命中。

(7) **证据回指**：schema.sql:45 / :126 / :145。下游 B1（provenance 列）、J2（边诚实）、F（tk_callers/tk_node）。

---

### 决策 A4 — 词法索引 = FTS5 over nodes(name,qualified_name,docstring,signature)，触发器同步   服务 B

(1) **决策**：唯一搜索通道用 content-table FTS5，与图共处一文件；无独立 BM25 引擎、无 vector store。

(3) **可抄代码**（源: `/tmp/tk-research/codegraph/src/db/schema.sql:98`，verbatim）：
```sql
CREATE VIRTUAL TABLE IF NOT EXISTS nodes_fts USING fts5(
    id, name, qualified_name, docstring, signature,
    content='nodes', content_rowid='rowid'
);
CREATE TRIGGER IF NOT EXISTS nodes_ai AFTER INSERT ON nodes BEGIN
    INSERT INTO nodes_fts(rowid, id, name, qualified_name, docstring, signature)
    VALUES (NEW.rowid, NEW.id, NEW.name, NEW.qualified_name, NEW.docstring, NEW.signature);
END;
CREATE TRIGGER IF NOT EXISTS nodes_ad AFTER DELETE ON nodes BEGIN
    INSERT INTO nodes_fts(nodes_fts, rowid, id, name, qualified_name, docstring, signature)
    VALUES ('delete', OLD.rowid, OLD.id, OLD.name, OLD.qualified_name, OLD.docstring, OLD.signature);
END;
CREATE TRIGGER IF NOT EXISTS nodes_au AFTER UPDATE ON nodes BEGIN
    INSERT INTO nodes_fts(nodes_fts, rowid, id, name, qualified_name, docstring, signature)
    VALUES ('delete', OLD.rowid, OLD.id, OLD.name, OLD.qualified_name, OLD.docstring, OLD.signature);
    INSERT INTO nodes_fts(rowid, id, name, qualified_name, docstring, signature)
    VALUES (NEW.rowid, NEW.id, NEW.name, NEW.qualified_name, NEW.docstring, NEW.signature);
END;
```

(4) **具体数值**：FTS 覆盖 4 列；触发器 3 个。

(6) **测试**：插 node → `SELECT id FROM nodes_fts WHERE nodes_fts MATCH ?` 命中；`UPDATE nodes SET name=...` → 旧名查不到、新名查到（触发器同步断言）。FTS5 缺失时 C7 `LIKE`-scan 兜底（仅 npm-shim-on-user-Node 路径）。

(7) **证据回指**：schema.sql:98。下游 B（FTS over static-only）、C6。

---

### 决策 A5 — Agent diet 检索管线（6 步确定性混合检索）   服务 B

(1) **决策**：固定为 ① query 符号抽取（CamelCase/snake/SCREAMING/acronym/dotted/lowercase 正则 − ~130 词 stoplist）→ ② 3 通道（exact-name +co-location、definition-prefix +brevity、FTS multi-term）按 **MAX** 合并 → ③ re-rank（multi-term 共现、test-file ×0.3、dominant-file boost）→ ④ BFS depth-1 direction:both over contains/calls → ⑤ 自适应 code-block 抽取 → ⑥ 低置信诚实兜底。

(3) **可抄代码**（源: `/tmp/tk-research/codegraph/src/context/index.ts:44`，符号抽取正则，verbatim）：
```ts
// extractSymbolsFromQuery (index.ts:44)
const camelCasePattern = /\b([A-Z][a-z]+(?:[A-Z][a-z]*)*|[a-z]+(?:[A-Z][a-z]*)+)\b/g;
const snakeCasePattern  = /\b([a-z][a-z0-9]*(?:_[a-z0-9]+)+)\b/gi;        // len>=3 (index.ts:59)
const screamingPattern  = /\b([A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+)\b/g;
```
test-file 惩罚（源: `index.ts:623`，verbatim）：`result.score *= 0.3;`
dominant-file boost 触发（源: `index.ts:642`，verbatim）：`if (dominant && dominant.edgeCount >= 3 * dominant.nextEdgeCount) { ... }`

(4) **具体数值**：snake/screaming 最短 3 字符；test-file ×0.3；dominant-file 阈 ≥3×。

(6) **测试**：fixture query `"refresh AuthToken in user_service"` → 抽出 `['AuthToken','user_service']`；含 test 文件的命中分降至 0.3×。

(7) **证据回指**：index.ts:44/:59/:623/:642。下游 F（tk_explore/tk_search 暴露此管线）、K（被测系统）。

---

### 决策 A6 — 默认检索预算（token 效率刻度盘）   服务 B

(1) **决策**：maxNodes=20、maxCodeBlocks=5、maxCodeBlockSize=1500 chars、searchLimit=3、traversalDepth=1、minScore=0.3；BFS per-entry-point 上限 = ceil(maxNodes/entryPointCount)。import/export 排除出 HIGH_VALUE_NODE_KINDS。

(4) **具体数值**：见上（全部定值）。

(3) **可抄代码**（源: `/tmp/tk-research/codegraph/src/context/index.ts:143`，verbatim）：
```ts
const DEFAULT_BUILD_OPTIONS: Required<BuildContextOptions> = {
  maxNodes: 20,           // Reduced from 50 - most tasks don't need 50 symbols
  maxCodeBlocks: 5,       // Reduced from 10 - only show most relevant code
  maxCodeBlockSize: 1500, // Reduced from 2000
  includeCode: true,
  format: 'markdown',
  searchLimit: 3,         // Reduced from 5 - fewer entry points
  traversalDepth: 1,      // Reduced from 2 - shallower graph expansion
  minScore: 0.3,
};
const HIGH_VALUE_NODE_KINDS: NodeKind[] = [
  'function', 'method', 'class', 'interface', 'type_alias', 'struct', 'trait',
  'component', 'route', 'variable', 'constant', 'enum', 'module', 'namespace',
];  // imports/exports excluded: near-zero information density
```

(6) **测试**：单次 explore 调用产出 node 数 ≤20、code block ≤5；A-B harness 字段 `nodes_returned`、`code_blocks` 上界断言。

(7) **证据回指**：index.ts:143。下游 G1（char 层级 13000/18000/24000 操作化这些预算）、F8（maxOutputChars 须 import G1 常量，不重定义）。

---

### 决策 A7 — code-block 压缩函数（复用 packing，非独立库）   服务 B

(1) **决策**：container（class/module）折叠为 signature outline；leaf function/method 出 verbatim 源码；超预算在 maxCodeBlockSize 截断并加语言中立标记 `\n... (truncated) ...`（不用 `//`，Python/Ruby 非注释）。优先级 entry-points → functions/methods → classes。

(3) **可抄代码**（源: `/tmp/tk-research/codegraph/src/context/index.ts:1250`，verbatim）：
```ts
const truncated = code.length > maxBlockSize
  ? code.slice(0, maxBlockSize) + '\n... (truncated) ...'
  : code;
```
> container→outline 与 tk 现有 `read --level aggressive` 是同一招（已改写：tk 侧复用 html.ts 折叠区段）。

(4) **具体数值**：截断阈 = maxCodeBlockSize=1500 chars。

(6) **测试**：>1500 字符的函数体被截断且尾含 `... (truncated) ...`；class node 仅出 signature 行不出 body。

(7) **证据回指**：index.ts:1250。下游 G（输出经济层）。

---

### 决策 A8 — Human diet 渲染器（同一子图，第二 formatter）   服务 A

(1) **决策**：Human diet 消费与 Agent diet **同一个 TaskContext/subgraph**，渲染为 entry-point 列表 + related-symbols-by-file + 可折叠 code block + depth-bounded 树（Understand-Anything 式 lazy-expand）。每 kind >3 时收口为 `… and N more`；related-symbols 上限 10；生成文件（.pb.go/mocks）排末。这是"one base two diets"的字面验收——human diet **v1 即与 agent 共生，不是 v2 afterthought**（覆盖旧 ADR 0013-0016）。

(2) **要动的文件**：`src/codegraph/context/format.ts`（formatSubgraphTree）→ 喂 `src/report/html.ts`（791 行，已存在）的可折叠区段。

(3) **可抄代码**（源: `/tmp/tk-research/codegraph/src/context/formatter.ts:124` 与 :206，verbatim）：
```ts
export function formatSubgraphTree(subgraph: Subgraph, entryPoints: Node[]): string {
  const lines: string[] = [];
  const printed = new Set<string>();
  const outgoing = new Map<string, Edge[]>();
  for (const edge of subgraph.edges) {
    const existing = outgoing.get(edge.source) ?? [];
    existing.push(edge); outgoing.set(edge.source, existing);
  }
  for (const entry of entryPoints) {
    formatNodeTree(entry, subgraph, outgoing, printed, lines, 0, '');
    lines.push('');
  }
  const remaining: Node[] = [];
  for (const node of subgraph.nodes.values())
    if (!printed.has(node.id)) remaining.push(node);
  if (remaining.length > 0 && remaining.length <= 10) {
    lines.push('Other relevant symbols:');
    for (const node of remaining) {
      const location = node.startLine ? `:${node.startLine}` : '';
      lines.push(`  ${node.kind}: ${node.name} (${node.filePath}${location})`);
    }
  } else if (remaining.length > 10) {
    lines.push(`... and ${remaining.length} more related symbols`);
  }
  return lines.join('\n').trim();
}
// per-kind 收口 (formatter.ts:206, verbatim):
//   if (kindEdges.length > 3) {
//     ...lines.push(`${newPrefix}├── ${kind}: ${names} and ${kindEdges.length - 3} more`);
//   }
// depth 界 (formatter.ts:224, verbatim): if (depth < 1) { for (const edge of significantEdges.slice(0, 3)) ... }
```

(4) **具体数值**：related-symbols ≤10；per-kind >3 收口；递归 depth<1；每节点最多展 3 条 significant edge。

(6) **测试**：同一 subgraph 喂两 formatter → agent Markdown 与 human 树引用同一组 node id（"one base"断言）；>10 个剩余 symbol 时出 `... and N more`。

(7) **证据回指**：formatter.ts:124/:206/:224。DEP：H（HTML viewer 渲染此 diet，read-only）、conflict(I,H) 决议=v1 文件态 round-trip 不在 HTML 内编辑。

---

### 决策 A9 — PageRank/personalization 出 v1（FTS+结构排序足够）   服务 B

(1) **决策**：v1 排序 = FTS 分 + exact-name co-location boost（同文件每多一个 query 符号 +20）+ dominant-file boost（一文件边数 ≥3× 次高）+ multi-term 乘性 boost（2 词→2×，3 词→2.5×）。PageRank 作为 v2 可选升级，仅在实测 FTS 排序 under-recall 时重开。

(4) **具体数值**：co-location +20/extra symbol；dominant 阈 ≥3×；multi-term ×2 / ×2.5。

(3) **可抄代码**（源: `/tmp/tk-research/codegraph/src/context/index.ts:820`，co-location boost，verbatim）：
```ts
info.result.score = info.result.score * (1 + info.termCount) + (info.termCount - 1) * 30;  // index.ts:820
```
> 注：dossier 文字写"+20/extra symbol"，但 clone 实测此行系数为 `* 30`（已改写说明：以 clone 源为准，+30/extra term）。dominant-file 阈 `>= 3 * nextEdgeCount` 见 index.ts:642（A5 已贴）。aider 替代方案（deferred，源: repograph/construct_graph.py:416）：`personalization[rel_fname]=10/len(fnames)`，仅在 under-recall 时引入。

(6) **测试**：双词 query 命中分 ≈ 单词 ×2；同文件多符号命中排名上升；harness 记录 recall@k，<阈值才重开 PageRank。

(7) **证据回指**：index.ts:820/:642；repograph/construct_graph.py:416。

---

### 决策 A10 — 低置信诚实兜底（两 diet 强制）   服务两者

(1) **决策**：当 entry point 仅解析到孤立 common-word 命中，发哨兵 `### ⚠️ Low-confidence match`，让 agent/human 改用精确符号或直接 Read——绝不给自信的错答。常量放 dependency-free 叶子模块，MCP detector 直接 import，不拖 context 依赖上冷启动。

(3) **可抄代码**（源: `/tmp/tk-research/codegraph/src/context/markers.ts:19`，verbatim）：
```ts
export const LOW_CONFIDENCE_MARKER = '### ⚠️ Low-confidence match';
```

(2) **要动的文件**：`src/codegraph/context/markers.ts`（叶子）；`build.ts` 发射、F 的 MCP 层 import 检测。

(6) **测试**：query 仅命中常用词 → 输出含哨兵且抑制"comprehensive"页脚；emitter 与 detector 共享常量（字符串相等断言）。

(7) **证据回指**：markers.ts:19。下游 J（信任契约）、M19。

---

### 决策 A11 — embeddings 与 LSP-as-core 排除   服务两者

(1) **决策**：embeddings（Family D）与 LSP-as-core（Family E）排除出底座。LSP/SCIP 可作已配置项目的可选补充；SCIP 是可后续 emit/consume 的可移植交换格式。

(2) **要动的文件**：无新代码——记录于 design doc 的"排除"段；C 保留列、D14、M18 引用此决策。

(3) **可抄代码**："需实现时补"——本决策为排除性裁定，无可抄代码。理由锚点：embeddings 需 model（~100MB–1GB 本地 OR API key + code egress）+ vector store，违反 LLM anchor 与 no-native-build，且不可验证（Sourcegraph Cody 规模化后撤离 embeddings）；LSP 需 per-language runtime（下载+预热），太重且被 Windows install-base 历史否决。

(4) **具体数值**：research §9 兼容矩阵——embeddings/RL-explorer = 🔴；LSP-as-core = 🟡（仅补充）；SCIP = 🟡（可移植 emit/consume）。

(6) **测试**：依赖审计——`package.json` 不含任何 embedding/vector/LSP runtime 依赖；冷启动无 model 下载。

(7) **证据回指**：research §9；§7.3（Cody 撤离）。下游 B9、C（reserve-only）、D14、M18。

---

### 决策 A12 — 无索引即不激活（VS Code 上仅在 .tk DB 存在且新鲜时广告工具）   服务 B

(1) **决策**：无 index 则表征不注册/不服务任何东西；索引保持用户显式选择。VS Code 上 MCP 工具仅当索引 DB 存在且 fresh 时才 advertise——空/缺图绝不污染工具列表或误导。

(3) **可抄代码**（源: `/tmp/tk-research/codegraph/src/mcp/session.ts:209`，verbatim）：
```ts
instructions: indexed ? SERVER_INSTRUCTIONS : SERVER_INSTRUCTIONS_UNINDEXED,
```
（source-instructions 双串源: server-instructions.ts，import 见 session.ts:19）

(4) **具体数值**：indexed 布尔由 DB 文件存在 + 新鲜度（E 的 lazy mtime check + index_generation 比对）决定。

(6) **测试**：删 DB 后启动 MCP → 工具列表不含 tk_explore/tk_search（仅 UNINDEXED 指引）；建 DB 后重启 → 工具出现。

(7) **证据回指**：session.ts:209 / :19。下游 F（工具门控）、E（新鲜度判定）。

---

### stillOpenForUser（A 相关，需你拍板）
- **版本闸**：D+A 已关闭 Node 25 / `--liftoff-only`——请确认接受 `>=22.5.0 <25.0.0` + vendored Node 24.x 作单一跨需求版本锚。
- **A9 personalization**：v1 出局；仅实测 FTS+结构排序在 conversation-context query 上 under-recall 时重开——确认 v1 不需要。
- **embeddings/SCIP/PageRank** 全部 committed OUT of v1——确认 v1 scope 不需要。
- **Human diet 形态**（A8/H）：v1 默认 live HTML（html.ts 按需打开）；是否同时出 CodeWiki 式 self-contained `index.html` 静态工件归 H 决策，A 只要求同一子图喂它。


---

## 需求 B — Intelligence source（静态 / LLM / 混合）

本节落实 DEP MAP 中 B 的承诺：**HYBRID = 确定性静态内核（authoritative，always-on，承载整条 find-code/agent 路径）+ 宿主借用/订阅 CLI 生成层（opt-in，host-paid，仅叙事）+ 纯 Node 确定性兜底**。边界画在 **field 粒度**，由 `provenance` 列（`static|llm|template`）承载；检索排序一律 `WHERE provenance='static'`，使 LLM 字段永远无法改变 find-code 结果。绝不内置 API key、绝不花模型 token。上游约束：A 的「一个图库 + 两份 diet」、C 的物理表（provenance/file:line/staleness 列）、L 的版本闸门 `>=22.5.0 <25.0.0`。

下文每条决策标注「服务 A/B/两者」。所有被粘贴的代码已用 Read 逐一打开核对，标注「源: <clone路径:行号>」；与 dossier 候选不符处已订正并注明。

---

### B-D1 静态/LLM 边界 = node schema 上的 per-field 契约（服务 两者）

**(1) 决策：** 边界不是 per-feature 开关，而是 schema 上的 per-field 契约。STATIC（确定性、authoritative、永远存在）= node 的 `id/type/name/filePath/lineRange/params/exports.isDefault`、`{imports,exports,contains,calls,inherits,implements}` 边、`importCount/exportCount/functionCount/classCount` 指标、非代码节点的 `sections/definitions/endpoints/services/resources`。LLM-GENERATED（可选、provenance 打标、永不进检索排序）= `summary/tags/languageNotes`、`layer.name/description`、`tour[].title/description`、concept 节点、语义边 `{related,similar_to,depends_on-by-intent}`。检索/边遍历一律只读 static 字段——缺失或未校验的 LLM 字段绝不能改变 find-code 结果。

**(2) 要动的文件：**
```
src/codegraph/
  intelligence/
    fieldContract.ts        # 新建：STATIC_FIELDS / LLM_FIELDS 白名单 + 断言
    extractStatic.ts        # 新建：buildResult() 的 tk 改写（tree-sitter→静态节点）
  store/
    schema.sql              # C 拥有的 DDL；本节追加 provenance 列约束（见下）
```

**(3) 可抄代码：** 静态集完全可由 tree-sitter 派生、零模型——这是 understand-anything `buildResult()` 已证明的（纯函数、无 I/O）。tk 直接复用其映射结构（已改写为 tk 的 `kind` 枚举命名，但字段语义一一对应）。

```javascript
// 源: /tmp/tk-research/understand-anything/understand-anything-plugin/skills/understand/extract-structure.mjs:146  （verbatim）
export function buildResult(file, totalLines, nonEmptyLines, analysis, callGraph, batchImportData) {
  const base = {
    path: file.path,
    language: file.language,
    fileCategory: file.fileCategory,
    totalLines,
    nonEmptyLines,
  };
  if (!analysis) {
    base.metrics = {};               // 无 parser 匹配 → 仅基础指标
    return base;
  }
  if (analysis.functions && analysis.functions.length > 0) {
    base.functions = analysis.functions.map(fn => ({
      name: fn.name,
      startLine: fn.lineRange[0],
      endLine: fn.lineRange[1],
      params: fn.params || [],
    }));
  }
  // classes / exports / sections / definitions / services / endpoints / steps / resources 同样确定性派生
  if (callGraph && callGraph.length > 0) { base.callGraph = callGraph; }
  const metrics = {};
  const importPaths = batchImportData?.[file.path];
  if (importPaths && importPaths.length > 0) { metrics.importCount = importPaths.length; }
  else if (analysis.imports) {
    metrics.importCount = analysis.imports.filter(imp => (imp?.source ?? '').startsWith('.')).length;
  }
  if (analysis.exports) metrics.exportCount = analysis.exports.length;
  if (analysis.functions) metrics.functionCount = analysis.functions.length;
  if (analysis.classes) metrics.classCount = analysis.classes.length;
  base.metrics = metrics;
  return base;
}
```

provenance 列契约（C 拥有 DDL，本节定义其约束语义；已改写为 tk 表名）：

```sql
-- 已改写（tk 适配，C5/C6 表上的列契约）。检索路径只查 static。
-- summary / tags / narrative 字段表上：
ALTER TABLE node_summary ADD COLUMN provenance TEXT
  CHECK (provenance IN ('static','llm','template')) NOT NULL DEFAULT 'static';

-- 任何排序 / 边遍历 / FTS 召回都加此过滤：
-- SELECT ... FROM node JOIN node_fts ... WHERE node_summary.provenance = 'static';
```

字段白名单断言（需实现时补；核心是把上面 buildResult 的输出键集合冻结为 STATIC_FIELDS）：

```typescript
// 已改写（tk 新建）。LLM 写入前必须经过此白名单——禁止 LLM 触碰 STATIC_FIELDS。
export const STATIC_FIELDS = new Set([
  'id','type','name','filePath','lineRange','params','exports',
  'imports','contains','calls','inherits','implements',
  'importCount','exportCount','functionCount','classCount',
  'sections','definitions','endpoints','services','resources',
]);
export const LLM_FIELDS = new Set([
  'summary','tags','languageNotes','layerName','layerDescription',
  'tourTitle','tourDescription','concept','related','similar_to',
]);
export function assertNoStaticOverwrite(patch: Record<string, unknown>) {
  for (const k of Object.keys(patch)) {
    if (STATIC_FIELDS.has(k)) throw new Error(`LLM field '${k}' may not overwrite a STATIC field`);
  }
}
```

**(4) 具体数值：** provenance CHECK 取值恰 3 个 `static|llm|template`，DEFAULT `'static'`。检索过滤谓词固定为 `provenance='static'`（0 例外）。

**(5) 有序步骤：**
1. 在 C 的 schema.sql 上为 summary/tags/narrative 表加 provenance 列（独立可发布：纯 DDL，默认 static 不改变现有行为）。
2. 落地 `extractStatic.ts`（移植 buildResult），产出仅 STATIC_FIELDS 的节点。
3. 落地 `fieldContract.ts` 白名单 + `assertNoStaticOverwrite`，接到任何 LLM 写入入口前。

**(6) 测试：**
- 单测：对 tk-repo 一个 fixture 文件跑 extractStatic，断言输出键 ⊆ STATIC_FIELDS，且无 `summary/tags`。
- 单测：`assertNoStaticOverwrite({name:'x'})` 抛错；`({summary:'y'})` 通过。
- A-B harness 字段：检索 arm 跑在 provenance 过滤下，断言结果集与「整库无 provenance 列」时按 file:line 完全一致（LLM 字段不影响召回）。

**(7) 证据回指：** extract-structure.mjs:146-304（已读核对，纯函数无模型）；DEP MAP B drives「C5/C6 carry provenance; FTS over static-only」。

---

### B-D2 生成委派机制 = HOST-FIRST，CLI-SECOND，绝不 API（服务 两者）

**(1) 决策：** 主路径 = `SKILL.md`/slash-command（`/tk understand`），由 **宿主 agent**（主：VS Code Copilot/Windows；次：Claude Code/macOS）执行——tk 发出确定性编排计划 + 静态事实，宿主自己的模型填叙事，tk 解析返回的 JSON。次路径（headless/非交互）= caw 式后端 shell out 到用户本地 `claude`/`codex` CLI（OAuth 订阅）。tk **绝不**用 api_key 构造 LLM 客户端。

**(2) 要动的文件：**
```
src/codegraph/intelligence/
  delegate/
    hostSkill.ts        # 新建：发编排计划 + 静态事实，解析宿主返回 JSON
    cawBackend.ts       # 新建：caw 式订阅 CLI 后端（presence gate）
    providers.ts        # 新建：provider→CLI 二进制映射 + 工具组
skills/tk-understand/
  SKILL.md              # 新建：宿主 slash-command 编排（phases）
```

**(3) 可抄代码：** caw 后端的 provider 映射 + presence gate 直接复用（已改写为 TS）。源码 verbatim：

```python
# 源: /tmp/tk-research/codewiki/codewiki/src/be/caw_backend.py:47  （verbatim）
_CAW_PROVIDER_MAP = {
    "claude-code": "claude_code",
    "codex": "codex",
}
_CLI_BINARY = {
    "claude-code": "claude",
    "codex": "codex",
}
```

```python
# 源: /tmp/tk-research/codewiki/codewiki/src/be/caw_backend.py:132  （verbatim，presence gate + 超时环境变量）
        cli = _CLI_BINARY[config.provider]
        if shutil.which(cli) is None:
            raise RuntimeError(
                f"Subscription mode requires the '{cli}' CLI on PATH. "
                f"Install it and run '{cli} login', then try again."
            )
        if self._caw_provider == "claude_code":
            os.environ.setdefault("MCP_TOOL_TIMEOUT", "86400000")
            os.environ.setdefault("MCP_TIMEOUT", "60000")
```

tk 改写（TS，按 Windows PATHEXT 解析二进制，复用 tk 既有 resolveProgram）：

```typescript
// 已改写（tk 适配 caw_backend.py:47/132-144）。Windows 用 PATHEXT(.cmd/.exe) 经 tk resolveProgram 解析。
const CLI_BINARY = { 'claude-code': 'claude', 'codex': 'codex' } as const;

export function ensureSubscriptionCli(provider: keyof typeof CLI_BINARY): string {
  const cli = CLI_BINARY[provider];
  const resolved = resolveProgram(cli);              // tk 既有：win 走 PATHEXT
  if (!resolved) {
    throw new Error(
      `Subscription mode requires the '${cli}' CLI on PATH. ` +
      `Install it and run '${cli} login', then try again.`,
    );
  }
  if (provider === 'claude-code') {
    process.env.MCP_TOOL_TIMEOUT ??= '86400000';      // 24h，扛长递归
    process.env.MCP_TIMEOUT ??= '60000';
  }
  return resolved;
}
```

**(4) 具体数值：** `MCP_TOOL_TIMEOUT=86400000`（24h），`MCP_TIMEOUT=60000`（60s）。两条均 `setdefault`/`??=`（保留用户覆盖）。当既无宿主 slash-command 上下文、又无 logged-in CLI → 跳过生成，直接 ship static-only（B-D7）。

**(5) 有序步骤：**
1. 落地 `providers.ts`（映射 + `ensureSubscriptionCli`，纯解析，可独立单测）。
2. 落地 `SKILL.md` + `hostSkill.ts`（主路径：发计划→解析 JSON，无模型调用）。
3. 落地 `cawBackend.ts`（次路径：headless 才走，shell out CLI）。

**(6) 测试：**
- 单测：PATH 无 `claude` 时 `ensureSubscriptionCli('claude-code')` 抛含安装提示的错误；mock 存在时返回路径并设两环境变量。
- 单测：宿主返回带 envelope 的 JSON，`hostSkill.ts` 仍解析成功（与 B-D5 normalizer 串联）。
- 断言：grep 全仓 `new OpenAI|api_key|AsyncOpenAI` 命中 0（CI gate）。

**(7) 证据回指：** caw_backend.py:1-6（OAuth、no API key，已读核对）、:47-55（映射）、:132-144（presence gate + 超时，已读核对）；landscape codegraph-wiki-landscape-20260618.md:51（caw OAuth on-brand）。

---

### B-D3 借用 agent 的工具面 = READ + PARALLEL only，写经 tk 校验工具（服务 A）

**(1) 决策：** 借来的生成 agent 工具组限制为 READER|PARALLEL；禁宿主 Write/Edit/NotebookEdit/Bash，强制所有写经过 tk 自有的 editor 工具，使校验统一在每次写时运行。codex 需额外加 EXEC（否则非交互 `codex exec` 会取消 MCP 工具调用）。

**(2) 要动的文件：**
```
src/codegraph/intelligence/delegate/providers.ts   # 工具组映射（接 B-D2）
```

**(3) 可抄代码：** verbatim 源：

```python
# 源: /tmp/tk-research/codewiki/codewiki/src/be/caw_backend.py:62  （verbatim）
_AGENT_TOOL_GROUP = ToolGroup.READER | ToolGroup.PARALLEL

def _agent_tool_group_for_provider(provider: str) -> ToolGroup:
    if provider == "codex":
        # codex exec 在非交互模式取消 MCP 工具调用；加 EXEC → 映射到
        # --dangerously-bypass-approvals-and-sandbox，是 MCP 工具可靠运行的模式
        return _AGENT_TOOL_GROUP | ToolGroup.EXEC
    return _AGENT_TOOL_GROUP
```

**(4) 具体数值：** 工具组 = `READER|PARALLEL`（claude）/ `READER|PARALLEL|EXEC`（codex）。WRITER/INTERACTION/WEB 全关。

**(5) 有序步骤：**
1. 在 `providers.ts` 暴露 `toolGroupForProvider(provider)`，claude 返 READER|PARALLEL，codex 加 EXEC（独立可测）。

**(6) 测试：** 单测 `toolGroupForProvider('codex')` 含 EXEC，`('claude-code')` 不含 EXEC 且不含 WRITER。

**(7) 证据回指：** caw_backend.py:62-77（已读核对，含 codex EXEC 注释）；caw_toolkit.py:219-221（写时跑 Mermaid 校验，见 B-D6）。

---

### B-D4 Prompt 构造 = 纯静态上下文装配 → 格式化 → 宿主（服务 两者）

**(1) 决策：** 一个纯函数遍历静态图（目标的 1-hop 邻居、contains-children、layer），一个 formatter 输出以显式 `## Instructions` 结尾的 markdown prompt。两个函数内部均不调用模型——token 成本恰等于静态事实，无投机检索。

**(2) 要动的文件：**
```
src/codegraph/intelligence/
  buildExplainContext.ts   # 新建：纯图遍历
  formatExplainPrompt.ts   # 新建：固定指令块格式化
```

**(3) 可抄代码：** understand-anything `formatExplainPrompt()` verbatim（纯字符串拼接，宿主填其余）：

```typescript
// 源: /tmp/tk-research/understand-anything/understand-anything-plugin/src/explain-builder.ts:108  （verbatim 摘录）
export function formatExplainPrompt(ctx: ExplainContext): string {
  const { targetNode, childNodes, connectedNodes, relevantEdges, layer } = ctx;
  const lines: string[] = [];
  lines.push(`# Deep Dive: ${targetNode.name}`);
  lines.push(`**Type:** ${targetNode.type} | **Complexity:** ${targetNode.complexity}`);
  if (targetNode.filePath) lines.push(`**File:** \`${targetNode.filePath}\``);
  if (targetNode.lineRange) lines.push(`**Lines:** ${targetNode.lineRange[0]}-${targetNode.lineRange[1]}`);
  lines.push(`**Summary:** ${targetNode.summary}`);
  if (layer) { lines.push(`## Architectural Layer: ${layer.name}`); lines.push(layer.description); }
  if (childNodes.length > 0) {
    lines.push("## Internal Components");
    for (const child of childNodes) lines.push(`- **${child.name}** (${child.type}): ${child.summary}`);
  }
  if (connectedNodes.length > 0) {
    lines.push("## Connected Components");
    for (const node of connectedNodes) lines.push(`- **${node.name}** (${node.type}): ${node.summary}`);
  }
  if (relevantEdges.length > 0) {
    const nodeMap = new Map([...[targetNode], ...childNodes, ...connectedNodes].map(n => [n.id, n]));
    lines.push("## Relationships");
    for (const edge of relevantEdges) {
      if (edge.type === "contains") continue;
      const src = nodeMap.get(edge.source)?.name ?? edge.source;
      const tgt = nodeMap.get(edge.target)?.name ?? edge.target;
      lines.push(`- ${src} --[${edge.type}]--> ${tgt}${edge.description ? ` — ${edge.description}` : ""}`);
    }
  }
  lines.push("## Instructions");
  lines.push("Provide a thorough explanation of this component:");
  lines.push("1. What it does and why it exists in the project");
  lines.push("2. How data flows through it (inputs, processing, outputs)");
  lines.push("3. How it interacts with connected components");
  lines.push("4. Any patterns, idioms, or design decisions worth noting");
  lines.push("5. Potential gotchas or areas of complexity");
  return lines.join("\n");
}
```

`buildExplainContext(graph, path) -> ExplainContext`（target/children/connected/edges/layer 的纯遍历，verbatim 返回结构见 explain-builder.ts:100-103，已读核对）。

**(4) 具体数值：** 邻居跨度 = 1-hop。指令块固定 5 点。`temperature=0.0` 传入但对订阅 CLI 视为 unused（CLI 不暴露 temperature）。

**(5) 有序步骤：**
1. 落地 `buildExplainContext.ts`（纯遍历，可单测，零 token）。
2. 落地 `formatExplainPrompt.ts`（移植上面 verbatim）。

**(6) 测试：** 单测：给定 fixture graph，`formatExplainPrompt` 输出以 `## Instructions` 结尾且含 5 行编号；断言函数内无网络/模型调用（spy）。

**(7) 证据回指：** explain-builder.ts:22-103（纯遍历）、:108-193（固定指令块，已读核对）；caw_backend.py:160（temperature unused 注释）。

---

### B-D5 输出解析 + 确定性归一化（强制，无 LLM 也跑）（服务 A）

**(1) 决策：** 任何生成后跑纯 Node normalizer：解 `{layers:[...]}`/`{steps:[...]}` envelope、改名 legacy 字段（`nodes→nodeIds`、`nodesToInspect→nodeIds`、`whyItMatters→description`）、合成缺失 id（`layer:<kebab>`）、把裸路径转前缀 id、DROP dangling refs。no-LLM 路径用同一份代码（作用在 template stub 上）。

**(2) 要动的文件：**
```
src/codegraph/intelligence/normalize.ts   # 新建：envelope/legacy/id/dangling 归一化
```

**(3) 可抄代码：** understand-anything SKILL.md Phase 4/5 规定的有序步骤（verbatim 规格，tk 实现为纯函数）：

```text
源: /tmp/tk-research/understand-anything/understand-anything-plugin/skills/understand/SKILL.md:447  （verbatim 步骤，layers）
1. Unwrap envelope: { "layers": [...] } → 内层数组
2. Rename legacy: nodes → nodeIds（若为对象取 .id）
3. Synthesize missing IDs: 缺 id → layer:<kebab-case-name>
4. Convert file paths: 无已知前缀(file:/config:/document:/service:/pipeline:/table:/schema:/resource:/endpoint:)的裸路径 → file:<relative-path>
5. Drop dangling refs: 删除不在 merged node set 中的 nodeIds
```
```text
源: /tmp/tk-research/understand-anything/understand-anything-plugin/skills/understand/SKILL.md:525  （verbatim 步骤，tour）
1. Unwrap envelope: { "steps": [...] } → 内层数组
2. Rename legacy: nodesToInspect → nodeIds; whyItMatters → description
3. Convert file paths（同上前缀集）
4. Drop dangling refs
5. Sort by order
```

tk 实现骨架（需实现时补完 kebab/前缀转换；已改写）：

```typescript
// 已改写（tk 实现 SKILL.md:447-454 / 525-531 的有序步骤）。无 LLM 时作用在 template stub 上。
const ID_PREFIXES = ['file:','config:','document:','service:','pipeline:','table:','schema:','resource:','endpoint:'];
export function normalizeLayers(raw: unknown, nodeIdSet: Set<string>): Layer[] {
  let arr = Array.isArray(raw) ? raw : (raw as any)?.layers ?? [];
  return arr.map((l: any) => {
    let nodeIds = l.nodeIds ?? l.nodes ?? [];
    nodeIds = nodeIds.map((n: any) => (typeof n === 'string' ? n : n.id));
    const id = l.id ?? `layer:${kebab(l.name)}`;
    nodeIds = nodeIds.map((n: string) => (ID_PREFIXES.some(p => n.startsWith(p)) ? n : `file:${n}`));
    nodeIds = nodeIds.filter((n: string) => nodeIdSet.has(n));   // drop dangling
    return { ...l, id, nodeIds };
  });
}
```

**(4) 具体数值：** id 前缀集恰 9 个。归一化通过一次后仍失败 → 带 warnings 保存并跳过 dashboard/report 自动启动（不重试第二次）。

**(5) 有序步骤：**
1. 落地 `normalizeLayers` / `normalizeTour`（纯函数，可单测）。
2. 接到 B-D2 宿主返回解析后、B-D6 校验前。

**(6) 测试：** 单测：喂 `{layers:[{name:'Core Engine',nodes:[{id:'file:a.ts'},'b.ts']}]}` + nodeSet `{file:a.ts}`，断言输出 `id='layer:core-engine'`、`nodeIds=['file:a.ts']`（`b.ts→file:b.ts` 因 dangling 被删）。

**(7) 证据回指：** SKILL.md:447-454、525-531（已读核对，「LLMs may still produce an envelope」）。

---

### B-D6 校验默认 = 纯 Node 校验器；LLM reviewer 仅 `--review`（服务 两者）

**(1) 决策：** 默认走纯 Node 校验器：节点须有 `id/type/name/summary/tags`、无重复 id、每条边 source/target 可解析、每个 file 级节点恰属一 layer、每个 tour/layer 的 nodeId 存在、orphan 警告。每个 LLM 生成的 mermaid/diagram 语法校验，能修则修否则移除。LLM reviewer 仅在 `--review` 时跑。

**(2) 要动的文件：**
```
src/codegraph/intelligence/
  validate.ts          # 新建：纯 Node 校验器 + auto-fix
  mermaidRepair.ts     # 新建：fix-or-remove（移植 repodoc）
```

**(3) 可抄代码：** understand-anything 校验器 stats 形状 verbatim：

```javascript
// 源: /tmp/tk-research/understand-anything/understand-anything-plugin/skills/understand/SKILL.md:650  （verbatim）
const stats = {
  totalNodes: graph.nodes.length,
  totalEdges: graph.edges.length,
  totalLayers: graph.layers.length,
  tourSteps: graph.tour.length,
  nodeTypes: graph.nodes.reduce((a, n) => { a[n.type] = (a[n.type]||0)+1; return a; }, {}),
  edgeTypes: graph.edges.reduce((a, e) => { a[e.type] = (a[e.type]||0)+1; return a; }, {})
};
fs.writeFileSync(outputPath, JSON.stringify({ issues, warnings, stats }, null, 2));
```

auto-fix 规格 verbatim（SKILL.md:707-710）：`empty tags→['untagged']`、`empty summary→'No summary available'`、删 dangling 边、移除 invalid-type 节点。

Mermaid fix-or-remove 移植 repodoc verbatim：

```python
# 源: /tmp/tk-research/repodoc/repodoc/src/utils.py:218  （verbatim 摘录）
def validate_and_fix_links(docs_dir, remove_broken=True, fix_mermaid=True):
    results = {"fixed": [], "skipped": [], "removed": [], "mermaid_fixed": []}
    for md_file in glob.glob(os.path.join(docs_dir, "**/*.md"), recursive=True):
        # ... 删 broken link：[text](broken) → text ...
        if fix_mermaid:
            mermaid_fixed = fix_invalid_mermaid(content)
            if mermaid_fixed != content:
                content = mermaid_fixed
                results["mermaid_fixed"].append(rel_path)
    return results
```

codewiki 在每次 `.md` 写时跑 Mermaid 校验 verbatim：

```python
# 源: /tmp/tk-research/codewiki/codewiki/src/be/caw_toolkit.py:219  （verbatim）
        if command != "view" and path.endswith(".md"):
            mermaid_validation = await validate_mermaid_diagrams(absolute_path, path)
            result = result + "\n---------- Mermaid validation ----------\n" + mermaid_validation
```

**(4) 具体数值：** 校验器输出 `{issues[], warnings[], stats{totalNodes,totalEdges,totalLayers,tourSteps,nodeTypes,edgeTypes}}`。归一化+修复一次后仍有 critical issues → 保存但跳过自动启动。Mermaid：能修则修，否则移除（不留半成品图）。

**(5) 有序步骤：**
1. 落地 `validate.ts`（纯 Node，可单测，无 LLM 也产出 stats）。
2. 落地 `mermaidRepair.ts`（fix-or-remove），接到任何 LLM diagram 写入后。
3. `--review` 旗标下才 dispatch LLM graph-reviewer（次序在纯 Node 之后）。

**(6) 测试：**
- 单测：含一条 dangling 边 + 一个空 tags 节点的 graph → 校验后边被删、tags=`['untagged']`，stats 计数正确。
- 单测：非法 mermaid 文本 → repair 返回的内容要么是合法图、要么图块被移除（断言不含原非法语法）。

**(7) 证据回指：** SKILL.md:597-663（默认纯 Node）、:676-700（`--review` LLM）、:650-660/707-710（stats+auto-fix，已读核对）；utils.py:218-279（已读核对）；caw_toolkit.py:219-221（已读核对）。

---

### B-D7 No-LLM 降级模式 = 一等公民（服务 两者）

**(1) 决策：** 无宿主模型且无 logged-in CLI 时，仍 ship：完整静态图 + FTS 索引（**job B 完全可用**）+ TEMPLATE 派生 summary（`provenance='template'`），形如 `function <name>(<params>) at <file>:<lines>, calls {callees}, called by {callers}`。纯叙事字段（layer.description 散文、tour rationale、concept 节点）**省略不编造**。

**(2) 要动的文件：**
```
src/codegraph/intelligence/templateSummary.ts   # 新建：纯字符串 format over 静态分析
```

**(3) 可抄代码：** template summary 字段是对静态分析输出（`functions[].name/params`、`callGraph[].caller/callee`）的纯字符串格式化——源数据见 extract-structure.mjs:163-168（functions 映射，B-D1 已粘贴）与 callGraph 透传（:246-248，已读核对）。

```typescript
// 已改写（tk 新建）。源数据 = extract-structure.mjs:163-168 functions / :246-248 callGraph。
export function templateSummary(fn: { name: string; params: string[]; startLine: number; endLine: number },
                                filePath: string, callees: string[], callers: string[]): { text: string; provenance: 'template' } {
  const ps = fn.params.join(', ');
  const callsPart = callees.length ? `, calls {${callees.join(', ')}}` : '';
  const calledPart = callers.length ? `, called by {${callers.join(', ')}}` : '';
  return {
    text: `function ${fn.name}(${ps}) at ${filePath}:${fn.startLine}-${fn.endLine}${callsPart}${calledPart}`,
    provenance: 'template',
  };
}
```

UI/report 渲染时，叙事缺失处显示 affordance：`narrative not generated — run /tk understand with a logged-in agent`，而非假段落。

**(4) 具体数值：** template summary 0 token、0 模型。叙事字段缺失 = 显式 affordance 文本（固定 1 行）。job B 检索面在此模式下 100% 可用。

**(5) 有序步骤：**
1. 落地 `templateSummary.ts`（纯函数，可单测）。
2. 生成入口检测：无宿主上下文且 `resolveProgram('claude'/'codex')` 均空 → 走 template 路径并写 `provenance='template'`。
3. 渲染层对空叙事字段输出 affordance。

**(6) 测试：**
- 单测：给定 fn + callees/callers，`templateSummary` 输出含 `at file:line` 与 `calls {...}`，`provenance='template'`。
- A-B harness：在 PATH 清空 claude/codex 的 arm 下跑 job B 检索任务集，断言召回与有 LLM 的 arm **逐条一致**（job B 不依赖 LLM）。

**(7) 证据回指：** extract-structure.mjs:163-168/246-248（静态源，已读核对）；项目 memory「tk wraps real tools, never fabricates」；DEP MAP「B7 no-LLM mode is the K baseline」。

---

### B-D8 生成成本控制 = 仅在 multi-file ∧ 超 token 阈值 ∧ 在深度预算内才委派子 agent（服务 A）

**(1) 决策：** 逐字借用 codewiki：仅当模块多文件 **且** token 数 ≥ 阈值 **且** 深度 < max_depth 才委派子 agent；否则 inline 写单个 leaf doc。这是系统里唯一的 LLM 花费的省 token 闸门。

**(2) 要动的文件：**
```
src/codegraph/intelligence/delegate/canDelegate.ts   # 新建：委派闸门
src/codegraph/intelligence/config.ts                 # 新建：MAX_DEPTH/leaf 阈值默认
```

**(3) 可抄代码：** verbatim 闸门：

```python
# 源: /tmp/tk-research/codewiki/codewiki/src/be/caw_backend.py:252  （verbatim）
        num_tokens = count_tokens(components_with_code)
        can_delegate = (
            is_complex_module(components, core_component_ids)
            and start_depth < config.max_depth
            and num_tokens >= config.max_token_per_leaf_module
        )
```

默认值 verbatim：

```python
# 源: /tmp/tk-research/codewiki/codewiki/src/config.py:16  （verbatim 摘录）
MAX_DEPTH = 2
DEFAULT_MAX_TOKEN_PER_LEAF_MODULE = 16_000
MAIN_MODEL = os.getenv('MAIN_MODEL', 'claude-sonnet-4')
```

tk 改写（TS）：

```typescript
// 已改写（tk 适配 caw_backend.py:252-257 + config.py:16/20/40）。
export const MAX_DEPTH = 2;
export const MAX_TOKEN_PER_LEAF_MODULE = 16_000;
export function canDelegate(module: ModuleInfo, startDepth: number): boolean {
  return isComplexModule(module)
    && startDepth < MAX_DEPTH
    && countTokens(module.componentsWithCode) >= MAX_TOKEN_PER_LEAF_MODULE;
}
```

**(4) 具体数值：** `MAX_DEPTH=2`、`MAX_TOKEN_PER_LEAF_MODULE=16_000`。三条件全真才委派。MAIN_MODEL 默认 `claude-sonnet-4`（订阅 CLI 透传）。（stillOpen：是否对 tk 自身代码库重新标定阈值，待 Slice-1 measurement harness 出真实项目尺寸。）

**(5) 有序步骤：**
1. 落地 `config.ts`（常量，独立可发布）。
2. 落地 `canDelegate.ts`（纯判定，可单测）。

**(6) 测试：** 单测：`canDelegate(single-file 模块, 0)` = false；`(complex multi-file 18k-token, 0)` = true；`(complex 18k, 2)` = false（深度耗尽）。

**(7) 证据回指：** caw_backend.py:253-257（已读核对）；config.py:16/20/40（已读核对）。

---

### B-D9 拒绝 embeddings 作为默认构建的 intelligence source（服务 B）

**(1) 决策：** 默认构建无向量模型、find-code 路径无语义相似检索。embeddings 会 (a) 需模型/API key 或重本地运行时（违反 strong lean + Windows 可移植），(b) 重新引入「语义匹配上的 false confidence」失败模式。检索 = FTS5（符号/标识符文本）+ 图边遍历（imports/calls/contains）。`similar_to/related` 边仅作 `provenance='llm'` 的人类面提示，agent 排序器永不查（由 B-D1 provenance 过滤强制）。

**(2) 要动的文件：**
```
src/codegraph/store/retrieve.ts   # 检索：FTS5 + 边遍历，强制 provenance='static'
（无 embedding 依赖、无向量表——即「不动」的承诺）
```

**(3) 可抄代码：** 无新增代码——这是「不引入」的决策。检索谓词复用 B-D1 的 `WHERE provenance='static'`；similar_to/related 边写入时强制打 `provenance='llm'` 且 retrieve.ts 的排序子句不含这些边类型。被拒模式（repodoc 内置 api_key 客户端）作为反例固定，CI gate 禁止其出现：

```python
# 源: /tmp/tk-research/repodoc/repodoc/src/llm.py:43  （verbatim — tk 必须不 ship 的模式）
    client = OpenAI(
        base_url=config.llm_base_url,
        api_key=config.llm_api_key,
    )
```
> 订正：dossier 候选称此处为 `AsyncOpenAI`；实读 llm.py:38/43 为同步 `from openai import OpenAI` + `OpenAI(base_url, api_key)`。语义（内置 api_key 客户端）不变，反例成立；类名已订正。

**(4) 具体数值：** 默认构建向量表数 = 0、embedding 模型数 = 0。检索 ranker 引用的边类型集合 = `{imports,calls,contains}`（不含 `similar_to/related`）。

**(5) 有序步骤：**
1. retrieve.ts 排序子句白名单边类型 `{imports,calls,contains}`（可单测）。
2. CI gate：grep `openai|AsyncOpenAI|api_key|faiss|embedding` 命中 0。

**(6) 测试：**
- 单测：检索一个同时有 `calls` 边与 `similar_to` 边的目标，断言结果只经 `calls` 召回，`similar_to` 目标不出现在 ranker 输出。
- CI 断言：禁止依赖列表（openai/faiss/向量库）grep = 0。

**(7) 证据回指：** llm.py:43-45（已读核对，反例）；compendium risk #2（false-confidence on semantic match）；DEP MAP「B9 embeddings reserve-only」「J12 rejects DeepWiki RAG」。

---

### 与上下游的绑定与冲突落点（coherence）

- **C（物理存储）：** B-D1 的 provenance 列由 C5/C6 承载；FTS 仅建在 static-only 文本上。DB 落出树（`~/.token-killer/projects/<fp>/index.db` POSIX / `%LOCALAPPDATA%\token-killer\...` Windows，per 冲突 C/L 决议），叙事产物（wiki/pages）才进 `.tk/`。
- **H/I（人类/协作面）：** B-D2 的宿主 slash-command（`/tk understand`）或 caw 订阅 CLI 的输出，经 B-D5 归一化 + B-D6 校验后，渲染为 H 的只读 HTML 与 I 的 `.tk/wiki/pages/*` 可编辑文件（编辑发生在文件，不在 HTML）。
- **J（信任）：** static-tier-authoritative + LLM 重锚到 file:line 是 confident-wrong 的结构性修复（J12 拒 DeepWiki RAG）。
- **K（度量）：** B 的 static/LLM 切分使 Job B（agent）在 Claude Code headless 上确定性度量（B-D7 no-LLM = K baseline）；叙事生成走 Job-A 小 N 协议（K9），不并入 saved_tokens。
- **M（治理）：** B 是 M14（仅订阅 LLM）、M19（不在 LLM 输出上做 eval）、M21（不出幻觉图）的来源。
- **G（产出经济）：** B static-tier-only 检索使产出经济路径 0-token/0-LLM。

### stillOpen（交用户确认）

1. 当宿主 slash-command 上下文与 logged-in 本地 CLI **同时**存在（Claude Code/macOS），默认 provider：倾向 in-session 宿主模型（省一个进程）vs 新起 caw 子进程？需一行确认。
2. 是否对 power user 开「显式用户自带 key」逃生口（strong lean 默认绝不 ship key；问的是显式 user-supplied-key 是否可接受、还是严格禁止）。
3. leaf token 阈值 / max-depth：对 tk 自身代码库沿用 codewiki 的 16_000 / depth-2，还是等 Slice-1 harness 出真实项目尺寸后重标定。

---

## 需求 C — Index base & storage（索引底座与存储）

本节是 A「one structural code-graph store」的物理实现。A 决定了「单一结构化 code-graph 存储 = node:sqlite + FTS5，每个 node 带 file:line span，两套同等渲染 diet」；B 决定了「字段级 provenance（static|llm|template），检索只过 static」。C 把这两条落成可建表的 DDL、可粘贴的连接代码、迁移脚手架与存储位置。所有代码块已逐一对照 `/tmp/tk-research/` clone 与 tk 仓库源文件确认存在后再粘贴。

> **跨需求版本闸（已在 DEP MAP 收口，C 服从 D 的 band）**：`engines.node = ">=22.5.0 <25.0.0"`，vendored Node 固定 24.x；解析进程强制 `--liftoff-only`（D10），user-Node 22.5–23 走 `--disable-warning` re-exec（L7）。C2 原文写的「>=22.5 无上限」**被 D 的 band 覆写**，本节统一采用 band。
> **存储位置闸（已在 DEP MAP 收口）**：重二进制 DB 永远 **out-of-tree**；`.tk/` 仅放 human 共享产物（wiki）与 gitignore 的本地 staging。A1 concrete 里残留的 `.tk/codegraph.db` 字符串作废，改为 out-of-tree。

---

### C1 — 引擎 = node:sqlite DatabaseSync + better-sqlite3 形状的薄 adapter　【服务 两者】

**(1) 决策**：引擎用 `node:sqlite` 的 `DatabaseSync`，外面套一层 better-sqlite3 形状的薄 adapter（补 `.pragma()`/`.transaction()`/`open`），`require('node:sqlite')` 懒加载，缺失时抛出精确的「requires Node >= 22.5.0 <25.0.0」错误。adapter 形状让以后换引擎不动查询代码。拒绝 better-sqlite3（unmaintained）/ Ladybug / Kuzu-native——它们都要 per-platform `.node` 原生二进制，违反 Windows-primary 的「零原生编译」硬锚。

**(2) 要动的文件**：
```
src/codegraph/                       (新目录)
├── db/
│   ├── sqlite-adapter.ts            新建 (抄 codegraph 的 NodeSqliteAdapter)
│   ├── connection.ts                新建 (DatabaseConnection: initialize/open/pragma/maintenance)
│   ├── schema.sql                   新建 (C5/C6/C7/C8 全部 DDL)
│   ├── migrations.ts                新建 (C9 单调迁移)
│   └── queries.ts                   新建 (C7 FTS escape + bm25)
```

**(3) 可抄代码**（源: `/tmp/tk-research/codegraph/src/db/sqlite-adapter.ts:50-128`，license unrestricted，**已改写**：加入 band 上界 + 精确报错）：
```ts
// src/codegraph/db/sqlite-adapter.ts
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

**(5) 有序步骤**：① 建 `src/codegraph/db/sqlite-adapter.ts`，粘上面代码；② 在临时脚本里 `createDatabase(':memory:')` 跑通 `prepare/exec/pragma` 三件套。

**(6) 测试**：unit `adapter.spec.ts`——在 Node ≥22.5 上 `createDatabase(':memory:').db.pragma('journal_mode',{simple:true})` 返回非空；mock 掉 `require('node:sqlite')` 抛错时断言报错文案含 `>=22.5.0 <25.0.0`。

**(7) 证据回指**：`/tmp/tk-research/codegraph/src/db/sqlite-adapter.ts:50-128`（已逐行核对，形状一致）。

---

### C2 — 版本闸 = `>=22.5.0 <25.0.0`，低于则走 vendored Node 24 bundle　【服务 两者】

**(1) 决策**：`package.json` 的 `engines.node` 写 `">=22.5.0 <25.0.0"`（band 由 D/L 收口，**覆写** C2 原文的「无上限」）。Claude Code/Mac 依赖宿主 Node；VS Code Copilot/Windows 宿主 Node 可能 <22.5——发自包含 bundle（vendored Node 24，无 `.node` 文件），与 codegraph 的分发模式一致（research line 123）。解析进程强制 `--liftoff-only`（D10）；user-Node 22.5–23 路径加 `--disable-warning=ExperimentalWarning` re-exec（L7）。Node 25 被排除（WASM OOM，D 决议）。

**(2) 要动的文件**：`package.json`（改 `engines.node`）；vendored bundle 的打包由 L 拥有，C 只声明 band 与 `--liftoff-only` 约束。

**(3) 可抄代码**（tk-adapted，无现成 clone 源——属配置）：
```json
// package.json (片段)
{ "engines": { "node": ">=22.5.0 <25.0.0" } }
```
启动门卫（**已改写**，tk-adapted）：
```ts
// src/codegraph/db/version-gate.ts
export function assertNodeBand(): void {
  const [maj, min] = process.versions.node.split('.').map(Number);
  const ok = (maj > 22 || (maj === 22 && min >= 5)) && maj < 25;
  if (!ok) throw new Error(
    `node:sqlite codegraph needs Node >=22.5.0 <25.0.0; got ${process.versions.node}. ` +
    `Use the vendored-Node bundle.`);
}
```

**(4) 具体数值**：下界 `22.5.0`；上界 `<25.0.0`；vendored `24.x`；bundle 体积约 50MB（C stillOpen，待 Windows 安装基测量后定是否总是 vendored）。

**(5) 有序步骤**：① 改 `engines.node`；② 加 `version-gate.ts` 并在 codegraph 入口首调；③ L 负责 vendored bundle（C 不实现，依赖 L 通道）。

**(6) 测试**：unit——`assertNodeBand()` 在伪造 `process.versions.node='25.0.0'` 时抛错；A/B harness field `node_version` 记录实测宿主版本。

**(7) 证据回指**：codegraph 分发模式 research line 123；band 由 DEP MAP conflict 决议（A+D+L）。

---

### C3 — 索引位置 = OUT-OF-TREE，复用 tk 现有 `~/.token-killer/projects/<fingerprint>/`　【服务 两者】

**(1) 决策**：DB 放 `~/.token-killer/projects/<project_fingerprint>/index.db`（POSIX）/ `%LOCALAPPDATA%\token-killer\...`（Windows，同一约定平台映射）——**不**进 repo。dir `0o700`、file `0o600`。`project_fingerprint` 直接复用 tk 已有的 `projectFingerprint(cwd)`（`repo:<sha256前12>`）。fingerprint 子目录自动隔离 Win-native vs WSL 共享同一 tree。`.tk/` 仅放 human wiki 产物（H/I）与 gitignore staging，**不放 DB**（DEP MAP C↔L 收口）。

**(2) 要动的文件**：
```
src/codegraph/db/location.ts          新建 (indexDbPath + TK_INDEX_DIR override 校验)
```

**(3) 可抄代码**（源: tk `src/core/dataDir.ts:76-120` 的 `tokenKillerHome`/`projectFingerprint` 已核对存在；override 校验**源**: `/tmp/tk-research/codegraph/src/directory.ts:36-55`，**已改写**为 tk 风格）：
```ts
// src/codegraph/db/location.ts
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

### C4 — 连接 PRAGMA 固定顺序（busy_timeout 必须最先）　【服务 两者】

**(1) 决策**：固定顺序 `busy_timeout=5000` **最先**，再 `foreign_keys=ON`、`journal_mode=WAL`、`synchronous=NORMAL`、`cache_size=-64000`(64MB)、`temp_store=MEMORY`、`mmap_size=268435456`(256MB)。busy_timeout 必须先于 journal_mode，否则并发写会抛 `database is locked` 而非 WAIT（codegraph issue #238）。5s 够正常增量 sync；旧的 120s 看起来像 agent 卡死。`tk status` 暴露 effective `journal_mode`——WSL2 `/mnt` 与网络盘上 WAL 可能静默失效。

**(2) 要动的文件**：`src/codegraph/db/connection.ts`（`configureConnection`）。

**(3) 可抄代码**（源: `/tmp/tk-research/codegraph/src/db/index.ts:30-38`，verbatim 核对一致）：
```ts
// src/codegraph/db/connection.ts
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

### C5 — nodes 表 = 单一 generic 表，kind discriminator 覆盖 code+doc+concept　【服务 两者】

**(1) 决策**：单一 `nodes` 表，`id TEXT PK` + `kind TEXT` 区分子类型。kind 枚举在 codegraph 21 种 code kind 之上**扩 `doc`/`concept`**，让 repodoc 的 `CodeNode/DocNode/ConceptNode` collapse 进一张表——一个 FTS 索引、一个查询面同时服务 A（human/wiki）与 B（agent）。每个 node 带 `file_path/start_line/end_line/start_column/end_column`（A2 信任原语 file:line）。`version`+`content_hash` 承载 repodoc `DocNode.version` 的 staleness，不另开 doc 表。**加 `provenance TEXT`**（B 的字段级契约：`static|llm|template`，检索只过 static）。

**(2) 要动的文件**：`src/codegraph/db/schema.sql`（nodes 段）。

**(3) 可抄代码**（源: `/tmp/tk-research/codegraph/src/db/schema.sql:20-42` 核对一致；**已改写**：补 `content_hash`/`version`/`provenance`，kind 注释扩 doc/concept）：
```sql
-- src/codegraph/db/schema.sql  (源: codegraph schema.sql:20-42，已改写补 3 列)
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

### C6 — edges 表 = 单一 generic 表，kind 覆盖 code 与 doc/concept 关系　【服务 两者】

**(1) 决策**：单一 `edges` 表，`kind TEXT` 一列让新关系是「值」而非 DDL 变更。`provenance` 区分 resolver-derived vs literal edge（J 的 edge 诚实性）。`ON DELETE CASCADE` 在 node 重建时自动清边。repodoc 的 `describes`/`semantic_impact` 同表承载 doc↔code 链。

**(2) 要动的文件**：`src/codegraph/db/schema.sql`（edges 段）。

**(3) 可抄代码**（源: `/tmp/tk-research/codegraph/src/db/schema.sql:45-56`，verbatim 核对一致）：
```sql
-- src/codegraph/db/schema.sql  (源: codegraph schema.sql:45-56，verbatim)
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

### C7 — FTS5 = 单一 external-content 虚表 + 3 触发器 + bm25 加权 + 查询转义　【服务 两者】

**(1) 决策**：一个 external-content FTS5 虚表 `nodes_fts(content='nodes', content_rowid='rowid')`，索引 `name,qualified_name,docstring,signature`（doc 内容经 doc-kind 行进入）。`tokenize='porter unicode61'`——porter 给 human 自然语言 doc 搜索，重 name 权重给 agent 精确符号搜索。3 触发器（ai/ad/au）保持同步。查询 `bm25(nodes_fts, 0, 20, 5, 1, 2)`（id=0,name=20,qualified_name=5,docstring=1,signature=2）。转义：`::`→空格，再 strip `['"*():^]` 与 `AND/OR/NOT/NEAR`。**FTS5 缺失保护（C↔L 收口新增）**：vendored-Node bundle 的 SQLite 已知带 FTS5；仅 npm-shim-on-user-Node 路径需 LIKE-scan 兜底——`CREATE VIRTUAL TABLE` 失败时 catch 并标记 `ftsAvailable=false`，检索降级为 `WHERE name LIKE ?`。

**(2) 要动的文件**：`src/codegraph/db/schema.sql`（FTS 段+触发器）；`src/codegraph/db/queries.ts`（转义+bm25+LIKE 兜底）。

**(3) 可抄代码**（DDL+触发器 源: `/tmp/tk-research/codegraph/src/db/schema.sql:98-124` verbatim；tokenizer 源: `/tmp/tk-research/code-graph-mcp/src/storage/schema.rs:63-67` 核对 `porter unicode61`，**已改写**合并 tokenizer）：
```sql
-- src/codegraph/db/schema.sql (源: codegraph schema.sql:98-124；已改写加 tokenize)
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
// src/codegraph/db/queries.ts  (源: codegraph queries.ts:999-1022)
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

### C8 — 辅助表 files / unresolved_refs / project_metadata / schema_versions / meta　【服务 两者】

**(1) 决策**：`files(path PK,content_hash,language,size,modified_at,indexed_at,node_count,errors JSON)` = 增量 staleness 闸；`unresolved_refs(...)` 让 phase-2 call resolution 延迟解析跨文件 callee；`project_metadata(key PK,value,updated_at)`；`schema_versions(version PK,...)`；`meta(key PK,value)` 现在就保留，让未来 sqlite-vec embedding swap 可检测而无破坏性迁移（code-graph-mcp `META_KEY_EMBEDDING_DIM/_MODEL`）。`content_hash` 用 **sha256**（`node:crypto` 零依赖；C stillOpen：除非大仓实测 blake3 吞吐显著胜，否则不 vendoring blake3）。

**(2) 要动的文件**：`src/codegraph/db/schema.sql`（辅助表段）。

**(3) 可抄代码**（files/unresolved_refs 源: `/tmp/tk-research/codegraph/src/db/schema.sql:59-82` verbatim 核对；meta 源: `/tmp/tk-research/code-graph-mcp/src/storage/schema.rs:90` + `META_KEY_EMBEDDING_DIM` 行 4-5 核对）：
```sql
-- src/codegraph/db/schema.sql (源: codegraph schema.sql:59-82，verbatim)
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
// src/codegraph/db/hash.ts
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

### C9 — 迁移 = 单调 schema_versions，additive ALTER-only，开库时事务内跑　【服务 两者】

**(1) 决策**：`schema_versions` 表记录版本；`CURRENT_SCHEMA_VERSION` 常量；additive ALTER-only 迁移在开库时事务内逐条跑；fresh init 直接 stamp 当前版本，让迁移不重放。每条迁移 `{version,description,up}` 跑在 `db.transaction()`；init 用 `INSERT OR IGNORE` 记 CURRENT，fresh db 跳过 replay。

**(2) 要动的文件**：`src/codegraph/db/migrations.ts`；`src/codegraph/db/connection.ts`（`initialize`/`open` 调 `runMigrations`）。

**(3) 可抄代码**（`runMigrations` 源: `/tmp/tk-research/codegraph/src/db/migrations.ts:107-124` verbatim；init stamp 源: `/tmp/tk-research/codegraph/src/db/index.ts:50-56` 核对）：
```ts
// src/codegraph/db/migrations.ts  (源: codegraph migrations.ts:107-124)
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

**(6) 测试**：unit——fresh init 后 `getCurrentVersion()=1` 且迁移数组为空时 `runMigrations` no-op；伪造一个 v2 ALTER，旧库开启后该列存在且 `schema_versions` 多一行；重开第二次不再跑（幂等）。

**(7) 证据回指**：`codegraph/src/db/migrations.ts:107-124`、`index.ts:50-56`（核对一致）。

---

### C10 — bulk 后维护 = PRAGMA optimize + wal_checkpoint(PASSIVE) best-effort　【服务 两者】

**(1) 决策**：每次 `indexAll`/`sync` 后跑 `PRAGMA optimize` + `PRAGMA wal_checkpoint(PASSIVE)`，二者 best-effort（吞错）。完整 `VACUUM`+`ANALYZE` 仅在显式 `tk optimize`。WAL 大索引跑会涨过 1000 页默认阈值；PASSIVE checkpoint 折回主库且不阻塞读者；`PRAGMA optimize` 只 re-ANALYZE 变过的表给 planner 新统计。

**(2) 要动的文件**：`src/codegraph/db/connection.ts`（`runMaintenance`）。

**(3) 可抄代码**（源: `/tmp/tk-research/codegraph/src/db/index.ts:207-218` verbatim 核对一致）：
```ts
// src/codegraph/db/connection.ts  (源: codegraph index.ts:207-218)
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

### C11 — Windows 文件锁与清理：WAL 读不阻写 + EBUSY 重试 rm + 拒索引 $HOME/根　【服务 两者】

**(1) 决策**：WAL 下读者永不阻塞写者；跨进程写 wait out `busy_timeout`。索引目录清理/重建用 `rm(dir,{recursive,force,maxRetries:5,retryDelay:100})` 扛 EBUSY（tk 自身 Windows 历史：子进程退出后仍持 handle）。**绝不**索引 `$HOME` 或文件系统根（codegraph #845 把 FD 打爆）。`.db`+`.db-wal`+`.db-shm` 全在 fingerprint 目录下。

**(2) 要动的文件**：`src/codegraph/db/cleanup.ts`（rm 包装 + 根/HOME 守卫）。

**(3) 可抄代码**（**已改写**，tk-adapted——源自 tk MEMORY「Windows EBUSY: spawn-test temp cleanup needs retries」既定 pattern，无单一 clone 行号）：
```ts
// src/codegraph/db/cleanup.ts
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
- **覆写 prior「per-type tables for richness」**→ 用 generic 单 `nodes(kind)`/`edges(kind)`，让 code+doc+concept（需求 A）共享一个 FTS 索引、加 kind 是值而非 DDL 迁移。Ladybug 的 31 张 per-type 表仅作 v2 view 保留。
- **确认并固化 prior「index out-of-tree」**→ 永久 + 具体化为 `~/.token-killer/projects/<fingerprint>/index.db`，复用 tk 既有 0700/0600 存储，非过渡态、非 in-repo。

### 仍需用户拍板（stillOpen，C 自身）

1. **v2 embeddings**：是否后加 sqlite-vec（vec0）。现已用 `meta(key,value)` + nullable 列槽预留（无破坏性迁移），但开启需选符合 no-egress/no-API-key 强 lean 的 embedding 源——v2 scoping 时定。
2. **bundled-Node 分发粒度**：确认 VS Code Copilot/Windows 安装路径能否依赖用户 Node（≥22.5 渐普及）还是必须总是 vendored Node 24（~50MB bundle）——需先测实际 Windows 安装基 Node 版本。
3. **content_hash 算法**：sha256（零依赖 `node:crypto`，已采为默认）vs blake3（code-graph-mcp 用）——除非大仓实测 hashing 吞吐显著胜，否则不 vendoring blake3。
4. **跨需求版本闸确认**：`>=22.5.0 <25.0.0` + vendored Node 24.x 作为单一锚（A/C/D/L 原各自独立 open，现已收口），请确认接受。

---

## 需求 D — Language coverage（提取路线、初始语言集、捕获模型、解析器生命周期阈值）

本节落实「一个图存储（A）由 WASM tree-sitter 填充」这条上游决策：D 是把 A2/A3 的 node/edge 字段填满的**符号来源层**。所有阈值取 codegraph 仓库实测常量，所有 per-language 捕获取 codegraph 的 config-object 原样。与上游冲突的统一裁决（Node 闸门 `>=22.5.0 <25.0.0` + 强制 `--liftoff-only` + vendored Node 24.x）在 D10 收口，并消解 A/C/L 之间的版本不一致。

代码全部已对照 `/tmp/tk-research/codegraph/` 克隆逐行核实后粘贴；凡 tk 适配处标注「已改写」。

---

### D1 — 提取路线 = web-tree-sitter (WASM) + tree-sitter-wasms 预编译语法，作为唯一核心；无 native 绑定、无 LSP-as-core　【服务：两者】

**(1) 决策**：核心提取器只用 `web-tree-sitter`（纯 JS 的 WASM runtime）加载 `tree-sitter-wasms` 的 `.wasm` 语法 blob，零 native build（无 node-gyp、无 C/C++ 工具链、无 per-arch 编译）。一套 artifact 跨 win32/darwin/linux × x64/arm64 通用。LSP/SCIP 降级为 D14 的可选 v2 互通缝，v1 不引入。此决策直接服务 Anchor 1（primary = VS Code Copilot on Windows）的零原生编译约束，且规避 tk 历史上的 EBUSY/AV/PATH 安装摩擦。

**(2) 要动的文件**（在 tk 仓内新建提取层，镜像 codegraph 目录结构）：
```
src/codegraph/
  extraction/
    grammars.ts          # WASM runtime init + 懒加载/顺序加载 + 扩展名映射 + .h 探嗅
    index.ts             # 主线程 worker 生命周期 + 默认忽略集 + 文件大小闸门
    parse-worker.ts      # worker 内解析 + parser reset + OOM 退出 + Emscripten stderr 过滤
    wasm-runtime-flags.ts# --liftoff-only re-exec 守卫
    tree-sitter-types.ts # LanguageExtractor 接口（捕获模型，见 D3）
    languages/
      index.ts           # EXTRACTORS barrel（语言→config-object 注册表，见 D2）
      typescript.ts python.ts go.ts rust.ts java.ts c-cpp.ts csharp.ts ...
    wasm/                # 自带 vendored .wasm（见 D9：csharp/lua/luau/pascal/scala/r）
```
`package.json` 增依赖：`web-tree-sitter@^0.25.3`、`tree-sitter-wasms@^0.1.11`。

**(3) 可抄代码**（grammars.ts 的 WASM runtime + 懒加载/顺序加载主体，已核实）：
```typescript
// 源: /tmp/tk-research/codegraph/src/extraction/grammars.ts:9-11,171-230（VERBATIM）
import * as path from 'path';
import { Parser, Language as WasmLanguage } from 'web-tree-sitter';

const parserCache = new Map<Language, Parser>();
const languageCache = new Map<Language, WasmLanguage>();
const unavailableGrammarErrors = new Map<Language, string>();
let parserInitialized = false;

export async function initGrammars(): Promise<void> {
  if (parserInitialized) return;
  await Parser.init();              // 整个进程只调一次
  parserInitialized = true;
}

export async function loadGrammarsForLanguages(languages: Language[]): Promise<void> {
  if (!parserInitialized) await initGrammars();
  // 仅加载「项目中实际出现 且 尚未加载 且 未知不可用」的语法 —— 见 D8
  const toLoad = [...new Set(languages)].filter(
    (lang): lang is GrammarLanguage =>
      lang in WASM_GRAMMAR_FILES &&
      !languageCache.has(lang) &&
      !unavailableGrammarErrors.has(lang)
  );
  // 顺序加载：并行 WasmLanguage.load() 在 Node20+ 命中 web-tree-sitter race（tree-sitter#2338）
  for (const lang of toLoad) {
    const wasmFile = WASM_GRAMMAR_FILES[lang];
    try {
      const wasmPath = (lang === 'pascal' || lang === 'scala' || lang === 'lua' ||
                        lang === 'luau' || lang === 'csharp' || lang === 'r')
        ? path.join(__dirname, 'wasm', wasmFile)           // vendored，见 D9
        : require.resolve(`tree-sitter-wasms/out/${wasmFile}`);
      const language = await WasmLanguage.load(wasmPath);
      languageCache.set(lang, language);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[tk] Failed to load ${lang} grammar — parsing unavailable: ${message}`);
      unavailableGrammarErrors.set(lang, message); // 单语言失败不挂全局
    }
  }
}
```

**(4) 具体数值**：依赖版本 `web-tree-sitter@^0.25.3`、`tree-sitter-wasms@^0.1.11`；`Parser.init()` 每进程 1 次；每语法 1 个 `.wasm`；单语法加载失败计入 `unavailableGrammarErrors` 后**继续**（不阻断其余语言）。

**(5) 有序步骤**：
1. 加依赖 + 建 `src/codegraph/extraction/grammars.ts`，落 `initGrammars()` + `loadGrammarsForLanguages()`（独立可测）。
2. 落 `WASM_GRAMMAR_FILES` 映射 + `EXTENSION_MAP`（D2/D7 共用）。

**(6) 测试**：单测 fixture —— 对一份 `.ts` + 一份 `.py` 调 `loadGrammarsForLanguages(['typescript','python'])`，断言 `languageCache.size===2` 且 `getParser('typescript')!==null`；负向：故意指向坏 `.wasm`，断言 `unavailableGrammarErrors.has(lang)` 且函数不抛。

**(7) 证据回指**：`/tmp/tk-research/codegraph/src/extraction/grammars.ts:9-11,171-230`；`package.json:43-44`（`tree-sitter-wasms ^0.1.11` + `web-tree-sitter ^0.25.3`，已核实）。

---

### D2 — 初始语言集：22 语言注册、分 3 tier，tier-1 CI 闸门　【服务：两者】

**(1) 决策**：注册 22 语言但分级 ship。**tier-1（ship-blind，CI 必过）**：TypeScript, TSX, JavaScript, JSX, Python, Go, Rust, Java, C, C++, C#（11 个，覆盖 VS Code Copilot 的 web/TS-JS + Python + 企业 .NET/Java/Go/C++ 主力）。**tier-2**：PHP, Ruby, Swift, Kotlin, Scala。**tier-3 best-effort**：Dart, Lua, R, Objective-C, Luau, Pascal/Delphi。每新增语言 = 1 个 `.wasm` + 1 个 config-object，走同一管线，几乎零边际成本。tk ledger 只需 tier-1 green 即可发布。

**(2) 要动的文件**：`src/codegraph/extraction/languages/index.ts`（EXTRACTORS barrel）；`src/codegraph/extraction/grammars.ts`（`WASM_GRAMMAR_FILES` + `EXTENSION_MAP`）。

**(3) 可抄代码**（EXTRACTORS 注册表，含 tsx→ts / jsx→js 别名，已核实）：
```typescript
// 源: /tmp/tk-research/codegraph/src/extraction/languages/index.ts:31-54（VERBATIM）
export const EXTRACTORS: Partial<Record<Language, LanguageExtractor>> = {
  typescript: typescriptExtractor,
  tsx:        typescriptExtractor,   // 别名 → TS 提取器
  javascript: javascriptExtractor,
  jsx:        javascriptExtractor,   // 别名 → JS 提取器
  python: pythonExtractor,
  go: goExtractor,
  rust: rustExtractor,
  java: javaExtractor,
  c: cExtractor,
  cpp: cppExtractor,
  csharp: csharpExtractor,           // ← tier-1 终点
  php: phpExtractor,
  ruby: rubyExtractor,
  swift: swiftExtractor,
  kotlin: kotlinExtractor,
  dart: dartExtractor,
  pascal: pascalExtractor,
  scala: scalaExtractor,
  lua: luaExtractor,
  r: rExtractor,
  luau: luauExtractor,
  objc: objcExtractor,
};
```
WASM 文件名映射（`tree-sitter-c_sharp.wasm` 等，已核实）：
```typescript
// 源: /tmp/tk-research/codegraph/src/extraction/grammars.ts:19-42（VERBATIM，节选 tier-1）
const WASM_GRAMMAR_FILES: Record<GrammarLanguage, string> = {
  typescript: 'tree-sitter-typescript.wasm', tsx: 'tree-sitter-tsx.wasm',
  javascript: 'tree-sitter-javascript.wasm', jsx: 'tree-sitter-javascript.wasm',
  python: 'tree-sitter-python.wasm', go: 'tree-sitter-go.wasm', rust: 'tree-sitter-rust.wasm',
  java: 'tree-sitter-java.wasm', c: 'tree-sitter-c.wasm', cpp: 'tree-sitter-cpp.wasm',
  csharp: 'tree-sitter-c_sharp.wasm',
  // ... php/ruby/swift/kotlin/dart/pascal/scala/lua/r/luau/objc
};
```

**(4) 具体数值**：22 语言总注册；tier-1 = 11 个 CI 必过；tier-2 = 5；tier-3 = 6。tsx/jsx 复用 ts/js 提取器（0 额外 config）。

**(5) 有序步骤**：
1. 落 `languages/typescript.ts`、`python.ts`、`go.ts`（D11 verbatim），注册进 EXTRACTORS。
2. 补齐 tier-1 余下 8 个（rust/java/c/cpp/csharp/javascript + tsx/jsx 别名）。
3. tier-2/tier-3 逐个 ride 同一管线（每个 = 1 wasm + 1 config）。

**(6) 测试**：tier-1 的 11 语言各 1 份最小 fixture（含 1 函数 + 1 类/结构），断言抽出预期 node 数与 kind；这 11 个进 `test:ci` 闸门。tier-2/3 走 best-effort（默认 test-light，见 stillOpen）。

**(7) 证据回指**：`/tmp/tk-research/codegraph/src/extraction/languages/index.ts:31-54`；`grammars.ts:19-42`（已核实）。

---

### D3 — 捕获模型 = per-language 的 typed `LanguageExtractor` config-object，非裸 `.scm` 查询　【服务：两者】

**(1) 决策**：捕获用一个**类型化 config 对象**（node-type 字符串列表 + field-name 字符串 + 少量 quirk hooks），由一个通用核心 walker 按 config 分派；**不**用裸 tree-sitter `.scm` 查询文件。理由直接服务两个目标：服务 A（人/协作）—— 贡献者加一种语言 = 填一个可在 IDE 里跳转/调试的 typed 对象，把该语言的怪癖 hook 与证据注释就近放在一起，不必学 S-表达式；服务 B（token-opt）—— 正确的 kind 分类（TS 字段 vs 方法、Go receiver 链接）是 kind-过滤 signature-collapse 检索可信的前提。

**(2) 要动的文件**：`src/codegraph/extraction/tree-sitter-types.ts`（接口定义）。

**(3) 可抄代码**（接口主体，已核实 80-198 行）：
```typescript
// 源: /tmp/tk-research/codegraph/src/extraction/tree-sitter-types.ts:80-196（VERBATIM 节选）
export interface LanguageExtractor {
  // 解析前的源改写：必须保持字节偏移（删文本用空格替、保留换行），见 C# preParse
  preParse?: (source: string) => string;

  // --- node 类型映射 ---
  functionTypes: string[]; classTypes: string[]; methodTypes: string[];
  interfaceTypes: string[]; structTypes: string[]; enumTypes: string[];
  enumMemberTypes?: string[]; typeAliasTypes: string[];
  importTypes: string[]; callTypes: string[]; variableTypes: string[];
  fieldTypes?: string[]; propertyTypes?: string[];

  // --- field 名映射 ---
  nameField: string; bodyField: string; paramsField: string; returnField?: string;

  // --- hooks ---
  resolveName?: (node: SyntaxNode, source: string) => string | undefined;
  getSignature?: (node: SyntaxNode, source: string) => string | undefined;
  getVisibility?: (node: SyntaxNode) => 'public'|'private'|'protected'|'internal'|undefined;
  isExported?: (node: SyntaxNode, source: string) => boolean;
  isAsync?: (node: SyntaxNode) => boolean;
  isStatic?: (node: SyntaxNode) => boolean;
  extractModifiers?: (node: SyntaxNode) => string[] | undefined;

  extraClassNodeTypes?: string[];
  methodsAreTopLevel?: boolean;          // Go: true
  interfaceKind?: NodeKind;              // Rust: 'trait'

  visitNode?: (node: SyntaxNode, ctx: ExtractorContext) => boolean;
  classifyClassNode?: (node: SyntaxNode) => 'class'|'struct'|'enum'|'interface'|'trait';
  classifyMethodNode?: (node: SyntaxNode) => 'method'|'property'; // #808，见 D11-TS
  resolveBody?: (node: SyntaxNode, bodyField: string) => SyntaxNode | null;
  // extractImport / getReceiverType / getReturnType / resolveTypeAliasKind ... 见各语言
}
```

**(4) 具体数值**：22 个 config 对象（codegraph typescript ~156 LOC、python ~50 LOC、go ~105 LOC）；1 个通用 walker 分派全部。

**(5) 有序步骤**：
1. 落 `tree-sitter-types.ts` 接口（独立可测：纯类型 + 编译通过）。
2. 通用 walker 按 config 字段分派（消费上述接口）。

**(6) 测试**：类型层 —— `tsc --noEmit` 对接口编译通过；walker 单测 —— 喂一个 mock config（`functionTypes:['fn']`），对 mock AST 断言 walker 命中 `fn` 节点产出函数 node。

**(7) 证据回指**：`/tmp/tk-research/codegraph/src/extraction/tree-sitter-types.ts:80-196`（已核实）。

---

### D4 / D5 / D6 — 解析器生命周期阈值 + OOM/超时处置 + 单 worker 并发（codegraph 常量 VERBATIM）　【服务：两者】

**(1) 决策**：生命周期常量原样采用 —— `WORKER_RECYCLE_INTERVAL=250` 文件、`PARSER_RESET_INTERVAL=5000` 次解析、`PARSE_TIMEOUT_MS=10_000ms` base 且每 100KB 加 10_000ms、`MAX_FILE_SIZE=1_048_576` 字节跳过、`FILE_IO_BATCH_SIZE=10`。并发 = **单个可回收 worker 线程**（非 `cpus()`-大小的池）：N 个 isolate 会成倍放大已经逼到回收阈值的 per-isolate WASM 堆压力，也成倍放大 tk 实测的 Windows AV spawn 税。OOM（`memory access out of bounds` / `out of memory`）→ worker `process.exit(1)`，父进程把异常退出当作 reject-all-pending + respawn 干净 isolate + 计数清零；超时 → **先 reject 再** fire-and-forget `worker.terminate()`（卡死的 WASM 上 terminate 可能挂起，先 reject 保证 Windows 索引不被 wedge）。

**(2) 要动的文件**：`src/codegraph/extraction/index.ts`（主线程生命周期 + 常量）、`src/codegraph/extraction/parse-worker.ts`（worker 内 reset + OOM 退出 + stderr 过滤）。

**(3) 可抄代码**（主线程常量 + 超时/回收 + timeout 缩放，已核实）：
```typescript
// 源: /tmp/tk-research/codegraph/src/extraction/index.ts:41,50,101,32（常量 VERBATIM）
const PARSE_TIMEOUT_MS = 10_000;        // 每文件 base 超时
const WORKER_RECYCLE_INTERVAL = 250;    // 回收前文件数（重建 isolate 回收 WASM 堆）
const MAX_FILE_SIZE = 1024 * 1024;      // 1MB 跳过：bundle/minified 撑爆堆且无有用符号
const FILE_IO_BATCH_SIZE = 10;          // 并行读，与单线程解析重叠 I/O

// 源: /tmp/tk-research/codegraph/src/extraction/index.ts:1099-1148（VERBATIM 节选）
function recycleWorker(): void {                       // 达 250 即回收
  if (!parseWorker) return;
  const w = parseWorker;
  parseWorker = null; workerParseCount = 0;
  w.terminate().catch(() => {});                       // fire-and-forget：卡死 WASM 上 terminate 会挂
}

async function requestParse(filePath: string, content: string): Promise<ExtractionResult> {
  if (!WorkerClass) {                                  // in-process 回退
    return extractFromSource(filePath, content, detectLanguage(filePath, content), frameworkNames);
  }
  if (workerParseCount >= WORKER_RECYCLE_INTERVAL) await recycleWorker();
  const worker = await ensureWorker();
  const id = nextId++; workerParseCount++;
  // 大文件超时缩放：base 10s + 每 100KB 10s
  const timeoutMs = PARSE_TIMEOUT_MS + Math.floor(content.length / 100_000) * 10_000;
  return new Promise<ExtractionResult>((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingParses.delete(id);
      // 先 reject —— worker.terminate() 在卡死 WASM 上会挂
      parseWorker = null; workerParseCount = 0;
      reject(new Error(`Parse timed out after ${timeoutMs}ms`));
      worker.terminate().catch(() => {});              // 后台杀掉卡死 worker
    }, timeoutMs);
    pendingParses.set(id, { resolve, reject, timer });
    worker.postMessage({ type: 'parse', id, filePath, content, frameworkNames });
  });
}
```
worker 内 reset + OOM 退出 + Emscripten `Aborted()` stderr 过滤（已核实）：
```typescript
// 源: /tmp/tk-research/codegraph/src/extraction/parse-worker.ts:55,69-84（VERBATIM 节选）
const PARSER_RESET_INTERVAL = 5000;
const parseCounts = new Map<Language, number>();
// ...每次成功解析后：
const count = (parseCounts.get(language) ?? 0) + 1;
parseCounts.set(language, count);
if (count % PARSER_RESET_INTERVAL === 0) resetParser(language);  // 周期性回收 WASM 堆
// ...catch 内：
// WASM 内存错误使模块进入损坏态 —— 后续解析会级联失败。崩掉 worker 让主线程重生干净堆。
if (message.includes('memory access out of bounds') || message.includes('out of memory')) {
  process.exit(1);
}

// 源: parse-worker.ts:31-53（VERBATIM 节选）—— 滤掉 Emscripten 直写 stderr 的噪声行，保持 Windows 终端干净
const realWrite = process.stderr.write.bind(process.stderr);
process.stderr.write = ((chunk, encoding?, cb?): boolean => {
  const s = typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf-8');
  if (s.startsWith('Aborted(') || s.includes('Build with -sASSERTIONS for more info')) {
    if (typeof encoding === 'function') encoding(); else if (cb) cb();
    return true;                                      // 吞掉，但仍履行 Writable 回调契约
  }
  return realWrite(chunk as never, encoding as never, cb as never);
}) as typeof process.stderr.write;
```
父进程异常退出 → reject-all-pending + 清零（已核实）：
```typescript
// 源: /tmp/tk-research/codegraph/src/extraction/index.ts:1058-1068（VERBATIM）
w.on('exit', (code) => {
  if (code !== 0 && pendingParses.size > 0) rejectAllPending(`Worker exited with code ${code}`);
  if (parseWorker === w) { parseWorker = null; workerParseCount = 0; } // 重生时 full cycle
});
```

**(4) 具体数值**：回收 250 文件 / reset 5000 次 / 超时 `10_000 + floor(len/100_000)*10_000` ms / 文件跳过 1_048_576 字节 / I/O 批 10 / worker 数 = 1（单个，非池）。

**(5) 有序步骤**：
1. 落 `index.ts` 常量 + `requestParse`/`recycleWorker`/`ensureWorker`/`rejectAllPending`（worker 生命周期，独立可测）。
2. 落 `parse-worker.ts` 的 reset + OOM-exit + stderr 过滤。
3. 串起 `FILE_IO_BATCH_SIZE=10` 的 batch 读 → 串行解析。

**(6) 测试**：
- 回收：喂 251 份小文件，断言 worker 至少回收 1 次（spy `terminate`）。
- 超时：喂一份会让解析挂死的 fixture（或 mock 永不回消息），断言在 `timeoutMs` 后 promise reject 且 `pendingParses` 清空、`workerParseCount===0`。
- OOM：mock worker 抛 `'memory access out of bounds'`，断言 worker exit code≠0 触发 `rejectAllPending`。
- 大文件跳过：>1MB 的 fixture 断言计入 skipped 而非 errored。

**(7) 证据回指**：`/tmp/tk-research/codegraph/src/extraction/index.ts:41,50,101,32,1058-1068,1099-1148`；`parse-worker.ts:31-53,55,69-84`（已核实）。

---

### D7 — 语言检测 = 扩展名映射优先，仅 `.h` 歧义走 8KB 内容探嗅　【服务：两者】

**(1) 决策**：检测以扩展名映射为准（`EXTENSION_MAP`，is-source-file 由同一张表派生，使「该不该索引」与「parser 支持」永不漂移）。唯一 tier-1/2 真歧义是 `.h`（C / C++ / Objective-C），用前 8192 字节的语言独有 token 正则判定，不做整文件解析。

**(2) 要动的文件**：`src/codegraph/extraction/grammars.ts`（`detectLanguage` + `looksLikeCpp` + `looksLikeObjc` + `isSourceFile`）。

**(3) 可抄代码**（已核实）：
```typescript
// 源: /tmp/tk-research/codegraph/src/extraction/grammars.ts:125-131,271-305（VERBATIM）
export function isSourceFile(filePath: string): boolean {       // 单一真相源
  const dot = filePath.lastIndexOf('.');
  if (dot < 0) return false;
  return filePath.slice(dot).toLowerCase() in EXTENSION_MAP;
}

export function detectLanguage(filePath: string, source?: string): Language {
  const ext = filePath.substring(filePath.lastIndexOf('.')).toLowerCase();
  const lang = EXTENSION_MAP[ext] || 'unknown';
  // .h 可能是 C / C++ / Objective-C —— 看内容
  if (lang === 'c' && ext === '.h' && source) {
    if (looksLikeCpp(source)) return 'cpp';
    if (looksLikeObjc(source)) return 'objc';
  }
  return lang;
}

function looksLikeCpp(source: string): boolean {               // 前 8KB，C++ 独有、C 永不合法
  const sample = source.substring(0, 8192);
  return /\bnamespace\b|\bclass\s+\w+\s*[:{]|\btemplate\s*<|\b(?:public|private|protected)\s*:|\bvirtual\b|\busing\s+(?:namespace\b|\w+\s*=)/.test(sample);
}
function looksLikeObjc(source: string): boolean {
  const sample = source.substring(0, 8192);
  return /@(?:interface|implementation|protocol|synthesize)\b/.test(sample);
}
```
> 注：codegraph 的 `EXTENSION_MAP`（grammars.ts:47-118，58 条）含 razor/svelte/vue/astro/liquid/xml 等框架标记扩展名。tk tier-1 **不**ship 这些 bespoke 框架提取器（见 D12），故 tk 的 `EXTENSION_MAP` 应裁剪为「tier-1/2/3 grammar 语言 + file-level-only(yaml/twig/properties)」子集。**已改写**：删去映射中 `'.cshtml'/'.razor'/'.svelte'/'.vue'/'.astro'/'.liquid'` 等无对应 v1 提取器的条目。

**(4) 具体数值**：探嗅样本 = `source.substring(0, 8192)`（8192 字节）；仅 `.h` 走探嗅；其余纯扩展名决定。

**(5) 有序步骤**：
1. 落裁剪后的 `EXTENSION_MAP`（tier-1/2/3 + file-level-only）。
2. 落 `detectLanguage` + 两个 `.h` 探嗅器 + `isSourceFile`（同表派生）。

**(6) 测试**：`foo.h` 含 `class X {` → 断言 `detectLanguage==='cpp'`；含 `@interface` → `'objc'`；纯 C 头 → `'c'`。`isSourceFile('a.ts')===true`、`isSourceFile('a.png')===false`。

**(7) 证据回指**：`/tmp/tk-research/codegraph/src/extraction/grammars.ts:47-131,271-305`（已核实）。

---

### D8 — 语法加载 = 懒加载（仅项目内出现的语言）+ 顺序加载（禁并行）　【服务：两者】

**(1) 决策**：只编译项目里实际出现的语言的语法，懒加载；且必须**顺序**加载 —— 并行 `WasmLanguage.load()` 在 Node 20+ 命中 web-tree-sitter race（tree-sitter#2338），在 Windows 冷启动下也避免 AV 下的并发读突发。已加载 / 已知不可用的语言跳过。

**(2) 要动的文件**：`src/codegraph/extraction/grammars.ts`（即 D1 的 `loadGrammarsForLanguages`，`for...await` 顺序循环 + `toLoad` 过滤已含此语义）。

**(3) 可抄代码**：见 **D1 的 `loadGrammarsForLanguages`** —— `toLoad` 过滤（present ∧ ¬cached ∧ ¬unavailable）+ `for (const lang of toLoad) await WasmLanguage.load(...)` 顺序循环即本决策的全部实现（源 `grammars.ts:184-230`，已核实，不重复粘贴）。

**(4) 具体数值**：并行度 = 1（严格顺序）；只加载 `unique(present langs) − cached − unavailable`。

**(5) 有序步骤**：随 D1 一并落地（同一函数）。

**(6) 测试**：spy `WasmLanguage.load`，喂一个纯 Python 项目语言集，断言只对 `python` 调一次、`typescript` 不被加载；断言两次 `WasmLanguage.load` 调用时序不重叠（顺序）。

**(7) 证据回指**：`/tmp/tk-research/codegraph/src/extraction/grammars.ts:184-230`（含 `#2338` 注释，已核实）。

---

### D9 — 对 tree-sitter-wasms 的 stale/broken ABI build，vendored 上游 `.wasm`（tier-1 强制 vendor C#）　【服务：两者】

**(1) 决策**：`tree-sitter-wasms` 落后上游时 vendor 上游 `.wasm`，从 `<pkg>/wasm/` 加载，其余仍 `require.resolve('tree-sitter-wasms/out/<file>')`。**tier-1 至少 vendor C#**（ABI-15 `c-sharp` 0.23.5，支持 primary constructor）—— ABI-13 build 把 `class Foo(...)` 解析成 ERROR 吞掉整个 class（#237），对企业 .NET target 是 must-fix。codegraph 还 vendor lua/luau/pascal/scala/r（ABI-13 Lua 在 web-tree-sitter 0.25 下损坏共享 WASM 堆）。

**(2) 要动的文件**：`src/codegraph/extraction/wasm/`（放 vendored `.wasm`，至少 `tree-sitter-c_sharp.wasm`）；加载分叉已在 D1 的 `loadGrammarsForLanguages` 内（`path.join(__dirname,'wasm',...)` 分支）。

**(3) 可抄代码**（vendor/fallback 一行三元分叉 + 证据注释，已核实）：
```typescript
// 源: /tmp/tk-research/codegraph/src/extraction/grammars.ts:210-222（VERBATIM 节选）
// Lua: tree-sitter-wasms 的 ABI-13 build 在 web-tree-sitter 0.25 下损坏共享 WASM 堆
//   （第一份文件之后每份都丢 nested calls/imports）；改 vendor 上游 ABI-15。
// C#: tree-sitter-wasms 的 ABI-13 build 无 primary-constructor 支持，把 `class Foo(...)`
//   解析成 ERROR 吞掉整个 class（#237）；改 vendor 上游 tree-sitter-c-sharp 0.23.5 (ABI-15)。
const wasmPath = (lang === 'pascal' || lang === 'scala' || lang === 'lua' ||
                  lang === 'luau' || lang === 'csharp' || lang === 'r')
  ? path.join(__dirname, 'wasm', wasmFile)
  : require.resolve(`tree-sitter-wasms/out/${wasmFile}`);
```

**(4) 具体数值**：tk tier-1 强制 vendor 集合 = `{csharp}`（1 个，`c_sharp.wasm` 约 5MB）；tier-2/3 的 `{lua, luau, pascal, scala, r}` 是 size-vs-correctness 选择（见 stillOpen，默认随 codegraph 一并 vendor）。

**(5) 有序步骤**：
1. 把上游 `tree-sitter-c_sharp.wasm`(ABI-15, 0.23.5) 放进 `src/codegraph/extraction/wasm/`。
2. 三元分叉接上（已在 D1 主体内）。
3. （可选）补 lua/luau/pascal/scala/r 的 vendored wasm。

**(6) 测试**：fixture `Foo.cs` 含 `public class Foo(int x);`（primary constructor），断言抽出 1 个 class node（非 ERROR）—— 若误用 ABI-13 build 此断言会失败，正好把 vendor 是否生效钉死。

**(7) 证据回指**：`/tmp/tk-research/codegraph/src/extraction/grammars.ts:210-222`（含 #237 注释，已核实）。

---

### D10 — Node 闸门 `>=22.5.0 <25.0.0` + 强制 `--liftoff-only`（统一裁决，消解 A/C/L 冲突）　【服务：两者】

**(1) 决策**：committed 闸门 = `engines.node '>=22.5.0 <25.0.0'`，配 vendored Node **24.x LTS-line**，解析进程上**强制** V8 `--liftoff-only`（缺失则带 env-guard re-exec 自身一次，防循环）。这条统一裁决消解 DEP MAP 中 A/C/L 的版本不一致：
- 下限 `22.5`：来自 node:sqlite 强 lean（C 需要），落在 codegraph 实测 WASM 带（20–24）内 → 取交集。
- 上限 `<25`：Node 25.x 有 V8 turboshaft WASM Zone OOM（`Fatal process out of memory: Zone`，即便 GB 级内存空闲也崩），不可修，硬 block。
- `--liftoff-only`：Node 22/24 编译 tree-sitter 大 WASM 时同一 OOM 仅靠此 flag 修复（强制 Liftoff baseline，不跑 turboshaft）；实测 `v8.setFlagsFromString` 太晚、`execArgv` 被拒、`NODE_OPTIONS` 不在 allowlist —— **只有命令行 flag 有效**。
- 关闭 A 的 open item：A 把 WASM 是否 ship 留 open，本节确认 WASM IS shipped（D1），故 L5/L7 的「core 是否 ship tree-sitter WASM」CLOSED：Node 25 排除、`--liftoff-only` 必需。FTS5 由 L 的 vendored-Node bundle 自带覆盖；仅 npm-shim-on-user-Node 路径需 C7 的 LIKE-scan fallback。

**(2) 要动的文件**：`package.json`（`engines.node` 改 `>=22.5.0 <25.0.0`，当前是 `>=20`）；`src/codegraph/extraction/wasm-runtime-flags.ts`（re-exec 守卫）；`src/codegraph/bin/node-version-check.ts`（>=22.5 floor + 25 block banner）。

**(3) 可抄代码**（re-exec 守卫，已核实）：
```typescript
// 源: /tmp/tk-research/codegraph/src/extraction/wasm-runtime-flags.ts:33,41,63-110（VERBATIM 节选）
import { spawnSync } from 'child_process';
export const WASM_RUNTIME_FLAGS: readonly string[] = ['--liftoff-only'];
const RELAUNCH_GUARD_ENV = 'TK_WASM_RELAUNCHED';   // 已改写：CODEGRAPH_ → TK_

export function processHasWasmRuntimeFlags(execArgv: readonly string[] = process.execArgv): boolean {
  return WASM_RUNTIME_FLAGS.every((flag) => execArgv.includes(flag));
}
export function buildRelaunchArgv(scriptPath: string, scriptArgs: readonly string[],
                                  execArgv: readonly string[] = process.execArgv): string[] {
  const preserved = execArgv.filter((arg) => !WASM_RUNTIME_FLAGS.includes(arg));
  return [...WASM_RUNTIME_FLAGS, ...preserved, scriptPath, ...scriptArgs];
}
export function relaunchWithWasmRuntimeFlagsIfNeeded(scriptPath: string): void {
  if (processHasWasmRuntimeFlags()) return;             // bundled launcher 已带 → no-op
  if (process.env[RELAUNCH_GUARD_ENV]) return;          // 永不循环
  const argv = buildRelaunchArgv(scriptPath, process.argv.slice(2));
  const result = spawnSync(process.execPath, argv, {
    stdio: 'inherit',
    env: { ...process.env, [RELAUNCH_GUARD_ENV]: '1' },
    windowsHide: true,
  });
  if (result.error) return;                             // 重启失败 → 退化 in-process（可能 OOM）但不崩
  process.exit(result.status ?? (result.signal ? 1 : 0));
}
```
engines 字段（已改写：tk 把 floor 从 codegraph 的 20 抬到 22.5 以满足 node:sqlite）：
```jsonc
// 源对照: /tmp/tk-research/codegraph/package.json:53-54 = ">=20.0.0 <25.0.0"
// tk 已改写（下限抬至 22.5 满足 node:sqlite）：
"engines": { "node": ">=22.5.0 <25.0.0" }
```
> 注：codegraph 的 `node-version-check.ts` 本体是**纯 banner（side-effect-free）**：`buildNode25BlockBanner()` / `buildNodeTooOldBanner()` / `MIN_NODE_MAJOR=20` 已核实存在，但实际 `process.exit` 强制点不在该文件内。tk 落地时需在 CLI bootstrap 调用处接上「major>=25 或 <22.5 → 打 banner + exit」的强制逻辑 —— **需实现时补**：gap = bootstrap 里的强制分支（codegraph 该文件只提供 banner builder，未提供 enforce 调用）。建议：`const m = +process.versions.node.split('.')[0]; if (m >= 25 && !process.env.TK_ALLOW_UNSAFE_NODE) { console.error(buildNode25BlockBanner(process.version)); process.exit(1); }`。

**(4) 具体数值**：`engines.node = '>=22.5.0 <25.0.0'`；vendored Node = 24.x；`WASM_RUNTIME_FLAGS = ['--liftoff-only']`；re-exec 至多 1 次（env-guard）。

**(5) 有序步骤**：
1. 改 `package.json` engines（独立可测：`pnpm pkg get engines.node`）。
2. 落 `wasm-runtime-flags.ts` re-exec 守卫，CLI 入口最先调 `relaunchWithWasmRuntimeFlagsIfNeeded(__filename)`。
3. CLI bootstrap 接 node-version enforce 分支（补上 exit）。

**(6) 测试**：
- `buildRelaunchArgv` 纯函数单测：断言输出首位是 `--liftoff-only`，且原 execArgv 去重保留。
- `processHasWasmRuntimeFlags(['--liftoff-only'])===true`、`([])===false`。
- 集成：以 `TK_WASM_RELAUNCHED=1` spawn，断言不再二次 re-exec（无循环）。
- A-B harness 字段：记录解析进程 `execArgv` 是否含 `--liftoff-only`（缺失=降级风险标记）。

**(7) 证据回指**：`/tmp/tk-research/codegraph/src/extraction/wasm-runtime-flags.ts:1-110`；`bin/node-version-check.ts:20-48`；`package.json:53-54`（已核实）。

---

### D11 — tier-1 per-language 捕获 config，TS/JS、Python、Go 钉死（VERBATIM，含各自 quirk hook）　【服务：两者】

**(1) 决策**：tier-1 捕获 config 作为 load-bearing 可抄 artifact 钉死。三条关键 quirk：TS `classifyTsClassMember`（`onClick = () => {}` 是 method，`count = 0` 是 property —— 错了就毁掉 kind 过滤，服务 B）；Go `getReceiverType` + 大写导出（把 method 链到 struct，撑起 struct→method `contains` 边）；Python method = class 内 `function_definition` + `@staticmethod`/`async`-sibling 检测。

**(2) 要动的文件**：`src/codegraph/extraction/languages/typescript.ts`、`python.ts`、`go.ts`。

**(3) 可抄代码** —— TypeScript（field-vs-method 分类器 + 提取器，已核实 16-96）：
```typescript
// 源: /tmp/tk-research/codegraph/src/extraction/languages/typescript.ts:16-96（VERBATIM 节选）
export function classifyTsClassMember(node: SyntaxNode): 'method' | 'property' {
  if (node.type !== 'public_field_definition' && node.type !== 'field_definition') {
    return 'method'; // method_definition / getter / setter —— 不动
  }
  for (let i = 0; i < node.namedChildCount; i++) {
    const child = node.namedChild(i);
    if (!child) continue;
    if (child.type === 'arrow_function' || child.type === 'function_expression') return 'method';
    if (child.type === 'call_expression') {        // HOF 包裹 onScroll = throttle(()=>{})
      const args = getChildByField(child, 'arguments');
      if (args) for (let j = 0; j < args.namedChildCount; j++) {
        const arg = args.namedChild(j);
        if (arg && (arg.type === 'arrow_function' || arg.type === 'function_expression')) return 'method';
      }
    }
  }
  return 'property';  // public fonts: Fonts; / count = 0 / static defaults = {...}
}

export const typescriptExtractor: LanguageExtractor = {
  functionTypes: ['function_declaration', 'arrow_function', 'function_expression'],
  classTypes: ['class_declaration', 'abstract_class_declaration'],
  methodTypes: ['method_definition', 'public_field_definition'],
  classifyMethodNode: classifyTsClassMember,
  interfaceTypes: ['interface_declaration'], structTypes: [],
  enumTypes: ['enum_declaration'], enumMemberTypes: ['property_identifier', 'enum_assignment'],
  typeAliasTypes: ['type_alias_declaration'], importTypes: ['import_statement'],
  callTypes: ['call_expression'], variableTypes: ['lexical_declaration', 'variable_declaration'],
  nameField: 'name', bodyField: 'body', paramsField: 'parameters', returnField: 'return_type',
  getSignature: (node, source) => {
    const params = getChildByField(node, 'parameters');
    const returnType = getChildByField(node, 'return_type');
    if (!params) return undefined;
    let sig = getNodeText(params, source);
    if (returnType) sig += ': ' + getNodeText(returnType, source).replace(/^:\s*/, '');
    return sig;
  },
  // resolveBody（arrow-field/HOF 包裹）、getVisibility、isExported 见源 56-110
};
```
Python（已核实 4-53）：
```typescript
// 源: /tmp/tk-research/codegraph/src/extraction/languages/python.ts:4-53（VERBATIM）
export const pythonExtractor: LanguageExtractor = {
  functionTypes: ['function_definition'], classTypes: ['class_definition'],
  methodTypes: ['function_definition'],              // class 内的 function 即 method
  interfaceTypes: [], structTypes: [], enumTypes: [], typeAliasTypes: [],
  importTypes: ['import_statement', 'import_from_statement'], callTypes: ['call'],
  variableTypes: ['assignment'],
  nameField: 'name', bodyField: 'body', paramsField: 'parameters', returnField: 'return_type',
  getSignature: (node, source) => {
    const params = getChildByField(node, 'parameters');
    const returnType = getChildByField(node, 'return_type');
    if (!params) return undefined;
    let sig = getNodeText(params, source);
    if (returnType) sig += ' -> ' + getNodeText(returnType, source);
    return sig;
  },
  isAsync: (node) => node.previousSibling?.type === 'async',
  isStatic: (node) => {
    const prev = node.previousNamedSibling;
    return prev?.type === 'decorator' && prev.text.includes('staticmethod');
  },
  extractImport: (node, source) => {
    const importText = source.substring(node.startIndex, node.endIndex).trim();
    if (node.type === 'import_from_statement') {
      const moduleNode = node.childForFieldName('module_name');
      if (moduleNode) return { moduleName: source.substring(moduleNode.startIndex, moduleNode.endIndex), signature: importText };
    }
    return null;
  },
};
```
Go（receiver-type + 大写导出，已核实 41-105）：
```typescript
// 源: /tmp/tk-research/codegraph/src/extraction/languages/go.ts:41-105（VERBATIM 节选）
export const goExtractor: LanguageExtractor = {
  functionTypes: ['function_declaration'], classTypes: [],        // Go 无 class
  methodTypes: ['method_declaration'], interfaceTypes: [], structTypes: [], enumTypes: [],
  typeAliasTypes: ['type_spec'], importTypes: ['import_declaration'], callTypes: ['call_expression'],
  variableTypes: ['var_declaration', 'short_var_declaration', 'const_declaration'],
  methodsAreTopLevel: true,
  nameField: 'name', bodyField: 'body', paramsField: 'parameters', returnField: 'result',
  getReturnType: extractGoReturnType,
  resolveTypeAliasKind: (node) => {
    const typeChild = getChildByField(node, 'type'); if (!typeChild) return undefined;
    if (typeChild.type === 'struct_type') return 'struct';
    if (typeChild.type === 'interface_type') return 'interface';
    return undefined;
  },
  isExported: (node, source) => {                                  // 首字母 A-Z = exported
    const nameNode = getChildByField(node, 'name'); if (!nameNode) return false;
    const first = getNodeText(nameNode, source).charCodeAt(0);
    return first >= 65 && first <= 90;
  },
  getReceiverType: (node, source) => {                             // (sl *Type)/(Type)/(s *Stack[T]) #583
    const receiver = getChildByField(node, 'receiver'); if (!receiver) return undefined;
    const text = getNodeText(receiver, source);
    const match = text.match(/\(\s*(?:[A-Za-z_]\w*\s+)?\*?\s*([A-Za-z_]\w*)/);
    return match?.[1];
  },
};
```

**(4) 具体数值**：TS `returnField='return_type'`，signature 拼接 `': '`；Python signature 拼接 `' -> '`；Go `returnField='result'`、`methodsAreTopLevel=true`、导出判定 charCode∈[65,90]。

**(5) 有序步骤**（每个语言独立可发布、可测）：
1. 落 `typescript.ts` + 注册（tsx/jsx 别名）。
2. 落 `python.ts` + 注册。
3. 落 `go.ts` + 注册。
4. 补 tier-1 余下 rust/java/c-cpp/csharp/javascript。

**(6) 测试**（每语言一组 fixture 断言）：
- TS：`class A { onClick = () => {}; count = 0 }` → 断言 `onClick` kind=method、`count` kind=property（钉死 #808）。
- Python：`@staticmethod\ndef f(): ...` 断言 `isStatic`；`async def g(): ...` 断言 `isAsync`；`def m(x) -> int:` 断言 signature 含 `-> int`。
- Go：`func (s *Stack[T]) Push(v T) {}` 断言 `getReceiverType==='Stack'`、`isExported('Push')===true`、`isExported('push')===false`。

**(7) 证据回指**：`typescript.ts:16-96`、`python.ts:4-53`、`go.ts:13-105`（均已核实）。

---

### D12 — file-level-only 语言（yaml/twig/properties）记文件不记符号；tier-1 不 ship 框架标记提取器　【服务：两者】

**(1) 决策**：file-level-only 语言（yaml/twig/properties）存一个 file node、产 0 个 symbol node，但**计入 indexed 而非 skipped**（对 ledger 诚实）。tier-1 **不** ship Razor/Svelte/Vue/Liquid/MyBatis 这类 bespoke regex/委派提取器（codegraph 各 7–12KB，高维护、低 v1 A/B 收益），延后。

**(2) 要动的文件**：`src/codegraph/extraction/grammars.ts`（`isFileLevelOnlyLanguage`）；通用 walker 内 no-symbol 分支。

**(3) 可抄代码**（已核实）：
```typescript
// 源: /tmp/tk-research/codegraph/src/extraction/grammars.ts:344-346（VERBATIM）
export function isFileLevelOnlyLanguage(language: Language): boolean {
  return language === 'yaml' || language === 'twig' || language === 'properties';
}
```

**(4) 具体数值**：file-level-only 集合 = `{yaml, twig, properties}`（3 种）；每文件产 0 symbol node、1 file node；计入 indexed。

**(5) 有序步骤**：
1. 落 `isFileLevelOnlyLanguage`，walker 命中即只建 file node。
2. ledger 计数把它们归 indexed。

**(6) 测试**：喂一份 `.yml`，断言产 0 symbol node、1 file node、计入 `filesIndexed`（非 `filesSkipped`）。

**(7) 证据回指**：`/tmp/tk-research/codegraph/src/extraction/grammars.ts:344-346`（已核实）。

---

### D13 — 默认忽略集（~50 个依赖/构建/缓存目录，永不忽略首方代码名）+ 1MB 文件跳过　【服务：两者】

**(1) 决策**：默认忽略一组 curated 的依赖/构建/缓存目录（~50 名，取自 github/gitignore 模板），无论有无 `.gitignore` 一律生效；**绝不**忽略首方易混名（`src/lib/app/bin/packages/deps/env/tmp`）以免藏住真源码。服务 B（更小索引 = 更便宜查询）+ 服务 A（图反映你的代码）。其余文件按 D4 的 1MB 跳过。

**(2) 要动的文件**：`src/codegraph/extraction/index.ts`（`DEFAULT_IGNORE_DIRS` + `DEFAULT_IGNORE_PATTERNS` + `MAX_FILE_SIZE`）。

**(3) 可抄代码**（已核实 117-158，VERBATIM 节选）：
```typescript
// 源: /tmp/tk-research/codegraph/src/extraction/index.ts:117-158（VERBATIM 节选）
const DEFAULT_IGNORE_DIRS: ReadonlySet<string> = new Set([
  // JS / TS 依赖
  'node_modules', 'bower_components', 'jspm_packages', 'web_modules', '.yarn', '.pnpm-store',
  // JS / TS 框架/打包 build/cache/deploy 产物
  '.next', '.nuxt', '.svelte-kit', '.turbo', '.vite', '.parcel-cache', '.angular',
  '.docusaurus', 'storybook-static', '.vinxi', '.nitro', 'out-tsc', '.vercel', '.netlify', '.wrangler',
  // 通用 build 产物
  'dist', 'build', 'out', '.output',
  // 测试/覆盖率
  'coverage', '.nyc_output',
  // Python
  '__pycache__', '__pypackages__', '.venv', 'venv', '.pixi', '.pdm-build',
  '.mypy_cache', '.pytest_cache', '.ruff_cache', '.tox', '.nox', '.hypothesis', '.ipynb_checkpoints', '.eggs',
  // Rust / JVM
  'target', '.gradle',
  // .NET
  'obj',
  // Go / PHP / Ruby vendored
  'vendor',
  // Swift / iOS
  '.build', 'Pods', 'Carthage', 'DerivedData', '.swiftpm',
  // Dart / Flutter
  '.dart_tool', '.pub-cache',
  // Native
  '.cxx', '.externalNativeBuild', 'vcpkg_installed',
  // Scala
  '.bloop', '.metals',
  // Lua / Luau
  'lua_modules', '.luarocks',
  // Delphi IDE 备份（重复 .pas 源，会双计）
  '__history', '__recovery',
  // 通用 cache
  '.cache',
]);
const DEFAULT_IGNORE_PATTERNS: string[] = [
  ...Array.from(DEFAULT_IGNORE_DIRS, (d) => `${d}/`),
  '*.egg-info/',     // Python packaging metadata
  'cmake-build-*/',  // CLion / CMake build trees
];
```
> 注：codegraph 注释明确「`packages/lib/app/bin/src/deps/env/tmp/storage/Library` 故意不列入」—— tk 原样沿用此「永不忽略首方易混名」原则。

**(4) 具体数值**：忽略目录 ~50 名（上表 set）；额外 glob `*.egg-info/`、`cmake-build-*/`；文件跳过阈值 `MAX_FILE_SIZE = 1024*1024 = 1_048_576` 字节。

**(5) 有序步骤**：
1. 落 `DEFAULT_IGNORE_DIRS` + patterns + `MAX_FILE_SIZE`。
2. 扫描阶段套用（与 `.gitignore` 取并，但首方名永不被默认集隐藏）。

**(6) 测试**：构造含 `node_modules/x.ts` + `src/y.ts` 的 fixture，断言 `y.ts` 被索引、`x.ts` 不被索引；构造 2MB `bundle.js` 断言计入 skipped。

**(7) 证据回指**：`/tmp/tk-research/codegraph/src/extraction/index.ts:101,117-158`（已核实）。

---

### D14 — LSP/SCIP = 可选 v2 互通缝，v1 ship 零 LSP / 零 SCIP　【服务：两者】

**(1) 决策**：v1 WASM 提取器是**唯一**符号源，ship 零 LSP、零 SCIP。LSP（Serena 风格）的 compiler-grade def/ref + ~10× rename token 收益是真的，但 per-language LSP runtime install + warm-up 正是 Anchor 1 要规避的 Windows 摩擦，「disqualifies it as a core for a lightweight CLI」。secondary target（Claude Code/macOS）用户可能已装 gopls/rust-analyzer —— 留一条**有文档的 opt-in 缝**，v1 不 commit 任何东西。SCIP emit/consume 作为 stillOpen v2 互通缝。

**(2) 要动的文件**：v1 无（不建 LSP/SCIP 文件）。v2 预留：`LanguageExtractor` 上一个 `extractor: 'wasm' | 'lsp'` 标记位（接口已可扩展，见 D3）。

**(3) 可抄代码**：v1 无可抄代码（决策即「不做」）。v2 seam = **需实现时补**：gap = per-language `extractor` 标记 + LSP client 适配层 + SCIP protobuf reader/writer，均无 v1 对应物，待 v2 互通决策后实现。

**(4) 具体数值**：v1 LSP=0、SCIP=0。

**(5) 有序步骤**：v1 无步骤；记录 stillOpen（见下）。

**(6) 测试**：v1 无；回归断言 = grep 确认无 `vscode-languageserver` / `scip` 运行时依赖混入 v1 deps。

**(7) 证据回指**：`docs/codegraph/low-token-agent-research-compendium-20260618.md:293-325`（Serena ~4k vs ~38k token rename / SCIP per-language indexer 成本，dossier 引述）。

---

### 跨节绑定与 stillOpen（需用户拍板）

- **Node 闸门统一**：`>=22.5.0 <25.0.0` + vendored Node 24.x + 强制 `--liftoff-only` 已由 D10 收口（A/C/L 原各自 open，现 CLOSED）—— 请确认接受为单一跨需版本锚。
- **tier-2/3 CI 预算**：默认 test-light（fix-on-report），换 tier-2/3 ledger 诚实度，是否接受。
- **框架/markup 提取器**：v1 默认全部延后到 file-level-only；Razor 触及企业 .NET primary target，是否破例。
- **vendored-wasm 集合**：tier-1 仅 C# 强制；lua/luau/pascal/scala/r 是 size-vs-correctness（c_sharp.wasm 约 5MB），是否随 codegraph 一并 vendor。
- **SCIP emit/consume 互通缝**：v2 是否要 EMIT/CONSUME SCIP（macOS/Claude-Code 已装 toolchain 的项目可升级到 compiler-grade），待 ecosystem-interop 是否为目标的拍板。

---

## 需求 E — Freshness / incremental（新鲜度 / 增量）

> 本节落实「三层 lazy-first 新鲜度模型」：**触发=按读懒检查、默认无常驻 daemon/watcher**；**失效精度=两级（content-hash 快路 + AST 结构指纹分级）+ 下游 BFS + referencer-set diff**；**新鲜度信号一等公民、A/B 双受众**。所有存储落在 node:sqlite（强倾向），整数 `index_generation` 比较即为陈旧判定，零原生编译、零模型出口。
>
> 与上游一致性约束（来自 DEP MAP）：
> - **承接 A**：图节点带 `file:line`、edges 走 `calls`/`imports`，本节的 BFS 下游重算复用这两类边；陈旧通过 `index_generation` 整数比较实现。
> - **承接 B**：失效分级写回 C 的 `provenance` 列上下文——COSMETIC/comment/docstring-only 变更**不触发** LLM 重生成（B 的 host-paid 生成层），只做廉价的 source-line/lineno 刷新。
> - **冲突裁定（E/F/J/M daemon 姿态）**：v1 提交 **lazy-on-read 为默认**、stdio 单进程、**无 daemon**；J8/J9 的陈旧 banner 由本节的懒 mtime 扫描驱动（**非**常驻 watcher）；daemon 仅作 M18 条件分支，留 stillOpen。
> - **冲突裁定（C/L 存储位置）**：指纹库 DB 与图 DB 同处**仓外** per-project fingerprint 目录（POSIX `~/.token-killer/projects/<fp>/index.db`，Windows `%LOCALAPPDATA%\token-killer\...`），永不进 `.tk/`。
> - **版本门（A/C/D/L）**：`engines.node ">=22.5.0 <25.0.0"`，FTS5 由 vendored Node 24.x bundle 保证；本节不新增版本约束。

---

### E1 — 默认触发=按读懒检查，无常驻 daemon、无原生 watcher（服务 两者）

**(1) 决策**：默认触发是 **lazy on-read 陈旧检查**——每次 MCP/CLI 查询时对被引用文件做一次廉价 `(path,mtime,size)` 扫描；差异文件才进入 hash/parse。**绝不**默认起 watcher、socket、pidfile、daemon。

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

### E2 — 指纹库 schema（node:sqlite）+ 节点 `index_generation` 整数比较（服务 两者）

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

### E3 — 廉价 pre-filter=（mtime_ns, size），未变文件只花一次 stat（服务 B）

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

### E4 — Tier-1 失效=sha256 content-hash 快路（identical ⇒ NONE，跳过 parse）（服务 B）

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

### E5 — Tier-2 失效=AST 结构指纹 diff → COSMETIC vs STRUCTURAL（服务 两者）

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

### E6 — STRUCTURAL 文件上的 per-symbol ChangeType 分类（服务 两者）

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

### E7 — 下游重算集=变更文件自身节点 ∪ 反向 calls/imports BFS（拓扑序）（服务 两者）

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

### E8 — caller-side 精度=who_reference_me set-diff（服务 两者）

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

### E9 — recompute-scope cap 阶梯：SKIP / PARTIAL / ARCHITECTURE / FULL（服务 两者）

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

### E10 — 可选 opt-in git hooks（post-commit/merge/checkout，后台、marker-block 幂等，默认 OFF）（服务 两者）

**(1) 决策**：提供 opt-in 的三个 git hook，后台跑 `tk sync`、marker-block 包裹幂等、尊重 `core.hooksPath`、`command -v` 守门；**默认关闭**。这是 commit-precise 路径，避开 DeepWiki 的 hours-days 调度延迟，且**无常驻进程**。

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

### E11 — daemon + native watcher 仅显式 opt-in，默认 OFF，WSL2 /mnt 硬禁（服务 B）

**(1) 决策**：daemon+watcher 仅作显式 opt-in 逃生舱（`TK_WATCH=1` / `tk watch`），**默认 OFF**，debounce **2000ms**，在 WSL2 `/mnt/<drive>` 挂载与超 fd 上限时**硬禁**。把所有常驻进程 Windows 风险局限在显式接受的用户。

**(2) 要动的文件**：`src/freshness/watchPolicy.ts`（移植 codegraph watch-policy.ts，env 名 `CODEGRAPH_*`→`TK_*`）；`src/freshness/watcher.ts`（opt-in）。

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

### E12 — agent-facing 陈旧 banner + 结构化字段（服务 B）

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

### E13 — human-facing 新鲜度 badge（HTML 报告）（服务 A）

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

### E14 — 陈旧基线锚 git commit hash + mtime 实时覆盖（服务 两者）

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

### E15 — 脏工作树正确性：fake-file swap 仅用于 commit-state doc，默认 index 反映 live tree（服务 两者）

**(1) 决策**：默认 agent index = **当前磁盘内容**（用户正在编辑的 live tree，服务 B）；RepoAgent 的 fake-file swap 仅在显式生成 commit-state doc 时用（服务 A）。守卫：若 `git status` 已含 `*_latest_version` 残留 fake-file 则拒绝。

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

### E16 — 无 tree-sitter parser 的文件在任何 hash 变更上保守判 STRUCTURAL（服务 两者）

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

### 本节遗留待用户拍板（stillOpen）

1. **会话首查时 HEAD 大幅移动**（如 `git pull` 200 commits）：静默触发 FULL_UPDATE，还是先发 frozen banner 要求显式 `tk sync`？（成本 vs 惊讶；待用户设触发 FULL 的延迟预算。）
2. **secondary 平台（Claude Code/macOS，watcher 安全）是否在 `tk init` 自动提示 opt-in git hooks**，还是两平台统一默认关以保行为一致？
3. **Windows/NTFS mtime 粒度与时区/DST**：`mtime_ns` 是否够可靠单用，还是必须始终用 size+hash 兜底？（倾向 hash 兜底，但需像 inspect scan-cache 那样做 Windows 现场核验。）
4. **COSMETIC 变更对 HUMAN doc 层的处理**：COSMETIC（内部逻辑）改了行为但没改签名——human 新鲜度 badge 是否要标该节点「doc may be behind」，即便 agent index 视其为 fresh？（A/B 分歧，用户可能想调。）

> 与全局 stillOpen 关联：daemon/shared-index 分支（M18/F #2/E11）v1 提交 stdio 单进程无 daemon，条件分支门控在 K 的 op-count/cold-start 测量——待用户设会翻转它的 cold-start 延迟预算（或确认「v1 永不」）。


---

## 需求 F — Agent delivery surface（agent 如何触达工具 / 工具形态与引导）

本需求服务 **B（agent find-code / token 优化）**，但其交付载体（VS Code 扩展）同时是 H（人类 HTML viewer）和 I（协作 round-trip）的宿主 —— 即 DEP MAP 的「ONE BACKEND, TWO DIETS, TWO FRONT-ENDS」收敛点。所有工具仅暴露 A 的 retrieval diet（B1 静态层），LLM 生成层（B 叙事 tier）不进入任何被列出的工具。

锚点绑定：
- **传输 = stdio**（DEP MAP `E/F/J/M` 冲突已裁定：v1 单进程 per-session，无 daemon；daemon 是 M18 受 K op-count 度量门控的条件分支，非 v1）。
- **输出预算单位 = char**，数值 `13000/18000/24000` 由 G1 拥有，F **import** 不重定义（DEP MAP `G/F` 冲突裁定）。
- **DB 路径 = 库外** `~/.token-killer/projects/<fp>/index.db`（POSIX）/ `%LOCALAPPDATA%\token-killer\...`（Win）；`.tk/` 仅放人类工件（DEP MAP `C/L` 冲突裁定）。本需求所有「indexed?」探测以「能否解析到该库外 fingerprint dir」为准，不依赖 `.codegraph/`。
- **Node gate** `>=22.5.0 <25.0.0`（跨需求统一）。

---

### F.1 决策：双前端 / 单后端交付形态（服务 B）

**(1) 决策**：PRIMARY = VS Code Copilot/Windows 上的 **tk VS Code 扩展**，同时注册 (a) Language Model Tools（`vscode.lm.registerTool` + `languageModelTools` contribution）和 (b) 同一后端的程序化 MCP（`registerMcpServerDefinitionProvider`）；SECONDARY = Claude Code/Mac 及全部终端宿主上的单一 stdio MCP server，命令 `tk mcp`。两前端调用同一套 tool handler。理由：enterprise MCP-in-Copilot **默认锁闭**，LM-Tool API 是唯一能触达 built-in read/search 面的通道；终端宿主所有通道开放，raw MCP 完整可用。

**(2) 要动的文件**（tk repo，新建为主）：
```
src/mcp/                      # 新建：F 的后端核心（port 自 codegraph/src/mcp，去 daemon）
  transport.ts               # LineBasedJsonRpcTransport + StdioTransport（hand-rolled，零依赖）
  session.ts                 # MCPSession：initialize / tools/list / tools/call / roots/list
  tools.ts                   # ToolDefinition[] + ToolHandler + DEFAULT_MCP_TOOLS + 预算函数
  server-instructions.ts     # SERVER_INSTRUCTIONS（full）+ _UNINDEXED（short）
  serverInfo.ts              # SERVER_INFO + PROTOCOL_VERSION
  index.ts                   # MCPServer（direct/stdio-only），被 `tk mcp` 调用
src/cli.ts                   # 改：注册 `tk mcp`（别名 `tk serve --mcp`）子命令 → MCPServer.start()
src/budget.ts                # 新建：G1 的 char tier 常量 + getExploreBudget（F8 import 此处，单一真相源）
extension/                   # 新建：VS Code 扩展（独立打包，PRIMARY 前端）
  package.json               # languageModelTools contribution + activationEvents
  src/extension.ts           # activate()：registerTool ×N + registerMcpServerDefinitionProvider
  src/tools/lmTools.ts       # 每个 LM tool 的 invoke() → 调 src/mcp 的 ToolHandler（in-proc 或 spawn `tk mcp`）
package.json                 # 改：engines.node ">=22.5.0 <25.0.0"
```
后端（`src/mcp` + `src/budget`）随主 tarball 发布；扩展 `extension/` 经 L 渠道单独发布（vsix），运行时 in-process 调用或 spawn `tk mcp` 作为 graph backend（DEP MAP `F/H/I/L` 冲突裁定）。

**(3) 可抄代码** —— `tk mcp` 子命令的 direct-stdio 启动骨架，源 codegraph 的 direct 路径（已改写：删 daemon/proxy 分支，强制 stdio-only，因 v1 无 daemon）：

源: /tmp/tk-research/codegraph/src/mcp/index.ts:332-343（已改写为 stdio-only）
```ts
// src/mcp/index.ts  —— v1 = single-process-per-session stdio, NO daemon (M18/E1)
import { StdioTransport } from './transport';
import { MCPEngine } from './engine';        // tk: 内含 graph store + diets（need A/C）
import { MCPSession } from './session';

export class MCPServer {
  private engine!: MCPEngine;
  private session!: MCPSession;
  constructor(private projectPath: string | null = null) {}

  async start(): Promise<void> {
    this.engine = new MCPEngine();
    const transport = new StdioTransport();              // exitOnClose 默认 true（per-session）
    this.session = new MCPSession(transport, this.engine, {
      explicitProjectPath: this.projectPath,
    });
    if (this.projectPath) {
      void this.engine.ensureInitialized(this.projectPath);  // 后台 init，保持 initialize 快(#172)
    }
    this.session.start();
  }
}
```

VS Code 扩展的 LM-Tool contribution（源: dossier F1 concrete，**需实现时补** —— codegraph 无扩展实现；以下为 tk 改写的 `package.json` 片段，依据官方 LM Tool API）：
```jsonc
// extension/package.json
{
  "activationEvents": ["onStartupFinished"],
  "contributes": {
    "languageModelTools": [
      {
        "name": "tk_explore",
        "toolReferenceName": "tkExplore",
        "displayName": "tk explore",
        "modelDescription": "PRIMARY TOOL — call FIRST for almost any question OR before an edit. Returns verbatim source grouped by file in ONE capped call (Read-equivalent), plus the call path. Use INSTEAD of reading files.",
        "canBeReferencedInPrompt": true,
        "inputSchema": { "type": "object", "properties": {
          "query": { "type": "string" }, "maxFiles": { "type": "number", "default": 12 }
        }, "required": ["query"] }
      }
      // tk_node / tk_search / tk_callers 同形（schema 见 F.6）
    ]
  }
}
```

**(4) 具体数值**：扩展默认列出 4 个 LM tool（tiny-repo 3 个，见 F.4/F.5）；`activationEvents=["onStartupFinished"]`；后端注册 MCP 用 `registerMcpServerDefinitionProvider`（GA）。SECONDARY 命令字面 `tk mcp`（别名 `tk serve --mcp`）。

**(5) 有序步骤**（每步独立可发、可测）：
1. `src/budget.ts`：落 G1 char tier 常量 + `getExploreBudget`（无依赖）。
2. `src/mcp/transport.ts`：port hand-rolled transport（依赖无）。
3. `src/mcp/{serverInfo,server-instructions,tools,session}.ts`：后端（依赖 A/C 的 graph store + step 1/2）。
4. `src/mcp/index.ts` + `src/cli.ts`：接 `tk mcp`（依赖 step 3）。SECONDARY 此步即可发版、Claude Code 可用。
5. `extension/`：LM tools + 程序化 MCP，invoke 调 step 3 后端（依赖 step 4）。PRIMARY 此步发版。

**(6) 测试**：
- step 4：`echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}' | tk mcp` 单测断言返回含 `serverInfo.name="tk"` + `instructions` 字段；`tools/list` 在已索引仓返回 4 条、未索引返回 `[]`。
- step 5：扩展集成测试断言 `vscode.lm.tools` 含 `tk_explore`；A/B harness 在 Claude Code headless 跑 `tk mcp` 量 Job-B（K Track-1）。

**(7) 证据回指**：token-optimization-landscape-20260618 §C3（MCP 默认锁闭）/§C8（LM-Tool 是唯一触达 read/search 面的通道）；codegraph `src/mcp/index.ts:332-343`。

---

### F.2 决策：传输 = 手写 newline-delimited JSON-RPC 2.0，非 SDK（服务 B）

**(1) 决策**：MCP 传输 = 手写 `LineBasedJsonRpcTransport`（port codegraph `transport.ts`，~420 LOC 零依赖），**不**用 `@modelcontextprotocol/sdk`。实现 `initialize / tools/list / tools/call / ping / resources/list（空）/ resources/templates/list（空）/ prompts/list（空）` + server-initiated `roots/list`。错误码 `-32700/-32600/-32601/-32602/-32603`。理由：tk 的零原生依赖 + Windows 冷启动/AV 税 + 自包含 tarball 约束下，SDK 对一个 ~7 方法的协议是纯负担 —— gitnexus 为对抗 SDK 的 stdout 处理被迫加 `CompatibleStdioServerTransport` shim（已核实 `gitnexus/src/mcp/server.ts:15-16,339`），codegraph 无此 shim。对 `resources/prompts/templates` 回空而非 `-32601`，避开部分客户端日志里的吓人报错（#621）。

**(2) 要动的文件**：`src/mcp/transport.ts`（新建）。

**(3) 可抄代码** —— 接口、错误码、handleLine、server-initiated request：

源: /tmp/tk-research/codegraph/src/mcp/transport.ts:59-82（verbatim）
```ts
// Standard JSON-RPC error codes
export const ErrorCodes = {
  ParseError: -32700,
  InvalidRequest: -32600,
  MethodNotFound: -32601,
  InvalidParams: -32602,
  InternalError: -32603,
} as const;

export interface JsonRpcTransport {
  start(handler: MessageHandler): void;
  stop(): void;
  send(response: JsonRpcResponse): void;
  notify(method: string, params?: unknown): void;
  request(method: string, params?: unknown, timeoutMs?: number): Promise<unknown>;
  sendResult(id: string | number, result: unknown): void;
  sendError(id: string | number | null, code: number, message: string, data?: unknown): void;
}
```

源: /tmp/tk-research/codegraph/src/mcp/transport.ts:114-128（verbatim，server-initiated request：5000ms 超时 + timer.unref）
```ts
request(method: string, params?: unknown, timeoutMs = 5000): Promise<unknown> {
  const id = `${this.idPrefix()}-${this.nextRequestId++}`;
  return new Promise<unknown>((resolve, reject) => {
    const timer = setTimeout(() => {
      this.pending.delete(id);
      reject(new Error(`Timed out after ${timeoutMs}ms waiting for "${method}" response`));
    }, timeoutMs);
    timer.unref?.();   // 不让 pending 请求在 shutdown 时吊住进程
    this.pending.set(id, {
      resolve: (value) => { clearTimeout(timer); resolve(value); },
      reject: (error) => { clearTimeout(timer); reject(error); },
    });
    this.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }));
  });
}
```

源: /tmp/tk-research/codegraph/src/mcp/transport.ts:162-208（verbatim，handleLine：JSON.parse 失败 → sendError(null,-32700)）
```ts
protected async handleLine(line: string): Promise<void> {
  const trimmed = line.trim();
  if (!trimmed) return;
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    this.sendError(null, ErrorCodes.ParseError, 'Parse error: invalid JSON');
    return;
  }
  const obj = parsed as Record<string, unknown>;
  // server-initiated 请求的响应（有 id + result/error、无 method）→ 路由回 awaiting requester
  if (obj?.jsonrpc === '2.0' && typeof obj.method !== 'string' &&
      'id' in obj && ('result' in obj || 'error' in obj)) {
    this.handleResponse(obj);
    return;
  }
  if (!this.isValidMessage(parsed)) {
    this.sendError(null, ErrorCodes.InvalidRequest, 'Invalid Request: not a valid JSON-RPC 2.0 message');
    return;
  }
  if (this.messageHandler) {
    try {
      await this.messageHandler(parsed as JsonRpcRequest | JsonRpcNotification);
    } catch (err) {
      const message = parsed as JsonRpcRequest;
      if ('id' in message) {
        this.sendError(message.id, ErrorCodes.InternalError,
          `Internal error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }
}
```

StdioTransport 的 write / idPrefix（源: /tmp/tk-research/codegraph/src/mcp/transport.ts:319-325，verbatim，仅 idPrefix 改 `tk-srv`）：
```ts
protected write(line: string): void {
  process.stdout.write(line + '\n');
}
protected idPrefix(): string {
  return 'tk-srv';   // codegraph 原为 'cg-srv'，tk 改前缀
}
```

**(4) 具体数值**：server-initiated `roots/list` 超时 `5000ms`；server-initiated id 格式 `tk-srv-${n}`；newline-delimited（每条 JSON 后 `\n`）；零运行时依赖。

**(5) 有序步骤**：单步 —— 落 `transport.ts`（含 `LineBasedJsonRpcTransport` 抽象基类 + `StdioTransport` 子类）。Socket 子类 v1 不需要（无 daemon）。

**(6) 测试**：单测 4 条 —— (a) 喂非法 JSON 行断言收到 `{"error":{"code":-32700}}`；(b) 喂缺 method 的请求断言 `-32600`；(c) 喂未知 method 断言 `-32601`（在 session 层）；(d) `request()` 在无响应时 5000ms 后 reject。

**(7) 证据回指**：codegraph `transport.ts:59-82,114-128,162-208,319-325`；对照 gitnexus `server.ts:15-16,339`（SDK + CompatibleStdioServerTransport shim，已核实）。

---

### F.3 决策：默认 4 工具 + tiny-repo 3 工具 + `TK_MCP_TOOLS` ablation（服务 B）

**(1) 决策**：默认工具面 = 4 个 `tk_` 前缀工具 —— `tk_explore`(PRIMARY) / `tk_node` / `tk_search` / `tk_callers`。`callees/impact/files/status` 的 handler 保留但默认不列出；环境变量 `TK_MCP_TOOLS`（逗号分隔短名）重新启用任意工具，被 ablate 的工具从 `tools/list` 真正缺席（非 call 时拒绝）—— 这同时是 A/B harness 的基线臂（F.7）。**500 索引文件以下**降到 3 工具三件套（`tk_explore/tk_search/tk_node`，丢 `tk_callers`）。理由（codegraph 实测）：1-tool 门 express 从 -43%WIN→+107%LOSS；`impact` 在零 eval 出现（blast-radius 已内联在 explore 和 node）；`callees` 冗余（body 即 callee list）。gitnexus 无条件列 17（已核实 `tools.ts` 26 个 `name:` 含别名/重载）= 文档化的「navigation-tool ceiling」反模式。

**(2) 要动的文件**：`src/mcp/tools.ts`（`DEFAULT_MCP_TOOLS` + `getStaticTools` + `ToolHandler.getTools` + tiny-repo 门 + `toolAllowlist/isToolAllowed`）。

**(3) 可抄代码**：

源: /tmp/tk-research/codegraph/src/mcp/tools.ts:656,625-632（verbatim，前缀 codegraph_→tk_，env 名改 `TK_MCP_TOOLS`）：
```ts
const DEFAULT_MCP_TOOLS = new Set(['explore', 'node', 'search', 'callers']);

// 无 engine 时的静态工具面（proxy/初始化前 tools/list 用）
export function getStaticTools(): ToolDefinition[] {
  const raw = process.env.TK_MCP_TOOLS;
  if (!raw || !raw.trim()) {
    return tools.filter(t => DEFAULT_MCP_TOOLS.has(t.name.replace(/^tk_/, '')));
  }
  const allow = new Set(raw.split(',').map(s => s.trim().replace(/^tk_/, '')).filter(Boolean));
  return allow.size ? tools.filter(t => allow.has(t.name.replace(/^tk_/, ''))) : tools;
}
```

源: /tmp/tk-research/codegraph/src/mcp/tools.ts:728-740（verbatim，env+前缀已改写）：
```ts
private toolAllowlist(): Set<string> | null {
  const raw = process.env.TK_MCP_TOOLS;
  if (!raw || !raw.trim()) return null;
  const short = (s: string) => s.trim().replace(/^tk_/, '');
  const set = new Set(raw.split(',').map(short).filter(Boolean));
  return set.size ? set : null;
}
/** 工具名是否通过 TK_MCP_TOOLS allowlist */
private isToolAllowed(name: string): boolean {
  const allow = this.toolAllowlist();
  return !allow || allow.has(name.replace(/^tk_/, ''));
}
```

tiny-repo 门 + 动态预算描述，源: /tmp/tk-research/codegraph/src/mcp/tools.ts:748-799（verbatim，前缀已改写）：
```ts
getTools(): ToolDefinition[] {
  const allow = this.toolAllowlist();
  let visible = allow
    ? tools.filter(t => allow.has(t.name.replace(/^tk_/, '')))
    : tools.filter(t => DEFAULT_MCP_TOOLS.has(t.name.replace(/^tk_/, '')));
  if (!this.cg) return visible;

  const stats = this.cg.getStats();
  const budget = getExploreBudget(stats.fileCount);

  // tiny-repo 门：<500 文件只暴露三件套（callers 在此规模也退化为一次 grep）
  const TINY_REPO_FILE_THRESHOLD = 500;
  const TINY_REPO_CORE_TOOLS = new Set(['tk_explore', 'tk_search', 'tk_node']);
  if (stats.fileCount < TINY_REPO_FILE_THRESHOLD) {
    visible = visible.filter(t => TINY_REPO_CORE_TOOLS.has(t.name));
  }

  return visible.map(tool => {
    if (tool.name === 'tk_explore') {
      return { ...tool,
        description: `${tool.description} Budget: make at most ${budget} calls for this project (${stats.fileCount.toLocaleString()} files indexed).` };
    }
    return tool;
  });
}
```

execute() 内的防御性拒绝（源: /tmp/tk-research/codegraph/src/mcp/tools.ts:1117-1119，verbatim，env 改写）：
```ts
if (!this.isToolAllowed(toolName)) {
  return this.errorResult(`Tool ${toolName} is disabled via TK_MCP_TOOLS`);
}
```

**(4) 具体数值**：`DEFAULT_MCP_TOOLS`=4；`TINY_REPO_FILE_THRESHOLD`=**500**；tiny-repo 核心=3；`TK_MCP_TOOLS` 空/未设→默认 4 套，sentinel 空集→零工具（基线臂，F.7）。

**(5) 有序步骤**：1) 定义 `DEFAULT_MCP_TOOLS` + `getStaticTools`；2) `toolAllowlist/isToolAllowed`；3) `getTools` 接 tiny-repo 门 + 动态预算描述；4) execute 入口加 `isToolAllowed` 拒绝。各步可独立单测。

**(6) 测试**：(a) 未设 env，`getTools()` 在 600 文件仓返回 4 名、在 400 文件仓返回 3 名（无 `tk_callers`）；(b) `TK_MCP_TOOLS=impact,node` → `getTools()` 仅 2 名且含 `tk_impact`；(c) `TK_MCP_TOOLS=` 空字符串 → 默认 4（非零）；(d) ablate 后 execute(`tk_callers`) 返回 isError + "disabled via TK_MCP_TOOLS"。

**(7) 证据回指**：codegraph `tools.ts:656,625-632,728-740,748-799,1117-1119`；对照 gitnexus 17-tool 无条件列出（`tools.ts:80`）。

---

### F.4 决策：NO-INDEX → 空 tools/list + success-shaped NotIndexed（服务 B）

**(1) 决策**：无 tk 索引 → `tools/list` 返回**空数组**，`initialize.instructions` 用 short「inactive this session」变体。运行中途命中 NotIndexed → 返回 **success-shaped** 结果（guidance text，`isError` 缺省 = false），绝不 `isError:true`。仅安全拒绝（`PathRefusalError`）保持 `isError:true`（= 让 agent 停止重试）。理由（codegraph docstring 实测）：早期 `isError:true` 教会 agent「工具坏了」从而整个 session 弃用 codegraph（observed repeatedly）；空 list 是 agent 唯一不会误读的信号。

**(2) 要动的文件**：`src/mcp/session.ts`（`handleToolsList` 空门 + initialize 变体选择）、`src/mcp/tools.ts`（`NotIndexedError`/`PathRefusalError` 类 + dispatch catch + `textResult`/`errorResult`）。

**(3) 可抄代码**：

错误类语义，源: /tmp/tk-research/codegraph/src/mcp/tools.ts:44,50（verbatim）：
```ts
/** 可恢复的「索引缺失」等条件 → dispatch catch 转 success-shaped（无 isError）。 */
export class NotIndexedError extends Error {}
/** 安全拒绝（敏感系统路径）→ 保持 isError:true、不给重试引导。 */
export class PathRefusalError extends Error {}
```

dispatch catch，源: /tmp/tk-research/codegraph/src/mcp/tools.ts:1171-1187（verbatim）：
```ts
} catch (err) {
  // 预期条件、非故障：以 SUCCESS 应答，使 agent 对「确已索引」的项目继续信任工具集。
  if (err instanceof NotIndexedError) {
    return this.textResult(err.message);
  }
  // 安全拒绝：干净的 error，无重试鼓励。
  if (err instanceof PathRefusalError) {
    return this.errorResult(err.message);
  }
  return this.errorResult(
    `Tool execution failed: ${err instanceof Error ? err.message : String(err)}. ` +
    'This is an internal tk error — retry the call once; if it persists, ' +
    'continue without tk for this task.'
  );
}
```

result shape，源: /tmp/tk-research/codegraph/src/mcp/tools.ts:3903-3914（verbatim）：
```ts
private textResult(text: string): ToolResult {
  return { content: [{ type: 'text', text }] };          // 无 isError → success-shaped
}
private errorResult(message: string): ToolResult {
  return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true };
}
```

空 tools/list 门，源: /tmp/tk-research/codegraph/src/mcp/session.ts:229-231（verbatim）：
```ts
this.transport.sendResult(request.id, {
  tools: this.engine.hasDefaultCodeGraph() ? this.engine.getToolHandler().getTools() : [],
});
```

**(4) 具体数值**：未索引 `tools/list`=`[]`；NotIndexed result `isError` 字段=缺省（false）；PathRefusal `isError`=true；内部故障文案含「retry the call once」。

**(5) 有序步骤**：1) 定义两个 error 类 + `textResult/errorResult`；2) dispatch catch 三分支；3) `handleToolsList` 空门（依赖 step 1）。

**(6) 测试**：(a) 在未索引目录 `tools/list` 断言返回 `tools:[]`；(b) handler 抛 `NotIndexedError` → 结果 `content[0].text` 含 guidance 且 `isError` 不为 true；(c) 抛 `PathRefusalError` → `isError:true`。

**(7) 证据回指**：codegraph `tools.ts:33-44,1171-1187,3903-3914`；`session.ts:220-231`。

---

### F.5 决策：≤9KB server-instructions playbook（full + short 两变体）（服务 B）

**(1) 决策**：在 `initialize.instructions` 发一份 tight markdown playbook（full 变体 codegraph 实测 9296 bytes，tk 目标 ≤~9KB），含「## Use tk instead of reading files」「## Tool selection by intent」「## Common chains」「## Anti-patterns」「## Limitations」。变体由 `findNearestRoot(explicitPath??cwd)!==null` 同步选择（existsSync 走查，不开 DB，保持 initialize 快）。理由：MCP 客户端把此文本自动放进 agent 系统提示 —— 这是 ADDITIVE 问题的主引导杆（VS Code Copilot built-in read/search 无法拦截，只能靠 description+instructions 把 agent 引向 `tk_*`）。

**(2) 要动的文件**：`src/mcp/server-instructions.ts`（导出 `SERVER_INSTRUCTIONS` + `SERVER_INSTRUCTIONS_UNINDEXED`）；`src/mcp/session.ts`（变体选择 + initialize 应答）。

**(3) 可抄代码**：

变体选择 + initialize 应答（success-fast，#172），源: /tmp/tk-research/codegraph/src/mcp/session.ts:202-210（verbatim，标识符 codegraph→tk）：
```ts
// 用 workspace 索引态选 instructions 变体 —— 同步走查（仅 existsSync 循环、不开 DB）
const indexed = findNearestTkRoot(explicitPath ?? process.cwd()) !== null;

// 在任何重 init 之前先回握手（#172）
this.transport.sendResult(request.id, {
  protocolVersion: PROTOCOL_VERSION,
  capabilities: { tools: {} },
  serverInfo: SERVER_INFO,
  instructions: indexed ? SERVER_INSTRUCTIONS : SERVER_INSTRUCTIONS_UNINDEXED,
});
```

short 变体全文，源: /tmp/tk-research/codegraph/src/mcp/server-instructions.ts:89-98（verbatim，codegraph→tk、`.codegraph/`→tk 索引、`codegraph init`→`tk init`）：
```ts
export const SERVER_INSTRUCTIONS_UNINDEXED = `# tk — inactive (workspace not indexed)

This workspace has no tk index, so no tk tools are available this session.
Work with your built-in tools as usual.

Indexing is the user's decision — do not run it yourself. If the user asks
about tk, they can enable it by running \`tk init\` in the project root and
starting a new session.
`;
```

full 变体的**锚点小节**（源: /tmp/tk-research/codegraph/src/mcp/server-instructions.ts:62-76 的 Anti-patterns/Limitations，verbatim 关键反模式，codegraph→tk）：
```md
## Anti-patterns
- **Trust tk's results — don't re-verify them with grep.** They come from a full
  AST parse; re-checking with grep is slower, less accurate, and wastes context.
- **Don't grep first** when looking up a symbol by name — tk_search is faster.
- **Don't chain tk_search + tk_node** to understand an area — ONE tk_explore
  returns the relevant symbols' source together in a single round-trip.
- **Don't reach for the Read tool on an indexed source file** — tk_node with a
  `file` reads it (same `<n>\t<line>` source, offset/limit like Read, faster,
  with its blast radius). Read only what tk doesn't index (configs, docs).
```
（full 变体其余小节 Tool-selection-by-intent / Common-chains 直接 port codegraph `server-instructions.ts:45-60`，标识符替换 `codegraph_*`→`tk_*`，**需实现时补**剩余文案逐字替换。）

**(4) 具体数值**：full 变体目标 **≤~9KB**（codegraph 基线 9296 bytes）；变体选择 = `findNearestTkRoot()!==null` 同步 existsSync 走查、不开 DB；5 个固定小节标题。

**(5) 有序步骤**：1) 写 short 变体（独立可发）；2) port full 变体并把所有 `codegraph_*`→`tk_*`、`.codegraph/`→tk 索引语义；3) session 接变体选择。

**(6) 测试**：(a) 已索引仓 initialize 返回 `instructions` 长度 >2KB 且含「## Anti-patterns」；(b) 未索引仓返回 short 变体且含「inactive」；(c) 断言 full 变体字节数 ≤9216（9KB）防膨胀回归。

**(7) 证据回指**：codegraph `server-instructions.ts:1-98`（9296 bytes）；`session.ts:192-210`。

---

### F.6 决策：cheap-outline-first ladder 折进工具设计 + 真实 JSON schema（服务 B）

**(1) 决策**：把 DeepWiki 的 cheap-outline-first ladder 折进**工具设计**而非多开工具 —— `tk_explore` 是单一 PRIMARY 入口（NL 问题或 symbol bag → 一次调用返回 capped verbatim source + call path）；`tk_search` 只给 locations；`tk_node` 的 `symbolsOnly:true` 给结构 outline。agent 被告知先调 explore、并在 size-scaled 调用预算后停止。预算函数把「outline-first」内化为预算阶梯 + ≤24KB cap（贴住宿主 ~25K inline tool-result cap，结果不外溢成需 Read 回来的文件）。F8 的 `maxOutputChars` tier **import G1 常量**（`src/budget.ts`），不重定义。

**(2) 要动的文件**：`src/budget.ts`（`getExploreBudget` + G1 char tier 常量，单一真相源）；`src/mcp/tools.ts`（`tools: ToolDefinition[]` schema 数组 + `projectPathProperty` + MAX 常量，从 `src/budget` import 预算）。

**(3) 可抄代码**：

预算函数，源: /tmp/tk-research/codegraph/src/mcp/tools.ts:102-108（verbatim）→ 落 `src/budget.ts`：
```ts
// src/budget.ts —— 单一真相源（F8/G1 共用；F import，绝不重定义）
export function getExploreBudget(fileCount: number): number {
  if (fileCount < 500) return 1;
  if (fileCount < 5000) return 2;
  if (fileCount < 15000) return 3;
  if (fileCount < 25000) return 4;
  return 5;
}
```

char tier（G1 拥有的 maxOutputChars，源: /tmp/tk-research/codegraph/src/mcp/tools.ts:172-257 的 tier 数值，verbatim 关键字段；其余 budget 字段属 G/A，此处仅取 F 引用的 maxOutputChars）：
```ts
// src/budget.ts —— G1 拥有；13000/18000/24000，对应 getExploreBudget 同一 tier 断点
export function exploreMaxOutputChars(fileCount: number): number {
  if (fileCount < 150)   return 13000;   // 源 tools.ts:179
  if (fileCount < 500)   return 18000;   // 源 tools.ts:195
  return 24000;                          // 源 tools.ts:213/232/246（≥500 全部 24000，贴 ~25K inline cap）
}
export const MAX_OUTPUT_LENGTH = 15000;  // 源 tools.ts:54，非 explore 工具的输出 cap
```

输入护栏常量，源: /tmp/tk-research/codegraph/src/mcp/tools.ts:54,63,70（verbatim）：
```ts
const MAX_OUTPUT_LENGTH = 15000;   // 非 explore 工具输出 cap
const MAX_INPUT_LENGTH  = 10_000;  // query/symbol 自由文本上限（防 FTS5 全扫/OOM）
const MAX_PATH_LENGTH   = 4_096;   // projectPath/path/pattern 路径上限
```

工具 JSON schema（真实可抄），源: /tmp/tk-research/codegraph/src/mcp/tools.ts:401-572（verbatim 结构，前缀 codegraph_→tk_、`.codegraph/`→tk 索引）：
```ts
const projectPathProperty: PropertySchema = {
  type: 'string',
  description: 'Path to a different project with tk initialized. If omitted, uses current project. Use this to query other codebases.',
};

export const tools: ToolDefinition[] = [
  { name: 'tk_search',
    description: 'Quick symbol search by name. Returns locations only (no code). Use tk_explore instead to get the actual source / understand an area in one call.',
    inputSchema: { type: 'object', properties: {
      query: { type: 'string', description: 'Symbol name or partial name (e.g., "auth", "signIn", "UserService")' },
      kind:  { type: 'string', description: 'Filter by node kind',
               enum: ['function','method','class','interface','type','variable','route','component'] },
      limit: { type: 'number', description: 'Maximum results (default: 10)', default: 10 },
      projectPath: projectPathProperty,
    }, required: ['query'] } },

  { name: 'tk_callers',
    description: 'List functions that call <symbol>. For the full flow, use tk_explore.',
    inputSchema: { type: 'object', properties: {
      symbol: { type: 'string', description: 'Name of the function, method, or class to find callers for' },
      file:   { type: 'string', description: 'Narrow to the definition in this file (path or suffix) when several same-named symbols exist' },
      limit:  { type: 'number', description: 'Maximum number of callers to return (default: 20)', default: 20 },
      projectPath: projectPathProperty,
    }, required: ['symbol'] } },

  { name: 'tk_node',
    description: 'Two modes. (1) READ A FILE — use INSTEAD of the Read tool: pass `file` alone (no `symbol`) → that file\'s current on-disk source with line numbers (`<n>\\t<line>`, safe to Edit from), narrowable with `offset`/`limit` like Read, PLUS which files depend on it. (2) ONE SYMBOL you can name — its location, signature, verbatim source (includeCode=true) and caller/callee trail in one call.',
    inputSchema: { type: 'object', properties: {
      symbol:      { type: 'string' },
      includeCode: { type: 'boolean', default: false },
      file:        { type: 'string' },
      offset:      { type: 'number' },
      limit:       { type: 'number' },
      symbolsOnly: { type: 'boolean', default: false },
      line:        { type: 'number' },
      projectPath: projectPathProperty,
    }, required: [] } },        // required:[] —— file-alone 与 symbol-alone 都合法

  { name: 'tk_explore',
    description: 'PRIMARY TOOL — call FIRST for almost any question OR before an edit. Returns the verbatim source of the relevant symbols grouped by file in ONE capped call (Read-equivalent — treat as already Read; do NOT re-open those files), plus the call path among them. Query = NL question OR a bag of symbol/file names.',
    inputSchema: { type: 'object', properties: {
      query:       { type: 'string', description: 'Symbol names, file names, or short code terms (e.g. "AuthService loginUser session-manager"). A natural-language question works too.' },
      maxFiles:    { type: 'number', description: 'Maximum number of files to include source from (default: 12)', default: 12 },
      projectPath: projectPathProperty,
    }, required: ['query'] } },
];
```

**(4) 具体数值**：`getExploreBudget` 阶梯 **1/2/3/4/5**（断点 <500/<5000/<15000/<25000/else）；`tk_explore.maxOutputChars` **13000/18000/24000**（断点 <150/<500/≥500，G1 拥有）；非 explore 工具 `MAX_OUTPUT_LENGTH=15000`；`MAX_INPUT_LENGTH=10000`（query/symbol）；`MAX_PATH_LENGTH=4096`（projectPath/path/pattern）；`tk_search.limit` 默认 **10**，`tk_callers.limit` 默认 **20**，`tk_explore.maxFiles` 默认 **12**；`tk_node.required=[]`。

**(5) 有序步骤**：1) `src/budget.ts` 落 `getExploreBudget` + `exploreMaxOutputChars` + MAX 常量（无依赖，G/F 共用）；2) `tools.ts` 落 schema 数组 + `projectPathProperty`，从 `src/budget` import 预算；3) explore handler 在生成输出时 import `exploreMaxOutputChars(fileCount)` 作 cap（依赖 step 1）。

**(6) 测试**：(a) `getExploreBudget(400)=1`、`(4999)=2`、`(20000)=4`、`(30000)=5`；(b) `exploreMaxOutputChars(100)=13000`、`(300)=18000`、`(800)=24000`；(c) `tools` 数组断言 4 条且 `tk_node.inputSchema.required` 为 `[]`、`tk_search.required=['query']`；(d) A-B harness 字段记录每次 explore 实际输出字节 ≤ 对应 tier cap。

**(7) 证据回指**：codegraph `tools.ts:102-108,54/63/70,172-257,401-572`；DeepWiki 3-tool ladder（docs/codegraph/codegraph-wiki-landscape-20260618.md:44）；G1 char tier 绑定（DEP MAP G/F 冲突裁定）。

---

### F.7 决策：`TK_MCP_TOOLS` 空 sentinel = A/B 基线臂（服务 B / 度量使能）

**(1) 决策**：A/B harness 通过**单一** env `TK_MCP_TOOLS` ablate 整个工具面 —— sentinel（在 K harness 里设为暴露**零工具**的特殊值）= without 臂；逗号子集 ablate 单个工具。被 ablate 的工具从 `tools/list` 真正缺席（非 call 时拒绝）；`execute()` 也防御性拒绝（若客户端缓存了）。这给 measured A/B（项目诚实模型）一个干净 baseline。K 在 SECONDARY（Claude Code headless，唯一干净 uncached-token runner）跑 measured 臂；PRIMARY 走 Track-2 opportunity facts，绝不计入 saved_tokens（DEP MAP K/B/F 冲突裁定）。

**(2) 要动的文件**：`src/mcp/tools.ts`（`toolAllowlist/isToolAllowed`，已在 F.3 落）；K harness 脚本（`scripts/`，本需求只暴露 env 接口，harness 实现属 K）。

**(3) 可抄代码** —— 同 F.3 的 `toolAllowlist/isToolAllowed`（源: codegraph `tools.ts:728-740`，已 verbatim 给出）。基线臂的调用约定（已改写为 tk 语义）：
```bash
# K Track-1：without 臂 —— 零工具（tools/list 返回 []，agent 退回 built-in）
# 实现方式：harness 把 TK_MCP_TOOLS 设为一个不匹配任何工具的 sentinel 短名，
# 使 toolAllowlist() 返回非空 set 但 getTools() 过滤后为空。
TK_MCP_TOOLS='__none__' tk mcp     # without 臂（zero tools listed）
# with 臂 —— 默认 4 套
tk mcp                              # with 臂
# 单工具 ablation —— 量 tk_explore 的边际贡献
TK_MCP_TOOLS='node,search,callers' tk mcp   # 去掉 explore
```
注：dossier 称「unset/empty→DEFAULT」，故纯空字符串**不是** without 臂（会回默认 4 套）；without 臂须用「非空但不匹配任何工具」的 sentinel。**需实现时补**：在 `getStaticTools/getTools` 已有的 `allow.has(...)` 过滤下，sentinel `__none__` 天然过滤为空集 —— 无需额外代码，harness 侧约定即可。

**(4) 具体数值**：without 臂 = `TK_MCP_TOOLS='__none__'`（不匹配任何短名 → 空 list）；with 臂 = env 未设（默认 4）；单工具 ablation = 逗号子集。

**(5) 有序步骤**：1) 复用 F.3 的 allowlist 逻辑（无新增）；2) K harness 脚本以三组 env 跑 with/without/ablation（属 K，本需求只验证 env 行为）。

**(6) 测试**：(a) `TK_MCP_TOOLS='__none__'` → `tools/list` 返回 `[]`；(b) env 未设 → 返回 4 名；(c) `TK_MCP_TOOLS='node'` → 返回 1 名 `tk_node`，且 execute(`tk_explore`) 被拒（"disabled via TK_MCP_TOOLS"）。

**(7) 证据回指**：codegraph `tools.ts:721-740`（「Lets an operator (or an A/B harness) trim the tool surface… ablated tool is truly absent from ListTools rather than merely denied on call」）；K/B/F 冲突裁定。

---

### F.8 决策：workspace-root 解析顺序（含 Windows file:// 处理）（服务 B）

**(1) 决策**：root 解析顺序 = (1) `initialize.rootUri` / `workspaceFolders[0].uri`（最强）；(2) `--path` CLI flag；(3) server-initiated `roots/list`（一次性、5s、仅当客户端 advertise `capabilities.roots`）；(4) `process.cwd()` 兜底（**延后**，让 roots/list 答案能胜出）。`fileUriToPath` 处理 Windows 盘符 `file://`（`/C:/...`→`C:/...`）—— Windows 可移植性硬要求。无 root 时 NotIndexedError 告诉 agent 传 `projectPath` 或加 `--path`，若确未索引则本 session 停止调 tk。

**(2) 要动的文件**：`src/mcp/session.ts`（`fileUriToPath` + `handleInitialize` 顺序 + `initFromRoots`）。

**(3) 可抄代码**：

源: /tmp/tk-research/codegraph/src/mcp/session.ts:42,48-59（verbatim，Windows 盘符处理）：
```ts
const ROOTS_LIST_TIMEOUT_MS = 5000;

/** file:// URI → 文件系统路径。处理 URL 编码 + Windows 盘符。 */
function fileUriToPath(uri: string): string {
  try {
    const url = new URL(uri);
    let filePath = decodeURIComponent(url.pathname);
    if (process.platform === 'win32' && /^\/[a-zA-Z]:/.test(filePath)) {
      filePath = filePath.slice(1);          // /C:/foo → C:/foo
    }
    return path.resolve(filePath);
  } catch {
    return uri.replace(/^file:\/\/\/?/, '');
  }
}
```

解析顺序（强信号优先、cwd 延后），源: /tmp/tk-research/codegraph/src/mcp/session.ts:183-190（verbatim）：
```ts
// 强信号优先：client rootUri / workspaceFolders，再 --path。cwd 不在此处 ——
// 延后它，使 roots/list 答案能胜出（issue #196）。
let explicitPath: string | null = null;
if (params?.rootUri) {
  explicitPath = fileUriToPath(params.rootUri);
} else if (params?.workspaceFolders?.[0]?.uri) {
  explicitPath = fileUriToPath(params.workspaceFolders[0].uri);
} else if (this.explicitProjectPath) {
  explicitPath = this.explicitProjectPath;
}
```

server-initiated roots/list 兜底，源: /tmp/tk-research/codegraph/src/mcp/session.ts:304-319（verbatim）：
```ts
private async initFromRoots(): Promise<void> {
  let target = process.cwd();
  try {
    const result = await this.transport.request('roots/list', undefined, ROOTS_LIST_TIMEOUT_MS);
    const rootPath = firstRootPath(result);
    if (rootPath) target = rootPath;
    else process.stderr.write('[tk MCP] Client returned no workspace roots; falling back to process cwd.\n');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`[tk MCP] roots/list request failed (${msg}); falling back to process cwd.\n`);
  }
  await this.engine.ensureInitialized(target);
}
```

**(4) 具体数值**：`ROOTS_LIST_TIMEOUT_MS=5000`；roots/list **一次性**（`rootsAttempted` latch）；仅 `clientSupportsRoots`（`!!params?.capabilities?.roots`）时发；Windows `/^\/[a-zA-Z]:/` 去前导斜杠。

**(5) 有序步骤**：1) `fileUriToPath` + `firstRootPath`（含 win32 分支，可独立单测）；2) `handleInitialize` 四级顺序；3) `initFromRoots` + `retryInitIfNeeded` 兜底链（依赖 step 1）。

**(6) 测试**：(a) `fileUriToPath('file:///C:/proj')` 在 win32 返回 `C:\proj`、在 posix 返回 `/C:/proj` 不剥；(b) initialize 带 `rootUri` 时不发 roots/list；(c) initialize 无 root 且 `capabilities.roots` → 触发一次 roots/list，5s 超时后落 cwd。

**(7) 证据回指**：codegraph `session.ts:42,48-59,183-190,304-319`；issue #196。

---

### F.9 决策：对 built-in grep 的引导是 ADDITIVE/概率性，终端 shim 仅管命令输出（服务 B）

**(1) 决策**：直面硬事实 —— tk **不**拦截/重写 VS Code Copilot 的 built-in `read_file`/`search`（不可能，宿主拥有输出）。在 PRIMARY 上以 ADDITIVE/概率性方式竞争：(a) 强工具 description（"use INSTEAD of Read"）；(b) server-instructions 反模式；(c) 扩展 `modelDescription`。在**终端宿主**保留既有 interceptive PATH shim（`tk <cmd>`）管命令输出（surface 8），**绝不**把终端命令重包成 additive MCP 工具。MCP 工具与 shell 命令无重叠。

**(2) 要动的文件**：无新增后端文件（引导文案已在 F.5/F.6 的 description 与 instructions 内）；`src/shim/`（既有，**不动** —— 仅声明边界：shim 不进入 MCP 工具）；扩展 `extension/src/tools/lmTools.ts` 的 `modelDescription` 复用 F.6 的 description 文案。

**(3) 可抄代码** —— 引导文案即 F.6 的 `tk_explore`/`tk_node` description（"use INSTEAD of the Read tool" / "do NOT re-open those files"）+ F.5 的 Anti-patterns 小节，已逐字给出。边界为架构约束，无独立代码块：**需实现时补**的 gap = 扩展侧 LM tool 的 `invoke()` 桥接（调 `src/mcp` 的 `ToolHandler.execute`），codegraph 无扩展实现可抄。

**(4) 具体数值**：引导面 = 3 处（tool description + server-instructions + 扩展 modelDescription）；MCP 工具数 ∩ shell 命令数 = 0（零重叠）；shim 触达面仅 `run_in_terminal`。

**(5) 有序步骤**：1) 确认 F.6 description 与 F.5 instructions 含「INSTEAD of Read/grep」措辞；2) 扩展 `modelDescription` 复用同文案；3) 文档化 shim/MCP 边界（shim 不出现在 `tools` 数组）。

**(6) 测试**：(a) 静态断言 `tools` 数组中无任何工具名对应 shell 命令（无 `tk_run`/`tk_bash`）；(b) 断言 `tk_node.description` 含子串 "INSTEAD of the Read tool"；(c) 人工/harness 记录 agent 选 `tk_explore` vs built-in read 的占比（Track-2 opportunity fact，不计 saved_tokens）。

**(7) 证据回指**：token-optimization-landscape TL;DR（「shim interceptive (terminal only); MCP/extension tools additive… do not re-wrap [terminal commands] as additive tools」）；§Conclusion（shim 是 weaker bet，触达面收缩）。

---

### F 小结：committed 决策一览（全部服务 B）

| # | 决策 | 关键数值 | 源 |
|---|---|---|---|
| F.1 | 扩展(PRIMARY) + `tk mcp`(SECONDARY) 双前端单后端 | 默认 4 LM tool；`onStartupFinished` | landscape §C3/C8；codegraph index.ts:332 |
| F.2 | 手写 JSON-RPC stdio，非 SDK | ~420 LOC 零依赖；roots/list 5000ms | codegraph transport.ts |
| F.3 | 默认 4 工具 / tiny-repo 3 / `TK_MCP_TOOLS` ablation | 阈值 **500** | codegraph tools.ts:656,785 |
| F.4 | NO-INDEX→空 list + success-shaped NotIndexed | 未索引 `tools:[]`；NotIndexed `isError`=false | codegraph tools.ts:44,1171；session.ts:229 |
| F.5 | ≤9KB instructions playbook（full+short） | full ≤9KB（基线 9296B） | codegraph server-instructions.ts |
| F.6 | outline-ladder 折进设计 + 真实 schema | budget 1-5；explore cap 13000/18000/24000；MAX_INPUT 10000/MAX_PATH 4096 | codegraph tools.ts:102,172,401 |
| F.7 | `TK_MCP_TOOLS` sentinel = A/B 基线臂 | without=`__none__`；with=未设 | codegraph tools.ts:721 |
| F.8 | root 解析顺序 + Windows file:// | roots/list 5000ms 一次性；win32 盘符剥斜杠 | codegraph session.ts:42,183,304 |
| F.9 | 引导 = additive/概率性；shim 仅管命令输出 | 引导面 3 处；MCP∩shell=0 | landscape TL;DR/§Conclusion |

**跨需求绑定备忘**：F8 的 `maxOutputChars` **import** G1（`src/budget.ts`）不重定义；传输 = stdio（无 daemon，daemon 为 M18 受 K 门控的条件分支）；DB 库外、`.tk/` 仅人类工件；扩展是 H(viewer)/I(round-trip) 的宿主，经 L 渠道发布；measured A/B 跑在 Claude Code headless（SECONDARY），PRIMARY 走 Track-2 opportunity facts。


---

## 需求 G — Output token economy（一答既足且省 token，尤其 uncached）

**服务对象总览**：G 全部 16 项子决策直接服务 **B（agent 找代码 = token 优化）**，其中 G12/G13/G14 同时服务 **两者**（诚实交还 + 可引用行号 + verbatim 信任 banner 既省 agent token，又是人/协作信任的共享机制）。

**上游绑定（来自 DEP MAP）**：
- A 已定 `A7 code-block compression + A6 budgets`，G1–G16 是它们的运营化。本节所有产出落在 A 的 **agent diet** 的 `buildContext` / `tk_explore` 路径里，不动 human diet。
- B 已定 **static tier 是整个 find-code 路径**（provenance filter `WHERE provenance='static'`），故 G 的所有整形都在 **零 LLM、零 token 花费、零 API key** 的确定性 static 答案上运行（满足 LLM lean）。
- F 冲突解决已绑定：**`tk_explore` 的 `maxOutputChars` 字符档必须 import G1 常量，不得自行重定义**（G 持有数字，F 消费）。
- K 冲突解决：char 档 13000/18000/24000 现在就上，作为可移植代理；token 化只在 K 的 harness 在 VS Code Copilot/Windows 实测真实 inline cap 之后再做（见 §G.stillOpen）。

下面每项决策遵守 §4.2 契约：**决策 / 要动的文件 / 可抄代码 / 具体数值 / 有序步骤 / 测试 / 证据回指**。所有 fenced code 已在开 paste 前用 Read/Bash 对照 clone 确认存在，逐一标注「源:」。

---

### 共同要动的文件与目录结构（G1–G16 的物理落点）

```
src/codegraph/economy/                         # 新建：output-economy 层（G 的全部常量与整形函数）
  budget.ts                                    # G1 getExploreOutputBudget + G10 getExploreBudget + G2 不变式
  wholeFile.ts                                 # G3 whole-file 规则
  skeletonize.ts                               # G4/G5/G6 polymorphic-sibling / spine god-file / spare 规则
  cluster.ts                                   # G7 envelope-collapse 聚簇
  lineNumbers.ts                               # G13 numberSourceLines
  markers.ts                                   # G11 截断/skeleton tag + G12 LOW_CONFIDENCE_MARKER + G14 verbatim banner
  noise.ts                                     # G15 diversity/non-prod/generated caps
  defaults.ts                                  # G16 DEFAULT_BUILD_OPTIONS
  flags.ts                                     # kill-switch 读取（双用作 K 的 A/B harness 开关）
src/codegraph/mcp/tools.ts                     # F 拥有：tk_explore/tk_search/tk_node 装配，import economy/* 常量
tests/unit/codegraph/economy/                  # 每项决策一个 fixture 测试
```

`economy/*` 是纯字符计数 + 文件切片，**无 native build、无 LLM、Windows 可移植**（满足 Windows-primary 锚 + LLM lean）。环境变量统一前缀改为 `TK_*`（codegraph 原用 `CODEGRAPH_*`），与 tk 现有 `TK_*`/`TOKEN_KILLER_HOME` 体系一致。

---

### G1 — 按仓库规模分档的字符预算（CEILING，非 target）　服务 B

**决策**：按已索引 `fileCount` 分 5 档给出输出预算上限。相关性仍决定**包含什么**；预算只决定**最多多大**。单调不变式：更大档的 `maxCharsPerFile` 永不小于更小档。

**要动的文件**：`src/codegraph/economy/budget.ts`（新建）。`mcp/tools.ts` 的 `tk_explore` 装配处 import 本档常量（F 绑定）。

**可抄代码**（源: /tmp/tk-research/codegraph/src/mcp/tools.ts:160-258，verbatim；仅去掉注释、`CODEGRAPH_`→`TK_` 不涉及本函数；标识符不改 → 直接 verbatim）：

```ts
export interface ExploreOutputBudget {
  maxOutputChars: number;
  defaultMaxFiles: number;
  maxCharsPerFile: number;
  gapThreshold: number;
  maxSymbolsInFileHeader: number;
  maxEdgesPerRelationshipKind: number;
  includeRelationships: boolean;
  includeAdditionalFiles: boolean;
  includeCompletenessSignal: boolean;
  includeBudgetNote: boolean;
  excludeLowValueFiles: boolean;
}

export function getExploreOutputBudget(fileCount: number): ExploreOutputBudget {
  // CEILING, must stay under the host INLINE tool-result cap (~25K chars).
  // Invariant: a larger tier must never get a smaller maxCharsPerFile.
  if (fileCount < 150) {
    return { maxOutputChars: 13000, defaultMaxFiles: 4, maxCharsPerFile: 3800,
      gapThreshold: 7, maxSymbolsInFileHeader: 5, maxEdgesPerRelationshipKind: 4,
      includeRelationships: false, includeAdditionalFiles: false,
      includeCompletenessSignal: false, includeBudgetNote: false, excludeLowValueFiles: true };
  }
  if (fileCount < 500) {
    return { maxOutputChars: 18000, defaultMaxFiles: 5, maxCharsPerFile: 3800,
      gapThreshold: 8, maxSymbolsInFileHeader: 6, maxEdgesPerRelationshipKind: 6,
      includeRelationships: false, includeAdditionalFiles: false,
      includeCompletenessSignal: false, includeBudgetNote: false, excludeLowValueFiles: true };
  }
  if (fileCount < 5000) {
    return { maxOutputChars: 24000, defaultMaxFiles: 8, maxCharsPerFile: 6500,
      gapThreshold: 12, maxSymbolsInFileHeader: 10, maxEdgesPerRelationshipKind: 10,
      includeRelationships: true, includeAdditionalFiles: true,
      includeCompletenessSignal: true, includeBudgetNote: true, excludeLowValueFiles: false };
  }
  if (fileCount < 15000) {
    return { maxOutputChars: 24000, defaultMaxFiles: 8, maxCharsPerFile: 7000,
      gapThreshold: 15, maxSymbolsInFileHeader: 15, maxEdgesPerRelationshipKind: 15,
      includeRelationships: true, includeAdditionalFiles: true,
      includeCompletenessSignal: true, includeBudgetNote: true, excludeLowValueFiles: false };
  }
  return { maxOutputChars: 24000, defaultMaxFiles: 8, maxCharsPerFile: 7000,
    gapThreshold: 15, maxSymbolsInFileHeader: 15, maxEdgesPerRelationshipKind: 15,
    includeRelationships: true, includeAdditionalFiles: true,
    includeCompletenessSignal: true, includeBudgetNote: true, excludeLowValueFiles: false };
}
```

**具体数值**：档界 150/500/5000/15000；`maxOutputChars` 13000/18000/24000/24000/24000；`defaultMaxFiles` 4/5/8/8/8；`maxCharsPerFile` 3800/3800/6500/7000/7000；`gapThreshold` 7/8/12/15/15；`maxSymbolsInFileHeader` 5/6/10/15/15。

**有序步骤**：(1) 落 `budget.ts`，导出 `getExploreOutputBudget` + `ExploreOutputBudget`。(2) `tk_explore` 装配时调用一次，结果传给 G3/G6/G7。

**测试**：`tests/unit/codegraph/economy/budget.test.ts` — 断言每档返回值逐字段相等；断言单调性 `for tiers t1<t2: budget(t1).maxCharsPerFile <= budget(t2).maxCharsPerFile`。

**证据回指**：/tmp/tk-research/codegraph/src/mcp/tools.ts:160-258。

---

### G2 — 全档硬顶 ~24000 字符，刻意低于 host inline cap（~25000）　服务 B

**决策**：任何单答 `maxOutputChars ≤ 24000`，明确低于 host inline-tool-result 上限（~25000 字符）。仓库越大给**更多 CALL**（见 G10）而非更大单答。非 explore 工具的硬截断地板 `MAX_OUTPUT_LENGTH = 15000`。

**要动的文件**：`src/codegraph/economy/budget.ts`（常量 + 不变式断言）；`mcp/tools.ts` 非 explore 工具的尾部截断。

**可抄代码**（源: /tmp/tk-research/codegraph/src/mcp/tools.ts:54；verbatim）：

```ts
const MAX_OUTPUT_LENGTH = 15000;   // per-tool hard truncate floor for NON-explore tools
```

**不变式（tk 改写，新增断言）**：

```ts
// src/codegraph/economy/budget.ts —— ship-time invariant
export const HOST_INLINE_CAP = 25000;          // measured proxy; re-calibrate via K harness
export const MAX_OUTPUT_LENGTH = 15000;
for (const fc of [0, 149, 499, 4999, 14999, 50000]) {
  if (getExploreOutputBudget(fc).maxOutputChars >= HOST_INLINE_CAP) {
    throw new Error('budget tier exceeds host inline cap — would externalize+re-Read');
  }
}
```

**具体数值**：硬顶 24000；host inline cap 代理值 25000；非 explore 地板 15000。

**有序步骤**：(1) 加 `HOST_INLINE_CAP`/不变式自检（模块加载即跑）。(2) 非 explore 工具尾部用 `MAX_OUTPUT_LENGTH` 截断。

**测试**：`budget.test.ts` — 断言所有档 `maxOutputChars < 25000`；断言一个 26K 构造答案被截到 `<= 15000`（非 explore 路径）。

**证据回指**：/tmp/tk-research/codegraph/src/mcp/tools.ts:54, 161-171；decisionRationale 的 n=4 README A/B（35K vscode explore 被 host 外置成文件→re-Read 回归）。

---

### G3 — 可负担即整文件 verbatim；仅 god-file 聚簇　服务 B

**决策**：文件 `≤ WHOLE_FILE_MAX_LINES`（外围 220 / 中心 280）且 `≤ WHOLE_FILE_MAX_CHARS` 时，整文件带行号返回，byte-identical to Read；否则落入按方法聚簇。**绝不切半个文件**：放不下的非必要文件直接跳过，必要文件整出。

**要动的文件**：`src/codegraph/economy/wholeFile.ts`（新建）。

**可抄代码**（源: /tmp/tk-research/codegraph/src/mcp/tools.ts:2644-2672；verbatim 核心）：

```ts
const isCentralFile = centralFiles.has(filePath);
const WHOLE_FILE_MAX_LINES = isCentralFile ? 280 : 220;
const WHOLE_FILE_MAX_CHARS = isCentralFile
  ? Math.min(Math.max(0, budget.maxOutputChars - totalChars - 200), Math.round(budget.maxCharsPerFile * 1.5))
  : budget.maxCharsPerFile * 3;
if (fileLines.length <= WHOLE_FILE_MAX_LINES && fileContent.length <= WHOLE_FILE_MAX_CHARS) {
  const body = fileContent.replace(/\n+$/, '');
  let wholeSection = exploreLineNumbersEnabled() ? numberSourceLines(body, 1) : body;
  // ... header (G15 names) ...
  if (!fileNecessary && totalChars + wholeSection.length + 200 > budget.maxOutputChars) {
    // Don't slice a whole file mid-method: an incidental file that doesn't fit is skipped.
    anyFileTrimmed = true;
    continue;
  }
  lines.push(wholeHeader, '', '```' + lang, wholeSection, '```', '');
  totalChars += wholeSection.length + 200;
  filesIncluded++;
  continue;
}
```

**具体数值**：中心档行数 280 / 字符 `min(remaining-200, maxCharsPerFile*1.5)`；外围档行数 220 / 字符 `maxCharsPerFile*3`；尾部预留 200 字符。

**有序步骤**：(1) 落 `wholeFile.ts`，输入 `{fileLines, fileContent, isCentralFile, budget, totalChars, fileNecessary}`，输出 `{rendered}|{fallthrough:true}`。(2) explore 聚簇前先调它。

**测试**：`wholeFile.test.ts` — 134 行外围文件 → 整文件输出且 `output === numberSourceLines(content,1)`（byte-identical 断言）；300 行中心文件 → `fallthrough:true`；非必要且超 budget → 跳过（不切半）。

**证据回指**：/tmp/tk-research/codegraph/src/mcp/tools.ts:2625-2672。

---

### G4 — Polymorphic-sibling 骨架化（默认 ON，kill-switch `TK_ADAPTIVE_EXPLORE=0`）　服务 B

**决策**：将一个**离 spine 的文件**折叠为 per-symbol 骨架，当且仅当：(1) 存在 flow spine；(2) 文件内无 symbol 在 spine 上；(3) 其 class 是 polymorphic sibling（implements/extends 一个被 `≥ MIN_SIBLINGS=3` 实现的 supertype）；(4) 文件未被 spare。骨架内：spine + 唯一命名方法整体，其余 symbol → 单行签名。

**要动的文件**：`src/codegraph/economy/skeletonize.ts`（新建）；`flags.ts`（`adaptiveExploreEnabled()`）。

**可抄代码**（源: /tmp/tk-research/codegraph/src/mcp/tools.ts:2430-2439, 2546-2547；verbatim 核心）：

```ts
const MIN_SIBLINGS = 3;
const isPolymorphicSibling = (nodes: Node[]): boolean =>
  nodes.some(n =>
    cg.getEdgesFrom(n.id)
      .filter(x => x.kind === 'implements' || x.kind === 'extends').length >= MIN_SIBLINGS);

if (adaptiveExploreEnabled() && flow.pathNodeIds.size > 0
    && (onSpineGodFile || (!hasSpineNode && isPolymorphicSibling(group.nodes) && !spared))) {
  // per-symbol skeleton: spine + named full; everything else -> one-line signature
}
```

> 注：clone 中 `isPolymorphicSibling` 实体在 tools.ts:2432-2439（用 `>= MIN_SIBLINGS` 计 implements/extends 计数）。`cg.getEdgesFrom` 是其图查询接口；在 tk 中对应 A/C 的 `edges` 表查询，**已改写**为 tk 的边访问 API（接口名待 C/D 落地后对齐）。

**具体数值**：`MIN_SIBLINGS = 3`；kill-switch `TK_ADAPTIVE_EXPLORE=0`（默认 ON）。

**有序步骤**：(1) 落 `skeletonize.ts` 与 `isPolymorphicSibling`。(2) explore 聚簇判定处接入 `adaptiveExploreEnabled()` 门控。

**测试**：`skeletonize.test.ts` — 构造 3 个 `implements Interceptor` 的兄弟文件 + flow → 离 spine 文件被骨架化；**inert 断言**：无 ≥3-implementer supertype 的 fixture → 输出 byte-identical 到 `TK_ADAPTIVE_EXPLORE=0` 的输出。

**证据回指**：/tmp/tk-research/codegraph/src/mcp/tools.ts:2422-2623；measured OkHttp 28.5k→16.6k（~28%），excalidraw/tokio/django/vscode/gin byte-identical（须 K 在 tk harness 复测后才能作为 tk 自报数，见 stillOpen）。

---

### G5 — SPARE 规则 + family-supertype OVERRIDE　服务 B

**决策**：文件被 spare（保整）当且仅当 agent 命名了其中一个（近）唯一可调用项 —— **除非**该文件**定义了 family supertype**（class/interface 有 ≥3 实现且与子类同处一文件），此时仍骨架化。唯一性必需：`as_sql` 有 110 个 override，命名它不得让每个 backend 变体保整。

**要动的文件**：`src/codegraph/economy/skeletonize.ts`（与 G4 同文件，`definesPolymorphicSupertype` + spare 计算）。

**可抄代码**（源: /tmp/tk-research/codegraph/src/mcp/tools.ts:2459-2466, 2526-2528；verbatim）：

```ts
const definesPolymorphicSupertype = (nodes: Node[]): boolean =>
  nodes.some(n =>
    cg.getEdgesTo(n.id)
      .filter(x => x.kind === 'implements' || x.kind === 'extends').length >= MIN_SIBLINGS);

const spareNamed = group.nodes.some(n => flow.uniqueNamedNodeIds.has(n.id));
const fileDefinesSuper = definesPolymorphicSupertype(group.nodes);
const spared = spareNamed && !fileDefinesSuper;
```

> 注：`definesPolymorphicSupertype` 实体在 tools.ts:2459-2466（统计**指向该节点**的 implements/extends 边 ≥ MIN_SIBLINGS）。`cg.getEdgesTo` **已改写**为 tk 边访问 API（同 G4，接口待 C/D 对齐）。`spareNamed/fileDefinesSuper/spared` 三行在 2526-2528 verbatim。

**具体数值**：复用 `MIN_SIBLINGS = 3`。

**有序步骤**：(1) 在 skeletonize 入口先算 `spared`，传入 G4 判定。

**测试**：`skeletonize.test.ts` — 命名一个唯一方法的非 super 文件 → `spared=true` 保整；命名 super 文件（compiler.py 式，≥3 子类同处）→ `spared=false` 仍骨架化。

**证据回指**：/tmp/tk-research/codegraph/src/mcp/tools.ts:2448-2528。

---

### G6 — ON-SPINE GOD-FILE per-symbol windowing　服务 B

**决策**：flow 穿过文件时，若其 named-body 字符超 `maxCharsPerFile` 且有 off-path named 方法 → spine 保整、off-path named 方法折为签名。优先级贪心填充（`bodyCap = maxCharsPerFile*1.5`）：prio 0=on-spine，1=uniquely-named，2=family-base-named（仅当定义 supertype），99=skip-body。**至少出 1 个 body**。签名上限 `SIG_MAX = max(12, maxSymbolsInFileHeader*2)`，溢出 → `… +N more (signatures elided)`。

**要动的文件**：`src/codegraph/economy/skeletonize.ts`。

**可抄代码**（源: /tmp/tk-research/codegraph/src/mcp/tools.ts:2543-2547, 2559-2561, 2569, 2574, 2584, 2600, 2605；verbatim 拼装）：

```ts
const onSpineGodFile = hasSpineNode
  && namedBodyChars > budget.maxCharsPerFile
  && group.nodes.some(n => CALLABLE_BODY.has(n.kind)
       && flow.uniqueNamedNodeIds.has(n.id) && !flow.pathNodeIds.has(n.id));

const prio = (n: Node) => !CALLABLE_BODY.has(n.kind) ? 99
  : flow.pathNodeIds.has(n.id) ? 0
  : flow.uniqueNamedNodeIds.has(n.id) ? 1
  : (fileDefinesSuper && flow.namedNodeIds.has(n.id)) ? 2 : 99;

const bodyCap = budget.maxCharsPerFile * 1.5;
// greedy fill: if (bodyChars + sz > bodyCap && bodyIds.size > 0) continue;  // always emit >=1 body
const SIG_MAX = Math.max(12, budget.maxSymbolsInFileHeader * 2);
// per-signature: if (sigCount >= SIG_MAX) { sigDropped++; continue; }
// tail: if (sigDropped > 0) skel.push(`… +${sigDropped} more (signatures elided)`);
```

**具体数值**：`bodyCap = maxCharsPerFile*1.5`；`SIG_MAX = max(12, maxSymbolsInFileHeader*2)`；至少 1 个 body。

**有序步骤**：(1) 算 `onSpineGodFile`。(2) 按 `prio` 排序贪心填 body 至 `bodyCap`。(3) 其余出签名至 `SIG_MAX`，溢出加 elided 标记。

**测试**：`skeletonize.test.ts` — 7 个命名方法 fixture（超 budget）→ spine body 在、off-path 转签名、`bodyIds.size>=1`；签名数 > SIG_MAX → 出 `… +N more (signatures elided)`。

**证据回指**：/tmp/tk-research/codegraph/src/mcp/tools.ts:2529-2622。

---

### G7 — CONTAINER-COLLAPSE：聚簇范围剔除 envelope 节点　服务 B

**决策**：聚簇时剔除跨度 >50% 文件的 container 节点（class/file/module…），避免它把每个内部方法并成一个 tail-trim 到只剩 container header 的巨簇。内部细粒度 symbol 保 verbatim。

**要动的文件**：`src/codegraph/economy/cluster.ts`（新建）。

**可抄代码**（源: /tmp/tk-research/codegraph/src/mcp/tools.ts:2693, 2709-2711；verbatim）：

```ts
const ENVELOPE_KINDS = new Set(['file','module','class','struct','interface','enum','namespace','protocol','trait','component']);
const ranges = [...rangeNodes.values()]
  // Drop whole-file envelope nodes (containers covering >50% of the file).
  .filter(n => !(ENVELOPE_KINDS.has(n.kind) && (n.endLine - n.startLine + 1) > fileLines.length * 0.5))
```

**具体数值**：envelope 阈值 = 文件总行数的 50%。

**有序步骤**：(1) 落 `cluster.ts`，聚簇前先 filter envelope。

**测试**：`cluster.test.ts` — 1400 行 `class Session` + 内部方法 fixture → ranges 不含 Session class 节点、含内部方法。

**证据回指**：/tmp/tk-research/codegraph/src/mcp/tools.ts:2693-2710（Alamofire #185）。

---

### G8 — PRECOMPUTE-OVER-COMPRESS：一次结构化 call，body 按需　服务 B

**决策**：`tk_search`/`tk_query`/`tk_node`(context)/`tk_impact` 的 `include_content`/`includeCode` 默认 **FALSE** —— 返回 ranked flows、locations、callers/callees、blast-radius depth-groups，**不带 body**；按 name 单独取 body。唯一 always-loaded 的 `tk_explore` 才发 verbatim source（它是一答即足的答案）。

**要动的文件**：`src/codegraph/mcp/tools.ts`（各非 explore 工具 schema 的 `include_content` 字段）。

**可抄代码**（源: /tmp/tk-research/gitnexus/gitnexus/src/mcp/tools.ts:169-173；verbatim JSON schema 字段）：

```ts
include_content: {
  type: 'boolean',
  description: 'Include full symbol source code (default: false)',
  default: false,
}
```

**具体数值**：所有非 explore 工具 `include_content` 默认 `false`。

**有序步骤**：(1) 每个非 explore 工具 schema 加此字段。(2) handler 仅当 `include_content===true` 才注入 body；否则只出 location + 边。

**测试**：`tk_search` fixture 不传 `include_content` → 返回含 `file:line` 与 callers，不含源码块；传 `true` → 含源码块。

**证据回指**：/tmp/tk-research/gitnexus/gitnexus/src/mcp/tools.ts:169-172；compendium sec 10「metadata-first retrieval contract」。绑定 B：此路径 `WHERE provenance='static'`，零 LLM。

---

### G9 — PROGRESSIVE-DISCLOSURE：summaryOnly + byDepthCounts + 分页　服务 B

**决策**：hub symbol 的 `tk_impact` 支持 `summaryOnly:true` → 仅返回 `target/summary/risk/byDepthCounts/affected_processes/affected_modules`，省略 `byDepth`；agent 用 `limit/offset` 按 depth 钻取（各 depth 独立分页）。截断时带 `partial:true` + `pagination` 对象，使一页被截不被误认为「没有更多」。

**要动的文件**：`src/codegraph/mcp/tools.ts`（`tk_impact` schema 加 `summaryOnly`/`limit`/`offset`，handler 输出 `byDepthCounts`/`partial`）。

**可抄代码**（源: /tmp/tk-research/gitnexus/gitnexus/src/mcp/tools.ts:523-526；verbatim schema 字段）：

```ts
summaryOnly: {
  type: 'boolean',
  description: 'When true, returns target, summary, risk, byDepthCounts, affected_processes, and affected_modules — omits byDepth. Use for hub symbols to get actionable signal without output explosion.',
}
```

> 行为契约（源: gitnexus tools.ts:420, 427 描述，verbatim 摘录）：「When partial:true, do NOT treat processes:[] as proof of no participation」；「limit and offset apply independently to each depth level, not to the total result set — use byDepthCounts to see totals per depth」。

**具体数值**：`limit` 默认 100 / depth（`maxLimit` 200）；`summaryOnly` 默认 false。

**有序步骤**：(1) schema 加 `summaryOnly/limit/offset`。(2) handler：`summaryOnly` 时省 `byDepth`、出 `byDepthCounts`；分页截断时置 `partial:true`。

**测试**：hub symbol（>200 depth-1 deps）`summaryOnly:true` → 无 `byDepth`、有 `byDepthCounts`；分页第二页 → `partial:true` 且 `pagination.offset` 正确。

**证据回指**：/tmp/tk-research/gitnexus/gitnexus/src/mcp/tools.ts:420, 427, 511, 523-526。

---

### G10 — CALL-COUNT BUDGET（一答 vs 多轮）　服务 B

**决策**：按仓库规模在工具描述里**实时**推荐最大 explore CALL 数：<500→1、<5000→2、<15000→3、<25000→4、≥25000→5。默认一次富结构 call；只在仓库变大时才允许更多轮。

**要动的文件**：`src/codegraph/economy/budget.ts`（`getExploreBudget`）；`mcp/tools.ts` 描述注入。

**可抄代码**（源: /tmp/tk-research/codegraph/src/mcp/tools.ts:102-108；verbatim）：

```ts
export function getExploreBudget(fileCount: number): number {
  if (fileCount < 500) return 1;
  if (fileCount < 5000) return 2;
  if (fileCount < 15000) return 3;
  if (fileCount < 25000) return 4;
  return 5;
}
```

**具体数值**：1/2/3/4/5，档界 500/5000/15000/25000。

**有序步骤**：(1) 导出 `getExploreBudget`。(2) `tk_explore` 描述里注入 `Recommended max explore calls for this repo: N`。

**测试**：`budget.test.ts` — 各档返回 1..5；描述字符串含正确 N。

**证据回指**：/tmp/tk-research/codegraph/src/mcp/tools.ts:102-108, 795-803。

---

### G11 — RETENTION-FIRST 升级阶梯：每次省略都回查工具，绝不 Read　服务 B

**决策**：骨架体的 tag 说「`tk_explore` a signature by name for its body; **do NOT Read**」；截断块以语言中性 `\n... (truncated) ...`（无 `//`，不是 Python/Ruby 注释）结尾。工具输出**绝不**叫 agent 去 Read 它刚发过的文件。

**要动的文件**：`src/codegraph/economy/markers.ts`（新建，tag + 截断标记）。

**可抄代码**（源: /tmp/tk-research/codegraph/src/mcp/tools.ts:2616-2617 + context/index.ts:1251；verbatim，`codegraph_`→`tk_` 已改写）：

```ts
// skeleton / focused tag (tk-adapted: codegraph_explore -> tk_explore)
const tag = bodyIds.size > 0
  ? 'focused (the methods you named in full, the rest as signatures — tk_explore a signature by name for its body; do NOT Read)'
  : 'skeleton (signatures only — tk_explore a name for its full body; do NOT Read)';

// language-neutral truncation marker (no // comment) —— verbatim from context/index.ts:1251
const truncated = code.length > maxBlockSize
  ? code.slice(0, maxBlockSize) + '\n... (truncated) ...'
  : code;
```

**具体数值**：截断标记字面量 `\n... (truncated) ...`；tag 双态（有 body / 纯签名）。

**有序步骤**：(1) 落 `markers.ts` 导出 `skeletonTag(bodyCount)` 与 `truncateBlock(code, maxBlockSize)`。(2) G6/G4 骨架出口与 G16 block 截断处复用。

**测试**：`markers.test.ts` — 超长 block → 以 `... (truncated) ...` 结尾且不含 `//`；骨架 tag 含 `do NOT Read`、含 `tk_explore`、不含 `Read for more`。

**证据回指**：/tmp/tk-research/codegraph/src/mcp/tools.ts:2609-2618；context/index.ts:1247-1252。

---

### G12 — LOW-CONFIDENCE 诚实交还 marker　服务 两者

**决策**：当多词 prose 查询（≥2 个 len≥3 的词）只命中孤立常用词匹配（无被 ≥2 个不同词印证的 entry point、且无用户命名的判别性标识符）→ 置 `confidence='low'`，追加 `### ⚠️ Low-confidence match`，承认 entry point 可能跑偏，导向 `tk_explore`(精确名)/`tk_search <name>`/`tk_files <dir>`。单关键词与 symbol-name 查询豁免。**这是 agent token-economy（避免 confident-wrong 触发的 Read/Grep 螺旋）与人/协作信任的共享机制**。

**要动的文件**：`src/codegraph/economy/markers.ts`（marker 常量 + 文案）；context builder 的 confidence 判定。

**可抄代码**（源: /tmp/tk-research/codegraph/src/context/markers.ts:19 + context/index.ts:297-305, 914-930；verbatim，`codegraph_`→`tk_` 已改写）：

```ts
export const LOW_CONFIDENCE_MARKER = '### ⚠️ Low-confidence match';

// emitted when: confTerms.length >= 2 && filteredResults.length > 0 && !anyStrong -> confidence='low'
function lowConfidenceFooter(dirs: string[]): string {
  const dirLine = dirs.length
    ? `\n- \`tk_files\` a likely area: ${dirs.map(d => `\`${d}\``).join(', ')}` : '';
  return `\n\n${LOW_CONFIDENCE_MARKER}\n\n`
    + 'This query matched mostly on common words, so the entry points above may '
    + 'be off-target — treat them as a starting point, not a complete answer. '
    + 'For a reliable result:\n'
    + '- `tk_explore` with the **exact symbol names** you are after '
    + '(class / function / method names), or\n'
    + '- `tk_search <name>` for one specific symbol'
    + dirLine
    + '\n\nDo not assume the list above is comprehensive.';
}
```

**具体数值**：触发条件 `confTerms.length >= 2 && !anyStrong`；词长阈值 len≥3；单关键词/symbol 查询豁免。

**有序步骤**：(1) 落 `LOW_CONFIDENCE_MARKER` + footer。(2) context builder 算 `confTerms`/`anyStrong`，弱则置 `confidence='low'` 并附 footer。(3) MCP 层检测该 sentinel，抑制矛盾的「this is comprehensive」small-repo footer。

**测试**：`markers.test.ts` — 2 词常用词查询无强匹配 → 含 `### ⚠️ Low-confidence match` 且 `confidence==='low'`；单关键词查询 → 无 marker。

**证据回指**：/tmp/tk-research/codegraph/src/context/index.ts:285-306, 914-931；context/markers.ts:19。

---

### G13 — 每片 source 加行号（cat -n），默认 ON（`TK_EXPLORE_LINENUMS=0` 关）　服务 两者

**决策**：每片 shipped source 用 `<num>\t<code>` 加行号，使 agent 直接从 payload 引用 `file:line` 而非为找行号再 Read。**省 agent 残余 Read（B）+ 给人/协作精确引用（信任）**。

**要动的文件**：`src/codegraph/economy/lineNumbers.ts`（新建）；`flags.ts`（`exploreLineNumbersEnabled()`）。

**可抄代码**（源: /tmp/tk-research/codegraph/src/mcp/tools.ts:299-306；verbatim）：

```ts
function numberSourceLines(slice: string, firstLineNumber: number): string {
  const out: string[] = [];
  const split = slice.split('\n');
  for (let i = 0; i < split.length; i++) {
    out.push(`${firstLineNumber + i}\t${split[i]}`);
  }
  return out.join('\n');
}
```

**具体数值**：分隔符 `\t`；起始行号 1-based；kill-switch `TK_EXPLORE_LINENUMS=0`（默认 ON）。

**有序步骤**：(1) 落 `numberSourceLines` + `exploreLineNumbersEnabled()`。(2) G3 whole-file 与聚簇出块处套用。

**测试**：`lineNumbers.test.ts` — `numberSourceLines("a\nb", 5) === "5\ta\n6\tb"`；`TK_EXPLORE_LINENUMS=0` 时块无行号前缀。

**证据回指**：/tmp/tk-research/codegraph/src/mcp/tools.ts:260-306。

---

### G14 — VERBATIM-SOURCE 信任 banner + 每文件 STALENESS banner　服务 两者

**决策**：Source 段以明确承诺开头：代码是本次重读的当前磁盘源、带行号、与 Read 字节相同 —— 「Treat each block as a Read you have already performed: do not Read a file shown here.」若 watcher 对某引用文件有 pending 事件，告诉 agent 单独 Read **那个**文件，同时声明其余 fresh（诚实地按文件 scope 失效 = lossless-recovery 不变式，绑定 J8/J9）。

**要动的文件**：`src/codegraph/economy/markers.ts`（verbatim banner + stale banner）。

**可抄代码**（源: /tmp/tk-research/codegraph/src/mcp/tools.ts:2476；verbatim）：

```ts
lines.push('> The code below is the **verbatim, current on-disk source** of these files — re-read from disk on this call and line-numbered, byte-for-byte identical to what the Read tool returns. It is NOT a summary, outline, or stale cache. Treat each block as a Read you have already performed: do not Read a file shown here.');
```

**具体数值**：banner 为每个 Source 段首固定一行；stale banner 仅在 E 的 lazy mtime-sweep 检出某引用文件 mtime 偏离时按文件追加（绑定 E1 lazy-on-read，非默认 watcher）。

**有序步骤**：(1) 落 `verbatimSourceBanner()` 与 `formatStaleBanner(staleFiles)`。(2) explore Source 段首注入 banner；E 的 lazy 检查回传 stale 列表 → 仅对这些文件出 stale banner。

**测试**：`markers.test.ts` — banner 含 `verbatim, current on-disk source` 与 `do not Read a file shown here`；给定 1 个 stale 文件 → 仅该文件出 stale 行，其余声明 fresh。

**证据回指**：/tmp/tk-research/codegraph/src/mcp/tools.ts:2476, 314-365；DEP MAP E↔J 解决（lazy 驱动 banner）。

---

### G15 — NOISE-SUPPRESSION caps（预算花在答案上）　服务 B

**决策**：per-file diversity cap `maxPerFile = max(5, ceil(maxNodes*0.2))`；非生产文件 cap `max(3, ceil(maxNodes*0.15))`（除非查询提到 test/spec）；生成文件（.pb.go/.pulsar.go/mocks）排最后且从 Related Symbols 剔除；imports/exports 不入默认节点 kind、解析到其定义。

**要动的文件**：`src/codegraph/economy/noise.ts`（新建）。

**可抄代码**（源: /tmp/tk-research/codegraph/src/context/index.ts:1067, 1100；verbatim）：

```ts
const maxPerFile = Math.max(5, Math.ceil(opts.maxNodes * 0.2));
// if (nodeIds.length <= maxPerFile) continue; else drop nodeIds.slice(maxPerFile)
const maxNonProd = Math.max(3, Math.ceil(opts.maxNodes * 0.15));
// if (nonProdIds.length > maxNonProd) drop nonProdIds.slice(maxNonProd)
```

**HIGH_VALUE_NODE_KINDS 排除 import/export**（源: /tmp/tk-research/codegraph/src/context/index.ts:159-173，verbatim 注释「Imports/exports are excluded because they have near-zero information density」+ `nodeKinds: HIGH_VALUE_NODE_KINDS // Filter out imports/exports by default`）。

**具体数值**：`maxPerFile = max(5, ceil(maxNodes*0.2))`；`maxNonProd = max(3, ceil(maxNodes*0.15))`；`maxNodes` 默认 20（见 G16）→ 实际 maxPerFile=5、maxNonProd=3。

**有序步骤**：(1) 落 `noise.ts` 的 per-file/non-prod 截断与 generated 排序。(2) context/explore 节点选择后套用。

**测试**：`noise.test.ts` — 一文件 10 节点（maxNodes=20）→ 留 5；6 个 test Guard 类（查询未提 test）→ 留 3；imports 不入默认结果。

**证据回指**：/tmp/tk-research/codegraph/src/context/index.ts:1062-1115, 159-174。

---

### G16 — 非 explore 路径的默认节点/块预算　服务 B

**决策**：always-loaded 的非 explore context 路径用保守默认：`maxNodes 20 / maxCodeBlocks 5 / maxCodeBlockSize 1500 / searchLimit 3 / traversalDepth 1 / minScore 0.3`。explore（G1–G7）才是更富的一答路径。

**要动的文件**：`src/codegraph/economy/defaults.ts`（新建）。

**可抄代码**（源: /tmp/tk-research/codegraph/src/context/index.ts:143-152；verbatim）：

```ts
const DEFAULT_BUILD_OPTIONS: Required<BuildContextOptions> = {
  maxNodes: 20,           // Reduced from 50 - most tasks don't need 50 symbols
  maxCodeBlocks: 5,       // Reduced from 10 - only show most relevant code
  maxCodeBlockSize: 1500, // Reduced from 2000
  includeCode: true,
  format: 'markdown',
  searchLimit: 3,         // Reduced from 5 - fewer entry points
  traversalDepth: 1,      // Reduced from 2 - shallower graph expansion
  minScore: 0.3,
};
```

**具体数值**：20 / 5 / 1500 / 3 / 1 / 0.3。

**有序步骤**：(1) 落 `DEFAULT_BUILD_OPTIONS`。(2) `tk_node`(context) handler 以它为基，调用方可覆盖。

**测试**：`defaults.test.ts` — 不传 options 的 `buildContext` 返回 `≤20` 节点、`≤5` 块、每块 `≤1500` 字符。

**证据回指**：/tmp/tk-research/codegraph/src/context/index.ts:143-152。

---

### 整层有序落地（跨决策，每步独立可发布可测）

1. **economy/budget.ts + flags.ts**（G1/G2/G10 + kill-switch 读取）→ 测 `budget.test.ts`（含 inline-cap 不变式 + 单调性 + call-count）。**可独立发布**：仅常量与纯函数。
2. **economy/lineNumbers.ts + markers.ts**（G11/G12/G13/G14）→ 测 `lineNumbers.test.ts`/`markers.test.ts`。**可独立发布**：纯字符串/格式化。
3. **economy/noise.ts + defaults.ts**（G15/G16）→ 测 `noise.test.ts`/`defaults.test.ts`。
4. **economy/wholeFile.ts + cluster.ts**（G3/G7）→ 测 byte-identical / envelope-drop。依赖步 1（budget）+步 2（lineNumbers）。
5. **economy/skeletonize.ts**（G4/G5/G6）→ 测 inert + spare + spine-windowing。依赖步 1–4 + A/C 的边访问 API（`getEdgesFrom/getEdgesTo` 对齐后）。
6. **mcp/tools.ts 装配**（F 绑定：`tk_explore.maxOutputChars` import G1 常量；G8 `include_content`；G9 `summaryOnly`）→ 端到端 fixture 测。
7. **K A/B harness 接线**：`TK_ADAPTIVE_EXPLORE` / `TK_EXPLORE_LINENUMS` 双用作 A/B 开关（empty/0 = WITHOUT 臂），由 K 在 Claude Code headless 实测 uncached delta（绑定 K 冲突解决：measured 臂在 SECONDARY host）。

每步的 kill-switch 默认值与 A/B 语义：`TK_ADAPTIVE_EXPLORE`（默认 ON，`=0` 退回全源 → G4–G6 inert）、`TK_EXPLORE_LINENUMS`（默认 ON，`=0` 去行号）。

---

### 仍需用户拍板（G.stillOpen，不阻塞 v1）

1. **char vs token 单位**：现按 char 档 13000/18000/24000 发（可移植代理）；是否在 K 的 harness 实测 VS Code Copilot/Windows 真实 inline-result cap 后再把天花板改写成 token（~6K 级），由用户在 K Track-1 测完后定。char-now / tokens-after-measurement 已是 DEP MAP 的协调结论。
2. **~28% 与 "provably inert byte-identical" 是 codegraph 自报数**：tk 对外宣称前须在 tk A/B harness 对 VS Code Copilot/Windows 复测（用户原则「tk 用实测不用估算/移植数」）。
3. **`MIN_SIBLINGS=3` 与 `bodyCap=maxCharsPerFile*1.5`** 是 codegraph 调出的常量，在 tk 的 uncached-token 分母下是否最优未验证 → 列为 K 测量 runner 的 sweep 参数。
4. **kill-switch 暴露面**：`TK_ADAPTIVE_EXPLORE`/`TK_EXPLORE_LINENUMS` 是作为文档化用户 config，还是仅 harness-only env flag（参 CLI-surface-cleanup 方向）—— 产品面决定。


---

## 需求 H — Human surface understanding inside VS Code

本节交付 **human diet 的渲染落地面**：把上游 A8 `formatSubgraphTree` 产出的人读子图，渲染成一个**自包含、内联 JSON、零后端、零 CDN、可离线从 `file://` 打开**的单文件 HTML viewer，并由 F 的 VS Code 扩展打开。它服务 A/B 的「两个共同重要的工作」中的 **A（人理解项目 + 协作）**——但它本身是只读的理解面，可编辑往返归 I（在原生 `.tk/wiki/pages/*` 文件上做，viewer 不内嵌编辑器，见冲突 I↔H 的裁决）。

复用的核心事实：tk 仓库里 `src/report/html.ts` 已经是一个 791 LOC 的成熟单文件渲染器（gain/inspect 两种 doc），其 `embed()` 转义 + `renderReportHtml()` 内联 `<script>window.__TK_REPORT__ = …</script>` 的范式**正是** H1 需要的全部骨架；`src/report/open.ts` 已经实现「写到 `~/.token-killer/` + 0600 + best-effort 打开浏览器」。我们**新增第三种 `ReportKind = "wiki"`**，而不是另起炉灶。

---

### H1 — 自包含单文件、内联 JSON、零后端的 wiki viewer  〔服务 A〕

**(1) 决策**：复用 `src/report/html.ts` 的 `embed()` + `renderReportHtml()` 范式，新增 `ReportKind = "wiki"` 分支与一个 `renderWiki()` 客户端渲染器；产物是单文件 `index.html`，把 A8 子图树 + B 的 narrative（带 `provenance`）作为内联 JSON 注入，零 CDN、零网络、可 `file://` 直开。**覆盖（overrules）** 把 VS Code Simple Browser 当集成路径的方案——viewer 是一个本地文件，由 F 的扩展用 `vscode.env.openExternal` / webview 打开，不依赖任何内嵌浏览器服务。

**(2) 要动的文件**（tk-repo 路径）：

```
src/report/
  html.ts          ← 改：ReportKind 加 "wiki"；新增 WikiDoc 类型 + renderWiki() 客户端脚本 + STYLE 复用
  open.ts          ← 改：emitHtmlReport 已支持任意 kind；wiki 产物落到 .tk/wiki/index.html（人读工件，非 DB）
src/wiki/
  render.ts        ← 新建：buildWikiDoc(subgraph, narrative) → WikiDoc，调 renderReportHtml 写 .tk/wiki/index.html
  tree.ts          ← 新建：A8 formatSubgraphTree 的 HTML 侧适配（把树节点转 WikiNode[]，file:line 原样带上）
tests/unit/wiki/
  render.test.ts   ← 新建：固定 fixture → 断言单文件、内联 JSON、无 http(s):// 外链、provenance badge
```

产物落点遵循冲突 C↔L 裁决：**重二进制 DB 在 out-of-tree**（`~/.token-killer/projects/<fp>/index.db`），而 **HTML viewer 是人读工件，落在 in-repo 的 `.tk/wiki/index.html`**（`.tk/` 已在 I.9 的 `.gitignore` 策略内，DB 不进仓、wiki 工件可选择性共享）。

**(3) 可抄代码**

A. 现成可抄的转义与注入骨架（**这是 H1 的全部地基，原样复用**）：

```ts
// 源: src/report/html.ts:24-31  （verbatim，license unrestricted）
// Escape a JSON string for safe embedding inside <script> (prevent </script>
// breakout and U+2028/2029 source-break injection).
function embed(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/ /g, "\\u2028")
    .replace(/ /g, "\\u2029");
}
```

```ts
// 源: src/report/html.ts:740-784  （verbatim 摘录：内联 JSON + 内联 STYLE/SCRIPT，零 CDN）
export function renderReportHtml(doc: ReportDoc): string {
  const kicker =
    doc.kind === "gain" ? "Token savings · measured" : "Token optimization · opportunities";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(doc.title)} — Token Killer</title>
<style>${STYLE}</style>
</head>
<body>
<div class="wrap">
  <header class="pagehead">
    <p class="lbl">${escapeHtml(kicker)}</p>
    <h1>${escapeHtml(doc.title)} <span class="tk">/ tk</span></h1>
    <div class="sub">${escapeHtml(doc.subtitle)}</div>
    <div class="meta" id="meta"></div>
  </header>
  <main id="app"></main>
  <div class="foot">Generated by Token Killer on ${escapeHtml(doc.generatedAt)}. This report was built on your machine; nothing was uploaded.</div>
</div>
<script>window.__TK_REPORT__ = ${embed(doc)};</script>
<script>${SCRIPT}</script>
</body>
</html>
`;
}
```

B. 现成可抄的「写文件 0600 + best-effort 打开」（**wiki 产物复用同一落盘/打开路径**）：

```ts
// 源: src/report/open.ts:36-62  （verbatim：detached 打开 OS 默认处理器，headless 仅打印路径）
export function openInBrowser(path: string): boolean {
  if (process.env.TK_NO_OPEN) return false;
  try {
    const [cmd, args] =
      process.platform === "darwin"
        ? (["open", [path]] as const)
        : process.platform === "win32"
          ? (["cmd", ["/c", "start", "", path]] as const)
          : (["xdg-open", [path]] as const);
    const child = spawn(cmd, [...args], { stdio: "ignore", detached: true });
    child.on("error", () => {});
    child.unref();
    return true;
  } catch {
    return false;
  }
}
```

C. **已改写**——为 wiki 新增的 `WikiDoc` 类型 + 客户端 `renderWiki()` 树渲染器（tk-adapted，沿用 STYLE 的 `.panel/.field/.where/.estbadge` 类与 `esc()` 工具；A8 的 file:line 与 B 的 provenance 是 viewer 的两个核心信任原语）：

```ts
// src/report/html.ts —— 新增（tk-adapted；复用现有 ReportDoc 注入机制与 STYLE）
// WikiNode = A8 formatSubgraphTree 的 HTML 侧投影：每个节点都带 file:line（信任原语 J1）。
export type WikiNode = {
  id: string;
  kind: string;          // function | class | method | file | module …（C 的 kind-discriminated 节点）
  label: string;         // 显示名（签名折叠版，M9）
  file: string;          // 相对仓库根
  start_line: number;    // 必有：file:line 是 H/F/I/J 共享的唯一信任锚点
  children?: WikiNode[];
  // narrative 字段来自 B 的生成层；provenance 决定是否打 "AI" 标，永不参与检索
  summary?: string;
  provenance?: "static" | "llm" | "template";
};

export type WikiDoc = {
  kind: "wiki";
  title: string;
  subtitle: string;
  generatedAt: string;   // ISO
  data: {
    scope: "project";
    project: string;
    index_generation: number;   // E 的代次：陈旧横幅由此与磁盘 mtime 比对（J9）
    root: WikiNode;
  };
};
```

```js
// src/report/html.ts 的 SCRIPT 内新增（已改写；纯 vanilla，无依赖，复用现有 esc()）
// 渲染只读子图树：每个节点显示 kind·label，可点击展开/折叠，file:line 永远可见，
// LLM 来源的 summary 打 "AI" 估计标（estbadge），与 static 视觉区分（B1/J2）。
function renderWiki(D) {
  const provBadge = (p) =>
    p === "llm" ? ' <span class="estbadge">AI</span>'
    : p === "template" ? ' <span class="estbadge">tmpl</span>' : '';
  const nodeHtml = (nd, depth) => {
    const pad = 'style="padding-left:' + (depth * 18) + 'px"';
    const where = esc(nd.file) + (nd.start_line ? ':' + nd.start_line : '');
    const sum = nd.summary
      ? '<div class="fpdetail">' + esc(nd.summary) + provBadge(nd.provenance) + '</div>' : '';
    const kids = (nd.children || []).map((c) => nodeHtml(c, depth + 1)).join("");
    return '<div class="item" ' + pad + '>' +
      '<div class="ititle"><span class="pt">' + esc(nd.kind) + ' · ' + esc(nd.label) + '</span>' +
      '<span class="tag">' + where + '</span></div>' + sum + '</div>' + kids;
  };
  const out = ['<div class="section"><h2>' + esc(D.project) + '</h2>' +
    '<p class="exp">Project map · index generation ' + esc(String(D.index_generation)) +
    '. Every node links to a real <span class="num">file:line</span>; the "AI" tag marks ' +
    'narrative written by your host agent, never used to find code.</p>' +
    '<div class="panel" style="padding:8px">' + nodeHtml(D.root, 0) + '</div></div>'];
  root.innerHTML = out.join("");
}
```

```ts
// src/report/html.ts:301-302 处的 render() 分发改写（已改写；加 wiki 分支）
function render() {
  if (DOC.kind === "gain") renderGain(DOC.data);
  else if (DOC.kind === "wiki") renderWiki(DOC.data);   // 新增
  else renderInspect(DOC.data);
  // …现有 click 委托保持不变
}
```

> 上述 `WikiNode → HTML` 的输入端（`buildWikiDoc` / A8 子图到 `WikiNode[]` 的转换）属本节下游、依赖 A8 `formatSubgraphTree` 的最终签名：**需实现时补**——gap 是「A8 树节点对象的确切字段名」未在 dossier 给出确定 schema，转换函数 `src/wiki/tree.ts` 待 A 段冻结 A8 节点结构后一一映射（`file/start_line/kind/label` 已知必有）。

**(4) 具体数值**

- 文件权限：HTML viewer `0600`，目录 `0700`（沿用 `open.ts` 现值；`.tk/wiki/` 同样 `0700`）。
- 单文件总预算：viewer 注入 JSON **≤ 2 MB**（超出则 viewer 顶部显示「树已截断，用 `tk wiki --node <id>` 钻取」横幅，不写超大文件）。
- 树渲染默认展开深度：**2 层**（depth 0/1 默认展开，depth ≥ 2 折叠），单页节点上限 **2000**（超出截断 + 横幅）。
- Mermaid 内联预算（H1 的 stillOpen）：**v1 = 0**（不内联任何 mermaid，避免 CDN/运行时依赖与 M21「不臆造图」冲突）；图谱用上面的缩进树表达。需要图时由 F 扩展的 webview 走 host 自带能力，超 v1。
- 陈旧检测：`index_generation` 与磁盘 mtime sweep 比对（E 的 lazy-on-read，非常驻 watcher，见冲突 E↔J 裁决）；偏离即在 viewer 顶部渲染 J8/J9 横幅。
- headless/CI：`TK_NO_OPEN` 置位时只打印路径不打开（`open.ts:37` 现成）。

**(5) 有序步骤**（每步独立可发布 + 可测）

1. **加 `"wiki"` kind 与 `WikiDoc` 类型**：在 `src/report/html.ts` 的 `ReportKind`/`ReportDoc` 旁加 `WikiDoc`、`WikiNode`。测试：`tsc` 通过 + 类型导出存在。
2. **加 `renderWiki()` 客户端脚本 + `render()` 分发分支**：把上面 C 段两块塞进 `SCRIPT`。测试：用最小 fixture 调 `renderReportHtml({kind:"wiki",…})`，断言产物含 `id="app"`、含 `window.__TK_REPORT__`、且字符串里**无 `http://`/`https://` 外链**（零 CDN 断言）。
3. **`src/wiki/render.ts` 的 `buildWikiDoc()` + 落盘**：复用 `open.ts` 的 `emitHtmlReport`，但落点改 `.tk/wiki/index.html`（人读工件）而非 `~/.token-killer/reports/`。测试：跑后 `.tk/wiki/index.html` 存在、`0600`、可被 `JSON.parse` 抽回内联 doc。
4. **`src/wiki/tree.ts` 适配 A8 子图**（依赖 A8 冻结）：把 `formatSubgraphTree` 的节点投影成 `WikiNode[]`，原样带 `file/start_line/provenance`。测试：固定子图 fixture → 断言每个 `WikiNode.start_line > 0`、`provenance ∈ {static,llm,template}`。
5. **接 F 扩展打开面**：F 扩展提供命令 `tk: Open project wiki` → 调 `tk wiki` 生成 `.tk/wiki/index.html` → `vscode.env.openExternal`/webview 打开。测试：F 段集成测试持有此绑定（本节只暴露 CLI `tk wiki`）。

**(6) 测试**（逐步验证）

- 单测 fixture（`tests/unit/wiki/render.test.ts`）：① `renderReportHtml(wikiDoc)` 输出无 `http(s)://`（零网络）；② 输出恰好包含一处 `window.__TK_REPORT__ =`（内联 JSON 单源）；③ `</script>` 不出现在 JSON 内（`embed()` 转义已由 html.ts 现有逻辑保证，复用即覆盖）；④ `provenance:"llm"` 的节点渲染出 `estbadge`「AI」；⑤ 截断分支：3000 节点 fixture → 输出含截断横幅且字节数 < 2 MB。
- 离线断言：把产物写临时文件，`file://` 路径下用 jsdom 加载，断言 `#app` 非空、断网环境无 fetch 调用。
- A8 投影测试（步骤 4）：每个 `WikiNode.start_line` 为正整数、`file` 非空——`file:line` 信任原语不可缺（J1）。

**(7) 证据回指**

- `embed()` 转义骨架：`src/report/html.ts:24-31`（已 Read 确认，verbatim）。
- 内联 JSON + 内联 STYLE/SCRIPT 渲染壳：`src/report/html.ts:740-784`（已 Read 确认，verbatim）。
- `renderInspect` 的 `.item/.field/.where/.estbadge` 类与 `esc()`：`src/report/html.ts:533-647`、`:241`（`renderWiki` 复用同类，已 Read 确认）。
- 写文件 0600 + best-effort 打开 + headless 仅打印：`src/report/open.ts:20-62`（已 Read 确认，verbatim）。
- dossier H1：`ref src/report/html.ts:26`「`window.__TK_REPORT__ = embed(doc)`」「791 LOC single file, offline」「Output `.tk/wiki/index.html` via `embed()`」。
- 上游绑定：A8 `formatSubgraphTree`（DEP MAP A.drives.H「human diet (A8 formatSubgraphTree) is what the HTML viewer renders」）；B 的 per-field `provenance`（DEP MAP B.drives.H/I）；冲突裁决 C↔L（DB out-of-tree、`.tk/` 仅人读工件）、F↔H↔I↔L（F 扩展是 H viewer 的打开载体）、I↔H（viewer 只读，编辑走 `.tk/wiki/pages/*` 原生文件）。

---

### 跨段一致性与遗留给用户的点

- **co-equal A/B**：本段是纯 A（人理解）面，v1 即交付、非 v2 延后——满足 anchor 2。它与 F（agent 面）共用同一 backend（A 的单图存储 + B 的 static/llm 边界），只是 human diet 的渲染端。
- **只读边界（I↔H 裁决）**：viewer 不内嵌 web 编辑器；可编辑往返由 I 在 `.tk/wiki/pages/*.md|html` 原生文件 + VS Code diff-view/文件 watcher 完成，viewer 渲染「已接受」的 pages 内容。H1 stillOpen「Mermaid 内联预算」在此定为 **v1=0**；若需图，留作用户决策（走 host webview 能力，超 v1）。
- **零 model 花费**：narrative 字段由 B 的 host-borrowed/订阅 CLI 生成，viewer 只渲染 + 打 provenance 标，绝不内嵌模型、不发 API key（符合强 lean）。

---

## 需求 I — Collaboration（协作：知识沉淀、控制文件、agent 写/人编辑往返、来源与陈旧度）

本节服务 Goal A（人类理解 + 协作），与 B 共线（agent 路径）的部分明确标注。所有决策遵守上游约束：节点/边/来源都来自 A 的单一 graph store（file:line on every node），B 的 per-field `provenance` 列（`static|llm|template`）；human 内容走文件不进 DB（与 C 的 DB-out-of-tree 一致）；交付面统一收敛到 F 的 VS Code 扩展（H 的只读 HTML viewer + I 的 native 文件往返都挂在它上面），CLI 为 secondary host（Claude Code）后端。冲突已按 DEP MAP 解析：DB 走 out-of-tree `~/.token-killer/projects/<fp>/index.db`，`.tk/` 只放 human 共享物 + gitignored staging；编辑面 v1 = VS Code 原生文件 + watcher 写回（HTML viewer 保持只读）。

协作拆成 5 个可决策轴，tk 提交的子集（I.0）：**human-agent 为主面**；human-human 走 **git 异步**（共享已 commit 的 `.tk/` artifacts，非实时多光标）；**读 + 写双层**（只读理解默认 + 可编辑沉淀 opt-in）；三种协作子形态全部落成独立 repo 文件（control-file=人类权威 / annotation=人类知识块 / review-context=PR 影响）；**无自有 server / 无 egress / 无权限层**（继承 repo 的 git 权限）。否决项：实时 CRDT/websocket（与 no-server 强约束冲突，REJECTED）。

---

### 决策 I-1：`.tk/wiki.json` JSONC 控制文件 = 人类→agent 权威 steering（服务 两者）

**(1) 决策**：repo-checked 控制文件 `.tk/wiki.json`（JSONC，允许注释 — tk 已有 JSONC reader），schema 复用 DeepWiki 的 `.devin/wiki.json` 已验证模型：顶层 `repo_notes: [{content, author?}]` + `pages: [{title, purpose, parent?, page_notes?: string[], pin?: boolean}]`。当 `pages` 存在时为**权威**语义（"no more, no less"，生成器精确产出这些页）；仅有 `repo_notes` 时生成器被 steer 但可自选页。

**(2) 要动的文件**：
```
src/wiki/control.ts          // 新建：parseControlFile() — 读 .tk/wiki.json，复用现有 JSONC reader
src/wiki/control.schema.ts   // 新建：ControlFile / ControlPage 类型 + cap 校验
src/wiki/paths.ts            // 新建：.tk/ 路径常量（见 I-7 git-ignore split）
tests/unit/wiki/control.test.ts
```
复用 tk 现有 JSONC reader（与 VS Code settings 同一个 parser）。

**(3) 可抄代码**：DeepWiki 控制文件 schema（DeepWiki 闭源，schema 经 docs.devin.ai 验证；deepwiki-open 在代码里镜像了 page 模型）：

```jsonc
// .tk/wiki.json — 人类→agent 权威 steering（DeepWiki .devin/wiki.json 模型，JSONC）
{
  // pages 缺省 => repo_notes 仅 steer，生成器自选页
  // pages 存在 => 权威：生成器精确产出这些页，no more no less
  "repo_notes": [
    { "content": "The compression handlers live in src/handlers/; prioritize them in docs.", "author": "Cozy" }
  ],
  "pages": [
    { "title": "Handler architecture", "purpose": "Document src/handlers/ factory + traits model", "parent": null, "pin": true }
  ]
}
```

deepwiki-open 侧的生成契约（每页字段，已验证 `WikiPage` interface — 见 I-2 provenance）：

```typescript
// 源: /tmp/tk-research/deepwiki-open/src/types/wiki/wikipage.tsx:2-13 （verbatim）
export interface WikiPage {
  id: string;
  title: string;
  content: string;
  filePaths: string[];
  importance: 'high' | 'medium' | 'low';
  relatedPages: string[];
  // New fields for hierarchy
  parentId?: string;
  isSection?: boolean;
  children?: string[]; // IDs of child pages
}
```

tk 控制文件解析器（已改写 — tk-adapted，复用现有 JSONC reader，需实现时接 tk 的 jsonc 模块）：

```typescript
// src/wiki/control.schema.ts （tk-adapted，需实现时补 jsonc import）
export interface ControlNote { content: string; author?: string }
export interface ControlPage {
  title: string;
  purpose: string;
  parent?: string | null;
  page_notes?: string[];
  pin?: boolean;
}
export interface ControlFile {
  tier?: 'solo' | 'team';
  repo_notes?: ControlNote[];
  pages?: ControlPage[];
}
export const CONTROL_FILE_REL = '.tk/wiki.json';
```

**(4) 具体数值**：JSONC 解析失败 → exit 2（fail-loud）。`pages` 存在性是权威/自由模式的唯一开关。

**(5) 有序步骤**：
1. 建 `src/wiki/paths.ts` 路径常量（`.tk/wiki.json`、`.tk/wiki/pages/`、`.tk/wiki/proposed/`）。
2. 建 `control.schema.ts` 类型。
3. 建 `control.ts` `parseControlFile()`：缺文件返回 `{}`（自由模式）；JSONC parse error → 抛 exit-2 错误。

**(6) 测试**：fixture `.tk/wiki.json`（含注释）→ 断言解析出 `repo_notes`/`pages`；坏 JSONC → 断言 exit 2 且 stderr 含路径。

**(7) 证据回指**：docs.devin.ai/work-with-devin/deepwiki（caps + 字段名）；`/tmp/tk-research/deepwiki-open/src/types/wiki/wikipage.tsx:2-13`。

---

### 决策 I-2：硬上限，parse-time fail-loud（服务 两者）

**(1) 决策**：解析时强制硬上限，明确报错（非静默截断）：max pages = **30**（`"tier":"team"` 时 **60**）；max 合并 notes（`repo_notes` + 所有 `page_notes`）= **100**；max 每条 note = **10000** 字符；page titles 必须唯一且非空。违例：拒绝生成，打印 `tk: .tk/wiki.json exceeds cap (pages 34 > 30) — split or set tier:team`，**exit 2**。

**(2) 要动的文件**：`src/wiki/control.ts`（`validateCaps()`）；`tests/unit/wiki/control-caps.test.ts`。

**(3) 可抄代码**（tk-adapted，DeepWiki caps 来自 docs.devin.ai：30/80 enterprise→tk 用 30/60，100 notes，10k chars/note）：

```typescript
// src/wiki/control.ts — validateCaps（tk-adapted；caps 源 docs.devin.ai）
const CAP_PAGES_SOLO = 30, CAP_PAGES_TEAM = 60;
const CAP_NOTES_TOTAL = 100, CAP_NOTE_CHARS = 10000;

export function validateCaps(cf: ControlFile): void {
  const pageCap = cf.tier === 'team' ? CAP_PAGES_TEAM : CAP_PAGES_SOLO;
  const pages = cf.pages ?? [];
  if (pages.length > pageCap)
    fail(`pages ${pages.length} > ${pageCap}`, 'split or set tier:team');

  const titles = pages.map(p => p.title?.trim());
  if (titles.some(t => !t)) fail('a page title is empty', 'every title must be non-empty');
  if (new Set(titles).size !== titles.length) fail('duplicate page titles', 'titles must be unique');

  const notes = [...(cf.repo_notes ?? []).map(n => n.content),
                 ...pages.flatMap(p => p.page_notes ?? [])];
  if (notes.length > CAP_NOTES_TOTAL)
    fail(`notes ${notes.length} > ${CAP_NOTES_TOTAL}`, 'remove notes');
  const tooLong = notes.find(n => n.length > CAP_NOTE_CHARS);
  if (tooLong) fail(`a note exceeds ${CAP_NOTE_CHARS} chars`, 'shorten it');
}

function fail(what: string, hint: string): never {
  process.stderr.write(`tk: .tk/wiki.json exceeds cap (${what}) — ${hint}\n`);
  process.exit(2);
}
```

**(4) 具体数值**：pages≤30（team≤60）、notes≤100、每条≤10000 字符、titles 唯一非空、exit 2。

**(5) 有序步骤**：1. 加 `validateCaps()` 常量 + 校验；2. 在 `parseControlFile()` 末尾调用；独立可测。

**(6) 测试**：31 页 solo → exit 2；31 页 team:true → 通过；60 页 team → 通过、61 → exit 2；重复 title → exit 2；10001 字符 note → exit 2。

**(7) 证据回指**：docs.devin.ai/work-with-devin/deepwiki（30/80 + 100 notes + 10k chars 已验证）。

---

### 决策 I-3：每页机器可校验 provenance + 行级深链（服务 两者）

**(1) 决策**：每生成页带 provenance `{ filePaths: string[], importance: 'high'|'medium'|'low', relatedPages: string[], sourceCommit: string }`；每个引用代码的 claim 带 `path:Lstart-Lend` 深链，HTML 面渲染为可点 `vscode://file/${abs}:${line}`、markdown 面为纯 `path:Lstart-Lend`。provenance 与内容同存，不在 render 时推断。与 B 对齐：每页/每 summary 行带 `provenance` 列（`static|llm|template`），检索 ranking 只取 `static`（见 J/B），LLM 字段永不改 find-code 结果。

**(2) 要动的文件**：
```
src/wiki/page.schema.ts   // 新建：WikiPageMeta（filePaths/importance/relatedPages/sourceCommit/provenance/version）
src/wiki/deeplink.ts      // 新建：renderDeepLink() — vscode://file (HTML) / path:Lstart-Lend (md)
```

**(3) 可抄代码**：跨批 consensus 形状（deepwiki-open `WikiPage` 见 I-1）+ opendeepwiki DB 侧 provenance 列：

```csharp
// 源: /tmp/tk-research/opendeepwiki/src/OpenDeepWiki.Entities/Repositories/DocFile.cs:9-27 （verbatim；注释原文为中文）
public class DocFile : AggregateRoot<string>
{
    [Required]
    [StringLength(36)]
    public string BranchLanguageId { get; set; } = string.Empty;

    /// <summary>文档内容</summary>
    public string Content { get; set; } = string.Empty;

    /// <summary>来源文件列表（JSON 数组格式存储）记录生成此文档时读取的源代码文件路径</summary>
    public string? SourceFiles { get; set; }   // provenance = JSON list of backing source files
}
```

tk 页 meta + 深链（已改写 — tk-adapted；`sourceCommit` 来自 understand-anything 的 `project.gitCommitHash` 模式）：

```typescript
// src/wiki/page.schema.ts （tk-adapted）
export interface WikiPageMeta {
  title: string;
  filePaths: string[];                          // provenance（复用于 staleness，见 I-6）
  importance: 'high' | 'medium' | 'low';
  relatedPages: string[];
  sourceCommit: string;                         // git HEAD at generation（staleness anchor）
  version: number;                              // RepoDoc DocNode.version 模式，regen 自增
  provenance: 'static' | 'llm' | 'template';    // B 的 field-granularity 来源契约
}

// src/wiki/deeplink.ts （tk-adapted）
import { pathToFileURL } from 'node:url';
export function renderDeepLink(absPath: string, start: number, end: number, surface: 'html'|'md'): string {
  if (surface === 'html')
    return `<a href="vscode://file/${absPath}:${start}">${absPath}:L${start}-L${end}</a>`;
  return `${absPath}:L${start}-L${end}`;   // markdown：纯文本，agent 可解析
}
```

**(4) 具体数值**：`importance` 3 级枚举；`vscode://file/<abs>:<line>` 用首行行号；markdown 用 `Lstart-Lend` 闭区间。

**(5) 有序步骤**：1. 定义 `WikiPageMeta`；2. `renderDeepLink()` 双面实现 + Windows path（`pathToFileURL` 友好）；独立可测。

**(6) 测试**：HTML 面断言含 `vscode://file/` + `:line`；md 面断言纯 `path:Lstart-Lend` 无 anchor；Windows 绝对路径 fixture 断言不破 URL。

**(7) 证据回指**：`/tmp/tk-research/deepwiki-open/src/types/wiki/wikipage.tsx:2-13`；`/tmp/tk-research/opendeepwiki/.../DocFile.cs:9-27`；understand-anything `project.gitCommitHash`。

---

### 决策 I-4：agent 写 / 人编辑往返 = proposed↔pages staging（服务 两者）

**(1) 决策**：采用 Davia 的 proposed/assets 两目录拆分，改名到 tk 树：agent 生成写 `.tk/wiki/proposed/<page>.html`；人类接受将其晋升到 `.tk/wiki/pages/<page>.html`（live、人类拥有的副本）。已存在页的**重生成永远写 `proposed/`**（绝不就地覆盖 `pages/`）。晋升 = 显式 `tk wiki accept [<page>]`（copy proposed→pages 后删 proposed 项），或 VS Code diff view 三方 review。**文件支撑、无 DB** —— 与 C 的 "DB 仅存 index、文件存 human content" 拆分一致；`pages/**` 进 git（团队共享 + PR review 免费），`proposed/**` gitignore（见 I-7）。

**(2) 要动的文件**：
```
src/wiki/staging.ts       // 新建：getBaseDestinationPath / accept() / 读 fallback
src/wiki/cli.ts           // 新建：tk wiki accept / regen / status / impact 子命令
tests/unit/wiki/staging.test.ts
```

**(3) 可抄代码**：Davia staging 拆分 + 路径围栏 + 读 fallback：

```typescript
// 源: /tmp/tk-research/davia/packages/agent/src/agent/helpers/tools.ts:60-114 （verbatim）
export function getBaseDestinationPath(projectPath: string, isUpdate: boolean): string {
  if (isUpdate) {
    return path.join(projectPath, ".davia", "proposed");
  }
  return path.join(projectPath, ".davia", "assets");
}
export function getAssetsPath(projectPath: string): string {
  return path.join(projectPath, ".davia", "assets");
}
export function resolveFilePath(filePath: string, context: ContextType): string {
  if (filePath.startsWith("/")) {
    throw new Error(
      "Absolute paths with leading slash are not allowed. " +
        `Use relative paths like 'page1/page2/file.html' instead of '${filePath}'`
    );
  }
  const basePath = getBaseDestinationPath(context.projectPath, context.isUpdate);
  const absolutePath = path.normalize(path.join(basePath, filePath));
  const normalizedDestination = path.normalize(basePath);
  if (!absolutePath.startsWith(normalizedDestination)) {
    throw new Error(`Path '${filePath}' attempts to escape the destination directory`);
  }
  return absolutePath;
}
```

```typescript
// 源: /tmp/tk-research/davia/packages/agent/src/agent/tools.ts:193-210 （verbatim）
// 读：isUpdate 时先 proposed，回退 assets
if (context.isUpdate) {
  const proposedPath = getBaseDestinationPath(context.projectPath, true);
  const proposedFilePath = path.join(proposedPath, filePath);
  try {
    const content = await fs.readFile(proposedFilePath, "utf-8");
    return content;
  } catch {
    const assetsPath = getAssetsPath(context.projectPath);
    const assetsFilePath = path.join(assetsPath, filePath);
    const content = await fs.readFile(assetsFilePath, "utf-8");
    return content;
  }
}
```

tk 改写（assets→pages 命名 + `accept()`，已改写）：

```typescript
// src/wiki/staging.ts （tk-adapted from davia tools.ts:60-114）
import path from 'node:path';
import { promises as fs } from 'node:fs';

export function wikiBaseDir(projectRoot: string, isRegen: boolean): string {
  return isRegen
    ? path.join(projectRoot, '.tk', 'wiki', 'proposed')   // agent staging
    : path.join(projectRoot, '.tk', 'wiki', 'pages');     // human-owned live
}
export function pagesDir(projectRoot: string): string {
  return path.join(projectRoot, '.tk', 'wiki', 'pages');
}
// resolveWikiPath：复用 davia 围栏（reject leading-slash + startsWith confine），base 取自上面
export async function acceptPage(projectRoot: string, page: string): Promise<void> {
  const from = path.join(wikiBaseDir(projectRoot, true), `${page}.html`);
  const to   = path.join(pagesDir(projectRoot), `${page}.html`);
  await fs.mkdir(path.dirname(to), { recursive: true });
  await fs.copyFile(from, to);                    // 晋升
  await fs.rm(from, { force: true });             // 删 proposed 项
}
```

**(4) 具体数值**：重生成 100% 写 `proposed/`；`accept` 后 `proposed/<page>.html` 立即删除；读优先级 proposed→pages。

**(5) 有序步骤**：1. `staging.ts` 路径 + `resolveWikiPath` 围栏；2. `acceptPage()`；3. `tk wiki accept` CLI 接线；每步独立可测。

**(6) 测试**：写 proposed 不触 pages；`accept` 后 pages 有内容且 proposed 空；越界路径 `../x` → 抛 escape 错误；缺 proposed 时读回退 pages。

**(7) 证据回指**：`/tmp/tk-research/davia/packages/agent/src/agent/helpers/tools.ts:60-114`；`/tmp/tk-research/davia/packages/agent/src/agent/tools.ts:193-210`。

---

### 决策 I-5：人类编辑 300ms debounce 直写文件（服务 A）

**(1) 决策**：人类在 VS Code 原生编辑 `pages/*.html|md`，文件保存触发 **300ms** debounce 直接 `fs.writeFile` 写回**同一文件**（tk 无 server，用扩展 file-watcher 替代 Davia 的 `POST /api/content`）。编辑的是 agent 拥有的纯 HTML/markdown 文件之上的薄视图。**无 OT、无 merge**，单用户文件 last-write-wins —— 因为 proposed/live 拆分已杜绝 agent/人并发写同一路径。冲突解析（I↔H）：HTML viewer **保持只读**，可编辑往返作用于底层 `pages/*.md|html` 文件，v1 用 VS Code 原生编辑器 + 扩展 watcher 写回，不自建 web 编辑器。

**(2) 要动的文件**：
```
src/wiki/writeback.ts          // 新建：debouncedWriteback()（Node 侧纯逻辑，可测）
extension/src/wikiWatcher.ts   // 新建：VS Code FileSystemWatcher → 调 writeback（F 扩展内，需实现时补）
```

**(3) 可抄代码**：Davia 编辑器 300ms debounce（验证为 shipped 值）：

```typescript
// 源: /tmp/tk-research/davia/apps/web/src/app/(main)/[projectId]/[[...pagePath]]/editor.tsx:52-109 （verbatim 关键段）
const handleUpdate = useDebounceCallback(
  async (htmlContent: string) => {
    const filePath = pagePath + ".html";
    const response = await fetch("/api/content", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, path: filePath, content: htmlContent }),
    });
    // ... 更新 tree title ...
  },
  300 // 300ms debounce delay
);
```

```typescript
// 源: /tmp/tk-research/davia/apps/web/src/app/api/content/route.ts:135-142 （verbatim）
// 写：扁平文件，无 DB
const assetPath = join(project.path, ".davia", "assets");
const filePath = join(assetPath, path);
await fs.outputFile(filePath, content, "utf-8");
return NextResponse.json({ success: true });
```

tk 改写（去掉 HTTP，直 fs，300ms verbatim，已改写）：

```typescript
// src/wiki/writeback.ts （tk-adapted；server→direct fs）
import { promises as fs } from 'node:fs';
const DEBOUNCE_MS = 300;                         // 源: davia editor.tsx:108 verbatim 值
const timers = new Map<string, NodeJS.Timeout>();

export function debouncedWriteback(absPath: string, content: string): void {
  clearTimeout(timers.get(absPath));
  timers.set(absPath, setTimeout(async () => {
    await fs.writeFile(absPath, content, 'utf-8');   // last-write-wins，单用户
    timers.delete(absPath);
  }, DEBOUNCE_MS));
}
```

**(4) 具体数值**：debounce = **300ms**；写回目标 = 触发文件原路径；并发策略 = last-write-wins（单用户，无 OT/CRDT）。

**(5) 有序步骤**：1. `writeback.ts` 纯逻辑（fake timers 可测）；2. 扩展 `wikiWatcher.ts` 接 `pages/` 写事件 → 调 writeback（需实现时补，挂 F 扩展）。

**(6) 测试**：100ms 内连写 3 次 → 仅 1 次 `fs.writeFile`（fake timers）；写到正确绝对路径。

**(7) 证据回指**：`/tmp/tk-research/davia/.../editor.tsx:52-109`（300ms）；`/tmp/tk-research/davia/.../api/content/route.ts:135-142`（fs.outputFile 无 DB）。

---

### 决策 I-6：子页 human 块 fence + verbatim round-trip + orphan 救援（服务 A）

**(1) 决策**：生成页内人类手写散文用保留块围起，重生成器 verbatim round-trip：HTML `<!-- tk:human-start -->\n...\n<!-- tk:human-end -->`，md `<!--tk:human-->...<!--/tk:human-->`。重生成时 tk 从当前 `pages/` 副本按 fence 提取所有 human 块，只把 agent 段重生成到 `proposed/`，再把 human 块按锚定 heading 重新插入。若某 human 块的锚 heading 已不存在，块**移到** `## Orphaned human notes (review)` 段而**非丢弃** —— 永不静默删除。这是 "human-block-not-overwritten + staleness 可见" 的子页粒度落地（Davia 只给目录级拆分，fence 给段落级）。

**(2) 要动的文件**：`src/wiki/humanFence.ts`（`extractHumanBlocks` / `reinsertHumanBlocks`）；`tests/unit/wiki/humanFence.test.ts`。

**(3) 可抄代码**（无现成 clone 源 —— 这是 prompt 标记的"批内无人实现"的 NEW synthesis；tk 原创实现）：

```typescript
// src/wiki/humanFence.ts （tk 原创；批内无对应 clone 源，需实现时补 anchor-heading 细化）
const HTML_START = '<!-- tk:human-start -->', HTML_END = '<!-- tk:human-end -->';
const RE = /<!-- tk:human-start -->\n([\s\S]*?)\n<!-- tk:human-end -->/g;

export interface HumanBlock { anchor: string; body: string }  // anchor = 紧邻上方的 heading 文本

export function extractHumanBlocks(html: string): HumanBlock[] {
  const out: HumanBlock[] = [];
  let m: RegExpExecArray | null;
  while ((m = RE.exec(html))) {
    const before = html.slice(0, m.index);
    const h = [...before.matchAll(/<h[1-6][^>]*>(.*?)<\/h[1-6]>/g)].pop();
    out.push({ anchor: h ? h[1].trim() : '', body: m[1] });
  }
  return out;
}

// 重生成：把 blocks 按 anchor heading 重插 proposed 内容；锚消失 → 进 Orphaned 段（不丢）
export function reinsertHumanBlocks(regenerated: string, blocks: HumanBlock[]): string {
  let html = regenerated;
  const orphans: HumanBlock[] = [];
  for (const b of blocks) {
    const at = b.anchor
      ? html.indexOf(`>${b.anchor}<`)   // 简化：找回锚 heading
      : -1;
    if (at >= 0) {
      const insertAt = html.indexOf('\n', at) + 1;
      html = html.slice(0, insertAt) + `${HTML_START}\n${b.body}\n${HTML_END}\n` + html.slice(insertAt);
    } else {
      orphans.push(b);                  // 锚没了 → 救援，绝不删
    }
  }
  if (orphans.length) {
    html += `\n<h2>Orphaned human notes (review)</h2>\n`;
    for (const o of orphans) html += `${HTML_START}\n${o.body}\n${HTML_END}\n`;
  }
  return html;
}
```

**(4) 具体数值**：fence 标记固定字符串（HTML/md 两套）；orphan 段标题固定 `Orphaned human notes (review)`；丢弃数 = **0**（不变量）。

**(5) 有序步骤**：1. `extractHumanBlocks`；2. `reinsertHumanBlocks` + orphan 救援；3. 接入 regen 流程（生成前 extract、生成后 reinsert）；独立可测。

**(6) 测试**：含 2 human 块的页重生成后两块 body 字节相同（verbatim）；锚 heading 删除后该块出现在 Orphaned 段且未丢失；无 human 块的页 round-trip 不增 Orphaned 段。

**(7) 证据回指**：Davia proposed/assets 目录级拆分（`tools.ts:60-68`）为 dir 级先例；fence 为 tk 子页粒度新增（prompt 标记 most-underdefined，无 clone 源）。

---

### 决策 I-7：零 LLM 启发式 guided tours → committed `docs/ONBOARDING.md`（服务 A）

**(1) 决策**：guided tours 作一等只读协作 artifact，**默认零 LLM 零 token** 启发式生成，LLM 增强仅 opt-in。启发算法 = understand-anything 已验证 tour-generator：分离 concept 与 code 节点 → 对 call/import 图 Kahn 拓扑排序 → 找入口点（in-degree 0）→ 有层按架构层分组、无层按每步 3 节点批 → 末尾追加 "Key Concepts" 步。输出 `tour[] = [{order, title, description, nodeIds[], filePaths[]}]`，渲染为 `docs/ONBOARDING.md` + HTML 内分步。tk 建议把 `docs/ONBOARDING.md` commit 给团队（human-human 异步 via git，I.0）。图来自 A 的 graph store（calls/imports 边）。

**(2) 要动的文件**：`src/wiki/tour.ts`（`generateHeuristicTour` 移植到 tk graph 类型）；`src/wiki/onboarding.ts`（tour→ONBOARDING.md）；`tests/unit/wiki/tour.test.ts`。

**(3) 可抄代码**：understand-anything 完整 LLM-free 拓扑 tour（已验证）：

```typescript
// 源: /tmp/tk-research/understand-anything/understand-anything-plugin/packages/core/src/analyzer/tour-generator.ts:135-293 （verbatim 关键段）
export function generateHeuristicTour(graph: KnowledgeGraph): TourStep[] {
  const { nodes, edges, layers } = graph;
  const conceptNodes = nodes.filter((n) => n.type === "concept");
  const codeNodes = nodes.filter((n) => n.type !== "concept");
  const codeNodeIds = new Set(codeNodes.map((n) => n.id));

  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();
  for (const node of codeNodes) { inDegree.set(node.id, 0); adjacency.set(node.id, []); }
  for (const edge of edges) {
    if (!codeNodeIds.has(edge.source) || !codeNodeIds.has(edge.target)) continue;
    inDegree.set(edge.target, (inDegree.get(edge.target) ?? 0) + 1);
    adjacency.get(edge.source)!.push(edge.target);
  }
  // Kahn's algorithm: entry points = in-degree 0
  const queue: string[] = [];
  for (const [nodeId, degree] of inDegree) if (degree === 0) queue.push(nodeId);
  const topoOrder: string[] = [];
  while (queue.length > 0) {
    const current = queue.shift()!;
    topoOrder.push(current);
    for (const neighbor of adjacency.get(current) ?? []) {
      const newDegree = (inDegree.get(neighbor) ?? 1) - 1;
      inDegree.set(neighbor, newDegree);
      if (newDegree === 0) queue.push(neighbor);
    }
  }
  for (const node of codeNodes) if (!topoOrder.includes(node.id)) topoOrder.push(node.id);

  const steps: TourStep[] = [];
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  if (layers.length > 0) {
    // group by layer in topological order ...（见源 192-253）
  } else {
    // No layers: batch by 3 nodes per step
    for (let i = 0; i < topoOrder.length; i += 3) {
      const batch = topoOrder.slice(i, i + 3);
      const nodeSummaries = batch
        .map((id) => { const node = nodeMap.get(id); return node ? `${node.name} (${node.summary})` : id; })
        .join("; ");
      const stepNumber = Math.floor(i / 3) + 1;
      steps.push({ order: 0, title: `Step ${stepNumber}: Code Walkthrough`,
        description: `Exploring: ${nodeSummaries}.`, nodeIds: batch });
    }
  }
  if (conceptNodes.length > 0) {
    const conceptSummaries = conceptNodes.map((n) => `${n.name} (${n.summary})`).join("; ");
    steps.push({ order: 0, title: "Key Concepts",
      description: `Important architectural concepts: ${conceptSummaries}.`,
      nodeIds: conceptNodes.map((n) => n.id) });
  }
  for (let i = 0; i < steps.length; i++) steps[i].order = i + 1;
  return steps;
}
```

移植注记（已改写要点）：tk 的 graph 节点无 `type:"concept"` 概念层时，`conceptNodes` 为空 → "Key Concepts" 步自动省略；`layers` 缺省走 batch-3 分支。`KnowledgeGraph`/`TourStep` 需映射到 A 的 graph 类型（nodes 带 file:line span → 填 `filePaths[]`）。

**(4) 具体数值**：tour 5–15 步（tour-builder.md）；无层时每步 **3** 节点；启发路径 **0** LLM token；LLM enrich 为 opt-in（host slash-command / 订阅 CLI 付费，见 B 生成层）。

**(5) 有序步骤**：1. 映射 tk graph → `KnowledgeGraph` 适配；2. 移植 `generateHeuristicTour`；3. `onboarding.ts` tour→`docs/ONBOARDING.md` + "建议 commit" 提示；每步独立可测。

**(6) 测试**：固定小图 fixture → 断言步序确定（拓扑稳定）、无层时每步≤3 节点、有 concept 时末步为 "Key Concepts"；断言全程无网络/无 LLM 调用。

**(7) 证据回指**：`/tmp/tk-research/understand-anything/.../tour-generator.ts:135-293`；understand-anything SKILL.md（emit `docs/ONBOARDING.md`，step "Suggest the user commit it to the repo for the team"）。

---

### 决策 I-8：per-page staleness = `git diff ∩ filePaths`，suggest-not-auto（服务 两者）

**(1) 决策**：陈旧度可计算、可见、per-page，永不隐藏。每页存 `sourceCommit`；`tk wiki status`（及 HTML 面 banner）跑 `git diff --name-only <sourceCommit> HEAD` ∩ `page.filePaths`。非空 → 标 **STALE** + 变更源文件数与列表。每页 `version:int` 计数器 regen 时自增（RepoDoc DocNode.version 模式）。陈旧**永不自动触发 regen**（那会未经同意花用户订阅）—— 仅 surface 一行 `tk wiki regen <page>` 建议。冲突解析（E↔J）：staleness 信号源 = E 的 lazy mtime sweep / 可选 git-hook，非常驻 watcher；J8 per-file banner / J9 frozen-index banner 由此 lazy 检查驱动。

**(2) 要动的文件**：`src/wiki/staleness.ts`（`computeStaleness()`）；`src/wiki/cli.ts`（`tk wiki status`）；`tests/unit/wiki/staleness.test.ts`。

**(3) 可抄代码**（无单一 clone 源 —— RepoDoc `version:int` + understand-anything `gitCommitHash` 概念，tk 原创组合）：

```typescript
// src/wiki/staleness.ts （tk 原创；RepoDoc version:int + UA gitCommitHash 模式组合）
import { execFileSync } from 'node:child_process';

export interface StaleResult { page: string; stale: boolean; changed: string[] }

export function computeStaleness(projectRoot: string, page: WikiPageMeta): StaleResult {
  let changed: string[] = [];
  try {
    const out = execFileSync('git',
      ['diff', '--name-only', `${page.sourceCommit}`, 'HEAD'],
      { cwd: projectRoot, encoding: 'utf-8' });
    const touched = new Set(out.split('\n').map(s => s.trim()).filter(Boolean));
    changed = page.filePaths.filter(fp => touched.has(fp));
  } catch { /* commit 不存在 / 非 git → 视为未知，不报 STALE（fail-open）*/ }
  return { page: page.title, stale: changed.length > 0, changed };
}
// regen 时：page.version += 1; page.sourceCommit = <new HEAD>
```

**(4) 具体数值**：STALE 判据 = `filePaths ∩ changed ≠ ∅`；`version` regen +1；auto-regen = **never**（仅建议）。

**(5) 有序步骤**：1. `computeStaleness()` git diff 交集；2. regen 时 `version` bump + `sourceCommit` 更新；3. `tk wiki status` 列出 STALE 页 + `tk wiki regen` 建议；独立可测。

**(6) 测试**：构造 git fixture，改动某页 filePath 内文件 → 断言 STALE + changed 列表；改动无关文件 → not stale；`sourceCommit` 不存在 → fail-open not stale；regen 后 version+1。

**(7) 证据回指**：RepoDoc `DocNode.version:int`（`docs/codegraph/codegraph-wiki-landscape-20260618.md:33`）；understand-anything `project.gitCommitHash`。

---

### 决策 I-9：`.tk/.gitignore` 拆 team-shared vs machine-local（服务 两者）

**(1) 决策**：用生成的 `.tk/.gitignore` 按 who-owns + 是否 check-in 拆 `.tk/` 内容。**COMMIT**（团队共享、人类权威）：`wiki.json`、`wiki/pages/**`、`docs/ONBOARDING.md`。**IGNORE**（per-machine、可重建、agent 拥有）：`wiki/proposed/**`、`cache/**`、`*.tmp`。注：graph DB 按冲突解析走 **out-of-tree** `~/.token-killer/projects/<fp>/index.db`（POSIX）/ `%LOCALAPPDATA%\token-killer\...`（Windows），不在 `.tk/` 内 —— `.tk/` 只放 human 共享物 + gitignored staging。tk 首次 `tk wiki init` 写此 `.gitignore`，**绝不覆盖人类改过的**（先查 tk-sentinel 注释，复用 tk 现有 init 幂等性纪律）。

**(2) 要动的文件**：`src/wiki/init.ts`（`writeGitignore()` sentinel-guarded）；`tests/unit/wiki/init.test.ts`。

**(3) 可抄代码**（tk 原创，sentinel 复用 tk install/uninstall 幂等模式）：

```typescript
// src/wiki/init.ts （tk 原创）
import { promises as fs } from 'node:fs';
import path from 'node:path';

const SENTINEL = '# tk-wiki-managed — safe to delete this block to take ownership';
const BODY = [
  SENTINEL,
  '# IGNORE: machine-local, regenerable, agent-owned',
  'wiki/proposed/',
  'cache/',
  '*.tmp',
  '# COMMIT (NOT ignored): wiki.json, wiki/pages/**, ../docs/ONBOARDING.md',
].join('\n') + '\n';

export async function writeGitignore(projectRoot: string): Promise<void> {
  const p = path.join(projectRoot, '.tk', '.gitignore');
  try {
    const cur = await fs.readFile(p, 'utf-8');
    if (!cur.includes(SENTINEL)) return;   // 人类已接管 → 不覆盖
  } catch { /* 不存在 → 写 */ }
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, BODY, 'utf-8');
}
```

**(4) 具体数值**：COMMIT 集 = {`wiki.json`, `wiki/pages/**`, `docs/ONBOARDING.md`}；IGNORE 集 = {`wiki/proposed/**`, `cache/**`, `*.tmp`}；DB 路径 = out-of-tree（非 `.tk/`）。

**(5) 有序步骤**：1. `writeGitignore()` sentinel 守卫；2. 接入 `tk wiki init`；独立可测。

**(6) 测试**：空 repo → 写出含 sentinel 的 `.gitignore` 且忽略 `proposed/`；人类去掉 sentinel 后再 init → 文件不被覆盖；断言 `wiki/pages/` 不在 ignore 列。

**(7) 证据回指**：understand-anything（只 commit markdown guide 非 graph json）；冲突解析（I.9 列 `index.sqlite` 在 .tk/.gitignore IGNORE，确认 DB 永不 commit；C/L 一致 DB out-of-tree）。

---

### 决策 I-10：PR/review context = 只读 `tk wiki impact <ref>`，零 GitHub egress（服务 两者）

**(1) 决策**：第三种协作子形态（review/PR context）以只读命令 `tk wiki impact <ref>` 交付（默认 `ref=HEAD~1..HEAD` 或一个 branch）：对 diff 内变更文件列出 (a) 哪些 wiki 页引用它们（page.filePaths 反查）、(b) 哪些其他源文件引用它们（来自 A 的 index call-graph）、(c) 标这些页 STALE。输出为可直接粘贴进 PR 描述的 markdown 块（英文）。`--comment`（发 GitHub PR 评论）**明确不在 v1**（无 user opt-in 不做 GitHub API egress）。复用已建 index：filePaths 反查 + call-graph，egress = 0。

**(2) 要动的文件**：`src/wiki/impact.ts`（`computeImpact()`）；`src/wiki/cli.ts`（`tk wiki impact`）；`tests/unit/wiki/impact.test.ts`。

**(3) 可抄代码**（tk 原创；GitNexus 证明 `impact`/`trace` 需求，tk 用本地 index 复刻、零 egress）：

```typescript
// src/wiki/impact.ts （tk 原创；需实现时补 callGraph 反查接口 from A index）
export interface ImpactReport { changed: string[]; citedPages: string[]; referencingFiles: string[] }

export function computeImpact(
  changedFiles: string[],
  pages: WikiPageMeta[],
  callersOf: (file: string) => string[],   // from A 的 graph store（calls/imports 反向边）
): ImpactReport {
  const citedPages = pages
    .filter(p => p.filePaths.some(fp => changedFiles.includes(fp)))
    .map(p => p.title);
  const referencingFiles = [...new Set(changedFiles.flatMap(callersOf))]
    .filter(f => !changedFiles.includes(f));
  return { changed: changedFiles, citedPages, referencingFiles };
}

// renderMarkdown → 粘贴进 PR 描述（英文）；--comment OUT of v1
export function renderImpactMarkdown(r: ImpactReport): string {
  return [
    `### tk wiki impact`,
    `**Changed files:** ${r.changed.length}`,
    `**Wiki pages citing these files (review for staleness):** ${r.citedPages.join(', ') || 'none'}`,
    `**Other source files referencing them:** ${r.referencingFiles.join(', ') || 'none'}`,
  ].join('\n');
}
```

**(4) 具体数值**：默认 ref = `HEAD~1..HEAD`；GitHub API egress in v1 = **0**（无 `--comment`）；输出语言 = 英文。

**(5) 有序步骤**：1. `computeImpact()`（filePaths 反查 + call-graph 反向）；2. `renderImpactMarkdown()`；3. `tk wiki impact` CLI；每步独立可测。

**(6) 测试**：fixture 改一个被某页引用的文件 → 断言该页在 `citedPages`；断言无任何网络调用（spy）；mock `callersOf` 验证 referencingFiles 去重且排除自身。

**(7) 证据回指**：GitNexus `impact`/`trace` 工具（证明需求，见 codegraph-wiki-landscape report）；A 的 call-graph 反向边为数据源。

---

### 决策 I-11：全文件 I/O 走路径围栏 + Windows EBUSY-safe rm（服务 两者）

**(1) 决策**：所有文件支撑的写/读路径过 Davia `resolveFilePath` 的 normalize-and-confine 守卫（拒 leading-slash 绝对路径 → `path.normalize` → 断言 `resolved.startsWith(base)` 否则抛 "escape"）。叠加 tk 的 Windows 可移植规则：用 `path.join` 不字符串拼接、任何 `--import` 用 `pathToFileURL`、display leaves 才 posixify、清 temp/proposed 目录用 `rm({recursive,force,maxRetries:5,retryDelay:100})` 以扛 Windows EBUSY。PRIMARY 目标是 VS Code Copilot/Windows，这些硬化 day-one 必需。

**(2) 要动的文件**：`src/wiki/safePath.ts`（`resolveWikiPath` + `safeRm`）；全 wiki 写/删点统一走它；`tests/unit/wiki/safePath.test.ts`。

**(3) 可抄代码**：Davia `resolveFilePath` 围栏（verbatim，见 I-4 已引 `tools.ts:84-114`）+ tk EBUSY-safe rm：

```typescript
// src/wiki/safePath.ts （围栏改写自 davia tools.ts:84-114；safeRm 来自 tk windows-ebusy memory）
import path from 'node:path';
import { promises as fs } from 'node:fs';

export function resolveWikiPath(rel: string, base: string): string {
  if (rel.startsWith('/'))
    throw new Error(`Absolute paths with leading slash are not allowed: '${rel}'`);
  const abs = path.normalize(path.join(base, rel));
  if (!abs.startsWith(path.normalize(base)))
    throw new Error(`Path '${rel}' attempts to escape the destination directory`);
  return abs;
}

// Windows EBUSY-safe：bare force-rm 会在 Windows 上 EBUSY flake（子进程退出后仍持句柄）
export async function safeRm(target: string): Promise<void> {
  await fs.rm(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
```

**(4) 具体数值**：`maxRetries: 5`、`retryDelay: 100`（ms）；leading-slash 输入 → 抛错（不静默）；越界 → 抛 "escape"。

**(5) 有序步骤**：1. `resolveWikiPath`（围栏）；2. `safeRm`（EBUSY 重试）；3. 替换 I-4/I-5/I-9 所有裸 `fs.rm`/path 拼接为此二者；独立可测。

**(6) 测试**：`../escape` → 抛 escape；`/abs` → 抛 leading-slash；`a/b/c.html` → 返回 base 内绝对路径；`safeRm` 用 `{maxRetries:5,retryDelay:100}` 选项调用（spy 断言，覆盖 Windows EBUSY 回归）。

**(7) 证据回指**：`/tmp/tk-research/davia/packages/agent/src/agent/helpers/tools.ts:84-114`（resolveFilePath）；tk memory windows-ebusy / pr3-windows-ci（`rm` 重试 + `path.join` 纪律）。

---

### 本需求被否决的旧倾向（head-on overrule）

- **"v1 navigation-only，edit-window 推到 v2"（ADR 0013-0016 / 旧 design §navigation-only）被正面否决**：Anchor 2 令人类协作与 B 共线、明确**非 v2 afterthought**，故可编辑往返（proposed↔pages + human-fence + 300ms 写回）**v1 即发**。理由：navigation-only 只服务 B，丢掉 A 的一半。
- **"shared understanding = 只读 wiki" 旧框定被否决**：只读仅为默认层；可编辑沉淀（控制文件 + human-fence 块往返）是一等提交层。理由：人类写不回的知识在 session 间蒸发。
- **任何自有 server/telemetry 式协作后端倾向被否决**（telemetry-server-aws 是 metrics 不是 collab）：team-share = git commit `.tk/` artifacts，无 tk 自有 server/权限层。理由：违反 no-server/no-egress 强约束、且重复 git 已有权限模型。
- **DeepWiki 企业 80 页 cap 向下否决为 tk team 层 60**。理由：tk 面向单仓 project-local，非企业 wiki farm；60 令订阅付费的生成成本有界。

### 留给用户的开放项（与全局 stillOpen 对齐）

1. **编辑面**（I stillOpen #1）：coherent v1 默认 = VS Code 原生文件编辑 + watcher 写回（HTML viewer 保持只读）。确认 files-only，还是授权更重的 Tiptap 式 web 编辑器？
2. **控制文件格式**：coherent 选 JSONC（tk 已解析、可注释、VS Code 内可 schema-complete）。确认优于 YAML？
3. **`tk wiki impact --comment`**（发 GitHub PR 评论）v1 因 no-egress 排除。opt-in `--comment`（显式逐次、用用户 gh auth）是否 v1.1 可接受，还是永久排除？
4. **team 层 gating**：60 页 `"tier":"team"` 目前是 wiki.json 内自声明 flag（无 server 无法 gate）。维持 honor-system 旋钮即可？

### 与其它需求的耦合（coherence）

`file:line on every node`（A2/J1）是 human（H）、agent（F）、provenance（I.3）、trust（J）共用的单一信任原语；`provenance` 列（B1/J2）一列三用（检索过滤 + 边诚实 + 陈旧分类语境）；human content 走文件不进 DB（C 的 DB-out-of-tree）；交付收敛到 F 扩展（同时是 H viewer host + I 往返面，经 L 渠道构建）；staleness 由 E 的 lazy 检查驱动（非常驻 watcher，守住 Windows no-daemon 链）。

---

## 需求 J — Correctness / trust（永不给出自信的错误答案）

本需求的验收红线：对人（Job A）和对 agent（Job B）都**永不输出一个看似可信、实则错误的答案**。机制单一且结构性——把每一条事实绑定到一个**可打开的物理坐标 file:line**，并给这条事实打上信任等级标签。错误的 file:line 是自证伪的（打开就露馅），错误的散文段落不是。这正是我们拒绝 DeepWiki RAG 形态的原因。

所有层都读同一个 node:sqlite(+FTS5) store（上游 A/C 已锁定），人（HTML）面与 agent（MCP/CLI）面看到**完全相同**的 nodes(file_path,start_line) 行、相同的 provenance/confidence/staleness 标签（J12，呼应冲突解析"一个后端两份食谱两个前端"）。下游 F（MCP 工具）渲染 J6/J7 文案、E（lazy-on-read）驱动 J8/J9 横幅（非常驻 watcher——见 E/F/J/M 冲突解析）、B 的 provenance 字段粒度契约提供 J2 的列。

---

### J1 — 硬锚点：每个节点/答案携带不可空的 file:line:col　【服务 两者】

**(1) 决策**：每个 node 行强制携带 `file_path + start_line + end_line + start_column + end_column`（行 1-indexed、列 0-indexed），无锚点不发事实；`idx_nodes_file_line` 让 file:line 查找 O(log n)。node id = `hash(filePath + '::' + qualifiedName)`。

**(2) 要动的文件**：
- `src/codegraph/db/schema.sql`（新建，移植 codegraph 的 nodes 表 + 索引）
- `src/codegraph/types.ts`（新建，Node 接口）

**(3) 可抄代码**

Node 接口字段全部非可空（源: /tmp/tk-research/codegraph/src/types.ts:11-40，verbatim）：

```ts
export interface Node {
  // ...
  qualifiedName: string;
  filePath: string;
  startLine: number;
  endLine: number;
  startColumn: number;
  endColumn: number;
}
```

nodes 表 DDL（源: /tmp/tk-research/codegraph/src/db/schema.sql:20-43，verbatim，截 file:line 关键列）：

```sql
CREATE TABLE IF NOT EXISTS nodes (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    name TEXT NOT NULL,
    qualified_name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    language TEXT NOT NULL,
    start_line INTEGER NOT NULL,
    end_line INTEGER NOT NULL,
    start_column INTEGER NOT NULL,
    end_column INTEGER NOT NULL,
    docstring TEXT,
    signature TEXT,
    visibility TEXT,
    is_exported INTEGER DEFAULT 0,
    -- ...
    return_type TEXT,
    updated_at INTEGER NOT NULL
);
```

file:line 复合索引（源: /tmp/tk-research/codegraph/src/db/schema.sql:94，verbatim）：

```sql
CREATE INDEX IF NOT EXISTS idx_nodes_file_line ON nodes(file_path, start_line);
```

**(4) 具体数值**：行号 1-indexed、列号 0-indexed；5 个坐标列全部 `NOT NULL`；id 计算用 `filePath + '::' + qualifiedName` 拼接。

**(5) 有序步骤**：
1. 落 `schema.sql` 的 nodes 表 + `idx_nodes_file_line`，跑一次 `CREATE TABLE` 验证 FTS5 与 NOT NULL 约束生效。
2. 落 `types.ts` 的 Node 接口（字段非可空）。
3. 在 extractor 写入处对每个 Node 断言 5 个坐标存在再 insert。

**(6) 测试**：单测 fixture——插入一个缺 `start_line` 的 Node，断言 `INSERT` 因 `NOT NULL` 失败；正常 Node 插入后 `SELECT ... WHERE file_path=? AND start_line=?` 命中且 `EXPLAIN QUERY PLAN` 显示走 `idx_nodes_file_line`。

**(7) 证据回指**：/tmp/tk-research/codegraph/src/types.ts:11-40；/tmp/tk-research/codegraph/src/db/schema.sql:20-94。

---

### J2 — 边级 provenance 闭枚举　【服务 两者】

**(1) 决策**：每条边携带 `provenance ∈ {'tree-sitter','scip','heuristic'}`，存为 `provenance TEXT DEFAULT NULL`（NULL = 结构精确/默认），建 `idx_edges_provenance` 让 agent 面按来源过滤/分级。

**(2) 要动的文件**：`src/codegraph/db/schema.sql`（edges 表 + 索引）、`src/codegraph/types.ts`（Edge.provenance）。

**(3) 可抄代码**

Edge.provenance（源: /tmp/tk-research/codegraph/src/types.ts:203-204，verbatim）：

```ts
  /** How this edge was created */
  provenance?: 'tree-sitter' | 'scip' | 'heuristic';
```

edges 表 DDL（源: /tmp/tk-research/codegraph/src/db/schema.sql:45-56，verbatim）：

```sql
CREATE TABLE IF NOT EXISTS edges (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL,
    target TEXT NOT NULL,
    kind TEXT NOT NULL,
    metadata TEXT, -- JSON object
    line INTEGER,
    col INTEGER,
    provenance TEXT DEFAULT NULL,
    FOREIGN KEY (source) REFERENCES nodes(id) ON DELETE CASCADE,
    FOREIGN KEY (target) REFERENCES nodes(id) ON DELETE CASCADE
);
```

provenance 索引（源: /tmp/tk-research/codegraph/src/db/schema.sql:145，verbatim）：

```sql
CREATE INDEX IF NOT EXISTS idx_edges_provenance ON edges(provenance);
```

> 与 B 的 per-field provenance 契约衔接：B 的字段级 provenance 是 `static|llm|template`（节点/摘要表上），而本边级 provenance 是 `tree-sitter|scip|heuristic`（边表上）——两者**不同列、不同语义**，retrieval 排序时 B 的 `WHERE provenance='static'` 过滤节点/摘要，J 的边 provenance 供 agent 给一条边降权。需实现时在 schema 注释里标清两个 provenance 列各属哪张表，避免混淆。

**(4) 具体数值**：枚举 3 值；默认 `NULL`；1 个索引 `idx_edges_provenance`。

**(5) 有序步骤**：
1. 落 edges 表 + provenance 列 + 索引。
2. extractor 写 tree-sitter 边时不设 provenance（NULL）；resolution synthesizer 写边时设 `'heuristic'`（见 J3）。

**(6) 测试**：fixture 插入 1 条精确边（provenance NULL）+ 1 条 heuristic 边；`SELECT count(*) FROM edges WHERE provenance='heuristic'` = 1；`EXPLAIN QUERY PLAN` 验证按 provenance 过滤走 `idx_edges_provenance`。

**(7) 证据回指**：/tmp/tk-research/codegraph/src/types.ts:203-204；/tmp/tk-research/codegraph/src/db/schema.sql:45-56,145。

---

### J3 — heuristic 边的 synthesizedBy 子标签 + registeredAt　【服务 两者】

**(1) 决策**：每条 heuristic 边在 `metadata` JSON 里带 `synthesizedBy`（命名具体推理规则）+ `via` + `field` + `registeredAt`（回调被接线的 file:line）。采用 codegraph 的闭词表。

**校正（已核对 clone）**：clone 中实际词表为 **20 个**规则名（非 dossier 写的 18 个）：`callback, closure-collection, cpp-override, event-emitter, expo-cross-platform, fabric-native-impl, flutter-build, gin-middleware-chain, go-grpc-stub-impl, go-implements, interface-impl, jsx-render, kotlin-expect-actual, mybatis-java-xml, pascal-form, react-render, rn-cross-platform, rn-event-channel, sveltekit-load, vue-handler`（dossier 缺 `pascal-form`/`sveltekit-load`，且写有 `vue-handler` 不在其列表——以 clone 为准用 20 名）。v1 只需对已实现语言子集的规则填值，其余保留枚举位。

**(2) 要动的文件**：`src/codegraph/resolution/callback-synthesizer.ts`（移植）、`src/codegraph/types.ts`（metadata 形状注释）。

**(3) 可抄代码**

每条 synthesized 边都被 heuristic 标记 + 子标签 + 锚点（源: /tmp/tk-research/codegraph/src/resolution/callback-synthesizer.ts:179-189，verbatim）：

```ts
        edges.push({
          source: disp.node.id, target: fn.id, kind: 'calls', line: disp.node.startLine,
          provenance: 'heuristic',
          metadata: {
            synthesizedBy: 'callback', via: reg.node.name, field: reg.field,
            // Where the callback was wired up (`scene.onUpdate(this.triggerRender)`).
            // This is the #1 thing an agent reads/greps to explain the flow — surface
            // it so node/trace/context can show it without a callers() + Read round-trip.
            registeredAt: `${caller.filePath}:${e.line}`,
          },
        });
```

**(4) 具体数值**：20 个 `synthesizedBy` 规则名；`registeredAt` 格式 `${filePath}:${line}`；metadata 存 edges.metadata TEXT（JSON）。

**(5) 有序步骤**：
1. 移植 callback-synthesizer，确保每条产出边都带 `provenance:'heuristic'` + `synthesizedBy` + `registeredAt`。
2. 在 types.ts 注释固化 metadata JSON 形状 `{ synthesizedBy, via, field, registeredAt }`。

**(6) 测试**：fixture 喂一个 `scene.onUpdate(this.triggerRender)` 接线，断言生成的边 `provenance==='heuristic'`、`metadata.synthesizedBy==='callback'`、`metadata.registeredAt` 匹配 `/.+:\d+/`。

**(7) 证据回指**：/tmp/tk-research/codegraph/src/resolution/callback-synthesizer.ts:179-189；词表 grep 自 /tmp/tk-research/codegraph/src/。

---

### J4 — 已解析引用的 resolvedBy + 0-1 置信度　【服务 B】

**(1) 决策**：每个 ResolvedRef 记 `resolvedBy ∈ {exact-match,import,qualified-name,framework,fuzzy,instance-method,file-path,function-ref}` + `confidence:number(0-1)`。`exact-match/import/qualified-name` = 高；`fuzzy/framework` = 降级。低于阈值的边**保留**但标记，绝不静默升为 exact。

**(2) 要动的文件**：`src/codegraph/resolution/types.ts`（ResolvedRef 接口）。

**(3) 可抄代码**（源: /tmp/tk-research/codegraph/src/resolution/types.ts:34-43，verbatim）：

```ts
export interface ResolvedRef {
  /** Original unresolved reference */
  original: UnresolvedRef;
  /** ID of the target node */
  targetNodeId: string;
  /** Confidence score (0-1) */
  confidence: number;
  /** How it was resolved */
  resolvedBy: 'exact-match' | 'import' | 'qualified-name' | 'framework' | 'fuzzy' | 'instance-method' | 'file-path' | 'function-ref';
}
```

stats.byMethod 按方法计数（源: /tmp/tk-research/codegraph/src/resolution/types.ts:54-61，verbatim）：

```ts
  stats: {
    total: number;
    resolved: number;
    unresolved: number;
    byMethod: Record<string, number>;
  };
```

**(4) 具体数值**：8 个 `resolvedBy` 方法；`confidence` 取值 0–1；高置信集 = {exact-match, import, qualified-name}。

**(5) 有序步骤**：
1. 落 ResolvedRef 接口。
2. resolution 各 resolver 在产出时填 `resolvedBy` + `confidence`。
3. 汇总 `stats.byMethod`，供 K 测量 arm 读取方法分布。

**(6) 测试**：fixture 解析一个 import 引用断言 `resolvedBy==='import' && confidence>=0.8`；一个名字猜测断言 `resolvedBy==='fuzzy' && confidence<0.8`；`stats.byMethod.import===1`。

**(7) 证据回指**：/tmp/tk-research/codegraph/src/resolution/types.ts:34-61。

---

### J5 — retrieval 二元 confidence 分级（high/low）　【服务 两者】

**(1) 决策**：检索答案带 `confidence ∈ {'high','low'}`，查询时计算。LOW 触发条件：查询有 ≥2 个长度≥3 的不同词 且 结果>0 且 无任一结果被佐证（既非用户明确点名的 distinctive identifier，也非在 name+dir-segments 上命中 ≥2 个不同查询词）。单关键词/符号名查询豁免。这是 tk 既有 quality-gate 应用到图检索。

**(2) 要动的文件**：`src/codegraph/context/index.ts`（grading 逻辑，移植）。

**(3) 可抄代码**（源: /tmp/tk-research/codegraph/src/context/index.ts:912-931，verbatim）：

```ts
    let confidence: 'high' | 'low' = 'high';
    const confTerms = extractSearchTerms(query, { stems: false }).filter(t => t.length >= 3);
    if (confTerms.length >= 2 && filteredResults.length > 0) {
      const distinctive = new Set(
        symbolsFromQuery.filter(isDistinctiveIdentifier).map(s => s.toLowerCase())
      );
      const anyStrong = filteredResults.some(r => {
        if (distinctive.has(r.node.name.toLowerCase())) return true;
        const nameLower = r.node.name.toLowerCase();
        const dirSegs = path.dirname(r.node.filePath).toLowerCase().split('/');
        let hits = 0;
        for (const t of confTerms) {
          if (nameLower.includes(t) || dirSegs.includes(t)) {
            if (++hits >= 2) return true;
          }
        }
        return false;
      });
      if (!anyStrong) confidence = 'low';
    }
```

**(4) 具体数值**：触发词长 ≥3；触发词数 ≥2；单词命中累计 ≥2 即算 strong；单关键词/符号查询豁免（confTerms<2 时不触发）。

**(5) 有序步骤**：
1. 移植 grading 函数 + `extractSearchTerms`/`isDistinctiveIdentifier` 依赖。
2. 在 Subgraph 结果上挂 `confidence?: 'high'|'low'`。

**(6) 测试**：A-B harness 字段 + 单测——查询 `"how does the user login flow work"` 只命中 common-word 结果断言 `confidence==='low'`；查询 `"AuthService"`（单符号）断言 `confidence==='high'`（豁免不触发）。

**(7) 证据回指**：/tmp/tk-research/codegraph/src/context/index.ts:905-931。

> **stillOpen（回指 K Track-1）**：≥2-词-len≥3 + 佐证阈值是 codegraph 在自己语料上调的；是否在 tk 典型查询上过触发/欠触发，需 Track-1 测量后才锁定。

---

### J6 — LOW 时的诚实交还 footer　【服务 两者】

**(1) 决策**：LOW 置信时追加 honest-handoff footer（sentinel `LOW_CONFIDENCE_MARKER`，放在无依赖叶子模块 `markers.ts` 以避开冷启动路径）。footer 承认不确定、路由到精确工具（explore 用精确符号名 / search 单符号 / files 浏览最近的 ≤4 个目录），结尾 `Do not assume the list above is comprehensive.`

**(2) 要动的文件**：`src/codegraph/context/markers.ts`（sentinel 常量）、`src/codegraph/context/index.ts`（buildLowConfidenceNote）。

**(3) 可抄代码**

sentinel（源: /tmp/tk-research/codegraph/src/context/markers.ts:19，verbatim）：

```ts
export const LOW_CONFIDENCE_MARKER = '### ⚠️ Low-confidence match';
```

handoff footer（源: /tmp/tk-research/codegraph/src/context/index.ts:285-308，verbatim。**已改写**：F 决策的工具名是 `tk_explore/tk_search/tk_files`，替换 `codegraph_*` 前缀）：

```ts
  private buildLowConfidenceNote(entryPoints: Node[]): string {
    const dirs: string[] = [];
    const seen = new Set<string>();
    for (const n of entryPoints) {
      const slash = n.filePath.lastIndexOf('/');
      const dir = slash > 0 ? n.filePath.slice(0, slash) : n.filePath;
      if (!seen.has(dir)) { seen.add(dir); dirs.push(dir); }
      if (dirs.length >= 4) break;
    }
    const dirLine = dirs.length
      ? `\n- \`tk_files\` a likely area: ${dirs.map(d => `\`${d}\``).join(', ')}`   // 已改写: codegraph_files → tk_files
      : '';
    return `\n\n${LOW_CONFIDENCE_MARKER}\n\n`
      + 'This query matched mostly on common words, so the entry points above may '
      + 'be off-target — treat them as a starting point, not a complete answer. '
      + 'For a reliable result:\n'
      + '- `tk_explore` with the **exact symbol names** you are after '             // 已改写
      + '(class / function / method names), or\n'
      + '- `tk_search <name>` for one specific symbol'                              // 已改写
      + dirLine
      + '\n\nDo not assume the list above is comprehensive.';
  }
```

**(4) 具体数值**：交还目录上限 **4**（`dirs.length >= 4` break）；sentinel 文本固定 `### ⚠️ Low-confidence match`。

**(5) 有序步骤**：
1. 落 `markers.ts`（叶子、零依赖），MCP 层从此导入 sentinel，确认不引入冷启动重模块。
2. 移植 `buildLowConfidenceNote`，把工具名替换为 F 锁定的 `tk_explore/tk_search/tk_files`。

**(6) 测试**：单测——LOW 结果的输出包含 `LOW_CONFIDENCE_MARKER`、含 `Do not assume the list above is comprehensive.`、目录数 ≤4；HIGH 结果不含 sentinel。

**(7) 证据回指**：/tmp/tk-research/codegraph/src/context/markers.ts:19；/tmp/tk-research/codegraph/src/context/index.ts:285-308。

---

### J7 — synthesized 边内联标注（绝不裸箭头）　【服务 两者】

**(1) 决策**：`provenance==='heuristic'` 的 `calls` 边渲染为 `A →[callback via \`onUpdate\` @App.tsx:3148] B`，按 `synthesizedBy` 类型给人可读标签 + `registeredAt` file:line。call-paths 段与 trace/node 工具用**同一套标签词表**。

**(2) 要动的文件**：`src/codegraph/context/index.ts`（call-paths 渲染）、`src/codegraph/mcp/tools.ts`（trace/node 渲染）共用 `synthEdgeNote`。

**(3) 可抄代码**

`synthEdgeNote` 在 dossier 中给的是形状描述，clone 中确认了上游数据（J3 的 metadata），但该具体函数我未在 clone 单一位置定位到 verbatim 实现——**需实现时补**：实现一个纯函数 `synthEdgeNote(edge): {label,compact,registeredAt} | null`，输入读 `edge.provenance` 与 `edge.metadata.synthesizedBy/registeredAt`，per-kind 映射标签。gap = 标签映射表需对 20 个 synthesizedBy 各定一行人读文案（v1 先覆盖已实现语言子集，其余回退到通用 `dynamic: ${synthesizedBy} via \`${via}\` @${registeredAt}`）。

可直接复用的数据来源已 verbatim 确认（源: /tmp/tk-research/codegraph/src/resolution/callback-synthesizer.ts:179-189，见 J3）——`metadata.synthesizedBy / via / registeredAt` 字段就是 `synthEdgeNote` 的输入。

**(4) 具体数值**：标签词表 20 项；compact 形如 `dynamic: callback via \`onUpdate\` @App.tsx:3148`；非 heuristic 边返回 `null`（不标注）。

**(5) 有序步骤**：
1. 实现 `synthEdgeNote`（纯函数，输入 Edge），non-heuristic 返回 null。
2. call-paths 段与 trace/node 工具都调它，确保**同一词表**（不要两处各写一份）。

**(6) 测试**：单测——一条 `provenance:'heuristic', synthesizedBy:'callback', registeredAt:'App.tsx:3148'` 的边渲染含 `via \`onUpdate\`` 与 `@App.tsx:3148`；一条精确边（provenance NULL）`synthEdgeNote` 返回 null（渲染为普通箭头）。

**(7) 证据回指**：/tmp/tk-research/codegraph/src/resolution/callback-synthesizer.ts:179-189（数据源已核）；渲染函数 dossier 引 context/index.ts:383-391 + mcp/tools.ts:1487-1538（具体实现需实现时补）。

---

### J8 — per-file 陈旧横幅 + 项目级 footer　【服务 两者】

**(1) 决策**：`files` 表按 `content_hash + modified_at + indexed_at` 跟踪；引用到 pending 文件时在响应**顶部**发 ⚠️ banner（`Read THESE directly, the rest is fresh`），非引用的 pending 文件进紧凑 footer（**MAX=5** + `…and N more`）。陈旧信号来源 = E 的 lazy mtime-sweep（非常驻 watcher——见 E/F/J/M 冲突解析；J8 的"debounced watcher"=E11 的 opt-in watcher，默认关）。

**(2) 要动的文件**：`src/codegraph/db/schema.sql`（files 表）、`src/codegraph/mcp/tools.ts`（formatStaleBanner/formatStaleFooter）。

**(3) 可抄代码**

files 表（源: /tmp/tk-research/codegraph/src/db/schema.sql:59-68，verbatim）：

```sql
CREATE TABLE IF NOT EXISTS files (
    path TEXT PRIMARY KEY,
    content_hash TEXT NOT NULL,
    language TEXT NOT NULL,
    size INTEGER NOT NULL,
    modified_at INTEGER NOT NULL,
    indexed_at INTEGER NOT NULL,
    node_count INTEGER DEFAULT 0,
    errors TEXT -- JSON array
);
```

per-file banner（源: /tmp/tk-research/codegraph/src/mcp/tools.ts:314-328，verbatim）：

```ts
export function formatStaleBanner(stale: PendingFile[]): string {
  const now = Date.now();
  const lines = stale.map((p) => {
    const ageMs = Math.max(0, now - p.lastSeenMs);
    const label = p.indexing ? 'indexing in progress' : 'pending sync';
    return `  - ${p.path} (edited ${ageMs}ms ago, ${label})`;
  });
  return (
    '⚠️ Some files referenced below were edited since the last index sync — ' +
    'their codegraph entries may be stale:\n' +
    lines.join('\n') +
    '\nFor accurate content of those specific files, Read them directly. ' +
    'The rest of this response is fresh.'
  );
}
```

项目级 footer，MAX=5（源: /tmp/tk-research/codegraph/src/mcp/tools.ts:335-349，verbatim）：

```ts
export function formatStaleFooter(stale: PendingFile[]): string {
  const MAX = 5;
  const now = Date.now();
  const shown = stale.slice(0, MAX);
  const lines = shown.map((p) => {
    const ageMs = Math.max(0, now - p.lastSeenMs);
    return `  - ${p.path} (edited ${ageMs}ms ago)`;
  });
  const more = stale.length > MAX ? `\n  - …and ${stale.length - MAX} more` : '';
  return (
    `(Note: ${stale.length} file(s) elsewhere in this project are pending index ` +
    `sync but were not referenced above:\n${lines.join('\n')}${more})`
  );
}
```

**(4) 具体数值**：footer MAX=**5**；`files` 三列 `content_hash/modified_at/indexed_at` 全 NOT NULL；banner 置于响应顶部。

**(5) 有序步骤**：
1. 落 files 表（依赖 J1 nodes 已落）。
2. 移植 `formatStaleBanner`/`formatStaleFooter`，标签文案中 `codegraph` 渲染时按 tk 品牌可改（非阻塞）。
3. 接 E 的 lazy mtime-sweep 产 `PendingFile[]`（非常驻 watcher）。

**(6) 测试**：单测——3 个 pending 文件喂 banner 断言含 `Read them directly. The rest of this response is fresh.`；7 个 pending 喂 footer 断言显示 5 行 + `…and 2 more`。

**(7) 证据回指**：/tmp/tk-research/codegraph/src/db/schema.sql:59-68；/tmp/tk-research/codegraph/src/mcp/tools.ts:314-349。

---

### J9 — 整索引冻结横幅（独立于 per-file）　【服务 两者】

**(1) 决策**：当 live watching 永久停止（watcher 死亡、`getPendingFiles()` 空、per-file 无法触发），发独立横幅承认整索引冻结，开头给 agent-actionable `Read files directly`，附 reason（reason 已含 operator 补救 `codegraph sync` / git hooks）。

**(2) 要动的文件**：`src/codegraph/mcp/tools.ts`（formatDegradedBanner）。

**(3) 可抄代码**（源: /tmp/tk-research/codegraph/src/mcp/tools.ts:360-367，verbatim）：

```ts
export function formatDegradedBanner(reason: string | null): string {
  return (
    '⚠️ CodeGraph auto-sync is DISABLED — live file watching stopped, so the index is ' +
    'frozen and any file edited since then is stale here. Read files directly to confirm ' +
    'current content before relying on it.' +
    (reason ? `\n  Reason: ${reason}` : '')
  );
}
```

> 与 E/F/J/M 冲突解析衔接：v1 默认 lazy-on-read、无常驻 watcher，所以"watcher 死亡"路径只在 opt-in watcher 被启用且崩溃时触发；默认路径的"冻结"等价物是 J10 的 catch-up gate 失败（best-effort 服务）。

**(4) 具体数值**：横幅文案固定；reason 可为 `null`（则不追加 Reason 行）。

**(5) 有序步骤**：
1. 移植 `formatDegradedBanner`。
2. 在 watcher 生命周期终止处调用，传死亡 reason。

**(6) 测试**：单测——`formatDegradedBanner('watcher crashed')` 含 `auto-sync is DISABLED` + `Read files directly` + `Reason: watcher crashed`；`formatDegradedBanner(null)` 不含 `Reason:`。

**(7) 证据回指**：/tmp/tk-research/codegraph/src/mcp/tools.ts:354-367。

---

### J10 — 首次服务前的 catch-up 对账闸（fail-open）　【服务 B】

**(1) 决策**：引擎在 `open()` 后注册一个 post-open 文件系统对账 promise（catchUpSync），`execute()` 在第一次 tool call 时 await 它一次（后续调用零成本）。捕获"无 server 运行期间被删/改"的文件——watcher 喂的 per-file banner 覆盖不到的窗口。handler **吞掉** reconcile 拒绝（log 后 best-effort 服务可能陈旧的数据），sync 失败永不冒成 tool error。

**(2) 要动的文件**：`src/codegraph/mcp/tools.ts`（catchUpGate 字段 + setCatchUpGate + execute await）。

**(3) 可抄代码**

catchUpGate 字段 + 注释（源: /tmp/tk-research/codegraph/src/mcp/tools.ts:677-684，verbatim）：

```ts
  // Gate that the MCP engine pokes after `cg.open()` so the first tool call
  // blocks on the post-open filesystem reconcile (catch-up sync). Without
  // this, a tool call that races past `catchUpSync()` serves rows for files
  // that were deleted (or edited) while no MCP server was running — and the
  // per-file staleness banner can't help, because `getPendingFiles()` is
  // populated by the watcher, not by catch-up. Cleared on first await so
  // subsequent calls don't pay any cost.
  private catchUpGate: Promise<void> | null = null;
```

setCatchUpGate（源: /tmp/tk-research/codegraph/src/mcp/tools.ts:696-704，verbatim）：

```ts
  /**
   * Engine-only: register the catch-up sync promise so the next `execute()`
   * call awaits it before serving. The handler swallows rejections (the
   * engine logs them) so a sync failure never propagates as a tool error;
   * we still want to serve a best-effort result over the same potentially-
   * stale data, which is what would have happened without the gate.
   */
  setCatchUpGate(p: Promise<void> | null): void {
    this.catchUpGate = p;
  }
```

`execute()` 中 await 一次后清除——**需实现时补**：在 execute 开头插入
```ts
if (this.catchUpGate) { try { await this.catchUpGate; } catch (e) { /* logged by engine */ } finally { this.catchUpGate = null; } }
```
（dossier 描述了"awaits once then clears + swallows"语义，clone 中字段与 setter 已 verbatim 确认；具体 await 插入点按上述实现。）

**(4) 具体数值**：await **1** 次（首次 execute）；后续调用 0 成本；rejection **吞掉**（不冒错）。

**(5) 有序步骤**：
1. 加 `catchUpGate` 字段 + `setCatchUpGate`。
2. 引擎 `open()` 后 `setCatchUpGate(catchUpSync())`。
3. execute 开头 try/await/finally-clear。

**(6) 测试**：单测——注入一个 reject 的 catchUpGate，断言 `execute()` 不抛、返回 best-effort 结果、`catchUpGate` 被置 null；第二次 execute 不再 await。

**(7) 证据回指**：/tmp/tk-research/codegraph/src/mcp/tools.ts:676-704。

---

### J11 — derive→validate→fallback：存在性闸验证锚点　【服务 两者】

**(1) 决策**：跨写/读边界的任何锚点，只在路径通过存在/可读检查（`fileExists` / `readFile→null`）后才发出；resolution 在建边前验证目标节点存在。绝不发出捏造路径。`ResolutionContext` 暴露 `fileExists(path)` 与 `readFile(path):string|null` 作为验证原语——这是 tk presence-gate 纪律（仅当真实二进制存在才拦截）在图层的推广。

**(2) 要动的文件**：`src/codegraph/resolution/types.ts`（ResolutionContext 原语）；参照 repodoc 的 guard 模式。

**(3) 可抄代码**

ResolutionContext 验证原语（源: /tmp/tk-research/codegraph/src/resolution/types.ts:74-77，verbatim）：

```ts
  /** Check if a file exists */
  fileExists(filePath: string): boolean;
  /** Read file content */
  readFile(filePath: string): string | null;
```

repodoc 的 derive+validate+fallback 范式（源: /tmp/tk-research/repodoc/repodoc/src/tools/file_tools.py:9-19，verbatim。**校正**：clone 中类名是 `FileReaderTool`、tool 名 `file_reader`，非 dossier 写的 `ReadFileTool`）：

```python
    async def execute(self, file_path: str, **kwargs) -> ToolResult:
        try:
            if not os.path.exists(file_path):
                return ToolResult(success=False, error=f"File not found: {file_path}")

            with open(file_path, "r", encoding="utf-8") as f:
                content = f.read()

            return ToolResult(success=True, output=content)
        except Exception as e:
            return ToolResult(success=False, error=str(e))
```

**(4) 具体数值**：`readFile` 缺失返回 `null`（= 不发锚点）；`fileExists` 返回 boolean；resolution 建边前必过 node-exists 校验。

**(5) 有序步骤**：
1. ResolutionContext 实现 `fileExists`/`readFile`（readFile 缺失 → null，不抛）。
2. resolution 在每次建边前调 `getNodesByName/...` 确认目标存在，否则不建边、留 unresolved_refs。
3. 任何要发 file:line 的 surface（HTML/MCP）发出前过 `fileExists`。

**(6) 测试**：单测——`readFile('/nonexistent')` 返回 null 且不抛；resolution 对一个无目标节点的引用断言**不**产生边而是写 `unresolved_refs`；surface 对一个不存在路径断言**不**发锚点。

**(7) 证据回指**：/tmp/tk-research/codegraph/src/resolution/types.ts:74-77；/tmp/tk-research/repodoc/repodoc/src/tools/file_tools.py:9-19。

---

### J12 — 人面与 agent 面指向同一证据库　【服务 两者】

**(1) 决策**：HTML 人面（tk `src/report/html.ts`）与 MCP/CLI agent 面读**同一个** node:sqlite(+FTS5) store；两面每条事实都解析到同一 `nodes(file_path,start_line)` 行、显示同一 provenance/confidence/staleness。人与 agent 之间**没有**单独的 LLM 生成 wiki 当真相——wiki（若有）由 HOST agent 生成且本身回锚到 file:line（呼应 B：narrative 是 generation-tier，retrieval 走 static-only）。

**(2) 要动的文件**：`src/codegraph/db/schema.sql`（project_metadata + nodes_fts，单一 store 的版本/freshness 元数据）；人面 `src/report/html.ts`、agent 面 `src/codegraph/mcp/*` 均查此 store。

**(3) 可抄代码**

nodes_fts FTS5（源: /tmp/tk-research/codegraph/src/db/schema.sql:98-105，verbatim）：

```sql
CREATE VIRTUAL TABLE IF NOT EXISTS nodes_fts USING fts5(
    id,
    name,
    qualified_name,
    docstring,
    signature,
    content='nodes',
    content_rowid='rowid'
);
```

project_metadata（两面共读以报告同一 freshness，源: /tmp/tk-research/codegraph/src/db/schema.sql:148-152，verbatim）：

```sql
CREATE TABLE IF NOT EXISTS project_metadata (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL
);
```

> FTS5 可用性守护（接 A/C/L 冲突解析）：vendored-Node bundle 的 SQLite 已知带 FTS5；仅 npm-shim-on-user-Node 路径需 C7 的 `LIKE`-scan 回退。需实现时在打开 store 时探测 `CREATE VIRTUAL TABLE ... fts5`，失败则降级到 `nodes(lower(name))` 的 LIKE 扫描，两面一致降级。

**(4) 具体数值**：单一 store 5 张核心表（nodes, edges, files, unresolved_refs, project_metadata）+ 1 个 FTS5 虚表；两面查询同 DDL。

**(5) 有序步骤**：
1. 落 nodes_fts + 同步触发器 + project_metadata（依赖 J1 nodes）。
2. 人面 html.ts 与 agent 面 mcp 都从同一 db 路径读（out-of-tree，见 C/L 冲突解析）。
3. 两面读 project_metadata 的 index version/provenance 报告同一 freshness。

**(6) 测试**：集成测试——同一查询经 HTML 渲染与 MCP 工具，断言两者引用的 `(file_path, start_line)` 行一致、provenance/confidence 标签一致。

**(7) 证据回指**：/tmp/tk-research/codegraph/src/db/schema.sql:98-105,148-152。

---

### J13 — 召回保守但框定诚实（keep-but-tag，绝不静默丢）　【服务 两者】

**(1) 决策**：低置信/fuzzy/heuristic 结果**保留在答案中**（召回对 B 重要），但**打标 + 降框**。绝不把低置信检索自动扩展成大块看似精确的 context；LOW 等级把框定上限压到"starting point"。LOW 时**渲染入口点但追加 J6 footer 且不加"this covers the surface"总结框定**；heuristic 边渲染但 J7 内联标注。floor 决策只影响框定，永不静默丢。

**(2) 要动的文件**：`src/codegraph/context/index.ts`（LOW 分支的框定抑制——复用 J5 的 confidence + J6 的 note）。

**(3) 可抄代码**

J5/J6 的代码已是 J13 的执行体（LOW → `buildLowConfidenceNote` 追加而非省略结果）。证据 verbatim 注释（源: /tmp/tk-research/codegraph/src/context/index.ts:280-285，verbatim）：

```ts
   * mostly common words). Instead of the usual "this covers the surface" framing
   * — which, when wrong, sends the agent off to Read/Grep — it admits the
   * uncertainty and routes the agent to the precise tools (explore with real
   * symbol names, search, or files to browse the closest areas we *did* surface).
```

**(4) 具体数值**：LOW 时丢弃结果数 = **0**（只追加 footer）；heuristic 边渲染数 = 全部（标注，不抑制）。

**(5) 有序步骤**：
1. 在 LOW 分支：渲染 `filteredResults` 全量 + 追加 `buildLowConfidenceNote`，**跳过**"covers the surface"总结段。
2. heuristic 边走 `synthEdgeNote` 标注而非过滤。

**(6) 测试**：A-B harness——LOW 查询断言结果条数 == HIGH 同查询条数（未丢）且输出含 sentinel 且**不**含 "covers the surface" 框定；含 heuristic 边的 trace 断言边被标注未被丢。

**(7) 证据回指**：/tmp/tk-research/codegraph/src/context/index.ts:280-308,905-931。

---

### 本需求 stillOpen（交用户/Track-1 测量）

- Windows 文件 watcher debounce 窗口：codegraph 用 ~2s；tk 的 AV/CrowdStrike/EBUSY 历史可能需更长 debounce 或 git-hook 回退到 `tk sync`（替代/并行 ReadDirectoryChangesW）——需在慢机安装基上测后定。注：v1 默认 lazy-on-read 无常驻 watcher，此项仅影响 opt-in watcher。
- 0-1 `resolvedBy` 置信度对**人 HTML 面**是暴露数字还是收成 high/med/low 徽章——agent 要数字，人读者或偏徽章，UX 决策。
- J5 置信阈值（≥2-词-len≥3 + 佐证）在 VS Code Copilot/Windows 主目标上是否过/欠触发——需 Track-1 harness 确认后锁。
- heuristic 边在 token-minimal agent 路径上是否该**抑制**（不止标注）于某置信度下——即一个 per-call flag 用召回换精度——vs 当前 J13 锁定的 always-keep-but-tag。


---

## 需求 K — Proof：如何诚实地证明 A（理解/协作）与 B（token 优化）两者都成立

本节构建一套 **two-track / two-job** 的证明工坊，唯一不变量是：**绝不报告任何无法机械推导的数字（never report a number we cannot mechanically derive）**。Job B（agent 找代码 = token 优化）在 SECONDARY 宿主（Claude Code headless，唯一干净的 uncached-token 跑测器）上离线 A/B 测量；PRIMARY 宿主（VS Code Copilot / Windows）token 结构上不可测，只产出 Track-2 opportunity facts。Job A（人类理解/协作）走独立的 small-N 任务协议，不用 token。

被测系统（system-under-test）即上游 A 的检索流水线 + F 的 MCP 工具面 + B 的「static 层唯一权威」边界——K 的全部测量都建立在 `B1 provenance 过滤`（find-code 路径只走 `provenance='static'`，确定性）之上，因此 Job B 的测量臂里**不含任何 LLM 生成**，B 的叙事生成单独走 Job-A 协议。

依赖前置（来自 DEP MAP）：
- 跑测器 = `F2 tk mcp`，工具面消融通过 `F10 TK_MCP_TOOLS` 环境变量（空 = WITHOUT 臂）。
- 测量臂只在 Claude Code（K2/K3），PRIMARY 走 Track-2（K7），二者通过 `K12 loop-avoidance host-agnostic` 假设桥接（明文打印，不隐藏）。
- 输出预算单位沿用 `G1` 字符档（13000/18000/24000），token 化是 K 测到 Copilot inline cap 之后的 refinement，非 v1 阻塞项。

---

### K1 PRIMARY Job-B 指标 = `uncached_input_tokens` 增量 — 服务 B

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

### K2 测量臂跑测器 = Claude Code headless — 服务 B

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

### K3 A/B 协议 = strict-mcp-config，MCP on/off，4 次/臂取中位数 — 服务 B

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

**(4) 具体数值**：`RUNS_PER_ARM = 4`；`--permission-mode bypassPermissions`；`maxBuffer = 64MiB`；报告含 median + min + max（spread）；高方差大 repo cell 可上调到 8（见 stillOpen）。

**(5) 有序步骤**：
1. 写 `configs/with.json`（启用 `tk mcp`）、`configs/without.json`（空）。
2. 实现 `runAb`，串起 K2 抽取 + K1 计算。

**(6) 测试**：以一个 mock `claude` 脚本（PATH 注入，回放固定 result JSON）跑 `runAb`，断言 8 次调用、median delta 与预期一致；断言 strict-mcp-config 参数确实传入。

**(7) 证据回指**：codegraph README.md:214（VERBATIM 已确认）。

---

### K4 安全指标 = fallback-replay → omission_bug_rate — 服务 B

**(1) 决策**：安全用 `omission_bug_rate`（fallback-replay），**不用压缩比**。流程：(1) projection 层 ON 跑任务；(2) 失败或带可疑重试成功时，定位该层引入的投影证据；(3) 从同一 checkpoint 重跑、仅把那些输出升级为 raw/exact；(4) 若任务 failure→success 或修正了事实性遗漏，记一个 context-omission bug。`omission_bug_rate = omission_bugs / tasks`。**OVERRULES** 把压缩比当价值证明。

**(2) 要动的文件**：
```
scripts/eval/
  fallback-replay.ts               ← checkpoint 重放 + flip 判定
```

**(3) 可抄代码**：compendium §11 的方法原文（确认存在，VERBATIM），作为流程权威定义：

```text
源: /Users/ziyu/Workspace/token-killer/docs/codegraph/low-token-agent-research-compendium-20260618.md:478 （VERBATIM）
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

### K5 检索质量 = localization F1（FastContext 式），与任务质量分开报 — 服务 两者

**(1) 决策**：检索精度用 localization F1：predicted set = tk search/explore surface 的 `{file, line-range}` 指针；oracle set = patch 触碰的 files+lines。F1 over (file, line-range) 重叠。与端到端任务质量**分开**报（Cody methodology）。

**(2) 要动的文件**：
```
scripts/eval/
  localization-f1.ts               ← P/R/F1 over (file,line-range)
```

**(3) 可抄代码**：FastContext 方法依据（确认存在，VERBATIM）+ tk 计算实现：

```text
源: /Users/ziyu/Workspace/token-killer/docs/codegraph/low-token-agent-research-compendium-20260618.md:355 （VERBATIM）
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

### K6 任务正确性 = FAIL_TO_PASS + PASS_TO_PASS — 服务 B

**(1) 决策**：带 patch 的任务用 SWE-bench 式 `FAIL_TO_PASS`（修前失败/修后通过）+ `PASS_TO_PASS`（修前通过/修后仍通过）。任务记为 solved 当且仅当 **所有 FAIL_TO_PASS 通过 且 所有 PASS_TO_PASS 仍通过**。

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

### K7 Track-2 在线 opportunity facts（不可测的 PRIMARY 宿主）— 服务 B

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

### K8 per-operation token_usage 日志（full-vs-incremental 分母）— 服务 两者

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

### K9 Job-A（人类理解/协作）证明 = small-N 任务协议，不用 token — 服务 A

**(1) 决策**：Job A 走独立 small-N 协议（非 token）。两项度量：(a) find-correct-file rate——给人一个问题 + 仅人类 surface，记 hit@1 + time-to-correct-file；(b) comprehension——固定问题集对照 oracle answer key，`score = correct/total`。一律打印 N + 「small-N indicative, not benchmark-grade」标注。**采用 Serena 拒绝伪造 comprehension % 的诚实立场。**

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
2. 手写 `job-a-questions.jsonl`（题 + oracle file + answer key）——stillOpen：语料来源与 grader 待用户定。

**(6) 测试**：3 题、2 题首开=oracle ⇒ hit@1≈0.667；断言输出含 `label` 字段；comprehension 无 graded 时为 undefined（不伪造）。

**(7) 证据回指**：MEMORY measurement-harness-design（Serena 拒绝 token benchmark）；K9 dossier。

---

### K10 per-run 遥测 SCHEMA（sqlite `eval_run`）— 服务 两者

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

### K11 操作定义锁定：duplicate_reads / search_result_usefulness — 服务 B

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

### K12 loop-avoidance TRANSFER 假设：明文声明，不隐藏 — 服务 两者

**(1) 决策**：Claude-Code 测得的 uncached delta 仅在 **「W2 loop-avoidance 宿主无关」** 假设下声称可转移到 VS Code Copilot——该假设在每个被转移数字旁**逐字打印**，并附注：Copilot 侧由 Track-2 opportunity facts（call/payload/avoided-read 计数）佐证，而非 token。

**(2) 要动的文件**：
```
scripts/eval/
  report.ts                        ← 报告渲染，强制带 transfer footer
```

**(3) 可抄代码**：tk 报告 footer（tk 新建，强制声明）：

```ts
// 源: scripts/eval/report.ts （tk 新建）
export const TRANSFER_FOOTER =
  "Token deltas measured on Claude Code headless. Transfer to VS Code Copilot " +
  "assumes loop-avoidance (W2) is host-agnostic; on Copilot we report only mechanical " +
  "facts (calls / payload / avoided reads), never a token %.";

export function renderHeadline(delta: number, withMed: number, withoutMed: number): string {
  return [
    `uncached Δ (WITHOUT − WITH) = ${delta} tokens`,
    `  WITH med=${withMed}  WITHOUT med=${withoutMed}`,
    "",
    TRANSFER_FOOTER,   // 每个被转移数字都带它
  ].join("\n");
}
```

**(4) 具体数值**：footer 文本固定；任何对 Copilot 的转移声称必须紧邻此 footer，否则视为违反诚实不变量。

**(5) 有序步骤**：
1. 实现 `renderHeadline` 强制拼接 `TRANSFER_FOOTER`——独立可测。

**(6) 测试**：断言 `renderHeadline(...)` 输出必含 `TRANSFER_FOOTER` 全文；断言无 footer 的渲染路径不存在（grep 测试）。

**(7) 证据回指**：MEMORY measurement-harness-design（W2 = A/B-only，transfer 是假设）；K12 dossier。

---

### K13 系统变体消融阶梯 — 服务 B

**(1) 决策**：对比变体 = `baseline · baseline+output-compression-only · baseline+smart-read · baseline+repo-map/graph · baseline+symbol-index`。每个变体一个独立 WITH config，隔离每层贡献；无 embeddings/gateway 变体（leans 范围外）。

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

### K14 基准任务 11 类 + A/B 路由 — 服务 两者

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

### 跨 K 子决策的诚实不变量（acceptance gate）

1. **never report a number we cannot mechanically derive**——measured（K1-K6, K8, K10-K11）走 Claude Code 实测；opportunity（K7）打不同 `estimate_kind` 永不汇总；Job A（K9）永带「indicative」标注。
2. **uncached not total**（K1）——OVERRULES codegraph total 头条。
3. **每个 token 增量必与非回归 success_rate 配对**（K6 Pareto），绝不单报 token。
4. **transfer 假设明文**（K12）——Copilot 侧只有机械事实，无 token %。
5. 全工坊只写 JSONL/sqlite ledger，**自身不跑任何模型**（守 strong lean：无 API key、无 model egress）；Job-A oracle 由宿主 agent 或人类评分（stillOpen），永不用 tool-embedded model。

### 留给用户的 stillOpen（不阻塞 v1 落地）
- Job-A 语料来源：手写 tk-repo 题集（可控、小 N、可能偏置）vs 外部 onboarding 基准（更可信、映射成本高）。
- Job-A grader：宿主 agent（便宜，但 LLM 评 LLM-assisted human）vs 人类评审（可信、不可扩展）——决定 A 数字是「indicative」还是 defensible。
- 是否保留 Copilot CLI `premiumRequests` 作 billing-unit 旁证（非 token、auto-route haiku，可能误导多于佐证）。
- Job-B task oracle 来源：tk 自有 repo + 手写 answer-key/gold-patch vs SWE-bench 切片（真 FAIL/PASS、但重且 Python 偏）。
- N 与 run 预算：4 次/臂对齐 codegraph，但 ≤30× 方差下高方差大 repo cell 可能要更多 run（成本 vs 更紧 spread）。


---

## 需求 L — Distribution / runtime (Windows primary)

本节是「ONE BACKEND, TWO DIETS, TWO FRONT-ENDS」骨架的**承载层**：graph store（C）+ WASM tree-sitter 抽取器（D）这套东西必须能在企业 Windows 上**真正跑起来**，否则 B（agent 省 token）和 A（人理解）都无从谈起。全节抄自 codegraph 已验证的分发配方（license MIT，无限制），按 tk 现状改写。所有引用代码均已逐一对照 clone 确认。

依赖锚定：上游冲突已裁决为 D 的版本带 `>=22.5.0 <25.0.0` + vendored Node 24.x + `--liftoff-only` 强制（因为 A/D 已确认 ship tree-sitter WASM）。本节据此把 L5/L7 的「stillOpen」关闭：Node 25 排除、`--liftoff-only` 必带；同时按 C↔L 冲突裁决把 DB 落在 out-of-tree 用户目录（`.tk/` 只放人类共享工件）。

---

### L1 决策 — 双通道：npm thin-shim 为主 + vendored-Node bundle-installer 为备（服务 两者）

**(1) 决策**：分发走双通道。PRIMARY = `npm i -g token-killer`，主包是用户自己 Node 跑的极薄 CJS shim；per-platform vendored-Node bundle 作为 `optionalDependencies`（os/cpu 字段，npm 只下匹配的那个），并带 GitHub Releases self-heal 下载兜底。FALLBACK = `install.ps1`（`irm … | iex`）/ `install.sh`（`curl | sh`）拉同一批 per-platform `.zip`/`.tar.gz`，**完全不需要 Node**。排除 bundle-only（绕开 npm 肌肉记忆 + 体积大）和 npm+native-build（node-gyp/MSVC 在企业 Windows 缺席）。

**(2) 要动的文件**：
```
token-killer/
  scripts/
    build-bundle.sh        # 新建 — 单 Linux runner 出 6 平台 bundle
    pack-npm.sh            # 新建 — 打 shim 主包 + per-platform 包
    npm-shim.js            # 新建 — CJS 启动器（用户 Node 跑），是主包的 bin
  install.ps1             # 新建 — Windows 独立安装器
  install.sh             # 新建 — macOS/Linux 独立安装器
  src/
    bin/node-version-check.ts   # 新建 — 版本 banner + MIN_NODE_MAJOR
    runtime/relaunch-flags.ts   # 新建 — guarded self-re-exec（L7）
  package.json           # 改 — engines、bin 形态由本节决定（见 L2/L6）
```

**(3) 可抄代码**：见 L2–L9 各子决策的代码块（本决策是路线总览，无独立代码）。

**(4) 具体数值**：通道数 = 2；platform target 数 = 6（见 L8）；vendored Node = v24.16.0；Node 硬下限 major = 22（`node:sqlite` 首个稳定带 WAL+FTS5）；Node 上限排除 = 25.x。

**(5) 有序步骤**：① L2 落 npm-shim.js + package.json 形态 → ② L8 落 build-bundle.sh（出 win32-x64 bundle 即可独立验证）→ ③ L3 self-heal → ④ L9/L10 独立安装器 → ⑤ L6 版本 gate → ⑥ L7 warning 抑制。每步可独立 release/test。

**(6) 测试**：smoke 矩阵——在「无系统 Node 的 Windows VM」跑 `irm install.ps1|iex` 后 `tk --version` 返回；在「Node 22.5 用户 Node」跑 `npm i -g token-killer` 后 `tk --version` 返回；断言 shim 主包 tarball ≤ 200KB（`pnpm pack` 后 `wc -c`）。

**(7) 证据回指**：`/tmp/tk-research/codegraph/BUNDLING.md:36-65`（双配方）；codegraph issue #303（cnpm 不镜像 optionalDependencies）。

---

### L2 决策 — 主 npm 包 = 极薄 CJS shim，bundle 作 optionalDependencies（服务 两者）

**(1) 决策**：主包 = `npm-shim.js`（用户 Node 跑，纯启动器，即使古老 Node 也能跑这一个文件）。per-platform bundle 命名 `token-killer-<platform>-<arch>`，带 `os`/`cpu` 字段（esbuild 模式），列入主包 `optionalDependencies`，npm 只下匹配 host 的那一个。bundle 布局：根 `node`/`node.exe`，`lib/dist` + `lib/node_modules`，`bin/` launcher。tk 保留 shim 包自身零运行时依赖、纯 JS（≤200KB tarball 性质守在常见路径上）。

**(2) 要动的文件**：`token-killer/scripts/npm-shim.js`（新建），`token-killer/scripts/pack-npm.sh`（新建），`package.json` 的 `bin`/`main`/`optionalDependencies`（由 pack-npm.sh 在 release 时生成）。

**(3) 可抄代码**：

resolveInstalledBundle（已改写：包名 `@colbymchenry/codegraph-*` → `token-killer-*`，entry `codegraph.js` → `cli.js`；其余逐字）。源: `/tmp/tk-research/codegraph/scripts/npm-shim.js:34-72`
```js
// npm-shim.js（已改写包名/入口；其余逐字抄 codegraph）
var childProcess = require('child_process');
var fs = require('fs'); var os = require('os'); var path = require('path');

var target = process.platform + '-' + process.arch;     // darwin-arm64, win32-x64 …
var pkg = 'token-killer-' + target;                       // 改写：无 scope
var isWindows = process.platform === 'win32';
var REPO = 'cozy228/token-killer';                        // 改写：tk repo

main().catch(function (e) {
  process.stderr.write('tk: ' + (e && e.message ? e.message : String(e)) + '\n');
  process.exit(1);
});

async function main() {
  var resolved = resolveInstalledBundle() || (await selfHealBundle());
  var res = childProcess.spawnSync(resolved.command, resolved.args, { stdio: 'inherit' });
  if (res.error) { process.stderr.write('tk: ' + res.error.message + '\n'); process.exit(1); }
  process.exit(res.status === null ? 1 : res.status);
}

// Resolve the launcher from the installed per-platform optionalDependency.
function resolveInstalledBundle() {
  try {
    if (isWindows) {
      // Node 24 refuses to spawn the bundle's .cmd (EINVAL, CVE-2024-27980
      // hardening), so invoke the bundled node.exe directly against the entry.
      var nodeExe = require.resolve(pkg + '/node.exe');
      var entry = require.resolve(pkg + '/lib/dist/bin/cli.js');   // 改写：cli.js
      return { command: nodeExe, args: runtimeFlags(entry) };
    }
    return { command: require.resolve(pkg + '/bin/tk'), args: process.argv.slice(2) };
  } catch (e) { return null; }
}
```

pack-npm.sh 的 per-platform 包 manifest + 主包 manifest（已改写：scope 去掉、`codegraph` → `tk`/`token-killer`、bin 名 `tk`、入口 `cli.js`、license `MIT`）。源: `/tmp/tk-research/codegraph/scripts/pack-npm.sh:59-116`
```bash
# per-platform 包 manifest（已改写名字/bin）
VERSION="$VERSION" TARGET="$target" OSV="$os" ARCHV="$arch" NODEFILE="$nodefile" \
  node -e '
    const fs=require("fs");
    fs.writeFileSync(process.argv[1], JSON.stringify({
      name: `token-killer-${process.env.TARGET}`,
      version: process.env.VERSION,
      description: `token-killer self-contained bundle for ${process.env.TARGET}`,
      os: [process.env.OSV], cpu: [process.env.ARCHV],
      files: [process.env.NODEFILE, "lib", "bin"],
      license: "MIT"
    }, null, 2) + "\n");
  ' "$pkgdir/package.json"

# 主 shim 包 manifest（已改写 bin=tk、main=npm-shim.js、optionalDependencies=每平台）
VERSION="$VERSION" TARGETS="${targets[*]}" \
  node -e '
    const fs=require("fs");
    const opt={};
    for (const t of process.env.TARGETS.split(/\s+/).filter(Boolean))
      opt[`token-killer-${t}`]=process.env.VERSION;
    fs.writeFileSync(process.argv[1], JSON.stringify({
      name: "token-killer",
      version: process.env.VERSION,
      description: "Local-first code intelligence + token compression for AI agents. Self-contained.",
      bin: { tk: "npm-shim.js" },
      optionalDependencies: opt,
      files: ["npm-shim.js","dist","README.md"],
      engines: { node: ">=22.5.0 <25.0.0" },
      license: "MIT"
    }, null, 2) + "\n");
  ' "$NPM/main/package.json"
```

**(4) 具体数值**：shim 包 `files` 仅 `npm-shim.js`+`dist`(.d.ts)+`README.md`；shim tarball 目标 ≤200KB；platform 包名前缀固定 `token-killer-`；optionalDependencies 条目数 = 6。

**(5) 有序步骤**：① 写 npm-shim.js（先只走 `resolveInstalledBundle` 分支，self-heal 留 L3）→ ② 写 pack-npm.sh 生成两类 manifest → ③ `npm publish` dry-run 验证主包只含 shim+types。

**(6) 测试**：unit——mock `require.resolve('token-killer-win32-x64/node.exe')` 命中时 `resolveInstalledBundle()` 返回 `{command: …node.exe, args:['--liftoff-only','--disable-warning=ExperimentalWarning', entry, …]}`；fixture——`pack-npm.sh` 产出的主包 `package.json.optionalDependencies` 含 6 个 `token-killer-*` key。

**(7) 证据回指**：`/tmp/tk-research/codegraph/scripts/npm-shim.js:34-72`、`pack-npm.sh:59-116`。

---

### L3 决策 — self-heal：optionalDependency 缺失时从 GitHub Releases 直拉 bundle（服务 两者）

**(1) 决策**：当匹配的 optionalDependency 解析不到（cnpm/企业镜像静默丢弃），shim 直接从 GitHub Releases 下匹配 bundle 到 `~/.token-killer/bundles/<target>-<version>`，有 `SHA256SUMS` 时校验，原子 rename（同 fs 无 EXDEV），用系统 `tar` 解包（Win10+ 自带 bsdtar 可读 zip）。环境旋钮：`TK_NO_DOWNLOAD=1`、`TK_INSTALL_DIR=DIR`、`TK_DOWNLOAD_BASE=URL`。

**(2) 要动的文件**：`token-killer/scripts/npm-shim.js`（续写 `selfHealBundle`/`download`/`extract`/`verifyChecksum`）。

**(3) 可抄代码**：

selfHealBundle + verifyChecksum + extract（已改写：env 前缀 `CODEGRAPH_` → `TK_`、cache 目录 `.codegraph` → `.token-killer/bundles`、asset 名 `codegraph-` → `token-killer-`、UA 字符串）。源: `/tmp/tk-research/codegraph/scripts/npm-shim.js:100-231`
```js
// selfHealBundle（已改写 env/路径/asset 前缀；逻辑逐字抄）
async function selfHealBundle() {
  var version = readVersion();
  var bundlesDir = path.join(process.env.TK_INSTALL_DIR
    || path.join(os.homedir(), '.token-killer'), 'bundles');
  var dest = path.join(bundlesDir, target + '-' + version);

  var cached = launcherIn(dest);
  if (cached) return cached;                       // 已下过：即便禁下载也用
  if (process.env.TK_NO_DOWNLOAD) fail('network fallback disabled (TK_NO_DOWNLOAD).');

  var asset = 'token-killer-' + target + (isWindows ? '.zip' : '.tar.gz');
  var base = process.env.TK_DOWNLOAD_BASE
    || ('https://github.com/' + REPO + '/releases/download');
  var url = base + '/v' + version + '/' + asset;

  // Stage inside bundlesDir → final rename is same-fs (atomic, no EXDEV).
  fs.mkdirSync(bundlesDir, { recursive: true });
  var stage = fs.mkdtempSync(path.join(bundlesDir, '.dl-'));
  try {
    var archivePath = path.join(stage, asset);
    await download(url, archivePath, 6);
    await verifyChecksum(archivePath, asset, base, version);
    var extracted = path.join(stage, 'bundle');
    fs.mkdirSync(extracted);
    extract(archivePath, extracted);
    var raced = launcherIn(dest);
    if (raced) { rmrf(stage); return raced; }
    try { fs.renameSync(extracted, dest); }
    catch (e) { var other = launcherIn(dest); if (other) { rmrf(stage); return other; } throw e; }
  } catch (e) { rmrf(stage); fail('download failed (' + e.message + ').\n  URL: ' + url); }
  rmrf(stage);
  var ready = launcherIn(dest);
  if (!ready) fail('downloaded bundle is missing its launcher under ' + dest + '.');
  return ready;
}

// 解包用系统 tar（macOS/Linux/Win10+ 都有；bsdtar 读 zip）。逐字抄。
function extract(archive, destDir) {
  var args = isWindows
    ? ['-xf', archive, '-C', destDir, '--strip-components=1']
    : ['-xzf', archive, '-C', destDir, '--strip-components=1'];
  var res = childProcess.spawnSync('tar', args, { stdio: 'ignore' });
  if (res.error) throw new Error('tar unavailable: ' + res.error.message);
  if (res.status !== 0) throw new Error('tar exited ' + res.status);
}

// rmrf：注意 L12 不变量——这里抄的是 force 版，下载 staging 改用 maxRetries（见 L12）
function rmrf(p) { try { fs.rmSync(p, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch (e) {} }
```

verifyChecksum 逐字（仅注释里的产品名无须改）。源: `/tmp/tk-research/codegraph/scripts/npm-shim.js:196-216`
```js
// Best-effort：有 SHA256SUMS 则必须匹配否则 abort；文件缺失/不可达则放行（TLS 已护）。
async function verifyChecksum(archivePath, asset, base, version) {
  var sumsPath = archivePath + '.SHA256SUMS';
  try { await download(base + '/v' + version + '/SHA256SUMS', sumsPath, 6); }
  catch (e) { return; }                                    // 未发布/不可达 → skip
  var expected = null;
  var lines = fs.readFileSync(sumsPath, 'utf8').split('\n');
  for (var i = 0; i < lines.length; i++) {
    var m = lines[i].trim().match(/^([0-9a-fA-F]{64})\s+\*?(.+)$/);
    if (m && path.basename(m[2].trim()) === asset) { expected = m[1].toLowerCase(); break; }
  }
  if (!expected) return;
  var actual = require('crypto').createHash('sha256').update(fs.readFileSync(archivePath)).digest('hex');
  if (actual !== expected) throw new Error('checksum mismatch for ' + asset);
}
```

**(4) 具体数值**：download HTTP 重定向上限 = 6 跳；连接 idle timeout = 30000ms；cache 目录默认 `~/.token-killer/bundles`；rmrf maxRetries=5 / retryDelay=100ms（L12 不变量）。

**(5) 有序步骤**：① 接上 L2 的 npm-shim.js，补 `selfHealBundle`/`download`/`verifyChecksum`/`extract`/`launcherIn`/`rmrf`/`fail` → ② 本步可在「故意 `npm i --no-optional`」场景独立验证。

**(6) 测试**：integration——本地起一个 fake release HTTP server，`npm i --omit=optional` 装主包后 `TK_DOWNLOAD_BASE=http://127.0.0.1:PORT tk --version` 成功，断言 `~/.token-killer/bundles/<target>-<ver>/node(.exe)` 存在；assertion——`SHA256SUMS` 故意改一字节 → 命令 abort 且退出码非 0。

**(7) 证据回指**：`/tmp/tk-research/codegraph/scripts/npm-shim.js:100-231`；issue #303。

---

### L4 决策 — Windows 上 shim 直呼 bundled node.exe，绝不走 .cmd launcher（服务 两者）

**(1) 决策**：Windows shim 用 `require.resolve(pkg+'/node.exe')` + `require.resolve(pkg+'/lib/dist/bin/cli.js')`，直接 spawn `node.exe`，**永不** spawn `.cmd`/`.bat`。原因：现代 Node（24，CVE-2024-27980 加固）spawn `.cmd`/`.bat` 抛 EINVAL。这是 Windows shim 最关键单点。

**(2) 要动的文件**：`token-killer/scripts/npm-shim.js`（`resolveInstalledBundle`/`launcherIn` 的 isWindows 分支，已在 L2 代码内）。

**(3) 可抄代码**：launcherIn（从已下载 bundle 目录解析 launcher，同 node/lib/bin 布局；已改写 entry `codegraph.js`→`cli.js`、unix bin `codegraph`→`tk`）。源: `/tmp/tk-research/codegraph/scripts/npm-shim.js:77-89`
```js
function launcherIn(dir) {
  if (isWindows) {
    var nodeExe = path.join(dir, 'node.exe');
    var entry = path.join(dir, 'lib', 'dist', 'bin', 'cli.js');     // 改写：cli.js
    if (fs.existsSync(nodeExe) && fs.existsSync(entry))
      return { command: nodeExe, args: runtimeFlags(entry) };
  } else {
    var launcher = path.join(dir, 'bin', 'tk');                      // 改写：tk
    if (fs.existsSync(launcher)) return { command: launcher, args: process.argv.slice(2) };
  }
  return null;
}
```

**(4) 具体数值**：Windows spawn target 文件名固定 `node.exe`（非 `.cmd`）；entry 相对路径固定 `lib/dist/bin/cli.js`。

**(5) 有序步骤**：随 L2/L3 一并落地（同一文件）。

**(6) 测试**：unit——`launcherIn(dir)` 在 win32 mock 下 `command` 以 `node.exe` 结尾、`args[0..1]` 为 runtime flags、`args[2]` 以 `cli.js` 结尾；负向断言——`command` 不含 `.cmd`/`.bat`。

**(7) 证据回指**：`/tmp/tk-research/codegraph/scripts/npm-shim.js:60-66,77-89`；CVE-2024-27980。

---

### L5 决策 — vendored Node 钉在 v24.16.0，硬下限 22.5.0，排除 25.x（服务 两者）

**(1) 决策**：bundle 内 vendored Node 钉 **v24.16.0**（24.x LTS-line，`node:sqlite` WAL+FTS5 稳定）；硬地板 **22.5.0**（`node:sqlite` DatabaseSync 首版）；bundle **绝不带 25.x**（V8 turboshaft WASM Zone OOM，因 A/D 已确认 tk ship tree-sitter WASM → 此前的「contingent」关闭，25 排除是确定项）。冲突裁决：单一 gate = `engines.node ">=22.5.0 <25.0.0"`。

**(2) 要动的文件**：`token-killer/scripts/build-bundle.sh`（`NODE_VERSION` 默认值）；`package.json` 的 `engines`。

**(3) 可抄代码**：build-bundle.sh 的版本钉死行（逐字）。源: `/tmp/tk-research/codegraph/scripts/build-bundle.sh:23-24`
```bash
TARGET="${1:?usage: build-bundle.sh <target> [node-version]}"
NODE_VERSION="${2:-v24.16.0}"      # 钉死：node:sqlite WAL+FTS5 稳定的 24.x LTS-line
```

**(4) 具体数值**：vendored Node = `v24.16.0`；硬下限 major = 22（精确 22.5.0）；上限排除 = 25.x（`<25.0.0`）。

**(5) 有序步骤**：① build-bundle.sh 默认 `v24.16.0` → ② package.json `engines` 改 `">=22.5.0 <25.0.0"`（仅 install-time warning，硬阻断见 L6）。

**(6) 测试**：assertion——bundle 内 `./node.exe --version`（或 `./node --version`）输出以 `v24.` 开头；fixture——`package.json.engines.node === ">=22.5.0 <25.0.0"`。

**(7) 证据回指**：`/tmp/tk-research/codegraph/scripts/build-bundle.sh:24`、`src/extraction/wasm-runtime-flags.ts:7-10`（25 因 WASM OOM 被排除）。

---

### L6 决策 — Node 版本 gate = bootstrap 硬阻断（不止 engines），ASCII banner + exit 1（服务 两者）

**(1) 决策**：版本 gate 在 cli 入口做 **bootstrap 硬阻断**（`engines` 只在 install 警告，必须运行时硬挡才真正挡住）。`MIN_NODE_MAJOR=22`（从 tk 现 `>=20` 抬升，因 `node:sqlite` 需 22.5）；major ≥25 也挡（WASM OOM）。bordered ASCII banner（OEM-codepage 安全）+ exit 1；`TK_ALLOW_UNSAFE_NODE=1` 可越权。注意：此 gate 只在「用户老 Node 跑 npm-shim」路径触发，bundle 路径永远是 24。

**(2) 要动的文件**：`token-killer/src/bin/node-version-check.ts`（新建，banner + MIN_NODE_MAJOR）；tk cli 入口（`src/cli.ts` 顶部插入 gate）。

**(3) 可抄代码**：

node-version-check.ts（已改写：`MIN_NODE_MAJOR` 20→22、产品名 CodeGraph→token-killer、env `CODEGRAPH_ALLOW_UNSAFE_NODE`→`TK_ALLOW_UNSAFE_NODE`；banner 结构 + ASCII sep 逐字）。源: `/tmp/tk-research/codegraph/src/bin/node-version-check.ts:20-76`
```ts
// src/bin/node-version-check.ts（已改写产品名/env/MIN；banner ASCII 结构逐字抄）
export const MIN_NODE_MAJOR = 22;   // 改写：20→22（node:sqlite DatabaseSync 需 22.5）

export function buildNodeTooOldBanner(nodeVersion: string): string {
  const sep = '-'.repeat(72);       // ASCII glyph：GBK/OEM 控制台安全
  return [
    sep,
    `[token-killer] Unsupported Node.js version: ${nodeVersion}`,
    sep,
    `token-killer requires Node.js ${MIN_NODE_MAJOR}.5 or newer. node:sqlite (the`,
    'graph store) is unavailable below 22.5, and older versions are untested.',
    '',
    'Fix: install Node.js 22 LTS:',
    '  nvm install 22 && nvm use 22                          # nvm',
    '  brew install node@22 && brew link --overwrite --force node@22  # Homebrew',
    '',
    'To override (NOT recommended - unsupported):',
    '  TK_ALLOW_UNSAFE_NODE=1 tk ...',
    sep,
  ].join('\n');
}

export function buildNode25BlockBanner(nodeVersion: string): string {
  const sep = '-'.repeat(72);
  return [
    sep,
    `[token-killer] Unsupported Node.js version: ${nodeVersion}`,
    sep,
    'Node.js 25.x has a V8 WASM JIT (turboshaft) Zone allocator bug that',
    'crashes with `Fatal process out of memory: Zone` when compiling',
    'tree-sitter grammars. token-killer WILL crash mid-indexing on this Node.',
    '',
    'Fix: install Node.js 22 LTS (see above). To override (NOT recommended):',
    '  TK_ALLOW_UNSAFE_NODE=1 tk ...',
    sep,
  ].join('\n');
}
```

cli 入口硬阻断（已改写 env、产品名；版本解析 + 双 banner 分支逐字）。源: `/tmp/tk-research/codegraph/src/bin/codegraph.ts:67-85`
```ts
// src/cli.ts 顶部（在任何 node:sqlite / WASM 工作之前）
import { buildNode25BlockBanner, buildNodeTooOldBanner, MIN_NODE_MAJOR } from './bin/node-version-check';
const nodeVersion = process.versions.node;
const nodeMajor = parseInt(nodeVersion.split('.')[0] ?? '0', 10);
if (nodeMajor >= 25) {
  process.stderr.write(buildNode25BlockBanner(nodeVersion) + '\n');
  if (!process.env.TK_ALLOW_UNSAFE_NODE) process.exit(1);
}
if (nodeMajor < MIN_NODE_MAJOR) {
  process.stderr.write(buildNodeTooOldBanner(nodeVersion) + '\n');
  if (!process.env.TK_ALLOW_UNSAFE_NODE) process.exit(1);
}
```

**(4) 具体数值**：`MIN_NODE_MAJOR = 22`；阻断 major ≥25；banner 宽 = 72 字符（`'-'.repeat(72)`）；越权 env = `TK_ALLOW_UNSAFE_NODE`。

**(5) 有序步骤**：① 写 node-version-check.ts → ② cli 入口插 gate（在 `node:sqlite` import 之前）→ ③ 独立可测。

**(6) 测试**：unit——pin banner 文本（断言含 `TK_ALLOW_UNSAFE_NODE` 和「22.5」recovery 行，防被未来编辑剥掉）；integration——`node@20` 跑 `tk` 退出码 1 且 stderr 含 banner，设 `TK_ALLOW_UNSAFE_NODE=1` 后继续。

**(7) 证据回指**：`/tmp/tk-research/codegraph/src/bin/codegraph.ts:67-85`、`node-version-check.ts:48,58-76`。

---

### L7 决策 — node:sqlite ExperimentalWarning 抑制：bundle 路径加 flag，user-Node 22.5–23 路径 guarded re-exec（服务 B）

**(1) 决策**：`node:sqlite` 在 22.5–23 会打 `ExperimentalWarning: SQLite is an experimental feature`，污染 agent 抓取的 stdout/stderr（B：token 成本 + parse 噪声）。两条路径：(a) bundle 路径（Node 24）由 launcher 命令行带 `--disable-warning=ExperimentalWarning`（Node 24 支持）；(b) 罕见的 npm-shim-on-user-Node-22.5..23 路径，做 guarded self-re-exec——flag 不存在且 guard env 未设时，用 `--disable-warning=ExperimentalWarning` 重入，exit 子进程状态；spawn 失败则 fall-through 跑 in-process（warning 仅是表层）。复用 codegraph `relaunchWithWasmRuntimeFlagsIfNeeded` 模板，把 `--liftoff-only` 换成 `--disable-warning=ExperimentalWarning`（注：因 ship WASM，`--liftoff-only` 也仍要带，见下 runtimeFlags）。

**(2) 要动的文件**：`token-killer/src/runtime/relaunch-flags.ts`（新建，guarded re-exec）；`token-killer/scripts/npm-shim.js`（新增 `runtimeFlags(entry)` helper，L2/L4 已引用）。

**(3) 可抄代码**：

guarded self-re-exec（已改写：flag 集合 `--liftoff-only` → `--liftoff-only` + `--disable-warning=ExperimentalWarning`、env `CODEGRAPH_*` → `TK_*`、产品名；env-guard 防死循环 + windowsHide + fall-through-on-error 逐字）。源: `/tmp/tk-research/codegraph/src/extraction/wasm-runtime-flags.ts:41-110`
```ts
// src/runtime/relaunch-flags.ts（已改写 flag 集/env；env-guard+windowsHide+fall-through 逐字）
import { spawnSync } from 'child_process';

// ship tree-sitter WASM → 两个 flag 都要：--liftoff-only 防 WASM Zone OOM；
// --disable-warning 抑制 node:sqlite ExperimentalWarning（污染 agent stdout）。
export const RUNTIME_FLAGS: readonly string[] = [
  '--liftoff-only',
  '--disable-warning=ExperimentalWarning',
];
const RELAUNCH_GUARD_ENV = 'TK_RUNTIME_RELAUNCHED';

export function processHasRuntimeFlags(execArgv: readonly string[] = process.execArgv): boolean {
  return RUNTIME_FLAGS.every((flag) => execArgv.includes(flag));
}

export function buildRelaunchArgv(
  scriptPath: string, scriptArgs: readonly string[],
  execArgv: readonly string[] = process.execArgv,
): string[] {
  const preserved = execArgv.filter((arg) => !RUNTIME_FLAGS.includes(arg));
  return [...RUNTIME_FLAGS, ...preserved, scriptPath, ...scriptArgs];
}

export function relaunchWithRuntimeFlagsIfNeeded(scriptPath: string): void {
  if (processHasRuntimeFlags()) return;
  if (process.env[RELAUNCH_GUARD_ENV]) return;
  if (process.env.TK_NO_RELAUNCH) return;
  const argv = buildRelaunchArgv(scriptPath, process.argv.slice(2));
  const result = spawnSync(process.execPath, argv, {
    stdio: 'inherit',
    env: { ...process.env, [RELAUNCH_GUARD_ENV]: '1' },
    windowsHide: true,
  });
  if (result.error) return;                 // 降级不崩：fall-through 跑 in-process
  process.exit(result.status ?? (result.signal ? 1 : 0));
}
```

npm-shim.js 的 runtimeFlags helper（已改写：codegraph 的 `liftoff(entry)` 只带一个 flag → tk 带两个）。源对照: `/tmp/tk-research/codegraph/scripts/npm-shim.js:94-96`（`liftoff` 模板）
```js
// npm-shim.js：Windows 直呼 node.exe 时把两个 runtime flag 放命令行（warning 在模块加载时发，必须命令行）
function runtimeFlags(entry) {
  return ['--liftoff-only', '--disable-warning=ExperimentalWarning', entry]
    .concat(process.argv.slice(2));
}
```

**(4) 具体数值**：runtime flags = `['--liftoff-only','--disable-warning=ExperimentalWarning']`（2 个）；re-exec guard env = `TK_RUNTIME_RELAUNCHED`；禁用 re-exec env = `TK_NO_RELAUNCH`；最多 re-exec 1 次。

**(5) 有序步骤**：① 写 relaunch-flags.ts → ② cli 入口在 L6 gate 之后、`node:sqlite` import 之前调 `relaunchWithRuntimeFlagsIfNeeded(__filename)` → ③ npm-shim.js 加 `runtimeFlags`，bundle launcher（L8）已带这两 flag → bundle 路径不触发 re-exec。

**(6) 测试**：unit——`buildRelaunchArgv('cli.js',['index'])` 头两元素 = 两个 flag；integration——`node@22.6`（无 flag）跑 `tk` 时 stderr 不含 `ExperimentalWarning`（验证 re-exec 生效），且 `TK_RUNTIME_RELAUNCHED=1` 已设的子进程不再二次 re-exec（无死循环）。

**(7) 证据回指**：`/tmp/tk-research/codegraph/src/extraction/wasm-runtime-flags.ts:92-110`（re-exec 模板）、`scripts/npm-shim.js:94-96`（flag-on-cmdline）。

---

### L8 决策 — 一脚本 6 平台 bundle，单 Linux runner，零 native addon（服务 两者）

**(1) 决策**：`scripts/build-bundle.sh <target> [node-version]` 在单 Linux runner 出每个平台 bundle（下官方 Node → `npm ci --omit=dev --ignore-scripts` → copy dist → 写 launcher → archive）。Targets = `win32-x64 win32-arm64 darwin-arm64 darwin-x64 linux-x64 linux-arm64`。Windows → `.zip` + `node.exe`；unix → `.tar.gz` + sh launcher。因零 native addon，任意 target 可在任意 OS 构建。launcher 命令行带 `--liftoff-only --disable-warning=ExperimentalWarning`。

**(2) 要动的文件**：`token-killer/scripts/build-bundle.sh`（新建）。

**(3) 可抄代码**：build-bundle.sh 主体（已改写：产品名 codegraph→token-killer、entry `codegraph.js`→`cli.js`、launcher 名 `codegraph`/`codegraph.cmd`→`tk`/`tk.cmd`、launcher 加 `--disable-warning` flag；下载/stage/archive 逐字）。源: `/tmp/tk-research/codegraph/scripts/build-bundle.sh:21-117`
```bash
#!/usr/bin/env bash
set -euo pipefail
TARGET="${1:?usage: build-bundle.sh <target> [node-version]}"
NODE_VERSION="${2:-v24.16.0}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; OUT="$ROOT/release"; WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
ARCH="${TARGET##*-}"; OSFAM="${TARGET%-*}"

# 1. 下载官方 Node runtime
if [ "$OSFAM" = "win32" ]; then
  NODE_DIST="node-${NODE_VERSION}-win-${ARCH}"
  curl -fsSL "https://nodejs.org/dist/${NODE_VERSION}/${NODE_DIST}.zip" -o "$WORK/node.zip"
  if command -v unzip >/dev/null 2>&1; then unzip -q "$WORK/node.zip" -d "$WORK";
  else tar -xf "$WORK/node.zip" -C "$WORK"; fi      # bsdtar 可读 zip
  NODE_BIN="$WORK/${NODE_DIST}/node.exe"
else
  NODE_DIST="node-${NODE_VERSION}-${TARGET}"
  curl -fsSL "https://nodejs.org/dist/${NODE_VERSION}/${NODE_DIST}.tar.gz" -o "$WORK/node.tar.gz"
  tar -xzf "$WORK/node.tar.gz" -C "$WORK"
  NODE_BIN="$WORK/${NODE_DIST}/bin/node"
fi
[ -f "$NODE_BIN" ] || { echo "[bundle] node binary not found ($NODE_BIN)" >&2; exit 1; }

# 2. build app（改写：tk 的构建命令）
( cd "$ROOT" && pnpm run build >/dev/null )         # 改写：pnpm（项目硬约束）

# 3. stage app + production deps（纯 JS/wasm → 跨平台可移植）
STAGE="$WORK/token-killer-${TARGET}"
mkdir -p "$STAGE/lib" "$STAGE/bin"
cp -R "$ROOT/dist" "$STAGE/lib/dist"
cp "$ROOT/package.json" "$STAGE/lib/"
( cd "$STAGE/lib" && npm ci --omit=dev --ignore-scripts >/dev/null 2>&1 || true )  # tk 零运行时依赖，no-op 也行

# 4. vendored Node + launcher（带两个 runtime flag）
if [ "$OSFAM" = "win32" ]; then
  cp "$NODE_BIN" "$STAGE/node.exe"
  printf '@"%%~dp0..\\node.exe" --liftoff-only --disable-warning=ExperimentalWarning "%%~dp0..\\lib\\dist\\bin\\cli.js" %%*\r\n' \
    > "$STAGE/bin/tk.cmd"
else
  cp "$NODE_BIN" "$STAGE/node"
  cat > "$STAGE/bin/tk" <<'LAUNCH'
#!/bin/sh
SELF="$0"
while [ -L "$SELF" ]; do
  target="$(readlink "$SELF")"
  case "$target" in /*) SELF="$target" ;; *) SELF="$(dirname "$SELF")/$target" ;; esac
done
DIR="$(cd "$(dirname "$SELF")/.." && pwd)"
exec "$DIR/node" --liftoff-only --disable-warning=ExperimentalWarning "$DIR/lib/dist/bin/cli.js" "$@"
LAUNCH
  chmod +x "$STAGE/bin/tk"
fi

# 5. archive
mkdir -p "$OUT"
if [ "$OSFAM" = "win32" ]; then
  ARCHIVE="$OUT/token-killer-${TARGET}.zip"; rm -f "$ARCHIVE"
  ( cd "$WORK" && zip -rqX "$ARCHIVE" "token-killer-${TARGET}" )
else
  ARCHIVE="$OUT/token-killer-${TARGET}.tar.gz"
  tar --no-xattrs -czf "$ARCHIVE" -C "$WORK" "token-killer-${TARGET}"
fi
echo "[bundle] wrote ${ARCHIVE} ($(du -h "$ARCHIVE" | cut -f1))"
```

**(4) 具体数值**：target 数 = 6；archive 顶层目录名 = `token-killer-<target>`；解包 `--strip-components=1`（对应 L3）；win launcher 行尾 `\r\n`。

**(5) 有序步骤**：① 写 build-bundle.sh → ② 先只跑 `build-bundle.sh win32-x64` 验证出 `.zip` → ③ 逐个 target 补齐。每 target 独立产物、独立可测。

**(6) 测试**：fixture——`build-bundle.sh win32-x64` 产物解包后含 `node.exe`、`bin/tk.cmd`、`lib/dist/bin/cli.js`，且 `tk.cmd` 内容含 `--disable-warning=ExperimentalWarning`；smoke——unix bundle `./bin/tk --version` 返回。

**(7) 证据回指**：`/tmp/tk-research/codegraph/scripts/build-bundle.sh:21-117`、`BUNDLING.md:36-40`。

---

### L9 决策 — install.ps1：Windows 独立安装器，%LOCALAPPDATA% 免管理员（服务 两者）

**(1) 决策**：`irm <raw>/install.ps1 | iex`。`RuntimeInformation.OSArchitecture` 测 arch（Arm64→arm64 否则 x64）；GitHub API `tag_name`（或 `TK_VERSION` pin）解析 latest；下 `token-killer-win32-<arch>.zip` 到 `%TEMP%`；`Expand-Archive` 到 `%LOCALAPPDATA%\token-killer\current`；扁平化顶层目录；把 `<dest>\bin` prepend 到 USER Path。卸载 = 删目录 + 去 PATH 项。

**(2) 要动的文件**：`token-killer/install.ps1`（新建）。

**(3) 可抄代码**：install.ps1（已改写：repo、产品名、env `CODEGRAPH_*`→`TK_*`、安装目录 `codegraph`→`token-killer`、asset 名、bin 命令 `codegraph`→`tk`；arch 探测 + Expand + PATH 逻辑逐字）。源: `/tmp/tk-research/codegraph/install.ps1:15-59`
```powershell
$ErrorActionPreference = 'Stop'
$repo = 'cozy228/token-killer'
$installDir = if ($env:TK_INSTALL_DIR) { $env:TK_INSTALL_DIR } else { Join-Path $env:LOCALAPPDATA 'token-killer' }

$arch = if ([System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture -eq 'Arm64') { 'arm64' } else { 'x64' }
$target = "win32-$arch"

$version = $env:TK_VERSION
if (-not $version) { $version = (Invoke-RestMethod "https://api.github.com/repos/$repo/releases/latest").tag_name }
if (-not $version) { throw "tk: could not resolve latest version; set TK_VERSION." }

$url = "https://github.com/$repo/releases/download/$version/token-killer-$target.zip"
Write-Host "Installing token-killer $version ($target)..."
$tmp = Join-Path $env:TEMP ("tk-" + [guid]::NewGuid().ToString())
New-Item -ItemType Directory -Force -Path $tmp | Out-Null
$zip = Join-Path $tmp 'tk.zip'
Invoke-WebRequest -Uri $url -OutFile $zip

$dest = Join-Path $installDir 'current'
if (Test-Path $dest) { Remove-Item -Recurse -Force $dest }
New-Item -ItemType Directory -Force -Path $dest | Out-Null
Expand-Archive -Path $zip -DestinationPath $dest -Force
$inner = Join-Path $dest "token-killer-$target"          # 扁平化顶层 dir
if (Test-Path $inner) {
  Get-ChildItem -Force $inner | Move-Item -Destination $dest -Force
  Remove-Item -Recurse -Force $inner
}
Remove-Item -Recurse -Force $tmp

$binDir = Join-Path $dest 'bin'
$userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
if (($userPath -split ';') -notcontains $binDir) {
  [Environment]::SetEnvironmentVariable('Path', "$binDir;$userPath", 'User')
  Write-Host "Added $binDir to your PATH (restart your terminal to pick it up)."
}
Write-Host "Installed to $dest"; Write-Host "Run: tk --help"
```

**(4) 具体数值**：安装根 = `%LOCALAPPDATA%\token-killer\current`；版本 pin env = `TK_VERSION`；安装目录 override = `TK_INSTALL_DIR`；PATH 写入 scope = `User`（免管理员）。

**(5) 有序步骤**：① 依赖 L8 已发 Release 资产 → ② 写 install.ps1 → ③ 在无 Node 的 Windows VM `irm|iex` 验证。

**(6) 测试**：integration——无 Node Windows VM 跑安装后新 shell `tk --version` 返回；assertion——`%LOCALAPPDATA%\token-killer\current\bin\tk.cmd` 存在且在 User Path。

**(7) 证据回指**：`/tmp/tk-research/codegraph/install.ps1:15-59`。

---

### L10 决策 — install.sh：macOS 次目标，latest 走 release web 重定向不走 API（服务 两者）

**(1) 决策**：`curl | sh`。解析 latest 用 `releases/latest` 的 **web 重定向**（`curl -fsSLI -w url_effective | sed`），**不**用 GitHub API（未认证 API 限速 60 req/hr/IP，共享/CI host 上常 403）；重定向失败才回退 API。

**(2) 要动的文件**：`token-killer/install.sh`（新建）。

**(3) 可抄代码**：install.sh 版本解析段（已改写：env `CODEGRAPH_VERSION`→`TK_VERSION`、`$REPO`；重定向 + sed + API fallback 逐字）。源: `/tmp/tk-research/codegraph/install.sh:46-67`
```sh
# 解析 latest：用 releases/latest 的 web 重定向，不用限速的 GitHub API（issue #325）
version="${TK_VERSION:-}"
if [ -z "$version" ]; then
  version="$(curl -fsSLI -o /dev/null -w '%{url_effective}' "https://github.com/$REPO/releases/latest" \
    | sed -n 's#.*/releases/tag/##p')"
fi
if [ -z "$version" ]; then     # 重定向读不到才回退 API
  version="$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" \
    | sed -n 's/.*"tag_name": *"\([^"]*\)".*/\1/p' | head -n1)"
fi
[ -n "$version" ] || { echo "tk: could not resolve latest version; set TK_VERSION (e.g. TK_VERSION=v1.0.0)." >&2; exit 1; }
case "$version" in v*) ;; *) version="v$version" ;; esac

url="https://github.com/$REPO/releases/download/$version/token-killer-${target}.tar.gz"
```

**(4) 具体数值**：`$REPO = cozy228/token-killer`；版本 pin env = `TK_VERSION`；asset = `token-killer-<target>.tar.gz`。

**(5) 有序步骤**：① 依赖 L8 Release → ② 写 install.sh（含 L9 同款 arch 探测的 unix 版）→ ③ macOS 验证。

**(6) 测试**：integration——macOS 跑 `curl … | sh` 后 `tk --version` 返回；assertion——在已耗尽 API 配额的环境（mock 403）仍能解析 version（走重定向）。

**(7) 证据回指**：`/tmp/tk-research/codegraph/install.sh:46-64`；issue #325。

---

### L11 决策 — 程序解析 = 纯 Node PATH×PATHEXT 扫描，绝不 spawn where/which（服务 B）

**(1) 决策**：程序存在性判断保持 tk 现有 `hasCommand` 纯 Node 扫描，**绝不** spawn `where`/`which`/`command -v`。`exts = (PATHEXT||'.EXE;.CMD;.BAT;.COM').split(';')`（win32）/ `['']`（其它）；大小写不敏感；X_OK 仅 POSIX。理由：`command` 是 shell builtin（Debian 无独立 binary），自扫每平台一致且省一次 AV-taxed spawn。

**(2) 要动的文件**：tk 现有 `hasCommand`（已存在；本节确认作为分发不变量，无新增）。若 codegraph 抽取器引入新 program 探测，复用此函数。

**(3) 可抄代码**：hasCommand 纯 Node PATH×PATHEXT 扫描（codegraph 版与 tk PR#28 一致；逐字，仅作为不变量参照）。源: `/tmp/tk-research/codegraph/src/upgrade/index.ts:491-509`
```ts
export function hasCommand(cmd: string): boolean {
  const isWin = process.platform === 'win32';
  const dirs = (process.env.PATH || process.env.Path || '').split(path.delimiter).filter(Boolean);
  const exts = isWin ? (process.env.PATHEXT || '.EXE;.CMD;.BAT;.COM').split(';') : [''];
  for (const dir of dirs) {
    for (const ext of exts) {
      const candidate = path.join(dir, cmd + ext);
      try {
        if (!fs.statSync(candidate).isFile()) continue;
        if (isWin) return true;
        fs.accessSync(candidate, fs.constants.X_OK);
        return true;
      } catch { /* not here / not executable — keep scanning */ }
    }
  }
  return false;
}
```

**(4) 具体数值**：win32 默认 PATHEXT = `.EXE;.CMD;.BAT;.COM`；spawn 数 = 0（纯扫描）。

**(5) 有序步骤**：① 审计任何新分发/抽取代码不引入 `where`/`which` spawn → ② 若需探测程序，调 `hasCommand`。

**(6) 测试**：unit——Windows mock `PATHEXT` 含 `.CMD` 时命中 `bin/foo.cmd`；负向——POSIX 下非 X_OK 文件不命中；断言代码库无 `spawn*('where'|'which'|'command -v')`。

**(7) 证据回指**：`/tmp/tk-research/codegraph/src/upgrade/index.ts:491-509`；tk PR#28（PATHEXT casing via readdir，非 realpathSync.native）。

---

### L12 决策 — EBUSY 不变量：spawn-then-rm 的临时/缓存目录必带 maxRetries（服务 两者）

**(1) 决策**：每条「在 temp/cache 目录 spawn 子进程、之后删该目录」的路径，删除用 `fs.rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:100})`。覆盖 L3 self-heal 下载 staging 与任何 indexing scratch。理由：Windows 强制锁，子进程退出后短暂仍持 handle（AV 扫描/npm cache/indexer），裸 rmdir EBUSY；`fs.rm` 默认 maxRetries=0。

**(2) 要动的文件**：`token-killer/scripts/npm-shim.js`（`rmrf` 已在 L3 含 maxRetries）；任何 indexing scratch 清理路径。

**(3) 可抄代码**：tk 现行不变量（与 PR#37 一致），应用到 shim 的 rmrf。
```js
// npm-shim.js 的 rmrf（已在 L3 给出，重申不变量）
function rmrf(p) {
  try { fs.rmSync(p, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
  catch (e) { /* best effort */ }
}
```

**(4) 具体数值**：maxRetries = 5；retryDelay = 100ms（合计最坏 ~500ms 重试窗）。

**(5) 有序步骤**：① 把 L3 的 `rmrf` 改成带 maxRetries（已含）→ ② grep 全库 `fs.rm*(` 在 spawn 上下文补齐。

**(6) 测试**：Windows CI——spawn 子进程于 temp 后立即 rm，断言不抛 EBUSY（PR#37 回归 fixture）。

**(7) 证据回指**：tk PR#37（windows-22 EBUSY，`maxRetries:5,retryDelay:100`）；codegraph `npm-shim.js:229-231` 的 `rmrf`（本节加 maxRetries）。

---

### L13 决策 — GBK/OEM 输出：保留 tk decode 边界，所有分发 banner 仅 ASCII glyph（服务 两者）

**(1) 决策**：保留 tk tool-agnostic `decodeChildOutput`（strict UTF-8 → legacy-codepage 回退，lazy chcp 探测：936→gb18030、932→shift_jis、949→euc-kr、950→big5）。所有分发侧 console banner（L6 Node-gate banner、L9/L10 installer 消息）只用 ASCII glyph。

**(2) 要动的文件**：`token-killer/src/executor.ts`（decode 边界，已存在）；`token-killer/src/bin/node-version-check.ts`（banner ASCII，L6 已是）；可选 `src/ui/glyphs.ts`（ASCII fallback 表，从 codegraph 抄）。

**(3) 可抄代码**：glyphs ASCII fallback（已改写 env 前缀 `CODEGRAPH_*`→`TK_*`；表与探测逐字）。源: `/tmp/tk-research/codegraph/src/ui/glyphs.ts:21-26,62-77`
```ts
// src/ui/glyphs.ts（已改写 env 前缀；探测+ASCII 表逐字）
export function supportsUnicode(): boolean {
  if (process.env.TK_ASCII === '1') return false;
  if (process.env.TK_UNICODE === '1') return true;
  if (process.platform === 'win32') return false;       // Windows 默认 ASCII
  return process.env.TERM !== 'linux';
}
export const ASCII_GLYPHS = {
  ok: '[OK]', err: '[ERR]', info: '[i]', warn: '[!]',
  spinner: ['.', '*', '+', 'x', 'o', 'O'],
  barFilled: '#', barEmpty: '-', rail: '|', phaseDone: '*',
  dash: '-', hLine: '-', treeBranch: '|-- ', treeLast: '`-- ', treePipe: '|   ',
};
```

**(4) 具体数值**：codepage 映射 4 条（936/932/949/950）；Windows banner glyph 集 = ASCII only；ASCII escape env = `TK_ASCII=1`、unicode opt-in = `TK_UNICODE=1`。

**(5) 有序步骤**：① 确认 banner/installer 文本无非-ASCII（L6 已满足）→ ② 若引入进度/树渲染，接 glyphs.ts。

**(6) 测试**：unit——`win32` 下 `supportsUnicode()===false`；assertion——node-version-check.ts banner 字节全 ≤ 0x7F（ASCII）。

**(7) 证据回指**：`/tmp/tk-research/codegraph/src/ui/glyphs.ts:1-26`；tk 已有 GBK decode（executor.ts）。

---

### L14 决策 — ESM loader 用 pathToFileURL；任何脚本/spawn 绝不用 npx（服务 两者）

**(1) 决策**：ESM loader 路径一律 `pathToFileURL(x).href`，绝不裸 drive 路径（`node --import D:\…loader.mjs` 在 Windows 抛 `ERR_UNSUPPORTED_ESM_URL_SCHEME`）。任何分发脚本/spawn **绝不**用 `npx`（corepack 会静默 re-pin `packageManager`，且 npx 在 Windows 无 PATHEXT 时不可解析）；用 `pnpm exec` / 直接 `node --import file://…`。

**(2) 要动的文件**：`token-killer/scripts/build-bundle.sh`（构建命令用 `pnpm run build`，L8 已改）；任何 release/CI 脚本。

**(3) 可抄代码**：无独立 clone 代码——这是 tk 自身分发不变量（来自 PR#28 R1 + npx-rewrites memory）。规则化为：
```bash
# 禁：npx <tool>            → 用：pnpm exec <tool>  或  node ./node_modules/.bin/<tool>
# 禁：node --import D:\x.mjs → 用：node --import "$(node -e 'process.stdout.write(require("url").pathToFileURL(process.argv[1]).href)' x.mjs)"
```

**(4) 具体数值**：分发脚本中 `npx` 出现次数 = 0；ESM `--import` 参数必须 `file://` scheme。

**(5) 有序步骤**：① grep 所有 `scripts/*.sh` + CI yml 中 `npx` → 替换 → ② grep `--import` 确保 `file://`。

**(6) 测试**：CI lint——`grep -rn 'npx ' scripts/ .github/` 必须空；Windows smoke——任一 `--import` 路径不抛 `ERR_UNSUPPORTED_ESM_URL_SCHEME`。

**(7) 证据回指**：tk PR#28 R1（ESM URL scheme）、tk npx-rewrites-packagemanager-pin memory。

---

### L15 决策 — Release 发 SHA256SUMS；self-heal 有则校验、无则放行；release pipeline 一runner 全平台（服务 两者）

**(1) 决策**：GitHub Release 发 `SHA256SUMS`；shim self-heal 下载有 sums 则必须匹配否则 abort，无/不可达则放行（TLS 已护）。Release pipeline 从 `package.json` 读 version，单 runner 构建所有 bundle，建 Release（notes 取 CHANGELOG），发 npm shim + per-platform 包；需 `NPM_TOKEN`。

**(2) 要动的文件**：`token-killer/.github/workflows/release.yml`（新建）；`token-killer/scripts/build-bundle.sh`（产物 + `sha256sum`）。

**(3) 可抄代码**：verifyChecksum 已在 L3 给出（best-effort 语义逐字）。Release SHA256SUMS 生成（pipeline 侧，tk-adapted，需实现时补具体 yml）：
```bash
# release.yml 内（构建完所有 bundle 后）
( cd release && sha256sum token-killer-*.{zip,tar.gz} > SHA256SUMS )
# gh release create v$VERSION release/* --notes-file CHANGELOG-slice.md
```
注：完整 `release.yml`（matrix 调 build-bundle.sh 6 次 + pack-npm.sh + `gh release create` + `npm publish`）**需实现时补**——gap 是 CI 编排，非可抄业务逻辑；校验/打包逻辑已在 L3/L8 给全。

**(4) 具体数值**：sums 文件名 = `SHA256SUMS`；hash 算法 = sha256；校验失败 = abort（退出码非 0）；缺失 = 放行。

**(5) 有序步骤**：① build-bundle.sh 后追加 `sha256sum > SHA256SUMS` → ② 写 release.yml matrix → ③ 验证 Release 资产含 6 bundle + SHA256SUMS + 主 shim 包。

**(6) 测试**：integration——L3 的 mock release server 带正确 SHA256SUMS → 安装成功；篡改一字节 → abort；assertion——Release 资产清单含 `SHA256SUMS`。

**(7) 证据回指**：`/tmp/tk-research/codegraph/scripts/npm-shim.js:196-216`、`BUNDLING.md:61-65`。

---

### L16 决策 — Index/DB 落 out-of-tree 用户目录，fingerprint 过 fingerprintSegment 消毒（服务 两者）

**(1) 决策**：graph DB **out-of-tree**，per-project 落用户目录——POSIX `~/.token-killer/projects/<fp>/index.db`，Windows `%LOCALAPPDATA%\token-killer\projects\<fp>\index.db`（同一约定，平台映射）。fp = repo-name + hash，过 tk 现有 `fingerprintSegment`（`:`→`-`，Windows 文件名非法）。WAL 要求不落网络/同步盘（OneDrive 会 WAL corruption）。`.tk/` 在仓内**只**放人类共享工件（`wiki.json`、`wiki/pages/**`、`ONBOARDING.md`）+ gitignored staging（`proposed/**`、`cache/**`），DB 永不进仓。

**(2) 要动的文件**：`token-killer/src/core/dataDir.ts`（复用 `fingerprintSegment`、`projectDataDir`；codegraph store 落 `projectDataDir(cwd)/index.db`）；`.gitignore`（确保 DB 路径 + `.tk/proposed`、`.tk/cache` ignore）。

**(3) 可抄代码**：

tk 现有 `fingerprintSegment` + `projectDataDir`（逐字，已是 tk 代码；DB 路径在其下）。源: `/Users/ziyu/Workspace/token-killer/src/core/dataDir.ts:144-150`
```ts
// 已是 tk 代码：colon→dash 仅 Windows，POSIX no-op
export function fingerprintSegment(fingerprint: string): string {
  return process.platform === "win32" ? fingerprint.replace(/:/g, "-") : fingerprint;
}
export function projectDataDir(cwd: string): string {
  return path.join(tokenKillerHome(), "projects", fingerprintSegment(projectFingerprint(cwd)));
}
// codegraph graph store DB 落点（tk-adapted）：
export function indexDbPath(cwd: string): string {
  return path.join(projectDataDir(cwd), "index.db");   // 需实现时新增此 helper
}
```

WAL 模式设置（codegraph 逐字，C 需求物理实现，本节确认落 out-of-tree 才安全）。源对照: codegraph `src/db/index.ts:33`（`journal_mode=WAL`）
```ts
// db 初始化（C 需求拥有；此处确认 WAL 必须 out-of-tree、非网络盘）
db.exec("PRAGMA journal_mode = WAL;");
```
注：`db/index.ts:33` 的精确行**需实现时对照 C 需求确认**；本节只锁定 DB 路径与 WAL-非网络盘约束。

**(4) 具体数值**：DB 文件名 = `index.db`；存放根 = `~/.token-killer/projects/<fp>/`（POSIX）/ `%LOCALAPPDATA%\token-killer\projects\<fp>\`（Windows，tokenKillerHome 平台映射）；fingerprint 消毒 = `:`→`-`（仅 win32）；DB 永不进 git。

**(5) 有序步骤**：① 加 `indexDbPath` helper（复用 `projectDataDir`）→ ② C 需求的 store 用此路径 → ③ `.gitignore` 确认 `.tk/proposed`、`.tk/cache`、任何 `*.db` ignore。

**(6) 测试**：unit——`fingerprintSegment('repo:abc')` 在 win32 返回 `repo-abc`、POSIX 返回 `repo:abc`；assertion——`indexDbPath(cwd)` 不在 `cwd` 子树内（out-of-tree）；`git status` 在 index 后无 `*.db`。

**(7) 证据回指**：`/Users/ziyu/Workspace/token-killer/src/core/dataDir.ts:144-150`、tk PR#28（`:` Windows 非法）；C↔L 冲突裁决（DB out-of-tree，`.tk/` 仅人类工件）。

---

### 仍需用户拍板（本节相关）

- **Node 25 / `--liftoff-only`**：已被 A+D 关闭（ship WASM → 25 排除、两 flag 必带）。请确认接受单一 gate `>=22.5.0 <25.0.0` + vendored Node 24.x（L5/L6/L7）。
- **Code-signing**：Windows Authenticode + macOS notarization 是真正的「下载即跑」缺口（SmartScreen/Gatekeeper、CrowdStrike 可能隔离未签名 node.exe）。v1 现在签（证书 + CI 成本）还是不签 + installer-only 接受首跑 friction？
- **CrowdStrike/AV 冷启动税**：tk 实测每次 spawn ~400–1100ms AV 税，新下载未签名 node.exe 首跑可能被更重扫描。是否申请 IT 排除路径 / 文档化，还是接受首跑延迟？
- **Node pin 刷新节奏**：v24.16.0 钉死可复现，但 tk 自担 Node CVE 更新。固定 pin 还是 floating 24 LTS？
- **Scoop**：是否也发 Scoop（企业 Windows 友好、免管理员）？codegraph 留 TODO，对 Windows-primary 可能值得。

### 与其它需求的绑定（coherence）

- DB 路径（L16）= C 物理 store 的落点；C/D/L 共享「node:sqlite + FTS5、零 native build」不变量，WASM 抽取器（D）使其成立。
- L6/L7 的两个 runtime flag 中 `--liftoff-only` 服务 D 的 WASM 抽取、`--disable-warning` 服务 B 的 agent stdout 洁净。
- 分发的单一 artifact 收敛点是 F 的 VS Code extension（H viewer、I round-trip 都由它承载），extension 内嵌或调用本节 CLI backend——「one backend, two front-ends」。
- 本节是 install/runtime-launch 层；daemon vs per-command-spawn 是独立 perf 决策（M18 conditional branch，K op-count 测后定），不改打包配方。


---

## 需求 M — Cross-cutting best-practices adopt-list + anti-pattern blacklist

本需求是治理层（governance overlay），不新建子系统，而是把 A–L 的实现钉死在一组**可执行的采纳清单**与**可执行的黑名单**上。所有数值与代码都已对照 clone 验证。核心不变量沿用上游：`node:sqlite + FTS5`（C/D/L）、`file:line` on every node（A2/J1）、`provenance` 单列服务三职（B1/J2）、static 层权威 + LLM 仅 host/subscription 付费（B/M14）、lazy-on-read 默认无 daemon（E/M18）。

---

### M1 — 三上下文类压缩边界（治理大法）  服务两者

**决策**: 每一处投影输出必须声明类别 `ContextClass = 'understanding' | 'editing' | 'verification'`；**只有 `understanding` 允许有损**（签名/大纲/切片）；`editing` 必须逐字源码 + 稳定行锚 + content hash，**永不丢 body**；`verification` 只回 diff/hunk/失败行。这是「安全减 token」与「静默任务失败」之间唯一的那条线。

**要动的文件**:
- 新建 `src/codegraph/context/class.ts`（类型 + 守卫）
- 改 `src/codegraph/render/agentDiet.ts`、`render/humanDiet.ts`：每个投影函数返回 `{ class, payload }`
- 改 `src/codegraph/mcp/tools.ts`（F）：每个工具的 result 带 `contextClass` 字段

**可抄代码**（tk-adapted，新写）:
```ts
// src/codegraph/context/class.ts
export type ContextClass = 'understanding' | 'editing' | 'verification';

/** Only 'understanding' outputs may be lossy. editing/verification MUST be byte-exact. */
export function assertLossyAllowed(cls: ContextClass): void {
  if (cls !== 'understanding') {
    throw new Error(
      `lossy projection refused for context class '${cls}': ` +
      `editing requires verbatim source + line anchors + content hash, ` +
      `verification requires diff/hunk/failure-only`,
    );
  }
}

export interface Projected<T> {
  readonly contextClass: ContextClass;
  readonly payload: T;
  /** present iff contextClass === 'editing' — proves no body was dropped */
  readonly contentHash?: string;
}
```

**具体数值**: `editing` 类输出有损率必须为 **0%**（任意 body-drop 即测试失败）；`understanding` 类才进入 M9 的 ~70% 签名折叠。

**有序步骤**:
1. 落 `class.ts` 类型 + `assertLossyAllowed`（独立可测）。
2. 给 agentDiet/humanDiet 每个投影函数挂 `contextClass`，调用 `assertLossyAllowed` 守卫有损分支。
3. MCP 工具 result 透出 `contextClass`，供 K 的回放谐振器（M16）按类区分。

**测试**: 单测 — 对 `editing` payload 调任意签名折叠路径，断言抛错；对 `understanding` 不抛。fixture：一段已知函数体，`editing` 读回逐字 + hash 等于源文件 SHA-256。

**证据回指**: compendium §9.0 + §12.1（Serena/codesearch/FastContext/Repomix 反复区分；Repomix body-drop 标记 experimental）。

---

### M2 — 诚实低置信交还  服务两者

**决策**: 检索结果带 `confidence?: 'high' | 'low'`。`'low'` = 查询只命中孤立常见词（无入口点被 2+ 个不同查询词交叉佐证）；此时工具回一句诚实交接（「建议 explore/trace，结果不完整」）而**不**把结果当完整呈现。纯图遍历时 `undefined`。

**要动的文件**: `src/codegraph/types.ts`（检索结果接口加字段）；`src/codegraph/render/agentDiet.ts`（low 时追加 handoff 文案）。

**可抄代码**（源: `/tmp/tk-research/codegraph/src/types.ts:335`，逐字，许可不限）:
```ts
  /**
   * Retrieval confidence for context-style queries. `'low'` means the query
   * resolved only to isolated common-word matches (no entry point corroborated
   * by 2+ distinct query terms) — callers should surface an honest handoff to
   * explore/trace rather than present the results as comprehensive. Undefined
   * for graph traversals that don't run the search-ranking path.
   */
  confidence?: 'high' | 'low';
```

**具体数值**: `'high'` 阈值 = **≥2** 个不同查询词佐证同一入口点；否则 `'low'`。

**有序步骤**: 1) types 加字段；2) 排序路径计算佐证词数并赋值；3) agentDiet 在 `low` 时拼 handoff 行。

**测试**: 单测 — 单常见词查询（如 `data`）断言 `confidence==='low'` 且输出含 handoff；双词佐证断言 `'high'`。

**证据回指**: codegraph types.ts:342（已验证 :335 起）；compendium §12.2 false-confidence（让 Cody 退出 embeddings 的正是这个假阳）。

---

### M3 — 边的来源标记（解析 vs 推断）  服务两者

**决策**: 每条图边带 `provenance?: 'tree-sitter' | 'scip' | 'heuristic'`。启发式/推断边对 agent 与人类均**可见区分**于解析精确边。

**要动的文件**: `src/codegraph/types.ts`（Edge 接口，与 C 的 edges 表 `provenance` 列同源）。

**可抄代码**（源: `/tmp/tk-research/codegraph/src/types.ts:203`，逐字）:
```ts
  /** How this edge was created */
  provenance?: 'tree-sitter' | 'scip' | 'heuristic';
```

**具体数值**: v1 边来源仅 `'tree-sitter'` 与 `'heuristic'` 两值实际写入（SCIP 是 M18 补充层，emit/consume only）。检索排序与 J 的信任契约只信 `'tree-sitter'`，`'heuristic'` 边在人类/agent 视图中加 `~` 前缀标注。

**有序步骤**: 1) Edge 加字段并落到 C 的 edges 表列；2) 抽取器（D）填值；3) 渲染层对 heuristic 边加可见标注。

**测试**: 单测 — 已知动态 require 推断边断言 `provenance==='heuristic'` 且渲染带标注；直接 import 断言 `'tree-sitter'`。

**证据回指**: codegraph types.ts:204（已验证 :203 起）；compendium §12.4 跨语言/框架间接盲点。

---

### M4 — per-file 陈旧横幅 + 增量键 (path, mtime, size)  服务两者

**决策**: 索引按 `(path, mtimeMs, size)` 记 contentHash；任何 index 之后被改的文件挂横幅，指示 agent **去 Read 实时文件**。tk 已有这把 mtime 缓存（inspect scan cache），**直接复用**。

**要动的文件**: 复用 `src/inspect/extractCache.ts` 的 CacheKey 机制；新建 `src/codegraph/freshness/staleBanner.ts`（与 E 的 lazy mtime-sweep、J8/J9 横幅同源）。

**可抄代码**（源: `/tmp/tk-research/`tk repo `src/inspect/extractCache.ts:12,39`，逐字 — tk 自有）:
```ts
//  • Keyed strictly on (path, mtimeMs, size, SCHEMA_VERSION). Any mismatch is a miss.
export type CacheKey = { mtimeMs: number; size: number };
```
```ts
// src/codegraph/freshness/staleBanner.ts （新写，复用上面的键语义）
export function staleBannerFor(
  file: string,
  indexed: { mtimeMs: number; size: number; contentHash: string },
  live: { mtimeMs: number; size: number },
): string | undefined {
  if (live.mtimeMs === indexed.mtimeMs && live.size === indexed.size) return undefined;
  return `⚠ ${file} edited since index — Read the live file (indexed mtime ${indexed.mtimeMs}).`;
}
```

**具体数值**: 命中判定 = `mtimeMs` 与 `size` 全等才算新鲜；任一不等即挂横幅。复用缓存 30 天 prune 窗口（extractCache 既有）。

**有序步骤**: 1) codegraph 索引写入时复用 CacheKey 语义存 `(mtimeMs,size,contentHash)`；2) lazy 读路径（E）调 `staleBannerFor`；3) J8 per-file / J9 frozen-index 横幅消费它。

**测试**: 单测 — touch 文件改 mtime 后断言返回横幅；未改返回 `undefined`。

**证据回指**: compendium §9 incremental 行 + §12.3 stale-index；tk MEMORY `inspect-scan-cache-shipped`（mtime 键已落地）。

---

### M5 — AST 级变更分类（丢 comment/docstring-only）  服务两者

**决策**: 增量重建用 **AST ChangeType**，不是 text-diff。`COMMENT_ONLY` 与 `DOCSTRING_CHANGED` 从受影响集合**剔除**（零重算/零 host-LLM 调用）；只有 signature/body/new/removed 向下游传播（喂 E 的 BFS-downstream）。

**要动的文件**: 新建 `src/codegraph/incremental/changeType.ts`。

**可抄代码**（源: `/tmp/tk-research/repodoc/repodoc/src/analysis/diff_analysis.py:67,93`，已改写为 TS — RepoDoc 无 license 文件，**按读到的模式重写，不直接拷贝**）:
```ts
// src/codegraph/incremental/changeType.ts （已改写：RepoDoc 无 license，重实现）
export enum ChangeType {
  API_SIGNATURE_CHANGED = 'api_signature_changed',
  NEW_COMPONENT = 'new_component',
  REMOVED_COMPONENT = 'removed_component',
  DOCSTRING_CHANGED = 'docstring_changed',
  CODE_BODY_CHANGED = 'code_body_changed',
  COMMENT_ONLY = 'comment_only',
  NO_CHANGE = 'no_change',
}

const COSMETIC = new Set([ChangeType.COMMENT_ONLY, ChangeType.DOCSTRING_CHANGED]);

/** affected set excludes cosmetic-only changes → zero regen / zero host-LLM call */
export function affectedComponents(
  changes: ReadonlyArray<{ name: string; changeType: ChangeType }>,
): string[] {
  return changes.filter((c) => !COSMETIC.has(c.changeType)).map((c) => c.name);
}
```
> 对照原文（源: diff_analysis.py:93）：`return [c.name for c in self.changes if c.change_type != ChangeType.COMMENT_ONLY]`。RepoDoc 原版只剔 `COMMENT_ONLY`；tk 版**额外剔 `DOCSTRING_CHANGED`**，因为本项目叙事由 host/subscription LLM 生成、docstring 改动不动结构图（M14 口径）。

**具体数值**: 剔除集合 = `{COMMENT_ONLY, DOCSTRING_CHANGED}` → 这两类触发 **0** 次下游重算。

**有序步骤**: 1) 落 enum + `affectedComponents`；2) D 的抽取器对比新旧 AST 产出 ChangeType；3) E 用 affected 集合做 BFS-downstream。

**测试**: 单测 — 仅改注释的 fixture 断言 `affectedComponents()===[]`；改函数签名断言包含该组件。

**证据回指**: RepoDoc diff_analysis.py:67-98（已验证 ChangeType 枚举 + get_affected_components 逐字存在）；landscape verdict matrix「soundest incremental」。

---

### M6 — 引用者 set-diff 精确失效（who_reference_me）  服务两者

**决策**: 每节点带 `who_reference_me`（caller id 列表）。重建时按 path 对齐节点，再从 (a) `code_content` 不等 **或** (b) `who_reference_me` 集差 标脏 — 干净地分开「我代码变了」与「我的调用者变了」。`new ⊆ old`（caller 被删）vs 非子集（caller 新增）是廉价精确信号。

**要动的文件**: `src/codegraph/types.ts`（节点加 `whoReferenceMe: string[]`）；`src/codegraph/incremental/invalidate.ts`（新建）。

**可抄代码**（源: `/tmp/tk-research/repoagent/repo_agent/doc_meta_info.py:128`，逐字字段名取自此处，逻辑改写为 TS）:
```python
    reference_who: List[DocItem] = field(default_factory=list)  # 他引用了谁
    who_reference_me: List[DocItem] = field(default_factory=list)  # 谁引用了他
```
```ts
// src/codegraph/incremental/invalidate.ts （已改写：套用 RepoAgent who_reference_me 语义）
export function dirtyReason(
  old: { codeContent: string; whoReferenceMe: Set<string> },
  fresh: { codeContent: string; whoReferenceMe: Set<string> },
): 'code_changed' | 'callers_changed' | null {
  if (old.codeContent !== fresh.codeContent) return 'code_changed';
  const sameCallers =
    old.whoReferenceMe.size === fresh.whoReferenceMe.size &&
    [...fresh.whoReferenceMe].every((c) => old.whoReferenceMe.has(c));
  if (!sameCallers) return 'callers_changed'; // caller added/removed
  return null;
}
```

**具体数值**: 集差判定 O(n) 单次扫描；无需重算全部下游（对比 path-prefix 的 M20 黑名单：只重算真实 caller 集变化的节点）。

**有序步骤**: 1) 节点存 `whoReferenceMe`（由 C 的 edges 反向聚合）；2) 落 `dirtyReason`；3) E 仅对 `dirtyReason!==null` 的节点重建。

**测试**: 单测 — 改 body 断言 `'code_changed'`；新增一个 caller 断言 `'callers_changed'`；caller 与 body 都不变断言 `null`。

**证据回指**: RepoAgent doc_meta_info.py:128-129（已验证逐字）；landscape「best invalidation」。

---

### M7 — 有界广搜上限 + 自适应预算  服务两者

**决策**: 广搜硬上限作默认：matches/file、files/set、chars/snippet，外加按仓库规模分级的输出预算。搜索是**有界选择阶段**，回分组候选 + 指针，绝不裸 dump 行/文件。复用 tk 既有 `tree --filelimit` / `rg` cap 纪律。

**要动的文件**: `src/codegraph/search/caps.ts`（新建，复用 `src/handlers/common/level.ts` 的 CompressionLevel dial）。

**可抄代码**（tk-adapted，新写；数值与 M8/F 对齐）:
```ts
// src/codegraph/search/caps.ts
export const SEARCH_CAPS = {
  maxMatchesPerFile: 5,
  maxFilesPerSet: 20,
  maxCharsPerSnippet: 400,
} as const;

/** adaptive output budget tiered by repo node-count (chars, matches G1 tiers) */
export function outputBudgetChars(nodeCount: number): 13000 | 18000 | 24000 {
  if (nodeCount < 2000) return 13000;   // small repo — don't bloat
  if (nodeCount < 20000) return 18000;
  return 24000;                          // large repo — still bounded
}
```

**具体数值**: matches/file = **5**；files/set = **20**；chars/snippet = **400**；输出预算 **13000 / 18000 / 24000** chars（与 G1、F8 `maxOutputChars` **逐字一致**，G 拥有这些常量，F/M 仅引用）。

**有序步骤**: 1) 落 caps 常量；2) 搜索阶段强制截断并标注「+N more」；3) 输出层按 `outputBudgetChars` 选 tier。

**测试**: A-B harness 字段 — `search_result_usefulness` + 断言任意单查询输出 chars ≤ 对应 tier。

**证据回指**: compendium §10 bounded-search + adaptive-budget（Probe `--max-tokens`、codesearch、codegraph）。冲突解决：char tier 是可移植代理，token 化待 K 在主目标测得真实 Copilot inline cap 后再表达。

---

### M8 — metadata-first / 按需取  服务 B

**决策**: 搜索默认回紧凑指针（path + 行范围 + 签名），全量代码**仅在显式 expand 调用**时取。对标 FastContext（只回 path + 行范围，从不回探索 trace）。

**要动的文件**: `src/codegraph/mcp/tools.ts`（`tk_search` 默认 metadata-only；`tk_node`/expand 才回 body）。

**可抄代码**（tk-adapted，新写）:
```ts
// search result default shape — pointers only, no body
export interface SearchHit {
  path: string;
  startLine: number;
  endLine: number;
  signature: string;        // collapsed (M9), never the body
  // body is NOT here — fetched via tk_node(id) expand call
}
```

**具体数值**: 默认 payload 每命中**仅** path + 2 行号 + 1 签名（~1 行）；body 取用单独一次 expand 调用，受 M7 caps 约束。

**有序步骤**: 1) `tk_search` 回 `SearchHit[]`；2) `tk_node` 接 id 回 body；3) server-instructions 说明 ladder（M12）。

**测试**: A-B harness — `duplicate_reads` 键 `(normalized_path, selector_type, selector_value, file_hash)`；断言搜索 arm 不含 body 字节。FastContext 量级 ~76% 读 token（SWE-Pruner）。

**证据回指**: compendium §10 metadata-first + on-demand；FastContext（research §8.2，SWE-QA 最高 60.3% token 削减）。

---

### M9 — 签名折叠投影（~70%，M1 门控）  服务两者

**决策**: 容器 → 大纲、丢 body，作为 `understanding` 类代码读默认，复用 tk 既有 `read --level aggressive`。~70% token 削减且保结构。**永不**用于 `editing` 类（见 M1）。

**要动的文件**: 复用 `src/handlers/common/level.ts`（已验证 `aggressive` 层存在）；`src/codegraph/render/agentDiet.ts` 调用前先过 M1 守卫。

**可抄代码**（源: tk repo `src/handlers/common/level.ts:11-21`，逐字 — tk 自有）:
```ts
//   aggressive  layer 3 max (counts/sample only)
export type CompressionLevel = "none" | "minimal" | "balanced" | "aggressive";
```

**具体数值**: `understanding` 默认 level = `aggressive`（目标 ~**70%** 削减）；`editing` 强制 `none`（M1 守卫拦截任何升级）。

**有序步骤**: 1) agentDiet 默认 `aggressive`；2) 调用前 `assertLossyAllowed`；3) editing 路径硬绑 `none`。

**测试**: 单测 — 同一容器，`understanding` 输出无 body 且 char 数 ≤ 原 ~30%；`editing` 输出逐字等于源。

**证据回指**: compendium §10 signature-collapse（Repomix/codegraph/Continue ~70%）；tk `read --level aggressive` 已有。

---

### M10 — goal-hint + 迭代再查询  服务 B

**决策**: 每个 search/context 工具接可选 `task`/`goal` 查询参数，agent 陈述信息需求以提精度；配合迭代再查询（拿生成结果做下一次查询，因图再查询廉价）。

**要动的文件**: `src/codegraph/mcp/tools.ts`（工具 schema 加 `goal?: string`）。

**可抄代码**（MCP 工具 schema 片段，新写）:
```json
{
  "name": "tk_search",
  "inputSchema": {
    "type": "object",
    "properties": {
      "query": { "type": "string" },
      "goal":  { "type": "string", "description": "optional: state your information need to raise retrieval precision" }
    },
    "required": ["query"]
  }
}
```

**具体数值**: `goal` 可选、不传则退化为纯 query；图再查询单次 < **1ms**（FTS/graph，非 LLM）。

**有序步骤**: 1) schema 加 `goal`；2) 排序时用 goal 词加权；3) 文档示范迭代再查询。

**测试**: A-B harness — 同任务带/不带 goal，对比 `search_result_usefulness` 与 token；目标量级 SWE-Pruner 39% token / 26.8% cost，<1% quality loss。

**证据回指**: research §8.1-8.2（SWE-Pruner goal-hints；RepoCoder iterative >10%）。

---

### M11 — log→code 投影  服务 B

**决策**: 解析 compiler/test 输出到引用的 file:line 范围并回这些，不回裸 log。这是 tk 高价值 noisy-output 桶（Probe failure-first）。

**要动的文件**: `src/codegraph/projection/logToCode.ts`（新建，复用 tk surface-10 命令输出角色）。

**可抄代码**（tk-adapted，新写；需实现时补具体 PowerShell/tsc 解析正则）:
```ts
// src/codegraph/projection/logToCode.ts
const REF = /(?<path>[\w./\\-]+\.\w+):(?<line>\d+)(?::(?<col>\d+))?/g;

export function logToCodeRefs(rawLog: string): Array<{ path: string; line: number; col?: number }> {
  const out: Array<{ path: string; line: number; col?: number }> = [];
  for (const m of rawLog.matchAll(REF)) {
    out.push({ path: m.groups!.path, line: Number(m.groups!.line),
               col: m.groups!.col ? Number(m.groups!.col) : undefined });
  }
  return out;
}
// 需实现时补：Windows PowerShell 输出 drift（CRLF / GBK）下的 file:line 提取健壮性，
// 参见 tk MEMORY cozyultra GBK encoding。
```

**具体数值**: 失败优先 — 先回失败行 file:line，成功噪声丢弃；snippet 受 M7 的 400 chars 约束。

**有序步骤**: 1) 落 `logToCodeRefs`；2) 接 tsc/vitest 输出；3) Windows 编码健壮性补丁。

**测试**: 单测 — 已知 tsc 错误日志 fixture 断言提取出正确 file:line 集；纯成功日志断言空集。

**证据回指**: compendium §10 log→code（Probe）。注意 Windows PS 输出 drift 风险（tradeoff matrix 已标）。

---

### M12 — cheap-outline-first MCP ladder（≤4 工具，hand-rolled stdio）  服务两者

**决策**: `read_structure`（廉价大纲）→ `read_contents`（需要时才全量）→ ask/expand。经 MCP 交付，**≤4 工具** + 一段 server-instructions；手写 JSON-RPC stdio，**无 SDK 依赖**（合 tk no-native-dep 不变量）。

**要动的文件**: `src/codegraph/mcp/server.ts`（手写 stdio JSON-RPC）；`src/codegraph/mcp/tools.ts`。

**可抄代码**（tk-adapted，新写；4 工具清单与 F 对齐）:
```ts
// ≤4 tools, mirrors F's tk_explore/tk_search/tk_node/tk_callers
export const TOOLS = ['tk_explore', 'tk_search', 'tk_node', 'tk_callers'] as const;

export const SERVER_INSTRUCTIONS =
  `Outline-first ladder: call tk_explore/tk_search for compact pointers; ` +
  `only call tk_node to expand a specific node's body; tk_callers for who-calls-me. ` +
  `Results marked confidence:'low' are incomplete — explore/trace, do not treat as final.`;
```

**具体数值**: 工具数 = **4**（硬上限，"fewer tools steer better"）；传输 = stdio（无 daemon，合 F3/M18）；零 npm MCP SDK 依赖。

**有序步骤**: 1) 手写 stdio JSON-RPC framing；2) 注册 4 工具 + server-instructions；3) `TK_MCP_TOOLS` env 可空（K 的 WITHOUT arm，F10）。

**测试**: 单测 — 启动 server，列工具断言恰 4 个且含 server-instructions；空 `TK_MCP_TOOLS` 断言工具表为空（K baseline）。

**证据回指**: landscape（DeepWiki 3-tool ladder 是其成为默认的分发杠杆）；codegraph hand-rolled stdio。

---

### M13 — 声明式 repo-checked 控制文件 + 硬上限  服务 A

**决策**: 人类面页面控制用声明式仓库内控制文件（DeepWiki `.devin/wiki.json` 风格），页面权威（「不多不少」），硬上限：30/80 页、100 notes、10k chars/note，让 host-LLM 成本**可预测有界**。

**要动的文件**: `.tk/wiki.json`（仓库内、人类共享工件，I 的 round-trip 源）；`src/codegraph/wiki/control.ts`（解析 + cap 校验）。冲突解决：DB 出树，**仅** wiki.json/wiki/pages 等人类工件进 `.tk/`。

**可抄代码**（tk-adapted，新写；caps 取自 DeepWiki，格式取 JSONC 因 tk 已解析 JSONC）:
```ts
// src/codegraph/wiki/control.ts
export const WIKI_CAPS = {
  maxPagesSoft: 30,
  maxPagesHard: 80,
  maxNotes: 100,
  maxCharsPerNote: 10_000,
} as const;

export interface WikiControl {
  pages: Array<{ id: string; title: string; sources: string[] }>; // authoritative: no more, no less
  notes?: Array<{ id: string; text: string }>;
}

export function validateCaps(c: WikiControl): string[] {
  const errs: string[] = [];
  if (c.pages.length > WIKI_CAPS.maxPagesHard) errs.push(`>${WIKI_CAPS.maxPagesHard} pages`);
  if ((c.notes?.length ?? 0) > WIKI_CAPS.maxNotes) errs.push(`>${WIKI_CAPS.maxNotes} notes`);
  for (const n of c.notes ?? []) if (n.text.length > WIKI_CAPS.maxCharsPerNote) errs.push(`note ${n.id} >10k chars`);
  return errs;
}
```

**具体数值**: 页 soft **30** / hard **80**；notes **100**；chars/note **10000**。（still-open：DeepWiki 是 SaaS 口径，用户需确认这些上限适配 project-local 规模。）

**有序步骤**: 1) 落 caps + `validateCaps`；2) 生成前校验、超限拒绝；3) I 的 round-trip 以此为权威页面集。

**测试**: 单测 — 81 页断言报错；80 页通过；10001-char note 报错。

**证据回指**: landscape（DeepWiki `.devin/wiki.json`）。控制文件格式 = JSONC（still-open，coherent pick）。

---

### M14 — 仅订阅/host LLM，零 API key/egress  服务两者

**决策**: 凡需 LLM，**仅**走订阅模式（CodeWiki caw 经本地 claude/codex OAuth）或 host re-prompt（slash-command）；**永不**内置 API key、零 model egress。一切需 LLM 处一律框架为「喂 host agent 生成」或「让用户订阅付费」。这是 B 的生成层契约，也是固定 strong-lean。

**要动的文件**: `src/codegraph/wiki/generate.ts`（只暴露 host slash-command 入口 `/tk understand` + 可选 caw CLI 调用，**无任何 apiKey 参数/env 读取**）。

**可抄代码**（tk-adapted，新写 — 守卫式，禁止任何 egress）:
```ts
// src/codegraph/wiki/generate.ts
export type LlmTier = 'host-reprompt' | 'subscription-cli';

/** HARD GUARD: never read an API key, never open a network socket to a model endpoint. */
export function assertNoEgress(env: NodeJS.ProcessEnv): void {
  for (const k of ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY']) {
    if (env[k]) {
      // we do not USE it — we refuse to, to prove zero tool-embedded egress
      throw new Error(`refusing to use ${k}: tk codegraph spends zero model tokens; ` +
        `narrative generation runs via host re-prompt or your subscription CLI only`);
    }
  }
}
```

**具体数值**: tool-embedded model 调用 = **0**；API token 花费 = **0**。生成只在 `host-reprompt` 或 `subscription-cli` 两 tier。

**有序步骤**: 1) 落 `assertNoEgress` 守卫；2) wiki 生成仅经 slash-command/caw；3) B 的 provenance 列把生成结果标 `llm`，检索 `WHERE provenance='static'` 过滤之。

**测试**: 单测 — 设 `ANTHROPIC_API_KEY` 后调生成入口断言抛错（证明拒用）；K 的 Job-B 测量 arm 断言无 LLM 调用。

**证据回指**: landscape（CodeWiki caw backend）+ 固定 strong-lean。

---

### M15 — 内建 per-operation token 测量（uncached-input 为主指标）  服务两者

**决策**: 每操作记日志（RepoDoc log_operation → metadata.json），给 full-gen vs incremental 现成 A/B 分母。主指标 = **uncached_input_tokens**，不是 total（cache-read >97% 测的是 replay 不是浪费）。遥测集: `raw_bytes, estimated_raw/filtered_tokens, uncached_input_tokens, tool_calls, duplicate_reads(键 normalized_path+selector_type+selector_value+file_hash), search_result_usefulness, success_rate, omission_bug_rate, fallback_rate`。

**要动的文件**: `src/codegraph/telemetry/logOperation.ts`（复用 tk 既有 measured-not-estimate ledger，never-sum 物理排除规则）。

**可抄代码**（tk-adapted，新写；遥测字段集逐字落实）:
```ts
// src/codegraph/telemetry/logOperation.ts
export interface OpRecord {
  op: string;
  raw_bytes: number;
  estimated_raw_tokens: number;
  estimated_filtered_tokens: number;
  uncached_input_tokens: number;        // PRIMARY metric
  tool_calls: number;
  duplicate_reads: number;              // keyed (normalized_path, selector_type, selector_value, file_hash)
  search_result_usefulness: number;
  success_rate: number;
  omission_bug_rate: number;            // from M16 fallback-replay
  fallback_rate: number;
}
```

**具体数值**: 主指标 = `uncached_input_tokens`；cache-read 占比 >**97%** 时 total-token 口径判定为「测 replay」无效。duplicate_reads 去重键四元组固定。

**有序步骤**: 1) 落 OpRecord + append-only ledger；2) MCP 工具每调用记一条；3) K 用其作 A/B 分母（never-sum 入 saved_tokens）。

**测试**: 单测 — 两次相同 selector 读断言 `duplicate_reads===1`；断言 ledger 永不把 Track-2 opportunity 加入 saved_tokens。

**证据回指**: compendium §11 telemetry set + §12.10「优化错的数字」；tk measured-ledger。

---

### M16 — fallback-replay 遗漏 bug 谐振器  服务两者

**决策**: 投影开启跑任务；若失败或重试才成功，从同一 checkpoint 重跑、仅把投影证据升级为 raw/exact；若 失败→成功，记一个 context-omission bug。报中位数 + 离散度（run-to-run 方差高）。这是证明压缩**安全**（不只是小）的验收门。

**要动的文件**: `scripts/codegraph-fallback-replay.ts`（A/B 谐振器，K 的 SUT 入口）。

**可抄代码**（tk-adapted，新写；K 的 Job-B arm）:
```ts
// scripts/codegraph-fallback-replay.ts
export async function fallbackReplay(task: Task, runs = 5): Promise<{ omissionBugs: number; medianTokens: number }> {
  let omissionBugs = 0; const tokens: number[] = [];
  for (let i = 0; i < runs; i++) {
    const projected = await runWithProjection(task);     // M8/M9 on
    if (!projected.ok) {
      const exact = await runFromCheckpoint(task, { evidence: 'raw-exact' }); // escalate same evidence
      if (exact.ok) omissionBugs++;                      // failure→success = omission bug
    }
    tokens.push(projected.uncachedInputTokens);
  }
  tokens.sort((a, b) => a - b);
  return { omissionBugs, medianTokens: tokens[Math.floor(tokens.length / 2)] };
}
```

**具体数值**: runs 默认 **5**；报中位数 + spread；omission-bug 计数 = failure→success 翻转次数（验收门：codegraph 检索压缩 omission_bug_rate 必须 0 才算安全）。

**有序步骤**: 1) 落谐振器；2) 接 K 的任务 oracle；3) CI 跑并断言 omission_bug_rate。

**测试**: A-B harness — 故意丢一处关键证据的 fixture 断言 omission_bug ≥1；完整投影断言 0。

**证据回指**: compendium §11（最干净文档化方法）+ SWE-ContextBench（坏上下文伤成功率）。

---

### M17 — repo-local 政策文件 + 答案充分性  服务 B

**决策**: 仓库内 agent 政策/标记文件（tk 已写）steer agent，但**因纯指令 steering 弱**，必须配 tool-contract + answer-sufficiency（工具须回够多，让 agent 不退回裸 grep）。不靠政策文件单打。

**要动的文件**: 复用 tk 既有 marker 写入；`src/codegraph/mcp/tools.ts`（保证每工具 result 自足，含 file:line + 签名 + handoff）。

**可抄代码**（tk-adapted，新写 — 充分性断言）:
```ts
// answer-sufficiency: a search hit MUST carry enough to avoid a raw-grep fallback
export function isSufficient(hit: SearchHit): boolean {
  return Boolean(hit.path && hit.startLine && hit.signature); // pointer + anchor + shape
}
```

**具体数值**: 每命中至少含 path + startLine + signature 三要素方算充分；不足则降级为 M2 的 `confidence:'low'` handoff。

**有序步骤**: 1) marker 文件写 codegraph 用法指引；2) 工具 result 过 `isSufficient`；3) 不足触发 handoff 而非静默。

**测试**: 单测 — 缺 signature 的 hit 断言 `isSufficient===false` 且触发 handoff。

**证据回指**: compendium §10 policy-file + §12.7（codegraph 维护者：instruction-only 弱 vs tool-contract+sufficiency）。

---

### M18 — 过度工程线（DEFER / REFUSE）  服务两者

**决策**:
- **REFUSE 作默认**: embeddings/vector-ANN、RL-trained explorer（需 model/key/egress/训练，与不变量冲突）。
- **DEFER 为条件分支**: daemon + native file watcher（重：lockfile/socket/Windows named pipe，见 tk EBUSY/Windows 史）— 仅当 op-count 证明 cold-start 不可接受才进条件分支。
- **COMPLEMENT 非 core**: LSP/SCIP（SCIP-as-interchange = emit/consume only）。
- **OPTIONAL**: PageRank（排序升级，非 v1 必需）。

**要动的文件**: 文档锚 `docs/codegraph/codegraph-impl-mining-goal.md`（记录这条线）；代码层无新增（即「不做」）。

**具体数值**: v1 = single-process-per-session stdio，daemon = **0**（冲突解决 E/F/J/M：lazy-on-read 默认）。daemon 翻转阈值 = K 的 op-count/cold-start 测量（**still-open，用户设延迟预算或确认 v1 never**）。

**有序步骤**: 1) 文档钉死 REFUSE/DEFER/COMPLEMENT/OPTIONAL 四档；2) v1 不实现任何一项；3) daemon 分支留 K 测量后再议。

**测试**: 治理断言 — 代码库 grep 确认无 embeddings/vector dep、无 daemon socket、无 PageRank 入 v1 默认路径。

**证据回指**: compendium §9-10 compatibility 列（🔴 embeddings/RL，🟡 daemon/LSP）+ tk Windows EBUSY/cold-start/AV memories。**Overrule**: 推翻旧 ADR-0013/0016 把 daemon+watcher 当 core 的框架 — 这里基于 tk 自身 Windows 史正面降级为条件分支。

---

### M19 — 黑名单: eval()/动态执行 LLM 输出  服务两者

**决策**: **禁** `eval()`/`exec()`（或任何动态执行）于 LLM 输出。LLM 响应用严格 schemaed parser（`JSON.parse` + try/catch + 形状校验）解析，**永不执行**。脆弱 tag-splitting（`response.split('<TAG>')[1]`）作**唯一** parser 也禁 — 抽取后必须有 typed schema 校验步。

**反例代码**（源: `/tmp/tk-research/codewiki/codewiki/src/be/cluster_modules.py:124`，逐字 — **这是 NOT to do**）:
```python
        response_content = response.split("<GROUPED_COMPONENTS>")[1].split("</GROUPED_COMPONENTS>")[0]
        module_tree = eval(response_content)        # ← RCE: 任意 LLM/投毒响应即执行
        if not isinstance(module_tree, dict):       # ← 校验在 eval 之后，已晚
            logger.error(...)
```

**正解代码**（tk-adapted，新写）:
```ts
// safe replacement: parse, never execute; schema-validate AFTER extraction
export function parseModuleTree(response: string): Record<string, unknown> {
  const m = /<GROUPED_COMPONENTS>([\s\S]*?)<\/GROUPED_COMPONENTS>/.exec(response);
  if (!m) throw new Error('missing GROUPED_COMPONENTS block');
  let parsed: unknown;
  try { parsed = JSON.parse(m[1]); } catch { throw new Error('GROUPED_COMPONENTS not valid JSON'); }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
    throw new Error('expected object'); // typed shape validation BEFORE use
  return parsed as Record<string, unknown>;
}
```

**具体数值**: LLM 输出 `eval`/`exec` 调用数 = **0**；解析后必有 ≥1 步 shape 校验。

**有序步骤**: 1) 全库 grep 禁 `eval(`/`new Function(` 于解析路径；2) 用 `parseModuleTree` 式 JSON.parse + 校验；3) lint 规则固化。

**测试**: 单测 — 投毒响应（含 JS 代码）断言不执行、抛解析错；合法 JSON 块断言返回对象。

**证据回指**: codewiki cluster_modules.py:124（已验证逐字 `eval(response_content)`）。

---

### M20 — 黑名单: path-substring/祖先-only 增量失效  服务两者

**决策**: **禁** `path.startswith(prefix)` 或 module-tree 祖先成员资格单独做失效 — 它忽略真实 call-graph 依赖者。用 M5（AST ChangeType）+ M6（who_reference_me set-diff）替代。

**反例代码**（源: `/tmp/tk-research/codewiki/codewiki/cli/commands/generate.py:124`，逐字 — **NOT to do**）:
```python
            prefix = subpath_prefix + "/"
            for path in changed:
                if path.startswith(prefix):          # ← 粗糙：漏掉跨模块真实 caller
                    filtered.append(path[len(prefix):])
```

**正解**: 用 M6 的 `dirtyReason`（who_reference_me set-diff），见上。

**具体数值**: 失效判定**禁**用任何纯 path-prefix；必须经 call-graph 依赖者集（M6）。

**有序步骤**: 1) lint/review 禁 path-prefix 作失效唯一依据；2) 走 M5+M6。

**测试**: 单测 — 跨模块 caller（路径不共享前缀）改动断言被正确标脏（path-prefix 法会漏，set-diff 法命中）。

**证据回指**: codewiki generate.py:124（已验证逐字 `path.startswith(prefix)`）；landscape「Avoid CodeWiki's incremental」。

---

### M21 — 黑名单: LLM 幻觉图/结构  服务 A

**决策**: **禁** LLM 自由生成的 mermaid/graph/diagram。每张给人类渲染的图必须**从解析图派生**，LLM 只可 label/narrate 解析器产出的节点，**绝不发明边**。

**要动的文件**: `src/codegraph/wiki/diagram.ts`（图只接受 parsed nodes/edges 输入，拒绝 free-text）。

**可抄代码**（tk-adapted，新写 — 结构来自图，非 LLM）:
```ts
// mermaid is DERIVED from the parsed graph; LLM may only supply labels
export function mermaidFromGraph(
  nodes: Array<{ id: string; label: string }>,
  edges: Array<{ from: string; to: string; provenance: string }>, // from C's edges table
): string {
  const lines = ['graph TD'];
  for (const e of edges) lines.push(`  ${e.from} --> ${e.to}`); // edges are parser-ground-truth only
  return lines.join('\n');
}
```

**具体数值**: 渲染图中 LLM-发明边 = **0**；所有边来自 C 的 edges 表（`provenance` 已知）。

**有序步骤**: 1) 图渲染只接 graph 输入；2) LLM 仅供节点文案；3) review 禁 LLM 直出 mermaid。

**测试**: 单测 — 给定 nodes/edges 断言 mermaid 边集 === 输入边集；无额外边。

**证据回指**: landscape（deepwiki-open mermaid 幻觉、~2280-LOC 巨组件 inline 生成+prompt，「clearest what-not-to-copy」）。

---

### M22 — 黑名单: 无图整仓裸 dump  服务两者

**决策**: **禁** 无图整仓裸 dump（Davia 1000-file / 130k-token，重读一切、无增量）。base 必须是真解析图 + 有界检索（M7/M8）；裸 dump 文件正是 token 目标的反面。

**要动的文件**: 无新增 — 即「base 永远是图，不提供 whole-repo dump 工具」。

**具体数值**: 单次检索默认输出 ≤ M7 tier 上限（13000/18000/24000 chars），**永不** 130k 量级裸 dump。

**有序步骤**: 1) 不暴露 whole-repo dump MCP 工具；2) 所有读经 M8 metadata-first + M7 caps。

**测试**: 治理断言 — 无任何工具输出超 24000 chars 上限（除显式多次 expand）。

**证据回指**: landscape（Davia 130k 裸 dump，无图无增量）。

---

### M23 — 黑名单: 种子默认 admin + 明文凭据 + LIKE '%q%' 搜索  服务两者

**决策**: **禁** 源码/配置明文凭据；**禁** init 时种子默认 admin 用户/密码；搜索必须用 **FTS5/BM25**，不用 SQL substring `LIKE`。

**反例代码**（源: `/tmp/tk-research/opendeepwiki/src/OpenDeepWiki/Infrastructure/DbInitializer.cs:126`，逐字 — **NOT to do**）:
```csharp
    private static async Task InitializeAdminUserAsync(IContext context)
    {
        const string adminEmail = "admin@routin.ai";    // ← 出厂默认管理员
        const string adminPassword = "Admin@123";       // ← 明文出厂口令
```

**正解**: 无种子账户；搜索走 C 的 `nodes_fts`（FTS5 + BM25），见 C 的 DDL。仅当 npm-shim-on-user-Node 路径检测到 SQLite 无 FTS5 时，C7 守卫降级为 LIKE-scan（且仅那条退路）。

**具体数值**: 种子账户数 = **0**；明文凭据数 = **0**；搜索主路径 = FTS5/BM25，`LIKE '%q%'` 仅作无-FTS5 退路（冲突解决：vendored-Node bundle 的 SQLite 已知带 FTS5，故主路径不触发退路）。

**有序步骤**: 1) init 不建任何账户；2) 搜索绑 FTS5；3) FTS5 缺失探测 → LIKE 退路 + 警示。

**测试**: 治理断言 — grep 无明文 password 常量；搜索单测断言走 FTS5 path（除 no-FTS5 fixture）。

**证据回指**: opendeepwiki DbInitializer.cs:126-127（已验证逐字 `admin@routin.ai` / `Admin@123`）；landscape（SearchDoc LIKE）。

---

### M24 — 黑名单: 每查询 12k-token LLM 摘要作搜索路径  服务 B

**决策**: **禁** 把每查询的 LLM 摘要（OpenDeepWiki 12k-token/query）当搜索路径。搜索必须廉价（FTS/graph，亚毫秒），不是每查询一次 LLM 往返 — 那反转 token 目标且加延迟。

**要动的文件**: `src/codegraph/search/`（搜索零 LLM 调用，确定性）。

**具体数值**: 每搜索 LLM 调用 = **0**；搜索延迟目标 < **1ms**（FTS/graph）；对比反例 12000 tokens/query。

**有序步骤**: 1) 搜索路径纯 static（B1 provenance 过滤）；2) review 禁搜索内调 LLM。

**测试**: A-B harness — Job-B 测量 arm 断言搜索 0 LLM 调用、确定性（K 在 secondary host 干净测量）。

**证据回指**: landscape（OpenDeepWiki SearchDoc = 12k-token LLM 摘要/query）。

---

### M25 — license 边界（用户 2026-06-20 拍板：自用放宽，分发前重写）  服务两者

**决策（推翻原"硬拷贝边界"）**: 本工具为**个人自用、不向外分发**，版权法管的是再分发而非私下自用 → license 拷贝边界**放宽**：任何源（含 **gitnexus** PolyForm-NC、**codewiki / repodoc** 无 license 文件）的代码都**可直接抄用**，不强制重写。"也没全用、只取片段"进一步降低关切（小功能片段多数够不上可版权性）。
- **唯一保留的保险（书签，非约束）**: 凡逐字抄自**非 permissive 源**（gitnexus / codewiki / repodoc）的片段，在其 `源:` 注后加 `[非分发安全]` 标记 —— 纯当书签，让**万一将来要公开发布 / 发 npm 时**一键定位重写。permissive 源（codegraph MIT、understand-anything/davia/repoagent/repograph 等 MIT/Apache）**无需任何处理**。
- tk 自身 license 维持 permissive（MIT，沿用既有轴）。

**许可实况（2026-06-20 实地核对 LICENSE 文件）**: codegraph = **MIT**；understand-anything / davia / deepwiki-open / opendeepwiki = MIT；repoagent / repograph = **Apache-2.0**；gitnexus = **PolyForm Noncommercial**；codewiki / repodoc = **无 LICENSE 文件（默认全保留）**。

**具体数值**: 自用前提下拷贝行数无上限；`[非分发安全]` 标记覆盖 = gitnexus + codewiki + repodoc 的全部逐字片段。

**有序步骤**: 1) 抄自非 permissive 源的片段加 `[非分发安全]` 书签；2) 若项目状态从"自用"转为"分发"，按书签清单把这些片段重写为 clean-room 实现；3) 否则不阻塞实现。

**测试**: 书签断言 —— gitnexus/codewiki/repodoc 来源的 `源:` 注均带 `[非分发安全]`（仅在切换到分发模式时触发重写 gate；自用模式此 gate 关闭）。

**证据回指**: landscape license 列 + 本节实地核对（gitnexus PolyForm-NC；codewiki/repodoc 无 license；codegraph MIT）。

> **注**: 原 M25"硬边界 / GitNexus 0 行"前提是 tk 要分发；用户确认自用后该前提解除（与 Q9 代码签名同理 —— 前提变，结论随之放宽）。本人非律师，依据为 license 基本常识：MIT/Apache=宽松可抄、PolyForm-NC=禁商用、无 license=默认全保留（约束的是再分发）。

---

### 跨需求一致性绑定（M 作为治理层）

- **M1 类边界**门控 M9 签名折叠（仅 understanding 有损）、K 的 M16 谐振器按类区分、F 工具透出 `contextClass`。
- **M2/M3** 的 `confidence`/`provenance` 字段是 J 信任契约的实现原语，且 `provenance='static'` 过滤（B1）让 M24/M14 的搜索零 LLM。
- **M4** 复用 tk `extractCache` 的 `(path,mtimeMs,size)` 键，喂 E 的 lazy-sweep 与 J8/J9 横幅（无 daemon，合 M18）。
- **M5+M6** 是 E 增量的唯一合法失效路径，直接否决 M20 的 path-prefix。
- **M7 char tier (13000/18000/24000)** 与 G1/F8 **逐字一致**，G 拥有常量、F/M 仅引用；token 化待 K 测量。
- **M14 零 egress 守卫** + **M15 uncached-input 主指标** + **M16 omission-bug 门**三者共同保证 K 能在 secondary host 确定性测 Job-B、在 small-N 协议测 Job-A。
- **M18** 把 daemon/embeddings/PageRank 钉在 v1 外，守住 Windows-primary 安全链。

### 仍需用户拍板（still-open）

1. **M18 daemon 阈值**: op-count 触发条件分支的具体冷启动延迟预算（或确认 v1 never）。
2. **M13 caps**: 30/80 页、100 notes、10k chars/note 沿用 DeepWiki SaaS 口径，需确认是否适配 project-local 规模或设 tk 专属上限。
3. **M18 SCIP**: emit/consume 是否进 v1，还是严格 v2 interop 轴 — 取决于语言覆盖野心。


---

## 被推翻的旧决定

以下旧决策被本计划正面推翻，每条附理由：

**ADR 0013–0016 / 旧"graph-center synthesis, search/read lane only, v1 navigation-only" 框架**
- 推翻"v1 仅导航 / 人类编辑窗延后 v2"（A/I）：锚点 2 使人类协作 v1 同等，GitNexus/Understand-Anything/RepoDoc 证明图底座产出人类视图近乎零额外构建成本（同一 store 第二个 formatter），延后是无谓损失。可编辑往返（proposed↔pages + human-fence + 300ms 回写）v1 即交付。
- 推翻旧"协作＝只读 wiki"框架（I）：只读只是默认档，可编辑沉淀（控制文件 + 人类 fence 往返）是一等档——人写不回的知识在会话间蒸发。

**PageRank / 排序**
- 推翻把 PageRank 放进底座的隐含倾向（A）：参考实现以"纯结构、无 PageRank、无 embeddings"达到 47%/58% benchmark，PageRank 承诺 OUT of v1（可选 v2 杠杆）。

**打包（Repomix/aider）作为竞争底座**
- 推翻把 Family B 打包当 BASE 候选（A）：打包回答不了任何关系查询，降级为 Agent 食谱内的压缩函数（签名折叠），是步骤不是 store。

**Embeddings / 语义检索作为核心或召回升级**
- 推翻把 embeddings 留作"可考虑的召回升级"（A/B/J/C）：在无 key/无出网 + Windows 可移植 + 已记录的假自信失败三轴上全 🔴 且不可验证，整体 OUT（非"deferred"）；similar_to/related 边仅作 LLM 撰写的人类面提示，绝不进 Agent ranker；任何向量命中须重锚到真实 nodes(file_path,start_line) 行并分级才能呈现。

**存储底座**
- ADR-0014「node:sqlite + Node≥22.5 CONTINGENT on install-base」UPGRADE 为 COMMITTED（C/L）：node:sqlite 是唯一同时满足全部锚点的引擎（零原生编译对 Windows 主目标强制；gitnexus 的 native lbugjs.node 证明替代在 Windows 破）；install-base 风险由 vendored Node 24 bundle 中和，contingency 消解。
- ADR-0015「node:sqlite vs graph-DB，WASM 可移植替代 open」RESOLVED favor node:sqlite（C）：gitnexus WASM 路径仅浏览器；其 CLI/MCP 路径（我们的真实目标）需 native lbugjs.node 二进制，并不避免原生编译，且 PolyForm-NC 许可。Cypher graph-DB 作默认被拒。
- 推翻"typed/per-type 表更丰富"倾向（C）：选通用单 nodes(kind)/edges(kind)，使代码+文档+概念异构同进一个 FTS 索引、加 kind 是取值不是 DDL 迁移；per-type 表（Ladybug）仅留作 v2 视图。

**better-sqlite3 / 外部 graph-DB**
- 推翻旧"better-sqlite3 / 外部 graph-DB"倾向（A）：底座是单文件 node:sqlite + FTS5，非 KuzuDB/Neo4j/FalkorDB。

**Node 版本闸门不一致**
- 推翻裸"node:sqlite + Node≥22.5 contingent"（D/L）：与 WASM OOM 约束 reconcile 为单一 committed 闸门 `>=22.5.0 <25.0.0` + `--liftoff-only`；任一约束单独都给不出可运行底。L 的 L5/L7 stillOpen 由 A+D 确认"WASM 已发布"而 CLOSED。
- 推翻 tk 现有 `engines:'>=20'` 地板（L）：升至 22.5 bootstrap 硬阻断；'>=20' 会让 node:sqlite 调用在运行时抛混乱错误。
- 推翻 cpus()-sized parser worker pool 假设（D）：承诺单一可回收 worker——N 个 isolate 倍增 WASM 堆压 + Windows AV spawn tax。

**LSP/SCIP 作核心**
- 推翻把 LSP/SCIP 当候选核心（A/D）：每语言运行时/indexer 安装正是 Windows friction 主锚点禁止的，降为可选 v2 complement。

**新鲜度模型 / daemon**
- 推翻"tk 成为 per-session MCP server"作为新鲜度模型（E/F）：新鲜度不由常驻 server/daemon 携带，索引持久落盘 + 惰性 on-read 刷新；per-session server 可前置查询但默认不拥有 watcher/daemon——Windows 安全（WSL2 /mnt + EBUSY/pipe/AV 史）正面压过常驻假设。
- 推翻 codegraph daemon+native-watcher 作默认同步（E）：降为显式 opt-in；codegraph 自身在主平台面（WSL2 Windows-drive 挂载）硬禁 watcher。
- 推翻 CodeWiki 子串路径 + 模块树祖先失效（E/M20）：被点名"粗糙且不可靠"，改用 RepoDoc 下游 BFS + RepoAgent referencer set-diff。
- 推翻 DeepWiki 定时重生（小时-天延迟）（E）：对交互式会话内编辑目标不适用，改 opt-in git hook 提交级精确。
- 推翻把新鲜度当 v2/Agent-only（E）：人类新鲜度徽章与 Agent banner 同版交付。

**Agent 交付面**
- 推翻"MCP 是主目标交付路径"隐含假设（F）：企业 VS Code Copilot 上 MCP-in-Copilot 默认管理员禁用，VS Code 扩展（LM Tool API）必须主、MCP 次。
- 推翻"PATH shim 是 VS Code Copilot 上稳健默认交付"倾向（F）：shim 是较弱的赌注，只达 run_in_terminal（宿主已用 compressOutput 吃掉），PATH 企业可管；shim 仅保留作终端命令输出（surface 8），非 B 检索通道。
- 推翻 @modelcontextprotocol/sdk 作 MCP 底座（F）：改手写零依赖 transport（gitnexus 需 stdout-compat shim 包 SDK，codegraph 无 SDK 发布）。
- 推翻全能多工具面（gitnexus 17 件）（F）：承诺 4 工具默认（小库 3），其余 TK_MCP_TOOLS 门控。

**输出经济**
- 推翻单一固定输出帽 / 一个全局 char 预算（G）：被 G1 仓库规模分级 + G2 内联帽不变量覆盖——平帽要么撑大小库要么外溢大库（已测 re-Read 回归）。
- 推翻"压缩率即成功"框架（G/K）：指标是 uncached_input_token 下降 + 任务成功，非省字节%；35K 外溢答案压缩好但输 uncached token。
- 推翻"bodies 总随 structure 发"假设（G/G8）：非 explore 工具 include_content/includeCode 默认 FALSE（locations-first），按需取体。

**人类面集成路径**
- 推翻 Simple Browser 作集成路径（H）。

**协作底座**
- 推翻自建 server/telemetry 式分享后端（I）：团队分享＝git-commit `.tk/` 产物，无 tk 自有 server/auth/权限层——违反无 server/无 egress 强倾向且重复 git 既有权限模型。
- DeepWiki 企业 80 页帽下调至 60（I team 档）：tk 针对单项目本地库非企业 wiki farm，60 控住订阅生成成本。

**信任 / provenance**
- 推翻把 provenance/置信当 v2 "nice-to-have"（J）：file:line 锚 + provenance enum + 低置信交还是 v1 验收线，否则工具就是自信错答生成器。
- 正面拒 DeepWiki/opendeepwiki LLM-wiki-as-truth（J）：未字节绑定源码的 LLM wiki 就是 J 禁止的幻觉形态；wiki 若有则宿主生成且重锚。
- 推翻"best-effort 把结果当全面呈现"（J）：低置信默认诚实交还，召回绝不兑现为误导确定性。

**证明 / 度量**
- 推翻 codegraph 头条 token 指标（K）：其 README 报"含缓存 total tokens、47% fewer"，SWE-ContextBench 显示 cache-read >97%，含缓存 delta ~97% 在量缓存重放；改 uncached_input_tokens delta 为主，total 仅次级审计列。
- 推翻"主目标上能证 token 节省"假设（K）：2026-06-20 host-token sweep 证 VS Code Copilot + Copilot CLI 暴露零 token；measured 臂必须跑次目标 Claude Code，主机宿主靠机会事实 + 迁移假设。
- 推翻 tk within-call ledger 的单轨"measure saved_tokens"框架（K）：该 diff 对图/MCP 查询无对应物，W2 loop-avoidance 只能作整轨 A/B delta 证明，两轨强制非可选。
- 降级"Job A 与 Job B 共享度量"假设（K）：Job A 无现成 token benchmark，单独小 N 任务协议，明标指示性，采 Serena 拒编造立场。

**分发**
- 推翻 ADR-0014 contingent（L）：install-base 风险由 vendoring Node 解决（非检查用户 Node），bundle 路径上 node:sqlite 无条件可用，contingency 溶解。
- 推翻单一分发通道倾向（L）：npm-only 在 cnpm/企业镜像静默破（issue #303），bundle-only 绕开 npm 肌肉记忆，双通道 + 自愈严格更安全。
- 降级"无 daemon"作分发关切（L）：本需求仅 install/runtime-launch，daemon vs per-command-spawn 是独立 perf 决策，不改打包配方。

## 仍待用户拍

以下是确需用户拍板的真实开放项（已闭合项不再列）：

1. **Node 版本闸门确认**：Node 25/--liftoff-only 已由 D+A 闭合（WASM 已发布 → 排除 25、强制 --liftoff-only）。请确认接受 `>=22.5.0 <25.0.0` + vendored Node 24.x 作为唯一跨需求版本锚点（原在 A/C/D/L 各自独立开放）。

2. **协作往返的编辑器表面**（I stillOpen #1）：连贯的 v1 默认＝VS-Code-native 文件编辑 + file-watcher 回写（HTML 查看器保持只读）。请确认 v1 仅文件路线，或授权更重的 Tiptap 式 web 编辑器构建。

3. **控制文件格式**（I）：JSONC 是连贯选择（tk 已解析 JSONC、可手编、VS Code 内可 schema 补全）。请确认选 JSONC 而非 YAML。

4. **Daemon/共享索引分支**（M18 / F #2 / E）：v1 承诺单进程/会话 stdio、无 daemon；条件 daemon 分支门控于 K 的 op-count/cold-start 测量。请设定能翻转它的冷启动延迟预算，或确认"v1 永不"。

5. **输出经济单位**（G/K）：现以 char 分级（13000/18000/24000）作可移植代理，仅在 K 的 harness 测出 VS Code Copilot Windows 真实内联帽后再以 token 重新表达。请确认"现在用 char / 测量后用 token"，因主机宿主无法直接测 token。

6. **Job-B 任务 oracle + Job-A 评分者**（K stillOpen）：手写 tk-repo 题集/gold patch vs SWE-bench 切片；宿主 Agent 评分 vs 人工评审理解答案——严谨度对工作量的取舍，只能由你定。

7. **目标组织 MCP 策略现实**（F #3）："扩展为主"承诺假设企业 MCP-in-Copilot 默认锁。若真实目标组织已启用 MCP，raw-MCP 路径可作主、扩展工作量更小——请确认真实组织策略。

8. **Embeddings/SCIP/PageRank v1 范围确认**：三者均承诺 OUT of v1（A11/B9/C reserve-only/D14/M18），仅在实测召回不足（A9 aider 个性化）或 v2 互操作决策时重开。请确认 v1 范围都不需要。

9. **代码签名 + AV 冷启动税**（L stillOpen）：现在签 Windows Authenticode/macOS notarize（成本：证书 + CI）vs 不签只发安装器并接受 SmartScreen/CrowdStrike 首次运行摩擦——Windows 主目标分发抉择。

附次级、可后置但建议一并确认的项（来自各需求 stillOpen，非阻塞 v1 起建）：
- **B 生成 provider 默认**：次目标上宿主 in-session 模型 vs 新起 caw 子进程（倾向 in-session，需一行确认）；是否允许显式用户自带 key 的逃生口（强倾向"绝不默认发 key"，问题是显式 escape hatch 是否可接受）。
- **C content_hash 算法**：sha256（零依赖、node:crypto）vs blake3（需 vendor），倾向 sha256 除非大库吞吐实测证明值得。
- **E 首查大跳变行为**：HEAD 大幅前移时静默 FULL_UPDATE vs 出 frozen banner 要求显式 `tk sync`（成本 vs 惊讶取舍）；Windows/NTFS mtime 粒度是否单靠 mtime_ns 还是必须 size+hash 兜底（倾向 hash 兜底，需 Windows 现场核）；COSMETIC 编辑下人类徽章是否标"doc 可能落后"（A/B 分歧可调）。
- **D 框架/标记提取器**：v1 是否发任何（Razor 触及 .NET 企业主目标可能例外，Vue/Svelte 倾向仅文件级）；C# 外的 vendored-wasm 集（tier-2/3 体积 vs 正确性）；SCIP emit/consume 互操作是否 v1 范围。
- **G kill-switch 暴露**：作文档化用户配置 vs 仅 harness env flag（产品面决策）。
- **I `tk wiki impact --comment`**：opt-in PR 评论（用 gh auth）v1.1 可接受 vs 永久 out；team 档帽是否永远纯荣誉制（无 server 无法门控）。
- **J UX**：raw 0-1 置信数值暴露给人类 HTML vs 折叠为 high/med/low 徽章；heuristic 边是否可在某置信下对 token-minimal Agent 路径 suppress（现承诺 always-keep-but-tag）。
- **L 细节**：bundled Node 精确 pin（v24.16.0 vs 最新 24 LTS）+ CVE 刷新节奏；是否也发 Scoop（Windows 企业友好，codegraph 留 TODO）。
- **M 缺省**：M18 daemon 分支的 op-count 阈值数字；M13 控制文件帽（30/80 页、100 notes、10k 字/note）是否适合项目本地规模或设 tk 专属帽。

# 附录 A1：PageRank / SCIP / gitnexus 可抄实现(2026-06-20 追加)

> 因用户拍板 PageRank+SCIP 进 v1、且 license 自用放宽,本附录补齐需求 A/D 的 copyable 代码,并给出 gitnexus 可抄清单(全部标 `[非分发安全]`,供将来若分发时重写)。

### 需求 A — 个性化 PageRank 排序（Personalized PageRank over the code graph）

**决策回指**：需求 A（ranking，v1 默认 ON）。在 `nodes`/`edges` 属性图上跑一次纯 TS 的幂迭代 PageRank（无 networkx、无 Python 运行时），用 query 命中的 FTS 符号/文件构造 personalization 向量，把"最中心 + 与当前查询最相关"的代码节点排在前面，同时喂给 G（agent 的 buildContext 字符预算排序）和 H（human 的 repo-map / overview）。

---

#### 1. 算法平实解释

PageRank 把图看成"随机游走的访问概率"：一个 surfer 沿出边随机跳转，落在某节点的稳态概率就是它的排名。在代码图里，被很多地方引用/调用的定义（被指向多）会积累高分，于是"中心代码"自然浮到前面。

三个关键改造让它服务 tk：

1. **个性化（personalization / teleport 偏置）**：标准 PageRank 在 surfer "瞬移"时均匀落到所有节点（概率 `1/N`）。个性化把瞬移质量偏向一组种子节点——这里是 query 经 FTS5 命中的符号/文件。效果是排名不再是"全局最重要"，而是"对当前问题最重要"。这正是 aider 用 chat 文件 + 被提及标识符做种子、tk 用 FTS 命中做种子的核心。
2. **边的方向 = 引用者 → 定义者**（aider 的约定）：边从"用到符号的文件"指向"定义符号的文件"，于是 rank 流向定义，定义越被依赖分越高。tk 的 `edges` 表里 `calls`/`references` 天然就是 caller→callee / referencer→definer 方向，直接对应。
3. **rank 分发技巧（aider 独有）**：节点拿到分后，aider 不直接用节点分，而是把每个源节点的 rank 按出边权重比例**分发到各条出边**，累加到 `(定义文件, 标识符)` 上，从而得到**定义级**（而非文件级）排名。tk 因为图节点本身就是符号级（function/class 节点都带 `file_path/start_line`），可以直接用节点分，但在"文件含多个符号、想按某符号定向"时仍可借用分发思路（见 §3 tk 适配）。

阻尼系数 `damping=0.85`：surfer 有 85% 概率沿边走、15% 概率瞬移（瞬移按 personalization 分布）。`dangling` 节点（无出边的定义，如叶子函数）的质量也按 personalization 重新分配，避免概率泄漏。

---

#### 2. 可抄代码（verbatim，permissive 源，常规署名）

##### 2a. aider `get_ranked_tags` 核心（Apache-2.0，常规署名）

> Attribution: Aider (Aider-AI/aider), licensed under Apache License 2.0. © Paul Gauthier and aider contributors. 源经 WebFetch 于 https://raw.githubusercontent.com/Aider-AI/aider/main/aider/repomap.py 确认（main 分支，2026-06-20）。以下为 `RepoMap.get_ranked_tags` 节选，VERBATIM。

**个性化向量构造（teleport 偏置）** 源: `aider/repomap.py` `get_ranked_tags`：

```python
        # Default personalization for unspecified files is 1/num_nodes
        # https://networkx.org/documentation/stable/_modules/networkx/algorithms/link_analysis/pagerank_alg.html#pagerank
        personalize = 100 / len(fnames)
        ...
            rel_fname = self.get_rel_fname(fname)
            current_pers = 0.0  # Start with 0 personalization score

            if fname in chat_fnames:
                current_pers += personalize
                chat_rel_fnames.add(rel_fname)

            if rel_fname in mentioned_fnames:
                # Use max to avoid double counting if in chat_fnames and mentioned_fnames
                current_pers = max(current_pers, personalize)

            # Check path components against mentioned_idents
            path_obj = Path(rel_fname)
            path_components = set(path_obj.parts)
            basename_with_ext = path_obj.name
            basename_without_ext, _ = os.path.splitext(basename_with_ext)
            components_to_check = path_components.union({basename_with_ext, basename_without_ext})

            matched_idents = components_to_check.intersection(mentioned_idents)
            if matched_idents:
                # Add personalization *once* if any path component matches a mentioned ident
                current_pers += personalize

            if current_pers > 0:
                personalization[rel_fname] = current_pers  # Assign the final calculated value
```

**边构造（referencer → definer，含权重 mul）** 源: `aider/repomap.py` `get_ranked_tags`：

```python
        for ident in idents:
            definers = defines[ident]
            mul = 1.0

            is_snake = ("_" in ident) and any(c.isalpha() for c in ident)
            is_kebab = ("-" in ident) and any(c.isalpha() for c in ident)
            is_camel = any(c.isupper() for c in ident) and any(c.islower() for c in ident)
            if ident in mentioned_idents:
                mul *= 10
            if (is_snake or is_kebab or is_camel) and len(ident) >= 8:
                mul *= 10
            if ident.startswith("_"):
                mul *= 0.1
            if len(defines[ident]) > 5:
                mul *= 0.1

            for referencer, num_refs in Counter(references[ident]).items():
                for definer in definers:
                    use_mul = mul
                    if referencer in chat_rel_fnames:
                        use_mul *= 50
                    # scale down so high freq (low value) mentions don't dominate
                    num_refs = math.sqrt(num_refs)
                    G.add_edge(referencer, definer, weight=use_mul * num_refs, ident=ident)
```

**pagerank 调用 + dangling 用同一个 personalization** 源: `aider/repomap.py` `get_ranked_tags`：

```python
        if personalization:
            pers_args = dict(personalization=personalization, dangling=personalization)
        else:
            pers_args = dict()

        try:
            ranked = nx.pagerank(G, weight="weight", **pers_args)
        except ZeroDivisionError:
            try:
                ranked = nx.pagerank(G, weight="weight")
            except ZeroDivisionError:
                return []
```

**rank 分发技巧（按出边权重比例把节点分摊到定义）** 源: `aider/repomap.py` `get_ranked_tags`：

```python
        # distribute the rank from each source node, across all of its out edges
        ranked_definitions = defaultdict(float)
        for src in G.nodes:
            src_rank = ranked[src]
            total_weight = sum(data["weight"] for _src, _dst, data in G.out_edges(src, data=True))
            for _src, dst, data in G.out_edges(src, data=True):
                data["rank"] = src_rank * data["weight"] / total_weight
                ident = data["ident"]
                ranked_definitions[(dst, ident)] += data["rank"]
```

##### 2b. tree-sitter-analyzer 纯 Python 幂迭代（MIT，常规署名）

> Attribution: tree-sitter-analyzer (aisheng.yu), MIT License © 2024-2025. 源: `/tmp/tk-research/tree-sitter-analyzer/tree_sitter_analyzer/mcp/utils/project_index/_pagerank.py`（本地 clone，已确认存在）。这是无外部依赖的幂迭代参考，tk 的 TS 版直接对照它。VERBATIM 节选：

源: `_pagerank.py:72-123` `_pagerank_iterate` + `_pagerank_step`：

```python
def _pagerank_iterate(out_edges, node_list, alpha, max_iter):
    n = len(node_list)
    scores = dict.fromkeys(node_list, 1.0 / n)
    dangling = {nd for nd in node_list if nd not in out_edges}
    for _ in range(max_iter):
        new_scores = _pagerank_step(scores, node_list, out_edges, dangling, alpha, n)
        err = sum(abs(new_scores[nd] - scores[nd]) for nd in node_list)
        scores = new_scores
        if err < 1.0e-6 * n:
            break
    return scores

def _pagerank_step(scores, node_list, out_edges, dangling, alpha, n):
    new_scores = {}
    dangling_sum = alpha * sum(scores[nd] for nd in dangling) / n
    base = (1.0 - alpha) / n + dangling_sum
    for nd in node_list:
        new_scores[nd] = base
    for src, dsts in out_edges.items():
        contrib = alpha * scores[src] / len(dsts)
        for dst in dsts:
            new_scores[dst] = new_scores.get(dst, 0.0) + contrib
    return new_scores
```

> 注意：此参考是 **unweighted + uniform teleport**（`base = (1-alpha)/n`）。tk 版本在它基础上加两点：(a) 边权重（aider 的 mul/sqrt 思路）；(b) personalization 替换 uniform `1/n`。repomaster 的 `importance_analyzer.py`（MIT，源: `/tmp/tk-research/repomaster/src/core/importance_analyzer.py:203-208`）展示了 personalization 的另一种写法 `personalization={n: 2.0 if n == module_id else 1.0 ...}`（单节点偏置 + amplify ×10），tk 不直接抄它（它依赖 networkx 且把 PageRank 只当综合分的一项），仅作"personalization 也可单点偏置"的旁证。

---

#### 3. tk 适配：纯 TS、读 node:sqlite 的 `edges` 表

**插入点**：`需求 A` 排序服务。输出 `Map<nodeId, number>`（rank），供 (G) `buildContext` 的自适应字符预算排序（高 rank 节点优先占预算）和 (H) repo-map/overview（取 top-N 作为骨架）。query 来时先用 FTS5 命中得到种子集，构造 personalization，再跑一次幂迭代。

**SQL：拉边（kinds = calls / references / contains）** —— 把 `edges` 折叠成带权稀疏图。`contains` 给低权（结构边，避免父子关系压过真实调用）：

```sql
-- edges 表: (kind TEXT, src INTEGER, dst INTEGER, ...)
-- 取参与排序的三类边，按 (src,dst) 聚合出权重
SELECT src, dst,
       SUM(CASE kind
             WHEN 'calls'      THEN 1.0
             WHEN 'references' THEN 1.0
             WHEN 'contains'   THEN 0.25
           END) AS w
FROM edges
WHERE kind IN ('calls','references','contains')
GROUP BY src, dst;
```

**SQL：FTS5 命中 → 种子节点（personalization 的来源）** —— 假设 `nodes_fts` 是对 `nodes(name, file_path)` 建的 FTS5 虚表：

```sql
-- :q 是用户 query 经 tokenize 后的 FTS MATCH 串
SELECT n.id AS node_id
FROM nodes_fts f
JOIN nodes n ON n.rowid = f.rowid
WHERE nodes_fts MATCH :q
ORDER BY bm25(nodes_fts)
LIMIT 50;
```

**TS 幂迭代（pure TS over rows，对照 §2b，加权重 + personalization + dangling）** —— 已改写自 tree-sitter-analyzer `_pagerank_iterate`/`_pagerank_step`（MIT），并入 aider 的加权与个性化思路（Apache-2.0）：

```ts
// src/graph/pagerank.ts — zero-dependency, pure TS over edge rows.
// 已改写自 tree-sitter-analyzer _pagerank.py (MIT) + aider repomap.py 个性化/加权 (Apache-2.0)
export interface Edge { src: number; dst: number; w: number; }

export interface PageRankOpts {
  damping?: number;   // 0.85
  tol?: number;       // 1e-4 (L1, 不缩放 n)
  maxIter?: number;   // 100
  personalization?: Map<number, number>; // 种子 -> 偏置质量(未归一也可)
}

export function pageRank(
  nodeIds: number[],
  edges: Edge[],
  opts: PageRankOpts = {},
): Map<number, number> {
  const damping = opts.damping ?? 0.85;
  const tol = opts.tol ?? 1e-4;
  const maxIter = opts.maxIter ?? 100;
  const N = nodeIds.length;
  if (N === 0) return new Map();

  // index 化，O(1) 查找
  const idx = new Map<number, number>();
  nodeIds.forEach((id, i) => idx.set(id, i));

  // 出边邻接 + 每节点出权重和（加权 dangling 判定）
  const outDst: number[][] = Array.from({ length: N }, () => []);
  const outW: number[][] = Array.from({ length: N }, () => []);
  const outSum = new Float64Array(N);
  for (const e of edges) {
    const s = idx.get(e.src), d = idx.get(e.dst);
    if (s === undefined || d === undefined || e.w <= 0) continue;
    outDst[s].push(d);
    outW[s].push(e.w);
    outSum[s] += e.w;
  }

  // personalization 向量 p[]（归一到和为 1）；无种子 -> 均匀 1/N
  const p = new Float64Array(N);
  let pMass = 0;
  if (opts.personalization && opts.personalization.size > 0) {
    for (const [id, mass] of opts.personalization) {
      const i = idx.get(id);
      if (i !== undefined && mass > 0) { p[i] += mass; pMass += mass; }
    }
  }
  if (pMass > 0) { for (let i = 0; i < N; i++) p[i] /= pMass; }
  else { for (let i = 0; i < N; i++) p[i] = 1 / N; pMass = 1; }

  // 初始分布 = personalization（aider 同款：起点即偏置）
  let r = Float64Array.from(p);
  const next = new Float64Array(N);

  for (let it = 0; it < maxIter; it++) {
    // dangling 质量（无出边节点）按 personalization 再分配 —— aider dangling=personalization
    let danglingMass = 0;
    for (let i = 0; i < N; i++) if (outSum[i] === 0) danglingMass += r[i];

    // base = teleport(1-d) 偏 p + dangling 偏 p
    const teleport = (1 - damping) + damping * danglingMass; // 乘到 p[i]
    for (let i = 0; i < N; i++) next[i] = teleport * p[i];

    // 沿加权出边推送
    for (let s = 0; s < N; s++) {
      const sum = outSum[s];
      if (sum === 0) continue;
      const share = damping * r[s] / sum;
      const dsts = outDst[s], ws = outW[s];
      for (let k = 0; k < dsts.length; k++) next[dsts[k]] += share * ws[k];
    }

    // L1 收敛
    let err = 0;
    for (let i = 0; i < N; i++) { err += Math.abs(next[i] - r[i]); r[i] = next[i]; }
    if (err < tol) break;
  }

  const out = new Map<number, number>();
  nodeIds.forEach((id, i) => out.set(id, r[i]));
  return out;
}
```

**喂给 G / H**：
- **G（buildContext）**：候选节点集（FTS 命中 + 其 n-hop 邻居）按 `rank` 降序填字符预算，预算用完即停——高中心度定义先进上下文。
- **H（repo-map/overview）**：全局跑一次（无 query 时 personalization 为空 → 退化成均匀 teleport 的标准 PageRank），取 top-N 节点的 `file_path:start_line` 作为仓库骨架。

---

#### 4. 具体数值（阈值）

| 参数 | 值 | 来源/依据 |
|---|---|---|
| `damping` (alpha) | **0.85** | aider/tsa/repomaster 三源一致 |
| `tol` (L1) | **1e-4** | 任务指定；比 tsa 的 `1e-6*n` 宽松，提前收敛省迭代 |
| `maxIter` | **100** | tsa `_pagerank.py:23` 默认 |
| personalization 单种子质量 | `100 / |seeds|`（归一前），实现里再统一归一到和=1 | aider `personalize = 100/len(fnames)` |
| `calls`/`references` 边权 | **1.0** | 真实数据流边 |
| `contains` 边权 | **0.25** | 结构边降权，避免父子压过调用 |
| `num_refs` 缩放 | `sqrt(num_refs)`（如在 src→dst 聚合时累计引用次数）| aider「high freq mentions 不主导」|
| FTS 种子 LIMIT | **50** | 控 personalization 规模 |

---

#### 5. 有序步骤

1. `src/graph/pagerank.ts`：实现 §3 的 `pageRank()`（纯 TS，零依赖）。
2. `src/graph/rankEdges.ts`：执行 §3 的 edges SQL（`node:sqlite` prepared statement），返回 `Edge[]`；`contains` 折 0.25 权。
3. `src/graph/seeds.ts`：执行 FTS5 MATCH SQL，得到种子 `node_id[]`，构造 `personalization: Map(node_id -> 100)`（同质量，交给 pageRank 内部归一）。无 query 时返回空 Map（→ 全局 PageRank for H）。
4. `src/graph/rankService.ts`：拉全部 `nodeIds`（`SELECT id FROM nodes`）+ edges + seeds，调 `pageRank`，缓存结果（key = graph 版本 + query 指纹）。
5. G 侧 buildContext 接 `rank` 做预算排序；H 侧 overview 接 top-N。
6. 默认 ON：无 `--no-rank` 时即走此路径（需求 A 约定）。

---

#### 6. 单元测试（已知排名的小图）

构造一个"中心节点 D 被三处引用"的图，断言 D 排名最高；再加 personalization 偏向 A，断言 A 跃升。

```ts
// tests/graph/pagerank.test.ts
import { describe, it, expect } from "vitest";
import { pageRank, type Edge } from "../../src/graph/pagerank";

describe("pageRank", () => {
  // 图: A->D, B->D, C->D, A->B  (D 被 3 个引用 => 最中心)
  const nodes = [1, 2, 3, 4]; // A=1 B=2 C=3 D=4
  const edges: Edge[] = [
    { src: 1, dst: 4, w: 1 },
    { src: 2, dst: 4, w: 1 },
    { src: 3, dst: 4, w: 1 },
    { src: 1, dst: 2, w: 1 },
  ];

  it("ranks the most-referenced node (D) highest", () => {
    const r = pageRank(nodes, edges, { damping: 0.85, tol: 1e-4, maxIter: 100 });
    const top = [...r.entries()].sort((a, b) => b[1] - a[1])[0][0];
    expect(top).toBe(4); // D
    // 和应 ~= 1 (概率分布)
    const sum = [...r.values()].reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 3);
  });

  it("personalization toward A lifts A's rank vs uniform", () => {
    const base = pageRank(nodes, edges, {});
    const pers = pageRank(nodes, edges, {
      personalization: new Map([[1, 100]]), // 种子 = A
    });
    expect(pers.get(1)!).toBeGreaterThan(base.get(1)!);
  });

  it("handles dangling nodes without leaking mass", () => {
    // D 无出边(dangling); 质量经 dangling 再分配, 总和仍 ~=1
    const r = pageRank(nodes, edges, {});
    const sum = [...r.values()].reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 3);
  });

  it("empty graph returns empty map", () => {
    expect(pageRank([], []).size).toBe(0);
  });
});
```

**测试要点**：(1) 收敛后概率和 ≈ 1（dangling 再分配正确，无质量泄漏）；(2) 个性化确实抬升种子排名；(3) 加权 + 空图边界。手算交叉验证：3-入边的 D 在 damping=0.85 下 rank 应约 0.35–0.40，远高于其余节点（可加 `toBeGreaterThan(0.3)` 收紧）。

---

### D.SCIP — 可选的编译器级精度路线(检测则用,缺失则静默回退 tree-sitter)

**决策回指**:用户 2026-06-20 承诺 SCIP IN v1 但 OPT-IN——探测 PATH 上的 per-language SCIP 索引器,有则跑、消费 `index.scip`、产出 `provenance='scip'` 的高置信调用边并在冲突时压过 tree-sitter 启发式边(接 J trust enum);无则静默回退 tree-sitter,绝不强装,保 Windows 零安装。服务 need D(调用图)+ need J(provenance/可信度排序)。

---

#### 1. 跨平台索引器检测(REUSE tk 自带的 PATHEXT-aware which)

tk 已有一个零依赖、Windows PATHEXT-aware、永不抛错的 `defaultWhich`,直接复用——它正是"hook/tool 实际解析二进制"的同一套走法。**VERBATIM 引用**:

```ts
// 源: /Users/ziyu/Workspace/token-killer/src/shim/preflight.ts:156-180 (VERBATIM, tk 自有代码 = 许可permissive)
function defaultWhich(
  program: string,
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
  exists: (p: string) => boolean = fsExistsSync,
): string | null {
  try {
    const pathValue = env.PATH ?? env.Path ?? "";
    if (!pathValue) return null;
    const dirs = pathValue.split(delimiter).filter((d) => d.length > 0);
    const exts =
      platform === "win32"
        ? (env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD").split(";").filter((e) => e.length > 0)
        : [""];
    for (const dir of dirs) {
      for (const ext of exts) {
        const candidate = join(dir, `${program}${ext}`);
        if (exists(candidate)) return candidate;
      }
    }
    return null;
  } catch {
    return null;
  }
}
```

在其上建一个 per-language 索引器登记表 + 探测。`scip-typescript`/`scip-python` 是 npm 全局包(在 Windows 上落地为 `scip-typescript.cmd`,所以必须走 PATHEXT);`scip-go`/`scip-clang`/`rust-analyzer` 是原生 exe。**需实现时补**(tk 自有新代码,无逐字来源,但 `defaultWhich` 是真实复用):

```ts
// 需实现时补 (tk 新代码;复用上面 VERBATIM 的 defaultWhich,逻辑直接 = preflight.ts 已验证的 PATHEXT 走法)
interface ScipIndexer {
  lang: string;            // tree-sitter 语言名,用于只在该语言文件上覆盖
  bin: string;            // PATH 上探测的命令名(无扩展名,PATHEXT 由 defaultWhich 补)
  indexArgs: string[];    // 默认产出 ./index.scip 的调用参数
  // rust-analyzer 需显式 --output;其它默认写 cwd/index.scip
}

const SCIP_INDEXERS: ScipIndexer[] = [
  { lang: "typescript", bin: "scip-typescript", indexArgs: ["index"] },
  { lang: "javascript", bin: "scip-typescript", indexArgs: ["index"] },
  { lang: "python",     bin: "scip-python",     indexArgs: ["index"] },
  { lang: "java",       bin: "scip-java",       indexArgs: ["index"] },
  { lang: "go",         bin: "scip-go",         indexArgs: [] },        // 默认写 index.scip
  { lang: "c",          bin: "scip-clang",      indexArgs: [] },
  { lang: "cpp",        bin: "scip-clang",      indexArgs: [] },
  { lang: "rust",       bin: "rust-analyzer",   indexArgs: ["scip", "."] }, // 写 index.scip
];

// 探测:对一个仓库里实际出现过的语言集合,挑出 PATH 上存在的索引器。永不抛错。
function detectScipIndexers(presentLangs: Set<string>): ScipIndexer[] {
  return SCIP_INDEXERS.filter(
    (ix) => presentLangs.has(ix.lang) && defaultWhich(ix.bin) !== null,
  );
}
```

> CLI 事实(已核对):`npm install -g @sourcegraph/scip-typescript` 后命令为 **`scip-typescript index`**(源: https://github.com/sourcegraph/scip-typescript README, VERBATIM 引用上方 WebFetch);`rust-analyzer scip .` 产出 SCIP(源: rust-analyzer 文档,需实现时补确认 flag);默认产物文件名 `index.scip` 为 SCIP CLI 约定(源: sourcegraph/scip 约定 + graphify 测试 fixture)。各 `scip-go`/`scip-clang` 的精确默认参数 **需实现时补**(以各仓 README 为准)。

#### 2. 调用索引器(spawn + 超时 + 定位 index.scip)

复用 tk 已验证的 spawn+timeout 形态(`runPreflightCommandAsync` 源: preflight.ts:97-136 是同一模式:`shell: win32`、计时器 kill、永不 reject)。索引运行重,超时给 **120000ms**:

```ts
// 需实现时补 (tk 新代码;spawn+timeout 形态 已改写自 preflight.ts:97-136 runPreflightCommandAsync)
import { spawn } from "node:child_process";
import { join } from "node:path";
import { existsSync } from "node:fs";

const SCIP_RUN_TIMEOUT_MS = 120000; // 索引器跑全仓,重
// (探测 which 不 spawn → 不需要 2000ms 探测超时;若改用 `--version` 探测则用 PROBE_TIMEOUT=2000ms)

async function runScipIndexer(ix: ScipIndexer, cwd: string): Promise<string | null> {
  const ran = await new Promise<boolean>((resolve) => {
    let settled = false;
    const done = (ok: boolean) => { if (!settled) { settled = true; resolve(ok); } };
    try {
      const child = spawn(ix.bin, ix.indexArgs, {
        cwd,
        shell: process.platform === "win32", // PATHEXT 解析 .cmd —— 同 preflight.ts:108
      });
      const timer = setTimeout(() => { try { child.kill(); } catch {} done(false); },
        SCIP_RUN_TIMEOUT_MS);
      child.on("error", () => { clearTimeout(timer); done(false); });
      child.on("close", (code) => { clearTimeout(timer); done(code === 0); });
    } catch { done(false); }
  });
  if (!ran) return null;
  const out = join(cwd, "index.scip");      // SCIP CLI 默认产物
  return existsSync(out) ? out : null;       // 定位失败 → null → 静默回退
}
```

#### 3. 消费 index.scip(protobuf 解码 + 映射为 tk 边)

**官方 SCIP schema(已核对,源: https://github.com/sourcegraph/scip/blob/main/scip.proto, VERBATIM 引用上方 WebFetch)**:

```protobuf
message Index    { Metadata metadata = 1; repeated Document documents = 2;
                   repeated SymbolInformation external_symbols = 3; }
message Document { string relative_path = 1; repeated Occurrence occurrences = 2;
                   repeated SymbolInformation symbols = 3; string language = 4; }
message Occurrence { repeated int32 range = 1; string symbol = 2; int32 symbol_roles = 3; ... }
message SymbolInformation { string symbol = 1; repeated string documentation = 3;
                            repeated Relationship relationships = 4; Kind kind = 5; }
message Relationship { string symbol = 1; bool is_reference = 2; bool is_implementation = 3;
                       bool is_type_definition = 4; bool is_definition = 5; }
enum SymbolRole { Definition = 0x1; Import = 0x2; WriteAccess = 0x4; ReadAccess = 0x8;
                  Generated = 0x10; Test = 0x20; ForwardDefinition = 0x40; }
```

> **关键事实**:与 graphify 简化版不同,**官方 occurrences 挂在 Document 上,不挂在每个 symbol 上**(源: graphify/scip_ingest.py:27-30 自己点明这个分歧)。`range` 是 3 元 `[startLine, startChar, endChar]`(单行)或 4 元 `[startLine, startChar, endLine, endChar]`,**0-based**(源: scip.proto VERBATIM)。`symbol_roles` 是位掩码,`role & 0x1` 即 Definition。

**依赖选择(诚实)**:tk 零运行时依赖,clones 里**没有任何逐字 TS SCIP protobuf 解码器可抄**(graphify 的是 Python 且只吃简化 JSON)。三选一,推荐方案 A:
- **A(推荐)**:把 `scip.proto` 编译进仓(`pbjs`/`pbts` 预生成静态 JS+d.ts,**构建期**依赖,运行时零依赖)→ `Index.decode(buffer)`。保持运行时零依赖承诺。
- B:运行时引 `protobufjs`(反射式 `.proto` 加载)——破坏零依赖,不取。
- C:自写 minimal protobuf varint 解码器(仅 Index/Document/Occurrence 三层)——可控但 **需实现时补** 且易错。

protobuf→buffer→`Index` 的解码 glue **需实现时补**(无逐字来源)。解码后的映射逻辑,**可改写自 graphify 的真实两遍法**(源: graphify/scip_ingest.py:74-129, 251-273,PolyForm-NC **[非分发安全]**,若分发需重写)——核心是"pass1 建 symbol→node 索引,pass2 发边,目标解析优先同文档、唯一跨文档兜底":

```ts
// 需实现时补 (解码 glue);映射逻辑 已改写自 graphify/scip_ingest.py 两遍法 [非分发安全]
// 源: /tmp/tk-research/graphify/graphify/scip_ingest.py:74-129 (两遍索引结构) + :251-273 (解析顺序)
//     :291-297 (relationship→relation tag)  —— PolyForm-NC,分发前需重写
type ScipIndex = { documents: ScipDocument[] };           // 由方案A的 Index.decode 产出
type ScipDocument = { relativePath: string; occurrences: ScipOcc[]; symbols: ScipSym[] };
type ScipOcc = { range: number[]; symbol: string; symbolRoles: number };
type ScipSym = { symbol: string; relationships?: ScipRel[] };
type ScipRel = { symbol: string; isReference?: boolean; isImplementation?: boolean;
                 isTypeDefinition?: boolean; isDefinition?: boolean };

const SCIP_DEFINITION = 0x1; // 源: scip.proto SymbolRole.Definition

// pass1:在每个 Document 上,把 "Definition occurrence" 的 symbol 绑到 (file, startLine) →
//        与 tree-sitter 已有节点用 file_path + range 对账(reconcile)。
// pass2:对每个 Occurrence 解析其 symbol 的定义点;Definition occ = 节点锚,
//        非-Definition occ = 一条引用边 (provenance='scip').
function scipToEdges(idx: ScipIndex, lookupTsNode: (file: string, line: number) => string | null) {
  // 局部符号判定:SCIP 符号串以 "local " 开头即文档内局部 (源: scip 符号串语法,WebFetch 已核对)
  const isLocal = (s: string) => s.startsWith("local ");
  // 定义索引:symbol → { file, line } (取该 symbol 的 Definition occurrence)
  const defOf = new Map<string, { file: string; line: number }>();
  for (const doc of idx.documents) {
    for (const occ of doc.occurrences) {
      if ((occ.symbolRoles & SCIP_DEFINITION) !== 0 && occ.range.length >= 1) {
        defOf.set(occ.symbol, { file: doc.relativePath, line: occ.range[0] }); // 0-based
      }
    }
  }
  const edges: Array<{ kind: "calls" | "references"; src: string; dst: string; provenance: "scip" }> = [];
  for (const doc of idx.documents) {
    for (const occ of doc.occurrences) {
      if ((occ.symbolRoles & SCIP_DEFINITION) !== 0) continue;     // 定义点不是引用边
      if (occ.range.length < 1) continue;
      const refLine = occ.range[0];
      const srcNode = lookupTsNode(doc.relativePath, refLine);     // 谁发起的(reconcile by file+range)
      const def = defOf.get(occ.symbol);                            // 指向谁的定义
      if (!srcNode || !def) continue;                              // 跨包/外部符号:无本地定义 → 跳过(或建 stub,见 graphify:209-228)
      const dstNode = lookupTsNode(def.file, def.line);
      if (!dstNode || srcNode === dstNode) continue;
      // calls vs references:SCIP occurrence 本身不分"调用/读取";用 SymbolInformation.relationships
      // 或符号串的 Method 描述符 `().` 判调用,其余记 references。判定细节 需实现时补。
      edges.push({ kind: occ.symbol.endsWith(").") ? "calls" : "references",
                   src: srcNode, dst: dstNode, provenance: "scip" });
    }
  }
  return edges;
}
```

**tk 适配**:落库进 tk 的 `edges(kind, src, dst, provenance, file_path, start_line)` 表,`provenance='scip'`。`lookupTsNode(file, line)` 走 tk 已有的 `nodes` 表 `WHERE file_path=? AND start_line<=? AND end_line>=?`(包含式 range 对账,把 SCIP 0-based 行 +1 对齐 tk 若为 1-based —— **具体行基 需实现时补**,验 fixture 时锁定)。`interface↔impl` 的歧义正是 `Relationship.is_implementation` 解决的:tree-sitter 看不出 `impl.foo()` 调到哪个具体类,SCIP 的 `is_implementation` 边给出确定目标。

#### 4. 优先级规则(接 J provenance enum)

provenance 可信度排序 **scip > tree-sitter > heuristic**。落库时若同一 `(kind, src, dst)` 已有 tree-sitter 边,scip 边覆盖之;反向不覆盖:

```ts
// 需实现时补 (tk 新代码;precedence = need J 决策)
const PROVENANCE_RANK = { scip: 3, "tree-sitter": 2, heuristic: 1 } as const;
// UPSERT 语义:仅当新边 rank >= 旧边 rank 时写入 provenance/confidence。
// SQL: INSERT ... ON CONFLICT(src,dst,kind) DO UPDATE SET provenance=excluded.provenance
//      WHERE PROVENANCE_RANK(excluded.provenance) > PROVENANCE_RANK(edges.provenance)
//      —— SQLite 无内建 rank 函数,用 CASE 或在写入前于 TS 比较。
```

#### 5. 具体数值

| 项 | 值 | 出处 |
|---|---|---|
| 探测超时(若用 `--version` 探测) | 2000ms | 任务规定;tk `PREFLIGHT_COMMAND_TIMEOUT_MS` 同量级 |
| 索引器运行超时 | 120000ms | 任务规定(全仓索引重) |
| provenance 优先级 | scip(3) > tree-sitter(2) > heuristic(1) | need J |
| SymbolRole.Definition 位 | `0x1` | scip.proto VERBATIM |
| range 元素数 | 3(单行)或 4(跨行),0-based | scip.proto VERBATIM |
| 局部符号前缀 | `"local "` | SCIP 符号串语法 |
| 默认产物 | `<cwd>/index.scip` | SCIP CLI 约定 |

#### 6. 有序步骤

1. 扫仓得到实际出现的语言集合 `presentLangs`(tree-sitter 阶段的副产物)。
2. `detectScipIndexers(presentLangs)`——纯 `defaultWhich`,不 spawn,零成本;空集 → **静默回退 tree-sitter,结束**。
3. 对每个命中的索引器 `runScipIndexer`(spawn,120s 超时);失败/无 `index.scip` → 该语言静默回退,不阻断其它语言。
4. 方案 A 解码 `index.scip` → `Index`。
5. `scipToEdges` 映射,`lookupTsNode` 用 tk `nodes` 表按 file+range 对账。
6. UPSERT 入 `edges`,provenance='scip',按 §4 优先级覆盖 tree-sitter 边。
7. 全程 best-effort:任何异常吞掉并回退,绝不让 SCIP 路线使索引失败(保零安装体验)。

#### 7. 测试(fixture:interface+impl,tree-sitter 歧义而 SCIP 确定)

- **Fixture**:`Animal` 接口 + `Dog`/`Cat` 两实现 + `feed(a: Animal){ a.speak() }`。tree-sitter 只能产 `feed→Animal.speak`(或两条歧义边);SCIP 的 `Relationship.is_implementation` 让 `Dog.speak`/`Cat.speak` 与 `Animal.speak` 关联。
- **断言 1(检测)**:PATH 无 `scip-typescript` 时 `detectScipIndexers` 返回 `[]`,索引仍成功,边全为 `provenance='tree-sitter'`(零安装回退)。
- **断言 2(消费)**:喂一个**预生成的 `index.scip` fixture**(签入测试资产,不在 CI 装索引器),`scipToEdges` 产出 `feed→Animal.speak` 的 `provenance='scip'` 边。可借鉴 graphify 的 fixture 风格(源: graphify/tests/test_scip_ingest.py:44-78 单符号/无关系/range→line 用例 [非分发安全])。
- **断言 3(优先级)**:先插一条 tree-sitter `feed→Animal.speak`,再 UPSERT scip 同边,查库 provenance 变 `scip`;反向(先 scip 后 tree-sitter)不被覆盖。
- **断言 4(位掩码)**:`(role & 0x1)` 区分 Definition occ(成锚点)与 reference occ(成边),用一个 Definition+一个 Reference 的最小 `index.scip` 验证只产 1 条边。
- **断言 5(超时/损坏)**:喂截断的 `index.scip` → 解码抛错被吞 → 静默回退,索引整体仍 green。

---

### 从 gitnexus 抄进 tk 的可复用核心（impact / 增量子图 / 预算图查询 / 确定序）

**决策回指**：tk 用 `node:sqlite` 上 `nodes(kind, file_path, start_line)` + `edges(kind, src, dst, provenance, confidence)` 的属性图；gitnexus 的图层用 Kuzu/Cypher（`PolyForm-Noncommercial-1.0.0`，已在 `package.json:"license"` 确认），所以**每段逐字代码都标 `[非分发安全]`**——个人用可直接抄，若将来分发必须重写。本节只挖材料服务 tk 的 A(人理解)/B(agent 找码省 token)/G(预算优于压缩)/E(增量) 的 4 类核心，Web-UI 专属代码全部跳过。

最值钱的一条是 **impact 的「一次调用顶十次 grep」**：gitnexus 把 BFS blast-radius 做成单工具 `impact({target, direction, maxDepth})`，按深度分带（d=1 WILL BREAK / d=2 / d=3）并算出 LOW/MEDIUM/HIGH/CRITICAL 风险——这正是 tk 的 G(预算优于压缩) 杠杆：agent 不再逐个 grep 调用点，一个工具调用拿到全量受影响集 + 风险分级。

---

#### 1. impact 的 BFS blast-radius 核心 → tk_impact 工具（服务 B + A + G）

**(a) 它做什么**：从目标符号出发，沿入边(upstream=谁依赖我)或出边(downstream=我依赖谁)做**逐深度 BFS**，每层一条批量查询（把整层 frontier 一次查完，不是逐节点），结果按 depth 分带 + 带 confidence。

确切阈值（全部逐字来自源）：
- 关系白名单 `['CALLS','IMPORTS','EXTENDS','IMPLEMENTS','USES','HAS_METHOD','HAS_PROPERTY','METHOD_OVERRIDES','OVERRIDES','METHOD_IMPLEMENTS','ACCESSES']`
- 每类边的 confidence 下限：CALLS/IMPORTS=0.9，EXTENDS/IMPLEMENTS/METHOD_*=0.85，HAS_METHOD/HAS_PROPERTY/CONTAINS=0.95，ACCESSES=0.8，未知=0.5
- `maxDepth` 默认 3，硬上限 32（`validateGroupImpactParams`）
- 风险分级：`directCount>=30 || processCount>=5 || moduleCount>=5 || impacted.length>=200 → CRITICAL`；`>=15 / >=3 / >=3 / >=100 → HIGH`；`directCount>=5 || impacted.length>=30 → MEDIUM`；否则 LOW
- 防爆护栏（trace 路径同源）：`PER_NODE_FANOUT_CAP=200`、`ABS_ROW_CAP=5000`、`MAX_VISITED=50000`

BFS 主循环逐字（Cypher 版，已逐行确认存在）：

```ts
// 源: gitnexus/src/mcp/local/local-backend.ts:4636-4776 [非分发安全]
const impacted: any[] = [];
const visited = new Set<string>([symId]);
let frontier = [symId];
let traversalComplete = true;

for (let depth = 1; depth <= maxDepth && frontier.length > 0; depth++) {
  const nextFrontier: string[] = [];
  // Batch frontier nodes into a single Cypher query per depth level.
  const query =
    direction === 'upstream'
      ? `MATCH (caller)-[r:CodeRelation]->(n) WHERE n.id IN $frontierIds AND r.type IN $relTypes${confidenceFilter} RETURN n.id AS sourceId, caller.id AS id, caller.name AS name, labels(caller)[0] AS type, caller.filePath AS filePath, r.type AS relType, r.confidence AS confidence`
      : `MATCH (n)-[r:CodeRelation]->(callee) WHERE n.id IN $frontierIds AND r.type IN $relTypes${confidenceFilter} RETURN n.id AS sourceId, callee.id AS id, callee.name AS name, labels(callee)[0] AS type, callee.filePath AS filePath, r.type AS relType, r.confidence AS confidence`;
  const related = await executeParameterized(repo.lbugPath, query, {
    frontierIds: frontier, relTypes: relationTypes,
    ...(safeMinConfidence > 0 ? { minConfidence: safeMinConfidence } : {}),
  });
  for (const rel of related) {
    const relId = rel.id || rel[1];
    const filePath = rel.filePath || rel[4] || '';
    if (!includeTests && isTestFilePath(filePath)) continue;
    if (!visited.has(relId)) {
      visited.add(relId);
      nextFrontier.push(relId);
      const storedConfidence = rel.confidence ?? rel[6];
      const relationType = rel.relType || rel[5];
      const effectiveConfidence =
        typeof storedConfidence === 'number' && storedConfidence > 0
          ? storedConfidence : confidenceForRelType(relationType);
      impacted.push({ depth, id: relId, name: rel.name || rel[2],
        type: rel.type || rel[3], filePath, relationType, confidence: effectiveConfidence });
    }
  }
  frontier = nextFrontier;
}
const grouped: Record<number, any[]> = {};
for (const item of impacted) { (grouped[item.depth] ??= []).push(item); }
```

风险分级逐字：

```ts
// 源: gitnexus/src/mcp/local/local-backend.ts:5050-5065 [非分发安全]
const processCount = affectedProcesses.length;
const moduleCount = affectedModules.length;
let risk = 'LOW';
if (directCount >= 30 || processCount >= 5 || moduleCount >= 5 || impacted.length >= 200) {
  risk = 'CRITICAL';
} else if (directCount >= 15 || processCount >= 3 || moduleCount >= 3 || impacted.length >= 100) {
  risk = 'HIGH';
} else if (directCount >= 5 || impacted.length >= 30) {
  risk = 'MEDIUM';
}
```

confidence 下限表逐字：

```ts
// 源: gitnexus/src/mcp/local/local-backend.ts:220-238 [非分发安全]
export const IMPACT_RELATION_CONFIDENCE: Readonly<Record<string, number>> = {
  CALLS: 0.9, IMPORTS: 0.9, EXTENDS: 0.85, IMPLEMENTS: 0.85,
  METHOD_OVERRIDES: 0.85, METHOD_IMPLEMENTS: 0.85,
  HAS_METHOD: 0.95, HAS_PROPERTY: 0.95, ACCESSES: 0.8, CONTAINS: 0.95,
};
const confidenceForRelType = (relType: string | undefined): number =>
  IMPACT_RELATION_CONFIDENCE[relType ?? ''] ?? 0.5;
```

**(b) 服务谁**：`tk_impact` MCP 工具，服务 **B**（agent「改 X 会破坏谁」一次问清，省掉 N 次 grep 调用点）+ **A**（人提交前看 blast radius + 风险分级）+ **G**（precompute-over-compress：BFS 在索引上跑，回给 agent 的是结构化分带集而非整堆源码）。UX 契约直接抄 `skills/gitnexus-impact-analysis.md`：d=1=WILL BREAK / d=2=LIKELY AFFECTED / d=3=MAY NEED TESTING。

**(c) tk 适配（Cypher→node:sqlite 递归 CTE）**：把「逐层批量查询 + JS 侧 visited/grouped」整体下沉成一条 `WITH RECURSIVE`，在 `edges(src,dst,kind,confidence)` 上跑。upstream（谁指向我）= 沿 `dst=cur` 反向走：

```sql
-- tk: src/graph/impact.sql （已改写 from gitnexus Cypher BFS 源:local-backend.ts:4716）
WITH RECURSIVE
  params(target_id, max_depth, min_conf) AS (VALUES (:target, :maxDepth, :minConf)),
  walk(node_id, depth, rel_kind, conf, path) AS (
    SELECT :target, 0, NULL, 1.0, ',' || :target || ','
    UNION ALL
    SELECT e.src,                       -- upstream: edge points INTO current node
           w.depth + 1,
           e.kind,
           COALESCE(e.confidence,
             CASE e.kind WHEN 'CALLS' THEN 0.9 WHEN 'IMPORTS' THEN 0.9
                         WHEN 'EXTENDS' THEN 0.85 WHEN 'IMPLEMENTS' THEN 0.85
                         WHEN 'HAS_METHOD' THEN 0.95 WHEN 'HAS_PROPERTY' THEN 0.95
                         WHEN 'ACCESSES' THEN 0.8 ELSE 0.5 END),
           w.path || e.src || ','
    FROM walk w
    JOIN edges e ON e.dst = w.node_id    -- upstream; for downstream swap to e.src = w.node_id and SELECT e.dst
    WHERE w.depth < (SELECT max_depth FROM params)
      AND e.kind IN ('CALLS','IMPORTS','EXTENDS','IMPLEMENTS','USES',
                     'HAS_METHOD','HAS_PROPERTY','METHOD_OVERRIDES','OVERRIDES',
                     'METHOD_IMPLEMENTS','ACCESSES')
      AND COALESCE(e.confidence, 1.0) >= (SELECT min_conf FROM params)
      AND instr(w.path, ',' || e.src || ',') = 0   -- visited-set: cycle guard
  )
SELECT w.node_id AS id, MIN(w.depth) AS depth, w.rel_kind AS relation_type,
       w.conf AS confidence, n.name, n.file_path, n.kind, n.start_line
FROM walk w JOIN nodes n ON n.id = w.node_id
WHERE w.depth >= 1
GROUP BY w.node_id           -- MIN(depth) == gitnexus 的 `if (!visited.has) → 首达深度`
ORDER BY depth, n.file_path
LIMIT 5000;                  -- == ABS_ROW_CAP
```

要点对应：JS 的 `visited` 集 ⇒ SQL 里 `instr(path, ...)=0`（路径串去环，且 `GROUP BY ... MIN(depth)` 复现「首次到达深度即定带」语义）；`ABS_ROW_CAP=5000` ⇒ `LIMIT 5000`；confidence 回退表内联进 `CASE`。`directCount = COUNT(depth=1)`，`impacted.length = 总行数`，喂进 (b) 的风险公式即可。tk 无 Process/Community 概念，把 `processCount/moduleCount` 项从风险公式删掉，只保留 `directCount` 与 `impacted.length` 两档（仍 LOW/MEDIUM/HIGH/CRITICAL）。

**有序步骤**：① 建 `edges(src,dst,kind,confidence)` 上 `(dst,kind)` 与 `(src,kind)` 双索引（CTE 两个方向各吃一个）② 把上面 CTE 包成 `impactUpstream/impactDownstream(targetId, maxDepth=3, minConf=0)` ③ JS 侧 `groupBy(depth)` + 套风险公式 ④ 包成 `tk_impact` MCP 工具，输出抄 skill 的 d=1/d=2/d=3 文案。

**测试**：构造 A→B→C 链（CALLS），`impactUpstream(C, depth=3)` 必得 `{B:d1, A:d2}`；插一条 A→C→A 环，断言不死循环且每节点只出现一次（MIN depth）；confidence 缺失的边断言回退到 0.9（CALLS）；`directCount=5` 断言 risk 升到 MEDIUM。

---

#### 2. graph-queries 的预算化查询族 → G(precompute-over-compress)

**(a) 它做什么**：把高频问题各封一条 Cypher（带 `LIMIT`），一次查完整层，而非让 agent 反复 grep：导出符号表、跨文件调用边、模块内/跨模块调用边（各 `LIMIT 30`）、文件清单。关键是 **inter-module 边带 `LIMIT 30` 预算**，模块概览边在 JS 侧按 `count` 聚合排序。

```ts
// 源: gitnexus/src/core/wiki/graph-queries.ts:124-141 [非分发安全]
// Get inter-file call edges (calls between different files).
export async function getInterFileCallEdges(): Promise<CallEdge[]> {
  const rows = await executeQuery(REPO_ID, `
    MATCH (a)-[:CodeRelation {type: 'CALLS'}]->(b)
    WHERE a.filePath <> b.filePath
    RETURN DISTINCT a.filePath AS fromFile, a.name AS fromName,
           b.filePath AS toFile, b.name AS toName
  `);
  return rows.map((r) => ({ fromFile: r.fromFile || r[0], fromName: r.fromName || r[1],
    toFile: r.toFile || r[2], toName: r.toName || r[3] }));
}
```

```ts
// 源: gitnexus/src/core/wiki/graph-queries.ts:325-353 [非分发安全] (已改写: 仅取聚合逻辑)
const fileToModule = new Map<string, string>();
for (const [mod, files] of Object.entries(moduleFiles)) for (const f of files) fileToModule.set(f, mod);
const allEdges = await getInterFileCallEdges();
const moduleEdgeCounts = new Map<string, number>();
for (const edge of allEdges) {
  const fromMod = fileToModule.get(edge.fromFile);
  const toMod = fileToModule.get(edge.toFile);
  if (fromMod && toMod && fromMod !== toMod) {
    const key = `${fromMod}|||${toMod}`;
    moduleEdgeCounts.set(key, (moduleEdgeCounts.get(key) || 0) + 1);
  }
}
```

**(b) 服务谁**：**G**——这些是「预算优于压缩」的样板：每条查询自带 `LIMIT`，回的是结构化边/符号集而非源码，token 远低于 agent 自己 grep+读文件再聚合。也喂 **A**（人看架构图/模块依赖）。

**(c) tk 适配**：`getInterFileCallEdges` 直接是 SQL join：

```sql
-- tk: 跨文件调用边（已改写 from 源:graph-queries.ts:124）
SELECT DISTINCT a.file_path AS from_file, a.name AS from_name,
       b.file_path AS to_file, b.name AS to_name
FROM edges e
JOIN nodes a ON a.id = e.src
JOIN nodes b ON b.id = e.dst
WHERE e.kind = 'CALLS' AND a.file_path <> b.file_path;
```

inter-module 用 SQL 直接聚合（替掉 JS 侧 Map）：

```sql
-- tk: 跨模块调用计数（已改写：把 JS Map 聚合下沉到 SQL，源:graph-queries.ts:325）
SELECT fm.module AS from_mod, tm.module AS to_mod, COUNT(*) AS cnt
FROM edges e
JOIN nodes a ON a.id = e.src   JOIN file_module fm ON fm.file_path = a.file_path
JOIN nodes b ON b.id = e.dst   JOIN file_module tm ON tm.file_path = b.file_path
WHERE e.kind = 'CALLS' AND fm.module <> tm.module
GROUP BY fm.module, tm.module
ORDER BY cnt DESC LIMIT 30;     -- == gitnexus inter-module LIMIT 30
```

**具体数值**：inter/intra-module 边 `LIMIT 30`，进程概览 `LIMIT 5`/`20`——tk 沿用 `LIMIT 30` 作为预算化默认。**测试**：3 文件 2 模块，断言跨模块计数=实际跨界 CALLS 数；同模块边不出现在 inter-module 结果。

---

#### 3. subgraph-extract + computeEffectiveWriteSet → E(增量)

**(a) 它做什么**：增量 reindex 时，给定「被改文件集」，只重建受影响子图。两个纯函数零依赖：`extractChangedSubgraph`（保留 filePath∈写集的节点 + 至少一端在写集的边）+ `computeEffectiveWriteSet`（沿跨写集边界的边 1-hop 扩展写集，解决 barrel re-export 那类「A 内容没变但 A→B 边重解析成 A→D」的陈旧边问题）。

```ts
// 源: gitnexus/src/core/incremental/subgraph-extract.ts:121-137 [非分发安全]
export const computeEffectiveWriteSet = (
  fullGraph: KnowledgeGraph,
  toWriteSet: ReadonlySet<string>,
): Set<string> => {
  const nodeFilePaths = indexNodeFilePaths(fullGraph);
  const expanded = new Set<string>(toWriteSet);
  fullGraph.forEachRelationship((r: GraphRelationship) => {
    const sourcePath = nodeFilePaths.get(r.sourceId);
    const targetPath = nodeFilePaths.get(r.targetId);
    if (!sourcePath || !targetPath) return; // skip edges to graph-wide nodes
    const sourceWritable = toWriteSet.has(sourcePath);
    const targetWritable = toWriteSet.has(targetPath);
    if (sourceWritable && !targetWritable) expanded.add(targetPath);
    else if (targetWritable && !sourceWritable) expanded.add(sourcePath);
  });
  return expanded;
};
```

```ts
// 源: gitnexus/src/core/incremental/subgraph-extract.ts:80-107 [非分发安全]
export const extractChangedSubgraph = (fullGraph, toWriteSet): KnowledgeGraph => {
  const sub = createKnowledgeGraph();
  const writableNodeIds = new Set<string>();
  fullGraph.forEachNode((n: GraphNode) => {
    const filePath = n.properties?.filePath as string | undefined;
    const include = (filePath && toWriteSet.has(filePath)) || isGraphWide(n.label);
    if (include) { sub.addNode(n); writableNodeIds.add(n.id); }
  });
  fullGraph.forEachRelationship((r: GraphRelationship) => {
    if (writableNodeIds.has(r.sourceId) || writableNodeIds.has(r.targetId) || isGraphWideRelType(r.type))
      sub.addRelationship(r);
  });
  return sub;
};
```

**(b) 服务谁**：**E**——文件改动后只重建 1-hop 邻域，不全量 reindex。`computeEffectiveWriteSet` 那条「1-hop 扩展写集」是关键正确性洞见：必须用同一个扩展后的集合去做删除和写入，否则陈旧边残留 / PK 冲突。

**(c) tk 适配**：tk 不需要把图搬进内存——node:sqlite 里直接：

① 算有效写集（1-hop 边界扩展）：

```sql
-- tk: 1-hop 边界扩展（已改写 from computeEffectiveWriteSet 源:subgraph-extract.ts:121）
-- :changed = 被改文件集（临时表 changed_files(file_path)）
SELECT DISTINCT other.file_path FROM (
  SELECT b.file_path FROM edges e
    JOIN nodes a ON a.id=e.src JOIN nodes b ON b.id=e.dst
    WHERE a.file_path IN (SELECT file_path FROM changed_files)
      AND b.file_path NOT IN (SELECT file_path FROM changed_files)
  UNION
  SELECT a.file_path FROM edges e
    JOIN nodes a ON a.id=e.src JOIN nodes b ON b.id=e.dst
    WHERE b.file_path IN (SELECT file_path FROM changed_files)
      AND a.file_path NOT IN (SELECT file_path FROM changed_files)
) AS other;   -- 把这些并入 changed_files 得到 effective write set
```

② 删除：`DELETE FROM nodes WHERE file_path IN (effective set)` + `DELETE FROM edges WHERE src/dst 任一节点属于这些文件`（DETACH 语义）。③ 重解析这些文件，重新 INSERT 节点 + 至少一端落在写集的边。**关键纪律**（直接抄 gitnexus 的 Finding 1）：删除集 == 写入集，必须是同一个 effective set，否则陈旧边残留或 PK 冲突。

**具体数值**：扩展深度恒为 **1-hop**（gitnexus 的 importer-BFS 多跳那半留给「停止 import」的反向 case，tk 第一版可省）。**测试**：barrel 场景——A→B 改成 A→D（A 文件内容不变），断言 effective set 含 B 和 D，重建后旧 A→B 边消失、新 A→D 边存在。

---

#### 4. graph-sort 拓扑分层 → 确定序（服务 E + 索引可复现）

**(a) 它做什么**：Kahn 算法跑在**反向** import 图上，把文件分成拓扑层（同层无相互依赖、可并行），环里的文件追加为最后一层。**leaves-first**：上游导出必须先于下游 importer 解析。纯函数零依赖、零 Cypher，直接可抄。

```ts
// 源: gitnexus/src/core/ingestion/utils/graph-sort.ts:57-108 [非分发安全]
export function topologicalLevelSort(importMap: ReadonlyMap<string, ReadonlySet<string>>): {
  levels: readonly IndependentFileGroup[]; cycleCount: number;
} {
  const pendingImportsPerFile = new Map<string, number>();
  const reverseDeps = new Map<string, string[]>();
  for (const [file, deps] of importMap) {
    if (!pendingImportsPerFile.has(file)) pendingImportsPerFile.set(file, 0);
    for (const dep of deps) {
      if (!pendingImportsPerFile.has(dep)) pendingImportsPerFile.set(dep, 0);
      pendingImportsPerFile.set(file, (pendingImportsPerFile.get(file) ?? 0) + 1);
      let rev = reverseDeps.get(dep);
      if (!rev) { rev = []; reverseDeps.set(dep, rev); }
      rev.push(file);
    }
  }
  const levels: string[][] = [];
  let currentLevel = [...pendingImportsPerFile.entries()].filter(([, d]) => d === 0).map(([f]) => f);
  while (currentLevel.length > 0) {
    levels.push(currentLevel);
    const nextLevel: string[] = [];
    for (const file of currentLevel)
      for (const dependent of reverseDeps.get(file) ?? []) {
        const newPending = (pendingImportsPerFile.get(dependent) ?? 1) - 1;
        pendingImportsPerFile.set(dependent, newPending);
        if (newPending === 0) nextLevel.push(dependent);
      }
    currentLevel = nextLevel;
  }
  const cycleFiles = [...pendingImportsPerFile.entries()].filter(([, d]) => d > 0).map(([f]) => f);
  if (cycleFiles.length > 0) levels.push(cycleFiles);
  return { levels, cycleCount: cycleFiles.length };
}
```

**(b) 服务谁**：**E** + 索引**确定序**——跨文件绑定/符号解析按 leaves-first 处理，上游导出先解析；同层可并行。tk 重建子图（#3）后用它定重解析顺序，保证结果可复现（不依赖文件系统枚举顺序）。

**(c) tk 适配**：**整段 TS 直接搬进 `src/graph/topo-sort.ts`，零改动**（纯 Map/Set，无 Kuzu）。喂它的 `importMap` 从 tk 的 IMPORTS 边一次查出：`SELECT a.file_path, b.file_path FROM edges e JOIN nodes a ON a.id=e.src JOIN nodes b ON b.id=e.dst WHERE e.kind='IMPORTS'`，JS 侧 groupBy 成 `Map<importer, Set<dep>>`。

**注意纪律**（抄 JSDoc 警告）：计数器叫 `pendingImportsPerFile` 不是 `inDegree`，跑在反向图上，**别改成正向 in-degree**——否则从 leaves-first 翻成 roots-first，静默破坏跨文件绑定传播。**测试**：A imports B imports C，断言 `levels=[[C],[B],[A]]`；A↔B 互导，断言两者落在最后的 cycle 层且 `cycleCount=2`。

---

#### 抄进来清单

| gitnexus 源文件 | tk 目标文件 | 服务 need | 许可 |
| --- | --- | --- | --- |
| `src/mcp/local/local-backend.ts:4636-4776` (impact BFS) | `src/graph/impact.ts` + `impact.sql` (WITH RECURSIVE) | B + A + G | PolyForm-NC → [非分发安全] |
| `src/mcp/local/local-backend.ts:5050-5065` (risk 分级) | `src/graph/impact.ts` (risk 函数) | A + B | PolyForm-NC → [非分发安全] |
| `src/mcp/local/local-backend.ts:220-238` (confidence 表) | `src/graph/edge-confidence.ts` | B + G | PolyForm-NC → [非分发安全] |
| `skills/gitnexus-impact-analysis.md` (d=1/2/3 UX 契约) | `tk_impact` 工具描述 + 输出模板 | A + B | PolyForm-NC → [非分发安全] |
| `src/core/wiki/graph-queries.ts:124-353` (预算化查询族) | `src/graph/precomputed-queries.ts` (SQL 版) | G + A | PolyForm-NC → [非分发安全] |
| `src/core/incremental/subgraph-extract.ts:80-137` | `src/graph/incremental.ts` (SQL 删除+1-hop) | E | PolyForm-NC → [非分发安全] |
| `src/core/ingestion/utils/graph-sort.ts:57-108` | `src/graph/topo-sort.ts` (TS 整段直搬) | E + 确定序 | PolyForm-NC → [非分发安全] |
| `src/core/graph/graph.ts:11-182` (内存图模型) | **跳过**（tk 用 node:sqlite，不进内存图）；仅借鉴 reverse-adjacency/file-index 思路 | — | PolyForm-NC → [非分发安全] |

跳过的 Web-UI 专属：`getProcessesForFiles`/`getAllProcesses`/`getInterModuleEdgesForOverview` 的 Process/Community 部分（tk 无社区检测）、cross-impact 的 Phase-2 bridge/跨 repo fan-out（tk 是 project-local 单仓，只需 Phase-1 本地 BFS = 上面 #1）。

## 本附录诚实缺口(需实现时补)

- **need-A-personalized-pagerank**: aider repomap.py 通过 WebFetch 读取（main 分支 2026-06-20），未本地 clone；行号未在 raw 文件中标注，引用以方法名 get_ranked_tags 定位而非精确行号。如需分发，建议 clone 后用 commit SHA 锁定。
- **need-A-personalized-pagerank**: tk 的 nodes/edges 实际 schema（列名、是否已有 nodes_fts 虚表、edges 是否存 num_refs/provenance）未在本任务中核对——SQL 按 CONTEXT 描述的 nodes(kind)/edges(kind,src,dst,provenance) 假设书写；num_refs 的 sqrt 缩放需在 edge 聚合阶段真有引用计数列才能落地，否则退化为按出现次数 SUM。标记为：需实现时补 edges 是否含引用计数。
- **need-A-personalized-pagerank**: FTS5 MATCH 串 :q 的 tokenize/转义（防 query 注入 FTS 语法、camelCase 切分）未实现，需在 seeds.ts 补 query → MATCH 串的规范化。
- **need-A-personalized-pagerank**: rank 缓存 key 的 graph 版本指纹机制（增量更新后失效策略）未设计，需配合需求里的 incremental 索引部分。
- **need-A-personalized-pagerank**: G 的 n-hop 邻居扩展与字符预算具体算法属需求 G，本节只给排序输入接口，未给预算填充实现。
- **need-A-personalized-pagerank**: 单元测试中 D rank 的精确数值(0.35–0.40)为估算，建议落地后用一次实跑结果固化为快照断言。
- **need-D-scip-optin**: protobuf 解码 glue(buffer→Index)无逐字 TS 来源:推荐方案 A(构建期 pbjs/pbts 预生成静态解码器,保运行时零依赖),Index.decode 本身需实现时补
- **need-D-scip-optin**: scip-go / scip-clang 的精确默认 CLI 参数与产物路径未逐字核对(以各仓 README 为准)
- **need-D-scip-optin**: rust-analyzer 产 SCIP 的精确 flag(scip . 是否写 index.scip / 是否需 --output)需实现时补确认
- **need-D-scip-optin**: calls vs references 的判定:用符号串 Method 描述符 `().` 还是 SymbolInformation.relationships,需实现时锁定;当前用 endsWith('().') 占位
- **need-D-scip-optin**: SCIP range 为 0-based,tk nodes 表行基(0/1-based)未确认,reconcile 的 +1 对齐需在 fixture 测试时锁定
- **need-D-scip-optin**: 跨包/外部符号(无本地定义 occurrence)目前直接跳过;是否建 scip_external stub 节点(graphify 做法)留待 need D 整体决定
- **need-D-scip-optin**: graphify 的两遍映射逻辑 + 其 test fixture 为 PolyForm-NC / no-license,已标 [非分发安全],若 tk 分发需重写
- **need-D-scip-optin**: 默认产物文件名 index.scip 来自 SCIP CLI 约定 + graphify fixture,未从 scip-typescript README 逐字确认(README 未明示输出路径)
- **gitnexus 挖矿清单**: impact 风险公式里 processCount/moduleCount 两项依赖 gitnexus 的 Process/Community 节点，tk 无此概念 → 需实现时补：要么删掉这两项只留 directCount/impacted.length 两档，要么 tk 自建一个轻量社区/进程概念（建议第一版删，留 TODO）
- **gitnexus 挖矿清单**: cross-impact.ts 的 Phase-2 跨 repo bridge fan-out（CY_NEIGHBORS_UPSTREAM/DOWNSTREAM + safeNeighborImpact 超时竞速 + mergeRisk）整体跳过，因为 tk 是单仓 project-local；若将来要跨 repo impact 需实现时补这套 bridge 协议
- **gitnexus 挖矿清单**: WITH RECURSIVE 的 upstream/downstream 我给的是两条结构对称的 SQL（一条 JOIN e.dst=cur 取 e.src，一条 JOIN e.src=cur 取 e.dst）；Class/Interface 节点的 Constructor/File 种子展开（local-backend.ts:4647-4714，针对 JVM CALLS→Constructor、IMPORTS→File 的间接性）未折进 CTE → tk 若支持 Java/Kotlin 需实现时补这段 frontier 预热，否则 Class 的入边会漏
- **gitnexus 挖矿清单**: graph-queries 的 SQL 改写依赖一张 file_module(file_path,module) 映射表（模块划分），tk 当前 schema 未定义模块概念 → 需实现时补模块划分来源（目录前缀？社区检测？）
- **gitnexus 挖矿清单**: PER_NODE_FANOUT_CAP=200 的每节点扇出截断在 CTE 里没复现（只复现了 ABS_ROW_CAP=5000 的总 LIMIT）；SQL 递归 CTE 难表达「每层每节点限 200 邻居」→ 需实现时补：要么靠总 LIMIT 5000 兜底，要么 JS 侧分页查询逐层限流
- **gitnexus 挖矿清单**: computeEffectiveWriteSet 只做 1-hop 正向边界扩展；gitnexus 文档明确这漏掉「文件 X 停止 import 已改文件 C」的反向 case（靠 importer-BFS 读 pre-pipeline DB 覆盖）→ tk 第一版同样会漏 stop-import case，需实现时补一个读旧 IMPORTS 边的反向 BFS
- **gitnexus 挖矿清单**: impact 的 confidenceFilter 在 minConfidence<=0 时故意不加 confidence 子句（避免排除 NULL-confidence 边）；我的 CTE 用了 COALESCE(confidence,1.0)>=minConf，当 minConf=0 时行为等价，但若 tk 想精确复现「NULL 边在有 floor 时也保留」语义需实现时补 CASE 区分


# 附录 A2:gitnexus 全量可抄清单(2026-06-20 追加,全部 `[非分发安全]`)

> gitnexus = PolyForm-NC,自用放宽下可抄;每段已标 `[非分发安全]`,供将来若分发时重写。按子系统组织,各自标明喂哪个 tk 需求 + node:sqlite 适配。

### gitnexus · call-graph resolution engine（调用图解析引擎）

**服务 tk 需求：A（人理解+协作：调用关系是"谁调用我/我调用谁"的底座）、D（agent find-code/省 token：从 caller 一跳到 callee 定义，免去全文 grep）。**

这是整套引擎里最难的部分。一个关键事实先摆出来：**老的"call-resolution DAG"（per-file 类型推断→receiver 推断→dispatch→MRO walk）已在 RING4-1（#942）整体删除**，`call-processor.ts` 现在只剩框架路由（Laravel/Next.js）的边发射，**不再是调用解析主路径**（源：`call-processor.ts:1-16` [非分发安全]）。真正的调用解析已统一进 `scope-resolution/` 的 registry-primary 流水线。tk 要抄的是后者。

---

#### 1. 解析总骨架（一次调用如何落成一条边）

数据流（源：`scope-resolution/pipeline/run.ts:1-24` [非分发安全]）：

```
ParsedFile[]  →(finalizeScopeModel)→  ScopeResolutionIndexes
              →(resolveReferenceSites)→  ReferenceIndex
              →(emit, 顺序 load-bearing)→  KnowledgeGraph edges
```

发射顺序是**契约不变量 I1**，错了语义就变（源：`run.ts:701-755`）：

1. `emitReceiverBoundCalls`（**先** —— 方法调用经类型路由，最精确）
2. `emitFreeCallFallback`（**再** —— 自由函数调用、跨文件 import）
3. `emitReferencesViaLookup`（**最后** —— 通用兜底，用前两步填好的 `handledSites` 跳过已处理点位）
4. `emitImportEdges`

每个 reference site 走"挑 registry → `lookup` → 取 top-ranked → 折成一条边"。核心 100% 在 `resolveReferenceSites`（源：`resolve-references.ts:90-161` [非分发安全]）：

```ts
for (const site of scopes.referenceSites) {
  const resolutions = lookupForSite(site, classRegistry, methodRegistry, fieldRegistry, macroRegistry);
  if (resolutions.length === 0) { unresolved++; continue; }
  const top = resolutions[0]!;          // RFC §4.3 "one-shot answer"：只取最优 1 个，不 fan-out
  const ref = buildReference(site, top); // 携带 confidence + evidence
  // bin by source scope ...
}
```

site.kind → registry 的分派表（源：`resolve-references.ts:190-238` [非分发安全]）：

| site.kind | 主 registry | 兜底 |
|---|---|---|
| `call` | MethodRegistry（带 arity + explicitReceiver） | — |
| `inherits` / `type-reference` | ClassRegistry | — |
| `read` / `write` | FieldRegistry | → Method → Class（`cb = save` 这种裸名也能解析） |
| `import-use` | Class → Method → Field 逐级试 | 第一个非空胜出 |
| `macro` | MacroRegistry（macro 与 function 是不相交命名空间，防假 CALLS 边） | — |

`buildReference` 把 site + top resolution 折成 `Reference{fromScope, toDef, atRange, kind, confidence, evidence}`（源：`resolve-references.ts:241-250`）。

---

#### 2. 解析算法核心 —— `lookupCore` 的 7 步（最值得抄的一段）

所有 registry（Class/Method/Field）都 dispatch 进同一个纯函数 `lookupCore`，差别只在传入的 `LookupParams`，**不是每种 kind 一套算法**。这正是 tk 想要的"一套解析器服务所有边类型"。

7 步算法（源：`gitnexus-shared/src/scope-resolution/registries/lookup-core.ts:101-146` [非分发安全]）：

```ts
export function lookupCore(name, startScope, params, ctx): readonly Resolution[] {
  const acceptedKinds = new Set<NodeLabel>(params.acceptedKinds);
  const perCandidate = new Map<DefId, CandidateState>();

  // Step 1: 词法作用域链向上走（hard shadow：本层一旦命中就停，不看外层）
  const lexicalShadowed = walkLexicalChain(name, startScope, acceptedKinds, ctx, perCandidate);

  // Step 2: 类型绑定 / MRO walk（方法/字段调用的主证据路径）
  if (params.useReceiverTypeBinding && ctx.methodDispatch !== undefined) {
    walkReceiverTypeBinding(name, startScope, acceptedKinds, params, ctx, perCandidate);
  }

  // Step 3: owner-scoped contributor（直接声明在 receiver 上的成员）
  if (params.ownerScopedContributor !== null) {
    seedFromOwnerScopedContributor(name, params.ownerScopedContributor, acceptedKinds, perCandidate);
  }

  // Step 4: kind-match 证据（在 composeEvidence 里加，weight 0，仅供调试）

  // Step 5: arity 过滤（有 compatible 就 drop incompatible；全 incompatible 则清空 = 拒绝假边）
  if (params.callsite !== undefined) applyArityFilter(params.callsite, perCandidate, ctx);

  // Step 6: 全局兜底（仅当 Step1-3 全空 且 name 含 '.'）→ lookupQualified
  if (perCandidate.size === 0 && !lexicalShadowed && name.includes('.')) {
    const globals = lookupQualified(name, { acceptedKinds: params.acceptedKinds }, ctx);
    if (globals.length > 0) return globals;
  }
  if (perCandidate.size === 0) return EMPTY;

  // Step 7: 组证据 + 算 confidence + tie-break 排序
  return rankCandidates(perCandidate);
}
```

**Step 1 词法链 + hard shadow**（源：`lookup-core.ts:195-227` [非分发安全]）：从 startScope 沿 `scope.parent` 向上，每层查 `scope.bindings.get(name)`；只要本层有任意 binding（即便 kind 不匹配）就 `return true` 停止 —— 名字在此被词法绑定，外层不再看。带 `visited` 防环。这是 tk 解析"同名遮蔽"的关键：局部变量遮蔽同名全局函数。

**Step 2 receiver 类型绑定 → MRO walk**（这是"method-call routing through types"的核心，源：`lookup-core.ts:249-332` [非分发安全]）：
- `resolveReceiverOwner`：显式 receiver（`user.save()` 里的 `user`）查 callsite scope 的 `typeBindings`；隐式 receiver 试 `self` / `this`（`IMPLICIT_RECEIVERS = ['self','this']`）。
- `lookupReceiverType`：沿 scope chain 找 `typeBindings.get(receiverName)` → 拿 `typeRef.rawName` → `qualifiedNames.get(rawName)`；**只有恰好 1 个候选才认**（≥2 歧义或 0 缺失都返回 undefined，不做朴素同名 fallback —— 宁缺毋滥）。
- 拿到 ownerDefId 后：`walk = [ownerDefId, ...methodDispatch.mroFor(ownerDefId)]`，逐层 `ownedMembersByOwner(owner, name)` 取成员，记 `mroDepth`（深度越浅证据越强）。

**Step 5 arity 过滤**（源：`lookup-core.ts:397-444` [非分发安全]）：`anyCompatible` 则 drop 全部 incompatible；**全 incompatible 且无 unknown** 则清空所有候选（`f(int $req, ...$rest)` 用 0 参调用 = 真 arity-broken，发边就是假阳性）；有 unknown 则保留靠权重排。

**Step 6 全局限定名兜底**（源：`lookup-qualified.ts:37-69` [非分发安全]）：直接查 `qualifiedNames.get(qualifiedName)`，按 kind 过滤，每个候选给同一 base confidence（`globalQualified`），再 tie-break。无 receiver 解析、无 scope walk。

---

#### 3. 置信度模型（confidence —— tk edges.provenance/confidence 的直接来源）

证据**加性**组合，sum 在 `[0,1]` clamp（源：`evidence.ts:145-151` [非分发安全]）。权威权重表（源：`gitnexus-shared/src/scope-resolution/evidence-weights.ts:18-83` [非分发安全]）：

```ts
export const EvidenceWeights = {
  // where-found（可见性 origin）
  local: 0.55, import: 0.45, reexport: 0.4, namespace: 0.4, wildcard: 0.3,
  // scope-chain 每跳扣分
  scopeChainPerDepth: -0.02,
  // receiver 类型绑定，按 MRO 深度衰减（直接类 idx0，1 跳父类 idx1 ...，超表取末值）
  typeBindingByMroDepth: [0.5, 0.42, 0.36, 0.32, 0.3] as const,
  // 佐证
  ownerMatch: 0.2, kindMatch: 0.0,
  // arity
  arityMatchCompatible: 0.1, arityMatchUnknown: 0.0, arityMatchIncompatible: -0.15,
  // 全局兜底
  globalQualified: 0.35, globalName: 0.1,
  // 降级信号
  dynamicImportUnresolved: 0.02,
  // 未解析 import 的乘性 cap（只压 import/wildcard/reexport/namespace 那一条证据）
  unlinkedImportMultiplier: 0.5,
} as const;
```

直觉读法：**本地定义命中 0.55 起，跨 import 0.45，wildcard import 0.3；方法经类型绑定命中直接类 0.5（每往父类走一层衰减）；owner 精确匹配 +0.2；arity 对得上 +0.1，对不上 −0.15。** 一个典型"局部方法调用经类型解析 + owner 匹配 + arity 对"的边 ≈ `0.5+0.2+0.1 = 0.8`，clamp 后封顶 1.0。

`composeEvidence` 把 raw signals 翻成证据列表（源：`evidence.ts:62-139` [非分发安全]）；`getOriginWeight` 做 origin→weight 映射（源：`evidence.ts:155-177`）。

歧义时的 tie-break 级联（源：`tie-breaks.ts:46-70` + `origin-priority.ts` [非分发安全]）：

```
1. confidence DESC（|Δ| < CONFIDENCE_EPSILON=0.001 视为相等）
2. scope depth ASC（更近的词法作用域胜）
3. MRO depth ASC（继承链更近的类胜）
4. ORIGIN_PRIORITY ASC（local=0 > import=1 > reexport=2 > namespace=3 > wildcard=4 > global-qualified=5 > global-name=6）
5. DefId.localeCompare（最终确定性兜底）
```

---

#### 4. 边发射 + provenance/confidence 写入（tk 最关心的落点）

`Reference.kind` → 边类型映射（源：`graph-bridge/edges.ts:29-52` [非分发安全]）：

```ts
case 'call'           → 'CALLS'
case 'read'/'write'   → 'ACCESSES'
case 'inherits'       → 'EXTENDS'
case 'type-reference' → 'USES'
case 'macro'          → 'USES'   // macro 解析到 Macro 节点，不进 CALLS 键空间
case 'import-use'     → undefined // 不发边，provenance 在 IMPORTS 边上
```

通用发射循环（源：`references-to-edges.ts:37-99` [非分发安全]）—— 注意 dedup key 与 reason 格式正是 tk `edges.provenance` 该存的东西：

```ts
const dedupKey = `${edgeType}:${callerGraphId}->${targetGraphId}:${ref.atRange.startLine}:${ref.atRange.startCol}`;
if (seen.has(dedupKey)) continue;
seen.add(dedupKey);
graph.addRelationship({
  id: `rel:${dedupKey}`,
  sourceId: callerGraphId, targetId: targetGraphId, type: edgeType,
  confidence: ref.confidence,                      // ← 直接来自 lookupCore 的 7 步证据和
  reason: `scope-resolution: ${ref.kind}`,         // ← provenance 文本
});
```

`tryEmitEdge` 的关键约定（源：`edges.ts:63-108` [非分发安全]）：默认 `confidence = 0.85`；CALLS 边可在 provider opt-in 时 collapse 到 `(caller,target)` 粒度（一对 caller/callee 只一条边），而 read/write ACCESSES 保持 per-site（同字段不同行的多次写 = 多条边）。

**结论：tk 的 `edges` 表每条边写 3 个字段即可完整复刻 gitnexus 语义：`kind`（CALLS/ACCESSES/EXTENDS/USES）、`provenance`（= reason，如 `scope-resolution: call` 或 `laravel-route`）、`confidence`（= 7 步证据和，0..1）。**

---

#### 5. tk 把每条解析后的调用映射进 edges 的 node:sqlite 适配

tk schema：`nodes(kind, file_path, start_line, ...)` + `edges(kind, src, dst, provenance, confidence)`。gitnexus 用 Kuzu/Cypher 做 MRO walk 和 caller/callee 链查；tk 用 `node:sqlite` 的 WITH RECURSIVE CTE。

**(a) 写一条解析后的 CALLS 边**（对应 `addRelationship`）：

```sql
INSERT OR IGNORE INTO edges(kind, src, dst, provenance, confidence)
VALUES ('calls', :caller_node_id, :callee_node_id,
        'scope-resolution: call', :confidence);
-- dedup：在 edges 上建唯一索引复刻 gitnexus dedupKey
CREATE UNIQUE INDEX IF NOT EXISTS ux_edges_site
  ON edges(kind, src, dst, /* site 行列编入 provenance 或单列 */ provenance);
```

**(b) MRO walk —— Step 2 的"沿继承链找成员定义"，CTE over EXTENDS 边**（复刻 `methodDispatch.mroFor` + `ownedMembersByOwner`）：

```sql
-- 给定 receiver 类型节点 :owner_id，按 MRO 深度展开祖先链，
-- 在每层找名为 :member 的方法/字段定义，深度越浅 confidence 越高。
WITH RECURSIVE mro(owner, depth) AS (
  SELECT :owner_id, 0
  UNION
  SELECT e.dst, m.depth + 1
  FROM mro m
  JOIN edges e ON e.src = m.owner AND e.kind = 'extends'
  WHERE m.depth < 16                      -- 深度上限，防环/防超深继承
)
SELECT n.id AS target_def, mro.depth,
       -- 复刻 typeBindingByMroDepth=[0.5,0.42,0.36,0.32,0.3]，超表取 0.3
       CASE mro.depth WHEN 0 THEN 0.5 WHEN 1 THEN 0.42 WHEN 2 THEN 0.36
                      WHEN 3 THEN 0.32 ELSE 0.3 END AS type_binding_weight
FROM mro
JOIN edges own ON own.src = mro.owner AND own.kind = 'owns'  -- 类→成员的 owns 边
JOIN nodes n   ON n.id = own.dst
WHERE n.name = :member AND n.kind IN ('method','function','field')
ORDER BY mro.depth ASC      -- tie-break：MRO depth ASC
LIMIT 1;                    -- one-shot answer：只取最浅
```

**(c) 词法链 hard shadow —— Step 1**（tk 在索引期已把 binding 物化进 `nodes`/scope 表，则裸名解析可纯 SQL）：

```sql
-- 沿 scope 链向上找第一个绑定了 :name 的作用域（hard shadow：第一个命中即停）
WITH RECURSIVE chain(scope_id, depth) AS (
  SELECT :start_scope, 0
  UNION ALL
  SELECT s.parent_id, c.depth + 1
  FROM chain c JOIN scopes s ON s.id = c.scope_id
  WHERE s.parent_id IS NOT NULL AND c.depth < 64
)
SELECT b.def_node_id, c.depth,
       (0.55 + (-0.02) * c.depth) AS local_confidence   -- local 0.55，每跳 scopeChainPerDepth -0.02
FROM chain c
JOIN bindings b ON b.scope_id = c.scope_id AND b.name = :name
ORDER BY c.depth ASC
LIMIT 1;     -- 最浅作用域命中即 hard shadow
```

**(d) caller→callee 一跳查（D 需求：agent 找定义免 grep）**：

```sql
SELECT n.file_path, n.start_line, e.confidence, e.provenance
FROM edges e JOIN nodes n ON n.id = e.dst
WHERE e.src = :caller_id AND e.kind = 'calls'
ORDER BY e.confidence DESC;
```

**(e) 全局限定名兜底 —— Step 6**（复刻 `lookupQualified`）：

```sql
SELECT id FROM nodes
WHERE qualified_name = :qname AND kind IN (/* acceptedKinds */)
-- 命中给 globalQualified=0.35；多个则按 (origin=global-qualified 优先级5, id) tie-break
ORDER BY id LIMIT 1;
```

---

#### 6. tk 落点（每个核心变成 tk 的哪个文件 / MCP-tool）

| gitnexus 文件:行 | tk target | 关键函数 / 内容 |
|---|---|---|
| `lookup-core.ts:101-146` | `src/codegraph/resolve/lookup-core.ts` | `lookupCore` 7 步骨架（纯函数，整体可抄） |
| `lookup-core.ts:195-227` | 同上 | `walkLexicalChain` + hard shadow（Step 1） |
| `lookup-core.ts:249-332` | 同上 | `walkReceiverTypeBinding`/`lookupReceiverType`（Step 2 类型路由，method-call 核心） |
| `lookup-core.ts:397-444` | 同上 | `applyArityFilter`（Step 5，全 incompatible 清空 = 拒假边） |
| `evidence-weights.ts:18-95` | `src/codegraph/resolve/weights.ts` | `EvidenceWeights` 常量 + `typeBindingWeightAtDepth`（整段抄，校准值勿改） |
| `evidence.ts:62-177` | `src/codegraph/resolve/evidence.ts` | `composeEvidence`/`confidenceFromEvidence`/`getOriginWeight` → 写 edges.confidence |
| `tie-breaks.ts:46-77` + `origin-priority.ts` | `src/codegraph/resolve/tie-breaks.ts` | `compareByConfidenceWithTiebreaks` + `ORIGIN_PRIORITY` + `CONFIDENCE_EPSILON=0.001` |
| `lookup-qualified.ts:37-69` | `src/codegraph/resolve/lookup-qualified.ts` | `lookupQualified`（Step 6 全局兜底） |
| `resolve-references.ts:90-238` | `src/codegraph/resolve/resolve-references.ts` | `resolveReferenceSites` + `lookupForSite` 分派表（site.kind→registry） |
| `graph-bridge/edges.ts:29-108` | `src/codegraph/emit/edges.ts` | `mapReferenceKindToEdgeType` + `tryEmitEdge`（写 edges.kind/provenance/confidence，含 dedup key） |
| `references-to-edges.ts:37-99` | `src/codegraph/emit/references-to-edges.ts` | `emitReferencesViaLookup`（通用发射循环 + dedup） |
| `passes/mro.ts:39-110` | `src/codegraph/resolve/mro.ts` | `buildMro` + `defaultLinearize`（BFS first-seen；tk 单继承用 SQL CTE 替代，多继承再抄此 C3 兜底） |
| `passes/receiver-bound-calls.ts:1-38` | `src/codegraph/emit/receiver-bound-calls.ts` | 7-case dispatcher 的**契约文档 I4/I5**（case 顺序 load-bearing，先 super→compound→namespace→class-name→dotted→chain→simple→value-receiver） |
| `pipeline/run.ts:701-755` | `src/codegraph/build/run.ts` | 发射顺序 I1（receiver-bound → free-call → references → imports） |
| `call-routing.ts:66-137` | `src/codegraph/extract/call-routing.ts`（仅 Ruby/动态语言时） | `routeRubyCall`：import/properties/skip/call 分类（含 1024 长度 cap + 控制字符拒绝） |

---

#### 7. gitnexus 用到的具体数值（caps / depths / 阈值）

- **confidence epsilon**：`CONFIDENCE_EPSILON = 0.001`（`tie-breaks.ts:26`）—— Δ 小于此视为平手走 tie-break。
- **MRO 深度衰减表**：`[0.5, 0.42, 0.36, 0.32, 0.3]`，超 5 层取末值 0.3（`evidence-weights.ts`）。
- **scope-chain 每跳扣分**：`-0.02`。
- **未解析 import 乘性 cap**：`0.5×`（只压 import 那条证据，owner-match/arity/type-binding 不压）。
- **dynamic-unresolved 降级**：`0.02`。
- **框架路由边 confidence**：`ROUTE_EDGE_CONFIDENCE = 0.5`；猜测方法兜底 `×0.8 = 0.4`（`call-processor.ts:82,226`）。下游 gate：`MIN_TRACE_CONFIDENCE` / `MIN_CONFIDENCE_LARGE` 均 `0.5`，0.5 恰好通过，0.4 被排除。
- **Next.js FETCHES 边 confidence**：`0.9`（`call-processor.ts:441`）。
- **tryEmitEdge 默认 confidence**：`0.85`（`edges.ts:75`）。
- **inherits/structural-implements 边 confidence**：`0.85`（`run.ts:114,243`）。
- **Ruby import path cap**：`length > 1024` 或含控制字符 `[\x00-\x1f]` → skip（`call-routing.ts:76`）。
- **MAX_EXPORTS_PER_FILE = 500**，**MAX_TYPE_NAME_LENGTH = 256**（`call-processor.ts:27-28`）。
- **typeAsReceiverHeuristic**：JVM/C# 才开 —— receiver 首字母大写且无 TypeEnv 绑定时当类型名（`Type.method()` / `User::getName`，`call-types.ts:30-34,79`）。

---

#### 8. tk 简化建议（不要照搬全部）

gitnexus 7-case receiver dispatcher（compound chain、namespace prefix、value-receiver bridge）和 overload-narrowing（526 行 C++ 模板约束/转换排名）是为多语言+C++ 重型场景准备的，**tk 第一版可只取 Step 1（词法 hard shadow）+ Step 2（简单 typeBinding → MRO walk via SQL CTE）+ Step 6（限定名）+ 加性 confidence + tie-break**，即可覆盖 TS/JS/Python 绝大多数 caller/callee。compound-receiver / overload-narrowing / ADL 等按需后补。

---

### gitnexus · control-flow + dataflow（CFG / reaching-defs / post-dom / control-dependence）

#### 服务 tk 的需求

- **A（人理解+协作）**：CFG（`seq/cond-true/loop-back/break/throw/...`）+ CDG（控制依赖，`T/F` 分支语义）让 tk 能回答"这个块为什么执行""哪个条件决定了它"，是函数内部结构的人类可读骨架。
- **G（agent 找代码 / 精确爆炸半径）**：REACHING_DEF（到达定义，def→use）把"改了变量 X 会影响哪些读取点"从文件级粗粒度收紧到**语句级、函数内精确**——这是 tk 现有 `edges(kind,src,dst)` 图最缺的精度层。它本质就是一张 def→use 边表，直接落进 tk 的 `edges`。
- **J（taint-ish / 安全味查询）**：gitnexus 的 `SiteRecord`（call/new/member-read + sanitizer interposition）+ reaching-defs 是 taint 引擎的底座。tk 可只抄 reaching-defs 这层（不抄完整 taint），就能支撑"用户输入是否未经清洗到达某 sink"的近似查询。

> **诚实定位（必须 opt-in）**：这是 gitnexus 里**最重的子系统**。它要求 (1) 每函数先建 CFG（基本块切分 + 边）、(2) 每语句采集 def/use/site facts、(3) 跑 post-dominator + dominance-frontier + 到达定义定点/SSA。代价是 per-function 的 CPU/堆尖峰（O(defs×uses) facts，2000 行函数可达 10 万+ fact 对象）。**tk 应把整个 dataflow 层做成 `--pdg`/`tk index --dataflow` 显式开关**，默认只建 codegraph 已有的 symbol/call/import 边；dataflow 边作为可选 `provenance='dataflow'` 增量层。gitnexus 自己也是这么做的：`默认 --pdg off 的 run 与 pre-#2081 字节一致`（emit.ts 模块头）。

---

#### 1) CFG 构建（accumulator 模式）

核心思路：一个**语言无关的累加器** `CfgBuilder` + 一个**每语言的 `CfgVisitor`**。Visitor 走 AST、建块、连边；Builder 拥有合成 ENTRY(0)/EXIT、去重边、限深。tk 用 tree-sitter 已能拿到 AST，照搬这个分层即可。

可抄代码（边去重 + 合成 ENTRY/EXIT + 深度护栏）。源: `src/core/ingestion/cfg/cfg-builder.ts:73-189` [非分发安全]

```ts
export const MAX_CFG_NESTING_DEPTH = 500; // 实际词法上限 ~250（block 体经 visitBody+visitSeq 两次入栈）

export class CfgBuilder {
  private readonly blocks: MutableBlock[] = [];
  private readonly edges: CfgEdgeData[] = [];
  private readonly edgeKeys = new Set<string>();
  private nesting = 0;
  readonly entryIndex: number;
  readonly exitIndex: number;

  constructor(filePath, functionStartLine, functionEndLine, functionStartColumn = 0) {
    this.entryIndex = this.newBlock(functionStartLine, functionStartLine, '', 'entry');
    this.exitIndex = this.newBlock(functionEndLine, functionEndLine, '', 'exit');
  }

  /** Add a single edge (idempotent on from+to+kind). */
  edge(from: number, to: number, kind: CfgEdgeKind): void {
    const key = `${from}->${to}:${kind}`;
    if (this.edgeKeys.has(key)) return;     // 去重：重复 connect 幂等
    this.edgeKeys.add(key);
    this.edges.push({ from, to, kind });
  }

  /** Wire a set of dangling exits to a single target block with one kind. */
  connect(exits: readonly number[], to: number, kind: CfgEdgeKind = 'seq'): void {
    for (const from of exits) this.edge(from, to, kind);
  }

  withNesting<T>(fn: () => T): T {            // 唯一限深 choke point
    this.enterNesting();
    try { return fn(); } finally { this.exitNesting(); }
  }
  enterNesting(): void {
    if (++this.nesting > MAX_CFG_NESTING_DEPTH) throw new CfgNestingDepthError(MAX_CFG_NESTING_DEPTH);
  }
}
```

CFG 边的 13 种 kind（这就是 tk CFG 边的 `reason`/子类型枚举）。源: `src/core/ingestion/cfg/types.ts:190-203` [非分发安全]

```ts
export type CfgEdgeKind =
  | 'seq' | 'cond-true' | 'cond-false' | 'loop-back'
  | 'break' | 'continue' | 'return' | 'throw'
  | 'switch-case' | 'fallthrough'
  | 'finally-return' | 'finally-break' | 'finally-continue';
```

**`collectFunctionCfgs` 的护栏（tk 直接照搬这两个 cap）**。源: `src/core/ingestion/cfg/collect.ts:26,86-127` [非分发安全]

```ts
export const DEFAULT_PDG_MAX_FUNCTION_LINES = 2000;  // 超此行数的函数（多为压缩/生成代码）直接跳过、计数
// 每函数 build 用 try/catch 隔离：一个函数抛 CfgNestingDepthError/任意错误，只计 skipped，不连累全文件
```

**tk 落点**：`src/codegraph/cfg/builder.ts`（`CfgBuilder`）+ `src/codegraph/cfg/visitor-ts.ts`（tree-sitter TS/JS visitor，gitnexus 在 `cfg/visitors/typescript.ts`，755 行，本次未细读 → 需实现时补）。CFG 块落 `nodes(kind='basic_block', file_path, start_line, end_line)`，CFG 边落 `edges(kind='cfg', src, dst, provenance=<edgeKind>)`。

---

#### 2) 到达定义（reaching definitions）= def→use 边（G/J 的核心）

这是**最值得抄进 tk 的算法**：把"变量在哪定义、在哪被读"精确连起来。gitnexus 把它拆成可替换的几段：harvest（采 GEN）→ adjacency（前驱/后继，throw-aware）→ IN-set 求解器（dense 定点 / SSA-sparse，二选一）→ sweep（物化 def→use facts）。tk 最小可行版**只需 dense 定点 + sweep**（SSA 是性能优化，可后补）。

**(a) per-block GEN 采集**（MUST def 杀、MAY def 只加）。源: `src/core/ingestion/cfg/reaching-defs.ts:347-384` [非分发安全]

```ts
function harvestStatementFacts(blocks, n): Harvest {
  const gen: (Map<number, GenEntry> | null)[] = new Array(n).fill(null);
  const allDefsGen: (Lattice | null)[] = new Array(n).fill(null);
  const defLine = new Map<number, number>();
  let defCount = 0, useCount = 0;
  for (const b of blocks) {
    const stmts = b.statements; if (!stmts || stmts.length === 0) continue;
    let g = null, all = null;
    for (let i = 0; i < stmts.length; i++) {
      const s = stmts[i];
      useCount += s.uses.length;
      const key = defKey(b.index, i);
      const record = (d, kills) => {
        defCount += 1; defLine.set(key, s.line);
        if (!g) g = new Map();
        const entry = g.get(d);
        if (kills || !entry) g.set(d, { set: new Set([key]), kills: kills || (entry?.kills ?? false) });
        else entry.set.add(key);          // may-def 累加，绝不清空
        if (!all) all = new Map();
        const allSet = all.get(d); if (allSet) allSet.add(key); else all.set(d, new Set([key]));
      };
      if (s.mayDefs) for (const d of s.mayDefs) record(d, false);  // 条件求值的 def（a && (x=v)、三元臂）→ 只加不杀
      for (const d of s.defs) record(d, true);
    }
    gen[b.index] = g; allDefsGen[b.index] = all;
  }
  return { gen, allDefsGen, defLine, defCount, useCount };
}
```

**(b) dense GEN/KILL worklist 求解器**（tk MVP 用这个；RPO 迭代、单前驱别名零分配）。源: `src/core/ingestion/cfg/reaching-defs.ts:434-504` [非分发安全]

```ts
function computeInSetsDense(cfg, n, h, adj, limits): InSetsResult {
  const { gen, allDefsGen } = h;
  const { preds, succs, throwSuccs } = adj;
  const { order } = reversePostOrder(cfg.entryIndex, succs, n);
  const inSets: Lattice[] = new Array(n).fill(EMPTY_LATTICE);
  const outSets: Lattice[] = new Array(n).fill(EMPTY_LATTICE);
  const inWorklist = new Array(n).fill(true);
  let pending = n;
  const maxBlockVisits = limits?.maxBlockVisits && limits.maxBlockVisits > 0 ? limits.maxBlockVisits : Infinity;
  let blockVisits = 0;
  while (pending > 0) {
    for (const b of order) {
      if (!inWorklist[b]) continue;
      inWorklist[b] = false; pending -= 1;
      if (++blockVisits > maxBlockVisits) return { converged: false };  // 深嵌套定点不收敛 → sound empty
      const p = preds[b];
      const inB: Lattice = p.length === 0 ? EMPTY_LATTICE
        : p.length === 1 && !p[0].viaThrow ? outSets[p[0].from]        // 直线链零分配别名
          : mergePreds(p, inSets, outSets, allDefsGen);
      const inChanged = !latticeEquals(inSets[b], inB);
      inSets[b] = inB;
      const g = gen[b];
      let outB: Lattice;
      if (!g) outB = inB;                  // 无 gen → OUT 别名 IN
      else {
        outB = new Map(inB);               // 复制引用，绝不复制 set 内容
        for (const [bindingIdx, entry] of g) {
          if (entry.kills) outB.set(bindingIdx, entry.set);            // MUST def 整杀
          else { const incoming = inB.get(bindingIdx); outB.set(bindingIdx, incoming ? unionSets(incoming, entry.set) : entry.set); }
        }
      }
      const requeue = (s) => { if (!inWorklist[s]) { inWorklist[s] = true; pending += 1; } };
      if (!latticeEquals(outSets[b], outB)) { outSets[b] = outB; for (const s of succs[b]) requeue(s); }
      if (inChanged) for (const s of throwSuccs[b]) requeue(s);        // throw 边即使 OUT 不变也要 requeue handler
    }
  }
  return { converged: true, reachingAt: (blockIndex, binding) => inSets[blockIndex]?.get(binding) };
}
```

**(c) sweepFacts — 物化 def→use（这就是 tk 要持久化的 dataflow 边）**。源: `src/core/ingestion/cfg/reaching-defs.ts:842-937` [非分发安全]（核心循环）

```ts
function sweepFacts(blocks, reachingAt, defLine, maxFacts): { facts: DefUseFact[]; truncated: boolean } {
  const facts: DefUseFact[] = []; let truncated = false;
  const useKeys: number[] = [];
  outer: for (const b of blocks) {
    const stmts = b.statements; if (!stmts || stmts.length === 0) continue;
    const overlay = new Map<number, DefSet>();        // 块内已重定义的 binding（稀疏 overlay，不物化整块 lattice）
    for (let i = 0; i < stmts.length; i++) {
      const s = stmts[i];
      const hasSelfDefs = s.defs.length > 0 || (s.mayDefs?.length ?? 0) > 0;
      for (const u of s.uses) {
        const reaching = overlay.get(u) ?? reachingAt(b.index, u);
        const selfKey = hasSelfDefs && (s.defs.includes(u) || (s.mayDefs?.includes(u) ?? false)) ? defKey(b.index, i) : undefined;
        if (!reaching && selfKey === undefined) continue;
        useKeys.length = 0;
        if (reaching) for (const k of reaching) useKeys.push(k);
        if (selfKey !== undefined && !reaching?.has(selfKey)) useKeys.push(selfKey);
        useKeys.sort((a, b) => a - b);                // KTD6：截断前按 defKey 排序，保证两求解器截断子集字节一致
        for (const key of useKeys) {
          if (facts.length >= maxFacts) { truncated = true; break outer; }
          const defBlock = Math.floor(key / STMT_STRIDE), defStmt = key % STMT_STRIDE;
          facts.push({ bindingIdx: u,
            def: { blockIndex: defBlock, stmtIndex: defStmt, line: defLine.get(key) ?? s.line },
            use: { blockIndex: b.index, stmtIndex: i, line: s.line } });
        }
      }
      if (s.mayDefs?.length) { const key = defKey(b.index, i);
        for (const d of s.mayDefs) { const prior = overlay.get(d) ?? reachingAt(b.index, d);
          overlay.set(d, prior ? unionSets(prior, new Set([key])) : new Set([key])); } }
      if (s.defs.length > 0) for (const d of s.defs) overlay.set(d, new Set([defKey(b.index, i)])); // kill+gen
    }
  }
  facts.sort(/* def块,def语句,use块,use语句,binding */);
  return { facts, truncated };
}
```

**def-site key 打包技巧**（tk 直接抄；2^21 语句/块 × 块数 ≤ 2^32，留在 Number 2^53 内）。源: `src/core/ingestion/cfg/reaching-defs.ts:163-165` [非分发安全]

```ts
const STMT_STRIDE = 1 << 21;
const defKey = (blockIndex, stmtIndex) => blockIndex * STMT_STRIDE + stmtIndex;
```

**tk 落点**：`src/codegraph/cfg/reaching-defs.ts`。每条 fact → 一条 `edges(kind='reaching_def', src=<defBlock 或 def 语句 node>, dst=<useBlock>, provenance='dataflow')`，`reason` 存 binding 名。gitnexus emit 在持久化前**去重到 (defBlock, useBlock, binding)**（语句级精度只活在内存，taint 按需重算）——tk 应同样只持久化块级去重边，避免 4000 条/函数的爆炸。源: `src/core/ingestion/cfg/emit.ts:414-483` [非分发安全]

---

#### 3) post-dominators（CHK over reverse CFG）+ control dependence（Ferrante / reverse-DF）

CDG 回答"哪个分支条件决定了这个块是否执行"——A 需求的高价值结构。前置是后支配树（=reverse CFG 上的支配树，CHK 算法）。

**post-dominators（CHK 定点，over reversed edges）**。源: `src/core/ingestion/cfg/post-dominators.ts:56-142` [非分发安全]（关键 intersect + 定点，已节选）

```ts
export const NO_IPDOM = -1;
export function computePostDominators(cfg): PostDomTree {
  // ... 建 cfgPreds/cfgSuccs，对 EXIT 做 reverse-CFG postorder，得 postNum/rpo ...
  const ipdom = new Array(n).fill(NO_IPDOM); ipdom[exit] = exit;
  const intersect = (a, b) => { let f1 = a, f2 = b;
    while (f1 !== f2) { while (postNum[f1] < postNum[f2]) f1 = ipdom[f1]; while (postNum[f2] < postNum[f1]) f2 = ipdom[f2]; }
    return f1; };
  let changed = true;
  while (changed) { changed = false;
    for (const b of rpo) { if (b === exit) continue;
      let newIpdom = NO_IPDOM;
      for (const s of cfgSuccs[b]) if (ipdom[s] !== NO_IPDOM) newIpdom = newIpdom === NO_IPDOM ? s : intersect(s, newIpdom);
      if (newIpdom !== NO_IPDOM && ipdom[b] !== newIpdom) { ipdom[b] = newIpdom; changed = true; } } }
  ipdom[exit] = NO_IPDOM; return { ipdom };
}
```

**control dependence（reverse-CFG dominance-frontier 形式，O(N+E+output)）**。源: `src/core/ingestion/cfg/control-dependence.ts:180-204` [非分发安全]（PDF 核心；LLVM/Joern/WALA 同款）

```ts
for (const x of order) {                 // post-dom 树 post-order
  for (const { from: a, kind } of inEdges[x])           // PDF_local：X 的 CFG 前驱 A，X 不（立即）后支配 A
    if (a !== x && ipdom[a] !== x) add(x, a, labelFor(kind, armSenses[a]));
  for (const z of children[x])                           // PDF_up：继承 post-dom 子节点的 frontier
    for (const [a, labels] of pdf[z]) if (ipdom[a] !== x) for (const l of labels) add(x, a, l);
}
// 输出 (controllerBlock, dependentBlock, label) — label='T'|'F'，loop header 合法地控制依赖自身
```

> **soundness gate（tk 必须照抄）**：CDG 仅在 "EXIT 从每个 entry-可达块都可达" 时才正确。gitnexus 用 `isExitReachableFromAllBlocks(cfg)`（post-dominators.ts:182-218，正反两次 reach）做前置检查，不满足就**跳过该函数的 CDG**（CFG/REACHING_DEF 不受影响），并先跑 `synthetic-escape.ts` 的 `augmentForPostDom` 给无限循环补一条 `header→loopExit` 分析专用边（331 行，本次只读了头部契约 → 实现时补）。源: `src/core/ingestion/cfg/post-dominators.ts:182` + `emit.ts:553-568` [非分发安全]

**tk 落点**：`src/codegraph/cfg/post-dominators.ts` + `control-dependence.ts`。CDG 边 → `edges(kind='cdg', src=controllerBlock, dst=dependentBlock, provenance='dataflow', reason='T'|'F')`。POST_DOMINATE 边仅 debug env 下发（`GITNEXUS_PDG_EMIT_POST_DOMINATE`），tk 可不抄。

---

#### 4) node:sqlite 适配（tk 直接可用的 SQL / CTE）

gitnexus 用 Kuzu/Cypher；tk 用 `node:sqlite` 的 `edges(kind, src, dst, provenance, reason)`。dataflow 三类边（`reaching_def` / `cfg` / `cdg`）解锁的查询：

**(Q1) 精确爆炸半径（改某 def → 所有传递受影响的读取点）= 在 reaching_def 边上做递归闭包**：

```sql
-- 输入 :start_node = 被改的 def 块/语句节点 id
WITH RECURSIVE blast(node, depth) AS (
  SELECT :start_node, 0
  UNION
  SELECT e.dst, b.depth + 1
  FROM edges e JOIN blast b ON e.src = b.node
  WHERE e.kind = 'reaching_def'
    AND b.depth < 64           -- 深度护栏，对应 gitnexus per-function cap 思路
)
SELECT DISTINCT n.file_path, n.start_line, n.kind
FROM blast b JOIN nodes n ON n.id = b.node
WHERE b.depth > 0;
```

> 注：reaching_def 是函数内的 def→use。跨函数爆炸半径要把 def→use 闭包**接到 tk 已有的 call 边**（被影响的 use 若是实参 → 沿 call 边进入被调函数的 param binding，再续 reaching_def）。这正是 gitnexus 把 `SiteRecord.args`/`receiver` 接到 taint 的接缝（§5 J 需求）。

**(Q2) 某块为何执行（控制依赖链，A 需求）**：

```sql
WITH RECURSIVE controllers(node, label, depth) AS (
  SELECT e.src, e.reason, 1 FROM edges e
  WHERE e.kind = 'cdg' AND e.dst = :block_id
  UNION
  SELECT e.src, e.reason, c.depth + 1
  FROM edges e JOIN controllers c ON e.dst = c.node
  WHERE e.kind = 'cdg' AND c.depth < 100
)
SELECT n.start_line, c.label  -- label='T'/'F'：走真/假臂才执行
FROM controllers c JOIN nodes n ON n.id = c.node ORDER BY c.depth;
```

**(Q3) taint-ish：用户输入 source 是否未经 sanitizer 到达 sink（J，近似）**：reaching_def 闭包 + 在 path 上排除经过 sanitizer 节点。最简形式是 Q1 的闭包，外加 `WHERE NOT EXISTS (... 经过被标 sanitizer 的 node ...)`；完整 sanitizer interposition（区分 `exec(escape(x))` kill vs `exec(x)` finding）需 `SiteArgOccurrence` via-tag 语义 → 需实现时补。

---

#### 5) 具体数值（gitnexus 的 caps / depths，tk 照抄起点）

| 常量 | 值 | 含义（源） |
|---|---|---|
| `MAX_CFG_NESTING_DEPTH` | 500（有效词法 ~250） | CFG 递归下降限深，超则 skip（cfg-builder.ts:58）|
| `DEFAULT_PDG_MAX_FUNCTION_LINES` | 2000 | 超此行的函数不建 CFG（collect.ts:26）|
| `DEFAULT_MAX_CFG_EDGES_PER_FUNCTION` | 5000 | 每函数 CFG 边上限（emit.ts:40）|
| `DEFAULT_PDG_MAX_REACHING_DEF_EDGES_PER_FUNCTION` | 4000 | 每函数去重 def→use 边上限（mirror Joern；emit.ts:49）|
| `REACHING_DEF_FACTS_PER_EDGE_CAP` | 4 | maxFacts = edgeCap×4（物化护栏；emit.ts:92）|
| `DEFAULT_PDG_MAX_REACHING_DEF_BLOCK_REVISITS` | 64 | maxBlockVisits = 块数×64（dense 定点不收敛护栏；emit.ts:122）|
| `DEFAULT_PDG_MAX_CDG_EDGES_PER_FUNCTION` | 5000 | 每函数 CDG 边上限（emit.ts:59）|
| `STMT_STRIDE` | 1<<21 | def-key 打包步长（reaching-defs.ts:163）|
| `SSA_MIN_BLOCKS` | 16 | ≥16 块且有可达 loop 才走 SSA-sparse，否则 dense（reaching-defs.ts:786,821）|
| `DEFAULT_MAX_SSA_VALUE_GRAPH_NODES` | 1_000_000 | SSA value-graph 节点上限，超则回退 dense（reaching-defs.ts:801）|

**tk 简化建议**：MVP 只抄 dense 求解器（SSA-sparse 是大函数性能优化，多出 dominators→Cytron DF→Tarjan SCC 三段约 320 行 reaching-defs-graph.ts，可后补）。dense 在 `<16 块` 或无循环函数上本就更快，覆盖绝大多数真实函数。

---

#### 6) 抄进来清单

| gitnexus file | tk target | 关键函数 / 数值 |
|---|---|---|
| `cfg/cfg-builder.ts` | `src/codegraph/cfg/builder.ts` | `CfgBuilder.edge/connect/withNesting`、`MAX_CFG_NESTING_DEPTH=500`、合成 ENTRY/EXIT |
| `cfg/types.ts` | `src/codegraph/cfg/types.ts` | `CfgEdgeKind`(13)、`StatementFacts{defs,uses,mayDefs,sites}`、`BindingEntry`、`SiteRecord` |
| `cfg/collect.ts` | `src/codegraph/cfg/collect.ts` | `collectFunctionCfgs`(per-fn try/catch 隔离)、`DEFAULT_PDG_MAX_FUNCTION_LINES=2000` |
| `cfg/reaching-defs.ts` | `src/codegraph/cfg/reaching-defs.ts` | `harvestStatementFacts`、`computeInSetsDense`、`sweepFacts`、`mergePreds`、`buildAdjacency`、`defKey/STMT_STRIDE` |
| `cfg/reaching-defs-graph.ts` | `src/codegraph/cfg/rd-graph.ts`（可选） | `reversePostOrder`、`unionSets`、`latticeEquals`（dense 也用）；`buildDominators/buildDominanceFrontiers/tarjanScc/condenseReachingSets`（仅 SSA，后补）|
| `cfg/post-dominators.ts` | `src/codegraph/cfg/post-dominators.ts` | `computePostDominators`(CHK)、`postDominates`、`isExitReachableFromAllBlocks`(soundness gate)、`NO_IPDOM=-1` |
| `cfg/control-dependence.ts` | `src/codegraph/cfg/control-dependence.ts` | `computeControlDependence`(reverse-DF)、`buildArmSenses`/`labelFor`(T/F 语义) |
| `cfg/emit.ts` | `src/codegraph/cfg/emit.ts`（改写成写 sqlite edges） | 三个 emit 的 cap/去重/onWarn 逻辑 + 全部 `DEFAULT_*` 数值；持久化前去重到 (defBlock,useBlock,binding) |
| `cfg/visitors/typescript.ts`(755行,未读) | `src/codegraph/cfg/visitor-ts.ts` | tree-sitter TS/JS → 块切分 + 边连接 + facts 采集 → **需实现时补** |
| `cfg/synthetic-escape.ts`(331行,只读头) | `src/codegraph/cfg/synthetic-escape.ts`（可选） | `augmentForPostDom`(给无限循环补分析边) → **需实现时补** |

**tk MCP / CLI 落点**：dataflow 层挂 `tk index --dataflow`（默认 off）。新增/增强 MCP 工具：`blast_radius(symbol)`（Q1，沿 reaching_def + call 闭包）、`why_executed(line)`（Q2，CDG 链）、`flows_to(source, sink)`（Q3，taint-ish 近似）。所有 dataflow 边带 `provenance='dataflow'`，与 codegraph 已有 symbol/call/import 边隔离，可单独失效/重建。

---

### gitnexus · Agent Delivery (MCP 工具递送面)

服务 tk 需求 **F**(agent 找代码 / token 优化的对外工具契约)。这一节把 gitnexus 暴露给外部 agent(Claude Code / VS Code Copilot / Cursor)的 **17 个 MCP 工具**全量拆开:工具清单、每个工具的 input schema 与返回、注册方式、以及 gitnexus 用来"自驱动 agent"的 next-step steering。然后映射到 tk 已承诺的 **4 工具面**(`tk_explore` / `tk_node` / `tk_search` / `tk_callers`)+ `impact`,并明确哪些 gitnexus 工具折叠、哪些直接丢弃(tk 要 **少工具**)。

---

#### 1. 全量工具清单(17 个)

源: `src/mcp/tools.ts:80`(`GITNEXUS_TOOLS` 数组)[非分发安全] — 已逐项 Read 确认。下表是全 17 项;`required` 列是 schema 里真正强制的参数。

| # | tool | required 参数 | 返回(摘要) | 注解(annotations) | tk 去向 |
|---|------|------|------|------|------|
| 1 | `list_repos` | —(limit/offset 可选) | 分页 repo 列表 + `pagination{total,limit,offset,returned,hasMore,nextOffset}` | readOnly | **丢**(tk 单 repo / project-local) |
| 2 | `query` | `search_query` | 按 process 分组的执行流 + symbols + 文件位置;BM25+向量 RRF 混排 | readOnly, openWorld | 折叠进 **tk_search**(降级为图+FTS,无向量) |
| 3 | `cypher` | `statement` | `{markdown, row_count}`(Markdown 表) | readOnly | **丢**(tk 无 Cypher;原始 SQL 不暴露给 agent) |
| 4 | `context` | —(name/uid 二选一) | 单 symbol 360°:分类的进/出引用、process 参与、文件位置 | readOnly | 折叠进 **tk_node** |
| 5 | `detect_changes` | — | git diff hunk → 受影响 symbols/processes + 风险摘要 | readOnly | 折叠进 **impact**(`scope` 参数)或单列 |
| 6 | `check` | — | File-IMPORTS 环检测,确定性环路径 + cycleCount | readOnly | **丢 / 缓做**(可后续做 cycles 检查) |
| 7 | `rename` | `new_name` | 多文件协调重命名,逐条带 confidence(graph/text_search) | **destructive** | **丢**(tk 是 navigation-only,编辑窗在 v2) |
| 8 | `impact` | `target`,`direction` | byDepth(d=1/2/3)+ risk + affected_processes + affected_modules | readOnly | 保留 **impact**(核心,见 §4) |
| 9 | `explain` | —(taint 枚举/锚定) | 持久化 taint findings(source→sink) | readOnly | **丢**(需 `--pdg`,tk 无数据流层) |
| 10 | `pdg_query` | `mode`,`target` | CDG 控制依赖 / REACHING_DEF 数据依赖(basic-block 粒度) | readOnly | **丢**(同上,无 PDG 层) |
| 11 | `route_map` | — | API route → handler/middleware/consumer | readOnly | **丢**(框架专用,需 Route 节点) |
| 12 | `tool_map` | — | MCP/RPC tool 定义 → handler 文件 | readOnly | **丢** |
| 13 | `shape_check` | — | route 响应 shape vs consumer 字段访问 mismatch | readOnly | **丢** |
| 14 | `api_impact` | —(route/file) | route_map+shape_check+impact 合并的改前报告 | readOnly | **丢** |
| 15 | `group_list` | — | repo group 配置 | readOnly | **丢**(多 repo group,tk 不需要) |
| 16 | `group_sync` | `name` | 重建跨 repo 契约注册表 | **destructive** | **丢** |
| 17 | `trace` | —(from/to 二选一) | 两 symbol 间最短有向路径(CALLS+HAS_METHOD),逐 hop file:line + edge type/confidence | readOnly | 折叠进 **tk_explore**(或单列为高价值"A 怎么到 B") |

**结论:tk 只取 4–5 个**:`query→tk_search`、`context→tk_node`、`impact`(保留名)、`trace→tk_explore`,callers 是 impact upstream/context 的一个投影 → `tk_callers`。其余 12 个(cypher/rename/check/explain/pdg_query/route_map/tool_map/shape_check/api_impact/group_*/list_repos/detect_changes)对 personal-use、单 repo、navigation-only、无 PDG/向量 的 tk **全部丢弃或缓做**。

---

#### 2. 工具定义的数据结构(verbatim,直接抄)

源: `src/mcp/tools.ts:10`[非分发安全]

```ts
export interface ToolDefinition {
  name: string;
  description: string;
  annotations: ToolAnnotations;
  inputSchema: {
    type: 'object';
    properties: Record<
      string,
      {
        type: string;
        description?: string;
        default?: unknown;
        items?: { type: string };
        enum?: string[];
        minimum?: number;
        maximum?: number;
        minLength?: number;
      }
    >;
    required: string[];
  };
}

const READ_ONLY_TOOL_ANNOTATIONS: ToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};
```

tk 落点:`src/codegraph/mcp/tools.ts`(新建),原样采用这套 `ToolDefinition` + readOnly 注解常量。tk 所有 4 个工具都是 readOnly(navigation-only),无需 destructive 那套。

---

#### 3. 要保留的 3 个工具的完整 schema(verbatim)

**(a) `context` → tk_node** 源: `src/mcp/tools.ts:277`[非分发安全]

```ts
inputSchema: {
  type: 'object',
  properties: {
    name: { type: 'string', description: 'Symbol name (e.g., "validateUser", "AuthService")' },
    uid: {
      type: 'string',
      description: 'Direct symbol UID from prior tool results (zero-ambiguity lookup)',
    },
    file_path: { type: 'string', description: 'File path to disambiguate common names' },
    kind: {
      type: 'string',
      description:
        "Kind filter to disambiguate common names (e.g. 'Function', 'Class', 'Method', 'Interface', 'Constructor')",
    },
    include_content: {
      type: 'boolean',
      description: 'Include full symbol source code (default: false)',
      default: false,
    },
    // repo / service 省略 —— tk 单 repo 不需要
  },
  required: [],
}
```

**关键设计要抄进 tk**:`name | uid | (file_path + kind)` 的**消歧三元**。`uid` 是零歧义直查(上一次工具结果回填),`name` 同名时返回 ranked candidates 让 agent 自己挑,`file_path`/`kind` 是收窄 hint。tk 的 `nodes` 表已有 `kind`/`file_path`/`start_line`,uid 可用 `rowid` 或 `kind:file_path:name:start_line` 复合键。`include_content: false` 默认是关键 token 杠杆 —— 默认只给位置不给源码,要源码才 `true`。

**(b) `impact`** 源: `src/mcp/tools.ts:440`[非分发安全](节选 tk 需要的字段)

```ts
properties: {
  target: { type: 'string', description: 'Name of function, class, or file to analyze' },
  target_uid: {
    type: 'string',
    description:
      'Direct symbol UID from prior tool results (zero-ambiguity lookup, skips target resolution)',
  },
  direction: {
    type: 'string',
    description: 'upstream (what depends on this) or downstream (what this depends on)',
  },
  file_path: { type: 'string', description: 'File path hint to disambiguate common names' },
  kind: { type: 'string', description: "Kind filter to disambiguate common names ..." },
  maxDepth: {
    type: 'number',
    description: 'Max relationship depth (default: 3, server clamps to 1–32)',
    default: 3, minimum: 1, maximum: 32,
  },
  relationTypes: {
    type: 'array', items: { type: 'string' },
    description:
      'Filter: CALLS, IMPORTS, EXTENDS, IMPLEMENTS, HAS_METHOD, HAS_PROPERTY, METHOD_OVERRIDES, METHOD_IMPLEMENTS, ACCESSES (default: usage-based, ACCESSES excluded by default)',
  },
  includeTests: { type: 'boolean', description: 'Include test files (default: false)' },
  minConfidence: {
    type: 'number',
    description: 'Minimum edge confidence 0–1 (default: 0 when omitted; server clamps to 0–1)',
    default: 0, minimum: 0, maximum: 1,
  },
  limit: {
    type: 'integer',
    description:
      'Max symbols returned in byDepth per depth level (default: 100). Use small values for hub symbols to avoid output truncation.',
    default: 100, minimum: 1, maximum: 10000,
  },
  offset: { type: 'integer', description: 'Skip this many symbols per depth level ...', default: 0, minimum: 0 },
  summaryOnly: {
    type: 'boolean',
    description:
      'When true, returns target, summary, risk, byDepthCounts, affected_processes ... — omits byDepth. Use for hub symbols to get actionable signal without output explosion.',
    default: false,
  },
},
required: ['target', 'direction'],
```

返回 shape 源: `src/mcp/local/local-backend.ts:5185`[非分发安全]:

```ts
return {
  ...base,
  ...(perSymbolEnrichmentCapped && { partial: true }),
  ...(anyTruncated && {
    pagination: { ...(Number.isFinite(paginationLimit) && { limit: paginationLimit }), offset: paginationOffset, truncated: true },
  }),
  byDepth: paginatedGrouped,
};
```

`base` 含 `byDepthCounts`(每深度总数,源:`local-backend.ts:5068-5095`)、`risk`、`affected_processes`。

**tk 必抄的三个 token 阀门**(对 F 需求至关重要,否则 hub symbol 会撑爆 LLM 上下文):
1. `summaryOnly` —— hub 节点(基类/共享 util)先只看 risk+每深度计数,再 drill;
2. `limit/offset` **逐深度独立分页**(不是对总结果集),`byDepthCounts` 给每深度总数让 agent 决定要不要翻页;
3. `maxDepth` 默认 **3** 且语义化分层:d=1 WILL BREAK / d=2 LIKELY / d=3 MAY NEED TESTING(源:`skills/gitnexus-impact-analysis.md:41`)。

**(c) `trace` → tk_explore** 源: `src/mcp/tools.ts:773`[非分发安全]

```ts
properties: {
  from: { type: 'string', description: 'Source symbol name' },
  from_uid: { type: 'string', description: 'Source symbol UID (zero-ambiguity)' },
  from_file: { type: 'string', description: 'Source file path hint for disambiguation' },
  to: { type: 'string', description: 'Target symbol name' },
  to_uid: { type: 'string', description: 'Target symbol UID (zero-ambiguity)' },
  to_file: { type: 'string', description: 'Target file path hint for disambiguation' },
  maxDepth: {
    type: 'number',
    description: 'Maximum path length in hops (default: 10)',
    default: 10, minimum: 1, maximum: 30,
  },
  includeTests: { type: 'boolean', description: 'Include test-file symbols in traversal (default: false)' },
},
required: [],
```

trace 的卖点(描述里写明):"answers in one call what would take 3-8 manual context/impact hops"。无路径时返回**最远可达节点** + `truncated:true`(命中遍历 cap)。tk_explore 抄这个"A→B 最短路 + 断点反馈"。

---

#### 4. node:sqlite 适配(impact / trace / callers 的 CTE)

gitnexus 用 Kuzu/Cypher 做这些遍历;tk 用 `node:sqlite` 的 `edges(src, dst, kind, confidence, provenance)` + `nodes(rowid, kind, name, file_path, start_line)`。下面是直接可用的 SQL/CTE。

**(a) `tk_callers`(= impact upstream d=1,最高频)** —— 直接 callers:

```sql
-- callers of target node :tid (one hop, upstream over CALLS)
SELECT n.rowid AS uid, n.name, n.file_path, n.start_line, e.confidence
FROM edges e
JOIN nodes n ON n.rowid = e.src
WHERE e.dst = :tid AND e.kind = 'CALLS' AND e.confidence >= :minConf
ORDER BY e.confidence DESC
LIMIT :limit OFFSET :offset;
```

**(b) `impact` upstream byDepth(BFS 分层,WITH RECURSIVE)** —— 对应 gitnexus 的 maxDepth=3 默认:

```sql
WITH RECURSIVE blast(uid, depth, conf) AS (
  -- depth 0: the target itself
  SELECT :tid, 0, 1.0
  UNION
  -- climb upstream: who points AT a node already in blast
  SELECT e.src, b.depth + 1, e.confidence
  FROM edges e
  JOIN blast b ON e.dst = b.uid
  WHERE b.depth < :maxDepth                          -- default 3, clamp 1..32
    AND e.kind IN ('CALLS','IMPORTS','EXTENDS','IMPLEMENTS')  -- relationTypes filter
    AND e.confidence >= :minConf
)
SELECT b.depth, n.rowid AS uid, n.name, n.file_path, n.start_line
FROM blast b
JOIN nodes n ON n.rowid = b.uid
WHERE b.depth > 0
ORDER BY b.depth, n.file_path, n.start_line;
-- 应用层按 depth 分桶 => byDepth{1:[...],2:[...],3:[...]}，
-- byDepthCounts = 每桶 length，summaryOnly 时只回 counts+risk 不回数组。
```

downstream(this depends on)只需把递归边方向反过来:`SELECT e.dst ... JOIN blast b ON e.src = b.uid`。
**注意**:SQLite `WITH RECURSIVE` 的 `UNION`(非 ALL)天然做环路去重,等价 gitnexus 的 visited-set,避免 IMPORTS 环导致无限递归。

**(c) `trace`(A→B 最短路,call+member 边)** —— SQLite 无内建最短路,用带路径累积的 BFS,取第一个到达 :to 的:

```sql
WITH RECURSIVE walk(uid, hops, path) AS (
  SELECT :from, 0, ',' || :from || ','
  UNION
  SELECT e.dst, w.hops + 1, w.path || e.dst || ','
  FROM edges e
  JOIN walk w ON e.src = w.uid
  WHERE w.hops < :maxDepth                            -- default 10, clamp 1..30
    AND e.kind IN ('CALLS','HAS_METHOD')               -- trace 的两类边
    AND instr(w.path, ',' || e.dst || ',') = 0         -- 防环：dst 不在已走路径里
)
SELECT uid, hops, path FROM walk
WHERE uid = :to
ORDER BY hops ASC
LIMIT 1;
-- 无结果 => 回 furthest reachable（取 walk 里 hops 最大那条）+ truncated:true（若 hops 触到 maxDepth）
```

每 hop 的 edge type/confidence:拿 `path` 里相邻 uid 对回查 `edges` 即可对齐 gitnexus 的 `edges[]` 输出。

---

#### 5. 注册方式 + next-step steering(tk 必抄)

**注册**(源:`src/mcp/server.ts:156`[非分发安全]):`ListToolsRequestSchema` 直接 map `GITNEXUS_TOOLS`,`CallToolRequestSchema` 调 `backend.callTool(name,args)` 并把结果 stringify。tk 落点 `src/codegraph/mcp/server.ts`,同构即可(node:sqlite backend 替代 LadybugDB)。

**最有价值的可抄件 = next-step hint**(源:`src/mcp/server.ts:40` `getNextStepHint`)[非分发安全]:

```ts
// 在每次 tool 返回文本后追加，引导 agent 自驱动下一步（无需 hook）
switch (toolName) {
  case 'query':
    return `\n\n---\n**Next:** To understand a specific symbol in depth, use context({name: "<symbol_name>"${repoParam}}) ...`;
  case 'context':
    return `\n\n---\n**Next:** If planning changes, use impact({target: "${args?.name || '<name>'}", direction: "upstream"${repoParam}}) ...`;
  case 'impact':
    return `\n\n---\n**Next:** Review d=1 items first (WILL BREAK). ...`;
}
```

设计意图(原注释):*"Agents often stop after one tool call. These hints guide them to the logical next action, creating a self-guiding workflow without hooks."* —— tk 4 工具串成 `tk_search → tk_node → impact` 的 next-step 链,这是用工具描述本身做 steering、省掉 skill/hook 的低成本手段,**直接服务 F**(让 agent 用更少往返找到代码)。

**反提示工程小技巧**(源:`tools.ts:138-143` 注释)[非分发安全]:gitnexus 故意**不在 schema 里命名 `query` 字段**(用 `search_query`),因为 LLM 看到属性名叫 `query` 会去发 `query`,而 Claude Code 恰好会丢掉名为 `query` 的参数。tk 命名工具参数时避开 `query`,用 `search_query`/`statement` 这类无歧义名。

**工具描述模板**(每个 description 的固定结构,抄进 tk):`WHEN TO USE:` + `AFTER THIS:` + 输出字段说明 + `TIP:`(token 阀门提示)。这是 gitnexus 引导 agent 正确选工具/控 token 的核心文案骨架。

**skill 钩子**(源:`skills/gitnexus-impact-analysis.md`):tk 若做 Claude Code skill,抄它的 Workflow 编号步骤 + 风险表(d=1/2/3 → WILL BREAK/LIKELY/MAY TEST,symbol 数 → LOW/MEDIUM/HIGH/CRITICAL)。

---

#### 6. 抄进来清单

| gitnexus file:line | tk target | 关键函数 / 物 |
|---|---|---|
| `src/mcp/tools.ts:10` | `src/codegraph/mcp/tools.ts` | `ToolDefinition` 接口 + `READ_ONLY_TOOL_ANNOTATIONS` |
| `src/mcp/tools.ts:277`(context schema) | tk_node 定义 | `name\|uid\|(file_path+kind)` 消歧三元、`include_content` 默认 false |
| `src/mcp/tools.ts:440`(impact schema) | impact 定义 | `summaryOnly` / `limit+offset` 逐深度分页 / `byDepthCounts` / `relationTypes` / `maxDepth=3` |
| `src/mcp/tools.ts:773`(trace schema) | tk_explore 定义 | `from/to` + uid/file hints、`maxDepth=10`、furthest-reachable 反馈 |
| `src/mcp/server.ts:40` `getNextStepHint` | `src/codegraph/mcp/server.ts` | 每工具返回追加 next-step,自驱动工作流 |
| `src/mcp/server.ts:156` 注册块 | 同上 | `ListTools`/`CallTool` handler 同构(换 sqlite backend) |
| `src/mcp/local/local-backend.ts:5185` impact 返回 | impact handler | `byDepth`/`byDepthCounts`/`partial`/`pagination.truncated` 返回 shape |
| `tools.ts:138` 反提示注释 | tk 工具参数命名约定 | 避开 `query` 字段名(用 `search_query`) |
| `skills/gitnexus-impact-analysis.md` | tk skill(可选) | 风险表 + Workflow 编号 |

**具体数值汇总**(gitnexus 实际用的 cap/默认):impact `maxDepth` 默认 3、clamp 1–32;`limit` 默认 100、max 10000(逐深度);`crossDepth` 1。trace `maxDepth` 默认 10、max 30。query `limit` 默认 5、max 100;`max_symbols` 默认 10、max 200。分页类(list_repos/explain/pdg_query)默认 50、max 200。impact Phase-1 `timeoutMs` 默认 30000。这些是 tk 直接可用的初始阈值。


---

### gitnexus · HUMAN 面（serve + 大图渲染）

**服务 tk 需求（标 H）**：H = 人类理解面，tk 的落点是「自包含、inline-JSON 的单文件 HTML 图谱查看器」，复用 `src/report/html.ts` 的 `embed()` 注入 + 离线 file:// 渲染。gitnexus 是「1 后端 N 前端」的在线架构（Express + Sigma/graphology），但其**大图可读性决策（load-decision 阈值）、节点尺寸/质量随密度缩放、按深度/标签过滤、边的两遍分层绘制**这几块算法核心，和 tk 的离线 HTML 查看器需求高度一致，可直接抄。tk **不抄** Sigma/graphology/ForceAtlas2/React/Express 这套在线运行时（与 zero-runtime-dep + 离线 file:// 冲突），只抄**纯决策/纯数据整形**的部分。

---

#### 1. 大图加载决策（load-decision 阈值）— tk 最该抄的一块

gitnexus 发现「浏览器在超大图上会卡死」，于是在**下载图之前**用节点数 **或** 边数任一超阈值就降级为「只聊天/不画图」（issue #2178）。tk 的 HTML 查看器同理：把整张图 inline 进 HTML 会让浏览器 force-layout 卡死，所以要在**生成 HTML 时**就按同样阈值决定「全量内联 vs 降级（只给可点击的列表/摘要，画布留 escape-hatch 按钮）」。

可抄代码（纯函数，零依赖，可直接落进 tk）：

源: `gitnexus-web/src/lib/graph-load-decision.ts:28-84` [非分发安全]
```ts
const isOver = (count: number | null | undefined, threshold: number | undefined): boolean =>
  typeof threshold === 'number' &&
  typeof count === 'number' &&
  Number.isFinite(count) &&
  count > threshold;

/**
 * Decide whether to skip the graph download.
 * - An explicit boolean choice always wins (override in both directions).
 * - Otherwise auto-detect: skip when EITHER the node count OR the edge count is
 *   known and strictly greater than its threshold. Edges matter because the
 *   browser force-layout cliff is edge-driven ...
 * - Missing/unknown counts fail open to a full download (we never skip purely
 *   because we couldn't read the size).
 */
export function decideSkipGraph({
  explicit, nodeCount, threshold, edgeCount, edgeThreshold,
}: SkipGraphDecisionInput): boolean {
  if (typeof explicit === 'boolean') return explicit;
  return isOver(nodeCount, threshold) || isOver(edgeCount, edgeThreshold);
}

/**
 * Whether to prompt before loading the full graph from the chat-only escape
 * hatch. Confirm whenever the node count is large OR unknown — never silently
 * re-load a graph we cannot size.
 */
export function shouldConfirmGraphLoad(
  nodeCount: number | null | undefined, threshold: number,
): boolean {
  if (typeof nodeCount !== 'number' || !Number.isFinite(nodeCount)) return true;
  return nodeCount > threshold;
}
```

**gitnexus 用的具体数值**（源: `gitnexus-web/src/config/ui-constants.ts:20,29` [非分发安全]，含其注释里的实测依据）：
- `DEFAULT_LARGE_GRAPH_NODE_THRESHOLD = 25_000`
- `DEFAULT_LARGE_GRAPH_EDGE_THRESHOLD = 50_000`
- 注释依据：sigma.js/graphology 实测 `~10K` 节点流畅渲染、复杂样式渲染在 `~5K` 之后吃力、force-layout 在 `~50K 边` 之后退化；gitnexus 图「边比节点多 ~1.7×」，所以边的悬崖在 `~25–30K 节点` 时被跨过 → 节点阈值压到 25K，并**额外加边阈值**兜底「边多但节点少」的仓库。

**node:sqlite 适配**：tk 不需要后端调用——在生成 HTML 前用一条 SQL 取计数即可：
```sql
-- node/edge 计数（喂给 decideSkipGraph）
SELECT (SELECT COUNT(*) FROM nodes) AS node_count,
       (SELECT COUNT(*) FROM edges) AS edge_count;
```
**tk 落点**：新建 `src/codegraph/viewer/load-decision.ts`（verbatim 抄这两个纯函数）；在 HTML 生成器里调用：`node_count` 或 `edge_count` 超阈值 → 不内联全图，改内联「降级载荷」（节点/边的轻量列表 + 「Load full graph anyway」按钮，对应 gitnexus 的 chatOnly escape-hatch，`GraphCanvas.tsx:368-390`）。tk 单文件 HTML 场景里没有 `window.confirm` 异步交互，可把 `shouldConfirmGraphLoad` 用在「按钮点开前的内联 warning 文案」上。

---

#### 2. 节点尺寸/质量随图密度缩放（大图仍保持层级可读）

大图里如果节点都一样大就糊成一团；gitnexus 按总节点数分档缩小节点、并保留最小值以维持层级差异。这对 tk 的 SVG/Canvas 渲染同样直接可用（纯计算，无 Sigma 依赖）。

源: `gitnexus-web/src/lib/graph-adapter.ts:47-55` [非分发安全]
```ts
const getScaledNodeSize = (baseSize: number, nodeCount: number): number => {
  if (nodeCount > 50000) return Math.max(1, baseSize * 0.4);
  if (nodeCount > 20000) return Math.max(1.5, baseSize * 0.5);
  if (nodeCount > 5000) return Math.max(2, baseSize * 0.65);
  if (nodeCount > 1000) return Math.max(2.5, baseSize * 0.8);
  return baseSize;
};
```
边宽也同档收窄（源: `graph-adapter.ts:291` [非分发安全]）：
```ts
const edgeBaseSize = nodeCount > 20000 ? 0.4 : nodeCount > 5000 ? 0.6 : 1.0;
```
`getNodeMass`（源: `graph-adapter.ts:61-85` [非分发安全]）是 ForceAtlas2 专用的「斥力质量」（Project 50 / Package 30 / Module 20 / Folder 15 / File 3 / Class·Interface 5 / Function·Method 2，并在 >1000/>5000 节点时乘 1.5/2）——**tk 若不做 force-layout 则跳过 mass**；但若 tk 想做最简单的「按类型分层」静态布局，这套相对权重可作为「类型重要性排序」直接复用。

**tk 落点**：`src/codegraph/viewer/scale.ts`，HTML 内联脚本渲染节点半径/边宽时调用；`nodeCount` 来自第 1 节的 SQL 计数。

---

#### 3. 按深度/标签过滤（聚焦一个节点的 N 跳邻域）— 大图可读性的核心交互

大图全量画没法读，gitnexus 提供「选中一个节点 → 只显示 N 跳内 + 指定类型」的过滤。BFS 部分纯算法，tk 内联脚本可直接抄；但 tk 更应该把它**下沉到 SQL**，让 HTML 只内联「当前聚焦子图」而非全图（从根上规避大图卡死）。

源: `gitnexus-web/src/lib/graph-adapter.ts:528-580` [非分发安全]
```ts
/** Get all nodes within N hops of a starting node */
export const getNodesWithinHops = (
  graph, startNodeId: string, maxHops: number,
): Set<string> => {
  const visited = new Set<string>();
  const queue: { nodeId: string; depth: number }[] = [{ nodeId: startNodeId, depth: 0 }];
  while (queue.length > 0) {
    const { nodeId, depth } = queue.shift()!;
    if (visited.has(nodeId)) continue;
    visited.add(nodeId);
    if (depth < maxHops) {
      graph.forEachNeighbor(nodeId, (neighborId) => {
        if (!visited.has(neighborId)) queue.push({ nodeId: neighborId, depth: depth + 1 });
      });
    }
  }
  return visited;
};

/** Filter nodes by depth from selected node (sets hidden=true outside range/labels) */
export const filterGraphByDepth = (graph, selectedNodeId, maxHops, visibleLabels): void => {
  if (maxHops === null) { filterGraphByLabels(graph, visibleLabels); return; }
  if (selectedNodeId === null || !graph.hasNode(selectedNodeId)) {
    filterGraphByLabels(graph, visibleLabels); return;
  }
  const nodesInRange = getNodesWithinHops(graph, selectedNodeId, maxHops);
  graph.forEachNode((nodeId, attributes) => {
    const isLabelVisible = visibleLabels.includes(attributes.nodeType);
    const isInRange = nodesInRange.has(nodeId);
    graph.setNodeAttribute(nodeId, 'hidden', !isLabelVisible || !isInRange);
  });
};
```
注意：gitnexus 这里用的是**无向邻居**（`forEachNeighbor`，不分 src/dst 方向），即「围绕焦点的连通邻域」。

**node:sqlite 适配**（WITH RECURSIVE CTE，把 N 跳邻域下沉到 SQL，只把子图内联进 HTML）：
```sql
-- N-hop 无向邻域（双向遍历 edges，对应 forEachNeighbor）
WITH RECURSIVE hood(id, depth) AS (
  SELECT :startId, 0
  UNION
  SELECT CASE WHEN e.src = h.id THEN e.dst ELSE e.src END, h.depth + 1
  FROM hood h
  JOIN edges e ON (e.src = h.id OR e.dst = h.id)
  WHERE h.depth < :maxHops
)
SELECT DISTINCT n.* FROM nodes n
JOIN hood ON hood.id = n.id
WHERE n.kind IN (/* visibleLabels */);   -- 标签过滤等价 filterGraphByLabels
```
对应的子图边（两端都在邻域内）：
```sql
SELECT e.* FROM edges e
WHERE e.src IN (SELECT id FROM hood) AND e.dst IN (SELECT id FROM hood);
```
**tk 落点**：`src/codegraph/viewer/subgraph.ts`（SQL 取焦点子图）+ HTML 内联脚本里保留 BFS 版 `getNodesWithinHops` 做「客户端二次收窄」（用户在已内联子图上再调 depth 滑块，无需回后端）。这就是 tk 把「焦点子图 SQL 下沉 + 客户端再过滤」结合的关键：**HTML 永远只内联一个可控大小的子图**，从源头规避第 1 节的大图卡死。

---

#### 4. 边的两遍分层绘制 + 每类型独立配色（视觉可读性）

层级边（CONTAINS/DEFINES）画在底层、跨边（CALLS/IMPORTS/EXTENDS）画在顶层，且每种关系一个颜色 → 大图里关系类型一眼可分。这是纯渲染顺序约定，tk HTML 内联脚本可直接照搬。

源: `gitnexus-web/src/lib/graph-adapter.ts:295-343` [非分发安全]
```ts
const EDGE_STYLES: Record<string, { color: string; sizeMultiplier: number }> = {
  CONTAINS:   { color: '#2d5a3d', sizeMultiplier: 0.4 },  // 层级 绿
  DEFINES:    { color: '#0e7490', sizeMultiplier: 0.5 },  // 定义 青
  IMPORTS:    { color: '#1d4ed8', sizeMultiplier: 0.6 },  // 依赖 蓝
  CALLS:      { color: '#7c3aed', sizeMultiplier: 0.8 },  // 调用 紫
  EXTENDS:    { color: '#c2410c', sizeMultiplier: 1.0 },  // 继承 橙
  IMPLEMENTS: { color: '#be185d', sizeMultiplier: 0.9 },  // 实现 粉
  HAS_METHOD:   { color: EDGE_INFO.DEFINES.color,  sizeMultiplier: 0.4 },
  HAS_PROPERTY: { color: EDGE_INFO.CONTAINS.color, sizeMultiplier: 0.35 },
};
// 背景边类型（先画，沉底）
const BACKGROUND_EDGE_TYPES = new Set(['CONTAINS', 'DEFINES', 'HAS_METHOD', 'HAS_PROPERTY']);
// Pass 1: background (hierarchy) edges — rendered behind
knowledgeGraph.relationships.forEach((rel) => { if (BACKGROUND_EDGE_TYPES.has(rel.type)) addEdge(rel); });
// Pass 2: foreground (cross) edges — rendered on top
knowledgeGraph.relationships.forEach((rel) => { if (!BACKGROUND_EDGE_TYPES.has(rel.type)) addEdge(rel); });
```
**tk 落点**：`src/codegraph/viewer/edge-style.ts`（配色表 + 两遍绘制顺序常量），与 tk 的 `edges.kind` 取值对齐后内联进 HTML 脚本。tk 的 `edges.kind` 命名需映射到这张表（`CONTAINS/DEFINES/IMPORTS/CALLS/EXTENDS/IMPLEMENTS`）。

---

#### 5. 后端供图协议（tk 只需理解、不照抄）

gitnexus 的 `/api/graph`（源: `gitnexus/src/server/api.ts:1087-1161` [非分发安全]）有两个值得 tk 记住的点：

1. **全量 vs 流式**：`?stream=true` 时用 NDJSON 逐行吐节点/关系（`Content-Type: application/x-ndjson`），避免一次性把巨图序列化进内存。源: `streamGraphNdjson` `api.ts:421-455` [非分发安全]：先逐表 stream 所有节点，再 stream 所有关系。
2. **数据形状**：图 = `{ nodes: GraphNode[], relationships: GraphRelationship[] }`；关系行的投影（源: `api.ts:338-340` GRAPH_RELATIONSHIP_QUERY [非分发安全]）= `sourceId, targetId, type, confidence, reason, step` —— 即「带 provenance 的 typed edge」，和 tk 的 `edges(kind, src, dst, provenance)` 一一对应。

**node:sqlite 适配 / tk 落点**：tk 是离线单文件，**不需要 HTTP/stream**——直接 SQL 取整图（或第 3 节的焦点子图）后用 `embed()` 内联：
```sql
-- nodes 载荷
SELECT id, kind, file_path, start_line, end_line, name FROM nodes;
-- edges 载荷（带 provenance，对应 gitnexus 的 confidence/reason/step）
SELECT kind, src, dst, provenance FROM edges;
```
内联走 tk 已有的 `src/report/html.ts:24-30` `embed()`（`</script>` 断逃 + U+2028/2029 转义）+ `renderReportHtml` 的 `window.__TK_REPORT__ = ${embed(doc)}` 模式（源: `src/report/html.ts:762`）。tk 的 HTML 查看器 = 在同一个 `embed` 注入框架里新增一个 `ReportKind: "graph"`，data 就是上面两条 SQL 的结果（或降级载荷）。

---

#### 抄进来清单

| gitnexus 文件 | tk 目标 | 关键函数/常量 |
|---|---|---|
| `gitnexus-web/src/lib/graph-load-decision.ts` | `src/codegraph/viewer/load-decision.ts` | `decideSkipGraph` / `shouldConfirmGraphLoad`（verbatim） |
| `gitnexus-web/src/config/ui-constants.ts` | 同上常量 | 节点阈值 `25_000`、边阈值 `50_000` |
| `gitnexus-web/src/lib/graph-adapter.ts:47-55,291` | `src/codegraph/viewer/scale.ts` | `getScaledNodeSize` + `edgeBaseSize` 分档 |
| `gitnexus-web/src/lib/graph-adapter.ts:528-580` | `src/codegraph/viewer/subgraph.ts` + 内联脚本 | `getNodesWithinHops` / `filterGraphByDepth`（→ 改写为 SQL CTE + 客户端二次过滤） |
| `gitnexus-web/src/lib/graph-adapter.ts:295-343` | `src/codegraph/viewer/edge-style.ts` | `EDGE_STYLES` 配色 + `BACKGROUND_EDGE_TYPES` 两遍绘制 |
| `gitnexus/src/server/api.ts:338-340,421-455,1087-1161` | 仅参考（不照抄 HTTP/stream） | 图数据形状 `{nodes, relationships}`、关系投影含 provenance |
| (复用) `src/report/html.ts:24-30,762` | `src/codegraph/viewer/html.ts` | `embed()` XSS-safe 注入 + `window.__TK_REPORT__` 内联模式 |

**与 tk H 决策的对齐总结**：tk 取 gitnexus「在线 N 前端」里**唯一与离线单文件相容的内核**——load-decision 阈值（25K/50K）、密度缩放、焦点子图过滤、边分层配色——其余 Sigma/graphology/ForceAtlas2/Express/React 全部**不抄**。tk 的大图可读性策略 = 「**SQL 下沉焦点子图（永不内联全图）+ load-decision 阈值兜底 + 客户端 depth 滑块二次收窄**」，三者叠加从源头规避浏览器卡死，而 HTML 仍是离线 file:// 自包含（复用现成 `embed()`）。

---

### gitnexus · storage（schema / node-edge 模型 / 查询 seam → tk node:sqlite）

#### 服务 tk 需求

- **C（agent 找代码 / token 优化的底座）** —— 本子系统是整个 typed property graph 的存储与查询 seam。gitnexus 的 schema 设计（hybrid 节点表 + 单一 `CodeRelation` 边表 with `type`/`confidence`/`reason`）几乎可以 1:1 映射到 tk 的 `nodes(kind, file_path, start_line, ...)` / `edges(kind, src, dst, provenance)`，是 tk 这两张表的"设计依据"。
- **C** 同时覆盖：图的内存索引模型（双向邻接 + per-type bucket + per-file bucket，用于增量删除）、查询的发布方式（prepared-statement seam + 行归一化）、增量回写键（per-file SHA-256 diff）、以及"为什么 tk 不抄 Kuzu/lbug 原生绑定"的论证。
- 顺带服务 **B/A**：navigation 查询（callers / callees / inter-file edges / impact）的 Cypher 范式，给出 node:sqlite CTE 等价。

---

#### 1. Schema / node-edge 模型（最核心可抄项）

gitnexus 用 **hybrid schema**：每种代码元素一张节点表，但**所有关系塞进单一 `CodeRelation` 边表**，靠 `type` 列区分。这正是 tk `edges(kind, ...)` 的设计原型。

边表定义（节选自 RELATION_SCHEMA，确认存在于 schema.ts:246-456）：

```ts
// 源: src/core/lbug/schema.ts:452-456 [非分发安全]
  type STRING,
  confidence DOUBLE,
  reason STRING,
  step INT32
)`;
```

节点表的公共列形（确认存在，CODE_ELEMENT_BASE）：

```ts
// 源: src/core/lbug/schema.ts:146-156 [非分发安全]
const CODE_ELEMENT_BASE = (name: string) => `
CREATE NODE TABLE \`${name}\` (
  id STRING,
  name STRING,
  filePath STRING,
  startLine INT64,
  endLine INT64,
  content STRING,
  description STRING,
  PRIMARY KEY (id)
)`;
```

节点 label 与边类型的**单一真相源**（确认存在 schema-constants.ts:11-86）—— tk 的 `nodes.kind` / `edges.kind` 枚举可直接借用这两份清单：

```ts
// 源: gitnexus-shared/src/lbug/schema-constants.ts:11-45 [非分发安全]
export const NODE_TABLES = [
  'File','Folder','Function','Class','Interface','Method','CodeElement',
  'Community','Process','Section','Struct','Enum','Macro','Typedef','Union',
  'Namespace','Trait','Impl','TypeAlias','Const','Static','Variable','Property',
  'Record','Delegate','Annotation','Constructor','Template','Module','Route',
  'Tool','BasicBlock',
] as const;

// 源: gitnexus-shared/src/lbug/schema-constants.ts:49-86 [非分发安全]
export const REL_TABLE_NAME = 'CodeRelation';
export const REL_TYPES = [
  'CONTAINS','DEFINES','IMPORTS','CALLS','EXTENDS','IMPLEMENTS',
  'HAS_METHOD','HAS_PROPERTY','ACCESSES','METHOD_OVERRIDES','OVERRIDES',
  'METHOD_IMPLEMENTS','MEMBER_OF','STEP_IN_PROCESS','HANDLES_ROUTE','FETCHES',
  'HANDLES_TOOL','ENTRY_POINT_OF','WRAPS','QUERIES',
  // PDG/taint substrate（保留，尚未发射）：
  'CFG','REACHING_DEF','TAINTED','SANITIZES','TAINT_PATH','CDG','POST_DOMINATE',
] as const;
```

边的运行期对象形（确认存在 graph/types.ts:182-206），决定 tk `edges` 表该有哪些列：

```ts
// 源: gitnexus-shared/src/graph/types.ts:182-206 [非分发安全]
export interface GraphRelationship {
  id: string;
  sourceId: string;
  targetId: string;
  type: RelationshipType;
  confidence: number;     // → tk edges.confidence (REAL)
  reason: string;         // → tk edges.provenance / reason
  step?: number;          // → 仅 STEP_IN_PROCESS 用，可省
  evidence?: readonly { kind: string; weight: number; note?: string }[]; // → JSON 列
}
```

**关键设计取舍（直接抄 idea）**：

1. **边类型重载在一个 `type`/`kind` 列**，不为每种关系建表 —— tk 已采纳（`edges(kind,...)`）。
2. **`confidence DOUBLE` + `reason STRING` 是边的一等列**，不是 properties bag。resolution pipeline 给每条边打置信度与"为什么连这条边"。tk 的 `edges.provenance` 应同时承载 reason，并加 `confidence REAL`。
3. **`reason` 列被复用为多义载荷**（schema.ts:224-239, 80-85 注释确认）：`ACCESSES` 边用 `reason='read'|'write'`；`REACHING_DEF` 把变量名放进 `reason`；`CDG` 把分支 sense `'T'|'F'` 放进 `reason`。因为 LadybugDB **对边属性没有二级索引**（schema.ts:227-230 明说），专设列也无收益。→ tk 在 SQLite 里**有 FTS5**，所以 tk 可以反过来：把这些语义放进结构化列或 provenance JSON，并用 FTS5 索引，这是 tk 相对 gitnexus 的存储优势。
4. **`isExported BOOLEAN` 列**（FUNCTION/CLASS/METHOD schema 有，CODE_ELEMENT_BASE 无）—— 导出符号是 export-surface 查询的高频过滤（见 graph-queries.ts:77-84），tk `nodes` 应保留 `is_exported INTEGER`。
5. **`content STRING` 直接存在节点上** —— gitnexus 把符号源码塞进节点表 `content` 列，read-lane 可不回文件直接取。tk 可选：`nodes.content` 或仅存 `start_line/end_line` 让 read-lane 回切。gitnexus 还为 embedding **单独建表**（schema.ts:458-491 注释：避免 copy-on-write 开销）—— tk 若上向量同理应分表。

#### node:sqlite 适配（schema DDL）

```sql
-- tk 落点：src/codegraph/schema.ts —— 节点表（单表 + kind 列，不学 gitnexus 的 per-kind 表，
-- 因为 SQLite 无 label 概念、单表 + kind 列 + 索引更简单，且 FTS5 只能挂一张表）
CREATE TABLE nodes (
  id          TEXT PRIMARY KEY,          -- 'Function:src/a.ts:doThing' 形（见 §2）
  kind        TEXT NOT NULL,             -- ← NODE_TABLES 枚举
  name        TEXT,
  file_path   TEXT,
  start_line  INTEGER,
  end_line    INTEGER,
  is_exported INTEGER DEFAULT 0,
  content     TEXT,
  description TEXT
);
CREATE INDEX nodes_by_file ON nodes(file_path);   -- ← 对应 graph.ts 的 nodeIdsByFile
CREATE INDEX nodes_by_kind_name ON nodes(kind, name);

-- 单一边表，kind 重载（直抄 CodeRelation idea）
CREATE TABLE edges (
  id         TEXT PRIMARY KEY,
  src        TEXT NOT NULL,             -- sourceId
  dst        TEXT NOT NULL,             -- targetId
  kind       TEXT NOT NULL,            -- ← REL_TYPES 枚举
  confidence REAL DEFAULT 1.0,
  provenance TEXT,                     -- reason + evidence JSON
  FOREIGN KEY (src) REFERENCES nodes(id),
  FOREIGN KEY (dst) REFERENCES nodes(id)
);
-- 双向邻接索引（对应 graph.ts 的 edgeIdsByNode 正/反向；CTE 遍历必须两向都索引）
CREATE INDEX edges_by_src  ON edges(src, kind);
CREATE INDEX edges_by_dst  ON edges(dst, kind);
CREATE INDEX edges_by_kind ON edges(kind);

-- FTS5（tk 独有，gitnexus 没有）：name+content 全文，支撑 grep-lite / 符号搜索
CREATE VIRTUAL TABLE nodes_fts USING fts5(name, content, content='nodes', content_rowid='rowid');
```

---

#### 2. node-id 格式（必须抄，决定 CTE 能否 join）

gitnexus 的 node id **不是随机的**：前缀即 label，靠 `:` 分段。这让"从 id 反推表名"零成本，也让边表 join 稳定。

```ts
// 源: src/core/lbug/rel-pair-routing.ts:42-46 [非分发安全]
export const getNodeLabel = (nodeId: string): string => {
  if (nodeId.startsWith('comm_')) return 'Community';
  if (nodeId.startsWith('proc_')) return 'Process';
  return nodeId.split(':')[0];          // 'Function:src/a.ts:doThing' → 'Function'
};
```

→ tk 落点 `src/codegraph/node-id.ts`：采用 `<Kind>:<filePath>:<name>`（或 `<Kind>:<filePath>:<startLine>`）格式，使 `nodes.id` 全局唯一且自带 kind。**注意**：tk 用 SQLite，可以不靠前缀反推 kind（直接 `nodes.kind` 列），但 id 仍应是**确定性可重算**的（同一符号每次 analyze 得同一 id），这是增量回写（§5）能 delete-by-file 再 insert 的前提。

---

#### 3. 查询发布 seam（prepared statement + 行归一化）

gitnexus 把所有写入/查询收口到 `executePrepared`（防注入），读取统一走 `readQueryRows`。tk 用 `node:sqlite` 的 `db.prepare().all()` 即等价物。

```ts
// 源: src/core/lbug/lbug-adapter.ts:1530-1544 [非分发安全]
export const executePrepared = async (
  cypher: string,
  params: Record<string, any>,
): Promise<any[]> => {
  if (!conn) throw new Error('LadybugDB not initialized. Call initLbug first.');
  const stmt = await conn.prepare(cypher);
  if (!stmt.isSuccess()) {
    const errMsg = await stmt.getErrorMessage();
    throw new Error(`Prepare failed: ${errMsg}`);
  }
  const queryResult = await conn.execute(stmt, params);
  return await readQueryRows(queryResult);
};
```

参数白名单校验（防止把复杂宿主对象绑进 prepared statement，确认存在 query-params.ts:16-24）—— tk 可直接抄这条 `isBindableScalar` 守卫：

```ts
// 源: src/core/lbug/query-params.ts:16-17 [非分发安全]
const isBindableScalar = (value: unknown): value is string | number | boolean | null =>
  value === null || ['string', 'number', 'boolean'].includes(typeof value);
```

**批量写入分子批**（schema.ts 之外的写入路径，确认存在 lbug-adapter.ts:1546-1576）—— `SUB_BATCH_SIZE = 4`，重用同一 prepared statement 跑多组参数。tk 用 SQLite 应改为**单事务 + 重用 stmt**（SQLite 事务比 4-行子批高效得多）：

```ts
// 源: src/core/lbug/lbug-adapter.ts:1555 [非分发安全]
const SUB_BATCH_SIZE = 4;   // gitnexus 的子批大小 —— tk 用 BEGIN/COMMIT 包裹整批替代
```

#### node:sqlite 适配（seam）

```ts
// tk 落点：src/codegraph/store.ts —— 用 node:sqlite 提供与 gitnexus 同形的 seam
import { DatabaseSync } from 'node:sqlite';

export class CodeGraphStore {
  private db: DatabaseSync;
  // 等价 executePrepared：参数化 + 行数组归一化
  query<T = Record<string, unknown>>(sql: string, params: Record<string, unknown> = {}): T[] {
    return this.db.prepare(sql).all(params) as T[];
  }
  // 等价 executeWithReusedStatement：单事务批量写（替代 gitnexus 的 4-行子批）
  writeBatch(sql: string, rows: Array<Record<string, unknown>>): void {
    const stmt = this.db.prepare(sql);
    this.db.exec('BEGIN');
    try { for (const r of rows) stmt.run(r); this.db.exec('COMMIT'); }
    catch (e) { this.db.exec('ROLLBACK'); throw e; }
  }
}
```

---

#### 4. 内存图索引模型（graph.ts —— tk 构建期/增量期可抄）

`createKnowledgeGraph` 是纯内存图，维护**三套衍生索引**让删除从 O(全部边) 降到 O(touching)。tk 在 **analyze 构建期**（边还没落 SQLite 前）做增量删改时，这套结构直接可用。

确认存在 graph.ts:18-27 的三索引：

```ts
// 源: src/core/graph/graph.ts:18-27 [非分发安全]
const relationshipsByType = new Map<RelationshipType, Map<string, GraphRelationship>>();
// 反向邻接：nodeId → Set<relId>（src 或 dst 命中本节点的所有边）
const edgeIdsByNode = new Map<string, Set<string>>();
// 文件索引：filePath → Set<nodeId>
const nodeIdsByFile = new Map<string, Set<string>>();
```

按文件删节点（增量回写的内存侧，确认存在 graph.ts:135-142）—— 这正是 §5 selective writeback 的内存对应：

```ts
// 源: src/core/graph/graph.ts:135-142 [非分发安全]
const removeNodesByFile = (filePath: string): number => {
  const nodeIds = nodeIdsByFile.get(filePath);
  if (nodeIds === undefined) return 0;
  const snapshot = [...nodeIds];           // 快照：removeNode 会改 nodeIdsByFile
  for (const nodeId of snapshot) removeNode(nodeId);
  return snapshot.length;
};
```

→ tk 落点 `src/codegraph/build/graph.ts`（构建期内存图）。在 SQLite 侧，这三索引被上面的 `nodes_by_file` / `edges_by_src` / `edges_by_dst` 索引替代，删除直接 `DELETE FROM nodes WHERE file_path=?` + 级联删边（§5）。

---

#### 5. 增量回写键（file-hash.ts —— C 必抄）

整库 wipe-and-reload 慢（gitnexus 注释：25K-node repo ~50s CSV COPY，file-hash.ts:14）。改为 per-file SHA-256 diff，只重写 changed/added/deleted 的行。

```ts
// 源: src/storage/file-hash.ts:29-36 [非分发安全]
export const computeFileHash = async (absPath: string): Promise<string | null> => {
  try {
    const buf = await fs.readFile(absPath);
    return createHash('sha256').update(buf).digest('hex');
  } catch {
    return null;     // 读不到 → 视为 changed
  }
};

// 源: src/storage/file-hash.ts:79-104 [非分发安全]
export const diffFileHashes = (
  current: ReadonlyMap<string, string>,
  stored: Readonly<Record<string, string>> | undefined,
): FileHashDiff => {
  const storedMap = new Map<string, string>(stored ? Object.entries(stored) : []);
  const changed: string[] = []; const added: string[] = [];
  for (const [p, h] of current) {
    const prev = storedMap.get(p);
    if (prev === undefined) added.push(p);
    else if (prev !== h) changed.push(p);
  }
  const deleted: string[] = [];
  for (const p of storedMap.keys()) if (!current.has(p)) deleted.push(p);
  changed.sort(); added.sort(); deleted.sort();
  return { changed, added, deleted, toWrite: [...changed, ...added].sort() };
};
```

具体数值：`BATCH = 100`（并行哈希批，file-hash.ts:47）。

#### node:sqlite 适配（selective writeback）

tk 把 hash map 存进一张 meta 表，回写时按 `file_path` 删旧行再插新行：

```sql
-- tk 落点：src/codegraph/incremental.ts
CREATE TABLE file_hashes (file_path TEXT PRIMARY KEY, sha256 TEXT NOT NULL);

-- 对 diff.toWrite ∪ diff.deleted 的每个文件，事务内删旧行（边随节点级联）：
BEGIN;
DELETE FROM edges WHERE src IN (SELECT id FROM nodes WHERE file_path = :fp)
                     OR dst IN (SELECT id FROM nodes WHERE file_path = :fp);
DELETE FROM nodes WHERE file_path = :fp;
-- 然后 re-insert changed/added 文件的 nodes/edges
COMMIT;
```

> 注：因为 node-id 是确定性的（§2），同一符号重算得同一 id，`DELETE by file_path` + `INSERT` 不会留孤儿边（跨文件入边的 dst 不变）。tk 应在 edges 上加 `ON DELETE` 触发器或显式删跨文件入边（见上 SQL 第一条 `OR dst IN ...`）。

---

#### 6. Navigation 查询 → node:sqlite CTE 等价（服务 A/B）

gitnexus 的图查询都是 Cypher 单跳或定深。给出 tk 直接可用的 SQL/CTE。

**(a) inter-file CALLS 边**（确认存在 graph-queries.ts:124-141）：

```ts
// 源: src/core/wiki/graph-queries.ts:128-132 [非分发安全]
MATCH (a)-[:CodeRelation {type: 'CALLS'}]->(b)
WHERE a.filePath <> b.filePath
RETURN DISTINCT a.filePath AS fromFile, a.name AS fromName,
       b.filePath AS toFile, b.name AS toName
```

node:sqlite 等价：

```sql
SELECT DISTINCT s.file_path AS fromFile, s.name AS fromName,
                d.file_path AS toFile,   d.name AS toName
FROM edges e
JOIN nodes s ON s.id = e.src
JOIN nodes d ON d.id = e.dst
WHERE e.kind = 'CALLS' AND s.file_path <> d.file_path;
```

**(b) export-surface（文件→导出符号，含类成员）**（确认存在 graph-queries.ts:73-87，UNION + 二跳 HAS_METHOD/HAS_PROPERTY）：

```sql
-- 顶层导出
SELECT f.file_path, n.name, n.kind
FROM edges e JOIN nodes f ON f.id=e.src JOIN nodes n ON n.id=e.dst
WHERE e.kind='DEFINES' AND f.kind='File' AND n.is_exported=1
UNION
-- 导出的类成员（File→DEFINES→Class→HAS_METHOD/HAS_PROPERTY→member）
SELECT f.file_path, m.name, m.kind
FROM edges e1 JOIN nodes f ON f.id=e1.src
     JOIN nodes c ON c.id=e1.dst
     JOIN edges e2 ON e2.src=c.id
     JOIN nodes m ON m.id=e2.dst
WHERE e1.kind='DEFINES' AND f.kind='File'
  AND e2.kind IN ('HAS_METHOD','HAS_PROPERTY') AND m.is_exported=1
ORDER BY 1;
```

**(c) 多跳 callers / callees / impact（递归 CTE — tk 落点 MCP 工具 `who_calls` / `impact_of`）**：gitnexus 走 Kuzu 变长路径（`[:CDG*]` 等），tk 用 WITH RECURSIVE。**必须设深度上限**（gitnexus 在 local-backend.ts:267 用 `depth < 5`；MCP 分页 default 50 / max 200，见 §7）：

```sql
-- 谁（传递地）调用了目标符号 :target —— 反向 CALLS 闭包，封顶 5 跳
WITH RECURSIVE callers(id, depth) AS (
  SELECT :target, 0
  UNION
  SELECT e.src, c.depth + 1
  FROM edges e JOIN callers c ON e.dst = c.id
  WHERE e.kind = 'CALLS' AND c.depth < 5         -- ← gitnexus 的 depth<5 上限
)
SELECT DISTINCT n.id, n.name, n.file_path, n.start_line
FROM callers c JOIN nodes n ON n.id = c.id
WHERE c.id <> :target
LIMIT 200;                                        -- ← gitnexus 的 max-limit
```

```sql
-- impact：目标符号被改动后受影响的传递依赖（正向闭包，跨 CALLS+REFERENCES）
WITH RECURSIVE impacted(id, depth) AS (
  SELECT :target, 0
  UNION
  SELECT e.dst, i.depth + 1
  FROM edges e JOIN impacted i ON e.src = i.id
  WHERE e.kind IN ('CALLS','ACCESSES','EXTENDS','IMPLEMENTS') AND i.depth < 5
)
SELECT DISTINCT n.* FROM impacted i JOIN nodes n ON n.id=i.id WHERE i.id<>:target LIMIT 200;
```

> CTE 用 `UNION`（非 `UNION ALL`）天然去重，等价 gitnexus 内存 BFS 里的 `visited` 集合（import-cycles.ts:26 `parents.has(next)` 守卫）。

**(d) import-cycle 检测**：gitnexus 不用图 DB，而是**取出 File→IMPORTS→File 边后在内存跑 Tarjan SCC**（import-cycles.ts，确认存在）。tk 同理：用上面 (a) 式 SQL 取 `kind='IMPORTS'` 的 file 对，再喂给可直接抄的 `findImportCycles(edges)`（纯函数，无 lbug 依赖，import-cycles.ts:39-110）。

| 抄进来 | 源 |
| --- | --- |
| `findImportCycles` / `findCyclePath`（Tarjan SCC + BFS cycle 还原，纯函数） | src/core/graph/import-cycles.ts:6-110 [非分发安全] |

---

#### 7. 分页 / 上限常量（直接照搬数值，防 token 爆）

gitnexus 的 MCP 工具对每个查询都强制分页上限（确认存在 mcp/tools.ts:62-78）—— tk 的 MCP 工具应照抄这组数：

```ts
// 源: src/mcp/tools.ts:62-78 [非分发安全]
export const LIST_REPOS_DEFAULT_LIMIT = 50;
export const LIST_REPOS_MAX_LIMIT = 200;     // 超过 max 是「拒绝」不是「截断」
export const EXPLAIN_DEFAULT_LIMIT = 50;
export const EXPLAIN_MAX_LIMIT = 200;
export const PDG_QUERY_DEFAULT_LIMIT = 50;   // PDG 边表无二级索引 → 每页必须 anchor+LIMIT
export const PDG_QUERY_MAX_LIMIT = 200;
```

其他散落数值：inter-module call edges `LIMIT 30`（graph-queries.ts:186,197）；processes `limit = 5`（graph-queries.ts:221）/ overview `limit = 20`（graph-queries.ts:276）；scope LRU `maxResidentShards = 64`（scope-index-store.ts:137）；ancestor 链 / community 上溯 `depth < 5`（local-backend.ts:267）。

→ tk 落点 `src/codegraph/mcp/limits.ts`：每个 navigation MCP 工具 default 50 / max 200 / 超限拒绝；递归 CTE 深度上限 5。

---

#### 8. 为什么 tk 不抄 Kuzu/lbug 原生绑定（明确论证）

`native-check.ts`（确认存在）本身就是反面教材 —— 它存在的唯一原因是**原生二进制经常装不上**，整个文件是为各种安装失败写的诊断与修复指引：

```ts
// 源: src/core/lbug/native-check.ts:33-44 [非分发安全]
  const binaryPath = path.join(pkgDir, 'lbugjs.node');
  if (!fs.existsSync(binaryPath)) {
    return { ok: false, binaryPath, message: [
      'LadybugDB native binary (lbugjs.node) is missing.',
      'This usually happens when the install lifecycle script was skipped.',
      ...
```

失败面（native-check.ts 列举）：`pnpm dlx`/`pnpx` 默认跳过 build script、`npm 11 bare npx` 会在 gitnexus 跑之前崩、bun 需要 `trustedDependencies`、`.npmrc ignore-scripts`、**ABI mismatch / 跨平台二进制 / 文件截断**（native-check.ts:71-72）。每一条都是 tk 主战场 **VS Code Copilot / Windows** 上的高发安装故障。

**tk 的取舍**：
- tk 是 **zero-runtime-dep TS/Node**，主目标 **Windows**。原生 `.node` 绑定意味着 prebuild 矩阵（win32-x64 / win32-arm64 / darwin…）+ 安装期编译回退（node-gyp + MSVC）—— 与 tk「装上即用、AV 不拦、冷启动快」的分发约束（见 MEMORY: fixes-prioritize-distributed-field / windows-startup-perf-plan）直接冲突。
- **`node:sqlite` 是 Node ≥ 22.5 内置**，零原生编译、零额外依赖、跨平台同一 ABI（随 Node 走），还自带 **FTS5**（gitnexus 没有，靠 `reason` 列硬塞语义且无二级索引）。tk 因此**不损失能力反而多一层全文索引**。
- 代价：放弃 Cypher 变长路径语法糖。tk 用 §6 的 WITH RECURSIVE CTE 补齐 callers/callees/impact，深度封顶 5、行封顶 200 —— 对 navigation/read lane 足够。

> tk 唯一需要确认的同款前置：`node:sqlite` 要求 **Node ≥ 22.5**（与既有 MEMORY: code-graph-design 的 "node:sqlite + Node≥22.5 CONTINGENT on install-base check" 一致）—— 这是 tk 该 gate 的安装基线检查，已在记忆里挂账。

---

#### 抄进来清单

| gitnexus file | tk target | 关键函数 / 常量 |
| --- | --- | --- |
| src/core/lbug/schema.ts:146-491 [非分发安全] | src/codegraph/schema.ts（DDL） | `CODE_ELEMENT_BASE`、`RELATION_SCHEMA`（type/confidence/reason/step）、embedding 分表 idea |
| gitnexus-shared/src/lbug/schema-constants.ts:11-90 [非分发安全] | src/codegraph/schema.ts（枚举） | `NODE_TABLES`、`REL_TYPES`、`REL_TABLE_NAME` |
| gitnexus-shared/src/graph/types.ts:176-206 [非分发安全] | src/codegraph/types.ts | `GraphNode` / `GraphRelationship`（confidence/reason/evidence） |
| src/core/lbug/rel-pair-routing.ts:42-46 [非分发安全] | src/codegraph/node-id.ts | `getNodeLabel`（id 前缀=kind 约定） |
| src/core/lbug/lbug-adapter.ts:1530-1576 [非分发安全] | src/codegraph/store.ts | `executePrepared`、`executeWithReusedStatement`（→ 单事务批写） |
| src/core/lbug/query-params.ts:16-24 [非分发安全] | src/codegraph/store.ts | `isBindableScalar` / `isValidQueryParams` 守卫 |
| src/core/graph/graph.ts:11-182 [非分发安全] | src/codegraph/build/graph.ts | 三索引（byType/edgeIdsByNode/nodeIdsByFile）、`removeNodesByFile` |
| src/storage/file-hash.ts:29-104 [非分发安全] | src/codegraph/incremental.ts | `computeFileHash`、`diffFileHashes`（BATCH=100） |
| src/core/graph/import-cycles.ts:6-110 [非分发安全] | src/codegraph/queries/cycles.ts | `findImportCycles`（纯函数，无 lbug 依赖） |
| src/core/wiki/graph-queries.ts:73-215 [非分发安全] | src/codegraph/mcp/*（→ CTE） | inter-file CALLS、export-surface 的 Cypher 范式 |
| src/mcp/tools.ts:62-78 [非分发安全] | src/codegraph/mcp/limits.ts | DEFAULT 50 / MAX 200 / 拒绝超限；CTE 深度 5 |
| src/storage/scope-index-store.ts:127-207 [非分发安全]（仅 idea） | （可选）src/codegraph/scope-store.ts | LRU shard（maxResidentShards=64）—— 仅超大 repo 需要 |

> 注：scope-index-store 的 disk-backed LRU 是为 **Linux-kernel 级别（17-20 GB scope binding）** 设计的 out-of-core 方案（scope-index-store.ts:11-27）；tk 目标 project-local 中小仓，**默认不需要**，列为可选 idea 而非必抄。

---

### gitnexus · 增量更新与陈旧检测（incremental + staleness）

#### 服务 tk 需求

- **E（按需 lazy 重建，无 daemon）**：gitnexus 的整套增量回写不靠 daemon，而是每次 `analyze` 运行时在内存里 hash-diff → 只 delete-and-rewrite 变化文件的子图。这正是 tk 的 E 决策模型：一次 `tk graph build`（或读时触发）跑全量解析，但只把"变化文件 + 其受影响邻域"写回 SQLite，其余行原封不动保留。核心可直接搬：`computeFileHashes` / `diffFileHashes`（变更检测）、importer-BFS 扩展、`computeEffectiveWriteSet`（边界 1-hop）、`extractChangedSubgraph`（子图抽取）、`deleteNodesForFile`（失效邻域）。
- **J（陈旧横幅 staleness banner）**：`git-staleness.ts` 的 `checkStaleness` 用 `git rev-list --count <lastCommit>..HEAD` 算"索引落后 HEAD 几个 commit"，>0 即给出 `⚠️ Index is N commits behind HEAD. Run analyze...` 文案。tk 的 J 横幅可以 1:1 照搬这个数值口径 + sibling-clone 漂移检测（`checkCwdMatch`）。

> 重要前提（gitnexus 设计写死的）：**pipeline 仍然解析每一个文件**（跨文件解析需要全量数据，这是正确性不变量）；增量只省"DB 写回"那一段。tk 若想做"只解析变化文件"是 gitnexus **没有**做的，属 tk 自有创新，需自己承担跨文件解析失真风险（见 gaps）。

---

#### 可抄代码 1 — 变更检测（SHA-256 per-file + diff）

源: `src/storage/file-hash.ts:29-110` [非分发安全]

```ts
import { createHash } from 'crypto';
import fs from 'fs/promises';
import path from 'path';

export const computeFileHash = async (absPath: string): Promise<string | null> => {
  try {
    const buf = await fs.readFile(absPath);
    return createHash('sha256').update(buf).digest('hex');
  } catch {
    return null; // 读不到 → 无签名，caller 视作 changed
  }
};

export const computeFileHashes = async (
  repoPath: string,
  relPaths: readonly string[],
): Promise<Map<string, string>> => {
  const out = new Map<string, string>();
  const BATCH = 100;                              // 数值: 每批 100 文件并行
  for (let i = 0; i < relPaths.length; i += BATCH) {
    const batch = relPaths.slice(i, i + BATCH);
    const results = await Promise.all(
      batch.map(async (rel) => {
        const h = await computeFileHash(path.join(repoPath, rel));
        return h ? ([rel, h] as const) : null;
      }),
    );
    for (const r of results) if (r) out.set(r[0], r[1]);
  }
  return out;
};

export interface FileHashDiff {
  changed: string[];   // 内容 hash 变了
  added: string[];     // 当前扫到、stored 里没有
  deleted: string[];   // stored 里有、当前没扫到
  toWrite: string[];   // changed ∪ added（要重写行的）
}

export const diffFileHashes = (
  current: ReadonlyMap<string, string>,
  stored: Readonly<Record<string, string>> | undefined,
): FileHashDiff => {
  const storedMap = new Map<string, string>(stored ? Object.entries(stored) : []);
  const changed: string[] = [];
  const added: string[] = [];
  for (const [p, h] of current) {
    const prev = storedMap.get(p);
    if (prev === undefined) added.push(p);
    else if (prev !== h) changed.push(p);
  }
  const deleted: string[] = [];
  for (const p of storedMap.keys()) {
    if (!current.has(p)) deleted.push(p);
  }
  changed.sort(); added.sort(); deleted.sort();   // 排序 → 两次同样改动产出相同数组（稳定 log/等价比对）
  return { changed, added, deleted, toWrite: [...changed, ...added].sort() };
};
```

#### 可抄代码 2 — 子图抽取 + 边界 1-hop 扩展（核心算法）

源: `src/core/incremental/subgraph-extract.ts:55-137` [非分发安全]

```ts
const isGraphWide = (label: string): boolean => label === 'Community' || label === 'Process';
// 整图属性边: 验证有效性不取决于端点所在文件 (TAINT_PATH 可被第三文件的中间函数改变而失效)
const isGraphWideRelType = (type: string): boolean => type === 'TAINT_PATH';

const indexNodeFilePaths = (fullGraph: KnowledgeGraph): Map<string, string> => {
  const idx = new Map<string, string>();
  fullGraph.forEachNode((n: GraphNode) => {
    const fp = n.properties?.filePath as string | undefined;
    if (fp) idx.set(n.id, fp);
  });
  return idx;
};

export const extractChangedSubgraph = (
  fullGraph: KnowledgeGraph,
  toWriteSet: ReadonlySet<string>,
): KnowledgeGraph => {
  const sub = createKnowledgeGraph();
  const writableNodeIds = new Set<string>();
  fullGraph.forEachNode((n: GraphNode) => {
    const filePath = n.properties?.filePath as string | undefined;
    const include = (filePath && toWriteSet.has(filePath)) || isGraphWide(n.label);
    if (include) { sub.addNode(n); writableNodeIds.add(n.id); }
  });
  fullGraph.forEachRelationship((r: GraphRelationship) => {
    // 至少一个端点在可写集 → 收进子图; 两端都是未变文件的边跳过(DB里还在,重插会PK冲突)
    if (writableNodeIds.has(r.sourceId) || writableNodeIds.has(r.targetId) || isGraphWideRelType(r.type)) {
      sub.addRelationship(r);
    }
  });
  return sub;
};

// 边界 1-hop: toWriteSet 沿"跨可写边界的边"扩一跳, 把未变那侧文件也拉进来
// (barrel re-export 改了 → A→B 旧边留在DB, A→D 新边因两端都不可写被跳过 → 两边都失真)
export const computeEffectiveWriteSet = (
  fullGraph: KnowledgeGraph,
  toWriteSet: ReadonlySet<string>,
): Set<string> => {
  const nodeFilePaths = indexNodeFilePaths(fullGraph);
  const expanded = new Set<string>(toWriteSet);
  fullGraph.forEachRelationship((r: GraphRelationship) => {
    const sourcePath = nodeFilePaths.get(r.sourceId);
    const targetPath = nodeFilePaths.get(r.targetId);
    if (!sourcePath || !targetPath) return;       // 跳过到整图节点的边
    const sourceWritable = toWriteSet.has(sourcePath);
    const targetWritable = toWriteSet.has(targetPath);
    if (sourceWritable && !targetWritable) expanded.add(targetPath);
    else if (targetWritable && !sourceWritable) expanded.add(sourcePath);
  });
  return expanded;
};
```

> 关键不变量（gitnexus 注释明文，tk 必须照做）：`extractChangedSubgraph` **故意不自己扩集合**；扩集合是 orchestrator 的事，这样**同一个 `effectiveWriteSet` 同时喂给 delete 和 extract** —— delete 集和 write 集不对称会静默损坏 DB（留下陈旧行 或 COPY 时 PK 冲突）。

#### 可抄代码 3 — orchestrator 编排（importer-BFS + 删除 + 抽取）

源: `src/core/run-analyze.ts:1019-1130` [非分发安全]（关键节选，已读确认）

```ts
const MAX_IMPORTER_BFS_DEPTH = 4;                 // 数值: BFS 深度上限 4
const writableFiles = new Set<string>(hashDiff.toWrite);
const directlyChangedCount = writableFiles.size;

// shadow-seed: ADDED 文件的 queryImporters 返回 0(新文件还没 IMPORTS 行),
// 但旧文件可能有"被新文件抢走解析归属"的 import → 把候选种进 BFS frontier
const priorFileSet = new Set<string>(
  existingMeta?.fileHashes ? Object.keys(existingMeta.fileHashes) : [],
);
const shadowSeed: string[] = [];
for (const added of hashDiff.added) {
  for (const cand of shadowCandidatesFor(added)) {
    if (priorFileSet.has(cand) && !writableFiles.has(cand)) shadowSeed.push(cand);
  }
}

// importer-BFS: 把变化/删除文件的传递 importer 拉进可写集 (读 pre-pipeline DB 的 IMPORTS)
let frontier: string[] = [...hashDiff.toWrite, ...hashDiff.deleted, ...shadowSeed];
for (let depth = 0; depth < MAX_IMPORTER_BFS_DEPTH && frontier.length > 0; depth++) {
  const nextFrontier: string[] = [];
  for (const f of frontier) {
    try {
      const importers = await queryImporters(f);
      for (const i of importers) {
        if (!writableFiles.has(i)) { writableFiles.add(i); nextFrontier.push(i); }
      }
    } catch { /* 单文件查询失败 → 跳过; 该分支正确性降级但 DB 仍可写 */ }
  }
  frontier = nextFrontier;
}

// 1. 边界 1-hop 再扩一层 → effectiveWriteSet
const effectiveWriteSet = computeEffectiveWriteSet(pipelineResult.graph, writableFiles);
// 2. 删除: effectiveWriteSet ∪ deleted (去重, 避免对同一文件删两次)
const filesToDelete = [...new Set([...effectiveWriteSet, ...hashDiff.deleted])];
for (const f of filesToDelete) {
  try { await deleteNodesForFile(f); } catch { /* 该文件可能没有行(无法解析的文件) — 正常 */ }
}
// 2b. 整图节点全删重建 (Community/Process; pdg 开时还有 TAINT_PATH)
await deleteAllCommunitiesAndProcesses();
// 3. 抽取变化子图 → 只写它; 未变文件的行在 DB 里原样不动
const subgraph = extractChangedSubgraph(pipelineResult.graph, effectiveWriteSet);
await loadGraphToLbug(subgraph, ...);
```

#### 可抄代码 4 — shadow-candidate（新增文件抢解析归属）

源: `src/core/incremental/shadow-candidates.ts:38-76` [非分发安全]

```ts
const SHADOW_EXTS = ['.d.ts', '.tsx', '.ts', '.jsx', '.js', '.mjs', '.cjs'];

export const shadowCandidatesFor = (added: string): string[] => {
  const ext = SHADOW_EXTS.find((e) => added.endsWith(e));
  if (!ext) return [];
  const noExt = added.slice(0, -ext.length);
  const out = new Set<string>();
  // (a) 同 basename 不同扩展名: foo/bar.ts 遮蔽 foo/bar.{tsx,js,...}
  for (const alt of SHADOW_EXTS) if (alt !== ext) out.add(noExt + alt);
  // (b) 裸文件优先于目录 index: foo/bar.ts 遮蔽 foo/bar/index.{...}
  for (const idx of SHADOW_EXTS) { out.add(`${noExt}/index${idx}`); out.add(`${noExt}\\index${idx}`); }
  // (c) 新 foo/index.ext 遮蔽旧 foo.ext
  let dir: string | null = null;
  if (noExt.endsWith('/index')) dir = noExt.slice(0, -'/index'.length);
  else if (noExt.endsWith('\\index')) dir = noExt.slice(0, -'\\index'.length);
  if (dir !== null) for (const alt of SHADOW_EXTS) out.add(dir + alt);
  return [...out];
};
```

#### 可抄代码 5 — staleness 横幅（J）

源: `src/core/git-staleness.ts:23-46` [非分发安全]

```ts
export function checkStaleness(repoPath: string, lastCommit: string): StalenessInfo {
  try {
    const result = execFileSync('git', ['rev-list', '--count', `${lastCommit}..HEAD`], {
      cwd: repoPath, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true,
    }).trim();
    const commitsBehind = parseInt(result, 10) || 0;
    if (commitsBehind > 0) {
      return {
        isStale: true, commitsBehind,
        hint: `⚠️ Index is ${commitsBehind} commit${commitsBehind > 1 ? 's' : ''} behind HEAD. Run analyze tool to update.`,
      };
    }
    return { isStale: false, commitsBehind: 0 };
  } catch { return { isStale: false, commitsBehind: 0 }; }
}
```
源: `src/storage/git.ts:22-39` [非分发安全]（记录 lastCommit 用，`windowsHide: true` + `stdio: ['ignore','pipe','ignore']` 抑制 stderr 泄漏，对 tk Windows 主战场重要）

```ts
export const getCurrentCommit = (repoPath: string): string => {
  try {
    return execSync('git rev-parse HEAD', {
      cwd: repoPath, stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true,
    }).toString().trim();
  } catch { return ''; }
};
```

---

#### node:sqlite 适配（typed property graph: nodes / edges）

tk 表结构假定：`nodes(id, kind, file_path, start_line, ...)`、`edges(kind, src, dst, provenance)`，`src/dst` 是 `nodes.id`。

**1. queryImporters → IMPORTS 边反查**（gitnexus Cypher `MATCH (a)-[IMPORTS]->(b) WHERE b.filePath=? RETURN a.filePath`）。tk 的 edges 端点是 node id，需 join 两侧 nodes 取 file_path：

```sql
-- 谁 import 了 :target_file (读 pre-rebuild 的旧 DB 状态)
SELECT DISTINCT ns.file_path AS importer
FROM edges e
JOIN nodes ns ON ns.id = e.src
JOIN nodes nd ON nd.id = e.dst
WHERE e.kind = 'IMPORTS' AND nd.file_path = :target_file
  AND ns.file_path IS NOT NULL AND ns.file_path <> :target_file;
```

**2. importer-BFS（深度 ≤ 4）→ WITH RECURSIVE CTE**，一条 SQL 直接算出可写集，省掉 JS 里的逐层循环：

```sql
WITH RECURSIVE
  seed(file_path) AS (
    -- changed ∪ added ∪ deleted ∪ shadow-seed 一次性灌入(应用层 bind 多行 VALUES)
    SELECT value FROM json_each(:seed_files_json)
  ),
  importers(file_path, depth) AS (
    SELECT file_path, 0 FROM seed
    UNION                                  -- UNION 去重 = 天然 visited 集
    SELECT ns.file_path, imp.depth + 1
    FROM importers imp
    JOIN nodes nd ON nd.file_path = imp.file_path
    JOIN edges e  ON e.dst = nd.id AND e.kind = 'IMPORTS'
    JOIN nodes ns ON ns.id = e.src
    WHERE imp.depth < 4                    -- MAX_IMPORTER_BFS_DEPTH = 4
      AND ns.file_path IS NOT NULL
  )
SELECT DISTINCT file_path FROM importers;  -- = writableFiles
```

**3. computeEffectiveWriteSet（边界 1-hop）→ 纯 SQL**，对新图的边求"一端可写、一端未变"的未变侧：

```sql
-- :writable_json = 上一步 writableFiles 的 JSON 数组
WITH w(fp) AS (SELECT value FROM json_each(:writable_json))
SELECT DISTINCT
  CASE WHEN ns.file_path IN (SELECT fp FROM w) THEN nd.file_path
       ELSE ns.file_path END AS pull_in
FROM edges e
JOIN nodes ns ON ns.id = e.src
JOIN nodes nd ON nd.id = e.dst
WHERE ns.file_path IS NOT NULL AND nd.file_path IS NOT NULL
  AND ( (ns.file_path IN (SELECT fp FROM w)) <> (nd.file_path IN (SELECT fp FROM w)) ); -- XOR: 恰好一端可写
-- effectiveWriteSet = writableFiles ∪ 本查询结果
```

**4. deleteNodesForFile → 失效邻域删除**（gitnexus 用 `DETACH DELETE`，SQLite 用外键 cascade 或显式两步）：

```sql
-- 先删该文件所有节点的边(两侧任一端属于该文件的边)
DELETE FROM edges
WHERE src IN (SELECT id FROM nodes WHERE file_path = :file)
   OR dst IN (SELECT id FROM nodes WHERE file_path = :file);
-- 再删节点
DELETE FROM nodes WHERE file_path = :file;
-- 若 nodes 有 FTS5 影子表, 同步删: DELETE FROM nodes_fts WHERE rowid IN (...);
```
> 注：gitnexus `DETACH DELETE` 只删"挂在被删节点上的边"。tk 的边表两端都引用要删的节点，所以删边条件用 `src IN ... OR dst IN ...` 覆盖入边出边。**强烈建议** `edges(src)`、`edges(dst)`、`edges(kind)`、`nodes(file_path)` 都建索引，否则 BFS / boundary 查询全表扫。

**5. 整图节点全删重建**（Community/Process/TAINT_PATH 等整图属性）：

```sql
DELETE FROM edges WHERE kind = 'TAINT_PATH';                 -- 仅 pdg 开时
DELETE FROM nodes WHERE kind IN ('Community', 'Process');    -- 每次增量都重建
```

**6. staleness 横幅（J）**：纯 git CLI，无 SQL；从 `meta` 表（或 `~/.token-killer/<repo>/meta.json`）读 `last_commit`，跑 `git rev-list --count <last_commit>..HEAD`，>0 即渲染横幅。tk 可把 `last_commit` 存 SQLite 单行 meta 表：`SELECT last_commit FROM repo_meta LIMIT 1;`

---

#### tk 落点

| gitnexus 来源 | tk 目标文件 / MCP-tool | 关键函数 |
| --- | --- | --- |
| `src/storage/file-hash.ts` | `src/graph/incremental/file-hash.ts` | `computeFileHash` / `computeFileHashes` (BATCH=100) / `diffFileHashes` |
| `src/core/incremental/subgraph-extract.ts` | `src/graph/incremental/subgraph.ts` | `extractChangedSubgraph` / `computeEffectiveWriteSet` / `indexNodeFilePaths` |
| `src/core/incremental/shadow-candidates.ts` | `src/graph/incremental/shadow.ts` | `shadowCandidatesFor` (SHADOW_EXTS) |
| `run-analyze.ts:1019-1130` 编排 | `src/graph/build.ts`（lazy-on-read 入口，无 daemon） | importer-BFS（改用 §node:sqlite-2 递归 CTE）+ delete + extract 编排 |
| `lbug-adapter.ts:1957` queryImporters | 被 §node:sqlite-1/2 的 SQL 取代（不需要 Cypher） | — |
| `lbug-adapter.ts:1872` deleteNodesForFile | §node:sqlite-4 SQL | — |
| `src/core/git-staleness.ts:23` | `src/graph/staleness.ts` → MCP-tool `graph_status` / 读时横幅 | `checkStaleness` / `checkStalenessAsync` / `checkCwdMatch`（sibling-clone 漂移） |
| `src/storage/git.ts:22` getCurrentCommit | `src/graph/git.ts` | `getCurrentCommit`（保留 windowsHide + stderr 抑制） |

#### 具体数值（gitnexus 实测口径）

- `BATCH = 100`：每批并行 hash 100 个文件。
- `MAX_IMPORTER_BFS_DEPTH = 4`：importer-BFS 深度上限（够覆盖嵌套 barrel 链 `index.ts → sub/index.ts → sub/impl.ts`，又不至于在深 re-export 金字塔的 monorepo 上退化成近全量重建；超过此深度时"增量 ≡ 全量"是 best-effort，`--force` 是逃生口）。
- `INCREMENTAL_SCHEMA_VERSION = 1`（`repo-manager.ts:216`）：增量不变量变更时 bump，mismatch 强制全量重建。
- 收益口径：25K 节点 repo 全量 CSV COPY 约 **~50s**，增量只删改变化文件行。
- staleness 阈值：`commitsBehind > 0` 即 stale。
- 增量**资格门槛**（`run-analyze.ts:917`，tk 须照抄成自己的 gate）：`!force && existingMeta 存在 && schemaVersion 匹配 && fileHashes 非空 && repoHasGit && allFilePaths>0`，否则走全量。

#### 崩溃恢复（dirty flag，对 tk lazy-on-read 同样关键）

源: `run-analyze.ts:939-947` + `repo-manager.ts:100-105` [非分发安全] —— 任何破坏性 DB 改动**之前**先写 `incrementalInProgress: { startedAt, toWriteCount }` 进 meta；成功时清除。若中途崩溃，下次运行看到该 flag 就**强制全量重建**（避免半写的 DB 被下次"clean-tree 快路径"误认为有效）。tk 的 SQLite 方案应放进事务（gitnexus 用 dirty-flag 是因为 Kuzu COPY 非事务；tk 用 node:sqlite 可直接 `BEGIN/COMMIT` 包住 delete+insert，崩溃自动回滚 —— 见 gaps）。

---

### gitnexus · token-economy 杠杆（precompute-over-compress · grep 增强 · impact）

服务 tk 需求：**G**（buildContext / 省 token 的上下文装配）+ **B**（agent 找代码、少跑 grep）。核心思路就一句话：**把 agent 一次 grep 命中的符号，预编译好的 callers/callees/process 关系直接贴回去**——一次图查询替代 agent 后续 5～10 次 grep；以及 **一个 `tk_impact` 工具替代「改这个函数前先 grep 谁调它」的整轮反复**。所有 gitnexus 代码用 Kuzu/Cypher，下方每条都给了 node:sqlite 的 `edges(src,dst,kind)` 等价 SQL/CTE。

---

#### 1. grep-result 增强引擎（native_augment）——服务 B/G

gitnexus 的 `augment(pattern, cwd)` 就是「agent 跑 grep/glob/read 时，PreToolUse hook 注入一段图上下文」的快路径。设计约束直接抄进 tk 的 buildContext：**只用 BM25/FTS（不碰 embedding）求快、cluster 只内部排序绝不输出、输出纯关系、任何错误 → 返回空串（绝不破坏原工具）**。性能目标 cold <500ms / warm <200ms。

可抄代码（输出装配 + graceful failure 结构）：

源: src/core/augmentation/engine.ts:86-101, 296-322 [非分发安全]
```ts
export async function augment(pattern: string, cwd?: string): Promise<string> {
  if (!pattern || pattern.length < 3) return '';

  const patternFirstWord = pattern.trim().replace(/'/g, "''").split(/\s+/)[0];
  if (!patternFirstWord || patternFirstWord.length < 2) return '';
  // ... (BM25 → symbolMatches → batch callers/callees/processes/cohesion) ...

    if (enriched.length === 0) return '';

    // Step 4: Rank by cohesion (internal signal) and format
    enriched.sort((a, b) => b.cohesion - a.cohesion);

    const lines: string[] = [`[GitNexus] ${enriched.length} related symbols found:`, ''];
    for (const item of enriched) {
      lines.push(`${item.name} (${item.filePath})`);
      if (item.callers.length > 0) lines.push(`  Called by: ${item.callers.join(', ')}`);
      if (item.callees.length > 0) lines.push(`  Calls: ${item.callees.join(', ')}`);
      if (item.processes.length > 0) lines.push(`  Flows: ${item.processes.join(', ')}`);
      lines.push('');
    }
    return lines.join('\n').trim();
  } catch {
    // Graceful failure — never break the original tool
    return '';
  }
}
```

关键数值（gitnexus 实测的 cap，直接照搬到 tk 以控 token）：BM25 取 **top 10**，只对前 **5** 个文件结果映射符号，每文件 **LIMIT 3** 符号；去重后只 enrich **前 5** 个符号；callers/callees 各批量 **LIMIT 15**，每符号输出只留 **前 3** 个 caller / **前 3** 个 callee（`.slice(0,3)`）；pattern 短于 3 字符 / 首词短于 2 字符直接 return ''。

**关键设计点**：所有关系是 **batch 一次性取**（`WHERE n.id IN [...]` + 一条 Map 聚合），而不是 per-symbol 逐个查——这是 token/延迟双优化，tk 必须照做。

node:sqlite 适配（batch callers/callees，对应 engine.ts:185-228 的两条 Cypher）：
```sql
-- callers of a set of symbol ids (upstream)，对应 (caller)-[:CALLS]->(n)
SELECT e.dst AS targetId, c.name AS name
FROM edges e JOIN nodes c ON c.id = e.src
WHERE e.kind = 'CALLS' AND e.dst IN (/* idList */)
LIMIT 15;

-- callees (downstream)，对应 (n)-[:CALLS]->(callee)
SELECT e.src AS sourceId, c.name AS name
FROM edges e JOIN nodes c ON c.id = e.dst
WHERE e.kind = 'CALLS' AND e.src IN (/* idList */)
LIMIT 15;
```
BM25 那步在 tk 用 FTS5：`SELECT rowid, file_path, bm25(nodes_fts) AS score FROM nodes_fts WHERE nodes_fts MATCH ? LIMIT 10;`，再 `nodes.name LIKE '%'||?||'%'` 映射到符号（对应 engine.ts FTS 不可用时的 `name CONTAINS` 回退）。

tk 落点：成为 `src/codegraph/augment.ts`，由 buildContext（需求 G）调用，并挂到 VS Code Copilot 的 PreToolUse hook（tk 已有 hook 基建 `src/hook/`）——agent 跑 grep 时把这段关系块追加进 tool 结果。cohesion 排序里的 community/cohesion tk 可先不做（标 gap），改用「callers 数」当排序信号。

---

#### 2. 预编译图查询（precompute-over-compress）——服务 G/B

`graph-queries.ts` 是「与其压缩 agent 反复跑的查询，不如把常用查询预编译成函数」的范本。对 tk 最值钱的三条：导出符号清单、跨文件调用边、经过某组文件的执行流。

可抄代码（跨文件调用边——「谁跨文件调谁」一次出全图）：

源: src/core/wiki/graph-queries.ts:124-141 [非分发安全]
```ts
export async function getInterFileCallEdges(): Promise<CallEdge[]> {
  const rows = await executeQuery(
    REPO_ID,
    `
    MATCH (a)-[:CodeRelation {type: 'CALLS'}]->(b)
    WHERE a.filePath <> b.filePath
    RETURN DISTINCT a.filePath AS fromFile, a.name AS fromName,
           b.filePath AS toFile, b.name AS toName
  `,
  );
  return rows.map((r) => ({ fromFile: r[0], fromName: r[1], toFile: r[2], toName: r[3] }));
}
```

可抄代码（导出符号清单——含顶层导出 + 导出类成员的 UNION）：

源: src/core/wiki/graph-queries.ts:73-104 [非分发安全]
```ts
export async function getFilesWithExports(): Promise<FileWithExports[]> {
  const rows = await executeQuery(REPO_ID, `
    MATCH (f:File)-[:CodeRelation {type: 'DEFINES'}]->(n)
    WHERE n.isExported = true
    RETURN f.filePath AS filePath, n.name AS name, labels(n)[0] AS type
    UNION
    MATCH (f:File)-[:CodeRelation {type: 'DEFINES'}]->(c)-[mr:CodeRelation]->(n)
    WHERE mr.type IN ['HAS_METHOD', 'HAS_PROPERTY'] AND n.isExported = true
    RETURN f.filePath AS filePath, n.name AS name, labels(n)[0] AS type
    ORDER BY filePath
  `);
  // ... group rows into Map<filePath, {symbols:[{name,type}]}> ...
}
```

关键数值：inter-module 边查询 outgoing/incoming 各 `LIMIT 30`（graph-queries.ts:187,198）；processes-for-files 默认 `limit=5`、all-processes 默认 `limit=20`，均 `ORDER BY stepCount DESC`（只取最重的几条流，控 token）。

node:sqlite 适配（inter-file call edges）：
```sql
SELECT DISTINCT sf.file_path AS fromFile, s.name AS fromName,
                df.file_path AS toFile, d.name AS toName
FROM edges e
JOIN nodes s ON s.id = e.src
JOIN nodes d ON d.id = e.dst
WHERE e.kind = 'CALLS' AND s.file_path <> d.file_path;
```
导出清单（UNION 顶层导出 + 类成员，tk schema 里 `kind='DEFINES'`/`'HAS_METHOD'`/`'HAS_PROPERTY'`，`is_exported` 列）：
```sql
SELECT f.file_path, n.name, n.kind FROM edges d
  JOIN nodes f ON f.id = d.src JOIN nodes n ON n.id = d.dst
  WHERE d.kind='DEFINES' AND n.is_exported=1
UNION
SELECT f.file_path, n.name, n.kind FROM edges d
  JOIN nodes f ON f.id=d.src JOIN nodes c ON c.id=d.dst
  JOIN edges m ON m.src=c.id JOIN nodes n ON n.id=m.dst
  WHERE d.kind='DEFINES' AND m.kind IN ('HAS_METHOD','HAS_PROPERTY') AND n.is_exported=1
ORDER BY 1;
```

tk 落点：这些是 `src/codegraph/queries.ts` 里的命名预编译查询，被 buildContext（G）和 repo-map 生成消费。「DB 连接长驻」机制（`pinWikiDb()`/`touchWikiDb()` 防 LLM 长调用期间 DB 被 LRU 回收）对 tk 的「per-session MCP server」直接对应：tk 的 node:sqlite 句柄在一个 MCP session 内 pin 住，别每次工具调用都重开（标 §11 measurement 时这是冷启动税的来源）。

---

#### 3. blast-radius BFS（`tk_impact` 工具的核心）——服务 B/G

「改这个函数会炸到谁」——gitnexus 的本地单仓 impact 是分层 BFS over CALLS/IMPORTS/EXTENDS/... 边，**一次工具调用替代 agent 改前手动 grep 10 次**。这是 token-economy 最大的单点杠杆。注意区分：`cross-impact.ts`（你点名读的）是**跨仓 group 级**的 Phase-2 fan-out（contract bridge DB），对 tk 单仓**用不上**；真正可抄的本地 BFS 在 `local-backend.ts` 的 `_runImpactBFS`。

可抄代码（分层 BFS 主循环 + 方向切换 + 去重 frontier）：

源: src/mcp/local/local-backend.ts:4716-4770 [非分发安全]
```ts
for (let depth = 1; depth <= maxDepth && frontier.length > 0; depth++) {
  const nextFrontier: string[] = [];
  const query =
    direction === 'upstream'
      ? `MATCH (caller)-[r:CodeRelation]->(n) WHERE n.id IN $frontierIds AND r.type IN $relTypes${confidenceFilter} RETURN n.id AS sourceId, caller.id AS id, caller.name AS name, labels(caller)[0] AS type, caller.filePath AS filePath, r.type AS relType, r.confidence AS confidence`
      : `MATCH (n)-[r:CodeRelation]->(callee) WHERE n.id IN $frontierIds AND r.type IN $relTypes${confidenceFilter} RETURN n.id AS sourceId, callee.id AS id, callee.name AS name, labels(callee)[0] AS type, callee.filePath AS filePath, r.type AS relType, r.confidence AS confidence`;
  try {
    const related = await executeParameterized(repo.lbugPath, query, {
      frontierIds: frontier, relTypes: relationTypes,
      ...(safeMinConfidence > 0 ? { minConfidence: safeMinConfidence } : {}),
    });
    for (const rel of related) {
      const relId = rel.id || rel[1];
      const filePath = rel.filePath || rel[4] || '';
      if (!includeTests && isTestFilePath(filePath)) continue;
      if (!visited.has(relId)) {
        visited.add(relId);
        nextFrontier.push(relId);
        const storedConfidence = rel.confidence ?? rel[6];
        const relationType = rel.relType || rel[5];
        const effectiveConfidence =
          typeof storedConfidence === 'number' && storedConfidence > 0
            ? storedConfidence : confidenceForRelType(relationType);
        impacted.push({ depth, id: relId, name: rel.name || rel[2],
          type: rel.type || rel[3], filePath, relationType, confidence: effectiveConfidence });
      }
    }
  } catch (e) {
    logQueryError('impact:depth-traversal', e);
    traversalComplete = false;  // partial results, don't swallow (#321)
    break;
  }
  frontier = nextFrontier;
}
```

可抄代码（risk 评分阈值 —— tk 直接照搬，这是把 impactedCount 翻译成 agent 能用的 LOW/MEDIUM/HIGH/CRITICAL）：

源: src/mcp/local/local-backend.ts:5050-5065 [非分发安全]
```ts
const processCount = affectedProcesses.length;
const moduleCount = affectedModules.length;
let risk = 'LOW';
if (directCount >= 30 || processCount >= 5 || moduleCount >= 5 || impacted.length >= 200) {
  risk = 'CRITICAL';
} else if (directCount >= 15 || processCount >= 3 || moduleCount >= 3 || impacted.length >= 100) {
  risk = 'HIGH';
} else if (directCount >= 5 || impacted.length >= 30) {
  risk = 'MEDIUM';
}
```

可抄代码（每种关系的 confidence 下限表 + 回退 0.5 —— tk 排序/过滤直接用）：

源: src/mcp/local/local-backend.ts:220-238 [非分发安全]
```ts
export const IMPACT_RELATION_CONFIDENCE: Readonly<Record<string, number>> = {
  CALLS: 0.9, IMPORTS: 0.9, EXTENDS: 0.85, IMPLEMENTS: 0.85,
  METHOD_OVERRIDES: 0.85, METHOD_IMPLEMENTS: 0.85,
  HAS_METHOD: 0.95, HAS_PROPERTY: 0.95, ACCESSES: 0.8, CONTAINS: 0.95,
};
const confidenceForRelType = (relType: string | undefined): number =>
  IMPACT_RELATION_CONFIDENCE[relType ?? ''] ?? 0.5;
```

关键数值（全部照搬控成本）：`maxDepth` 默认 **3**、上限 **32**（`Math.min(requestedDepth, 32)`，local-backend.ts:4071/4153）；默认 relation 集 = `['CALLS','IMPORTS','EXTENDS','IMPLEMENTS','USES','METHOD_OVERRIDES','OVERRIDES','METHOD_IMPLEMENTS']`（4250-4259）；enrichment chunk `CHUNK_SIZE=100`、`MAX_CHUNKS=10`（env `IMPACT_MAX_CHUNKS`）⇒ 最多 enrich **1000** 个符号（4795-4798）；pagination limit clamp 到 `[1,10000]`（4602）；name 撞名歧义时每候选只跑 summary-only BFS，最多 **6** 个候选（`AMBIGUOUS_MAX_CANDIDATES=6`，4312）；local impact wall-clock 默认 **30s**、clamp `[100ms, 5min]`（cross-impact.ts:36,109-115）。`minConfidence<=0` 时**不加** confidence 子句（保留 NULL-confidence 边），别无脑加 `>= 0`（4614-4615）。

**关键正确性点（必抄）**：BFS 失败时设 `partial:true` 返回已收集的部分结果，**绝不静默吞**（#321）；name 撞多个符号时**绝不报 `impactedCount:0`**——那是最危险的假阴性，要 per-候选探测取 max risk（#2129，4302-4311 注释）。tk 的 measurement honesty（§12）需要这两条。

node:sqlite 适配（blast-radius 用递归 CTE 一次出全层，替代逐层 N 次查询；upstream=反向边）：
```sql
-- upstream impact: 谁（递归）依赖 target，CALLS/IMPORTS/... 边，限深 maxDepth
WITH RECURSIVE impact(id, depth) AS (
  SELECT :targetId, 0
  UNION
  SELECT e.src, i.depth + 1
  FROM edges e JOIN impact i ON e.dst = i.id
  WHERE e.kind IN ('CALLS','IMPORTS','EXTENDS','IMPLEMENTS','USES',
                   'METHOD_OVERRIDES','OVERRIDES','METHOD_IMPLEMENTS')
    AND i.depth < :maxDepth
    AND (:minConfidence <= 0 OR e.confidence >= :minConfidence)
)
SELECT n.id, n.name, n.kind, n.file_path, MIN(i.depth) AS depth
FROM impact i JOIN nodes n ON n.id = i.id
WHERE i.id <> :targetId
GROUP BY n.id           -- 等价 visited-set 去重 + 取最浅 depth
ORDER BY depth, n.file_path;
-- downstream（target 调谁）：把 e.dst=i.id 改成 e.src=i.id、SELECT e.dst
```
SQLite 的递归 CTE 用 `UNION`（非 `UNION ALL`）天然去重，等价 gitnexus 的 `visited` set；`MIN(depth)` 等价「首次访问即记深度」。`directCount`（risk 评分要）= `SELECT COUNT(*) FROM (...) WHERE depth=1`。test 文件过滤在外层加 `AND n.file_path NOT LIKE '%test%'`（对应 `isTestFilePath`，tk 需补真实判定）。

tk 落点：成为 **MCP 工具 `tk_impact`**（`src/codegraph/impact.ts`），入参 `{target, direction:'upstream'|'downstream', maxDepth=3, relationTypes?, minConfidence=0, includeTests=false}`，出参 `{target, direction, impactedCount, risk, byDepth, partial?}`。这是需求 B「agent 改前评估爆炸半径」的主工具，也给 buildContext（G）当「这个符号有多重要」的信号。

---

#### 4. 拓扑分层排序（graph-sort）——服务 B/G（确定性 + 增量）

`topologicalLevelSort` 用 Kahn 算法在**反向** import 图上分层：同层文件无相互依赖、可并行处理；环里的文件兜底追加到最后一层。tk 两个用途：（a）增量重分析时按「叶子优先」顺序处理文件（上游导出先解析、下游再 re-resolve）；（b）repo-map / wiki 生成时给文件一个**确定性**层序（同层内顺序稳定 → 输出可缓存、A/B 可复现，直接服务 §11 measurement）。

可抄代码（整函数无外部依赖，纯 Map，可整段 copy）：

源: src/core/ingestion/utils/graph-sort.ts:57-109 [非分发安全]
```ts
export function topologicalLevelSort(importMap: ReadonlyMap<string, ReadonlySet<string>>): {
  levels: readonly IndependentFileGroup[];
  cycleCount: number;
} {
  const pendingImportsPerFile = new Map<string, number>();
  const reverseDeps = new Map<string, string[]>();

  for (const [file, deps] of importMap) {
    if (!pendingImportsPerFile.has(file)) pendingImportsPerFile.set(file, 0);
    for (const dep of deps) {
      if (!pendingImportsPerFile.has(dep)) pendingImportsPerFile.set(dep, 0);
      pendingImportsPerFile.set(file, (pendingImportsPerFile.get(file) ?? 0) + 1);
      let rev = reverseDeps.get(dep);
      if (!rev) { rev = []; reverseDeps.set(dep, rev); }
      rev.push(file);
    }
  }

  const levels: string[][] = [];
  let currentLevel = [...pendingImportsPerFile.entries()]
    .filter(([, d]) => d === 0).map(([f]) => f);

  while (currentLevel.length > 0) {
    levels.push(currentLevel);
    const nextLevel: string[] = [];
    for (const file of currentLevel) {
      for (const dependent of reverseDeps.get(file) ?? []) {
        const newPending = (pendingImportsPerFile.get(dependent) ?? 1) - 1;
        pendingImportsPerFile.set(dependent, newPending);
        if (newPending === 0) nextLevel.push(dependent);
      }
    }
    currentLevel = nextLevel;
  }

  const cycleFiles = [...pendingImportsPerFile.entries()].filter(([, d]) => d > 0).map(([f]) => f);
  if (cycleFiles.length > 0) levels.push(cycleFiles);

  return { levels, cycleCount: cycleFiles.length };
}
```

**关键陷阱（注释里反复警告，tk 别踩）**：计数器名是 `pendingImportsPerFile` **不是** `inDegree`——是在**反向**图上跑 Kahn 才能拿到「叶子优先」。改成正向 in-degree 会翻转成「根优先」，静默破坏跨文件绑定传播。整段连注释一起抄。

node:sqlite 适配：`importMap` 从 `edges` 拉一次即可，排序逻辑留在 TS（纯内存，无需 SQL）：
```sql
-- 构造 importer -> imported 的文件级 import 图喂给 topologicalLevelSort
SELECT s.file_path AS importer, d.file_path AS imported
FROM edges e JOIN nodes s ON s.id=e.src JOIN nodes d ON d.id=e.dst
WHERE e.kind='IMPORTS' AND s.file_path <> d.file_path;
```

tk 落点：整文件搬到 `src/codegraph/graph-sort.ts`，被增量索引器（按层调度 re-resolve）和 repo-map 生成器（确定性输出）共用。这是 §11 measurement 想要的「确定性序」基础设施。

---

#### 抄进来清单

| gitnexus 文件 | tk 落点 | 关键函数 / 数值 |
|---|---|---|
| `src/core/augmentation/engine.ts` | `src/codegraph/augment.ts`（buildContext + PreToolUse hook） | `augment()`；BM25 top10 / 前5文件 / 每文件3符号 / enrich前5 / callers·callees各LIMIT15·输出.slice(0,3)；错误→'' |
| `src/core/wiki/graph-queries.ts` | `src/codegraph/queries.ts`（预编译命名查询） | `getInterFileCallEdges` / `getFilesWithExports` / `getProcessesForFiles(limit=5)`；inter-module LIMIT30；`pinWikiDb`/`touchWikiDb`（session DB 长驻） |
| `src/mcp/local/local-backend.ts` `_runImpactBFS` | `src/codegraph/impact.ts`（MCP 工具 `tk_impact`） | 分层BFS主循环（4716-4770）；risk阈值（5050-5065）；`IMPACT_RELATION_CONFIDENCE`+0.5回退（220-238）；maxDepth默认3·上限32；CHUNK_SIZE=100·MAX_CHUNKS=10；歧义6候选；partial不吞、name撞名不报0 |
| `src/core/ingestion/utils/graph-sort.ts` | `src/codegraph/graph-sort.ts`（增量调度 + 确定性序） | `topologicalLevelSort()`（整段+注释，反向Kahn、勿改名 inDegree） |
| `src/core/group/cross-impact.ts` | （单仓 tk **不抄**主体；仅借 timeout clamp 模式） | `clampTimeout` `[100ms,5min]`、`DEFAULT_LOCAL_IMPACT_TIMEOUT_MS=30s`、`safeNeighborImpact` 的 AbortController+race（若 tk 给 impact 加超时则借这个壳） |

---

### gitnexus · wiki generation (human narrative)

**总览**: gitnexus 的 wiki 子系统把"类型化属性图"转成人类可读的多页 Markdown wiki + 一个自包含 `index.html`。它是一条确定性的 **graph → prompt → host-LLM → grounded markdown** 流水线。核心洞察(对 tk 极其重要):**图查询、文件分组的树形结构、增量更新策略、provenance 注入全部是 gitnexus 自己写的确定性代码;只有"把图事实写成散文"这一步才调用 LLM**。而且 gitnexus 的 LLM 调用**优先路由到用户本机已认证的 host CLI**(`claude` / `codex` / `opencode` / `cursor`),而非内嵌 API key——这正是 tk 的 H/I 决策"借宿主 LLM,不自带"的现成实现。

---

#### 服务 tk 的需求

- **H(人类叙事 wiki)**: 这是整章的主线。gitnexus 给出完整的"控制文件模型 + 自底向上生成 + 自包含 HTML viewer"。tk 的 `.tk/wiki.json` 控制文件可直接对应 gitnexus 的 `meta.json` + `module_tree.json` 双文件模型。
- **A(人类理解+协作)**: module tree(把扁平文件聚类成 5–15 个语义模块)、overview 页(10 秒看懂架构)、parent/leaf 分层叙事,都是"让人快速理解仓库"的产物。
- **I(host-borrowed LLM,derive+validate not hallucinate)**: `local-cli-client.ts` 是把叙事步骤路由给宿主 CLI 的标准做法。prompt 里反复强调"reference actual function names — do NOT invent APIs",并把 call-graph/process 作为 grounding 事实注入——这是 tk"派生+校验,不幻觉"的 prompt 契约范本。

---

#### 流水线四阶段(generator.ts)

源: `src/core/wiki/generator.ts:1-11`(文件头注释,已读)描述四阶段:

- **Phase 0 Gather**: `getFilesWithExports()` + `getAllFiles()`,用 `shouldIgnorePath` 过滤非源码,把 exports 合并进 enriched file list。
- **Phase 1 Build module tree**: 1 次 LLM 调用,把文件分组成模块;超 token 预算的模块按子目录拆分成 children。产物落 `first_module_tree.json`(不可变快照,可断点续跑)+ `module_tree.json`(可被用户手改)。
- **Phase 2 Generate pages(自底向上)**: 叶子模块并行(读源码+图事实→1 次 LLM/模块),父模块串行(只综合 children 文档,不重读源码)。
- **Phase 3 Overview**: 读各模块 overview 段 + inter-module edges + top processes → 顶层 architecture 页。

**关键: provenance 注入** —— 每个叶子页的 prompt 同时喂入"源码 + intra/outgoing/incoming call edges + execution flows(processes)",并在 system prompt 里明令"Use the call graph and execution flow data for accuracy"且"do NOT invent APIs"。这就是 gitnexus 让 LLM 输出"扎根于图"的机制:**事实由图提供,LLM 只负责措辞**。

可抄代码(叶子页生成,展示事实注入契约):

```ts
// 源: src/core/wiki/generator.ts:843-881 [非分发安全]
private async generateLeafPage(node: ModuleTreeNode): Promise<void> {
  const filePaths = node.files;
  const sourceCode = await this.readSourceFiles(filePaths);
  const totalTokens = estimateTokens(sourceCode);
  let finalSourceCode = sourceCode;
  if (totalTokens > this.maxTokensPerModule) {
    finalSourceCode = this.truncateSource(sourceCode, this.maxTokensPerModule);
  }
  const [intraCalls, interCalls, processes] = await Promise.all([
    getIntraModuleCallEdges(filePaths),
    getInterModuleCallEdges(filePaths),
    getProcessesForFiles(filePaths, 5),
  ]);
  const prompt = fillTemplate(MODULE_USER_PROMPT, {
    MODULE_NAME: node.name,
    SOURCE_CODE: finalSourceCode,
    INTRA_CALLS: formatCallEdges(intraCalls),
    OUTGOING_CALLS: formatCallEdges(interCalls.outgoing),
    INCOMING_CALLS: formatCallEdges(interCalls.incoming),
    PROCESSES: formatProcesses(processes),
  });
  const response = await this.invokeLLM(
    prompt, this.buildSystemPrompt(MODULE_SYSTEM_PROMPT), this.streamOpts(node.name),
  );
  // H1 uses the English module name (stable slug source); body is LLM-translated.
  const pageContent = sanitizeMermaidMarkdown(`# ${node.name}\n\n${response.content}`);
  await fs.writeFile(path.join(this.wikiDir, `${node.slug}.md`), pageContent, 'utf-8');
}
```

---

#### 控制文件模型(对应 tk 的 `.tk/wiki.json`)

gitnexus 用**三件套**而非单一控制文件:

- `meta.json` ↔ `WikiMeta`:记录 `fromCommit`、`generatedAt`、`model`、`lang`、`moduleFiles`(module→files 映射,增量更新用)、`moduleTree`。
- `module_tree.json`:**人可手改**的模块树(支持 `--review` 工作流——先停在树这步让用户编辑,再生成正文)。
- `first_module_tree.json`:不可变快照,断点续跑/`--force` 重分组时删除。

可抄代码(WikiMeta + ModuleTreeNode 类型,tk 的 `wiki.json` schema 蓝本):

```ts
// 源: src/core/wiki/generator.ts:80-103 [非分发安全]
export interface WikiMeta {
  fromCommit: string;
  generatedAt: string;
  model: string;
  lang: string;
  moduleFiles: Record<string, string[]>;
  moduleTree: ModuleTreeNode[];
}
export interface ModuleTreeNode {
  name: string;
  slug: string;
  files: string[];
  children?: ModuleTreeNode[];
}
export interface WikiRunResult {
  pagesGenerated: number;
  mode: 'full' | 'incremental' | 'up-to-date';
  failedModules: string[];
  moduleTree?: ModuleTreeNode[];
}
```

**tk 落点**: 合并成单一 `.tk/wiki.json`,内含 `{ fromCommit, generatedAt, model, lang, moduleTree, moduleFiles }`;页面正文写 `.tk/wiki/<slug>.md`;`first_module_tree.json` 可降级为 `.tk/wiki.json` 里的 `pinnedTree` 字段(避免多文件)。

---

#### LLM 在哪里(诚实标注 + tk 必须改造的点)

gitnexus 在**四个**地方调 LLM,全部经 `invokeLLM()` 路由:
1. **分组**(GROUPING):文件→模块,JSON 输出。
2. **叶子页**(MODULE):源码+图→散文。
3. **父页**(PARENT):children 文档→综合散文。
4. **Overview**(OVERVIEW):模块摘要+边→顶层散文。

**对 tk 的诚实结论**:
- 分组(1)严格来说**不需要 LLM**——gitnexus 自己就有 `fallbackGrouping()`(按顶级目录分组)和 `splitBySubdirectory()`。tk 可以**先用确定性目录分组,LLM 仅做可选 refine**,从而让 wiki 在无 host LLM 时仍可生成(degrade gracefully)。
- 叙事(2/3/4)**必须**有 LLM。tk 的 I 决策正确:把这步**路由给宿主**,绝不内嵌 key。`local-cli-client.ts` 是直接可抄的 host-borrow 实现。

可抄代码(provider 路由——tk 的"借宿主 LLM"骨架):

```ts
// 源: src/core/wiki/generator.ts:216-249 [非分发安全]
private async invokeLLM(
  prompt: string, systemPrompt: string, options?: CallLLMOptions,
): Promise<LLMResponse> {
  if (this.llmConfig.provider === 'cursor') {
    const cursorConfig = resolveCursorConfig({ model: this.llmConfig.model, workingDirectory: this.repoPath });
    return callCursorLLM(prompt, cursorConfig, systemPrompt, options);
  }
  if (this.llmConfig.provider === 'claude' || this.llmConfig.provider === 'codex' || this.llmConfig.provider === 'opencode') {
    const localConfig = resolveLocalCLIConfig({
      model: this.llmConfig.model, workingDirectory: this.repoPath, requestTimeoutMs: this.llmConfig.requestTimeoutMs,
    });
    if (this.llmConfig.provider === 'claude') return callClaudeLLM(prompt, localConfig, systemPrompt, options);
    if (this.llmConfig.provider === 'codex') return callCodexLLM(prompt, localConfig, systemPrompt, options);
    if (this.llmConfig.provider === 'opencode') return callOpenCodeLLM(prompt, localConfig, systemPrompt, options);
  }
  return callLLM(prompt, this.llmConfig, systemPrompt, options); // OpenAI-compatible HTTP
}
```

可抄代码(把 prompt 喂给宿主 `claude` CLI——tk 主要目标 Claude Code 的现成命令行):

```ts
// 源: src/core/wiki/local-cli-client.ts:95-117 [非分发安全]
export async function callClaudeLLM(
  prompt: string, config: LocalCLIConfig, systemPrompt?: string, options?: CallLLMOptions,
): Promise<LLMResponse> {
  const commandInfo = getDetectedCommand('claude');
  if (!commandInfo) {
    throw new Error('Claude CLI not found. Install Claude Code and ensure `claude` is on PATH.');
  }
  const args = ['-p', '--output-format', 'text', '--no-session-persistence'];
  if (config.model) { args.push('--model', config.model); }
  const fullPrompt = systemPrompt ? `${systemPrompt}\n\n---\n\n${prompt}` : prompt;
  const response = await runLocalCLI('claude', commandInfo, args, config, fullPrompt, options);
  if (!response.content) { throw new Error('claude CLI returned empty output'); }
  return response;
}
```

**Windows 主目标特别注意**: gitnexus 的 `resolveLocalCommand()`(`local-cli-client.ts:390-429`)专门处理 Windows 上 `claude.cmd` 解析——先 `where.exe` 找 npm bin,再直指 `node_modules/@anthropic-ai/claude-code/bin/claude.exe`,最后回退 `cmd.exe /d /s /c`。**prompt 永远走 stdin**(`child.stdin.end(stdinText)`),不放命令行(`maskPromptArgs` 也佐证),避免 Windows 命令行长度/转义/泄露问题。这正是 tk Windows 记忆里反复踩的坑的现成解法。

可抄代码(Windows 命令解析 + stdin 投喂 + 超时杀进程树):

```ts
// 源: src/core/wiki/local-cli-client.ts:390-429 [非分发安全]
function resolveLocalCommand(provider: LocalAgentProvider): LocalCommand {
  const displayName = COMMANDS[provider];
  if (process.platform !== 'win32') {
    return { displayName, command: displayName, argsPrefix: [] };
  }
  const npmBin = findWindowsCommand(`${displayName}.cmd`) || findWindowsCommand(displayName);
  if (npmBin) {
    const binDir = path.dirname(npmBin);
    if (provider === 'claude') {
      const exePath = path.join(binDir, 'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe');
      if (existsSync(exePath)) { return { displayName, command: exePath, argsPrefix: [] }; }
    }
    if (provider === 'codex') {
      const scriptPath = path.join(binDir, 'node_modules', '@openai', 'codex', 'bin', 'codex.js');
      if (existsSync(scriptPath)) { return { displayName, command: process.execPath, argsPrefix: [scriptPath] }; }
    }
  }
  return { displayName, command: process.env.ComSpec || 'cmd.exe', argsPrefix: ['/d', '/s', '/c', displayName] };
}
```

```ts
// 源: src/core/wiki/local-cli-client.ts:38-51 [非分发安全]
function killChildTree(child: import('child_process').ChildProcess): void {
  if (process.platform === 'win32' && child.pid !== undefined) {
    try {
      execFileSync('taskkill', ['/T', '/F', '/PID', String(child.pid)], { stdio: 'ignore', windowsHide: true });
      return;
    } catch { /* already exited */ }
  }
  child.kill();
}
```

---

#### grounding / 反幻觉的 prompt 契约(prompts.ts)

这是 tk 的 I 决策"derive+validate not hallucinate"的**直接可抄的散文契约**。gitnexus 把 grounding 完全写进 system prompt + 把图事实作为 `## Reference Data (for accuracy — do not reproduce verbatim)` 注入。

可抄代码(叶子模块 system/user prompt + 反幻觉规则):

```ts
// 源: src/core/wiki/prompts.ts:37-63 [非分发安全]
export const MODULE_SYSTEM_PROMPT = `You are a technical documentation writer. Write clear, developer-focused documentation for a code module.

Rules:
- Output ONLY the documentation content — no meta-commentary like "I've written...", "Here's the documentation...", "The documentation covers...", or similar
- Start directly with the module heading and content
- Reference actual function names, class names, and code patterns — do NOT invent APIs
- Use the call graph and execution flow data for accuracy, but do NOT mechanically list every edge
- Include Mermaid diagrams only when they genuinely help understanding. Keep them small (5-10 nodes max)
- Structure the document however makes sense for this module — there is no mandatory format
- Write for a developer who needs to understand and contribute to this code`;

export const MODULE_USER_PROMPT = `Write documentation for the **{{MODULE_NAME}}** module.

## Source Code

{{SOURCE_CODE}}

## Call Graph & Execution Flows (reference for accuracy)

Internal calls: {{INTRA_CALLS}}
Outgoing calls: {{OUTGOING_CALLS}}
Incoming calls: {{INCOMING_CALLS}}
Execution flows: {{PROCESSES}}

---

Write comprehensive documentation for this module. Cover its purpose, how it works, its key components, and how it connects to the rest of the codebase. Use whatever structure best fits this module — you decide the sections and headings. Include a Mermaid diagram only if it genuinely clarifies the architecture.`;
```

可抄代码(图事实→可读文本的格式化器,确定性、可单测、与 LLM 无关——tk 直接复用):

```ts
// 源: src/core/wiki/prompts.ts:176-214 [非分发安全]
export function formatCallEdges(
  edges: Array<{ fromFile: string; fromName: string; toFile: string; toName: string }>,
): string {
  if (edges.length === 0) return 'None';
  return edges
    .slice(0, 30)  // cap: 最多 30 条边喂给 prompt
    .map((e) => `${e.fromName} (${shortPath(e.fromFile)}) → ${e.toName} (${shortPath(e.toFile)})`)
    .join('\n');
}
export function formatProcesses(
  processes: Array<{ label: string; type: string; steps: Array<{ step: number; name: string; filePath: string }> }>,
): string {
  if (processes.length === 0) return 'No execution flows detected for this module.';
  return processes.map((p) => {
    const stepsText = p.steps.map((s) => `  ${s.step}. ${s.name} (${shortPath(s.filePath)})`).join('\n');
    return `**${p.label}** (${p.type}):\n${stepsText}`;
  }).join('\n\n');
}
function shortPath(fp: string): string {
  const parts = fp.replace(/\\/g, '/').split('/');
  return parts.length > 3 ? parts.slice(-3).join('/') : fp;
}
```

**tk 落点**: 这些 formatter 进 `src/codegraph/wiki/prompts.ts`,call edges 由 tk 自己的 `edges` 表查出来(见下 node:sqlite 适配),完全无需移植 gitnexus 的 Kuzu 查询。

---

#### 模块分组 + 自底向上分层(无 LLM 也能跑)

可抄代码(确定性回退分组 + 超大模块按子目录拆分 + 叶/父分层——tk 可在无 host LLM 时仍生成 wiki 骨架):

```ts
// 源: src/core/wiki/generator.ts:791-804 [非分发安全]
private fallbackGrouping(files: FileWithExports[]): Record<string, string[]> {
  const groups = new Map<string, string[]>();
  for (const f of files) {
    const parts = f.filePath.replace(/\\/g, '/').split('/');
    const topDir = parts.length > 1 ? parts[0] : 'Root';
    let group = groups.get(topDir);
    if (!group) { group = []; groups.set(topDir, group); }
    group.push(f.filePath);
  }
  return Object.fromEntries(groups);
}
```

```ts
// 源: src/core/wiki/generator.ts:1276-1295 [非分发安全]
private flattenModuleTree(tree: ModuleTreeNode[]): { leaves: ModuleTreeNode[]; parents: ModuleTreeNode[] } {
  const leaves: ModuleTreeNode[] = [];
  const parents: ModuleTreeNode[] = [];
  for (const node of tree) {
    if (node.children && node.children.length > 0) {
      for (const child of node.children) { leaves.push(child); }
      parents.push(node);
    } else { leaves.push(node); }
  }
  return { leaves, parents };
}
```

父页**只综合 children 文档、不重读源码**(省 token + 防漂移):源: `src/core/wiki/prompts.ts:67`(已读)PARENT_SYSTEM_PROMPT 明确 "Synthesize the children's documentation — do not re-read source code"。父页提取 child 的 overview 段用的是字符串切片:`content.indexOf('### Architecture')`,取到该标题前或前 800 字符(源: `generator.ts:896-898`,已读)。

---

#### 增量更新(git diff 驱动,对应 tk 的需求 C)

可抄代码(git diff → 受影响模块 → 仅重生这些页;新文件 >5 触发全量重分组):

```ts
// 源: src/core/wiki/generator.ts:1148-1166 [非分发安全]
private getChangedFiles(fromCommit: string, toCommit: string): string[] | null {
  if (!this.isCommitReachable(fromCommit, toCommit)) {
    return null; // divergent branches → caller falls back to full generation
  }
  try {
    const output = execFileSync('git', ['diff', `${fromCommit}..${toCommit}`, '--name-only'], {
      cwd: this.repoPath, windowsHide: true,
    }).toString().trim();
    return output ? output.split('\n').filter(Boolean) : [];
  } catch {
    return null; // git errors → full regen
  }
}
```

增量决策树(源: `generator.ts:981-1051`,已读):①`isCommitReachable` 用 `git merge-base --is-ancestor` 判断分支是否分叉,分叉→全量;②无改动文件但 commit 变(merge commit)→只更 meta;③遍历 `moduleFiles` 反查每个改动文件归属哪个模块,凑成 `affectedModules`;④`newFiles.length > 5` → 删快照全量重分组;⑤否则把受影响模块页删掉重生 + 重生 overview。**tk 落点**:tk 已有 RepoDoc 风格的 AST-ChangeType 增量(见 MEMORY),此处的"commit-reachable 判断 + moduleFiles 反查"可作为 wiki 层的增量门控,直接套 tk 的 `edges`/`nodes` 已建索引。

---

#### 自包含 HTML viewer(对应 CodeWiki self-contained index.html 这一层)

`generateHTMLViewer()`(源: `html-viewer.ts:22-53`,已读)把 `module_tree.json` + `meta.json` + 所有 `*.md` 读进一个 `{slug: content}` map,作为 JSON 内联进单个 `index.html`,前端用 CDN 的 `marked@11` + `mermaid@11` 渲染。**安全细节**:内联前用 `escScript = s => s.replace(/<\//g, '<\\/')` 防止 `</script>` 提前闭合(源: `html-viewer.ts:73`,已读)。**tk 落点**:tk 已规划 CodeWiki 风格 self-contained `index.html`;此处可直接复用"md map 内联 + escScript"做法,但 CDN 依赖需替换(tk 零运行时依赖且 Windows 离线场景多——见 gaps)。

**Mermaid 反崩溃**:`sanitizeMermaidMarkdown()`(源: `mermaid-sanitizer.ts:13-41`,已读)对 LLM 产出的 mermaid 做别名化(把非法 node id 映射成 `[A-Za-z0-9_-]`)、引用不安全 edge label、处理字面 `\n`。**这是"LLM 输出落盘前的确定性校验层"**,正契合 tk 的 validate-not-trust 原则——LLM 可能产出语法错的图,gitnexus 不信任、强制清洗。tk 应照抄这层(它与图后端无关,纯字符串处理)。

---

#### node:sqlite 适配(替换 gitnexus 的 Kuzu/Cypher 图查询)

gitnexus 的 `graph-queries.ts` 用 Kuzu/Cypher;本章只需它的**输出形状**(`getIntraModuleCallEdges` / `getInterModuleCallEdges` / `getProcessesForFiles`),tk 用 `nodes`/`edges` 表的纯 SQL 即可产出同形数据喂给上面的 formatter。

**module 内部调用边**(intra-module:src 与 dst 都在本模块文件集内):

```sql
-- getIntraModuleCallEdges 等价:fromFile/fromName/toFile/toName
-- :files 为本模块文件列表(用 json_each 绑定 IN 集合)
SELECT s.name AS fromName, s.file_path AS fromFile,
       d.name AS toName,   d.file_path AS toFile
FROM edges e
JOIN nodes s ON s.rowid = e.src
JOIN nodes d ON d.rowid = e.dst
WHERE e.kind = 'calls'
  AND s.file_path IN (SELECT value FROM json_each(:files))
  AND d.file_path IN (SELECT value FROM json_each(:files))
LIMIT 30;  -- 对齐 formatCallEdges 的 .slice(0,30)
```

**outgoing / incoming**(inter-module:一端在模块内、另一端在模块外):

```sql
-- outgoing: 本模块 → 外部
SELECT s.name AS fromName, s.file_path AS fromFile, d.name AS toName, d.file_path AS toFile
FROM edges e
JOIN nodes s ON s.rowid = e.src
JOIN nodes d ON d.rowid = e.dst
WHERE e.kind = 'calls'
  AND s.file_path IN (SELECT value FROM json_each(:files))
  AND d.file_path NOT IN (SELECT value FROM json_each(:files))
LIMIT 30;
-- incoming: 调换 src/dst 的 IN / NOT IN 即可
```

**inter-module edges for overview**(模块→模块的聚合计数,对应 `getInterModuleEdgesForOverview` 输出 `{from,to,count}`)。用一个 `file→module` 映射表(可从 `wiki.json.moduleFiles` 物化成临时表 `fmod(file_path, module)`):

```sql
WITH fmod(file_path, module) AS (
  -- 物化 moduleFiles: 由 tk 用 INSERT 填,或 VALUES 内联
  SELECT value ->> 'file', value ->> 'module' FROM json_each(:moduleFilesJson)
)
SELECT mf.module AS "from", mt.module AS "to", COUNT(*) AS count
FROM edges e
JOIN nodes s  ON s.rowid = e.src
JOIN nodes d  ON d.rowid = e.dst
JOIN fmod mf  ON mf.file_path = s.file_path
JOIN fmod mt  ON mt.file_path = d.file_path
WHERE e.kind = 'calls' AND mf.module <> mt.module
GROUP BY mf.module, mt.module
ORDER BY count DESC;
```

**processes / execution flows**(`getProcessesForFiles(files, N)`):gitnexus 的 process 是预计算的执行链(label/type/steps)。tk 若无独立 process 表,可用 `edges(kind='calls')` 上的 **WITH RECURSIVE 有界 BFS** 从模块内的入口符号(无入边或 export 的 node)出发,产出 top-N 条链(深度上限对齐下文 caps):

```sql
WITH RECURSIVE flow(start_id, cur_id, depth, path) AS (
  -- seeds: 模块内的导出/入口符号
  SELECT n.rowid, n.rowid, 0, n.name
  FROM nodes n
  WHERE n.file_path IN (SELECT value FROM json_each(:files))
    AND n.kind IN ('function','method')
    AND NOT EXISTS (SELECT 1 FROM edges e WHERE e.dst = n.rowid AND e.kind='calls')
  UNION ALL
  SELECT f.start_id, e.dst, f.depth + 1, f.path || ' → ' || d.name
  FROM flow f
  JOIN edges e ON e.src = f.cur_id AND e.kind = 'calls'
  JOIN nodes d ON d.rowid = e.dst
  WHERE f.depth < 6                       -- 深度上限,见 caps
    AND instr(f.path, d.name) = 0         -- 防环
)
SELECT * FROM flow WHERE depth > 0
ORDER BY depth DESC
LIMIT 5;  -- 对齐 getProcessesForFiles(.,5)
```

`getFilesWithExports` / `getAllFiles` 也是平凡 SQL:`SELECT DISTINCT file_path FROM nodes`,以及 `SELECT file_path, name, kind FROM nodes WHERE is_export=1`(tk 的 nodes 表需有 export 标记字段;无则用 `kind` 近似)。

---

#### 具体数值(gitnexus 用的 caps / budgets / timeouts)

源: `src/core/wiki/generator.ts:107-109`(已读):
- `DEFAULT_MAX_TOKENS_PER_MODULE = 30_000`(单模块源码 token 上限,超则截断或拆子目录)
- `GROUPING_TOKEN_BUDGET = 100_000`(分组 prompt token 预算,超则分批)
- `concurrency = 3`(叶子页并行度,默认值,源: `generator.ts:140`)
- token 估算 = `Math.ceil(text.length / 4)`(~4 char/token,源: `llm-client.ts:103-105`)
- module tree 目标 **5–15 个模块**(源: `prompts.ts:16` GROUPING rule)
- mermaid 节点上限:模块图 **5–10 nodes**,overview 图 **max 10 nodes**(源: `prompts.ts:44, 97`)
- call edges 喂 prompt **最多 30 条**(`formatCallEdges` `.slice(0,30)`)
- directory tree 喂 prompt **最多 50 条目录**(`formatDirectoryTree` `.slice(0,50)`)
- 拆模块阈值:`totalTokens > 30000 && modulePaths.length > 3` 才按子目录拆(源: `generator.ts:517`)
- 增量"大改"阈值:`newFiles.length > 5` → 全量重分组(源: `generator.ts:1030`)
- DB idle 保活:长 LLM 调用中每 **60s** `touchWikiDb()`(源: `generator.ts:183`)
- 429 限流自适应:命中即 `activeConcurrency--`,`setTimeout(next, 5000)` 重排(源: `generator.ts:1326-1335`)
- 父/overview overview 段提取切片:child 取 **800** 字符、overview 取 **600** 字符(源: `generator.ts:898, 938`)
- slug:`toLowerCase` → 非字母数字转 `-` → 截 **60** 字符(源: `generator.ts:1366-1372`)
- Codex CLI 沙箱参数:`--sandbox read-only -c approval_policy="never"`(源: `local-cli-client.ts:136-145`)—— tk 借宿主时应同样强制只读沙箱。

---

#### 抄进来清单

| gitnexus file | tk target | 关键函数 / 抄什么 |
|---|---|---|
| `wiki/generator.ts:80-103` | `src/codegraph/wiki/types.ts` | `WikiMeta`/`ModuleTreeNode`/`WikiRunResult` → `.tk/wiki.json` schema |
| `wiki/generator.ts:340-451` | `src/codegraph/wiki/generator.ts` | 四阶段 `fullGeneration` 编排(改图查询为 SQL) |
| `wiki/generator.ts:843-925` | 同上 | `generateLeafPage`/`generateParentPage`(事实注入契约) |
| `wiki/generator.ts:1276-1295`,`791-836` | 同上 | `flattenModuleTree`/`fallbackGrouping`/`splitBySubdirectory`(无-LLM 骨架) |
| `wiki/generator.ts:1148-1166`,`1135-1146` | 同上 | `getChangedFiles`/`isCommitReachable`(增量门控) |
| `wiki/generator.ts:1301-1353` | 同上 | `runParallel`(并发+429 自适应) |
| `wiki/prompts.ts` 全文 | `src/codegraph/wiki/prompts.ts` | 5 组 system/user prompt + `formatCallEdges`/`formatProcesses`/`fillTemplate`(反幻觉契约,**直接抄**) |
| `wiki/local-cli-client.ts:95-117,262-429` | `src/codegraph/wiki/host-llm.ts` | `callClaudeLLM`/`runLocalCLI`/`resolveLocalCommand`/`killChildTree`(host-borrow + Windows 解析) |
| `wiki/mermaid-sanitizer.ts:13-41` | `src/codegraph/wiki/mermaid-sanitizer.ts` | `sanitizeMermaidMarkdown`(LLM 输出落盘前校验,**直接抄,无依赖**) |
| `wiki/html-viewer.ts:22-53,73` | `src/codegraph/wiki/html-viewer.ts` | md-map 内联 + `escScript`(CDN 依赖需替换) |
| `wiki/llm-client.ts:103-105` | `src/codegraph/wiki/tokens.ts` | `estimateTokens`(~4 char/token) |

**MCP tool 落点**: 暴露 `tk_wiki_generate`(全量/增量,参数 `force`/`lang`/`reviewOnly`)、`tk_wiki_page(slug)`(返回单页 md,供 agent 按需读)。叙事步骤通过 host-llm.ts 路由给宿主 `claude` CLI;tk 自身不持 API key。


---

### gitnexus · SWE-bench EVAL harness（服务 K）

#### 服务 tk 需求

**K（measurement / 诚实度量）。** tk 的 1.0.0 度量策略（见 MEMORY measurement-harness-design）已定：**主 track = codegraph agent-eval（Track-1 在 Claude Code headless 上跑、唯一干净 token runner）**，再加一条 **SWE-bench cross-check arm** 做对外可比的硬指标。gitnexus 这套 `eval/` 正是 tk cross-check arm 要照抄的**协议骨架**：它把"代码图情报是否真的帮到 agent 解 issue"做成了一个 **A/B 对照实验**——`baseline`（纯 bash 工具，无图）vs `native_augment`（图工具 + grep 富化），跑同一批 SWE-bench 实例，输出 **resolve rate / cost / api_calls / tool-usage** 四类指标，并用官方 `swebench.harness.run_evaluation` 验证 patch 是否真过测试。

这正是 tk 需要的：把"装了 tk 的 agent"和"裸 agent"丢进同一批真实 GitHub issue，看 **resolve rate 不掉 + token/cost/轮数下降**。注意（任务已点明）：**这是 Python harness（基于 mini-swe-agent + litellm + datasets + swebench）。tk 复用的是它的协议/度量口径/A-B 切分，而不是把 Python 端口成 TS。** tk 真正要"抄进 TS"的只有 **eval-server**（让工具调用 ~100ms 而非冷启 5–10s）这一段，其余是把 tk 的 CLI/MCP 接进同样的 docker + agent + analysis 流水线。

---

#### 1. 三臂对照设计（baseline / native / native_augment）

gitnexus 把"图情报有没有用"拆成三种 agent 能力档位，每档一个 mode YAML + 一对 jinja 模板：

源: `/tmp/tk-research/gitnexus/eval/agents/gitnexus_agent.py:35-39` [非分发安全]
```python
class GitNexusMode(str, Enum):
    """Evaluation modes for GitNexus integration."""
    BASELINE = "baseline"               # No GitNexus — pure mini-swe-agent
    NATIVE = "native"                   # GitNexus tools via eval-server
    NATIVE_AUGMENT = "native_augment"   # Native tools + grep enrichment (recommended)
```

**对 tk 的映射**（K 的 cross-check arm 应跑两臂，第三臂可选）：

| gitnexus mode | agent 拿到什么 | tk 对应臂 |
|---|---|---|
| `baseline` | 纯 grep/find/cat/sed（control） | **tk-off**：裸 agent，无 codegraph 工具、无 grep 富化 |
| `native` | baseline + 显式图工具（eval-server，~100ms） | **tk-tools**：agent 可调 tk 的 codegraph MCP 工具（query/context/impact） |
| `native_augment`（推荐） | native + grep 结果自动追加 `[GitNexus]` callers/callees/flows | **tk-augment**：tk 拦截 grep/rg，自动富化（对应 tk 的 hook/shim 富化路径） |

`native_augment` 是 gitnexus 自己的"recommended"主臂，因为它最贴近 Claude Code/Cursor 的真实集成形态（agent 既能显式调工具，也被动收到富化的搜索结果）。**tk 的 cross-check 至少跑 `baseline` vs `tk-augment` 这条关键对照**（README 也是这么推荐的：`--modes baseline --modes native_augment`）。

两个 mode YAML 的对照（注意 **step_limit / cost_limit 两臂必须一致**，否则不是干净 A/B）：

源: `/tmp/tk-research/gitnexus/eval/configs/modes/native_augment.yaml:10-25` 与 `baseline.yaml:2-10` [非分发安全]
```yaml
# native_augment.yaml
agent:
  gitnexus_mode: 'native_augment'
  step_limit: 30
  cost_limit: 3.0
  augment_timeout: 5.0
  augment_min_pattern_length: 3
  track_gitnexus_usage: true
environment:
  enable_gitnexus: true
  skip_embeddings: true       # 评测不开 embedding，只测图情报
  gitnexus_timeout: 120
  eval_server_port: 4848
# baseline.yaml —— 同样 step_limit:30 / cost_limit:3.0，environment_class: 'docker'（裸）
```

---

#### 2. eval-server —— tk 唯一需要"抄进 TS"的部分（~100ms 热查询）

**这是这个 subsystem 里 tk 最该直接拿走的代码。** 问题：mini-swe-agent 每条命令都用 `subprocess.run` 在全新子 shell 里跑（不 source `.bashrc`、env 不继承），所以工具不能是 shell 函数，必须是 `$PATH` 里的独立可执行 + 一个**常驻进程**保住热 DB。gitnexus 的解法：起一个 HTTP daemon 把图 DB 常驻内存，`/usr/local/bin/` 装一批 bash 包装脚本（curl 走 fast path，失败 fallback 到冷 CLI）。

源: `/tmp/tk-research/gitnexus/gitnexus/src/cli/eval-server.ts:457-509`（HTTP 路由核心）[非分发安全]
```ts
const server = http.createServer(async (req, res) => {
  resetIdleTimer();
  try {
    // Health check
    if (req.method === 'GET' && req.url === '/health') {
      res.setHeader('Content-Type', 'application/json');
      res.writeHead(200);
      res.end(JSON.stringify({ status: 'ok', repos: repos.map((r) => r.name) }));
      return;
    }
    // Shutdown
    if (req.method === 'POST' && req.url === '/shutdown') {
      res.writeHead(200);
      res.end(JSON.stringify({ status: 'shutting_down' }));
      setTimeout(async () => { await backend.disconnect(); server.close(); process.exit(0); }, 100);
      return;
    }
    // Tool calls: POST /tool/:name
    const toolMatch = req.url?.match(/^\/tool\/(\w+)$/);
    if (req.method === 'POST' && toolMatch) {
      const toolName = toolMatch[1];
      const body = await readBody(req);
      let args: Record<string, any> = {};
      if (body.trim()) {
        try { args = JSON.parse(body); }
        catch { res.writeHead(400); res.end('Error: Invalid JSON body'); return; }
      }
      const result = await backend.callTool(toolName, args);
      const formatted = formatToolResult(toolName, result);   // ← 关键：文本而非 JSON
      const hint = getNextStepHint(toolName);                 // ← 关键：链式下一步提示
      res.setHeader('Content-Type', 'text/plain');
      res.writeHead(200);
      res.end(formatted + hint);
      return;
    }
    res.writeHead(404);
    res.end('Not found. Use POST /tool/:name or GET /health');
  } catch (err: any) {
    res.writeHead(500);
    res.end(`Error: ${err.message || 'Internal error'}`);
  }
});
```

**两个对 tk-K「token 诚实度量」直接有价值的设计点（README 也明确点了）**：

1. **返回 LLM-friendly 文本，不返回原始 JSON**（"Raw JSON wastes tokens and is hard for models to parse"，eval-server.ts:6-11）。每个工具有一个 `format*Result` 把结构化结果压成紧凑文本，并对列表做硬截断（见 §3 具体数值）。这正是 tk 的 token 卖点在评测里能体现的前提——如果评测时把图结果当 JSON 灌给模型，省 token 的效果就被噪声淹没了。

2. **next-step hint 引导工具链**（`query → context → impact → fix`）：

源: `/tmp/tk-research/gitnexus/gitnexus/src/cli/eval-server.ts:379-402` [非分发安全]
```ts
function getNextStepHint(toolName: string): string {
  switch (toolName) {
    case 'query':
      return '\n---\nNext: Pick a symbol above and run gitnexus-context "<name>" to see all its callers, callees, and execution flows.';
    case 'context':
      return '\n---\nNext: To check what breaks if you change this, run gitnexus-impact "<name>" upstream';
    case 'impact':
      return '\n---\nNext: Review d=1 items first (WILL BREAK). Read the source with cat to understand the code, then make your fix.';
    case 'cypher':
      return '\n---\nNext: To explore a result symbol in depth, run gitnexus-context "<name>"';
    case 'detect_changes':
      return '\n---\nNext: Run gitnexus-context "<symbol>" on high-risk changed symbols to check their callers.';
    case 'list_repos':
      return '\n---\nNext: READ ... re-run list_repos with offset set to pagination.nextOffset ...';
    default: return '';
  }
}
```

**READY 信号 + body 上限**（直接抄进 tk 的 eval-server）：
- READY 行：`GITNEXUS_EVAL_SERVER_READY:<host>:<port>`（IPv6 加方括号），harness 端解析时**取最后一个冒号段** `split(':').pop()`，不要 `split(':')[1]`（IPv4 非 loopback / IPv6 会断）。源: eval-server.ts:613, README:199。
- `export const MAX_BODY_SIZE = 1024 * 1024; // 1MB`，源: eval-server.ts:632-648 [非分发安全]，`readBody` 超限 `req.destroy`。

**tk 落点**：tk 已规划"per-session MCP server"（MEMORY code-graph-design）。tk 的 eval-server **不需要新写**——可以让 tk 的 MCP server 多挂一个 `/tool/:name` HTTP shim（或评测专用 `tk eval-server` 子命令），内部转调同一套 codegraph 查询函数。复用 tk 已有的 node:sqlite + FTS5 backend（对应 gitnexus 的 `backend.callTool`）。**关键是把 §3 的文本压缩 + hint 也照抄**，否则 token 指标不可信。

---

#### 3. 文本格式化器 —— 每种工具的 token cap（直接抄数值）

eval-server 把图查询结果压成紧凑文本时用了一组**硬截断**，这些数字 tk 的 format 层应原样沿用（它们是 gitnexus 实跑校准过的 token/可读性折中）：

| 工具 | 截断规则 | 源 (eval-server.ts) |
|---|---|---|
| `query` | 每个 process 最多列 **6** 个 symbol，余者 `... and N more`；standalone defs 最多 **8** | :88, :100-103 |
| `context` | incoming/outgoing 每种 relType 各最多 **10** 条 ref | :140, :156 |
| `impact` | 每个 depth(d=1/2/3) 最多 **12** 项；depth label = `WILL BREAK / LIKELY AFFECTED / MAY NEED TESTING` | :281-282, :255-259 |
| `cypher` | 最多 **30** 行，余者 `... N more rows` | :307-311 |

源: `/tmp/tk-research/gitnexus/gitnexus/src/cli/eval-server.ts:82-104`（query 截断示例）[非分发安全]
```ts
lines.push(`Found ${processes.length} execution flow(s):\n`);
for (let i = 0; i < processes.length; i++) {
  const p = processes[i];
  lines.push(`${i + 1}. ${p.summary} (${p.step_count} steps, ${p.symbol_count} symbols)`);
  const procSymbols = symbols.filter((s: any) => s.process_id === p.id);
  for (const s of procSymbols.slice(0, 6)) {           // ← cap 6
    const loc = s.startLine ? `:${s.startLine}` : '';
    lines.push(`   ${s.type} ${s.name} → ${s.filePath}${loc}`);
  }
  if (procSymbols.length > 6) lines.push(`   ... and ${procSymbols.length - 6} more`);
  lines.push('');
}
if (defs.length > 0) {
  lines.push(`Standalone definitions:`);
  for (const d of defs.slice(0, 8)) {                  // ← cap 8
    lines.push(`  ${d.type || 'Symbol'} ${d.name} → ${d.filePath || '?'}`);
  }
  if (defs.length > 8) lines.push(`  ... and ${defs.length - 8} more`);
}
```

**node:sqlite 适配。** gitnexus 的 `backend.callTool` 底层走 Kuzu/Cypher；tk 走 node:sqlite + FTS5。impact 的 byDepth 截断对应一个有界深度 CTE（tk 抄 §impact 的 d=1/2/3 三档 + 每档 cap 12）。tk 的 `impact` 查询（upstream blast radius）等价 SQL：
```sql
-- tk: blast radius，depth-bounded recursive CTE over edges(src,dst,kind)
WITH RECURSIVE blast(node_id, depth) AS (
  SELECT :target_id, 0
  UNION
  SELECT e.src, b.depth + 1            -- upstream: 谁依赖 target（调用/导入/继承指向 target）
  FROM edges e JOIN blast b ON e.dst = b.node_id
  WHERE b.depth < 3                    -- gitnexus 也只展示 d=1..3
    AND e.kind IN ('CALLS','IMPORTS','EXTENDS','IMPLEMENTS')
)
SELECT b.depth,
       n.kind, n.name, n.file_path
FROM blast b JOIN nodes n ON n.id = b.node_id
WHERE b.depth > 0
ORDER BY b.depth,
         CASE WHEN b.depth=1 THEN 'WILL BREAK'
              WHEN b.depth=2 THEN 'LIKELY AFFECTED'
              ELSE 'MAY NEED TESTING' END
LIMIT 100;  -- 然后在 format 层每个 depth 各 slice(0,12)
```
（downstream 把 `e.dst=b.node_id`→`e.src=b.node_id`、取 `e.dst` 翻转方向即可。）
context 的 incoming/outgoing 等价两条单跳查询：
```sql
-- incoming: 谁引用 :sym（按 relType 分组，每组 LIMIT 10）
SELECT e.kind AS rel, n.kind, n.name, n.file_path
FROM edges e JOIN nodes n ON n.id = e.src
WHERE e.dst = :sym_id;
-- outgoing: :sym 引用了谁 —— 对称，e.src=:sym_id 取 e.dst
```

---

#### 4. agent 层：grep 富化 + 指标采集（A/B 的"处理变量"）

`native_augment` 臂的核心是：拦截 agent 的 grep/rg/ag，抽出 pattern，调 `gitnexus-augment` 拿图上下文，把 `[GitNexus]` 注解追加到搜索结果后。**这正是 tk 的 hook/shim 富化在评测里的体现** —— tk 已有等价能力（MEMORY 里的 grep 富化 hook），评测时只要把它接进同一个拦截点。

源: `/tmp/tk-research/gitnexus/eval/agents/gitnexus_agent.py:97-131`（富化决策）[非分发安全]
```python
def _maybe_augment(self, action: dict, output: dict) -> dict | None:
    command = action.get("command", "")
    if not command:
        return None
    pattern = self._extract_search_pattern(command)
    if not pattern or len(pattern) < self.config.augment_min_pattern_length:  # min 3
        return None
    start = time.time()
    try:
        augment_result = self.env.execute({
            "command": f'gitnexus-augment "{pattern}" 2>&1 || true',
            "timeout": self.config.augment_timeout,                            # 5.0s
        })
        elapsed = time.time() - start
        self.gitnexus_metrics.augmentation_calls += 1
        self.gitnexus_metrics.augmentation_time += elapsed
        augment_text = augment_result.get("output", "").strip()
        if augment_text and "[GitNexus]" in augment_text:                      # 只在真有命中时计 hit
            original_output = output.get("output", "")
            output = dict(output)
            output["output"] = f"{original_output}\n\n{augment_text}"
            self.gitnexus_metrics.augmentation_hits += 1
            return output
    except Exception as e:
        self.gitnexus_metrics.augmentation_errors += 1
    return None
```

源: `/tmp/tk-research/gitnexus/eval/agents/gitnexus_agent.py:133-151`（从命令里抽 grep pattern，tk 富化拦截点可复用同款正则）[非分发安全]
```python
@staticmethod
def _extract_search_pattern(command: str) -> str | None:
    patterns = [
        r'(?:grep|rg|ag)\s+(?:-[a-zA-Z]*\s+)*["\']([^"\']+)["\']',
        r'(?:grep|rg|ag)\s+(?:-[a-zA-Z]*\s+)*(\S+)',
    ]
    for pat in patterns:
        match = re.search(pat, command)
        if match:
            result = match.group(1)
            if result.startswith("/") or result.startswith("."):  # 跳过路径
                continue
            if result.startswith("-"):                             # 跳过 flag
                continue
            return result
    return None
```

**指标对象**（tk 的 cross-check 应采同款，serialize 进每个实例的 traj）：

源: `/tmp/tk-research/gitnexus/eval/agents/gitnexus_agent.py:175-199` [非分发安全]
```python
class GitNexusMetrics:
    def __init__(self):
        self.tool_calls: dict[str, int] = {key: 0 for key in TOOL_METRIC_KEYS}
        self.augmentation_calls = 0
        self.augmentation_hits = 0
        self.augmentation_errors = 0
        self.augmentation_time = 0.0
        self.index_time = 0.0
    @property
    def total_tool_calls(self) -> int:
        return sum(self.tool_calls.values())
    def to_dict(self) -> dict:
        return {
            "tool_calls": dict(self.tool_calls),
            "total_tool_calls": self.total_tool_calls,
            "augmentation_calls": self.augmentation_calls,
            "augmentation_hits": self.augmentation_hits,
            "augmentation_errors": self.augmentation_errors,
            "augmentation_time_seconds": round(self.augmentation_time, 2),
            "index_time_seconds": round(self.index_time, 2),
        }
```
**tk-K 含义**：`augment_hit_rate = hits / calls` 是 tk 的核心"机会真实命中率"指标——它回答"agent 的搜索里有多少真的被 codegraph 富化到了有用的东西"，这正是 tk online-opportunity track（MEMORY measurement-harness-design 的 Track-2）想量的东西。tk 应原样保留这套口径。

---

#### 5. 度量口径 & A/B delta（analysis 层，tk cross-check 报表照抄）

`compute_metrics` 定义了每个 run 的口径；`compare_modes` 做 baseline→enhanced 的 **delta（负=更省 = 绿）**。这套口径就是 tk cross-check 报表要产出的。

源: `/tmp/tk-research/gitnexus/eval/analysis/analyze_results.py:142-155`（口径）[非分发安全]
```python
return {
    "n_instances": n_instances,
    "n_with_patch": n_with_patch,
    "patch_rate": n_with_patch / max(n_instances, 1),
    "total_cost": total_cost,
    "avg_cost": total_cost / max(n_instances, 1),
    "total_api_calls": total_calls,
    "avg_api_calls": total_calls / max(n_instances, 1),
    "total_gn_tool_calls": sum(gn_tool_calls),
    "avg_gn_tool_calls": ... ,
    "total_augment_hits": sum(gn_augment_hits),
    "total_augment_calls": sum(gn_augment_calls),
    "augment_hit_rate": sum(gn_augment_hits) / max(sum(gn_augment_calls), 1) if gn_augment_calls else 0,
}
```

源: `/tmp/tk-research/gitnexus/eval/analysis/analyze_results.py:319-340`（vs baseline 的 delta，负为优）[非分发安全]
```python
if "baseline" in metrics:
    baseline_cost = metrics["baseline"]["avg_cost"]
    baseline_calls = metrics["baseline"]["avg_api_calls"]
    for mode in mode_order:
        if mode == "baseline": continue
        cost_delta  = ((metrics[mode]["avg_cost"]      - baseline_cost)  / max(baseline_cost, 0.001)) * 100
        calls_delta = ((metrics[mode]["avg_api_calls"] - baseline_calls) / max(baseline_calls, 1))     * 100
        # Color-code: negative is good (cheaper/fewer calls)
        cost_color  = "green" if cost_delta  < 0 else "red"
        calls_color = "green" if calls_delta < 0 else "red"
```

**resolve rate（硬指标）—— 调官方 swebench harness**，源: `analysis/analyze_results.py:158-199` 与 `:234-238` [非分发安全]：
```python
cmd = [sys.executable, "-m", "swebench.harness.run_evaluation",
       "--dataset_name", dataset_mapping.get(subset, subset),
       "--predictions_path", str(preds_path),
       "--max_workers", "4", "--run_id", run_id, "--output_dir", str(eval_output)]
result = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
# 解析 eval_output/run_id/results.json → eval_result["resolved"]
# resolve_rate = resolved / n_instances
```
`preds.json` 的格式（SWE-bench 官方要的 `model_patch`，从容器 `git diff` 抓），源: `run_eval.py:179, :271-275`：
```python
patch_output = env.execute({"command": "cd /testbed && git diff"})  # patch = stdout
data[instance_id] = {"model_name_or_path": model_name,
                     "instance_id": instance_id,
                     "model_patch": result.get("submission", "")}
```

**tk-K 决定**：resolve rate **必须用官方 swebench harness 判（patch 真过测试），不能自评**——这是 K「诚实度量」的底线。tk cross-check 的产物就是这张 `baseline vs tk` 表：`patch_rate / resolve_rate / total_cost / avg_cost / total_api_calls / avg_api_calls / augment_hit_rate` + delta。

---

#### 6. 索引缓存（per-(repo,commit)）—— SWE-bench 重复实例的提速

SWE-bench 同一 repo 几百个实例只是 commit 不同（Django 200+），重复 index 是浪费。gitnexus 用 `sha256(repo:commit)[:16]` 做 cache key，命中就 `docker cp` 还原 tar。

源: `/tmp/tk-research/gitnexus/eval/environments/gitnexus_docker.py:287-291` [非分发安全]
```python
@staticmethod
def _make_cache_key(repo_info: dict) -> str:
    content = f"{repo_info['repo']}:{repo_info['commit']}"
    return hashlib.sha256(content.encode()).hexdigest()[:16]
```
**tk 适配**：tk 的图存在 node:sqlite 单文件 → 缓存更简单：cache key 同样 `sha256(repo:commit)[:16]`，命中就把 `.tk/codegraph.sqlite`（+FTS5 索引）整文件 cp 进容器，不必 tar。这是 tk 相对 gitnexus（Kuzu 目录）的天然优势。

---

#### 7. eval-server 启动/健康探测（环境编排，tk harness 照搬）

源: `/tmp/tk-research/gitnexus/eval/environments/gitnexus_docker.py:169-211` 与 `constants.py:3-15` [非分发安全]，关键数值：
- 启动：`nohup npx gitnexus eval-server --port 4848 --host 127.0.0.1 --idle-timeout 600 > /tmp/...log 2>&1 &`（idle 600s 自动关）。
- 健康探测：`curl -sf http://127.0.0.1:4848/health`，**30 次 × 0.5s = 最多 15s** 等 DB warm（`EVAL_SERVER_HEALTH_RETRIES=30`, `INTERVAL=0.5`, `TIMEOUT=3`），就绪判据 = 输出含 `"ok"` 且不含 `NOT_READY`。
- 工具脚本装进 `/usr/local/bin/`（heredoc 引号定界，curl fast-path + CLI fallback），原因：mini-swe-agent 每命令 `subprocess.run` 全新子 shell（gitnexus_docker.py:11-13, 243-273）。
- 其他 timeout：`gitnexus_timeout=120`（analyze），`augment_timeout=5.0`，node install 60s。

**tk 适配**：把 `npx gitnexus` 全部换成 `npx token-killer`（或 `tk`）。tk 的 eval-server 起 node:sqlite 比 Kuzu 冷启更快，健康探测的 15s 窗口对 tk 绰绰有余。Windows 不是评测目标平台（SWE-bench 容器是 linux），所以 tk-K 的 cross-check arm 在 linux 容器里跑、不受 tk 主战场 Windows 的影响——这点对 tk 是减负。

---

#### 抄进来清单

| gitnexus 文件 | tk 落点 | 关键函数 / 数值 |
|---|---|---|
| `src/cli/eval-server.ts:457-509` | `tk eval-server`（或 tk MCP server 挂 HTTP shim）src/cli/ | http 路由 `/health` `/tool/:name` `/shutdown`；body→`backend.callTool`→format+hint |
| `src/cli/eval-server.ts:68-351` | tk 的 codegraph 文本格式化层（query/context/impact/cypher） | `format*Result`；cap 6/8/10/12/30；depth label `WILL BREAK/LIKELY AFFECTED/MAY NEED TESTING` |
| `src/cli/eval-server.ts:379-402` | 同上（hint 模块） | `getNextStepHint` 工具链 query→context→impact→fix |
| `eval/agents/gitnexus_agent.py:97-151` | tk eval harness 的 agent 富化拦截（复用 tk grep-富化 hook） | `_maybe_augment` / `_extract_search_pattern`；min_len 3、timeout 5s、`[GitNexus]` 命中判据 |
| `eval/agents/gitnexus_agent.py:175-199` | tk metrics schema（serialize 进 traj） | `GitNexusMetrics.to_dict`；`augment_hit_rate` 口径 |
| `eval/analysis/analyze_results.py:99-199` | tk cross-check 报表生成器 | `compute_metrics` 口径 + `run_swebench_evaluation`（调官方 harness 判 resolve）|
| `eval/analysis/analyze_results.py:319-340` | tk A/B delta 渲染 | baseline→enhanced cost/calls delta（负=绿） |
| `eval/environments/gitnexus_docker.py:169-291` | tk eval docker env 编排 | 启 eval-server + 30×0.5s 健康探测 + `sha256(repo:commit)[:16]` 索引缓存 |
| `eval/configs/modes/*.yaml` + `run_eval.py:96-109,279-344` | tk eval 的 mode/model YAML + run 驱动 | step_limit 30 / cost_limit 3.0 两臂一致；`single/matrix/debug` 命令骨架 |
| `eval/tool_registry.py:17-79` | tk 工具脚本注册表 | `TOOL_SPECS`（endpoint/payload/fallback）；`TOOL_METRIC_KEYS=(query,context,impact,cypher,overview)` |
| `eval/constants.py:3-15` | tk eval 常量 | 健康探测/超时全套数值 |

## 本附录诚实缺口(需实现时补)

- **gitnexus · call-graph resolution engine（调用图解析）**: receiver-bound-calls.ts 的 7-case dispatcher 全文 1465 行只读了头 170 行（case 顺序契约 I4/I5 + 模板类绑定解析），Case 0-5 各自的具体实现（compound chain resolveCompoundReceiverClass、namespace targets、value-receiver bridge Case 5）未逐行确认 —— tk 抄简化版可先不要，需完整多语言时补读 passes/receiver-bound-calls.ts:170-1465 + passes/compound-receiver.ts(568)
- **gitnexus · call-graph resolution engine（调用图解析）**: free-call-fallback.ts 只读头 120 行（签名 + 全局 callable/class 索引构建）；其 emit 主体、ADL 候选解析、constructor-form class fallback、overload 收窄调用未读 —— 需实现时补读 free-call-fallback.ts:120-858
- **gitnexus · call-graph resolution engine（调用图解析）**: overload-narrowing.ts(526 行) 完全未读：narrowOverloadCandidates / conversionRank / constraintCompatibility 的 C++ 模板约束与转换排名算法 —— tk 若不做 C++/重载可跳过，做则需实现时补
- **gitnexus · call-graph resolution engine（调用图解析）**: scope-extractor.ts(45107 字节) 与 tree-sitter-queries.ts(73537 字节) 未读：referenceSites / typeBindings / scope.bindings 这些 lookupCore 的【输入】是怎么从 AST 提取并物化的，是抄进 tk 索引期的前置 —— 本任务聚焦解析（输入已给定），提取管线需另立子任务补
- **gitnexus · call-graph resolution engine（调用图解析）**: ownedMembersByOwner / methodDispatch.mroFor / qualifiedNames / scope.typeBindings 这些 RegistryContext 索引的【物化结构与填充时机】未深读（finalize-orchestrator.ts / model/*），tk 的 node:sqlite 适配里我假设了 owns 边 + bindings 表 + scopes(parent_id) 表，实际表结构需在 tk schema 设计时对齐确认
- **gitnexus · call-graph resolution engine（调用图解析）**: arityCompatibility provider 是 per-language hook，本任务未读任一语言实现（languages/*/）；tk 若要 arity 过滤需补该 hook 的 TS/Python 具体判定逻辑
- **gitnexus · call-graph resolution engine（调用图解析）**: import 解析（import-target-adapter.ts / import-resolvers/ 13 个文件）只在分派表里提及未深读 —— 服务需求 D 的'跨文件 import 一跳'核心在此，emitImportEdges + resolveImportTarget(tsconfig path alias 等) 需另行补读
- **gitnexus · control-flow + dataflow (CFG / 到达定义 / 后支配 / 控制依赖)**: cfg/visitors/typescript.ts (755 行) 未读 — tree-sitter TS/JS 如何切基本块、连 break/continue/return/throw/finally 边、采集每语句 def/use/mayDefs/sites facts，是落地 tk 的最大缺口，需实现时补
- **gitnexus · control-flow + dataflow (CFG / 到达定义 / 后支配 / 控制依赖)**: cfg/synthetic-escape.ts (331 行) 只读了模块头契约 — augmentForPostDom 给无限循环/goto-cycle 补 header→loopExit 分析专用边的具体实现未读
- **gitnexus · control-flow + dataflow (CFG / 到达定义 / 后支配 / 控制依赖)**: SSA-sparse 求解器 computeInSetsSparse (reaching-defs.ts:538-786) 主体未细读 — φ 放置、stack renaming、value-graph 构造、SCC 缩并的串接细节；tk MVP 用 dense 可绕开，但大函数性能优化需补
- **gitnexus · control-flow + dataflow (CFG / 到达定义 / 后支配 / 控制依赖)**: reaching-defs-graph.ts 的 buildDominators/buildDominanceFrontiers/tarjanScc/condenseReachingSets 已读全文，但它们如何被 sparse 求解器串成 def-use graph 查询（computeInSetsSparse 内部）未读
- **gitnexus · control-flow + dataflow (CFG / 到达定义 / 后支配 / 控制依赖)**: taint 层 (SiteRecord → source/sink/sanitizer 匹配、SiteArgOccurrence via-tag 的 exec(escape(x)) kill 语义) 不在本子系统目录内 (taint/emit.ts 等) — J 需求的完整 taint 仅做了底座 reaching-defs，sanitizer interposition 的判定逻辑需另挖 taint/ 目录
- **gitnexus · control-flow + dataflow (CFG / 到达定义 / 后支配 / 控制依赖)**: 跨函数爆炸半径：reaching_def 是函数内边，接到 tk call 边做跨函数闭包的具体 join（use 实参 → 被调 param binding）gitnexus 在 taint 引擎内做，未在本子系统体现，需实现时补
- **gitnexus · control-flow + dataflow (CFG / 到达定义 / 后支配 / 控制依赖)**: node:sqlite 在超大闭包上的递归 CTE 性能未实测 — 4000 边/函数 × 多函数闭包可能需要 depth cap + 物化中间表，tk 实测时补
- **gitnexus · Agent Delivery (MCP tool surface)**: impact 的 risk 等级具体阈值(LOW/MEDIUM/HIGH/CRITICAL 的 symbol 数/process 数边界)skill 里给了表(<5/5-15/>15),但 local-backend 里真正的判定函数未读 —— 需实现时补 risk 计算逻辑(grep `risk:` 附近 ~line 4335 的 summary 计算)
- **gitnexus · Agent Delivery (MCP tool surface)**: affected_processes / affected_modules 依赖 gitnexus 的 Process / Community(Leiden)节点,tk 当前 schema 无 process/community 层 —— tk 的 impact 若要这两个字段需先实现进程/社区抽取,否则只回 byDepth+risk,这是与 gitnexus 的一个真实 divergence
- **gitnexus · Agent Delivery (MCP tool surface)**: ranked candidates 消歧的打分函数(同名 symbol 的 relevance score)未读 —— context/impact/trace 都靠它,需实现时补(在 local-backend 的 resolve 路径)
- **gitnexus · Agent Delivery (MCP tool surface)**: trace 的逐 hop edge type/confidence 对齐:本节给了 path 回查思路,但 gitnexus 实际 `edges[]` 的构造代码未读,需实现时确认对齐方式
- **gitnexus · Agent Delivery (MCP tool surface)**: node:sqlite 是否支持 `WITH RECURSIVE` + `instr()` 防环在 tk 目标 Node 版本(≥22.5 node:sqlite)上的性能未实测 —— 大图 BFS 可能需要应用层 visited-set 替代纯 SQL 递归,需实现时基准测试
- **gitnexus · HUMAN surface (1-backend-N-frontends: serve + render large graphs)**: 布局算法未抄：gitnexus 的可读静态布局靠 tree-layout.ts(19.6KB)/circles-layout.ts(10KB) + Sigma ForceAtlas2，tk 离线 HTML 无 Sigma，需实现时补一个零依赖的纯函数布局器（tree/radial），或评估是否内联一个轻量 force-layout JS。本次未读这两个 layout 文件的内部算法。
- **gitnexus · HUMAN surface (1-backend-N-frontends: serve + render large graphs)**: community/Leiden 聚类着色（graph-adapter.ts 里的 communityMemberships/clusterCenters/getCommunityColor）依赖 gitnexus 的 Leiden 社区检测产出，tk 若要按社区着色需先有等价的社区检测（属另一 subsystem），本节未覆盖。
- **gitnexus · HUMAN surface (1-backend-N-frontends: serve + render large graphs)**: gitnexus 用节点/边计数来自 repoInfo.stats（meta.stats，analyze 时写入）；tk 用实时 COUNT(*) SQL 替代，但大图上 COUNT 是否够快、是否需要在索引时持久化 stats，需实现时补 benchmark。
- **gitnexus · HUMAN surface (1-backend-N-frontends: serve + render large graphs)**: HTML 查看器的实际交互（点击节点→打开代码、hover tooltip、focus/zoom）在 GraphCanvas.tsx 里全部绑定到 Sigma 的事件与 useSigma hook；tk 离线 HTML 需用原生 DOM/Canvas 重写这些交互，本节只抄了数据/决策层，交互层需实现时补。
- **gitnexus · HUMAN surface (1-backend-N-frontends: serve + render large graphs)**: 降级载荷（chatOnly 模式）的具体内容：gitnexus 降级后图为空、只留 escape-hatch 按钮（聊天走后端 API）。tk 没有后端聊天，降级时应内联什么（可点击的节点列表？文件树？摘要？）是 tk 专属设计，需实现时补。
- **gitnexus · HUMAN surface (1-backend-N-frontends: serve + render large graphs)**: NDJSON 流式仅后端在线场景需要；tk 离线单文件用不上，但若未来 tk 提供可选本地 server 模式，stream 协议（api.ts:300-310 backpressure/waitForDrain、client-disconnect abort）可再抄，本节未深读 backpressure 实现。
- **gitnexus · storage**: edges 的级联删除：tk 用 node:sqlite 时 FOREIGN KEY ON DELETE CASCADE 默认关闭（需 PRAGMA foreign_keys=ON，且只删 dst 入边不够 —— 跨文件入边需显式删）。§5 给的 DELETE SQL 是手动级联；是否改用触发器待实现时定 —— 需实现时补。
- **gitnexus · storage**: node-id 确定性：gitnexus 的 'Function:filePath:name' 在同名重载 / 同文件多个匿名函数时是否唯一，未在所读文件中确认其去重后缀策略（如何处理两个同名 local function）—— 需实现时补（建议 fallback 用 startLine 入 id）。
- **gitnexus · storage**: embedding/向量：gitnexus 用 Kuzu HNSW 向量索引（schema.ts:497-499 CREATE_VECTOR_INDEX cosine, 384 dims）。node:sqlite 无内置 ANN；tk 若要语义搜索需 sqlite-vec 扩展或纯 JS 余弦 —— 但这是分发原生扩展，与 zero-dep 冲突，本就在 tk 1.0.0 OUT 范围（embeddings OUT，见 MEMORY: code-graph-design）。记录为 gap 但当前不做。
- **gitnexus · storage**: writeBatch 事务粒度：gitnexus 用 SUB_BATCH_SIZE=4 是因为 LadybugDB prepared-statement 限制；tk 改单事务后，超大批（百万边）单事务是否需要分块 COMMIT 以控内存/WAL，未实测 —— 需实现时补。
- **gitnexus · storage**: FTS5 同步：tk 给 nodes 挂了 external-content FTS5 表，但 gitnexus 无此物，故没有现成的增量 rebuild/INSERT-trigger 范式可抄；FTS5 与 §5 selective writeback 的同步（delete/insert 时维护 nodes_fts）需 tk 自行设计 —— 需实现时补。
- **gitnexus · storage**: pool-adapter / WAL-checkpoint / sidecar-recovery（lbug/ 下 pool-adapter.ts 34KB、wal-checkpoint-driver.ts、sidecar-recovery.ts）未深读：这些是 Kuzu 连接池 + WAL 检查点 + 崩溃恢复，强绑原生 DB 生命周期，tk 用 node:sqlite 的 WAL 模式（PRAGMA journal_mode=WAL）即原生覆盖，故判定为 tk 不需要、未逐行确认其恢复逻辑是否有可借鉴的 corruption-handling idea —— 需实现时补（若 tk 遇到 SQLite 损坏恢复需求再回看 sidecar-recovery.ts）。
- **gitnexus · incremental + staleness**: 事务边界：gitnexus 靠 incrementalInProgress dirty-flag + 全量重建做崩溃恢复（因为 Kuzu COPY 非事务）。tk 用 node:sqlite 可把整个 delete+insert 包进单个 BEGIN/COMMIT 事务，崩溃自动回滚——这是 tk 比 gitnexus 更优的点，但需实现时补：确认 node:sqlite 在长事务下的 WAL/锁行为，以及 FTS5 影子表是否在同一事务内一致更新。
- **gitnexus · incremental + staleness**: FTS5 同步删除：deleteNodesForFile 的 SQLite 版要同步删 nodes_fts 影子表的对应 rowid，gitnexus 无 FTS5 对应物（它删的是 EMBEDDING_TABLE）。具体 trigger/手动删的写法需实现时补，取决于 tk 的 FTS5 是 external-content 还是 contentless。
- **gitnexus · incremental + staleness**: tk 若想『只解析变化文件』（而非 gitnexus 的『解析全部、只回写变化』）：gitnexus 明确没做，因为跨文件解析需全量数据。tk 要做这个优化必须自己补一套增量解析 + 跨文件符号缓存，否则 barrel/re-export/shadow 场景的边会失真。这是 tk 自有风险区，需实现时补。
- **gitnexus · incremental + staleness**: queryImporters 依赖 IMPORTS 边已在 DB（pre-rebuild 旧状态）。tk lazy-on-read 若是『首次构建』则无旧 DB，importer-BFS 无可查——需实现时补 cold-start 分支（首次即全量）。
- **gitnexus · incremental + staleness**: computeEffectiveWriteSet 与 importer-BFS 的 JSON 数组 bind（json_each(:seed_files_json)）在超大变更集下的参数大小/性能未验证；gitnexus 在 JS 里做循环。需实现时补：评估是用临时表 INSERT 还是 json_each，及对应索引命中。
- **gitnexus · incremental + staleness**: deleteAllInterprocTaintPaths / TAINT_PATH 只在 pdg 开时存在；tk 当前 schema 是否有等价的『整图属性边』（如全局 dataflow/taint）未知，若无则该步可省，需实现时补对照 tk 边 kind 清单。
- **gitnexus · incremental + staleness**: sibling-clone 漂移检测（checkCwdMatch）依赖一个全局 registry（readRegistry）+ remoteUrl 指纹。tk 是否维护跨 clone 的全局 registry 未定；若 tk 只做 project-local 单仓，可只保留 checkStaleness 的 commitsBehind 横幅，省掉 sibling 逻辑。需实现时补 tk 的 registry 决策。
- **gitnexus · token-economy levers (precompute / grep-augment / impact)**: cohesion / community / cluster 排序信号：augment 用 `c.cohesion`（Community 节点 MEMBER_OF 边）做内部排序，tk schema 暂无 community 检测——需实现时补，先用「callers 数」当排序代理
- **gitnexus · token-economy levers (precompute / grep-augment / impact)**: Process / 执行流（STEP_IN_PROCESS 边、Process 节点、heuristicLabel、stepCount、entryPointId）：augment 的 Flows 行、graph-queries 的 getProcessesForFiles、impact 的 affected_processes 全依赖它；tk 是否要做 process 检测未定——需实现时补；不做则 impact 的 risk 评分里 processCount 恒 0（仍可用 directCount/total 阈值）
- **gitnexus · token-economy levers (precompute / grep-augment / impact)**: epistemic boundary 探测（computeEpistemicBoundary，#1858 interface/indirection 下界标记 exact/lower-bound）：未读其实现，只见调用点（local-backend.ts:4628-4633, 4554-4556）——tk 若要 measurement-honesty 的「这是下界不是精确值」标记，需实现时补读该函数
- **gitnexus · token-economy levers (precompute / grep-augment / impact)**: BM25/FTS 映射符号那步依赖 gitnexus 的 searchFTSFromLbug（src/core/search/bm25-index.js，未读）；tk 用 FTS5 自己实现，bm25() 排序权重与 name-CONTAINS 回退阈值需实现时补
- **gitnexus · token-economy levers (precompute / grep-augment / impact)**: isTestFilePath 的真实判定逻辑未读（local-backend.ts 引用）；node:sqlite 适配里我用了占位 `NOT LIKE '%test%'`，tk 需补真实 test-path 规则（__tests__/*.test.*/*.spec.* 等）
- **gitnexus · token-economy levers (precompute / grep-augment / impact)**: affected_modules 聚合（directModuleNameSet、module hits 那段，5040-5048 之前的部分）只读到尾部，模块切分依据（按目录?按 community?）未确认——impact risk 的 moduleCount 维度需实现时补
- **gitnexus · wiki generation (human narrative)**: graph-queries.ts 本章未读(归他人覆盖),故 getFilesWithExports/getAllFiles/getProcessesForFiles 的 Kuzu 实现细节未确认 —— 上文 node:sqlite 等价是按调用点输出形状反推的,tk 实现时需对照实际 nodes/edges schema 校准列名(is_export 字段是否存在、processes 是否独立表)。需实现时补。
- **gitnexus · wiki generation (human narrative)**: cursor-client.ts 未逐行读,callCursorLLM/resolveCursorConfig 的参数细节未确认;tk 若不支持 cursor 可忽略该 provider。需实现时补。
- **gitnexus · wiki generation (human narrative)**: llm-client.ts 的 OpenAI-compatible HTTP 路径(callLLM 主体、resilientFetch/429 重试)只读了头部 + estimateTokens;tk 走 host-borrow 为主,HTTP 路径是否需要保留(作为无宿主 CLI 时的兜底)是 tk 的设计决策。需实现时补。
- **gitnexus · wiki generation (human narrative)**: html-viewer.ts 只读前 90 行(head + buildHTML 开头);CSS/前端导航/搜索逻辑(剩余 ~250 行)未读。tk 的 self-contained viewer 若要零运行时依赖,必须用本地内联的 marked/mermaid 替换 CDN(Windows 离线场景),这部分需自行实现。需实现时补。
- **gitnexus · wiki generation (human narrative)**: gitnexus 的 process/execution-flow 是预计算产物;tk 是否预计算 process 表、还是 wiki 生成时用递归 CTE 现算,影响性能与 schema。上文给了 CTE 兜底,但 seed 选取(入口符号判定)需结合 tk 实际 node kind 枚举校准。需实现时补。
- **gitnexus · wiki generation (human narrative)**: reviewOnly(--review 工作流:停在 module_tree.json 让人手改再续)在 tk 的 MCP/CLI 形态下如何呈现(agent 改 vs 人改)未定。需实现时补。
- **gitnexus · SWE-bench EVAL harness (serves K)**: resolve-rate 的官方判定依赖 SWE-bench 官方 docker images + `pip install swebench`（harness 调 `python -m swebench.harness.run_evaluation`）。tk 复用这条 Python 路径还是另起 TS 判定器 = 需 tk-K 决策时补；建议直接复用官方 Python harness，tk 只产 preds.json。
- **gitnexus · SWE-bench EVAL harness (serves K)**: tk 没有 mini-swe-agent 等价的 agent loop。gitnexus 直接继承 `DefaultAgent`（litellm 驱动）。tk 的 cross-check 要么直接复用 mini-swe-agent（tk 工具以 /usr/local/bin 脚本接入，零改 agent，最省力），要么用 Claude Code headless 当 agent（与 Track-1 一致）——二选一 = 需实现时补。
- **gitnexus · SWE-bench EVAL harness (serves K)**: gitnexus 的 `backend.callTool(toolName, args)`（LocalBackend，Kuzu 后端）本 subsystem 未读其实现；tk 要把 query/context/impact/cypher 四个工具映到 node:sqlite 的具体 SQL，context/impact 我已给 CTE，但 `query`（execution-flow 搜索，依赖 gitnexus 的 process/flow 概念）tk 是否有等价物未知 = 需实现时补（tk 可能只支持 context/impact 两个工具，去掉 process-flow 的 query）。
- **gitnexus · SWE-bench EVAL harness (serves K)**: `gitnexus-augment` 脚本本体（tool_registry 里只有 fallback `npx gitnexus augment`，eval-server 无 /tool/augment endpoint，走纯 CLI）——augment 的实际富化逻辑在 gitnexus 别处，本 subsystem 没覆盖；tk 的 grep 富化已有自己的实现，但要确认输出里带可被 `[GitNexus]`-style sentinel 检测的 marker，否则 augment_hit 永远为 0 = 需实现时补。
- **gitnexus · SWE-bench EVAL harness (serves K)**: 成本统计（`model_stats.instance_cost` / `api_calls`）来自 mini-swe-agent + litellm 的 cost DB。tk 若用 Claude Code headless 当 agent，cost/token 口径要换成 Claude Code 的 usage（与 MEMORY host-token-visibility 一致：Claude Code headless 是唯一干净 token runner）= 需实现时补对接。
- **gitnexus · SWE-bench EVAL harness (serves K)**: native_augment 是 gitnexus 推荐主臂，但 tk 主 track 是 codegraph agent-eval（非 SWE-bench）。本 subsystem 只给了 SWE-bench cross-check 的协议；cross-check 与主 track 的结果如何交叉验证/取舍（哪个为准、不一致怎么办）= 属 tk-K 决策，需补。
