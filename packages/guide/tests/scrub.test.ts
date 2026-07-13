import { describe, expect, it } from "vitest";
import { buildCorpus, type ExtractInput } from "../tools/corpus-mapper.js";

function baseInput(filePath: string): ExtractInput {
  return {
    repo: "token-killer",
    sourceRevision: "abc123",
    generations: { code: 1, git: 1, docs: 1, memory: 1 },
    files: [{ id: `file:${filePath}`, locator: JSON.stringify({ t: "file", path: filePath }) }],
    symbols: [],
    contains: [],
    calls: [],
    imports: [],
    commits: [],
    allTouches: [],
    eventCommitIds: [],
    eventRange: { from: "aaaaaaa", to: "bbbbbbb" },
    eventLabel: "test",
    openConflictEntityIds: [],
    needsReviewAnchorEntityIds: [],
    disclosures: [],
  };
}

describe("extractor scrub guarantee", () => {
  it("throws when a file locator carries an absolute macOS path", () => {
    const input = baseInput("/Users/someone/repo/src/a.ts");
    expect(() => buildCorpus(input)).toThrow(/scrub violation/);
  });

  it("produces a corpus with no /Users/ substring for clean input", () => {
    const corpus = buildCorpus(baseInput("src/a.ts"));
    expect(JSON.stringify(corpus)).not.toContain("/Users/");
    expect(corpus.files[0].path).toBe("src/a.ts");
  });

  it("throws when a locator path is absolute even if it is not a home dir", () => {
    const input = baseInput("/opt/build/x.ts");
    // "/opt/..." is not one of the home patterns, but the absolute-path guard fires.
    expect(() => buildCorpus(input)).toThrow(/scrub violation/);
  });
});
