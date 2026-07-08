/**
 * Handles — the drill-down currency (CONTEXA-IMPL §3, P25②).
 *
 * Two forms, both accepted by `context(handle)` / `ctx recall`:
 * - verbatim: `<entityId>` or `<entityId>!<facet>`
 * - short:    `[k4f7a2]` — kind initial + first 5 hex of blake2b(entityId+facet),
 *   collision-bumped 5→6→7… (P28 addenda), interned in `handles` on first
 *   emission. The candidate is a pure function of (entityId, facet, length), so
 *   short handles are deterministic across processes and sessions.
 */
import { blake2bHex } from "./hash.ts";
import type { Facet } from "./types.ts";

export const HANDLE_MIN_LEN = 5;

export function kindInitial(entityId: string): string {
  const colon = entityId.indexOf(":");
  const initial = colon > 0 ? entityId[0] : undefined;
  if (initial === undefined) throw new Error(`malformed entity id (no kind prefix): ${entityId}`);
  return initial.toLowerCase();
}

/** Pure short-handle candidate at a given prefix length (no interning). */
export function shortHandleCandidate(
  entityId: string,
  facet: Facet | undefined,
  len: number,
): string {
  return kindInitial(entityId) + blake2bHex(entityId + (facet ?? "")).slice(0, len);
}

export interface ParsedHandle {
  form: "short" | "verbatim";
  /** short form: the interned key (no brackets); verbatim: the entity id. */
  key: string;
  facet: Facet | undefined;
}

const FACETS: ReadonlySet<string> = new Set([
  "callers",
  "callees",
  "diff",
  "text",
  "detail",
  "history",
  "full",
]);

/**
 * Parse either handle form. Returns undefined for input that is neither —
 * callers turn that into success-shaped guidance (G-3), never a throw.
 */
export function parseHandle(input: string): ParsedHandle | undefined {
  const raw = input.trim();
  const unbracketed = raw.startsWith("[") && raw.endsWith("]") ? raw.slice(1, -1) : raw;
  if (unbracketed.includes(":")) {
    const bang = unbracketed.indexOf("!");
    if (bang === -1) return { form: "verbatim", key: unbracketed, facet: undefined };
    const facet = unbracketed.slice(bang + 1);
    if (!FACETS.has(facet)) return undefined;
    return { form: "verbatim", key: unbracketed.slice(0, bang), facet: facet as Facet };
  }
  // Short form: kind initial + >=HANDLE_MIN_LEN hex chars.
  if (/^[a-z][0-9a-f]{5,}$/.test(unbracketed)) {
    return { form: "short", key: unbracketed, facet: undefined };
  }
  return undefined;
}

/** Render a short handle for output (`[k4f7a2]`). */
export function printShortHandle(short: string): string {
  return `[${short}]`;
}
