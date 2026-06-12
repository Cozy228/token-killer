// Goal B — one HostAdapter seam. Every per-host fact init used to branch on
// (which delivery tiers a host supports, where its guidance/injection files
// live, how its hook tier installs) lives behind one entry in the `adapters`
// table. `init.ts` drives the install off `selectTier()` + the adapter; it no
// longer carries a hardcoded `if (host === …)` ladder.
//
// Existing hosts DELEGATE to the already-tested path/installer functions
// (`userInjectionPath`, `guidanceFilePath`, `installClaudeHook`, …) so this
// refactor changes no behavior. A NEW host only needs a self-contained adapter
// entry — no edits to injection.ts / guidance.ts / the installers (verified by a
// stub adapter in the tests). Dependency edges stay one-way:
//   init → hostAdapter → { injection, guidance, hook/install, hook/claudeInstall }

import type { Dialect } from "../hook/normalize.js";
import { installClaudeHook, planClaudeHookInstall } from "../hook/claudeInstall.js";
import { installCopilotHookConfig, planCopilotHookConfig } from "../hook/install.js";
import type { Host, Tier } from "./detect.js";
import { guidanceFilePath } from "./guidance.js";
import { userInjectionPath } from "./injection.js";

// Where a hook install writes — user-level by default, repo under `--project`.
export type HookLoc = { project: boolean; cwd: string };

// A hook tier install (or its --dry-run preview) rendered as output lines. init
// prints `headerLines`, then the shared guidance step, then `Active tier: hook`,
// then `trailerLines`. The split lets each host own its host-specific lines
// (claude's `- prev` / `+ cmd` diff + "Ensure tk is on PATH"; copilot has
// neither) while init stays host-agnostic.
export type HookStep = { headerLines: string[]; trailerLines: string[] };

export interface HostAdapter {
  host: Host;
  // The hook-payload dialect this host emits (camelCase `cli` vs snake_case
  // `vscode`). Normalization itself stays in normalize.ts; this records the fact.
  dialect: Dialect;
  // Delivery tiers this host supports, best-first (ADR 0002). selectTier picks
  // among these given hook availability + the live shim probe.
  supportedTiers: Tier[];
  // The TK.md usage-guide path for this host, or undefined if it has no home.
  guidancePath(home?: string): string | undefined;
  // The user-level instruction-injection target.
  injectionPath(home?: string, vscodeUserDir?: string): string;
  // Hook tier — present only on hosts that support it. `installHook` performs the
  // write; `planHook` previews it for --dry-run. Presence is how selectTier learns
  // `hookAvailable`.
  installHook?(loc: HookLoc): HookStep;
  planHook?(loc: HookLoc): HookStep;
}

// A hook-config patch reports its action as a verb stem (create/replace/append/
// overwrite/unchanged). Naively suffixing "d" produces "appendd"/"overwrited", so
// map each to a correct past tense for the applied-change line.
function actionDone(action: string): string {
  switch (action) {
    case "unchanged":
      return "Up to date";
    case "append":
      return "Appended";
    case "replace":
      return "Replaced";
    case "create":
      return "Created";
    case "overwrite":
      return "Rewrote";
    default:
      return `${action}d`;
  }
}

// For the `[dry-run] would <verb>` line: "would unchanged" is not English, so a
// no-op patch reads "would leave unchanged"; every other action is already a verb.
function actionWould(action: string): string {
  return action === "unchanged" ? "leave unchanged" : action;
}

const CLAUDE_PATH_NOTE =
  "Ensure tk is on PATH for Claude Code's Bash (e.g. pnpm build && npm link).";

const claudeAdapter: HostAdapter = {
  host: "claude-code",
  dialect: "vscode", // Claude Code emits snake_case tool_name/tool_input payloads.
  supportedTiers: ["hook", "injection"],
  guidancePath: (home) => guidanceFilePath("claude-code", home),
  injectionPath: (home, vscodeUserDir) => userInjectionPath("claude-code", home, vscodeUserDir),
  installHook: () => {
    const plan = installClaudeHook({});
    return {
      headerLines: [`${actionDone(plan.action)} claude-code settings hook: ${plan.path}`],
      trailerLines: [CLAUDE_PATH_NOTE],
    };
  },
  planHook: () => {
    const plan = planClaudeHookInstall({});
    const headerLines = [
      `[dry-run] would ${actionWould(plan.action)} claude-code settings hook: ${plan.path}`,
    ];
    if (plan.previousCommand && plan.previousCommand !== plan.command) {
      headerLines.push(`  - ${plan.previousCommand}`);
    }
    headerLines.push(`  + ${plan.command}`);
    return { headerLines, trailerLines: [CLAUDE_PATH_NOTE] };
  },
};

const copilotAdapter: HostAdapter = {
  host: "copilot-cli",
  dialect: "cli", // Copilot CLI emits camelCase toolName/toolArgs payloads.
  supportedTiers: ["hook", "shim", "injection"],
  guidancePath: (home) => guidanceFilePath("copilot-cli", home),
  injectionPath: (home, vscodeUserDir) => userInjectionPath("copilot-cli", home, vscodeUserDir),
  installHook: (loc) => {
    const plan = installCopilotHookConfig({ project: loc.project, cwd: loc.cwd });
    if (plan.action === "skipped-unmanaged") {
      return {
        headerLines: [
          `copilot hook config exists but is not managed by tk — left untouched: ${plan.path}`,
          "  (remove it and re-run tk install to adopt)",
        ],
        trailerLines: [],
      };
    }
    return {
      headerLines: [
        `${plan.action === "unchanged" ? "Up to date" : "Wrote"} copilot hook config: ${plan.path}`,
      ],
      trailerLines: [],
    };
  },
  planHook: (loc) => {
    const plan = planCopilotHookConfig({ project: loc.project, cwd: loc.cwd });
    if (plan.action === "skipped-unmanaged") {
      return {
        headerLines: [
          `[dry-run] copilot hook config exists but is not managed by tk — would leave untouched: ${plan.path}`,
        ],
        trailerLines: [],
      };
    }
    return {
      headerLines: [
        `[dry-run] would ${actionWould(plan.action)} copilot hook config: ${plan.path}`,
      ],
      trailerLines: [],
    };
  },
};

const vscodeAdapter: HostAdapter = {
  host: "vscode",
  dialect: "vscode", // VS Code emits snake_case tool_name/tool_input payloads.
  supportedTiers: ["shim", "injection"],
  guidancePath: (home) => guidanceFilePath("vscode", home),
  injectionPath: (home, vscodeUserDir) => userInjectionPath("vscode", home, vscodeUserDir),
  // No installHook — VS Code's highest tier is the shim.
};

const unknownAdapter: HostAdapter = {
  host: "unknown",
  dialect: "unknown",
  supportedTiers: ["injection"],
  guidancePath: (home) => guidanceFilePath("unknown", home),
  injectionPath: (home, vscodeUserDir) => userInjectionPath("unknown", home, vscodeUserDir),
};

// The single host → capabilities table. init resolves `adapters[host]` and drives
// the whole install off it.
export const adapters: Record<Host, HostAdapter> = {
  "claude-code": claudeAdapter,
  "copilot-cli": copilotAdapter,
  vscode: vscodeAdapter,
  unknown: unknownAdapter,
};
