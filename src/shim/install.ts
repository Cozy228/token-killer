import { chmodSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { realpathSync } from "node:fs";
import { join } from "node:path";

import { tokenGuardHome } from "../core/dataDir.js";
import { shimmablePrograms } from "./programs.js";

// How a generated wrapper re-invokes tg. The wrapper calls tg by ABSOLUTE path
// (never relying on `tg` being on PATH inside the shimmed shell) so a stripped
// PATH cannot break it. In production this is `node /abs/dist/cli.js`; tests
// inject the tsx-loader form.
export type TgExec = { bin: string; args: string[] };

// Bump when the manifest shape or wrapper format changes.
export const SHIM_MANIFEST_SCHEMA = 1;

export type ShimManifest = {
  schema: number;
  version: string;
  dir: string;
  programs: string[];
  installedAt: number;
  tg: TgExec;
};

export function shimDir(home: string = tokenGuardHome()): string {
  return join(home, "shim");
}

export function manifestPath(home: string = tokenGuardHome()): string {
  return join(shimDir(home), "manifest.json");
}

// Resolve how to re-invoke the currently-running tg as an absolute command.
// Production: the cli entry is dist/cli.js, runnable by `node <entry>`.
export function defaultTgExec(): TgExec {
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

// POSIX wrapper: `exec <tg...> <program> "$@"`. Forwards args and the exit code.
export function posixWrapper(program: string, tg: TgExec): string {
  const parts = [tg.bin, ...tg.args, program].map(shQuote).join(" ");
  return `#!/usr/bin/env sh\nexec ${parts} "$@"\n`;
}

// Windows wrapper: a .cmd that forwards args via %*. cmd.exe and PowerShell both
// resolve `git` → `git.cmd` through PATHEXT.
export function windowsWrapper(program: string, tg: TgExec): string {
  const parts = [tg.bin, ...tg.args, program].map((v) => `"${v}"`).join(" ");
  return `@${parts} %*\r\n`;
}

export type InstallOptions = {
  home?: string;
  programs?: string[];
  tgExec?: TgExec;
  installedAt: number;
  version: string;
  platform?: NodeJS.Platform;
};

// Create the shim dir, write one executable wrapper per shimmable program, and a
// manifest. Idempotent: re-running overwrites wrappers and prunes any wrapper no
// longer in the program set.
export function installWrappers(opts: InstallOptions): ShimManifest {
  const home = opts.home ?? tokenGuardHome();
  const dir = shimDir(home);
  const programs = (opts.programs ?? shimmablePrograms()).slice().sort();
  const tg = opts.tgExec ?? defaultTgExec();
  const platform = opts.platform ?? process.platform;
  const isWindows = platform === "win32";

  // Prune stale wrappers from a previous install before writing the new set.
  pruneWrappers(dir, programs, isWindows);

  mkdirSync(dir, { recursive: true });
  for (const program of programs) {
    if (isWindows) {
      writeFileSync(join(dir, `${program}.cmd`), windowsWrapper(program, tg));
    } else {
      const file = join(dir, program);
      writeFileSync(file, posixWrapper(program, tg));
      chmodSync(file, 0o755);
    }
  }

  const manifest: ShimManifest = {
    schema: SHIM_MANIFEST_SCHEMA,
    version: opts.version,
    dir,
    programs,
    installedAt: opts.installedAt,
    tg,
  };
  writeFileSync(manifestPath(home), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

function pruneWrappers(dir: string, _keep: string[], _isWindows: boolean): void {
  // Remove the entire shim dir contents we own (wrappers + manifest) so a
  // shrunk program set leaves nothing behind, then the caller rewrites. Safe
  // because the dir holds only tg-generated files.
  rmSync(dir, { recursive: true, force: true });
}

export function readManifest(home: string = tokenGuardHome()): ShimManifest | null {
  try {
    return JSON.parse(readFileSync(manifestPath(home), "utf8")) as ShimManifest;
  } catch {
    return null;
  }
}

export function removeShimDir(home: string = tokenGuardHome()): void {
  rmSync(shimDir(home), { recursive: true, force: true });
}
