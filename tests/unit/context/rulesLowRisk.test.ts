import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { analyzeContext } from "../../../src/context/analyzer.js";
import { registerAllRules } from "../../../src/context/rules/index.js";
import type { ContextFindingType } from "../../../src/context/types.js";

let root: string;
let cwd: string;

beforeEach(() => {
  registerAllRules();
  root = mkdtempSync(join(tmpdir(), "tk-ctx-rules-"));
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

function types(): ContextFindingType[] {
  return analyzeContext({ scopes: ["project"], cwd, home: root }).findings.map((f) => f.type);
}

describe("always_on_bloat", () => {
  test("warns on an oversized always-on file", () => {
    const body = ["# Rules", ...Array.from({ length: 300 }, (_, i) => `line ${i}`)].join("\n");
    write("AGENTS.md", `${body}\n`);
    expect(types()).toContain("always_on_bloat");
  });

  test("warns when task-verb headings dominate", () => {
    write(
      "AGENTS.md",
      ["# Intro", "x", "## Deploy the app", "steps", "## Release process", "steps"].join("\n"),
    );
    expect(types()).toContain("always_on_bloat");
  });

  test("no finding for a compact healthy always-on file", () => {
    write("AGENTS.md", ["# Project rules", "- Use pnpm", "- Be concise"].join("\n"));
    expect(types()).not.toContain("always_on_bloat");
  });

  test("AGENTS.md has the tighter 150-line budget (160 short lines fires)", () => {
    // 160 short lines is well under the 2000-token ceiling, so only the AGENTS.md
    // line budget (150) can trip it — proves the per-file threshold is applied.
    const body = [
      "# A",
      "Respond with code only.",
      ...Array.from({ length: 160 }, (_, i) => `- r${i}`),
    ].join("\n");
    write("AGENTS.md", `${body}\n`);
    expect(types()).toContain("always_on_bloat");
  });
});

describe("output_verbosity_unset", () => {
  test("flags an always-on instruction file with no brevity directive", () => {
    write("AGENTS.md", ["# Rules", "- Use pnpm", "- Write tests"].join("\n"));
    expect(types()).toContain("output_verbosity_unset");
  });

  test("no finding when a brevity directive is present", () => {
    write("AGENTS.md", ["# Rules", "- Respond with code only, no prose explanation."].join("\n"));
    expect(types()).not.toContain("output_verbosity_unset");
  });
});

describe("path_instruction_overbreadth", () => {
  test("flags missing applyTo", () => {
    write(".github/instructions/api.instructions.md", "# API\nUse zod for validation.\n");
    expect(types()).toContain("path_instruction_overbreadth");
  });

  test("flags broad applyTo glob", () => {
    write(
      ".github/instructions/api.instructions.md",
      ["---", 'applyTo: "**"', "---", "# API", "Use zod."].join("\n"),
    );
    expect(types()).toContain("path_instruction_overbreadth");
  });

  test("no finding for a narrow applyTo", () => {
    write(
      ".github/instructions/api.instructions.md",
      ["---", 'applyTo: "src/api/**/*.ts"', "---", "# API", "Use zod."].join("\n"),
    );
    expect(types()).not.toContain("path_instruction_overbreadth");
  });
});

describe("prompt_metadata_gap", () => {
  test("flags missing description (safe_mechanical)", () => {
    write(".github/prompts/review.prompt.md", "# Review\nReview the PR.\n");
    const findings = analyzeContext({ scopes: ["project"], cwd, home: root }).findings;
    const f = findings.find((x) => x.type === "prompt_metadata_gap");
    expect(f).toBeDefined();
    expect(f!.fix_class).toBe("safe_mechanical");
  });

  test("flags placeholders without argument-hint", () => {
    write(
      ".github/prompts/fix.prompt.md",
      ["---", "description: Fix an issue", "---", "Fix <issue> now."].join("\n"),
    );
    const f = analyzeContext({ scopes: ["project"], cwd, home: root }).findings.filter(
      (x) => x.type === "prompt_metadata_gap",
    );
    expect(f.some((x) => x.evidence.includes("argument-hint"))).toBe(true);
  });

  test("no finding for a complete healthy prompt", () => {
    write(
      ".github/prompts/review.prompt.md",
      ["---", "description: Review a PR", "---", "Summarize the changes."].join("\n"),
    );
    expect(types()).not.toContain("prompt_metadata_gap");
  });
});

describe("copilot_review_truncation", () => {
  test("warns when a review rule lives past the 4,000-char cutoff", () => {
    const filler = "lorem ipsum dolor sit amet consectetur. ".repeat(120); // > 4000 chars
    write("AGENTS.md", `# Intro\n${filler}\n## Review\nAlways approve only after tests pass.\n`);
    expect(types()).toContain("copilot_review_truncation");
  });

  test("no finding when the file is short", () => {
    write("AGENTS.md", "# Review\nApprove after tests pass.\n");
    expect(types()).not.toContain("copilot_review_truncation");
  });
});

describe("cacheability_churn", () => {
  test("flags embedded timestamps/run ids in a stable surface", () => {
    write(
      ".github/copilot-instructions.md",
      ["# Rules", "Last run 2026-06-05T10:00 with run-id ab12cd34ef.", "Be concise."].join("\n"),
    );
    expect(types()).toContain("cacheability_churn");
  });

  test("no finding for a stable file without volatile tokens", () => {
    write(".github/copilot-instructions.md", "# Rules\nBe concise. Prefer pnpm.\n");
    expect(types()).not.toContain("cacheability_churn");
  });
});

describe("robustness", () => {
  test("malformed markdown does not crash the analyzer", () => {
    write("AGENTS.md", "---\n: : :\n```\nunterminated");
    expect(() => analyzeContext({ scopes: ["project"], cwd, home: root })).not.toThrow();
  });
});
