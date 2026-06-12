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
