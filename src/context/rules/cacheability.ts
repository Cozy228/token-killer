// Rule 12: cacheability_churn (goal §"Finding rules" 12). Volatile tokens in
// stable instruction/prompt surfaces churn the prompt prefix. Report cacheability
// RISK only — never claim provider token savings.

import type { AnalyzedFile, PerFileRule } from "../analyzer.js";
import type { ContextFinding } from "../types.js";
import { buildFinding } from "./helpers.js";

const CHURN_SURFACES = new Set([
  "copilot_instructions",
  "path_instructions",
  "agent_instructions",
  "prompt_file",
  "custom_agent",
  "stable_prefix",
]);

// Volatile markers: ISO timestamps, dates, run/session IDs, temp/abs session paths.
const PATTERNS: Array<{ re: RegExp; label: string }> = [
  { re: /\b\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/g, label: "timestamps" },
  { re: /\b\d{4}-\d{2}-\d{2}\b/g, label: "dates" },
  { re: /\b(run|session|trace|build)[-_ ]?id[:=]?\s*[A-Za-z0-9-]{6,}/gi, label: "run/session IDs" },
  { re: /\/(tmp|var\/folders|private\/var)\/[^\s)]+/g, label: "temp paths" },
  { re: /\/(Users|home)\/[^\s/]+\/[^\s)]*\.(jsonl|log|tmp)/g, label: "local session paths" },
];

export const cacheabilityChurnRule: PerFileRule = {
  type: "cacheability_churn",
  appliesTo: (file) => CHURN_SURFACES.has(file.surface),
  run(af: AnalyzedFile): ContextFinding[] {
    const hits: string[] = [];
    let count = 0;
    for (const { re, label } of PATTERNS) {
      const m = af.parsed.body.match(re);
      if (m && m.length > 0) {
        count += m.length;
        hits.push(`${label} (${m.length})`);
      }
    }
    if (count === 0) return [];

    // Contexa managed files can be safely rewritten; project files are advisory.
    const managed = af.file.scope === "user";
    return [
      buildFinding(af, {
        type: "cacheability_churn",
        severity: "info",
        confidence: 0.6,
        evidence: `Volatile content in a stable surface: ${hits.join(", ")} — raises cacheability risk.`,
        recommendation:
          "Move volatile content to advice/history and keep stable surfaces with canonical headings and ordering.",
        fix_class: managed ? "suggested_diff" : "advisory",
        start_line: 1,
        idExtra: "churn",
      }),
    ];
  },
};
