import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { decide } from "../../../src/hook/copilot.js";
import { normalize } from "../../../src/hook/normalize.js";
import {
  governanceFile,
  readGovernance,
  recordGovernance,
  summarizeGovernance,
  type GovernanceRecord,
} from "../../../src/core/governance.js";

let root: string;
let cwd: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "ctx-gov-"));
  cwd = join(root, "repo");
  process.env.CONTEXA_HOME = join(root, ".contexa");
});
afterEach(() => {
  delete process.env.CONTEXA_HOME;
  rmSync(root, { recursive: true, force: true });
});

function gov(overrides: Partial<GovernanceRecord> = {}): GovernanceRecord {
  return {
    ts: "2026-06-05T10:00:00.000Z",
    kind: "denied_large_reads",
    decision: "deny",
    category: "read",
    ...overrides,
  };
}

describe("governance store round-trip", () => {
  test("records and reads back labels+lengths only — never command text", async () => {
    await recordGovernance(cwd, gov());
    const rows = await readGovernance(cwd);
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe("denied_large_reads");
    expect(rows[0].project_fingerprint).toMatch(/^repo:/);
    // privacy: the row shape carries no command/prompt/path field
    expect(JSON.stringify(rows[0])).not.toContain("node_modules");
  });

  test("missing store reads as empty (fail-open)", async () => {
    expect(await readGovernance(cwd)).toEqual([]);
    expect(existsSync(governanceFile(cwd))).toBe(false);
  });

  test("corrupt store reads as empty, never a throw", async () => {
    const file = governanceFile(cwd);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, "not-json\n{broken\n");
    await expect(readGovernance(cwd)).resolves.toEqual([]);
  });

  test("partially-corrupt store: good lines survive, bad lines are skipped", async () => {
    const file = governanceFile(cwd);
    mkdirSync(dirname(file), { recursive: true });
    const good = JSON.stringify(
      gov({ kind: "denied_large_reads", decision: "deny", category: "read" }),
    );
    writeFileSync(file, `${good}\nnot-json\n${good}\n`);
    const rows = await readGovernance(cwd);
    expect(rows).toHaveLength(2);
    expect(rows[0].kind).toBe("denied_large_reads");
  });
});

describe("summarizeGovernance — counts first, estimate clearly labeled", () => {
  test("counts each kind and folds only prompt magnitude into the heuristic estimate", () => {
    const ledger = summarizeGovernance([
      gov({ kind: "denied_large_reads", decision: "deny", category: "read" }),
      gov({ kind: "suggested_broad_searches", decision: "suggest", category: "search" }),
      gov({
        kind: "denied_large_prompts",
        decision: "deny",
        category: "prompt",
        estimated_tokens: 20000,
      }),
      gov({
        kind: "suggested_large_prompts",
        decision: "suggest",
        category: "prompt",
        estimated_tokens: 5000,
      }),
    ]);

    expect(ledger.denied_large_reads).toBe(1);
    expect(ledger.suggested_broad_searches).toBe(1);
    expect(ledger.denied_large_prompts).toBe(1);
    expect(ledger.suggested_large_prompts).toBe(1);
    expect(ledger.estimate_kind).toBe("opportunity");
    expect(ledger.avoided_tokens_estimate_kind).toBe("heuristic");
    // deny 1.0 × 20000 + suggest 0.4 × 5000 = 22000; reads/searches add nothing.
    expect(ledger.avoided_tokens_estimate).toBe(22000);
  });
});

describe("executed-rewrite exclusion (the single most important ③ property)", () => {
  test("a shell rewrite decision carries no governance_kind → never written to ③", () => {
    const d = decide(
      normalize({
        event: "preToolUse",
        toolName: "bash",
        toolArgs: JSON.stringify({ command: "git status" }),
      }),
    );
    expect(d.decision).toBe("rewrite");
    expect(d.governance_kind).toBeUndefined();
  });

  test("a deny/suggest decision DOES carry a governance_kind", () => {
    const deny = decide(
      normalize({
        event: "preToolUse",
        tool_name: "read_file",
        tool_input: { filePath: "node_modules/x/i.js" },
      }),
    );
    expect(deny.decision).toBe("deny");
    expect(deny.governance_kind).toBe("denied_large_reads");

    const suggest = decide(
      normalize({ event: "preToolUse", tool_name: "grep_search", tool_input: { query: "TODO" } }),
    );
    expect(suggest.decision).toBe("suggest");
    expect(suggest.governance_kind).toBe("suggested_broad_searches");
  });

  test("the model-routing hint suggest carries no governance_kind (not a size opportunity)", () => {
    const d = decide(normalize({ event: "userPromptSubmitted", prompt: "implement a login form" }));
    expect(d.decision).toBe("suggest");
    expect(d.governance_kind).toBeUndefined();
  });
});

describe("governance.jsonl is written line-delimited JSON", () => {
  test("appends one line per record", async () => {
    await recordGovernance(cwd, gov());
    await recordGovernance(
      cwd,
      gov({ kind: "suggested_broad_searches", decision: "suggest", category: "search" }),
    );
    const text = readFileSync(governanceFile(cwd), "utf8");
    expect(text.trim().split("\n")).toHaveLength(2);
  });
});
