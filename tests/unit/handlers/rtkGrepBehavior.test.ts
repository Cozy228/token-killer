import { describe, expect, test } from "vitest";

import {
  expectRtkParity,
  filterRtkFixture,
  filterRtkOutput,
} from "../../helpers/rtkCommandHarness.js";
import {
  cleanLine,
  compactPath,
  groupGrepOutput,
  hasFormatFlag,
  parseMatchLine,
} from "../../../src/handlers/common/grepFilter.js";
import { buildGrepArgs } from "../../../src/handlers/common/searchLike.js";
import { parseLevel, stripLevelFlags } from "../../../src/handlers/common/level.js";

describe("RTK grep command construction", () => {
  // RTK: grep_cmd.rs::run — RTK searches with `-nH` so output is `file:line:content`.
  // tk forces `-n -H` on grep invocations so a raw `grep -r` (no line numbers) can
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

  // An agent that already typed -n/-H (or their long forms) must not get them
  // re-prepended — that produced the cosmetic `grep -n -H -n -H -r …` doubling seen
  // in dogfood history. Only the MISSING shape flags are injected.
  test("does not double -n/-H the user already passed", () => {
    expect(buildGrepArgs("grep", ["-n", "-H", "-r", "the", "docs/"])).toEqual([
      "-n",
      "-H",
      "-r",
      "the",
      "docs/",
    ]);
    expect(buildGrepArgs("grep", ["-n", "-r", "the", "docs/"])).toEqual([
      "-H",
      "-n",
      "-r",
      "the",
      "docs/",
    ]);
    expect(buildGrepArgs("rg", ["-n", "-H", "--no-heading", "export", "src/"])).toEqual([
      "-n",
      "-H",
      "--no-heading",
      "export",
      "src/",
    ]);
    // Long-form aliases also suppress the short-flag injection.
    expect(buildGrepArgs("grep", ["--line-number", "--with-filename", "-r", "x", "src/"])).toEqual([
      "--line-number",
      "--with-filename",
      "-r",
      "x",
      "src/",
    ]);
  });

  // Piped to a non-TTY, rg OMITS line numbers by default, so its raw output is
  // unparseable and falls back to passthrough (0% saved). Forcing -n -H
  // --no-heading restores `file:line:content` — parity with RTK's real behavior
  // (grep_cmd.rs re-invokes the search itself). tk does NOT add --no-ignore-vcs
  // (deliberate divergence — see docs/align-rtk-divergences.md).
  test("forces -n -H --no-heading so rg output is groupable", () => {
    expect(buildGrepArgs("rg", ["export", "src/"])).toEqual([
      "-n",
      "-H",
      "--no-heading",
      "export",
      "src/",
    ]);
  });

  test("strips --level before invoking the real binary", () => {
    expect(buildGrepArgs("rg", ["--level", "minimal", "export", "src/"])).toEqual([
      "-n",
      "-H",
      "--no-heading",
      "export",
      "src/",
    ]);
    expect(buildGrepArgs("grep", ["--level=balanced", "-r", "import", "src/"])).toEqual([
      "-n",
      "-H",
      "-r",
      "import",
      "src/",
    ]);
  });

  test("leaves context-flag invocations untouched (no rewrite, no grouping)", () => {
    expect(buildGrepArgs("rg", ["-A", "2", "export", "src/"])).toEqual([
      "-A",
      "2",
      "export",
      "src/",
    ]);
    expect(buildGrepArgs("rg", ["-C3", "export", "src/"])).toEqual(["-C3", "export", "src/"]);
  });

  // --level none is the verbatim opt-out (= --raw): run the ORIGINAL command, do
  // NOT inject -n/-H, so the passthrough output has no line numbers the raw
  // invocation never produced.
  test("does not inject -n/-H when --level none (verbatim opt-out)", () => {
    expect(buildGrepArgs("rg", ["--level", "none", "needle", "src"])).toEqual(["needle", "src"]);
    expect(buildGrepArgs("grep", ["--level=none", "-r", "needle", "src"])).toEqual([
      "-r",
      "needle",
      "src",
    ]);
  });

  // `--` ends option parsing: a literal `--level` pattern (and its neighbours)
  // must survive into the rewritten command, never be stripped as the dial.
  test("preserves a literal --level pattern after -- (no arg drop)", () => {
    expect(buildGrepArgs("rg", ["--", "--level", "src"])).toEqual([
      "-n",
      "-H",
      "--no-heading",
      "--",
      "--level",
      "src",
    ]);
  });

  test("leaves format-flag rg invocations untouched", () => {
    expect(buildGrepArgs("rg", ["-c", "export", "src/"])).toEqual(["-c", "export", "src/"]);
    expect(buildGrepArgs("rg", ["--json", "export", "src/"])).toEqual(["--json", "export", "src/"]);
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

  // --- Compression: default path groups by file, losslessly, under the cap ---

  // 24 matches across 2 files (12 each — under the per-file cap of 25) with long
  // lines, so the by-file grouping is a genuine shrink and ships.
  const underCapMatches = () => {
    const lines: string[] = [];
    for (let f = 0; f < 2; f += 1) {
      for (let i = 1; i <= 12; i += 1) {
        lines.push(
          `src/order/file${f}.ts:${i}:    const result${i} = submitOrder(payload${i}); ${"x".repeat(120)}`,
        );
      }
    }
    return `${lines.join("\n")}\n`;
  };

  // ADR 0001 divergence: RTK always caps each file at grep_max_per_file (25) and
  // appends a `[+N more]` overflow marker. tk only caps OVER budget; below budget
  // it groups by file losslessly with NO `[+N more]`. (Over budget it now ships the
  // capped digest — searchLike declares the omission — see the over-budget test
  // below.) So this exercises the lossless grouped path: every match is kept,
  // grouped by file, and no overflow marker is invented.
  test("groups default matches by file losslessly under the cap", async () => {
    const result = await filterRtkOutput(["grep", "-rn", "submitOrder", "src"], underCapMatches());

    expect(result.output).toContain("24 matches in 2 files:");
    expect(result.output).toContain("src/order/file0.ts:1:");
    expect(result.output).toContain("src/order/file1.ts:12:");
    // Nothing suppressed below the cap, so no fake overflow marker.
    expect(result.output).not.toMatch(/\[\+\d+ more\]/);
    expect(result.output).not.toContain("# capped");

    expectRtkParity(result, {
      critical: ["24 matches in 2 files:"],
      forbidden: [/\[\+\d+ more\]/, /# capped/],
      // Long lines trimmed to ~80 chars + grouping: a genuine shrink below raw.
      minSavingsRatio: 0.4,
    });
  });

  // rg piped to a non-TTY omits line numbers; tk forces -nH so the SAME grouping
  // machinery compresses rg exactly like grep — lossless, no overflow marker.
  test("groups rg matches by file losslessly under the cap", async () => {
    const result = await filterRtkOutput(["rg", "submitOrder", "src"], underCapMatches());

    expect(result.output).toContain("24 matches in 2 files:");
    expect(result.output).toContain("src/order/file0.ts:1:");
    expect(result.output).not.toMatch(/\[\+\d+ more\]/);
  });
});

describe("RTK grep --level dial + lossless dedup", () => {
  // Layer 1 — identical-content lines collapse into one entry carrying every
  // line number (lossless: counts unchanged, all line numbers preserved).
  test("collapses identical lines into a line-number list", () => {
    const stdout = [
      "src/a.ts:5:import {X} from './x'",
      "src/a.ts:50:import {X} from './x'",
      "src/a.ts:88:import {X} from './x'",
    ].join("\n");
    const grouped = groupGrepOutput(stdout, "import");
    expect(grouped).toContain("3 matches in 1 files:");
    expect(grouped).toContain("src/a.ts:5,50,88:import {X} from './x'");
    // All three counted, nothing suppressed.
    expect(grouped).not.toContain("more]");
  });

  // --level minimal: caps disabled — every match kept (deduped), no overflow,
  // no recovery hint.
  test("minimal keeps every match with no cap and no recovery hint", async () => {
    const result = await filterRtkFixture(
      ["rg", "--level", "minimal", "submitOrder", "src"],
      "tests/fixtures/common/rg_overflow_matches.txt",
    );
    expect(result.output).toContain("src/order/submit.ts:67:");
    expect(result.output).not.toContain("[+");
    expect(result.output).not.toContain("# capped");
  });

  // balanced is the default level. Under the per-file / global cap, balanced groups
  // by file losslessly — no cap marker, no recovery hint.
  test("balanced groups by file losslessly under the cap (no cap marker)", async () => {
    const stdout = `${Array.from(
      { length: 18 },
      (_, i) =>
        `src/order/submit.ts:${i + 1}:    const handler${i} = submitOrder(payload${i}); ${"y".repeat(110)}`,
    ).join("\n")}\n`;
    const result = await filterRtkOutput(
      ["rg", "--level", "balanced", "submitOrder", "src"],
      stdout,
    );

    expect(result.output).toContain("18 matches in 1 files:");
    expect(result.output).toContain("src/order/submit.ts:18:");
    expect(result.output).not.toMatch(/\[\+\d+ more\]/);
    expect(result.output).not.toContain("# capped");
  });

  // Regression — the search-like 0%-savings bug. An OVER-budget balanced grep caps
  // matches and emits a `[+N more]` marker. That marker reads as an omission, so
  // before searchLike declared the reduction the gate sniffed it as UNDECLARED and
  // reverted the whole listing back to raw (0% saved). Now searchLike declares a
  // `digest`, so the capped group SHIPS COMPRESSED even under saveRaw:false (the
  // harness default) — recovery is re-execution (`tk --raw`), not a raw snapshot.
  test("over-budget balanced ships the capped digest, never reverts to raw", async () => {
    // 30 distinct-content matches in one file > the 25 per-file cap → `[+5 more]`.
    const stdout = `${Array.from(
      { length: 30 },
      (_, i) =>
        `src/order/submit.ts:${i + 1}:    const handler${i} = submitOrder(uniquePayload${i});`,
    ).join("\n")}\n`;
    const result = await filterRtkOutput(["grep", "-n", "-H", "submitOrder", "src"], stdout);

    expect(result.output).toMatch(/\[\+\d+ more\]/);
    expect(result.output).toContain("# capped");
    // The whole point: it did NOT fail open to the full raw listing.
    expect(result.output.trim()).not.toBe(stdout.trim());
    expect(result.output.length).toBeLessThan(stdout.length);
    expect(result.qualityStatus).toBe("passed");
  });

  // --level aggressive: per-file count + one sample line only.
  test("aggressive shows a per-file count and a single sample", async () => {
    const result = await filterRtkFixture(
      ["rg", "--level", "aggressive", "submitOrder", "src"],
      "tests/fixtures/common/rg_overflow_matches.txt",
    );
    expect(result.output).toContain("src/order/submit.ts: 67 matches");
    expect(result.output).toContain(
      "src/order/submit.ts:1:const handler1 = submitOrder(payload1);",
    );
    // Only the first sample — the 25th match is no longer shown.
    expect(result.output).not.toContain("src/order/submit.ts:25:");
    expect(result.output).toContain("# capped");
  });

  // --level none: explicit opt-out (= --raw) — verbatim passthrough.
  test("none passes the raw output through unchanged", async () => {
    const result = await filterRtkOutput(
      ["rg", "--level", "none", "submitOrder", "src"],
      "src/order/api.ts:88:return submitOrder(payload)\n",
    );
    expect(result.output.trim()).toBe("src/order/api.ts:88:return submitOrder(payload)");
    expect(result.output).not.toContain("matches in");
  });
});

describe("RTK grep retention guards (rg)", () => {
  // Context flags: the user asked for surrounding lines, so neither rewrite nor
  // group — pass through, with no dropped context lines and no inflated count.
  test("context-flag rg passes through unchanged (no grouping)", async () => {
    const stdout = [
      "src/a.ts:10:export const x = 1",
      "src/a.ts-11-const y = 2",
      "src/a.ts-12-const z = 3",
    ].join("\n");
    const result = await filterRtkOutput(["rg", "-A", "2", "export", "src/"], stdout);
    expect(result.output.trim()).toBe(stdout.trim());
    expect(result.output).not.toContain("more]");
    expect(result.output).not.toContain("matches in");
  });

  // Format-flag rg (-c) output is already small — pass through verbatim.
  test("format-flag rg passes through unchanged", async () => {
    const result = await filterRtkOutput(
      ["rg", "-c", "export", "src/"],
      "src/a.ts:3\nsrc/b.ts:1\n",
    );
    expect(result.output.trim()).toBe("src/a.ts:3\nsrc/b.ts:1");
  });

  // A non-parseable rg output (no -n line numbers) cannot be grouped — the
  // grouper signals passthrough rather than dropping content.
  test("non-parseable rg output falls back to passthrough", () => {
    const raw = "src/a.ts:export const x\nsrc/b.ts:export const y\n";
    expect(groupGrepOutput(raw, "export")).toBeNull();
  });

  // #3: a valued flag's argument (e.g. -g <glob>) must not be mistaken for the
  // search pattern, or cleanLine centers on the wrong word and head-truncates the
  // real match out of a long line.
  test("centers long lines on the real pattern, not a -g glob value", async () => {
    const longLine = `src/a.ts:1:${"x".repeat(90)} submitOrder(payload)`;
    const result = await filterRtkOutput(
      ["rg", "-g", "*.ts", "submitOrder", "src"],
      `${longLine}\n`,
    );
    expect(result.output).toContain("submitOrder");
  });
});

describe("RTK grep level/-- parsing (edge cases)", () => {
  // #2: `--` ends option parsing — a literal `--level` token after it is NOT the dial.
  test("parseLevel ignores --level after a -- delimiter", () => {
    expect(parseLevel(["--", "--level", "minimal", "src"], { fallback: "balanced" })).toBe(
      "balanced",
    );
    expect(parseLevel(["--level", "minimal", "src"], { fallback: "balanced" })).toBe("minimal");
  });

  test("stripLevelFlags preserves everything after -- verbatim", () => {
    expect(stripLevelFlags(["--", "--level", "src"])).toEqual(["--", "--level", "src"]);
    expect(stripLevelFlags(["--level", "minimal", "src"])).toEqual(["src"]);
  });

  // #4: aggressive emits TWO lines per file, so the global line budget (200) must
  // bind at ~100 files — otherwise aggressive prints more than balanced.
  test("aggregate caps the emitted-line budget across many files", () => {
    const lines: string[] = [];
    for (let i = 1; i <= 130; i += 1) lines.push(`src/f${i}.ts:1:match ${i}`);
    const grouped = groupGrepOutput(lines.join("\n"), "match", { aggregate: true, dedupe: true })!;
    const headers = grouped.split("\n").filter((l) => l.endsWith(": 1 matches"));
    expect(headers.length).toBeLessThanOrEqual(100);
    expect(grouped).toContain("[+30 more]");
  });
});

// --- Parser/helper unit dimensions (RTK grep_cmd.rs internal #[test]s) ---
//
// Architecture note: RTK parse_match_line keys off a NUL separator because RTK
// invokes rg with `-0`; tk filters the user's already-colon-separated output, so
// tk parses `file:line:content`. The RTK NUL-only cases (Windows drive paths,
// filenames containing `:digits:`) are specific to that NUL contract and do not
// apply to tk's colon input. The applicable invariants are ported below.
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

  // Windows drive path: the line-number anchor (`:\d+:`) splits on the first
  // colon followed by digits, so `C:` stays inside the file path.
  test("parses a Windows drive-letter path", () => {
    expect(parseMatchLine("C:\\src\\a.ts:12:export const x")).toEqual({
      file: "C:\\src\\a.ts",
      line: 12,
      content: "export const x",
    });
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
    const cleaned = cleanLine("  สวัสดีครับ นี่คือข้อความที่ยาวมากสำหรับทดสอบ  ", 20, "ครับ");
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
  // tk adaptation: lines that never parse (no -n line numbers) cannot be grouped,
  // so the grouper signals passthrough rather than dropping content.
  test("returns null when no line parses as a match", () => {
    const raw =
      "src/core/history.ts:export type Foo = {\nsrc/core/history.ts:export const bar = 1\n";
    expect(groupGrepOutput(raw, "export")).toBeNull();
  });
});
