/**
 * `ctx sync` CLI test (slice 1d). Drives the registry-generic refresh engine
 * over a script-generated fixture repo in a temp CTX_HOME sandbox (G-7). No real
 * host state is touched; git spawns carry explicit timeouts.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { openStore } from "@ctx/core";
import { runSync, run } from "../src/cli.ts";

function git(args: string[], cwd: string): void {
  execFileSync("git", args, {
    cwd,
    stdio: ["ignore", "ignore", "pipe"],
    timeout: 15_000,
    env: {
      ...process.env,
      GIT_CONFIG_GLOBAL: join(tmpdir(), "ctx-cli-no-gitconfig"),
      GIT_CONFIG_SYSTEM: join(tmpdir(), "ctx-cli-no-gitconfig"),
    },
  });
}

describe("ctx sync", () => {
  let root: string;
  let repo: string;
  let home: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "ctx-cli-"));
    repo = join(root, "repo");
    git(["init", "-q", "-b", "main", repo], root);
    git(["config", "user.email", "t@t.invalid"], repo);
    git(["config", "user.name", "t"], repo);
    writeFileSync(join(repo, "a.ts"), "export const a = 1;\n");
    git(["add", "a.ts"], repo);
    git(["commit", "-q", "-m", "feat: add a"], repo);
    home = join(root, "ctx-home");
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });

  test("ingests git into the project store and reports fresh", async () => {
    const lines: string[] = [];
    const io = { out: (s: string) => lines.push(s), err: () => {} };
    const code = await runSync([], io, { projectDir: repo, home });
    expect(code).toBe(0);
    const output = lines.join("");
    expect(output).toContain("ctx sync: fresh");
    expect(output).toMatch(/git: complete/);

    // The store now holds the commit + file entities.
    const store = openStore({ projectDir: repo, home });
    expect(store.entityCount()).toBeGreaterThan(0);
    expect(store.publishedGen("git")).toBe(1);
    // A second sync is a clean no-op.
    store.close();
    const lines2: string[] = [];
    const code2 = await runSync(
      [],
      { out: (s) => lines2.push(s), err: () => {} },
      {
        projectDir: repo,
        home,
      },
    );
    expect(code2).toBe(0);
    expect(lines2.join("")).toMatch(/git: clean/);
  });

  test("unknown subcommand → success-shaped notice, not an error", async () => {
    const lines: string[] = [];
    const code = await run(["definitely-not-a-command"], {
      out: (s) => lines.push(s),
      err: () => {},
    });
    expect(code).toBe(0);
    expect(lines.join("")).toContain("lands in a later M1 slice");
  });
});
