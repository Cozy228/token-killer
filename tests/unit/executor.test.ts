import { describe, expect, test } from "vitest";

import { executeCommand } from "../../src/executor.js";

describe("executeCommand", () => {
  test("captures stdout, stderr, and preserves exit code", async () => {
    const result = await executeCommand({
      program: process.execPath,
      args: [
        "-e",
        "process.stdout.write('out'); process.stderr.write('err'); process.exit(7);",
      ],
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
