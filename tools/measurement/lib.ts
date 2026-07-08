/**
 * Shared helpers for the R1 afternoon A/B measurement harness.
 *
 * Authority: docs/design/measurement/MEASUREMENT-DESIGN.md (RATIFIED 2026-07-06, P32).
 * This code lives OUTSIDE the published packages (tools/measurement/) and never
 * imports from `packages/` — it drives the `ctx` CLI as a black-box subprocess,
 * exactly as a maintainer would (F2: ctx has no global bin / stale dist, so it is
 * run from source via tsx; see `runCtx`).
 *
 * Deviation log: tools/measurement/implementation-notes.md.
 */
import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Repo root = two levels up from tools/measurement/. Resolved from THIS file so
 *  the scripts work from any cwd (distributed-field: no hard-coded box paths). */
export const WORKSPACE = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const CLI_ENTRY = join(WORKSPACE, "packages", "cli", "src", "cli.ts");
/** Absolute tsx ESM loader — `node --import tsx` does NOT resolve from a foreign
 *  cwd (ESM ignores NODE_PATH), so we pin the loader by absolute file URL. */
export const TSX_LOADER = join(WORKSPACE, "node_modules", "tsx", "dist", "loader.mjs");

/** Base tools BOTH arms share (design §4 table). Arm B ADDS the three mcp tools —
 *  the base is identical so the only delta is ctx presence (T2 / A4). */
export const BASE_TOOLS = ["Bash", "Edit", "Read", "Write", "Grep", "Glob"] as const;
/** ctx's three MCP tools (arm B only). */
export const CTX_MCP_TOOLS = [
  "mcp__ctx__context",
  "mcp__ctx__search",
  "mcp__ctx__remember",
] as const;
export const PINNED_MODEL = "claude-opus-4-8";
export const PER_CELL_BUDGET_USD = 3;

/** The two testbed repos (design §3). atlas may be absent on a given box. */
export const DEFAULT_REPOS: Record<string, string> = {
  "token-killer": WORKSPACE,
  atlas: join(WORKSPACE, "..", "atlas"),
};

// ---------------------------------------------------------------------------
// process helpers
// ---------------------------------------------------------------------------

export interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

function toResult(r: SpawnSyncReturns<string>): RunResult {
  return {
    code: r.status ?? (r.signal ? 128 : 1),
    stdout: r.stdout ?? "",
    stderr: r.stderr ?? "",
  };
}

export interface ExecOpts {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  input?: string;
  /** Max wall time in ms (default 10 min). */
  timeout?: number;
}

/** Run a command, capturing output. Never throws on non-zero exit. */
export function run(cmd: string, args: string[], opts: ExecOpts = {}): RunResult {
  return toResult(
    spawnSync(cmd, args, {
      cwd: opts.cwd,
      env: opts.env ?? process.env,
      input: opts.input,
      encoding: "utf8",
      timeout: opts.timeout ?? 600_000,
      maxBuffer: 256 * 1024 * 1024,
    }),
  );
}

export function git(args: string[], cwd: string): RunResult {
  return run("git", args, { cwd });
}

/**
 * Invoke the `ctx` CLI from source (verified recipe, see recon). Module
 * resolution for `@contexa/core` is anchored to CLI_ENTRY's location, so cwd is free
 * to be the sandbox — which is how `ctx sync` learns its projectDir.
 */
export function runCtx(
  args: string[],
  opts: { cwd: string; contexaHome: string; home?: string; env?: NodeJS.ProcessEnv } = {
    cwd: WORKSPACE,
    contexaHome: "",
  },
): RunResult {
  const env: NodeJS.ProcessEnv = {
    ...(opts.env ?? process.env),
    CONTEXA_HOME: opts.contexaHome,
  };
  if (opts.home !== undefined) env.HOME = opts.home;
  return run("node", ["--import", `file://${TSX_LOADER}`, CLI_ENTRY, ...args], {
    cwd: opts.cwd,
    env,
  });
}

// ---------------------------------------------------------------------------
// JSONL / JSON io
// ---------------------------------------------------------------------------

export function ensureDir(p: string): void {
  mkdirSync(p, { recursive: true });
}

/** Read a text file split into non-empty lines (session .jsonl scale is fine). */
export function readFileLines(path: string): string[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .split("\n")
    .filter((l) => l.length > 0);
}

export function readJsonl<T = unknown>(path: string): T[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l) as T);
}

export function writeJsonl(path: string, rows: unknown[]): void {
  ensureDir(dirname(path));
  writeFileSync(path, rows.map((r) => JSON.stringify(r)).join("\n") + (rows.length ? "\n" : ""));
}

export function writeJson(path: string, value: unknown): void {
  ensureDir(dirname(path));
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n");
}

export function readJson<T = unknown>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

// ---------------------------------------------------------------------------
// Claude Code session-history helpers (miner)
// ---------------------------------------------------------------------------

/** Replicates Claude Code's project-slug rule: non-alphanumerics → '-'
 *  (`/Users/ziyu/Workspace/token-killer` → `-Users-ziyu-Workspace-token-killer`).
 *  Matches `claudeProjectSlug` in packages/core/src/memory/claudeImporter.ts. */
export function claudeProjectSlug(absPath: string): string {
  return absPath.replace(/[^A-Za-z0-9]/g, "-");
}

/** Default host session-history root (real `~/.claude/projects`). Read-only. */
export function claudeProjectsDir(home = process.env.HOME ?? ""): string {
  return join(home, ".claude", "projects");
}

/** A raw `type:user` record we care about (only the fields the miner reads). */
export interface UserRecord {
  type?: string;
  isMeta?: boolean;
  isSidechain?: boolean;
  uuid?: string;
  parentUuid?: string | null;
  sessionId?: string;
  timestamp?: string;
  cwd?: string;
  gitBranch?: string;
  promptSource?: string;
  message?: { role?: string; content?: unknown };
}

/** Extract a plain-text prompt from `message.content` (string | content-block[]). */
export function contentToText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((b) =>
        b && typeof b === "object" && "text" in b ? String((b as { text: unknown }).text) : "",
      )
      .join("")
      .trim();
  }
  return "";
}

/** A typed human task-opening prompt: real user turn, not meta/sidechain/slash. */
export function isTypedHumanPrompt(rec: UserRecord): boolean {
  if (rec.type !== "user" || rec.isMeta === true || rec.isSidechain === true) return false;
  const text = contentToText(rec.message?.content);
  if (text.length === 0) return false;
  // Harness envelopes (slash-command, tool-notification, caveats) are not human
  // tasks — they are injected by the CLI, not typed by the user.
  if (
    /^<(command-|local-command|user-|system-|task-|tool-|function|stdout|stderr|files)/.test(text)
  )
    return false;
  if (Array.isArray(rec.message?.content)) return false; // tool_result turns
  return true;
}
