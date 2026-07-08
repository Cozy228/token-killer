import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { makeFileCache, readSourceText } from "../../../src/inspect/fileCache.js";

describe("inspect fileCache", () => {
  let dir: string;
  let file: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "ctx-filecache-"));
    file = join(dir, "a.jsonl");
    writeFileSync(file, "hello world"); // 11 bytes
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("reads through and returns identical text with or without a cache", () => {
    const cache = makeFileCache();
    expect(readSourceText(file)).toBe("hello world");
    expect(readSourceText(file, cache)).toBe("hello world");
    // Second call is served from the cache (same value).
    expect(readSourceText(file, cache)).toBe("hello world");
  });

  it("retains an in-budget file and decrements the byte budget", () => {
    const cache = makeFileCache(100);
    readSourceText(file, cache);
    expect(cache.text.get(file)).toBe("hello world");
    expect(cache.remainingBytes).toBe(100 - "hello world".length);
  });

  it("does not retain a file once the budget is exhausted (memory stays capped)", () => {
    const cache = makeFileCache(5); // smaller than the 11-byte file
    const text = readSourceText(file, cache);
    expect(text).toBe("hello world"); // still returned
    expect(cache.text.has(file)).toBe(false); // but NOT retained
    expect(cache.remainingBytes).toBe(5); // budget untouched
  });

  it("caches a read failure as a non-retried miss", () => {
    const cache = makeFileCache();
    const missing = join(dir, "nope.jsonl");
    expect(readSourceText(missing, cache)).toBeUndefined();
    expect(cache.text.get(missing)).toBeNull();
    // A cached failure is served without another disk hit.
    expect(readSourceText(missing, cache)).toBeUndefined();
  });
});
