/**
 * M3 guide — envelope glyph grammar (LAW §3, brief §4).
 *
 * Promotes `renderEnvelopeTerse`'s 1-glyph-per-dimension grammar (serve/envelope.ts)
 * into a STRUCTURED DTO the web renders as an adapter. The terse CLI line and the
 * web glyph strip therefore never fork: both read the SAME glyph + label per axis
 * from here. Color budget (brief §4) is a UI concern — this layer only names the
 * semantic dimension; it spends no color itself.
 *
 * "Provenance-or-it-does-not-render": every envelope resolves to its evidence
 * anchor (`ClaimEnvelope.evidence`), surfaced here as `EvidencePacket`.
 */
import type { ClaimEnvelope } from "../serve/envelope.ts";
import { renderEnvelopeTerse } from "../serve/envelope.ts";
import type { Confidence, Derivation, Disclosure, ClaimStatus } from "../store/types.ts";

/** One rendered trust axis: glyph + human label + raw value (null = unknown). */
export interface GlyphAxis<T> {
  glyph: string;
  label: string;
  value: T;
  /** True when the value is an honest gap (null axis) rendered as `?`, not a fact. */
  gap: boolean;
}

export interface EnvelopeGlyphs {
  derivation: GlyphAxis<Derivation | null>;
  confidence: GlyphAxis<Confidence | null>;
  status: GlyphAxis<ClaimStatus>;
  freshness: GlyphAxis<string>;
  disclosure: GlyphAxis<Disclosure>;
}

// Grammar kept in lockstep with serve/envelope.ts DERIV_GLYPH / CONF_GLYPH.
const DERIV_GLYPH: Record<Derivation, string> = { OBSERVED: "O", DECLARED: "D", INFERRED: "I" };
const CONF_GLYPH: Record<Confidence, string> = { CONFIRMED: "C", LIKELY: "L", POSSIBLE: "P" };
const DERIV_LABEL: Record<Derivation, string> = {
  OBSERVED: "observed",
  DECLARED: "declared",
  INFERRED: "inferred",
};
const CONF_LABEL: Record<Confidence, string> = {
  CONFIRMED: "confirmed",
  LIKELY: "likely",
  POSSIBLE: "possible",
};
// Status hue budget (brief §4: hue spent ONLY on claim semantics). The UI maps
// these tokens to color; core only names them so light/dark themes stay in sync.
const STATUS_GLYPH: Record<ClaimStatus, string> = {
  resolved: "●",
  conflicting: "◆",
  stale: "○",
  unavailable: "△",
  restricted: "▢",
  unknown: "?",
};

/** Structured glyph strip for one envelope (adapter input for the web + terse CLI). */
export function envelopeGlyphs(env: ClaimEnvelope): EnvelopeGlyphs {
  return {
    derivation: {
      glyph: env.derivation ? DERIV_GLYPH[env.derivation] : "?",
      label: env.derivation ? DERIV_LABEL[env.derivation] : "unknown",
      value: env.derivation,
      gap: env.derivation === null,
    },
    confidence: {
      glyph: env.confidence ? CONF_GLYPH[env.confidence] : "?",
      label: env.confidence ? CONF_LABEL[env.confidence] : "unknown",
      value: env.confidence,
      gap: env.confidence === null,
    },
    status: {
      glyph: STATUS_GLYPH[env.status],
      label: env.status,
      value: env.status,
      gap: env.status === "unknown",
    },
    freshness: {
      glyph: env.freshness === "unknown-until-reverified" ? "⟳" : "≈",
      label: env.freshness,
      value: env.freshness,
      gap: false,
    },
    disclosure: {
      glyph: env.disclosure === "restricted" ? "▢" : env.disclosure === "shared" ? "◇" : "·",
      label: env.disclosure,
      value: env.disclosure,
      gap: false,
    },
  };
}

/**
 * The provenance-resolvable unit surfaced by the evidence drawer. Carries the raw
 * envelope, the terse CLI line (never forked), the structured glyphs, and the
 * disclosed pre-R-slice gaps (R6): axes the R-slice has not built yet render their
 * `authority` proxy tagged `pre-R-slice`, never a fabricated value.
 */
export interface EvidencePacket {
  envelope: ClaimEnvelope;
  terse: string;
  glyphs: EnvelopeGlyphs;
  /** Trust axes still null on the landed envelope — UI tags them `pre-R-slice` (R6). */
  preRSlice: string[];
}

export function evidencePacket(env: ClaimEnvelope): EvidencePacket {
  const preRSlice: string[] = [];
  if (env.derivation === null) preRSlice.push("derivation");
  if (env.confidence === null) preRSlice.push("confidence");
  return {
    envelope: env,
    terse: renderEnvelopeTerse(env),
    glyphs: envelopeGlyphs(env),
    preRSlice,
  };
}
