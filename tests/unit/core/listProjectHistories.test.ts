import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";

import { tokenGuardHome } from "../../../src/core/dataDir.js";
import { listProjectHistories, type HistoryRecord } from "../../../src/core/history.js";

const previousHome = process.env.TOKEN_GUARD_HOME;

afterEach(() => {
  if (previousHome === undefined) {
    delete process.env.TOKEN_GUARD_HOME;
  } else {
    process.env.TOKEN_GUARD_HOME = previousHome;
  }
});

function row(fingerprint: string): HistoryRecord {
  return {
    timestamp: "2026-06-01T12:00:00.000Z",
    command: "git status",
    handler: "git-status",
    raw_chars: 400,
    output_chars: 100,
    raw_tokens: 100,
    output_tokens: 25,
    saved_tokens: 75,
    savings_pct: 75,
    exit_code: 0,
    duration_ms: 10,
    quality_status: "passed",
    project_fingerprint: fingerprint,
  };
}

async function writeProjectHistory(home: string, fingerprint: string, rows: HistoryRecord[]) {
  const dir = path.join(home, "projects", fingerprint);
  await mkdir(dir, { recursive: true });
  await writeFile(
    path.join(dir, "history.jsonl"),
    `${rows.map((r) => JSON.stringify(r)).join("\n")}\n`,
  );
}

describe("listProjectHistories", () => {
  test("returns [] when the home has no projects dir", async () => {
    const home = await mkdtemp(path.join(tmpdir(), "tg-user-"));
    process.env.TOKEN_GUARD_HOME = home;
    try {
      expect(tokenGuardHome()).toBe(home);
      expect(await listProjectHistories()).toEqual([]);
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  test("aggregates rows across every project, preserving fingerprints", async () => {
    const home = await mkdtemp(path.join(tmpdir(), "tg-user-"));
    process.env.TOKEN_GUARD_HOME = home;
    try {
      await writeProjectHistory(home, "repo:aaaaaaaaaaaa", [row("repo:aaaaaaaaaaaa")]);
      await writeProjectHistory(home, "repo:bbbbbbbbbbbb", [
        row("repo:bbbbbbbbbbbb"),
        row("repo:bbbbbbbbbbbb"),
      ]);

      const all = await listProjectHistories();
      expect(all).toHaveLength(3);
      expect(new Set(all.map((r) => r.project_fingerprint))).toEqual(
        new Set(["repo:aaaaaaaaaaaa", "repo:bbbbbbbbbbbb"]),
      );
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  test("skips a corrupt project store instead of throwing", async () => {
    const home = await mkdtemp(path.join(tmpdir(), "tg-user-"));
    process.env.TOKEN_GUARD_HOME = home;
    try {
      await writeProjectHistory(home, "repo:aaaaaaaaaaaa", [row("repo:aaaaaaaaaaaa")]);
      const badDir = path.join(home, "projects", "repo:cccccccccccc");
      await mkdir(badDir, { recursive: true });
      await writeFile(path.join(badDir, "history.jsonl"), "{ not valid json\n");

      const all = await listProjectHistories();
      expect(all).toHaveLength(1);
      expect(all[0].project_fingerprint).toBe("repo:aaaaaaaaaaaa");
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });
});
