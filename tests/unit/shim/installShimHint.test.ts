import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { resetSupportHintForTest } from "../../../src/hook/debug.js";
import { installShim } from "../../../src/shim/cli.js";
import { defaultRcPath, vscodeSettingsPath, vscodeUserDir } from "../../../src/shim/hostConfig.js";

// Constraint 4: a shim-install FAILURE is tk's OWN error, so it must nudge toward
// `tk support`. We trigger the two failure branches with REAL filesystem conditions
// (no module mocks): a directory where the RC file should be (patchRc → EISDIR), and
// an unparseable settings.json (patchVscodeSettings → throws).

let home: string;
let stderr: string[];
const orig = { HOME: process.env.HOME, TOKEN_KILLER_HOME: process.env.TOKEN_KILLER_HOME };

beforeEach(() => {
  resetSupportHintForTest();
  home = mkdtempSync(join(tmpdir(), "tk-installshim-hint-"));
  process.env.HOME = home;
  process.env.TOKEN_KILLER_HOME = join(home, ".token-killer");
  stderr = [];
  vi.spyOn(process.stderr, "write").mockImplementation((c: string | Uint8Array) => {
    stderr.push(String(c));
    return true;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  rmSync(home, { recursive: true, force: true });
  for (const [k, v] of Object.entries(orig)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe("installShim — `tk support` hint on tk's OWN install failure (constraint 4)", () => {
  test("shell RC patch failure emits the support hint on stderr", () => {
    // Make the RC path a DIRECTORY so patchRc's read/write throws EISDIR.
    mkdirSync(defaultRcPath(), { recursive: true });
    installShim({ rc: true, vscode: false, quiet: true });
    const out = stderr.join("");
    expect(out).toContain("shell RC patch failed");
    expect(out).toContain("Run `tk support`");
  });

  test("VS Code settings patch failure emits the support hint exactly once", () => {
    // An existing-but-unparseable settings.json makes patchVscodeSettings throw.
    mkdirSync(vscodeUserDir(), { recursive: true });
    writeFileSync(vscodeSettingsPath(), "{ not: valid json ");
    installShim({ rc: false, vscode: true, quiet: true });
    const out = stderr.join("");
    expect(out).toContain("VS Code settings.json is not valid JSON");
    expect(stderr.filter((w) => w.includes("Run `tk support`"))).toHaveLength(1);
  });
});
