import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  applyVscodeEnv,
  patchRc,
  patchVscodeSettings,
  removeVscodeEnv,
  unpatchRc,
  unpatchVscodeSettings,
} from "../../../src/shim/hostConfig.js";

const SHIM = "/home/u/.token-guard/shim";

describe("shell RC block", () => {
  let dir: string;
  let rc: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "tg-rc-"));
    rc = join(dir, ".zshrc");
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  test("patch is idempotent (run twice → one block)", () => {
    writeFileSync(rc, "export FOO=1\n");
    patchRc(rc, SHIM);
    const once = readFileSync(rc, "utf8");
    patchRc(rc, SHIM);
    const twice = readFileSync(rc, "utf8");
    expect(twice).toBe(once);
    expect(once.match(/token-guard shim/g)?.length).toBe(2); // start + end markers
  });

  test("block prepends the shim dir on PATH", () => {
    writeFileSync(rc, "export FOO=1\n");
    patchRc(rc, SHIM);
    const content = readFileSync(rc, "utf8");
    expect(content).toContain(`export TG_SHIM_DIR='${SHIM}'`);
    expect(content).toContain('export PATH="$TG_SHIM_DIR:$PATH"');
  });

  test("uninstall restores byte-identical pre-state", () => {
    const original = "export FOO=1\nalias g=git\n";
    writeFileSync(rc, original);
    patchRc(rc, SHIM);
    unpatchRc(rc);
    expect(readFileSync(rc, "utf8")).toBe(original);
  });

  test("uninstall restores byte-identical pre-state when file lacks trailing newline", () => {
    const original = "export FOO=1";
    writeFileSync(rc, original);
    patchRc(rc, SHIM);
    unpatchRc(rc);
    expect(readFileSync(rc, "utf8")).toBe(original);
  });
});

describe("VS Code settings env", () => {
  test("prepends shim dir and sets TG_SHIM_DIR (linux)", () => {
    const result = applyVscodeEnv({}, SHIM, "linux") as Record<string, Record<string, string>>;
    const env = result["terminal.integrated.env.linux"]!;
    expect(env.TG_SHIM_DIR).toBe(SHIM);
    expect(env.PATH).toBe(`${SHIM}:\${env:PATH}`);
  });

  test("idempotent: applying twice does not stack the shim dir", () => {
    const once = applyVscodeEnv({}, SHIM, "linux");
    const twice = applyVscodeEnv(once, SHIM, "linux");
    expect(twice).toEqual(once);
  });

  test("preserves unrelated settings and existing env vars", () => {
    const before = {
      "editor.fontSize": 14,
      "terminal.integrated.env.linux": { MY_VAR: "x" },
    };
    const after = applyVscodeEnv(before, SHIM, "linux") as Record<string, unknown>;
    expect(after["editor.fontSize"]).toBe(14);
    const env = after["terminal.integrated.env.linux"] as Record<string, string>;
    expect(env.MY_VAR).toBe("x");
    expect(env.TG_SHIM_DIR).toBe(SHIM);
  });

  test("remove restores an env that only held our keys", () => {
    const patched = applyVscodeEnv({ "editor.fontSize": 14 }, SHIM, "linux");
    const removed = removeVscodeEnv(patched, SHIM, "linux");
    expect(removed).toEqual({ "editor.fontSize": 14 });
  });

  test("remove keeps the user's own env vars", () => {
    const before = { "terminal.integrated.env.linux": { MY_VAR: "x" } };
    const patched = applyVscodeEnv(before, SHIM, "linux");
    const removed = removeVscodeEnv(patched, SHIM, "linux") as Record<string, Record<string, string>>;
    expect(removed["terminal.integrated.env.linux"]).toEqual({ MY_VAR: "x" });
  });

  test("file-level patch + unpatch round-trips a clean settings.json", () => {
    const dir = mkdtempSync(join(tmpdir(), "tg-vscode-"));
    try {
      const settings = join(dir, "settings.json");
      writeFileSync(settings, `${JSON.stringify({ "editor.fontSize": 14 }, null, 2)}\n`);
      patchVscodeSettings(settings, SHIM, "linux");
      expect(readFileSync(settings, "utf8")).toContain("TG_SHIM_DIR");
      unpatchVscodeSettings(settings, SHIM, "linux");
      expect(JSON.parse(readFileSync(settings, "utf8"))).toEqual({ "editor.fontSize": 14 });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
