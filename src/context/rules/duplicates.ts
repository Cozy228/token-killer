// Rule 9: instruction_duplicate (goal §"Finding rules" 9). Cross-file: exact
// section-hash matches and high normalized-similarity sections across surfaces.
// Never delete automatically — fix class advisory / suggested_diff only.

import { createHash } from "node:crypto";

import type { AnalyzedFile, CrossFileRule } from "../analyzer.js";
import { makeFindingId } from "../analyzer.js";
import type { ContextFinding } from "../types.js";

const MIN_NORMALIZED_CHARS = 80; // ignore trivially short sections
const SIMILARITY_THRESHOLD = 0.92;

type SectionRef = {
  af: AnalyzedFile;
  heading: string;
  start_line: number;
  end_line: number;
  normalized: string;
  hash: string;
  words: Set<string>;
};

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/```[\s\S]*?```/g, " ") // drop fenced code
    .replace(/[#>*_`-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const w of a) if (b.has(w)) inter += 1;
  return inter / (a.size + b.size - inter);
}

function collectSections(files: AnalyzedFile[]): SectionRef[] {
  const refs: SectionRef[] = [];
  for (const af of files) {
    for (const s of af.parsed.sections) {
      if (s.heading === "") continue;
      const normalized = normalize(s.text);
      if (normalized.length < MIN_NORMALIZED_CHARS) continue;
      refs.push({
        af,
        heading: s.heading,
        start_line: s.start_line,
        end_line: s.end_line,
        normalized,
        hash: createHash("sha256").update(normalized).digest("hex").slice(0, 16),
        words: new Set(normalized.split(" ")),
      });
    }
  }
  return refs;
}

function loc(ref: SectionRef): string {
  return `${ref.af.file.display}:${ref.start_line}`;
}

function makeFinding(primary: SectionRef, others: SectionRef[], kind: "exact" | "near"): ContextFinding {
  return {
    id: makeFindingId("instruction_duplicate", primary.af.file.display, primary.start_line, `${kind}:${others.map(loc).join("|")}`),
    source: "static_context",
    type: "instruction_duplicate",
    severity: "info",
    confidence: kind === "exact" ? 0.85 : 0.7,
    surface: primary.af.file.surface,
    file: primary.af.file.display,
    start_line: primary.start_line,
    end_line: primary.end_line,
    // Privacy: cite the section's LOCATION, never its verbatim heading — a heading
    // is arbitrary user body text (e.g. "## Deploy creds for prod-db") and inspect's
    // contract is labels + lengths only, never content (audit #9).
    evidence: `Section at ${loc(primary)} (heading ${primary.heading.length} chars) ${kind === "exact" ? "exactly matches" : "is near-duplicate of"} ${others.map(loc).join(", ")}.`,
    recommendation:
      "Keep the rule in the narrowest durable surface and replace duplicates with a short route/reference. Do not delete blindly.",
    fix_class: "advisory",
    scope: primary.af.file.scope,
    adapter: primary.af.file.adapter,
    body_hash: primary.af.metrics.body_hash,
  };
}

export const instructionDuplicateRule: CrossFileRule = {
  type: "instruction_duplicate",
  run(files: AnalyzedFile[]): ContextFinding[] {
    const refs = collectSections(files);
    const findings: ContextFinding[] = [];
    const consumed = new Set<SectionRef>();

    // Exact matches by normalized hash.
    const byHash = new Map<string, SectionRef[]>();
    for (const ref of refs) {
      const list = byHash.get(ref.hash) ?? [];
      list.push(ref);
      byHash.set(ref.hash, list);
    }
    for (const list of byHash.values()) {
      // Distinct locations only (a section is never a duplicate of itself).
      const distinct = list.filter((r, i) => list.findIndex((o) => loc(o) === loc(r)) === i);
      if (distinct.length >= 2) {
        const [primary, ...others] = distinct;
        findings.push(makeFinding(primary, others, "exact"));
        for (const r of distinct) consumed.add(r);
      }
    }

    // Near-duplicates with the same heading, not already exact-grouped.
    for (let i = 0; i < refs.length; i += 1) {
      const a = refs[i];
      if (consumed.has(a)) continue;
      const near: SectionRef[] = [];
      for (let j = i + 1; j < refs.length; j += 1) {
        const b = refs[j];
        if (consumed.has(b)) continue;
        if (loc(a) === loc(b)) continue;
        if (a.heading.toLowerCase() !== b.heading.toLowerCase()) continue;
        if (jaccard(a.words, b.words) >= SIMILARITY_THRESHOLD) near.push(b);
      }
      if (near.length > 0) {
        findings.push(makeFinding(a, near, "near"));
        consumed.add(a);
        for (const r of near) consumed.add(r);
      }
    }

    return findings;
  },
};
