import { describe, expect, test } from "vitest";

import { rewriteCommand } from "../../../src/hook/rewrite.js";
import { shimmablePrograms } from "../../../src/shim/programs.js";

// ADR 0012 decision #5 — no double-compression. VS Code now runs the hook and the
// shim as complementary tiers (the hook rewrites `git status` → `ctx git status`;
// the shim wraps real tools on PATH). Two EXISTING guards keep a hook rewrite from
// being re-intercepted by the shim, so a command is never compressed twice. This
// round-trip test pins both ends of that guarantee.

describe("no double-compression: hook rewrite cannot be re-wrapped by the shim", () => {
  // Guard 1 (hook side, rewrite.ts eligibility "already a ctx command"): the hook
  // never rewrites a command that is already a `ctx` invocation. So feeding the
  // hook's own output (`ctx git status`) back through it is a no-op `pass`.
  test("rewriteCommand('ctx git status') → pass, 'already a ctx command'", () => {
    const decision = rewriteCommand("ctx git status");
    expect(decision.decision).toBe("pass");
    expect(decision.reason).toBe("already a ctx command");
    expect(decision.rewritten).toBeUndefined();
  });

  // Guard 2 (shim side, NEVER_WRAP in programs.ts): the shim's wrapper set never
  // includes `ctx`, so the rewritten `ctx git status` resolving `ctx` on PATH hits the
  // real ctx binary, not a shim of ctx. (The shim ALSO strips CTX_SHIM_DIR from the
  // child PATH — path.ts — but the wrapper set never containing `ctx` is the
  // code-level floor this test pins.)
  test("shimmablePrograms() never includes 'ctx'", () => {
    expect(shimmablePrograms()).not.toContain("ctx");
  });

  // Round-trip composition: the hook turns `git status` into `ctx git status`; that
  // output, run through the hook again, passes; and `ctx` is not in the shim set, so
  // the shim cannot re-wrap it. Together: a single compression, never a double.
  test("hook rewrite of 'git status' is not re-eligible and not shimmable", () => {
    const first = rewriteCommand("git status");
    // Sanity: the first pass DOES rewrite a plain `git status` to a ctx command.
    // (Guarded by binary presence; on a box without git the hook passes — assert the
    // round-trip property only when the rewrite actually happened.)
    if (first.decision === "rewrite") {
      expect(first.rewritten).toContain("ctx git status");
      // Feeding the rewrite back through the hook is a no-op pass.
      const second = rewriteCommand(first.rewritten!);
      expect(second.decision).toBe("pass");
      expect(second.reason).toBe("already a ctx command");
    }
    // Regardless of git presence, the shim never wraps `ctx`.
    expect(shimmablePrograms()).not.toContain("ctx");
  });
});
