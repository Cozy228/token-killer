import { describe, expect, test } from "vitest";

import {
  expectRtkParity,
  filterRtkFixture,
  filterRtkOutput,
} from "../../helpers/rtkCommandHarness.js";

describe("RTK wc behavior", () => {
  // RTK: system/wc_cmd.rs::test_single_file_full — full mode labels counts and
  // drops the path.
  test("full mode strips path and labels counts", async () => {
    const result = await filterRtkFixture(
      ["wc", "src/main.ts"],
      "tests/fixtures/system/wc_single_file.txt",
    );

    expect(result.output).toContain("30L 96W 978B");
    expect(result.output).not.toMatch(/src\/main\.ts/);

    expectRtkParity(result, {
      critical: ["30L 96W 978B"],
      forbidden: [/src\/main\.ts/],
      exact: "30L 96W 978B",
    });
  });

  // RTK: test_single_file_lines_only — -l keeps only the line count.
  test("lines-only mode keeps a single number", async () => {
    const result = await filterRtkOutput(["wc", "-l", "src/main.ts"], "      30 src/main.ts\n");
    expectRtkParity(result, { critical: ["30"], exact: "30" });
  });

  // RTK: test_multi_file_full — compact table with common prefix stripped + Σ total.
  test("multi-file full mode strips common prefix and totals with Σ", async () => {
    const result = await filterRtkOutput(
      ["wc", "src/main.rs", "src/lib.rs"],
      [
        "      30      96     978 src/main.rs",
        "      50     120    1500 src/lib.rs",
        "      80     216    2478 total",
      ].join("\n"),
    );
    expectRtkParity(result, {
      critical: ["30L 96W 978B main.rs", "50L 120W 1500B lib.rs", "Σ 80L 216W 2478B"],
      forbidden: [/src\/main\.rs/],
      exact: ["30L 96W 978B main.rs", "50L 120W 1500B lib.rs", "Σ 80L 216W 2478B"].join("\n"),
    });
  });

  // RTK: test_multi_file_lines — single-column table with Σ.
  test("multi-file lines mode keeps counts with stripped names", async () => {
    const result = await filterRtkOutput(
      ["wc", "-l", "src/main.rs", "src/lib.rs"],
      ["      30 src/main.rs", "      50 src/lib.rs", "      80 total"].join("\n"),
    );
    expectRtkParity(result, {
      critical: ["30 main.rs", "50 lib.rs", "Σ 80"],
      exact: ["30 main.rs", "50 lib.rs", "Σ 80"].join("\n"),
    });
  });

  // RTK: test_stdin_full — no path operand, counts still labelled.
  test("stdin full mode labels counts", async () => {
    const result = await filterRtkOutput(["wc"], "      30      96     978\n");
    expectRtkParity(result, { critical: ["30L 96W 978B"], exact: "30L 96W 978B" });
  });
});
