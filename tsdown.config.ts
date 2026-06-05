import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/cli.ts"],
  format: ["esm"],
  platform: "node",
  target: "node20",
  outDir: "dist",
  clean: true,
  fixedExtension: false,
  // Bake the telemetry endpoint at build time (ADR 0004 §5). A generic build sets
  // "" ⇒ telemetry is inert (local file + warning). An enterprise build sets
  // TK_TELEMETRY_ENDPOINT in the build env to the operator's HTTPS URL.
  define: {
    __TK_TELEMETRY_ENDPOINT__: JSON.stringify(process.env.TK_TELEMETRY_ENDPOINT ?? ""),
  },
});
