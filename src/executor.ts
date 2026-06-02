import { spawn } from "node:child_process";

import type { ParsedCommand, RawResult } from "./types.js";

export function executeCommand(command: ParsedCommand): Promise<RawResult> {
  const started = Date.now();

  return new Promise((resolve) => {
    const child = spawn(command.program, command.args, {
      cwd: process.cwd(),
      shell: false,
      windowsHide: true,
    });

    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];

    child.stdout?.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr?.on("data", (chunk: Buffer) => stderr.push(chunk));

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
      const exitCode = code ?? (signal ? 128 : 1);
      resolve({
        command: command.displayCommand,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
        exitCode,
        durationMs: Date.now() - started,
      });
    });
  });
}
