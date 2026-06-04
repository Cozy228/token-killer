import { describe, expect, test } from "vitest";

import { expectRtkParity, filterRtkOutput } from "../../helpers/rtkCommandHarness.js";

describe("RTK mypy behavior", () => {
  test("groups errors by file and preserves error codes", async () => {
    const result = await filterRtkOutput(
      ["mypy", "src"],
      [
        "src/user.py:10: error: Incompatible return value type [return-value]",
        "src/auth.py:20: error: Name \"token\" is not defined [name-defined]",
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
      critical: [
        "mypy: 2 errors in 2 files",
        "user.py",
        "auth.py",
        "return-value",
      ],
      forbidden: [
        /Found 2 errors/,
      ],
      maxOutputChars: 220,
    });
  });
});
