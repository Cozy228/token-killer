import { chmodSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { realpathSync } from "node:fs";
import { join } from "node:path";

import { tokenKillerHome } from "../core/dataDir.js";
import { shimmablePrograms } from "./programs.js";

// How a generated wrapper re-invokes tk. The wrapper calls tk by ABSOLUTE path
// (never relying on `tk` being on PATH inside the shimmed shell) so a stripped
// PATH cannot break it. In production this is `node /abs/dist/cli.js`; tests
// inject the tsx-loader form.
export type TkExec = { bin: string; args: string[] };

// Bump when the manifest shape or wrapper format changes.
export const SHIM_MANIFEST_SCHEMA = 1;

export type ShimManifest = {
  schema: number;
  version: string;
  dir: string;
  programs: string[];
  installedAt: number;
  tk: TkExec;
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
export function posixWrapper(program: string, tk: TkExec, shimDir: string): string {
  const parts = [tk.bin, ...tk.args, program].map(shQuote).join(" ");
  return `#!/usr/bin/env sh\nexport TK_SHIM_DIR=${shQuote(shimDir)}\nexec ${parts} "$@"\n`;
}

// Windows wrapper: a .cmd that forwards args via %*. cmd.exe and PowerShell both
// resolve `git` → `git.cmd` through PATHEXT. `setlocal` self-sets TK_SHIM_DIR for
// the recursion guard (C7; Windows dogfood observed 2,599+ spawns) without leaking
// it to the caller; the implicit endlocal at script end preserves the exit code.
export function windowsWrapper(program: string, tk: TkExec, shimDir: string): string {
  const parts = [tk.bin, ...tk.args, program].map((v) => `"${v}"`).join(" ");
  return `@echo off\r\nsetlocal\r\nset "TK_SHIM_DIR=${shimDir}"\r\n${parts} %*\r\n`;
}

export type InstallOptions = {
  home?: string;
  programs?: string[];
  tkExec?: TkExec;
  installedAt: number;
  version: string;
  platform?: NodeJS.Platform;
};

// Create the shim dir, write one executable wrapper per shimmable program, and a
// manifest. Idempotent: re-running overwrites wrappers and prunes any wrapper no
// longer in the program set.
export function installWrappers(opts: InstallOptions): ShimManifest {
  const home = opts.home ?? tokenKillerHome();
  const dir = shimDir(home);
  const programs = (opts.programs ?? shimmablePrograms()).slice().sort();
  const tk = opts.tkExec ?? defaultTkExec();
  const platform = opts.platform ?? process.platform;
  const isWindows = platform === "win32";

  // Prune stale wrappers from a previous install before writing the new set.
  pruneWrappers(dir, programs, isWindows);

  mkdirSync(dir, { recursive: true });
  for (const program of programs) {
    if (isWindows) {
      writeFileSync(join(dir, `${program}.cmd`), windowsWrapper(program, tk, dir));
    } else {
      const file = join(dir, program);
      writeFileSync(file, posixWrapper(program, tk, dir));
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
