import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import {
  buildSpawnTarget,
  decodeChildOutput,
  executeCommand,
  resetLegacyDecoderCache,
  resolveBinaryPath,
} from "../../src/executor.js";
import { hashResolutionEnv } from "../../src/shim/path.js";

function withPlatform(platform: NodeJS.Platform, fn: () => void): void {
  const original = Object.getOwnPropertyDescriptor(process, "platform");
  Object.defineProperty(process, "platform", { value: platform, configurable: true });
  try {
    fn();
  } finally {
    if (original) Object.defineProperty(process, "platform", original);
  }
}

// Run `fn` with a specific value (or absence) of an env var, then restore.
function withEnv(name: string, value: string | undefined, fn: () => void): void {
  const had = Object.prototype.hasOwnProperty.call(process.env, name);
  const original = process.env[name];
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
  try {
    fn();
  } finally {
    if (had) process.env[name] = original;
    else delete process.env[name];
  }
}

describe("executeCommand", () => {
  test("captures stdout, stderr, and preserves exit code", async () => {
    const result = await executeCommand({
      program: process.execPath,
      args: ["-e", "process.stdout.write('out'); process.stderr.write('err'); process.exit(7);"],
      original: [
        process.execPath,
        "-e",
        "process.stdout.write('out'); process.stderr.write('err'); process.exit(7);",
      ],
      displayCommand: "node -e test",
    });

    expect(result.stdout).toBe("out");
    expect(result.stderr).toBe("err");
    expect(result.exitCode).toBe(7);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  test("reports command not found as exit code 127", async () => {
    const result = await executeCommand({
      program: "tk-command-that-does-not-exist",
      args: [],
      original: ["tk-command-that-does-not-exist"],
      displayCommand: "tk-command-that-does-not-exist",
    });

    expect(result.exitCode).toBe(127);
    expect(result.stderr).toContain("command not found");
  });

  test("maps a signal death to 128 + signo (SIGTERM → 143)", async () => {
    const script = "process.kill(process.pid, 'SIGTERM')";
    const result = await executeCommand({
      program: process.execPath,
      args: ["-e", script],
      original: [process.execPath, "-e", script],
      displayCommand: "node -e kill-self",
    });

    expect(result.exitCode).toBe(143);
  });
});

describe("buildSpawnTarget (win32 .cmd/.bat %-expansion)", () => {
  // A resolved batch-script path on PATH. resolveProgram returns `program`
  // unchanged when it already contains a separator, so passing an absolute
  // .cmd path keeps the test independent of any real filesystem.
  const PNPM_CMD = "C:\\Users\\t\\AppData\\pnpm\\pnpm.cmd";

  test("%-free args produce a byte-identical spawn line (fast path untouched)", () => {
    withPlatform("win32", () => {
      withEnv("TK_PCT", undefined, () => {
        const target = buildSpawnTarget(PNPM_CMD, ["install", "--frozen-lockfile"], "");
        expect(target.file).toBe(process.env.ComSpec || "cmd.exe");
        // No % anywhere → no rewrite, no TK_PCT injection.
        expect(target.args).toEqual(["/d", "/s", "/c", `"${PNPM_CMD} install --frozen-lockfile"`]);
        expect(target.windowsVerbatimArguments).toBe(true);
        expect(target.extraEnv).toBeUndefined();
      });
    });
  });

  test("rewrites %VAR% in a single arg to %TK_PCT%…%TK_PCT% and injects TK_PCT", () => {
    withPlatform("win32", () => {
      withEnv("TK_PCT", undefined, () => {
        const target = buildSpawnTarget(PNPM_CMD, ["echo", "%PATH%"], "");
        // Each literal % becomes %TK_PCT%; cmd expands %TK_PCT% → "%" once,
        // reconstructing the literal "%PATH%" the real tool must receive.
        // cmdQuote wraps the token because it now contains % metacharacters.
        expect(target.args[3]).toBe(`"${PNPM_CMD} echo "%TK_PCT%PATH%TK_PCT%""`);
        expect(target.extraEnv).toEqual({ TK_PCT: "%" });
      });
    });
  });

  test("rewrites a lone trailing % (100%)", () => {
    withPlatform("win32", () => {
      withEnv("TK_PCT", undefined, () => {
        const target = buildSpawnTarget(PNPM_CMD, ["echo", "100%"], "");
        expect(target.args[3]).toBe(`"${PNPM_CMD} echo "100%TK_PCT%""`);
        expect(target.extraEnv).toEqual({ TK_PCT: "%" });
      });
    });
  });

  test("neutralizes a %-pair that forms ACROSS two args (the case naive fixes miss)", () => {
    withPlatform("win32", () => {
      withEnv("TK_PCT", undefined, () => {
        // cmd expansion scans the JOINED line: `a%b c%d` would let cmd see
        // `%b c%` as one expandable reference. Per-arg quoting cannot stop it.
        // After rewrite every % is its own %TK_PCT% reference, so no stray
        // pair can form regardless of how the line is joined.
        const target = buildSpawnTarget(PNPM_CMD, ["a%b", "c%d"], "");
        expect(target.args[3]).toBe(`"${PNPM_CMD} "a%TK_PCT%b" "c%TK_PCT%d""`);
        // Sanity: no bare % remains except those inside a %TK_PCT% token.
        const stripped = target.args[3].replace(/%TK_PCT%/g, "");
        expect(stripped.includes("%")).toBe(false);
        expect(target.extraEnv).toEqual({ TK_PCT: "%" });
      });
    });
  });

  test("leaves an undefined-var reference literal too (%UNDEFINED_XYZ%)", () => {
    withPlatform("win32", () => {
      withEnv("TK_PCT", undefined, () => {
        const target = buildSpawnTarget(PNPM_CMD, ["%UNDEFINED_XYZ%"], "");
        expect(target.args[3]).toBe(`"${PNPM_CMD} "%TK_PCT%UNDEFINED_XYZ%TK_PCT%""`);
        expect(target.extraEnv).toEqual({ TK_PCT: "%" });
      });
    });
  });

  test("rewrites % in the resolved batch path itself", () => {
    withPlatform("win32", () => {
      withEnv("TK_PCT", undefined, () => {
        const weird = "C:\\dir%x\\tool.cmd";
        const target = buildSpawnTarget(weird, ["go"], "");
        // After %→%TK_PCT% the path now carries % metacharacters, so cmdQuote
        // wraps it in double quotes (its existing behavior for %-tokens).
        expect(target.args[3]).toBe(`""C:\\dir%TK_PCT%x\\tool.cmd" go"`);
        expect(target.extraEnv).toEqual({ TK_PCT: "%" });
      });
    });
  });

  test("collision-safe: TK_PCT already set to % is fine (idempotent, still injects %)", () => {
    withPlatform("win32", () => {
      withEnv("TK_PCT", "%", () => {
        const target = buildSpawnTarget(PNPM_CMD, ["echo", "%PATH%"], "");
        expect(target.args[3]).toBe(`"${PNPM_CMD} echo "%TK_PCT%PATH%TK_PCT%""`);
        expect(target.extraEnv).toEqual({ TK_PCT: "%" });
      });
    });
  });

  test("collision-safe: user TK_PCT set to something else → refuse rewrite, fall back to status-quo line", () => {
    withPlatform("win32", () => {
      withEnv("TK_PCT", "not-a-percent", () => {
        const target = buildSpawnTarget(PNPM_CMD, ["echo", "%PATH%"], "");
        // Fall back to the pre-existing (no-worse-than-native) behavior:
        // cmdQuote only, no TK_PCT rewrite, no env injection.
        expect(target.args[3]).toBe(`"${PNPM_CMD} echo "%PATH%""`);
        expect(target.extraEnv).toBeUndefined();
      });
    });
  });

  test("non-batch win32 target (.exe) is unaffected — spawns directly, no cmd, no rewrite", () => {
    withPlatform("win32", () => {
      withEnv("TK_PCT", undefined, () => {
        const target = buildSpawnTarget("C:\\bin\\node.exe", ["-e", "%PATH%"], "");
        expect(target.file).toBe("C:\\bin\\node.exe");
        expect(target.args).toEqual(["-e", "%PATH%"]);
        expect(target.windowsVerbatimArguments).toBe(false);
        expect(target.extraEnv).toBeUndefined();
      });
    });
  });

  test("non-win32 platform: % args pass straight through (POSIX path untouched)", () => {
    withPlatform("linux", () => {
      withEnv("TK_PCT", undefined, () => {
        const target = buildSpawnTarget("pnpm", ["echo", "%PATH%"], "/usr/bin");
        expect(target.file).toBe("pnpm");
        expect(target.args).toEqual(["echo", "%PATH%"]);
        expect(target.windowsVerbatimArguments).toBe(false);
        expect(target.extraEnv).toBeUndefined();
      });
    });
  });
});

describe("resolveBinaryPath (install-time resolver, 2.1)", () => {
  test("resolves a real binary to its absolute path", () => {
    // process.execPath ("node") lives in its own dir; resolving "node" against that
    // dir must return the same absolute path.
    const dir = dirname(process.execPath);
    const resolved = resolveBinaryPath("node", dir);
    expect(resolved).toBe(process.execPath);
  });

  test("returns undefined when nothing resolves", () => {
    expect(resolveBinaryPath("tk-nope-binary", dirname(process.execPath))).toBeUndefined();
  });

  test.runIf(process.platform !== "win32")(
    "skips a non-executable shadow and resolves the executable later on PATH (P1)",
    () => {
      const dirA = mkdtempSync(join(tmpdir(), "tk-noexec-"));
      const dirB = mkdtempSync(join(tmpdir(), "tk-exec-"));
      try {
        // dirA/demo exists but is NOT executable; dirB/demo is. The shell skips the
        // former and runs the latter — resolveBinaryPath must do the same, not bake A.
        writeFileSync(join(dirA, "demo"), "#!/bin/sh\n", { mode: 0o644 });
        writeFileSync(join(dirB, "demo"), "#!/bin/sh\n", { mode: 0o755 });
        const resolved = resolveBinaryPath("demo", `${dirA}:${dirB}`);
        expect(resolved).toBe(join(dirB, "demo"));
      } finally {
        rmSync(dirA, { recursive: true, force: true });
        rmSync(dirB, { recursive: true, force: true });
      }
    },
  );

  test("returns a path-qualified program verbatim only when it exists", () => {
    expect(resolveBinaryPath(process.execPath, undefined)).toBe(process.execPath);
    expect(resolveBinaryPath("/no/such/tk/binary", undefined)).toBeUndefined();
  });
});

describe("buildSpawnTarget — baked TK_REAL_BIN (2.1)", () => {
  const PATHV = "/irrelevant/path";
  const matchingHash = hashResolutionEnv(PATHV);
  const originalBin = process.env.TK_REAL_BIN;
  const originalHash = process.env.TK_REAL_PATH_HASH;

  beforeEach(() => {
    // The PATH-equality gate must pass for the fast path to engage; tests that probe
    // the gate itself override this.
    process.env.TK_REAL_PATH_HASH = matchingHash;
  });
  afterEach(() => {
    if (originalBin === undefined) delete process.env.TK_REAL_BIN;
    else process.env.TK_REAL_BIN = originalBin;
    if (originalHash === undefined) delete process.env.TK_REAL_PATH_HASH;
    else process.env.TK_REAL_PATH_HASH = originalHash;
  });

  test("uses the baked path when the PATH hash, basename, and existence all match", () => {
    process.env.TK_REAL_BIN = process.execPath; // basename "node"
    const target = buildSpawnTarget("node", ["-v"], PATHV);
    expect(target.file).toBe(process.execPath);
  });

  test("ignores the baked path when the PATH hash does not match (PATH reordered)", () => {
    process.env.TK_REAL_BIN = process.execPath;
    // A different runtime PATH than install → hash mismatch → live walk fallback.
    const target = buildSpawnTarget("node", ["-v"], "/a/totally/different/path");
    expect(target.file).toBe("node");
  });

  test("ignores the baked path when TK_REAL_PATH_HASH is absent (ungated → conservative)", () => {
    delete process.env.TK_REAL_PATH_HASH;
    process.env.TK_REAL_BIN = process.execPath;
    const target = buildSpawnTarget("node", ["-v"], PATHV);
    expect(target.file).toBe("node");
  });

  test("ignores a baked path whose basename does not match the program", () => {
    process.env.TK_REAL_BIN = process.execPath; // basename "node", not "git"
    const target = buildSpawnTarget("git", [], PATHV);
    // Falls back to resolveProgram, which on POSIX returns the bare name unchanged.
    expect(target.file).toBe("git");
  });

  test("ignores a baked path that no longer exists (stale → walk fallback)", () => {
    process.env.TK_REAL_BIN = "/no/such/dir/node";
    const target = buildSpawnTarget("node", [], PATHV);
    expect(target.file).toBe("node");
  });

  test("ignores the baked path for a path-qualified program", () => {
    process.env.TK_REAL_BIN = process.execPath;
    const target = buildSpawnTarget("./node", [], PATHV);
    expect(target.file).toBe("./node");
  });
});

describe("buildChildEnv — NODE_COMPILE_CACHE restore (2.3 leak fix)", () => {
  const keys = ["TK_SHIM_DIR", "NODE_COMPILE_CACHE", "TK_NODE_COMPILE_CACHE_PREV"] as const;
  const saved: Record<string, string | undefined> = {};
  beforeEach(() => {
    for (const k of keys) saved[k] = process.env[k];
    // A shim dir not on PATH: the recursion guard is a no-op for the absolute-path
    // `node` we spawn, but TK_SHIM_DIR being set routes through the env-building path.
    process.env.TK_SHIM_DIR = tmpdir();
    process.env.NODE_COMPILE_CACHE = "/tk/v8-cache"; // tk's injected dir
  });
  afterEach(() => {
    for (const k of keys) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  async function childCacheEnv(): Promise<string> {
    const args = ["-e", "process.stdout.write(process.env.NODE_COMPILE_CACHE || 'UNSET')"];
    const r = await executeCommand({
      program: process.execPath,
      args,
      original: [process.execPath, ...args],
      displayCommand: "node -e probe",
    });
    return r.stdout;
  }

  test("restores the caller's prior NODE_COMPILE_CACHE for the spawned child", async () => {
    process.env.TK_NODE_COMPILE_CACHE_PREV = "/user/orig";
    expect(await childCacheEnv()).toBe("/user/orig");
  });

  test("removes NODE_COMPILE_CACHE for the child when the caller had none", async () => {
    process.env.TK_NODE_COMPILE_CACHE_PREV = "";
    expect(await childCacheEnv()).toBe("UNSET");
  });
});

describe("decodeChildOutput", () => {
  beforeEach(() => {
    resetLegacyDecoderCache();
  });

  test("keeps genuine UTF-8 byte-exact (git/node toolchain)", () => {
    expect(decodeChildOutput(Buffer.from("中文 ok\n", "utf8"))).toBe("中文 ok\n");
  });

  test("keeps ASCII byte-exact", () => {
    expect(decodeChildOutput(Buffer.from("on branch main\n", "utf8"))).toBe("on branch main\n");
  });

  test("returns an empty string for empty output", () => {
    expect(decodeChildOutput(Buffer.alloc(0))).toBe("");
  });

  test("on Windows, falls back to the legacy code page for non-UTF-8 bytes", () => {
    // GBK bytes for 中文 (D6 D0 CE C4): invalid as UTF-8 → legacy (gb18030)
    // fallback. chcp.com is absent off Windows, so detection defaults to the
    // zh-CN code page — exactly the case we are reproducing.
    withPlatform("win32", () => {
      resetLegacyDecoderCache();
      expect(decodeChildOutput(Buffer.from([0xd6, 0xd0, 0xce, 0xc4]))).toBe("中文");
    });
  });

  test("off Windows, non-UTF-8 bytes degrade to lossy UTF-8 without throwing", () => {
    withPlatform("linux", () => {
      resetLegacyDecoderCache();
      const decoded = decodeChildOutput(Buffer.from([0xd6, 0xd0, 0xce, 0xc4]));
      expect(typeof decoded).toBe("string");
      expect(decoded).toContain("�");
    });
  });
});
