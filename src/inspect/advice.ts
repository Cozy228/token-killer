// Slice 5 — advice generation (DESIGN §10, inspect-v1-design.md "Recommendation
// Model"). Pattern detection over the scan model. Privacy-preserving: findings
// carry sanitized labels and counts only — never raw evidence.
//
// Advice LEADS with a delivery recommendation (the shim-primary model makes "how
// is `tg` even reaching this host?" the first question), then per-command and
// governance findings.

import type { Opportunity, ScanResult } from "./scan.js";

export type AdviceType =
  | "delivery"
  | "shell-noise"
  | "tool-noise"
  | "workflow-friction"
  | "skill-gap"
  | "context-gap"
  | "storage-discovery";

export type AdviceFinding = {
  type: AdviceType;
  title: string;
  detail: string;
  occurrences: number;
  confidence: number;
  recommendation: string;
};

export type AdviceOptions = {
  minConfidence: number;
  minOccurrences: number;
};

export const DEFAULT_ADVICE_OPTIONS: AdviceOptions = {
  minConfidence: 0.6,
  minOccurrences: 3,
};

function clampConfidence(n: number): number {
  return Math.max(0, Math.min(0.99, Number(n.toFixed(2))));
}

// Shell opportunities the proxy could compress but were run raw (key !== "tg").
function compressibleRaw(scan: ScanResult): Opportunity[] {
  return scan.opportunities.filter((o) => o.kind === "shell" && o.compressible && o.key !== "tg");
}

function deliveryFinding(scan: ScanResult, rawTotal: number): AdviceFinding {
  if (scan.inputType === "copilot-cli") {
    return {
      type: "delivery",
      title: "Wire the Copilot CLI hook so commands flow through tg",
      detail: `${rawTotal} compressible terminal commands ran raw (no tg prefix).`,
      occurrences: rawTotal,
      confidence: 0.9,
      recommendation: "Run `tg init --host copilot-cli` to install the rewrite hook, then apply the per-command rewrites below.",
    };
  }
  // vscode (default): the Copilot-CLI hook does not fire here — the shim is the
  // only deterministic delivery path.
  return {
    type: "delivery",
    title: "Install the Token Guard shim so VS Code commands flow through tg",
    detail: `${rawTotal} compressible terminal commands ran raw (no tg prefix). VS Code cannot use the Copilot-CLI hook; the shim is the deterministic path.`,
    occurrences: rawTotal,
    confidence: 0.9,
    recommendation: "Run `tg init` (installs the PATH shim) and restart VS Code.",
  };
}

export function buildAdvice(scan: ScanResult, opts: AdviceOptions = DEFAULT_ADVICE_OPTIONS): AdviceFinding[] {
  const findings: AdviceFinding[] = [];
  const raw = compressibleRaw(scan);
  const rawTotal = raw.reduce((sum, o) => sum + o.count, 0);

  // 1) Delivery recommendation (lead).
  if (rawTotal >= opts.minOccurrences) {
    findings.push(deliveryFinding(scan, rawTotal));
  }

  // 2) Per-command rewrite advice (shell-noise).
  for (const o of raw) {
    if (o.count < opts.minOccurrences) continue;
    findings.push({
      type: "shell-noise",
      title: `Prefer \`tg ${o.key}\` over raw \`${o.key}\``,
      detail: `\`${o.key}\` ran ${o.count}× producing ~${o.total_output_tokens} tokens of output.`,
      occurrences: o.count,
      confidence: clampConfidence(0.6 + o.count * 0.04),
      recommendation: `Use \`tg ${o.key}\` — the proxy compresses its output losslessly.`,
    });
  }

  // 3) Direct-tool governance advice (tool-noise).
  for (const o of scan.opportunities) {
    if (o.governed_deny >= opts.minOccurrences) {
      findings.push({
        type: "tool-noise",
        title: `Avoid dependency/lockfile reads via \`${o.key}\``,
        detail: `${o.governed_deny} reads targeted dependency dirs, build output, or lockfiles.`,
        occurrences: o.governed_deny,
        confidence: 0.85,
        recommendation: "Read source instead of generated files (direct-tool result compression is not yet delivered; this is governance advice).",
      });
    }
    if (o.governed_suggest >= opts.minOccurrences) {
      findings.push({
        type: "tool-noise",
        title: `Narrow repo-wide searches via \`${o.key}\``,
        detail: `${o.governed_suggest} searches had no narrowing scope.`,
        occurrences: o.governed_suggest,
        confidence: 0.75,
        recommendation: "Scope searches to `src/` or `tests/` and exclude generated dirs.",
      });
    }
  }

  // 4) Long-output hotspots (workflow-friction).
  for (const o of scan.opportunities) {
    if (o.large_output_count >= opts.minOccurrences) {
      findings.push({
        type: "workflow-friction",
        title: `Long-output hotspot: \`${o.key}\``,
        detail: `${o.large_output_count} invocations each produced a large output (max ${o.max_output_chars} chars).`,
        occurrences: o.large_output_count,
        confidence: 0.7,
        recommendation: o.kind === "shell"
          ? `Run via \`tg ${o.key}\` to cut output, or add a filter/limit.`
          : "Narrow the request (range/scope) to reduce output volume.",
      });
    }
  }

  return findings
    .filter((f) => f.confidence >= opts.minConfidence && f.occurrences >= opts.minOccurrences)
    // Impact = confidence × occurrences. Delivery always leads on ties.
    .sort((a, b) => {
      if (a.type === "delivery") return -1;
      if (b.type === "delivery") return 1;
      return b.confidence * b.occurrences - a.confidence * a.occurrences;
    });
}

const MARKDOWN_TOP = 5;

// Human-readable advice report (DESIGN §10.3). Top 5 in Markdown; full set in JSON.
export function renderAdviceMarkdown(findings: AdviceFinding[]): string {
  const lines: string[] = [];
  lines.push("## Advice");
  lines.push("");
  lines.push(`Corrections found: ${findings.length}`);
  lines.push("");
  if (findings.length === 0) {
    lines.push("_No high-confidence corrections detected._");
    lines.push("");
    return lines.join("\n");
  }
  for (const f of findings.slice(0, MARKDOWN_TOP)) {
    lines.push(`### ${f.title}`);
    lines.push(`- Type: ${f.type}`);
    lines.push(`- Occurrences: ${f.occurrences}`);
    lines.push(`- Confidence: ${f.confidence}`);
    lines.push(`- ${f.detail}`);
    lines.push(`- → ${f.recommendation}`);
    lines.push("");
  }
  if (findings.length > MARKDOWN_TOP) {
    lines.push(`_+${findings.length - MARKDOWN_TOP} more in \`--json\` output._`);
    lines.push("");
  }
  return lines.join("\n");
}

// The persisted advice file (DESIGN §10.4). Generated marker in the header.
export function renderAdviceFile(findings: AdviceFinding[]): string {
  const lines: string[] = ["# CLI Corrections (generated by tg inspect)", ""];
  if (findings.length === 0) {
    lines.push("_No high-confidence corrections detected._", "");
    return lines.join("\n");
  }
  for (const f of findings) {
    lines.push(`## ${f.title}`);
    lines.push(`- **Type**: ${f.type}`);
    lines.push(`- **Detected**: ${f.occurrences} occurrences`);
    lines.push(`- **Confidence**: ${f.confidence}`);
    lines.push(`- **Correction**: ${f.recommendation}`);
    lines.push("");
  }
  return lines.join("\n");
}
