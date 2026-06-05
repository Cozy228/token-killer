import { describe, expect, test } from "vitest";

import { expectRtkParity, filterRtkFixture } from "../../helpers/rtkCommandHarness.js";

describe("RTK env behavior", () => {
  test("masks secrets and groups relevant variables", async () => {
    const result = await filterRtkFixture(["env"], "tests/fixtures/system/env_mixed.txt");

    expect(result.output).toContain("PATH Variables:");
    expect(result.output).toContain("PATH (5 entries):");
    expect(result.output).toContain("API_KEY=sk****et");
    expect(result.output).toContain("NODE_VERSION=22.0.0");
    expect(result.output).toContain("AWS_REGION=us-east-1");
    expect(result.output).not.toMatch(/fixture_api_secret/);

    expectRtkParity(result, {
      critical: [
        "PATH Variables:",
        "PATH (5 entries):",
        "API_KEY=sk****et",
        "NODE_VERSION=22.0.0",
        "AWS_REGION=us-east-1",
      ],
      forbidden: [
        /fixture_api_secret/,
      ],
      maxOutputChars: 320,
    });
  });
});
