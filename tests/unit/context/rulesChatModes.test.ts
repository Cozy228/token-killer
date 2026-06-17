import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { analyzeContext } from "../../../src/context/analyzer.js";
import { registerAllRules } from "../../../src/context/rules/index.js";
import type { ContextFinding } from "../../../src/context/types.js";

let root: string;
let home: string;
let cwd: string;

beforeEach(() => {
  registerAllRules();
  root = mkdtempSync(join(tmpdir(), "tk-ctx-modes-"));
  home = join(root, "home");
  cwd = join(root, "repo");
  mkdirSync(home, { recursive: true });
  mkdirSync(cwd, { recursive: true });
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

function writeChatMode(name: string, content: string): void {
  const abs = join(cwd, ".github", "chatmodes", `${name}.chatmode.md`);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content);
}
function findings(): ContextFinding[] {
  return analyzeContext({ scopes: ["project"], home, cwd }).findings;
}

describe("chat_mode_bloat", () => {
  test("flags an oversized chat mode (loads as system prompt while active)", () => {
    const body = ["---", "description: Big mode", "---", ...Array(250).fill("Do the thing.")].join(
      "\n",
    );
    writeChatMode("big", body);
    const f = findings().find((x) => x.type === "chat_mode_bloat");
    expect(f).toBeDefined();
    expect(f!.surface).toBe("chat_mode");
    expect(f!.evidence).toContain("lines");
  });

  test("a lean chat mode is not flagged", () => {
    writeChatMode(
      "lean",
      ["---", "description: Lean mode", "---", "# Review only", "Be terse."].join("\n"),
    );
    expect(findings().some((x) => x.type === "chat_mode_bloat")).toBe(false);
  });
});
