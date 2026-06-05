import { describe, expect, test } from "vitest";

import { expectRtkParity, filterRtkOutput } from "../../helpers/rtkCommandHarness.js";

describe("RTK pnpm behavior", () => {
  test("groups dependency listing sections and strips tree characters", async () => {
    const result = await filterRtkOutput(
      ["pnpm", "list", "--depth=0"],
      [
        "dependencies:",
        "react@19.0.0",
        "devDependencies:",
        "eslint@9.0.0",
        "Legend: production dependency",
      ].join("\n"),
    );

    expect(result.output).toContain("[prod]");
    expect(result.output).toContain("react");
    expect(result.output).toContain("[dev]");
    expect(result.output).toContain("eslint");
    expect(result.output).not.toMatch(/Legend:/);
    expect(result.output).not.toMatch(/[├└│]/);

    expectRtkParity(result, {
      critical: [
        "[prod]",
        "react",
        "[dev]",
        "eslint",
      ],
      forbidden: [
        /Legend:/,
        /[├└│]/,
      ],
      exact: [
        "2 packages (1 prod / 1 dev)",
        "[prod]",
        "  react 19.0.0",
        "[dev]",
        "  eslint 9.0.0",
      ].join("\n"),
    });
  });

  // RTK: rtk/src/cmds/js/pnpm_cmd.rs::test_pnpm_list_parser_json
  test("parses pnpm list --json into grouped sections", async () => {
    const result = await filterRtkOutput(
      ["pnpm", "list", "--depth=0"],
      JSON.stringify([
        {
          name: "my-project",
          version: "1.0.0",
          dependencies: { express: { version: "4.18.2" } },
        },
      ]),
    );

    expect(result.output).toContain("[prod]");
    expect(result.output).toContain("express 4.18.2");
    expect(result.output).not.toMatch(/numTotal|"version"/);
  });

  // RTK: rtk/src/cmds/js/pnpm_cmd.rs::test_format_listing_cap_shows_hint_with_offset
  test("caps a section at 20 entries and shows the overflow count", async () => {
    const lines = ["dependencies:"];
    for (let i = 1; i <= 25; i += 1) lines.push(`dep${i}@1.0.0`);
    const result = await filterRtkOutput(["pnpm", "list", "--depth=0"], lines.join("\n"));

    expect(result.output).toContain("25 packages (25 prod / 0 dev)");
    expect(result.output).toContain("… +5 more");
    expect(result.output).not.toContain("dep25 1.0.0");
  });

  // RTK: rtk/src/cmds/js/pnpm_cmd.rs::test_format_listing_no_cap_when_prod_only
  test("shows every package without a cap for a --prod listing", async () => {
    const lines = ["dependencies:"];
    for (let i = 1; i <= 25; i += 1) lines.push(`dep${i}@1.0.0`);
    const result = await filterRtkOutput(["pnpm", "list", "--prod"], lines.join("\n"));

    expect(result.output).toContain("dep25 1.0.0");
    expect(result.output).not.toContain("… +");
    expect(result.output).not.toContain("[dev]");
  });

  // RTK: rtk/src/cmds/js/pnpm_cmd.rs::test_extract_list_text_tracks_dev_section
  test("tracks the dev section across a devDependencies header", async () => {
    const result = await filterRtkOutput(
      ["pnpm", "list", "--depth=0"],
      [
        "Legend: production dependency, optional only, dev only",
        "dependencies:",
        "react@18.0.0",
        "devDependencies:",
        "eslint@8.0.0",
      ].join("\n"),
    );

    expect(result.output).toContain("[prod]\n  react 18.0.0");
    expect(result.output).toContain("[dev]\n  eslint 8.0.0");
    expect(result.output).not.toMatch(/Legend:/);
  });
});
