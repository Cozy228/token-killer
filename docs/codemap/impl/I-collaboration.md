> **[2026-07-04 P28] PARTIALLY SUPERSEDED** — the `.tk/wiki.json` page-authoring control file (I-1/I-2/I-9) belongs to the retired wiki feature; the only JSONC control file now is `.ctx/push.jsonc` (`CTX-IMPL.md` §7). Still carried: I.0 solo-first rationale (D27), I-10 zero-egress impact brief, I-11 path-fencing + EBUSY-safe rm.

## 需求 I — Collaboration（协作：知识沉淀、控制文件、agent 写/人编辑往返、来源与陈旧度）

本节服务 Goal A（人类理解 + 协作），与 B 共线（agent 路径）的部分明确标注。所有决策遵守上游约束：节点/边/来源都来自 A 的单一 graph store（file:line on every node），B 的 per-field `provenance` 列（`static|llm|template`）；human 内容走文件不进 DB（与 C 的 DB-out-of-tree 一致）；交付面统一收敛到 F 的 VS Code 扩展（H 的只读 HTML viewer + I 的 native 文件往返都挂在它上面），CLI 为 secondary host（Claude Code）后端。冲突已按 DEP MAP 解析：DB 走 out-of-tree `~/.token-killer/projects/<fp>/index.db`，`.tk/` 只放 human 共享物 + gitignored staging；编辑面 Required（default on）= VS Code 原生文件 + watcher 写回（HTML viewer 保持只读）。

协作拆成 5 个可决策轴，tk 提交的子集（I.0）：**human-agent 为主面**；human-human 走 **git 异步**（共享已 commit 的 `.tk/` artifacts，非实时多光标）；**读 + 写双层**（只读理解默认 + 可编辑沉淀 opt-in）；三种协作子形态全部落成独立 repo 文件（control-file=人类权威 / annotation=人类知识块 / review-context=PR 影响）；**无自有 server / 无 egress / 无权限层**（继承 repo 的 git 权限）。否决项：实时 CRDT/websocket（与 no-server 强约束冲突，REJECTED）。

---

### 决策 I-1：`.tk/wiki.json` JSONC 控制文件 = 人类→agent 权威 steering（serves both surfaces）

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
  // D27: `tier` removed — no team layer; CAP_PAGES is a unified technical limit.
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

### 决策 I-2：硬上限，parse-time fail-loud（serves both surfaces）

**(1) 决策**（D27：删 tier:team，统一帽）：解析时强制硬上限，明确报错（非静默截断）：max pages = **30**（**统一技术安全限，无 team 层**——D27 删 `tier:team`）；max 合并 notes（`repo_notes` + 所有 `page_notes`）= **100**；max 每条 note = **10000** 字符；page titles 必须唯一且非空。违例：拒绝生成，打印 `tk: .tk/wiki.json exceeds cap (pages 34 > 30) — split into multiple wikis`，**exit 2**。帽不足时按真实质量/性能数据直接调 `CAP_PAGES`，不重引 tier。

**(2) 要动的文件**：`src/wiki/control.ts`（`validateCaps()`）；`tests/unit/wiki/control-caps.test.ts`。

**(3) 可抄代码**（tk-adapted，DeepWiki caps 来自 docs.devin.ai：30/80 enterprise→tk 用统一 30，100 notes，10k chars/note）：

```typescript
// src/wiki/control.ts — validateCaps（tk-adapted；caps 源 docs.devin.ai；D27 统一帽无 tier）
const CAP_PAGES = 30;
const CAP_NOTES_TOTAL = 100, CAP_NOTE_CHARS = 10000;

export function validateCaps(cf: ControlFile): void {
  const pageCap = CAP_PAGES;
  const pages = cf.pages ?? [];
  if (pages.length > pageCap)
    fail(`pages ${pages.length} > ${pageCap}`, 'split into multiple wikis');

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

### 决策 I-3：每页机器可校验 provenance + 行级深链（serves both surfaces）

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

### 决策 I-4：agent 写 / 人编辑往返 = proposed↔pages staging（serves both surfaces）

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

### 决策 I-5：人类编辑 300ms debounce 直写文件（serves the codeguide human surface）

**(1) 决策**：人类在 VS Code 原生编辑 `pages/*.html|md`，文件保存触发 **300ms** debounce 直接 `fs.writeFile` 写回**同一文件**（tk 无 server，用扩展 file-watcher 替代 Davia 的 `POST /api/content`）。编辑的是 agent 拥有的纯 HTML/markdown 文件之上的薄视图。**无 OT、无 merge**，单用户文件 last-write-wins —— 因为 proposed/live 拆分已杜绝 agent/人并发写同一路径。冲突解析（I↔H）：HTML viewer **保持只读**，可编辑往返作用于底层 `pages/*.md|html` 文件，用 VS Code 原生编辑器 + 扩展 watcher 写回，不自建 web 编辑器。

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

### 决策 I-6：子页 human 块 fence + verbatim round-trip + orphan 救援（serves the codeguide human surface）

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

### 决策 I-7：零 LLM 启发式 guided tours → committed `docs/ONBOARDING.md`（serves the codeguide human surface）

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

### 决策 I-8：per-page staleness = `git diff ∩ filePaths`，suggest-not-auto（serves both surfaces）

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

**(7) 证据回指**：RepoDoc `DocNode.version:int`（`docs/codemap/archive/research/codegraph-wiki-landscape-20260618.md:33`）；understand-anything `project.gitCommitHash`。

---

### 决策 I-9：`.tk/.gitignore` 拆 team-shared vs machine-local（serves both surfaces）

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

### 决策 I-10：PR/review context = 只读 `tk wiki impact <ref>`，零 GitHub egress（serves both surfaces）

**(1) 决策**：第三种协作子形态（review/PR context）以只读命令 `tk wiki impact <ref>` 交付（默认 `ref=HEAD~1..HEAD` 或一个 branch）：对 diff 内变更文件列出 (a) 哪些 wiki 页引用它们（page.filePaths 反查）、(b) 哪些其他源文件引用它们（来自 A 的 index call-graph）、(c) 标这些页 STALE。输出为可直接粘贴进 PR 描述的 markdown 块（英文）。`--comment`（发 GitHub PR 评论）**是 Unsupported（一项被拒绝的能力）**（无 user opt-in 不做 GitHub API egress）。复用已建 index：filePaths 反查 + call-graph，egress = 0。

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

**(4) 具体数值**：默认 ref = `HEAD~1..HEAD`；GitHub API egress = **0**（`--comment` 为 Unsupported）；输出语言 = 英文。

**(5) 有序步骤**：1. `computeImpact()`（filePaths 反查 + call-graph 反向）；2. `renderImpactMarkdown()`；3. `tk wiki impact` CLI；每步独立可测。

**(6) 测试**：fixture 改一个被某页引用的文件 → 断言该页在 `citedPages`；断言无任何网络调用（spy）；mock `callersOf` 验证 referencingFiles 去重且排除自身。

**(7) 证据回指**：GitNexus `impact`/`trace` 工具（证明需求，见 codegraph-wiki-landscape report）；A 的 call-graph 反向边为数据源。

---

### 决策 I-11：全文件 I/O 走路径围栏 + Windows EBUSY-safe rm（serves both surfaces）

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

- **"navigation-only，把可编辑往返排除出当前产品范围"（ADR 0013-0016 / 旧 design §navigation-only）被正面否决**：Anchor 2 令人类协作与 codemap (agent surface) 共线、明确**非次要 afterthought**，故可编辑往返（proposed↔pages + human-fence + 300ms 写回）为 Required capability。理由：navigation-only 只服务 codemap (agent surface)，丢掉 codeguide (human surface) 的一半。
- **"shared understanding = 只读 wiki" 旧框定被否决**：只读仅为默认层；可编辑沉淀（控制文件 + human-fence 块往返）是一等提交层。理由：人类写不回的知识在 session 间蒸发。
- **任何自有 server/telemetry 式协作后端倾向被否决**（telemetry-server-aws 是 metrics 不是 collab）：team-share = git commit `.tk/` artifacts，无 tk 自有 server/权限层。理由：违反 no-server/no-egress 强约束、且重复 git 已有权限模型。
- **DeepWiki（upstream reference）企业 80 页 cap 向下否决为 tk team 层 60**。理由：tk 面向单仓 project-local，非企业 wiki farm；60 令订阅付费的生成成本有界。

### Open Decisions（与全局 Open Decisions 对齐）

1. ~~**编辑面**（I Open Decision #1）~~ ✅ **闭合（D28 / [ADR 0038](../../adr/0038-codeguide-web-app-two-data-adapters.md)）**：**编辑整体 defer**（codeguide 暂只读，Web 编辑不做，`.tk/` 文件人类自有编辑器手编）——推翻 round-3「file-only writeback Required」。人类面 = 单一 Web App + 两数据适配器（`tk codeguide serve` Live loopback / `tk codeguide export` Snapshot 单文件）。
2. ~~**控制文件格式**~~ ✅ **闭合（D30，用户确认）**：**JSONC**（非 YAML；tk 已解析、可注释、VS Code 内可 schema-complete）。
3. ~~**`tk wiki impact --comment`**~~ ✅ **闭合（D27 / [ADR 0037](../../adr/0037-solo-first-collaboration-no-github-write-no-team-layer.md)）**：`--comment` **永久 Unsupported**（不建 GitHub 写适配器、保零-egress；要自动化用户自己 CI/脚本组合）。
4. ~~**team 层 gating**~~ ✅ **闭合（D27）**：**删 `tier:team`**——无 team 身份/权限/语义；统一 `CAP_PAGES=30`（技术安全限），不足按数据直接调帽。

### 与其它需求的耦合（coherence）

`file:line on every node`（A2/J1）是 human（H）、agent（F）、provenance（I.3）、trust（J）共用的单一信任原语；`provenance` 列（B1/J2）一列三用（检索过滤 + 边诚实 + 陈旧分类语境）；human content 走文件不进 DB（C 的 DB-out-of-tree）；交付：codeguide viewer host = **系统浏览器**（D28/D29），F 扩展是**启动入口**（deep-link 到 Live/Snapshot），**非** webview UI 宿主、**编辑 defer 故无 I 往返面**；staleness 由 E 的 lazy 检查驱动（非常驻 watcher，守住 Windows no-daemon 链）。

---

