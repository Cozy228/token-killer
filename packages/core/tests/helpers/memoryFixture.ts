/**
 * Memory-quality eval fixture (workstream-E §1). A tiny synthetic service —
 * code + docs + decisions + git history + host memory — built script-side in a
 * temp dir so the E-series is machine-independent and needs no env gate.
 *
 * Determinism contract (§6): the caller opens the store under a temp CONTEXA_HOME
 * (G-7) with an injected clock; this module only writes files and drives the
 * real adapters. No network, no LLM (assertNoEgress stays armed in the suite).
 */
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createGitAdapter } from "../../src/ingest/git/adapter.ts";
import { createCodeAdapter } from "../../src/ingest/code/adapter.ts";
import { DocsAdapter } from "../../src/ingest/docs.ts";
import { clearScanCache } from "../../src/ingest/scan.ts";
import { claudeProjectSlug } from "../../src/memory/claudeImporter.ts";
import type { Budget } from "../../src/ingest/adapter.ts";
import type { Store } from "../../src/store/store.ts";
import { git } from "./sandbox.ts";

export const MAX_BUDGET: Budget = { deadline: Number.MAX_SAFE_INTEGER, now: Date.now };

/** The exact remember()-seeded gists (§1.2) — fixed strings the tests assert on. */
export const GIST = {
  active1: "retry queue drops metadata on redelivery — persist the idempotency key",
  active2: "config validation is strict; unknown keys are rejected with guidance",
  stale: "auth token refresh must precede the 401 retry path",
  v1: "config validation is best-effort; unknown keys only warn",
  v2: "config validation is strict; unknown keys are hard-rejected",
  retired: "legacy DEBUG=1 env toggles verbose retry logs",
  noise: [
    "windows startup perf is dominated by the crowdstrike edr per-spawn tax",
    "the store shard key hashes the git common-dir realpath, not the cwd",
    "the cozyultra box keeps GBK console encoding as a cosmetic test fixture",
    "husky pre-commit runs oxfmt then oxlint then the workspace typecheck",
    "pnpm is the only package manager; npm re-pins packageManager and drifts",
    "the telemetry lambda self-heals cumulative rollups without a firehose",
  ],
} as const;

const SRC_RETRY = `/** Redelivery queue. */
export class RetryQueue {
  enqueue(id: string): void { void id; }
  redeliver(id: string): void { void id; }
}
`;
/** retry.ts with redeliver's arity changed (C3 — signature-changed). */
export const SRC_RETRY_SIGCHANGED = `/** Redelivery queue. */
export class RetryQueue {
  enqueue(id: string): void { void id; }
  redeliver(id: string, attempt: number): void { void id; void attempt; }
}
`;

const SRC_AUTH = `export function refreshToken(): string { return "tok"; }
export function verify(tok: string): boolean { return tok.length > 0; }
`;

const SRC_CONFIG = `export function loadConfig(): Record<string, string> { return {}; }
export function validateConfig(c: Record<string, string>): boolean { return Object.keys(c).length >= 0; }
`;

/**
 * Build the fixture git repo (main branch, isolated gitconfig) at `<root>/repo`
 * with the §1.1 tree and an initial commit C1. Returns the repo path.
 */
export function buildEvalRepo(root: string): string {
  const repo = join(root, "repo");
  git(["init", "-q", "-b", "main", repo], root);
  git(["config", "user.email", "ctx-test@example.invalid"], repo);
  git(["config", "user.name", "ctx test"], repo);

  const write = (rel: string, content: string): void => {
    const abs = join(repo, rel);
    mkdirSync(join(abs, ".."), { recursive: true });
    writeFileSync(abs, content, "utf8");
  };
  write("README.md", "# eval fixture\n");
  write("src/retry.ts", SRC_RETRY);
  write("src/auth.ts", SRC_AUTH);
  write("src/config.ts", SRC_CONFIG);
  write(
    "docs/architecture.md",
    "# Architecture\nThe `src/retry.ts` queue redelivers on failure. Auth lives in `src/auth.ts`.\n",
  );
  write(
    "decisions/0001-idempotent-retry.md",
    "---\nstatus: accepted\n---\n# Retry must be idempotent\nDouble-charge on redelivery is the failure we avoid; dedup on a stable request id.\n",
  );
  write(
    "decisions/0002-strict-config.md",
    "---\nstatus: accepted\n---\n# Config validation is strict\nUnknown keys are rejected with guidance rather than silently ignored.\n",
  );
  write(".contexa/push.jsonc", `{ "pin": [], "veto": [] }\n`);
  git(["add", "-A"], repo);
  git(["commit", "-q", "-m", "C1: initial service"], repo);
  return repo;
}

/** Commit the current tree (used after mutating files for C2/C3). */
export function commitAll(repo: string, message: string): void {
  git(["add", "-A"], repo);
  git(["commit", "-q", "-m", message], repo);
}

/** C2: delete src/auth.ts (E2 target-removed). */
export function deleteAuth(repo: string): void {
  rmSync(join(repo, "src", "auth.ts"), { force: true });
  commitAll(repo, "C2: drop auth module");
}

/** C3: change RetryQueue.redeliver's signature (E2 signature-changed). */
export function changeRedeliverSignature(repo: string): void {
  writeFileSync(join(repo, "src", "retry.ts"), SRC_RETRY_SIGCHANGED, "utf8");
  commitAll(repo, "C3: redeliver takes an attempt count");
}

/** Directory of the fake Claude host memory (under an injected `claudeHome`). */
export function hostMemoryDir(claudeHome: string, projectRoot: string): string {
  return join(claudeHome, ".claude", "projects", claudeProjectSlug(projectRoot), "memory");
}

/**
 * Plant the fake Claude Code host memory (§1.1): a curated MEMORY.md index +
 * near-dup gists, a differing-numbers negative pair, sentinel echoes, and a
 * paraphrase echo. `projectRoot` = the store's resolved project root.
 */
export function seedHostMemory(claudeHome: string, projectRoot: string): string {
  const dir = hostMemoryDir(claudeHome, projectRoot);
  mkdirSync(dir, { recursive: true });
  const f = (name: string, content: string): void =>
    writeFileSync(join(dir, name), content, "utf8");
  f(
    "MEMORY.md",
    "# Index\n" +
      "- [Retry dup A](retry-dup-a.md) — the retry queue drops request metadata on redelivery under load\n" +
      "- [Retry dup B](retry-dup-b.md) — the retry queue drops request metadata on redelivery when overloaded\n" +
      "- [ADR 11](adr-11.md) — ADR 0011 records the evidence-ladder decision for the store\n" +
      "- [ADR 13](adr-13.md) — ADR 0013 records the evidence-ladder decision for the store\n",
  );
  f(
    "retry-dup-a.md",
    "# Retry dup A\nThe retry queue drops request metadata on redelivery under load.\n",
  );
  f(
    "retry-dup-b.md",
    "# Retry dup B\nThe retry queue drops request metadata on redelivery when overloaded.\n",
  );
  f("adr-11.md", "# ADR 11\nADR 0011 records the evidence-ladder decision for the store.\n");
  f("adr-13.md", "# ADR 13\nADR 0013 records the evidence-ladder decision for the store.\n");
  f(
    "pushed-digest.md",
    "Field note before the block.\n<!-- ctx:managed:begin -->\nThis project has a ctx context base (code, decisions, history, memory — with provenance).\n⚠ retry queue drops metadata on redelivery — persist the idempotency key [ab12c]\n<!-- ctx:managed:end -->\nField note after the block.\n",
  );
  f("pure-echo.md", "<!-- ctx:managed:begin -->\ndigest only\n<!-- ctx:managed:end -->\n");
  f(
    "paraphrase.md",
    "Reminder: the retry queue loses metadata on redelivery, so always persist idempotency keys.\n",
  );
  return dir;
}

/** Run git + docs + code (in-process) ingest over the fixture. Deterministic. */
export async function ingestSources(store: Store): Promise<void> {
  clearScanCache();
  const git_ = createGitAdapter();
  await git_.ingest(store, await git_.dirtyCheck(store), MAX_BUDGET);
  const docs = new DocsAdapter();
  await docs.ingest(store, await docs.dirtyCheck(store), MAX_BUDGET);
  const code = createCodeAdapter({ inProcess: true });
  await code.ingest(store, await code.dirtyCheck(store), MAX_BUDGET);
}

/** Re-run git + code ingest only (E2 re-ingest after a commit). */
export async function reingestGitCode(store: Store): Promise<void> {
  clearScanCache();
  const git_ = createGitAdapter();
  await git_.ingest(store, await git_.dirtyCheck(store), MAX_BUDGET);
  const code = createCodeAdapter({ inProcess: true });
  await code.ingest(store, await code.dirtyCheck(store), MAX_BUDGET);
}

/** Find the published symbol entity id for RetryQueue.redeliver (E2 sym-variant). */
export function redeliverSymbolId(store: Store): string | undefined {
  return store.entitiesByKind("symbol").find((e) => e.id.endsWith("redeliver"))?.id;
}
