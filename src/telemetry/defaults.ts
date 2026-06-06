// Build-time default for network telemetry consent (ADR 0004 §1). Generic builds
// bake `false`; internal/enterprise builds set `TK_TELEMETRY_DEFAULT=true` in the
// build env so a missing config.jsonc reads as opted-in. Users can still disable
// with `tk telemetry disable` or by editing config.jsonc.
//
// Under tsx/vitest there is no `define`, so ONLY then we honor the env override
// (tests and local runs). A real build replaces the identifier verbatim.
declare const __TK_TELEMETRY_DEFAULT__: boolean | undefined;

export const TELEMETRY_DEFAULT_ENABLED: boolean =
  typeof __TK_TELEMETRY_DEFAULT__ !== "undefined"
    ? __TK_TELEMETRY_DEFAULT__
    : process.env.TK_TELEMETRY_DEFAULT === "true";
