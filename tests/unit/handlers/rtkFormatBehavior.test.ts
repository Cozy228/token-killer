import { describe, expect, test } from "vitest";

import { expectRtkParity, filterRtkOutput } from "../../helpers/rtkCommandHarness.js";

// RTK: system/format_cmd.rs — `format` is a dispatcher that detects a formatter
// from the first arg (prettier / black / ruff / biome) and routes raw output to
// the matching per-formatter filter. These tests faithfully mirror RTK's
// #[test] dimensions across the three filters the dispatcher actually formats.
describe("RTK format behavior", () => {
  // RTK: prettier delegation -> prettier_cmd::filter_prettier_output (check mode).
  // The dispatcher emits ONLY the summary + separator + numbered list. There is
  // NO "Run `prettier --write` to fix" hint (the prior test asserted a fabricated
  // line). Verified against format_cmd.rs::run + js/prettier_cmd.rs.
  test("prettier: summarizes files needing formatting without progress chatter", async () => {
    const result = await filterRtkOutput(
      ["format", "prettier"],
      [
        "Checking formatting...",
        "src/components/button.tsx",
        "src/state/session.ts",
        "src/utils/format-helpers.ts",
        "src/api/client.ts",
        "src/index.ts",
        "Code style issues found in the above file(s). Forgot to run Prettier? Run Prettier to fix.",
      ].join("\n"),
      1,
    );

    expect(result.output).not.toMatch(/Checking formatting/);
    expect(result.output).not.toMatch(/Run `prettier --write`/);

    expectRtkParity(result, {
      critical: ["5", "button.tsx", "session.ts"],
      forbidden: [/Checking formatting/, /Code style issues/, /Run `prettier --write`/],
      exact: [
        "Prettier: 5 files need formatting",
        "═══════════════════════════════════════",
        "1. src/components/button.tsx",
        "2. src/state/session.ts",
        "3. src/utils/format-helpers.ts",
        "4. src/api/client.ts",
        "5. src/index.ts",
      ].join("\n"),
    });
  });

  // RTK: format_cmd.rs::test_filter_black_needs_formatting — black delegation
  // (filter_black_output). Emits summary + separator + compacted numbered list +
  // "N files already formatted" + "[hint] Run `black .` to format these files".
  test("black: lists files needing reformat with hint", async () => {
    const result = await filterRtkOutput(
      ["format", "black"],
      [
        "would reformat: /Users/dev/project/src/main.py",
        "would reformat: /Users/dev/project/tests/test_utils.py",
        "would reformat: /Users/dev/project/src/models/user.py",
        "Oh no! 💥 💔 💥",
        "3 files would be reformatted, 12 files would be left unchanged.",
      ].join("\n"),
      1,
    );

    expectRtkParity(result, {
      critical: ["3 files need formatting", "main.py", "test_utils.py", "12 files already formatted"],
      forbidden: [/Oh no!/, /would reformat:/, /would be left unchanged/],
      exact: [
        "Format (black): 3 files need formatting",
        "═══════════════════════════════════════",
        "1. src/main.py",
        "2. tests/test_utils.py",
        "3. src/models/user.py",
        "",
        "12 files already formatted",
        "",
        "[hint] Run `black .` to format these files",
      ].join("\n"),
    });
  });

  // RTK: format_cmd.rs::test_filter_black_all_formatted — black clean path.
  // black --verbose emits one "would reformat / left unchanged" probe line per
  // file; RTK collapses that chatter to a single summary line.
  test("black: reports all formatted with checked count", async () => {
    const result = await filterRtkOutput(
      ["format", "black"],
      [
        "would parse src/main.py",
        "would parse src/models/user.py",
        "would parse src/handlers/parse.py",
        "would parse src/utils/format_helpers.py",
        "would parse tests/test_main.py",
        "would parse tests/test_user.py",
        "would parse tests/test_parse.py",
        "All done! ✨ 🍰 ✨",
        "42 files would be left unchanged.",
      ].join("\n"),
      0,
    );

    expectRtkParity(result, {
      critical: ["Format (black): All files formatted", "42 files checked"],
      forbidden: [/All done!/, /left unchanged/, /would parse/],
      exact: "Format (black): All files formatted (42 files checked)",
    });
  });

  // RTK: python/ruff_cmd.rs::test_filter_ruff_format_needs_formatting — ruff
  // delegation (filter_ruff_format). Emits summary + separator + compacted list +
  // "N files already formatted" + "[hint] Run `ruff format` to format these files".
  test("ruff: lists files needing reformat with hint", async () => {
    const result = await filterRtkOutput(
      ["format", "ruff"],
      [
        "Would reformat: /Users/dev/workspace/service/src/main.py",
        "Would reformat: /Users/dev/workspace/service/tests/test_utils.py",
        "Would reformat: /Users/dev/workspace/service/src/handlers/parse.py",
        "Would reformat: /Users/dev/workspace/service/src/handlers/render.py",
        "Would reformat: /Users/dev/workspace/service/src/models/user_account.py",
        "Would reformat: /Users/dev/workspace/service/src/utils/format_helpers.py",
        "Would reformat: /Users/dev/workspace/service/tests/integration/test_api_routes.py",
        "7 files would be reformatted, 20 files left unchanged",
      ].join("\n"),
      1,
    );

    expectRtkParity(result, {
      critical: ["7 files need formatting", "main.py", "test_utils.py", "20 files already formatted"],
      forbidden: [/Would reformat:/, /would be reformatted/],
      exact: [
        "Ruff format: 7 files need formatting",
        "═══════════════════════════════════════",
        "1. src/main.py",
        "2. tests/test_utils.py",
        "3. src/handlers/parse.py",
        "4. src/handlers/render.py",
        "5. src/models/user_account.py",
        "6. src/utils/format_helpers.py",
        "7. tests/integration/test_api_routes.py",
        "",
        "20 files already formatted",
        "",
        "[hint] Run `ruff format` to format these files",
      ].join("\n"),
    });
  });
});
