#!/usr/bin/env -S npx tsx
/**
 * Delete the tk test VM.
 *
 * Ported from rtk/scripts/benchmark/cleanup.ts and adapted to tk conventions:
 * bun -> tsx, "rtk-test" VM -> "tk-test".
 *
 * Usage: pnpm exec tsx scripts/benchmark/cleanup.ts
 */

import { vmDelete } from "./lib/vm";

console.log("Deleting tk-test VM...");
await vmDelete();
console.log("Done.");
