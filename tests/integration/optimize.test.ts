// Slice 5 integration — `tk optimize` consumer through the real CLI dispatch,
// including the default inspect trigger (dynamic import) when the scope bucket
// is absent.

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

function gitInit(): void {
  spawnSync("git", ["init", "-q"], { cwd: project, encoding: "utf8" });
}

describe("tk optimize", () => {
  test("--dry-run triggers inspect when the bucket is absent and prints a plan, no writes", () => {
    write(
      "AGENTS.md",
      `# Rules\n${Array.from({ length: 300 }, (_, i) => `line ${i}`).join("\n")}\n`,
    );
    const r = runTk(["optimize", "--project", "--dry-run"]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("scope = project");
    expect(r.stdout).toContain("always_on_bloat");
    // No advice artifact in dry-run.
    expect(existsSync(path.join(home, ".token-killer", "advice", "context"))).toBe(false);
    // But the inspect bucket was created by the trigger.
    expect(existsSync(path.join(home, ".token-killer", "projects"))).toBe(true);
  });

  test("a leading `context` token is still accepted (back-compat)", () => {
    write(
      "AGENTS.md",
      `# Rules\n${Array.from({ length: 300 }, (_, i) => `line ${i}`).join("\n")}\n`,
    );
    const r = runTk(["optimize", "context", "--project", "--dry-run"]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("scope = project");
  });

  test("--write-advice writes a project advice file under ~/.token-killer/advice/context", () => {
    write(
      "AGENTS.md",
      `# Rules\n${Array.from({ length: 300 }, (_, i) => `line ${i}`).join("\n")}\n`,
    );
    const r = runTk(["optimize", "--project", "--write-advice"]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("Wrote context advice");
    const dir = path.join(home, ".token-killer", "advice", "context");
    expect(existsSync(dir)).toBe(true);
    // The advice file name derives from the project fingerprint hash.
    const advicePath = r.stdout.trim().split("Wrote context advice: ")[1];
    expect(advicePath).toBeTruthy();
    expect(readFileSync(advicePath, "utf8")).toContain("# Copilot Context Advice");
  });

  test("an unknown flag → exit 1", () => {
    const r = runTk(["optimize", "skills"]);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("unknown flag");
  });

  test("--apply discloses free-form suggestions but does not rewrite the file", () => {
    write(
      "AGENTS.md",
      `# Rules\n${Array.from({ length: 300 }, (_, i) => `line ${i}`).join("\n")}\n`,
    );
    const before = readFileSync(path.join(project, "AGENTS.md"), "utf8");
    const r = runTk(["optimize", "--project", "--apply"]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("Suggestions for manual review");
    // Free-form suggestion (always_on_bloat) is printed, not written.
    expect(readFileSync(path.join(project, "AGENTS.md"), "utf8")).toBe(before);
  });

  // End-to-end: inspect flags a project-tracked skill that the model can
  // auto-invoke → `--apply` (git-aware, both scopes) writes the deterministic
  // frontmatter fix into the repo file, backs it up, and --restore reverts it.
  test("--apply writes a real inspect fix into a git-tracked project skill, then --restore reverts", () => {
    gitInit();
    const skillAbs = path.join(project, ".claude", "skills", "deploy", "SKILL.md");
    mkdirSync(path.dirname(skillAbs), { recursive: true });
    writeFileSync(
      skillAbs,
      [
        "---",
        "name: deploy",
        "description: Deploy the service",
        "---",
        "# Deploy",
        "Run the deploy and publish the release.",
      ].join("\n"),
    );

    const before = readFileSync(skillAbs, "utf8");
    expect(before).not.toContain("disable-model-invocation");

    // No scope flag → git-aware default resolves to user + project.
    const apply = runTk(["optimize", "--apply"]);
    expect(apply.status).toBe(0);
    expect(apply.stdout).toContain("disable-model-invocation");

    // The inspect fix was actually written into the project-tracked skill.
    const after = readFileSync(skillAbs, "utf8");
    expect(after).toContain("disable-model-invocation: true");
    expect(after).toContain("Run the deploy and publish the release.");

    // A reversible backup was recorded.
    expect(existsSync(path.join(home, ".token-killer", "backups", "context"))).toBe(true);

    // --restore brings the file back to its pre-apply content.
    const restore = runTk(["optimize", "--restore"]);
    expect(restore.status).toBe(0);
    expect(readFileSync(skillAbs, "utf8")).toBe(before);
  });
});
