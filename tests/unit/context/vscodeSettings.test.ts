import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  COMPRESS_KEY,
  analyzeVscodeSettings,
  applyCompress,
  readVscodeSettingsFile,
  renderVscodeReport,
  restoreCompress,
} from "../../../src/context/vscodeSettings.js";

let root: string;
let settingsPath: string;
const NOW = Date.UTC(2026, 5, 6);

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "tk-vscode-"));
  settingsPath = join(root, "settings.json");
  process.env.TOKEN_KILLER_HOME = join(root, ".token-killer");
});
afterEach(() => {
  delete process.env.TOKEN_KILLER_HOME;
  rmSync(root, { recursive: true, force: true });
  vi.restoreAllMocks();
});

function silence() {
  return vi.spyOn(process.stdout, "write").mockImplementation(() => true);
}
function readKey(): unknown {
  return (JSON.parse(readFileSync(settingsPath, "utf8")) as Record<string, unknown>)[COMPRESS_KEY];
}

describe("analyzeVscodeSettings", () => {
  test("reports compress on/off and only flags risky values", () => {
    const off = analyzeVscodeSettings({ "editor.fontSize": 13 });
    expect(off.compress).toBe("off");
    expect(off.contextRisks).toEqual([]);
    expect(off.budgetRisks).toEqual([]);

    const on = analyzeVscodeSettings({
      [COMPRESS_KEY]: true,
      "chat.mcp.discovery.enabled": true,
      "github.copilot.chat.additionalReadAccessFolders": ["/a"],
      "chat.agent.maxRequests": 25,
      "github.copilot.chat.agent.autoFix": true,
    });
    expect(on.compress).toBe("on");
    expect(on.contextRisks).toHaveLength(2);
    expect(on.budgetRisks).toHaveLength(2);
    expect(on.budgetRisks[0]).toContain("25");
  });

  test("maxRequests at or below 15 and empty read-folders are not flagged", () => {
    const a = analyzeVscodeSettings({
      "chat.agent.maxRequests": 12,
      "github.copilot.chat.additionalReadAccessFolders": [],
    });
    expect(a.budgetRisks).toEqual([]);
    expect(a.contextRisks).toEqual([]);
  });
});

describe("readVscodeSettingsFile", () => {
  test("missing file → missing; JSONC → parse_error; valid → ok", () => {
    expect(readVscodeSettingsFile(settingsPath).status).toBe("missing");
    writeFileSync(settingsPath, '{ "a": 1, /* comment */ }');
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
    expect((JSON.parse(readFileSync(settingsPath, "utf8")) as Record<string, unknown>)["editor.fontSize"]).toBe(13);
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

  test("refuses JSONC (returns 1, leaves file untouched)", () => {
    const original = '{ "a": 1, // keep\n}';
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

describe("renderVscodeReport", () => {
  test("off-state recommends apply; advisories listed but not applied", () => {
    const report = renderVscodeReport(
      settingsPath,
      analyzeVscodeSettings({ "chat.mcp.discovery.enabled": true }),
    );
    expect(report).toContain("--vscode-settings --apply");
    expect(report).toContain("advisory");
    expect(report).toContain("chat.mcp.discovery.enabled");
  });
});
