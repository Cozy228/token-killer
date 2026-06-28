import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  discoverHosts,
  discoverSources,
  hostFound,
  mergeHosts,
} from "../../../src/inspect/sources.js";
import { vscodeUserDir } from "../../../src/shim/hostConfig.js";

let home: string;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "tk-inspect-src-"));
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

  test("finds flat-layout jsonl under ~/.copilot/history (older builds)", () => {
    mkdirSync(join(home, ".copilot", "history"), { recursive: true });
    writeFileSync(join(home, ".copilot", "history", "h.jsonl"), "{}\n");
    const d = discoverSources("copilot-cli", home);
    expect(d.found).toBe(true);
    expect(d.transcriptFiles.some((f) => f.endsWith("h.jsonl"))).toBe(true);
  });

  // Modern layout (copilot ≥1.0): ONE dir per session, each holding events.jsonl.
  test("finds per-session events.jsonl under session-state/<id>/ as session files", () => {
    const sid = "8eb01199-fdf2-45bc-82b9-f7b28ee95d60";
    mkdirSync(join(home, ".copilot", "session-state", sid), { recursive: true });
    writeFileSync(
      join(home, ".copilot", "session-state", sid, "events.jsonl"),
      '{"type":"session.start","data":{}}\n',
    );
    const d = discoverSources("copilot-cli", home);
    expect(d.found).toBe(true);
    // events.jsonl counts as a SESSION file (each dir = one session), not a transcript.
    expect(d.sessionFiles.some((f) => f.endsWith("events.jsonl"))).toBe(true);
  });

  test("counts one session file per session-state subdir", () => {
    for (const sid of ["aaa", "bbb", "ccc"]) {
      mkdirSync(join(home, ".copilot", "session-state", sid), { recursive: true });
      writeFileSync(join(home, ".copilot", "session-state", sid, "events.jsonl"), "{}\n");
    }
    const d = discoverSources("copilot-cli", home);
    expect(d.sessionFiles.filter((f) => f.endsWith("events.jsonl"))).toHaveLength(3);
  });

  // Official: COPILOT_HOME replaces the ENTIRE ~/.copilot path. A decoy under the
  // default ~/.copilot must be ignored when COPILOT_HOME points elsewhere.
  test("honors COPILOT_HOME as the config root (official override of ~/.copilot)", () => {
    const copilotHome = mkdtempSync(join(tmpdir(), "tk-copilot-home-"));
    mkdirSync(join(home, ".copilot", "session-state", "decoy"), { recursive: true });
    writeFileSync(join(home, ".copilot", "session-state", "decoy", "events.jsonl"), "{}\n");
    mkdirSync(join(copilotHome, "session-state", "real"), { recursive: true });
    writeFileSync(join(copilotHome, "session-state", "real", "events.jsonl"), "{}\n");

    process.env.COPILOT_HOME = copilotHome;
    try {
      const d = discoverSources("copilot-cli", home);
      expect(d.found).toBe(true);
      expect(d.sessionFiles).toHaveLength(1); // only the COPILOT_HOME one, not the decoy
      expect(d.sessionFiles[0]).toContain(copilotHome);
      expect(d.sessionFiles[0]).not.toContain(join(home, ".copilot"));
      expect(discoverHosts(home, "linux")[1]!.dir).toBe(copilotHome);
    } finally {
      delete process.env.COPILOT_HOME;
      rmSync(copilotHome, { recursive: true, force: true });
    }
  });
});

describe("discoverHosts / mergeHosts — multi-host (default, no --input-type)", () => {
  test("discovers BOTH hosts, each carrying its resolved dir", () => {
    const hosts = discoverHosts(home, "linux");
    expect(hosts.map((h) => h.inputType)).toEqual(["vscode", "copilot-cli"]);
    expect(hosts[0]!.dir).toBe(vscodeUserDir("linux", home));
    expect(hosts[1]!.dir).toBe(join(home, ".copilot"));
  });

  test("merges files across hosts; found is true if ANY host has data", () => {
    // Give only the Copilot CLI data.
    mkdirSync(join(home, ".copilot", "history"), { recursive: true });
    writeFileSync(join(home, ".copilot", "history", "h.jsonl"), "{}\n");

    const hosts = discoverHosts(home, "linux");
    expect(hosts.filter(hostFound).map((h) => h.inputType)).toEqual(["copilot-cli"]);

    const merged = mergeHosts(hosts);
    expect(merged.found).toBe(true);
    expect(merged.transcriptFiles.some((f) => f.endsWith("h.jsonl"))).toBe(true);
  });

  test("merged is not-found when no host has data", () => {
    const merged = mergeHosts(discoverHosts(home, "linux"));
    expect(merged.found).toBe(false);
  });
});
