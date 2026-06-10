import { describe, expect, test } from "vitest";

import { limitChars, limitLines, limitOutput } from "../../../src/core/outputLimit.js";
import type { TkOptions } from "../../../src/types.js";

function opts(over: Partial<TkOptions> = {}): TkOptions {
  return {
    raw: false,
    stats: false,
    verbose: false,
    maxLines: Number.POSITIVE_INFINITY,
    maxChars: Number.POSITIVE_INFINITY,
    saveRaw: "auto",
    cwd: "/tmp",
    ...over,
  };
}

describe("output caps — H18 (--max-lines / --max-chars are real, opt-in)", () => {
  test("the default (Infinity) is a no-op — flags do nothing unless set", () => {
    const text = `${Array.from({ length: 50 }, (_, i) => `line ${i}`).join("\n")}\n`;
    expect(limitOutput(text, opts())).toBe(text);
  });

  test("--max-lines caps to N lines and names the flag", () => {
    const text = `${Array.from({ length: 10 }, (_, i) => `line ${i}`).join("\n")}\n`;
    const out = limitOutput(text, opts({ maxLines: 3 }));
    expect(out.split("\n").slice(0, 3)).toEqual(["line 0", "line 1", "line 2"]);
    expect(out).toContain("--max-lines");
    expect(out).toContain("3 of 10 lines");
    expect(out).not.toContain("line 9");
  });

  test("--max-chars caps to N chars and names the flag", () => {
    const text = "x".repeat(1000);
    const out = limitChars(text, 100);
    expect(out.startsWith("x".repeat(100))).toBe(true);
    expect(out).toContain("--max-chars");
    expect(out.includes("x".repeat(101))).toBe(false);
  });

  test("output under the limit is returned unchanged", () => {
    const text = "a\nb\nc\n";
    expect(limitLines(text, 10)).toBe(text);
    expect(limitOutput(text, opts({ maxLines: 10, maxChars: 100 }))).toBe(text);
  });
});
