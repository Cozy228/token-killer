/**
 * Host adapters for push-block placement (CTX-IMPL §7).
 *
 * The two-file floor (P28-verified): root `AGENTS.md` (Codex CLI, Copilot CLI,
 * VS Code Copilot) + root `CLAUDE.md` (Claude Code, also auto-read by both
 * Copilot hosts) covers all four hosts. Placement is idempotent: only the
 * region between the managed sentinels changes; every surrounding byte is
 * preserved. A missing file is created; an unchanged block is a no-op (openwiki
 * content-snapshot guard — never rewrite an identical block). NO writes ever
 * escape the project directory.
 *
 * MCP-config writes (server registration) are slice 1i, NOT here — this module
 * only owns the push instruction block.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";

/**
 * Managed-block matcher — tolerant of hand-edited marker whitespace so a block
 * a user reflowed is still recognized and replaced in place (matches the
 * memory-source echo-exclusion regex, kept independent to avoid a cross-import).
 */
const MANAGED_BLOCK_RE = /<!--\s*ctx:managed:begin\s*-->[\s\S]*?<!--\s*ctx:managed:end\s*-->/;

/** The two-file floor: files auto-loaded across all four hosts (§7 / P28). */
export const DEFAULT_PUSH_TARGETS: readonly string[] = ["AGENTS.md", "CLAUDE.md"];

export interface PlacementResult {
  /** Absolute path written (or inspected). */
  path: string;
  /** True when the file did not exist and was created. */
  created: boolean;
  /** True when a byte changed (false = no-op guard hit). */
  changed: boolean;
  /** UTF-8 byte length of the resulting file content. */
  bytes: number;
}

/** Extract the current managed block from a file's text, if present. */
export function extractManagedBlock(existing: string): string | undefined {
  const m = MANAGED_BLOCK_RE.exec(existing);
  return m ? m[0] : undefined;
}

/**
 * Compute the new file content with `block` installed. Pure — no I/O:
 * - existing block present → replace ONLY that region (prefix + suffix
 *   preserved byte-exact); identical block → `changed:false` (no-op guard);
 * - no block → append after existing content with minimal separation;
 * - empty input → the block plus a trailing newline (fresh file).
 */
export function applyManagedBlock(
  existing: string,
  block: string,
): { content: string; changed: boolean } {
  const m = MANAGED_BLOCK_RE.exec(existing);
  if (m) {
    if (m[0] === block) return { content: existing, changed: false };
    const start = m.index;
    const end = m.index + m[0].length;
    return { content: existing.slice(0, start) + block + existing.slice(end), changed: true };
  }
  if (existing.length === 0) return { content: `${block}\n`, changed: true };
  const sep = existing.endsWith("\n\n") ? "" : existing.endsWith("\n") ? "\n" : "\n\n";
  return { content: `${existing}${sep}${block}\n`, changed: true };
}

/** Refuse any target outside the project root (no writes escape the project). */
function assertWithinProject(projectRoot: string, filePath: string): void {
  const rel = relative(resolve(projectRoot), resolve(filePath));
  if (rel === "" || rel.startsWith("..") || isAbsolute(rel)) {
    throw new Error(`refusing to write a push block outside the project root: ${filePath}`);
  }
}

export interface WriteOptions {
  projectRoot: string;
  /** Inspect only — compute the result without touching disk (doctor/dry-run). */
  dryRun?: boolean;
}

/** Install `block` into a single file, idempotently and byte-preservingly. */
export function writeManagedBlock(
  filePath: string,
  block: string,
  opts: WriteOptions,
): PlacementResult {
  assertWithinProject(opts.projectRoot, filePath);
  const existed = existsSync(filePath);
  const existing = existed ? readFileSync(filePath, "utf8") : "";
  const { content, changed } = applyManagedBlock(existing, block);
  if (changed && !opts.dryRun) {
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, content);
  }
  return {
    path: filePath,
    created: !existed && changed,
    changed,
    bytes: Buffer.byteLength(content, "utf8"),
  };
}

export interface PlacePushOptions {
  /** Relative target filenames (default: the two-file floor). */
  targets?: readonly string[];
  dryRun?: boolean;
}

/**
 * Place the push block into the host instruction files under `projectRoot`
 * (default: the AGENTS.md + CLAUDE.md two-file floor). Returns one result per
 * target so a caller can report created/changed/no-op per file.
 */
export function placePushBlock(
  projectRoot: string,
  block: string,
  opts: PlacePushOptions = {},
): PlacementResult[] {
  const targets = opts.targets ?? DEFAULT_PUSH_TARGETS;
  return targets.map((t) =>
    writeManagedBlock(join(projectRoot, t), block, {
      projectRoot,
      ...(opts.dryRun !== undefined ? { dryRun: opts.dryRun } : {}),
    }),
  );
}
