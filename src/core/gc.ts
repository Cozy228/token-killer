import { readdir, stat, unlink } from "node:fs/promises";
import path from "node:path";

import { rawOutputDir } from "./dataDir.js";

const RAW_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const RAW_MAX_BYTES = 50 * 1024 * 1024; // 50 MB

// Best-effort GC of the per-project raw snapshot dir, run on the COLD path (`ctx gain`)
// only — never the hot per-command path (H4). Post-ADR-0001 every declared
// digest/replacement force-persists a raw snapshot, so `raw/` grows without bound;
// nothing else ever deletes it. Policy: drop snapshots older than 7 days, then if the
// dir still exceeds the size cap, drop oldest-first until under it.
//
// Safe because the dedup store lazily RE-snapshots on the next hit (ADR 0009), and a
// digest/replacement pointer to a GC'd file just means the agent re-runs to see full
// output — the recovery contract degrades gracefully, never corrupts. Fail-open
// throughout: any error is swallowed so GC can never break `ctx gain`.
export async function gcRawStore(cwd: string, now = Date.now()): Promise<void> {
  try {
    const dir = rawOutputDir(cwd);
    let names: string[];
    try {
      names = await readdir(dir);
    } catch {
      return; // no raw dir yet — nothing to collect
    }

    const files: { full: string; mtime: number; size: number }[] = [];
    for (const name of names) {
      if (!name.endsWith(".log")) continue; // never touch .tmp or foreign files
      const full = path.join(dir, name);
      try {
        const s = await stat(full);
        files.push({ full, mtime: s.mtimeMs, size: s.size });
      } catch {
        // vanished between readdir and stat — ignore
      }
    }

    // 1) Age-based: delete anything past the max age.
    const survivors: { full: string; mtime: number; size: number }[] = [];
    for (const f of files) {
      if (now - f.mtime > RAW_MAX_AGE_MS) {
        await unlink(f.full).catch(() => {});
      } else {
        survivors.push(f);
      }
    }

    // 2) Size-based: if the survivors still exceed the cap, drop oldest-first.
    let total = survivors.reduce((sum, f) => sum + f.size, 0);
    if (total > RAW_MAX_BYTES) {
      survivors.sort((a, b) => a.mtime - b.mtime); // oldest first
      for (const f of survivors) {
        if (total <= RAW_MAX_BYTES) break;
        await unlink(f.full).catch(() => {});
        total -= f.size;
      }
    }
  } catch {
    // fail-open: GC is best-effort and must never break the cold path
  }
}
