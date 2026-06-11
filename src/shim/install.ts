import { chmodSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { realpathSync } from "node:fs";
import { delimiter, join } from "node:path";

import { tokenKillerHome } from "../core/dataDir.js";
import { resolveBinaryPath, resolveProgram } from "../executor.js";
import { shimmablePrograms } from "./programs.js";

// How a generated wrapper re-invokes tk. The wrapper calls tk by ABSOLUTE path
// (never relying on `tk` being on PATH inside the shimmed shell) so a stripped
// PATH cannot break it. In production this is `node /abs/dist/cli.js`; tests
// inject the tsx-loader form.
export type TkExec = { bin: string; args: string[] };

// Bump when the manifest shape or wrapper format changes.
// 2: each wrapper bakes TK_REAL_BIN and the manifest records `resolvedPaths` (2.1).
export const SHIM_MANIFEST_SCHEMA = 2;

export type ShimManifest = {
  schema: number;
  version: string;
  dir: string;
  programs: string[];
  installedAt: number;
  tk: TkExec;
  // 2.1: the absolute real-binary path resolved once at install, per program, so the
  // runtime can skip the PATH×PATHEXT walk. Best-effort — a program whose binary we
  // could not resolve is simply absent here, and its wrapper bakes no TK_REAL_BIN
  // (falling back to today's per-command walk). Schema-1 manifests omit it entirely.
  resolvedPaths?: Record<string, string>;
};

export function shimDir(home: string = tokenKillerHome()): string {
  return join(home, "shim");
}

export function manifestPath(home: string = tokenKillerHome()): string {
  return join(shimDir(home), "manifest.json");
}

// Resolve how to re-invoke the currently-running tk as an absolute command.
// Production: the cli entry is dist/cli.js, runnable by `node <entry>`.
export function defaultTkExec(): TkExec {
  const entry = process.argv[1] ? safeRealpath(process.argv[1]) : "";
  return { bin: safeRealpath(process.execPath), args: entry ? [entry] : [] };
}

function safeRealpath(p: string): string {
  try {
    return realpathSync(p);
  } catch {
    return p;
  }
}

function shQuote(value: string): string {
  // Single-quote for POSIX sh; escape embedded single quotes.
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

// POSIX wrapper: `exec <tk...> <program> "$@"`. Forwards args and the exit code.
// It self-exports TK_SHIM_DIR (baked at install time, when the shim dir is known)
// so tk's recursion guard strips the shim dir from the child PATH even when the
// rc-exported var is absent — a subshell, an env-stripping host, or a manually-
// PATH'd shim dir (C7 fork-bomb). The path is baked rather than derived from `$0`
// because `$0` is the bare program name under PATH lookup, not the wrapper's path.
// When `realBin` is known it also exports TK_REAL_BIN so tk can skip the per-command
// PATH walk (2.1); omitted ⇒ byte-identical to the pre-2.1 wrapper.
export function posixWrapper(
  program: string,
  tk: TkExec,
  shimDir: string,
  realBin?: string,
): string {
  const parts = [tk.bin, ...tk.args, program].map(shQuote).join(" ");
  const realBinLine = realBin ? `export TK_REAL_BIN=${shQuote(realBin)}\n` : "";
  return `#!/usr/bin/env sh\nexport TK_SHIM_DIR=${shQuote(shimDir)}\n${realBinLine}exec ${parts} "$@"\n`;
}

// Windows wrapper: a .cmd that forwards args via %*. cmd.exe and PowerShell both
// resolve `git` → `git.cmd` through PATHEXT. `setlocal` self-sets TK_SHIM_DIR for
// the recursion guard (C7; Windows dogfood observed 2,599+ spawns) without leaking
// it to the caller; the implicit endlocal at script end preserves the exit code.
// When `realBin` is known it also sets TK_REAL_BIN so tk can skip the per-command
// PATH×PATHEXT walk (2.1); omitted ⇒ byte-identical to the pre-2.1 wrapper.
export function windowsWrapper(
  program: string,
  tk: TkExec,
  shimDir: string,
  realBin?: string,
): string {
  const parts = [tk.bin, ...tk.args, program].map((v) => `"${v}"`).join(" ");
  const realBinLine = realBin ? `set "TK_REAL_BIN=${realBin}"\r\n` : "";
  return `@echo off\r\nsetlocal\r\nset "TK_SHIM_DIR=${shimDir}"\r\n${realBinLine}${parts} %*\r\n`;
}

export type InstallOptions = {
  home?: string;
  programs?: string[];
  tkExec?: TkExec;
  installedAt: number;
  version: string;
  platform?: NodeJS.Platform;
  // Presence check, injectable for tests. Defaults to a real PATH lookup so a
  // wrapper is only written for a program whose binary actually exists on the box
  // (D2 — never shim `cat`/`ls` on a Windows host that lacks them).
  isAvailable?: (program: string) => boolean;
  // 2.1: resolve a program to its absolute real-binary path, baked into the wrapper
  // (TK_REAL_BIN) and manifest so the runtime skips the per-command PATH walk.
  // Injectable for tests; defaults to a real PATH lookup excluding the shim dir.
  // Returning undefined ⇒ no path baked for that program (wrapper still written).
  resolveRealBin?: (program: string) => string | undefined;
};

// Is a real `program` executable resolvable on PATH, excluding our own shim dir
// (so a re-install never counts a previously-written wrapper as "the binary")?
// Windows-only: off Windows tk's fronted tools are present, so every program is
// shimmable and the set is unchanged. Exported so `tk shim install --dry-run`
// previews the exact same install/skip partition the real install would write.
export function realBinaryPresent(program: string, shimDirPath: string): boolean {
  if (process.platform !== "win32") return true;
  const path = (process.env.PATH ?? "")
    .split(delimiter)
    .filter((entry) => entry && entry !== shimDirPath)
    .join(delimiter);
  return resolveProgram(program, path) !== program;
}

// Resolve a program's absolute real-binary path for baking (2.1), excluding our own
// shim dir so a re-install never bakes a previously-written wrapper as "the binary".
// undefined ⇒ unresolved (the wrapper is still written; it just falls back to the
// per-command walk at runtime). Resolved once at install — the whole point of 2.1.
export function resolveRealBinaryPath(program: string, shimDirPath: string): string | undefined {
  const childPath = (process.env.PATH ?? "")
    .split(delimiter)
    .filter((entry) => entry && entry !== shimDirPath)
    .join(delimiter);
  return resolveBinaryPath(program, childPath);
}

// Create the shim dir, write one executable wrapper per shimmable program, and a
// manifest. Idempotent: re-running overwrites wrappers and prunes any wrapper no
// longer in the program set.
export function installWrappers(opts: InstallOptions): ShimManifest {
  const home = opts.home ?? tokenKillerHome();
  const dir = shimDir(home);
  // Only shim programs whose binary is actually present — never fabricate a
  // wrapper for a tool the user hasn't installed (D2).
  const isAvailable = opts.isAvailable ?? ((program: string) => realBinaryPresent(program, dir));
  const resolveRealBin =
    opts.resolveRealBin ?? ((program: string) => resolveRealBinaryPath(program, dir));
  const programs = (opts.programs ?? shimmablePrograms()).slice().sort().filter(isAvailable);
  const tk = opts.tkExec ?? defaultTkExec();
  const platform = opts.platform ?? process.platform;
  const isWindows = platform === "win32";

  // Resolve each real binary ONCE here (2.1). The path is baked into the wrapper env
  // (TK_REAL_BIN) and recorded in the manifest; unresolved programs simply get no
  // baked path and fall back to the per-command walk at runtime.
  const resolvedPaths: Record<string, string> = {};
  for (const program of programs) {
    const real = resolveRealBin(program);
    if (real) resolvedPaths[program] = real;
  }

  // Prune stale wrappers from a previous install before writing the new set.
  pruneWrappers(dir, programs, isWindows);

  mkdirSync(dir, { recursive: true });
  for (const program of programs) {
    const realBin = resolvedPaths[program];
    if (isWindows) {
      writeFileSync(join(dir, `${program}.cmd`), windowsWrapper(program, tk, dir, realBin));
    } else {
      const file = join(dir, program);
      writeFileSync(file, posixWrapper(program, tk, dir, realBin));
      chmodSync(file, 0o755);
    }
  }

  const manifest: ShimManifest = {
    schema: SHIM_MANIFEST_SCHEMA,
    version: opts.version,
    dir,
    programs,
    installedAt: opts.installedAt,
    tk,
    resolvedPaths,
  };
  writeFileSync(manifestPath(home), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

function pruneWrappers(dir: string, _keep: string[], _isWindows: boolean): void {
  // Remove the entire shim dir contents we own (wrappers + manifest) so a
  // shrunk program set leaves nothing behind, then the caller rewrites. Safe
  // because the dir holds only tk-generated files.
  rmSync(dir, { recursive: true, force: true });
}

export function readManifest(home: string = tokenKillerHome()): ShimManifest | null {
  try {
    return JSON.parse(readFileSync(manifestPath(home), "utf8")) as ShimManifest;
  } catch {
    return null;
  }
}

export function removeShimDir(home: string = tokenKillerHome()): void {
  rmSync(shimDir(home), { recursive: true, force: true });
}
