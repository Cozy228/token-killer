#!/usr/bin/env node
/**
 * ctx CLI entry (scaffolding stub — slice 1a).
 *
 * Real subcommands (install/doctor/mcp/guide/import/remember/recall/memory/push/
 * sync) land in later M1 slices (CTX-IMPL §1/§9). 1a ships a stub so the `ctx`
 * bin resolves, the workspace dep on @ctx/core is exercised end-to-end, and the
 * package builds/tests green.
 */
import { CTX_CORE_SCAFFOLD } from "@ctx/core";

export function main(): void {
  process.stdout.write(
    `ctx: CLI scaffolding (${CTX_CORE_SCAFFOLD}). Subcommands land in later M1 slices.\n`,
  );
}

main();
