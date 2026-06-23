# Part II — Capability Specifications & Implementation Evidence

> **以下为 source-cited 推导与证据**（216 条 `源:` 引用、可抄代码、官方文档清单）。已按 Terminology Law 全程重组（版本语言已清、capability-state 化、codemap/codeguide 命名统一），绑定口径以上文 **Product Contract** 为准。

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
| **Serena / SCIP** (闭源/spec,web) | D/K | SCIP spec、Serena | LSP/SCIP 编译级精度(D:Required capability,其运行时依赖 Optional at runtime);拒 token-benchmark 改报 call-count 的姿态(K) | 强制装 indexer(改为运行时依赖 Optional at runtime) |
| **论文** SWE-ContextBench / FastContext / Codebase-Memory | K | arXiv | uncached-delta 主指标、localization F1、cache>97% 陷阱 | 把含缓存 total 当指标 |

# 官方文档复核清单(Official docs to re-check)

> 全文大量实现判断依赖外部官方行为;动手前**逐条复核当前官方文档**(链接已于 2026-06-20 核实)。

### VS Code 扩展 / Agent 面(需求 F —— 主交付路径的命门)
- **Language Model Tool API** — https://code.visualstudio.com/api/extension-guides/ai/tools — 复核 `vscode.lm.registerTool` + package.json `languageModelTools` 贡献点 + `lm.tools` 列表 + `prepareInvocation` 确认对话。**这是 tk 在 VS Code 上的主要 agent 面。**
- **Language Model API** — https://code.visualstudio.com/api/extension-guides/ai/language-model — 借宿主模型(需求 B)的接口。
- **MCP developer guide** — https://code.visualstudio.com/api/extension-guides/ai/mcp — 扩展内编程式注册 MCP(tk 的次交付面)。

### VS Code MCP 配置 / 企业策略(需求 F —— 决定 D19 policy-入口阶梯，非"扩展为主 vs MCP 为主"单闸)
- **MCP configuration reference** — https://code.visualstudio.com/docs/agents/reference/mcp-configuration — `mcp.json` 形状(`.vscode/mcp.json` / 用户态、`servers`/`inputs`/`sandbox`)。
- **Add / manage MCP servers** — https://code.visualstudio.com/docs/agent-customization/mcp-servers
- **Manage AI settings in enterprise environments** — https://code.visualstudio.com/docs/enterprise/ai-settings — **复核三个并列治理键（D19 修正：扩展非天然绕过 MCP 治理）**：① `chat.mcp.access`（**默认 `all` 非锁闭**，企业可设 `none`）+ `McpGalleryServiceUrl`（私有 registry）；② `chat.extensionTools.enabled`（扩展 LM Tool 的独立中央开关）；③ `extensions.allowed`（扩展安装 allowlist）。这三键共同决定 D19 的 policy-入口阶梯（扩展允/仅MCP/仅扩展/皆禁→CLI+Human），**非** "扩展为主是否成立" 的单一闸。**待官方逐字确认默认值**（per user 给出，本清单兜底）。
- **Centrally manage VS Code settings with policies** — https://code.visualstudio.com/docs/enterprise/policies

### 运行时 / 存储(需求 C / L)
- **Node `node:sqlite`** — https://nodejs.org/api/sqlite.html (v22.x: https://nodejs.org/docs/latest-v22.x/api/sqlite.html) — 复核:已**不需 `--experimental-sqlite` flag、仍 experimental(仅 warning)**;`DatabaseSync` API;**FTS5 不在 node 文档里(是 SQLite 编译选项)** —— tk 已于 2026-06-20 实测官方 Node 22.22.2 内置 SQLite 3.51.2 带 FTS5,但**每个 Node 版本/bundle 都要重测**(declare-only 的 C7 LIKE 兜底正为此)。

### 分发 / license(需求 L / M25)
- **npm provenance** — https://docs.npmjs.com/generating-provenance-statements — `npm publish --provenance`(Sigstore),declare-only 下的"可信"机制(决策 #9)。
- **SCIP spec** — https://github.com/sourcegraph/scip — SCIP opt-in 消费 `index.scip` 的 protobuf schema(需求 D / 附录 A1)。
- **PolyForm Noncommercial** — https://polyformproject.org/licenses/noncommercial/1.0.0/ — gitnexus `[非分发安全]` 边界依据(M25)。

# 各需求 ACTION 明细(A–M)

