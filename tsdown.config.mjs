import { defineConfig } from "tsdown";

// Plain .mjs (not .ts): tsdown loads a .ts config via native TS type-stripping on
// Node 22+, but on Node 20 it falls back to `unrun` (not installed) and the build
// errors with "Failed to import module 'unrun'". A .mjs config is loaded by native
// `import` on every supported Node, so the build works on the whole `engines` range.
export default defineConfig({
  entry: ["src/cli.ts"],
  format: ["esm"],
  platform: "node",
  target: "node20",
  outDir: "dist",
  clean: true,
  fixedExtension: false,
  // Bake telemetry build args at compile time (ADR 0004 §5).
  // TK_TELEMETRY_ENDPOINT — HTTPS ingest URL ("" ⇒ network send inert).
  // TK_TELEMETRY_DEFAULT — "true" ⇒ missing config.jsonc reads telemetry as on.
  define: {
    __TK_TELEMETRY_ENDPOINT__: JSON.stringify(process.env.TK_TELEMETRY_ENDPOINT ?? ""),
    __TK_TELEMETRY_DEFAULT__: JSON.stringify(process.env.TK_TELEMETRY_DEFAULT === "true"),
  },
});
