import { describe, expect, test } from "vitest";

import { expectRtkParity, filterRtkFixture } from "../../helpers/rtkCommandHarness.js";

describe("RTK wc behavior", () => {
  test("full mode strips path and labels counts", async () => {
    const result = await filterRtkFixture(
      ["wc", "src/main.ts"],
      "tests/fixtures/system/wc_single_file.txt",
    );

    expect(result.output).toContain("30L 96W 978B");
    expect(result.output).not.toMatch(/src\/main\.ts/);

    expectRtkParity(result, {
      critical: [
        "30L 96W 978B",
      ],
      forbidden: [
        /src\/main\.ts/,
      ],
      exact: "30L 96W 978B",
    });
  });
});
