import { describe, expect, test } from "vitest";

import { parseMarkdown } from "../../../src/context/parseMarkdown.js";

describe("context/parseMarkdown — frontmatter", () => {
  test("parses scalar, boolean, number, and flow-array frontmatter", () => {
    const md = [
      "---",
      "description: My prompt",
      "user-invocable: false",
      "max: 3",
      "tools: [read, search]",
      "---",
      "# Body",
      "text",
    ].join("\n");
    const p = parseMarkdown(md);
    expect(p.frontmatter.present).toBe(true);
    expect(p.frontmatter.malformed).toBe(false);
    expect(p.frontmatter.values.description).toBe("My prompt");
    expect(p.frontmatter.values["user-invocable"]).toBe(false);
    expect(p.frontmatter.values.max).toBe(3);
    expect(p.frontmatter.values.tools).toEqual(["read", "search"]);
    // Body begins on file line 7 (after closing fence on line 6).
    expect(p.body_start_line).toBe(7);
  });

  test("parses block-list frontmatter", () => {
    const md = ["---", "allowed-tools:", "  - Read", "  - Grep", "---", "body"].join("\n");
    const p = parseMarkdown(md);
    expect(p.frontmatter.values["allowed-tools"]).toEqual(["Read", "Grep"]);
  });

  test("unterminated frontmatter is malformed, not a crash", () => {
    const md = ["---", "description: oops", "# no closing fence"].join("\n");
    const p = parseMarkdown(md);
    expect(p.frontmatter.present).toBe(true);
    expect(p.frontmatter.malformed).toBe(true);
  });

  test("garbage top-level line marks malformed", () => {
    const md = ["---", "this is not yaml at all", "---", "body"].join("\n");
    const p = parseMarkdown(md);
    expect(p.frontmatter.malformed).toBe(true);
  });

  test("no frontmatter when file does not start with fence", () => {
    const p = parseMarkdown("# Title\nbody");
    expect(p.frontmatter.present).toBe(false);
    expect(p.body_start_line).toBe(1);
  });
});

describe("context/parseMarkdown — sections + line ranges", () => {
  test("splits headings and preserves 1-based line numbers", () => {
    const md = ["# A", "alpha", "## B", "beta", "## C", "gamma"].join("\n");
    const p = parseMarkdown(md);
    const headings = p.sections.map((s) => s.heading);
    expect(headings).toEqual(["A", "B", "C"]);
    const a = p.sections[0];
    expect(a.start_line).toBe(1);
    expect(a.end_line).toBe(2);
    const b = p.sections[1];
    expect(b.start_line).toBe(3);
  });

  test("headings inside code fences are not treated as sections", () => {
    const md = ["# Real", "```", "# fake heading", "```", "tail"].join("\n");
    const p = parseMarkdown(md);
    expect(p.sections.map((s) => s.heading)).toEqual(["Real"]);
  });

  test("line ranges remain stable with leading frontmatter", () => {
    const md = ["---", "x: 1", "---", "# H", "line"].join("\n");
    const p = parseMarkdown(md);
    expect(p.sections[0].heading).toBe("H");
    expect(p.sections[0].start_line).toBe(4);
  });
});
