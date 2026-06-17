import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { writeFileAtomicSync } from "../core/atomicWrite.js";
import { ensureTokenKillerHome, tokenKillerHome } from "../core/dataDir.js";
import { listProjectHistoriesSync } from "../core/history.js";
import { claudeHookStatus } from "../hook/claudeInstall.js";
import { copilotHookConfigStatus } from "../hook/install.js";
import type { Host } from "./detect.js";
import { guidanceFilePath, guidanceLoader } from "./guidance.js";
import { readManifest, shimDir } from "./install.js";
import { userInjectionPath } from "./injection.js";
import type { PreflightCheck } from "./preflight.js";
import { runInterceptionProbe, type ProbeResult } from "./probe.js";

// ADR 0012 #7 — delivery state as a CAPABILITY MATRIX, not a single "active tier".
//
// A host can now hold MULTIPLE live tiers at once (ADR 0012 §1: VS Code runs the
// shim AS its primary AND an additive hook; a box with both VS Code and Copilot
// CLI shares one ~/.copilot/hooks file). So "the active tier" is no longer
// faithful. This module reports a per-tier matrix that is:
//   - LIVE-DERIVED for everything cheaply/reliably observable from disk + env
//     (installed / shim probe / TTY opt-in / injection / guidance) by CALLING the
//     existing status helpers — never re-implementing their logic; and
//   - PERSISTED for the few facts that are NOT observable after the fact (which
//     host `tk install` chose, which tiers it wired, the host version at install,
//     when it was installed, and when status last verified) in a small tolerant
//     `delivery-state.json`.
//
// `selectTier` is retained for PREFERENCE ORDERING only (which tier install
// prefers); it does not describe what is currently live. That is this matrix's job.

// --- per-tier capability model --------------------------------------------

export type TierState = {
  // Stable tier id for assertions / future machine consumers.
  tier: "copilot-hook" | "claude-hook" | "vscode-hook" | "shim" | "injection" | "guidance";
  // Human label for the rendered matrix row.
  label: string;
  // Is this tier wired right now (live-derived from disk/env)?
  installed: boolean;
  // One-line human detail (path, probe verdict, TTY opt-in, honest "not tracked").
  detail: string;
  // PER-HOST hook-runtime "fired" signal — set ONLY on the hook tiers (issue #26: the
  // matrix must report e.g. "VS Code hook fired" SEPARATELY from "Copilot CLI hook
  // fired", not as one global line). See firedDetail() for the honesty caveat (success
  // path writes no marker; the failure ledger is not host-attributed). undefined on
  // non-hook tiers.
  fired?: string;
  // PER-HOST policy-revocation signal — set ONLY on the VS Code hook tier, the one tier
  // an org policy can revoke (a Preview capability), and that is NOT introspectable from
  // the CLI — honest "unknown". undefined elsewhere.
  blockedByPolicy?: string;
};

export type DeliveryMatrix = {
  tiers: TierState[];
  // Persisted facts (install-time + last status verify), or undefined if never run.
  // The fired / blocked-by-policy signals are now PER-HOST on the hook tiers above
  // (issue #26), not single global fields.
  lastVerified?: string;
  installedAt?: string;
  installedHost?: Host;
  hostVersion?: string;
};

// --- persisted delivery state --------------------------------------------
// Small state file `~/.token-killer/delivery-state.json`. Written by `tk install`
// (records the host it chose + the tiers it wired + the host version + when), and
// its `lastVerified` refreshed by `tk status` (status just verified the live
// matrix). BOTH read and write are total: a missing/corrupt file reads as an empty
// default and a write failure is swallowed — neither install nor status may break
// because of this bookkeeping file.

export type DeliveryState = {
  // Schema marker so a future shape change can migrate rather than mis-read.
  version: 1;
  installedHost?: Host;
  // The tier ids install wired (subset of TierState["tier"]); recorded for the
  // matrix to show "wired at install" even before a live probe confirms each one.
  installedTiers?: string[];
  hostVersion?: string;
  installedAt?: string;
  lastVerified?: string;
};

export function deliveryStatePath(home: string = tokenKillerHome()): string {
  return join(home, "delivery-state.json");
}

// Read the persisted state. NEVER throws: a missing file, a parse error, or a
// shape mismatch all degrade to an empty default so callers can treat "no state"
// and "unreadable state" identically.
export function readDeliveryState(home: string = tokenKillerHome()): DeliveryState {
  const empty: DeliveryState = { version: 1 };
  try {
    const text = readFileSync(deliveryStatePath(home), "utf8");
    const parsed = JSON.parse(text) as Partial<DeliveryState>;
    if (!parsed || typeof parsed !== "object") return empty;
    return {
      version: 1,
      installedHost: parsed.installedHost,
      installedTiers: Array.isArray(parsed.installedTiers) ? parsed.installedTiers : undefined,
      hostVersion: typeof parsed.hostVersion === "string" ? parsed.hostVersion : undefined,
      installedAt: typeof parsed.installedAt === "string" ? parsed.installedAt : undefined,
      lastVerified: typeof parsed.lastVerified === "string" ? parsed.lastVerified : undefined,
    };
  } catch {
    return empty;
  }
}

// Write the persisted state. Best-effort: a write failure (read-only home, full
// disk, a race) is swallowed — recording delivery bookkeeping must never break the
// install/status it rode in on. Mode 0600 (the file records only the chosen host +
// tier names + a version string; still owner-only by default like other tk state).
export function writeDeliveryState(state: DeliveryState, home: string = tokenKillerHome()): void {
  try {
    ensureTokenKillerHome(home);
    writeFileAtomicSync(deliveryStatePath(home), `${JSON.stringify(state, null, 2)}\n`, 0o600);
  } catch {
    // best-effort — never break install/status because of bookkeeping
  }
}

// Merge-update the persisted state, preserving fields the caller does not set.
// Used by status to refresh ONLY lastVerified without clobbering install-time
// facts. Best-effort (delegates to writeDeliveryState).
export function updateDeliveryState(
  patch: Partial<DeliveryState>,
  home: string = tokenKillerHome(),
): DeliveryState {
  const next: DeliveryState = { ...readDeliveryState(home), ...patch, version: 1 };
  writeDeliveryState(next, home);
  return next;
}

// Record what an install just wired. Called by runInstall after a successful
// install; best-effort. `installedTiers` is whatever tiers install actually put in
// place for the chosen host (the matrix re-derives live state separately, but this
// captures install INTENT for hosts whose tiers are not all live-probeable).
export function recordInstall(
  params: { host: Host; tiers: string[]; hostVersion?: string },
  home: string = tokenKillerHome(),
): void {
  const now = new Date().toISOString();
  writeDeliveryState(
    {
      version: 1,
      installedHost: params.host,
      installedTiers: params.tiers,
      hostVersion: params.hostVersion,
      installedAt: now,
      lastVerified: now,
    },
    home,
  );
}

// --- live signal helpers ---------------------------------------------------
// Each composes an EXISTING status helper rather than re-deriving its logic.

// The copilot-version line preflight already gathers, reused as the host version
// (decision #7: "host version") so status does not spawn `copilot --version`
// twice. Returns the trimmed version detail, or undefined when not found.
export function hostVersionFromPreflight(checks: PreflightCheck[]): string | undefined {
  const check = checks.find((c) => c.name === "Copilot CLI version");
  if (!check || check.ok !== true) return undefined;
  return check.detail.trim() || undefined;
}

// Is the shim PATH-injection terminal opted in to TTY compression? VS Code's
// agent runs in a ConPTY (isTTY=true), so without TK_COMPRESS_TTY the gate passes
// agent output through raw — surface it so a "shim installed" with no TTY opt-in is
// visibly inert for the agent.
function ttyOptIn(env: NodeJS.ProcessEnv): boolean {
  return env.TK_COMPRESS_TTY === "1";
}

// Best-effort "last hook activity". HONEST and NO HOT-PATH WRITE: the hook runtime
// (runHookCopilot / runHookClaude) deliberately writes NOTHING on the success path
// — adding a per-fire write would regress cold-start latency on the critical path
// of every tool call. The only hook-runtime rows that ever land on disk are
// FAILURES (recordHookFailure, source_adapter terminal_tool/direct_tool). So the
// most we can honestly report is the last such failure's timestamp; with none, the
// correct outcome is literally "not tracked".
// NOTE host-attribution caveat: the failure ledger's `source_adapter`
// (terminal_tool/direct_tool) records the GOVERNANCE path, NOT which host fired the
// hook, so this number cannot be split between e.g. VS Code and Copilot CLI. The matrix
// surfaces it PER-HOST structurally (one `fired` line under each installed hook tier),
// and the wording flags it as a shared, non-host-attributed signal so a box running two
// hooks does not read it as two independent counts.
function firedDetail(
  records: ReadonlyArray<{ timestamp?: string; source_adapter?: string }>,
): string {
  const hookRows = records.filter(
    (r) => r.source_adapter === "terminal_tool" || r.source_adapter === "direct_tool",
  );
  if (hookRows.length === 0) {
    return "not tracked (no per-fire marker — success path writes nothing; only failures are logged)";
  }
  const last = hookRows
    .map((r) => r.timestamp)
    .filter((t): t is string => typeof t === "string")
    .sort()
    .at(-1);
  return last
    ? `last activity ${last} (failures only; ${hookRows.length} hook-runtime failure row(s), shared ledger not host-attributed)`
    : `${hookRows.length} hook-runtime failure row(s) (no timestamp)`;
}

// --- the matrix builder ----------------------------------------------------

// Injectable dependencies so the builder is deterministic in tests (no real PATH
// probe, no real disk). Production `gatherDeliveryMatrix()` wires the real helpers.
export type MatrixDeps = {
  host: Host;
  home: string;
  env: NodeJS.ProcessEnv;
  // Live status helpers (default to the real ones in gatherDeliveryMatrix).
  copilotHookStatus: () => { present: boolean; path: string; managed: boolean };
  claudeStatus: () => { present: boolean; path: string; pointsAtTk: boolean };
  // Shim signals.
  shimManifest: () => { programs: string[]; version: string } | null;
  shimDirPath: string;
  shimProbe: () => { pass: boolean; resolved: string | null };
  // Instruction-injection + guidance file presence.
  injectionPath: string;
  guidanceFile: string | undefined;
  guidanceLoaderPath: string | undefined;
  fileExists: (path: string) => boolean;
  // Best-effort fired ledger + host version (already-gathered preflight).
  historyRecords: ReadonlyArray<{ timestamp?: string; source_adapter?: string }>;
  preflight: PreflightCheck[];
  // Persisted install-time facts.
  state: DeliveryState;
};

// Per-tier detail strings. "installed" is reserved for the WIRED-TO-TK case; a file
// that is present but foreign (unmanaged Copilot config, a Claude hook that does not
// point at tk) is shown as "present, NOT …" so it is diagnosable without being
// misreported as an active tk tier (issue #26).
function copilotDetail(copilot: { present: boolean; path: string; managed: boolean }): string {
  if (!copilot.present) return `absent: ${copilot.path}`;
  if (copilot.managed) return `installed: ${copilot.path}`;
  return `present, NOT tk-managed (not wired to tk): ${copilot.path}`;
}

function claudeDetail(claude: { present: boolean; path: string; pointsAtTk: boolean }): string {
  if (!claude.present) return `absent: ${claude.path}`;
  if (claude.pointsAtTk) return `installed (points at tk): ${claude.path}`;
  return `present, NOT tk (does not point at tk): ${claude.path}`;
}

function vscodeHookDetail(copilot: { present: boolean; path: string; managed: boolean }): string {
  const policy = "blocked-by-policy: unknown (VS Code policy not introspectable from CLI)";
  if (!copilot.present) return `absent: ${copilot.path}`;
  if (copilot.managed) return `installed (shared ~/.copilot/hooks): ${copilot.path}; ${policy}`;
  return `present, NOT tk-managed (shared ~/.copilot/hooks): ${copilot.path}`;
}

// Pure: build the matrix from injected signals. Never throws (each field is a
// straight read of an already-resolved dep).
export function buildDeliveryMatrix(deps: MatrixDeps): DeliveryMatrix {
  const copilot = deps.copilotHookStatus();
  const claude = deps.claudeStatus();
  const manifest = deps.shimManifest();
  const probe = manifest ? deps.shimProbe() : null;
  const shimInstalled = manifest !== null;
  const tty = ttyOptIn(deps.env);
  // PER-HOST hook-runtime signal (issue #26): the same honest failure-ledger detail is
  // attached to EACH hook tier so status reports "Copilot CLI hook fired" / "VS Code
  // hook fired" as separate rows rather than one global line. firedDetail discloses that
  // the underlying ledger is shared and not host-attributed.
  const fired = firedDetail(deps.historyRecords);

  // "Installed" means tk's hook is actually WIRED TO TK, not merely that some hook
  // file/entry exists at the path (issue #26). A present-but-unmanaged Copilot config,
  // or a Claude hook that does not point at tk, is a FOREIGN hook: it does not deliver
  // tk, so marking it installed would mask that tk is not wired. The detail still
  // surfaces the foreign file (see *Detail helpers) so it stays diagnosable.
  const copilotInstalled = copilot.present && copilot.managed;
  const claudeInstalled = claude.present && claude.pointsAtTk;
  // VS Code's hook IS the shared ~/.copilot/hooks/tk-rewrite.json (the copilot writer's
  // file — ADR 0012 §3 corollary). A pure Copilot-CLI box also has the file but it is
  // the copilot tier, not a VS Code one. It is "installed" only when that shared file
  // is tk-managed; the row is shown whenever the file is present (managed or not) so a
  // coexisting VS Code + Copilot box can still see and diagnose it.
  const vscodeHookInstalled = copilotInstalled;

  const tiers: TierState[] = [
    {
      tier: "copilot-hook",
      label: "Copilot CLI hook",
      installed: copilotInstalled,
      detail: copilotDetail(copilot),
      fired,
    },
    {
      tier: "claude-hook",
      label: "Claude Code hook",
      installed: claudeInstalled,
      detail: claudeDetail(claude),
      fired,
    },
    {
      tier: "vscode-hook",
      label: "VS Code hook",
      installed: vscodeHookInstalled,
      detail: vscodeHookDetail(copilot),
      fired,
      // Only the VS Code hook can be revoked by org policy (a Preview capability), and
      // that is not introspectable from the CLI — honest per-host "unknown" when the hook
      // is tk-managed, "n/a" otherwise.
      blockedByPolicy: vscodeHookInstalled
        ? "unknown (VS Code policy not introspectable from CLI)"
        : "n/a (no tk-managed VS Code hook)",
    },
    {
      tier: "shim",
      label: "Shim (PATH)",
      installed: shimInstalled,
      detail: shimInstalled
        ? `installed (${manifest!.programs.length} wrappers): ${deps.shimDirPath}; probe ${
            probe?.pass ? "PASS" : "FAIL"
          }${probe?.resolved ? ` → ${probe.resolved}` : ""}; TTY opt-in ${tty ? "on" : "off"}`
        : `absent: ${deps.shimDirPath}`,
    },
    {
      tier: "injection",
      label: "Instruction injection",
      installed: deps.fileExists(deps.injectionPath),
      detail: deps.fileExists(deps.injectionPath)
        ? `installed: ${deps.injectionPath}`
        : `absent: ${deps.injectionPath}`,
    },
    {
      tier: "guidance",
      label: "Usage guidance",
      installed: guidanceInstalled(deps),
      detail: guidanceDetail(deps),
    },
  ];

  return {
    tiers,
    lastVerified: deps.state.lastVerified,
    installedAt: deps.state.installedAt,
    installedHost: deps.state.installedHost,
    hostVersion: deps.state.hostVersion ?? hostVersionFromPreflight(deps.preflight),
  };
}

// Guidance is "installed" when its standalone file OR its loader block exists —
// copilot-cli has NO standalone file (it inlines into copilot-instructions.md), so
// the loader path must count too.
function guidanceInstalled(deps: MatrixDeps): boolean {
  const fileHere = deps.guidanceFile !== undefined && deps.fileExists(deps.guidanceFile);
  const loaderHere =
    deps.guidanceLoaderPath !== undefined && deps.fileExists(deps.guidanceLoaderPath);
  return fileHere || loaderHere;
}

function guidanceDetail(deps: MatrixDeps): string {
  if (deps.guidanceFile !== undefined && deps.fileExists(deps.guidanceFile)) {
    return `installed: ${deps.guidanceFile}`;
  }
  if (deps.guidanceLoaderPath !== undefined && deps.fileExists(deps.guidanceLoaderPath)) {
    return `installed (inlined into loader): ${deps.guidanceLoaderPath}`;
  }
  const where = deps.guidanceFile ?? deps.guidanceLoaderPath ?? "(no guidance home for host)";
  return `absent: ${where}`;
}

// Production wiring: resolve every dep from the real helpers. `tk status` calls
// this. `preflight` is passed IN (status already gathered it for its Windows
// section) so `copilot --version` is not spawned twice (decision #7).
export function gatherDeliveryMatrix(params: {
  host: Host;
  preflight: PreflightCheck[];
  home?: string;
  env?: NodeJS.ProcessEnv;
  shimProbe?: ProbeResult;
}): DeliveryMatrix {
  const home = params.home ?? tokenKillerHome();
  const env = params.env ?? process.env;
  const dir = shimDir(home);
  return buildDeliveryMatrix({
    host: params.host,
    home,
    env,
    copilotHookStatus: () => copilotHookConfigStatus({ project: false }),
    claudeStatus: () => claudeHookStatus({}),
    shimManifest: () => readManifest(home),
    shimDirPath: dir,
    shimProbe: () => params.shimProbe ?? runInterceptionProbe(dir),
    injectionPath: userInjectionPath(params.host, homedir()),
    guidanceFile: guidanceFilePath(params.host, homedir()),
    guidanceLoaderPath: guidanceLoader(params.host, homedir())?.path,
    fileExists: existsSync,
    historyRecords: listProjectHistoriesSync(),
    preflight: params.preflight,
    state: readDeliveryState(home),
  });
}

// --- rendering -------------------------------------------------------------

// Format the matrix as scannable lines for `tk status`. Each tier is one
// `[installed/absent] <label>: <detail>` row; the persisted summary
// (host/version/installed-at/last-verified) plus the honest fired / policy lines
// follow. ASCII-only for Windows consoles.
export function renderDeliveryMatrix(matrix: DeliveryMatrix): string[] {
  const lines: string[] = ["  Delivery matrix:"];
  for (const t of matrix.tiers) {
    lines.push(`    [${t.installed ? "installed" : "absent  "}] ${t.label}: ${t.detail}`);
    // PER-HOST signals as indented sub-lines under their hook tier (issue #26). `fired`
    // only when that hook is actually installed (an absent hook has nothing to fire);
    // `blocked-by-policy` whenever the field is set (VS Code hook tier only).
    if (t.fired !== undefined && t.installed) {
      lines.push(`        fired:             ${t.fired}`);
    }
    if (t.blockedByPolicy !== undefined) {
      lines.push(`        blocked-by-policy: ${t.blockedByPolicy}`);
    }
  }
  lines.push(`    host version:      ${matrix.hostVersion ?? "unknown"}`);
  lines.push(`    installed host:    ${matrix.installedHost ?? "(not recorded)"}`);
  lines.push(`    installed at:      ${matrix.installedAt ?? "(not recorded)"}`);
  lines.push(`    last verified:     ${matrix.lastVerified ?? "(not recorded)"}`);
  return lines;
}

// The tier ids `tk install` should record for a host, mirroring runInstall's tier
// ladder so the persisted state reflects install intent. Pure; no I/O.
export function installedTierIds(host: Host): string[] {
  if (host === "claude-code") return ["claude-hook", "guidance"];
  if (host === "copilot-cli") return ["copilot-hook", "guidance"];
  if (host === "vscode") return ["shim", "vscode-hook", "guidance"];
  return ["injection", "guidance"];
}
