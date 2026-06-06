// Scope-aware context-file discovery (goal "Discovery", ADR 0003). Bounded path
// set, split by scope: user-level is the DEFAULT (global context loads into every
// session); project-level is opt-in under --project. Read-only path resolution.

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, relative, resolve, sep } from "node:path";

import type { ContextAdapter, ContextScope, ContextSurface } from "./types.js";

export type DiscoveredFile = {
  path: string; // absolute
  display: string; // relative for project, ~-style for user
  surface: ContextSurface;
  adapter: ContextAdapter;
  scope: ContextScope;
  always_on: boolean; // loaded into every session for its scope
};

export type DiscoveryResult = {
  files: DiscoveredFile[];
  truncated: boolean;
};

const MAX_FILES = 200;

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "target",
  "coverage",
  ".next",
  ".token-killer",
]);

function safeStatFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

// Recursively collect files matching `predicate`, skipping dependency/build dirs.
function walk(
  dir: string,
  predicate: (absPath: string, name: string) => boolean,
  out: string[],
  budget: { remaining: number },
): void {
  if (budget.remaining <= 0) return;
  let entries: import("node:fs").Dirent[];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (budget.remaining <= 0) return;
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(abs, predicate, out, budget);
    } else if (entry.isFile() && predicate(abs, entry.name)) {
      out.push(abs);
      budget.remaining -= 1;
    }
  }
}

function userDisplay(home: string, path: string): string {
  return path.startsWith(home) ? `~${path.slice(home.length)}` : path;
}

// ── User-level scope ──────────────────────────────────────────────────────────

export function discoverUserFiles(
  home: string,
  budget: { remaining: number },
): DiscoveredFile[] {
  const files: DiscoveredFile[] = [];
  const add = (
    path: string,
    surface: ContextSurface,
    adapter: ContextAdapter,
    always_on: boolean,
  ) => {
    if (budget.remaining <= 0) return;
    if (!safeStatFile(path)) return;
    files.push({
      path,
      display: userDisplay(home, path),
      surface,
      adapter,
      scope: "user",
      always_on,
    });
    budget.remaining -= 1;
  };

  add(join(home, ".claude", "CLAUDE.md"), "agent_instructions", "claude", true);
  add(join(home, ".copilot", "copilot-instructions.md"), "copilot_instructions", "copilot", true);

  // Copilot custom-instruction dirs (AGENTS.md + path instructions).
  const dirsEnv = process.env.COPILOT_CUSTOM_INSTRUCTIONS_DIRS;
  if (dirsEnv) {
    for (const dir of dirsEnv.split(":").filter(Boolean)) {
      const agentsMd = join(dir, "AGENTS.md");
      add(agentsMd, "agent_instructions", "copilot", true);
      const instrDir = join(dir, ".github", "instructions");
      if (existsSync(instrDir)) {
        const found: string[] = [];
        walk(instrDir, (_p, name) => name.endsWith(".instructions.md"), found, budget);
        for (const p of found) {
          files.push({
            path: p,
            display: userDisplay(home, p),
            surface: "path_instructions",
            adapter: "copilot",
            scope: "user",
            always_on: false,
          });
        }
      }
    }
  }

  // User-level Claude skills.
  const skillsDir = join(home, ".claude", "skills");
  for (const entry of listSubdirs(skillsDir)) {
    add(join(entry, "SKILL.md"), "skill", "claude", false);
  }

  return files;
}

function listSubdirs(dir: string): string[] {
  if (!existsSync(dir)) return [];
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => join(dir, e.name));
  } catch {
    return [];
  }
}

// ── Project-level scope ───────────────────────────────────────────────────────

type ProjectCandidate = {
  // Glob-ish kind handled explicitly below.
  surface: ContextSurface;
  adapter: ContextAdapter;
  always_on: boolean;
};

export function discoverProjectFiles(
  cwd: string,
  budget: { remaining: number },
): DiscoveredFile[] {
  const files: DiscoveredFile[] = [];
  const seen = new Set<string>();
  const add = (
    absPath: string,
    surface: ContextSurface,
    adapter: ContextAdapter,
    always_on: boolean,
  ) => {
    if (budget.remaining <= 0) return;
    const abs = resolve(absPath);
    if (seen.has(abs) || !safeStatFile(abs)) return;
    seen.add(abs);
    files.push({
      path: abs,
      display: relative(cwd, abs) || abs,
      surface,
      adapter,
      scope: "project",
      always_on,
    });
    budget.remaining -= 1;
  };

  // Fixed root candidates.
  add(join(cwd, ".github", "copilot-instructions.md"), "copilot_instructions", "copilot", true);
  add(join(cwd, "AGENTS.md"), "agent_instructions", "copilot", true);
  add(join(cwd, "CLAUDE.md"), "agent_instructions", "claude", true);
  add(join(cwd, "GEMINI.md"), "agent_instructions", "gemini", true);

  // Globbed directories.
  const globs: Array<[string, (name: string) => boolean, ProjectCandidate]> = [
    [
      join(cwd, ".github", "instructions"),
      (n) => n.endsWith(".instructions.md"),
      { surface: "path_instructions", adapter: "copilot", always_on: false },
    ],
    [
      join(cwd, ".github", "prompts"),
      (n) => n.endsWith(".prompt.md"),
      { surface: "prompt_file", adapter: "vscode", always_on: false },
    ],
    [
      join(cwd, ".github", "agents"),
      (n) => n.endsWith(".agent.md"),
      { surface: "custom_agent", adapter: "vscode", always_on: false },
    ],
  ];
  for (const [dir, pred, cand] of globs) {
    if (!existsSync(dir)) continue;
    const found: string[] = [];
    walk(dir, (_p, name) => pred(name), found, budget);
    for (const p of found) add(p, cand.surface, cand.adapter, cand.always_on);
  }

  // Nested AGENTS.md (non-always-on for nested dirs).
  const nestedAgents: string[] = [];
  walk(cwd, (_p, name) => name === "AGENTS.md", nestedAgents, budget);
  for (const p of nestedAgents) {
    const isRoot = resolve(p) === resolve(join(cwd, "AGENTS.md"));
    add(p, "agent_instructions", "copilot", isRoot);
  }

  // Project Claude skills.
  for (const entry of listSubdirs(join(cwd, ".claude", "skills"))) {
    add(join(entry, "SKILL.md"), "skill", "claude", false);
  }

  return files;
}

// ── Combined entry point ──────────────────────────────────────────────────────

export function discoverContextFiles(opts: {
  scopes: ContextScope[];
  home?: string;
  cwd?: string;
}): DiscoveryResult {
  const home = opts.home ?? homedir();
  const cwd = opts.cwd ?? process.cwd();
  const budget = { remaining: MAX_FILES };
  const files: DiscoveredFile[] = [];

  if (opts.scopes.includes("user")) files.push(...discoverUserFiles(home, budget));
  if (opts.scopes.includes("project")) files.push(...discoverProjectFiles(cwd, budget));

  return { files, truncated: budget.remaining <= 0 };
}

// ── Project fingerprint (git identity) ───────────────────────────────────────

// hash of git remote origin URL when present, else git toplevel path, else cwd.
// Only the hash is stored, never the raw path (goal "Discovery"). Two clones of
// the same remote share one report.
// True when `cwd` is inside a git work tree — the signal that there is a
// project worth optimizing at the project scope (off-git, optimize stays
// user-only).
export function isGitProject(cwd: string): boolean {
  try {
    const out = execFileSync("git", ["rev-parse", "--is-inside-work-tree"], {
      cwd,
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
    return out === "true";
  } catch {
    return false;
  }
}

export function contextProjectFingerprint(cwd: string): string {
  let identity = "";
  try {
    identity = execFileSync("git", ["config", "--get", "remote.origin.url"], {
      cwd,
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
  } catch {
    identity = "";
  }
  if (!identity) {
    try {
      identity = execFileSync("git", ["rev-parse", "--show-toplevel"], {
        cwd,
        stdio: ["ignore", "pipe", "ignore"],
      })
        .toString()
        .trim();
    } catch {
      identity = "";
    }
  }
  if (!identity) identity = resolve(cwd);
  const hash = createHash("sha256").update(identity).digest("hex").slice(0, 12);
  return `repo:${hash}`;
}

// Read a discovered file defensively. Returns undefined on any read error so a
// single unreadable file never aborts a scan.
export function readContextFile(path: string): string | undefined {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return undefined;
  }
}

export { SKIP_DIRS, MAX_FILES, sep };
