import { describe, expect, test } from "vitest";

import { expectRtkParity, filterRtkOutput } from "../../helpers/rtkCommandHarness.js";

describe("RTK psql behavior", () => {
  test("converts table output to compact tabular rows and strips row count", async () => {
    const result = await filterRtkOutput(
      ["psql", "-c", "select * from users"],
      [" id | name  | email", "----+-------+-------------", " 1  | alice | a@b.com", " 2  | bob   | b@b.com", "(2 rows)"].join("\n"),
    );

    expect(result.output).toContain("id");
    expect(result.output).toContain("alice");
    expect(result.output).toContain("bob");
    expect(result.output).not.toMatch(/---\+/);
    expect(result.output).not.toMatch(/\(2 rows\)/);

    expectRtkParity(result, {
      critical: [
        "id",
        "alice",
        "bob",
      ],
      forbidden: [
        /---\+/,
        /\(2 rows\)/,
      ],
      exact: [
        "id\tname\temail",
        "1\talice\ta@b.com",
        "2\tbob\tb@b.com",
      ].join("\n"),
    });
  });
});
