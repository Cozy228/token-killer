import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";

import {
  ShimRecursionError,
  assertNoRecursion,
  resolveReal,
  stripShimDir,
} from "../../../src/shim/path.js";

describe("stripShimDir", () => {
  const shim = "/home/u/.token-guard/shim";

  test("removes only exact shim-dir entries and preserves order", () => {
    const pathVar = ["/usr/local/bin", shim, "/usr/bin", "/bin"].join(delimiter);
    expect(stripShimDir(pathVar, shim)).toBe(
      ["/usr/local/bin", "/usr/bin", "/bin"].join(delimiter),
    );
  });

  test("removes trailing-slash variants of the shim dir", () => {
    const pathVar = [`${shim}/`, "/usr/bin"].join(delimiter);
    expect(stripShimDir(pathVar, shim)).toBe("/usr/bin");
  });

  test("leaves PATH unchanged when no shim dir is given", () => {
    const pathVar = ["/usr/bin", "/bin"].join(delimiter);
    expect(stripShimDir(pathVar, undefined)).toBe(pathVar);
  });

  test("does not remove unrelated dirs that merely share a prefix", () => {
    const pathVar = ["/home/u/.token-guard/shimmer", "/usr/bin"].join(delimiter);
    expect(stripShimDir(pathVar, shim)).toBe(pathVar);
  });
});

describe("resolveReal + sentinel", () => {
  let tmp: string;
  let realDir: string;
  let shimDir: string;
  const prevShim = process.env.TG_SHIM_DIR;

  beforeAll(() => {
    tmp = mkdtempSync(join(tmpdir(), "tg-shim-path-"));
    realDir = join(tmp, "real");
    shimDir = join(tmp, "shim");
    mkdirSync(realDir);
    mkdirSync(shimDir);
    // The real tool, and a shim-dir wrapper of the same name.
    writeFileSync(join(realDir, "faketool"), "#!/bin/sh\necho real\n");
    chmodSync(join(realDir, "faketool"), 0o755);
    writeFileSync(join(shimDir, "faketool"), "#!/bin/sh\nexec tg faketool \"$@\"\n");
    chmodSync(join(shimDir, "faketool"), 0o755);
  });

  afterAll(() => {
    if (prevShim === undefined) delete process.env.TG_SHIM_DIR;
    else process.env.TG_SHIM_DIR = prevShim;
    rmSync(tmp, { recursive: true, force: true });
  });

  test("resolveReal finds the real tool past the shim", () => {
    expect(resolveReal("faketool", realDir)).toBe(join(realDir, "faketool"));
  });

  test("resolveReal returns null when the tool is nowhere on the path", () => {
    expect(resolveReal("faketool", join(tmp, "empty"))).toBeNull();
  });

  test("sentinel passes when the real tool is reachable outside the shim dir", () => {
    process.env.TG_SHIM_DIR = shimDir;
    expect(() => assertNoRecursion("faketool", realDir)).not.toThrow();
  });

  test("sentinel throws when the resolved tool lands inside the shim dir", () => {
    process.env.TG_SHIM_DIR = shimDir;
    expect(() => assertNoRecursion("faketool", shimDir)).toThrow(ShimRecursionError);
  });

  test("sentinel throws when only the shim copy is reachable", () => {
    process.env.TG_SHIM_DIR = shimDir;
    // Stripped path has no real tool, but the shim-dir copy still exists.
    expect(() => assertNoRecursion("faketool", join(tmp, "empty"))).toThrow(ShimRecursionError);
  });

  test("sentinel is a no-op when TG_SHIM_DIR is unset", () => {
    delete process.env.TG_SHIM_DIR;
    expect(() => assertNoRecursion("faketool", join(tmp, "empty"))).not.toThrow();
  });
});
