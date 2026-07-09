#!/usr/bin/env node
import { chmod, rm } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { build } from "esbuild";

const { version } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

await rm(new URL("../dist", import.meta.url), { force: true, recursive: true });

await build({
  entryPoints: ["src/cli.ts"],
  bundle: true,
  splitting: true,
  format: "esm",
  platform: "node",
  target: "node20.0",
  outdir: "dist",
  entryNames: "[dir]/[name]",
  chunkNames: "chunks/[name]-[hash]",
  define: {
    __CTX_VERSION__: JSON.stringify(version),
    __CTX_TELEMETRY_ENDPOINT__: JSON.stringify(process.env.CTX_TELEMETRY_ENDPOINT ?? ""),
    __CTX_TELEMETRY_DEFAULT__: JSON.stringify(process.env.CTX_TELEMETRY_DEFAULT === "true"),
    __CTX_SUPPORT_EMAIL__: JSON.stringify(process.env.CTX_SUPPORT_EMAIL ?? ""),
    __CTX_SUPPORT_TEAMS__: JSON.stringify(process.env.CTX_SUPPORT_TEAMS ?? ""),
    __CTX_SUPPORT_GITHUB__: JSON.stringify(process.env.CTX_SUPPORT_GITHUB ?? ""),
  },
});

await chmod(new URL("../dist/cli.js", import.meta.url), 0o755);
