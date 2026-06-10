import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { constants as osConstants } from "node:os";
import { delimiter, join } from "node:path";

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

// tk pipes the child's stdout/stderr and must turn those raw bytes back into a
// string. The bytes are in whatever encoding the child chose, which on Windows
// is per-tool: git and the Node/Rust toolchain emit UTF-8, but tools that follow
// the locale code page (Python, pre-JDK18 Java, cmd builtins like `dir`) emit
// the legacy multibyte encoding — GBK/cp936 on a zh-CN box. Forcing every tool
// to UTF-8 one env var at a time does not scale (and JAVA_TOOL_OPTIONS even
// pollutes stderr with a "Picked up" banner). Instead we decode once at this
// boundary: strict UTF-8 first — which keeps ASCII and genuine UTF-8 byte-exact
// — and only when that fails fall back to the host's legacy code page. POSIX
// locales are UTF-8 so the fallback never fires off Windows. If the runtime
// lacks ICU data for the legacy decoder (a small-icu Node build) we degrade to
// lossy UTF-8 — never worse than a hardcoded toString("utf8"). (RTK never fixed
// this: it decodes child output with from_utf8_lossy — mojibake without a crash
// — and its POSIX-UTF-8 home turf never triggers it.)
let legacyDecoder: TextDecoder | null | undefined;

// Map the active Windows console code page to its encoding label. Resolved once,
// lazily — only the first time a buffer fails strict UTF-8 — so the common
// all-UTF-8 path never spawns chcp. Defaults to GB18030 (the lossless zh-CN
// superset) when the code page can't be read; genuine UTF-8 output never reaches
// this path regardless, so a wrong guess only ever touches already-legacy bytes.
function detectWindowsLegacyLabel(): string | null {
  let cp: number | null = null;
  try {
    const out = spawnSync("chcp.com", [], {
      encoding: "utf8",
      windowsHide: true,
      timeout: 1000,
    });
    const match = /(\d{2,6})/.exec(out.stdout ?? "");
    cp = match ? Number(match[1]) : null;
  } catch {
    cp = null;
  }
  switch (cp) {
    case 65001:
      return null; // console already UTF-8 — nothing to fall back to
    case 932:
      return "shift_jis";
    case 949:
      return "euc-kr";
    case 950:
      return "big5";
    default:
      return "gb18030"; // 936 and unknown → zh-CN default
  }
}

function getLegacyDecoder(): TextDecoder | null {
  if (legacyDecoder !== undefined) return legacyDecoder;
  if (process.platform !== "win32") return (legacyDecoder = null);
  const label = detectWindowsLegacyLabel();
  try {
    legacyDecoder = label ? new TextDecoder(label) : null;
  } catch {
    legacyDecoder = null; // small-icu build lacks this encoding's data
  }
  return legacyDecoder;
}

// Decode one captured stream. Exported for tests; see the note above for why we
// prefer strict UTF-8 and fall back to the legacy code page rather than forcing
// each child tool's output encoding.
export function decodeChildOutput(buf: Buffer): string {
  if (buf.length === 0) return "";
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {
    const legacy = getLegacyDecoder();
    return legacy ? legacy.decode(buf) : buf.toString("utf8");
  }
}

// Reset the cached legacy decoder. Test-only seam so a test can re-resolve the
// code page within a single process.
export function resetLegacyDecoderCache(): void {
  legacyDecoder = undefined;
}

// Build the env passed to a spawned real tool. When TK_SHIM_DIR is set (running
// behind the shim) the child PATH has the shim dir stripped so the real tool —
// not the wrapper — is resolved, and the sentinel hard-errors if the only
// reachable copy still lives in the shim dir (recursion guard, ADR 0002 §4).
// Without TK_SHIM_DIR this is a no-op and plain `tk` behaves exactly as before.
function buildChildEnv(
  program: string,
  extraEnv?: Record<string, string>,
): Record<string, string> | undefined {
  const shimDir = process.env.TK_SHIM_DIR;
  if (!shimDir) {
    return extraEnv ? ({ ...process.env, ...extraEnv } as Record<string, string>) : undefined;
  }
  const strippedPath = buildChildPath();
  assertNoRecursion(program, strippedPath);
  return { ...process.env, ...extraEnv, PATH: strippedPath } as Record<string, string>;
}

// Windows-only: resolve a bare program name to a full path honoring PATHEXT.
// Node's spawn (like Rust's Command::new — see rtk core/utils.rs resolve_binary)
// does NOT search PATHEXT, so `spawn("pnpm")` fails even when `pnpm.CMD` is on
// PATH. We resolve against the CHILD's PATH (already shim-stripped when running
// behind the shim, so we never resolve into a shim wrapper). Returns the bare
// name unchanged on non-Windows, when the name already contains a path
// separator, or when nothing is found — in which case spawn fails open to the
// existing ENOENT → 127 path.
export function resolveProgram(program: string, pathValue: string | undefined): string {
  if (process.platform !== "win32") return program;
  if (program.includes("\\") || program.includes("/")) return program;
  const dirs = (pathValue ?? "").split(delimiter).filter(Boolean);
  const exts = (process.env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD")
    .split(";")
    .map((ext) => ext.trim())
    .filter(Boolean);
  for (const dir of dirs) {
    for (const ext of exts) {
      const candidate = join(dir, program + ext);
      if (existsSync(candidate)) return candidate;
    }
  }
  return program;
}

function isBatchScript(file: string): boolean {
  const lower = file.toLowerCase();
  return lower.endsWith(".cmd") || lower.endsWith(".bat");
}

// Minimal cmd.exe token quoting — wrap tokens with whitespace or cmd
// metacharacters in double quotes (doubling any embedded quote). Combined with
// the outer `"..."` + `/s` below, cmd strips the outer pair and parses the rest
// literally. Sufficient for the argv we proxy (flags, paths); not a general
// shell-escaping library.
function cmdQuote(token: string): string {
  if (token.length > 0 && !/[\s"^&|<>()%!]/.test(token)) return token;
  return `"${token.replace(/"/g, '""')}"`;
}

// Resolve the actual spawn target. On Windows a resolved .cmd/.bat must go
// through ComSpec: CreateProcess can't execute a batch script and Node refuses
// .bat/.cmd without a shell (CVE-2024-27980). Everything else — plain .exe and
// all non-Windows — spawns directly with the resolved path.
export function buildSpawnTarget(
  program: string,
  args: string[],
  pathValue: string | undefined,
): { file: string; args: string[]; windowsVerbatimArguments: boolean } {
  const resolved = resolveProgram(program, pathValue);
  if (process.platform === "win32" && isBatchScript(resolved)) {
    const comspec = process.env.ComSpec || "cmd.exe";
    const line = [resolved, ...args].map(cmdQuote).join(" ");
    return {
      file: comspec,
      args: ["/d", "/s", "/c", `"${line}"`],
      windowsVerbatimArguments: true,
    };
  }
  return { file: resolved, args, windowsVerbatimArguments: false };
}

// Hard ceiling on captured child output (per stream). Above this we stop buffering so
// a runaway producer can't OOM the process (H19). Far above any output a handler would
// meaningfully compress; the marker tells the reader truncation happened.
const MAX_CAPTURE_BYTES = 64 * 1024 * 1024;

export function executeCommand(
  command: ParsedCommand,
  // Optional extra environment variables merged over process.env. RTK rewrites
  // some commands with a stable locale (e.g. ls runs under LC_ALL=C so English
  // month names parse) — handlers pass that through here.
  extraEnv?: Record<string, string>,
): Promise<RawResult> {
  const started = Date.now();
  const env = buildChildEnv(command.program, extraEnv);
  const target = buildSpawnTarget(command.program, command.args, env?.PATH ?? process.env.PATH);

  return new Promise((resolve) => {
    const child = spawn(target.file, target.args, {
      cwd: process.cwd(),
      shell: false,
      windowsHide: true,
      windowsVerbatimArguments: target.windowsVerbatimArguments,
      ...(env ? { env } : {}),
    });

    // Cap captured output to bound memory: a handler-matched command on a huge repo
    // (`git log`, `grep -r`) could otherwise buffer gigabytes via Buffer.concat and
    // OOM-kill the process — and an OOM crash bypasses the fail-open catch entirely
    // (H19). Past the cap we stop accumulating and mark truncation; the handler still
    // compresses what it got and the exit code is preserved.
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let truncated = false;

    child.stdout?.on("data", (chunk: Buffer) => {
      if (stdoutBytes >= MAX_CAPTURE_BYTES) {
        truncated = true;
        return;
      }
      stdoutBytes += chunk.length;
      stdout.push(chunk);
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      if (stderrBytes >= MAX_CAPTURE_BYTES) {
        truncated = true;
        return;
      }
      stderrBytes += chunk.length;
      stderr.push(chunk);
    });
    if (child.stdin) {
      // Swallow EPIPE: a child that closes stdin early (e.g. `head`) would otherwise
      // make this pipe emit an unhandled 'error' and crash the process (L6).
      child.stdin.on("error", () => {});
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
      const stderrText = decodeChildOutput(Buffer.concat(stderr));
      resolve({
        command: command.displayCommand,
        stdout: decodeChildOutput(Buffer.concat(stdout)),
        stderr: truncated
          ? `${stderrText}\n[tk] output exceeded ${Math.floor(
              MAX_CAPTURE_BYTES / (1024 * 1024),
            )}MB capture cap — truncated]\n`
          : stderrText,
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
  const target = buildSpawnTarget(command.program, command.args, env?.PATH ?? process.env.PATH);

  return new Promise((resolve) => {
    const child = spawn(target.file, target.args, {
      cwd: opts.cwd ?? process.cwd(),
      shell: false,
      stdio: "inherit",
      windowsHide: true,
      windowsVerbatimArguments: target.windowsVerbatimArguments,
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
