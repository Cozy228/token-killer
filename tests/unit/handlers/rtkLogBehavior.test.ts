import { describe, expect, test } from "vitest";

import { expectRtkParity, filterRtkFixture } from "../../helpers/rtkCommandHarness.js";

describe("RTK log behavior", () => {
  test("summarizes repeated normalized errors", async () => {
    const result = await filterRtkFixture(
      ["log", "server.log"],
      "tests/fixtures/system/app_repeated.log",
    );

    expect(result.output).toContain("Log Summary");
    expect(result.output).toContain("[error] 2 errors");
    expect(result.output).toContain("[warn] 1 warnings");
    expect(result.output).toContain("[×2]");
    expect(result.output).not.toMatch(/id=123/);
    expect(result.output).not.toMatch(/id=456/);
    expect(result.output).not.toMatch(/\/tmp\/build\/a\.ts/);

    expectRtkParity(result, {
      critical: [
        "Log Summary",
        "[error] 2 errors",
        "[warn] 1 warnings",
        "[×2]",
      ],
      forbidden: [
        /id=123/,
        /id=456/,
        /\/tmp\/build\/a\.ts/,
      ],
      maxOutputChars: 220,
    });
  });
});
