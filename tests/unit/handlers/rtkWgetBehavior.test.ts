import { describe, expect, test } from "vitest";

import { expectRtkParity, filterRtkOutput } from "../../helpers/rtkCommandHarness.js";

describe("RTK wget behavior", () => {
  test("summarizes downloaded file and strips transfer progress", async () => {
    const result = await filterRtkOutput(
      ["wget", "-S", "https://example.com/file.tar.gz"],
      ["Saving to: 'file.tar.gz'", "100%[==================>] 2,097,152  1.00MB/s", "2026-06-04 saved [2097152/2097152]"].join("\n"),
    );

    expect(result.output).toContain("file.tar.gz");
    expect(result.output).toMatch(/2\.0MB|2 MB|2097152/);
    expect(result.output).not.toMatch(/====/);

    expectRtkParity(result, {
      critical: [
        "file.tar.gz",
      ],
      forbidden: [
        /====/,
      ],
      exact: "file.tar.gz 2.0MB",
    });
  });
});
