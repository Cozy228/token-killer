import { existsSync } from "node:fs";
import { homedir } from "node:os";

import { detectHost, gatherDetectEnv, selectTier, type Host } from "./detect.js";
import { adapters } from "./hostAdapter.js";
import { vscodeUserDir } from "./hostConfig.js";
import { projectInjectionPath, unwriteInjection, writeInjection } from "./injection.js";
import { installShim, runShim } from "./cli.js";
import { copilotHookConfigStatus, uninstallCopilotHookConfig } from "../hook/install.js";
import { claudeHookStatus, uninstallClaudeHook } from "../hook/claudeInstall.js";
import { guidanceFilePath, guidanceLoader, unwriteGuidance, writeGuidance } from "./guidance.js";

// Unified `tk init` (goal Phase 3, ADR 0002 §5). Auto-detects the host and wires
// the highest available delivery tier: Copilot CLI → hook seam (Track B), else
// shim; VS Code → shim; neither / shim probe FAIL → instruction injection.

function out(line: string): void {
  process.stdout.write(`${line}\n`);
}

// Hosts that drop a usage guide (TK.md), derived from the adapter table so a new
// host with a guidance home is cleaned up by --uninstall without editing here.
const guidanceHosts: Host[] = Object.values(adapters)
  .filter((a) => a.guidancePath())
  .map((a) => a.host);

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

type InitArgs = {
  host: Host | "auto";
  show: boolean;
  project: boolean;
  dryRun: boolean;
  uninstall: boolean;
};

export function parseInitArgs(argv: string[]): InitArgs {
  const args: InitArgs = {
    host: "auto",
    show: false,
    project: false,
    dryRun: false,
    uninstall: false,
  };
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
    } else if (token === "--show") {
      args.show = true;
    } else if (token === "--project") {
      args.project = true;
    } else if (token === "--dry-run") {
      args.dryRun = true;
    } else if (token === "--uninstall") {
      args.uninstall = true;
    }
    // Unknown tokens (e.g. a stray `-g` from rtk muscle memory) are ignored —
    // every tk write is user-level, so there is no global/local switch to honor.
  }
  return args;
}

function injectionTarget(host: Host): string {
  const vscodeDir = existsSync(vscodeUserDir()) ? vscodeUserDir() : undefined;
  return adapters[host].injectionPath(homedir(), vscodeDir);
}

function showStatus(): number {
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

// Remove what tk installed. Marker-guarded — only files tk wrote are removed.
// `--project` scopes removal to the repo's own artifacts (the project hook config
// + project injection); without it, the user-level install is removed. The two are
// installed independently, so uninstalling one must never nuke the other — e.g.
// cleaning up a `--project` test must not delete the user's claude-code hook.
function uninstall(opts: InitArgs): number {
  // --dry-run must NOT remove anything — probe current state via the same status
  // helpers `--show` uses and report what removal WOULD touch.
  if (opts.dryRun) return uninstallDryRun(opts);
  if (opts.project) return uninstallProject();

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
  return 0;
}

// Project-scoped uninstall (`--uninstall --project`): only the repo's own
// artifacts. Leaves every user-level tier (claude hook, shim, user injection,
// user guidance) untouched.
function uninstallProject(): number {
  const cwd = process.cwd();
  const removedProjectHook = uninstallCopilotHookConfig({ project: true, cwd });
  out(
    `project hook config: ${removedProjectHook.removed ? `removed ${removedProjectHook.path}` : "nothing to remove"}`,
  );
  unwriteInjection(projectInjectionPath(cwd));
  out(`project instruction injection: removed`);
  return 0;
}

// Read-only preview of `--uninstall`: report what removal WOULD touch without
// deleting anything. Mirrors uninstall()'s scoping — `--project` previews only the
// repo's artifacts, leaving the user-level tiers out.
function uninstallDryRun(opts: InitArgs): number {
  if (opts.project) {
    const cwd = process.cwd();
    const projectHook = copilotHookConfigStatus({ project: true, cwd });
    out(
      `[dry-run] project hook config: ${projectHook.present ? `would remove ${projectHook.path}` : "nothing to remove"}`,
    );
    const projectInjection = projectInjectionPath(cwd);
    out(
      `[dry-run] project instruction injection: ${existsSync(projectInjection) ? `would remove ${projectInjection}` : "nothing to remove"}`,
    );
    return 0;
  }

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
  return 0;
}

export function runInit(argv: string[]): number {
  // `tk init shim <install|status|uninstall>` — explicit control of the shim
  // delivery tier (formerly the top-level `tk shim`). The default `tk init`
  // flow below already installs the shim as part of its tier ladder, so this
  // is only for manual install/inspect/removal of the shim on its own.
  if (argv[0] === "shim") return runShim(argv.slice(1));

  const opts = parseInitArgs(argv);
  if (opts.show) return showStatus();
  if (opts.uninstall) return uninstall(opts);

  const host = opts.host === "auto" ? detectHost(gatherDetectEnv()) : opts.host;
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

  // Tier ladder (ADR 0002): Hook > Shim > Injection. The adapter carries the
  // per-host facts; selectTier is the single tier exit. No hardcoded host `if`s.
  const adapter = adapters[host];
  const hookAvailable = Boolean(adapter.installHook);

  // Hook tier. When a host has a hook installer it always wins over shim/injection
  // (the shim probe — the only side-effecting signal — is irrelevant here, so pass
  // false rather than install wrappers). Each adapter renders its own host-specific
  // lines; init prints them around the shared guidance + tier line.
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
