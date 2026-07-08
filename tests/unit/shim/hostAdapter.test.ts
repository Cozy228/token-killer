import { describe, expect, test } from "vitest";
import { join } from "node:path";

import { selectTier, type Host, type Tier } from "../../../src/shim/detect.js";
import { adapters, type HostAdapter } from "../../../src/shim/hostAdapter.js";

// Goal B — the adapter table is the single seam init drives off. These tests pin
// the per-host facts that used to be scattered across init's `if (host === …)`
// ladder, and prove that adding a host is just one adapter entry.

describe("adapters table", () => {
  test("each host carries its delivery tiers, dialect, and hook availability", () => {
    expect(adapters["claude-code"].supportedTiers).toEqual(["hook", "injection"]);
    expect(adapters["claude-code"].dialect).toBe("vscode");
    expect(Boolean(adapters["claude-code"].installHook)).toBe(true);

    expect(adapters["copilot-cli"].supportedTiers).toEqual(["hook", "shim", "injection"]);
    expect(adapters["copilot-cli"].dialect).toBe("cli");
    expect(Boolean(adapters["copilot-cli"].installHook)).toBe(true);

    // ADR 0012: VS Code is now hook-capable (additive hook + primary shim). It
    // carries installHook/planHook (reusing the Copilot writer) and "hook" in its
    // supportedTiers, with `additiveHook` flagging that the shim stays primary.
    expect(adapters.vscode.supportedTiers).toEqual(["hook", "shim", "injection"]);
    expect(Boolean(adapters.vscode.installHook)).toBe(true);
    expect(Boolean(adapters.vscode.planHook)).toBe(true);
    expect(adapters.vscode.additiveHook).toBe(true);
    // The hook is additive only for VS Code — for hosts where the hook is the sole
    // primary tier (copilot-cli, claude-code) the flag stays unset.
    expect(adapters["copilot-cli"].additiveHook).toBeUndefined();
    expect(adapters["claude-code"].additiveHook).toBeUndefined();

    expect(adapters.unknown.supportedTiers).toEqual(["injection"]);
    expect(adapters.unknown.installHook).toBeUndefined();
  });

  test("guidance-capable hosts expose a standalone guidance path; others do not", () => {
    expect(adapters["claude-code"].guidancePath("/home/u")).toBe(
      join("/home/u", ".claude", "CTX.md"),
    );
    // I4: copilot-cli reads only copilot-instructions.md (no import syntax), so it
    // has NO standalone guidance file — the guide is inlined into the loader.
    expect(adapters["copilot-cli"].guidancePath("/home/u")).toBeUndefined();
    // VS Code gets the guide as a user-level always-on .instructions.md (ADR 0008).
    expect(adapters.vscode.guidancePath("/home/u")).toBe(
      join("/home/u", ".copilot", "instructions", "contexa.instructions.md"),
    );
    expect(adapters.unknown.guidancePath("/home/u")).toBeUndefined();
  });

  test("injectionPath routes per host (copilot → ~/.copilot, vscode → user .instructions.md)", () => {
    expect(adapters["copilot-cli"].injectionPath("/home/u")).toBe(
      join("/home/u", ".copilot", "copilot-instructions.md"),
    );
    // VS Code's user-level channel is ~/.copilot/instructions (ADR 0008), not the
    // inert <vscodeUserDir>/copilot-instructions.md.
    expect(adapters.vscode.injectionPath("/home/u", "/home/u/.config/Code/User")).toBe(
      join("/home/u", ".copilot", "instructions", "contexa-prefix.instructions.md"),
    );
  });
});

describe("extending to a new host is one adapter entry", () => {
  // A brand-new, injection-only host. Implementing the HostAdapter interface is
  // all it takes — no edits to injection.ts / guidance.ts / the installers. init's
  // dispatch reads only these fields, so the shape alone is sufficient.
  const STUB = "stub-host" as Host;
  const stub: HostAdapter = {
    host: STUB,
    dialect: "unknown",
    supportedTiers: ["injection"],
    guidancePath: () => undefined,
    injectionPath: (home = "/h") => `${home}/stub-instructions.md`,
    // no installHook → no hook tier
  };

  test("the interface alone drives init's tier + path decisions", () => {
    const hookAvailable = Boolean(stub.installHook);
    expect(hookAvailable).toBe(false);
    // A new host with no hook installer flows through selectTier's default to
    // injection — even if the shim probe would pass — exactly init's dispatch.
    expect(selectTier(stub.supportedTiers, hookAvailable, true)).toBe("injection");
    expect(stub.supportedTiers.includes("shim")).toBe(false);
    expect(stub.injectionPath("/home/u")).toBe("/home/u/stub-instructions.md");
    expect(stub.guidancePath()).toBeUndefined();
  });
});

describe("selectTier is the single source of truth — reads supportedTiers", () => {
  // A hook-capable new host. selectTier must honour the tier it lists, NOT a
  // hardcoded host name — otherwise `supportedTiers` would be decorative and a new
  // hook host would silently fall to injection. This is the regression the earlier
  // injection-only stub could not catch.
  test("a new hook-capable host resolves to hook when its installer exists", () => {
    const tiers: Tier[] = ["hook", "injection"];
    expect(selectTier(tiers, true, false)).toBe("hook");
    // No installer yet → falls past hook to injection (it lists no shim).
    expect(selectTier(tiers, false, true)).toBe("injection");
  });

  test("a new shim-capable host resolves to shim when the probe passes", () => {
    const tiers: Tier[] = ["shim", "injection"];
    expect(selectTier(tiers, true, true)).toBe("shim"); // no "hook" listed → skip
    expect(selectTier(tiers, true, false)).toBe("injection");
  });

  test("the four shipped adapters preserve the original ladder", () => {
    expect(selectTier(adapters["claude-code"].supportedTiers, true, false)).toBe("hook");
    expect(selectTier(adapters["claude-code"].supportedTiers, false, true)).toBe("injection");
    expect(selectTier(adapters["copilot-cli"].supportedTiers, true, true)).toBe("hook");
    expect(selectTier(adapters["copilot-cli"].supportedTiers, false, true)).toBe("shim");
    // ADR 0012: vscode now lists "hook" first, so selectTier (ordering only) returns
    // "hook" when a hook is available. The shim-stays-PRIMARY rule for vscode lives in
    // init's `additiveHook` handling, NOT in selectTier — so selectTier is asked the
    // shim question with `hookAvailable=false` there. With no hook it still resolves
    // to shim on a passing probe.
    expect(selectTier(adapters.vscode.supportedTiers, true, true)).toBe("hook");
    expect(selectTier(adapters.vscode.supportedTiers, false, true)).toBe("shim");
    expect(selectTier(adapters.unknown.supportedTiers, true, true)).toBe("injection");
  });
});
