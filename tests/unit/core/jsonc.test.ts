import { describe, expect, test } from "vitest";

import { isStrictJson, parseJsonc } from "../../../src/core/jsonc.js";

describe("parseJsonc", () => {
  test("parses plain strict JSON unchanged", () => {
    expect(parseJsonc('{ "a": 1, "b": [1, 2, 3] }')).toEqual({ a: 1, b: [1, 2, 3] });
  });

  test("strips // line comments", () => {
    expect(parseJsonc('{\n  "a": 1 // trailing\n  // standalone\n}')).toEqual({ a: 1 });
  });

  test("strips /* */ block comments", () => {
    expect(parseJsonc('{ /* lead */ "a": 1 /* mid */, "b": 2 }')).toEqual({ a: 1, b: 2 });
  });

  test("drops trailing commas in objects and arrays", () => {
    expect(parseJsonc('{ "a": [1, 2,], "b": 3, }')).toEqual({ a: [1, 2], b: 3 });
  });

  test("drops a trailing comma followed by a line comment before }", () => {
    expect(parseJsonc('{\n  "a": 1, // note\n}')).toEqual({ a: 1 });
  });

  test("keeps // inside string values (URLs)", () => {
    expect(parseJsonc('{ "url": "https://example.com/x" }')).toEqual({
      url: "https://example.com/x",
    });
  });

  test("keeps /* */ inside string values", () => {
    expect(parseJsonc('{ "s": "a /* not a comment */ b" }')).toEqual({
      s: "a /* not a comment */ b",
    });
  });

  test("keeps commas inside string values", () => {
    expect(parseJsonc('{ "s": "a, b, c" }')).toEqual({ s: "a, b, c" });
  });

  test("handles escaped quotes inside strings", () => {
    expect(parseJsonc('{ "s": "he said \\"hi\\" // x" }')).toEqual({ s: 'he said "hi" // x' });
  });

  test("handles a trailing backslash before the closing quote", () => {
    expect(parseJsonc('{ "p": "C:\\\\path\\\\" }')).toEqual({ p: "C:\\path\\" });
  });

  test("strips a UTF-8 BOM", () => {
    expect(parseJsonc('﻿{ "a": 1 }')).toEqual({ a: 1 });
  });

  test("tolerates CRLF line endings", () => {
    expect(parseJsonc('{\r\n  "a": 1, // c\r\n  "b": 2\r\n}')).toEqual({ a: 1, b: 2 });
  });

  test("handles nested trailing commas", () => {
    expect(parseJsonc('{ "a": { "b": [1,], }, }')).toEqual({ a: { b: [1] } });
  });

  test("throws on genuinely malformed JSON", () => {
    expect(() => parseJsonc('{ "a": }')).toThrow();
    expect(() => parseJsonc("{ not json")).toThrow();
  });
});

describe("isStrictJson", () => {
  test("true for comment-free, trailing-comma-free JSON", () => {
    expect(isStrictJson('{ "a": 1 }')).toBe(true);
  });

  test("true even with a BOM (BOM is stripped before checking)", () => {
    expect(isStrictJson('﻿{ "a": 1 }')).toBe(true);
  });

  test("false for JSONC with comments", () => {
    expect(isStrictJson('{ "a": 1 // c\n}')).toBe(false);
  });

  test("false for a trailing comma", () => {
    expect(isStrictJson('{ "a": 1, }')).toBe(false);
  });
});
