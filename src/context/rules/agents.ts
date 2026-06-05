// Rule 6: agent_overbreadth (goal §"Finding rules" 6). Applies to
// .github/agents/**/*.agent.md. One persona, one workflow family, narrow tools.
// Fix class advisory.

import type { AnalyzedFile, PerFileRule } from "../analyzer.js";
import type { ContextFinding } from "../types.js";
import { buildFinding, frontmatterList, frontmatterString } from "./helpers.js";

const GENERIC_NAMES = /\b(developer|helper|assistant|agent|bot)\b/i;
const WRITE_TOOLS = /\b(edit|write|create|apply_patch|terminal|run|shell|delete)\b/i;
const READONLY_PERSONA = /\b(review|audit|summari[sz]e|explain|analy[sz]e|read-only|reviewer)\b/i;
const EXPENSIVE_MODEL = /\b(opus|gpt-4|gpt-5|-max|ultra)\b/i;

export const agentOverbreadthRule: PerFileRule = {
  type: "agent_overbreadth",
  appliesTo: (file) => file.surface === "custom_agent",
  run(af: AnalyzedFile): ContextFinding[] {
    const findings: ContextFinding[] = [];
    const fmStart = af.parsed.frontmatter.start_line ?? 1;
    const name = frontmatterString(af, "name") ?? "";
    const description = frontmatterString(af, "description") ?? "";
    const tools = frontmatterList(af, "tools");
    const model = frontmatterString(af, "model") ?? "";
    const body = af.parsed.body;

    const reasons: string[] = [];

    if ((name && GENERIC_NAMES.test(name)) || (description && GENERIC_NAMES.test(description))) {
      reasons.push("generic persona name/description");
    }
    const readonly = READONLY_PERSONA.test(`${name} ${description} ${body}`);
    if (readonly && tools.some((t) => WRITE_TOOLS.test(t))) {
      reasons.push("write/terminal tools on a read-only persona");
    }
    if (model && EXPENSIVE_MODEL.test(model) && readonly) {
      reasons.push(`expensive model (${model}) for a routine workflow`);
    }
    if (!description) {
      reasons.push("no description / unclear trigger");
    }

    if (reasons.length === 0) return [];

    findings.push(
      buildFinding(af, {
        type: "agent_overbreadth",
        severity: "info",
        confidence: 0.55,
        evidence: `Custom agent looks overbroad: ${reasons.join("; ")}.`,
        recommendation:
          "Make the agent explicit: one persona, one workflow family, narrow tools. Move task templates to prompt files if it only wraps a single prompt.",
        fix_class: "advisory",
        start_line: fmStart,
        idExtra: "overbreadth",
      }),
    );

    return findings;
  },
};
