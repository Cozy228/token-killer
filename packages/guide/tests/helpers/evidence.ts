/**
 * Test-only EvidencePacket builder. The guide is TYPES-ONLY against @contexa/core
 * (importing its runtime would drag node:sqlite / web-tree-sitter into the browser
 * bundle), so component tests construct packets locally rather than calling core's
 * `evidencePacket`. The shape mirrors core's DTO exactly; the `terse` string is
 * built with the same grammar the chip renders verbatim.
 */
import type { ClaimEnvelope, EvidencePacket } from "@contexa/core";

const DERIV_GLYPH: Record<string, string> = { OBSERVED: "O", DECLARED: "D", INFERRED: "I" };
const CONF_GLYPH: Record<string, string> = { CONFIRMED: "C", LIKELY: "L", POSSIBLE: "P" };
const DERIV_LABEL: Record<string, string> = {
  OBSERVED: "observed",
  DECLARED: "declared",
  INFERRED: "inferred",
};
const CONF_LABEL: Record<string, string> = {
  CONFIRMED: "confirmed",
  LIKELY: "likely",
  POSSIBLE: "possible",
};

export function makeEnvelope(overrides: Partial<ClaimEnvelope> = {}): ClaimEnvelope {
  return {
    subject: "sym:x",
    evidence: { uri: "file:x.ts:1-9", revision: "deadbeefcafe" },
    observedAt: Date.UTC(2026, 6, 4),
    derivation: "OBSERVED",
    confidence: "CONFIRMED",
    status: "resolved",
    freshness: "content-hash",
    disclosure: "local",
    ...overrides,
  };
}

export function makeEvidence(env: ClaimEnvelope): EvidencePacket {
  const d = env.derivation ? DERIV_GLYPH[env.derivation]! : "?";
  const c = env.confidence ? CONF_GLYPH[env.confidence]! : "?";
  const rev = env.evidence.revision ? `@${env.evidence.revision.slice(0, 8)}` : "";
  const terse = `‹${d}·${c}·${env.status}·${env.freshness}·${env.disclosure}› ${env.evidence.uri}${rev}`;
  const preRSlice: string[] = [];
  if (env.derivation === null) preRSlice.push("derivation");
  if (env.confidence === null) preRSlice.push("confidence");
  return {
    envelope: env,
    terse,
    glyphs: {
      derivation: {
        glyph: d,
        label: env.derivation ? DERIV_LABEL[env.derivation]! : "unknown",
        value: env.derivation,
        gap: env.derivation === null,
      },
      confidence: {
        glyph: c,
        label: env.confidence ? CONF_LABEL[env.confidence]! : "unknown",
        value: env.confidence,
        gap: env.confidence === null,
      },
      status: { glyph: "●", label: env.status, value: env.status, gap: env.status === "unknown" },
      freshness: { glyph: "≈", label: env.freshness, value: env.freshness, gap: false },
      disclosure: { glyph: "·", label: env.disclosure, value: env.disclosure, gap: false },
    },
    preRSlice,
  };
}
