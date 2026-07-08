#!/usr/bin/env -S npx tsx
/**
 * Fast rebuild: reuse existing VM, just transfer source and recompile.
 *
 * Ported from rtk/scripts/benchmark/rebuild.ts and adapted to ctx conventions:
 * bun -> tsx, vmBuildRtk -> vmBuildTk (builds dist/cli.js via pnpm).
 *
 * Usage: pnpm exec tsx scripts/benchmark/rebuild.ts
 */

import { vmEnsureReady, vmBuildTk } from "./lib/vm";

const PROJECT_ROOT = new URL("../../", import.meta.url).pathname.replace(/\/$/, "");

await vmEnsureReady();
const info = await vmBuildTk(PROJECT_ROOT);

console.log(`\nRebuild complete:`);
console.log(`  Version: ${info.version}`);
console.log(`  Bundle:  ${info.binarySize} bytes (dist/cli.js)`);
console.log(`  Time:    ${info.buildTime}s`);
