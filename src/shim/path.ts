import { createHash } from "node:crypto";
import { accessSync, constants, existsSync, readdirSync, realpathSync, statSync } from "node:fs";
import { delimiter, join, normalize, sep } from "node:path";

// The shim places wrapper executables (a file named `git` that runs `tk git`)
// ahead of the real tools on PATH. When `tk` then spawns the real tool it must
// NOT re-resolve to the wrapper, or it would fork-bomb shim→tk→shim. This module
// is the recursion guard (ADR 0002 §4): strip the shim dir from the child PATH
// and sentinel-check that the resolved tool does not still land in the shim dir.

export class ShimRecursionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ShimRecursionError";
  }
}

// Normalize a PATH entry for comparison: drop trailing separators and (on
// Windows) compare case-insensitively. node's normalize() collapses `.`/`..`
// and unifies separators.
function normalizeEntry(entry: string): string {
  let normalized = normalize(entry);
  // Strip a single trailing separator so `dir/` and `dir` compare equal.
  if (normalized.length > 1 && normalized.endsWith(sep)) {
    normalized = normalized.slice(0, -1);
  }
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

// Canonicalize a path for comparison: resolve symlinks via realpath, then
// normalize. Best-effort — realpathSync throws on a non-existent path, so fall
// back to the lexical normalize. This closes the recursion-guard bypass (audit
// #10): a PATH entry that reaches the shim dir through a symlink (a symlinked
// tools dir, a symlinked $HOME, or macOS `/var`→`/private/var`) is NOT equal to
// the canonical shim path lexically, so without realpath it survives the strip and
// the child re-resolves the wrapper through the alias → fork bomb.
function canonicalize(entry: string): string {
  try {
    return normalizeEntry(realpathSync(entry));
  } catch {
    return normalizeEntry(entry);
  }
}

// A (device, inode) identity for a directory, following symlinks (including
// symlinked PARENT components — macOS `/var`→`/private/var`, a symlinked $HOME).
// Returns null when the path does not exist. One `statSync` syscall, far cheaper
// than realpathSync's per-component lstat + readlink chain — this runs once per
// PATH entry on the shim's hot path (every wrapped command), so it must be cheap.
function dirIdentity(entry: string): string | null {
  try {
    const s = statSync(entry);
    // ino is 0 / unreliable on some Windows filesystems (FAT, certain network
    // shares). Treat that as "no stable identity" so two unrelated dirs both
    // reporting ino 0 are never falsely matched and stripped — the lexical check
    // still covers the common case; only realpath-class symlink aliasing goes
    // undetected on such a filesystem.
    if (!s.ino) return null;
    return `${s.dev}:${s.ino}`;
  } catch {
    return null;
  }
}

// Remove every PATH entry that resolves to shimDir (after symlink + path
// normalization, OS-correct separator). Order of the remaining entries is
// preserved. The lexical check runs first (fast common case); the (dev,inode)
// check only decides entries the lexical pass let through — catching symlinked
// aliases of the shim dir (audit #10) without realpath's readlink chains.
export function stripShimDir(pathVar: string | undefined, shimDir: string | undefined): string {
  if (!pathVar) return "";
  if (!shimDir) return pathVar;
  const lexicalTarget = normalizeEntry(shimDir);
  const targetIdentity = dirIdentity(shimDir);
  return pathVar
    .split(delimiter)
    .filter((entry) => {
      if (entry === "") return false;
      if (normalizeEntry(entry) === lexicalTarget) return false;
      // Only entries that survived the lexical check pay a stat; an entry sharing
      // the shim dir's device+inode is the same directory via a symlink/alias.
      return !(targetIdentity !== null && dirIdentity(entry) === targetIdentity);
    })
    .join(delimiter);
}

// Fingerprint the binary-resolution environment — the shim-stripped PATH plus
// PATHEXT — so a baked TK_REAL_BIN (2.1) is trusted ONLY while that environment is
// byte-identical to install time. If the user reorders or extends PATH (or PATHEXT)
// after install, a DIFFERENT binary may now win the lookup; the hash changes, the
// gate fails, and tk falls back to a live walk instead of running the stale baked
// path the shell would no longer pick. Pass the SAME stripped PATH both sides:
// install hashes `stripShimDir(PATH, shimDir)`, runtime hashes the child PATH
// `buildChildPath()` already produced — so an unchanged PATH yields a match.
export function hashResolutionEnv(strippedPath: string): string {
  // NUL field separator built via fromCharCode so the source file holds no literal
  // NUL byte (which would make git/rg treat it as binary); only the runtime string
  // contains the NUL — which can never appear in a PATH entry or PATHEXT.
  const FIELD_SEP = String.fromCharCode(0);
  const material = `${strippedPath}${FIELD_SEP}${process.env.PATHEXT ?? ""}`;
  return createHash("sha256").update(material).digest("hex").slice(0, 16);
}

function isExecutableFile(fullPath: string): boolean {
  try {
    if (!statSync(fullPath).isFile()) return false;
  } catch {
    return false;
  }
  if (process.platform === "win32") {
    // On Windows, presence with a known extension is enough (the caller appends
    // PATHEXT candidates); there is no execute bit to check.
    return true;
  }
  try {
    accessSync(fullPath, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

// Walk strippedPath for the executable named `program`. Respects PATHEXT on
// Windows. Returns the absolute resolved path or null if not found.
export function resolveReal(program: string, strippedPath: string): string | null {
  // An explicit path (absolute or containing a separator) is used as-is.
  if (program.includes("/") || program.includes("\\")) {
    return isExecutableFile(program) || existsSync(program) ? program : null;
  }

  const entries = strippedPath.split(delimiter).filter((entry) => entry !== "");
  const extensions =
    process.platform === "win32"
      ? (process.env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD").split(";").filter(Boolean)
      : [""];

  for (const dir of entries) {
    for (const ext of extensions) {
      const candidate = join(dir, program + ext);
      if (isExecutableFile(candidate)) {
        // Windows PATHEXT entries are upper-case (`.EXE`), so `program + ext` builds
        // `node.EXE` while the real on-disk name (what process.execPath reports) is
        // `node.exe`. Recover the actual filename casing via a case-insensitive dir
        // match so a baked path compares equal to execPath and cache keys stay stable.
        // We fix only the BASENAME and keep `dir` exactly as the caller passed it —
        // realpathSync would also expand 8.3 short names / symlinks, breaking callers
        // that compare against an un-canonicalized dir.
        if (process.platform === "win32") {
          try {
            const want = (program + ext).toLowerCase();
            const real = readdirSync(dir).find((f) => f.toLowerCase() === want);
            if (real) return join(dir, real);
          } catch {
            /* unreadable dir — fall through to the constructed candidate */
          }
        }
        return candidate;
      }
    }
  }
  return null;
}

// Build the child PATH for a spawned real tool: strip TK_SHIM_DIR (if set) so we
// never re-resolve to a wrapper. Returns the original PATH unchanged when no
// shim dir is configured (the non-shim, plain-`tk` case).
export function buildChildPath(): string {
  const pathVar = process.env.PATH ?? "";
  const shimDir = process.env.TK_SHIM_DIR;
  if (!shimDir) return pathVar;
  return stripShimDir(pathVar, shimDir);
}

// Sentinel (ADR 0002 §4): after stripping, the resolved tool must NOT live inside
// the shim dir. If it does — or it is unresolvable while a shim-dir copy of the
// program still exists — resolving the real tool is impossible without recursing,
// so throw and let the caller fail toward a clear error instead of fork-bombing.
export function assertNoRecursion(program: string, strippedPath: string): void {
  const shimDir = process.env.TK_SHIM_DIR;
  if (!shimDir) return;
  if (program.includes("/") || program.includes("\\")) return;

  const resolved = resolveReal(program, strippedPath);
  // Compare canonical paths (audit #10): a tool resolved through a symlinked alias
  // of the shim dir must still be recognised as living inside it.
  const target = canonicalize(shimDir);

  if (resolved) {
    const resolvedCanonical = canonicalize(resolved);
    if (resolvedCanonical === target || resolvedCanonical.startsWith(target + sep)) {
      throw new ShimRecursionError(
        `tk: refusing to run ${program}: resolved inside shim dir (${shimDir})`,
      );
    }
    return;
  }

  // resolved is null. If a shim-dir copy of the program exists, the only thing on
  // PATH was the wrapper and stripping it left nothing — running would recurse.
  const shimCopy = resolveReal(program, shimDir);
  if (shimCopy) {
    throw new ShimRecursionError(`tk: cannot find real ${program} outside shim dir (${shimDir})`);
  }
  // Genuinely not found anywhere — let the spawn surface ENOENT/127 as usual.
}
