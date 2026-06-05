// Slice 4 — the build-time telemetry endpoint (ADR 0004 §5). `__TG_TELEMETRY_
// ENDPOINT__` is replaced at build time by tsdown's `define` with
// JSON.stringify(process.env.TG_TELEMETRY_ENDPOINT ?? ""). A generic build bakes in
// "" ⇒ telemetry is inert (local file + warning only). An enterprise build bakes in
// the operator's HTTPS URL.
//
// Under tsx/vitest there is no `define`, so the identifier is undefined; we fall
// back to the env var so local runs and tests can point at a mock endpoint.
declare const __TG_TELEMETRY_ENDPOINT__: string | undefined;

export const TELEMETRY_ENDPOINT: string =
  typeof __TG_TELEMETRY_ENDPOINT__ !== "undefined" && __TG_TELEMETRY_ENDPOINT__
    ? __TG_TELEMETRY_ENDPOINT__
    : process.env.TG_TELEMETRY_ENDPOINT ?? "";
