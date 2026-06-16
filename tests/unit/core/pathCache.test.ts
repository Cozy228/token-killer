import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";

import { resolveCachedBinary } from "../../../src/core/pathCache.js";

let home: string;
const originalHome = process.env.TOKEN_KILLER_HOME;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "tk-path-cache-"));
  process.env.TOKEN_KILLER_HOME = home;
});

afterEach(() => {
  if (originalHome === undefined) delete process.env.TOKEN_KILLER_HOME;
  else process.env.TOKEN_KILLER_HOME = originalHome;
  rmSync(home, { recursive: true, force: true });
});

const nodeDir = dirname(process.execPath);
const cacheFile = () => join(home, "path-cache.json");

describe("resolveCachedBinary (2.1 item 4)", () => {
  test("resolves a real binary and persists it to the cache", () => {
    const resolved = resolveCachedBinary("node", nodeDir);
    expect(resolved).toBe(process.execPath);
    expect(existsSync(cacheFile())).toBe(true);
    const cache = JSON.parse(readFileSync(cacheFile(), "utf8")) as Record<
      string,
      Record<string, string>
    >;
    const entries = Object.values(cache);
    expect(entries.some((bucket) => bucket.node === process.execPath)).toBe(true);
  });

  test("returns undefined for an unresolvable program and writes nothing", () => {
    expect(resolveCachedBinary("tk-nope-binary", nodeDir)).toBeUndefined();
    // No positive to cache → no file written.
    expect(existsSync(cacheFile())).toBe(false);
  });

  test("a cached hit pointing at a deleted file is revalidated and re-walked", () => {
    // Seed the cache with a stale path for "node" under the SAME (PATH,PATHEXT) key.
    resolveCachedBinary("node", nodeDir); // creates the namespace
    const cache = JSON.parse(readFileSync(cacheFile(), "utf8")) as Record<
      string,
      Record<string, string>
    >;
    const key = Object.keys(cache)[0];
    cache[key].node = join(home, "ghost-node"); // does not exist
    writeFileSync(cacheFile(), JSON.stringify(cache));

    // The stale hit fails existsSync revalidation → falls back to a fresh walk.
    expect(resolveCachedBinary("node", nodeDir)).toBe(process.execPath);
  });

  test("a different PATH opens a separate cache namespace", () => {
    resolveCachedBinary("node", nodeDir);
    resolveCachedBinary("node", `${nodeDir}${delimiter}/some/other/dir`);
    const cache = JSON.parse(readFileSync(cacheFile(), "utf8")) as Record<string, unknown>;
    // Two distinct (PATH,PATHEXT) hashes → two namespaces.
    expect(Object.keys(cache).length).toBe(2);
  });

  test("a corrupt cache file degrades to a direct walk without throwing", () => {
    writeFileSync(cacheFile(), "{not json");
    expect(resolveCachedBinary("node", nodeDir)).toBe(process.execPath);
  });
});
