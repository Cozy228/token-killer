import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  mergePushConfig,
  parsePushConfig,
  readMemoryOptOut,
  stripJsonComments,
} from "../../src/push/config.ts";

// §10 unit — .ctx/push.jsonc JSONC parsing edge cases (P28: comments allowed;
// unknown keys rejected with guidance; every failure success-shaped, never a throw).
describe("push config: JSONC parsing", () => {
  test("empty / whitespace source → clean empty config", () => {
    for (const src of ["", "   ", "\n\t\n"]) {
      const c = parsePushConfig(src);
      expect(c).toMatchObject({ pin: [], veto: [], ok: true });
      expect(c.warnings).toEqual([]);
    }
  });

  test("line + block comments are stripped; pin/veto parsed", () => {
    const src = `{
      // pin the retry gotcha
      "pin": ["m1a2b3c"], /* inline */
      "veto": ["c9f8e7d"] // trailing
    }`;
    const c = parsePushConfig(src);
    expect(c.ok).toBe(true);
    expect(c.pin).toEqual(["m1a2b3c"]);
    expect(c.veto).toEqual(["c9f8e7d"]);
  });

  test("comment sequences inside strings are preserved", () => {
    // A `//`-looking substring inside a value must not start a comment.
    const src = `{ "pin": ["file://not-a-comment"], "veto": [] }`;
    const c = parsePushConfig(src);
    expect(c.pin).toEqual(["file://not-a-comment"]);
    expect(stripJsonComments(src)).toContain("file://not-a-comment");
  });

  test("unknown top-level key → rejected with guidance, config ignored, no throw", () => {
    const c = parsePushConfig(`{ "pin": ["m1"], "pinn": ["typo"] }`);
    expect(c.ok).toBe(false);
    expect(c.pin).toEqual([]); // whole config ignored
    expect(c.veto).toEqual([]);
    expect(c.warnings[0]).toMatch(/unknown key/i);
    expect(c.warnings[0]).toContain("pinn");
  });

  test("malformed JSON → guidance, config ignored, no throw", () => {
    const c = parsePushConfig(`{ "pin": [ }`);
    expect(c.ok).toBe(false);
    expect(c.pin).toEqual([]);
    expect(c.warnings[0]).toMatch(/valid JSON/i);
  });

  test("non-object root → guidance, no throw", () => {
    for (const src of ["[1,2,3]", '"just a string"', "42", "null"]) {
      const c = parsePushConfig(src);
      expect(c.ok).toBe(false);
      expect(c.warnings.length).toBeGreaterThan(0);
    }
  });

  test("wrong-typed pin/veto → skipped with guidance, not thrown", () => {
    const c = parsePushConfig(`{ "pin": "m1", "veto": [1, "ok", null] }`);
    expect(c.pin).toEqual([]); // string, not array → ignored with a warning
    expect(c.veto).toEqual(["ok"]); // non-string entries dropped
    expect(c.ok).toBe(false);
    expect(c.warnings.length).toBeGreaterThan(0);
  });

  test("duplicate ids are de-duplicated, blanks dropped", () => {
    const c = parsePushConfig(`{ "pin": ["m1", "m1", " ", "m2"] }`);
    expect(c.pin).toEqual(["m1", "m2"]);
  });

  // ---- slice 5: E4 opt-out (`commitMemory`) + three-tier merge ----
  test("commitMemory defaults to true; parses false; non-boolean → warn + default true", () => {
    expect(parsePushConfig("{}").commitMemory).toBe(true);
    expect(parsePushConfig(`{ "commitMemory": false }`).commitMemory).toBe(false);
    expect(parsePushConfig(`{ "commitMemory": true }`).commitMemory).toBe(true);
    const bad = parsePushConfig(`{ "commitMemory": "no" }`);
    expect(bad.commitMemory).toBe(true); // success-shaped: default, not a throw
    expect(bad.ok).toBe(false);
    expect(bad.warnings[0]).toMatch(/commitMemory/);
  });

  test("commitMemory coexists with pin/veto (a known key, not rejected)", () => {
    const c = parsePushConfig(`{ "pin": ["m1"], "veto": ["m2"], "commitMemory": false }`);
    expect(c.ok).toBe(true);
    expect(c.pin).toEqual(["m1"]);
    expect(c.veto).toEqual(["m2"]);
    expect(c.commitMemory).toBe(false);
  });

  test("mergePushConfig: shared-first order, dedup, opt-out is shared-only, warnings concat", () => {
    const shared = parsePushConfig(`{ "pin": ["a", "b"], "veto": ["x"], "commitMemory": false }`);
    const overlay = parsePushConfig(`{ "pin": ["b", "c"], "veto": ["y"], "commitMemory": true }`);
    const merged = mergePushConfig(shared, overlay);
    expect(merged.pin).toEqual(["a", "b", "c"]); // shared first, "b" de-duplicated
    expect(merged.veto).toEqual(["x", "y"]);
    // Opt-out is project truth → taken from the SHARED layer only (overlay ignored).
    expect(merged.commitMemory).toBe(false);
  });

  test("mergePushConfig is deterministic (byte-identical for identical inputs)", () => {
    const s = parsePushConfig(`{ "pin": ["a"] }`);
    const o = parsePushConfig(`{ "pin": ["b"] }`);
    expect(JSON.stringify(mergePushConfig(s, o))).toBe(JSON.stringify(mergePushConfig(s, o)));
  });
});

describe("push config: E4 opt-out reader (readMemoryOptOut)", () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "ctx-optout-"));
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });

  test("missing config → not opted out; malformed → not opted out (success-shaped)", () => {
    const ctxRoot = join(root, ".ctx");
    expect(readMemoryOptOut(ctxRoot)).toBe(false); // no file
    mkdirSync(ctxRoot, { recursive: true });
    writeFileSync(join(ctxRoot, "push.jsonc"), "{ not json");
    expect(readMemoryOptOut(ctxRoot)).toBe(false);
  });

  test("`commitMemory: false` in the SHARED config → opted out", () => {
    const ctxRoot = join(root, ".ctx");
    mkdirSync(ctxRoot, { recursive: true });
    writeFileSync(join(ctxRoot, "push.jsonc"), `{ "commitMemory": false }`);
    expect(readMemoryOptOut(ctxRoot)).toBe(true);
  });
});
