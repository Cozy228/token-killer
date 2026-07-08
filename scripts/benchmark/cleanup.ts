#!/usr/bin/env -S npx tsx
/**
 * Delete the ctx test VM.
 *
 * Ported from rtk/scripts/benchmark/cleanup.ts and adapted to ctx conventions:
 * bun -> tsx, "rtk-test" VM -> "ctx-test".
 *
 * Usage: pnpm exec tsx scripts/benchmark/cleanup.ts
 */

import { vmDelete } from "./lib/vm";

console.log("Deleting ctx-test VM...");
await vmDelete();
console.log("Done.");
