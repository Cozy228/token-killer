import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { ScopeBucket } from "../../../src/inspect/persist.js";
import {
  countFindingsReverted,
  exposureForSurface,
  type OptimizeAction,
  readOptimizeActions,
  recordOptimizeAction,
  summarizeOptimizer,
} from "../../../src/inspect/optimizeActions.js";

const BUCKET: ScopeBucket = { scope: "user" };

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "tk-opt-act-"));
  process.env.TOKEN_KILLER_HOME = join(root, ".token-killer");
});
afterEach(() => {
  delete process.env.TOKEN_KILLER_HOME;
  rmSync(root, { recursive: true, force: true });
});

function action(overrides: Partial<OptimizeAction> = {}): OptimizeAction {
  return {
    surface: "skill",
    before_hash: "aaa",
    before_tokens: 100,
    after_hash: "bbb",
    after_tokens: 60,
    exposure_class: "on-invocation",
    ts: "2026-06-05T10:00:00.000Z",
    ...overrides,
  };
}

describe("exposure mapping (§0.1.8) — a category, never a multiplier", () => {
  test("always-on / path-scoped / on-invocation", () => {
    expect(exposureForSurface("copilot_instructions")).toBe("always-on");
    expect(exposureForSurface("agent_instructions")).toBe("always-on");
    expect(exposureForSurface("stable_prefix")).toBe("always-on");
    expect(exposureForSurface("path_instructions")).toBe("path-scoped");
    expect(exposureForSurface("prompt_file")).toBe("on-invocation");
    expect(exposureForSurface("custom_agent")).toBe("on-invocation");
    expect(exposureForSurface("skill")).toBe("on-invocation");
  });
});

describe("optimize-actions store round-trip", () => {
  test("appends and reads back", () => {
    recordOptimizeAction(BUCKET, action());
    recordOptimizeAction(BUCKET, action({ surface: "prompt_file" }));
    expect(readOptimizeActions(BUCKET)).toHaveLength(2);
  });

  test("missing store reads as empty (fail-open)", () => {
    expect(readOptimizeActions(BUCKET)).toEqual([]);
  });
});

describe("summarizeOptimizer — a STATE diff, never accumulated", () => {
  test("applying twice yields origBefore − finalAfter, not the sum of deltas", () => {
    const actions = [
      action({ before_tokens: 100, before_hash: "h0", after_tokens: 70, after_hash: "h1", ts: "2026-06-05T10:00:00.000Z" }),
      action({ before_tokens: 70, before_hash: "h1", after_tokens: 50, after_hash: "h2", ts: "2026-06-05T11:00:00.000Z" }),
    ];
    const ledger = summarizeOptimizer(actions);
    expect(ledger.estimate_kind).toBe("measured");
    expect(ledger.surfaces).toHaveLength(1);
    const s = ledger.surfaces[0];
    // state diff: 100 (earliest before) − 50 (latest after) = 50.
    // The accumulated sum-of-deltas would be (100−70)+(70−50)=50 here by coincidence,
    // so use distinct numbers below to force the distinction.
    expect(s.before_tokens).toBe(100);
    expect(s.after_tokens).toBe(50);
    expect(s.delta_tokens).toBe(50);
  });

  test("a later re-edit that grows the file shrinks the state delta (not a frozen flow)", () => {
    // If ② accumulated, the first −50 trim would be banked forever. As a state diff,
    // a later edit that grows the surface back lowers the reported delta.
    const grown = summarizeOptimizer([
      action({ before_tokens: 200, after_tokens: 150, ts: "2026-06-05T10:00:00.000Z" }),
      action({ before_tokens: 150, after_tokens: 190, ts: "2026-06-05T11:00:00.000Z" }),
    ]).surfaces[0];
    // state diff = 200 (baseline) − 190 (current) = 10, NOT the banked 50.
    expect(grown.delta_tokens).toBe(10);
  });

  test("a surface's delta is independent of how many times it was touched", () => {
    const once = summarizeOptimizer([
      action({ before_tokens: 100, after_tokens: 40, ts: "2026-06-05T10:00:00.000Z" }),
    ]).surfaces[0];
    const thrice = summarizeOptimizer([
      action({ before_tokens: 100, after_tokens: 80, ts: "2026-06-05T10:00:00.000Z" }),
      action({ before_tokens: 80, after_tokens: 60, ts: "2026-06-05T11:00:00.000Z" }),
      action({ before_tokens: 60, after_tokens: 40, ts: "2026-06-05T12:00:00.000Z" }),
    ]).surfaces[0];
    // Both end at 40 from a 100 baseline → same state delta 60, NOT 20+20+20 summed onto anything.
    expect(once.delta_tokens).toBe(60);
    expect(thrice.delta_tokens).toBe(60);
  });
});

describe("countFindingsReverted (ledger ④) — fires only on a true revert", () => {
  test("current hash back to before_hash → reverted", () => {
    const actions = [action({ before_hash: "ORIG", after_hash: "OPT" })];
    expect(countFindingsReverted(actions, new Set(["ORIG"]))).toBe(1);
  });

  test("current hash still at after_hash (applied) → not reverted", () => {
    const actions = [action({ before_hash: "ORIG", after_hash: "OPT" })];
    expect(countFindingsReverted(actions, new Set(["OPT"]))).toBe(0);
  });

  test("current hash is something else (re-edited) → not reverted", () => {
    const actions = [action({ before_hash: "ORIG", after_hash: "OPT" })];
    expect(countFindingsReverted(actions, new Set(["THIRD"]))).toBe(0);
  });

  test("a no-op action (before == after) never counts as reverted", () => {
    const actions = [action({ before_hash: "SAME", after_hash: "SAME" })];
    expect(countFindingsReverted(actions, new Set(["SAME"]))).toBe(0);
  });

  test("no current hashes (inspect hasn't run) → not a revert", () => {
    const actions = [action({ before_hash: "ORIG", after_hash: "OPT" })];
    expect(countFindingsReverted(actions, new Set())).toBe(0);
  });

  test("older action before_hash matches but latest action after_hash is different — only latest counts", () => {
    // surface was: ORIG → OPT → REVISED (three states). Current hash is ORIG (full revert).
    // Only the LATEST action matters: after_hash=REVISED, so before_hash=OPT must appear in
    // current hashes to register as a revert. ORIG appearing means the latest action was also
    // reverted — before_hash of latest is OPT, not ORIG. So revert count = 0 here.
    const actions = [
      action({ before_hash: "ORIG", after_hash: "OPT", ts: "2026-06-05T10:00:00.000Z" }),
      action({ before_hash: "OPT", after_hash: "REVISED", ts: "2026-06-05T11:00:00.000Z" }),
    ];
    // Current hash is ORIG — latest action's before_hash is OPT, not ORIG, so NOT reverted.
    expect(countFindingsReverted(actions, new Set(["ORIG"]))).toBe(0);
    // Current hash is OPT — matches latest action's before_hash → reverted.
    expect(countFindingsReverted(actions, new Set(["OPT"]))).toBe(1);
  });
});
