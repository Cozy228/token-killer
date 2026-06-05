import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { historyFile, projectFingerprint } from "../../../src/core/dataDir.js";
import type { HistoryRecord } from "../../../src/core/history.js";
import { recordGovernance } from "../../../src/core/governance.js";
import { recordOptimizeAction } from "../../../src/inspect/optimizeActions.js";
import { loadLedgers, renderJson, renderText } from "../../../src/core/ledger.js";

let root: string;
let cwd: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "tk-ledger-"));
  cwd = join(root, "repo");
  mkdirSync(cwd, { recursive: true });
  process.env.TOKEN_KILLER_HOME = join(root, ".token-killer");
});
afterEach(() => {
  delete process.env.TOKEN_KILLER_HOME;
  rmSync(root, { recursive: true, force: true });
});

function historyRow(overrides: Partial<HistoryRecord> = {}): HistoryRecord {
  return {
    timestamp: "2026-06-05T10:00:00.000Z",
    command: "git status",
    handler: "git-status",
    raw_chars: 400,
    output_chars: 100,
    raw_tokens: 100,
    output_tokens: 25,
    saved_tokens: 75,
    savings_pct: 75,
    exit_code: 0,
    duration_ms: 10,
    quality_status: "passed",
    ...overrides,
  };
}

function writeHistory(rows: HistoryRecord[]): void {
  const file = historyFile(cwd);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
}

describe("loadLedgers — four independent ledgers, joined read-side", () => {
  test("project scope joins ①②③④ from their separate stores", async () => {
    writeHistory([
      historyRow(),
      historyRow({ handler: "fallback", saved_tokens: 0 }),
      historyRow({ quality_status: "failure", saved_tokens: 0 }),
    ]);
    await recordGovernance(cwd, {
      ts: "2026-06-05T10:00:00.000Z",
      kind: "denied_large_reads",
      decision: "deny",
      category: "read",
    });
    recordOptimizeAction(
      { scope: "project", fingerprint: projectFingerprint(cwd) },
      {
        surface: "skill",
        before_hash: "a",
        before_tokens: 100,
        after_hash: "b",
        after_tokens: 60,
        exposure_class: "on-invocation",
        ts: "2026-06-05T10:00:00.000Z",
        file: "/repo/skill.md",
      },
    );

    const l = await loadLedgers({ scope: "project", cwd });

    // ① measured
    expect(l.measured_command_savings).toMatchObject({ estimate_kind: "measured", commands: 3, saved_tokens: 75 });
    // ② measured delta
    expect(l.optimizer_deltas.surfaces[0]).toMatchObject({ delta_tokens: 40, exposure_class: "on-invocation" });
    // ③ opportunity
    expect(l.governance_opportunities).toMatchObject({ denied_large_reads: 1, estimate_kind: "opportunity" });
    // ④ guardrails: fallback 1/3, failure 1/3, raw_reopen n/a
    expect(l.quality_guardrails).toMatchObject({
      commands: 3,
      fallback_rate: 0.3333,
      failure_rate: 0.3333,
      raw_reopen_rate: "n/a",
    });
  });

  test("runtime scope renders only ②③; ① and ④ are scope n/a", async () => {
    await recordGovernance(cwd, {
      ts: "2026-06-05T10:00:00.000Z",
      kind: "suggested_broad_searches",
      decision: "suggest",
      category: "search",
    });
    const l = await loadLedgers({ scope: "runtime", cwd });
    expect(l.measured_command_savings).toMatchObject({ scope_na: true });
    expect(l.quality_guardrails).toMatchObject({ scope_na: true });
    expect(l.governance_opportunities.suggested_broad_searches).toBe(1);
  });

  test("empty stores yield empty sections, never a throw", async () => {
    const l = await loadLedgers({ scope: "project", cwd });
    expect(l.measured_command_savings).toMatchObject({ commands: 0 });
    expect(l.optimizer_deltas.surfaces).toEqual([]);
    expect(l.governance_opportunities.denied_large_reads).toBe(0);
  });
});

describe("rendering — no grand total, four top-level JSON keys", () => {
  test("--json has exactly the four ledgers plus scope metadata, never a total", async () => {
    const l = await loadLedgers({ scope: "project", cwd });
    const obj = JSON.parse(renderJson(l));
    expect(Object.keys(obj).sort()).toEqual(
      ["governance_opportunities", "measured_command_savings", "optimizer_deltas", "quality_guardrails", "scope", "since"].sort(),
    );
    // no key suggests a cross-ledger sum
    for (const key of Object.keys(obj)) {
      expect(key).not.toMatch(/total|grand|combined|sum/i);
    }
  });

  test("text render shows all four numbered ledger sections", async () => {
    const text = renderText(await loadLedgers({ scope: "project", cwd }));
    expect(text).toContain("① Measured command savings");
    expect(text).toContain("② Optimizer deltas");
    expect(text).toContain("③ Governance opportunities");
    expect(text).toContain("④ Quality guardrails");
    expect(text).toContain("never summed");
    expect(text).toContain("raw_reopen_rate n/a (deferred)");
  });

  test("saved_tokens appears only under ledger ①", async () => {
    writeHistory([historyRow()]);
    const obj = JSON.parse(renderJson(await loadLedgers({ scope: "project", cwd })));
    expect("saved_tokens" in obj.measured_command_savings).toBe(true);
    expect(JSON.stringify(obj.optimizer_deltas)).not.toContain("saved_tokens");
    expect(JSON.stringify(obj.governance_opportunities)).not.toContain("saved_tokens");
    expect(JSON.stringify(obj.quality_guardrails)).not.toContain("saved_tokens");
  });
});
