// Unified finding model (DESIGN §9.0). Runtime and static-context analyzers
// converge into a single Finding[]. Runtime findings carry aggregate metrics; static
// context findings carry surface/file/lines (from src/context). The persisted
// scope-bucket report is `{ ..., findings: Finding[] }`; `tg optimize context`
// reads the bucket and filters to source = "static_context".

import { createHash } from "node:crypto";

import type { ContextFinding } from "../context/types.js";
import type { Opportunity, ScanResult } from "./scan.js";

export type FindingSource = "runtime" | "static_context";

export type RuntimeFinding = {
  id: string;
  source: "runtime";
  type: string;
  severity: "info" | "warn" | "error";
  confidence: number;
  evidence: string;
  recommendation: string;
  fix_class: "safe_mechanical" | "suggested_diff" | "advisory" | "delivery" | "non_goal";
  category?: string;
  scope?: "user" | "project";
  metrics: {
    count: number;
    share: number;
    total_output_chars: number;
    total_output_tokens: number;
    avg_output_chars: number;
    max_output_chars: number;
    total_input_chars: number;
    max_input_chars: number;
    success_count: number;
    failure_count: number;
  };
};

export type Finding = RuntimeFinding | ContextFinding;

function runtimeFindingId(key: string): string {
  return `rt_${createHash("sha256").update(key).digest("hex").slice(0, 10)}`;
}

// Map a ranked runtime opportunity to a unified runtime Finding. Recommendation
// is delivery-first: high-output shell opportunities point at the shim/hook.
function opportunityToFinding(o: Opportunity): RuntimeFinding {
  let severity: RuntimeFinding["severity"] = "info";
  if (o.large_output_count > 0 || o.governed_deny > 0) severity = "warn";

  let recommendation: string;
  let fix_class: RuntimeFinding["fix_class"] = "advisory";
  if (o.compressible) {
    recommendation = `Route \`${o.key}\` through Token Guard (install shim/hook with \`tg init\`).`;
    fix_class = "delivery";
  } else if (o.governed_deny > 0) {
    recommendation = `Govern dependency-dir reads for \`${o.key}\` via a hook pretool deny.`;
    fix_class = "delivery";
  } else if (o.governed_suggest > 0) {
    recommendation = `Narrow repo-wide searches in \`${o.key}\` to a focused path.`;
  } else {
    recommendation = `High output volume from \`${o.key}\`; consider narrowing scope.`;
  }

  return {
    id: runtimeFindingId(`${o.kind}:${o.category}:${o.key}`),
    source: "runtime",
    type: o.large_output_count > 0 ? "long_output_hotspot" : "tool_noise",
    severity,
    confidence: Math.min(1, 0.5 + o.share),
    evidence: `${o.count} events, ${o.total_output_chars} out chars (≈${o.total_output_tokens} tok), ${o.failure_count} failures.`,
    recommendation,
    fix_class,
    category: o.category,
    metrics: {
      count: o.count,
      share: o.share,
      total_output_chars: o.total_output_chars,
      total_output_tokens: o.total_output_tokens,
      avg_output_chars: o.avg_output_chars,
      max_output_chars: o.max_output_chars,
      total_input_chars: o.total_input_chars,
      max_input_chars: o.max_input_chars,
      success_count: o.success_count,
      failure_count: o.failure_count,
    },
  };
}

export function runtimeFindings(scan: ScanResult | undefined): RuntimeFinding[] {
  if (!scan) return [];
  return scan.opportunities.map(opportunityToFinding);
}
