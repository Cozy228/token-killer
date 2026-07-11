import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { run, type RunIo } from "../src/cli.ts";

// `ctx push` exercised in-process against a temp git repo + sandboxed CONTEXA_HOME
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

describe("Contexa CLI: push", () => {
  let root: string;
  let repo: string;
  let lines: string[];
  let io: RunIo;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "ctx-push-cli-"));
    repo = makeRepo(root);
    lines = [];
    io = { out: (l) => lines.push(l), home: join(root, "contexa-home"), projectDir: repo };
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
    const agents = readFileSync(join(repo, "AGENTS.md"), "utf8");
    expect(agents).toContain("ctx:managed:begin");
    // DR-32: the PLACED host file carries NO uncited factual gotchas and NO "with
    // provenance" claim — only the de-claimed header + tool instruction + an
    // explicit omission disclosure.
    expect(agents).not.toContain("⚠");
    expect(agents).not.toContain("with provenance");
    expect(agents).toContain("omitted");
    expect(agents).toContain("`context` MCP tool");
    expect(out).toContain("omitted"); // the command output reports the omission
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

  test("ctx push pin / veto edit .contexa/push.jsonc", () => {
    run(["remember", "pin me"], io);
    const handle = (lines[0]?.match(/\[([^\]]+)\]/) ?? [])[1];
    expect(handle).toBeDefined();

    lines = [];
    expect(run(["push", "pin", handle as string], io)).toBe(0);
    expect(lines.join("\n")).toContain("pin");
    const cfg = readFileSync(join(repo, ".contexa", "push.jsonc"), "utf8");
    expect(cfg).toContain(handle as string);
    expect(JSON.parse(cfg).pin).toContain(handle);

    lines = [];
    expect(run(["push", "veto", "c1a2b3c"], io)).toBe(0);
    const cfg2 = JSON.parse(readFileSync(join(repo, ".contexa", "push.jsonc"), "utf8"));
    expect(cfg2.pin).toContain(handle);
    expect(cfg2.veto).toContain("c1a2b3c");
  });

  test("push pin without an id prints usage (exit 2)", () => {
    expect(run(["push", "pin"], io)).toBe(2);
    expect(lines.join("\n")).toMatch(/usage: ctx push pin/);
  });

  test("ctx push --local renders the merged local view without writing any file", () => {
    run(["remember", "gotcha for local view"], io);
    lines = [];
    expect(run(["push", "--local"], io)).toBe(0);
    const out = lines.join("\n");
    expect(out).toContain("local view");
    expect(out).toContain("NOT written to any file");
    // DR-32 (e): the `--local` DISPLAY view writes no host file, so it MAY still
    // show the gotcha locally — the ⚠ line appears here (but never in a host file).
    expect(out).toContain("⚠");
    expect(out).toContain("gotcha for local view");
    // Display-only: no host file placed.
    expect(existsSync(join(repo, "AGENTS.md"))).toBe(false);
    expect(existsSync(join(repo, "CLAUDE.md"))).toBe(false);
  });

  test("push pin preserves the E4 commitMemory opt-out in .contexa/push.jsonc", () => {
    // Author sets the per-repo opt-out by hand, then edits a pin via the CLI.
    mkdirSync(join(repo, ".contexa"), { recursive: true });
    writeFileSync(join(repo, ".contexa", "push.jsonc"), `{ "commitMemory": false }`);
    run(["remember", "pin me too"], io);
    const handle = (lines[0]?.match(/\[([^\]]+)\]/) ?? [])[1];
    lines = [];
    expect(run(["push", "pin", handle as string], io)).toBe(0);
    const cfg = JSON.parse(readFileSync(join(repo, ".contexa", "push.jsonc"), "utf8"));
    expect(cfg.commitMemory).toBe(false); // opt-out NOT erased by the pin edit
    expect(cfg.pin).toContain(handle);
  });
});
