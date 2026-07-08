import { chmodSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { realpathSync } from "node:fs";
import { delimiter, join } from "node:path";

import { contexaHome } from "../core/dataDir.js";
import { resolveBinaryPath, resolveProgram } from "../executor.js";
import { hashResolutionEnv, stripShimDir } from "./path.js";
import { shimmablePrograms } from "./programs.js";

// How a generated wrapper re-invokes ctx. The wrapper calls ctx by ABSOLUTE path
// (never relying on `ctx` being on PATH inside the shimmed shell) so a stripped
// PATH cannot break it. In production this is `node /abs/dist/cli.js`; tests
// inject the tsx-loader form.
export type TkExec = { bin: string; args: string[] };

// Bump when the manifest shape or wrapper format changes.
// 2: each wrapper bakes CTX_REAL_BIN and the manifest records `resolvedPaths` (2.1).
export const SHIM_MANIFEST_SCHEMA = 2;

export type ShimManifest = {
  schema: number;
  version: string;
  dir: string;
  programs: string[];
  installedAt: number;
  ctx: TkExec;
  // 2.1: the absolute real-binary path resolved once at install, per program, so the
  // runtime can skip the PATH×PATHEXT walk. Best-effort — a program whose binary we
  // could not resolve is simply absent here, and its wrapper bakes no CTX_REAL_BIN
  // (falling back to today's per-command walk). Schema-1 manifests omit it entirely.
  resolvedPaths?: Record<string, string>;
  // 2.1: hash of the resolution environment (shim-stripped PATH + PATHEXT) at install.
  // Baked into wrappers as CTX_REAL_PATH_HASH; the runtime trusts a baked path only
  // while this still matches, so a PATH reorder forces a fresh walk instead of running
  // a stale binary. Absent on schema-1 manifests.
  pathHash?: string;
};

export function shimDir(home: string = contexaHome()): string {
  return join(home, "shim");
}

// V8 compile-cache dir (2.3), under ~/.contexa so a future AV folder exclusion
// covers it. Baked into the wrapper env (NODE_COMPILE_CACHE) so node persists its
// compiled bytecode across invocations; node auto-creates the dir on first use.
export function compileCacheDir(home: string = contexaHome()): string {
  return join(home, "v8-cache");
}

export function manifestPath(home: string = contexaHome()): string {
  return join(shimDir(home), "manifest.json");
}

// Resolve how to re-invoke the currently-running ctx as an absolute command.
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

// POSIX wrapper: `exec <ctx...> <program> "$@"`. Forwards args and the exit code.
// It self-exports CTX_SHIM_DIR (baked at install time, when the shim dir is known)
// so ctx's recursion guard strips the shim dir from the child PATH even when the
// rc-exported var is absent — a subshell, an env-stripping host, or a manually-
// PATH'd shim dir (C7 fork-bomb). The path is baked rather than derived from `$0`
// because `$0` is the bare program name under PATH lookup, not the wrapper's path.
// When `realBin` is known it also exports CTX_REAL_BIN so ctx can skip the per-command
// PATH walk (2.1); omitted ⇒ byte-identical to the pre-2.1 wrapper. When
// `compileCacheDir` is given it exports NODE_COMPILE_CACHE (2.3) BEFORE exec — node
// reads it at process start, so only the wrapper (not ctx code) can cache ctx's own
// bundle. Version-agnostic: Node 22.1+ honors it, older Node treats it as inert. It
// first saves the caller's original NODE_COMPILE_CACHE in CTX_NODE_COMPILE_CACHE_PREV
// so ctx can RESTORE it for any spawned real tool (buildChildEnv) — the cache redirect
// must apply to ctx's own node process only, never leak into npm/tsc/etc.
export function posixWrapper(
  program: string,
  ctx: TkExec,
  shimDir: string,
  realBin?: string,
  compileCacheDir?: string,
  pathHash?: string,
): string {
  const parts = [ctx.bin, ...ctx.args, program].map(shQuote).join(" ");
  // CTX_REAL_PATH_HASH (2.1) gates CTX_REAL_BIN at runtime: ctx uses the baked path only
  // while the resolution PATH is byte-identical to install. Baked as a pair.
  const realBinLine = realBin
    ? `export CTX_REAL_BIN=${shQuote(realBin)}\n${pathHash ? `export CTX_REAL_PATH_HASH=${shQuote(pathHash)}\n` : ""}`
    : "";
  const cacheLine = compileCacheDir
    ? `export CTX_NODE_COMPILE_CACHE_PREV="\${NODE_COMPILE_CACHE-}"\nexport NODE_COMPILE_CACHE=${shQuote(compileCacheDir)}\n`
    : "";
  return `#!/usr/bin/env sh\nexport CTX_SHIM_DIR=${shQuote(shimDir)}\n${realBinLine}${cacheLine}exec ${parts} "$@"\n`;
}

// Windows wrapper: a .cmd that forwards args via %*. cmd.exe and PowerShell both
// resolve `git` → `git.cmd` through PATHEXT. `setlocal` self-sets CTX_SHIM_DIR for
// the recursion guard (C7; Windows dogfood observed 2,599+ spawns) without leaking
// it to the caller; the implicit endlocal at script end preserves the exit code.
// When `realBin` is known it also sets CTX_REAL_BIN so ctx can skip the per-command
// PATH×PATHEXT walk (2.1); omitted ⇒ byte-identical to the pre-2.1 wrapper. When
// `compileCacheDir` is given it sets NODE_COMPILE_CACHE (2.3) before ctx runs so
// node can persist its compiled bytecode; version-agnostic (inert on Node <22.1).
export function windowsWrapper(
  program: string,
  ctx: TkExec,
  shimDir: string,
  realBin?: string,
  compileCacheDir?: string,
  pathHash?: string,
): string {
  const parts = [ctx.bin, ...ctx.args, program].map((v) => `"${v}"`).join(" ");
  // CTX_REAL_PATH_HASH (2.1) gates CTX_REAL_BIN — baked as a pair (see posixWrapper).
  const realBinLine = realBin
    ? `set "CTX_REAL_BIN=${realBin}"\r\n${pathHash ? `set "CTX_REAL_PATH_HASH=${pathHash}"\r\n` : ""}`
    : "";
  // Save the caller's NODE_COMPILE_CACHE (empty if unset) so ctx restores it for the
  // spawned real tool; `if defined` avoids cmd's literal-`%VAR%` expansion when unset.
  const cacheLine = compileCacheDir
    ? `set "CTX_NODE_COMPILE_CACHE_PREV="\r\nif defined NODE_COMPILE_CACHE set "CTX_NODE_COMPILE_CACHE_PREV=%NODE_COMPILE_CACHE%"\r\nset "NODE_COMPILE_CACHE=${compileCacheDir}"\r\n`
    : "";
  return `@echo off\r\nsetlocal\r\nset "CTX_SHIM_DIR=${shimDir}"\r\n${realBinLine}${cacheLine}${parts} %*\r\n`;
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
  // (CTX_REAL_BIN) and manifest so the runtime skips the per-command PATH walk.
  // Injectable for tests; defaults to a real PATH lookup excluding the shim dir.
  // Returning undefined ⇒ no path baked for that program (wrapper still written).
  resolveRealBin?: (program: string) => string | undefined;
};

// Is a real `program` executable resolvable on PATH, excluding our own shim dir
// (so a re-install never counts a previously-written wrapper as "the binary")?
// Windows-only: off Windows ctx's fronted tools are present, so every program is
// shimmable and the set is unchanged. Exported so `ctx shim install --dry-run`
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
  const home = opts.home ?? contexaHome();
  const dir = shimDir(home);
  // Only shim programs whose binary is actually present — never fabricate a
  // wrapper for a tool the user hasn't installed (D2).
  const isAvailable = opts.isAvailable ?? ((program: string) => realBinaryPresent(program, dir));
  const resolveRealBin =
    opts.resolveRealBin ?? ((program: string) => resolveRealBinaryPath(program, dir));
  const programs = (opts.programs ?? shimmablePrograms()).slice().sort().filter(isAvailable);
  const ctx = opts.tkExec ?? defaultTkExec();
  const platform = opts.platform ?? process.platform;
  const isWindows = platform === "win32";

  // Resolve each real binary ONCE here (2.1). The path is baked into the wrapper env
  // (CTX_REAL_BIN) and recorded in the manifest; unresolved programs simply get no
  // baked path and fall back to the per-command walk at runtime.
  const resolvedPaths: Record<string, string> = {};
  for (const program of programs) {
    const real = resolveRealBin(program);
    if (real) resolvedPaths[program] = real;
  }

  // Prune stale wrappers from a previous install before writing the new set.
  pruneWrappers(dir, programs, isWindows);

  // V8 compile-cache dir baked into every wrapper's env (2.3). Version-agnostic:
  // honored by Node 22.1+, inert on older Node.
  const cacheDir = compileCacheDir(home);
  // Resolution-env hash (2.1) over the SAME shim-stripped PATH the runtime resolves
  // against (buildChildPath → stripShimDir), so an unchanged PATH matches at runtime.
  const pathHash = hashResolutionEnv(stripShimDir(process.env.PATH, dir));

  mkdirSync(dir, { recursive: true });
  for (const program of programs) {
    const realBin = resolvedPaths[program];
    if (isWindows) {
      writeFileSync(
        join(dir, `${program}.cmd`),
        windowsWrapper(program, ctx, dir, realBin, cacheDir, pathHash),
      );
    } else {
      const file = join(dir, program);
      writeFileSync(file, posixWrapper(program, ctx, dir, realBin, cacheDir, pathHash));
      chmodSync(file, 0o755);
    }
  }

  const manifest: ShimManifest = {
    schema: SHIM_MANIFEST_SCHEMA,
    version: opts.version,
    dir,
    programs,
    installedAt: opts.installedAt,
    ctx,
    resolvedPaths,
    pathHash,
  };
  writeFileSync(manifestPath(home), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

function pruneWrappers(dir: string, _keep: string[], _isWindows: boolean): void {
  // Remove the entire shim dir contents we own (wrappers + manifest) so a
  // shrunk program set leaves nothing behind, then the caller rewrites. Safe
  // because the dir holds only ctx-generated files.
  rmSync(dir, { recursive: true, force: true });
}

export function readManifest(home: string = contexaHome()): ShimManifest | null {
  try {
    return JSON.parse(readFileSync(manifestPath(home), "utf8")) as ShimManifest;
  } catch {
    return null;
  }
}

export function removeShimDir(home: string = contexaHome()): void {
  rmSync(shimDir(home), { recursive: true, force: true });
  // The V8 compile cache (2.3) is a shim-tier artifact — node regenerates it on the
  // next shimmed run, so it is safe to drop with the wrappers. Never touches the
  // user's measured-savings data (projects/), which uninstall preserves by default.
  rmSync(compileCacheDir(home), { recursive: true, force: true });
}
