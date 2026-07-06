/**
 * Claude Code host memory importer (CTX-IMPL §5.6; P28 official-docs verified).
 *
 * Source layout (confirmed official): `~/.claude/projects/<project-slug>/memory/`
 * with a `MEMORY.md` index + one markdown file per topic. Each topic file =
 * one `memory` entity; the store IS the source of truth for memory gist/detail
 * (the index-not-copy EXCEPTION, §2), so the locator is `{t:'store'}`.
 *
 * Rules honoured here:
 * - imports are always `authority: inferred`, `origin: host-import:claude-code`;
 * - echo exclusion strips ctx-managed sentinel blocks (A1-echo);
 * - gists are hard-capped at 240 chars (store invariant) — the curated
 *   MEMORY.md index gist is preferred, then frontmatter `description`, then the
 *   first heading/line;
 * - re-import is idempotent (deterministic ULID from host+relpath → upsert);
 * - within-host near-duplicates emit `sameAsCandidate` links only (never a
 *   destructive merge, §5.6/P21).
 *
 * G-7: this reads the REAL `~/.claude` memory dir but only ever WRITES to the
 * (sandboxed in tests) store passed in — it never writes under `~/.claude`.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import type { Store } from "../store/store.ts";
import { fuzzyDuplicate } from "./dedup.ts";
import { refoldMemory } from "./fold.ts";
import { hasSentinel, stripSentinelBlocks } from "./sentinel.ts";
import { deterministicUlid, memoryId } from "./ulid.ts";

export const MEMORY_GIST_MAX_CHARS = 240;
const MEMORY_SOURCE = "memory";
const HOST = "claude-code";
const INDEX_FILE = "MEMORY.md";

export interface ImportOptions {
  /** Directory that contains `.claude` (default: os homedir()). Tests inject. */
  claudeHome?: string;
  /**
   * Candidate project roots to slug into a Claude project dir, tried in order.
   * Default: the store's current checkout root then its main (worktree) root —
   * so a worktree resolves to the shared project's memory (§3 worktree rule).
   */
  projectRoots?: string[];
  now?: () => number;
}

export interface ImportReport {
  host: typeof HOST;
  memoryDir: string | undefined;
  /** Entity ids written (idempotent — re-import upserts these same ids). */
  written: string[];
  entities: number;
  /** Files skipped because they were empty after echo exclusion. */
  skipped: number;
  /** sameAsCandidate links emitted between near-duplicate imported gists. */
  candidates: number;
  gen: number | undefined;
}

/**
 * Claude Code encodes a project's absolute path as its `projects/` dir name by
 * replacing every non-alphanumeric char with '-' (observed:
 * `/Users/ziyu/Workspace/token-killer` → `-Users-ziyu-Workspace-token-killer`).
 */
export function claudeProjectSlug(absPath: string): string {
  return absPath.replace(/[^a-zA-Z0-9]/g, "-");
}

/** First existing `~/.claude/projects/<slug>/memory` dir across candidate roots. */
export function resolveClaudeMemoryDir(
  claudeHome: string,
  projectRoots: string[],
): string | undefined {
  const seen = new Set<string>();
  for (const root of projectRoots) {
    const dir = join(claudeHome, ".claude", "projects", claudeProjectSlug(root), "memory");
    if (seen.has(dir)) continue;
    seen.add(dir);
    if (existsSync(dir)) return dir;
  }
  return undefined;
}

interface ParsedFile {
  frontmatter: Record<string, string>;
  body: string;
}

/** Split a leading `--- … ---` YAML block (shallow key: value) from the body. */
export function parseFrontmatter(text: string): ParsedFile {
  const match = /^---\n([\s\S]*?)\n---\n?/.exec(text);
  if (!match) return { frontmatter: {}, body: text };
  const frontmatter: Record<string, string> = {};
  for (const line of (match[1] as string).split("\n")) {
    const kv = /^([A-Za-z0-9_]+):\s*(.*)$/.exec(line);
    if (kv) frontmatter[kv[1] as string] = (kv[2] as string).trim().replace(/^["']|["']$/g, "");
  }
  return { frontmatter, body: text.slice(match[0].length) };
}

/** Parse MEMORY.md into a map of topic-filename → curated one-line gist. */
export function parseMemoryIndex(indexText: string): Map<string, string> {
  const out = new Map<string, string>();
  const link = /\[[^\]]+\]\(([^)]+?\.md)(?:#[^)]*)?\)\s*(.*)$/;
  for (const raw of indexText.split("\n")) {
    const line = raw.replace(/^[-*]\s*/, "").trim();
    const m = link.exec(line);
    if (!m) continue;
    const file = basename(m[1] as string);
    const gist = (m[2] as string).replace(/^[—–:-]\s*/, "").trim();
    if (gist.length > 0 && !out.has(file)) out.set(file, gist);
  }
  return out;
}

/** Collapse to one line, strip sentinels, hard-cap at 240 chars on a word edge. */
export function toGist(raw: string): string {
  const clean = stripSentinelBlocks(raw).replace(/\s+/g, " ").trim();
  if (clean.length <= MEMORY_GIST_MAX_CHARS) return clean;
  const cut = clean.slice(0, MEMORY_GIST_MAX_CHARS - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > 40 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

function deriveName(frontmatter: Record<string, string>, body: string, file: string): string {
  if (frontmatter.name) return frontmatter.name;
  const heading = /^#+\s+(.+)$/m.exec(body);
  if (heading) return stripSentinelBlocks(heading[1] as string).trim();
  return basename(file, ".md");
}

function firstBodyLine(body: string): string {
  let headingFallback = "";
  for (const line of stripSentinelBlocks(body).split("\n")) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    if (trimmed.startsWith("#")) {
      // Prefer a real sentence over a heading (which usually equals the name).
      if (headingFallback.length === 0) headingFallback = trimmed.replace(/^#+\s*/, "").trim();
      continue;
    }
    return trimmed;
  }
  return headingFallback;
}

/**
 * Import all Claude Code memory topic files into `store`. Idempotent: re-running
 * upserts the same entity ids. Returns a structured report (no throw for the
 * "no memory dir" case — that is a clean no-op).
 */
export function importClaudeCodeMemory(store: Store, opts: ImportOptions = {}): ImportReport {
  const claudeHome = opts.claudeHome ?? homedir();
  const projectRoots = opts.projectRoots ?? [store.projectRoot, store.mainRoot];
  const memoryDir = resolveClaudeMemoryDir(claudeHome, projectRoots);
  if (!memoryDir) {
    return {
      host: HOST,
      memoryDir: undefined,
      written: [],
      entities: 0,
      skipped: 0,
      candidates: 0,
      gen: undefined,
    };
  }

  const index = existsSync(join(memoryDir, INDEX_FILE))
    ? parseMemoryIndex(readFileSync(join(memoryDir, INDEX_FILE), "utf8"))
    : new Map<string, string>();

  const files = readdirSync(memoryDir)
    .filter((f) => f.endsWith(".md") && f !== INDEX_FILE)
    .sort();

  const gen = store.beginGeneration(MEMORY_SOURCE);
  const written: string[] = [];
  const gistById = new Map<string, string>();
  let skipped = 0;

  for (const file of files) {
    const abs = join(memoryDir, file);
    const rawText = readFileSync(abs, "utf8");
    const { frontmatter, body } = parseFrontmatter(rawText);
    const cleanBody = stripSentinelBlocks(body).trim();

    // Prefer the curated index gist, then frontmatter description, then body.
    const gistSource = index.get(file) ?? frontmatter.description ?? firstBodyLine(body) ?? "";
    const gist = toGist(gistSource);

    // Pure-echo / empty after exclusion → skip (A1-echo negative path).
    if (gist.length === 0 && cleanBody.length === 0) {
      skipped++;
      continue;
    }

    const mtimeMs = Math.floor(statSync(abs).mtimeMs);
    const id = memoryId(deterministicUlid(mtimeMs, `${HOST}:${file}`));
    const detail = cleanBody.length > 0 ? cleanBody : undefined;

    // Defensive: nothing carrying a sentinel may ever be persisted (A1-echo).
    const safeGist = hasSentinel(gist) ? stripSentinelBlocks(gist) : gist;
    const safeDetail = detail && hasSentinel(detail) ? stripSentinelBlocks(detail) : detail;

    store.upsertEntity({
      id,
      kind: "memory",
      name: deriveName(frontmatter, body, file),
      locator: { t: "store" },
      sourceRev: frontmatter.date,
      attrs: { host: HOST, sourceFile: file, memoryType: frontmatter.type ?? "note" },
      gen,
    });
    store.writeMemory({
      entityId: id,
      gist:
        safeGist.length > 0
          ? safeGist
          : deriveName(frontmatter, body, file).slice(0, MEMORY_GIST_MAX_CHARS),
      detail: safeDetail,
      origin: `host-import:${HOST}`,
      sessionRef: frontmatter.originSessionId,
      authority: "inferred",
      // A3/D8: host auto-memory is unreviewed by construction — it lands as
      // `needs-review` and is drained via the review queue, never served as a
      // clean current fact or pushed until a human confirms it.
      status: "needs-review",
    });
    // The `create` event carries the landing status so the fold reproduces
    // `needs-review` on any rebuild (A3/E3). E3's overlay landing zone is slice 4.
    // F2: append it ONCE — a re-import of an unchanged file (same deterministic
    // id) must NOT add a duplicate later-`at` create that would re-flip a
    // human-confirmed import back to needs-review. `writeMemory` (F2b) already
    // preserves the cached status on conflict, so this is the second guard.
    if (!store.memoryEvents(id).some((e) => e.verb === "create")) {
      store.appendMemoryEvent({
        memoryId: id,
        verb: "create",
        actor: `host:${HOST}`,
        refs: { status: "needs-review" },
        carrier: `host:${HOST}`,
        method: "structural",
        authority: "inferred",
        // `at` omitted → store clock, consistent with lifecycle events so a later
        // human confirm always total-orders after this create.
      });
      refoldMemory(store, id, gen); // materialize the cache from the new event
    }
    store.ftsIndex(id, {
      name: deriveName(frontmatter, body, file),
      text: `${safeGist} ${safeDetail ?? ""}`.trim(),
      kind: "memory",
    });
    store.internHandle(id);
    written.push(id);
    gistById.set(id, safeGist);
  }

  // Within-host near-duplicate detection → sameAsCandidate (never a merge).
  let candidates = 0;
  const ids = [...gistById.keys()];
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = ids[i] as string;
      const b = ids[j] as string;
      if (!fuzzyDuplicate(gistById.get(a) as string, gistById.get(b) as string).candidate) continue;
      const claimId = store.addClaim({
        subject: a,
        predicate: "sameAsCandidate",
        object: b,
        carrier: `host:${HOST}`,
        method: "semantic-proposal",
        authority: "inferred",
        gen,
      });
      store.setLink({
        src: a,
        dst: b,
        predicate: "sameAsCandidate",
        method: "semantic-proposal",
        confidence: 0.5,
        claimId,
      });
      // D4/D2: also file the dedup as a `sameAsCandidate` CONFLICT so it is
      // visible in the conflicts channel, not just as a low-confidence link. The
      // reciprocal claim lets the conflict surface whether a OR b is selected.
      const reverseClaimId = store.addClaim({
        subject: b,
        predicate: "sameAsCandidate",
        object: a,
        carrier: `host:${HOST}`,
        method: "semantic-proposal",
        authority: "inferred",
        gen,
      });
      store.addConflict(claimId, reverseClaimId, "sameAsCandidate");
      candidates++;
    }
  }

  store.publishGeneration(MEMORY_SOURCE);
  return { host: HOST, memoryDir, written, entities: written.length, skipped, candidates, gen };
}
