import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import {
  COMPRESS_KEY,
  applyCompress,
  readVscodeSettingsFile,
  restoreCompress,
  vscodeCompressFinding,
} from "../../../src/context/vscodeSettings.js";
import { vscodeSettingsPath } from "../../../src/shim/hostConfig.js";

let root: string;
let settingsPath: string;
const NOW = Date.UTC(2026, 5, 6);

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "tk-vscode-"));
  settingsPath = join(root, "settings.json");
  process.env.TOKEN_KILLER_HOME = join(root, ".token-killer");
  // Isolate the VS Code user dir on Windows: vscodeUserDir() reads %APPDATA% on win32,
  // which would otherwise point at the runner's REAL VS Code settings and break test
  // isolation (e.g. "none when settings.json is missing"). POSIX ignores APPDATA.
  process.env.APPDATA = join(root, "AppData", "Roaming");
});
afterEach(() => {
  delete process.env.TOKEN_KILLER_HOME;
  delete process.env.APPDATA;
  rmSync(root, { recursive: true, force: true });
  vi.restoreAllMocks();
});

function silence() {
  return vi.spyOn(process.stdout, "write").mockImplementation(() => true);
}
function readKey(): unknown {
  return (JSON.parse(readFileSync(settingsPath, "utf8")) as Record<string, unknown>)[COMPRESS_KEY];
}

describe("vscodeCompressFinding", () => {
  test("none when settings.json is missing (not a VS Code user)", () => {
    expect(vscodeCompressFinding(process.platform, root)).toBeUndefined();
  });

  test("none when compress is already enabled", () => {
    const p = vscodeSettingsPath(process.platform, root);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, JSON.stringify({ [COMPRESS_KEY]: true }));
    expect(vscodeCompressFinding(process.platform, root)).toBeUndefined();
  });

  test("safe_mechanical user-scope finding when present and off", () => {
    const p = vscodeSettingsPath(process.platform, root);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, JSON.stringify({ "editor.fontSize": 13 }));
    const f = vscodeCompressFinding(process.platform, root)!;
    expect(f.type).toBe("vscode_compress_disabled");
    expect(f.fix_class).toBe("safe_mechanical");
    expect(f.scope).toBe("user");
    expect(f.surface).toBe("vscode_settings");
    expect(f.file).toBe(p);
  });

  test("advisory finding when settings.json is unreadable", () => {
    const p = vscodeSettingsPath(process.platform, root);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, '{ "a": }');
    const f = vscodeCompressFinding(process.platform, root)!;
    expect(f.fix_class).toBe("advisory");
  });
});

describe("readVscodeSettingsFile", () => {
  test("missing file → missing; JSONC parses OK; malformed → parse_error; valid → ok", () => {
    expect(readVscodeSettingsFile(settingsPath).status).toBe("missing");
    // JSONC (comments + trailing comma) is legal in VS Code settings.json and now parses.
    writeFileSync(settingsPath, '{ "a": 1, /* comment */ }');
    const jsonc = readVscodeSettingsFile(settingsPath);
    expect(jsonc.status).toBe("ok");
    expect(jsonc.status === "ok" && jsonc.settings.a).toBe(1);
    // Genuinely malformed JSON still surfaces as parse_error.
    writeFileSync(settingsPath, '{ "a": }');
    expect(readVscodeSettingsFile(settingsPath).status).toBe("parse_error");
    writeFileSync(settingsPath, '{ "a": 1 }');
    const ok = readVscodeSettingsFile(settingsPath);
    expect(ok.status).toBe("ok");
  });
});

describe("applyCompress", () => {
  test("adds the key, preserves others, writes a backup + state, idempotent", () => {
    writeFileSync(settingsPath, '{\n  "editor.fontSize": 13\n}\n');
    silence();
    expect(applyCompress(settingsPath, NOW)).toBe(0);
    expect(readKey()).toBe(true);
    // Other keys preserved.
    expect(
      (JSON.parse(readFileSync(settingsPath, "utf8")) as Record<string, unknown>)[
        "editor.fontSize"
      ],
    ).toBe(13);
    // Backup + state recorded.
    expect(existsSync(join(root, ".token-killer", "state", "vscode-compress.json"))).toBe(true);
    // Re-apply is a no-op (still true, no throw).
    expect(applyCompress(settingsPath, NOW)).toBe(0);
    expect(readKey()).toBe(true);
  });

  test("creates settings.json when absent", () => {
    silence();
    expect(applyCompress(settingsPath, NOW)).toBe(0);
    expect(readKey()).toBe(true);
  });

  test("applies on JSONC, reformatting to strict JSON after backing up the original", () => {
    const original = '{ "a": 1, // keep\n}';
    writeFileSync(settingsPath, original);
    silence();
    // JSONC is now readable, so apply succeeds (reformats to strict JSON).
    expect(applyCompress(settingsPath, NOW)).toBe(0);
    expect(readKey()).toBe(true);
    const parsed = JSON.parse(readFileSync(settingsPath, "utf8")) as Record<string, unknown>;
    expect(parsed.a).toBe(1);
    // applySafe snapshots the pre-apply original under backups/context before reformatting.
    expect(existsSync(join(root, ".token-killer", "backups", "context"))).toBe(true);
  });

  test("still refuses genuinely malformed JSON (returns 1, leaves file untouched)", () => {
    const original = '{ "a": }';
    writeFileSync(settingsPath, original);
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    expect(applyCompress(settingsPath, NOW)).toBe(1);
    expect(readFileSync(settingsPath, "utf8")).toBe(original);
  });
});

describe("restoreCompress", () => {
  test("deletes the key when it was absent before apply", () => {
    writeFileSync(settingsPath, '{ "editor.fontSize": 13 }');
    silence();
    applyCompress(settingsPath, NOW);
    expect(restoreCompress(settingsPath, NOW)).toBe(0);
    const parsed = JSON.parse(readFileSync(settingsPath, "utf8")) as Record<string, unknown>;
    expect(COMPRESS_KEY in parsed).toBe(false);
    expect(parsed["editor.fontSize"]).toBe(13);
  });

  test("restores the prior value when the key existed before apply", () => {
    writeFileSync(settingsPath, JSON.stringify({ [COMPRESS_KEY]: false }));
    silence();
    applyCompress(settingsPath, NOW);
    expect(readKey()).toBe(true);
    restoreCompress(settingsPath, NOW);
    expect(readKey()).toBe(false);
  });

  test("no managed change → clean no-op", () => {
    writeFileSync(settingsPath, "{}");
    silence();
    expect(restoreCompress(settingsPath, NOW)).toBe(0);
  });
});
