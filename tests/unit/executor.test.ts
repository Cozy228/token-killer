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
  trimIncompleteUtf8Tail,
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

  test.runIf(process.platform === "win32")(
    "round-trips literal percent arguments through a real .cmd target",
    async () => {
      const dir = mkdtempSync(join(tmpdir(), "tk-percent-e2e-"));
      const script = join(dir, "print-args.mjs");
      const batch = join(dir, "print-args.cmd");
      const args = ["%PATH%", "100%", "a%b", "c%d"];
      try {
        writeFileSync(script, "process.stdout.write(JSON.stringify(process.argv.slice(2)));\n");
        writeFileSync(batch, `@echo off\r\n"${process.execPath}" "${script}" %*\r\n`);

        // The contrast — that cmd.exe would otherwise EXPAND these %tokens — is pinned by
        // the buildSpawnTarget unit tests above. Here we drive the REAL spawn end-to-end
        // and assert the literal % survives to the child's argv. We deliberately do NOT
        // hand-roll a `cmd /d /s /c "…"` baseline spawn: getting Node→cmd.exe quoting
        // right (outer-quote wrap + windowsVerbatimArguments) is exactly what tk's
        // executor does, and duplicating it by hand was brittle on the CI runner.
        const result = await executeCommand({
          program: batch,
          args,
          original: [batch, ...args],
          displayCommand: `${batch} ${args.join(" ")}`,
        });

        expect(result.exitCode).toBe(0);
        expect(JSON.parse(result.stdout)).toEqual(args);

        let refusal: unknown;
        try {
          await executeCommand({
            program: batch,
            args: ["%".repeat(1100)],
            original: [batch, "%".repeat(1100)],
            displayCommand: `${batch} ${"%".repeat(1100)}`,
          });
        } catch (error) {
          refusal = error;
        }
        expect(refusal).toBeInstanceOf(Error);
        expect(String(refusal)).toMatch(/8191-char limit/);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    },
  );

  // POSIX-only: signal numbering (128 + signo) is a Unix concept. On Windows there
  // are no real signals — `process.kill(pid, 'SIGTERM')` maps to TerminateProcess,
  // so the child exits with a plain code, not a 143 signal death. Guarded like the
  // PATHEXT-sensitive resolver test below.
  test.runIf(process.platform !== "win32")(
    "maps a signal death to 128 + signo (SIGTERM → 143)",
    async () => {
      const script = "process.kill(process.pid, 'SIGTERM')";
      const result = await executeCommand({
        program: process.execPath,
        args: ["-e", script],
        original: [process.execPath, "-e", script],
        displayCommand: "node -e kill-self",
      });

      expect(result.exitCode).toBe(143);
    },
  );
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

  test("collision-safe: user TK_PCT bound to garbage → dynamic TK_PCT_1 indirection, child carries TK_PCT_1=%", () => {
    withPlatform("win32", () => {
      withEnv("TK_PCT", "not-a-percent", () => {
        // TK_PCT_1..15 are unset, so the first free probe is TK_PCT_1. The line
        // must use TK_PCT_1 (NOT the corruptible TK_PCT) and inject TK_PCT_1=%.
        // Crucially it must NOT fall back to the old cmdQuote-only `%PATH%` line.
        const target = buildSpawnTarget(PNPM_CMD, ["echo", "%PATH%"], "");
        expect(target.args[3]).toBe(`"${PNPM_CMD} echo "%TK_PCT_1%PATH%TK_PCT_1%""`);
        expect(target.extraEnv).toEqual({ TK_PCT_1: "%" });
        // Regression guard: never the old silently-corruptible line.
        expect(target.args[3]).not.toBe(`"${PNPM_CMD} echo "%PATH%""`);
      });
    });
  });

  test("collision-safe: probes past taken names (TK_PCT + TK_PCT_1 bound) → uses TK_PCT_2", () => {
    withPlatform("win32", () => {
      withEnv("TK_PCT", "x", () => {
        withEnv("TK_PCT_1", "y", () => {
          const target = buildSpawnTarget(PNPM_CMD, ["echo", "%PATH%"], "");
          expect(target.args[3]).toBe(`"${PNPM_CMD} echo "%TK_PCT_2%PATH%TK_PCT_2%""`);
          expect(target.extraEnv).toEqual({ TK_PCT_2: "%" });
        });
      });
    });
  });

  test("collision-safe: a probed name already bound to % is reused (no needless probe past it)", () => {
    withPlatform("win32", () => {
      withEnv("TK_PCT", "x", () => {
        // TK_PCT_1 is already exactly "%": usable as-is (extraEnv re-asserts it),
        // so the rewrite picks TK_PCT_1, not TK_PCT_2.
        withEnv("TK_PCT_1", "%", () => {
          const target = buildSpawnTarget(PNPM_CMD, ["echo", "%PATH%"], "");
          expect(target.args[3]).toBe(`"${PNPM_CMD} echo "%TK_PCT_1%PATH%TK_PCT_1%""`);
          expect(target.extraEnv).toEqual({ TK_PCT_1: "%" });
        });
      });
    });
  });

  test("fail closed: TK_PCT and TK_PCT_1..15 all bound → refuse, name the offending arg, spawn nothing", () => {
    withPlatform("win32", () => {
      // Bind every candidate name to a non-% value: no safe indirection exists.
      const names = ["TK_PCT", ...Array.from({ length: 15 }, (_, i) => `TK_PCT_${i + 1}`)];
      const saved = names.map((n) => [n, process.env[n]] as const);
      for (const n of names) process.env[n] = "taken";
      try {
        expect(() => buildSpawnTarget(PNPM_CMD, ["echo", "%PATH%"], "")).toThrowError(
          /refusing to run a batch command.*"%PATH%"/s,
        );
      } finally {
        for (const [n, v] of saved) {
          if (v === undefined) delete process.env[n];
          else process.env[n] = v;
        }
      }
    });
  });

  // ─── Length guard: % neutralization must not inflate the line past cmd.exe's
  // 8191-char command-line limit (Codex 5.5 / Fable 5 follow-up BLOCK) ───
  //
  // cmd.exe's limit applies to the full `<comspec> /d /s /c "<line>"` command
  // line. With a short comspec ("cmd.exe") the wrapper overhead is
  // `cmd.exe /d /s /c "…"` = 16 chars around the line. Each literal `%` becomes
  // `%TK_PCT%` (8 chars), i.e. +7 per `%`. The tests below force ComSpec to a
  // fixed value so the arithmetic is deterministic regardless of the host.

  test("fail closed: a %-dense line that FITS before neutralization but EXCEEDS after → refused", () => {
    withPlatform("win32", () => {
      withEnv("ComSpec", "cmd.exe", () => {
        withEnv("TK_PCT", undefined, () => {
          // 1100 literal % → neutralized adds 1100*7 = 7700 chars. The pre-
          // neutralization full line (cmd.exe /d /s /c "<path> <1100 %>", with the
          // %-token cmd-quoted) is ~1160 chars — comfortably under 8191 — but the
          // neutralized full line is ~8860, over the limit. tk must refuse, not
          // spawn a line cmd.exe would truncate.
          const arg = "%".repeat(1100);
          expect(() => buildSpawnTarget(PNPM_CMD, [arg], "")).toThrowError(
            /refusing to run a batch command.*8191-char limit/s,
          );
          // Regression guard: the pre-neutralization line really is under the
          // limit, so the refusal is caused by tk's transform, not by an
          // already-over-long input.
          const preLine = `cmd.exe /d /s /c "${PNPM_CMD} "${arg}""`;
          expect(preLine.length).toBeLessThanOrEqual(8191);
        });
      });
    });
  });

  test("out of scope: a same-length %-FREE line is NOT guarded — spawn target built unchanged (native behavior)", () => {
    withPlatform("win32", () => {
      withEnv("ComSpec", "cmd.exe", () => {
        withEnv("TK_PCT", undefined, () => {
          // A %-free arg of the SAME length as the refused %-dense one. There is
          // no neutralization (hasPercent is false), so the guard never applies:
          // an over-long line without tk's rewrite is cmd's own concern, not a
          // tk-induced breakage. The line is built and returned as today.
          const arg = "a".repeat(1100);
          const target = buildSpawnTarget(PNPM_CMD, [arg], "");
          expect(target.file).toBe("cmd.exe");
          expect(target.args).toEqual(["/d", "/s", "/c", `"${PNPM_CMD} ${arg}"`]);
          expect(target.extraEnv).toBeUndefined();
        });
      });
    });
  });

  test("boundary: a %-dense line just UNDER the limit after neutralization is allowed", () => {
    withPlatform("win32", () => {
      withEnv("ComSpec", "cmd.exe", () => {
        withEnv("TK_PCT", undefined, () => {
          // Construct the single token so the neutralized full command line lands
          // exactly at the 8191 limit (<= is allowed). The token is a quoted
          // %-only arg: cmdQuote wraps it because of the % metacharacters.
          //   fullLine = `cmd.exe /d /s /c "<PNPM_CMD> "<n*%TK_PCT%>""`
          // Solve for n: fixed overhead = prefix + PNPM_CMD + quoting, each %
          // contributes 8 chars (%TK_PCT%).
          const PREFIX = `cmd.exe /d /s /c "${PNPM_CMD} "`; // up to the opening quote of the arg token
          const SUFFIX = `""`; // closing quote of the arg token + closing wrapper quote
          const fixed = PREFIX.length + SUFFIX.length;
          const n = Math.floor((8191 - fixed) / 8); // each % → %TK_PCT% (8 chars)
          const arg = "%".repeat(n);
          const target = buildSpawnTarget(PNPM_CMD, [arg], "");
          // Built (not thrown) and exactly at-or-under the limit.
          const fullLine = `cmd.exe /d /s /c ${target.args[3]}`;
          expect(fullLine.length).toBeLessThanOrEqual(8191);
          expect(8191 - fullLine.length).toBeLessThan(8); // genuinely a boundary, < one more %
          expect(target.extraEnv).toEqual({ TK_PCT: "%" });
        });
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

describe("trimIncompleteUtf8Tail", () => {
  // Helper: bytes of a single codepoint as a fresh Buffer.
  const seq = (cp: string): Buffer => Buffer.from(cp, "utf8");

  test("empty buffer is returned unchanged", () => {
    const buf = Buffer.alloc(0);
    expect(trimIncompleteUtf8Tail(buf)).toBe(buf);
  });

  test("complete ASCII is returned unchanged", () => {
    const buf = Buffer.from("on branch main\n", "utf8");
    expect(trimIncompleteUtf8Tail(buf)).toEqual(buf);
  });

  test("complete multibyte buffer is returned unchanged (2/3/4-byte tails)", () => {
    // ends in 2-byte (é), 3-byte (汉), 4-byte (😀) sequences respectively.
    for (const tail of ["abcé", "abc汉", "abc😀"]) {
      const buf = Buffer.from(tail, "utf8");
      expect(trimIncompleteUtf8Tail(buf)).toEqual(buf);
    }
  });

  test("2-byte sequence split mid-character is trimmed to the boundary", () => {
    const full = seq("é"); // C3 A9, length 2
    expect(full.length).toBe(2);
    const prefix = Buffer.from("ok", "utf8");
    // split after the lead byte (1 of 2 bytes present): trim the lead byte.
    const cut = Buffer.concat([prefix, full.subarray(0, 1)]);
    expect(trimIncompleteUtf8Tail(cut)).toEqual(prefix);
  });

  test("3-byte sequence split at each position is trimmed to the boundary", () => {
    const full = seq("汉"); // E6 B1 89, length 3
    expect(full.length).toBe(3);
    const prefix = Buffer.from("ok", "utf8");
    for (let present = 1; present < 3; present++) {
      const cut = Buffer.concat([prefix, full.subarray(0, present)]);
      expect(trimIncompleteUtf8Tail(cut)).toEqual(prefix);
    }
  });

  test("4-byte sequence split at each position is trimmed to the boundary", () => {
    const full = seq("😀"); // F0 9F 98 80, length 4
    expect(full.length).toBe(4);
    const prefix = Buffer.from("ok", "utf8");
    for (let present = 1; present < 4; present++) {
      const cut = Buffer.concat([prefix, full.subarray(0, present)]);
      expect(trimIncompleteUtf8Tail(cut)).toEqual(prefix);
    }
  });

  test("pure-continuation tail is left untouched (genuinely invalid, not a split lead)", () => {
    // 0x80 0x80 0x80: three continuation bytes with no lead in the last 3 —
    // not a recoverable split tail, must reach the fallback decoder verbatim.
    const buf = Buffer.from([0x6f, 0x6b, 0x80, 0x80, 0x80]);
    expect(trimIncompleteUtf8Tail(buf)).toEqual(buf);
  });

  test("mid-buffer garbage is left untouched when the buffer ends complete", () => {
    // invalid 0xFF in the middle, but the buffer ends on a complete ASCII byte.
    const buf = Buffer.from([0x6f, 0xff, 0x6b]);
    expect(trimIncompleteUtf8Tail(buf)).toEqual(buf);
  });

  test("a complete trailing sequence preceded by garbage is not trimmed", () => {
    // ends with a complete 2-byte é; the 0xFF earlier is mid-buffer garbage.
    const buf = Buffer.concat([Buffer.from([0xff]), seq("é")]);
    expect(trimIncompleteUtf8Tail(buf)).toEqual(buf);
  });
});

describe("decodeChildOutput after capture-cap trim (end-to-end)", () => {
  beforeEach(() => {
    resetLegacyDecoderCache();
  });

  test("valid UTF-8 cut mid-汉 decodes cleanly after trim (no U+FFFD, no legacy decoder)", () => {
    // Simulate the capture cap landing inside a multibyte sequence: a buffer of
    // repeated 汉 truncated one byte short of the final character.
    const whole = Buffer.from("汉".repeat(1000), "utf8");
    const cut = whole.subarray(0, whole.length - 1); // drops 1 of 3 tail bytes

    // Force the Windows branch so a strict-decode failure would reroute the WHOLE
    // buffer to the legacy code page (the bug). After trim, strict decode succeeds.
    withPlatform("win32", () => {
      resetLegacyDecoderCache();
      const trimmed = trimIncompleteUtf8Tail(cut);
      const decoded = decodeChildOutput(trimmed);
      expect(decoded).not.toContain("�"); // no replacement char
      expect(decoded).toBe("汉".repeat(999)); // last (split) char dropped, rest intact
    });
  });

  test("without trim, the same cut buffer would corrupt the whole stream on Windows", () => {
    // Guard documenting the bug: strict decode of the split buffer fails, so the
    // legacy (gb18030) decoder reinterprets ALL the bytes → not the clean prefix.
    const whole = Buffer.from("汉".repeat(100), "utf8");
    const cut = whole.subarray(0, whole.length - 1);
    withPlatform("win32", () => {
      resetLegacyDecoderCache();
      const decodedUntrimmed = decodeChildOutput(cut);
      expect(decodedUntrimmed).not.toBe("汉".repeat(99));
    });
  });

  test("genuinely-GBK output still reaches the legacy fallback unchanged (regression)", () => {
    // GBK bytes for 中文 (D6 D0 CE C4) — invalid UTF-8. On the normal (NON-
    // truncated) path the trim is never applied, so the full legacy buffer
    // reaches the fallback decoder byte-identical, exactly as before this change.
    const gbk = Buffer.from([0xd6, 0xd0, 0xce, 0xc4]);
    withPlatform("win32", () => {
      resetLegacyDecoderCache();
      expect(decodeChildOutput(gbk)).toBe("中文"); // untrimmed path: unchanged
    });
  });

  test("trim leaves a legacy tail that is not lead-like fully intact", () => {
    // A legacy buffer ending on a continuation/ASCII-shaped byte (here 0x0a)
    // is not mistaken for an incomplete UTF-8 lead, so even on the truncated
    // path it reaches the fallback decoder unchanged.
    const gbkLine = Buffer.from([0xd6, 0xd0, 0xce, 0xc4, 0x0a]); // 中文\n
    const trimmed = trimIncompleteUtf8Tail(gbkLine);
    expect(trimmed).toEqual(gbkLine); // untouched — ends on complete ASCII
    withPlatform("win32", () => {
      resetLegacyDecoderCache();
      expect(decodeChildOutput(trimmed)).toBe("中文\n");
    });
  });
});

// Mixed-stream regression for issue #9: one shared `truncated` flag used to route
// an INTACT, uncapped stream through trimIncompleteUtf8Tail whenever the OTHER
// stream crossed the cap. Per-stream flags now gate the trim independently, so a
// complete GBK stream keeps its lead-shaped final byte (`c4`) — the byte whose
// loss decodes `中文` as `中�` on a Windows legacy code page. These spawn a real
// child that overflows ONE stream past the 64MB cap while emitting the intact GBK
// bytes on the other, exercising the full executeCommand close handler.
describe("executeCommand mixed-stream truncation (issue #9)", () => {
  // GBK bytes for 中文; the trailing C4 is a valid 2-byte UTF-8 lead shape, so a
  // wrongly-applied trim would shed it. With one shared truncated flag, a capped
  // stdout would route this complete stderr through trimIncompleteUtf8Tail and
  // drop the c4 — decoding 中文 as 中� on a Windows legacy code page. Per-stream
  // flags must leave the uncapped stream byte-identical, so its decode equals the
  // full 4-byte buffer's decode. We recompute that off a freshly-reset decoder
  // cache (same as the executor's own decode) so the assertion holds on any
  // platform regardless of test ordering.
  const GBK = Buffer.from([0xd6, 0xd0, 0xce, 0xc4]);
  const CAP = 64 * 1024 * 1024;

  // Node one-liner: write `over` bytes of ASCII to one stream (overflowing the
  // cap) and the raw GBK bytes to the other. The GBK bytes travel as a hex arg so
  // they never sit in the source-file encoding.
  const gbkHex = GBK.toString("hex");
  const overflowChunk = `Buffer.alloc(${CAP + 1024}, 0x61)`; // 'a' * (cap + slack)

  // The trim genuinely sheds the c4 — confirming the two paths are distinguishable
  // and the test would catch a regression to the shared-flag behavior.
  test("trim of the GBK fixture drops exactly the trailing c4 (distinguishable paths)", () => {
    const trimmed = trimIncompleteUtf8Tail(GBK);
    expect(trimmed).toEqual(Buffer.from([0xd6, 0xd0, 0xce]));
  });

  function intactDecode(): string {
    resetLegacyDecoderCache();
    return decodeChildOutput(GBK);
  }

  test("capped stdout leaves a complete GBK stderr intact (stderr keeps its c4)", async () => {
    const script =
      `process.stdout.write(${overflowChunk});` +
      `process.stderr.write(Buffer.from(process.argv[1], 'hex'));`;
    resetLegacyDecoderCache(); // executor decodes on the real platform; pin a clean cache
    const result = await executeCommand({
      program: process.execPath,
      args: ["-e", script, gbkHex],
      original: [process.execPath, "-e", script, gbkHex],
      displayCommand: "node -e overflow-stdout",
    });

    // stderr never hit the cap → must NOT be trimmed → it decodes like the full
    // 4-byte buffer (its c4 preserved), then the truncation marker is appended
    // because stdout crossed the cap. Were the shared flag back, stderr would lose
    // its c4 and this prefix check would fail on the dropped character.
    expect(result.stderr.startsWith(intactDecode())).toBe(true);
    expect(result.stderr).toContain("capture cap — truncated");
  }, 30000);

  test("capped stderr leaves a complete GBK stdout intact (stdout keeps its c4)", async () => {
    const script =
      `process.stderr.write(${overflowChunk});` +
      `process.stdout.write(Buffer.from(process.argv[1], 'hex'));`;
    resetLegacyDecoderCache();
    const result = await executeCommand({
      program: process.execPath,
      args: ["-e", script, gbkHex],
      original: [process.execPath, "-e", script, gbkHex],
      displayCommand: "node -e overflow-stderr",
    });

    // stdout never hit the cap → must NOT be trimmed → byte-identical full decode.
    expect(result.stdout).toBe(intactDecode());
    expect(result.stderr).toContain("capture cap — truncated");
  }, 30000);
});
