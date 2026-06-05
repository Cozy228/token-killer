import { spawn } from "node:child_process";
import { constants as osConstants } from "node:os";

import { assertNoRecursion, buildChildPath } from "./shim/path.js";
import type { ParsedCommand, RawResult } from "./types.js";

// Resolve a child's exit code, following the shell convention that a process
// killed by a signal exits with 128 + signal number (SIGINT→130, SIGTERM→143),
// so downstream consumers can recover the signal (review finding F4). Falls back
// to a bare 128 if the signal name is unknown, and 1 when neither code nor
// signal is present.
function resolveExitCode(code: number | null, signal: NodeJS.Signals | null): number {
  if (code !== null) return code;
  if (signal) {
    const signo = (osConstants.signals as Record<string, number>)[signal];
    return 128 + (signo ?? 0);
  }
  return 1;
}

// Build the env passed to a spawned real tool. When TG_SHIM_DIR is set (running
// behind the shim) the child PATH has the shim dir stripped so the real tool —
// not the wrapper — is resolved, and the sentinel hard-errors if the only
// reachable copy still lives in the shim dir (recursion guard, ADR 0002 §4).
// Without TG_SHIM_DIR this is a no-op and plain `tg` behaves exactly as before.
function buildChildEnv(
  program: string,
  extraEnv?: Record<string, string>,
): Record<string, string> | undefined {
  const shimDir = process.env.TG_SHIM_DIR;
  if (!shimDir) {
    return extraEnv ? { ...process.env, ...extraEnv } as Record<string, string> : undefined;
  }
  const strippedPath = buildChildPath();
  assertNoRecursion(program, strippedPath);
  return { ...process.env, ...extraEnv, PATH: strippedPath } as Record<string, string>;
}

export function executeCommand(
  command: ParsedCommand,
  // Optional extra environment variables merged over process.env. RTK rewrites
  // some commands with a stable locale (e.g. ls runs under LC_ALL=C so English
  // month names parse) — handlers pass that through here.
  extraEnv?: Record<string, string>,
): Promise<RawResult> {
  const started = Date.now();
  const env = buildChildEnv(command.program, extraEnv);

  return new Promise((resolve) => {
    const child = spawn(command.program, command.args, {
      cwd: process.cwd(),
      shell: false,
      windowsHide: true,
      ...(env ? { env } : {}),
    });

    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];

    child.stdout?.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr?.on("data", (chunk: Buffer) => stderr.push(chunk));
    if (child.stdin) {
      process.stdin.pipe(child.stdin);
    }

    child.on("error", (error: NodeJS.ErrnoException) => {
      const exitCode = error.code === "ENOENT" ? 127 : 1;
      resolve({
        command: command.displayCommand,
        stdout: "",
        stderr:
          exitCode === 127
            ? `${command.program}: command not found\n`
            : `${command.program}: ${error.message}\n`,
        exitCode,
        durationMs: Date.now() - started,
      });
    });

    child.on("close", (code, signal) => {
      resolve({
        command: command.displayCommand,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
        exitCode: resolveExitCode(code, signal),
        durationMs: Date.now() - started,
      });
    });
  });
}

export type PassthroughOptions = {
  cwd?: string;
  extraEnv?: Record<string, string>;
};

// Run the real tool with inherited stdio (including the TTY) and NO capture or
// compression — the safe path for interactive commands and generic
// fall-throughs (CONTEXT.md → Passthrough). Resolves the exit code only. Unlike
// `--raw` (which captures-then-prints via executeCommand), passthrough never
// touches the streams. ENOENT → 127. Recursion guard applies as in
// executeCommand; assertNoRecursion may throw ShimRecursionError synchronously,
// which the caller catches to fail toward a clear error.
export function executePassthrough(
  command: ParsedCommand,
  opts: PassthroughOptions = {},
): Promise<number> {
  const env = buildChildEnv(command.program, opts.extraEnv);

  return new Promise((resolve) => {
    const child = spawn(command.program, command.args, {
      cwd: opts.cwd ?? process.cwd(),
      shell: false,
      stdio: "inherit",
      windowsHide: true,
      ...(env ? { env } : {}),
    });

    child.on("error", (error: NodeJS.ErrnoException) => {
      const exitCode = error.code === "ENOENT" ? 127 : 1;
      process.stderr.write(
        exitCode === 127
          ? `${command.program}: command not found\n`
          : `${command.program}: ${error.message}\n`,
      );
      resolve(exitCode);
    });

    child.on("close", (code, signal) => {
      resolve(resolveExitCode(code, signal));
    });
  });
}
