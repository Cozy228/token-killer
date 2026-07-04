/**
 * Docs / decisions SourceAdapter (CTX-IMPL §4/§5.3/§5.5, slice 1e).
 *
 * Lands: markdown/frontmatter/ADR/glossary extraction, two-tier mention
 * resolution, link layer v1 (explicit-key + path-match), and reason-classified
 * stale-suspect conflicts. Symbol-match, cross-generation `target-removed`, and
 * `referencer-changed` staleness need M2 symbol hashes / incremental history and
 * are deliberately NOT attempted here (P28 addenda).
 *
 * Classification precedence (P28): frontmatter `type:` → path convention
 * (`docs/adr|decisions/`, `*.adr.md`) → H1 heading heuristic; the applied rule
 * is disclosed in provenance (entity `attrs.classifiedBy` + a `classified-as`
 * claim).
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from "node:fs";
import { basename, isAbsolute, join, normalize, relative, resolve, sep } from "node:path";
import type { Store } from "../store/store.ts";
import { blake2bHex } from "../store/hash.ts";
import type { EntityKind } from "../store/types.ts";
import type { Budget, DirtyReport, IngestResult, SourceAdapter } from "./adapter.ts";
import { MAX_FILE_SIZE, isIgnoredDir } from "./ignore.ts";
import { DOC_EXTS, parseMarkdown, slugify, type ParsedMarkdown } from "../extract/markdown.ts";

const SOURCE = "docs" as const;
const MD_EXTS: ReadonlySet<string> = new Set([".md", ".markdown", ".mdx"]);
const YIELD_EVERY = 1000; // scans yield to the event loop every N dir entries (§4.2)

interface ScannedFile {
  path: string; // project-relative, forward-slashed
  abs: string;
  size: number;
  mtimeMs: number;
}

interface FileState {
  size: number;
  mtimeMs: number;
  hash: string;
}

interface DirtyFile extends ScannedFile {
  hash: string;
}

interface DocsDirtyDetail {
  /** Next per-file state map to persist on a successful publish. */
  next: Record<string, FileState>;
  dirtyFiles: DirtyFile[];
  deleted: string[];
}

/** A path-like mention awaiting resolution in phase 2. */
interface PendingMention {
  src: string; // referencing file entity id
  refPath: string;
  token: string;
  ext: string;
  line: number;
}

/** An `amends`/`supersedes` frontmatter reference awaiting ADR-number resolution. */
interface PendingKeyLink {
  src: string; // referencing decision entity id
  predicate: "amends" | "supersedes";
  adrNumber: string; // zero-padded, as written
}

interface PathIndex {
  exact: Map<string, string>; // project-relative path → file entity id
  basename: Map<string, Set<string>>; // basename → file entity ids
}

export class DocsAdapter implements SourceAdapter {
  readonly id = SOURCE;
  /** Docs are cheap relative to code; a touch more than git's cursor count. */
  readonly cost = 3;

  async dirtyCheck(store: Store): Promise<DirtyReport> {
    const files = await scanMarkdown(store.projectRoot);
    const prev = readState(store);
    const next: Record<string, FileState> = {};
    const dirtyFiles: DirtyFile[] = [];
    const seen = new Set<string>();

    for (const f of files) {
      seen.add(f.path);
      const p = prev[f.path];
      if (p && p.size === f.size && p.mtimeMs === f.mtimeMs) {
        next[f.path] = p; // (size, mtime) match → unchanged, no content hash needed (§4.2)
        continue;
      }
      // (size, mtime) mismatch → confirm with a content hash before calling it dirty.
      const hash = safeHash(f.abs);
      next[f.path] = { size: f.size, mtimeMs: f.mtimeMs, hash };
      if (!p || p.hash !== hash) dirtyFiles.push({ ...f, hash });
      // p && p.hash === hash → cosmetic touch (mtime moved, bytes identical): NOT dirty.
    }
    const deleted = Object.keys(prev).filter((path) => !seen.has(path));
    const detail: DocsDirtyDetail = { next, dirtyFiles, deleted };
    return {
      source: SOURCE,
      dirty: dirtyFiles.length > 0 || deleted.length > 0,
      magnitude: dirtyFiles.length + deleted.length,
      detail,
    };
  }

  async ingest(store: Store, dirty: DirtyReport, budget: Budget): Promise<IngestResult> {
    const detail = dirty.detail as DocsDirtyDetail;
    const gen = store.beginGeneration(SOURCE);

    const index: PathIndex = { exact: new Map(), basename: new Map() };
    const mentions: PendingMention[] = [];
    const keyLinks: PendingKeyLink[] = [];
    const adrByNumber = new Map<string, string>();
    const counts = { entities: 0, claims: 0 };

    // Phase 1: extract entities from every dirty file (all files on first run).
    for (const f of detail.dirtyFiles) {
      let content: string;
      try {
        content = readFileSync(f.abs, "utf8");
      } catch {
        continue; // vanished between dirtyCheck and ingest — a later refresh re-checks
      }
      const parsed = parseMarkdown(content);
      extractFile(store, f, content, parsed, gen, index, mentions, keyLinks, adrByNumber, counts);
      if (budget.now() >= budget.deadline) {
        // M1 docs corpora are small; a pass is atomic (resolution needs the full
        // entity set). We finish the pass rather than publish a torn generation.
      }
    }

    // Phase 2: two-tier mention resolution → references links / stale-suspects.
    resolveMentions(store, mentions, index, gen, counts);
    // Phase 3: explicit-key links (supersedes/amends) once all ADR ids are known.
    resolveKeyLinks(store, keyLinks, adrByNumber, gen, counts);

    store.setCursor(SOURCE, JSON.stringify(detail.next), budget.now(), gen);
    store.publishGeneration(SOURCE);
    return { source: SOURCE, complete: true, entities: counts.entities, claims: counts.claims };
  }
}

// --------------------------------------------------------------------------
// Extraction
// --------------------------------------------------------------------------

interface Classification {
  kind: "decision" | "doc";
  rule: "frontmatter-type" | "path-convention" | "heading-heuristic" | "default";
}

export function classifyDoc(
  relPath: string,
  frontmatter: ParsedMarkdown["frontmatter"],
  headings: ParsedMarkdown["headings"],
): Classification {
  const type = frontmatter.fields.type?.trim().toLowerCase();
  if (type === "decision" || type === "adr") return { kind: "decision", rule: "frontmatter-type" };
  if (type) return { kind: "doc", rule: "frontmatter-type" };
  if (/(^|\/)docs\/(adr|decisions)\//.test(relPath) || relPath.endsWith(".adr.md")) {
    return { kind: "decision", rule: "path-convention" };
  }
  const h1 = headings.find((h) => h.level === 1);
  if (h1 && /\b(ADR|decision|RFC)\b/i.test(h1.title)) {
    return { kind: "decision", rule: "heading-heuristic" };
  }
  return { kind: "doc", rule: "default" };
}

const ADR_NUMBER = /(?:^|\/)docs\/adr\/(\d+)-/;
const FRONTMATTER_LINK_KEYS = ["supersedes", "amends"] as const;

function extractFile(
  store: Store,
  f: DirtyFile,
  content: string,
  parsed: ParsedMarkdown,
  gen: number,
  index: PathIndex,
  mentions: PendingMention[],
  keyLinks: PendingKeyLink[],
  adrByNumber: Map<string, string>,
  counts: { entities: number; claims: number },
): void {
  const relPath = f.path;
  const lines = content.split("\n");
  const fileId = `file:${relPath}`;

  store.upsertEntity({
    id: fileId,
    kind: "file",
    name: basename(relPath),
    locator: { t: "file", path: relPath },
    contentHash: f.hash,
    attrs: {},
    gen,
  });
  counts.entities++;
  index.exact.set(relPath, fileId);
  addBasename(index, basename(relPath), fileId);

  const h1 = parsed.headings.find((h) => h.level === 1);
  const cls = classifyDoc(relPath, parsed.frontmatter, parsed.headings);
  const fm = parsed.frontmatter.fields;

  store.ftsIndex(fileId, { name: basename(relPath), text: h1?.title ?? "", kind: "file" });

  for (const h of parsed.headings) {
    const isDecisionHead = cls.kind === "decision" && h === h1;
    const kind: EntityKind = isDecisionHead ? "decision" : "doc_section";
    const id = isDecisionHead ? `adr:${relPath}#${h.slug}` : `doc:${relPath}#${h.slugChain}`;
    const sectionText = lines.slice(h.startLine - 1, h.endLine).join("\n");

    const attrs: Record<string, unknown> = { level: h.level };
    if (isDecisionHead) {
      attrs.classifiedBy = cls.rule;
      for (const [k, v] of Object.entries(fm)) attrs[`fm:${k}`] = v;
    }
    store.upsertEntity({
      id,
      kind,
      name: h.title,
      locator: { t: "file", path: relPath, span: [h.startLine, h.endLine] },
      contentHash: blake2bHex(sectionText),
      attrs,
      gen,
    });
    counts.entities++;
    store.ftsIndex(id, { name: h.title, text: sectionText, kind });

    if (isDecisionHead) {
      // Classification provenance (P28): the applied rule is a recorded claim.
      store.addClaim({
        subject: id,
        predicate: "classified-as",
        object: "decision",
        carrier: "files",
        locus: cls.rule,
        method: cls.rule === "frontmatter-type" ? "explicit-key" : "structural",
        authority: "observed",
        gen,
      });
      counts.claims++;
      for (const [k, v] of Object.entries(fm)) {
        store.addClaim({
          subject: id,
          predicate: `frontmatter:${k}`,
          object: v,
          carrier: "files",
          locus: relPath,
          method: "explicit-key",
          authority: "observed",
          gen,
        });
        counts.claims++;
      }
      const adrNum = relPath.match(ADR_NUMBER)?.[1];
      if (adrNum) adrByNumber.set(adrNum, id);
      for (const key of FRONTMATTER_LINK_KEYS) {
        for (const num of parseAdrRefs(fm[key])) {
          keyLinks.push({ src: id, predicate: key, adrNumber: num });
        }
      }
    }
  }

  // Glossary / definition-list entries → concept entities (searchable, §5.5).
  for (const g of parsed.glossary) {
    const slug = slugify(g.term);
    if (!slug) continue;
    const id = `concept:${relPath}#${slug}`;
    store.upsertEntity({
      id,
      kind: "concept",
      name: g.term,
      locator: { t: "file", path: relPath, span: [g.line, g.line] },
      contentHash: blake2bHex(g.definition),
      attrs: { term: g.term },
      gen,
    });
    counts.entities++;
    store.ftsIndex(id, { name: g.term, text: g.definition, kind: "concept" });
    store.addClaim({
      subject: id,
      predicate: "defines",
      object: g.term,
      carrier: "files",
      locus: `${relPath}#L${g.line}`,
      method: "explicit-key",
      authority: "derived",
      gen,
    });
    counts.claims++;
  }

  for (const m of parsed.mentions) {
    if (m.kind === "path") {
      mentions.push({ src: fileId, refPath: relPath, token: m.token, ext: m.ext, line: m.line });
    }
  }
}

function parseAdrRefs(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((s) => s.trim().match(/(\d+)/)?.[1] ?? "")
    .filter(Boolean);
}

// --------------------------------------------------------------------------
// Resolution (link layer v1 + stale-suspects)
// --------------------------------------------------------------------------

function resolveMentions(
  store: Store,
  mentions: PendingMention[],
  index: PathIndex,
  gen: number,
  counts: { entities: number; claims: number },
): void {
  for (const m of mentions) {
    const resolved = resolveTarget(index, m.token);
    if (resolved && resolved.dst !== m.src) {
      const claimId = store.addClaim({
        subject: m.src,
        predicate: "references",
        object: resolved.dst,
        carrier: "files",
        locus: `${m.refPath}#L${m.line}`,
        method: "path-match",
        authority: "derived",
        gen,
      });
      counts.claims++;
      store.setLink({
        src: m.src,
        dst: resolved.dst,
        predicate: "references",
        method: "path-match",
        confidence: resolved.confidence,
        claimId,
      });
      continue;
    }
    if (resolved) continue; // resolved to itself — ignore

    // Unresolved. The docs source only adjudicates DOC-tree targets in M1; a
    // code-target mention (e.g. `foo.ts`) waits for the code source (M2), never
    // a false stale-suspect. A doc-target mention that is absent on disk is a
    // genuine dead reference → never-resolved stale-suspect.
    const isDocTarget = DOC_EXTS.has(m.ext) || m.token.startsWith("docs/");
    if (!isDocTarget) continue;
    if (pathExistsInProject(store.projectRoot, m.token)) continue; // present, just not indexed

    const mentionClaim = store.addClaim({
      subject: m.src,
      predicate: "mentions",
      object: m.token,
      carrier: "files",
      locus: `${m.refPath}#L${m.line}`,
      method: "path-match",
      authority: "derived",
      gen,
    });
    const reasonClaim = store.addClaim({
      subject: m.src,
      predicate: "stale-reason",
      object: "never-resolved",
      carrier: "files",
      locus: m.token,
      method: "path-match",
      authority: "derived",
      gen,
    });
    counts.claims += 2;
    store.addConflict(mentionClaim, reasonClaim, "stale-suspect");
  }
}

/** Two-tier resolution: exact relative path (1.0) → unique basename (0.6). */
function resolveTarget(
  index: PathIndex,
  token: string,
): { dst: string; confidence: number } | undefined {
  const exact = index.exact.get(token);
  if (exact) return { dst: exact, confidence: 1.0 };
  const set = index.basename.get(basename(token));
  if (set && set.size === 1) return { dst: [...set][0]!, confidence: 0.6 };
  return undefined;
}

function resolveKeyLinks(
  store: Store,
  keyLinks: PendingKeyLink[],
  adrByNumber: Map<string, string>,
  gen: number,
  counts: { entities: number; claims: number },
): void {
  for (const link of keyLinks) {
    const dst = adrByNumber.get(link.adrNumber) ?? adrByNumber.get(String(Number(link.adrNumber)));
    if (!dst || dst === link.src) continue;
    const claimId = store.addClaim({
      subject: link.src,
      predicate: link.predicate,
      object: dst,
      carrier: "files",
      locus: link.adrNumber,
      method: "explicit-key",
      authority: "observed",
      gen,
    });
    counts.claims++;
    store.setLink({
      src: link.src,
      dst,
      predicate: link.predicate,
      method: "explicit-key",
      confidence: 1.0,
      claimId,
    });
  }
}

// --------------------------------------------------------------------------
// Scan + helpers
// --------------------------------------------------------------------------

function addBasename(index: PathIndex, base: string, id: string): void {
  const set = index.basename.get(base) ?? new Set<string>();
  set.add(id);
  index.basename.set(base, set);
}

function readState(store: Store): Record<string, FileState> {
  const cursor = store.getCursor(SOURCE);
  if (!cursor?.position) return {};
  try {
    return JSON.parse(cursor.position) as Record<string, FileState>;
  } catch {
    return {};
  }
}

function safeHash(abs: string): string {
  try {
    return blake2bHex(readFileSync(abs, "utf8"));
  } catch {
    return "";
  }
}

/**
 * Tracked + untracked-but-not-ignored paths from git (`ls-files -co
 * --exclude-standard`), forward-slashed and relative to `root`. Returns
 * `undefined` when `root` is not a git work tree or git is unavailable —
 * callers then skip .gitignore filtering (the D13 name-set still applies).
 *
 * Why: the docs scan is a filesystem walk, so without this a dev checkout's
 * git-ignored local material (research dumps, scratch plans) gets indexed —
 * observed on the living fixture as a 3.4× store bloat and 7× dirtyCheck
 * slowdown. Sources index the PROJECT, and .gitignore is the project's own
 * definition of "not the project".
 */
function gitVisibleSet(root: string): Set<string> | undefined {
  try {
    const out = execFileSync("git", ["ls-files", "-co", "--exclude-standard"], {
      cwd: root,
      encoding: "utf8",
      timeout: 15_000,
      maxBuffer: 64 * 1024 * 1024,
      stdio: ["ignore", "pipe", "ignore"],
    });
    return new Set(out.split("\n").filter(Boolean));
  } catch {
    return undefined;
  }
}

/** Fast path for git work trees: the visible list IS the file list — stat the
 *  markdown entries directly instead of walking every directory. The D13
 *  name-set still applies per path segment (a repo that tracks a vendored
 *  build dir keeps it out of the index either way). */
async function scanFromGitList(root: string, visible: Set<string>): Promise<ScannedFile[]> {
  const out: ScannedFile[] = [];
  let seen = 0;
  for (const rel of visible) {
    if (++seen % YIELD_EVERY === 0) await new Promise<void>((r) => setImmediate(r));
    const ext = rel.slice(rel.lastIndexOf(".")).toLowerCase();
    if (!MD_EXTS.has(ext)) continue;
    if (rel.split("/").some((seg) => isIgnoredDir(seg))) continue;
    const abs = join(root, rel);
    let st: import("node:fs").Stats;
    try {
      st = statSync(abs);
    } catch {
      continue; // listed but deleted from the working tree
    }
    if (!st.isFile() || st.size > MAX_FILE_SIZE) continue;
    out.push({ path: rel, abs, size: st.size, mtimeMs: st.mtimeMs });
  }
  out.sort((a, b) => a.path.localeCompare(b.path));
  return out;
}

/** Recursive markdown scan honoring the D13 ignore-set + .gitignore (in git
 *  work trees); yields every 1000 entries. */
export async function scanMarkdown(root: string): Promise<ScannedFile[]> {
  const visible = gitVisibleSet(root);
  if (visible !== undefined) return scanFromGitList(root, visible);
  const out: ScannedFile[] = [];
  let seen = 0;
  const stack: string[] = [root];
  while (stack.length > 0) {
    const dir = stack.pop()!;
    let entries: import("node:fs").Dirent[];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (++seen % YIELD_EVERY === 0) await new Promise<void>((r) => setImmediate(r));
      const abs = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === ".git" || isIgnoredDir(entry.name)) continue;
        stack.push(abs);
        continue;
      }
      if (!entry.isFile()) continue;
      const ext = entry.name.slice(entry.name.lastIndexOf(".")).toLowerCase();
      if (!MD_EXTS.has(ext)) continue;
      let st: import("node:fs").Stats;
      try {
        st = statSync(abs);
      } catch {
        continue;
      }
      if (st.size > MAX_FILE_SIZE) continue; // D4 size ceiling
      const rel = relative(root, abs).split(sep).join("/");
      out.push({ path: rel, abs, size: st.size, mtimeMs: st.mtimeMs });
    }
  }
  out.sort((a, b) => a.path.localeCompare(b.path)); // deterministic order
  return out;
}

/** Does `token` resolve to an existing file inside the project root? Safe by construction. */
function pathExistsInProject(root: string, token: string): boolean {
  if (token.startsWith("~") || isAbsolute(token) || token.includes("\0")) return false;
  if (token.split(/[\\/]/).includes("..")) return false;
  const abs = resolve(root, normalize(token));
  let rootReal: string;
  try {
    rootReal = realpathSync(root);
  } catch {
    return false;
  }
  if (abs !== resolve(rootReal) && !abs.startsWith(rootReal + sep) && !abs.startsWith(root + sep)) {
    return false;
  }
  return existsSync(abs);
}
