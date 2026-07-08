import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  applyInjectionBlock,
  projectInjectionPath,
  removeInjectionBlock,
  unwriteInjection,
  userInjectionPath,
  writeInjection,
} from "../../../src/shim/injection.js";

describe("injection block", () => {
  test("idempotent: applying twice yields one block", () => {
    const once = applyInjectionBlock("# My instructions\n");
    const twice = applyInjectionBlock(once);
    expect(twice).toBe(once);
    expect(once.match(/>>> contexa >>>/g)?.length).toBe(1);
  });

  test("preserves pre-existing content", () => {
    const result = applyInjectionBlock("# My instructions\n");
    expect(result).toContain("# My instructions");
    expect(result).toContain("Prefix shell commands with `ctx`");
  });

  test("remove restores content without the block", () => {
    const original = "# My instructions\n";
    expect(removeInjectionBlock(applyInjectionBlock(original))).toBe("# My instructions\n");
  });
});

describe("injection targets", () => {
  test("Copilot CLI user-level path is under ~/.copilot", () => {
    expect(userInjectionPath("copilot-cli", "/home/u")).toBe(
      join("/home/u", ".copilot", "copilot-instructions.md"),
    );
  });

  test("VS Code user-level path is a user-profile .instructions.md it actually loads", () => {
    // VS Code does not auto-load <vscodeUserDir>/copilot-instructions.md; its
    // user-level channel is ~/.copilot/instructions/*.instructions.md (ADR 0008).
    expect(userInjectionPath("vscode", "/home/u", "/home/u/.config/Code/User")).toBe(
      join("/home/u", ".copilot", "instructions", "contexa-prefix.instructions.md"),
    );
  });

  test("project path is .github/copilot-instructions.md in the repo", () => {
    expect(projectInjectionPath("/repo")).toBe(join("/repo", ".github", "copilot-instructions.md"));
  });
});

describe("writeInjection round-trip", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "ctx-inject-"));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  test("creates the file (and parent dirs); unwrite of an injection-only file deletes it", () => {
    const file = join(dir, "nested", "copilot-instructions.md");
    writeInjection(file);
    expect(existsSync(file)).toBe(true);
    expect(readFileSync(file, "utf8")).toContain("Contexa");
    unwriteInjection(file);
    // ctx created the file solely for its block, so unwrite removes it rather than
    // leaving a 0-byte file behind.
    expect(existsSync(file)).toBe(false);
  });

  test("unwrite preserves a file that has the user's own content", () => {
    const file = join(dir, "copilot-instructions.md");
    writeFileSync(file, "# My rules\n");
    writeInjection(file);
    expect(readFileSync(file, "utf8")).toContain(">>> contexa >>>");
    unwriteInjection(file);
    expect(existsSync(file)).toBe(true);
    const after = readFileSync(file, "utf8");
    expect(after).toContain("# My rules");
    expect(after).not.toContain(">>> contexa >>>");
  });

  test("is idempotent against an existing file", () => {
    const file = join(dir, "copilot-instructions.md");
    writeFileSync(file, "# Existing\n");
    writeInjection(file);
    const once = readFileSync(file, "utf8");
    writeInjection(file);
    expect(readFileSync(file, "utf8")).toBe(once);
  });

  test("a .instructions.md target gets always-on frontmatter and is deleted whole", () => {
    // VS Code only applies a .instructions.md with an `applyTo` frontmatter, and ctx
    // owns the file entirely (ADR 0008) — so it is whole-written and whole-deleted,
    // never marker-merged.
    const file = join(dir, "instructions", "contexa-prefix.instructions.md");
    writeInjection(file);
    const content = readFileSync(file, "utf8");
    expect(content.startsWith("---\napplyTo: '**'\n---\n")).toBe(true);
    expect(content).toContain("Prefix shell commands with `ctx`");
    expect(content).toContain(">>> contexa >>>");
    unwriteInjection(file);
    expect(existsSync(file)).toBe(false);
  });
});
