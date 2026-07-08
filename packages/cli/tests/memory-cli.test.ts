import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { run, type RunIo } from "../src/cli.ts";

// The CLI `run()` is exercised in-process against a temp git repo + sandboxed
// CONTEXA_HOME (G-7); no host config is touched, no subprocess spawn needed.
function makeRepo(root: string): string {
  const repo = join(root, "repo");
  const g = (args: string[]) =>
    execFileSync("git", args, {
      cwd: args[0] === "init" ? root : repo,
      stdio: "ignore",
      env: {
        ...process.env,
        GIT_CONFIG_GLOBAL: join(tmpdir(), "ctx-cli-no-gitconfig"),
        GIT_CONFIG_SYSTEM: join(tmpdir(), "ctx-cli-no-gitconfig"),
      },
    });
  g(["init", "-q", "-b", "main", repo]);
  g(["config", "user.email", "ctx@example.invalid"]);
  g(["config", "user.name", "ctx"]);
  return repo;
}

describe("Contexa CLI: memory lifecycle", () => {
  let root: string;
  let repo: string;
  let lines: string[];
  let io: RunIo;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "ctx-cli-"));
    repo = makeRepo(root);
    lines = [];
    io = { out: (l) => lines.push(l), home: join(root, "contexa-home"), projectDir: repo };
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });

  test("remember → recall → memory list → lifecycle", () => {
    expect(run(["remember", "a durable fact about the store"], io)).toBe(0);
    const handle = (lines[0]?.match(/\[([^\]]+)\]/) ?? [])[1];
    expect(handle).toBeDefined();

    lines = [];
    expect(run(["recall", `[${handle}]`], io)).toBe(0);
    expect(lines.join("\n")).toContain("durable fact");

    lines = [];
    expect(run(["memory", "list"], io)).toBe(0);
    expect(lines.join("\n")).toContain("active");

    lines = [];
    expect(run(["memory", "retire", `[${handle}]`], io)).toBe(0);
    expect(lines.join("\n")).toContain("retired");

    lines = [];
    run(["memory", "list", "--status", "active"], io);
    expect(lines.join("\n")).toContain("(no memory entries)");
  });

  test("over-long note prints success-shaped guidance (exit 0, nothing crashes)", () => {
    expect(run(["remember", "x".repeat(300)], io)).toBe(0);
    expect(lines.join("\n")).toMatch(/split/i);
  });

  test("ctx import returns the P28 'lands at M4' notice + honest host-memory text (O-06)", () => {
    expect(run(["import", "github"], io)).toBe(0);
    const out = lines.join("\n");
    expect(out).toContain("M4");
    // O-06: the host-memory line is now accurate — it lands as needs-review.
    expect(out).toContain("needs-review");
  });

  test("ctx remember diverts a secret-shaped note to the overlay (E4, success-shaped)", () => {
    // S8a: the CLI is the human surface → committed intent → the E4 guard fires.
    expect(run(["remember", "prod token is sk-ant-api03-ABCDEF0123456789abcdef"], io)).toBe(0);
    const out = lines.join("\n");
    expect(out).toContain("status: needs-review"); // diverted, not committed active
    expect(out.toLowerCase()).toContain("overlay"); // remediation note surfaced
  });

  test("ctx remember --local discloses the personal-overlay landing zone", () => {
    expect(run(["remember", "my private scratch note", "--local"], io)).toBe(0);
    const out = lines.join("\n");
    expect(out).toContain("local only — never shared");
    // A plain (committed) remember must NOT disclose local-only.
    lines = [];
    run(["remember", "a shared committed gotcha"], io);
    expect(lines.join("\n")).not.toContain("local only");
  });

  test("F-G: confirming a --local note discloses it stays local, never 'promoted'", () => {
    expect(run(["remember", "my private local note", "--local"], io)).toBe(0);
    const handle = (lines[0]?.match(/\[([^\]]+)\]/) ?? [])[1];
    expect(handle).toBeDefined();
    lines = [];
    expect(run(["memory", "confirm", `[${handle}]`], io)).toBe(0);
    const out = lines.join("\n");
    // Disclosure mentions local; it is NOT promoted to the shared committed log,
    // and the message is the --local wording, not the E4 opt-out wording.
    expect(out.toLowerCase()).toContain("local");
    expect(out).not.toContain("promoted to the shared committed memory log");
    expect(out).not.toContain("does not commit memory");
  });

  test("unknown command falls back to the scaffold notice", () => {
    expect(run(["frobnicate"], io)).toBe(0);
    expect(lines.join("\n")).toContain("lands in a later M1 slice");
  });
});
