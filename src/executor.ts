import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { constants as osConstants } from "node:os";
import { basename, delimiter, extname, join } from "node:path";

import { resolveCachedBinary } from "./core/pathCache.js";
import { assertNoRecursion, buildChildPath, hashResolutionEnv, resolveReal } from "./shim/path.js";
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

// When capture stops at MAX_CAPTURE_BYTES the buffer ends at an arbitrary chunk
// boundary that may fall mid-way through a multibyte UTF-8 sequence. A single
// split codepoint at the tail makes the whole buffer fail strict decode, which
// on Windows reroutes ALL of it to the legacy code-page decoder (mojibake). Trim
// only a *plausible incomplete trailing sequence*: a lead byte whose declared
// length overruns the end, preceded solely by valid continuation bytes. We
// inspect at most the last 3 bytes (a 4-byte sequence has 3 trailing
// continuations). Mid-buffer garbage and pure-continuation tails are left
// untouched so genuinely-legacy output still reaches the fallback decoder. Apply
// ONLY on the truncation path — a complete buffer must decode byte-identical.
export function trimIncompleteUtf8Tail(buf: Buffer): Buffer {
  // Sequence length declared by a lead byte; 0 means not a UTF-8 lead byte.
  const leadLen = (b: number): number => {
    if ((b & 0x80) === 0x00) return 1; // 0xxxxxxx — ASCII, complete by itself
    if ((b & 0xe0) === 0xc0) return 2; // 110xxxxx
    if ((b & 0xf0) === 0xe0) return 3; // 1110xxxx
    if ((b & 0xf8) === 0xf0) return 4; // 11110xxx
    return 0; // continuation byte (10xxxxxx) or invalid
  };
  const isCont = (b: number): boolean => (b & 0xc0) === 0x80;

  // Scan back over up to 3 trailing continuation bytes to find the lead byte.
  for (let back = 1; back <= 3 && back <= buf.length; back++) {
    const i = buf.length - back; // candidate lead-byte index
    const byte = buf[i];
    if (isCont(byte)) continue; // still inside the trailing run; keep scanning
    const declared = leadLen(byte);
    if (declared === 0) return buf; // mid-buffer garbage / stray continuation
    // `back` is how many bytes from the lead to the end inclusive.
    if (declared > back) return buf.subarray(0, i); // incomplete tail — trim it
    return buf; // sequence is complete (or over-long, i.e. real garbage)
  }
  return buf; // all of the last <=3 bytes are continuations: not a split lead
}

// Build the env passed to a spawned real tool. When TK_SHIM_DIR is set (running
// behind the shim) the child PATH has the shim dir stripped so the real tool —
// not the wrapper — is resolved, and the sentinel hard-errors if the only
// reachable copy still lives in the shim dir (recursion guard, ADR 0002 §4).
// Without TK_SHIM_DIR this is a no-op and plain `tk` behaves exactly as before.
function buildChildEnv(
  program: string,
  extraEnv?: Record<string, string>,
): Record<string, string | undefined> | undefined {
  const shimDir = process.env.TK_SHIM_DIR;
  if (!shimDir) {
    return extraEnv ? { ...process.env, ...extraEnv } : undefined;
  }
  const strippedPath = buildChildPath();
  assertNoRecursion(program, strippedPath);
  const env: Record<string, string | undefined> = {
    ...process.env,
    ...extraEnv,
    PATH: strippedPath,
  };
  restoreInjectedCompileCache(env);
  return env;
}

// Undo the wrapper's NODE_COMPILE_CACHE injection (2.3) for the spawned REAL tool. The
// wrapper points tk's OWN node at ~/.token-killer/v8-cache, but a child Node tool (tsc,
// npm, …) must not inherit it — that would pollute tk's cache dir with the child's
// bytecode AND override the user's own NODE_COMPILE_CACHE. The wrapper saved the
// caller's original value in TK_NODE_COMPILE_CACHE_PREV; restore it (or remove
// NODE_COMPILE_CACHE when the caller had none), then drop the bookkeeping var. Node's
// spawn omits any env key whose value is undefined, so unsetting is clean. A no-op when
// the var is absent (plain `tk`, or a wrapper built before 2.3's restore).
function restoreInjectedCompileCache(env: Record<string, string | undefined>): void {
  const prev = env.TK_NODE_COMPILE_CACHE_PREV;
  if (prev === undefined) return;
  env.TK_NODE_COMPILE_CACHE_PREV = undefined;
  env.NODE_COMPILE_CACHE = prev === "" ? undefined : prev;
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

// Resolve `program` to an ABSOLUTE executable path on `pathValue`, or undefined when
// nothing is found. Unlike resolveProgram — which returns the bare name on a miss and
// is a Windows-only no-op so spawn can do its own POSIX lookup — this resolves on BOTH
// platforms and is used at INSTALL time to bake the path once (2.1). Delegates to
// resolveReal, which mirrors the shell's own lookup: it requires the candidate to be a
// FILE and (on POSIX) to carry the execute bit. A bare existsSync would wrongly bake a
// non-executable `git` that shadows a later executable one on PATH — the shell skips
// the former and runs the latter, so the baked path must too. Windows honors PATHEXT.
export function resolveBinaryPath(
  program: string,
  pathValue: string | undefined,
): string | undefined {
  return resolveReal(program, pathValue ?? "") ?? undefined;
}

// A baked, validated real-binary path (TK_REAL_BIN, exported by the shim wrapper at
// install time) lets buildSpawnTarget skip the per-command PATH×PATHEXT walk — the
// install paid that walk once (2.1). We trust it only after THREE cheap guards so it
// can never run a binary the shell would no longer pick: (1) the resolution-env hash
// (TK_REAL_PATH_HASH) must equal a fresh hash of the CURRENT stripped PATH+PATHEXT —
// if the user reordered/extended PATH since install a different binary may now win, so
// this rejects the baked path and forces a live walk; (2) the baked file's basename
// (minus extension) must equal the requested program, rejecting a leftover var from a
// different wrapper; (3) one existsSync revalidation, rejecting a moved/uninstalled
// binary. Any guard failing returns undefined and the caller falls back to today's
// walk — never a behavior change. Skipped entirely for an explicit-path program.
function bakedRealBin(program: string, pathValue: string | undefined): string | undefined {
  const baked = process.env.TK_REAL_BIN;
  if (!baked) return undefined;
  if (program.includes("\\") || program.includes("/")) return undefined;
  // PATH-equality gate: only trust the baked path while the resolution environment is
  // byte-identical to install time. A bare TK_REAL_BIN with no/mismatched hash is NOT
  // trusted (conservative); the walk fallback stays correct.
  const bakedHash = process.env.TK_REAL_PATH_HASH;
  if (!bakedHash || bakedHash !== hashResolutionEnv(pathValue ?? "")) return undefined;
  const stem = basename(baked, extname(baked));
  const matches =
    process.platform === "win32" ? stem.toLowerCase() === program.toLowerCase() : stem === program;
  if (!matches) return undefined;
  if (!existsSync(baked)) return undefined;
  return baked;
}

// True when `program` is backed by a real executable reachable on the child
// PATH. tk wraps real tools; it must never claim a command whose binary is
// absent. On a stock Windows box `cat`/`ls`/`wc`/`env` are not executables —
// PowerShell aliases them to cmdlets — so intercepting them (hook rewrite or
// shim wrapper) only breaks what the shell would otherwise have run. The check
// is Windows-only: off Windows tk's handled tools are present and resolveProgram
// is a no-op, so this returns true without touching the filesystem, leaving
// POSIX behavior (and every existing test) unchanged.
export function isProgramAvailable(program: string): boolean {
  if (process.platform !== "win32") return true;
  const childPath = process.env.TK_SHIM_DIR ? buildChildPath() : process.env.PATH;
  // 2.1 item 4: the hook path has no baked TK_REAL_BIN wrapper env, so memoize the
  // PATH×PATHEXT walk across invocations (revalidated with one existsSync per hit).
  return resolveCachedBinary(program, childPath) !== undefined;
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

// Env-var indirection to neutralize cmd.exe's `%VAR%` expansion (Plan 005).
//
// cmd.exe expands `%name%` in its earliest parsing phase, scanning the WHOLE
// command line and IGNORING quote state — so quoting a `.cmd`/`.bat` argument
// cannot stop `%PATH%`, `%CD%`, or a `%…%` pair that forms across two args from
// being rewritten before the real tool sees it. Caret-escaping doesn't work
// inside quotes (and `%` can't be caret-escaped on a `/c` line); `%%` is a
// batch-file-only escape, not a `cmd /c` one.
//
// Fix: bind an indirection variable to `%` in the spawned child's env and
// replace every literal `%` in the line with `%NAME%`. cmd expands `%NAME%` →
// a single `%` in one pass (the substituted `%` is not re-scanned),
// reconstructing the literal text exactly once. Because every `%` becomes its
// own self-contained reference, no two stray `%` can ever pair up — this is
// immune to the cross-arg-pair case that defeats per-token quoting, and immune
// to quote state.
//
// The variable defaults to TK_PCT. But the parent env may already bind TK_PCT
// to something other than `%`; rewriting `%`→`%TK_PCT%` would then expand to
// the user's value and CORRUPT the argument — the exact silent corruption this
// plan removes. So when TK_PCT is taken we probe TK_PCT_1, TK_PCT_2, … for the
// first name that is free (unset, or already exactly `%`) in the env the child
// will actually receive, and use that. Only if every probed name is taken
// (within PCT_NAME_PROBE_LIMIT — practically never) do we fail closed: the
// caller surfaces a clear error naming the offending argument and spawns
// nothing, rather than emitting a corruptible line.
const PCT_ENV_BASE = "TK_PCT";
const PCT_ENV_VALUE = "%";
// 16 probes (TK_PCT plus TK_PCT_1..TK_PCT_15). Reaching this bound means the
// parent env binds all 16 names to non-`%` values — effectively impossible in
// practice; the fail-closed branch exists only so we never emit a corruptible
// line if it somehow happens.
const PCT_NAME_PROBE_LIMIT = 16;

// Raised by buildSpawnTarget when a `%`-bearing win32 batch line cannot be
// safely neutralized because no collision-free indirection variable is
// available. tk fails closed: it must never spawn a command line cmd.exe would
// expand. Callers surface the message and exit non-zero (consistent with the
// ShimRecursionError fail path); nothing is spawned.
export class PercentNeutralizeError extends Error {
  constructor(offendingArg: string) {
    super(
      `tk: refusing to run a batch command — cannot safely neutralize cmd.exe ` +
        `%-expansion in argument ${JSON.stringify(offendingArg)} ` +
        `(no collision-free indirection variable available; ` +
        `unset TK_PCT or TK_PCT_1..TK_PCT_${PCT_NAME_PROBE_LIMIT - 1})`,
    );
    this.name = "PercentNeutralizeError";
  }
}

// cmd.exe's documented hard limit on the command line it parses is 8191
// characters (Microsoft: "Command prompt (Cmd. exe) command-line string
// limitation").
// https://learn.microsoft.com/en-us/troubleshoot/windows-client/shell-experience/command-line-string-limitation
const CMD_LINE_LIMIT = 8191;

// Raised by buildSpawnTarget when the %-neutralization transform would inflate a
// batch line past cmd.exe's command-line limit. Each literal `%` expands to
// `%NAME%` (+ several chars), so a command that fits comfortably under the limit
// before neutralization can cross it after — cmd would then truncate or reject
// the line, i.e. tk-induced breakage of a command that runs natively. We fail
// closed: same pre-spawn synchronous throw as ShimRecursionError /
// PercentNeutralizeError; nothing is spawned. The guard is scoped to the
// neutralized path ONLY — a line that is already over-long without tk's rewrite
// keeps native behavior (cmd's own concern, out of scope).
export class PercentLineLengthError extends Error {
  constructor(neutralizedLength: number, originalLength: number) {
    super(
      `tk: refusing to run a batch command — neutralizing cmd.exe %-expansion ` +
        `would inflate the command line to ${neutralizedLength} chars, past ` +
        `cmd.exe's ${CMD_LINE_LIMIT}-char limit (original ${originalLength} chars; ` +
        `each literal % expands to %TK_PCT%). Running this %-bearing command ` +
        `through tk is unsafe; run it directly instead.`,
    );
    this.name = "PercentLineLengthError";
  }
}

// A name is usable for the rewrite iff the parent env leaves it unset or already
// binds it to exactly `%` — either way the child ends up with NAME=% (extraEnv
// wins in mergeSpawnEnv, so even an already-`%` binding is re-asserted and can't
// be clobbered by merge order). Reads process.env, the same source the spawn
// inherits from (buildSpawnTarget only sees a PATH string, not the full env).
function isPctNameFree(name: string): boolean {
  const existing = process.env[name];
  return existing === undefined || existing === PCT_ENV_VALUE;
}

// Pick the first collision-free indirection name: TK_PCT, then TK_PCT_1,
// TK_PCT_2, … up to the probe limit. Returns undefined when all are taken, which
// drives the fail-closed branch.
function pickPctName(): string | undefined {
  if (isPctNameFree(PCT_ENV_BASE)) return PCT_ENV_BASE;
  for (let i = 1; i < PCT_NAME_PROBE_LIMIT; i++) {
    const name = `${PCT_ENV_BASE}_${i}`;
    if (isPctNameFree(name)) return name;
  }
  return undefined;
}

function neutralizePercent(token: string, pctName: string): string {
  return token.replace(/%/g, `%${pctName}%`);
}

// Merge a spawn target's `extraEnv` (currently only TK_PCT=%) over the child
// env a caller already computed. When neither is set we return `env` unchanged
// so the %-free / non-Windows / non-shim path stays byte-identical (the child
// keeps inheriting process.env implicitly via spawn). When extraEnv is present
// but `env` was undefined we must materialize an explicit env from process.env
// so the indirection variable actually reaches the child.
export function mergeSpawnEnv(
  env: Record<string, string | undefined> | undefined,
  extraEnv: Record<string, string> | undefined,
): Record<string, string | undefined> | undefined {
  if (!extraEnv) return env;
  const base = env ?? (process.env as Record<string, string | undefined>);
  return { ...base, ...extraEnv };
}

// Resolve the actual spawn target. On Windows a resolved .cmd/.bat must go
// through ComSpec: CreateProcess can't execute a batch script and Node refuses
// .bat/.cmd without a shell (CVE-2024-27980). Everything else — plain .exe and
// all non-Windows — spawns directly with the resolved path.
//
// `extraEnv`, when present, MUST be merged over the child env by the caller
// (see executeCommand / executePassthrough). It carries TK_PCT=% for the
// %-neutralization above; it is only set on the win32 batch path and only when
// the line actually contains `%`.
export function buildSpawnTarget(
  program: string,
  args: string[],
  pathValue: string | undefined,
): {
  file: string;
  args: string[];
  windowsVerbatimArguments: boolean;
  extraEnv?: Record<string, string>;
} {
  const resolved = bakedRealBin(program, pathValue) ?? resolveProgram(program, pathValue);
  if (process.platform === "win32" && isBatchScript(resolved)) {
    const comspec = process.env.ComSpec || "cmd.exe";
    const tokens = [resolved, ...args];
    const hasPercent = tokens.some((t) => t.includes("%"));

    if (hasPercent) {
      // Pick a collision-free indirection name. TK_PCT is preferred but the
      // parent env may already bind it to a non-`%` value; we then fall through
      // to TK_PCT_1, TK_PCT_2, … The chosen name's binding can't be clobbered by
      // merge order: extraEnv wins in mergeSpawnEnv.
      const pctName = pickPctName();
      if (pctName === undefined) {
        // Fail closed: no safe name within the probe bound. Never emit the
        // corruptible cmdQuote-only line cmd.exe would expand — surface a clear
        // error naming the offending argument and spawn nothing. (The caller
        // catches this on the same path as ShimRecursionError.)
        const offending = tokens.find((t) => t.includes("%")) ?? "";
        throw new PercentNeutralizeError(offending);
      }
      const line = tokens.map((t) => cmdQuote(neutralizePercent(t, pctName))).join(" ");
      const cmdArg = `"${line}"`;

      // Length guard (neutralized path only). The %→%NAME% rewrite adds chars per
      // literal `%`, so a command that fits under cmd.exe's limit before
      // neutralization can exceed it after — cmd would then truncate/reject the
      // line, breaking a natively-runnable command. We fail closed before spawn.
      //
      // What counts toward cmd.exe's ~8191-char limit: cmd parses the command
      // line CreateProcess hands it, i.e. the whole `<comspec> /d /s /c "<line>"`
      // string — the comspec path and the `/d /s /c` switches are part of that
      // line, not free. We bound the full CreateProcess command line
      // conservatively (joining argv with single spaces, as Node's
      // windowsVerbatimArguments spawn does): comspec + " /d /s /c " + cmdArg.
      // This slightly over-counts versus what cmd strictly re-scans after `/c`
      // (the safe direction — an optimistic bound that lets a too-long line
      // through would be the bug). We compare the NEUTRALIZED length; the
      // pre-neutralization line is computed only for the error message so the
      // diagnostic shows the inflation.
      const fullCmdLine = `${comspec} /d /s /c ${cmdArg}`;
      if (fullCmdLine.length > CMD_LINE_LIMIT) {
        const preLine = tokens.map(cmdQuote).join(" ");
        const preFull = `${comspec} /d /s /c "${preLine}"`;
        throw new PercentLineLengthError(fullCmdLine.length, preFull.length);
      }
      return {
        file: comspec,
        args: ["/d", "/s", "/c", cmdArg],
        windowsVerbatimArguments: true,
        extraEnv: { [pctName]: PCT_ENV_VALUE },
      };
    }

    // %-free fast path: byte-identical to the pre-fix line, no env injection.
    const line = tokens.map(cmdQuote).join(" ");
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
  // forwardStdin (default true) wires the parent's stdin into the child via the
  // pipe below. Search-like handlers set it FALSE: ripgrep with no path operand
  // searches the cwd UNLESS its stdin is a readable pipe/file, and the pipe we'd
  // otherwise hand it is empty in every non-interactive run — so rg read EOF and
  // reported a false "0 matches" for any pathless `tk rg PATTERN` (the dogfood
  // "glob bug": `-g`/`--glob` is passed INSTEAD of a path). 'ignore' gives the
  // child a /dev/null stdin (a char device, not a pipe), so it recurses the cwd
  // exactly as a direct invocation would.
  options?: { forwardStdin?: boolean },
): Promise<RawResult> {
  const started = Date.now();
  const forwardStdin = options?.forwardStdin ?? true;
  const env = buildChildEnv(command.program, extraEnv);
  const target = buildSpawnTarget(command.program, command.args, env?.PATH ?? process.env.PATH);
  const spawnEnv = mergeSpawnEnv(env, target.extraEnv);

  return new Promise((resolve) => {
    const child = spawn(target.file, target.args, {
      cwd: process.cwd(),
      shell: false,
      windowsHide: true,
      windowsVerbatimArguments: target.windowsVerbatimArguments,
      // stdout/stderr are always piped (tk captures + compresses them). stdin is
      // forwarded only when forwardStdin; otherwise the child gets /dev/null.
      stdio: forwardStdin ? ["pipe", "pipe", "pipe"] : ["ignore", "pipe", "pipe"],
      ...(spawnEnv ? { env: spawnEnv } : {}),
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
    // Track truncation per stream: the UTF-8 tail trim must run ONLY on the
    // stream that actually hit the cap. A shared flag would route an intact,
    // uncapped stream through the trim too — shedding a legitimate lead-shaped
    // final byte (e.g. GBK `c4`) and corrupting its legacy decode (issue #9).
    let stdoutTruncated = false;
    let stderrTruncated = false;

    // Mark truncation the moment a chunk crosses the cap — keeping only the bytes
    // that fit — NOT when the NEXT chunk arrives. The old "flag on the next chunk"
    // form missed the case where the CROSSING chunk is the LAST one: oversized
    // output then went out silently unmarked. It passed locally only because the
    // pipe happened to deliver another chunk after the cap was crossed; under a
    // distribution where the final chunk straddles the cap (observed on CI) the
    // `truncated` marker was dropped (issue #9 regression).
    child.stdout?.on("data", (chunk: Buffer) => {
      if (stdoutTruncated) return;
      const room = MAX_CAPTURE_BYTES - stdoutBytes;
      if (chunk.length > room) {
        if (room > 0) stdout.push(chunk.subarray(0, room));
        stdoutBytes = MAX_CAPTURE_BYTES;
        stdoutTruncated = true;
      } else {
        stdout.push(chunk);
        stdoutBytes += chunk.length;
      }
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      if (stderrTruncated) return;
      const room = MAX_CAPTURE_BYTES - stderrBytes;
      if (chunk.length > room) {
        if (room > 0) stderr.push(chunk.subarray(0, room));
        stderrBytes = MAX_CAPTURE_BYTES;
        stderrTruncated = true;
      } else {
        stderr.push(chunk);
        stderrBytes += chunk.length;
      }
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
      // Capture stops at a chunk boundary that may split a multibyte UTF-8
      // sequence; trim the incomplete tail before strict decode — but ONLY on a
      // stream that was actually truncated, since a complete buffer must reach
      // the decoder byte-identical (legacy-encoded output relies on strict UTF-8
      // failing on the whole buffer). Each stream gates on its OWN flag so a
      // capped stdout never trims an intact stderr (issue #9), and vice versa.
      const stdoutBuf = stdoutTruncated
        ? trimIncompleteUtf8Tail(Buffer.concat(stdout))
        : Buffer.concat(stdout);
      const stderrBuf = stderrTruncated
        ? trimIncompleteUtf8Tail(Buffer.concat(stderr))
        : Buffer.concat(stderr);
      const truncated = stdoutTruncated || stderrTruncated;
      const stderrText = decodeChildOutput(stderrBuf);
      resolve({
        command: command.displayCommand,
        stdout: decodeChildOutput(stdoutBuf),
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
  const spawnEnv = mergeSpawnEnv(env, target.extraEnv);

  return new Promise((resolve) => {
    const child = spawn(target.file, target.args, {
      cwd: opts.cwd ?? process.cwd(),
      shell: false,
      stdio: "inherit",
      windowsHide: true,
      windowsVerbatimArguments: target.windowsVerbatimArguments,
      ...(spawnEnv ? { env: spawnEnv } : {}),
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
