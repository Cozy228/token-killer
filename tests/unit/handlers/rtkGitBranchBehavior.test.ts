import { describe, expect, test } from "vitest";

import { expectRtkParity, filterRtkOutput } from "../../helpers/rtkCommandHarness.js";

describe("RTK git branch behavior", () => {
  test("deduplicates remotes while preserving current and local branches", async () => {
    const result = await filterRtkOutput(
      ["git", "branch", "-a"],
      [
        "* main",
        "  develop",
        "  remotes/origin/main",
        "  remotes/origin/develop",
        "  remotes/origin/release/v2",
      ].join("\n"),
    );

    expect(result.output).toContain("* main");
    expect(result.output).toContain("develop");
    expect(result.output).toContain("release/v2");
    expect(result.output).not.toMatch(/remotes\/origin\/main/);

    expectRtkParity(result, {
      critical: [
        "* main",
        "develop",
        "release/v2",
      ],
      forbidden: [
        /remotes\/origin\/main/,
      ],
      // RTK: filter_branch_output — locals indented, remote-only branches grouped.
      exact: [
        "* main",
        "  develop",
        "  remote-only (1):",
        "    release/v2",
      ].join("\n"),
    });
  });
});
