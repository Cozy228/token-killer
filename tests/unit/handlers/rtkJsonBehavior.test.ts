import { describe, expect, test } from "vitest";

import { expectRtkParity, filterRtkFixture } from "../../helpers/rtkCommandHarness.js";

describe("RTK json behavior", () => {
  test("compacts object keys and long values", async () => {
    const result = await filterRtkFixture(
      ["json", "package.json"],
      "tests/fixtures/system/json_package_response.json",
    );

    expect(result.output).toContain('name: "token-guard"');
    expect(result.output).toContain("dependencies:");
    expect(result.output).toContain('strip-ansi: "^7.2.0"');
    expect(result.output).toContain('["dist", "README.md", "LICENSE", "CHANGELOG.md", "docs"]');
    expect(result.output).not.toMatch(
      /"description": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/,
    );

    expectRtkParity(result, {
      critical: [
        'name: "token-guard"',
        "dependencies:",
        'strip-ansi: "^7.2.0"',
        '["dist", "README.md", "LICENSE", "CHANGELOG.md", "docs"]',
      ],
      forbidden: [
        /"description": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/,
      ],
      maxOutputChars: 260,
    });
  });
});
