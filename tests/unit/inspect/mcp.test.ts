import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { analyzeMcpServers } from "../../../src/inspect/mcp.js";
import { mcpBloatFinding } from "../../../src/inspect/advice.js";

let home: string;
let cwd: string;

beforeEach(() => {
  const root = mkdtempSync(join(tmpdir(), "tk-mcp-"));
  home = join(root, "home");
  cwd = join(root, "repo");
  mkdirSync(home, { recursive: true });
  mkdirSync(cwd, { recursive: true });
});
afterEach(() => {
  rmSync(home, { recursive: true, force: true });
  rmSync(cwd, { recursive: true, force: true });
});

function writeJson(path: string, obj: unknown): void {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, JSON.stringify(obj));
}

describe("analyzeMcpServers", () => {
  test("counts servers across config files, dedups by name", () => {
    writeJson(join(home, ".copilot", "mcp-config.json"), {
      mcpServers: { github: {}, slack: {} },
    });
    writeJson(join(cwd, ".mcp.json"), { mcpServers: { github: {}, sentry: {} } });
    const r = analyzeMcpServers(home, cwd);
    expect(r.servers.sort()).toEqual(["github", "sentry", "slack"]);
  });

  test("supports the VS Code `servers` key and JSONC comments", () => {
    writeFileSync(join(cwd, ".vscode-mcp-not-used.json"), "");
    mkdirSync(join(cwd, ".vscode"), { recursive: true });
    writeFileSync(
      join(cwd, ".vscode", "mcp.json"),
      '{ // my servers\n  "servers": { "playwright": {} },\n}',
    );
    expect(analyzeMcpServers(home, cwd).servers).toEqual(["playwright"]);
  });

  test("respects per-server disabled/enabled toggles", () => {
    writeJson(join(home, ".cursor", "mcp.json"), {
      mcpServers: { a: {}, b: { disabled: true }, c: { enabled: false } },
    });
    expect(analyzeMcpServers(home, cwd).servers).toEqual(["a"]);
  });

  test("malformed config is skipped, never throws", () => {
    writeFileSync(join(home, ".claude.json"), "{ not json");
    expect(analyzeMcpServers(home, cwd).servers).toEqual([]);
  });
});

describe("mcpBloatFinding", () => {
  test("fires at or above the 3-server limit", () => {
    const f = mcpBloatFinding(3, ["github", "slack", "sentry"]);
    expect(f).toBeDefined();
    expect(f!.type).toBe("mcp-bloat");
    expect(f!.recommendation).toMatch(/CLI|17×|disable/i);
  });

  test("no finding below the limit", () => {
    expect(mcpBloatFinding(2, ["github", "slack"])).toBeUndefined();
  });
});
