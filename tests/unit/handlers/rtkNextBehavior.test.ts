import { describe, expect, test } from "vitest";

import { expectRtkParity, filterRtkOutput } from "../../helpers/rtkCommandHarness.js";

describe("RTK next behavior", () => {
  test("summarizes build routes and warnings while stripping optimization chatter", async () => {
    const result = await filterRtkOutput(
      ["next", "build"],
      [
        "Creating an optimized production build ...",
        "Route (app)                              Size     First Load JS",
        "┌ ○ /                                    1.2 kB   90 kB",
        "└ ○ /orders                              2.0 kB   95 kB",
        "Compiled with warnings",
      ].join("\n"),
    );

    expect(result.output).toContain("Next.js Build");
    expect(result.output).toContain("routes");
    expect(result.output).toContain("/orders");
    expect(result.output).not.toMatch(/Creating an optimized/);

    expectRtkParity(result, {
      critical: [
        "Next.js Build",
        "routes",
        "/orders",
      ],
      forbidden: [
        /Creating an optimized/,
      ],
      maxOutputChars: 160,
    });
  });
});
