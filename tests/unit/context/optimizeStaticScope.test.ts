// Issue #41 — `tk optimize` triggers inspect ONLY for the static-context findings
// it consumes, so a first-time / no-bucket optimize never pays for the transcript
// scan + habit extraction it would discard. These tests pin: (1) no transcript
// scan runs on the optimize-triggered path, (2) the static findings produced by
// the scoped path match a full inspect, (3) no double cold-scan across user +
// project, and (4) the user is told why before the scoped scan runs.

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

// Spy on the runtime scan + habit extraction. `--static-only` must not call them;
// a full inspect must. The mocks preserve the real module surface (types, parseSince)
// and only track invocations of the two heavy passes.
const scanSpy = vi.fn<(...args: unknown[]) => void>();
const habitsSpy = vi.fn<(...args: unknown[]) => void>();
vi.mock("../../../src/inspect/scan.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../src/inspect/scan.js")>();
  return {
    ...actual,
    scan: (...args: Parameters<typeof actual.scan>) => {
      scanSpy(...args);
      return actual.scan(...args);
    },
  };
});
vi.mock("../../../src/inspect/habits.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../src/inspect/habits.js")>();
  return {
    ...actual,
    analyzeHabits: (...args: Parameters<typeof actual.analyzeHabits>) => {
      habitsSpy(...args);
      return actual.analyzeHabits(...args);
    },
  };
});
// The common UNFILTERED inspect path now does its runtime scan via the single-pass
// extractor (issue #39), not the exported `scan`/`analyzeHabits`. So "a full inspect
// did runtime work" is asserted here; `--static-only` must call NONE of the three.
const singlePassSpy = vi.fn<(...args: unknown[]) => void>();
vi.mock("../../../src/inspect/passes.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../src/inspect/passes.js")>();
  return {
    ...actual,
    inspectSinglePass: (...args: Parameters<typeof actual.inspectSinglePass>) => {
      singlePassSpy(...args);
      return actual.inspectSinglePass(...args);
    },
  };
});

// Imported AFTER the mocks so cli.ts binds the spied versions.
const { runInspect } = await import("../../../src/inspect/cli.js");
const { runOptimize } = await import("../../../src/context/optimizeCli.js");
const { registerAllRules } = await import("../../../src/context/rules/index.js");
const { readInspectBucket } = await import("../../../src/inspect/persist.js");
const { contextProjectFingerprint } = await import("../../../src/context/discover.js");
const { vscodeUserDir } = await import("../../../src/shim/hostConfig.js");

let root: string;
let home: string;
let cwd: string;

// Seed a VS Code transcript so a FULL inspect would have real runtime data to scan
// — making "no scan ran" a meaningful assertion, not a vacuous one.
function seedTranscripts(): void {
  // Platform-correct vscode user dir (so a real full inspect actually finds + scans).
  const ws = join(vscodeUserDir(process.platform, home), "workspaceStorage", "abc123");
  mkdirSync(join(ws, "chatSessions"), { recursive: true });
  mkdirSync(join(ws, "GitHub.copilot-chat", "transcripts"), { recursive: true });
  writeFileSync(join(ws, "chatSessions", "s1.jsonl"), "{}\n");
  writeFileSync(join(ws, "GitHub.copilot-chat", "transcripts", "t1.jsonl"), "{}\n");
}

function write(rel: string, content: string): void {
  const abs = join(cwd, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content);
}

function bloatedAgents(): string {
  return `# Rules\n${Array.from({ length: 300 }, (_, i) => `line ${i}`).join("\n")}\n`;
}

beforeEach(() => {
  registerAllRules();
  scanSpy.mockClear();
  habitsSpy.mockClear();
  singlePassSpy.mockClear();
  root = mkdtempSync(join(tmpdir(), "tk-opt-static-"));
  home = join(root, "home");
  cwd = join(root, "repo");
  mkdirSync(home, { recursive: true });
  mkdirSync(cwd, { recursive: true });
  process.env.TOKEN_KILLER_HOME = join(home, ".token-killer");
});
afterEach(() => {
  delete process.env.TOKEN_KILLER_HOME;
  rmSync(root, { recursive: true, force: true });
  vi.restoreAllMocks();
});

function silenceStdout() {
  return vi.spyOn(process.stdout, "write").mockImplementation(() => true);
}

describe("optimize triggers a static-only inspect (#41)", () => {
  test("--apply with no prior bucket does NOT run a transcript scan / habit pass", async () => {
    seedTranscripts();
    write("AGENTS.md", bloatedAgents());

    const s = silenceStdout();
    const code = await runOptimize(["--project", "--apply"], 1000, home, cwd, {});
    s.mockRestore();

    expect(code).toBe(0);
    // The discarded heavy passes never ran on the optimize-triggered cold path.
    expect(scanSpy).not.toHaveBeenCalled();
    expect(habitsSpy).not.toHaveBeenCalled();
    expect(singlePassSpy).not.toHaveBeenCalled();
    // But the bucket WAS populated with static findings it can consume.
    const bucket = readInspectBucket({
      scope: "project",
      fingerprint: contextProjectFingerprint(cwd),
    });
    expect(
      bucket?.findings.some((f) => (f as { source?: string }).source === "static_context"),
    ).toBe(true);
  });

  test("default preview path is also static-only (no scan)", async () => {
    seedTranscripts();
    write("AGENTS.md", bloatedAgents());

    const s = silenceStdout();
    const code = await runOptimize(["--project"], 1000, home, cwd, {});
    s.mockRestore();

    expect(code).toBe(0);
    expect(scanSpy).not.toHaveBeenCalled();
    expect(habitsSpy).not.toHaveBeenCalled();
    expect(singlePassSpy).not.toHaveBeenCalled();
  });

  test("static findings from the scoped path match those from a full inspect", async () => {
    seedTranscripts();
    write("AGENTS.md", bloatedAgents());

    // Full inspect (runtime + static).
    const sFull = silenceStdout();
    runInspect(["--project", "--text"], 1000, home, cwd);
    sFull.mockRestore();
    const fullBucket = readInspectBucket({
      scope: "project",
      fingerprint: contextProjectFingerprint(cwd),
    });
    const fullStatic = (fullBucket?.findings ?? []).filter(
      (f) => (f as { source?: string }).source === "static_context",
    );
    expect(singlePassSpy).toHaveBeenCalled(); // a full inspect DOES run the single-pass scan

    // Wipe the bucket; re-derive via the static-only path.
    rmSync(join(home, ".token-killer"), { recursive: true, force: true });
    scanSpy.mockClear();
    singlePassSpy.mockClear();
    const sScoped = silenceStdout();
    runInspect(["--project", "--static-only", "--text"], 1000, home, cwd);
    sScoped.mockRestore();
    const scopedBucket = readInspectBucket({
      scope: "project",
      fingerprint: contextProjectFingerprint(cwd),
    });
    const scopedStatic = (scopedBucket?.findings ?? []).filter(
      (f) => (f as { source?: string }).source === "static_context",
    );

    expect(scanSpy).not.toHaveBeenCalled(); // the scoped path does NOT scan
    expect(singlePassSpy).not.toHaveBeenCalled(); // …nor run the single-pass extractor
    expect(scopedStatic.length).toBeGreaterThan(0);
    // Identical static findings (type + file + severity), order-independent.
    const key = (f: { type: string; file?: string; severity: string }) =>
      `${f.type}|${f.file ?? ""}|${f.severity}`;
    expect(scopedStatic.map(key as never).sort()).toEqual(fullStatic.map(key as never).sort());
  });

  test("no double cold-scan across user + project for the static-only need", async () => {
    // A git repo resolves ["user","project"] — two scopes, two static-only triggers,
    // but ZERO transcript scans.
    mkdirSync(join(cwd, ".git"), { recursive: true });
    seedTranscripts();
    write("AGENTS.md", bloatedAgents());

    const s = silenceStdout();
    const code = await runOptimize(["--apply"], 1000, home, cwd, {});
    s.mockRestore();

    expect(code).toBe(0);
    expect(scanSpy).not.toHaveBeenCalled();
    expect(habitsSpy).not.toHaveBeenCalled();
    expect(singlePassSpy).not.toHaveBeenCalled();
  });

  test("user is told why before the scoped scan runs", async () => {
    seedTranscripts();
    write("AGENTS.md", bloatedAgents());

    const errs: string[] = [];
    const errSpy = vi.spyOn(process.stderr, "write").mockImplementation((c: unknown) => {
      errs.push(String(c));
      return true;
    });
    const s = silenceStdout();
    await runOptimize(["--project", "--apply"], 1000, home, cwd, {});
    s.mockRestore();
    errSpy.mockRestore();

    const out = errs.join("");
    expect(out).toContain("no prior inspect");
    expect(out).toContain("tk inspect");
  });
});
