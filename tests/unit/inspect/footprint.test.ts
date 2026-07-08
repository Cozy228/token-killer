import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import {
  computeFootprint,
  MCP_TOKENS_PER_SERVER_ESTIMATE,
} from "../../../src/inspect/footprint.js";
import type { McpAnalysis } from "../../../src/inspect/mcp.js";

let root: string;
let home: string;
let cwd: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "ctx-footprint-"));
  home = join(root, "home");
  cwd = join(root, "repo");
  mkdirSync(home, { recursive: true });
  mkdirSync(cwd, { recursive: true });
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

function write(abs: string, content: string): void {
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content);
}

const noMcp: McpAnalysis = { servers: [], sources: [] };

describe("computeFootprint — standing per-session cost", () => {
  test("buckets instructions (whole file) vs skills/agents (name+desc only) vs MCP (estimate)", () => {
    write(join(home, ".claude", "CLAUDE.md"), "# Rules\n".repeat(40));
    write(
      join(home, ".claude", "skills", "design", "SKILL.md"),
      [
        "---",
        "name: design",
        "description: Build distinctive UI when asked",
        "---",
        "# Long body",
        "x".repeat(5000),
      ].join("\n"),
    );
    write(
      join(home, ".claude", "agents", "reviewer.md"),
      [
        "---",
        "name: reviewer",
        "description: Reviews diffs for bugs",
        "---",
        "# Body",
        "y".repeat(5000),
      ].join("\n"),
    );
    const mcp: McpAnalysis = { servers: ["github", "slack"], sources: [".claude.json"] };

    const fp = computeFootprint({ scopes: ["user"], home, cwd, mcp });
    const by = Object.fromEntries(fp.items.map((i) => [i.key, i]));

    // All four surfaces present.
    expect(by.instructions.count).toBe(1);
    expect(by.skills.count).toBe(1);
    expect(by.agents.count).toBe(1);
    expect(by.mcp.count).toBe(2);

    // Skill/agent cost is the small metadata, NOT the 5000-char body.
    expect(by.skills.tokens).toBeLessThan(50);
    expect(by.agents.tokens).toBeLessThan(50);
    // Instruction file is counted whole (40 short lines → clearly bigger than metadata).
    expect(by.instructions.tokens).toBeGreaterThan(by.skills.tokens);

    // MCP is an estimate: servers × per-server constant, flagged.
    expect(by.mcp.tokens).toBe(2 * MCP_TOKENS_PER_SERVER_ESTIMATE);
    expect(by.mcp.estimated).toBe(true);
    expect(fp.has_estimate).toBe(true);

    // Total is the sum.
    expect(fp.total_tokens).toBe(fp.items.reduce((s, i) => s + i.tokens, 0));
  });

  test("omits sources with nothing installed", () => {
    write(join(home, ".claude", "CLAUDE.md"), "# Rules");
    const fp = computeFootprint({ scopes: ["user"], home, cwd, mcp: noMcp });
    expect(fp.items.map((i) => i.key)).toEqual(["instructions"]);
    expect(fp.has_estimate).toBe(false);
  });

  test("empty setup yields a zero footprint, no items", () => {
    const fp = computeFootprint({ scopes: ["user"], home, cwd, mcp: noMcp });
    expect(fp.total_tokens).toBe(0);
    expect(fp.items).toEqual([]);
  });
});
