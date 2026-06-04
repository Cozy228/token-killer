import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, test, vi } from "vitest";

import {
  historyFile,
  projectFingerprint,
  rawOutputPathRelative,
  tokenGuardHome,
} from "../../src/core/dataDir.js";

const previousHome = process.env.TOKEN_GUARD_HOME;

afterEach(async () => {
  if (previousHome === undefined) {
    delete process.env.TOKEN_GUARD_HOME;
  } else {
    process.env.TOKEN_GUARD_HOME = previousHome;
  }
});

describe("dataDir", () => {
  test("stores project data under TOKEN_GUARD_HOME", async () => {
    const home = await mkdtemp(path.join(tmpdir(), "tg-home-"));
    process.env.TOKEN_GUARD_HOME = home;
    const cwd = path.join(home, "workspace");
    const fingerprint = projectFingerprint(cwd);

    expect(tokenGuardHome()).toBe(home);
    expect(fingerprint).toMatch(/^repo:[a-f0-9]{12}$/);
    expect(historyFile(cwd)).toBe(
      path.join(home, "projects", fingerprint, "history.jsonl"),
    );
    expect(rawOutputPathRelative(cwd, "sample.log")).toBe(
      path.join("projects", fingerprint, "raw", "sample.log"),
    );

    await rm(home, { recursive: true, force: true });
  });

  test("spawn passes TOKEN_GUARD_HOME under vitest", () => {
    const probe = spawnSync(process.execPath, ["-e", "console.log(process.env.TOKEN_GUARD_HOME || 'missing')"], {
      encoding: "utf8",
      env: { ...process.env, TOKEN_GUARD_HOME: "/tmp/tg-probe-home" },
    });
    expect(probe.stdout.trim()).toBe("/tmp/tg-probe-home");
  });

  test("CLI subprocess respects TOKEN_GUARD_HOME", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "tg-env-cli-"));
    const tgHome = path.join(dir, "tg-data");
    const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
    const cli = path.join(repoRoot, "src/cli.ts");
    await writeFile(path.join(dir, "sample.txt"), "hello\n");
    const tsxLoader = path.join(repoRoot, "node_modules/tsx/dist/loader.mjs");
    const result = spawnSync(
      process.execPath,
      ["--import", tsxLoader, cli, "cat", "sample.txt"],
      {
        cwd: dir,
        encoding: "utf8",
        env: { ...process.env, TOKEN_GUARD_HOME: tgHome },
      },
    );

    expect(result.status, result.stderr || result.stdout).toBe(0);
    process.env.TOKEN_GUARD_HOME = tgHome;
    const expectedHistory = historyFile(dir);
    const history = await readFile(expectedHistory, "utf8");
    expect(history).toContain("cat sample.txt");

    await rm(dir, { recursive: true, force: true });
  });
});
