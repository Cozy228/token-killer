import { chmodSync, mkdirSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { ReportDoc } from "../../../src/report/html.js";
import { writeReport } from "../../../src/report/open.js";

// Plan 011: the reports dir is shared with the `ctx support` diagnostic bundle, so
// HTML reports + their directory must be owner-only (0700 dir / 0600 file), not the
// world-readable 0755/0644 a bare mkdir/writeFile would leave on a multi-user host.
// POSIX modes are ignored on Windows, so every case is win32-skipped.
const skipOnWin = process.platform === "win32";

const DOC: ReportDoc = {
  kind: "gain",
  title: "Permission test report",
  subtitle: "fixture",
  generatedAt: "2026-06-15T00:00:00.000Z",
  data: {},
};

const NOW = Date.parse("2026-06-15T12:00:00.000Z");

let home: string;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "ctx-openperms-home-"));
  process.env.CONTEXA_HOME = home;
});

afterEach(() => {
  delete process.env.CONTEXA_HOME;
  rmSync(home, { recursive: true, force: true });
});

describe("report/open writeReport — owner-only permissions (plan 011)", () => {
  it.skipIf(skipOnWin)("creates the HTML file 0600 and the reports dir 0700", () => {
    const path = writeReport(DOC, NOW);
    expect(statSync(path).mode & 0o777).toBe(0o600);
    expect(statSync(dirname(path)).mode & 0o777).toBe(0o700);
  });

  it.skipIf(skipOnWin)("retroactively tightens a pre-existing world-listable 0755 dir", () => {
    // Regression guard for the mkdir no-op trap: mkdirSync's mode only applies on
    // creation, so a dir a prior ctx version made 0755 stays 0755 unless we chmod it.
    const reportsDir = join(home, "reports");
    mkdirSync(reportsDir, { recursive: true });
    chmodSync(reportsDir, 0o755);

    const path = writeReport(DOC, NOW);

    expect(dirname(path)).toBe(reportsDir); // home resolution sanity check
    expect(statSync(reportsDir).mode & 0o777).toBe(0o700);
  });

  it.skipIf(skipOnWin)("a second write into the now-0700 dir does not throw", () => {
    writeReport(DOC, NOW);
    expect(() => writeReport(DOC, NOW + 1000)).not.toThrow();
  });
});
