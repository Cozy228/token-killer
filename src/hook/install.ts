// Slice 3 — Copilot hook config writer (DESIGN §3.1).
//
// This is NOT an installer command — installation is `ctx install`'s job (there is no
// `ctx hook install`). This module is the config-writing routine that
// `ctx install --host copilot-cli` calls. It writes the host hook config that points
// PreToolUse at `ctx hook copilot`; the proxy does the compression.
//
// Scope (DESIGN §15, §3.0): user-level by default — `~/.copilot/hooks/
// ctx-rewrite.json`. The repo is written ONLY under `--project`
// (`<cwd>/.github/hooks/ctx-rewrite.json`). The file is dedicated and carries a
// marker so uninstall removes only our file, never a user's.

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const CONFIG_FILENAME = "ctx-rewrite.json";

// ADR 0005 §5 / audit #13: the hook config must NOT hardcode a bare `ctx hook
// copilot`. A bare `ctx` is PATH-dependent and fails on Windows PowerShell with
// CommandNotFoundException (the spike only worked with an absolute node path), so a
// hook installed there is inert. Resolve the absolute node executable + the running
// cli.js at install time instead. `process.argv[1]` is the script node executed for
// `ctx install`; fall back to this module's own bundled path.
function quoteArg(p: string): string {
  return /\s/.test(p) ? `"${p}"` : p;
}

// Bash / cmd / VS Code form: `"<node>" "<cli>" hook <sub>`. A leading double-quoted path
// is executed as the command word by bash (`bash -c`), cmd.exe, and VS Code's hook shell.
export function resolveHookCommand(subcommand: string = "copilot"): string {
  const node = process.execPath;
  const cli = process.argv[1] ?? fileURLToPath(import.meta.url);
  return `${quoteArg(node)} ${quoteArg(cli)} hook ${subcommand}`;
}

// PowerShell single-quote literal: `'` → `''`. Single quotes survive the `-Command`
// argument-boundary round-trip that strips DOUBLE quotes (which is why a double-quoted
// node path errored live — issue #20: `C:\Program` "is not recognized").
function quoteArgPwsh(p: string): string {
  return `'${p.replace(/'/g, "''")}'`;
}

// PowerShell form: `& '<node>' '<cli>' hook <sub>`. DISTINCT from the bash/cmd form
// because Copilot CLI runs the native `preToolUse[0].powershell` field through PowerShell,
// where the bash/cmd string does NOT parse (issue #20 live finding: the tool call was
// DENIED because the hook errored). Two PowerShell-specific requirements, both verified on
// the box under `powershell -Command` AND `-File`:
//   - the call operator `&` — without it a leading quoted path is a string VALUE that
//     PowerShell echoes (or rejects), not a command it runs;
//   - SINGLE-quoted paths — double quotes are stripped crossing the `-Command` arg
//     boundary, splitting `C:\Program Files\...` on the space; single quotes survive.
export function resolveHookCommandPowershell(subcommand: string = "copilot"): string {
  const node = process.execPath;
  const cli = process.argv[1] ?? fileURLToPath(import.meta.url);
  return `& ${quoteArgPwsh(node)} ${quoteArgPwsh(cli)} hook ${subcommand}`;
}

// Marker proving the file is ours (recoverable/marker-based). Sits beside `hooks`;
// the host ignores unknown top-level keys.
const MARKER = "contexa";

export type CopilotHookConfig = {
  version: number;
  managedBy: string;
  hooks: {
    PreToolUse: Array<{ type: "command"; command: string; cwd: string; timeout: number }>;
    preToolUse: Array<{
      type: "command";
      bash: string;
      powershell: string;
      cwd: string;
      timeoutSec: number;
    }>;
  };
};

export type ConfigLocation = { project: boolean; home?: string; cwd?: string };

// The config artifact, format verified from `rtk install --copilot`'s
// `.github/hooks/rtk-rewrite.json` (DESIGN §3.1; rtk init.rs §6 of
// docs/reports/rtk-vscode-copilot-windows-research-20260615.md).
//
// Issue #20: the file must satisfy BOTH host protocols at once, and each command field
// must be parseable by the SHELL that actually runs it. Verified from the live Copilot CLI
// 1.0.62 parent-process chain on Windows: the host launches EVERY hook field via
// `pwsh -nop -nol -c <field-value>` (the value is parsed as a PowerShell script). The
// bash/cmd form (`"<node>" <cli> …`) ParserErrors under PowerShell (a leading quoted path
// is a string value, and the double quotes are stripped at the `-c` boundary, splitting
// `C:\Program Files\…`), and preToolUse is fail-CLOSED, so the tool call is DENIED.
//   - `preToolUse.bash` → bash/sh form (Copilot CLI Unix runs this via bash).
//   - `preToolUse.powershell` → PowerShell form `& '<node>' '<cli>' …` (Copilot CLI Windows).
//   - `PreToolUse.command` (PascalCase) is read by VS Code AND by Copilot CLI's PascalCase
//     entry. Copilot CLI Windows runs it via `pwsh -c` too, so on Windows it must be the
//     PowerShell form; on macOS/Linux VS Code runs it via sh, so it stays the bash form.
//     This is the ONLY platform-dependent field, and the config is written at install time
//     on a known OS, so we pick the right form via `platform`.
// `version: 1` is the schema version both hosts expect; unknown top-level keys
// (our `managedBy` marker) are ignored.
export function buildCopilotHookConfig(
  command: string = resolveHookCommand(),
  powershellCommand: string = resolveHookCommandPowershell(),
  platform: NodeJS.Platform = process.platform,
): CopilotHookConfig {
  const pascalCommand = platform === "win32" ? powershellCommand : command;
  return {
    version: 1,
    managedBy: MARKER,
    hooks: {
      PreToolUse: [{ type: "command", command: pascalCommand, cwd: ".", timeout: 5 }],
      preToolUse: [
        {
          type: "command",
          bash: command,
          powershell: powershellCommand,
          cwd: ".",
          timeoutSec: 5,
        },
      ],
    },
  };
}

export function copilotHookConfigPath(loc: ConfigLocation): string {
  if (loc.project) {
    return join(loc.cwd ?? process.cwd(), ".github", "hooks", CONFIG_FILENAME);
  }
  // User scope. When the caller supplies a HOME (tests), keep `<home>/.copilot/...`
  // exactly. Otherwise honor $COPILOT_HOME — rtk treats it as the `.copilot` ROOT
  // itself (so `$COPILOT_HOME/hooks/<file>`, NOT `$COPILOT_HOME/.copilot/...`),
  // falling back to `~/.copilot/...`.
  if (loc.home !== undefined) {
    return join(loc.home, ".copilot", "hooks", CONFIG_FILENAME);
  }
  const copilotHome = process.env.COPILOT_HOME;
  if (copilotHome) {
    return join(copilotHome, "hooks", CONFIG_FILENAME);
  }
  return join(homedir(), ".copilot", "hooks", CONFIG_FILENAME);
}

function serialize(config: CopilotHookConfig): string {
  return `${JSON.stringify(config, null, 2)}\n`;
}

export type HookConfigPlan = {
  path: string;
  // `skipped-unmanaged`: a file exists at the path, differs from ours, and lacks
  // our marker (or is unparseable) — install must NOT clobber it. Mirrors the
  // marker discipline uninstall already applies; see `installCopilotHookConfig`.
  action: "create" | "overwrite" | "unchanged" | "skipped-unmanaged";
  contents: string;
};

function isManaged(path: string): boolean {
  if (!existsSync(path)) return false;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as { managedBy?: string };
    return parsed.managedBy === MARKER;
  } catch {
    return false;
  }
}

// Compute what install WOULD do without writing — backs `ctx install --dry-run`.
export function planCopilotHookConfig(loc: ConfigLocation): HookConfigPlan {
  const path = copilotHookConfigPath(loc);
  const contents = serialize(buildCopilotHookConfig());
  if (!existsSync(path)) return { path, action: "create", contents };
  const current = readFileSync(path, "utf8");
  if (current === contents) return { path, action: "unchanged", contents };
  // The bytes differ. A marker-bearing file is ours — overwrite it (the upgrade
  // path: `resolveHookCommand()` embeds absolute node+cli paths, so contents
  // legitimately change on every move/upgrade). A file without the marker (or an
  // unparseable one) is the user's — never clobber it.
  if (!isManaged(path)) return { path, action: "skipped-unmanaged", contents };
  return { path, action: "overwrite", contents };
}

// Write the config (user-level by default). Idempotent. Returns the plan. Writes
// only when we own the destination — `skipped-unmanaged` and `unchanged` are no-ops.
//
// The write is atomic: contents go to a same-directory temp file, then `renameSync`
// swaps it into place (the rawStore pattern, sync). A crash/disk failure mid-write
// can only leave a stray `.tmp` — never a torn or zero-byte destination. This matters
// directly to the unmanaged-guard: an in-place truncating `writeFileSync` that died
// after `O_TRUNC` would leave an unparseable file that the guard then permanently
// refuses to repair (issue #11). Atomicity removes that self-inflicted lockout.
export function installCopilotHookConfig(
  loc: ConfigLocation,
  // Test seam: inject a pre-computed plan to model the TOCTOU window — a plan made
  // when the file was managed, replayed after it flipped unmanaged. Production never
  // passes this; the revalidation below is what protects the live race.
  precomputedPlan?: HookConfigPlan,
): HookConfigPlan {
  const plan = precomputedPlan ?? planCopilotHookConfig(loc);
  if (plan.action === "create" || plan.action === "overwrite") {
    const dir = dirname(plan.path);
    mkdirSync(dir, { recursive: true });
    // Unique same-directory temp so `renameSync` is atomic (same filesystem).
    const tmpPath = join(dir, `.${CONFIG_FILENAME}.${process.pid}.${(writeCounter += 1)}.tmp`);
    writeFileSync(tmpPath, plan.contents);
    try {
      // TOCTOU guard: ownership was checked during planning, but the destination may
      // have changed since. This one unified check covers BOTH plan actions:
      //   - `overwrite` planned against our managed file that flipped unmanaged
      //     (a concurrent user edit) → skip rather than clobber.
      //   - `create` planned against an absent path, but an unmanaged file appeared
      //     in the plan→rename window (a concurrent user write) → skip rather than
      //     clobber. (issue #11 follow-up: the create branch was previously
      //     unguarded and renamed unconditionally.)
      // A destination that now exists AND lacks our marker is the user's — never
      // replace it. The complementary races are intentionally allowed: a managed
      // file appearing (a racing ctx install) proceeds with the rename, consistent
      // with accepted last-writer-wins semantics between managed owners; and an
      // `overwrite` target deleted in the window simply renames as a plain create.
      if (existsSync(plan.path) && !isManaged(plan.path)) {
        rmSync(tmpPath, { force: true });
        return { ...plan, action: "skipped-unmanaged" };
      }
      renameSync(tmpPath, plan.path);
    } catch (err) {
      // Rename failed (e.g. read-only parent) — leave the destination as-is and clean
      // up the temp so a failed attempt never strands a file or torn target.
      rmSync(tmpPath, { force: true });
      throw err;
    }
  }
  return plan;
}

// Per-process counter making the temp filename unique within a directory.
let writeCounter = 0;

// Remove our config — only if the marker proves we wrote it (never clobber a
// user's own hooks file).
export function uninstallCopilotHookConfig(loc: ConfigLocation): {
  path: string;
  removed: boolean;
} {
  const path = copilotHookConfigPath(loc);
  if (!isManaged(path)) return { path, removed: false };
  rmSync(path, { force: true });
  // The `hooks/` dir is ctx-dedicated (it holds only this config), so drop it once
  // empty rather than leaving an empty `.github/hooks/` behind. Best-effort; the
  // shared parent (`.github/` / `~/.copilot/`) is never touched.
  removeDirIfEmpty(dirname(path));
  return { path, removed: true };
}

function removeDirIfEmpty(dir: string): void {
  try {
    if (existsSync(dir) && readdirSync(dir).length === 0) rmdirSync(dir);
  } catch {
    // Best-effort cleanup — a non-empty or vanished dir is fine to leave.
  }
}

export function copilotHookConfigStatus(loc: ConfigLocation): {
  path: string;
  present: boolean;
  managed: boolean;
} {
  const path = copilotHookConfigPath(loc);
  return { path, present: existsSync(path), managed: isManaged(path) };
}

// Read EVERY hook command actually baked into the installed (ctx-managed) Copilot
// config. Preflight validates the on-disk paths the host will REALLY execute, not the
// current process's paths (issue #23: a stale baked node/cli path — after a node
// upgrade, an nvm switch, or a moved install — is the failure the check must catch;
// the running `ctx status` process's own paths trivially exist and prove nothing).
//
// The dual-schema config carries the command in THREE places the host may execute:
// `hooks.PreToolUse[0].command` (VS Code path) and the native Copilot CLI entry's
// `hooks.preToolUse[0].powershell` / `.bash`. Reading only PreToolUse.command missed
// the native commands the host runs on Windows (issue #23 §1), so a stale native path
// would pass preflight while the real executed hook is inert. We return the DISTINCT
// non-empty command strings across all three so preflight can validate each one.
// Empty when the config is absent, not ctx-managed, unreadable, or carries no command.
export function readInstalledCopilotHookCommands(loc: ConfigLocation): string[] {
  const path = copilotHookConfigPath(loc);
  if (!isManaged(path)) return [];
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<CopilotHookConfig>;
    const candidates = [
      parsed?.hooks?.PreToolUse?.[0]?.command,
      parsed?.hooks?.preToolUse?.[0]?.powershell,
      parsed?.hooks?.preToolUse?.[0]?.bash,
    ];
    const seen = new Set<string>();
    for (const c of candidates) {
      if (typeof c === "string" && c.length > 0) seen.add(c);
    }
    return [...seen];
  } catch {
    return [];
  }
}
