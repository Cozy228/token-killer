import { mkdir, mkdtemp, readdir, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { rawOutputDir } from "../../../src/core/dataDir.js";
import { gcRawStore } from "../../../src/core/gc.js";

let home: string;
let cwd: string;

beforeEach(async () => {
  home = await mkdtemp(path.join(tmpdir(), "tk-gc-home-"));
  cwd = await mkdtemp(path.join(tmpdir(), "tk-gc-cwd-"));
  process.env.TOKEN_KILLER_HOME = home;
});

afterEach(async () => {
  delete process.env.TOKEN_KILLER_HOME;
  await rm(home, { recursive: true, force: true });
  await rm(cwd, { recursive: true, force: true });
});

describe("gcRawStore — H4 (cold-path raw GC)", () => {
  test("deletes snapshots older than 7 days, keeps recent ones", async () => {
    const dir = rawOutputDir(cwd);
    await mkdir(dir, { recursive: true });
    const oldLog = path.join(dir, "old.log");
    const freshLog = path.join(dir, "fresh.log");
    await writeFile(oldLog, "x");
    await writeFile(freshLog, "y");
    const now = Date.now();
    const eightDaysAgoSec = (now - 8 * 24 * 60 * 60 * 1000) / 1000;
    await utimes(oldLog, eightDaysAgoSec, eightDaysAgoSec);

    await gcRawStore(cwd, now);

    const remaining = await readdir(dir);
    expect(remaining).toContain("fresh.log");
    expect(remaining).not.toContain("old.log");
  });

  test("a missing raw dir is a fail-open no-op", async () => {
    await expect(gcRawStore(cwd, Date.now())).resolves.toBeUndefined();
  });

  test("never touches non-.log files (e.g. in-flight .tmp)", async () => {
    const dir = rawOutputDir(cwd);
    await mkdir(dir, { recursive: true });
    const tmpFile = path.join(dir, "snap.log.1234.5.tmp");
    await writeFile(tmpFile, "z");
    const now = Date.now();
    const eightDaysAgoSec = (now - 8 * 24 * 60 * 60 * 1000) / 1000;
    await utimes(tmpFile, eightDaysAgoSec, eightDaysAgoSec); // old, but not a .log

    await gcRawStore(cwd, now);

    expect(await readdir(dir)).toContain("snap.log.1234.5.tmp");
  });
});
