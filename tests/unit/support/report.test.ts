import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

import { errorLogPath } from "../../../src/hook/debug.js";
import {
  buildSupportReport,
  scrubHome,
  scrubHomePath,
  tailFile,
  writeSupportBundle,
} from "../../../src/support/report.js";

let home: string;
const origHome = process.env.TOKEN_KILLER_HOME;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "tk-support-home-"));
  process.env.TOKEN_KILLER_HOME = home;
});

afterEach(() => {
  rmSync(home, { recursive: true, force: true });
  if (origHome === undefined) delete process.env.TOKEN_KILLER_HOME;
  else process.env.TOKEN_KILLER_HOME = origHome;
});

describe("scrubHome (support-boundary scrubber)", () => {
  test("rewrites the home dir to ~ (covers the saved path the CLI puts into the mailto body)", () => {
    expect(scrubHomePath(join(homedir(), ".token-killer/reports/support-x.md"))).toBe(
      "~/.token-killer/reports/support-x.md",
    );
  });

  test("leaves text without the home dir unchanged", () => {
    expect(scrubHome("no home here")).toBe("no home here");
  });
});

describe("tailFile", () => {
  test("missing file ⇒ (none)", () => {
    expect(tailFile(join(home, "absent.log"), 10)).toBe("(none)");
  });

  test("returns the last N lines without trailing-newline padding", () => {
    const p = join(home, "x.log");
    writeFileSync(p, "a\nb\nc\nd\n");
    expect(tailFile(p, 2)).toBe("c\nd");
  });
});

describe("buildSupportReport", () => {
  test("summary carries version/platform/node/host; errors.log tail is included and home-scrubbed", async () => {
    writeFileSync(errorLogPath(), `boom near ${homedir()}/secret/path\n`);
    const { markdown, summary } = await buildSupportReport({ cwd: process.cwd(), redact: false });

    expect(summary).toMatch(/^tk \S+ · \S+\/\S+ · node \S+ · host \S+$/m);
    expect(markdown).toContain("## Recent errors (errors.log)");
    // The home dir is scrubbed to ~ in the appended errors section.
    expect(markdown).toContain("boom near ~/secret/path");
    expect(markdown).not.toContain(`${homedir()}/secret/path`);
    // The summary's `last error:` line ALSO travels off-machine (mailto body / Teams
    // pointer), so it must be scrubbed too — pins the privacy regression.
    expect(summary).toContain("last error: boom near ~/secret/path");
    expect(summary).not.toContain(`${homedir()}/secret/path`);
  });

  test("--redact ⇒ length-only errors section, no error body, redacted summary", async () => {
    writeFileSync(errorLogPath(), "sensitive crash detail line\n");
    const { markdown, summary } = await buildSupportReport({ cwd: process.cwd(), redact: true });

    expect(markdown).toContain("## Recent errors (errors.log)");
    expect(markdown).not.toContain("sensitive crash detail line");
    expect(markdown).toMatch(/\d+ lines, \d+ chars — body redacted/);
    expect(summary).toContain("last error: (redacted)");
  });

  test("missing errors.log ⇒ (none)", async () => {
    const { markdown } = await buildSupportReport({ cwd: process.cwd(), redact: false });
    expect(markdown).toContain("## Recent errors (errors.log)");
    expect(markdown).toContain("(none)");
  });
});

describe("writeSupportBundle", () => {
  test("writes support-<ts>.md under ~/.token-killer/reports/ and returns the path", () => {
    const path = writeSupportBundle("# report\n", Date.UTC(2026, 5, 13, 1, 2, 3));
    expect(path).toContain(join(home, "reports"));
    expect(path).toMatch(/support-2026-06-13T01-02-03-000Z\.md$/);
  });

  // POSIX only — Windows has no 0600 bit (uses ACLs); the assertion is meaningless there.
  test.skipIf(process.platform === "win32")(
    "creates the bundle 0600 inside a 0700 reports dir (not shared-host-readable)",
    () => {
      const path = writeSupportBundle(
        "# sensitive: commands, output, logs, config\n",
        Date.UTC(2026, 5, 14),
      );
      expect(statSync(path).mode & 0o777).toBe(0o600);
      expect(statSync(join(home, "reports")).mode & 0o777).toBe(0o700);
    },
  );
});
