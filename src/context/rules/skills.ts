// Slice 4 — Claude skill adapter (goal §"Finding rules" 7 & 8). Applies ONLY to
// Claude-compatible skills (surface = skill, adapter = claude). These frontmatter
// keys (disable-model-invocation, user-invocable, allowed-tools, paths) are Claude
// skill features — never emitted as Copilot recommendations (findings stay
// adapter-labeled "claude").

import type { AnalyzedFile, PerFileRule } from "../analyzer.js";
import type { DiscoveredFile } from "../discover.js";
import type { ContextFinding } from "../types.js";
import { buildFinding, hasFrontmatterKey } from "./helpers.js";

const SIDE_EFFECT_VERBS = /\b(commit|push|deploy|publish|release|send|delete|archive)\b/i;
const READONLY_HINT =
  /\b(read|review|summari[sz]e|explain|list|describe|analy[sz]e|reference|lookup)\b/i;
const KNOWLEDGE_HINT = /\b(background|knowledge|reference|guide|conventions?|glossary)\b/i;

const ENTRYPOINT_LINE_LIMIT = 500;
const ENTRYPOINT_FENCE_LIMIT = 60; // a single inline fence this long is "long example"

function isClaudeSkill(file: DiscoveredFile): boolean {
  return file.surface === "skill" && file.adapter === "claude";
}

function skillName(af: AnalyzedFile): string {
  const fmName = af.parsed.frontmatter.values.name;
  return typeof fmName === "string" ? fmName : af.file.display;
}

export const skillInvocationPolicyRule: PerFileRule = {
  type: "skill_invocation_policy",
  appliesTo: isClaudeSkill,
  run(af: AnalyzedFile): ContextFinding[] {
    const findings: ContextFinding[] = [];
    const fmEnd = af.parsed.frontmatter.end_line ?? 1;
    const name = skillName(af);
    const haystack = `${name}\n${af.parsed.body}`;

    const hasSideEffect = SIDE_EFFECT_VERBS.test(haystack);
    // M1: fire only when the key is ABSENT. An explicit `disable-model-invocation:
    // false` is a deliberate user choice — a safe_mechanical fix must FILL an absent
    // key, never FLIP an explicit value (the old `=== true` check treated explicit
    // false as unset and `--apply` overwrote it to true).
    const disablePresent = hasFrontmatterKey(af, "disable-model-invocation");

    // Side-effect workflow that the model can auto-invoke.
    if (hasSideEffect && !disablePresent) {
      findings.push(
        buildFinding(af, {
          type: "skill_invocation_policy",
          severity: "warn",
          confidence: 0.85,
          evidence:
            "Skill performs side-effect/high-cost actions but disable-model-invocation is not set.",
          recommendation:
            "Add `disable-model-invocation: true` so the model cannot auto-invoke this side-effect workflow.",
          // High-confidence, deterministic frontmatter add — safe_mechanical at
          // either scope (`tk optimize --apply` discloses, backs up, and is
          // reversible via --restore, so project-tracked skills are eligible too).
          fix_class: "safe_mechanical",
          start_line: fmEnd,
          idExtra: "disable-model-invocation",
        }),
      );
    }

    // Background-knowledge skill with no slash action and user-invocable unset.
    const isKnowledge = KNOWLEDGE_HINT.test(
      `${name} ${af.parsed.frontmatter.values.description ?? ""}`,
    );
    if (!hasSideEffect && isKnowledge && !hasFrontmatterKey(af, "user-invocable")) {
      findings.push(
        buildFinding(af, {
          type: "skill_invocation_policy",
          severity: "info",
          confidence: 0.55,
          evidence:
            "Background-knowledge skill leaves user-invocable unset and has no meaningful slash-command action.",
          recommendation:
            "Add `user-invocable: false` so background knowledge is not offered as a user command.",
          fix_class: "suggested_diff",
          start_line: fmEnd,
          idExtra: "user-invocable",
        }),
      );
    }

    // Read-only skill without least-privilege allowed-tools.
    const readOnly = READONLY_HINT.test(haystack) && !hasSideEffect;
    if (readOnly && !hasFrontmatterKey(af, "allowed-tools")) {
      findings.push(
        buildFinding(af, {
          type: "skill_invocation_policy",
          severity: "info",
          confidence: 0.5,
          evidence: "Read-only skill does not declare allowed-tools (least-privilege).",
          recommendation:
            "Add an `allowed-tools` list scoping the skill to the tools it actually needs.",
          fix_class: "suggested_diff",
          start_line: fmEnd,
          idExtra: "allowed-tools",
        }),
      );
    }

    return findings;
  },
};

function maxFenceRun(body: string): number {
  const lines = body.split("\n");
  let inFence = false;
  let run = 0;
  let max = 0;
  for (const line of lines) {
    if (/^\s*(```|~~~)/.test(line)) {
      if (inFence) {
        max = Math.max(max, run);
        run = 0;
      }
      inFence = !inFence;
      continue;
    }
    if (inFence) run += 1;
  }
  return max;
}

export const skillEntrypointBloatRule: PerFileRule = {
  type: "skill_entrypoint_bloat",
  appliesTo: isClaudeSkill,
  run(af: AnalyzedFile): ContextFinding[] {
    const reasons: string[] = [];
    if (af.metrics.line_count > ENTRYPOINT_LINE_LIMIT) {
      reasons.push(`${af.metrics.line_count} lines (> ${ENTRYPOINT_LINE_LIMIT})`);
    }
    const fenceRun = maxFenceRun(af.parsed.body);
    if (fenceRun > ENTRYPOINT_FENCE_LIMIT) {
      reasons.push(`a ${fenceRun}-line inline code/example block`);
    }
    if (reasons.length === 0) return [];

    return [
      buildFinding(af, {
        type: "skill_entrypoint_bloat",
        severity: "info",
        confidence: 0.65,
        evidence: `SKILL.md entrypoint is heavy: ${reasons.join(", ")}.`,
        recommendation:
          "Move details to references/, examples/, templates/, or scripts/ and keep SKILL.md as an overview + route map (progressive disclosure).",
        fix_class: "advisory",
        start_line: 1,
        idExtra: "entrypoint",
      }),
    ];
  },
};
