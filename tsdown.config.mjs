import { defineConfig } from "tsdown";
import { readFileSync } from "node:fs";

// `version` flows from package.json — the single source of truth. It is baked into the
// bundle via `define` below (see src/version.ts), so the CLI reads no files at runtime.
const { version } = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf8"),
);

// Plain .mjs (not .ts): tsdown loads this through native `import`, keeping the
// config independent of TypeScript config-loader behavior across supported Node
// versions.
export default defineConfig({
  entry: ["src/cli.ts"],
  format: ["esm"],
  platform: "node",
  target: "node22.18",
  outDir: "dist",
  clean: true,
  fixedExtension: false,
  // Bake telemetry build args at compile time (ADR 0004 §5).
  // CTX_TELEMETRY_ENDPOINT — HTTPS ingest URL ("" ⇒ network send inert).
  // CTX_TELEMETRY_DEFAULT — "true" ⇒ missing config.jsonc reads telemetry as on.
  //
  // Bake the `ctx support` destinations at compile time (ADR 0013) — `ctx support`
  // reaches whoever PACKAGED this build, so the packager fixes the address here and
  // it can't be retargeted by a runtime env. "" ⇒ that channel degrades to
  // save+clipboard (a generic build bakes nothing and sends nowhere).
  define: {
    __CTX_VERSION__: JSON.stringify(version),
    __CTX_TELEMETRY_ENDPOINT__: JSON.stringify(process.env.CTX_TELEMETRY_ENDPOINT ?? ""),
    __CTX_TELEMETRY_DEFAULT__: JSON.stringify(process.env.CTX_TELEMETRY_DEFAULT === "true"),
    __CTX_SUPPORT_EMAIL__: JSON.stringify(process.env.CTX_SUPPORT_EMAIL ?? ""),
    __CTX_SUPPORT_TEAMS__: JSON.stringify(process.env.CTX_SUPPORT_TEAMS ?? ""),
    __CTX_SUPPORT_GITHUB__: JSON.stringify(process.env.CTX_SUPPORT_GITHUB ?? ""),
  },
});
