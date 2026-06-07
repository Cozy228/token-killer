import { describe, expect, test } from "vitest";

import { expectRtkParity, filterRtkOutput } from "../../helpers/rtkCommandHarness.js";
import { buildGlabArgs } from "../../../src/handlers/git/hostingCli.js";

describe("RTK glab behavior", () => {
  // RTK: glab_cmd.rs — list/view re-run with `-F json`; an explicit
  // `--output`/`-F`/`--json` (or a view's --web/--comments) means passthrough.
  describe("child command construction (-F json injection)", () => {
    test("mr list injects -F json", () => {
      expect(buildGlabArgs(["mr", "list"])).toEqual(["mr", "list", "-F", "json"]);
    });

    test("mr view injects -F json after the user args", () => {
      expect(buildGlabArgs(["mr", "view", "42"])).toEqual(["mr", "view", "42", "-F", "json"]);
    });

    test("explicit -F passes through untouched", () => {
      const args = ["mr", "list", "-F", "yaml"];
      expect(buildGlabArgs(args)).toBe(args);
    });

    test("an mr view with --web is a passthrough, not a JSON re-run", () => {
      const args = ["mr", "view", "42", "--web"];
      expect(buildGlabArgs(args)).toBe(args);
    });
  });
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
      critical: [
        "Merge Requests",
        "[open] !7 fix auth flow (alice)",
        "[open] !8 update deps (bob)",
      ],
      exact: [
        "Merge Requests",
        "  [open] !7 fix auth flow (alice)",
        "  [open] !8 update deps (bob)",
      ].join("\n"),
    });
  });

  // RTK: format_mr_list — an empty list emits "No Merge Requests" and must NEVER
  // fall back to the raw `[]` JSON envelope.
  test("empty mr list renders the No-… summary, not raw []", async () => {
    const result = await filterRtkOutput(["glab", "mr", "list"], "[]");
    expect(result.output.trim()).toBe("No Merge Requests");
    expect(result.output).not.toContain("[]");
  });

  // ADR 0001 decision 2: RTK's CAP_LIST (20) + "  … +N more" cap is REMOVED. Within
  // budget tk reshapes the JSON into the compact "Merge Requests\n  [open] !iid ..."
  // view and lists EVERY MR with NO fake overflow marker.
  test("reshapes an MR list in full with no fake overflow marker", async () => {
    const mrs = Array.from({ length: 20 }, (_, i) => ({
      iid: i + 1,
      title: `mr ${i + 1}`,
      state: "opened",
      author: { username: "dev" },
    }));
    const result = await filterRtkOutput(["glab", "mr", "list"], JSON.stringify(mrs));

    // 20 MRs: header present, first and last MR shown, no fake marker.
    expect(result.output).toContain("Merge Requests");
    expect(result.output).toContain("[open] !1 mr 1 (dev)");
    expect(result.output).toContain("[open] !20 mr 20 (dev)");
    expect(result.output).not.toMatch(/(?:\.{3}|…)\s*\+\d+\s+more/);

    expectRtkParity(result, {
      critical: ["Merge Requests", "[open] !20 mr 20 (dev)"],
      forbidden: [/(?:\.{3}|…)\s*\+\d+\s+more/],
    });
  });

  // ADR 0001 decisions 2/5/7: over budget, the MR list ladders instead of reverting
  // to raw JSON. The step-1 lossless digest keeps EVERY MR's !iid + title and drops
  // the state-icon/author decoration, declaring `kind === "digest"`. No "… +N more".
  test("MR list over budget ships the lossless !iid/title digest, not raw", async () => {
    const mrs = Array.from({ length: 120 }, (_, i) => ({
      iid: i + 1,
      title: `Feature merge request with a longish descriptive title ${i}`,
      state: "opened",
      author: { username: `developer${i}` },
    }));
    const result = await filterRtkOutput(["glab", "mr", "list"], JSON.stringify(mrs));

    expect(result.output).not.toContain('"iid":');
    expect(result.qualityStatus).toBe("passed");
    expect(result.omission?.kind).toBe("digest");
    expect(result.output).toContain("Merge Requests");
    expect(result.output).toContain(
      "  !1 Feature merge request with a longish descriptive title 0",
    );
    expect(result.output).toContain(
      "  !120 Feature merge request with a longish descriptive title 119",
    );
    expectRtkParity(result, {
      critical: ["Merge Requests"],
      forbidden: [/… \+\d+ more/, /\[open\]/, /developer0/],
      minSavingsRatio: 0.4,
    });
  });
});
