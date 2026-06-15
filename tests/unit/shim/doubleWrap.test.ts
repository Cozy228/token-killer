import { describe, expect, test } from "vitest";

import { rewriteCommand } from "../../../src/hook/rewrite.js";
import { shimmablePrograms } from "../../../src/shim/programs.js";

// ADR 0012 decision #5 — no double-compression. VS Code now runs the hook and the
// shim as complementary tiers (the hook rewrites `git status` → `tk git status`;
// the shim wraps real tools on PATH). Two EXISTING guards keep a hook rewrite from
// being re-intercepted by the shim, so a command is never compressed twice. This
// round-trip test pins both ends of that guarantee.

describe("no double-compression: hook rewrite cannot be re-wrapped by the shim", () => {
  // Guard 1 (hook side, rewrite.ts eligibility "already a tk command"): the hook
  // never rewrites a command that is already a `tk` invocation. So feeding the
  // hook's own output (`tk git status`) back through it is a no-op `pass`.
  test("rewriteCommand('tk git status') → pass, 'already a tk command'", () => {
    const decision = rewriteCommand("tk git status");
    expect(decision.decision).toBe("pass");
    expect(decision.reason).toBe("already a tk command");
    expect(decision.rewritten).toBeUndefined();
  });

  // Guard 2 (shim side, NEVER_WRAP in programs.ts): the shim's wrapper set never
  // includes `tk`, so the rewritten `tk git status` resolving `tk` on PATH hits the
  // real tk binary, not a shim of tk. (The shim ALSO strips TK_SHIM_DIR from the
  // child PATH — path.ts — but the wrapper set never containing `tk` is the
  // code-level floor this test pins.)
  test("shimmablePrograms() never includes 'tk'", () => {
    expect(shimmablePrograms()).not.toContain("tk");
  });

  // Round-trip composition: the hook turns `git status` into `tk git status`; that
  // output, run through the hook again, passes; and `tk` is not in the shim set, so
  // the shim cannot re-wrap it. Together: a single compression, never a double.
  test("hook rewrite of 'git status' is not re-eligible and not shimmable", () => {
    const first = rewriteCommand("git status");
    // Sanity: the first pass DOES rewrite a plain `git status` to a tk command.
    // (Guarded by binary presence; on a box without git the hook passes — assert the
    // round-trip property only when the rewrite actually happened.)
    if (first.decision === "rewrite") {
      expect(first.rewritten).toContain("tk git status");
      // Feeding the rewrite back through the hook is a no-op pass.
      const second = rewriteCommand(first.rewritten!);
      expect(second.decision).toBe("pass");
      expect(second.reason).toBe("already a tk command");
    }
    // Regardless of git presence, the shim never wraps `tk`.
    expect(shimmablePrograms()).not.toContain("tk");
  });
});
