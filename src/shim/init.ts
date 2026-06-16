import { existsSync, readdirSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { tokenKillerHome } from "../core/dataDir.js";
import { detectHost, gatherDetectEnv, selectTier, type Host } from "./detect.js";
import { adapters } from "./hostAdapter.js";
import { vscodeUserDir } from "./hostConfig.js";
import { projectInjectionPath, unwriteInjection, writeInjection } from "./injection.js";
import { installShim, runShim } from "./cli.js";
import { copilotHookConfigStatus, uninstallCopilotHookConfig } from "../hook/install.js";
import { claudeHookStatus, uninstallClaudeHook } from "../hook/claudeInstall.js";
import { guidanceFilePath, guidanceLoader, unwriteGuidance, writeGuidance } from "./guidance.js";
import { gatherPreflight, probeHostVersion, renderPreflight } from "./preflight.js";
import {
  gatherDeliveryMatrix,
  installedTierIds,
  recordInstall,
  renderDeliveryMatrix,
  updateDeliveryState,
} from "./capability.js";

// The install / uninstall / status surface (U1+U2, ADR 0002 §5). `tk install`
// auto-detects the host and wires the highest available delivery tier (Copilot
// CLI → hook seam; VS Code → shim; neither / shim probe FAIL → instruction
// injection). `tk uninstall` removes what tk wrote (and, with --purge-data, the
// metrics data). `tk status` reports the install without writing. These are
// first-class top-level verbs so a tk verb can never fall through to passthrough
// (the U2 bug that ran Bandizip's uninstaller); `tk init` was the old name and is
// gone (cli.ts prints a rename hint). The shim tier has its own `tk shim` surface.

function out(line: string): void {
  process.stdout.write(`${line}\n`);
}

// Hosts that have any guidance to clean on uninstall — a standalone TK.md file
// (claude-code, vscode) OR an inlined loader block (copilot-cli, claude-code).
// Derived from the guidance module rather than the adapter's `guidancePath()`
// alone, because copilot-cli now writes ONLY the inlined block (no standalone
// file, I4) and must still be cleaned up.
const guidanceHosts: Host[] = (Object.keys(adapters) as Host[]).filter(
  (host) => Boolean(guidanceFilePath(host)) || Boolean(guidanceLoader(host)),
);

// Drop the tk usage guidance (TK.md) and wire it into the host's auto-loaded
// instructions so the agent reads it. Hosts without a guidance home are a no-op.
function writeGuidanceStep(host: Host, dryRun: boolean): void {
  if (dryRun) {
    const file = guidanceFilePath(host);
    const loader = guidanceLoader(host);
    if (file) out(`[dry-run] would write usage guidance: ${file}`);
    if (loader) out(`[dry-run] would reference it from: ${loader.path}`);
    return;
  }
  const written = writeGuidance(host);
  if (written.guidance) out(`Wrote usage guidance: ${written.guidance}`);
  if (written.loader) out(`Referenced it from: ${written.loader}`);
}

function injectionTarget(host: Host): string {
  const vscodeDir = existsSync(vscodeUserDir()) ? vscodeUserDir() : undefined;
  return adapters[host].injectionPath(homedir(), vscodeDir);
}

// ---------------------------------------------------------------------------
// tk status — installation-safe. Reports host / tier signals without installing
// or repairing hooks/shims, then refreshes the delivery verification timestamp.
// ---------------------------------------------------------------------------

export function runStatus(_argv: string[] = []): number {
  const host = detectHost(gatherDetectEnv());
  out(`Detected host: ${host}`);

  // Gather preflight ONCE (issue #23 Windows section) and REUSE it for the matrix's
  // host-version line, so `copilot --version` is not spawned twice (ADR 0012 #7).
  const preflight = gatherPreflight();

  // Timestamp truth (issue #26): `tk status` IS the verification, so persist
  // lastVerified to NOW *before* gathering the matrix — gatherDeliveryMatrix reads the
  // state file, so the rendered "last verified" reflects THIS run, not the previous
  // run's stale value (the old order rendered first, wrote after, and only the next
  // status run saw the prior timestamp). Best-effort: a write failure never breaks
  // status, and the matrix then simply shows the last successfully-written
  // value.
  updateDeliveryState({ lastVerified: new Date().toISOString() });

  // ADR 0012 #7: render the per-host capability MATRIX (a host can hold several
  // live tiers at once, so a single "active tier" is no longer faithful). Everything
  // here is LIVE-DERIVED by the existing status helpers (copilot/claude hook status,
  // shim manifest + probe, injection/guidance file presence, TTY opt-in) plus the
  // persisted install-time facts. `runShim(["status"])` still prints its detailed
  // shim panel below the matrix for the baked-path / PATH-position diagnostics the
  // matrix summarizes in one line.
  const matrix = gatherDeliveryMatrix({ host, preflight });
  renderDeliveryMatrix(matrix).forEach(out);

  out(`  Shim detail:`);
  runShim(["status"]);

  // Windows preflight (issue #23): the documented Copilot-CLI hook requirements
  // (PowerShell 7+, an absolute hook command, a loaded hooks dir, the
  // `powershell` shell-tool name). Runs on all platforms — each probe degrades
  // to a "not found / unavailable" line and never throws, so status stays total.
  out(`  Windows preflight:`);
  renderPreflight(preflight).forEach(out);

  // lastVerified was already persisted above (before the matrix was gathered) so the
  // rendered value reflects THIS run — no second write here (issue #26 timestamp truth).
  return 0;
}

// ---------------------------------------------------------------------------
// tk uninstall
// ---------------------------------------------------------------------------

type UninstallArgs = { project: boolean; dryRun: boolean; purgeData: boolean };

function parseUninstallArgs(argv: string[]): UninstallArgs {
  const args: UninstallArgs = { project: false, dryRun: false, purgeData: false };
  for (const token of argv) {
    if (token === "--project") args.project = true;
    else if (token === "--dry-run") args.dryRun = true;
    else if (token === "--purge-data") args.purgeData = true;
    // Unknown tokens ignored — every tk write is user-level (no -g/-l switch).
  }
  return args;
}

export function runUninstall(argv: string[]): number {
  const opts = parseUninstallArgs(argv);
  if (opts.dryRun) {
    if (opts.project) uninstallProjectDryRun();
    else uninstallUserDryRun();
    if (opts.purgeData) reportPurgeDryRun();
    return 0;
  }
  if (opts.project) uninstallProject();
  else uninstallUser();
  // --purge-data is honored last, after the artifacts are gone (G2). Without it,
  // `tk uninstall` PRESERVES all metrics — uninstalling delivery must not silently
  // wipe a user's measured savings history.
  if (opts.purgeData) purgeData();
  return 0;
}

// Remove what tk installed at the user level. Marker-guarded — only files tk
// wrote are removed. The user and project installs are independent, so this must
// never touch the repo's own artifacts.
function uninstallUser(): void {
  const removedClaude = uninstallClaudeHook({});
  out(
    `claude-code settings hook: ${removedClaude.removed ? `removed tk entry from ${removedClaude.path}` : "nothing to remove"}`,
  );
  const removedHook = uninstallCopilotHookConfig({ project: false });
  out(
    `copilot hook config: ${removedHook.removed ? `removed ${removedHook.path}` : "nothing to remove"}`,
  );
  runShim(["uninstall"]);
  const host = detectHost(gatherDetectEnv());
  unwriteInjection(injectionTarget(host));
  out(`instruction injection: removed`);
  // Remove the usage guidance (TK.md) + its loader reference for any host that
  // has one. detectHost may differ from the install-time host, so clear all.
  for (const guidanceHost of guidanceHosts) {
    unwriteGuidance(guidanceHost);
  }
  out(`usage guidance: removed`);
}

// Project-scoped uninstall (`--project`): only the repo's own artifacts. Leaves
// every user-level tier (claude hook, shim, user injection, user guidance)
// untouched.
function uninstallProject(): void {
  const cwd = process.cwd();
  const removedProjectHook = uninstallCopilotHookConfig({ project: true, cwd });
  out(
    `project hook config: ${removedProjectHook.removed ? `removed ${removedProjectHook.path}` : "nothing to remove"}`,
  );
  unwriteInjection(projectInjectionPath(cwd));
  out(`project instruction injection: removed`);
}

// Read-only preview of the user-level uninstall.
function uninstallUserDryRun(): void {
  const claude = claudeHookStatus({});
  out(
    `[dry-run] claude-code settings hook: ${claude.present ? `would remove tk entry from ${claude.path}` : "nothing to remove"}`,
  );
  const hook = copilotHookConfigStatus({ project: false });
  out(
    `[dry-run] copilot hook config: ${hook.present ? `would remove ${hook.path}` : "nothing to remove"}`,
  );
  runShim(["status"]);
  const host = detectHost(gatherDetectEnv());
  const target = injectionTarget(host);
  out(
    `[dry-run] instruction injection: ${existsSync(target) ? `would remove ${target}` : "nothing to remove"}`,
  );
  for (const guidanceHost of guidanceHosts) {
    const guidance = guidanceFilePath(guidanceHost);
    if (guidance && existsSync(guidance)) {
      out(`[dry-run] usage guidance (${guidanceHost}): would remove ${guidance}`);
    }
  }
}

// Read-only preview of the project-scoped uninstall.
function uninstallProjectDryRun(): void {
  const cwd = process.cwd();
  const projectHook = copilotHookConfigStatus({ project: true, cwd });
  out(
    `[dry-run] project hook config: ${projectHook.present ? `would remove ${projectHook.path}` : "nothing to remove"}`,
  );
  const projectInjection = projectInjectionPath(cwd);
  out(
    `[dry-run] project instruction injection: ${existsSync(projectInjection) ? `would remove ${projectInjection}` : "nothing to remove"}`,
  );
}

// G2: delete the per-project metrics tree (`~/.token-killer/projects/`) and the
// home dir if removal leaves it empty. Off by default — only `--purge-data` calls
// this. Never throws: a partial/failed delete must not break the uninstall.
function purgeData(): void {
  const home = tokenKillerHome();
  const projects = join(home, "projects");
  if (existsSync(projects)) {
    rmSync(projects, { recursive: true, force: true });
    out(`metrics data: removed ${projects}`);
  } else {
    out(`metrics data: nothing to remove (${projects} absent)`);
  }
  try {
    if (existsSync(home) && readdirSync(home).length === 0) {
      rmSync(home, { recursive: true, force: true });
      out(`metrics data: removed empty ${home}`);
    }
  } catch {
    /* leaving an empty home behind is harmless */
  }
}

function reportPurgeDryRun(): void {
  const projects = join(tokenKillerHome(), "projects");
  out(
    `[dry-run] metrics data: ${existsSync(projects) ? `would remove ${projects}` : "nothing to remove"}`,
  );
}

// ---------------------------------------------------------------------------
// tk install
// ---------------------------------------------------------------------------

type InstallArgs = { host: Host | "auto"; project: boolean; dryRun: boolean };

function parseInstallArgs(argv: string[]): InstallArgs {
  const args: InstallArgs = { host: "auto", project: false, dryRun: false };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--host") {
      const value = argv[i + 1];
      if (
        value === "copilot-cli" ||
        value === "vscode" ||
        value === "claude-code" ||
        value === "auto"
      ) {
        args.host = value;
      }
      i += 1;
    } else if (token === "--project") {
      args.project = true;
    } else if (token === "--dry-run") {
      args.dryRun = true;
    }
    // Unknown tokens (e.g. a stray `-g` from rtk muscle memory) are ignored —
    // every tk write is user-level, so there is no global/local switch to honor.
  }
  return args;
}

// Persist what this install wired (ADR 0012 #7). Best-effort and NEVER changes
// install behavior — it only records state for `tk status` to display. Called once,
// just before a successful (non-dry-run) install returns; the dry-run path records
// nothing (it wrote nothing).
//
// Record the SELECTED host's OWN version (issue #26), via a per-host `--version` probe
// (`copilot`/`claude`/`code`). Earlier this recorded `copilot --version` for copilot-cli
// only and `undefined` for every other host — and an even earlier bug mislabeled
// `GitHub Copilot CLI 1.0.62` as a `claude-code` install's version. `probeHostVersion`
// is host-specific and best-effort: a host with no version CLI on PATH (or `unknown`)
// degrades to honest "not recorded", never another tool's version.
function recordInstallState(host: Host): void {
  recordInstall({ host, tiers: installedTierIds(host), hostVersion: probeHostVersion(host) });
}

export function runInstall(argv: string[]): number {
  const opts = parseInstallArgs(argv);
  const env = gatherDetectEnv();
  const host = opts.host === "auto" ? detectHost(env) : opts.host;
  out(`Detected host: ${host}`);

  // Project-level injection is an explicit, additive opt-in — the only write
  // into the repo. It does not replace the tier ladder below.
  if (opts.project) {
    const projectFile = projectInjectionPath(process.cwd());
    if (opts.dryRun) out(`[dry-run] would write project instructions: ${projectFile}`);
    else {
      writeInjection(projectFile);
      out(`Wrote project instructions: ${projectFile}`);
    }
  }

  // Auto-detect resolves ONE primary host, but a machine commonly has more than one
  // — e.g. Copilot CLI runs INSIDE the VS Code integrated terminal, so it inherits
  // TERM_PROGRAM=vscode and the primary resolves to `vscode`, which used to leave the
  // Copilot-CLI user with no hook at all. So in auto mode we don't STOP at the primary:
  // we additively wire every OTHER present host that has an independent hook
  // (claude-code → ~/.claude/settings.json, copilot-cli → ~/.copilot/hooks/). These
  // are separate config files that don't conflict with the primary tier, and are
  // fully reversible (uninstall removes them) if a host dir was merely lingering. A
  // forced `--host X` stays single-host.
  if (opts.host === "auto") {
    const present: Host[] = [];
    if (env.copilotDirExists || env.copilotOnPath) present.push("copilot-cli");
    if (env.claudeSettingsExists || env.claudeEnv) present.push("claude-code");
    for (const other of present) {
      if (other === host) continue;
      const adapter = adapters[other];
      if (!adapter.installHook) continue;
      const loc = { project: opts.project, cwd: process.cwd() };
      out(`Also wiring ${other} (detected alongside ${host}):`);
      const step = opts.dryRun ? adapter.planHook!(loc) : adapter.installHook(loc);
      step.headerLines.forEach(out);
      step.trailerLines.forEach(out);
    }
  }

  // Tier ladder (ADR 0002 + 0012): Hook > Shim > Injection, but tiers are NOT
  // mutually exclusive — a host may run complementary tiers in parallel (ADR 0012
  // §1). The adapter carries the per-host facts; selectTier is the single tier exit.
  // No hardcoded host `if`s.
  const adapter = adapters[host];
  const hookAvailable = Boolean(adapter.installHook);
  const loc = { project: opts.project, cwd: process.cwd() };

  // ADR 0012 §2/§3: a host whose hook is ADDITIVE (vscode) keeps the SHIM as its
  // primary/authoritative tier and layers the hook on top — so it does NOT take the
  // hook-wins exit below. Encoded as an adapter capability (`additiveHook`), not an
  // `if (host === "vscode")` check (Goal B). For the additive-hook decision we treat
  // the primary ladder as if no hook existed (pass `false`), so it flows to shim /
  // injection; the hook is installed separately as an enhancement. Hosts where the
  // hook is the sole primary (copilot-cli, claude-code) leave `additiveHook` unset →
  // the original hook-wins behavior is byte-identical.
  const hookIsAdditive = Boolean(adapter.additiveHook) && hookAvailable;
  const hookForLadder = hookAvailable && !hookIsAdditive;

  // Hook tier (sole primary). When a host has a hook installer AND that hook is its
  // primary tier, it wins over shim/injection (the shim probe — the only
  // side-effecting signal — is irrelevant here, so pass false rather than install
  // wrappers). Each adapter renders its own host-specific lines; install prints them
  // around the shared guidance + tier line.
  if (selectTier(adapter.supportedTiers, hookForLadder, false) === "hook") {
    const step = opts.dryRun ? adapter.planHook!(loc) : adapter.installHook!(loc);
    step.headerLines.forEach(out);
    writeGuidanceStep(host, opts.dryRun);
    out(`Active tier: hook`);
    step.trailerLines.forEach(out);
    if (!opts.dryRun) recordInstallState(host);
    return 0;
  }

  // ADR 0012 §2/§3: install the additive hook for this host BEFORE the primary shim.
  // It is an enhancement that catches the agent's terminal tool at the protocol layer
  // even when PATH injection hasn't taken effect, and runs even if the shim probe
  // later FAILS (graceful degradation — the primary then falls back to injection but
  // the hook still installs). The shim below remains the policy/Preview-independent
  // floor and is reported as the primary tier.
  if (hookIsAdditive) {
    const step = opts.dryRun ? adapter.planHook!(loc) : adapter.installHook!(loc);
    out(`Additive hook (Preview, policy-revocable):`);
    step.headerLines.forEach(out);
    step.trailerLines.forEach(out);
  }

  // Below the hook tier, --dry-run only previews — it never runs the probe or
  // installs the shim.
  if (opts.dryRun) {
    out(`[dry-run] would install shim / injection for host: ${host}`);
    writeGuidanceStep(host, true);
    if (hookIsAdditive) out(`Active tier: shim (primary) + hook (additive)`);
    return 0;
  }

  // Shim tier. Only hosts whose supportedTiers include "shim" run the interception
  // probe (VS Code — command-compression's primary delivery there); selectTier
  // turns the probe result into the final tier. For an additive-hook host the hook
  // is already installed above; the shim is reported as PRIMARY alongside it.
  if (adapter.supportedTiers.includes("shim")) {
    const probe = installShim({ rc: false, vscode: true });
    if (selectTier(adapter.supportedTiers, hookForLadder, probe.pass) === "shim") {
      // The usage guide is delivery-tier-independent — it teaches how to use tk
      // well, not how commands are routed. VS Code's tier is the shim, so without
      // this its users (who have a user-level guidance home) got no guide at all.
      writeGuidanceStep(host, false);
      out(hookIsAdditive ? `Active tier: shim (primary) + hook (additive)` : `Active tier: shim`);
      out(`Restart your terminal (or VS Code) for PATH changes to take effect.`);
      recordInstallState(host);
      return 0;
    }
    // Graceful degradation (ADR 0012 §3): the primary shim probe FAILED, so the
    // primary falls back to injection — but the additive hook installed above stays.
    out("shim interception probe FAILED — falling back to instruction injection");
  }

  // Injection tier (unknown host, or shim probe failed). User-level by default. For
  // an additive-hook host that reached here the primary shim probe FAILED, so
  // injection is the primary floor — but the additive hook installed above remains.
  const target = injectionTarget(host);
  writeInjection(target);
  writeGuidanceStep(host, false);
  out(
    hookIsAdditive
      ? `Active tier: injection (primary, shim probe failed) + hook (additive)`
      : `Active tier: injection`,
  );
  out(`Wrote user instructions: ${target}`);
  if (host === "unknown") {
    out(`(No host auto-detected. Point your agent at this file, or re-run with --project.)`);
  }
  out(`Restart your agent for the instructions to take effect.`);
  recordInstallState(host);
  return 0;
}
