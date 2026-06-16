// Ledger read-side join — `tk report` (metrics-ledger §4).
//
// THE load-bearing rule: four ledgers, displayed side by side, NEVER summed. This
// module reads the existing scattered stores and renders four independent sections
// with no grand total and no cross-ledger arithmetic. It owns no storage: ledger ①
// via aggregate.ts (ADR 0004), ② via optimize-actions.jsonl, ③ via
// governance.jsonl, ④ derived from history + the ② store.
//
// Cold path, fully fail-open: a missing/corrupt store yields an empty section,
// never a throw. It must never block or error a hot-path `tk <cmd>`.

import {
  countFindingsReverted,
  readOptimizeActions,
  summarizeOptimizer,
  type OptimizerLedger,
} from "../inspect/optimizeActions.js";
import { readInspectBucket, type ScopeBucket } from "../inspect/persist.js";
import { summarize, type GainSummary } from "./aggregate.js";
import {
  CROSS_REFERENCE_MODEL,
  DEFAULT_INPUT_PRICE_PER_MTOK,
  priceForModel,
  tokensToCredits,
  tokensToUsd,
} from "./pricing.js";
import { projectFingerprint } from "./dataDir.js";
import {
  listProjectGovernance,
  readGovernance,
  summarizeGovernance,
  type GovernanceLedger,
} from "./governance.js";
import { listProjectHistories, readHistory, type HistoryRecord } from "./history.js";

export type ReportScope = "user" | "project" | "runtime";

// ① and ④ have no runtime partition (§0.1.6). Under `--scope runtime` they render
// this marker instead of a fabricated figure.
export type ScopeNa = { scope_na: true; note: string };

export type GuardrailsLedger = {
  commands: number;
  // share in [0,1]; rounded to 4 dp. Derived from history.jsonl.
  fallback_rate: number;
  failure_rate: number;
  // cold-path: a surface whose current hash returned to its pre-opt before_hash.
  findings_reverted: number;
  // §0.1.4 — DEFERRED. No signal exists (rawStore only saves; tk cannot observe a
  // direct snapshot reopen). Never fabricated.
  raw_reopen_rate: "n/a";
};

export type Ledgers = {
  scope: ReportScope;
  since?: string;
  measured_command_savings: GainSummary | ScopeNa;
  optimizer_deltas: OptimizerLedger;
  governance_opportunities: GovernanceLedger;
  quality_guardrails: GuardrailsLedger | ScopeNa;
};

export type ReportOptions = {
  scope: ReportScope;
  since?: Date;
  cwd: string;
};

const RUNTIME_NA_NOTE = "scope n/a, all-project (no runtime partition)";

function afterSince(ts: string | undefined, since?: Date): boolean {
  if (!since) return true;
  if (!ts) return false;
  return ts >= since.toISOString();
}

function filterHistory(records: HistoryRecord[], since?: Date): HistoryRecord[] {
  return records.filter((r) => afterSince(r.timestamp, since));
}

function fallbackRate(records: HistoryRecord[]): number {
  if (records.length === 0) return 0;
  const n = records.filter((r) => r.handler === "fallback").length;
  return Number((n / records.length).toFixed(4));
}

function failureRate(records: HistoryRecord[]): number {
  if (records.length === 0) return 0;
  const n = records.filter((r) => r.quality_status === "failure").length;
  return Number((n / records.length).toFixed(4));
}

// The body hashes the latest inspect scan recorded for this bucket. ④ revert
// detection asks whether a surface's pre-optimization body_hash reappears here —
// no stored path, same hash space the ② store wrote (privacy §2). Missing/corrupt
// snapshot → empty set (no reverts detected, never a throw).
function currentBodyHashes(bucket: ScopeBucket): Set<string> {
  const hashes = new Set<string>();
  const report = readInspectBucket(bucket);
  if (!report) return hashes;
  for (const finding of report.findings) {
    const h = (finding as { body_hash?: string }).body_hash;
    if (typeof h === "string" && h.length > 0) hashes.add(h);
  }
  return hashes;
}

// Cold-path store reads are wrapped so a corrupt/locked store yields an empty
// section, never a throw (§8 fail-open). listProject* already swallow per-file
// errors; this guards the single-project readers too.
async function safe<T>(read: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await read();
  } catch {
    return fallback;
  }
}

export async function loadLedgers(opts: ReportOptions): Promise<Ledgers> {
  const { scope, since, cwd } = opts;

  // ② and ③ are the only ledgers that render under every scope. Under runtime they
  // use the all-project view (user bucket for ②, all governance.jsonl for ③).
  const optimizeBucket: ScopeBucket =
    scope === "project"
      ? { scope: "project", fingerprint: projectFingerprint(cwd) }
      : { scope: "user" };

  const actions = readOptimizeActions(optimizeBucket).filter((a) => afterSince(a.ts, since));
  const optimizer_deltas = summarizeOptimizer(actions);

  const govRecords = (
    scope === "project"
      ? await safe(() => readGovernance(cwd), [])
      : await safe(() => listProjectGovernance(), [])
  ).filter((r) => afterSince(r.ts, since));
  const governance_opportunities = summarizeGovernance(govRecords);

  if (scope === "runtime") {
    const na: ScopeNa = { scope_na: true, note: RUNTIME_NA_NOTE };
    return {
      scope,
      since: since?.toISOString(),
      measured_command_savings: na,
      optimizer_deltas,
      governance_opportunities,
      quality_guardrails: na,
    };
  }

  const history = filterHistory(
    scope === "project"
      ? await safe(() => readHistory(cwd), [])
      : await safe(() => listProjectHistories(), []),
    since,
  );

  const quality_guardrails: GuardrailsLedger = {
    commands: history.length,
    fallback_rate: fallbackRate(history),
    failure_rate: failureRate(history),
    findings_reverted: countFindingsReverted(actions, currentBodyHashes(optimizeBucket)),
    raw_reopen_rate: "n/a",
  };

  return {
    scope,
    since: since?.toISOString(),
    measured_command_savings: summarize(history),
    optimizer_deltas,
    governance_opportunities,
    quality_guardrails,
  };
}

function isScopeNa(value: unknown): value is ScopeNa {
  return typeof value === "object" && value !== null && (value as ScopeNa).scope_na === true;
}

export function renderJson(ledgers: Ledgers): string {
  // Four top-level keys — never a flattened total (§4).
  return `${JSON.stringify(
    {
      scope: ledgers.scope,
      since: ledgers.since ?? null,
      measured_command_savings: ledgers.measured_command_savings,
      optimizer_deltas: ledgers.optimizer_deltas,
      governance_opportunities: ledgers.governance_opportunities,
      quality_guardrails: ledgers.quality_guardrails,
    },
    null,
    2,
  )}\n`;
}

export function renderText(ledgers: Ledgers): string {
  const out: string[] = [];
  out.push(
    `Token Killer — savings report (scope: ${ledgers.scope}${ledgers.since ? `, since ${ledgers.since}` : ""})`,
  );
  out.push("Four separate views, shown side by side. They are never summed.");
  out.push("");

  // ① Measured command savings
  out.push("① Measured command savings            (estimate_kind: measured)");
  const m = ledgers.measured_command_savings;
  if (isScopeNa(m)) {
    out.push(`  ${m.note}`);
  } else {
    out.push(
      `  raw ${m.raw_tokens} · delivered ${m.output_tokens} · saved ${m.saved_tokens} · ${m.savings_pct}% over ${m.commands} command(s)`,
    );
  }
  out.push("");

  // ② Optimizer deltas
  out.push(
    "② Optimizer deltas                    (delta = measured, current state vs pre-opt snapshot)",
  );
  if (ledgers.optimizer_deltas.surfaces.length === 0) {
    out.push("  (no recorded optimize actions)");
  } else {
    for (const s of ledgers.optimizer_deltas.surfaces) {
      out.push(
        `  ${s.surface}: before ${s.before_tokens} · after ${s.after_tokens} · delta ${s.delta_tokens} · ${s.exposure_class}`,
      );
    }
  }
  out.push("");

  // ③ Governance opportunities
  const g = ledgers.governance_opportunities;
  out.push("③ Governance opportunities            (estimate_kind: opportunity | heuristic)");
  out.push(
    `  denied_large_reads ${g.denied_large_reads} · suggested_broad_searches ${g.suggested_broad_searches} · denied_large_prompts ${g.denied_large_prompts} · suggested_large_prompts ${g.suggested_large_prompts}`,
  );
  out.push(
    `  avoided_tokens_estimate ≈ ${g.avoided_tokens_estimate} (heuristic; executed rewrites excluded — counted in ①)`,
  );
  out.push("");

  // ④ Quality guardrails
  out.push("④ Quality guardrails");
  const q = ledgers.quality_guardrails;
  if (isScopeNa(q)) {
    out.push(`  ${q.note}`);
  } else {
    out.push(
      `  fallback_rate ${q.fallback_rate} · failure_rate ${q.failure_rate} · findings_reverted ${q.findings_reverted} · raw_reopen_rate n/a (deferred)`,
    );
  }
  out.push("");
  return out.join("\n");
}

// Headline value estimate for the HTML report — measured saved tokens valued at
// the default input price. AI Credits (1 credit = $0.01) is the headline value
// unit; USD retained alongside. Always an estimate (the report labels it as such),
// kept apart from the measured token counts it derives from.
function usdFields(ledgers: Ledgers): {
  estimated_savings_usd: number;
  estimated_savings_ai_credits: number;
  price_per_mtok: number;
  cross_reference: {
    model: string;
    estimated_savings_usd: number;
    estimated_savings_ai_credits: number;
    price_per_mtok: number;
  };
} {
  const m = ledgers.measured_command_savings;
  const saved = isScopeNa(m) ? 0 : m.saved_tokens;
  const crossRate = priceForModel(CROSS_REFERENCE_MODEL);
  return {
    estimated_savings_usd: tokensToUsd(saved),
    estimated_savings_ai_credits: tokensToCredits(saved),
    price_per_mtok: DEFAULT_INPUT_PRICE_PER_MTOK,
    // Well-known cross-reference (GPT-5.5) so the OpenAI/Copilot world gets a
    // recognizable number alongside the Sonnet 4.6 default.
    cross_reference: {
      model: CROSS_REFERENCE_MODEL,
      estimated_savings_usd: tokensToUsd(saved, crossRate),
      estimated_savings_ai_credits: tokensToCredits(saved, crossRate),
      price_per_mtok: crossRate,
    },
  };
}

// Build the four-view savings report (measured / optimizer / governance /
// quality) and open it in the browser. This is the default `tk gain` surface —
// `--text`/`--json`/`--csv` keep the terminal forms (see core/gain.ts). The four
// ledgers are shown side by side, never summed.
export async function emitGainHtml(opts: ReportOptions, now: Date = new Date()): Promise<void> {
  const ledgers = await loadLedgers(opts);
  const { emitHtmlReport } = await import("../report/open.js");
  emitHtmlReport(
    {
      kind: "gain",
      title: "Your token savings",
      subtitle: "How much model spend Token Killer saved you, and where it came from.",
      generatedAt: now.toISOString(),
      data: { ...ledgers, ...usdFields(ledgers) },
    },
    now.getTime(),
  );
}
