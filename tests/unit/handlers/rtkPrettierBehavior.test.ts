import { describe, expect, test } from "vitest";

import { expectRtkParity, filterRtkOutput } from "../../helpers/rtkCommandHarness.js";

// All inputs/expectations below mirror rtk/src/cmds/js/prettier_cmd.rs and its
// #[test] cases (filter_prettier_output). The TS handler is a faithful port.
describe("RTK prettier behavior", () => {
  // RTK: prettier_cmd.rs::test_filter_files_need_formatting
  test("lists files that need formatting under a summary + separator", async () => {
    const result = await filterRtkOutput(
      ["prettier", "--check", "src"],
      [
        "Checking formatting...",
        "src/components/ui/button.tsx",
        "src/lib/auth/session.ts",
        "src/pages/dashboard.tsx",
        "src/pages/settings.tsx",
        "src/lib/api/client.ts",
        "src/lib/api/routes.ts",
        "Code style issues found in the above file(s). Forgot to run Prettier?",
      ].join("\n"),
      1,
    );

    expectRtkParity(result, {
      critical: [
        "Prettier: 6 files need formatting",
        "button.tsx",
        "session.ts",
      ],
      forbidden: [
        // RTK strips the "Checking formatting..." chatter and the trailing hint.
        /Checking formatting/,
        /Forgot to run Prettier/,
        /Code style issues/,
        // RTK has NO "Run `prettier --write` to fix" footer.
        /prettier --write/,
      ],
      exact: [
        "Prettier: 6 files need formatting",
        "═══════════════════════════════════════",
        "1. src/components/ui/button.tsx",
        "2. src/lib/auth/session.ts",
        "3. src/pages/dashboard.tsx",
        "4. src/pages/settings.tsx",
        "5. src/lib/api/client.ts",
        "6. src/lib/api/routes.ts",
      ].join("\n"),
    });
  });

  // RTK: prettier_cmd.rs::test_filter_many_files — cap at CAP_WARNINGS (10) with
  // a "... +N more files" overflow marker.
  test("caps the listed files at 10 and reports the overflow", async () => {
    const lines = ["Checking formatting..."];
    for (let i = 0; i < 15; i += 1) {
      lines.push(`src/file${i}.ts`);
    }

    const result = await filterRtkOutput(
      ["prettier", "--check", "src"],
      lines.join("\n"),
      1,
    );

    expect(result.output).toContain("15 files need formatting");
    expect(result.output).toContain("... +5 more files");
    // Files past the cap must not be listed.
    expect(result.output).not.toContain("src/file10.ts");

    expectRtkParity(result, {
      critical: ["15 files need formatting", "... +5 more files"],
      forbidden: [/Checking formatting/, /11\. /],
      exact: [
        "Prettier: 15 files need formatting",
        "═══════════════════════════════════════",
        "1. src/file0.ts",
        "2. src/file1.ts",
        "3. src/file2.ts",
        "4. src/file3.ts",
        "5. src/file4.ts",
        "6. src/file5.ts",
        "7. src/file6.ts",
        "8. src/file7.ts",
        "9. src/file8.ts",
        "10. src/file9.ts",
        "",
        "... +5 more files",
      ].join("\n"),
    });
  });

  // RTK: prettier_cmd.rs::filter_prettier_output — when "All matched files use
  // Prettier" carries a leading count, report how many were already formatted.
  // Long paths + a >10 file set keep the structural reformat clearly smaller than
  // raw (the cap drops files), so it stays a real compression rather than inflation.
  test("reports already-formatted count when a total is present", async () => {
    const files: string[] = [];
    for (let i = 0; i < 15; i += 1) {
      files.push(`src/components/features/dashboard/widgets/widget-${i}.tsx`);
    }

    const result = await filterRtkOutput(
      ["prettier", "--check", "src"],
      [
        "Checking formatting...",
        ...files,
        "40 All matched files use Prettier code style!",
      ].join("\n"),
      1,
    );

    expectRtkParity(result, {
      critical: [
        "Prettier: 15 files need formatting",
        "... +5 more files",
        // 40 total matched - 15 needing formatting = 25 already formatted.
        "25 files already formatted",
      ],
      forbidden: [/Checking formatting/, /All matched files use Prettier/],
      exact: [
        "Prettier: 15 files need formatting",
        "═══════════════════════════════════════",
        "1. src/components/features/dashboard/widgets/widget-0.tsx",
        "2. src/components/features/dashboard/widgets/widget-1.tsx",
        "3. src/components/features/dashboard/widgets/widget-2.tsx",
        "4. src/components/features/dashboard/widgets/widget-3.tsx",
        "5. src/components/features/dashboard/widgets/widget-4.tsx",
        "6. src/components/features/dashboard/widgets/widget-5.tsx",
        "7. src/components/features/dashboard/widgets/widget-6.tsx",
        "8. src/components/features/dashboard/widgets/widget-7.tsx",
        "9. src/components/features/dashboard/widgets/widget-8.tsx",
        "10. src/components/features/dashboard/widgets/widget-9.tsx",
        "",
        "... +5 more files",
        "",
        "25 files already formatted",
      ].join("\n"),
      minSavingsRatio: 0.2,
    });
  });

  // RTK: prettier_cmd.rs::test_filter_all_formatted
  test("collapses a clean check into a single status line", async () => {
    const result = await filterRtkOutput(
      ["prettier", "--check", "src"],
      [
        "Checking formatting...",
        "All matched files use Prettier code style!",
      ].join("\n"),
      0,
    );

    expectRtkParity(result, {
      critical: ["Prettier: All files formatted correctly"],
      forbidden: [/Checking formatting/],
      exact: "Prettier: All files formatted correctly",
    });
  });

  // RTK: prettier_cmd.rs::test_filter_empty_output (#221)
  test("treats empty output as an error, not 'all formatted'", async () => {
    const result = await filterRtkOutput(["prettier", "--check", "src"], "", 0);

    expectRtkParity(result, {
      critical: ["Error: prettier produced no output"],
      forbidden: [/All files formatted/],
      exact: "Error: prettier produced no output",
    });
  });

  // RTK: prettier_cmd.rs::test_filter_whitespace_only_output (#221)
  test("treats whitespace-only output as an error", async () => {
    const result = await filterRtkOutput(["prettier", "--check", "src"], "   \n\n  ", 0);

    expectRtkParity(result, {
      critical: ["Error: prettier produced no output"],
      forbidden: [/All files formatted/],
      exact: "Error: prettier produced no output",
    });
  });
});
