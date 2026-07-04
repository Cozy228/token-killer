/**
 * Read-through resolvers per Locator type (CTX-IMPL §3). Index-not-copy: the
 * store holds addresses; text is read back from the source at serve time.
 *
 * Hardening (absorbed from understand-anything's file reader, per §3):
 * traversal defense (null bytes, absolute paths, `../` pre- AND post-normalize,
 * symlink-escape realpath containment), allowlist cross-check against the
 * store's known entity paths, size cap, binary sniff-reject.
 *
 * All recoverable failures are RETURN VALUES (ReadThroughResult.ok=false) —
 * serve turns them into success-shaped guidance (G-3); nothing here throws for
 * bad input.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, normalize, resolve, sep } from "node:path";
import type { Locator, ReadThroughResult } from "./types.ts";

export const READ_THROUGH_MAX_BYTES = 2 * 1024 * 1024; // 2 MiB cap
const BINARY_SNIFF_BYTES = 8192;

/** What the file resolver needs from the store (kept narrow for testability). */
export interface ReadThroughHost {
  projectRoot: string;
  /** Allowlist cross-check: is this project-relative path a known entity path? */
  isKnownEntityPath(path: string): boolean;
}

type ReadThroughFail = Extract<ReadThroughResult, { ok: false }>;

function fail(reason: ReadThroughFail["reason"], message: string): ReadThroughFail {
  return { ok: false, reason, message };
}

/**
 * Validate a project-relative path against the traversal defenses. Returns the
 * absolute on-disk path or a failure.
 */
export function resolveProjectPath(
  host: ReadThroughHost,
  path: string,
): { ok: true; abs: string } | Extract<ReadThroughResult, { ok: false }> {
  if (path.includes("\0")) return fail("traversal-rejected", "null byte in path");
  if (isAbsolute(path) || /^[a-zA-Z]:[\\/]/.test(path)) {
    return fail("traversal-rejected", "absolute paths are rejected; locators are project-relative");
  }
  if (path.split(/[\\/]/).includes("..")) {
    return fail("traversal-rejected", "'..' segments are rejected (pre-normalize)");
  }
  const normalized = normalize(path);
  if (normalized === ".." || normalized.startsWith(`..${sep}`)) {
    return fail("traversal-rejected", "path escapes the project root (post-normalize)");
  }
  if (!host.isKnownEntityPath(path)) {
    return fail("not-allowlisted", `not a known entity path in this store: ${path}`);
  }
  const abs = resolve(host.projectRoot, normalized);
  // Symlink escape: the real location must stay inside the (real) project root.
  let real: string;
  try {
    real = realpathSync(abs);
  } catch {
    return fail("not-found", `no such file: ${path}`);
  }
  const rootReal = realpathSync(host.projectRoot);
  if (real !== rootReal && !real.startsWith(rootReal + sep)) {
    return fail("traversal-rejected", "resolved path escapes the project root (symlink)");
  }
  return { ok: true, abs: real };
}

function sniffBinary(buf: Buffer): boolean {
  const end = Math.min(buf.length, BINARY_SNIFF_BYTES);
  for (let i = 0; i < end; i++) if (buf[i] === 0) return true;
  return false;
}

export function readFileLocator(
  host: ReadThroughHost,
  locator: Extract<Locator, { t: "file" }>,
): ReadThroughResult & { fullText?: string } {
  const resolved = resolveProjectPath(host, locator.path);
  if (!resolved.ok) return resolved;
  let size: number;
  try {
    size = statSync(resolved.abs).size;
  } catch {
    return fail("not-found", `no such file: ${locator.path}`);
  }
  if (size > READ_THROUGH_MAX_BYTES) {
    return fail("too-large", `${locator.path} is ${size} bytes (cap ${READ_THROUGH_MAX_BYTES})`);
  }
  const buf = readFileSync(resolved.abs);
  if (sniffBinary(buf))
    return fail("binary", `${locator.path} looks binary; read-through serves text`);
  const fullText = buf.toString("utf8");
  let text = fullText;
  if (locator.span) {
    const [start, end] = locator.span; // 1-based inclusive
    text = fullText
      .split("\n")
      .slice(Math.max(0, start - 1), end)
      .join("\n");
  }
  // drift is decided by the caller (content_hash lives on the entity row).
  return { ok: true, text, drift: false, via: "file", fullText };
}

const OID_RE = /^[0-9a-f]{4,64}$/i;

export function readGitLocator(
  projectRoot: string,
  locator: Extract<Locator, { t: "git" }>,
): ReadThroughResult {
  if (!OID_RE.test(locator.oid)) return fail("bad-oid", `not a git object id: ${locator.oid}`);
  try {
    const text = execFileSync("git", ["cat-file", "-p", locator.oid], {
      cwd: projectRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 10_000,
      maxBuffer: READ_THROUGH_MAX_BYTES,
    });
    return { ok: true, text, drift: false, via: "git" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("maxBuffer"))
      return fail("too-large", `git object ${locator.oid} exceeds the read cap`);
    return fail("not-found", `git object not found: ${locator.oid}`);
  }
}

export function readSnapshotLocator(): ReadThroughResult {
  // Network-carrier snapshots land at M4 (CTX-IMPL §9); recoverable, not an error.
  return fail("unsupported", "snapshot locators land at M4");
}
