import { describe, expect, test } from "vitest";
import {
  classifyMention,
  matchGlossary,
  parseMarkdown,
  slugify,
} from "../../src/extract/markdown.ts";

describe("markdown extractor (pure)", () => {
  test("frontmatter: parses key:value, ignores an unterminated block", () => {
    const p = parseMarkdown("---\nstatus: accepted\namends: 0002, 0005\n---\n# Title\nbody\n");
    expect(p.frontmatter.fields).toEqual({ status: "accepted", amends: "0002, 0005" });
    expect(p.frontmatter.lineSpan).toBe(4);
    // Headings/glossary start AFTER the frontmatter block.
    expect(p.headings[0]?.title).toBe("Title");

    const bad = parseMarkdown("---\nstatus: accepted\n# no closing fence\n");
    expect(bad.frontmatter.fields).toEqual({});
    expect(bad.frontmatter.lineSpan).toBe(0);
  });

  test("headings: slug chains + subtree spans", () => {
    const md = [
      "# Root",
      "a",
      "## Child One",
      "b",
      "### Grandchild",
      "c",
      "## Child Two",
      "d",
    ].join("\n");
    const p = parseMarkdown(md);
    const chains = p.headings.map((h) => h.slugChain);
    expect(chains).toEqual([
      "root",
      "root/child-one",
      "root/child-one/grandchild",
      "root/child-two",
    ]);
    // Root spans the whole doc (subtree = next heading of level <= 1 → none).
    expect(p.headings[0]).toMatchObject({ startLine: 1, endLine: 8 });
    // "Child One" ends the line before "Child Two" (next level<=2 heading).
    expect(p.headings[1]).toMatchObject({ startLine: 3, endLine: 6 });
    expect(p.headings[3]).toMatchObject({ startLine: 7, endLine: 8 });
  });

  test("glossary: both `**Term** — def` and inside-bold `**P20 — def**`; prose declined", () => {
    expect(matchGlossary("**Term** — a definition")).toEqual({
      term: "Term",
      definition: "a definition",
    });
    expect(matchGlossary("**P20 — Product name = `contexa`; CLI = `ctx`.**")).toEqual({
      term: "P20",
      definition: "Product name = `contexa`; CLI = `ctx`.",
    });
    expect(matchGlossary("- **Bullet** — listed def")).toEqual({
      term: "Bullet",
      definition: "listed def",
    });
    // A colon is not the definition separator — prose must not become a glossary entry.
    expect(matchGlossary("**Warning:** do not do this")).toBeUndefined();
    expect(matchGlossary("just **bold** in a sentence")).toBeUndefined();
  });

  test("mentions: path classification, token stripping, external/rev-qualified rejection", () => {
    expect(classifyMention("docs/a/b.md:618")).toMatchObject({
      token: "docs/a/b.md",
      kind: "path",
    });
    expect(classifyMention("D-language-coverage.md#slug")).toMatchObject({
      token: "D-language-coverage.md",
      kind: "path",
      ext: ".md",
    });
    expect(classifyMention("src/hook/copilot.ts")).toMatchObject({ kind: "path", ext: ".ts" });
    // Bare identifiers wait for M2 symbol-match — not a path.
    expect(classifyMention("assertNoEgress")).toMatchObject({ kind: "other" });
    expect(classifyMention("git status --short")?.kind).toBe("other");
    // Rev-qualified path carries a ':' → not a clean path token.
    expect(classifyMention("feat/1.0.0:docs/x.md")?.kind).toBe("other");
    // External roots are never path-match targets.
    expect(classifyMention("~/.claude/foo.md")?.kind).toBe("other");
    expect(classifyMention("/etc/passwd")?.kind).toBe("other");
    // A leading-dot extension mention (no filename) is not a file.
    expect(classifyMention(".scm")?.kind).toBe("other");
  });

  test("fenced code blocks: headings + mentions inside a fence are ignored", () => {
    const md = ["# Real", "```sh", "# not a heading", "cat `path/inside.md`", "```", "tail"].join(
      "\n",
    );
    const p = parseMarkdown(md);
    expect(p.headings.map((h) => h.title)).toEqual(["Real"]);
    expect(p.mentions).toHaveLength(0);
  });

  test("slugify: lowercase, punctuation dropped, spaces + em-dash collapsed", () => {
    expect(slugify("P20 — Product name = `contexa`; CLI = `ctx`")).toBe(
      "p20-product-name-contexa-cli-ctx",
    );
    expect(slugify("Hello, World!")).toBe("hello-world");
  });
});
