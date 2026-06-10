import { describe, expect, test } from "vitest";

import { expectRtkParity, filterRtkFixture, filterRtkOutput } from "../../helpers/rtkCommandHarness.js";

describe("RTK tsc behavior", () => {
  // RTK: rtk/src/cmds/js/tsc_cmd.rs::test_filter_tsc_output — shares tsc_many.txt
  // with the product fixtureCase so both tracks assert the same compressed shape.
  test("groups TypeScript errors by file and replaces raw summary", async () => {
    const result = await filterRtkFixture(
      ["tsc", "--noEmit"],
      "tests/fixtures/js/tsc_many.txt",
      2,
    );

    expect(result.output).toContain("TypeScript: 12 errors in 6 files");
    expect(result.output).toContain("src/order/submit.ts (2 errors)");
    expect(result.output).toContain("src/components/Button.tsx (2 errors)");
    expect(result.output).toContain("L42: TS2322");
    expect(result.output).not.toMatch(/Found 12 errors/);

    // Compression proof: grouping shows each file path exactly once (as the
    // group header), not once per diagnostic. The raw dump repeats the path on
    // every line; submit.ts has 2 errors, so a single occurrence proves dedup.
    const submitOccurrences = result.output.split("src/order/submit.ts").length - 1;
    expect(submitOccurrences).toBe(1);

    expectRtkParity(result, {
      critical: [
        "TypeScript: 12 errors in 6 files",
        "Top codes:",
        "src/order/submit.ts (2 errors)",
        "L88: TS2339",
      ],
      forbidden: [
        /Found 12 errors/,
      ],
      // raw tsc_many.txt is 1234 trimmed chars; grouped+deduped output is ~1205.
      // Cap calibrated below raw so it actually gates the path-dedup compression
      // (was 1235 == raw, which only forbade growth and proved no compression).
      maxOutputChars: 1210,
    });
  });

  // RTK: rtk/src/cmds/js/tsc_cmd.rs::test_every_error_message_shown
  test("shows every error message individually, never collapsed", async () => {
    const result = await filterRtkOutput(
      ["tsc", "--noEmit"],
      [
        "src/api.ts(10,5): error TS2322: Type 'string' is not assignable to type 'number'.",
        "src/api.ts(20,5): error TS2322: Type 'boolean' is not assignable to type 'string'.",
        "src/api.ts(30,5): error TS2322: Type 'null' is not assignable to type 'object'.",
      ].join("\n"),
      1,
    );

    expect(result.output).toContain("Type 'string' is not assignable to type 'number'");
    expect(result.output).toContain("Type 'boolean' is not assignable to type 'string'");
    expect(result.output).toContain("Type 'null' is not assignable to type 'object'");
    expect(result.output).toContain("L10:");
    expect(result.output).toContain("L20:");
    expect(result.output).toContain("L30:");
  });

  // RTK: rtk/src/cmds/js/tsc_cmd.rs::test_continuation_lines_preserved
  test("preserves indented continuation context attached to its error", async () => {
    const result = await filterRtkOutput(
      ["tsc", "--noEmit"],
      [
        "src/app.tsx(10,3): error TS2322: Type '{ children: Element; }' is not assignable to type 'Props'.",
        "  Property 'children' does not exist on type 'Props'.",
        "src/app.tsx(20,5): error TS2345: Argument of type 'number' is not assignable to parameter of type 'string'.",
      ].join("\n"),
      1,
    );

    expect(result.output).toContain("Property 'children' does not exist on type 'Props'");
    expect(result.output).toContain("L10:");
    expect(result.output).toContain("L20:");
  });

  // RTK: rtk/src/cmds/js/tsc_cmd.rs::test_no_file_limit
  test("emits every file with no truncation limit", async () => {
    const lines: string[] = [];
    for (let i = 1; i <= 15; i += 1) {
      lines.push(`src/file${i}.ts(${i},1): error TS2322: Error in file ${i}.`);
    }
    const result = await filterRtkOutput(["tsc", "--noEmit"], lines.join("\n"), 1);

    expect(result.output).toContain("15 errors in 15 files");
    for (let i = 1; i <= 15; i += 1) {
      expect(result.output).toContain(`file${i}.ts`);
    }
  });

  // RTK: rtk/src/cmds/js/tsc_cmd.rs::test_filter_no_errors
  test("reports a clean run when tsc found zero errors", async () => {
    const result = await filterRtkOutput(
      ["tsc", "--noEmit"],
      "Found 0 errors. Watching for file changes.",
      0,
    );

    expect(result.output).toContain("No errors found");
    expect(result.output).not.toMatch(/Found 0 errors/);
  });
});
