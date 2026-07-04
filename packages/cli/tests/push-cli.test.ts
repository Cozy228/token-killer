import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { run, type RunIo } from "../src/cli.ts";

// `ctx push` exercised in-process against a temp git repo + sandboxed CTX_HOME
// (G-7): host instruction files are written INTO the temp project, never the
// real repo's AGENTS.md/CLAUDE.md.
function makeRepo(root: string): string {
  const repo = join(root, "repo");
  const g = (args: string[], cwd: string) =>
    execFileSync("git", args, {
      cwd,
      stdio: "ignore",
      env: {
        ...process.env,
        GIT_CONFIG_GLOBAL: join(tmpdir(), "ctx-cli-no-gitconfig"),
        GIT_CONFIG_SYSTEM: join(tmpdir(), "ctx-cli-no-gitconfig"),
      },
    });
  g(["init", "-q", "-b", "main", repo], root);
  g(["config", "user.email", "ctx@example.invalid"], repo);
  g(["config", "user.name", "ctx"], repo);
  return repo;
}

describe("ctx CLI: push", () => {
  let root: string;
  let repo: string;
  let lines: string[];
  let io: RunIo;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "ctx-push-cli-"));
    repo = makeRepo(root);
    lines = [];
    io = { out: (l) => lines.push(l), home: join(root, "ctx-home"), projectDir: repo };
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });

  test("ctx push renders + places the block into AGENTS.md and CLAUDE.md", () => {
    expect(run(["remember", "a durable gotcha about retries"], io)).toBe(0);
    lines = [];
    expect(run(["push"], io)).toBe(0);
    const out = lines.join("\n");
    expect(out).toContain("<!-- ctx:managed:begin -->");
    expect(out).toContain("wrote");
    expect(existsSync(join(repo, "AGENTS.md"))).toBe(true);
    expect(existsSync(join(repo, "CLAUDE.md"))).toBe(true);
    expect(readFileSync(join(repo, "AGENTS.md"), "utf8")).toContain("ctx:managed:begin");
  });

  test("ctx push --dry-run prints without writing files", () => {
    run(["remember", "another gotcha"], io);
    lines = [];
    expect(run(["push", "--dry-run"], io)).toBe(0);
    expect(lines.join("\n")).toContain("would write");
    expect(existsSync(join(repo, "AGENTS.md"))).toBe(false);
  });

  test("ctx push --if-changed short-circuits an unchanged block", () => {
    run(["remember", "gotcha for if-changed"], io);
    run(["push"], io);
    lines = [];
    expect(run(["push", "--if-changed"], io)).toBe(0);
    expect(lines.join("\n")).toContain("unchanged");
  });

  test("ctx push pin / veto edit .ctx/push.jsonc", () => {
    run(["remember", "pin me"], io);
    const handle = (lines[0]?.match(/\[([^\]]+)\]/) ?? [])[1];
    expect(handle).toBeDefined();

    lines = [];
    expect(run(["push", "pin", handle as string], io)).toBe(0);
    expect(lines.join("\n")).toContain("pin");
    const cfg = readFileSync(join(repo, ".ctx", "push.jsonc"), "utf8");
    expect(cfg).toContain(handle as string);
    expect(JSON.parse(cfg).pin).toContain(handle);

    lines = [];
    expect(run(["push", "veto", "c1a2b3c"], io)).toBe(0);
    const cfg2 = JSON.parse(readFileSync(join(repo, ".ctx", "push.jsonc"), "utf8"));
    expect(cfg2.pin).toContain(handle);
    expect(cfg2.veto).toContain("c1a2b3c");
  });

  test("push pin without an id prints usage (exit 2)", () => {
    expect(run(["push", "pin"], io)).toBe(2);
    expect(lines.join("\n")).toMatch(/usage: ctx push pin/);
  });
});
