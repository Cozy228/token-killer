import { describe, expect, test } from "vitest";

import { buildRuffArgs } from "../../../src/handlers/python/ruff.js";
import { expectRtkParity, filterRtkOutput } from "../../helpers/rtkCommandHarness.js";

describe("RTK ruff behavior", () => {
  // RTK: ruff_cmd.rs::run — check-mode invocations are forced to emit JSON so the
  // filter can summarize them; `format`/`version` and explicit formats pass through.
  describe("buildRuffArgs command construction", () => {
    test("forces check --output-format=json and keeps the target", () => {
      expect(buildRuffArgs(["check", "src/handlers/index.ts"])).toEqual([
        "check",
        "--output-format=json",
        "src/handlers/index.ts",
      ]);
    });

    test("treats a bare invocation as check against '.'", () => {
      expect(buildRuffArgs([])).toEqual(["check", "--output-format=json", "."]);
    });

    test("does not force JSON for format or version", () => {
      expect(buildRuffArgs(["format", "--check"])).toEqual(["format", "--check"]);
      expect(buildRuffArgs(["version"])).toEqual(["version"]);
    });

    test("respects a user-supplied output format", () => {
      expect(buildRuffArgs(["check", "--output-format=github", "."])).toEqual([
        "check",
        "--output-format=github",
        ".",
      ]);
    });
  });

  // RTK: ruff_cmd.rs::MAX_VIOLATIONS — a noisy run is capped to keep the report
  // compact while still reporting the rule code + file:line for listed violations
  // and the suppressed remainder.
  test("caps a large JSON run and reports the suppressed remainder", async () => {
    const diagnostics = Array.from({ length: 200 }, (_, i) => ({
      filename: `/Users/dev/project/src/feature_${i}.py`,
      code: "F401",
      location: { row: i + 1, column: 4 },
      message: `\`module_${i}\` imported but unused`,
      fix: null,
    }));
    const result = await filterRtkOutput(["ruff", "check", "."], JSON.stringify(diagnostics), 1);

    const listed = result.output.split("\n").filter((l) => l.startsWith("- src/")).length;
    expect(listed).toBeLessThanOrEqual(50);
    expect(result.output).toContain("+150 more");
    expect(result.output).toContain("200 issues");
    // Rule code + file:line:col preserved on the listed violations.
    expect(result.output).toMatch(/F401: 200/);
    expect(result.output).toMatch(/- src\/feature_\d+\.py:\d+:4/);
    // The capped report is far smaller than the raw JSON it summarizes.
    expect(result.output.length).toBeLessThan(JSON.stringify(diagnostics).length / 3);
  });

  test("summarizes JSON violations with file, rule, fixable count", async () => {
    const result = await filterRtkOutput(
      ["ruff", "check", "."],
      JSON.stringify([
        { filename: "/repo/main.py", code: "F401", location: { row: 1, column: 8 }, message: "unused import", fix: { applicability: "safe" } },
        { filename: "/repo/utils.py", code: "E501", location: { row: 2, column: 1 }, message: "line too long" },
      ]),
      1,
    );

    expect(result.output).toContain("2 issues");
    expect(result.output).toContain("1 fixable");
    expect(result.output).toContain("F401");
    expect(result.output).toContain("main.py");
    expect(result.output).not.toMatch(/"filename"/);

    expectRtkParity(result, {
      critical: [
        "2 issues",
        "1 fixable",
        "F401",
        "main.py",
      ],
      forbidden: [
        /"filename"/,
      ],
      maxOutputChars: 220,
    });
  });
});
