// Slice 4 — the build-time telemetry endpoint (ADR 0004 §5). `__CTX_TELEMETRY_
// ENDPOINT__` is replaced at build time by tsdown's `define` with
// JSON.stringify(process.env.CTX_TELEMETRY_ENDPOINT ?? ""). A generic build bakes in
// "" ⇒ telemetry is inert (local file + warning only). An enterprise build bakes in
// the operator's HTTPS URL.
//
// Under tsx/vitest there is no `define`, so the identifier is undefined; ONLY then
// do we honor the env override (so local runs and tests can point at a mock
// endpoint). A real build always replaces the identifier, so its baked value is used
// VERBATIM — including "" — and the env fallback is unreachable. This is what keeps
// an empty production build inert: it must never pick up a runtime env var.
declare const __CTX_TELEMETRY_ENDPOINT__: string | undefined;

export const TELEMETRY_ENDPOINT: string =
  typeof __CTX_TELEMETRY_ENDPOINT__ !== "undefined"
    ? (__CTX_TELEMETRY_ENDPOINT__ ?? "")
    : (process.env.CTX_TELEMETRY_ENDPOINT ?? "");
