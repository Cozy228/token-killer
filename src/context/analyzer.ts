// Static-context analyzer (goal "Module layout"). Registered into `tg inspect`:
// every run parses the discovered context files and emits ContextFinding[] with
// source = "static_context". Independent of command handlers — pure functions
// over discovered files. Cross-file rules (duplicate/conflict) receive the full
// parsed set; per-file rules receive one file at a time.

import { createHash } from "node:crypto";

import {
  discoverContextFiles,
  readContextFile,
  type DiscoveredFile,
} from "./discover.js";
import { computeBodyMetrics, type BodyMetrics } from "./metrics.js";
import { parseMarkdown, type ParsedMarkdown } from "./parseMarkdown.js";
import type {
  ContextFinding,
  ContextFindingType,
  ContextScope,
  ContextSurface,
} from "./types.js";

export type AnalyzedFile = {
  file: DiscoveredFile;
  content: string;
  parsed: ParsedMarkdown;
  metrics: BodyMetrics;
};

export type PerFileRule = {
  type: ContextFindingType;
  appliesTo(file: DiscoveredFile): boolean;
  run(af: AnalyzedFile): ContextFinding[];
};

export type CrossFileRule = {
  type: ContextFindingType;
  run(files: AnalyzedFile[]): ContextFinding[];
};

export type AnalyzeOptions = {
  scopes: ContextScope[];
  // A `--surface` selector (instructions/prompts/agents/skills) or a concrete
  // ContextSurface. Selectors are expanded via SURFACE_SELECTORS.
  surface?: ContextSurface | string;
  home?: string;
  cwd?: string;
};

export type AnalyzeResult = {
  findings: ContextFinding[];
  files_scanned: number;
  truncated: boolean;
};

// Deterministic, stable finding id (no timestamps/randomness — cacheable).
export function makeFindingId(
  type: ContextFindingType,
  file: string | undefined,
  startLine: number | undefined,
  extra = "",
): string {
  const key = `${type}|${file ?? ""}|${startLine ?? ""}|${extra}`;
  return `sc_${createHash("sha256").update(key).digest("hex").slice(0, 10)}`;
}

// Map a user-facing `--surface` selector to the concrete surfaces it covers.
const SURFACE_SELECTORS: Record<string, ContextSurface[]> = {
  instructions: ["copilot_instructions", "path_instructions", "agent_instructions"],
  prompts: ["prompt_file"],
  agents: ["custom_agent"],
  skills: ["skill"],
};

export function resolveSurfaceSelector(selector: string): ContextSurface[] | undefined {
  return SURFACE_SELECTORS[selector];
}

// Registries — populated by Slices 2–4 via registerPerFileRule / registerCrossFileRule.
const perFileRules: PerFileRule[] = [];
const crossFileRules: CrossFileRule[] = [];

export function registerPerFileRule(rule: PerFileRule): void {
  perFileRules.push(rule);
}

export function registerCrossFileRule(rule: CrossFileRule): void {
  crossFileRules.push(rule);
}

export function clearRules(): void {
  perFileRules.length = 0;
  crossFileRules.length = 0;
}

function withBodyHash(findings: ContextFinding[], af: AnalyzedFile): ContextFinding[] {
  for (const f of findings) {
    f.scope ??= af.file.scope;
    f.adapter ??= af.file.adapter;
    f.body_hash ??= af.metrics.body_hash;
  }
  return findings;
}

export function analyzeContext(opts: AnalyzeOptions): AnalyzeResult {
  const discovery = discoverContextFiles({
    scopes: opts.scopes,
    home: opts.home,
    cwd: opts.cwd,
  });

  let candidates = discovery.files;
  if (opts.surface) {
    const surfaces = SURFACE_SELECTORS[opts.surface] ?? [opts.surface as ContextSurface];
    const allowed = new Set(surfaces);
    candidates = candidates.filter((f) => allowed.has(f.surface));
  }

  const analyzed: AnalyzedFile[] = [];
  const findings: ContextFinding[] = [];

  for (const file of candidates) {
    const content = readContextFile(file.path);
    if (content === undefined) continue;
    const parsed = parseMarkdown(content);
    const metrics = computeBodyMetrics(parsed.body);
    const af: AnalyzedFile = { file, content, parsed, metrics };
    analyzed.push(af);

    // Built-in: malformed frontmatter is a finding, not a crash.
    if (parsed.frontmatter.present && parsed.frontmatter.malformed) {
      findings.push({
        id: makeFindingId("malformed_frontmatter", file.display, parsed.frontmatter.start_line),
        source: "static_context",
        type: "malformed_frontmatter",
        severity: "warn",
        confidence: 0.95,
        surface: file.surface,
        file: file.display,
        start_line: parsed.frontmatter.start_line,
        end_line: parsed.frontmatter.end_line,
        evidence: "YAML frontmatter block could not be parsed cleanly.",
        recommendation: "Fix or remove the malformed frontmatter so tools can read its metadata.",
        fix_class: "advisory",
        adapter: file.adapter,
        scope: file.scope,
        body_hash: metrics.body_hash,
      });
    }

    for (const rule of perFileRules) {
      if (!rule.appliesTo(file)) continue;
      try {
        findings.push(...withBodyHash(rule.run(af), af));
      } catch {
        // A misbehaving rule must never abort the scan.
      }
    }
  }

  for (const rule of crossFileRules) {
    try {
      findings.push(...rule.run(analyzed));
    } catch {
      // Ignore cross-file rule failure.
    }
  }

  if (discovery.truncated) {
    findings.push({
      id: makeFindingId("discovery_truncated", undefined, undefined),
      source: "static_context",
      type: "discovery_truncated",
      severity: "info",
      confidence: 1,
      surface: "stable_prefix",
      evidence: `Discovery hit the 200-file cap; some context files were not scanned.`,
      recommendation: "Narrow the scope with --surface or --project to scan a focused subset.",
      fix_class: "non_goal",
    });
  }

  return {
    findings,
    files_scanned: analyzed.length,
    truncated: discovery.truncated,
  };
}
