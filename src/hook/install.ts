// Slice 3 — Copilot hook config writer (DESIGN §3.1).
//
// This is NOT an installer command — installation is `tk install`'s job (there is no
// `tk hook install`). This module is the config-writing routine that
// `tk install --host copilot-cli` calls. It writes the host hook config that points
// PreToolUse at `tk hook copilot`; the proxy does the compression.
//
// Scope (DESIGN §15, §3.0): user-level by default — `~/.copilot/hooks/
// tk-rewrite.json`. The repo is written ONLY under `--project`
// (`<cwd>/.github/hooks/tk-rewrite.json`). The file is dedicated and carries a
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

const CONFIG_FILENAME = "tk-rewrite.json";

// ADR 0005 §5 / audit #13: the hook config must NOT hardcode a bare `tk hook
// copilot`. A bare `tk` is PATH-dependent and fails on Windows PowerShell with
// CommandNotFoundException (the spike only worked with an absolute node path), so a
// hook installed there is inert. Resolve the absolute node executable + the running
// cli.js at install time instead. `process.argv[1]` is the script node executed for
// `tk install`; fall back to this module's own bundled path.
function quoteArg(p: string): string {
  return /\s/.test(p) ? `"${p}"` : p;
}

export function resolveHookCommand(subcommand: string = "copilot"): string {
  const node = process.execPath;
  const cli = process.argv[1] ?? fileURLToPath(import.meta.url);
  return `${quoteArg(node)} ${quoteArg(cli)} hook ${subcommand}`;
}

// Marker proving the file is ours (recoverable/marker-based). Sits beside `hooks`;
// the host ignores unknown top-level keys.
const MARKER = "token-killer";

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
// Issue #20: the file must satisfy BOTH host protocols at once.
//   - `PreToolUse` (PascalCase, single `command`) is the VS Code-compatible path.
//   - `preToolUse` (camelCase) is Copilot CLI's native schema. There the entry
//     carries separate `bash`/`powershell` keys (both the SAME resolved command —
//     a JS hook runs identically under either shell) and `timeoutSec`, NOT a single
//     `command`/`timeout`. Without it, Copilot CLI may load the file yet never rewrite
//     `powershell` tool calls on Windows (silent inert hook).
// `version: 1` is the schema version both hosts expect; unknown top-level keys
// (our `managedBy` marker) are ignored.
export function buildCopilotHookConfig(command: string = resolveHookCommand()): CopilotHookConfig {
  return {
    version: 1,
    managedBy: MARKER,
    hooks: {
      PreToolUse: [{ type: "command", command, cwd: ".", timeout: 5 }],
      preToolUse: [
        { type: "command", bash: command, powershell: command, cwd: ".", timeoutSec: 5 },
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

// Compute what install WOULD do without writing — backs `tk install --dry-run`.
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
      // file appearing (a racing tk install) proceeds with the rename, consistent
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
  // The `hooks/` dir is tk-dedicated (it holds only this config), so drop it once
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

// Read the hook COMMAND actually baked into the installed (tk-managed) Copilot config.
// Preflight validates the on-disk paths the host will REALLY execute, not the current
// process's paths (issue #23: a stale baked node/cli path — after a node upgrade, an
// nvm switch, or a moved install — is the failure the check must catch; the running
// `tk status` process's own paths trivially exist and prove nothing). Returns null when
// the config is absent, not tk-managed, unreadable, or carries no command string.
export function readInstalledCopilotHookCommand(loc: ConfigLocation): string | null {
  const path = copilotHookConfigPath(loc);
  if (!isManaged(path)) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<CopilotHookConfig>;
    const cmd = parsed?.hooks?.PreToolUse?.[0]?.command;
    return typeof cmd === "string" && cmd.length > 0 ? cmd : null;
  } catch {
    return null;
  }
}
