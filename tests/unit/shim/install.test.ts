import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { accessSync, constants, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  installWrappers,
  posixWrapper,
  readManifest,
  removeShimDir,
  shimDir,
  windowsWrapper,
  type TgExec,
} from "../../../src/shim/install.js";

const tg: TgExec = { bin: "/usr/local/bin/node", args: ["/abs/dist/cli.js"] };

describe("wrapper content", () => {
  test("POSIX wrapper execs tg by absolute path and forwards args", () => {
    expect(posixWrapper("git", tg)).toBe(
      "#!/usr/bin/env sh\nexec '/usr/local/bin/node' '/abs/dist/cli.js' 'git' \"$@\"\n",
    );
  });

  test("Windows wrapper forwards args via %*", () => {
    expect(windowsWrapper("git", tg)).toBe(
      '@"/usr/local/bin/node" "/abs/dist/cli.js" "git" %*\r\n',
    );
  });
});

describe("installWrappers", () => {
  let home: string;

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "tg-shim-install-"));
  });

  afterEach(() => {
    rmSync(home, { recursive: true, force: true });
  });

  test("writes one executable wrapper per program (POSIX)", () => {
    installWrappers({
      home,
      programs: ["git", "tsc"],
      tgExec: tg,
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
      tgExec: tg,
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
      tgExec: tg,
      installedAt: 4242,
      version: "1.2.3",
      platform: "linux",
    });
    const read = readManifest(home);
    expect(read).toEqual(manifest);
    expect(read?.programs).toEqual(["aws", "git"]);
    expect(read?.installedAt).toBe(4242);
    expect(read?.tg).toEqual(tg);
  });

  test("re-install prunes wrappers removed from the program set", () => {
    installWrappers({ home, programs: ["git", "tsc"], tgExec: tg, installedAt: 1, version: "1", platform: "linux" });
    installWrappers({ home, programs: ["git"], tgExec: tg, installedAt: 2, version: "1", platform: "linux" });
    expect(existsSync(join(shimDir(home), "git"))).toBe(true);
    expect(existsSync(join(shimDir(home), "tsc"))).toBe(false);
  });

  test("removeShimDir deletes the dir", () => {
    installWrappers({ home, programs: ["git"], tgExec: tg, installedAt: 1, version: "1", platform: "linux" });
    removeShimDir(home);
    expect(existsSync(shimDir(home))).toBe(false);
  });
});
