import { describe, expect, test } from "vitest";

import { expectRtkParity, filterRtkOutput } from "../../helpers/rtkCommandHarness.js";

describe("RTK git push behavior", () => {
  test("drops progress phases but preserves remote and ref summary", async () => {
    const result = await filterRtkOutput(
      ["git", "push"],
      [
        "Enumerating objects: 42, done.",
        "Counting objects: 100% (42/42), done.",
        "Compressing objects: 100% (20/20), done.",
        "To https://github.com/foo/bar.git",
        "   abc1234..def5678  master -> master",
      ].join("\n"),
    );

    expect(result.output).toContain("To https://github.com/foo/bar.git");
    expect(result.output).toContain("master -> master");
    expect(result.output).not.toMatch(/Enumerating objects/);
    expect(result.output).not.toMatch(/Counting objects/);

    expectRtkParity(result, {
      critical: [
        "To https://github.com/foo/bar.git",
        "master -> master",
      ],
      forbidden: [
        /Enumerating objects/,
        /Counting objects/,
      ],
      exact: [
        "To https://github.com/foo/bar.git",
        "   abc1234..def5678  master -> master",
        "ok master",
      ].join("\n"),
    });
  });
});
