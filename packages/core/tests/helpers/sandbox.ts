/**
 * Test sandbox helpers (G-7: never touch real ~/.claude, ~/.copilot or ~/.contexa —
 * every store opens under a temp CONTEXA_HOME passed explicitly as `home`).
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export function makeTempDir(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

/** Windows EBUSY hardening (repo memory: spawn/temp cleanup). */
export function cleanupTempDir(dir: string): void {
  rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}

export function git(args: string[], cwd: string): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 15_000,
    env: {
      ...process.env,
      // Isolate from user/system gitconfig (hooks, templates). A nonexistent
      // file reads as empty and is portable (/dev/null is not, on Windows).
      GIT_CONFIG_GLOBAL: join(tmpdir(), "ctx-tests-no-gitconfig"),
      GIT_CONFIG_SYSTEM: join(tmpdir(), "ctx-tests-no-gitconfig"),
    },
  }).trim();
}

/** Script-generated fixture repo (CONTEXA-IMPL §10) with one commit. */
export function makeGitFixture(root: string): string {
  const repo = join(root, "repo");
  git(["init", "-q", "-b", "main", repo], root);
  git(["config", "user.email", "ctx-test@example.invalid"], repo);
  git(["config", "user.name", "ctx test"], repo);
  writeFileSync(join(repo, "README.md"), "# fixture\n");
  git(["add", "README.md"], repo);
  git(["commit", "-q", "-m", "init"], repo);
  return repo;
}
