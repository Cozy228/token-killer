import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { dirname } from "node:path";

import {
  buildSpawnTarget,
  decodeChildOutput,
  executeCommand,
  resetLegacyDecoderCache,
  resolveBinaryPath,
} from "../../src/executor.js";

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

  test("returns a path-qualified program verbatim only when it exists", () => {
    expect(resolveBinaryPath(process.execPath, undefined)).toBe(process.execPath);
    expect(resolveBinaryPath("/no/such/tk/binary", undefined)).toBeUndefined();
  });
});

describe("buildSpawnTarget — baked TK_REAL_BIN (2.1)", () => {
  const original = process.env.TK_REAL_BIN;
  afterEach(() => {
    if (original === undefined) delete process.env.TK_REAL_BIN;
    else process.env.TK_REAL_BIN = original;
  });

  test("uses the baked path when it exists and the basename matches the program", () => {
    process.env.TK_REAL_BIN = process.execPath; // basename "node"
    const target = buildSpawnTarget("node", ["-v"], "/irrelevant/path");
    expect(target.file).toBe(process.execPath);
  });

  test("ignores a baked path whose basename does not match the program", () => {
    process.env.TK_REAL_BIN = process.execPath; // basename "node", not "git"
    const target = buildSpawnTarget("git", [], "/irrelevant/path");
    // Falls back to resolveProgram, which on POSIX returns the bare name unchanged.
    expect(target.file).toBe("git");
  });

  test("ignores a baked path that no longer exists (stale → walk fallback)", () => {
    process.env.TK_REAL_BIN = "/no/such/dir/node";
    const target = buildSpawnTarget("node", [], "/irrelevant/path");
    expect(target.file).toBe("node");
  });

  test("ignores the baked path for a path-qualified program", () => {
    process.env.TK_REAL_BIN = process.execPath;
    const target = buildSpawnTarget("./node", [], "/irrelevant/path");
    expect(target.file).toBe("./node");
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
