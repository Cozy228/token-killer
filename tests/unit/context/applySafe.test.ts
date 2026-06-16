import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { runInspect } from "../../../src/inspect/cli.js";
import { registerAllRules } from "../../../src/context/rules/index.js";
import { setFrontmatterKey } from "../../../src/context/applySafe.js";
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

describe("frontmatter helpers", () => {
  test("setFrontmatterKey preserves body and comments", () => {
    const content = [
      "---",
      "name: deploy",
      "# a yaml comment",
      "---",
      "# Heading",
      "body text",
    ].join("\n");
    const next = setFrontmatterKey(content, "disable-model-invocation", true);
    expect(next).toContain("disable-model-invocation: true");
    expect(next).toContain("# a yaml comment");
    expect(next).toContain("body text");
    expect(next).toContain("name: deploy");
  });

  test("M2: setFrontmatterKey refuses MALFORMED (unterminated) frontmatter — no second --- block", () => {
    // Opening `---` with no closing fence: prepending a fresh block would nest a
    // second one and corrupt the file. The write must be a no-op instead.
    const content = ["---", "name: deploy", "# heading, no closing fence", "body"].join("\n");
    const next = setFrontmatterKey(content, "disable-model-invocation", true);
    expect(next).toBe(content);
    expect(next.match(/^---$/gm)?.length ?? 0).toBeLessThanOrEqual(1);
  });
});

describe("runOptimize --apply", () => {
  test("applies a user-level skill frontmatter change with a backup", async () => {
    const skill = join(home, ".claude", "skills", "deploy", "SKILL.md");
    mkdirSync(dirname(skill), { recursive: true });
    writeFileSync(
      skill,
      [
        "---",
        "name: deploy",
        "description: Deploy",
        "---",
        "# Deploy",
        "Run the deploy and publish.",
      ].join("\n"),
    );

    const trigger = vi.fn((_s: "user" | "project", h: string, c: string, n: number) => {
      runInspect(["--user", "--text"], n, h, c);
    });

    const s = silenceStdout();
    const code = await runOptimize(["--user", "--surface", "skills", "--apply"], 1000, home, cwd, {
      triggerInspect: trigger,
    });
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

  test("M3: a frontmatter edit between inspect and apply is detected (no silent clobber)", async () => {
    const skill = join(home, ".claude", "skills", "deploy", "SKILL.md");
    mkdirSync(dirname(skill), { recursive: true });
    const body = ["# Deploy", "Run the deploy and publish."];
    writeFileSync(skill, ["---", "name: deploy", "description: Deploy", "---", ...body].join("\n"));

    const trigger = vi.fn((_s: "user" | "project", h: string, c: string, n: number) => {
      runInspect(["--user", "--text"], n, h, c);
      // The user edits the FRONTMATTER after inspect captured the finding (body is
      // unchanged, so body_hash still matches — only the full-file content_hash moves).
      writeFileSync(
        skill,
        ["---", "name: deploy", "description: Deploy", "owner: alice", "---", ...body].join("\n"),
      );
    });

    const s = silenceStdout();
    await runOptimize(["--user", "--surface", "skills", "--apply"], 1000, home, cwd, {
      triggerInspect: trigger,
    });
    s.mockRestore();

    const after = readFileSync(skill, "utf8");
    // The stale-patch guard detected the frontmatter change → apply did NOT write.
    expect(after).not.toContain("disable-model-invocation");
    expect(after).toContain("owner: alice"); // the user's concurrent edit is intact
  });
});

describe("runOptimize --backup → --restore (reverts hand edits)", () => {
  test("a file snapshotted with --backup is restored after a manual edit", async () => {
    const file = join(cwd, "AGENTS.md");
    writeFileSync(file, "original content\n");

    const s = silenceStdout();
    expect(await runOptimize(["--backup", file], 1000, home, cwd, {})).toBe(0);
    s.mockRestore();

    // Agent (or human) edits the file by hand after the snapshot.
    writeFileSync(file, "totally rewritten by an agent\n");
    expect(readFileSync(file, "utf8")).toContain("agent");

    const s2 = silenceStdout();
    expect(await runOptimize(["--restore"], 2000, home, cwd, {})).toBe(0);
    s2.mockRestore();
    // Restore brings back the pre-edit snapshot — undoing the manual edit.
    expect(readFileSync(file, "utf8")).toBe("original content\n");
  });
});
