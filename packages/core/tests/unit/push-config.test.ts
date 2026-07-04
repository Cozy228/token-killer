import { describe, expect, test } from "vitest";
import { parsePushConfig, stripJsonComments } from "../../src/push/config.ts";

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
});
