import { describe, expect, test } from "vitest";

import { expectRtkParity, filterRtkFixture } from "../../helpers/rtkCommandHarness.js";

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
      critical: [
        "* main",
        "R  old.rs -> new.rs",
        "UU conflict.rs",
        "MM mixed.rs",
      ],
      forbidden: [
        /conflicts:/,
        /^Branch:/m,
        /^Modified:/m,
        /^Untracked:/m,
      ],
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
      critical: [
        "* main",
        "🎉-party.txt",
        "日本語ファイル.rs",
        "สวัสดี.txt",
      ],
      forbidden: [
        /^Branch:/m,
        /^Modified:/m,
        /^Untracked:/m,
      ],
      maxOutputChars: result.rawOutput.length,
    });
  });
});
