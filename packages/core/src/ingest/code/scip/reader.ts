/**
 * Minimal SCIP (`index.scip`) protobuf reader (D16 consumer core; read-back
 * `docs/codemap/impl/appendix-A1-copyable.md:480–500`).
 *
 * The 2e work order de-scopes the heavy `@scip-code/scip` + `@bufbuild/protobuf`
 * binding ("a minimal reader is fine; avoid heavy deps — no scip-typescript
 * toolchain in the runtime path"): ctx must stay zero-runtime-dependency + no
 * native addon, and only the CONSUMER (not the indexer) is 2e's deliverable. So
 * this file decodes the SCIP wire format directly — the real protobuf binary
 * encoding, so a fixture built by the inverse encoder is a genuine `.scip` byte
 * stream, not a mock.
 *
 * Wire format (canonical protobuf): each field is a varint tag
 * `(field_number << 3) | wire_type`; wire types 0=VARINT, 1=I64, 2=LEN, 5=I32.
 * We decode only the subset the mapping needs (Index.documents → Document
 * .{relative_path, occurrences, language} → Occurrence.{range, symbol,
 * symbol_roles}); every other field is length/skip-advanced by its wire type.
 *
 * D16 FAIL-OPEN CONTRACT: a truncated / malformed stream MUST throw — a varint
 * that runs past the buffer, or a length-delimited field claiming more bytes
 * than remain, raises `ScipDecodeError`. The consumer catches it and rolls the
 * whole SCIP pass back (nothing half-applied). Every bounds check here is
 * load-bearing for that guarantee.
 *
 * Range encoding (D16 note): the classic packed `repeated int32 range`
 * (0-based `[startLine,startChar,endChar]` single-line or
 * `[startLine,startChar,endLine,endChar]` multi-line) is decoded, packed OR
 * unpacked. The newer typed `single_line_range`/`multi_line_range` sub-messages
 * are NOT decoded here (out of scope for the minimal reader; the fixture path
 * uses the packed form) — documented limitation, not silent.
 */

const WIRE_VARINT = 0;
const WIRE_I64 = 1;
const WIRE_LEN = 2;
const WIRE_I32 = 5;

/** SymbolRole.Definition bit (source: scip.proto, VERBATIM appendix). Bitmask,
 *  tested with `roles & 0x1` — never enum equality. */
export const SCIP_ROLE_DEFINITION = 0x1;

export class ScipDecodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScipDecodeError";
  }
}

export interface ScipOccurrence {
  /** 0-based packed range (`[line,startChar,endChar]` or with `endLine`). */
  range: number[];
  /** SCIP symbol string (its grammar: `local …` = doc-local; `…().` = method). */
  symbol: string;
  /** SymbolRole bitmask (`& SCIP_ROLE_DEFINITION` = a definition occurrence). */
  symbolRoles: number;
}

export interface ScipDocument {
  relativePath: string;
  language: string;
  occurrences: ScipOccurrence[];
}

export interface ScipIndex {
  documents: ScipDocument[];
}

/** Bounds-checked forward cursor over the protobuf byte stream. */
class Reader {
  readonly #buf: Uint8Array;
  #pos = 0;

  constructor(buf: Uint8Array) {
    this.#buf = buf;
  }

  get eof(): boolean {
    return this.#pos >= this.#buf.length;
  }

  /** A base-128 varint as a JS number (SCIP line/char/role values are small —
   *  far below 2^53; a float accumulator is exact and cannot 32-bit-overflow). */
  varint(): number {
    let result = 0;
    let shift = 0;
    for (;;) {
      if (this.#pos >= this.#buf.length) throw new ScipDecodeError("truncated varint");
      const byte = this.#buf[this.#pos++]!;
      result += (byte & 0x7f) * 2 ** shift;
      if ((byte & 0x80) === 0) break;
      shift += 7;
      if (shift > 63) throw new ScipDecodeError("varint exceeds 64 bits");
    }
    return result;
  }

  /** `len` raw bytes; throws if the field claims more than remains (D16). */
  bytes(len: number): Uint8Array {
    if (len < 0 || this.#pos + len > this.#buf.length) {
      throw new ScipDecodeError(`length-delimited field overruns buffer (${len})`);
    }
    const out = this.#buf.subarray(this.#pos, this.#pos + len);
    this.#pos += len;
    return out;
  }

  string(len: number): string {
    return new TextDecoder("utf-8", { fatal: false }).decode(this.bytes(len));
  }

  /** Advance past one field of unknown interest, by its wire type. */
  skip(wire: number): void {
    switch (wire) {
      case WIRE_VARINT:
        this.varint();
        return;
      case WIRE_I64:
        this.bytes(8);
        return;
      case WIRE_LEN:
        this.bytes(this.varint());
        return;
      case WIRE_I32:
        this.bytes(4);
        return;
      default:
        throw new ScipDecodeError(`unknown wire type ${wire}`);
    }
  }
}

function decodeOccurrence(buf: Uint8Array): ScipOccurrence {
  const r = new Reader(buf);
  const range: number[] = [];
  let symbol = "";
  let symbolRoles = 0;
  while (!r.eof) {
    const tag = r.varint();
    const field = Math.floor(tag / 8);
    const wire = tag % 8;
    if (field === 1 && wire === WIRE_LEN) {
      // packed `repeated int32 range`
      const sub = new Reader(r.bytes(r.varint()));
      while (!sub.eof) range.push(sub.varint());
    } else if (field === 1 && wire === WIRE_VARINT) {
      range.push(r.varint()); // unpacked repeated int32
    } else if (field === 2 && wire === WIRE_LEN) {
      symbol = r.string(r.varint());
    } else if (field === 3 && wire === WIRE_VARINT) {
      symbolRoles = r.varint();
    } else {
      r.skip(wire);
    }
  }
  return { range, symbol, symbolRoles };
}

function decodeDocument(buf: Uint8Array): ScipDocument {
  const r = new Reader(buf);
  let relativePath = "";
  let language = "";
  const occurrences: ScipOccurrence[] = [];
  while (!r.eof) {
    const tag = r.varint();
    const field = Math.floor(tag / 8);
    const wire = tag % 8;
    if (field === 1 && wire === WIRE_LEN) {
      relativePath = r.string(r.varint());
    } else if (field === 2 && wire === WIRE_LEN) {
      occurrences.push(decodeOccurrence(r.bytes(r.varint())));
    } else if (field === 4 && wire === WIRE_LEN) {
      language = r.string(r.varint());
    } else {
      r.skip(wire); // metadata / symbols (SymbolInformation) / unknown — not needed
    }
  }
  return { relativePath, language, occurrences };
}

/**
 * Decode a whole `index.scip` byte buffer into `{ documents }`. Throws
 * `ScipDecodeError` on any truncation/corruption (the D16 fail-open trigger).
 * The consumer decodes fully BEFORE writing anything, so a throw here means the
 * store is never touched (buffer-then-apply, §11 rollback).
 */
export function decodeScipIndex(buf: Uint8Array): ScipIndex {
  const r = new Reader(buf);
  const documents: ScipDocument[] = [];
  while (!r.eof) {
    const tag = r.varint();
    const field = Math.floor(tag / 8);
    const wire = tag % 8;
    if (field === 2 && wire === WIRE_LEN) {
      documents.push(decodeDocument(r.bytes(r.varint())));
    } else {
      r.skip(wire); // metadata (field 1) / external_symbols (field 3) / unknown
    }
  }
  return { documents };
}

/** Is this SCIP symbol string a document-local symbol? (grammar: `local …`.) */
export function isLocalScipSymbol(symbol: string): boolean {
  return symbol.startsWith("local ");
}

/** A method/function descriptor ends `().` — the appendix's calls-vs-references
 *  split (`occ.symbol.endsWith(").")`). Everything else is a plain reference. */
export function isCallableScipSymbol(symbol: string): boolean {
  return symbol.endsWith(").");
}
