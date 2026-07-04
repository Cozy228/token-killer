/**
 * Parse-worker message protocol (type-only + two test sentinels). Shared by the
 * worker and its manager so the wire shape stays in one place.
 */
import type { LanguageId } from "./languages.ts";
import type { ExtractResult } from "./symbol.ts";

/**
 * Content sentinels for the B1-worker acceptance simulation. Each starts with a
 * NUL escape, which never appears in a real source file (the dirty scan binary-
 * sniffs and the store read-through reject NUL bytes), so they can never collide
 * with genuine content.
 *
 * POISON drives the exact D23 OOM path: the worker throws an
 * "out of bounds"-classed error, the real OOM handler catches it and calls
 * `process.exit(1)`, and the manager treats the abnormal exit as a crash and
 * respawns. HANG makes the worker never reply, exercising the manager parse
 * timeout (reject-first, then terminate).
 */
export const POISON_CONTENT = "\u0000__ctx_wasm_poison__";
export const HANG_CONTENT = "\u0000__ctx_worker_hang__";

export type ToWorker =
  | { type: "parse"; id: number; relPath: string; content: string; langId: LanguageId }
  | { type: "load"; langIds: LanguageId[] }
  | { type: "shutdown" };

export type FromWorker =
  | { type: "parse-result"; id: number; result: ExtractResult }
  | { type: "parse-error"; id: number; message: string }
  | { type: "loaded" };
