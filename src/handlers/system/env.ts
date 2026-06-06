import { executeCommand } from "../../executor.js";
import type {
  CommandHandler,
  OmissionDeclaration,
  ParsedCommand,
  RawResult,
  TkOptions,
} from "../../types.js";
import { makeFilteredResult } from "../base.js";
import { overBudgetLadder } from "../common/budget.js";

// RTK: system/env_cmd.rs — group interesting environment variables, mask
//   secrets, and collapse PATH into an entry count + preview. Variables that
//   match no category (and no filter) are dropped entirely.
//
// ADR 0001 (intentional divergence from RTK's CAP_WARNINGS=10 / CAP_LIST=20):
// PATH entries and "other" vars are evidence — a dropped PATH dir or env var is a
// fact the agent acted on. The fixed caps are removed: every PATH entry and every
// categorised var is listed below the token budget; over budget the masked listing
// is replaced by an aggregate count (formatEnv never emits `+N more`). env masks
// secret VALUES, so it is registered as a masking handler in base.ts — it never
// reverts to raw, and its snapshot (raw, unmasked) stays in the local data dir.

// RTK: env_cmd.rs::get_sensitive_patterns.
const SENSITIVE_PATTERNS = [
  "key",
  "secret",
  "password",
  "token",
  "credential",
  "auth",
  "private",
  "api_key",
  "apikey",
  "access_key",
  "jwt",
];

// RTK: env_cmd.rs::is_lang_var.
const LANG_PATTERNS = [
  "RUST", "CARGO", "PYTHON", "PIP", "NODE", "NPM", "YARN", "DENO", "BUN", "JAVA", "MAVEN",
  "GRADLE", "GO", "GOPATH", "GOROOT", "RUBY", "GEM", "PERL", "PHP", "DOTNET", "NUGET",
];

// RTK: env_cmd.rs::is_cloud_var.
const CLOUD_PATTERNS = [
  "AWS", "AZURE", "GCP", "GOOGLE_CLOUD", "DOCKER", "KUBERNETES", "K8S", "HELM",
  "TERRAFORM", "VAULT", "CONSUL", "NOMAD",
];

// RTK: env_cmd.rs::is_tool_var.
const TOOL_PATTERNS = [
  "EDITOR", "VISUAL", "SHELL", "TERM", "GIT", "SSH", "GPG", "BREW", "HOMEBREW",
  "XDG", "CLAUDE", "ANTHROPIC",
];

type EnvVar = { key: string; value: string };

// RTK: env_cmd.rs::is_lang_var.
function isLangVar(key: string): boolean {
  const upper = key.toUpperCase();
  return LANG_PATTERNS.some((p) => upper.includes(p));
}

// RTK: env_cmd.rs::is_cloud_var.
function isCloudVar(key: string): boolean {
  const upper = key.toUpperCase();
  return CLOUD_PATTERNS.some((p) => upper.includes(p));
}

// RTK: env_cmd.rs::is_tool_var.
function isToolVar(key: string): boolean {
  const upper = key.toUpperCase();
  return TOOL_PATTERNS.some((p) => upper.includes(p));
}

// RTK: env_cmd.rs::mask_value — short values become "****"; otherwise keep a
// 2-char prefix and 2-char suffix around the mask. Uses Unicode code points.
function maskValue(value: string): string {
  const chars = Array.from(value);
  if (chars.length <= 4) {
    return "****";
  }
  const prefix = chars.slice(0, 2).join("");
  const suffix = chars.slice(chars.length - 2).join("");
  return `${prefix}****${suffix}`;
}

// RTK: env_cmd.rs::run — sensitive check is a case-insensitive substring match.
function isSensitive(key: string): boolean {
  const lower = key.toLowerCase();
  return SENSITIVE_PATTERNS.some((p) => lower.includes(p));
}

function parseEnvLines(stdout: string): EnvVar[] {
  const vars: EnvVar[] = [];
  for (const line of stdout.split("\n")) {
    if (line === "") continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    vars.push({ key: line.slice(0, eq), value: line.slice(eq + 1) });
  }
  return vars;
}

// Compute the display value. Secrets are masked (security). ADR 0001: a long
// non-sensitive value (a full PATH, NODE_OPTIONS, …) is evidence and is shown in
// FULL below budget — the old >100-char head-truncation silently dropped content
// even when the dump as a whole fit. The over-budget case is handled by
// formatEnvLadder, not by truncating individual values.
function displayValue(key: string, value: string): string {
  if (isSensitive(key)) {
    return maskValue(value);
  }
  return value;
}

// RTK: env_cmd.rs::run — full categorize + render pipeline.
function formatEnv(stdout: string): string {
  const vars = parseEnvLines(stdout);
  // RTK sorts vars by key before categorizing.
  vars.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));

  const pathVars: EnvVar[] = [];
  const langVars: EnvVar[] = [];
  const cloudVars: EnvVar[] = [];
  const toolVars: EnvVar[] = [];
  const otherVars: EnvVar[] = [];

  for (const { key, value } of vars) {
    const display = displayValue(key, value);
    const entry: EnvVar = { key, value: display };

    if (key.includes("PATH")) {
      pathVars.push(entry);
    } else if (isLangVar(key)) {
      langVars.push(entry);
    } else if (isCloudVar(key)) {
      cloudVars.push(entry);
    } else if (isToolVar(key)) {
      toolVars.push(entry);
    } else {
      // ADR 0001: RTK dropped every uncategorised var (kept only "interesting"
      // prefixes); a dropped env var is evidence the agent may need. Everything
      // that matched no specific category falls into Other so nothing is silently
      // discarded. isInterestingVar is no longer a gate — it only ordered which
      // vars RTK kept, and we now keep them all.
      otherVars.push(entry);
    }
  }

  const lines: string[] = [];

  if (pathVars.length > 0) {
    lines.push("PATH Variables:");
    for (const { key, value } of pathVars) {
      if (key === "PATH") {
        const paths = value.split(":");
        lines.push(`  PATH (${paths.length} entries):`);
        for (const p of paths) {
          lines.push(`    ${p}`);
        }
      } else {
        lines.push(`  ${key}=${value}`);
      }
    }
  }

  if (langVars.length > 0) {
    lines.push("\nLanguage/Runtime:");
    for (const { key, value } of langVars) {
      lines.push(`  ${key}=${value}`);
    }
  }

  if (cloudVars.length > 0) {
    lines.push("\nCloud/Services:");
    for (const { key, value } of cloudVars) {
      lines.push(`  ${key}=${value}`);
    }
  }

  if (toolVars.length > 0) {
    lines.push("\nTools:");
    for (const { key, value } of toolVars) {
      lines.push(`  ${key}=${value}`);
    }
  }

  if (otherVars.length > 0) {
    lines.push("\nOther:");
    for (const { key, value } of otherVars) {
      lines.push(`  ${key}=${value}`);
    }
  }

  const total = vars.length;
  const shown =
    pathVars.length + langVars.length + cloudVars.length + toolVars.length + otherVars.length;
  // RTK prints the summary only when no filter is supplied (always, for tk).
  lines.push(`\nTotal: ${total} vars (showing ${shown} relevant)`);

  return `${lines.join("\n")}\n`;
}

// ADR 0001 over-budget path: the masked listing is replaced by its count line
// (no secrets, no partial list); the gate persists the raw snapshot for recovery.
function formatEnvLadder(stdout: string): { output: string; omission?: OmissionDeclaration } {
  const full = formatEnv(stdout);
  const ladder = overBudgetLadder({
    full,
    replacement: () => {
      const total = parseEnvLines(stdout).length;
      return `Total: ${total} vars (over budget)\n`;
    },
  });
  return { output: ladder.text, omission: ladder.omission };
}

// `env` lists the environment ONLY when no command operand follows. Flags (-i,
// -0, -u NAME, --) and VAR=value assignments are environment setup; a bare
// positional token is the wrapped COMMAND (`env FOO=bar node app.js`), which `env`
// then RUNS — its stdout is the tool's output, not an environment dump. Routing
// such a run to the env formatter would parse the tool's stdout as env vars and
// corrupt it (audit #14). The same applies to `time`/`nice`/`nohup` wrappers, but
// those route by their own program name; here we only guard `env` itself.
function isEnvListing(args: string[]): boolean {
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]!;
    if (arg === "--") return i === args.length - 1; // `env --` (listing) vs `env -- cmd`
    if (arg === "-u" || arg === "--unset") {
      i += 1; // consumes the following NAME
      continue;
    }
    if (arg.startsWith("-")) continue; // other flags: -i, -0, -v, …
    if (arg.includes("=")) continue; // VAR=value assignment
    return false; // a bare positional ⇒ a command operand ⇒ this is a run, not a listing
  }
  return true;
}

export const envHandler: CommandHandler = {
  name: "env",
  programs: ["env"],
  matches(command) {
    return command.program === "env" && isEnvListing(command.args);
  },
  execute(command) {
    return executeCommand(command);
  },
  async filter(raw, _command, options: TkOptions) {
    const { output, omission } = formatEnvLadder(raw.stdout);
    return makeFilteredResult(this.name, raw, output, options, undefined, omission);
  },
};
