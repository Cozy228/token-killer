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
      critical: ["Prettier: 6 files need formatting", "button.tsx", "session.ts"],
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

  // ADR 0001 decision 2: RTK's MAX_PRETTIER_FILES (10) cap + "... +N more files"
  // marker is REMOVED. Within budget tk lists EVERY file under the summary with NO
  // "+N more" marker — here 10 files, all listed, chatter stripped.
  test("lists every file with no fake overflow marker", async () => {
    const lines = ["Checking formatting..."];
    for (let i = 0; i < 10; i += 1) {
      lines.push(`src/file${i}.ts`);
    }
    // Prettier chatter that the handler strips (warn/error lines): padding it makes
    // the reshaped view a genuine shrink, so the inflation gate keeps the compressed
    // form instead of bouncing this small input back to raw.
    for (let i = 0; i < 30; i += 1) {
      lines.push(`[warn] src/file${i}.ts has code style issues that prettier would reformat`);
    }

    const result = await filterRtkOutput(["prettier", "--check", "src"], lines.join("\n"), 1);

    expect(result.output).toContain("10 files need formatting");
    // Every file is listed losslessly — including the 10th — and there is NO
    // fake "+N more" omission marker (the ADR 0001 divergence from RTK).
    expect(result.output).toContain("10. src/file9.ts");
    expect(result.output).not.toMatch(/\.\.\.\s*\+\d+\s+more/);

    expectRtkParity(result, {
      critical: ["10 files need formatting", "10. src/file9.ts"],
      forbidden: [/Checking formatting/, /\.\.\.\s*\+\d+\s+more/],
      exact: [
        "Prettier: 10 files need formatting",
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
      ].join("\n"),
    });
  });

  // ADR 0001 decision 2: 15 files — PAST RTK's old MAX_PRETTIER_FILES (10) cap. The
  // cap is gone, so every file lists (including the 11th–15th) with NO "... +N more"
  // marker and no revert-to-raw. (Chatter padding makes the reshape a real shrink.)
  test("lists every file past the old cap with no overflow marker", async () => {
    const lines = ["Checking formatting..."];
    for (let i = 0; i < 15; i += 1) lines.push(`src/file${i}.ts`);
    for (let i = 0; i < 30; i += 1) {
      lines.push(`[warn] src/file${i}.ts has code style issues that prettier would reformat`);
    }

    const result = await filterRtkOutput(["prettier", "--check", "src"], lines.join("\n"), 1);

    expect(result.output).toContain("15 files need formatting");
    expect(result.output).toContain("11. src/file10.ts");
    expect(result.output).toContain("15. src/file14.ts");
    expectRtkParity(result, {
      critical: ["15 files need formatting", "15. src/file14.ts"],
      forbidden: [/\.\.\.\s*\+\d+\s+more/],
      minSavingsRatio: 0.4,
    });
  });

  // ADR 0001 divergence: same non-ladder/undeclared-omission reasoning as above —
  // an over-cap run would carry "... +N more files" and be reverted to raw, so we
  // exercise the supported lossless path (<= 10 files-to-format). The point of
  // THIS test is the already-formatted accounting: "N All matched files" minus the
  // files needing formatting. 10 need formatting, 40 matched => 30 already.
  // Long paths keep the structural reshape genuinely smaller than the raw chatter.
  test("reports already-formatted count when a total is present", async () => {
    const files: string[] = [];
    for (let i = 0; i < 10; i += 1) {
      files.push(`src/components/features/dashboard/widgets/widget-${i}.tsx`);
    }

    // Strippable prettier chatter (warn lines) so the reshape is a real shrink.
    const noise: string[] = [];
    for (let i = 0; i < 30; i += 1) {
      noise.push(`[warn] widget-${i}.tsx has code style issues prettier would reformat`);
    }

    const result = await filterRtkOutput(
      ["prettier", "--check", "src"],
      [
        "Checking formatting...",
        ...files,
        ...noise,
        "40 All matched files use Prettier code style!",
      ].join("\n"),
      1,
    );

    expectRtkParity(result, {
      critical: [
        "Prettier: 10 files need formatting",
        // Every file listed losslessly, no fake overflow marker.
        "10. src/components/features/dashboard/widgets/widget-9.tsx",
        // 40 total matched - 10 needing formatting = 30 already formatted.
        "30 files already formatted",
      ],
      forbidden: [/Checking formatting/, /All matched files use Prettier/, /\.\.\.\s*\+\d+\s+more/],
      exact: [
        "Prettier: 10 files need formatting",
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
        "30 files already formatted",
      ].join("\n"),
      minSavingsRatio: 0.2,
    });
  });

  // RTK: prettier_cmd.rs::test_filter_all_formatted
  test("collapses a clean check into a single status line", async () => {
    const result = await filterRtkOutput(
      ["prettier", "--check", "src"],
      ["Checking formatting...", "All matched files use Prettier code style!"].join("\n"),
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
