import { describe, expect, test } from "vitest";

import { expectRtkParity, filterRtkOutput } from "../../helpers/rtkCommandHarness.js";

describe("RTK mypy behavior", () => {
  test("groups errors by file and preserves error codes", async () => {
    const result = await filterRtkOutput(
      ["mypy", "src"],
      [
        "src/user.py:10: error: Incompatible return value type [return-value]",
        'src/auth.py:20: error: Name "token" is not defined [name-defined]',
        "Found 2 errors in 2 files",
      ].join("\n"),
      1,
    );

    expect(result.output).toContain("mypy: 2 errors in 2 files");
    expect(result.output).toContain("user.py");
    expect(result.output).toContain("auth.py");
    expect(result.output).toContain("return-value");
    expect(result.output).not.toMatch(/Found 2 errors/);

    expectRtkParity(result, {
      critical: ["mypy: 2 errors in 2 files", "user.py", "auth.py", "return-value"],
      forbidden: [/Found 2 errors/],
      // Pin RTK's filter_mypy_output shape exactly (stronger than a char cap).
      exact: [
        "mypy: 2 errors in 2 files",
        "═══════════════════════════════════════",
        "Top codes: name-defined (1x), return-value (1x)",
        "",
        "src/auth.py (1 errors)",
        '  L20: [name-defined] Name "token" is not defined',
        "",
        "src/user.py (1 errors)",
        "  L10: [return-value] Incompatible return value type",
      ].join("\n"),
    });
  });

  // RTK: rtk/src/cmds/python/mypy_cmd.rs::test_filter_mypy_top_codes_summary
  test("summarizes the top error codes when several codes appear", async () => {
    const result = await filterRtkOutput(
      ["mypy", "src"],
      [
        "a.py:1: error: Error one  [return-value]",
        "a.py:2: error: Error two  [return-value]",
        "a.py:3: error: Error three  [return-value]",
        "b.py:1: error: Error four  [name-defined]",
        "c.py:1: error: Error five  [arg-type]",
        "Found 5 errors in 3 files",
      ].join("\n"),
      1,
    );

    expect(result.output).toContain("Top codes:");
    expect(result.output).toContain("return-value (3x)");
    expect(result.output).toContain("name-defined (1x)");
    expect(result.output).toContain("arg-type (1x)");
  });

  // RTK: rtk/src/cmds/python/mypy_cmd.rs::test_filter_mypy_single_code_no_summary
  test("omits the Top codes line when only one code is present", async () => {
    const result = await filterRtkOutput(
      ["mypy", "src"],
      [
        "a.py:1: error: Error one  [return-value]",
        "a.py:2: error: Error two  [return-value]",
        "b.py:1: error: Error three  [return-value]",
        "Found 3 errors in 2 files",
      ].join("\n"),
      1,
    );

    expect(result.output).not.toMatch(/Top codes:/);
  });

  // RTK: rtk/src/cmds/python/mypy_cmd.rs::test_filter_mypy_note_continuation
  test("attaches note lines to their preceding error", async () => {
    const result = await filterRtkOutput(
      ["mypy", "src"],
      [
        "src/app.py:10: error: Incompatible types in assignment  [assignment]",
        'src/app.py:10: note: Expected type "int"',
        'src/app.py:10: note: Got type "str"',
        "src/app.py:20: error: Missing return statement  [return]",
      ].join("\n"),
      1,
    );

    expect(result.output).toContain('Expected type "int"');
    expect(result.output).toContain('Got type "str"');
    expect(result.output).toContain("L10:");
    expect(result.output).toContain("L20:");
  });

  // RTK: rtk/src/cmds/python/mypy_cmd.rs::test_filter_mypy_fileless_errors
  test("keeps file-less errors verbatim before grouped output", async () => {
    const result = await filterRtkOutput(
      ["mypy", "src"],
      [
        "mypy: error: No module named 'nonexistent'",
        'src/api.py:10: error: Name "foo" is not defined  [name-defined]',
        "Found 1 error in 1 file",
      ].join("\n"),
      1,
    );

    expect(result.output).toContain("mypy: error: No module named 'nonexistent'");
    expect(result.output).toContain("src/api.py (1 errors)");
    expect(result.output.indexOf("No module named")).toBeLessThan(
      result.output.indexOf("src/api.py ("),
    );
  });

  // RTK: rtk/src/cmds/python/mypy_cmd.rs::test_filter_mypy_no_errors
  test("reports a clean run", async () => {
    const result = await filterRtkOutput(
      ["mypy", "src"],
      "Success: no issues found in 5 source files",
      0,
    );

    expect(result.output).toContain("mypy: No issues found");
  });

  // H13-mypy regression: long messages must not be silently clipped to 120 chars.
  test("keeps full message text — long messages are NOT clipped at 120 chars", async () => {
    const longMsg =
      "Argument 1 to " +
      '"do_something_with_a_very_long_function_name" ' +
      "has incompatible type " +
      '"Optional[VeryLongTypeNameThatExceedsOneHundredAndTwentyCharacters]"; ' +
      'expected "VeryLongTypeNameThatExceedsOneHundredAndTwentyCharacters"';

    // Ensure the message is definitely longer than 120 chars so truncation
    // would have fired before the fix.
    expect(longMsg.length).toBeGreaterThan(120);

    const result = await filterRtkOutput(
      ["mypy", "src"],
      [`src/app.py:5: error: ${longMsg}  [arg-type]`, "Found 1 error in 1 file"].join("\n"),
      1,
    );

    // The full message must appear — no trailing "..." truncation.
    expect(result.output).toContain(longMsg);
    expect(result.output).not.toMatch(/\.\.\.$/m);
  });

  // RTK: rtk/src/cmds/python/mypy_cmd.rs::test_filter_mypy_no_file_limit
  test("emits every file with no truncation limit", async () => {
    const lines: string[] = [];
    for (let i = 1; i <= 15; i += 1) {
      lines.push(`src/file${i}.py:${i}: error: Error in file ${i}.  [assignment]`);
    }
    lines.push("Found 15 errors in 15 files");
    const result = await filterRtkOutput(["mypy", "src"], lines.join("\n"), 1);

    expect(result.output).toContain("15 errors in 15 files");
    for (let i = 1; i <= 15; i += 1) expect(result.output).toContain(`file${i}.py`);
  });
});
