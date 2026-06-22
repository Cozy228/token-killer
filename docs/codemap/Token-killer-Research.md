


* * *

**You:**

pagerank和scip如何在查找代码上有实质性的作用？

* * *

**ChatGPT:**

我会把两者拆开：**PageRank 解决“先看谁”**，**SCIP 解决“这个符号到底指向谁”**，再说明它们如何组合成真正可用的代码查找链路。

**PageRank 和 SCIP 都不是“搜索代码”的替代品。**

* **SCIP 负责把代码关系解析准确**：这个调用指向哪个定义、有哪些引用、实现了哪个接口。
* **PageRank 负责从这些关系里排序**：在几十个候选文件和符号中，哪些最值得优先给 Agent 看。

二者组合后，才会对代码查找产生实质作用：

> 搜索产生候选 → SCIP 消除歧义并建立关系 → PageRank 按任务相关性排序 → 返回少量精确符号和范围

---

## 1. PageRank 实际解决什么问题

假设用户问：

> 登录成功后，session 是在哪里创建并写入数据库的？

普通搜索可能得到：

```
87 files matched
createSession: 23 matches
session: 416 matches
login: 138 matches
```

搜索引擎只能说明“文本相关”，不知道哪些是：

* 真正的入口
* 核心实现
* 公共类型定义
* 测试代码
* 示例代码
* 被大量依赖的底层模块
* 已废弃实现

PageRank 的作用是利用代码关系图，为候选项计算**结构重要性**。

### 基本代码图

可以把代码库建模为：

```
login.route.ts
    └── calls AuthService.login
              └── calls SessionService.create
                        ├── calls SessionRepository.insert
                        └── uses Session type
```

图中可以有不同粒度的节点：

```
File
Module
Class
Function
Method
Type
API route
Database table
```

边可以是：

```
imports
defines
references
calls
implements
extends
reads
writes
tests
```

一个符号被多个重要模块引用，它的排名就会上升。

Aider 的 Repository Map 使用源码文件之间的依赖图进行图排序，并在有限 token budget 中选择重要文件和符号；其文档也明确说明，它优先保留被其他代码频繁引用的重要标识符。

---

## 2. 普通 PageRank 不够，应该用 Personalized PageRank

标准 PageRank 计算的是**全局重要性**。

这会产生一个明显问题：

```
logger.ts
config.ts
utils.ts
types.ts
```

这些文件可能被全项目引用，因此排名极高，但对“session 创建流程”并不一定最有用。

所以代码查找更适合使用 **Personalized PageRank，个性化 PageRank**：

> 不从所有节点平均出发，而是从当前查询命中的节点、当前编辑文件和错误栈涉及的节点出发传播权重。

### 查询种子

例如搜索：

```
"where is session created after login"
```

先通过关键词、语义或符号搜索得到种子：

```
loginRoute
AuthService.login
createSession
SessionRepository
```

然后从这些节点运行 Personalized PageRank：

```
seed weight:
createSession             1.0
AuthService.login         0.8
login.route.ts            0.7
currently edited file     0.6
recent stack trace file   0.8
```

关系越近、路径越强，得分越高。

结果可能变成：

| 排名 | 符号 | 原因 |
| --- | --- | --- |
| 1 | `SessionService.create` | 精确命中，且被登录流程调用 |
| 2 | `SessionRepository.insert` | create 的直接下游 |
| 3 | `AuthService.login` | 上游调用者 |
| 4 | `postLogin` | API 入口 |
| 5 | `Session` | 相关数据类型 |
| 27 | `Logger.info` | 全局重要，但任务相关性低 |

这才是 PageRank 在代码搜索上的真正价值：

> 它不是找出文本匹配，而是把一个初始命中扩展成一个按结构相关性排序的上下文子图。

---

## 3. PageRank 可以在哪些场景产生明显收益

### 3.1 Repo Map 裁剪

完整 Repository Map 可能有数万 token。

PageRank 可以选择：

```
高排名文件
  └── 高排名符号
       └── 签名、类型和定义位置
```

最后只返回 1,000–3,000 token。

这正是 Aider Repo Map 的核心用途：代码图不是直接全部交给模型，而是在 token budget 内选择最重要部分。

### 3.2 搜索结果重新排序

关键词或 embedding 可能返回 50 个候选。

可以组合：

```
finalScore =
  0.35 * lexicalScore
+ 0.25 * semanticScore
+ 0.20 * personalizedPageRank
+ 0.10 * pathPrior
+ 0.10 * sessionProximity
```

其中：

* `lexicalScore`：精确名称或字符串匹配
* `semanticScore`：概念相似度
* `personalizedPageRank`：代码关系上的重要性
* `pathPrior`：如 `src/` 高于 `examples/`
* `sessionProximity`：与当前编辑文件或已读符号接近

### 3.3 上下游扩展

已经找到 `SessionService.create` 后，不应该再全库 grep。

图查询可以直接扩展：

```
callers(createSession)
callees(createSession)
implementations(SessionRepository)
references(Session)
testsOf(createSession)
```

然后 PageRank 决定只返回最重要的几个邻居。

### 3.4 影响面分析

修改一个符号时，可以从该符号出发运行反向 Personalized PageRank：

```
changed symbol
  ← direct callers
  ← API routes
  ← tests
  ← consumers
```

优先返回最可能受影响的调用链，而不是输出几百个引用。

---

## 4. SCIP 实际提供什么

**SCIP，Code Intelligence Protocol，是一种跨语言的代码智能索引格式。**

它本身不是搜索 UI，也不是向量数据库。它保存的是编译器或语言分析器解析出的结构化事实，例如：

```
这个源码位置出现了哪个 symbol
它是定义还是引用
它是 import、read、write 还是 test occurrence
这个 symbol 的签名和文档是什么
它实现或关联了哪个 symbol
它所在的完整 AST 范围是什么
```

SCIP 的核心数据包括：

```
Index
 └── Document
      ├── Occurrence[]
      └── SymbolInformation[]
```

`Occurrence` 将源码范围关联到一个唯一 symbol；`SymbolInformation` 可以包含签名、文档、类型和 symbol relationships。

SCIP 还区分 occurrence 的角色，包括：

* definition
* import
* read access
* write access
* generated code
* test code

并支持 implementation、reference、type definition 等关系。

---

## 5. SCIP 相比 Tree-sitter 或 grep 的实质优势

考虑下面的 TypeScript：

```TypeScript
import { create } from "./session";

function create() {
  // unrelated local function
}

create(user);
```

文本搜索只能看到多个 `create`。

Tree-sitter 可以识别：

```
这是一个 import
这是一个函数声明
这是一个调用表达式
```

但单纯 Tree-sitter 通常不能可靠判断：

```
create(user)
```

到底调用：

```
./session.create
```

还是当前文件的：

```
local create()
```

SCIP 使用编译器或语言服务器级别的符号解析后，可以给出唯一标识：

```
npm my-app 1.0 src/session/create().
```

于是搜索系统可以准确回答：

```
definition:
src/session.ts:42-78

references:
src/routes/login.ts:31
src/auth/refresh.ts:67
tests/session.test.ts:18
```

这会直接减少：

```
grep create
read 5 files
发现找错
grep import
read 3 files
```

变成：

```
resolve symbol
→ get definition
→ get references
→ read exact symbol range
```

---

## 6. SCIP 能支持哪些具体查找操作

### 精确符号定位

```
findSymbol("SessionService.create")
```

返回：

```
src/auth/session-service.ts
lines 42–91
kind: method
signature: create(user: User): Promise<Session>
```

### Go to definition

从调用点：

```TypeScript
sessionService.create(user)
```

直接定位定义，不再依赖文本匹配。

### Find references

返回这个**具体符号**的引用，而不是所有同名字符串。

### Find implementations

例如：

```TypeScript
interface SessionRepository
```

可以找到：

```
PostgresSessionRepository
MemorySessionRepository
MockSessionRepository
```

SCIP 的 relationship 明确支持 implementation 关系。

### 类型定义

例如变量：

```TypeScript
const session: Session
```

可以精确跳到 `Session` 类型定义。

### 派生调用图

SCIP 不一定直接存储完整 call graph，但它提供：

* 引用 occurrence
* occurrence 所属的 enclosing range
* symbol 定义
* symbol relationship

因此可以推导：

```
某函数定义范围内引用了哪些函数符号
```

从而生成近似或高精度调用边：

```
Function A --calls--> Function B
```

SCIP 对 `enclosing_range` 的说明也明确列出 call hierarchy 和 symbol outline 等用途。

---

## 7. SCIP 和 PageRank 应该如何组合

最合理的架构不是：

```
SCIP search
```

或：

```
PageRank search
```

而是：

```
候选生成
  ↓
SCIP 精确解析
  ↓
构建 symbol graph
  ↓
Personalized PageRank 排序
  ↓
精确范围读取
```

### 具体流程

```
用户查询：
“登录后 session 在哪里创建并保存？”
```

#### 第一步：候选生成

通过以下方式找到初始候选：

```
BM25/literal:
login, session, create, save

semantic search:
"persist authenticated user session"

symbol search:
SessionService
createSession
SessionRepository
```

#### 第二步：SCIP 消歧义

SCIP 确定：

```
postLogin
  calls AuthService.login

AuthService.login
  calls SessionService.create

SessionService.create
  calls SessionRepository.insert
```

#### 第三步：构图

```
postLogin
    ↓
AuthService.login
    ↓
SessionService.create
    ↓
SessionRepository.insert
```

同时加入：

```
implements
imports
types
tests
```

#### 第四步：Personalized PageRank

以查询命中节点作为种子，计算最相关的上下游节点。

#### 第五步：返回最小证据

```YAML
answer:
  likely_flow:
    - src/routes/login.ts#postLogin
    - src/auth/auth-service.ts#login
    - src/session/session-service.ts#create
    - src/session/postgres-session-repository.ts#insert

next_read:
  path: src/session/session-service.ts
  symbol: SessionService.create
  lines: 42-91
  exact: true
```

Agent 不需要看到完整 grep 输出，也不需要读取全部四个文件。

---

## 8. 对 tg / CodeGraph 最实际的设计

SCIP 最适合作为一个**可选的高精度关系数据源**，PageRank 作为**统一排序层**。

```
Tree-sitter index
    ├── definitions
    ├── imports
    ├── syntax ranges
    └── heuristic references

SCIP index
    ├── resolved definitions
    ├── exact references
    ├── implementations
    ├── type definitions
    └── symbol roles

Git/session signals
    ├── currently edited files
    ├── changed files
    ├── recent reads
    └── failing stack traces

Search signals
    ├── BM25
    ├── exact symbol match
    └── semantic similarity

             ↓

Unified Symbol Graph
             ↓

Personalized PageRank / graph reranker
             ↓

Top-K symbols + exact next-read ranges
```

### 建议的节点粒度

不要只做 file-level PageRank。

优先做：

```
symbol-level graph
```

然后聚合到文件：

```TypeScript
fileScore =
  max(symbolScores) * 0.6 +
  sum(top3SymbolScores) * 0.4;
```

只做文件级排序会出现：

* 一个超大文件因引用多而排名过高
* 无法指出该读哪个函数
* 最终仍然导致整文件读取

### 建议的边权重

不同关系不能等权：

```
direct call             1.0
implementation          0.9
type reference          0.7
import                   0.5
same file               0.4
test target             0.8
plain textual reference 0.2
```

还应该区分方向：

```
查实现：
caller → callee 权重更高

查影响面：
callee → caller 权重更高

查架构：
module dependency 双向传播

查测试：
production symbol → test symbol 权重更高
```

---

## 9. 两者的限制

### PageRank 的限制

**它只会排序图中已有的关系。**

如果图错了或缺边，PageRank 只会把错误放大。

另外，全局 PageRank 很容易把这些节点推到最前面：

```
logger
config
common types
generic utilities
```

所以必须：

* 使用查询种子的 Personalized PageRank
* 加入文本和语义相关性
* 对 generated、vendor、test、example 设置场景化权重
* 限制图传播深度
* 显示排名原因

### SCIP 的限制

SCIP 的质量依赖 indexer：

* 编译器级 indexer 通常精确
* 仅语法分析的 indexer 可能是启发式结果
* 动态语言中的 runtime dispatch 可能无法完全解析
* 反射、依赖注入、字符串路由、框架魔法可能缺边
* 前端模板、SQL、配置和后端代码之间的跨语言关系通常需要额外索引

SCIP 协议本身也明确允许 indexer 在“编译器精确分析”和“语法启发式分析”之间取不同精度。

---

## 结论

对代码查找而言：

```
SCIP = 正确性层
PageRank = 选择与排序层
```

SCIP 回答：

> 这个符号是谁、定义在哪、谁引用它、实现关系是什么。

PageRank 回答：

> 在这些真实关系里，针对当前任务，最值得先看的 5 个符号是什么。

对 `tg` 最有价值的不是“把 SCIP 和 PageRank 都做进去”，而是形成这个闭环：

```
literal / semantic candidate search
→ SCIP 精确解析
→ task-seeded graph ranking
→ top-K symbol evidence
→ exact symbol/range read
→ stop broad search
```

这能把“代码搜索”从输出几十个匹配结果，升级为直接返回**最可能的实现路径和下一次精确读取动作**。

* * *

**You:**

加上ast呢？不加embedding

* * *

**ChatGPT:**

可以，而且**AST 应该是底座**。不加 embedding 的情况下，最合理的组合是：

```
AST：代码结构与精确读取边界
SCIP：跨文件符号身份与引用关系
PageRank：候选符号和调用链排序
Lexical/BM25：根据查询产生初始候选
```

完整流程：

```
query
  → 标识符/关键词/路径候选
  → AST symbol index
  → SCIP definition/reference enrichment
  → symbol graph
  → Personalized PageRank
  → Top-K symbols
  → AST 精确范围读取
```

## 三者的职责边界

| 组件 | 解决的问题 | 不负责 |
| --- | --- | --- |
| AST | 文件里有哪些函数、类、方法、调用、导入；符号范围在哪里 | 跨文件引用未必准确 |
| SCIP | 这个引用精确指向哪个符号；定义、引用、实现关系 | 不决定哪个结果最重要 |
| PageRank | 哪些符号最值得优先看 | 不解析代码，也不产生候选 |
| BM25 / lexical | 根据查询找到初始候选 | 不理解真实调用关系 |

可以概括为：

```
AST = structure
SCIP = identity
PageRank = priority
```

---

# 1. AST 在代码查找中的实质作用

AST 不只是“解析代码”，它直接决定了能不能避免整文件读取。

例如：

```TypeScript
export class SessionService {
  constructor(
    private readonly repository: SessionRepository,
    private readonly logger: Logger,
  ) {}

  async create(user: User): Promise<Session> {
    const session = Session.create(user.id);
    await this.repository.insert(session);
    return session;
  }

  async revoke(id: string): Promise<void> {
    // ...
  }
}
```

普通文本搜索只能返回：

```
src/session/session-service.ts:12 create
src/session/session-service.ts:14 insert
```

AST 可以返回：

```YAML
symbol:
  name: SessionService.create
  kind: method
  range: 8-16
  signature: "create(user: User): Promise<Session>"
  parent: SessionService
  calls:
    - Session.create
    - this.repository.insert
  referenced_types:
    - User
    - Session
```

于是 Agent 不需要读取整个文件，只需读取：

```
imports required by SessionService.create
class declaration
constructor dependency fields
method create body
referenced local types
```

这就是 **semantic slice（语义切片）**：基于结构返回与目标符号直接相关的真实源码，而不是自然语言摘要。

---

# 2. AST 应该建立哪些索引

## 符号索引

```TypeScript
interface SymbolRecord {
  id: string;
  name: string;
  qualifiedName: string;
  kind:
    | "function"
    | "method"
    | "class"
    | "interface"
    | "type"
    | "variable"
    | "module";
  path: string;
  startLine: number;
  endLine: number;
  signature?: string;
  exported: boolean;
  parentSymbolId?: string;
}
```

支持：

```
find symbol by exact name
find symbol by qualified name
find symbols by prefix
find symbols by fuzzy identifier
find exported symbols
find symbols in file/module
```

## 导入导出索引

```TypeScript
interface ImportEdge {
  fromFile: string;
  toModule: string;
  importedName?: string;
  localName?: string;
  typeOnly: boolean;
}
```

用于回答：

```
谁依赖这个模块
这个接口来自哪里
一个名字是本地声明还是 import
哪些文件暴露这个符号
```

## 调用索引

```TypeScript
interface CallEdge {
  callerSymbolId: string;
  calleeName: string;
  resolvedCalleeSymbolId?: string;
  path: string;
  line: number;
  confidence: "exact" | "likely" | "unresolved";
}
```

AST 通常可以准确知道：

```
这里是一个 CallExpression
调用名字是什么
调用发生在哪个函数范围内
```

但未必能准确知道跨文件调用指向谁。

这部分可以由 SCIP、TypeScript TypeChecker 或 LSP 补全。

## 类型关系索引

```
class extends class
class implements interface
type references type
method overrides method
generic parameter usage
```

## 语法范围索引

用于 Smart Read：

```
function body range
class range
imports range
JSDoc range
switch branch range
try/catch range
React component range
hook declaration range
route handler range
```

---

# 3. AST 和 SCIP 有什么重叠

它们有重叠，但层级不同。

## AST 能确定

```TypeScript
this.repository.insert(session)
```

AST 可以确定：

```
这是一个调用表达式
callee property name 是 insert
它位于 SessionService.create 内
receiver 是 this.repository
```

但仅靠通用 AST，可能不知道：

```
this.repository 的类型是 SessionRepository
insert 指向哪个具体声明
运行时实现是 PostgresSessionRepository 还是 MockSessionRepository
```

## SCIP 或 TypeChecker 能确定

```
insert → SessionRepository.insert
repository → SessionRepository
PostgresSessionRepository.insert implements SessionRepository.insert
```

因此图可以从：

```
SessionService.create
  --calls name "insert"-->
  unresolved
```

升级为：

```
SessionService.create
  --calls-->
  SessionRepository.insert

PostgresSessionRepository.insert
  --implements-->
  SessionRepository.insert
```

---

# 4. 对 TypeScript 项目，SCIP 不一定应该第一阶段就做

如果 `tg` 首先服务 TypeScript 项目，优先级应该是：

```
TypeScript Compiler API
  > generic Tree-sitter AST
  > SCIP ingestion
```

因为 TypeScript Compiler API 可以同时提供：

* AST
* symbol table
* module resolution
* type checker
* definition
* references的基础能力
* interface implementation关系
* property access解析
* overload解析

也就是说，对 TypeScript：

```
TypeScript AST + TypeChecker
≈ AST + 相当一部分 SCIP 能力
```

SCIP 更适合：

* 多语言仓库
* 已有外部 SCIP indexer
* 希望统一不同语言的符号协议
* 不想自己为每种语言维护类型解析
* 需要消费编译器生成的高精度索引

实用路线：

```
Phase 1:
TypeScript Compiler API

Phase 2:
Tree-sitter for unsupported languages

Phase 3:
SCIP adapter as precision enrichment layer
```

不要为了 SCIP 协议，先引入复杂的多语言索引基础设施。

---

# 5. 不加 embedding，查询候选怎么生成

可以使用四类廉价检索。

## 5.1 精确符号搜索

用户或 Agent 查询：

```
SessionService.create
createSession
SessionRepository
```

直接查 symbol index。

这是精度最高的方式。

## 5.2 标识符拆分

把：

```
createUserSession
```

拆成：

```
create
user
session
```

支持：

* camelCase
* PascalCase
* snake_case
* kebab-case
* 路径片段

例如查询：

```
where is user session persisted
```

转成候选词：

```
user
session
persist
save
insert
create
repository
```

其中 `persist → save/insert/store/write` 可以使用一份小型静态词典，不需要 embedding。

## 5.3 BM25 / lexical index

索引范围不应只是原始源码全文，还应包括：

```
symbol name
qualified symbol name
signature
path
comments
string literals
import/export names
test names
route names
```

文档可以以 symbol 为单位，而不是 file 为单位：

```TypeScript
interface SymbolSearchDocument {
  symbolId: string;
  name: string;
  qualifiedName: string;
  signature: string;
  pathTokens: string[];
  commentText?: string;
  identifierTokens: string[];
  stringLiterals?: string[];
}
```

这样 BM25 返回的是：

```
SessionService.create
```

而不是整个：

```
session-service.ts
```

## 5.4 路径和命名先验

例如查询包含：

```
route
controller
database
repository
test
config
```

可以增加相应路径权重：

```
routes/
controllers/
repositories/
db/
tests/
config/
```

这是弱启发式，只能加权，不能直接过滤。

---

# 6. 不加 embedding 的完整查找流程

假设查询：

> 登录之后 session 在哪里写入数据库？

## Step 1：查询结构化

```YAML
intent: follow_flow
concepts:
  - login
  - session
  - database
actions:
  - create
  - insert
  - save
  - persist
preferred_symbol_kinds:
  - function
  - method
  - class
```

这里不一定需要 tg 自己调用 LLM。

更适合让上层 Agent 直接调用：

```TypeScript
searchCode({
  query: "login session database",
  identifiers: ["login", "session", "insert", "save"],
  intent: "follow-flow",
});
```

## Step 2：候选生成

从 symbol index 和 BM25 得到：

```
AuthService.login
SessionService.create
SessionRepository.insert
PostgresSessionRepository.insert
loginRoute
session.test.ts
```

## Step 3：AST / SCIP 扩展

围绕候选扩展一到两跳：

```
callers
callees
imports
implementations
referenced types
tests
```

例如：

```
loginRoute
  → AuthService.login
  → SessionService.create
  → SessionRepository.insert
  → PostgresSessionRepository.insert
```

## Step 4：Personalized PageRank

用初始候选作为 restart seeds。

```
Seed:
AuthService.login                  0.8
SessionService.create              1.0
SessionRepository.insert           0.9
PostgresSessionRepository.insert   0.9
```

PageRank 只在局部子图运行，不需要全仓每次重算。

## Step 5：返回结构化链路

```YAML
matches:
  - symbol: SessionService.create
    path: src/session/session-service.ts
    lines: 41-58
    score: 0.94
    reasons:
      - name contains session/create
      - called by AuthService.login
      - calls SessionRepository.insert

  - symbol: PostgresSessionRepository.insert
    path: src/session/postgres-session-repository.ts
    lines: 27-46
    score: 0.91
    reasons:
      - implements SessionRepository.insert
      - contains database write call

likely_flow:
  - loginRoute
  - AuthService.login
  - SessionService.create
  - SessionRepository.insert
  - PostgresSessionRepository.insert

next_read:
  mode: semantic_slice
  symbol: SessionService.create
  include_callees: true
  max_depth: 1
```

---

# 7. PageRank 图应该由 AST 提供什么边

推荐的节点粒度：

```
symbol 为主
file/module 为辅
```

## 高价值边

| 边 | 来源 | 建议权重 |
| --- | --- | --- |
| `CALLS` | AST + semantic resolution | 1.0 |
| `IMPLEMENTS` | TypeChecker / SCIP | 0.95 |
| `OVERRIDES` | TypeChecker / SCIP | 0.9 |
| `REFERENCES_TYPE` | AST / TypeChecker | 0.7 |
| `IMPORTS_SYMBOL` | AST | 0.6 |
| `EXPORTS_SYMBOL` | AST | 0.6 |
| `TESTS` | 命名、路径、引用关系 | 0.8 |
| `CONTAINS` | AST | 0.3 |
| `SAME_FILE` | AST | 0.2 |
| `TEXT_MATCH` | lexical search | 不作为永久图边 |

`TEXT_MATCH` 更适合作为 PageRank seed，而不是图里的结构关系。

## 关系方向应根据任务变化

### 查实现

```
entry → callees
interface → implementations
```

### 查影响面

```
changed symbol → callers
changed type → users
```

### 查架构

```
module imports
module exports
cross-package dependencies
```

### 查测试

```
production symbol → referencing tests
```

因此不应该只有一个全局 PageRank。

应该是：

```TypeScript
type RankingProfile =
  | "locate"
  | "follow-call"
  | "impact"
  | "architecture"
  | "find-tests"
  | "debug";
```

每个 profile 使用不同的边权重和传播方向。

---

# 8. AST 如何直接降低 read token

PageRank 只负责找到应该读的符号。

AST 决定如何返回最少但足够的源码。

## Symbol Read

```TypeScript
smartRead({
  path: "src/session/session-service.ts",
  mode: "symbol",
  symbol: "SessionService.create",
});
```

返回：

```TypeScript
async create(user: User): Promise<Session> {
  const session = Session.create(user.id);
  await this.repository.insert(session);
  return session;
}
```

## Semantic Slice

编辑方法时，仅返回：

```
相关 imports
class fields
constructor 中相关依赖
目标方法
直接引用的本地 helper
必要类型声明
```

例如：

```TypeScript
import { Session } from "./session";
import type { SessionRepository } from "./session-repository";

export class SessionService {
  constructor(
    private readonly repository: SessionRepository,
  ) {}

  async create(user: User): Promise<Session> {
    const session = Session.create(user.id);
    await this.repository.insert(session);
    return session;
  }
}
```

不返回：

```
无关方法
无关 imports
长注释
其他类
测试 fixture
```

## Edit Window

编辑上下文必须保持源码完全准确：

```YAML
type: edit_window
path: src/session/session-service.ts
range:
  start: 34
  end: 65
symbol: SessionService.create
content_hash: sha256:...
content: |
  ...
```

可以压缩外围理解上下文，但编辑窗口本身不能概括。

---

# 9. 推荐的无 embedding 架构

```
                   ┌────────────────────┐
                   │ Query / Agent Tool │
                   └─────────┬──────────┘
                             │
                   ┌─────────▼──────────┐
                   │ Query Normalizer   │
                   │ identifier split   │
                   │ intent / path hints│
                   └─────────┬──────────┘
                             │
          ┌──────────────────┼──────────────────┐
          │                  │                  │
┌─────────▼────────┐ ┌───────▼────────┐ ┌──────▼───────┐
│ Symbol Index     │ │ BM25 / Literal │ │ Path Index   │
│ exact/fuzzy name │ │ symbol docs    │ │ file/module  │
└─────────┬────────┘ └───────┬────────┘ └──────┬───────┘
          └──────────────────┼──────────────────┘
                             │ candidates
                   ┌─────────▼──────────┐
                   │ AST Graph          │
                   │ calls/imports/types│
                   └─────────┬──────────┘
                             │
                   ┌─────────▼──────────┐
                   │ SCIP / TypeChecker │
                   │ resolve/enrich     │
                   └─────────┬──────────┘
                             │
                   ┌─────────▼──────────┐
                   │ Personalized       │
                   │ PageRank           │
                   └─────────┬──────────┘
                             │
                   ┌─────────▼──────────┐
                   │ Smart Read         │
                   │ symbol/slice/window│
                   └────────────────────┘
```

---

# 10. tg 的实际实现顺序

## 第一阶段：AST-first MVP

1. 文件分类和忽略规则
2. TypeScript AST 解析
3. 文件 outline
4. symbol index
5. import/export graph
6. AST 范围读取
7. 精确符号搜索
8. BM25 或轻量倒排索引
9. search result grouping
10. read cache 和 hash

这一步就能产生明显 token 收益。

## 第二阶段：结构图排序

1. caller/callee 提取
2. type reference edges
3. interface/implementation edges
4. 测试关联边
5. query-seeded PageRank
6. task-specific ranking profiles
7. graph-path explanation

## 第三阶段：SCIP / LSP 增强

1. SCIP index importer
2. exact definition/reference mapping
3. unresolved AST edge replacement
4. cross-language symbol graph
5. incremental re-indexing

---

# 11. 不加 embedding 的优缺点

## 优点

* 可解释
* 本地运行轻
* 无模型或向量库依赖
* 增量更新简单
* 标识符和调用链查找精度高
* 对企业代码更可控
* 结果可以提供明确的结构证据
* 不会因为语义近似返回大量“看起来相关”的代码

## 缺点

自然语言与代码命名差异较大时，召回会下降。

例如用户问：

```
where do we invalidate authentication state
```

代码可能叫：

```
revokeCredential
clearPrincipal
deleteLoginTicket
```

纯 lexical 检索可能错过。

可以不用 embedding，通过以下方式缓解：

```
Agent 将自然语言转成多个候选标识符
静态动作词典
项目内领域词典
README / docs 中的术语映射
git history 中的术语映射
缩写展开
camelCase tokenization
调用图邻域扩展
```

例如：

```YAML
query: invalidate authentication state
expanded_terms:
  - invalidate
  - revoke
  - clear
  - remove
  - delete
  - auth
  - authentication
  - credential
  - session
  - token
```

但要承认：**无 embedding 的自然语言概念召回上限会低一些**。不过对于 Coding Agent，通常可以要求 Agent 提供结构化关键词，问题没有想象中严重。

---

# 最终组合

最合理的设计不是：

```
AST + SCIP + PageRank 各自提供一个工具
```

而是把它们隐藏在一个统一查询协议后：

```TypeScript
interface CodeQuery {
  query?: string;
  symbols?: string[];
  paths?: string[];
  purpose:
    | "locate"
    | "understand"
    | "edit"
    | "debug"
    | "verify"
    | "architecture";
  relations?: Array<
    | "definitions"
    | "references"
    | "callers"
    | "callees"
    | "implementations"
    | "tests"
  >;
  maxResults?: number;
  maxGraphDepth?: number;
  tokenBudget?: number;
}
```

内部执行：

```
symbol/BM25 candidate search
→ AST graph expansion
→ SCIP/TypeChecker resolution
→ Personalized PageRank
→ AST semantic slice
```

核心模式是：

> **Lexical   找入口，AST 建结构，SCIP 消歧义，PageRank 排优先级，Smart Read 只返回精确源码范围。**

对于 `tg`，AST 应该第一阶段就做；SCIP 应作为后续精度增强；PageRank 在符号图形成之后加入；embedding 完全可以先不引入。

* * *

**You:**

对于domain knowledge，semantic，business logic 有什么研究吗，如何理解归类等

* * *

**ChatGPT:**

这里要先把三个容易混在一起的概念拆开：**代码语义、领域语义、业务逻辑**。我会结合程序分析、架构恢复、特性定位和领域建模研究，给出一套适合你这个本地上下文系统的归类方法。

有，而且这其实分属几个成熟但长期割裂的研究方向：

* **Concept / Feature Location**：从需求或领域术语定位实现代码。
* **Architecture Recovery**：从依赖、目录、调用关系、代码文本恢复模块和架构。
* **Business Rule Mining**：从遗留代码中提取业务规则、条件和决策。
* **Requirements Traceability**：建立需求、代码、测试之间的可追溯关系。
* **Program Semantics / Code Property Graph**：描述代码实际执行关系。
* **Domain-Driven Design / Ontology**：组织领域概念、边界和词汇。
* **Repository Memory**：利用 Git、Issue 和历史修改补充“为什么这样实现”。

但首先要纠正一个容易出现的混淆：

> AST、SCIP、调用图和 PageRank 能理解代码结构与实现关系，但不能单独理解完整的业务含义。

例如它们可以证明：

```
OrderController.confirm
  → OrderService.confirm
  → Inventory.reserve
  → Payment.authorize
```

但不能仅凭调用图可靠得出：

> “只有库存预留成功且支付授权通过后，订单才允许进入 Confirmed 状态，这是公司的交易一致性规则。”

后一句包含了**业务意图、约束和为什么**，需要代码之外的证据，或者基于代码进行带置信度的推断。

---

# 一、先把 Semantic 拆成五层

“Semantic”这个词太宽泛，建议在系统设计中禁止单独使用，必须标明是哪种语义。

## 1. Lexical semantics：词汇语义

来自：

* 标识符
* 路径
* 注释
* 错误信息
* API 名称
* 数据库字段
* Commit / Issue 文本

例如：

```
createOrder
cancelSubscription
eligibilityCheck
settlementDate
```

它回答：

> 代码里使用了哪些词，这些词可能对应什么概念？

早期 concept location 研究已经表明，开发者会通过标识符和注释编码领域概念，可以通过标识符分析自动抽取领域词汇，再将术语定位到类和代码区域。

但词汇不等于业务事实：

```TypeScript
function validateOrder() {}
```

仅凭名字无法确认它验证了什么。

---

## 2. Program semantics：程序语义

来自：

* AST
* TypeChecker
* SCIP
* CFG，控制流图
* DFG，数据流图
* 调用图
* 定义和引用
* 读写关系
* 异常和返回路径

它回答：

> 程序实际可能如何执行？什么数据流向哪里？哪个条件控制哪个结果？

Code Property Graph 通常把 AST、控制流和程序依赖关系合并到一个可查询图中，这比单独的 AST 更接近“代码实际行为”。

例如：

```TypeScript
if (order.total > customer.creditLimit) {
  throw new CreditLimitExceeded();
}
```

可以提取：

```YAML
condition:
  left: order.total
  operator: ">"
  right: customer.creditLimit

outcome:
  throws: CreditLimitExceeded
```

这是可验证的程序事实。

---

## 3. Architectural semantics：架构语义

来自：

* 模块和包依赖
* 目录结构
* API 边界
* 数据库所有权
* 消息发布和消费
* 部署单元
* Git ownership
* 调用和数据流聚类

它回答：

> 这个代码在整个系统中扮演什么角色？

例如：

```
API Adapter
Application Service
Domain Model
Repository
External Integration
Event Consumer
```

架构恢复研究通常不会只依赖一种信号。SARIF 将依赖、代码文本和目录结构结合起来，因为任何单一来源都不足以准确恢复架构。

因此：

```
文件夹名 ≠ 架构事实
调用关系 ≠ 完整架构
注释文本 ≠ 真实依赖
```

应该融合多种证据。

---

## 4. Domain semantics：领域语义

它描述业务世界中的概念和关系：

```
Customer
Order
Subscription
Invoice
Settlement
Eligibility
Claim
Policy
```

包括：

* **Bounded Context**：一个领域模型有效的边界。
* **Ubiquitous Language**：业务和开发共同使用的词汇。
* Entity：具有身份的领域对象。
* Value Object：由值定义的对象。
* Aggregate：一致性边界。
* Command：要求系统执行的动作。
* Domain Event：业务中已经发生的事实。
* Policy：针对特定情况的业务策略。

DDD 的核心正是用领域模型和统一语言组织复杂业务，同时承认不同 bounded context 中，同一个词可能有不同含义。

例如：

```
Customer
```

在不同上下文可能分别表示：

```
Sales.Customer
Billing.AccountHolder
Support.Contact
Risk.Subject
```

不能因为名字相同就合并为一个节点。

---

## 5. Business semantics：业务语义

这是最关键也最难自动恢复的一层。

它回答：

> 系统为什么这样做？什么条件允许、禁止或改变业务结果？

例如：

```
新客户首单金额超过 10,000 元时，需要人工审核。
已完成结算的订单不得取消。
退款金额不得超过实际收款金额。
护士只有在患者处于本科室时才能签署该护理记录。
```

它通常表现为：

* 业务规则
* 不变量
* 决策表
* 状态机
* 计算公式
* 权限策略
* 工作流
* 合规约束
* 补偿与重试策略

近期关于 business-logic bug 的研究也显示，单纯代码中心的测试很难发现违反业务意图的问题；将需求中的业务场景、前置条件、动作、预期结果和语义约束结构化后，才能更有效地检测这类缺陷。

---

# 二、Domain Knowledge 应该怎么归类

不建议把所有东西都叫 `Knowledge`，然后全部塞进一个向量库或一张图。

建议分成五个平面。

## A. Domain Vocabulary：领域词汇

存储：

```YAML
term: settlement
context: Payments
definition: Final recognition and transfer of funds
aliases:
  - settle
  - clearing
  - payout
code_terms:
  - settlementDate
  - settleTransaction
  - PaymentSettled
status: confirmed
```

来源：

* 领域专家
* 文档
* API schema
* 标识符和注释
* 数据库字段
* Issue / Jira
* Git commit

它主要解决：

> 用户说的业务词，代码里可能叫什么？

无 embedding 时，它尤其重要。

---

## B. Domain Model：领域模型

节点包括：

```
BoundedContext
Entity
ValueObject
Aggregate
Command
Event
Policy
Actor
ExternalSystem
```

关系包括：

```
BELONGS_TO_CONTEXT
CONTAINS
ISSUES_COMMAND
EMITS_EVENT
HANDLES_EVENT
GOVERNS
DEPENDS_ON
TRANSLATES_TO
```

示例：

```
Order Aggregate
  ├── contains OrderLine
  ├── accepts ConfirmOrder
  ├── emits OrderConfirmed
  └── governed by CreditPolicy
```

这描述的是业务模型，不是源代码结构。

---

## C. Use Cases / Capabilities：业务能力和用例

业务能力：

```
Order Management
Billing
Customer Onboarding
Claims Processing
Access Provisioning
```

具体用例：

```
Confirm Order
Cancel Subscription
Approve Claim
Generate Invoice
Reset Password
```

用例应连接到实现路径：

```
Confirm Order
  → POST /orders/:id/confirm
  → OrderController.confirm
  → ConfirmOrderHandler
  → Order.confirm
  → InventoryReserved
  → OrderConfirmed
```

Feature location 和 requirements-to-code traceability 研究正是在解决这类“业务描述到实现位置”的连接问题。需求—代码链接可以帮助开发者理解某项需求由哪些实现承担，以及需求变化可能影响哪里。

---

## D. Business Rules：业务规则

建议进一步分类，否则“业务逻辑”仍然太宽。

### 1. Invariant：不变量

始终必须成立：

```
refundAmount <= capturedAmount
availableBalance >= 0
```

### 2. Eligibility / Decision Rule：资格或决策规则

```
IF customer.age >= 18
AND riskLevel != HIGH
THEN customer may open account
```

### 3. State Transition Rule：状态转换规则

```
Draft → Submitted
Submitted → Approved | Rejected
Approved → Paid
```

以及：

```
Paid 状态不能回到 Draft
```

### 4. Calculation Rule：计算规则

```
premium = baseRate × riskFactor × duration
```

### 5. Authorization Rule：权限规则

```
只有该病区护士或主管护士可修改记录
```

### 6. Workflow / Orchestration Rule：流程编排

```
reserve inventory
→ authorize payment
→ confirm order
→ emit event
```

### 7. Temporal Rule：时间规则

```
申请提交后 30 天内有效
```

### 8. Consistency / Transaction Rule：一致性规则

```
订单状态修改和 outbox event 必须在同一事务内完成
```

### 9. Failure / Compensation Rule：失败与补偿

```
支付成功但库存失败时，必须触发退款
```

### 10. Compliance Rule：监管和合规

```
超过阈值的交易必须提交人工审查
```

---

## E. Operational Knowledge：运行知识

它不是 domain logic，但 Agent 修改代码经常需要：

* 部署方式
* Feature flag
* 环境差异
* Retry / timeout
* 消息队列
* 数据迁移
* SLO
* Runbook
* 服务 owner
* 已知限制

不能把这些混进业务规则。

例如：

```
订单 30 天后不能退款
```

可能是业务规则。

```
退款 API timeout 为 30 秒
```

是运行配置。

两者都包含“30”，含义完全不同。

---

# 三、如何从代码中自动理解 Business Logic

必须承认：

> 自动提取适合生成“候选业务知识”，不适合直接宣布“这就是业务事实”。

建议采用多阶段方式。

---

## 1. Term Mining：领域术语挖掘

无 embedding 也能做。

数据来源：

```
symbol names
type names
method names
enum values
route names
database tables/columns
error classes
events
comments
tests
commit messages
requirements
```

处理：

```
camelCase / PascalCase / snake_case 拆分
词形归一化
缩写展开
停用词过滤
通用技术词降权
项目特有词加权
```

例如：

```
CustomerEligibilityEvaluator
```

拆成：

```
customer
eligibility
evaluate
```

还可以计算：

```
domainScore(term) =
  repositoryFrequency
  × crossArtifactFrequency
  × symbolImportance
  × domainSpecificity
```

其中 `string`、`manager`、`handler`、`service` 属于技术或通用词，应降权；`settlement`、`underwriting`、`radiotherapy` 更可能是领域词。

---

## 2. Context Detection：领域边界识别

根据以下证据聚类：

* Package/module 边界
* Import dependency
* 数据表所有权
* API namespace
* Event namespace
* Git owner
* Co-change，共同修改
* 领域词分布
* 部署单元

无 embedding 时，可以用：

* 图社区发现
* 强连通分量
* 模块化聚类
* Label propagation
* 路径先验
* 依赖割边
* 领域词重叠

但输出必须是：

```YAML
candidate_context: Billing
confidence: 0.74
evidence:
  - packages/billing/**
  - owns tables invoice, payment
  - publishes PaymentCaptured
  - 82% of internal calls remain in cluster
status: inferred
```

不能直接写成：

```
Billing 是正式 Bounded Context
```

Bounded Context 是业务和组织边界，不只是代码聚类结果。

---

## 3. Rule Detection：规则候选提取

AST / CFG 可以检测以下模式：

### Guard clause

```TypeScript
if (!order.canCancel()) {
  throw new OrderCannotBeCancelled();
}
```

候选：

```YAML
type: eligibility_rule
action: cancel order
condition: order.canCancel() == true
outcome_on_failure: OrderCannotBeCancelled
```

### Threshold

```TypeScript
if (amount > 10_000) requireManualReview();
```

候选：

```YAML
type: threshold_rule
subject: transaction.amount
operator: ">"
value: 10000
effect: requireManualReview
```

### State transition

```TypeScript
order.status = OrderStatus.APPROVED;
```

结合控制流：

```YAML
from:
  - SUBMITTED
to: APPROVED
preconditions:
  - approvalResult.accepted
```

### Validation schema

```TypeScript
z.object({
  age: z.number().min(18),
});
```

候选：

```YAML
field: age
constraint: minimum
value: 18
```

### Permission check

```TypeScript
authorize(user, "approve", claim);
```

候选：

```YAML
actor: user
action: approve
resource: claim
```

### Calculation

```TypeScript
const fee = amount * rate + fixedFee;
```

候选：

```YAML
output: fee
formula: amount * rate + fixedFee
```

这些是**代码事实的结构化投影**，但是否属于核心业务规则还需判断。

---

## 4. Use-case Tracing：用例链路恢复

以 route、command、event 或 UI action 为入口：

```
API / UI / Message
  → application handler
  → domain operations
  → persistence
  → outbound integration
  → emitted event
```

这里用到：

* AST：符号和范围
* SCIP / TypeChecker：精确引用
* CFG：分支与返回路径
* DFG：关键数据传播
* PageRank：局部排序
* 测试：预期行为
* Git：变化原因

最终返回的是 Business Flow，而不是源文件列表：

```YAML
use_case: Confirm Order

entrypoint:
  method: POST
  route: /orders/:id/confirm

flow:
  - symbol: ConfirmOrderHandler.execute
    role: application_orchestration
  - symbol: InventoryService.reserve
    role: external_precondition
  - symbol: Order.confirm
    role: domain_state_transition
  - symbol: OrderRepository.save
    role: persistence
  - event: OrderConfirmed
    role: domain_event

branches:
  - condition: inventory unavailable
    outcome: reject confirmation
  - condition: payment authorization failed
    outcome: release inventory
```

---

## 5. Test-based Semantics：从测试提取预期

测试往往比生产代码更接近业务意图：

```TypeScript
it("rejects cancellation after settlement", ...)
```

可以抽取：

```YAML
scenario: cancel settled order
given:
  order.status: SETTLED
when:
  action: cancel
then:
  error: SettledOrderCannotBeCancelled
```

测试可作为强证据，但仍不是绝对事实：

* 测试可能过期
* 测试可能只覆盖一个例子
* 测试名可能不准确
* Mock 可能掩盖真实行为

---

## 6. History-based Semantics：从历史理解“为什么”

Git history、Issue 和 PR 可以补充：

```
为什么增加这个判断
什么时候引入
是临时 workaround 还是正式规则
和哪个事故或需求相关
```

Repository Memory 研究表明，历史 commit、关联 issue 和高频变化模块可以帮助代码定位，因为人类对仓库的理解本来就包含这种长期演化记忆。

但 commit message 质量并不稳定；一项研究中相当一部分 commit message 信息不足，所以历史只能作为证据源，不能默认可信。

---

# 四、没有 Embedding，能不能做 Semantic？

可以，但需要把它叫得更准确：

> **Structural semantic retrieval，而不是 vector semantic search。**

它依赖的是类型化关系和领域词典，而不是向量距离。

查询：

> 订单什么时候不能取消？

可以转换为：

```YAML
concepts:
  - order
action:
  - cancel
question_type:
  - prohibition
  - eligibility
```

然后执行：

```
1. 查找 Order / cancel 相关符号
2. 找到 cancelOrder、Order.cancel、OrderCannotBeCancelled
3. 扩展 callers / callees / tests
4. 查找进入 Order.cancel 的控制流条件
5. 查找 status、throw、return false、authorization guard
6. 查找相关测试和错误码
7. 聚合为规则候选
```

这里不需要 embedding。

---

# 五、无 Embedding 的检索层次

建议按以下顺序。

## Level 1：领域词典匹配

```
业务术语 → 别名 → 代码术语
```

例如：

```YAML
business_term: customer onboarding
aliases:
  - account opening
  - registration
code_terms:
  - createCustomer
  - OpenAccountCommand
  - Applicant
```

词典来源可以分为：

* 人工确认
* 文档提取
* 代码提取
* LLM 建议但未确认

---

## Level 2：Lexical / BM25

索引：

* Symbol name
* Qualified name
* Path
* Signature
* Comments
* Error names
* Test names
* API names
* Event names
* Schema fields

以 symbol 和 rule candidate 为文档单位，不要只以文件为单位。

---

## Level 3：Typed Graph Expansion

找到候选后扩展：

```
DEFINES
CALLS
READS
WRITES
EMITS
HANDLES
VALIDATES
TRANSITIONS_TO
IMPLEMENTS
TESTED_BY
DOCUMENTED_BY
CHANGED_WITH
```

“语义”来自边的类型，而不是相似度。

---

## Level 4：Task-specific PageRank

不同问题使用不同边权重。

### 查业务规则

优先：

```
guard
validation
state transition
error
test assertion
```

### 查业务流程

优先：

```
entrypoint
call
event
persistence
external side effect
```

### 查领域模型

优先：

```
type relationship
ownership
aggregate containment
event-command relation
```

### 查影响面

优先：

```
reverse calls
type references
event consumers
tests
co-change
```

---

## Level 5：Evidence Projection

最终不给 Agent 整个图，而是：

```YAML
concept: Order Cancellation

candidate_rules:
  - statement: Settled orders cannot be cancelled
    status: inferred
    confidence: 0.91
    evidence:
      - src/domain/order.ts#Order.cancel:72-84
      - tests/order-cancel.test.ts:41-67
      - error: SettledOrderCannotBeCancelled

implementation_flow:
  - CancelOrderHandler.execute
  - Order.cancel
  - OrderRepository.save
  - OrderCancelled event

unresolved:
  - whether administrators can override this restriction

next_read:
  symbol: Order.cancel
  mode: edit_window
```

---

# 六、建议的数据模型

不要把 domain 信息直接写到 SCIP 或 AST 节点里。应保持不同知识层和来源隔离。

```TypeScript
type KnowledgeStatus =
  | "observed"
  | "inferred"
  | "confirmed"
  | "conflicted"
  | "deprecated";

type EvidenceKind =
  | "source-code"
  | "test"
  | "api-schema"
  | "database-schema"
  | "documentation"
  | "requirement"
  | "issue"
  | "commit"
  | "runtime-trace"
  | "human";

interface EvidenceRef {
  kind: EvidenceKind;
  uri: string;
  symbolId?: string;
  startLine?: number;
  endLine?: number;
  revision?: string;
  hash?: string;
}

interface KnowledgeAssertion {
  id: string;
  subjectId: string;
  predicate: string;
  objectId?: string;
  literalValue?: string | number | boolean;

  status: KnowledgeStatus;
  confidence: number;

  evidence: EvidenceRef[];
  derivation:
    | "direct"
    | "ast-rule"
    | "graph-inference"
    | "lexical-inference"
    | "llm-proposal"
    | "human-authored";

  validFromRevision?: string;
  validToRevision?: string;
  lastVerifiedAt?: string;
}
```

领域节点：

```TypeScript
type DomainNodeKind =
  | "bounded-context"
  | "capability"
  | "use-case"
  | "actor"
  | "entity"
  | "value-object"
  | "aggregate"
  | "command"
  | "event"
  | "policy"
  | "business-rule"
  | "state"
  | "workflow";
```

技术节点：

```TypeScript
type TechnicalNodeKind =
  | "repository"
  | "package"
  | "module"
  | "file"
  | "symbol"
  | "endpoint"
  | "table"
  | "column"
  | "queue"
  | "config"
  | "test";
```

核心连接：

```
UseCase       IMPLEMENTED_BY       Symbol
BusinessRule ENFORCED_BY          Symbol
BusinessRule VERIFIED_BY          Test
Entity       PERSISTED_IN         Table
Command      HANDLED_BY           Symbol
Event        EMITTED_BY           Symbol
Event        CONSUMED_BY          Symbol
Capability   OWNED_BY             Team
Concept      DOCUMENTED_BY        Document
Concept      ALIAS_OF             Concept
Symbol       BELONGS_TO_CONTEXT   BoundedContext
```

---

# 七、必须区分四种可信度

这是整个系统能否真正企业级的关键。

## 1. Observed：直接观察事实

例如：

```
Order.cancel 在第 72–84 行抛出 SettledOrderCannotBeCancelled
```

可以由 AST / SCIP 验证。

## 2. Derived：确定性推导

例如：

```
OrderController.cancel 调用了 Order.cancel
```

如果 SCIP 或 TypeChecker 精确解析，可以视为高可信推导。

## 3. Inferred：语义推断

例如：

```
Order.cancel 可能实现“结算后禁止取消”的业务规则
```

这是合理推断，但仍需标记。

## 4. Confirmed：人工或权威文档确认

例如：

```
Jira requirement PAY-142 和领域专家均确认：
结算后订单禁止取消。
```

这才可以作为 canonical domain knowledge。

---

# 八、对你这个整体项目的建议

## 不要把它放进 tk 的输出压缩内核

按照你现在的定位：

* `tk`：被动压缩和投影工具输出。
* CodeGraph：结构、符号、调用和影响关系。
* CodeWiki / Knowledge Layer：领域知识、架构、业务逻辑和历史。
* Agent / MCP：根据任务检索和组合。
* Atlas：组织级权威知识。

Domain Knowledge 更适合放在：

```
Repository Intelligence / Context Knowledge Layer
```

而不是：

```
Tool Output Interceptor
```

---

## 建议形成三张相互关联但不混淆的图

### 1. Code Graph

```
AST
SCIP
symbols
calls
imports
types
data flow
```

回答：

> 代码如何连接？

### 2. Domain Graph

```
contexts
capabilities
concepts
entities
commands
events
rules
workflows
```

回答：

> 系统在业务上表达什么？

### 3. Evidence Graph

```
code
tests
docs
requirements
commits
issues
runtime traces
human validation
```

回答：

> 为什么相信这个结论？

它们通过明确关系连接：

```
Domain Rule
   └── ENFORCED_BY → Code Symbol
   └── VERIFIED_BY → Test
   └── DOCUMENTED_BY → Requirement
   └── INTRODUCED_BY → Commit
```

---

# 九、实际构建顺序

## 第一阶段：代码可验证语义

先做：

1. Symbol / AST index
2. SCIP 或 TypeChecker 解析
3. Import / call / type graph
4. Route、event、DB、test 识别
5. 条件、异常、状态转换、校验规则抽取
6. 所有结论保留源码范围和 hash

这部分最可靠。

## 第二阶段：领域词汇和用例

7. Identifier / comments / schema term mining
8. Glossary 和 alias 管理
9. Route → service → domain → DB / event 流程
10. Tests → Given / When / Then 场景提取
11. Business rule candidates

## 第三阶段：多源知识

12. README / ADR / docs
13. Git commits / PR / Issue
14. Jira / Confluence
15. 数据库 schema
16. OpenAPI / AsyncAPI
17. Runtime traces

## 第四阶段：人工确认和持续更新

18. 确认 bounded context
19. 确认正式业务规则
20. 冲突检测
21. 版本化和失效处理
22. 根据 commit 增量重算

---

# 十、最终归类

最简洁的理解方式是：

```
AST / SCIP / CFG / DFG
= 程序做了什么

Architecture Graph
= 哪些部分共同完成它

Domain Model
= 这些部分代表哪些业务概念

Business Logic
= 哪些条件和规则决定业务结果

Requirements / Docs / History / Experts
= 为什么要这么做

Evidence Graph
= 我们凭什么相信这个结论
```

最好的统一模式不是让 LLM“读完整个仓库然后总结业务”，而是：

```
结构解析
→ 领域词汇抽取
→ 用例链路恢复
→ 规则候选提取
→ 多源证据关联
→ 明确置信度
→ 人工确认
→ 按任务投影最小证据
```

**真正有价值的 semantic layer，不是一个 embedding index，而是一个带类型、来源、证据、版本和置信度的可追溯知识层。**

* * *

**You:**

像understand anything以及其他的一些项目对于business logic怎么分析还原的

* * *

**ChatGPT:**

我先确认 `Understand Anything` 的具体实现，再和几类相邻项目对比：它们到底是在做**代码结构恢复**、**业务流程还原**，还是只是生成高层文档。重点会看它们如何从代码推导出 business logic，以及哪些结论其实只是 LLM 推断。

## 先说结论

这类项目所谓“还原 business logic”，通常不是通过某一种算法直接得到业务逻辑，而是分四层完成：

```
源代码
  ↓
结构事实：文件、符号、调用、依赖、入口
  ↓
程序行为：条件、状态变化、读写、异常、副作用
  ↓
语义提升：给行为命名为“创建订单”“审核退款”
  ↓
领域组织：Domain → Capability → Flow → Rule → Step
```

不同项目主要区别在于它们做到哪一层：

* `Understand Anything`：**结构事实 + LLM 语义提升**
* `RepoAgent`：**符号级文档 + 调用关系**
* `DeepWiki`：**代码检索 + Wiki 生成**
* `Codebase-Memory`：**确定性代码关系图**
* `Joern / CPG`：**控制流、数据流和程序行为**
* 一些代码重构研究：**行为规格抽取 + 反向验证**

严格来说，大多数 Code Wiki 产品不是在“证明”业务逻辑，而是在基于代码结构和局部源码，生成一个**合理的业务解释**。

---

# 1. Understand Anything 到底怎么分析 business logic

它的公开实现是很典型的：

```
Tree-sitter 确定性解析
        +
LLM 阅读结构化结果和源码
        ↓
知识图谱
        ↓
Domain Analyzer
        ↓
Domain → Flow → Step
```

## 第一层：Tree-sitter 提取结构事实

它使用 Tree-sitter 提取：

* imports / exports
* 函数和类
* 调用点
* 继承关系
* 文件和符号关系
* 文件变化指纹

这些事实还会预先整理成 `importMap`，避免每个文件分析 Agent 重复从源码推导 import 关系。项目明确把 Tree-sitter 定位为确定性的结构层，而让 LLM 负责摘要、标签、架构层和业务领域映射。

这一步得到的是：

```YAML
file: src/orders/cancel-order.ts

exports:
  - cancelOrder

imports:
  - OrderRepository
  - OrderCannotBeCancelled

calls:
  - repository.findById
  - order.cancel
  - repository.save
```

还不是 business logic。

---

## 第二层：LLM 给技术结构赋予业务含义

LLM 会读取：

* 解析后的函数和类
* 原始源码
* import / call 关系
* 路径
* 现有摘要和标签

然后产生：

* plain-English summary
* architectural layer
* tags
* business-domain mapping
* guided tour

也就是说：

```
CancelOrderHandler
```

可能被解释为：

```
属于 Order Management 领域，
实现“取消订单”业务流程，
负责加载订单、检查可取消条件、保存状态并发布事件。
```

这个业务含义不是 Tree-sitter 得出的，而是 LLM 根据名字、源码和关系推断的。Understand Anything 的 README 也明确区分了结构层和 LLM semantic 层。

---

## 第三层：`/understand-domain` 构造业务图

它有两条输入路径。

### 路径 A：已有 Knowledge Graph

如果已经运行过 `/understand`，Domain Analyzer 不再读取源码，而是使用：

* node name
* node summary
* tags
* `calls`、`imports`、`contains` 等关系
* architectural layers
* tours

来推导业务领域。

这意味着它实际上在做：

```
源码
→ 文件级 LLM 摘要
→ 图节点摘要
→ 第二次 LLM 领域归纳
```

这里存在明显的**摘要叠加误差**：如果第一层 summary 漏掉某个 guard、异常分支或状态变化，domain 分析通常也看不到。

### 路径 B：轻量扫描

没有现成图时，它生成一个 `domain-context.json`，包括：

* 文件树
* HTTP route、CLI、event handler、cron 等入口
* imports / exports
* 入口函数的少量代码片段
* `package.json`、README 等项目元数据

然后交给 Domain Analyzer 推断业务流程。

---

## 第四层：输出固定的三层业务模型

其 Domain Analyzer Prompt 要求输出：

```
Business Domain
  └── Business Flow
        └── Business Step
```

例如：

```
Order Management
  └── Cancel Order
       ├── Validate request
       ├── Load order
       ├── Check cancellation eligibility
       ├── Update status
       └── Persist changes
```

Domain 节点还包含：

```JSON
{
  "entities": [],
  "businessRules": [],
  "crossDomainInteractions": []
}
```

Flow 包含入口，Step 可以带实现文件和行号。

---

## Understand Anything 的本质

它更准确的描述是：

> **基于代码结构约束的 LLM 业务流程归纳器。**

而不是：

> 严格的 business logic recovery engine。

原因是，从公开实现看：

1. `businessRules` 是自然语言字符串，不是结构化条件表达式。
2. Domain 和 Flow 本身没有强制关联源码证据。
3. Step 的 `filePath` 和 `lineRange` 无法确定时可以省略。
4. 没有看到基于 CFG、数据流、状态机或路径条件的规则验证。
5. 验证阶段主要验证图结构和 schema；没有公开显示对每条业务结论重新读取源码并反证。

所以它适合：

* 快速 onboarding
* PM / 新人理解项目
* 可视化业务流程
* 建立初始领域词汇
* 发现可能的业务域

不适合直接作为：

* 权威业务规则库
* 合规规则来源
* 自动代码修改的唯一依据
* 状态迁移和交易一致性的证明

---

# 2. 其他项目是怎么做的

| 类型 / 项目 | 分析方式 | 能还原什么 | 还原不了什么 |
| --- | --- | --- | --- |
| Understand Anything | Tree-sitter + LLM + Domain Agent | Domain、Flow、Step、自然语言规则 | 精确路径条件、数据依赖、规则真实性 |
| RepoAgent | AST + 符号调用关系 + LLM 文档 | 类/函数用途、调用上下文、对象级说明 | 正式领域模型、业务规则验证 |
| DeepWiki | 仓库分析 + LLM Wiki + 图表 | 架构解释、模块说明、高层流程 | 可查询的精确业务规则模型 |
| Codebase-Memory | Tree-sitter KG + call graph + community discovery | 调用链、影响面、模块社区、代码拓扑 | 业务名称、业务意图、为什么这样做 |
| Joern / CPG | AST + CFG + data flow + graph query | 条件、路径、变量传播、副作用 | “这个条件在业务上意味着什么” |
| Code2Text2Code 类研究 | 事实抽取 + 中立规格 + 迭代校验 | 行为、条件、数据依赖、领域意图 | 仍需处理文档错误和领域知识缺失 |

---

## RepoAgent：从符号文档向上聚合

RepoAgent 使用 AST 分析代码对象，并识别对象之间的双向调用关系，再让 LLM 为单个对象生成和维护文档。

它的逻辑大概是：

```
Function
  ↓
Class
  ↓
File
  ↓
Module
  ↓
Repository documentation
```

比如分析：

```TypeScript
function calculateRefund(order, request) {
  const refundable = order.paidAmount - order.refundedAmount;
  if (request.amount > refundable) {
    throw new ExcessiveRefundError();
  }
}
```

它可能生成：

> Calculates the available refundable amount and rejects refund requests exceeding the remaining captured amount.

这是很好的函数级业务解释。

但 RepoAgent 的核心数据模型仍然是：

```
code object
documentation
invocation relation
```

而不是：

```
BusinessRule:
  refundAmount <= paidAmount - refundedAmount
```

因此，它更偏向**代码文档恢复**，不是规则恢复。

---

## DeepWiki：通过检索生成业务解释

DeepWiki-Open 对自己的描述是：

1. 分析代码结构
2. 生成完整文档
3. 创建可视化图表
4. 组织成 Wiki

这种产品通常使用：

```
仓库切片 / 索引
→ 根据 Wiki 章节检索相关代码
→ LLM 生成章节
→ Mermaid 等图表
```

例如它要生成“Payment Processing”页面，会检索：

* payment 文件
* API route
* service
* repository
* tests
* config

然后由 LLM 写成一篇连贯说明。

它的优势是：

* 阅读体验好
* 可以覆盖大仓库
* 适合问答和导航
* 容易生成架构图、序列图

但 Wiki 内容本质还是**生成文档**。如果没有显式保存：

* 每个结论对应哪些符号
* 哪条条件对应哪条规则
* 哪个版本验证过
* 是否来自代码、测试还是文档

那么它无法成为可信的业务知识层。

---

## Codebase-Memory：恢复拓扑，不直接恢复业务意义

Codebase-Memory 使用 Tree-sitter 建立持久化知识图，支持调用图遍历、影响分析和 community discovery，也就是根据连接密度识别代码社区。论文报告其图式查询能用更少 token 回答代码结构问题。

它能够从图上发现：

```
这组 route、service、repository、model 经常互相调用
```

于是可以形成候选模块：

```
Cluster 17
  ├── checkout-route
  ├── checkout-service
  ├── payment-client
  ├── inventory-client
  └── order-repository
```

LLM 再把它命名为：

```
Checkout / Order Fulfillment
```

这里需要区分：

* **社区检测发现技术聚类**
* **LLM 将聚类解释为业务领域**

前者相对确定，后者是推断。

而且代码社区不等于 DDD 的 Bounded Context：

```
共享 Utils
公共鉴权
统一日志
ORM 基础设施
```

可能在结构图中连接很多模块，但它们通常不是业务域。

---

## Joern / Code Property Graph：恢复真正的程序行为

Joern 的 Code Property Graph 将代码的语法、控制流和数据流统一在一张图中，并提供图查询能力。官方文档明确说明，CPG 融合程序语法、控制流和过程内数据流，并可以在不同表示之间联合查询。

它可以分析：

```TypeScript
if (order.status === "SETTLED") {
  throw new CannotCancelSettledOrder();
}

order.status = "CANCELLED";
await repository.save(order);
```

抽取出：

```YAML
guard:
  condition: order.status == SETTLED
  false_path:
    state_write: order.status = CANCELLED
    persistence: repository.save(order)
  true_path:
    throws: CannotCancelSettledOrder
```

这个结果已经非常接近业务逻辑。

但是 CPG 本身不知道：

```
SETTLED 在企业里意味着“资金已正式结算，不允许反向变更”
```

它只知道：

```
当 status 等于 SETTLED 时，程序抛异常。
```

所以：

```
CPG 恢复 operational semantics
LLM / domain knowledge 恢复 business semantics
```

---

# 3. 真正的 business logic 应该如何还原

可靠方法不是直接让 LLM“总结这个仓库的业务逻辑”，而应该以**单个业务用例**为单位。

## 第一步：识别入口

入口包括：

* HTTP route
* GraphQL resolver
* CLI command
* event consumer
* scheduled job
* UI action
* workflow handler

例如：

```
POST /orders/:id/cancel
```

---

## 第二步：恢复执行切片

通过 AST、SCIP、调用图和类型信息，得到：

```
CancelOrderRoute
→ CancelOrderHandler.execute
→ OrderRepository.findById
→ Order.cancel
→ OrderRepository.save
→ EventBus.publish(OrderCancelled)
```

注意不是把所有下游调用都展开，而是保留：

* 业务判断
* 状态变化
* 持久化
* 外部调用
* 事件
* 异常
* 补偿

日志、mapper、通用工具可以折叠。

---

## 第三步：提取行为事实

从 CFG、AST 和数据流中提取：

```YAML
preconditions:
  - order exists
  - actor has cancel permission

guards:
  - order.status != SETTLED

stateTransitions:
  - from: CONFIRMED
    to: CANCELLED

writes:
  - orders.status
  - orders.cancelled_at

events:
  - OrderCancelled

errors:
  - OrderNotFound
  - CannotCancelSettledOrder

sideEffects:
  - release inventory
  - request payment refund
```

这些都应是结构化字段，不只是自然语言段落。

---

## 第四步：使用 LLM 进行语义命名

LLM 不负责发明事实，只负责把已抽取事实解释成业务语言：

```YAML
rule:
  title: Settled orders cannot be cancelled
  formalCondition:
    action == CANCEL_ORDER && order.status == SETTLED
  outcome:
    reject with CannotCancelSettledOrder
```

这时 LLM 的输入应该只有相关 semantic slice，而不是整个文件或整个仓库。

---

## 第五步：通过测试和文档交叉验证

例如测试：

```TypeScript
it("rejects cancellation after settlement", ...)
```

可以强化结论：

```YAML
status: corroborated
evidence:
  - production-code
  - unit-test
```

如果 README 说可以取消，但源码禁止：

```YAML
status: conflicted
evidence:
  code: prohibits cancellation
  documentation: permits cancellation
```

系统不应该擅自选择一边。

---

# 4. 一个更可靠的数据模型

不要只保存 Understand Anything 风格的：

```JSON
{
  "businessRules": [
    "Settled orders cannot be cancelled"
  ]
}
```

应该保存：

```TypeScript
interface BusinessRule {
  id: string;
  domainId?: string;
  useCaseId: string;

  title: string;
  description?: string;

  ruleType:
    | "precondition"
    | "invariant"
    | "authorization"
    | "state-transition"
    | "calculation"
    | "temporal"
    | "consistency"
    | "compensation";

  condition?: LogicExpression;
  outcome: BusinessOutcome;

  status:
    | "observed"
    | "derived"
    | "inferred"
    | "confirmed"
    | "conflicted"
    | "deprecated";

  confidence: number;
  evidence: EvidenceRef[];

  introducedAt?: string;
  lastVerifiedCommit: string;
}
```

例如：

```JSON
{
  "id": "rule:order:settled-cannot-cancel",
  "useCaseId": "use-case:cancel-order",
  "title": "Settled orders cannot be cancelled",
  "ruleType": "state-transition",
  "condition": {
    "operator": "equals",
    "left": "order.status",
    "right": "SETTLED"
  },
  "outcome": {
    "type": "reject",
    "error": "CannotCancelSettledOrder"
  },
  "status": "observed",
  "confidence": 0.98,
  "evidence": [
    {
      "path": "src/domain/order.ts",
      "symbol": "Order.cancel",
      "range": [72, 84],
      "hash": "..."
    },
    {
      "path": "tests/order-cancel.test.ts",
      "range": [41, 62],
      "type": "test"
    }
  ]
}
```

---

# 5. 对你的整体架构，最合理的组合

不建议直接复制 Understand Anything 的：

```
Knowledge Graph summaries
→ LLM
→ Domain Graph
```

应该变成：

```
AST / SCIP / TypeChecker
        ↓
确定性 Code Graph
        ↓
Use-case Slicer
        ↓
CFG / rule / state / side-effect extraction
        ↓
Evidence-backed behavioral specification
        ↓
LLM semantic naming
        ↓
Domain / Capability / Flow projection
        ↓
Human confirmation
```

## 四个相互独立的产物

### 1. Code Graph

```
symbols
calls
imports
types
references
```

### 2. Behavior Graph

```
entrypoints
conditions
branches
state transitions
reads/writes
events
exceptions
side effects
```

### 3. Domain Graph

```
domains
capabilities
use cases
entities
rules
policies
workflows
```

### 4. Evidence Graph

```
code
tests
docs
Jira
Confluence
commits
runtime traces
human confirmation
```

连接方式：

```
UseCase IMPLEMENTED_BY Symbol
Rule ENFORCED_BY Guard
Rule VERIFIED_BY Test
Flow STARTS_AT Entrypoint
Step CAUSES StateTransition
Step EMITS Event
DomainRule DOCUMENTED_BY Requirement
```

---

# 6. 对 Understand Anything 值得借鉴和不该照搬的部分

## 值得借鉴

* Tree-sitter 和 LLM 分工
* 先构建结构图，再做语义分析
* `Domain → Flow → Step` 的展示模型
* 以入口点作为业务流程线索
* 增量更新
* Knowledge Graph 与 Domain Graph 分离
* 给业务角色提供独立视图

## 不该直接照搬

* 从文件摘要二次推导完整业务逻辑
* 把业务规则保存为无证据的字符串
* 用 LLM 决定流程顺序而不校验调用或控制流
* Domain 节点没有版本化证据
* 不区分 observed、inferred、confirmed
* 不显式建模异常、状态、事务、副作用和补偿
* 图 schema 正确就认为业务内容正确

---

## 最终判断

Understand Anything 目前的 business logic 分析，本质上是：

> **从入口、符号、调用关系和代码摘要中，由 LLM 归纳 Domain、Flow 和 Step。**

RepoAgent 和 DeepWiki 更偏向：

> **将代码转换成可读文档。**

Codebase-Memory 和 AST 图更偏向：

> **恢复代码结构和调用拓扑。**

Joern / CPG 更偏向：

> **恢复代码的真实控制和数据行为。**

真正可靠的 Business Logic Recovery 应当结合：

```
AST / SCIP
+ call graph
+ CFG / data flow
+ state and side-effect extraction
+ tests/docs/history
+ LLM semantic lifting
+ evidence/confidence/versioning
```

最关键的原则是：

> **LLM 可以命名、归类和解释 business logic，但不应该独立决定 business logic 的事实。事实必须来自可追溯的代码行为和其他证据。**
