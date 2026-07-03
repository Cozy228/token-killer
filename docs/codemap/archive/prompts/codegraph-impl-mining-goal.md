# Goal Prompt — project-local intelligence tool 的设计研究 (for ultracode)

> **这是需求驱动、非项目驱动的设计研究规格。** 不从任何现有项目的架构倒推;先定下**我们的工具
> 要满足什么**,再让研究去回答"全行业/所有项目/论文/最佳实践如何解决每个需求",用证据驱动**我们自己的
> 设计决策**。**最终产出是一份"非常详细、可以直接开工"的 ACTION 文档**:决策已拍定,附**可直接抄/借鉴的真实代码块**、
> 确切落地路径、具体数值、有序可测步骤。决策不设上限、尽量细尽量多(§0.2),只要为目标服务,任何方面皆可。
>
> **方法论硬规定:** 需求在前,项目在后。任何"某项目这么做"只能作为某个需求下的**证据**出现,
> 不能反过来成为需求的来源或边界。

---

## 0. 唯一固定的锚点(不可推翻)

1. **目标平台**
   - **主:VS Code Copilot,运行在 Windows。**
   - **次:Claude Code,运行在 macOS。**
2. **目标 —— 一个 project-local intelligence 工具,两件事并列同等重要:**
   - **(A) 帮人理解项目 + 协作**(understand the project and collaborate)。
   - **(B) 帮 agent 高效找代码/文件 = token 优化**(find code/files efficiently)。

**除此之外,一切皆可推翻。** 下面 §1 显式列出"已不再是前提"的东西,避免研究时被旧设计锚住。

### 0.1 强倾向(strong leans — 非锁,但推翻门槛高,需"明显更好"的证据)
- **存储 = `node:sqlite`(+ FTS5)。** `better-sqlite3` 已 **unmaintained**,不作默认;研究只在找到**明显更好**的基底(查询表达力/可移植/体积全面胜出且零 native build)时才推翻。
- **LLM = "Understand-Anything 那种形式":借宿主已有的 LLM**(slash-command / re-prompt,或本地订阅 CLI 如 CodeWiki `caw` 走 claude/codex OAuth)。**绝不自带 API key、不做 model egress、不花 API token。** 凡涉及"理解/叙述/概念"需要 LLM 之处,一律设计成"喂给宿主 agent 去生成/由用户订阅承担",而非工具内置模型。

### 0.2 决策颗粒度要求(贯穿全文)
**决策不设上限、尽量细、尽量多** —— 只要为目标服务,任何方面的决策都要。每个需求(§2)不止给 headline 选择,必须下钻到**可执行颗粒**:具体默认值、阈值数字、schema/DDL、工具签名、配置项、错误处理、边界情况、命名、目录结构。研究宁可多列决策,不可因"看似小"而省略。

---

## 1. 全部置为 OPEN(这些过去定过,现在一律重新评估,不得当约束)

研究必须把以下每一条当作**待决问题**,给出证据后再由我们拍:
- **核心方法不预设。** 不预设"用 code graph"。候选含:结构化代码图 / 排序式 repo-map / AST-chunk 索引 / 嵌入语义检索 / LSP·SCIP 预计算 / 词法+结构混合 / 文档·wiki 生成 / 以上组合。哪种(些)最服务 A+B@目标平台,是 §2-A 要答的。
- **智能来源不预设。** 纯静态解析 / LLM 辅助理解 / 二者混合 —— "不要 tk-owned LLM""无 API token"不再是前提("intelligence" 一词本身把 LLM 派生理解重新摆上桌)。
- **存储/索引基底不预设。** node:sqlite / 图数据库(Kuzu/Falkor/Neo4j) / 纯文件 / 内存;in-repo vs out-of-tree;均 open(ADR-0015 作废为待评估)。
- **agent 投递面不预设。** MCP 工具数量/命名/形态、是否 hand-rolled、是否 4 个、cheap-outline ladder —— 全 open;但要正视"VS Code Copilot 内建 read/search 结果不可被改写"这一硬事实。
- **human 面不预设、且不再是 deferred。** A 与 B 同等重要 → human 面(理解 + **协作**)是一等公民,不是 v2 附属。形态(图浏览器 / wiki / HTML / VS Code webview/Simple Browser/扩展)全 open。
- **增量/新鲜度策略 open**(daemon vs lazy vs git-hook vs CI;per-commit vs scheduled)。
- **语言覆盖、范围(导航-only vs 含编辑)、分发形态、Node 版本门、是否 PageRank** —— 全 open。
- **本轮 grilling 的 Q1–Q5 与 §3–§7 设计、ADR 0013–0016** —— 降级为"先前倾向",仅作研究的对照输入,**不是结论**。

**保留为证据输入(非决策):**
- 实测事实:Copilot CLI / VS Code Copilot 都不暴露 token,只有 Claude Code headless 干净给 uncached(见 `host-token-visibility-measurement` 记忆)。这是 B 的测量约束,不是设计约束。
- 20 个研究克隆仍在 `/tmp/tk-research/`(可直接读源码)。
- tk 既有资产:命令输出压缩、HTML 报告基底(`src/report/html.ts`)、Windows 可移植性 + 冷启动/AV 历史(见相关记忆)。

---

## 2. 设计需求分解(需求在前;每条 = 我们必须替自己回答的问题)

> 每条:**我们的问题(approach-agnostic)** · **研究必须答出什么** · **取舍轴** · **目标平台视角(VS Code Copilot/Windows 主)**。
> "项目怎么做"只作为证据填进来,license 不限,闭源项目用 web 资料。

### A. 核心方法:这个"intelligence"到底是什么形态?
- **我们的问题:** 用什么底层表示同时最好地服务 A(人理解)与 B(agent 找代码)?单一表示还是分层组合?
- **研究答出:** 各候选(结构图/repo-map/AST-chunk/嵌入/LSP-SCIP/词法+结构混合/wiki 生成)在 ① agent 检索 token 效率 ② 人类可理解性 ③ 构建/维护成本 ④ 准确性/可验证性 上的实测表现与已发表数字。哪些表示能"一图两吃"(同一底座喂 agent 又喂人)。
- **取舍轴:** 精度 vs 成本;静态确定性 vs 语义召回;单表示简洁 vs 组合覆盖。
- **目标视角:** VS Code Copilot 上 agent 只能通过新增 MCP 工具被"可选地"使用 → 表示必须能产出**比内建 grep/read 明显更省**的回答才有人用。

### B. 智能来源:静态 / LLM / 混合?
- **我们的问题:** 理解从哪来?纯解析(确定、零 token、无幻觉)能走多远?哪些"理解"非 LLM 不可(架构叙述、概念、tours)?若用 LLM,谁的 token(API key vs 用户订阅 CLI)?
- **研究答出:** 各项目智能来源谱系(codegraph/GitNexus 纯结构;RepoDoc 含 ConceptNode+LLM;DeepWiki/deepwiki-open LLM 生成;CodeWiki `caw` 走本地 claude/codex 订阅);LLM 生成的幻觉/成本/新鲜度代价(deepwiki-open 幻觉 mermaid 反面);"derive-not-generate + validate + 确定性 fallback"(RepoDoc)路线。
- **取舍轴:** 确定性/可验证 vs 表达力;零 token vs 富叙述;谁付费。
- **目标视角 + 强倾向(§0.1):** **LLM 必须是 "Understand-Anything 那种形式"** —— 借宿主已有 LLM(slash-command/re-prompt)或本地订阅 CLI(CodeWiki `caw`),**不自带 API key**。研究要挖透这两条的**具体机制**:Understand-Anything 怎么用 slash-command 把生成委托回宿主模型(`/tmp/tk-research/understand-anything` 源码);CodeWiki `caw` 怎么调本地 claude/codex CLI(OAuth、prompt 构造、输出解析);以及"哪些理解非 LLM 不可 vs 哪些纯静态即可"的边界,让 LLM 用量最小化。

### C. 索引基底与存储
- **我们的问题:** 索引存哪、什么格式、Windows+Mac 双跑、避免 native build、in-repo 还是 out-of-tree、单文件还是图数据库?
- **研究答出:** node:sqlite+FTS5(codegraph,无 native build)vs 嵌入式 Cypher 图库(GitNexus Kuzu/Ladybug,native+WASM 双跑)vs 可插拔图库(CodeGraphContext)vs NetworkX-JSON(RepoDoc)vs FAISS(deepwiki-open)的查询能力/可移植性/体积/LLM 友好度;schema 设计(通用 `nodes(kind)`+`edges(kind)` 单表 vs per-type 表;异构 code+doc+concept;DocNode.version 做 staleness)。
- **取舍轴:** 零依赖/可移植 vs 查询表达力;单表通用 vs 类型化;为人类/协作/wiki 预留 vs YAGNI。
- **目标视角 + 强倾向(§0.1):** **默认 `node:sqlite`+FTS5**(`better-sqlite3` unmaintained,排除);研究只在"明显更好"时推翻,且必须量化(查询能力/体积/可移植/native-build)。**Windows 主** → native build、路径、文件锁(EBUSY 历史)、Node 版本门是硬约束。产出要给**真实可抄的 DDL**(完整 `CREATE TABLE`/FTS5 虚表/trigger/索引/migration),不是描述。

### D. 语言覆盖
- **我们的问题:** 先支持哪些语言?抽取器路线(tree-sitter WASM vs 原生 vs LSP)?
- **研究答出:** tree-sitter-WASM(`web-tree-sitter`+`tree-sitter-wasms`,无 native build,codegraph/Repomix/GitNexus)的语言广度与 per-language 抽取器/capture-query 写法;worker 池与 parser 生命周期(reset/recycle/timeout/OOM)实测阈值;LSP/SCIP 路线的精度增益 vs 安装摩擦(Serena/SCIP)。
- **取舍轴:** 广度/零安装 vs 精度;WASM 无 native build vs LSP 编译级精度。
- **目标视角:** 目标用户项目语言分布;Windows 上 LSP/native 安装摩擦。

### E. 新鲜度 / 增量
- **我们的问题:** 索引怎么保持最新?何时触发、多精确、放弃 daemon 的代价?
- **研究答出:** AST-diff ChangeType 分类 + 仅重算变更组件(RepoDoc 最 sound);referencer-set diff + fake-file trick(RepoAgent 最精准失效);file-watcher + daemon + staleness banner(codegraph);指纹+hooks(Understand-Anything);scheduled regen 滞后(DeepWiki)vs per-commit(Google Code Wiki/RepoDoc/RepoAgent)。lazy-only 放弃了什么。
- **取舍轴:** 即时/精准 vs 复杂度/常驻进程;daemon vs lazy vs git-hook vs CI。
- **目标视角:** VS Code 会话内交互式编辑频繁 → staleness 必须对人和 agent 都可见。

### F. Agent 投递面(服务 B)
- **我们的问题:** agent 在 VS Code Copilot/Windows(主)与 Claude Code/Mac(次)上怎么够到这个工具?工具面长什么样、几个、怎么 steer agent 优先用它而非内建 grep?
- **研究答出:** hand-rolled JSON-RPC-stdio MCP(codegraph,无 SDK)实现;**为什么少工具 steer 更好(codegraph measured 4 tools)**;cheap-outline-first ladder(DeepWiki 3-tool `structure→contents→ask`;GitNexus 17-tool 上限);无 index 不注册 tool;server-instructions;`--strict-mcp-config` 空配置做 baseline 臂。正视:VS Code Copilot **内建 read/search 不可改写**,只能新增可选工具。企业 MCP 启用前提。
- **取舍轴:** 工具少/好 steer vs 能力全;additive 概率性 vs 确定拦截。
- **目标视角:** **企业 VS Code Copilot 是否允许 MCP** 是 B 在主目标上能否成立的闸;Windows 下的 MCP 配置/路径。

### G. 输出 token 经济(服务 B)
- **我们的问题:** 一次回答怎么既够用又最省 token(尤其 uncached)?
- **研究答出:** signature-collapse / 容器塌缩 vs leaf verbatim / 自适应 char 预算分层 / polymorphic siblings skeletonize(codegraph buildContext,~28% cut);"precompute over compress"(GitNexus,1 call vs 10-grep 链);retention-first 升级阶梯;low-confidence hand-back marker。对照 tk 既有命令输出压缩(surface-10)。
- **取舍轴:** 召回充分 vs 体积;一次性结构化 vs 多轮 grep。
- **目标视角:** B 的成败指标 = uncached_input_tokens 下降(见 K)。

### H. Human 面:理解(服务 A 上半)
- **我们的问题:** 人怎么看懂这个项目?在 VS Code(主)里以什么形态呈现?
- **研究答出:** 1后端N前端(GitNexus `local-backend`+serve+`html-viewer`);两级 lazy-expand 导航 + aggregate edges + guided tours + persona(Understand-Anything `GraphView.tsx` ~1580 LOC,大图可读性天花板);自包含 inline-JSON-into-template HTML(CodeWiki `viewer_template.html`);deep-link prose↔code(Google Code Wiki);mermaid derive+validate+fallback(RepoDoc)vs 幻觉(deepwiki-open)。VS Code 集成路径:Simple Browser(localhost)vs Webview 扩展 —— Windows 上的差异。
- **取舍轴:** 自建 UX(产品价值)vs 套渲染引擎;served 实时 vs 自包含可分享。
- **目标视角:** 主目标在 VS Code 内 → 优先 IDE 内可达(Simple Browser / webview),无需 CDN。

### I. 协作(服务 A 下半)—— 新的一等需求,刻意单列
- **我们的问题:** "collaborate" 具体指什么、怎么服务?多人共享理解?新人 onboarding?在代码上钉注释/笔记?评审/PR 上下文?人写-agent读 / agent写-人编辑的回环?谁是协作主体(同一团队多人 / 人与 agent)?
- **研究答出:** 可编辑回环(Davia file-backed Tiptap,agent 写人编辑,debounced 回写,无 DB);repo-checked 控制文件(DeepWiki `.devin/wiki.json`:pages 权威 + page_notes 引导 + 硬 caps)steer 共享理解;tours-as-onboarding(Understand-Anything);provenance/citation 做可信协作(OpenDeepWiki `SourceFiles`、Google Code Wiki deep-link);人工 block 不被覆盖、staleness 可见。**研究还需向外看**:代码理解工具里"协作"的成熟形态(共享标注、知识沉淀、评审上下文),不限本批项目。
- **取舍轴:** 只读理解 vs 可编辑沉淀;个人 vs 团队共享;人-agent 协作 vs 人-人协作。
- **目标视角:** VS Code/团队工作流;企业内共享与权限。**(这是最欠定义的需求,研究要先把"协作"拆成可决策的子形态。)**

### J. 正确性 / 信任
- **我们的问题:** 怎么保证 agent 和人拿到的不是"自信的错答案"?
- **研究答出:** 每个 node/answer 解析到真实 `file:line`;provenance 标签(`heuristic`+`synthesizedBy`,codegraph);置信度分级 + 低置信 hand-back(= tk 既有 quality-gate);staleness 显式可见;derive+validate+fallback 反幻觉(RepoDoc vs deepwiki-open)。
- **取舍轴:** 召回 vs 不误导;自动扩展上下文 vs 精确最小。
- **目标视角:** 人和 agent 必须指向同一份证据(同一底座)。

### K. 证明:怎么诚实地证明 A 和 B 都成立?
- **我们的问题:** B 的 token 优化怎么诚实测?A 的"帮人理解/协作"怎么衡量(更难)?
- **研究答出:** trajectory-level A/B(W2 loop-avoidance 只能跨整条轨迹测);primary=uncached delta 非 total(SWE-ContextBench cache-read>97% 陷阱);medians+spread;localization F1(FastContext);FAIL_TO_PASS+PASS_TO_PASS(SWE-ContextBench);omission_bug_rate via fallback-replay;per-operation token_usage 日志(RepoDoc)做 full-vs-incremental 分母;Serena **拒绝 token benchmark、改报 call-count/payload/prereq** 的姿态。Job A 的衡量(comprehension/onboarding 时间、找到正确文件率)需另找方法,可能无现成标准。
- **取舍轴:** measured 严谨 vs 工程量;offline A/B vs online opportunity 事实。
- **目标视角:** 主目标宿主 token 不可测 → 在 Claude Code 上做 measured 证明 + "loop-avoidance 宿主无关"迁移假设 + VS Code 侧自埋点 opportunity 事实。

### L. 分发 / 运行(Windows 主)
- **我们的问题:** 怎么装、怎么跑,在 Windows 上零摩擦?
- **研究答出:** self-contained bundle(vendored Node→node:sqlite,无 native build,多平台 installer,codegraph)vs npm + optionalDependencies;node:sqlite 的 Node 版本门 + 无 warning 子进程 re-entry;体积(`pnpm pack --dry-run`)。叠加 tk 既有 Windows 包袱:AV 冷启动、路径/PATHEXT、EBUSY 文件锁、GBK 编码。
- **取舍轴:** 自包含体积 vs 安装简单;新 Node 特性 vs 安装基数。
- **目标视角:** **Windows 是主战场** → 这条权重最高。

### M. 横切:最佳实践 + 反面教材
- **我们的问题:** 哪些跨项目通用技巧值得采纳、哪些坑必须避开?
- **研究答出:** §9 cross-cutting technique toolbox + 论文结论;反面清单(deepwiki-open 幻觉 mermaid + 2280 行巨组件;OpenDeepWiki `LIKE '%q%'`+12k-token/query LLM summary+明文 creds+默认 admin;CodeWiki/RepoDoc/RepoAgent 脆弱 LLM-输出解析 + `eval()`;CodeWiki path-substring 增量;Davia 130k raw dump 无图)。

---

## 3. 证据基(license 不限;需求在前,这里只是"去哪取证")

- **源码克隆 `/tmp/tk-research/`(19,直接读):** codegraph · code-graph-mcp · codebase-memory-mcp · gitnexus · codewiki · davia · deepwiki-open · gitdiagram · graphify · opendeepwiki · ops-codegraph-tool · repoagent · repodoc · repograph · repomaster · sourcetrail · tree-sitter-analyzer · understand-anything。
- **研究报告(索引 + 数字):** `docs/codemap/` 下 4 份(code-graph-research / codegraph-wiki-landscape / low-token-agent-research-compendium(§9 toolbox、§11 测量、§12 风险) / token-optimization-landscape(企业 VS Code Copilot 可行性))。
- **论文:** SWE-ContextBench、FastContext、Codebase-Memory(arXiv 2603.27277)、token 经济/pruning/KG 检索(报告 §8/§9 已索引)。
- **web(闭源/补缺):** DeepWiki、Google Code Wiki、Sourcegraph Cody、Serena/SCIP,以及"协作"形态可超出本批项目去找。
- **tk 自身约束:** Windows 可移植性/冷启动记忆、`src/report/html.ts`、命令压缩既有面、measured-≠-estimate 账本模型。

---

## 4. 产出契约 —— 两层:Research 档案 → 最终 ACTION 文档

**最终交付物是一份"非常详细、可以直接开工"的 action 文档**:每个决策已拍定,附**可直接抄/借鉴的真实代码**、确切落地路径、具体数值、有序步骤。Research 档案只是它的证据底料。

### 4.1 Research 阶段每个需求返回(NEED_DOSSIER,证据底料)
```
## 需求 <X> — <name>
### 子决策清单(尽量细、尽量多 — §0.2)
<把该需求拆成 N 个可执行子决策:每个含默认值/阈值/schema/签名/错误处理/边界/命名>
### 选项空间(approach-agnostic) + 各方案实证(license 不限)
- <option>: 谁这么做 + `clone路径:行号/函数` 或 web 引用 + 实测数字/代价 + **关键源码片段(verbatim,可抄)**
### 取舍矩阵
<选项 × {token效率 / 人类可理解 / 构建维护成本 / 准确可验证 / Windows可移植 / VS Code集成 / 协作支持}>
### 决策(committed,非"推荐")
<在"VS Code Copilot/Windows 主 + Claude Code/Mac 次 + A&B 并列 + §0.1 强倾向"下拍定哪个,why;标服务 A/B/两者>
### 仍 open / 需用户拍
```

### 4.2 Synthesize 阶段产出最终 ACTION 文档(真正的交付物)
把所有已拍决策**翻译成可直接执行的实现文档**,每个决策项包含:
- **决策**:一句话定论(committed)。
- **要动的文件**:tk 仓库内确切路径(新建/改),目录结构。
- **可抄代码**:`fenced code block` 给出**可直接粘贴**的代码 —— 来自 clone 的**逐字摘抄**(标注 `源: <clone路径:行号>`,license 不限;不可直接复制的标"已改写")或**改写适配 tk** 的版本。含:完整 SQL DDL、MCP tool JSON schema、tree-sitter capture query、解析/解析器代码、配置默认值。
- **具体数值**:所有阈值/上限/预算/超时给确定数字(不写"适当")。
- **有序步骤**:依赖感知、每步独立可发布 + 可测;给步骤序号。
- **测试**:每步的验证方式(单测 fixture / A/B harness 字段 / 断言)。
- **证据回指**:链回 4.1 档案的来源锚点。

**硬约束(两层都适用):**
- **需求在前:** 证据挂在需求下;不得"先讲项目再配需求"。
- **代码可抄是硬指标:** action 文档里凡能给代码处必须给真实代码块(抄或改写),不能只描述。给不出就标"需实现时补",并说明缺口。
- **引用真实来源:** clone 给 `路径:行号`,闭源给 web 引用;读不出标"未验证",不编。
- **license 不过滤:** 记录所有做法与代码;不可直接复制的只注"实现时改写",仍纳入。
- **强倾向落实(§0.1):** 存储默认 node:sqlite、LLM 走宿主形式 —— 除非档案给出"明显更好"的量化反证。
- **A 与 B 并列:** 每个决策标服务 A/B/两者;human/协作不得当附属。
- **可推翻旧设计:** 与 Q1–Q5 / ADR 0013–0016 / §3–§7 冲突的更优证据,**正面推翻 + 理由**,不回避。

---

## 5. 建议的 ultracode 编排

```
phase('Research')   // 13 个需求 A–M 扇出,每需求一个 agent,横扫所有项目+论文+web 找证据
  pipeline(NEEDS,
    n => agent(researchPrompt(n), {label:`need:${n.id}`, schema: NEED_DOSSIER}),
    dossier => parallel(dossier.evidence.map(e => () =>      // 每条证据派 skeptic 回源核对
      agent(`核对此证据是否真实存在: ${e.ref}`, {label:`verify:${e.ref}`, schema: VERDICT})))
  )
phase('Cross-cut')  // 依赖求解:A(核心方法)定了才好定 C/F/G;先出 A/B/I 的强推荐,再让其余对齐
  agent(resolveDependencies(allDossiers), {schema: DEP_MAP})
phase('Synthesize') // 把已拍决策翻成"可直接开工的 ACTION 文档"(§4.2):可抄代码+确切路径+有序步骤+测试
  agent(synthesizeActionDoc(allDossiers, depMap), {schema: ACTION_DOC})
```
- **扇出粒度:** 13 需求(A–M);重需求(A/C/F/H/I)可二级按选项/项目再扇。
- **依赖:** A(核心方法)与 B(智能来源)是上游,先收敛;C/D/E/F/G 依赖 A;H/I 依赖 A+B;K 依赖全部。Cross-cut 阶段显式解依赖。
- **协作(I)单独加权:** 最欠定义 → 研究先把"collaborate"拆成可决策子形态(人-人/人-agent、只读/可编辑、注释/控制文件/评审上下文),再给选项。
- **产出:** `docs/codemap/codemap-action-plan-<date>.md` —— **可直接开工的 action 文档**(§4.2:可抄代码 + 确切路径 + 有序步骤 + 测试);附"被推翻的旧决定"清单 + "仍待用户拍"清单。
- **可抄代码是验收线:** synthesize agent 必须从 Research 档案的 verbatim 片段组装真实代码块到 action 文档,不能退化成纯描述;给不出代码的项要显式标缺口。
- **预算:** 读源码 + web,input-heavy;按需求×项目给足,token 成本非约束。决策宁多勿漏(§0.2)。

---

## 6. 调用方式

主对话里:`ultracode 跑 docs/codemap/codegraph-impl-mining-goal.md,按 §5 编排`;或让我据 §5 生成 Workflow 脚本运行(需显式 ultracode opt-in,我不自启)。
