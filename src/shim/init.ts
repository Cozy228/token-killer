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
// tk status — read-only. Reports host / tier signals; mutates nothing (the shim
// status probe only resolves a binary on PATH, it writes no files).
// ---------------------------------------------------------------------------

export function runStatus(_argv: string[] = []): number {
  const host = detectHost(gatherDetectEnv());
  out(`Detected host: ${host}`);
  const claude = claudeHookStatus({});
  out(
    `  claude-code settings hook: ${
      claude.present
        ? `${claude.path} (${claude.pointsAtTk ? "points at tk" : "present, NOT tk"})`
        : "absent"
    }`,
  );
  const hookStatus = copilotHookConfigStatus({ project: false });
  out(`  copilot hook config: ${hookStatus.present ? hookStatus.path : "absent"}`);
  runShim(["status"]);
  const target = injectionTarget(host);
  out(`  injection file: ${existsSync(target) ? target : "absent"}`);
  const guidance = guidanceFilePath(host);
  out(`  usage guidance: ${guidance && existsSync(guidance) ? guidance : "absent"}`);
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
    if (env.copilotDirExists) present.push("copilot-cli");
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

  // Tier ladder (ADR 0002): Hook > Shim > Injection. The adapter carries the
  // per-host facts; selectTier is the single tier exit. No hardcoded host `if`s.
  const adapter = adapters[host];
  const hookAvailable = Boolean(adapter.installHook);

  // Hook tier. When a host has a hook installer it always wins over shim/injection
  // (the shim probe — the only side-effecting signal — is irrelevant here, so pass
  // false rather than install wrappers). Each adapter renders its own host-specific
  // lines; install prints them around the shared guidance + tier line.
  if (selectTier(adapter.supportedTiers, hookAvailable, false) === "hook") {
    const loc = { project: opts.project, cwd: process.cwd() };
    const step = opts.dryRun ? adapter.planHook!(loc) : adapter.installHook!(loc);
    step.headerLines.forEach(out);
    writeGuidanceStep(host, opts.dryRun);
    out(`Active tier: hook`);
    step.trailerLines.forEach(out);
    return 0;
  }

  // Below the hook tier, --dry-run only previews — it never runs the probe or
  // installs the shim.
  if (opts.dryRun) {
    out(`[dry-run] would install shim / injection for host: ${host}`);
    writeGuidanceStep(host, true);
    return 0;
  }

  // Shim tier. Only hosts whose supportedTiers include "shim" run the interception
  // probe (VS Code — command-compression's primary delivery there); selectTier
  // turns the probe result into the final tier.
  if (adapter.supportedTiers.includes("shim")) {
    const probe = installShim({ rc: false, vscode: true });
    if (selectTier(adapter.supportedTiers, hookAvailable, probe.pass) === "shim") {
      // The usage guide is delivery-tier-independent — it teaches how to use tk
      // well, not how commands are routed. VS Code's tier is the shim, so without
      // this its users (who have a user-level guidance home) got no guide at all.
      writeGuidanceStep(host, false);
      out(`Active tier: shim`);
      out(`Restart your terminal (or VS Code) for PATH changes to take effect.`);
      return 0;
    }
    out("shim interception probe FAILED — falling back to instruction injection");
  }

  // Injection tier (unknown host, or shim probe failed). User-level by default.
  const target = injectionTarget(host);
  writeInjection(target);
  writeGuidanceStep(host, false);
  out(`Active tier: injection`);
  out(`Wrote user instructions: ${target}`);
  if (host === "unknown") {
    out(`(No host auto-detected. Point your agent at this file, or re-run with --project.)`);
  }
  out(`Restart your agent for the instructions to take effect.`);
  return 0;
}
