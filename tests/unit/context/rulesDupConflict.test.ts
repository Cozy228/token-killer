import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { analyzeContext } from "../../../src/context/analyzer.js";
import { registerAllRules } from "../../../src/context/rules/index.js";
import type { ContextFinding, ContextFindingType } from "../../../src/context/types.js";

let root: string;
let cwd: string;

beforeEach(() => {
  registerAllRules();
  root = mkdtempSync(join(tmpdir(), "tg-ctx-dc-"));
  cwd = join(root, "repo");
  mkdirSync(cwd, { recursive: true });
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function write(rel: string, content: string): void {
  const abs = join(cwd, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content);
}

function findings(): ContextFinding[] {
  return analyzeContext({ scopes: ["project"], cwd, home: root }).findings;
}
function types(): ContextFindingType[] {
  return findings().map((f) => f.type);
}

const SHARED_SECTION = [
  "## Testing policy",
  "Always run the targeted test for the file you changed before opening a pull request.",
  "Prefer pnpm and keep the diff focused on the change at hand for reviewers everywhere.",
  "Document any skipped checks in the description and link the tracking issue for context.",
  "Reviewers should confirm the failing case is covered before they approve the request.",
].join("\n");

// One-word substitution against SHARED_SECTION → normalized similarity > 0.92.
const NEAR_SECTION = SHARED_SECTION.replace("everywhere", "consistently");

describe("instruction_duplicate", () => {
  test("detects an exact duplicated section across two files", () => {
    write("AGENTS.md", `# Root\n\n${SHARED_SECTION}\n`);
    write("CLAUDE.md", `# Claude\n\n${SHARED_SECTION}\n`);
    expect(types()).toContain("instruction_duplicate");
  });

  test("detects a near-duplicate section with the same heading", () => {
    write("AGENTS.md", `# Root\n\n${SHARED_SECTION}\n`);
    write("CLAUDE.md", `# Claude\n\n${NEAR_SECTION}\n`);
    const dup = findings().filter((f) => f.type === "instruction_duplicate");
    expect(dup.length).toBeGreaterThanOrEqual(1);
    // Never deletes — advisory only.
    expect(dup.every((f) => f.fix_class === "advisory")).toBe(true);
  });

  test("no duplicate finding for distinct content", () => {
    write("AGENTS.md", "# Root\n\n## Build\nUse pnpm build for the production bundle output.\n");
    write("CLAUDE.md", "# Claude\n\n## Style\nWrite terse comments and prefer composition here.\n");
    expect(types()).not.toContain("instruction_duplicate");
  });
});

describe("instruction_conflict", () => {
  test("flags contradictory language directives across files", () => {
    write("AGENTS.md", "# Root\nAlways reply in English to the user.\n");
    write("CLAUDE.md", "# Claude\nReply in Chinese for every response.\n");
    const conflict = findings().filter((f) => f.type === "instruction_conflict");
    expect(conflict.length).toBe(1);
    expect(conflict[0].severity).toBe("warn");
    expect(conflict[0].evidence).toContain("vs");
  });

  test("flags contradictory commit policy", () => {
    write("AGENTS.md", "# Root\nCommit automatically after each successful change.\n");
    write("CLAUDE.md", "# Claude\nNever commit without approval from the user.\n");
    expect(types()).toContain("instruction_conflict");
  });

  test("no conflict when only one side is present", () => {
    write("AGENTS.md", "# Root\nReply in Chinese for every response.\n");
    expect(types()).not.toContain("instruction_conflict");
  });
});

describe("conditional_rule_in_always_on", () => {
  test("flags path/framework scopes embedded in an always-on file", () => {
    write(
      "AGENTS.md",
      ["# Rules", "For files under src/**, run the React lint with `npm run lint`.", "When editing frontend code, prefer hooks."].join("\n"),
    );
    expect(types()).toContain("conditional_rule_in_always_on");
  });

  test("no finding for a generic always-on rule", () => {
    write("AGENTS.md", "# Rules\nBe concise and prefer pnpm.\n");
    expect(types()).not.toContain("conditional_rule_in_always_on");
  });
});

describe("task_prompt_in_instruction", () => {
  test("flags a workflow template with placeholders", () => {
    write(
      "AGENTS.md",
      ["# Rules", "Use this prompt to triage <issue>:", "1. Read the report", "2. Reproduce", "3. When the user asks, file a fix"].join("\n"),
    );
    expect(types()).toContain("task_prompt_in_instruction");
  });

  test("no finding for plain guidance", () => {
    write("AGENTS.md", "# Rules\nKeep functions small. Prefer composition.\n");
    expect(types()).not.toContain("task_prompt_in_instruction");
  });
});

describe("agent_overbreadth", () => {
  test("flags a generic read-only agent with write tools", () => {
    write(
      ".github/agents/dev.agent.md",
      ["---", "name: developer", "tools: [edit, terminal]", "model: opus", "---", "Review and summarize pull requests."].join("\n"),
    );
    expect(types()).toContain("agent_overbreadth");
  });

  test("no finding for a focused agent", () => {
    write(
      ".github/agents/release.agent.md",
      ["---", "name: release-captain", "description: Cuts a release following the checklist", "tools: [read]", "---", "Cut a release."].join("\n"),
    );
    expect(types()).not.toContain("agent_overbreadth");
  });
});

describe("no broad source-code scan", () => {
  test("source files are never opened as context", () => {
    write("src/index.ts", "export const x = 1; // TODO conflict reply in english\n");
    write("AGENTS.md", "# Rules\nBe concise.\n");
    // The .ts file must not contribute findings.
    const scanned = analyzeContext({ scopes: ["project"], cwd, home: root });
    expect(scanned.files_scanned).toBe(1);
  });
});
