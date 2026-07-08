import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  fingerprintSegment,
  projectFingerprint,
  resetFingerprintCacheForTests,
} from "../../../src/core/dataDir.js";
import { runDoctor } from "../../../src/shim/doctor.js";

// In-process orchestration tests for `ctx doctor`. gatherStatus() spawns the host
// `--version` probes (absent on the test box → fast fail) and writes only into the
// throwaway CONTEXA_HOME, so these stay hermetic. The records-store assertions
// are the point: read-only never mutates; --fix archives orphans; the `status` alias
// is read-only even with --fix.

let home: string;
let prevHome: string | undefined;

function projectsDir(): string {
  return join(home, "projects");
}
function bucket(name: string, files: Record<string, string>): void {
  const dir = join(projectsDir(), name);
  mkdirSync(dir, { recursive: true });
  for (const [k, v] of Object.entries(files)) writeFileSync(join(dir, k), v);
}

function fingerprintBucket(fingerprint: string, files: Record<string, string>): void {
  bucket(fingerprintSegment(fingerprint), files);
}

async function capture(fn: () => Promise<unknown>): Promise<string> {
  const lines: string[] = [];
  const spy = vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
    lines.push(String(chunk));
    return true;
  });
  try {
    await fn();
  } finally {
    spy.mockRestore();
  }
  return lines.join("");
}

beforeEach(() => {
  prevHome = process.env.CONTEXA_HOME;
  home = mkdtempSync(join(tmpdir(), "ctx-doctor-"));
  process.env.CONTEXA_HOME = home;
  resetFingerprintCacheForTests();
});
afterEach(() => {
  if (prevHome === undefined) delete process.env.CONTEXA_HOME;
  else process.env.CONTEXA_HOME = prevHome;
  rmSync(home, { recursive: true, force: true });
});

describe("runDoctor", () => {
  test("read-only reports an orphan bucket and mutates nothing", async () => {
    fingerprintBucket("repo:aaaaaaaaaaaa", { "history.jsonl": '{"command":"x"}\n' });
    const output = await capture(() => runDoctor([]));
    expect(output).toContain("Records health:");
    expect(output).toContain("orphan bucket");
    expect(output).toContain("Run `ctx doctor --fix");
    // No archive, original bucket intact.
    expect(existsSync(join(projectsDir(), fingerprintSegment("repo:aaaaaaaaaaaa")))).toBe(true);
    expect(existsSync(join(projectsDir(), "archived"))).toBe(false);
  });

  test("--fix archives an unresolved orphan and preserves its tokens", async () => {
    fingerprintBucket("repo:bbbbbbbbbbbb", { "history.jsonl": '{"command":"o"}\n' });
    const output = await capture(() => runDoctor(["--fix"]));
    expect(output).toContain("archived 1 unresolved orphan");
    expect(existsSync(join(projectsDir(), fingerprintSegment("repo:bbbbbbbbbbbb")))).toBe(false);
    expect(existsSync(join(projectsDir(), "archived", "history.jsonl"))).toBe(true);
  });

  test("--fix with a scan root recovers a real project name instead of archiving", async () => {
    const scanRoot = mkdtempSync(join(tmpdir(), "ctx-scan-"));
    const repoDir = join(scanRoot, "named-repo");
    mkdirSync(join(repoDir, ".git"), { recursive: true });
    const seg = fingerprintSegment(projectFingerprint(repoDir));
    bucket(seg, { "history.jsonl": '{"command":"o"}\n' });

    const output = await capture(() => runDoctor(["--fix", scanRoot]));
    expect(output).toContain("→ named-repo");
    // Recovered, not archived.
    expect(existsSync(join(projectsDir(), seg))).toBe(true);
    expect(existsSync(join(projectsDir(), "archived"))).toBe(false);

    rmSync(scanRoot, { recursive: true, force: true });
  });
});
