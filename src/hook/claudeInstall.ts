// Claude Code settings patcher (goal §2) — the config-writing routine that
// `tk install --host claude-code` calls. It is NOT a standalone installer; like
// `install.ts` (Copilot), installation is `tk install`'s job.
//
// Claude Code's hook config lives in `~/.claude/settings.json` and uses a
// nested shape — an array of `{ matcher, hooks: [{ type, command }] }` groups —
// which is DIFFERENT from Copilot's flat `tk-rewrite.json`. So this is its own
// patcher; only `resolveHookCommand` (absolute node + cli path, per the
// Windows/PATH fix) is shared with `install.ts`.
//
// Drop-in semantics: an existing PreToolUse/Bash hook that invokes
// `rtk hook claude` (or a prior `tk hook claude`) is REPLACED IN PLACE; after
// install, `rtk` is no longer invoked. Otherwise we append a new Bash group.
//
// Surgical & marker-guarded: we touch ONLY the PreToolUse Bash rewrite hook;
// `statusLine`, `enabledPlugins`, `env`, and any non-rewrite hook are preserved
// (parse → patch → write). We add NO foreign key to the host's schema — the
// embedded absolute cli path IS the marker that proves an entry is ours, so
// `--uninstall` removes only tk's entry and never a user's own `rtk` hook.

import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { writeFileAtomicSync } from "../core/atomicWrite.js";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

import { resolveHookCommand } from "./install.js";

export type ClaudeLocation = { home?: string };

export function claudeSettingsPath(loc: ClaudeLocation = {}): string {
  return join(loc.home ?? homedir(), ".claude", "settings.json");
}

// Our PreToolUse Bash hook command: `"<node>" "<cli>" hook claude`. The absolute
// cli path is self-marking — it is how uninstall recognizes tk's own entry.
export function claudeHookCommand(): string {
  return resolveHookCommand("claude");
}

type CommandHook = { type?: string; command?: string; [k: string]: unknown };
type MatcherGroup = { matcher?: string; hooks?: CommandHook[]; [k: string]: unknown };
type PreToolUseSettings = { PreToolUse?: MatcherGroup[]; [k: string]: unknown };
export type ClaudeSettings = { hooks?: PreToolUseSettings; [k: string]: unknown };

// Any rtk/tk/absolute "… hook claude" rewrite hook — the entry we REPLACE in
// place on install (drop-in over `rtk hook claude`).
function isClaudeRewriteHook(command: string | undefined): boolean {
  return typeof command === "string" && /\bhook\s+claude\b/.test(command);
}

// Is this hook OURS (tk), as opposed to a foreign `rtk hook claude` the user may
// keep? Used by uninstall (so we never remove someone else's hook) and by the
// `pointsAtTk` status probe (`tk debug` §2 / `tk status`). Ours is the exact
// command we'd write, OR any invocation of a `tk` binary — `node /abs/bin/tk hook
// claude`, a bare `tk hook claude`, or the Windows `tk.cmd`/`tk.exe` shim. The
// binary may sit behind any absolute path, so the boundary before `tk` must allow
// a path separator (or quote/space/start), NOT just whitespace — otherwise a real
// global install (`…/bin/tk`) reads as foreign and a healthy, actively-rewriting
// hook is reported "NOT tk"/"not wired". `rtk` stays excluded: its `tk` is
// preceded by `r`, which is not a boundary char.
function isOurClaudeHook(command: string | undefined, ourCommand: string): boolean {
  if (typeof command !== "string") return false;
  if (command === ourCommand) return true;
  if (/(^|[\\/\s"'])tk(\.exe|\.cmd)?["'\s]+hook\s+claude\b/.test(command)) return true;
  const cli = process.argv[1];
  return Boolean(cli) && command.includes(cli!) && /\bhook\s+claude\b/.test(command);
}

type PatchAction = "replace" | "append" | "unchanged";

// Deep-ish clone of just the structure we mutate (groups + their hook arrays),
// so the caller's object is never aliased into the result.
function cloneGroups(groups: MatcherGroup[]): MatcherGroup[] {
  return groups.map((g) => ({
    ...g,
    hooks: Array.isArray(g.hooks) ? g.hooks.map((h) => ({ ...h })) : g.hooks,
  }));
}

// Pure: return the patched settings + what changed. Replaces an existing claude
// rewrite hook in place; else appends a `{ matcher:"Bash", hooks:[…] }` group.
// All other keys (and other groups/hooks) are preserved verbatim.
export function patchClaudeSettings(
  settings: ClaudeSettings,
  command: string,
): { settings: ClaudeSettings; action: PatchAction } {
  const hooks: PreToolUseSettings = { ...settings.hooks };
  const groups: MatcherGroup[] = Array.isArray(hooks.PreToolUse)
    ? cloneGroups(hooks.PreToolUse)
    : [];

  let found = false;
  let changed = false;
  for (const group of groups) {
    if (!Array.isArray(group.hooks)) continue;
    for (const hook of group.hooks) {
      if (!isClaudeRewriteHook(hook.command)) continue;
      found = true;
      if (hook.command !== command || hook.type !== "command") {
        hook.type = "command";
        hook.command = command;
        changed = true;
      }
    }
  }

  if (!found) {
    groups.push({ matcher: "Bash", hooks: [{ type: "command", command }] });
    changed = true;
  }

  if (!changed) return { settings, action: "unchanged" };
  hooks.PreToolUse = groups;
  return { settings: { ...settings, hooks }, action: found ? "replace" : "append" };
}

function serialize(settings: ClaudeSettings): string {
  return `${JSON.stringify(settings, null, 2)}\n`;
}

export type ClaudeInstallPlan = {
  path: string;
  action: "create" | "replace" | "append" | "unchanged";
  contents: string;
  previousCommand?: string;
  command: string;
};

function readSettings(path: string): ClaudeSettings {
  // A present-but-invalid settings.json must NOT be clobbered — surface the
  // parse error to the caller (tk install) instead of overwriting the user's file.
  return JSON.parse(readFileSync(path, "utf8")) as ClaudeSettings;
}

// The current claude rewrite command in the file, if any (for diffs/--show).
function currentClaudeCommand(settings: ClaudeSettings): string | undefined {
  const groups = settings.hooks?.PreToolUse;
  if (!Array.isArray(groups)) return undefined;
  for (const group of groups) {
    if (!Array.isArray(group.hooks)) continue;
    for (const hook of group.hooks) {
      if (isClaudeRewriteHook(hook.command)) return hook.command;
    }
  }
  return undefined;
}

// Compute what install WOULD do without writing — backs `tk install --dry-run`.
export function planClaudeHookInstall(
  loc: ClaudeLocation,
  command: string = claudeHookCommand(),
): ClaudeInstallPlan {
  const path = claudeSettingsPath(loc);
  const existed = existsSync(path);
  const base: ClaudeSettings = existed ? readSettings(path) : {};
  const previousCommand = existed ? currentClaudeCommand(base) : undefined;
  const { settings, action: patchAction } = patchClaudeSettings(base, command);
  const action = !existed ? "create" : patchAction;
  return { path, action, contents: serialize(settings), previousCommand, command };
}

// Idempotently point the PreToolUse Bash hook at tk. Returns the plan.
export function installClaudeHook(loc: ClaudeLocation, command?: string): ClaudeInstallPlan {
  const plan = planClaudeHookInstall(loc, command);
  if (plan.action !== "unchanged") {
    mkdirSync(dirname(plan.path), { recursive: true });
    writeFileAtomicSync(plan.path, plan.contents);
  }
  return plan;
}

// Remove ONLY tk's Bash PreToolUse entry; drop a group that we thereby empty;
// leave every other key, group, and hook (including a foreign `rtk hook claude`)
// intact. Never throws on a missing/invalid file.
export function uninstallClaudeHook(
  loc: ClaudeLocation,
  ourCommand: string = claudeHookCommand(),
): { path: string; removed: boolean } {
  const path = claudeSettingsPath(loc);
  if (!existsSync(path)) return { path, removed: false };
  let settings: ClaudeSettings;
  try {
    settings = readSettings(path);
  } catch {
    return { path, removed: false };
  }
  const groups = settings.hooks?.PreToolUse;
  if (!Array.isArray(groups)) return { path, removed: false };

  let removed = false;
  const nextGroups: MatcherGroup[] = [];
  for (const group of groups) {
    if (!Array.isArray(group.hooks)) {
      nextGroups.push(group);
      continue;
    }
    const kept = group.hooks.filter((hook) => !isOurClaudeHook(hook.command, ourCommand));
    const removedHere = kept.length !== group.hooks.length;
    if (removedHere) removed = true;
    // A group we emptied was a dedicated tk Bash group → drop it. A group with
    // surviving hooks keeps them (co-resident hooks preserved).
    if (kept.length === 0 && removedHere) continue;
    nextGroups.push(kept.length === group.hooks.length ? group : { ...group, hooks: kept });
  }

  if (!removed) return { path, removed: false };
  const next: ClaudeSettings = {
    ...settings,
    hooks: { ...settings.hooks, PreToolUse: nextGroups },
  };
  writeFileAtomicSync(path, serialize(next));
  return { path, removed: true };
}

export function claudeHookStatus(
  loc: ClaudeLocation,
  ourCommand: string = claudeHookCommand(),
): { path: string; present: boolean; pointsAtTk: boolean; installedCommand?: string } {
  const path = claudeSettingsPath(loc);
  if (!existsSync(path)) return { path, present: false, pointsAtTk: false };
  let settings: ClaudeSettings;
  try {
    settings = readSettings(path);
  } catch {
    return { path, present: false, pointsAtTk: false };
  }
  const groups = settings.hooks?.PreToolUse;
  const hooks = Array.isArray(groups)
    ? groups.flatMap((g) => (Array.isArray(g.hooks) ? g.hooks : []))
    : [];
  const claudeHooks = hooks.filter((h) => isClaudeRewriteHook(h.command));
  // The ACTUAL command string installed in settings.json (ours if present, else the
  // first foreign rewrite hook) — `tk debug` runs it to verify the binary it names
  // can actually load, not just that the string looks like tk.
  const installed =
    claudeHooks.find((h) => isOurClaudeHook(h.command, ourCommand)) ?? claudeHooks[0];
  return {
    path,
    present: claudeHooks.length > 0,
    pointsAtTk: claudeHooks.some((h) => isOurClaudeHook(h.command, ourCommand)),
    installedCommand: installed?.command,
  };
}
