import { describe, expect, test } from "vitest";

import { expectRtkParity, filterRtkOutput } from "../../helpers/rtkCommandHarness.js";

describe("RTK prisma behavior", () => {
  test("summarizes migrate deploy applied migrations and strips schema load chatter", async () => {
    const result = await filterRtkOutput(
      ["prisma", "migrate", "deploy"],
      ["Prisma schema loaded from prisma/schema.prisma", "Applying migration `20260128_add_sessions`", "The following migration(s) have been applied:", "20260128_add_sessions"].join("\n"),
    );

    expect(result.output).toContain("20260128_add_sessions");
    expect(result.output).toContain("applied");
    expect(result.output).not.toMatch(/Prisma schema loaded/);

    expectRtkParity(result, {
      critical: [
        "20260128_add_sessions",
        "applied",
      ],
      forbidden: [
        /Prisma schema loaded/,
      ],
      exact: [
        "1 migration(s) deployed",
        "Latest: 20260128_add_sessions",
      ].join("\n"),
    });
  });
});
