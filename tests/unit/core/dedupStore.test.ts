import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import {
  type DedupEntry,
  TTL_MS,
  entryKey,
  hashOutput,
  isFresh,
  normalizeCommand,
  readStore,
  upsertEntry,
} from "../../../src/core/dedupStore.js";
import type { ParsedCommand } from "../../../src/types.js";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "tk-dedupstore-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

function cmd(program: string, args: string[]): ParsedCommand {
  return {
    program,
    args,
    original: [program, ...args],
    displayCommand: [program, ...args].join(" "),
  };
}

function entry(over: Partial<DedupEntry> = {}): DedupEntry {
  return {
    normCmd: "git status",
    outHash: "abc",
    exitCode: 0,
    ttlClass: "fast",
    lastEmittedAt: 1000,
    lastDifferedAt: 1000,
    rawPointer: "projects/repo/raw/x.log",
    ...over,
  };
}

describe("normalizeCommand + entryKey", () => {
  test("basenames the program so ls and /bin/ls share a key", () => {
    expect(normalizeCommand(cmd("/bin/ls", ["-la"]))).toBe("ls -la");
    expect(normalizeCommand(cmd("ls", ["-la"]))).toBe("ls -la");
    expect(entryKey(normalizeCommand(cmd("/bin/ls", ["-la"])))).toBe(
      entryKey(normalizeCommand(cmd("ls", ["-la"]))),
    );
  });

  test("preserves whitespace inside an arg token so distinct commands get distinct keys", () => {
    // A grep pattern with two spaces must NOT collapse into the single-space form.
    expect(normalizeCommand(cmd("grep", ["foo  bar", "src"]))).toBe("grep foo  bar src");
    expect(entryKey(normalizeCommand(cmd("grep", ["foo  bar"])))).not.toBe(
      entryKey(normalizeCommand(cmd("grep", ["foo bar"]))),
    );
  });

  test("different commands get different keys", () => {
    expect(entryKey("git status")).not.toBe(entryKey("git diff"));
  });

  test("hashOutput is stable and content-sensitive", () => {
    expect(hashOutput("same")).toBe(hashOutput("same"));
    expect(hashOutput("a")).not.toBe(hashOutput("b"));
  });
});

describe("isFresh — wall-clock TTL by class", () => {
  test("fresh within the window, stale past it", () => {
    const e = entry({ ttlClass: "fast", lastEmittedAt: 1000 });
    expect(isFresh(e, 1000 + TTL_MS.fast)).toBe(true);
    expect(isFresh(e, 1000 + TTL_MS.fast + 1)).toBe(false);
  });

  test("slow window is longer than fast", () => {
    expect(TTL_MS.slow).toBeGreaterThan(TTL_MS.fast);
    const slow = entry({ ttlClass: "slow", lastEmittedAt: 0 });
    expect(isFresh(slow, TTL_MS.fast + 1)).toBe(true);
  });
});

describe("readStore — fail-open", () => {
  test("missing file reads as empty", async () => {
    const store = await readStore(path.join(dir, "nope.json"));
    expect(store).toEqual({ v: 1, entries: {} });
  });

  test("corrupt file reads as empty (never throws)", async () => {
    const file = path.join(dir, "dedup.json");
    await writeFile(file, "{ not json", "utf8");
    expect(await readStore(file)).toEqual({ v: 1, entries: {} });
  });

  test("wrong-version file reads as empty", async () => {
    const file = path.join(dir, "dedup.json");
    await writeFile(file, JSON.stringify({ v: 99, entries: { a: entry() } }), "utf8");
    expect(await readStore(file)).toEqual({ v: 1, entries: {} });
  });
});

describe("upsertEntry — atomic, locked, fail-open", () => {
  test("a sequential upsert persists and round-trips", async () => {
    const file = path.join(dir, "dedup.json");
    await upsertEntry(file, "k1", entry({ normCmd: "git status" }), 2000);
    const store = await readStore(file);
    expect(store.entries.k1?.normCmd).toBe("git status");
  });

  test("upserting the same key updates in place", async () => {
    const file = path.join(dir, "dedup.json");
    await upsertEntry(file, "k1", entry({ outHash: "v1" }), 2000);
    await upsertEntry(file, "k1", entry({ outHash: "v2" }), 3000);
    const store = await readStore(file);
    expect(Object.keys(store.entries)).toHaveLength(1);
    expect(store.entries.k1?.outHash).toBe("v2");
  });

  test("hard-expired entries are pruned on write", async () => {
    const file = path.join(dir, "dedup.json");
    // An entry far in the past, then a fresh write 2h later.
    await upsertEntry(file, "old", entry({ lastEmittedAt: 0 }), 0);
    await upsertEntry(file, "new", entry({ lastEmittedAt: 2 * 3600_000 }), 2 * 3600_000);
    const store = await readStore(file);
    expect(store.entries.old).toBeUndefined();
    expect(store.entries.new).toBeDefined();
  });

  test("concurrent writers never corrupt the store (atomic rename)", async () => {
    const file = path.join(dir, "dedup.json");
    const writers = Array.from({ length: 24 }, (_, i) =>
      upsertEntry(file, `k${i}`, entry({ normCmd: `cmd ${i}` }), 5000 + i),
    );
    await Promise.all(writers);
    // The file is always a complete, valid store — never a torn write.
    const store = await readStore(file);
    expect(store.v).toBe(1);
    expect(Object.keys(store.entries).length).toBeGreaterThan(0);
    // And the raw bytes parse as JSON (no partial write survived).
    const raw = await readFile(file, "utf8");
    expect(() => JSON.parse(raw)).not.toThrow();
  });
});
