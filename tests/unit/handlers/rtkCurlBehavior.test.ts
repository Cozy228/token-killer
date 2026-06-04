import { describe, expect, test } from "vitest";

import { expectRtkParity, filterRtkFixture } from "../../helpers/rtkCommandHarness.js";

describe("RTK curl behavior", () => {
  test("preserves large JSON bodies without truncation", async () => {
    const result = await filterRtkFixture(
      ["curl", "https://example.com/data"],
      "tests/fixtures/cloud/curl_large_json.json",
    );

    expectRtkParity(result, {
      critical: ['"status":"ok"', '"data":"aaaaaaaa'],
      forbidden: [/bytes total/, /\.\.\./],
      exact: result.rawOutput.trim(),
      maxOutputChars: result.rawOutput.trim().length,
    });
  });
});
