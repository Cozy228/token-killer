// Slice 1 — Direct-tool governance (DESIGN §3.2, §11 L2).
//
// Direct tool actions (`read_file`, `grep_search`, `list_dir`, …) cannot be
// RTK-rewritten — there is no shell to prefix. The hook only GOVERNS them: it may
// deny a high-cost read or suggest narrowing a search. It never compresses a
// result (that needs `modifiedResult`, deferred) and never rewrites the call.
//
// Decision is the internal verdict (CONTEXT.md → Decision). English reasons —
// they are emitted to the host, but the goal mandates English in code/output.

import type { ToolEvent } from "./normalize.js";

export type Decision = {
  decision: "allow" | "deny" | "rewrite" | "suggest";
  rewritten_command?: string;
  reason?: string;
  // A short hint the host injects into the turn (Copilot `additionalContext`).
  // Used by prompt governance and failure recovery; never carries source/log text.
  additional_context?: string;
};

// Deterministically-irrelevant directories whose contents almost never add
// evidence and are expensive to read (DESIGN §3.2, CONTEXT.md → Noise-removal).
const DEPENDENCY_DIRS = [
  "node_modules",
  "dist",
  "build",
  "target",
  "coverage",
  ".git",
];

const LOCKFILES = new Set([
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "npm-shrinkwrap.json",
  "cargo.lock",
  "poetry.lock",
  "gemfile.lock",
  "composer.lock",
  "go.sum",
  "pdm.lock",
  "uv.lock",
]);

function normalizePath(p: string): string {
  return p.replace(/\\/g, "/").replace(/^\.\//, "");
}

function basename(p: string): string {
  const parts = normalizePath(p).split("/").filter(Boolean);
  return parts[parts.length - 1] ?? "";
}

function isInDependencyDir(p: string): boolean {
  const segments = normalizePath(p).split("/").filter(Boolean);
  return segments.some((seg) => DEPENDENCY_DIRS.includes(seg));
}

function isLockfile(p: string): boolean {
  return LOCKFILES.has(basename(p).toLowerCase());
}

// Extract the primary path/target a direct tool acts on. Hosts disagree on the
// key; probe the common ones across both dialects.
function extractPath(input: Record<string, unknown>): string | undefined {
  for (const key of ["filePath", "file_path", "path", "file", "dirPath", "directory", "target", "uri"]) {
    const value = input[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return undefined;
}

// A search is repo-wide when it has no narrowing scope: no path, or a path that
// is the repo root (".", "./", "", "/") — expensive and noisy (DESIGN §3.2).
function isRepoWideSearch(input: Record<string, unknown>): boolean {
  const path = extractPath(input);
  const include = input.includePattern ?? input.include ?? input.glob;
  if (typeof include === "string" && include.trim().length > 0) return false;
  if (path === undefined) return true;
  const norm = normalizePath(path).trim();
  return norm === "" || norm === "." || norm === "/" || norm === "./";
}

// Govern a direct tool action. Fail-open by default (allow); only an explicit
// high-cost pattern produces deny/suggest.
export function governDirectTool(ev: ToolEvent): Decision {
  if (ev.category === "read" || ev.category === "list") {
    const path = extractPath(ev.toolInput);
    if (path && isInDependencyDir(path)) {
      return {
        decision: "deny",
        reason: `${path} is inside a dependency/build directory (node_modules/dist/build/target/coverage/.git); reading it is high-cost and rarely adds evidence. Read source instead.`,
      };
    }
    if (path && isLockfile(path)) {
      return {
        decision: "deny",
        reason: `${path} is a lockfile; it is large and not human-evidence. Read the manifest (package.json/pyproject.toml) instead.`,
      };
    }
  }

  if (ev.category === "search" && isRepoWideSearch(ev.toolInput)) {
    return {
      decision: "suggest",
      reason: "Repo-wide search is high-cost; scope it to a directory or file type and exclude generated dirs (node_modules, dist, .git).",
    };
  }

  return { decision: "allow" };
}
