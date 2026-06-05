import { describe, expect, test } from "vitest";

import { expectRtkParity, filterRtkOutput } from "../../helpers/rtkCommandHarness.js";
import { branchMode, buildBranchArgs } from "../../../src/handlers/git/branch.js";

// RTK: git.rs::run_branch command construction — only list mode is rewritten
// (`branch [-a] --no-color <args>`); show-current and write ops pass through.
// The migration harness only exercises filter(); these assert the execute()
// command-rewrite parity (and the mode dispatch that drives it) directly.
describe("RTK git branch command construction (buildBranchArgs)", () => {
  test("bare branch lists all with -a and --no-color", () => {
    expect(buildBranchArgs(["branch"])).toEqual(["branch", "-a", "--no-color"]);
  });
  test("a list flag scopes the listing, so -a is not added", () => {
    expect(buildBranchArgs(["branch", "-r"])).toEqual(["branch", "--no-color", "-r"]);
    expect(buildBranchArgs(["branch", "-a"])).toEqual(["branch", "--no-color", "-a"]);
  });
  test("write ops (delete/rename/create) pass through unchanged", () => {
    expect(buildBranchArgs(["branch", "-d", "feature"])).toEqual(["branch", "-d", "feature"]);
    expect(buildBranchArgs(["branch", "new-branch"])).toEqual(["branch", "new-branch"]);
    expect(buildBranchArgs(["branch", "-m", "old", "new"])).toEqual(["branch", "-m", "old", "new"]);
  });
  test("--show-current passes through unchanged", () => {
    expect(buildBranchArgs(["branch", "--show-current"])).toEqual(["branch", "--show-current"]);
  });
  test("a positional with a list flag stays in list mode (e.g. --contains <ref>)", () => {
    expect(buildBranchArgs(["branch", "--contains", "HEAD"])).toEqual([
      "branch",
      "--no-color",
      "--contains",
      "HEAD",
    ]);
  });
});

describe("RTK git branch mode dispatch (branchMode)", () => {
  test("classifies the three modes", () => {
    expect(branchMode([])).toBe("list");
    expect(branchMode(["-a"])).toBe("list");
    expect(branchMode(["--show-current"])).toBe("show-current");
    expect(branchMode(["-d", "x"])).toBe("write");
    expect(branchMode(["new-branch"])).toBe("write");
    // A positional alongside a list flag is a filtered listing, not a write.
    expect(branchMode(["--contains", "HEAD"])).toBe("list");
  });
});

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
