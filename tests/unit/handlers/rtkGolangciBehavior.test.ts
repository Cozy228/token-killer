import { describe, expect, test } from "vitest";

import { expectRtkParity, filterRtkOutput } from "../../helpers/rtkCommandHarness.js";

describe("RTK golangci-lint behavior", () => {
  test("keeps linter findings with file, line, and rule", async () => {
    const result = await filterRtkOutput(
      ["golangci-lint", "run"],
      "internal/order/service.go:42:13: ineffectual assignment to err (ineffassign)\n",
      1,
    );

    expect(result.output).toContain("service.go:42");
    expect(result.output).toContain("ineffassign");
    expect(result.output).toContain("ineffectual assignment");

    expectRtkParity(result, {
      critical: [
        "service.go:42",
        "ineffassign",
        "ineffectual assignment",
      ],
      maxOutputChars: 120,
    });
  });
});
