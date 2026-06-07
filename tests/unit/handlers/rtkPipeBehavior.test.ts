import { describe, expect, test } from "vitest";

import { expectRtkParity, filterRtkOutput } from "../../helpers/rtkCommandHarness.js";

// RTK oracle: rtk/src/cmds/system/pipe_cmd.rs. `rtk pipe [filter]` runs a named or
// auto-detected filter over arbitrary piped output. In tk the command is
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

  // RTK: grep_wrapper caps shown matches at MAX_PIPE_MATCHES (CAP_WARNINGS = 10)
  // and emits a "+N" overflow marker for the remainder.
  test("grep filter caps matches per file at 10 with a +N overflow marker", async () => {
    // 1 file, 25 matches -> 10 shown + "+15".
    const result = await filterRtkOutput(["pipe", "grep"], grepDump(1, 25));

    expectRtkParity(result, {
      critical: ["25 matches in 1F:", "[file] src/cmds/module1/handler.rs (25):", "+15"],
    });
    // Only 10 of the 25 match lines are rendered (the rest collapsed into "+15").
    const renderedMatches = result.output.split("\n").filter((l) => /^\s{2,}\d+: /.test(l)).length;
    expect(renderedMatches).toBe(10);
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

  // ADR 0001 divergence: the `pipe` handler does NOT declare its omissions, so it
  // is subject to the undeclared-omission sniff (base.ts OMISSION_MARKERS). A
  // per-dir `+N` file-cap marker is a BARE count (no "more"), so it passes the
  // sniff and ships. But the dir-cap trailer `+N more dirs` matches the
  // `^\+\d+ more …$` marker shape, so when it fires the WHOLE listing is treated as
  // foreign omission and reverted to raw (passthrough) — RTK would always cap and
  // ship that trailer, tk deliberately fails safe to raw instead. So to exercise
  // the genuinely-shipping find compression, keep dirs at/under MAX_PIPE_DIRS (20)
  // and let only the per-file cap fire: every dir header renders, each over-cap dir
  // gets a bare `+N`, and there is NO `+N more dirs` trailer.
  test("find filter applies file and dir caps with overflow markers", async () => {
    // 20 dirs (== MAX_PIPE_DIRS, no dir overflow) * 14 files: file cap 10 -> "+4".
    const result = await filterRtkOutput(["pipe", "find"], findDump(20, 14));

    expectRtkParity(result, {
      critical: ["280 files in 20 dirs:", "+4"],
      // The dir-cap trailer would have reverted the whole listing to raw, so it
      // must NOT appear — the per-file cap is the only shipping omission.
      forbidden: [/\+\d+ more dirs/],
    });
    // All 20 dir headers render (no dir cap fired), and each over-cap dir collapses
    // its tail into a bare "+4" — real per-file compression that ships.
    const dirHeaders = result.output.split("\n").filter((l) => /^\.\/src.*\(\d+\)$/.test(l)).length;
    expect(dirHeaders).toBe(20);
    const fileOverflowMarkers = result.output.split("\n").filter((l) => /^\s*\+4$/.test(l)).length;
    expect(fileOverflowMarkers).toBe(20);
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

  // RTK: pipe_cmd.rs::test_grep_wrapper_token_savings — 200 matches across 10 files
  // (20/file -> 10 shown + truncation) must yield >= 40% whitespace-token savings.
  test("grep filter meets the RTK token-savings floor (>= 40%)", async () => {
    const result = await filterRtkOutput(["pipe", "grep"], grepDump(10, 20));

    expectRtkParity(result, {
      critical: ["200 matches in 10F:"],
      minTokenSavingsRatio: 0.4,
    });
  });

  // ADR 0001 divergence: RTK reaches its >= 40% find token-savings floor by firing
  // BOTH the dir cap (`+10 more dirs`) and the file cap. In tk the `+N more dirs`
  // trailer trips the undeclared-omission sniff and reverts the whole listing to
  // raw (0% savings), so that RTK shape cannot ship. tk reaches the SAME 40% floor
  // through the per-file cap alone: keep dirs at/under MAX_PIPE_DIRS (18) but stack
  // 25 files/dir so every dir collapses its tail into a bare `+15`. The grouped
  // listing then ships and the whitespace-token savings invariant still holds —
  // confirming tk genuinely compresses to the RTK floor without the reverted trailer.
  test("find filter meets the RTK token-savings floor (>= 40%)", async () => {
    const result = await filterRtkOutput(["pipe", "find"], findDump(18, 25));

    expectRtkParity(result, {
      critical: ["450 files in 18 dirs:"],
      forbidden: [/\+\d+ more dirs/],
      // tk's per-file cap alone clears the RTK 40% whitespace-token floor (~47%).
      minTokenSavingsRatio: 0.4,
    });
  });
});
