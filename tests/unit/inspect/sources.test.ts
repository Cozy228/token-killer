import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { discoverSources } from "../../../src/inspect/sources.js";
import { vscodeUserDir } from "../../../src/shim/hostConfig.js";

let home: string;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "tg-inspect-src-"));
});
afterEach(() => {
  rmSync(home, { recursive: true, force: true });
});

describe("discoverSources — vscode", () => {
  test("missing storage → not found (normal, not an error)", () => {
    const d = discoverSources("vscode", home, "linux");
    expect(d.found).toBe(false);
    expect(d.sessionFiles).toEqual([]);
    expect(d.transcriptFiles).toEqual([]);
  });

  test("finds chatSessions and copilot-chat transcripts under workspaceStorage", () => {
    const userDir = vscodeUserDir("linux", home);
    const ws = join(userDir, "workspaceStorage", "abc123");
    mkdirSync(join(ws, "chatSessions"), { recursive: true });
    mkdirSync(join(ws, "GitHub.copilot-chat", "transcripts"), { recursive: true });
    writeFileSync(join(ws, "chatSessions", "s1.jsonl"), "{}\n");
    writeFileSync(join(ws, "GitHub.copilot-chat", "transcripts", "t1.jsonl"), "{}\n");

    const d = discoverSources("vscode", home, "linux");
    expect(d.found).toBe(true);
    expect(d.sessionFiles.some((f) => f.endsWith("s1.jsonl"))).toBe(true);
    expect(d.transcriptFiles.some((f) => f.endsWith("t1.jsonl"))).toBe(true);
  });

  test("ignores non-jsonl files", () => {
    const userDir = vscodeUserDir("linux", home);
    const ws = join(userDir, "workspaceStorage", "abc");
    mkdirSync(join(ws, "chatSessions"), { recursive: true });
    writeFileSync(join(ws, "chatSessions", "notes.txt"), "x");
    expect(discoverSources("vscode", home, "linux").found).toBe(false);
  });
});

describe("discoverSources — copilot-cli", () => {
  test("missing ~/.copilot → not found", () => {
    expect(discoverSources("copilot-cli", home).found).toBe(false);
  });

  test("finds session-state jsonl under ~/.copilot", () => {
    mkdirSync(join(home, ".copilot", "history"), { recursive: true });
    writeFileSync(join(home, ".copilot", "history", "h.jsonl"), "{}\n");
    const d = discoverSources("copilot-cli", home);
    expect(d.found).toBe(true);
    expect(d.transcriptFiles.some((f) => f.endsWith("h.jsonl"))).toBe(true);
  });
});
