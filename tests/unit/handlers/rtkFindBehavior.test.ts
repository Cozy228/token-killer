import { describe, expect, test } from "vitest";

import {
  expectRtkParity,
  filterRtkFixture,
  filterRtkOutput,
} from "../../helpers/rtkCommandHarness.js";

describe("RTK find behavior", () => {
  // RTK: system/find_cmd.rs — group matched files by directory ("NF MD:" header +
  // "dir/ a b c" lines) instead of one path per line. All same-extension (.ts), so
  // no "ext:" summary line (RTK only prints it when >1 distinct extension).
  test("groups matched files by directory instead of dumping one path per line", async () => {
    const result = await filterRtkOutput(
      ["find", ".", "-name", "*.ts"],
      [
        "./src/cli.ts",
        "./src/parse.ts",
        "./src/core/history.ts",
        "./tests/unit/parse.test.ts",
      ].join("\n"),
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

  // ADR 0001 divergence: RTK caps the find listing at max_results (50) and prints
  // a `+18 more` overflow marker even though the directory-grouped form already
  // fits the budget. tk does NOT — the grouped listing for 68 files (header `68F
  // 2D:` + 2 directory lines) is ~520 chars, far under the 120-line / 12000-char
  // budget, so tk ships it IN FULL, losslessly, with NO fake `+N more` marker. The
  // real compression here is the directory grouping (68 one-path-per-line entries
  // become 2 dir lines), not a cap. Assert every file survives (file51..file60 are
  // present, not suppressed) and that no over-budget marker is invented.
  test("caps the grouped listing at the budget and reports +N more", async () => {
    const result = await filterRtkFixture(
      ["find", "src", "-name", "*.ts"],
      "tests/fixtures/common/find_overflow.txt",
    );

    expect(result.output).toContain("68F 2D:");
    expect(result.output).toContain("gen/ file01.ts");
    expect(result.output).toContain("file50.ts");
    // In-budget: nothing suppressed — the 51st and 60th files survive in full.
    expect(result.output).toContain("file51.ts");
    expect(result.output).toContain("file60.ts");
    // ADR 0001: no cap fired, so NO fake overflow marker.
    expect(result.output).not.toContain("+18 more");
    expect(result.output).not.toMatch(/\+\d+ more/);

    expectRtkParity(result, {
      critical: ["68F 2D:"],
      forbidden: [/\+\d+ more/],
      // Directory grouping still compresses the 1415-char raw listing by ~48%
      // (663 chars) — real, lossless savings without inventing a cap.
      minSavingsRatio: 0.4,
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
