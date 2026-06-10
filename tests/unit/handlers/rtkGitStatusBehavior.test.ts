import { describe, expect, test } from "vitest";

import {
  expectRtkParity,
  filterRtkFixture,
  filterRtkOutput,
} from "../../helpers/rtkCommandHarness.js";
import {
  buildStatusArgs,
  extractDetachedHead,
  extractStateHeader,
  filterStatusWithArgs,
  formatStatusOutput,
  usesCompactStatusPath,
} from "../../../src/handlers/git/status.js";

describe("RTK git status behavior", () => {
  test("preserves rename and conflict porcelain lines", async () => {
    const result = await filterRtkFixture(
      ["git", "status", "--short", "--branch"],
      "tests/fixtures/git/status_rename_conflict.txt",
    );

    expect(result.output).toContain("* main");
    expect(result.output).toContain("R  old.rs -> new.rs");
    expect(result.output).toContain("UU conflict.rs");
    expect(result.output).toContain("MM mixed.rs");
    expect(result.output).not.toMatch(/conflicts:/);
    expect(result.output).not.toMatch(/^Branch:/m);
    expect(result.output).not.toMatch(/^Modified:/m);
    expect(result.output).not.toMatch(/^Untracked:/m);

    expectRtkParity(result, {
      critical: ["* main", "R  old.rs -> new.rs", "UU conflict.rs", "MM mixed.rs"],
      forbidden: [/conflicts:/, /^Branch:/m, /^Modified:/m, /^Untracked:/m],
      maxOutputChars: result.rawOutput.length,
    });
  });

  test("preserves unicode and emoji paths", async () => {
    const result = await filterRtkFixture(
      ["git", "status", "--short", "--branch"],
      "tests/fixtures/git/status_unicode.txt",
    );

    expect(result.output).toContain("* main");
    expect(result.output).toContain("🎉-party.txt");
    expect(result.output).toContain("日本語ファイル.rs");
    expect(result.output).toContain("สวัสดี.txt");
    expect(result.output).not.toMatch(/^Branch:/m);
    expect(result.output).not.toMatch(/^Modified:/m);
    expect(result.output).not.toMatch(/^Untracked:/m);

    expectRtkParity(result, {
      critical: ["* main", "🎉-party.txt", "日本語ファイル.rs", "สวัสดี.txt"],
      forbidden: [/^Branch:/m, /^Modified:/m, /^Untracked:/m],
      maxOutputChars: result.rawOutput.length,
    });
  });

  // RTK: git/git.rs::test_uses_compact_status_path_for_branch_and_short_flags
  describe("compact-status routing (uses_compact_status_path)", () => {
    test("empty args and branch/short flag combos use the compact path", () => {
      expect(usesCompactStatusPath([])).toBe(true);
      expect(usesCompactStatusPath(["-b"])).toBe(true);
      expect(usesCompactStatusPath(["--branch"])).toBe(true);
      expect(usesCompactStatusPath(["-sb"])).toBe(true);
      expect(usesCompactStatusPath(["-bs"])).toBe(true);
      expect(usesCompactStatusPath(["-s", "-b"])).toBe(true);
      expect(usesCompactStatusPath(["--short", "--branch"])).toBe(true);
    });

    test("short-only / opaque flags fall through to the explicit path", () => {
      expect(usesCompactStatusPath(["-s"])).toBe(false);
      expect(usesCompactStatusPath(["--short"])).toBe(false);
      expect(usesCompactStatusPath(["--porcelain"])).toBe(false);
      expect(usesCompactStatusPath(["-uno"])).toBe(false);
    });
  });

  // RTK: git/git.rs::test_build_status_command_* — compact path forces
  // `status --porcelain -b`; incompatible args pass through verbatim.
  describe("child command construction (build_status_command)", () => {
    test("default compact path constructs --porcelain -b", () => {
      expect(buildStatusArgs([])).toEqual(["status", "--porcelain", "-b"]);
    });

    test("--short --branch is rewritten to --porcelain -b", () => {
      expect(buildStatusArgs(["--short", "--branch"])).toEqual(["status", "--porcelain", "-b"]);
    });

    test("incompatible args pass through verbatim", () => {
      expect(buildStatusArgs(["--porcelain", "-uno"])).toEqual(["status", "--porcelain", "-uno"]);
    });
  });

  // RTK: git/git.rs::test_format_status_output_*
  describe("format_status_output invariants", () => {
    test("clean tree keeps the upstream ref and adds the clean marker", () => {
      expect(formatStatusOutput("## main...origin/main\n")).toBe(
        "* main...origin/main\nclean — nothing to commit",
      );
    });

    test("empty porcelain is a clean working tree", () => {
      expect(formatStatusOutput("")).toBe("Clean working tree");
    });

    test("mixed changes keep raw porcelain XY codes, no section headers", () => {
      const result = formatStatusOutput(
        "## main\nM  staged.rs\n M modified.rs\nA  added.rs\n?? untracked.txt\n",
      );
      expect(result).toContain("* main");
      expect(result).toContain("M  staged.rs");
      expect(result).toContain(" M modified.rs");
      expect(result).toContain("A  added.rs");
      expect(result).toContain("?? untracked.txt");
      expect(result).not.toContain("Staged");
      expect(result).not.toContain("Modified");
      expect(result).not.toContain("Untracked");
    });

    test("nested untracked paths never collapse to a directory marker", () => {
      const result = formatStatusOutput("## main\n?? tmp/c.txt\n?? tmp/nested/d.txt\n");
      expect(result).toContain("?? tmp/c.txt");
      expect(result).toContain("?? tmp/nested/d.txt");
      expect(result.split("\n").every((line) => line !== "?? tmp/")).toBe(true);
    });

    test("every dirty file stays visible — no overflow markers", () => {
      let porcelain = "## main...origin/main\n";
      for (let i = 0; i < 25; i += 1) porcelain += `M  staged_file_${i}.rs\n`;
      const result = formatStatusOutput(porcelain);
      expect(result).toContain("staged_file_24.rs");
      expect(result.split("\n").length).toBe(26);
      expect(result).not.toContain("... +");
    });

    test("detached HEAD shows the explicit ref, not the opaque porcelain string", () => {
      const result = formatStatusOutput(
        "## HEAD (no branch)\n M src/main.rs\n",
        "HEAD detached at abc1234",
      );
      expect(result).toContain("HEAD detached at abc1234");
      expect(result).not.toContain("HEAD (no branch)");
    });
  });

  // RTK: git/git.rs::test_extract_state_header_* — porcelain -b drops git's
  // in-progress state block; recover a compact summary from the plain capture.
  describe("extract_state_header invariants", () => {
    test("clean tree has no state header", () => {
      expect(
        extractStateHeader(
          "On branch main\nYour branch is up to date with 'origin/main'.\n\nnothing to commit, working tree clean\n",
        ),
      ).toBeUndefined();
    });

    test("dirty tree without an operation has no state header", () => {
      expect(
        extractStateHeader(
          'On branch main\nChanges not staged for commit:\n  (use "git add <file>...")\n\tmodified:   src/main.rs\n\nno changes added to commit\n',
        ),
      ).toBeUndefined();
    });

    test.each([
      [
        "rebase in progress",
        "On branch feature\n\ninteractive rebase in progress; onto abc1234\nLast command done (1 command done):\n   edit abc123 msg\nNo commands remaining.\nYou are currently editing a commit while rebasing branch 'feature' on 'abc1234'.\n\nnothing to commit, working tree clean\n",
      ],
      [
        "merge in progress. unresolved conflicts",
        'On branch main\nYou have unmerged paths.\n  (fix conflicts and run "git commit")\n\nUnmerged paths:\n\tboth modified:   src/main.rs\n',
      ],
      [
        "merge in progress. no conflicts",
        'On branch main\n\nAll conflicts fixed but you are still merging.\n  (use "git commit" to conclude merge)\n\nChanges to be committed:\n\tmodified:   src/main.rs\n',
      ],
      [
        "cherry-pick in progress",
        "On branch main\n\nYou are currently cherry-picking commit abc1234.\n\nnothing to commit, working tree clean\n",
      ],
      [
        "revert in progress",
        "On branch main\n\nYou are currently reverting commit abc1234.\n\nnothing to commit, working tree clean\n",
      ],
      [
        "bisect in progress",
        "On branch main\n\nYou are currently bisecting, started from branch 'main'.\n\nnothing to commit, working tree clean\n",
      ],
      [
        "am session in progress",
        "On branch main\n\nYou are in the middle of an am session.\n\nnothing to commit, working tree clean\n",
      ],
      [
        "sparse checkout enabled",
        "On branch main\n\nYou are in a sparse checkout with 17% of tracked files present.\n\nnothing to commit, working tree clean\n",
      ],
    ])("detects %s", (expected, raw) => {
      expect(extractStateHeader(raw)).toBe(expected);
    });
  });

  // RTK: git/git.rs::test_extract_detached_head_*
  describe("extract_detached_head invariants", () => {
    test("returns the detached line when present", () => {
      expect(
        extractDetachedHead("HEAD detached at abc1234\nnothing to commit, working tree clean\n"),
      ).toBe("HEAD detached at abc1234");
    });

    test("returns undefined when on a branch", () => {
      expect(
        extractDetachedHead("On branch main\nnothing to commit, working tree clean\n"),
      ).toBeUndefined();
    });
  });

  // RTK: git/git.rs::test_filter_status_with_args*
  describe("filter_status_with_args invariants (explicit path)", () => {
    test("strips git hints but keeps the change lines", () => {
      const result = filterStatusWithArgs(
        'On branch main\nYour branch is up to date with \'origin/main\'.\n\nChanges not staged for commit:\n  (use "git add <file>..." to update what will be committed)\n  (use "git restore <file>..." to discard changes in working directory)\n\tmodified:   src/main.rs\n\nno changes added to commit (use "git add" and/or "git commit -a")\n',
      );
      expect(result).toContain("On branch main");
      expect(result).toContain("modified:   src/main.rs");
      expect(result).not.toMatch(/\(use "git/);
    });

    test("clean tree collapses to its one-line summary", () => {
      expect(filterStatusWithArgs("nothing to commit, working tree clean\n")).toContain(
        "nothing to commit",
      );
    });

    // RTK: git.rs::run_status explicit-args path — a failing `git status <bad
    // flag>` prints stderr and surfaces the raw (empty) stdout, never the minimal
    // filter's "ok". filterStatusWithArgs("") would collapse to "ok" and mask the
    // error, so the handler must surface the diagnostics on a non-zero exit.
    test("a failing explicit-args status surfaces stderr, not a misleading 'ok'", async () => {
      const stderr = "fatal: unrecognized argument: --definitely-not-a-real-flag\n";
      const result = await filterRtkOutput(
        ["git", "status", "--definitely-not-a-real-flag"],
        "",
        129,
        stderr,
      );

      expect(result.output).toContain("unrecognized argument");
      expect(result.output.trim()).not.toBe("ok");
    });
  });

  // C2-status regression: compact-path nonzero exits (index.lock, dubious ownership,
  // etc.) must return the raw stderr, NOT "Clean working tree".
  describe("C2-status: compact-path nonzero exit guard", () => {
    test("exit-128 with index.lock error surfaces stderr, not 'Clean working tree'", async () => {
      const stderr =
        "fatal: Unable to create '/repo/.git/index.lock': File exists.\n" +
        "Another git process seems to be running in this repository.\n";
      const result = await filterRtkOutput(["git", "status"], "", 128, stderr);

      expect(result.output).toContain("index.lock");
      expect(result.output).not.toContain("Clean working tree");
    });

    test("exit-128 with dubious ownership surfaces stderr, not 'Clean working tree'", async () => {
      const stderr =
        "fatal: detected dubious ownership in repository at '/repo'\n" +
        "To add an exception for this directory, call:\n" +
        "\tgit config --global --add safe.directory /repo\n";
      const result = await filterRtkOutput(["git", "status"], "", 128, stderr);

      expect(result.output).toContain("dubious ownership");
      expect(result.output).not.toContain("Clean working tree");
    });

    test("nonzero exit with 'not a git repository' still emits short summary", async () => {
      const result = await filterRtkOutput(
        ["git", "status"],
        "",
        128,
        "fatal: not a git repository (or any of the parent directories): .git\n",
      );

      expect(result.output).toContain("Not a git repository");
      expect(result.output).not.toContain("Clean working tree");
    });
  });
});
