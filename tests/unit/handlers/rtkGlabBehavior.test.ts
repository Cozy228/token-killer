import { describe, expect, test } from "vitest";

import { expectRtkParity, filterRtkOutput } from "../../helpers/rtkCommandHarness.js";

describe("RTK glab behavior", () => {
  test("keeps merge request essentials and removes list boilerplate", async () => {
    const result = await filterRtkOutput(
      ["glab", "mr", "list"],
      ["Showing 2 open merge requests", "!7 fix auth flow", "!8 update deps"].join("\n"),
    );

    expect(result.output).toContain("!7");
    expect(result.output).toContain("fix auth flow");
    expect(result.output).toContain("!8");
    expect(result.output).not.toMatch(/Showing 2 open merge requests/);

    expectRtkParity(result, {
      critical: [
        "!7",
        "fix auth flow",
        "!8",
      ],
      forbidden: [
        /Showing 2 open merge requests/,
      ],
      maxOutputChars: 60,
    });
  });
});
