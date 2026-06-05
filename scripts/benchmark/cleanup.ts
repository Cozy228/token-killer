#!/usr/bin/env -S npx tsx
/**
 * Delete the tg test VM.
 *
 * Ported from rtk/scripts/benchmark/cleanup.ts and adapted to tg conventions:
 * bun -> tsx, "rtk-test" VM -> "tg-test".
 *
 * Usage: pnpm exec tsx scripts/benchmark/cleanup.ts
 */

import { vmDelete } from "./lib/vm";

console.log("Deleting tg-test VM...");
await vmDelete();
console.log("Done.");
