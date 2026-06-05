import { describe, expect, test } from "vitest";

import { expectRtkParity, filterRtkOutput } from "../../helpers/rtkCommandHarness.js";

describe("RTK glab behavior", () => {
  // RTK: glab_cmd.rs::format_mr_list — "Merge Requests\n  [open] !iid <title> (<author>)".
  test("renders the MR list with state icons and authors", async () => {
    const result = await filterRtkOutput(
      ["glab", "mr", "list"],
      JSON.stringify([
        { iid: 7, title: "fix auth flow", state: "opened", author: { username: "alice" } },
        { iid: 8, title: "update deps", state: "opened", author: { username: "bob" } },
      ]),
    );

    expect(result.output).toContain("!7");
    expect(result.output).toContain("fix auth flow");

    expectRtkParity(result, {
      critical: ["Merge Requests", "[open] !7 fix auth flow (alice)", "[open] !8 update deps (bob)"],
      exact: [
        "Merge Requests",
        "  [open] !7 fix auth flow (alice)",
        "  [open] !8 update deps (bob)",
      ].join("\n"),
    });
  });

  // RTK: format_mr_list caps the listing at CAP_LIST (20) with "  … +N more".
  test("caps long MR lists at CAP_LIST", async () => {
    const mrs = Array.from({ length: 23 }, (_, i) => ({
      iid: i + 1,
      title: `mr ${i + 1}`,
      state: "opened",
      author: { username: "dev" },
    }));
    const result = await filterRtkOutput(["glab", "mr", "list"], JSON.stringify(mrs));

    expectRtkParity(result, {
      critical: ["… +3 more"],
      forbidden: [/!21 /],
    });
  });
});
