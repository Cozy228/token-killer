import { describe, expect, test } from "vitest";

import { expectRtkParity, filterRtkFixture } from "../../helpers/rtkCommandHarness.js";

describe("RTK grep behavior", () => {
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
});
