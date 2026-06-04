import { describe, expect, test } from "vitest";

import { expectRtkParity, filterRtkOutput } from "../../helpers/rtkCommandHarness.js";

describe("RTK aws behavior", () => {
  test("summarizes CloudFormation stack lists and strips response metadata noise", async () => {
    const result = await filterRtkOutput(
      ["aws", "cloudformation", "describe-stacks"],
      JSON.stringify({
        Stacks: [
          { StackName: "api-prod", StackStatus: "CREATE_COMPLETE" },
          { StackName: "web-prod", StackStatus: "UPDATE_COMPLETE" },
        ],
        ResponseMetadata: { RequestId: "req-123", HTTPStatusCode: 200 },
      }),
    );

    expect(result.output).toContain("api-prod");
    expect(result.output).toContain("CREATE_COMPLETE");
    expect(result.output).toContain("web-prod");
    expect(result.output).not.toMatch(/ResponseMetadata/);
    expect(result.output).not.toMatch(/RequestId/);

    expectRtkParity(result, {
      critical: [
        "api-prod",
        "CREATE_COMPLETE",
        "web-prod",
      ],
      forbidden: [
        /ResponseMetadata/,
        /RequestId/,
      ],
      exact: [
        "api-prod CREATE_COMPLETE ?",
        "web-prod UPDATE_COMPLETE ?",
      ].join("\n"),
    });
  });
});
