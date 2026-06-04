import { describe, expect, test } from "vitest";

import { expectRtkParity, filterRtkOutput } from "../../helpers/rtkCommandHarness.js";

describe("RTK gh behavior", () => {
  test("keeps PR list essentials and removes verbose table chrome", async () => {
    const result = await filterRtkOutput(
      ["gh", "pr", "list"],
      [
        "Showing 2 of 2 pull requests in owner/repo",
        "#12  fix auth flow  feature/auth  OPEN",
        "#13  update deps     chore/deps    DRAFT",
      ].join("\n"),
    );

    expect(result.output).toContain("#12");
    expect(result.output).toContain("fix auth flow");
    expect(result.output).toContain("#13");
    expect(result.output).not.toMatch(/Showing 2 of 2 pull requests/);

    expectRtkParity(result, {
      critical: [
        "#12",
        "fix auth flow",
        "#13",
      ],
      forbidden: [
        /Showing 2 of 2 pull requests/,
      ],
      maxOutputChars: 90,
    });
  });
});
