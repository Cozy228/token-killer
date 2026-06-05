import { accessSync, constants, existsSync, statSync } from "node:fs";
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

// Remove every PATH entry equal to shimDir (path-normalized, OS-correct
// separator). Order of the remaining entries is preserved.
export function stripShimDir(pathVar: string | undefined, shimDir: string | undefined): string {
  if (!pathVar) return "";
  if (!shimDir) return pathVar;
  const target = normalizeEntry(shimDir);
  return pathVar
    .split(delimiter)
    .filter((entry) => entry !== "" && normalizeEntry(entry) !== target)
    .join(delimiter);
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
      if (isExecutableFile(candidate)) return candidate;
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
  const target = normalizeEntry(shimDir);

  if (resolved) {
    if (normalizeEntry(resolved).startsWith(target + sep) || normalizeEntry(resolved) === target) {
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
    throw new ShimRecursionError(
      `tk: cannot find real ${program} outside shim dir (${shimDir})`,
    );
  }
  // Genuinely not found anywhere — let the spawn surface ENOENT/127 as usual.
}
