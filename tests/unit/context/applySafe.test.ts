import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { runInspect } from "../../../src/inspect/cli.js";
import { registerAllRules } from "../../../src/context/rules/index.js";
import {
  hasMarkerBlock,
  insertMarkerBlock,
  removeMarkerBlock,
  setFrontmatterKey,
  userTargetPath,
} from "../../../src/context/applySafe.js";
import { runOptimize } from "../../../src/context/optimizeCli.js";

let root: string;
let home: string;
let cwd: string;

beforeEach(() => {
  registerAllRules();
  root = mkdtempSync(join(tmpdir(), "tk-ctx-apply-"));
  home = join(root, "home");
  cwd = join(root, "repo");
  mkdirSync(home, { recursive: true });
  mkdirSync(cwd, { recursive: true });
  process.env.TOKEN_KILLER_HOME = join(home, ".token-killer");
});
afterEach(() => {
  delete process.env.TOKEN_KILLER_HOME;
  delete process.env.TK_USER_AGENT_INSTRUCTIONS;
  rmSync(root, { recursive: true, force: true });
  vi.restoreAllMocks();
});

function silenceStdout() {
  return vi.spyOn(process.stdout, "write").mockImplementation(() => true);
}

describe("marker block helpers", () => {
  test("insertion is idempotent", () => {
    const once = insertMarkerBlock("# Title\n\nbody\n");
    const twice = insertMarkerBlock(once);
    expect(once).toBe(twice);
    expect(hasMarkerBlock(once)).toBe(true);
  });

  test("restore removes only the managed block", () => {
    const original = "# Title\n\nkeep me\n";
    const withBlock = insertMarkerBlock(original);
    const restored = removeMarkerBlock(withBlock);
    expect(restored).toContain("keep me");
    expect(hasMarkerBlock(restored)).toBe(false);
  });

  // Phase 3: the managed block names concrete, already-shipped read/rg/tree flags.
  test("managed block points at concrete read/rg/tree flags", () => {
    const block = insertMarkerBlock("");
    expect(block).toContain("tk read --max-lines 200");
    expect(block).toContain("--level aggressive");
    expect(block).toContain("tk rg <pattern> <path>");
    expect(block).toContain("--level minimal");
    expect(block).toContain("tk tree <path>");
    expect(block).toContain("-L <n>");
    // Cacheable / marker-block constraints: ≤ 15 lines, no volatile content.
    expect(block.split("\n").length).toBeLessThanOrEqual(15);
    expect(block).not.toMatch(/\d{4}-\d{2}-\d{2}|\d{2}:\d{2}:\d{2}/);
  });

  test("setFrontmatterKey preserves body and comments", () => {
    const content = ["---", "name: deploy", "# a yaml comment", "---", "# Heading", "body text"].join("\n");
    const next = setFrontmatterKey(content, "disable-model-invocation", true);
    expect(next).toContain("disable-model-invocation: true");
    expect(next).toContain("# a yaml comment");
    expect(next).toContain("body text");
    expect(next).toContain("name: deploy");
  });
});

describe("tk optimize --token-budget-block (folds in the former agentsmd)", () => {
  test("installs, backs up, and --restore removes the managed block", async () => {
    const target = join(home, ".copilot", "copilot-instructions.md");
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, "# My rules\nBe concise.\n");

    const s = silenceStdout();
    expect(await runOptimize(["--token-budget-block"], 1000, home, cwd, {})).toBe(0);
    s.mockRestore();

    expect(hasMarkerBlock(readFileSync(target, "utf8"))).toBe(true);
    // Backup of the pre-patch content exists.
    const backupRoot = join(home, ".token-killer", "backups", "context");
    expect(existsSync(backupRoot)).toBe(true);
    expect(readdirSync(backupRoot).length).toBeGreaterThan(0);

    const s2 = silenceStdout();
    expect(await runOptimize(["--token-budget-block", "--restore"], 2000, home, cwd, {})).toBe(0);
    s2.mockRestore();
    const after = readFileSync(target, "utf8");
    expect(hasMarkerBlock(after)).toBe(false);
    expect(after).toContain("Be concise.");
  });

  test("installs the managed block at the user target", async () => {
    const s = silenceStdout();
    const code = await runOptimize(["--token-budget-block"], 1000, home, cwd, {});
    s.mockRestore();
    expect(code).toBe(0);
    expect(hasMarkerBlock(readFileSync(userTargetPath(home), "utf8"))).toBe(true);
  });
});

describe("runOptimize --apply", () => {
  test("applies a user-level skill frontmatter change with a backup", async () => {
    const skill = join(home, ".claude", "skills", "deploy", "SKILL.md");
    mkdirSync(dirname(skill), { recursive: true });
    writeFileSync(skill, ["---", "name: deploy", "description: Deploy", "---", "# Deploy", "Run the deploy and publish."].join("\n"));

    const trigger = vi.fn((_s: "user" | "project", h: string, c: string, n: number) => {
      runInspect(["--user"], n, h, c);
    });

    const s = silenceStdout();
    const code = await runOptimize(
      ["--user", "--surface", "skills", "--apply"],
      1000,
      home,
      cwd,
      { triggerInspect: trigger },
    );
    s.mockRestore();

    expect(code).toBe(0);
    const after = readFileSync(skill, "utf8");
    expect(after).toContain("disable-model-invocation: true");
    // Body preserved.
    expect(after).toContain("Run the deploy and publish.");
    // Backup written, with a manifest so --restore can revert it.
    const backupRoot = join(home, ".token-killer", "backups", "context");
    expect(existsSync(backupRoot)).toBe(true);

    // --restore reverts the apply.
    const s2 = silenceStdout();
    expect(await runOptimize(["--restore"], 2000, home, cwd, {})).toBe(0);
    s2.mockRestore();
    expect(readFileSync(skill, "utf8")).not.toContain("disable-model-invocation: true");
  });
});
