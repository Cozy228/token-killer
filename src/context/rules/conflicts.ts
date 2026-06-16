// Rule 10: instruction_conflict (goal §"Finding rules" 10). Cross-file: small
// curated rule families of contradictory directives. Conservative — only fires
// when BOTH sides are present. Fix class advisory (ask the team to choose).

import type { AnalyzedFile, CrossFileRule } from "../analyzer.js";
import { makeFindingId } from "../analyzer.js";
import type { ContextFinding, ContextSurface } from "../types.js";

type ConflictFamily = {
  key: string;
  label: string;
  a: RegExp;
  b: RegExp;
};

const FAMILIES: ConflictFamily[] = [
  {
    key: "language",
    label: "response language/tone",
    a: /\breply (in|using) chinese\b|\brespond in chinese\b|用中文(回复|回答)/i,
    b: /\breply (in|using) english\b|\brespond in english\b/i,
  },
  {
    key: "testing",
    label: "test scope",
    a: /\b(always )?run (the )?full test suite\b|\brun all tests\b/i,
    b: /\brun targeted tests\b|\bfocused tests\b|\btargeted tests first\b/i,
  },
  {
    key: "edits",
    label: "commit policy",
    a: /\b(auto-?commit|commit automatically|automatically commit)\b/i,
    b: /\bnever commit without approval\b|\bdo not commit\b|\bask before commit/i,
  },
  {
    key: "context",
    label: "file-read strategy",
    a: /\bread (the )?full file(s)?\b|\bread entire file(s)?\b/i,
    b: /\bread only (focused|relevant) (ranges|sections)\b|\bfocused ranges\b/i,
  },
  {
    key: "tools",
    label: "tool policy",
    a: /\buse all (the )?tools\b|\ball tools available\b/i,
    b: /\bread-only plan\b|\bplan only\b|\bno write access\b/i,
  },
];

// Rough surface priority — narrower/explicit surfaces win over broad always-on.
const SURFACE_PRIORITY: Record<ContextSurface, number> = {
  path_instructions: 5,
  prompt_file: 4,
  custom_agent: 4,
  chat_mode: 4,
  skill: 3,
  copilot_instructions: 2,
  agent_instructions: 2,
  stable_prefix: 1,
  // Not a markdown instruction surface — never participates in instruction conflicts.
  vscode_settings: 0,
};

type Match = { af: AnalyzedFile; line: number };

function findMatch(files: AnalyzedFile[], re: RegExp): Match | undefined {
  for (const af of files) {
    const lines = af.content.split("\n");
    for (let i = 0; i < lines.length; i += 1) {
      if (re.test(lines[i])) return { af, line: i + 1 };
    }
  }
  return undefined;
}

function loc(m: Match): string {
  return `${m.af.file.display}:${m.line}`;
}

export const instructionConflictRule: CrossFileRule = {
  type: "instruction_conflict",
  run(files: AnalyzedFile[]): ContextFinding[] {
    const findings: ContextFinding[] = [];
    for (const family of FAMILIES) {
      const a = findMatch(files, family.a);
      const b = findMatch(files, family.b);
      if (!a || !b) continue;
      if (loc(a) === loc(b)) continue;

      const higher =
        SURFACE_PRIORITY[a.af.file.surface] >= SURFACE_PRIORITY[b.af.file.surface] ? a : b;

      findings.push({
        id: makeFindingId("instruction_conflict", a.af.file.display, a.line, family.key),
        source: "static_context",
        type: "instruction_conflict",
        severity: "warn",
        confidence: 0.7,
        surface: a.af.file.surface,
        file: a.af.file.display,
        start_line: a.line,
        evidence: `Contradictory ${family.label}: ${loc(a)} vs ${loc(b)}.`,
        recommendation: `Choose one canonical rule. Higher-priority surface here is ${higher.af.file.surface} (${loc(higher)}).`,
        fix_class: "advisory",
        scope: a.af.file.scope,
        adapter: a.af.file.adapter,
        body_hash: a.af.metrics.body_hash,
      });
    }
    return findings;
  },
};
