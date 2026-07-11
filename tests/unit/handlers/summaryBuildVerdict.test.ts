import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { routeCommand } from "../../../src/router.js";
import type { RawResult, TkOptions } from "../../../src/types.js";
import { toParsedCommand } from "../../helpers/fixtureCases.js";

// DR-18 / O-23 — `summary <build cmd>` must never emit a heuristic success verdict.
// The affirmative "Build successful" claim is anchored to the real EXIT CODE, not to
// a keyword scan of the output (LAW §3: zero false reassurance). A summary that
// asserts that verdict also carries a raw receipt/anchor (part b).

let workdir: string;
let prevHome: string | undefined;

beforeEach(() => {
  workdir = mkdtempSync(path.join(tmpdir(), "ctx-dr18-"));
  // Sandbox the raw-snapshot store so the receipt-pointer assertion can read the
  // snapshot the inline `[full output: <path>]` pointer names (CONTEXA_HOME).
  prevHome = process.env.CONTEXA_HOME;
  process.env.CONTEXA_HOME = workdir;
});

afterEach(() => {
  if (prevHome === undefined) delete process.env.CONTEXA_HOME;
  else process.env.CONTEXA_HOME = prevHome;
  rmSync(workdir, { recursive: true, force: true });
});

function options(overrides: Partial<TkOptions> = {}): TkOptions {
  return {
    raw: false,
    stats: false,
    maxLines: 100000,
    maxChars: 10000000,
    saveRaw: false,
    cwd: workdir,
    ...overrides,
  };
}

function raw(command: string[], stdout: string, exitCode = 0): RawResult {
  return { command: command.join(" "), stdout, stderr: "", exitCode, durationMs: 1 };
}

async function run(command: string[], stdout: string, opts: TkOptions, exitCode = 0) {
  const parsed = toParsedCommand(command);
  const handler = routeCommand(parsed);
  return handler.filter(raw(command, stdout, exitCode), parsed, opts);
}

describe("DR-18 summarize build verdict is anchored to the exit code", () => {
  test("(1) failed build with NO 'error' token never asserts success", async () => {
    // A linker failure / OOM kill: the log carries no literal English "error" token,
    // so the old keyword scan (errors===0 && warnings===0) printed "Build successful".
    const stdout = [
      "Compiling my-crate v0.1.0",
      "note: ld: undefined symbol: _frobnicate",
      "note: linking with `cc` exited abnormally",
    ].join("\n");

    // Non-zero exit (137 = SIGKILL/OOM, or a plain 101) — the process FAILED.
    const result = await run(["summary", "cargo", "build"], stdout, options(), 101);

    // Header reflects the exit code; body must NOT contradict it.
    expect(result.output).toContain("[FAIL] Command:");
    expect(result.output).not.toContain("Build successful");
    // Neutral supplementary detail is still allowed (compiled count).
    expect(result.output).toContain("Build Summary:");
  });

  test("(2) successful build with a benign 'error' substring is not reported as failure", async () => {
    // "error handling module compiled" contains the substring "error" but the build
    // succeeded (exit 0). The old scan counted it as an error and hid success.
    const stdout = [
      "Compiling app v1.0.0",
      "   Compiling error handling module compiled",
      "Finished dev [unoptimized + debuginfo] target(s)",
    ].join("\n");

    const result = await run(
      ["summary", "cargo", "build"],
      stdout,
      options({ saveRaw: "auto" }),
      0,
    );

    expect(result.output).toContain("[ok] Command:");
    // The keyword-derived error must NOT surface as a failure signal.
    expect(result.output).not.toContain("[error]");
    expect(result.output).not.toMatch(/\berrors\b/);
    // Exit 0 authorises the affirmative verdict.
    expect(result.output).toContain("Build successful");
  });

  test("(3) header and body never contradict — failed exit + no success verdict", async () => {
    const stdout = ["cannot find crate for `serde`", "panic: build aborted"].join("\n");
    const result = await run(["summary", "cargo", "build"], stdout, options(), 1);

    const header = result.output.split("\n")[0] ?? "";
    expect(header).toContain("[FAIL]");
    expect(result.output).not.toContain("Build successful");
  });

  test("(3b) header and body never contradict — success exit affirms, header [ok]", async () => {
    const stdout = ["Compiling app v1.0.0", "Finished release [optimized] target(s)"].join("\n");
    const result = await run(
      ["summary", "cargo", "build"],
      stdout,
      options({ saveRaw: "auto" }),
      0,
    );

    const header = result.output.split("\n")[0] ?? "";
    expect(header).toContain("[ok]");
    expect(result.output).toContain("Build successful");
    // No failure signal anywhere in an all-clean successful build.
    expect(result.output).not.toContain("[FAIL]");
    expect(result.output).not.toContain("[error]");
  });

  test("(b) an asserting build summary carries a raw receipt anchored to the real output", async () => {
    const stdout = ["Compiling app v1.0.0", "Finished release [optimized] target(s) in 3.20s"].join(
      "\n",
    );
    const result = await run(
      ["summary", "cargo", "build"],
      stdout,
      options({ saveRaw: "auto" }),
      0,
    );

    expect(result.output).toContain("Build successful");
    // The verdict is anchored: a snapshot pointer to the raw output it was derived from.
    expect(result.output).toMatch(/\[full output: .+\]/);
    expect(result.omission?.kind).toBe("replacement");
    expect(result.omission?.rawPointer).toBeTruthy();
    expect(result.rawOutputPath).toBeTruthy();

    // Recovery contract: the snapshot the pointer names holds the full raw output.
    const snapshot = readFileSync(path.join(workdir, result.rawOutputPath!), "utf8");
    expect(snapshot).toContain("Finished release [optimized] target(s) in 3.20s");
  });

  test("(b) with --no-save-raw an asserting summary cannot anchor, so it stops asserting (fails open to raw)", async () => {
    const stdout = ["Compiling app v1.0.0", "Finished release [optimized] target(s) in 3.20s"].join(
      "\n",
    );
    const result = await run(["summary", "cargo", "build"], stdout, options({ saveRaw: false }), 0);

    // No receipt is possible ⇒ the unanchored verdict is dropped in favour of the
    // full raw output. Nothing is hidden; no fake reassurance ships.
    expect(result.output).not.toContain("Build successful");
    expect(result.output).toContain("Finished release [optimized] target(s) in 3.20s");
    expect(result.qualityStatus).toBe("inflated");
  });

  test("a failed build that DID carry error lines still surfaces them (neutral, no success)", async () => {
    const stdout = [
      "Compiling app v1.0.0",
      "error[E0432]: unresolved import `foo::bar`",
      "error: aborting due to previous error",
    ].join("\n");
    const result = await run(["summary", "cargo", "build"], stdout, options(), 101);

    expect(result.output).toContain("[FAIL] Command:");
    expect(result.output).toContain("[error]");
    expect(result.output).not.toContain("Build successful");
  });
});
