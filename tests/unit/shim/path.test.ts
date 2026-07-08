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
  const shim = "/home/u/.contexa/shim";

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
    const pathVar = ["/home/u/.contexa/shimmer", "/usr/bin"].join(delimiter);
    expect(stripShimDir(pathVar, shim)).toBe(pathVar);
  });
});

describe("resolveReal + sentinel", () => {
  let tmp: string;
  let realDir: string;
  let shimDir: string;
  const prevShim = process.env.CTX_SHIM_DIR;
  // On Windows a bare extensionless script is not resolvable (resolveReal walks
  // PATHEXT), so the fixture carries a real PATHEXT extension. resolveReal is still
  // called with the bare "faketool" — it appends the extension during the walk.
  const isWin = process.platform === "win32";
  const toolFile = isWin ? "faketool.cmd" : "faketool";
  const realContent = isWin ? "@echo real\r\n" : "#!/bin/sh\necho real\n";
  const shimContent = isWin ? "@ctx faketool %*\r\n" : '#!/bin/sh\nexec ctx faketool "$@"\n';

  beforeAll(() => {
    tmp = mkdtempSync(join(tmpdir(), "ctx-shim-path-"));
    realDir = join(tmp, "real");
    shimDir = join(tmp, "shim");
    mkdirSync(realDir);
    mkdirSync(shimDir);
    // The real tool, and a shim-dir wrapper of the same name.
    writeFileSync(join(realDir, toolFile), realContent);
    chmodSync(join(realDir, toolFile), 0o755);
    writeFileSync(join(shimDir, toolFile), shimContent);
    chmodSync(join(shimDir, toolFile), 0o755);
  });

  afterAll(() => {
    if (prevShim === undefined) delete process.env.CTX_SHIM_DIR;
    else process.env.CTX_SHIM_DIR = prevShim;
    rmSync(tmp, { recursive: true, force: true });
  });

  test("resolveReal finds the real tool past the shim", () => {
    expect(resolveReal("faketool", realDir)).toBe(join(realDir, toolFile));
  });

  test("resolveReal returns null when the tool is nowhere on the path", () => {
    expect(resolveReal("faketool", join(tmp, "empty"))).toBeNull();
  });

  test("sentinel passes when the real tool is reachable outside the shim dir", () => {
    process.env.CTX_SHIM_DIR = shimDir;
    expect(() => assertNoRecursion("faketool", realDir)).not.toThrow();
  });

  test("sentinel throws when the resolved tool lands inside the shim dir", () => {
    process.env.CTX_SHIM_DIR = shimDir;
    expect(() => assertNoRecursion("faketool", shimDir)).toThrow(ShimRecursionError);
  });

  test("sentinel throws when only the shim copy is reachable", () => {
    process.env.CTX_SHIM_DIR = shimDir;
    // Stripped path has no real tool, but the shim-dir copy still exists.
    expect(() => assertNoRecursion("faketool", join(tmp, "empty"))).toThrow(ShimRecursionError);
  });

  test("sentinel is a no-op when CTX_SHIM_DIR is unset", () => {
    delete process.env.CTX_SHIM_DIR;
    expect(() => assertNoRecursion("faketool", join(tmp, "empty"))).not.toThrow();
  });
});
