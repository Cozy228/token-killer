import { describe, expect, test } from "vitest";

import { searchLikeHandler } from "../../../../src/handlers/common/searchLike.js";
import type { RawResult, TgOptions } from "../../../../src/types.js";

const options: TgOptions = {
  raw: false,
  stats: false,
  verbose: false,
  maxLines: 120,
  maxChars: 12000,
  saveRaw: false,
  cwd: process.cwd(),
};

function gr(command: string): string {
  return command;
}

/** Helper: build RawResult with stdout from an array of lines */
function rawFromLines(lines: string[], command = "rg pattern src"): RawResult {
  return {
    command,
    stdout: lines.join("\n"),
    stderr: "",
    exitCode: 0,
    durationMs: 1,
  };
}

/** Helper: call filter with the given program/args/raw */
async function filterWith(program: string, args: string[], raw: RawResult) {
  return searchLikeHandler.filter(
    raw,
    {
      program,
      args,
      original: [program, ...args],
      displayCommand: `${program} ${args.join(" ")}`,
    },
    options,
  );
}

// ============================================================================
// Existing test: large noisy output → high savings
// ============================================================================

describe("search-like handler", () => {
  test("groups matches by file and reports hidden matches", async () => {
    const lines = Array.from({ length: 160 }, (_, index) => {
      const file = index % 2 === 0 ? "src/order/submit.ts" : "src/order/api.ts";
      return `${file}:${index + 1}:export const submitOrder${index} = submitOrder(payload);`;
    });
    const raw: RawResult = {
      command: "rg submitOrder src",
      stdout: lines.join("\n"),
      stderr: "",
      exitCode: 0,
      durationMs: 1,
    };

    const result = await searchLikeHandler.filter(
      raw,
      {
        program: "rg",
        args: ["submitOrder", "src"],
        original: ["rg", "submitOrder", "src"],
        displayCommand: "rg submitOrder src",
      },
      options,
    );

    expect(result.handler).toBe("search-like");
    expect(result.output).toContain("Search: submitOrder");
    expect(result.output).toContain("src/order/submit.ts");
    expect(result.output).toContain("1|");
    expect(result.output).toContain("submitOrder");
    expect(result.output).toContain("Hidden:");
    expect(result.savingsPct).toBeGreaterThanOrEqual(80);
  });
});

// ============================================================================
// P0: grep format variants - the bugs found in the report
// ============================================================================

describe("search-like grep format variants", () => {
  // --------------------------------------------------------------------------
  // rg default format: file:LINE:content  (with line numbers)
  // --------------------------------------------------------------------------

  test("parses rg default format (file:line:content) and groups by file", async () => {
    const lines = [
      "src/a.ts:1:const x = 1;",
      "src/a.ts:5:function foo() {",
      "src/b.ts:3:export default class Bar {",
      "src/c.ts:10:return result;",
      "src/c.ts:20:type T = string;",
    ];
    const result = await filterWith(
      "rg",
      ["export", "src"],
      rawFromLines(lines),
    );

    expect(result.output).toContain("Search: export");
    expect(result.output).toContain("Matches: 5 across 3 files");
    // File grouping preserved
    expect(result.output).toContain("src/a.ts (2 matches");
    expect(result.output).toContain("src/b.ts (1 match");
    expect(result.output).toContain("src/c.ts (2 matches");
  });

  test("rg format: preserves actual match content", async () => {
    const lines = [
      "src/submit.ts:42:export async function submitOrder(payload: OrderPayload) {",
    ];
    const result = await filterWith(
      "rg",
      ["submitOrder", "src"],
      rawFromLines(lines),
    );

    expect(result.output).toContain("42| export async function submitOrder");
    expect(result.output).toContain("OrderPayload");
  });

  // --------------------------------------------------------------------------
  // grep -r format: file:content  (NO line numbers) — THE BUG
  // --------------------------------------------------------------------------

  test("parses grep -r output (file:content without line numbers)", async () => {
    const lines = [
      "src/a.ts:const x = 1;",
      "src/a.ts:function foo() {",
      "src/b.ts:export default class Bar {",
      "src/c.ts:return result;",
    ];
    const result = await filterWith(
      "grep",
      ["-r", "export", "src"],
      rawFromLines(lines),
    );

    // CRITICAL: should NOT show 0 matches — that's the data-loss bug
    expect(result.output).toContain("Matches: 4 across 3 files");
    expect(result.output).not.toContain("0 across 0 files");
    // Content should be present
    expect(result.output).toContain("const x = 1");
    expect(result.output).toContain("export default class Bar");
  });

  test("grep -r: handles realistic export search output", async () => {
    const lines = Array.from({ length: 56 }, (_, i) => {
      const files = [
        "src/core/history.ts",
        "src/core/pipeline.ts",
        "src/types.ts",
        "src/handlers/index.ts",
      ];
      const file = files[i % files.length]!;
      return `${file}:export ${i % 2 === 0 ? "function" : "type"} thing${i} = true;`;
    });
    const result = await filterWith(
      "grep",
      ["-r", "export", "src/"],
      rawFromLines(lines),
    );

    expect(result.output).toContain("Search: export");
    expect(result.output).toContain("Matches: 56 across 4 files");
    expect(result.output).toContain("src/core/history.ts");
    expect(result.output).not.toContain("0 across 0 files");
  });

  // --------------------------------------------------------------------------
  // grep -rn format: file:LINE:content  (with line numbers)
  // --------------------------------------------------------------------------

  test("parses grep -rn output (file:line:content with line numbers)", async () => {
    const lines = [
      "src/a.ts:1:const x = 1;",
      "src/a.ts:5:function foo() {",
      "src/b.ts:3:export default class Bar {",
    ];
    const result = await filterWith(
      "grep",
      ["-rn", "export", "src"],
      rawFromLines(lines),
    );

    expect(result.output).toContain("Matches: 3 across 2 files");
    expect(result.output).toContain("src/a.ts (2 matches");
    expect(result.output).toContain("1| const x = 1");
    expect(result.output).toContain("3| export default class Bar");
  });

  // --------------------------------------------------------------------------
  // NUL-separated format: rg --null  /  grep -Z
  // Reference: RTK's parse_match_line uses \0 as the separator
  // --------------------------------------------------------------------------

  test("parses rg --null output (file\\0line:content)", async () => {
    const lines = [
      `src/a.ts\x001:const x = 1;`,
      `src/b.ts\x003:export class Bar {`,
    ];
    const result = await filterWith(
      "rg",
      ["--null", "class", "src"],
      rawFromLines(lines),
    );

    expect(result.output).toContain("Matches: 2 across 2 files");
    expect(result.output).toContain("1| const x = 1");
    expect(result.output).not.toContain("0 across 0 files");
  });

  // --------------------------------------------------------------------------
  // Content with colons that shouldn't confuse parser
  // RTK: test_parse_match_line_content_with_double_colon
  // --------------------------------------------------------------------------

  test("handles content containing colons without confusing parser", async () => {
    // e.g., log lines like "debug: counter is :42:", or ClassRegistry::init
    const lines = [
      "src/log.ts:7:debug: counter is :42: now",
      "src/models.ts:81:$this->queue = ClassRegistry::init('QueueProcess');",
      "src/http.ts:15:http://localhost:3000/api/v1/health",
    ];
    const result = await filterWith(
      "rg",
      ["debug", "src"],
      rawFromLines(lines),
    );

    expect(result.output).toContain("Matches: 3 across 3 files");
    expect(result.output).toContain("counter is :42:");
    expect(result.output).toContain("ClassRegistry::init");
    expect(result.output).not.toContain("0 across 0 files");
  });

  // --------------------------------------------------------------------------
  // Content with colon in grep -r format (no line numbers) — compound test
  // --------------------------------------------------------------------------

  test("handles grep -r content with colons and no line numbers", async () => {
    const lines = [
      "src/config.ts:export const apiUrl = 'http://localhost:8080';",
      "src/config.ts:export const dbUrl = 'postgres://user:pass@host:5432/db';",
      "src/log.ts:logger.info('count:42, ratio:0.5');",
    ];
    const result = await filterWith(
      "grep",
      ["-r", "export", "src/"],
      rawFromLines(lines),
    );

    expect(result.output).toContain("Matches: 3 across 2 files");
    expect(result.output).toContain("localhost:8080");
    expect(result.output).not.toContain("0 across");
  });

  // --------------------------------------------------------------------------
  // Malformed / unparseable lines should be skipped gracefully (not crash)
  // RTK: test_parse_match_line_malformed_returns_none
  // --------------------------------------------------------------------------

  test("skips malformed lines without crashing or data loss", async () => {
    const lines = [
      "not a match line at all",
      "src/a.ts:1:valid match",
      "", // empty line
      "no colon here",
      "src/b.ts:3:another valid match",
    ];
    const result = await filterWith(
      "rg",
      ["valid", "src"],
      rawFromLines(lines),
    );

    // Should parse the 2 valid lines, skip the rest
    expect(result.output).toContain("Matches: 2 across 2 files");
    expect(result.output).toContain("valid match");
    expect(result.output).toContain("another valid match");
    expect(result.output).not.toContain("0 across 0 files");
  });

  // --------------------------------------------------------------------------
  // Empty content after separator
  // RTK: test_parse_match_line_empty_content
  // --------------------------------------------------------------------------

  test("handles lines with empty content after separator", async () => {
    const lines = ["src/a.ts:1:", "src/b.ts:3:valid content"];
    const result = await filterWith(
      "rg",
      ["pattern", "src"],
      rawFromLines(lines),
    );

    // Empty content line should be parsed but content empty
    // At minimum, not crash and not lose the valid line
    expect(result.output).toContain("valid content");
    expect(result.output).not.toContain("0 across 0 files");
  });

  // --------------------------------------------------------------------------
  // Empty output (no matches at all)
  // --------------------------------------------------------------------------

  test("handles zero total matches with descriptive message", async () => {
    const raw: RawResult = {
      command: "rg NoSuchPattern src",
      stdout: "",
      stderr: "",
      exitCode: 1,
      durationMs: 1,
    };

    const result = await filterWith("rg", ["NoSuchPattern", "src"], raw);

    expect(result.output).toContain("0 matches");
    expect(result.exitCode).toBe(1);
  });

  // --------------------------------------------------------------------------
  // stderr-only output (error case)
  // --------------------------------------------------------------------------

  test("handles stderr-only output preserving error message", async () => {
    const raw: RawResult = {
      command: "rg '[' src",
      stdout: "",
      stderr: "rg: regex parse error: unclosed character class",
      exitCode: 2,
      durationMs: 1,
    };

    const result = await filterWith("rg", ["[", "src"], raw);

    expect(result.output).toContain("regex parse error");
    expect(result.exitCode).toBe(2);
  });

  // --------------------------------------------------------------------------
  // Single file, all matches shown (no truncation)
  // --------------------------------------------------------------------------

  test("shows all matches when at the per-file limit of five", async () => {
    const lines = Array.from(
      { length: 5 },
      (_, i) => `src/single.ts:${i + 1}:match ${i}`,
    );
    const result = await filterWith(
      "rg",
      ["match", "src"],
      rawFromLines(lines),
    );

    expect(result.output).toContain("Matches: 5 across 1 files");
    expect(result.output).not.toContain("Hidden:");
  });

  test("hides matches beyond the per-file limit of five", async () => {
    const lines = Array.from(
      { length: 6 },
      (_, i) => `src/single.ts:${i + 1}:match ${i}`,
    );
    const result = await filterWith(
      "rg",
      ["match", "src"],
      rawFromLines(lines),
    );

    expect(result.output).toContain("Matches: 6 across 1 files");
    expect(result.output).toContain("Hidden:");
  });

  test("hides matches beyond the total limit of eighty", async () => {
    const lines = Array.from({ length: 81 }, (_, index) => {
      const file = index % 3 === 0 ? "src/a.ts" : index % 3 === 1 ? "src/b.ts" : "src/c.ts";
      return `${file}:${index + 1}:match ${index}`;
    });
    const result = await filterWith(
      "rg",
      ["match", "src"],
      rawFromLines(lines),
    );

    expect(result.output).toContain("Matches: 81 across 3 files");
    expect(result.output).toContain("Hidden:");
  });

  test("passes through fully unrecognized non-empty grep output", async () => {
    const raw: RawResult = {
      command: "grep -r pattern src",
      stdout: "plain text without any colon separator\n",
      stderr: "",
      exitCode: 0,
      durationMs: 1,
    };

    const result = await filterWith("grep", ["-r", "pattern", "src"], raw);

    expect(result.output).toContain("plain text without any colon separator");
    expect(result.output).not.toMatch(/0 across 0 files/);
    expect(result.output).not.toContain("Matches:");
  });
});

describe("search-like grep flag correctness", () => {
  test("passes through grep count output instead of treating counts as line numbers", async () => {
    const result = await filterWith(
      "grep",
      ["-c", "export", "src"],
      rawFromLines([
        "src/a.ts:2",
        "src/b.ts:0",
        "src/c.ts:12",
      ], "grep -c export src"),
    );

    expect(result.output).toContain("src/a.ts:2");
    expect(result.output).toContain("src/b.ts:0");
    expect(result.output).toContain("src/c.ts:12");
    expect(result.output).not.toContain("2|");
    expect(result.output).not.toContain("Matches: 3 across 3 files");
  });

  test("passes through files-with-matches output", async () => {
    const result = await filterWith(
      "grep",
      ["-l", "export", "src"],
      rawFromLines(["src/a.ts", "src/b.ts"], "grep -l export src"),
    );

    expect(result.output).toContain("src/a.ts");
    expect(result.output).toContain("src/b.ts");
    expect(result.output).not.toContain("0 matches");
    expect(result.output).not.toContain("Matches:");
  });

  test("passes through files-without-match output", async () => {
    const result = await filterWith(
      "grep",
      ["-L", "export", "src"],
      rawFromLines(["src/unused.ts", "src/legacy.ts"], "grep -L export src"),
    );

    expect(result.output).toContain("src/unused.ts");
    expect(result.output).toContain("src/legacy.ts");
    expect(result.output).not.toContain("Matches:");
  });

  test("keeps only-matching output visible", async () => {
    const result = await filterWith(
      "grep",
      ["-o", "Order[A-Za-z]*", "src/order.ts"],
      rawFromLines([
        "src/order.ts:OrderPayload",
        "src/order.ts:OrderResult",
      ], "grep -o Order[A-Za-z]* src/order.ts"),
    );

    expect(result.output).toContain("OrderPayload");
    expect(result.output).toContain("OrderResult");
    expect(result.output).not.toContain("0 matches");
  });

  test("documents BRE alternation should behave as one search expression", async () => {
    const result = await filterWith(
      "grep",
      [String.raw`fn foo\|pub.*bar`, "src"],
      rawFromLines([
        "src/lib.rs:10:fn foo() {}",
        "src/lib.rs:20:pub fn bar() {}",
      ], String.raw`grep fn foo\|pub.*bar src`),
    );

    expect(result.output).toContain(String.raw`Search: fn foo\|pub.*bar`);
    expect(result.output).toContain("fn foo() {}");
    expect(result.output).toContain("pub fn bar() {}");
  });

  test("parses NUL-separated Windows paths without treating drive colon as a separator", async () => {
    const result = await filterWith(
      "rg",
      ["--null", "main", "C:\\src"],
      rawFromLines([
        "C:\\src\\file.rs\x0042:fn main() {}",
      ], "rg --null main C:\\src"),
    );

    expect(result.output).toContain("C:\\src\\file.rs");
    expect(result.output).toContain("42| fn main() {}");
    expect(result.output).not.toContain("0 across 0 files");
  });
});
