// Slice 5 integration — `tk optimize context` consumer through the real CLI
// dispatch, including the default inspect trigger (dynamic import) when the
// scope bucket is absent.

import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const cli = path.join(repoRoot, "src/cli.ts");
const tsxLoader = path.join(repoRoot, "node_modules/tsx/dist/loader.mjs");

let home: string;
let project: string;

beforeEach(() => {
  home = mkdtempSync(path.join(tmpdir(), "tk-opt-home-"));
  project = mkdtempSync(path.join(tmpdir(), "tk-opt-proj-"));
});
afterEach(() => {
  rmSync(home, { recursive: true, force: true });
  rmSync(project, { recursive: true, force: true });
});

function write(rel: string, content: string): void {
  const abs = path.join(project, rel);
  mkdirSync(path.dirname(abs), { recursive: true });
  writeFileSync(abs, content);
}

function runTk(args: string[]) {
  return spawnSync(process.execPath, ["--import", tsxLoader, cli, ...args], {
    cwd: project,
    encoding: "utf8",
    timeout: 20000,
    env: {
      ...process.env,
      HOME: home,
      USERPROFILE: home,
      TOKEN_KILLER_HOME: path.join(home, ".token-killer"),
    },
  });
}

describe("tk optimize context", () => {
  test("--dry-run triggers inspect when the bucket is absent and prints a plan, no writes", () => {
    write("AGENTS.md", `# Rules\n${Array.from({ length: 300 }, (_, i) => `line ${i}`).join("\n")}\n`);
    const r = runTk(["optimize", "context", "--project", "--dry-run"]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("scope = project");
    expect(r.stdout).toContain("always_on_bloat");
    // No advice artifact in dry-run.
    expect(existsSync(path.join(home, ".token-killer", "advice", "context"))).toBe(false);
    // But the inspect bucket was created by the trigger.
    expect(existsSync(path.join(home, ".token-killer", "projects"))).toBe(true);
  });

  test("--write-advice writes a project advice file under ~/.token-killer/advice/context", () => {
    write("AGENTS.md", `# Rules\n${Array.from({ length: 300 }, (_, i) => `line ${i}`).join("\n")}\n`);
    const r = runTk(["optimize", "context", "--project", "--write-advice"]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("Wrote context advice");
    const dir = path.join(home, ".token-killer", "advice", "context");
    expect(existsSync(dir)).toBe(true);
    // The advice file name derives from the project fingerprint hash.
    const advicePath = r.stdout.trim().split("Wrote context advice: ")[1];
    expect(advicePath).toBeTruthy();
    expect(readFileSync(advicePath, "utf8")).toContain("# Copilot Context Advice");
  });

  test("unknown optimize target → exit 1", () => {
    const r = runTk(["optimize", "skills"]);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("unknown optimize target");
  });

  test("--apply-safe refuses project-level edits", () => {
    write("AGENTS.md", "# Rules\nBe concise.\n");
    const r = runTk(["optimize", "context", "--apply-safe"]);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("refuses project-level edits");
  });

  test("--token-budget-block --apply-safe installs the managed block at the user target", () => {
    const r = runTk(["optimize", "context", "--token-budget-block", "--apply-safe"]);
    expect(r.status).toBe(0);
    const target = path.join(home, ".copilot", "copilot-instructions.md");
    expect(existsSync(target)).toBe(true);
    expect(readFileSync(target, "utf8")).toContain("tk:token_budget:start");
  });
});

describe("tk agentsmd", () => {
  test("patch then restore round-trips the managed block", () => {
    const patch = runTk(["agentsmd", "patch"]);
    expect(patch.status).toBe(0);
    const target = path.join(home, ".copilot", "copilot-instructions.md");
    expect(readFileSync(target, "utf8")).toContain("tk:token_budget:start");

    const restore = runTk(["agentsmd", "restore"]);
    expect(restore.status).toBe(0);
    expect(readFileSync(target, "utf8")).not.toContain("tk:token_budget:start");
  });
});
