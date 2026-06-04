import { describe, expect, test } from "vitest";

import { expectRtkParity, filterRtkOutput } from "../../helpers/rtkCommandHarness.js";

describe("RTK rubocop behavior", () => {
  test("keeps offense file, line, and cop while stripping inspection chatter", async () => {
    const result = await filterRtkOutput(
      ["rubocop"],
      ["Inspecting 10 files", "C: app/models/order.rb:42:7: Style/IfUnlessModifier: Favor modifier if usage.", "10 files inspected, 1 offense detected"].join("\n"),
      1,
    );

    expect(result.output).toContain("order.rb:42");
    expect(result.output).toContain("Style/IfUnlessModifier");
    expect(result.output).toContain("1 offense");
    expect(result.output).not.toMatch(/Inspecting 10 files/);

    expectRtkParity(result, {
      critical: [
        "order.rb:42",
        "Style/IfUnlessModifier",
        "1 offense",
      ],
      forbidden: [
        /Inspecting 10 files/,
      ],
      exact: "RuboCop: 10 files inspected, 1 offense detected",
    });
  });
});
