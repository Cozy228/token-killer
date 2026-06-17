// A read-through cache shared across the inspect analyzers so each transcript /
// session file is read from disk ONCE per `tk inspect` run. scan() and
// analyzeHabits() both walk the same SourceDiscovery file set; without sharing,
// every file was read twice (the OS syscall + UTF-8 decode paid twice). The cache
// stores raw text keyed by path; a read failure is cached as `null` so a missing
// or unreadable file is not retried by the second consumer.

import { readFileSync } from "node:fs";

export type FileCache = Map<string, string | null>;

// Read `file` as UTF-8, serving a prior result (success OR failure) from `cache`
// when one is provided. Returns undefined on read failure — matching the inline
// try/catch contract the call sites had before the cache existed.
export function readSourceText(file: string, cache?: FileCache): string | undefined {
  if (cache?.has(file)) {
    const hit = cache.get(file);
    return hit === null ? undefined : hit;
  }
  let text: string | undefined;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    text = undefined;
  }
  cache?.set(file, text ?? null);
  return text;
}
