// Ledger 2 store - optimizer deltas (metrics-ledger Gap B, section 0.1.5).
//
// Append-only `inspect/<bucket>/optimize-actions.jsonl`, one record per applied
// optimize action. `inspect/<bucket>/latest.json` is overwrite-only, so a
// surface's pre-optimization `before_tokens` would be gone by delta time - this
// log keeps it. The append-only form (not a single overwritten baseline) is what
// also lets ledger 4 tell a user revert from a re-edit: without the recorded
// `after_hash` the two are indistinguishable.
//
// Privacy (section 2): labels + lengths + content hashes only - never the body
// text, and never a file path (revert detection is driven by the inspect re-scan,
// not by re-reading a stored path).

import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { parseJsonl } from "../core/jsonl.js";
import type { ContextSurface } from "../context/types.js";
import { inspectBucketDir, type ScopeBucket } from "./persist.js";

// section 0.1.8 - exposure is a CATEGORY, never a multiplier. always-on <-
// instructions / AGENTS.md / CLAUDE.md / stable prompt prefix; path-scoped <-
// *.instructions.md (applyTo); on-invocation <- prompts / agents / skills.
export type ExposureClass = "always-on" | "path-scoped" | "on-invocation";

export const SURFACE_EXPOSURE: Record<ContextSurface, ExposureClass> = {
  copilot_instructions: "always-on",
  agent_instructions: "always-on",
  stable_prefix: "always-on",
  path_instructions: "path-scoped",
  prompt_file: "on-invocation",
  custom_agent: "on-invocation",
  chat_mode: "on-invocation",
  skill: "on-invocation",
  // Host setting that compresses every session's terminal output → always-on.
  vscode_settings: "always-on",
};

export function exposureForSurface(surface: ContextSurface): ExposureClass {
  return SURFACE_EXPOSURE[surface] ?? "on-invocation";
}

export type OptimizeAction = {
  surface: string;
  // body_hash (BodyMetrics, section 0.1.5) of the surface before/after the action -
  // the SAME hash space inspect records in latest.json, so ledger 4 can detect a
  // revert by re-scan without this store ever holding a file path (privacy section 2).
  before_hash: string;
  after_hash: string;
  // Whole-file estimated tokens (the loaded-context cost). `delta = before - after`
  // is a MEASURED diff of two snapshots (section 0.1.5) - never an estimate. Lengths only.
  before_tokens: number;
  after_tokens: number;
  exposure_class: ExposureClass;
  ts: string;
};

export function optimizeActionsPath(bucket: ScopeBucket): string {
  return join(inspectBucketDir(bucket), "optimize-actions.jsonl");
}

export function recordOptimizeAction(bucket: ScopeBucket, action: OptimizeAction): void {
  const dir = inspectBucketDir(bucket);
  // Owner-only like the other ledgers under ~/.token-killer/ (0700 dir / 0600 file).
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  appendFileSync(optimizeActionsPath(bucket), `${JSON.stringify(action)}\n`, { mode: 0o600 });
}

export function readOptimizeActions(bucket: ScopeBucket): OptimizeAction[] {
  const path = optimizeActionsPath(bucket);
  if (!existsSync(path)) return [];
  try {
    return parseJsonl<OptimizeAction>(readFileSync(path, "utf8"));
  } catch {
    return [];
  }
}

// -- Ledger 2 aggregation - a STATE diff, never an accumulated flow --

export type OptimizerDelta = {
  surface: string;
  before_tokens: number;
  after_tokens: number;
  delta_tokens: number;
  exposure_class: ExposureClass;
};

export type OptimizerLedger = {
  // The delta is measured (a diff); the only uncertainty is exposure, which
  // `exposure_class` carries as a category - there is no `confidence` multiplier.
  estimate_kind: "measured";
  surfaces: OptimizerDelta[];
};

// Collapse a surface's action history to ONE current-state delta: the earliest
// recorded `before` (the true pre-optimization baseline) vs the latest `after`
// (the current state). delta = earliestBefore - latestAfter. This is a state diff
// - applying twice yields `origBefore - finalAfter`, NOT the sum of the two
// per-run deltas (anti-goal: ledger 2 must never accumulate). Grouped by surface,
// the granularity section 1.2 reports at (no path is stored).
export function summarizeOptimizer(actions: OptimizeAction[]): OptimizerLedger {
  const groups = new Map<string, OptimizeAction[]>();
  for (const action of actions) {
    const list = groups.get(action.surface) ?? [];
    list.push(action);
    groups.set(action.surface, list);
  }

  const surfaces: OptimizerDelta[] = [];
  for (const list of groups.values()) {
    const ordered = [...list].sort((a, b) => a.ts.localeCompare(b.ts));
    const first = ordered[0];
    const last = ordered[ordered.length - 1];
    surfaces.push({
      surface: first.surface,
      before_tokens: first.before_tokens,
      after_tokens: last.after_tokens,
      delta_tokens: first.before_tokens - last.after_tokens,
      exposure_class: last.exposure_class,
    });
  }
  surfaces.sort((a, b) => b.delta_tokens - a.delta_tokens);
  return { estimate_kind: "measured", surfaces };
}

// -- Ledger 4 - findings reverted (cold path, section 0.1.5 / section 1.4) --

// A surface counts as reverted when its pre-optimization `before_hash` (a body_hash)
// reappears among the CURRENT body hashes a fresh inspect scan produced - i.e. the
// surface's body went back to what it was before the action (and the action actually
// changed the body, before_hash != after_hash). Driven by the inspect re-scan, not a
// stored file path, so this store never holds a path (privacy section 2).
// `currentBodyHashes` is the set of body hashes in the latest inspect snapshot.
export function countFindingsReverted(
  actions: OptimizeAction[],
  currentBodyHashes: ReadonlySet<string>,
): number {
  const latest = new Map<string, OptimizeAction>();
  for (const action of actions) {
    const prev = latest.get(action.surface);
    if (!prev || action.ts.localeCompare(prev.ts) >= 0) latest.set(action.surface, action);
  }

  let reverted = 0;
  for (const action of latest.values()) {
    if (action.before_hash === action.after_hash) continue;
    if (currentBodyHashes.has(action.before_hash)) reverted += 1;
  }
  return reverted;
}
