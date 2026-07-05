/**
 * Test-only minimal SCIP (`index.scip`) protobuf ENCODER — the inverse of the
 * product reader (`src/ingest/code/scip/reader.ts`). It emits REAL protobuf wire
 * bytes (canonical encoding), so a fixture built here is a genuine `.scip` byte
 * stream the reader decodes exactly as it would a scip-typescript output — not a
 * mock. Kept out of the shipped bundle (tests/ only); the runtime never encodes.
 *
 * Construction method (⚠ recorded for CI reproducibility): given documents with
 * 0-based packed `[startLine,startChar,endChar]` occurrence ranges and a
 * SymbolRole bitmask (1 = Definition), each occurrence is
 * `packed-int32 range | string symbol | varint symbol_roles`, each document is
 * `string relative_path | repeated Occurrence | string language`, and the index
 * is `repeated Document`. Field numbers/wire types match scip.proto (appendix
 * A1). Zero-valued `symbol_roles` (a reference occurrence) is omitted, proto3.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";

export const ROLE_DEFINITION = 0x1;

export interface FixtureOccurrence {
  /** 0-based packed range (`[startLine,startChar,endChar]`). */
  range: number[];
  symbol: string;
  /** SymbolRole bitmask; omit / 0 = a reference occurrence. */
  roles?: number;
}

export interface FixtureDocument {
  relativePath: string;
  language: string;
  occurrences: FixtureOccurrence[];
}

/** Canonical base-128 varint (float math → no 32-bit overflow, matches reader). */
function encodeVarint(n: number): number[] {
  if (n < 0 || !Number.isFinite(n)) throw new Error(`varint must be non-negative finite: ${n}`);
  const out: number[] = [];
  let v = Math.floor(n);
  do {
    const byte = v % 128;
    v = Math.floor(v / 128);
    out.push(v > 0 ? byte | 0x80 : byte);
  } while (v > 0);
  return out;
}

function tag(field: number, wire: number): number[] {
  return encodeVarint(field * 8 + wire);
}

/** Length-delimited (wire 2): tag · length · payload. */
function lenField(field: number, payload: number[]): number[] {
  return [...tag(field, 2), ...encodeVarint(payload.length), ...payload];
}

function strField(field: number, s: string): number[] {
  return lenField(field, [...Buffer.from(s, "utf8")]);
}

function varintField(field: number, n: number): number[] {
  return [...tag(field, 0), ...encodeVarint(n)];
}

function packedInt32Field(field: number, nums: number[]): number[] {
  return lenField(field, nums.flatMap(encodeVarint));
}

function encodeOccurrence(occ: FixtureOccurrence): number[] {
  const roles = occ.roles ?? 0;
  return [
    ...packedInt32Field(1, occ.range),
    ...strField(2, occ.symbol),
    ...(roles !== 0 ? varintField(3, roles) : []),
  ];
}

function encodeDocument(doc: FixtureDocument): number[] {
  return [
    ...strField(1, doc.relativePath),
    ...doc.occurrences.flatMap((o) => lenField(2, encodeOccurrence(o))),
    ...strField(4, doc.language),
  ];
}

/** Encode a whole index to real `.scip` wire bytes. */
export function encodeScipIndex(documents: FixtureDocument[]): Buffer {
  return Buffer.from(documents.flatMap((d) => lenField(2, encodeDocument(d))));
}

/** Write `index.scip` into `dir` (the fixture project root) and return its path. */
export function writeScipFixture(dir: string, documents: FixtureDocument[]): string {
  const path = join(dir, "index.scip");
  writeFileSync(path, encodeScipIndex(documents));
  return path;
}

/**
 * A deliberately malformed/truncated buffer: the encoded index with its tail
 * cut, so the final document's top-level length-delimited header claims more
 * bytes than remain → the reader throws `ScipDecodeError` → fail-open. Cutting
 * 3 bytes lands inside the last document's trailing `language` string, which is
 * always non-empty here, so the truncation is deterministic.
 */
export function truncatedScip(documents: FixtureDocument[]): Buffer {
  const full = encodeScipIndex(documents);
  return full.subarray(0, full.length - 3);
}

/** Write a malformed `index.scip` into `dir`; returns its path. */
export function writeMalformedScipFixture(dir: string, documents: FixtureDocument[]): string {
  const path = join(dir, "index.scip");
  writeFileSync(path, truncatedScip(documents));
  return path;
}
