import { describe, expect, test } from "vitest";

import { expectRtkParity, filterRtkOutput } from "../../helpers/rtkCommandHarness.js";

describe("RTK diff behavior", () => {
  test("condenses unified diff to file metadata and changed lines", async () => {
    const result = await filterRtkOutput(
      ["diff", "old.ts", "new.ts"],
      [
        "--- old.ts",
        "+++ new.ts",
        "@@ -1,2 +1,2 @@",
        "-const value = 1;",
        "+const value = 2;",
      ].join("\n"),
    );

    expectRtkParity(result, {
      critical: ["[file] new.ts (+1 -1)", "-const value = 1;", "+const value = 2;"],
      forbidden: [/^--- old\.ts$/m, /^@@ /m],
      exact: [
        "[file] new.ts (+1 -1)",
        "  -const value = 1;",
        "  +const value = 2;",
      ].join("\n"),
    });
  });
});
