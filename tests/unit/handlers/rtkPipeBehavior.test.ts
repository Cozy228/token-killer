import { describe, expect, test } from "vitest";

import { expectRtkParity, filterRtkOutput } from "../../helpers/rtkCommandHarness.js";

// RTK oracle: rtk/src/cmds/system/pipe_cmd.rs. `rtk pipe [filter]` runs a named or
// auto-detected filter over arbitrary piped output. In ctx the command is
// `pipe <cmd> <args...>` and the filtered content is raw.stdout. Here args[0] is
// the explicit RTK filter name (resolve_filter), and absent/unknown names fall to
// auto_detect_filter. These tests mirror the locally-defined wrappers in
// pipe_cmd.rs (grep_wrapper, find_wrapper, auto_detect_filter, identity_filter)
// and the two *_token_savings invariants.

// Build a realistic grep/rg dump: `file:line:content` across many files/lines.
function grepDump(fileCount: number, linesPerFile: number): string {
  let input = "";
  for (let fileIdx = 1; fileIdx <= fileCount; fileIdx += 1) {
    for (let line = 1; line <= linesPerFile; line += 1) {
      input += `src/cmds/module${fileIdx}/handler.rs:${line * 10}:    let result = process_request(ctx, &payload).await?;\n`;
    }
  }
  return input;
}

// Build a realistic find/fd dump: file paths across many dirs.
function findDump(dirCount: number, filesPerDir: number): string {
  let input = "";
  for (let dir = 1; dir <= dirCount; dir += 1) {
    for (let file = 1; file <= filesPerDir; file += 1) {
      input += `./src/components/feature${dir}/sub_${dir}/component_${file}.tsx\n`;
    }
  }
  return input;
}

describe("RTK pipe behavior", () => {
  // RTK: pipe_cmd.rs::test_resolve_filter_grep + grep_wrapper. Named `grep` filter
  // groups matches by file under a "N matches in MF:" header.
  test("grep filter groups matches by file with a header", async () => {
    const result = await filterRtkOutput(["pipe", "grep"], grepDump(3, 4));

    expectRtkParity(result, {
      critical: [
        "12 matches in 3F:", // 3 files * 4 lines
        "[file] src/cmds/module1/handler.rs (4):",
        "  10: let result = process_request(ctx, &payload).await?;",
      ],
    });
  });

  // RTK: pipe_cmd.rs::test_resolve_filter_rg_alias — `rg` resolves to grep_wrapper.
  test("rg alias resolves to the same grep grouping", async () => {
    const result = await filterRtkOutput(["pipe", "rg"], grepDump(2, 3));

    expectRtkParity(result, {
      critical: ["6 matches in 2F:", "[file] src/cmds/module1/handler.rs (3):"],
    });
  });

  // ADR 0001 decision 2: RTK's per-file MAX_PIPE_MATCHES (10) cap + bare "+N"
  // overflow is REMOVED. Within budget every match renders — no cap marker.
  test("grep filter lists every match per file with no overflow marker", async () => {
    // 1 file, 25 matches -> all 25 rendered, no "+15".
    const result = await filterRtkOutput(["pipe", "grep"], grepDump(1, 25));

    expectRtkParity(result, {
      critical: ["25 matches in 1F:", "[file] src/cmds/module1/handler.rs (25):"],
      forbidden: [/^\s*\+\d+\s*$/m],
    });
    // All 25 match lines are rendered — nothing collapsed into a "+N" marker.
    const renderedMatches = result.output.split("\n").filter((l) => /^\s{2,}\d+: /.test(l)).length;
    expect(renderedMatches).toBe(25);
  });

  // RTK: pipe_cmd.rs::test_resolve_filter_find + find_wrapper. Named `find` filter
  // groups paths by directory under a "N files in M dirs:" header.
  test("find filter groups paths by directory with a header", async () => {
    const result = await filterRtkOutput(["pipe", "find"], findDump(2, 3));

    expectRtkParity(result, {
      critical: [
        "6 files in 2 dirs:", // 2 dirs * 3 files
        "./src/components/feature1/sub_1/  (3)",
        "component_1.tsx",
      ],
    });
  });

  // RTK: pipe_cmd.rs::test_resolve_filter_fd_alias — `fd` resolves to find_wrapper.
  test("fd alias resolves to the same find grouping", async () => {
    const result = await filterRtkOutput(["pipe", "fd"], findDump(3, 2));

    expectRtkParity(result, {
      critical: ["6 files in 3 dirs:", "./src/components/feature1/sub_1/  (2)"],
    });
  });

  // ADR 0001 decision 2: RTK's MAX_PIPE_DIRS (20) + per-dir MAX_PIPE_FILES (10) caps
  // and their "+N" / "+N more dirs" overflow markers are all REMOVED. Within budget
  // every dir header AND every file renders, with NO overflow marker of any shape.
  test("find filter lists every dir and file with no overflow markers", async () => {
    // 20 dirs * 14 files: all 20 dir headers + all 14 files/dir, no "+N", no "+N more dirs".
    const result = await filterRtkOutput(["pipe", "find"], findDump(20, 14));

    expectRtkParity(result, {
      critical: ["280 files in 20 dirs:"],
      // No overflow marker of any kind: neither the per-dir bare "+N" nor "+N more dirs".
      forbidden: [/\+\d+ more dirs/, /^\s*\+\d+\s*$/m],
    });
    // All 20 dir headers render, and each dir lists all 14 of its files (14 * 20 = 280).
    const dirHeaders = result.output.split("\n").filter((l) => /^\.\/src.*\(\d+\)$/.test(l)).length;
    expect(dirHeaders).toBe(20);
    const fileLines = result.output
      .split("\n")
      .filter((l) => /^ {2}component_\d+\.tsx$/.test(l)).length;
    expect(fileLines).toBe(280);
  });

  // RTK: pipe_cmd.rs::test_auto_detect_grep_format — with no filter name, content
  // sniffing routes grep-like `file:number:content` input to grep_wrapper.
  test("auto-detect routes grep-shaped input to the grep filter", async () => {
    const result = await filterRtkOutput(["pipe"], grepDump(3, 5));

    expectRtkParity(result, {
      critical: ["15 matches in 3F:", "[file] src/cmds/module1/handler.rs (5):"],
    });
  });

  // RTK: pipe_cmd.rs::test_auto_detect_find_paths / _absolute_paths — auto-detect
  // routes path-only input (>= 3 non-empty lines) to find_wrapper. Paths share a
  // deep common dir so grouping (one dir header) genuinely shrinks the dump.
  test("auto-detect routes path-only input to the find filter", async () => {
    const input =
      "./src/components/widgets/main.rs\n" +
      "./src/components/widgets/lib.rs\n" +
      "./src/components/widgets/mod.rs\n" +
      "./src/components/widgets/util.rs\n" +
      "./src/components/widgets/test.rs\n";
    const result = await filterRtkOutput(["pipe"], input);

    expectRtkParity(result, {
      critical: ["5 files in 1 dirs:", "./src/components/widgets/  (5)"],
      forbidden: [/matches in/],
    });
  });

  // RTK: pipe_cmd.rs::test_auto_detect_find_not_triggered_for_grep_output — input
  // with colons (grep shape) must NOT be treated as find output.
  test("auto-detect does not treat grep output as find output", async () => {
    const result = await filterRtkOutput(["pipe"], grepDump(1, 12));

    expect(result.output).not.toMatch(/files in/);
    expect(result.output).toContain("matches in");
  });

  // RTK: pipe_cmd.rs::test_grep_wrapper_token_savings — 200 matches across 10 files.
  // Over the token budget, the grep ladder ships the step-1 digest (per-file counts),
  // comfortably clearing the RTK >= 40% whitespace-token floor with NO cap marker.
  test("grep filter meets the RTK token-savings floor (>= 40%)", async () => {
    const result = await filterRtkOutput(["pipe", "grep"], grepDump(10, 20));

    expectRtkParity(result, {
      critical: ["200 matches in 10F:"],
      minTokenSavingsRatio: 0.4,
    });
  });

  // RTK: reaches its >= 40% find token-savings floor via caps. ADR 0001: ctx reaches
  // the SAME floor over budget through the step-1 digest (every dir + its file count,
  // filenames dropped) — no "+N more dirs" trailer, no revert, ~90% token savings.
  test("find filter meets the RTK token-savings floor (>= 40%)", async () => {
    const result = await filterRtkOutput(["pipe", "find"], findDump(18, 25));

    expectRtkParity(result, {
      critical: ["450 files in 18 dirs:"],
      forbidden: [/\+\d+ more dirs/],
      minTokenSavingsRatio: 0.4,
    });
  });
});
