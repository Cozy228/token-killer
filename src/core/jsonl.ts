// Shared JSONL line parser (Goal D). The four ledgers each persist one JSON
// record per line; three readers used to repeat `split().filter().map(JSON.parse)`
// with three DIFFERENT corrupt-line policies (throw / per-line-skip / drop-whole-
// file). This unifies them on the safest one: per-line skip — a single garbled
// line costs only itself, the surrounding good rows survive. Pinned by
// governance's "good lines survive, bad lines are skipped" test.
//
// Takes text rather than a path: the history/governance readers are async and own
// their file I/O + ENOENT semantics, so the genuinely shared unit is the parse,
// not the read. Callers read the file (sync or async) and pass the text here.
export function parseJsonl<T>(text: string): T[] {
  return text
    .split(/\r?\n/)
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line) as T];
      } catch {
        return [];
      }
    });
}
