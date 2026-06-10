import { describe, expect, test } from "vitest";

import { buildAddArgs, formatAddSummary } from "../../../src/handlers/git/extended.js";

describe("RTK git add behavior", () => {
  // RTK: git/git.rs::run_add — no args target the working dir (`.`); explicit
  // args (pathspecs, -A, -p, ...) pass through verbatim.
  describe("child command construction", () => {
    test("no args stage the current directory", () => {
      expect(buildAddArgs([])).toEqual(["add", "."]);
    });

    test("explicit args pass through verbatim", () => {
      expect(buildAddArgs(["-A"])).toEqual(["add", "-A"]);
      expect(buildAddArgs(["src/cli.ts", "src/parse.ts"])).toEqual([
        "add",
        "src/cli.ts",
        "src/parse.ts",
      ]);
    });
  });

  // RTK: git/git.rs::run_add — the staged-file count comes from a secondary
  // `git diff --cached --stat --shortstat`, reported as `ok <shortstat>`.
  describe("staged-count summary (formatAddSummary)", () => {
    test("reports the shortstat line as the ok summary", () => {
      expect(
        formatAddSummary(" 2 files changed, 10 insertions(+), 3 deletions(-)\n"),
      ).toBe("ok 2 files changed, 10 insertions(+), 3 deletions(-)");
    });

    test("a no-op add stays silent so it differs from a real add", () => {
      // Empty shortstat => nothing was staged => RTK prints nothing.
      expect(formatAddSummary("")).toBe("");
      expect(formatAddSummary("\n")).toBe("");
      expect(formatAddSummary("   \n")).toBe("");
    });

    test("present stat output whose last line is blank acknowledges with bare ok", () => {
      // RTK: when the shortstat stdout is non-empty but its last line trims to
      // empty, run_add falls back to a bare "ok" rather than printing nothing.
      expect(formatAddSummary("partial\n   \n")).toBe("ok");
    });
  });
});
