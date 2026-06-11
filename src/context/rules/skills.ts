// Slice 4 — Claude skill adapter (goal §"Finding rules" 7 & 8). Applies ONLY to
// Claude-compatible skills (surface = skill, adapter = claude). These frontmatter
// keys (disable-model-invocation, user-invocable, allowed-tools, paths) are Claude
// skill features — never emitted as Copilot recommendations (findings stay
// adapter-labeled "claude").

import {
  makeFindingId,
  type AnalyzedFile,
  type CrossFileRule,
  type PerFileRule,
} from "../analyzer.js";
import { estimateTokens } from "../../core/tokens.js";
import type { DiscoveredFile } from "../discover.js";
import type { ContextFinding } from "../types.js";
import { buildFinding, frontmatterString, hasFrontmatterKey } from "./helpers.js";

const SIDE_EFFECT_VERBS = /\b(commit|push|deploy|publish|release|send|delete|archive)\b/i;
const READONLY_HINT =
  /\b(read|review|summari[sz]e|explain|list|describe|analy[sz]e|reference|lookup)\b/i;
const KNOWLEDGE_HINT = /\b(background|knowledge|reference|guide|conventions?|glossary)\b/i;

const ENTRYPOINT_LINE_LIMIT = 500;
const ENTRYPOINT_FENCE_LIMIT = 60; // a single inline fence this long is "long example"
// A skill's `description` is loaded into EVERY session at its scope so the model can
// decide whether to invoke it — so an over-long description is paid on every turn.
// Calibrated above the common 200–450 char range so only genuine outliers fire.
const DESCRIPTION_CHAR_LIMIT = 600;
// Each user-level skill contributes its name+description to the always-on invocation
// surface. Past this many, the cumulative metadata is a standing token tax worth a
// prune; the finding reports the estimated always-on cost so the number is concrete.
const USER_SKILL_COUNT_LIMIT = 20;

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
    const description = frontmatterString(af, "description") ?? "";
    // Classify by the skill's DECLARED PURPOSE (name + description) — the text the
    // model actually routes on — NOT the whole body. Scanning the body matched a
    // side-effect verb anywhere in prose (e.g. a read-only "learn" skill that says
    // "publish-ready", or "think" that mentions "release a plan") and wrongly flagged
    // read/knowledge skills as side-effect workflows (confirmed false positives).
    const intent = `${name}\n${description}`;

    const hasSideEffect = SIDE_EFFECT_VERBS.test(intent);
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
    const readOnly = READONLY_HINT.test(intent) && !hasSideEffect;
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

// DESIGN §4.2 "User skills → description 宽度". The description is always-on
// invocation-routing metadata; an over-long one is re-sent every session.
export const skillDescriptionBloatRule: PerFileRule = {
  type: "skill_description_bloat",
  appliesTo: isClaudeSkill,
  run(af: AnalyzedFile): ContextFinding[] {
    const description = frontmatterString(af, "description");
    if (!description || description.length <= DESCRIPTION_CHAR_LIMIT) return [];
    return [
      buildFinding(af, {
        type: "skill_description_bloat",
        severity: "info",
        confidence: 0.6,
        evidence: `description is ${description.length} chars (~${estimateTokens(description)} tokens), over the ${DESCRIPTION_CHAR_LIMIT}-char budget; it loads into every session for invocation routing.`,
        recommendation:
          "Tighten the description to a concise trigger (what it does + when to use it) — keep the detail in the body, not the always-on frontmatter.",
        fix_class: "advisory",
        start_line: af.parsed.frontmatter.end_line ?? 1,
        idExtra: "description",
      }),
    ];
  },
};

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

// DESIGN §4.2 "User skills". Aggregate (cross-file): how MANY user-level skills are
// installed. Every user skill's name+description is loaded into every session so the
// model can route to it, so a large collection is a standing always-on token tax —
// the dimension a single per-file rule can't see. Project-scoped skills are excluded
// (they only load inside their repo, a deliberate, scoped cost).
export const skillCountRule: CrossFileRule = {
  type: "skill_count_bloat",
  run(files: AnalyzedFile[]): ContextFinding[] {
    const userSkills = files.filter((af) => isClaudeSkill(af.file) && af.file.scope === "user");
    if (userSkills.length <= USER_SKILL_COUNT_LIMIT) return [];

    // Estimate the always-on metadata cost = sum of each skill's name + description.
    let metadataChars = 0;
    for (const af of userSkills) {
      metadataChars +=
        (frontmatterString(af, "name") ?? af.file.display).length +
        (frontmatterString(af, "description") ?? "").length;
    }
    const anchor = userSkills[0]!;
    return [
      {
        id: makeFindingId("skill_count_bloat", undefined, undefined, "user"),
        source: "static_context",
        type: "skill_count_bloat",
        severity: "warn",
        confidence: 0.7,
        surface: "skill",
        evidence: `${userSkills.length} user-level skills installed (> ${USER_SKILL_COUNT_LIMIT}); their name+description metadata (~${estimateTokens("x".repeat(metadataChars))} tokens) loads into every session for invocation routing.`,
        recommendation:
          "Prune or disable rarely-used skills, and move project-specific ones into their repo (project scope) so they only load where relevant.",
        fix_class: "advisory",
        scope: "user",
        adapter: anchor.file.adapter,
      },
    ];
  },
};
