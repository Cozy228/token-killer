import { describe, expect, test } from "vitest";

import { expectRtkParity, filterRtkOutput } from "../../helpers/rtkCommandHarness.js";

describe("RTK kubectl behavior", () => {
  test("summarizes pod readiness and surfaces crashloop state from JSON", async () => {
    const result = await filterRtkOutput(
      ["kubectl", "get", "pods"],
      JSON.stringify({
        items: [
          {
            metadata: { namespace: "default", name: "api-123" },
            status: {
              phase: "Unknown",
              containerStatuses: [{ restartCount: 3, state: { waiting: { reason: "CrashLoopBackOff" } } }],
            },
          },
        ],
      }),
    );

    expect(result.output).toContain("api-123");
    expect(result.output).toContain("CrashLoopBackOff");
    expect(result.output).not.toMatch(/containerStatuses/);

    expectRtkParity(result, {
      critical: [
        "api-123",
        "CrashLoopBackOff",
      ],
      forbidden: [
        /containerStatuses/,
      ],
      exact: [
        "1 pods: 1 [x], 3 restarts",
        "[warn] Issues:",
        "  default/api-123 CrashLoopBackOff",
      ].join("\n"),
    });
  });
});
