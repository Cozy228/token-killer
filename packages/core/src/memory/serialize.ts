/**
 * Committed memory serialization grammar (slice 3 — C1 / C2).
 *
 * Each committed event is exactly ONE physical line (C1: one entry per line;
 * C2: one decision per line — who / when / verdict / reason / refs). Line order
 * is non-semantic (E2): the total order is `(at, then ULID)`, recomputed by the
 * fold, never read from file position. Because every line is unique (it carries a
 * ULID) and self-contained, the append-only logs declare `.gitattributes
 * merge=union` and concurrent appends auto-merge without tearing.
 *
 * Format (NOT JSONL, per C2): a markdown list item, a type tag, then
 * space-separated `key=value` tokens whose values are percent-encoded
 * (`encodeURIComponent`) so a value can never contain a space or newline that
 * would break the one-line-per-entry rule. `refs` is percent-encoded JSON — the
 * only nested field. Multi-line `detail` bodies never live inline: they go to a
 * write-once sidecar (S1) referenced by the `detail=<ulid>` token.
 *
 *   - mem id=… at=… mid=mem:… verb=create actor=… gist=… origin=… [detail=<ulid>] …
 *   - dec id=… at=… mid=mem:… verb=confirm actor=cli … [refs=<enc-json>]
 *
 * Pure functions — no IO, no clock, no network.
 */
import type { Authority, ClaimMethod, MemoryEventVerb, MemoryStatus } from "../store/types.ts";

/** The memory payload carried by a `create` (mem) line — the note itself. */
export interface SerializedMemory {
  /** create-event id (ULID). */
  eventId: string;
  /** epoch-ms event timestamp (E2 primary sort key). */
  at: number;
  /** `mem:<ulid>` entity id. */
  memoryId: string;
  actor: string;
  carrier: string;
  method: ClaimMethod;
  authority: Authority;
  /** landing status (the create-event `refs.status` fold baseline). */
  status: MemoryStatus;
  gist: string;
  origin: string;
  /** sidecar pointer (the memory ULID) when the note has a detail body. */
  detailPointer?: string;
  anchors: string[];
  /** author HEAD commit at write time (S4 §4) — absent for legacy rows. */
  anchoredAt?: string;
  /**
   * O-18 committed content-hash baseline (slice 6): the anchored target's content
   * signature AT WRITE TIME, keyed by anchor id. `h` = the target entity's
   * `contentHash` (blake2bHex of its normalized span — the store's existing hash
   * primitive, no second pipeline); `a` = its `arity` when the target is a symbol
   * (lets a full reindex re-derive `signature-changed` vs `body-changed` per A5,
   * exactly like the within-branch `flagAnchorDrift`). OPTIONAL in the grammar —
   * an absent map is a legacy anchor and degrades to today's behaviour EXACTLY
   * (present-target drift stays invisible to a from-scratch reindex). Captured at
   * write/confirm/reindex time only (A11: no per-query file IO or git spawn).
   */
  anchorSigs?: Record<string, { h: string; a?: number }>;
  sessionRef?: string;
  reason?: string;
  /** C5 bitemporal validity (populated only from explicit args / supersede). */
  validFrom?: number;
  validTo?: number;
}

/** A lifecycle / decision (dec) line — a status-asserting or conflict event. */
export interface SerializedDecision {
  eventId: string;
  at: number;
  memoryId: string;
  verb: MemoryEventVerb;
  actor: string;
  carrier: string;
  method: ClaimMethod;
  authority: Authority;
  reason?: string;
  locus?: string;
  /** refs object (supersededBy / conflictA / conflictB / status). */
  refs?: Record<string, unknown>;
}

const enc = (v: string): string => encodeURIComponent(v);
const dec = (v: string): string => decodeURIComponent(v);

/** Join `key=value` tokens, dropping undefined values, in a stable order. */
function line(tag: string, tokens: Array<[string, string | undefined]>): string {
  const parts = [`- ${tag}`];
  for (const [k, v] of tokens) if (v !== undefined && v !== "") parts.push(`${k}=${v}`);
  return parts.join(" ");
}

/** Parse the `key=value` tokens of a tagged line into a raw string map. */
function parseTokens(rest: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const tok of rest.trim().split(/\s+/)) {
    const eq = tok.indexOf("=");
    if (eq <= 0) continue;
    out[tok.slice(0, eq)] = tok.slice(eq + 1);
  }
  return out;
}

// ---- memory (create) lines ----

export function serializeMemory(m: SerializedMemory): string {
  return line("mem", [
    ["id", enc(m.eventId)],
    ["at", String(m.at)],
    ["mid", enc(m.memoryId)],
    ["verb", "create"],
    ["actor", enc(m.actor)],
    ["carrier", enc(m.carrier)],
    ["method", enc(m.method)],
    ["authority", enc(m.authority)],
    ["status", enc(m.status)],
    ["origin", enc(m.origin)],
    ["gist", enc(m.gist)],
    ["detail", m.detailPointer ? enc(m.detailPointer) : undefined],
    ["anchors", m.anchors.length > 0 ? enc(JSON.stringify(m.anchors)) : undefined],
    ["anchored-at", m.anchoredAt ? enc(m.anchoredAt) : undefined],
    [
      "anchor-sig",
      m.anchorSigs && Object.keys(m.anchorSigs).length > 0
        ? enc(JSON.stringify(m.anchorSigs))
        : undefined,
    ],
    ["session", m.sessionRef ? enc(m.sessionRef) : undefined],
    ["reason", m.reason ? enc(m.reason) : undefined],
    ["valid-from", m.validFrom !== undefined ? String(m.validFrom) : undefined],
    ["valid-to", m.validTo !== undefined ? String(m.validTo) : undefined],
  ]);
}

export function parseMemory(raw: string): SerializedMemory | undefined {
  // NEVER throws (R1): a corrupt / hand-edited line (bad percent-escape, bad refs
  // JSON) is an expected input on a human-reviewed committed log (E3) and under a
  // manual conflict resolution (S10 #3). An unparseable line returns `undefined`
  // (the caller skips + counts it, S1b success-shaped), never a crash.
  try {
    return parseMemoryUnsafe(raw);
  } catch {
    return undefined;
  }
}

function parseMemoryUnsafe(raw: string): SerializedMemory | undefined {
  const m = /^- mem\s+(.*)$/.exec(raw.trim());
  if (!m) return undefined;
  const t = parseTokens(m[1] as string);
  if (!t.id || !t.mid || t.at === undefined) return undefined;
  const anchors = t.anchors ? (JSON.parse(dec(t.anchors)) as string[]) : [];
  const anchorSigs = t["anchor-sig"]
    ? (JSON.parse(dec(t["anchor-sig"])) as Record<string, { h: string; a?: number }>)
    : undefined;
  const validFrom = t["valid-from"] !== undefined ? Number(t["valid-from"]) : undefined;
  const validTo = t["valid-to"] !== undefined ? Number(t["valid-to"]) : undefined;
  return {
    eventId: dec(t.id),
    at: Number(t.at),
    memoryId: dec(t.mid),
    actor: t.actor ? dec(t.actor) : "agent",
    carrier: t.carrier ? dec(t.carrier) : "memory",
    method: (t.method ? dec(t.method) : "explicit-key") as ClaimMethod,
    authority: (t.authority ? dec(t.authority) : "confirmed") as Authority,
    status: (t.status ? dec(t.status) : "active") as MemoryStatus,
    gist: t.gist ? dec(t.gist) : "",
    origin: t.origin ? dec(t.origin) : "remember",
    detailPointer: t.detail ? dec(t.detail) : undefined,
    anchors,
    anchoredAt: t["anchored-at"] ? dec(t["anchored-at"]) : undefined,
    ...(anchorSigs ? { anchorSigs } : {}),
    sessionRef: t.session ? dec(t.session) : undefined,
    reason: t.reason ? dec(t.reason) : undefined,
    ...(validFrom !== undefined && !Number.isNaN(validFrom) ? { validFrom } : {}),
    ...(validTo !== undefined && !Number.isNaN(validTo) ? { validTo } : {}),
  };
}

// ---- decision (lifecycle) lines ----

export function serializeDecision(d: SerializedDecision): string {
  const refs = d.refs && Object.keys(d.refs).length > 0 ? enc(JSON.stringify(d.refs)) : undefined;
  return line("dec", [
    ["id", enc(d.eventId)],
    ["at", String(d.at)],
    ["mid", enc(d.memoryId)],
    ["verb", enc(d.verb)],
    ["actor", enc(d.actor)],
    ["carrier", enc(d.carrier)],
    ["method", enc(d.method)],
    ["authority", enc(d.authority)],
    ["locus", d.locus ? enc(d.locus) : undefined],
    ["reason", d.reason ? enc(d.reason) : undefined],
    ["refs", refs],
  ]);
}

export function parseDecision(raw: string): SerializedDecision | undefined {
  // NEVER throws (R1) — see `parseMemory`. A corrupt line returns `undefined`.
  try {
    return parseDecisionUnsafe(raw);
  } catch {
    return undefined;
  }
}

function parseDecisionUnsafe(raw: string): SerializedDecision | undefined {
  const m = /^- dec\s+(.*)$/.exec(raw.trim());
  if (!m) return undefined;
  const t = parseTokens(m[1] as string);
  if (!t.id || !t.mid || !t.verb || t.at === undefined) return undefined;
  return {
    eventId: dec(t.id),
    at: Number(t.at),
    memoryId: dec(t.mid),
    verb: dec(t.verb) as MemoryEventVerb,
    actor: t.actor ? dec(t.actor) : "cli",
    carrier: t.carrier ? dec(t.carrier) : "cli",
    method: (t.method ? dec(t.method) : "explicit-key") as ClaimMethod,
    authority: (t.authority ? dec(t.authority) : "confirmed") as Authority,
    locus: t.locus ? dec(t.locus) : undefined,
    reason: t.reason ? dec(t.reason) : undefined,
    refs: t.refs ? (JSON.parse(dec(t.refs)) as Record<string, unknown>) : undefined,
  };
}

/** Classify a committed line by its tag (for the pull-delta reindex router). */
export function lineTag(raw: string): "mem" | "dec" | undefined {
  const t = raw.trim();
  if (t.startsWith("- mem ")) return "mem";
  if (t.startsWith("- dec ")) return "dec";
  return undefined;
}
