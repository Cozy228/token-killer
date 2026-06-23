## 需求 D — Language coverage（提取路线、初始语言集、捕获模型、解析器生命周期阈值）

本节落实「一个图存储（A）由 WASM tree-sitter 填充」这条上游决策：D 是把 A2/A3 的 node/edge 字段填满的**符号来源层**。所有阈值取 codegraph 仓库实测常量，所有 per-language 捕获取 codegraph 的 config-object 原样。与上游冲突的统一裁决（Node 闸门 `>=22.5.0 <25.0.0` + 强制 `--liftoff-only` + vendored Node 24.x）在 D10 收口，并消解 A/C/L 之间的版本不一致。

代码全部已对照 `/tmp/tk-research/codegraph/` 克隆逐行核实后粘贴；凡 tk 适配处标注「已改写」。

---

### D1 — 提取路线 = web-tree-sitter (WASM) + tree-sitter-wasms 预编译语法，作为唯一核心；无 native 绑定、无 LSP-as-core　【服务：两者】

**(1) 决策**：核心提取器只用 `web-tree-sitter`（纯 JS 的 WASM runtime）加载 `tree-sitter-wasms` 的 `.wasm` 语法 blob，零 native build（无 node-gyp、无 C/C++ 工具链、无 per-arch 编译）。一套 artifact 跨 win32/darwin/linux × x64/arm64 通用。LSP/SCIP 降级为 D14 的可选互通缝（Outside current product scope），核心提取器不引入。此决策直接服务 Anchor 1（primary = VS Code Copilot on Windows）的零原生编译约束，且规避 tk 历史上的 EBUSY/AV/PATH 安装摩擦。

**(2) 要动的文件**（在 tk 仓内新建提取层，镜像 codegraph 目录结构）：
```
src/codemap/
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
1. 加依赖 + 建 `src/codemap/extraction/grammars.ts`，落 `initGrammars()` + `loadGrammarsForLanguages()`（独立可测）。
2. 落 `WASM_GRAMMAR_FILES` 映射 + `EXTENSION_MAP`（D2/D7 共用）。

**(6) 测试**：单测 fixture —— 对一份 `.ts` + 一份 `.py` 调 `loadGrammarsForLanguages(['typescript','python'])`，断言 `languageCache.size===2` 且 `getParser('typescript')!==null`；负向：故意指向坏 `.wasm`，断言 `unavailableGrammarErrors.has(lang)` 且函数不抛。

**(7) 证据回指**：`/tmp/tk-research/codegraph/src/extraction/grammars.ts:9-11,171-230`；`package.json:43-44`（`tree-sitter-wasms ^0.1.11` + `web-tree-sitter ^0.25.3`，已核实）。

---

### D2 — 初始语言集：22 语言注册、分 3 tier，tier-1 CI 闸门　【服务：两者】

**(1) 决策**：注册 22 语言但分级 ship。**tier-1（ship-blind，CI 必过）**：TypeScript, TSX, JavaScript, JSX, Python, Go, Rust, Java, C, C++, C#（11 个，覆盖 VS Code Copilot 的 web/TS-JS + Python + 企业 .NET/Java/Go/C++ 主力）。**tier-2**：PHP, Ruby, Swift, Kotlin, Scala。**tier-3 best-effort**：Dart, Lua, R, Objective-C, Luau, Pascal/Delphi。每新增语言 = 1 个 `.wasm` + 1 个 config-object，走同一管线，几乎零边际成本。tk ledger 只需 tier-1 green 即可发布。tier-1 为 Required（CI 必过）；tier-2/3 为 Optional at runtime。

**(2) 要动的文件**：`src/codemap/extraction/languages/index.ts`（EXTRACTORS barrel）；`src/codemap/extraction/grammars.ts`（`WASM_GRAMMAR_FILES` + `EXTENSION_MAP`）。

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

**(6) 测试**：tier-1 的 11 语言各 1 份最小 fixture（含 1 函数 + 1 类/结构），断言抽出预期 node 数与 kind；这 11 个进 `test:ci` 闸门。tier-2/3 走 best-effort（默认 test-light，见 Open Decisions）。

**(7) 证据回指**：`/tmp/tk-research/codegraph/src/extraction/languages/index.ts:31-54`；`grammars.ts:19-42`（已核实）。

---

### D3 — 捕获模型 = per-language 的 typed `LanguageExtractor` config-object，非裸 `.scm` 查询　【服务：两者】

**(1) 决策**：捕获用一个**类型化 config 对象**（node-type 字符串列表 + field-name 字符串 + 少量 quirk hooks），由一个通用核心 walker 按 config 分派；**不**用裸 tree-sitter `.scm` 查询文件。理由直接服务两个目标：服务 A（人/协作）—— 贡献者加一种语言 = 填一个可在 IDE 里跳转/调试的 typed 对象，把该语言的怪癖 hook 与证据注释就近放在一起，不必学 S-表达式；服务 B（token-opt）—— 正确的 kind 分类（TS 字段 vs 方法、Go receiver 链接）是 kind-过滤 signature-collapse 检索可信的前提。

**(2) 要动的文件**：`src/codemap/extraction/tree-sitter-types.ts`（接口定义）。

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

**(2) 要动的文件**：`src/codemap/extraction/index.ts`（主线程生命周期 + 常量）、`src/codemap/extraction/parse-worker.ts`（worker 内 reset + OOM 退出 + stderr 过滤）。

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

**(2) 要动的文件**：`src/codemap/extraction/grammars.ts`（`detectLanguage` + `looksLikeCpp` + `looksLikeObjc` + `isSourceFile`）。

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
> 注：codegraph 的 `EXTENSION_MAP`（grammars.ts:47-118，58 条）含 razor/svelte/vue/astro/liquid/xml 等框架标记扩展名。tk tier-1 **不**ship 这些 bespoke 框架提取器（见 D12），故 tk 的 `EXTENSION_MAP` 应裁剪为「tier-1/2/3 grammar 语言 + file-level-only(yaml/twig/properties)」子集。**已改写**：删去映射中 `'.cshtml'/'.razor'/'.svelte'/'.vue'/'.astro'/'.liquid'` 等无对应提取器（Unsupported）的条目。

**(4) 具体数值**：探嗅样本 = `source.substring(0, 8192)`（8192 字节）；仅 `.h` 走探嗅；其余纯扩展名决定。

**(5) 有序步骤**：
1. 落裁剪后的 `EXTENSION_MAP`（tier-1/2/3 + file-level-only）。
2. 落 `detectLanguage` + 两个 `.h` 探嗅器 + `isSourceFile`（同表派生）。

**(6) 测试**：`foo.h` 含 `class X {` → 断言 `detectLanguage==='cpp'`；含 `@interface` → `'objc'`；纯 C 头 → `'c'`。`isSourceFile('a.ts')===true`、`isSourceFile('a.png')===false`。

**(7) 证据回指**：`/tmp/tk-research/codegraph/src/extraction/grammars.ts:47-131,271-305`（已核实）。

---

### D8 — 语法加载 = 懒加载（仅项目内出现的语言）+ 顺序加载（禁并行）　【服务：两者】

**(1) 决策**：只编译项目里实际出现的语言的语法，懒加载；且必须**顺序**加载 —— 并行 `WasmLanguage.load()` 在 Node 20+ 命中 web-tree-sitter race（tree-sitter#2338），在 Windows 冷启动下也避免 AV 下的并发读突发。已加载 / 已知不可用的语言跳过。

**(2) 要动的文件**：`src/codemap/extraction/grammars.ts`（即 D1 的 `loadGrammarsForLanguages`，`for...await` 顺序循环 + `toLoad` 过滤已含此语义）。

**(3) 可抄代码**：见 **D1 的 `loadGrammarsForLanguages`** —— `toLoad` 过滤（present ∧ ¬cached ∧ ¬unavailable）+ `for (const lang of toLoad) await WasmLanguage.load(...)` 顺序循环即本决策的全部实现（源 `grammars.ts:184-230`，已核实，不重复粘贴）。

**(4) 具体数值**：并行度 = 1（严格顺序）；只加载 `unique(present langs) − cached − unavailable`。

**(5) 有序步骤**：随 D1 一并落地（同一函数）。

**(6) 测试**：spy `WasmLanguage.load`，喂一个纯 Python 项目语言集，断言只对 `python` 调一次、`typescript` 不被加载；断言两次 `WasmLanguage.load` 调用时序不重叠（顺序）。

**(7) 证据回指**：`/tmp/tk-research/codegraph/src/extraction/grammars.ts:184-230`（含 `#2338` 注释，已核实）。

---

### D9 — 对 tree-sitter-wasms 的 stale/broken ABI build，vendored 上游 `.wasm`（tier-1 强制 vendor C#）　【服务：两者】

**(1) 决策**：`tree-sitter-wasms` 落后上游时 vendor 上游 `.wasm`，从 `<pkg>/wasm/` 加载，其余仍 `require.resolve('tree-sitter-wasms/out/<file>')`。**tier-1 至少 vendor C#**（ABI-15 `c-sharp` 0.23.5，支持 primary constructor）—— ABI-13 build 把 `class Foo(...)` 解析成 ERROR 吞掉整个 class（#237），对企业 .NET target 是 must-fix。codegraph 还 vendor lua/luau/pascal/scala/r（ABI-13 Lua 在 web-tree-sitter 0.25 下损坏共享 WASM 堆）。

**(2) 要动的文件**：`src/codemap/extraction/wasm/`（放 vendored `.wasm`，至少 `tree-sitter-c_sharp.wasm`）；加载分叉已在 D1 的 `loadGrammarsForLanguages` 内（`path.join(__dirname,'wasm',...)` 分支）。

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

**(4) 具体数值**：tk tier-1 强制 vendor 集合 = `{csharp}`（1 个，`c_sharp.wasm` 约 5MB）；tier-2/3 的 `{lua, luau, pascal, scala, r}` 是 size-vs-correctness 选择（见 Open Decisions，默认随 codegraph 一并 vendor）。

**(5) 有序步骤**：
1. 把上游 `tree-sitter-c_sharp.wasm`(ABI-15, 0.23.5) 放进 `src/codemap/extraction/wasm/`。
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
- 关闭 A 的 Open Decision：A 把 WASM 是否 ship 留作 Open Decision，本节确认 WASM IS shipped（D1），故 L5/L7 的「core 是否 ship tree-sitter WASM」已定：Node 25 排除、`--liftoff-only` 必需。FTS5 由 L 的 vendored-Node bundle 自带覆盖；仅 npm-shim-on-user-Node 路径需 C7 的 LIKE-scan fallback。

**(2) 要动的文件**：`package.json`（`engines.node` 改 `>=22.5.0 <25.0.0`，当前是 `>=20`）；`src/codemap/extraction/wasm-runtime-flags.ts`（re-exec 守卫）；`src/codemap/bin/node-version-check.ts`（>=22.5 floor + 25 block banner）。

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

**(2) 要动的文件**：`src/codemap/extraction/languages/typescript.ts`、`python.ts`、`go.ts`。

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

**(1) 决策**：file-level-only 语言（yaml/twig/properties）存一个 file node、产 0 个 symbol node，但**计入 indexed 而非 skipped**（对 ledger 诚实）。tier-1 **不** ship Razor/Svelte/Vue/Liquid/MyBatis 这类 bespoke regex/委派提取器（codegraph 各 7–12KB，高维护、低 A/B 收益），Outside current product scope。

**(2) 要动的文件**：`src/codemap/extraction/grammars.ts`（`isFileLevelOnlyLanguage`）；通用 walker 内 no-symbol 分支。

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

**(2) 要动的文件**：`src/codemap/extraction/index.ts`（`DEFAULT_IGNORE_DIRS` + `DEFAULT_IGNORE_PATTERNS` + `MAX_FILE_SIZE`）。

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

### D14 — LSP/SCIP = 可选互通缝，ship 零 LSP / 零 SCIP　【服务：两者】

**(1) 决策**：WASM 提取器是**唯一**符号源，ship 零 LSP、零 SCIP。LSP（Serena 风格）的 compiler-grade def/ref + ~10× rename token 收益是真的，但 per-language LSP runtime install + warm-up 正是 Anchor 1 要规避的 Windows 摩擦，「disqualifies it as a core for a lightweight CLI」。secondary target（Claude Code/macOS）用户可能已装 gopls/rust-analyzer —— 留一条**有文档的缝（Optional at runtime；其运行时依赖按需启用）**，核心不 commit 任何东西。SCIP emit/consume 作为 Open Decision 的互通缝（Outside current product scope）。

**(2) 要动的文件**：当前无（不建 LSP/SCIP 文件）。Outside current product scope（预留扩展点）：`LanguageExtractor` 上一个 `extractor: 'wasm' | 'lsp'` 标记位（接口已可扩展，见 D3）。

**(3) 可抄代码**：当前无可抄代码（决策即「不做」）。互通缝（Outside current product scope）= **需实现时补**：gap = per-language `extractor` 标记 + LSP client 适配层 + SCIP protobuf reader/writer，均无对应物，待互通决策后实现。

**(4) 具体数值**：LSP=0、SCIP=0。

**(5) 有序步骤**：当前无步骤；记录 Open Decisions（见下）。

**(6) 测试**：当前无；回归断言 = grep 确认无 `vscode-languageserver` / `scip` 运行时依赖混入 deps。

**(7) 证据回指**：`docs/codemap/low-token-agent-research-compendium-20260618.md:293-325`（Serena ~4k vs ~38k token rename / SCIP per-language indexer 成本，dossier 引述）。

---

### 跨节绑定与 Open Decisions

- **Node 闸门统一**：`>=22.5.0 <25.0.0` + vendored Node 24.x + 强制 `--liftoff-only` 已由 D10 收口（A/C/L 原各自为 Open Decision，现已定）—— 请确认接受为单一跨需版本锚。
- **tier-2/3 CI 预算 / 语言集尾部** ✅ **闭合（D23，2026-06-22）**：PHP/Ruby/Swift/Kotlin（已在 tree-sitter-wasms 包、**零额外体积**）**保留作 best-effort 注册**，但**明确非目标覆盖**——`test-light`/fix-on-report、**不进 CI 闸门、无支持承诺**。**目标覆盖 = tier-1(11) + Razor**（CI 必过）。niche 的 lua/luau/pascal/scala/r 已舍（D#2，需 vendoring 有体积）。
- **框架/markup 提取器** ✅ **闭合（D23，grilling 2026-06-22 round 4）**：**仅 Razor 破例**——抄 codegraph `razor-extractor.ts`（280 LOC，dotnet 家族对 `@code{}/@{}` 内嵌 C# 做 regex 抽取，class/type 级、C# 语法缺失时优雅降级），服务企业 .NET/Blazor primary target。**Vue/Svelte 不做**（用户判定 web 只用 React）；**React = JSX/TSX 已是 tier-1 原生 tree-sitter 语法，零额外提取器**。`.vue/.svelte`（若有）→ file-level。
- **vendored-wasm 集合** ✅ **闭合（D23）**：**仅 vendor C#**（`tree-sitter-c_sharp.wasm` ~5.1MB，tier-1 .NET 必需）。lua/luau/pascal/scala/r **不 vendor**（缺语法→file-level 优雅降级）；语言集收紧为 tier-1 + Razor，舍长尾。
- **SCIP emit/consume 互通缝** ✅ **闭合（D23，2026-06-22）**：**仅 CONSUME，不 EMIT**。CONSUME = D16（读已有 `index.scip` 升级到 compiler-grade）；**不 EMIT** tk 自己的索引——无参考项目导出 SCIP、个人项目（D24）无外部消费方、纯投机生态互通 = YAGNI。EMIT 纯增量、不影响内部架构，将来真有消费方随时可补。

---

