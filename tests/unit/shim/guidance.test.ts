import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

  // I4: the standalone ~/.copilot/TK.md was dead weight — copilot has no import
  // syntax so it only ever read copilot-instructions.md. It must NOT be written.
  test("does NOT write a standalone ~/.copilot/TK.md", () => {
    const result = writeGuidance("copilot-cli", home);
    expect(result.guidance).toBeUndefined();
    expect(guidanceFilePath("copilot-cli", home)).toBeUndefined();
    expect(existsSync(path.join(home, ".copilot", "TK.md"))).toBe(false);
  });

  // The inlined block must still be cleaned up on uninstall.
  test("unwriteGuidance strips the inlined copilot block", () => {
    writeGuidance("copilot-cli", home);
    const loader = path.join(home, ".copilot", "copilot-instructions.md");
    expect(readFileSync(loader, "utf8")).toContain("git status --short");
    unwriteGuidance("copilot-cli", home);
    expect(readFileSync(loader, "utf8")).not.toContain("token-killer >>>");
  });
});

describe("writeGuidance — vscode (user-level .instructions.md, inlined)", () => {
  test("writes an always-on .instructions.md with the inlined guide and no @import", () => {
    const result = writeGuidance("vscode", home);

    const file = path.join(home, ".copilot", "instructions", "token-killer.instructions.md");
    expect(result.guidance).toBe(file);
    expect(guidanceFilePath("vscode", home)).toBe(file);
    // VS Code has no separate loader file — the .instructions.md IS auto-loaded.
    expect(guidanceLoader("vscode", home)).toBeUndefined();
    expect(result.loader).toBeUndefined();

    const instr = readFileSync(file, "utf8");
    // Always-on frontmatter the .instructions.md format requires (ADR 0008).
    expect(instr.startsWith("---\napplyTo: '**'\n---\n")).toBe(true);
    // Full guide inlined — VS Code does not resolve Claude Code's @import.
    expect(instr).toContain("git status --short");
    expect(instr).not.toContain("@TK.md");
  });

  test("unwriteGuidance removes the .instructions.md", () => {
    writeGuidance("vscode", home);
    const file = guidanceFilePath("vscode", home)!;
    expect(readFileSync(file, "utf8")).toContain("applyTo");
    unwriteGuidance("vscode", home);
    expect(() => readFileSync(file, "utf8")).toThrow();
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
