/**
 * Pure markdown extractor (CTX-IMPL §5.3/§5.5) — deterministic, no I/O.
 *
 * Parses a markdown document into the raw records the docs SourceAdapter turns
 * into entities/claims/links:
 *   - frontmatter (`status/date/type/supersedes/amends` …)
 *   - a heading tree with slug chains and section SPANS (1-based inclusive)
 *   - glossary/definition-list entries (`**Term** — def` AND `**Term — def**`)
 *   - backticked mentions, path-classified for the v1 link layer (path-match)
 *
 * Fenced code blocks and the frontmatter region are excluded from heading /
 * glossary / mention scanning (a `# comment` inside a bash fence is not a
 * heading; a backtick inside a fence is not a mention).
 */

export interface Frontmatter {
  /** Raw key → value (first `:`-split, trimmed). YAML depth is out of scope. */
  fields: Record<string, string>;
  /** Line count consumed by the frontmatter block (0 when absent). */
  lineSpan: number;
}

export interface HeadingNode {
  level: number; // 1..6
  title: string; // rendered heading text (markdown stripped only of backticks)
  slug: string; // this heading's own slug
  slugChain: string; // ancestor slugs + self, joined by '/'
  startLine: number; // 1-based, the heading line
  endLine: number; // 1-based inclusive; section = subtree up to next heading level<=self
}

export interface GlossaryEntry {
  term: string;
  definition: string;
  line: number; // 1-based
}

export type MentionKind = "path" | "other";

export interface Mention {
  raw: string; // verbatim backtick content
  token: string; // extracted leading path token (`:line`/`#anchor` stripped)
  kind: MentionKind; // "path" participates in the v1 link layer; "other" waits for M2 symbols
  ext: string; // lowercased extension incl. dot (e.g. ".md"), or "" when none
  line: number; // 1-based
}

export interface ParsedMarkdown {
  frontmatter: Frontmatter;
  headings: HeadingNode[];
  glossary: GlossaryEntry[];
  mentions: Mention[];
  lineCount: number;
}

/** File extensions we treat as "this token names a file" when there is no slash. */
const KNOWN_FILE_EXTS: ReadonlySet<string> = new Set([
  ".md",
  ".markdown",
  ".mdx",
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".json",
  ".jsonc",
  ".sql",
  ".scm",
  ".wasm",
  ".py",
  ".go",
  ".rs",
  ".java",
  ".cs",
  ".rb",
  ".sh",
  ".toml",
  ".yaml",
  ".yml",
  ".txt",
  ".css",
  ".html",
]);

/** Doc extensions the docs source is authoritative for (§5.5 / P28). */
export const DOC_EXTS: ReadonlySet<string> = new Set([".md", ".markdown", ".mdx"]);

const ATX_HEADING = /^(#{1,6})\s+(.+?)\s*#*\s*$/;
const FENCE = /^\s*(```+|~~~+)/;

/** GitHub-style heading slug: lowercase, drop punctuation, spaces → hyphens. */
export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/`/g, "")
    .replace(/[^\w\s-]/g, "") // \w keeps digits + underscore
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

export function parseMarkdown(text: string): ParsedMarkdown {
  const lines = text.split("\n");
  const frontmatter = parseFrontmatter(lines);
  const headings: HeadingNode[] = [];
  const glossary: GlossaryEntry[] = [];
  const mentions: Mention[] = [];

  const stack: Array<{ level: number; slug: string }> = [];
  let inFence = false;
  let fenceMarker = "";

  for (let i = frontmatter.lineSpan; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const lineNo = i + 1;

    const fence = line.match(FENCE);
    if (fence) {
      const marker = fence[1] ?? "";
      if (!inFence) {
        inFence = true;
        fenceMarker = marker[0] ?? "`";
      } else if (marker[0] === fenceMarker) {
        inFence = false;
        fenceMarker = "";
      }
      continue;
    }
    if (inFence) continue;

    const heading = line.match(ATX_HEADING);
    if (heading) {
      const level = (heading[1] ?? "").length;
      const title = (heading[2] ?? "").trim();
      const slug = slugify(title);
      while (stack.length > 0 && (stack[stack.length - 1]?.level ?? 0) >= level) stack.pop();
      const chain = [...stack.map((s) => s.slug), slug].filter(Boolean).join("/");
      stack.push({ level, slug });
      headings.push({ level, title, slug, slugChain: chain, startLine: lineNo, endLine: lineNo });
      continue; // heading text is a title, not a mention/glossary source
    }

    const gloss = matchGlossary(line);
    if (gloss) glossary.push({ ...gloss, line: lineNo });

    for (const m of extractMentions(line, lineNo)) mentions.push(m);
  }

  computeSectionSpans(headings, lines.length);
  return { frontmatter, headings, glossary, mentions, lineCount: lines.length };
}

/** Section end = line before the next heading of level <= self (subtree), else EOF. */
function computeSectionSpans(headings: HeadingNode[], lastLine: number): void {
  for (let i = 0; i < headings.length; i++) {
    const self = headings[i]!;
    let end = lastLine;
    for (let j = i + 1; j < headings.length; j++) {
      if ((headings[j]?.level ?? 0) <= self.level) {
        end = (headings[j]?.startLine ?? lastLine + 1) - 1;
        break;
      }
    }
    self.endLine = Math.max(self.startLine, end);
  }
}

function parseFrontmatter(lines: string[]): Frontmatter {
  if ((lines[0] ?? "").trim() !== "---") return { fields: {}, lineSpan: 0 };
  const fields: Record<string, string> = {};
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (line.trim() === "---") return { fields, lineSpan: i + 1 };
    const colon = line.indexOf(":");
    if (colon > 0) {
      const key = line.slice(0, colon).trim();
      const value = line.slice(colon + 1).trim();
      if (key) fields[key] = value;
    }
  }
  return { fields: {}, lineSpan: 0 }; // unterminated block → not frontmatter
}

const GLOSSARY_TERM_MAX = 80;

/**
 * Match a definition-list / glossary line. Accepted shapes (§5.5 + the FABLE
 * decision-log P-entry style), keyed off an em-dash / en-dash / spaced-hyphen
 * separator after a leading bold run:
 *   `**Term** — definition`       (em-dash OUTSIDE the bold)
 *   `**Term — definition ...**`   (em-dash INSIDE the bold; P20-style)
 *   `**Term — definition ...`     (bold that WRAPS onto later lines; P27-style —
 *                                  the closing `**` never appears on this line)
 * The closing `**` (wherever it lands) is stripped from term/def. A bare
 * `**Warning:** ...` prose line has no separator, so it is NOT a glossary entry.
 */
export function matchGlossary(line: string): { term: string; definition: string } | undefined {
  const body = line.replace(/^\s*[-*]\s+/, "").trimStart(); // optional list bullet
  if (!body.startsWith("**")) return undefined;
  const afterOpen = body.slice(2);
  const sep = afterOpen.match(/(—|–| - )/);
  if (sep?.index === undefined) return undefined;
  const term = afterOpen
    .slice(0, sep.index)
    .replace(/\*\*\s*$/, "") // a closing `**` right after the term (`**Term** — …`)
    .trim();
  const definition = afterOpen
    .slice(sep.index)
    .replace(SEP_RE, "")
    .replace(/\*\*\s*$/, "") // a closing `**` at the end (`**Term — …**`)
    .trim();
  return acceptGlossary(term, definition);
}

const SEP_RE = /^\s*(—|–| - )\s*/;
function acceptGlossary(
  term: string,
  definition: string,
): { term: string; definition: string } | undefined {
  if (!term || term.length > GLOSSARY_TERM_MAX || !definition) return undefined;
  return { term, definition };
}

const INLINE_CODE = /`([^`\n]+)`/g;

function extractMentions(line: string, lineNo: number): Mention[] {
  const out: Mention[] = [];
  for (const match of line.matchAll(INLINE_CODE)) {
    const raw = match[1] ?? "";
    const classified = classifyMention(raw);
    if (classified) out.push({ raw, ...classified, line: lineNo });
  }
  return out;
}

/** Extract + classify the leading path token of a backtick span. */
export function classifyMention(raw: string): Omit<Mention, "raw" | "line"> | undefined {
  const firstTok = raw.trim().split(/\s+/)[0] ?? "";
  // Strip a trailing `:line`/`:line-col` and any `#anchor`.
  const token = firstTok.replace(/#.*$/, "").replace(/:\d+(?:-\d+)?$/, "");
  if (!token) return undefined;
  // Reject shell / glob / rev-qualified / external tokens: keep only clean paths.
  if (!/^[\w./-]+$/.test(token)) return { token, kind: "other", ext: extOf(token) };
  if (token.startsWith("~") || token.startsWith("/")) return { token, kind: "other", ext: "" };
  const ext = extOf(token);
  const hasSlash = token.includes("/");
  const namesFile = /[\w-]+\.[A-Za-z0-9]{1,8}$/.test(token) && KNOWN_FILE_EXTS.has(ext);
  const pathLike = hasSlash || namesFile;
  return { token, kind: pathLike ? "path" : "other", ext };
}

function extOf(token: string): string {
  const base = token.slice(token.lastIndexOf("/") + 1);
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(dot).toLowerCase() : "";
}
