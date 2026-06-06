import { existsSync } from "node:fs";
import { homedir } from "node:os";

import { detectHost, gatherDetectEnv, type Host } from "./detect.js";
import { vscodeUserDir } from "./hostConfig.js";
import {
  projectInjectionPath,
  userInjectionPath,
  unwriteInjection,
  writeInjection,
} from "./injection.js";
import { installShim, runShim } from "./cli.js";
import {
  copilotHookConfigStatus,
  installCopilotHookConfig,
  planCopilotHookConfig,
  uninstallCopilotHookConfig,
} from "../hook/install.js";
import {
  claudeHookStatus,
  installClaudeHook,
  planClaudeHookInstall,
  uninstallClaudeHook,
} from "../hook/claudeInstall.js";

// Unified `tk init` (goal Phase 3, ADR 0002 §5). Auto-detects the host and wires
// the highest available delivery tier: Copilot CLI → hook seam (Track B), else
// shim; VS Code → shim; neither / shim probe FAIL → instruction injection.

function out(line: string): void {
  process.stdout.write(`${line}\n`);
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
  return userInjectionPath(host, homedir(), vscodeDir);
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
  return 0;
}

// Remove every tier this user-level init may have written: the Copilot hook
// config, the shim, and the injection files (user + project). Marker-guarded —
// only files tk wrote are removed.
function uninstall(opts: InitArgs): number {
  const removedClaude = uninstallClaudeHook({});
  out(
    `claude-code settings hook: ${removedClaude.removed ? `removed tk entry from ${removedClaude.path}` : "nothing to remove"}`,
  );
  const removedHook = uninstallCopilotHookConfig({ project: false });
  out(
    `copilot hook config: ${removedHook.removed ? `removed ${removedHook.path}` : "nothing to remove"}`,
  );
  if (opts.project) {
    const removedProjectHook = uninstallCopilotHookConfig({ project: true, cwd: process.cwd() });
    out(
      `project hook config: ${removedProjectHook.removed ? `removed ${removedProjectHook.path}` : "nothing to remove"}`,
    );
  }
  runShim(["uninstall"]);
  const host = detectHost(gatherDetectEnv());
  unwriteInjection(injectionTarget(host));
  if (opts.project) unwriteInjection(projectInjectionPath(process.cwd()));
  out(`instruction injection: removed`);
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

  // Hook tier (Claude Code): patch ~/.claude/settings.json so the PreToolUse
  // Bash hook invokes `tk hook claude`, replacing any `rtk hook claude` in place
  // (true drop-in — rtk leaves the path). The rewritten command is bare
  // `tk <cmd>`, so tk must be on PATH when Claude Code runs Bash.
  if (host === "claude-code") {
    if (opts.dryRun) {
      const plan = planClaudeHookInstall({});
      out(`[dry-run] would ${plan.action} claude-code settings hook: ${plan.path}`);
      if (plan.previousCommand && plan.previousCommand !== plan.command) {
        out(`  - ${plan.previousCommand}`);
      }
      out(`  + ${plan.command}`);
      out(`Active tier: hook`);
      out(`Ensure tk is on PATH for Claude Code's Bash (e.g. pnpm build && npm link).`);
      return 0;
    }
    const plan = installClaudeHook({});
    out(
      `${plan.action === "unchanged" ? "Up to date" : `${plan.action}d`} claude-code settings hook: ${plan.path}`,
    );
    out(`Active tier: hook`);
    out(`Ensure tk is on PATH for Claude Code's Bash (e.g. pnpm build && npm link).`);
    return 0;
  }

  // Hook tier (Copilot CLI only): write the host hook config pointing PreToolUse
  // at `tk hook copilot` (Slices 1–2). This is the highest tier; the proxy
  // compresses. Repo write only under --project.
  if (host === "copilot-cli") {
    const loc = { project: opts.project, cwd: process.cwd() };
    if (opts.dryRun) {
      const plan = planCopilotHookConfig(loc);
      out(`[dry-run] would ${plan.action} copilot hook config: ${plan.path}`);
      out(`Active tier: hook`);
      return 0;
    }
    const plan = installCopilotHookConfig(loc);
    out(
      `${plan.action === "unchanged" ? "Up to date" : "Wrote"} copilot hook config: ${plan.path}`,
    );
    out(`Active tier: hook`);
    return 0;
  }

  if (opts.dryRun) {
    out(`[dry-run] would install shim / injection for host: ${host}`);
    return 0;
  }

  // Shim tier (VS Code — command-compression's primary delivery there; Copilot
  // CLI never reaches here, it returns on the hook tier above).
  if (host === "vscode") {
    const probe = installShim({ rc: false, vscode: true });
    if (probe.pass) {
      out(`Active tier: shim`);
      out(`Restart your terminal (or VS Code) for PATH changes to take effect.`);
      return 0;
    }
    out("shim interception probe FAILED — falling back to instruction injection");
  }

  // Injection tier (unknown host, or shim probe failed). User-level by default.
  const target = injectionTarget(host);
  writeInjection(target);
  out(`Active tier: injection`);
  out(`Wrote user instructions: ${target}`);
  if (host === "unknown") {
    out(`(No host auto-detected. Point your agent at this file, or re-run with --project.)`);
  }
  out(`Restart your agent for the instructions to take effect.`);
  return 0;
}
