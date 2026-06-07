import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, test } from "vitest";

import {
  guidanceDoc,
  guidanceFilePath,
  guidanceLoader,
  unwriteGuidance,
  writeGuidance,
} from "../../../src/shim/guidance.js";

let home: string;

beforeEach(() => {
  home = mkdtempSync(path.join(tmpdir(), "tk-guidance-"));
});

afterEach(() => {
  rmSync(home, { recursive: true, force: true });
});

describe("guidanceDoc", () => {
  test("teaches native terse forms and the gain-0% caveat", () => {
    const doc = guidanceDoc();
    expect(doc).toContain("git status --short");
    expect(doc).toContain("git log --oneline");
    expect(doc).toContain("git diff --stat");
    // The healthy-0% framing the user cares about.
    expect(doc).toMatch(/0%.*HEALTHY/);
  });
});

describe("writeGuidance — claude-code", () => {
  test("writes TK.md and wires a guarded @TK.md import into CLAUDE.md", () => {
    const result = writeGuidance("claude-code", home);

    expect(result.guidance).toBe(path.join(home, ".claude", "TK.md"));
    expect(result.loader).toBe(path.join(home, ".claude", "CLAUDE.md"));

    const tkmd = readFileSync(guidanceFilePath("claude-code", home)!, "utf8");
    expect(tkmd).toContain("Token Killer — usage guide");

    const claudeMd = readFileSync(path.join(home, ".claude", "CLAUDE.md"), "utf8");
    expect(claudeMd).toContain("@TK.md");
    expect(claudeMd).toContain("<!-- >>> token-killer >>> -->");
  });

  test("preserves existing CLAUDE.md content and is idempotent", () => {
    const claudePath = path.join(home, ".claude", "CLAUDE.md");
    mkdirSync(path.join(home, ".claude"), { recursive: true });
    writeFileSync(claudePath, "# My rules\n\nAlways use pnpm.\n");
    writeGuidance("claude-code", home);
    writeGuidance("claude-code", home); // second run must not duplicate the block

    const content = readFileSync(claudePath, "utf8");
    expect(content).toContain("Always use pnpm.");
    expect(content.match(/@TK\.md/g)?.length).toBe(1);
  });
});

describe("writeGuidance — copilot-cli (no @import, inline instead)", () => {
  test("inlines the guidance into copilot-instructions.md", () => {
    writeGuidance("copilot-cli", home);

    expect(guidanceLoader("copilot-cli", home)?.path).toBe(
      path.join(home, ".copilot", "copilot-instructions.md"),
    );
    const instr = readFileSync(path.join(home, ".copilot", "copilot-instructions.md"), "utf8");
    // Inlined (copilot has no import syntax), under tk's guarded markers.
    expect(instr).toContain("git status --short");
    expect(instr).toContain("<!-- >>> token-killer >>> -->");
  });
});

describe("unwriteGuidance", () => {
  test("deletes TK.md and strips the loader block, keeping user content", () => {
    const claudePath = path.join(home, ".claude", "CLAUDE.md");
    writeGuidance("claude-code", home);
    // user adds their own content after init
    writeFileSync(claudePath, `# Mine\n\n${readFileSync(claudePath, "utf8")}`);

    unwriteGuidance("claude-code", home);

    expect(() => readFileSync(guidanceFilePath("claude-code", home)!, "utf8")).toThrow();
    const content = readFileSync(claudePath, "utf8");
    expect(content).toContain("# Mine");
    expect(content).not.toContain("@TK.md");
    expect(content).not.toContain("token-killer >>>");
  });
});
