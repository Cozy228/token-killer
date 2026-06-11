import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  accessSync,
  constants,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  SHIM_MANIFEST_SCHEMA,
  compileCacheDir,
  installWrappers,
  manifestPath,
  posixWrapper,
  readManifest,
  removeShimDir,
  shimDir,
  windowsWrapper,
  type TkExec,
} from "../../../src/shim/install.js";

const tk: TkExec = { bin: "/usr/local/bin/node", args: ["/abs/dist/cli.js"] };

describe("wrapper content", () => {
  test("POSIX wrapper self-exports the baked shim dir, execs tk by absolute path", () => {
    expect(posixWrapper("git", tk, "/abs/shim")).toBe(
      "#!/usr/bin/env sh\nexport TK_SHIM_DIR='/abs/shim'\nexec '/usr/local/bin/node' '/abs/dist/cli.js' 'git' \"$@\"\n",
    );
  });

  test("POSIX wrapper bakes TK_REAL_BIN when the real path is known (2.1)", () => {
    expect(posixWrapper("git", tk, "/abs/shim", "/usr/bin/git")).toBe(
      "#!/usr/bin/env sh\nexport TK_SHIM_DIR='/abs/shim'\nexport TK_REAL_BIN='/usr/bin/git'\n" +
        "exec '/usr/local/bin/node' '/abs/dist/cli.js' 'git' \"$@\"\n",
    );
  });

  test("Windows wrapper self-sets the baked shim dir under setlocal, forwards args via %*", () => {
    expect(windowsWrapper("git", tk, "C:\\abs\\shim")).toBe(
      '@echo off\r\nsetlocal\r\nset "TK_SHIM_DIR=C:\\abs\\shim"\r\n"/usr/local/bin/node" "/abs/dist/cli.js" "git" %*\r\n',
    );
  });

  test("Windows wrapper bakes TK_REAL_BIN when the real path is known (2.1)", () => {
    expect(windowsWrapper("git", tk, "C:\\abs\\shim", "C:\\Program Files\\Git\\bin\\git.exe")).toBe(
      '@echo off\r\nsetlocal\r\nset "TK_SHIM_DIR=C:\\abs\\shim"\r\n' +
        'set "TK_REAL_BIN=C:\\Program Files\\Git\\bin\\git.exe"\r\n' +
        '"/usr/local/bin/node" "/abs/dist/cli.js" "git" %*\r\n',
    );
  });

  test("POSIX wrapper bakes NODE_COMPILE_CACHE when given a cache dir (2.3)", () => {
    expect(posixWrapper("git", tk, "/abs/shim", "/usr/bin/git", "/abs/home/v8-cache")).toBe(
      "#!/usr/bin/env sh\nexport TK_SHIM_DIR='/abs/shim'\nexport TK_REAL_BIN='/usr/bin/git'\n" +
        "export NODE_COMPILE_CACHE='/abs/home/v8-cache'\n" +
        "exec '/usr/local/bin/node' '/abs/dist/cli.js' 'git' \"$@\"\n",
    );
  });

  test("Windows wrapper bakes NODE_COMPILE_CACHE when given a cache dir (2.3)", () => {
    expect(windowsWrapper("git", tk, "C:\\abs\\shim", undefined, "C:\\abs\\home\\v8-cache")).toBe(
      '@echo off\r\nsetlocal\r\nset "TK_SHIM_DIR=C:\\abs\\shim"\r\n' +
        'set "NODE_COMPILE_CACHE=C:\\abs\\home\\v8-cache"\r\n' +
        '"/usr/local/bin/node" "/abs/dist/cli.js" "git" %*\r\n',
    );
  });
});

describe("installWrappers", () => {
  let home: string;

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "tk-shim-install-"));
  });

  afterEach(() => {
    rmSync(home, { recursive: true, force: true });
  });

  test("writes one executable wrapper per program (POSIX)", () => {
    installWrappers({
      home,
      programs: ["git", "tsc"],
      tkExec: tk,
      installedAt: 123,
      version: "9.9.9",
      platform: "linux",
    });
    const dir = shimDir(home);
    for (const program of ["git", "tsc"]) {
      const file = join(dir, program);
      expect(existsSync(file)).toBe(true);
      expect(readFileSync(file, "utf8")).toContain(`'${program}' "$@"`);
      // Executable bit set.
      expect(() => accessSync(file, constants.X_OK)).not.toThrow();
    }
  });

  test("writes .cmd wrappers on Windows", () => {
    installWrappers({
      home,
      programs: ["git"],
      tkExec: tk,
      installedAt: 1,
      version: "1.0.0",
      platform: "win32",
    });
    expect(existsSync(join(shimDir(home), "git.cmd"))).toBe(true);
    expect(existsSync(join(shimDir(home), "git"))).toBe(false);
  });

  test("manifest round-trips", () => {
    const manifest = installWrappers({
      home,
      programs: ["git", "aws"],
      tkExec: tk,
      installedAt: 4242,
      version: "1.2.3",
      platform: "linux",
    });
    const read = readManifest(home);
    expect(read).toEqual(manifest);
    expect(read?.programs).toEqual(["aws", "git"]);
    expect(read?.installedAt).toBe(4242);
    expect(read?.tk).toEqual(tk);
  });

  test("re-install prunes wrappers removed from the program set", () => {
    installWrappers({
      home,
      programs: ["git", "tsc"],
      tkExec: tk,
      installedAt: 1,
      version: "1",
      platform: "linux",
    });
    installWrappers({
      home,
      programs: ["git"],
      tkExec: tk,
      installedAt: 2,
      version: "1",
      platform: "linux",
    });
    expect(existsSync(join(shimDir(home), "git"))).toBe(true);
    expect(existsSync(join(shimDir(home), "tsc"))).toBe(false);
  });

  test("bakes resolved paths into the manifest and wrappers (schema 2)", () => {
    const manifest = installWrappers({
      home,
      programs: ["git", "tsc"],
      tkExec: tk,
      installedAt: 1,
      version: "1",
      platform: "linux",
      // Inject deterministic resolution so the test never depends on the host PATH.
      resolveRealBin: (program) => (program === "git" ? "/usr/bin/git" : undefined),
    });
    expect(manifest.schema).toBe(SHIM_MANIFEST_SCHEMA);
    expect(manifest.resolvedPaths).toEqual({ git: "/usr/bin/git" });
    // git's wrapper bakes the path; tsc (unresolved) gets none.
    expect(readFileSync(join(shimDir(home), "git"), "utf8")).toContain(
      "export TK_REAL_BIN='/usr/bin/git'",
    );
    expect(readFileSync(join(shimDir(home), "tsc"), "utf8")).not.toContain("TK_REAL_BIN");
  });

  test("bakes NODE_COMPILE_CACHE into every wrapper, pointed under the home (2.3)", () => {
    installWrappers({
      home,
      programs: ["git"],
      tkExec: tk,
      installedAt: 1,
      version: "1",
      platform: "linux",
      resolveRealBin: () => undefined,
    });
    const wrapper = readFileSync(join(shimDir(home), "git"), "utf8");
    expect(wrapper).toContain(`export NODE_COMPILE_CACHE='${compileCacheDir(home)}'`);
    expect(compileCacheDir(home)).toBe(join(home, "v8-cache"));
  });

  test("removeShimDir also drops the V8 compile cache (2.3), never projects/", () => {
    installWrappers({
      home,
      programs: ["git"],
      tkExec: tk,
      installedAt: 1,
      version: "1",
      platform: "linux",
      resolveRealBin: () => undefined,
    });
    // Simulate node having populated the cache, plus a measured-data dir.
    mkdirSync(compileCacheDir(home), { recursive: true });
    mkdirSync(join(home, "projects"), { recursive: true });
    removeShimDir(home);
    expect(existsSync(compileCacheDir(home))).toBe(false);
    expect(existsSync(join(home, "projects"))).toBe(true); // measured data preserved
  });

  test("a schema-1 manifest (no resolvedPaths) still reads back (migration)", () => {
    installWrappers({
      home,
      programs: ["git"],
      tkExec: tk,
      installedAt: 1,
      version: "1",
      platform: "linux",
      resolveRealBin: () => undefined,
    });
    // Simulate an older on-disk manifest written before 2.1.
    writeFileSync(
      manifestPath(home),
      JSON.stringify({
        schema: 1,
        version: "1",
        dir: shimDir(home),
        programs: ["git"],
        installedAt: 1,
        tk,
      }),
    );
    const read = readManifest(home);
    expect(read?.schema).toBe(1);
    expect(read?.resolvedPaths).toBeUndefined();
  });

  test("removeShimDir deletes the dir", () => {
    installWrappers({
      home,
      programs: ["git"],
      tkExec: tk,
      installedAt: 1,
      version: "1",
      platform: "linux",
    });
    removeShimDir(home);
    expect(existsSync(shimDir(home))).toBe(false);
  });
});

describe("installWrappers — presence gate (D2)", () => {
  let home: string;
  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "tk-shim-presence-"));
  });
  afterEach(() => {
    rmSync(home, { recursive: true, force: true });
  });

  test("skips wrappers for programs whose binary is absent", () => {
    const manifest = installWrappers({
      home,
      installedAt: 1,
      version: "1",
      platform: "win32",
      programs: ["git", "cat", "ls"],
      // Only `git` is present on this hypothetical box.
      isAvailable: (program) => program === "git",
    });
    expect(manifest.programs).toEqual(["git"]);
    expect(existsSync(join(shimDir(home), "git.cmd"))).toBe(true);
    expect(existsSync(join(shimDir(home), "cat.cmd"))).toBe(false);
    expect(existsSync(join(shimDir(home), "ls.cmd"))).toBe(false);
  });
});
