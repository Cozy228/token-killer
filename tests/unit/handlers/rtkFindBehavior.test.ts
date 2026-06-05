import { describe, expect, test } from "vitest";

import { expectRtkParity, filterRtkFixture, filterRtkOutput } from "../../helpers/rtkCommandHarness.js";

describe("RTK find behavior", () => {
  // RTK: system/find_cmd.rs — group matched files by directory ("NF MD:" header +
  // "dir/ a b c" lines) instead of one path per line. All same-extension (.ts), so
  // no "ext:" summary line (RTK only prints it when >1 distinct extension).
  test("groups matched files by directory instead of dumping one path per line", async () => {
    const result = await filterRtkOutput(
      ["find", ".", "-name", "*.ts"],
      ["./src/cli.ts", "./src/parse.ts", "./src/core/history.ts", "./tests/unit/parse.test.ts"].join("\n"),
    );

    expect(result.output).toContain("4F");
    expect(result.output).toContain("src/");
    expect(result.output).toContain("cli.ts");
    expect(result.output).not.toMatch(/\.\/src\/cli\.ts\n\.\/src\/parse\.ts/);

    expectRtkParity(result, {
      critical: ["4F", "src/", "cli.ts"],
      forbidden: [/\.\/src\/cli\.ts\n\.\/src\/parse\.ts/],
      exact: [
        "4F 3D:",
        "",
        "src/ cli.ts parse.ts",
        "src/core/ history.ts",
        "tests/unit/ parse.test.ts",
      ].join("\n"),
    });
  });

  // RTK: find_cmd.rs:317-350 — beyond max_results (50) the listing fills the
  // budget across sorted dirs and reports the remainder as "+N more" using the
  // UNCAPPED total. This is the find compression path; passthrough cannot gate it.
  test("caps the grouped listing at the budget and reports +N more", async () => {
    const result = await filterRtkFixture(
      ["find", "src", "-name", "*.ts"],
      "tests/fixtures/common/find_overflow.txt",
    );

    expect(result.output).toContain("68F 2D:");
    expect(result.output).toContain("gen/ file01.ts");
    expect(result.output).toContain("file50.ts");
    // 51st file is over budget — suppressed.
    expect(result.output).not.toContain("file51.ts");
    // overflow = total (68) - shown (50) = 18.
    expect(result.output).toContain("+18 more");

    expectRtkParity(result, {
      critical: ["68F 2D:", "+18 more"],
      // 1415 raw chars compress to ~522; real cap below raw size.
      minSavingsRatio: 0.5,
      maxOutputChars: 700,
    });
  });

  // RTK: find_cmd.rs:280-289 — no matches collapses to "0 for '<pattern>'".
  test("reports the no-match form with the effective pattern", async () => {
    const result = await filterRtkOutput(["find", ".", "-name", "*.xyz_nonexistent"], "");

    expect(result.output.trim()).toBe("0 for '*.xyz_nonexistent'");
  });
});

// Architecture note: RTK's find REPLACES find — it walks the filesystem itself
// with its own glob_match / parse_find_args, so its glob_match_* and
// parse_native_find_* #[test]s cover that FS-walker. tk instead FILTERS the real
// find command's output (grouping + cap + overflow), so those walker internals do
// not exist in tk and are intentionally not ported as dead code. The tk-applicable
// dimensions (grouping, uncapped overflow, empty message) are covered above.
//
// SCOPE DECISION (user-confirmed): the glob_match / parse_native_find dimension is
// OUT-OF-SCOPE for tk — there is no tk-owned glob logic to test (GNU find does the
// matching). Authoritative record: docs/green-test-parity-audit.md → D2. This is a
// deliberate scope call, not an unwritten omission.
