import { describe, expect, test } from "vitest";

import { expectRtkParity, filterRtkFixture } from "../../helpers/rtkCommandHarness.js";
import {
  cleanLine,
  compactPath,
  groupGrepOutput,
  hasFormatFlag,
  parseMatchLine,
} from "../../../src/handlers/common/grepFilter.js";
import { buildGrepArgs } from "../../../src/handlers/common/searchLike.js";

describe("RTK grep command construction", () => {
  // RTK: grep_cmd.rs::run — RTK searches with `-nH` so output is `file:line:content`.
  // tg forces `-n -H` on grep invocations so a raw `grep -r` (no line numbers) can
  // be grouped instead of passed through verbatim.
  test("forces -n -H so grep output is groupable", () => {
    expect(buildGrepArgs("grep", ["-r", "import", "src/"])).toEqual([
      "-n",
      "-H",
      "-r",
      "import",
      "src/",
    ]);
  });

  test("leaves format-flag grep invocations untouched", () => {
    expect(buildGrepArgs("grep", ["-c", "import", "src/"])).toEqual(["-c", "import", "src/"]);
    expect(buildGrepArgs("grep", ["-l", "import", "src/"])).toEqual(["-l", "import", "src/"]);
  });

  test("does not rewrite rg (line-numbered by default; -r means --replace)", () => {
    const args = ["export", "src/"];
    expect(buildGrepArgs("rg", args)).toBe(args);
  });
});

describe("RTK grep behavior", () => {
  // --- Retention: explicit format flags pass through (RTK has_format_flag) ---

  // RTK: grep_cmd.rs::test_format_flag_detects_files_without_match — -L output is
  // already small, so RTK prints it verbatim. Retention gate.
  test("respects explicit files-without-match format output", async () => {
    const result = await filterRtkFixture(
      ["grep", "-L", "import", "src/*.ts"],
      "tests/fixtures/common/grep_files_without_match.txt",
    );

    expectRtkParity(result, {
      critical: ["src/core/history.ts", "src/core/report.ts"],
      forbidden: [/Search:/, /Matches:/],
      exact: result.rawOutput.trim(),
      maxOutputChars: result.rawOutput.trim().length,
    });
  });

  // RTK: grep_cmd.rs::test_format_flag_detects_only_matching — -o passthrough.
  test("respects explicit only-matching format output", async () => {
    const result = await filterRtkFixture(
      ["grep", "-o", "import", "src/*.ts"],
      "tests/fixtures/common/grep_only_matching.txt",
    );

    expectRtkParity(result, {
      critical: ["import"],
      forbidden: [/Search:/, /Matches:/],
      exact: result.rawOutput.trim(),
      maxOutputChars: result.rawOutput.trim().length,
    });
  });

  // RTK: grep_cmd.rs::test_format_flag_detects_null — -Z passthrough.
  test("respects explicit null-delimited file-list output", async () => {
    const result = await filterRtkFixture(
      ["grep", "-Z", "-l", "import", "src/*.ts"],
      "tests/fixtures/common/grep_null_file_list.txt",
    );

    expectRtkParity(result, {
      critical: ["src/cli.ts", "src/router.ts"],
      forbidden: [/Search:/, /Matches:/],
      exact: result.rawOutput.trim(),
      maxOutputChars: result.rawOutput.trim().length,
    });
  });

  // --- Compression: default path groups by file with an uncapped overflow ---

  // RTK: grep_cmd.rs::run default path (lines 104-150) + test_grep_overflow_uses_
  // uncapped_total. 67 matches in one file exceed grep_max_per_file (25), so 25
  // are shown and the overflow reports the TRUE suppressed count (67-25=42), not
  // a capped number. This is the grep compression path that passthrough cannot gate.
  test("groups default matches by file and reports uncapped overflow", async () => {
    const result = await filterRtkFixture(
      ["grep", "-rn", "submitOrder", "src"],
      "tests/fixtures/common/rg_overflow_matches.txt",
    );

    expect(result.output).toContain("69 matches in 2 files:");
    expect(result.output).toContain("src/order/api.ts:88:return submitOrder(payload)");
    expect(result.output).toContain("src/order/submit.ts:25:");
    // per-file cap holds at 25 — the 26th match must be suppressed.
    expect(result.output).not.toContain("src/order/submit.ts:26:");
    // overflow = uncapped total (67) - shown for that file (25) = 42.
    expect(result.output).toContain("[+42 more]");

    expectRtkParity(result, {
      critical: ["69 matches in 2 files:", "[+42 more]"],
      // 4565 raw chars compress to ~1736; real cap below raw size.
      minSavingsRatio: 0.5,
      maxOutputChars: 2200,
    });
  });
});

// --- Parser/helper unit dimensions (RTK grep_cmd.rs internal #[test]s) ---
//
// Architecture note: RTK parse_match_line keys off a NUL separator because RTK
// invokes rg with `-0`; tg filters the user's already-colon-separated output, so
// tg parses `file:line:content`. The RTK NUL-only cases (Windows drive paths,
// filenames containing `:digits:`) are specific to that NUL contract and do not
// apply to tg's colon input. The applicable invariants are ported below.
describe("RTK grep parse_match_line (colon-adapted)", () => {
  // RTK: test_parse_match_line_simple
  test("parses a simple file:line:content line", () => {
    expect(parseMatchLine("file.php:10:use Foo\\Bar;")).toEqual({
      file: "file.php",
      line: 10,
      content: "use Foo\\Bar;",
    });
  });

  // RTK: test_parse_match_line_content_with_double_colon — the line-number anchor
  // keeps content colons (ClassRegistry::init) inside content, not a phantom file.
  test("keeps :: inside content", () => {
    const parsed = parseMatchLine(
      "shell.class.php:81:        $this->m = ClassRegistry::init('Collections.QueueProcess');",
    );
    expect(parsed?.file).toBe("shell.class.php");
    expect(parsed?.line).toBe(81);
    expect(parsed?.content).toContain("ClassRegistry::init");
  });

  // RTK: test_parse_match_line_empty_content
  test("parses empty content", () => {
    expect(parseMatchLine("file.rs:7:")).toEqual({ file: "file.rs", line: 7, content: "" });
  });

  // RTK: test_parse_match_line_malformed_returns_none — lines without a
  // line-number-anchored colon (context lines, no -n output) are not matches.
  test("returns null for non-match lines", () => {
    expect(parseMatchLine("not a match line")).toBeNull();
    expect(parseMatchLine("")).toBeNull();
    expect(parseMatchLine("src/core/history.ts:export type Foo = {")).toBeNull();
  });
});

describe("RTK grep clean_line", () => {
  // RTK: test_clean_line — trims leading whitespace and respects max_len.
  test("trims indentation and caps length", () => {
    const cleaned = cleanLine("            const result = someFunction();", 50, "result");
    expect(cleaned.startsWith(" ")).toBe(false);
    expect(cleaned.length).toBeLessThanOrEqual(50);
  });

  // RTK: test_clean_line_multibyte — never panics / empties on multibyte input.
  test("handles multibyte content without splitting characters", () => {
    const cleaned = cleanLine(
      "  สวัสดีครับ นี่คือข้อความที่ยาวมากสำหรับทดสอบ  ",
      20,
      "ครับ",
    );
    expect(cleaned.length).toBeGreaterThan(0);
  });

  // RTK: test_clean_line_emoji
  test("handles emoji content", () => {
    const cleaned = cleanLine("🎉🎊🎈🎁🎂🎄 some text 🎃🎆🎇✨", 15, "text");
    expect(cleaned.length).toBeGreaterThan(0);
  });
});

describe("RTK grep compact_path", () => {
  // RTK: test_compact_path — deep paths collapse to first/.../parent/name.
  test("compacts a deep path", () => {
    const compact = compactPath("/Users/patrick/dev/project/src/components/Button.tsx");
    expect(compact).toContain("...");
    expect(compact).toContain("Button.tsx");
  });

  test("leaves short paths untouched", () => {
    expect(compactPath("src/cli.ts")).toBe("src/cli.ts");
  });
});

describe("RTK grep has_format_flag", () => {
  // RTK: test_format_flag_detects_* (count / files-with / files-without / only / null)
  test("detects every format flag", () => {
    expect(hasFormatFlag(["-c"])).toBe(true);
    expect(hasFormatFlag(["--count"])).toBe(true);
    expect(hasFormatFlag(["-l"])).toBe(true);
    expect(hasFormatFlag(["--files-with-matches"])).toBe(true);
    expect(hasFormatFlag(["-L"])).toBe(true);
    expect(hasFormatFlag(["--files-without-match"])).toBe(true);
    expect(hasFormatFlag(["-o"])).toBe(true);
    expect(hasFormatFlag(["--only-matching"])).toBe(true);
    expect(hasFormatFlag(["-Z"])).toBe(true);
    expect(hasFormatFlag(["--null"])).toBe(true);
  });

  // RTK: test_format_flag_ignores_normal_flags
  test("ignores ordinary flags", () => {
    expect(hasFormatFlag(["-i", "-w", "-A", "3"])).toBe(false);
  });
});

describe("RTK grep groupGrepOutput fallback", () => {
  // tg adaptation: lines that never parse (no -n line numbers) cannot be grouped,
  // so the grouper signals passthrough rather than dropping content.
  test("returns null when no line parses as a match", () => {
    const raw = "src/core/history.ts:export type Foo = {\nsrc/core/history.ts:export const bar = 1\n";
    expect(groupGrepOutput(raw, "export")).toBeNull();
  });
});
