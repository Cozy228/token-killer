// Per-finding estimated token saving (issue: "give every fix an estimated token
// saving"). Every finding gets a number so the report can prioritise by impact, but
// the estimate is HONESTLY GRADED:
//   - grounded:true  — derived from a real figure (the finding's measured token/char
//     count, or a runtime output volume). Shown as "est.".
//   - grounded:false — a coarse per-type default used when the finding states no
//     measurable figure. Shown as "rough" so it's never mistaken for a measurement.
// ctx's rule is measured-not-fabricated; the coarse tier keeps that honest by labelling
// itself rather than masquerading as a real number.

// Conservative lossless-compression ratio for raw command output routed through ctx.
const COMMAND_COMPRESS_RATIO = 0.5;
// Rough tokens-per-character (English prose / code average).
const CHARS_PER_TOKEN = 4;

// Static finding types whose evidence states a standing token cost the fix reclaims.
const STANDING_COST_TYPES = new Set([
  "mcp_bloat",
  "skill_count_bloat",
  "always_on_bloat",
  "skill_description_bloat",
  "skill_entrypoint_bloat",
  "chat_mode_bloat",
  "conditional_rule_in_always_on",
  "agent_overbreadth",
  "path_instruction_overbreadth",
  "task_prompt_in_instruction",
  "instruction_duplicate",
]);

// Coarse per-instance token defaults — the standing/per-session cost a fix of this
// type typically reclaims, used only when no real figure is available. Deliberately
// conservative round numbers; they drive ordering, not billing.
const COARSE_PER_INSTANCE: Record<string, number> = {
  skill_invocation_policy: 60, // a skill's name+description sits in routing context
  output_verbosity_unset: 150, // verbose output overhead per session
  vscode_compress_disabled: 500, // uncompressed terminal output reaching the model
  instruction_conflict: 40,
  prompt_metadata_gap: 30,
  malformed_frontmatter: 20,
  cacheability_churn: 100,
  copilot_review_truncation: 50,
  agent_overbreadth: 120,
  path_instruction_overbreadth: 80,
  chat_mode_bloat: 200,
};
const COARSE_DEFAULT = 50;

export type SavingsInput = {
  type?: string;
  evidence?: string;
  metrics?: { total_output_tokens?: number };
};

export type SavingsEstimate = { tokens: number; grounded: boolean };

// Pull the first token figure out of an evidence string: "(~2248 tokens)", "≈1.5k tok".
export function parseEvidenceTokens(evidence: string | undefined): number | undefined {
  if (!evidence) return undefined;
  const m = evidence.match(/[≈~]?\s*([\d][\d,.]*)\s*([kKmM])?\s*tok/);
  if (!m) return undefined;
  let value = Number(m[1].replace(/,/g, ""));
  if (!Number.isFinite(value)) return undefined;
  const suffix = (m[2] ?? "").toLowerCase();
  if (suffix === "k") value *= 1_000;
  else if (suffix === "m") value *= 1_000_000;
  return Math.round(value);
}

// Pull a "N chars" figure out of evidence and convert to tokens (coarse-but-grounded:
// the char count is real, the chars→tokens ratio is the approximation).
function parseEvidenceChars(evidence: string | undefined): number | undefined {
  if (!evidence) return undefined;
  const m = evidence.match(/([\d][\d,]*)\s*chars/);
  if (!m) return undefined;
  const chars = Number(m[1].replace(/,/g, ""));
  return Number.isFinite(chars) ? Math.round(chars / CHARS_PER_TOKEN) : undefined;
}

// A REAL figure for the saving, or undefined when none is stated.
function groundedSavingsTokens(f: SavingsInput): number | undefined {
  if (f.type === "uncompressed_commands") {
    const out = f.metrics?.total_output_tokens ?? 0;
    return out > 0 ? Math.round(out * COMMAND_COMPRESS_RATIO) : undefined;
  }
  if (f.type && STANDING_COST_TYPES.has(f.type)) {
    return parseEvidenceTokens(f.evidence) ?? parseEvidenceChars(f.evidence);
  }
  return parseEvidenceTokens(f.evidence) ?? parseEvidenceChars(f.evidence);
}

// Estimated saving for a finding — always a number, graded grounded vs coarse.
export function estimateSavings(f: SavingsInput): SavingsEstimate {
  const grounded = groundedSavingsTokens(f);
  if (grounded !== undefined && grounded > 0) return { tokens: grounded, grounded: true };
  const coarse = (f.type ? COARSE_PER_INSTANCE[f.type] : undefined) ?? COARSE_DEFAULT;
  return { tokens: coarse, grounded: false };
}

// Back-compat helper: just the grounded number (undefined when not grounded).
export function estimateSavingsTokens(f: SavingsInput): number | undefined {
  return groundedSavingsTokens(f);
}
