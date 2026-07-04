import { describe, expect, test } from "vitest";
import {
  HANDLE_MIN_LEN,
  kindInitial,
  parseHandle,
  printShortHandle,
  shortHandleCandidate,
} from "../../src/store/handles.ts";

describe("handles (§3: deterministic short form, two accepted forms)", () => {
  test("candidate is a pure function: kind initial + blake2b prefix", () => {
    const a = shortHandleCandidate("file:CTX-IMPL.md", undefined, HANDLE_MIN_LEN);
    const b = shortHandleCandidate("file:CTX-IMPL.md", undefined, HANDLE_MIN_LEN);
    expect(a).toBe(b);
    expect(a).toMatch(/^f[0-9a-f]{5}$/);
    // facet participates in the hash
    expect(shortHandleCandidate("file:CTX-IMPL.md", "text", 5)).not.toBe(a);
    // longer prefix extends, same head
    const bumped = shortHandleCandidate("file:CTX-IMPL.md", undefined, 6);
    expect(bumped.startsWith(a)).toBe(true);
    expect(bumped).toHaveLength(7); // initial + 6 hex
  });

  test("kind initial comes from the id's kind prefix", () => {
    expect(kindInitial("file:x.ts")).toBe("f");
    expect(kindInitial("mem:01H0000")).toBe("m");
    expect(kindInitial("commit:12dc674")).toBe("c");
    expect(() => kindInitial("no-prefix")).toThrow(/malformed/);
  });

  test("parseHandle accepts verbatim, verbatim!facet, short, [short]", () => {
    expect(parseHandle("file:CTX-IMPL.md")).toEqual({
      form: "verbatim",
      key: "file:CTX-IMPL.md",
      facet: undefined,
    });
    expect(parseHandle("file:CTX-IMPL.md!text")).toEqual({
      form: "verbatim",
      key: "file:CTX-IMPL.md",
      facet: "text",
    });
    expect(parseHandle("[f4a7c2]")).toEqual({ form: "short", key: "f4a7c2", facet: undefined });
    expect(parseHandle("f4a7c2")).toEqual({ form: "short", key: "f4a7c2", facet: undefined });
  });

  test("garbage input parses to undefined (guidance, not throw — G-3)", () => {
    expect(parseHandle("file:x!nosuchfacet")).toBeUndefined();
    expect(parseHandle("F4A7")).toBeUndefined(); // too short / wrong case
    expect(parseHandle("!!")).toBeUndefined();
  });

  test("printShortHandle wraps in brackets", () => {
    expect(printShortHandle("f4a7c2")).toBe("[f4a7c2]");
  });
});
