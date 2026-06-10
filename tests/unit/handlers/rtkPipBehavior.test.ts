import { describe, expect, test } from "vitest";

import { expectRtkParity, filterRtkOutput } from "../../helpers/rtkCommandHarness.js";

describe("RTK pip behavior", () => {
  test("summarizes installed packages from pip list", async () => {
    const result = await filterRtkOutput(
      ["pip", "list"],
      JSON.stringify([
        { name: "requests", version: "2.31.0" },
        { name: "pytest", version: "7.4.0" },
        { name: "ruff", version: "0.1.0" },
      ]),
    );

    expect(result.output).toContain("3 packages");
    expect(result.output).toContain("requests");
    expect(result.output).toContain("2.31.0");
    expect(result.output).toContain("pytest");
    expect(result.output).not.toMatch(/----------/);

    expectRtkParity(result, {
      critical: ["3 packages", "requests", "2.31.0", "pytest"],
      forbidden: [/----------/],
      exact: [
        "pip list: 3 packages",
        "═══════════════════════════════════════",
        "",
        "[P]",
        "  pytest (7.4.0)",
        "",
        "[R]",
        "  requests (2.31.0)",
        "  ruff (0.1.0)",
      ].join("\n"),
    });
  });

  // RTK: rtk/src/cmds/python/pip_cmd.rs::test_filter_pip_list_empty
  test("reports an empty environment", async () => {
    const result = await filterRtkOutput(["pip", "list"], "[]");
    expect(result.output).toContain("No packages installed");
  });

  // RTK: rtk/src/cmds/python/pip_cmd.rs::test_filter_pip_outdated_none
  test("reports an up-to-date environment for pip list --outdated", async () => {
    const result = await filterRtkOutput(["pip", "list", "--outdated"], "[]");
    expect(result.output).toContain("All packages up to date");
  });

  // RTK: rtk/src/cmds/python/pip_cmd.rs::test_filter_pip_outdated_some
  test("renders outdated packages as current → latest", async () => {
    const result = await filterRtkOutput(
      ["pip", "list", "--outdated"],
      JSON.stringify([
        { name: "requests", version: "2.31.0", latest_version: "2.32.0" },
        { name: "pytest", version: "7.4.0", latest_version: "8.0.0" },
      ]),
    );

    expect(result.output).toContain("2 packages");
    expect(result.output).toContain("requests (2.31.0 → 2.32.0)");
    expect(result.output).toContain("pytest (7.4.0 → 8.0.0)");
    expect(result.output).not.toMatch(/latest_version/);
  });

  // M20-pip regression: a large pip list must emit a declared omission (not revert
  // to raw via the base sniffer). The critical invariant is that no bare `+N more`
  // marker is emitted — those trip the sniffer and return 0% saved as "inflated".
  test("large pip list emits declared omission, not a bare +N more marker", async () => {
    // Build 60 packages across two letters so the per-letter cap would have fired.
    const packages = Array.from({ length: 60 }, (_, i) => ({
      name: `package-${i < 30 ? "a" : "b"}${i}`,
      version: "1.0.0",
    }));

    const result = await filterRtkOutput(["pip", "list"], JSON.stringify(packages));

    // No bare `+N more` marker — that's what caused the base-sniffer revert.
    expect(result.output).not.toMatch(/\.\.\. \+\d+ more/);

    // When it fits the budget (small enough), the full listing is used.
    // When it doesn't fit, an omission is declared (not a silent +N more).
    // Either way the output is not the raw JSON.
    expect(result.output).not.toContain('"name"');

    // The header must still be present.
    expect(result.output).toContain("60 packages");
  });

  test("large pip list fits budget and emits all packages without truncation", async () => {
    // 10 packages should be well within budget — emitted in full, no omission.
    const packages = Array.from({ length: 10 }, (_, i) => ({
      name: `requests-ext-${i}`,
      version: `1.${i}.0`,
    }));

    const result = await filterRtkOutput(["pip", "list"], JSON.stringify(packages));

    // No omission marker for small lists.
    expect(result.output).not.toMatch(/over budget/);
    // All names present.
    for (const pkg of packages) {
      expect(result.output).toContain(pkg.name);
    }
  });

  // RTK: pip_cmd.rs::filter_pip_outdated — the human table fallback must still render the
  // outdated "current → latest" shape, not a plain inventory listing.
  test("renders the outdated current → latest shape from a table fallback", async () => {
    const result = await filterRtkOutput(
      ["pip", "list", "--outdated"],
      [
        "Package  Version Latest Type",
        "-------- ------- ------ -----",
        "requests 2.31.0  2.32.0 wheel",
        "pytest   7.4.0   8.0.0  wheel",
      ].join("\n"),
      0,
    );

    expect(result.output).toContain("pip outdated: 2 packages");
    expect(result.output).toContain("requests (2.31.0 → 2.32.0)");
    expect(result.output).toContain("pytest (7.4.0 → 8.0.0)");
    expect(result.output).not.toMatch(/^pip list:/m);
  });
});
