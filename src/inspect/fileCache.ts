// A read-through cache shared across the inspect analyzers so each transcript /
// session file is read from disk ONCE per `tk inspect` run. scan() and
// analyzeHabits() both walk the same SourceDiscovery file set; without sharing,
// every file was opened twice — and on Windows every open is re-scanned by AV, so
// the duplicate open is a real tax there (the OS page cache hides it on macOS).
//
// The cache is BYTE-BOUNDED. The naive "hold every file's text" design has a peak
// memory of the whole corpus, which on the target (low-RAM Windows, possibly
// hundreds of sessions with large transcripts) could cause GC thrash / paging and
// run SLOWER than the old read-one-release-one loop. So once `remainingBytes` is
// exhausted, further files are read through WITHOUT being retained: memory stays
// capped and those files simply fall back to the old behavior (the second analyzer
// re-reads them). Small/medium corpora (the common case) are fully cached.

import { readFileSync } from "node:fs";

// Default ceiling on retained text. ~256 MiB covers even large corpora (hundreds
// of sessions) fully, while still bounding the absolute worst case so a runaway
// transcript set can't exhaust memory on a constrained box.
const DEFAULT_MAX_BYTES = 256 * 1024 * 1024;

export type FileCache = {
  // path → text (success) | null (read failure, so the miss is not retried).
  text: Map<string, string | null>;
  // Remaining retention budget; decremented as text is stored, never below 0.
  remainingBytes: number;
};

export function makeFileCache(maxBytes: number = DEFAULT_MAX_BYTES): FileCache {
  return { text: new Map(), remainingBytes: Math.max(0, maxBytes) };
}

// Read `file` as UTF-8, serving a prior result (success OR failure) from `cache`
// when provided and retaining it only while the byte budget allows. Returns
// undefined on read failure — matching the inline try/catch contract the call
// sites had before the cache existed.
export function readSourceText(file: string, cache?: FileCache): string | undefined {
  if (cache?.text.has(file)) {
    const hit = cache.text.get(file);
    return hit === null ? undefined : hit;
  }
  let text: string | undefined;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    text = undefined;
  }
  if (cache) {
    if (text === undefined) {
      // Always remember a failure (cheap, and avoids a retried failing open).
      cache.text.set(file, null);
    } else if (text.length <= cache.remainingBytes) {
      // `text.length` is UTF-16 code units — a safe upper-bound proxy for the JS
      // string's retained size; good enough to keep the ceiling honest.
      cache.text.set(file, text);
      cache.remainingBytes -= text.length;
    }
    // else: over budget — return the text but DO NOT retain it (memory stays
    // capped; the next consumer re-reads, i.e. the pre-cache behavior).
  }
  return text;
}
