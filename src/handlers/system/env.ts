import { executeCommand } from "../../executor.js";
import type { CommandHandler, ParsedCommand, RawResult, TgOptions } from "../../types.js";
import { makeFilteredResult } from "../base.js";

// RTK: system/env_cmd.rs — group interesting environment variables, mask
//   secrets, and collapse PATH into an entry count + preview. Variables that
//   match no category (and no filter) are dropped entirely.

// RTK: env_cmd.rs::run — MAX_PATH_ENTRIES = CAP_WARNINGS (10).
const MAX_PATH_ENTRIES = 10;
// RTK: env_cmd.rs::run — MAX_OTHER_VARS = CAP_LIST (20).
const MAX_OTHER_VARS = 20;

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

// RTK: env_cmd.rs::is_interesting_var (prefix match).
const INTERESTING_PREFIXES = ["HOME", "USER", "LANG", "LC_", "TZ", "PWD", "OLDPWD"];

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

// RTK: env_cmd.rs::is_interesting_var.
function isInterestingVar(key: string): boolean {
  const upper = key.toUpperCase();
  return INTERESTING_PREFIXES.some((p) => upper.startsWith(p));
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

// RTK: env_cmd.rs::run — compute the display value (masking, long-value preview).
function displayValue(key: string, value: string): string {
  if (isSensitive(key)) {
    return maskValue(value);
  }
  if (Array.from(value).length > 100) {
    const chars = Array.from(value);
    const preview = chars.slice(0, 50).join("");
    return `${preview}... (${chars.length} chars)`;
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
    } else if (isInterestingVar(key)) {
      // RTK also keeps everything when a filter is supplied; tg has no filter arg.
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
        for (const p of paths.slice(0, MAX_PATH_ENTRIES)) {
          lines.push(`    ${p}`);
        }
        if (paths.length > MAX_PATH_ENTRIES) {
          lines.push(`    ... +${paths.length - MAX_PATH_ENTRIES} more`);
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
    for (const { key, value } of otherVars.slice(0, MAX_OTHER_VARS)) {
      lines.push(`  ${key}=${value}`);
    }
    if (otherVars.length > MAX_OTHER_VARS) {
      lines.push(`  ... +${otherVars.length - MAX_OTHER_VARS} more`);
    }
  }

  const total = vars.length;
  const shown =
    pathVars.length +
    langVars.length +
    cloudVars.length +
    toolVars.length +
    Math.min(otherVars.length, 20);
  // RTK prints the summary only when no filter is supplied (always, for tg).
  lines.push(`\nTotal: ${total} vars (showing ${shown} relevant)`);

  return `${lines.join("\n")}\n`;
}

export const envHandler: CommandHandler = {
  name: "env",
  matches(command) {
    return command.program === "env";
  },
  execute(command) {
    return executeCommand(command);
  },
  async filter(raw, _command, options: TgOptions) {
    return makeFilteredResult(this.name, raw, formatEnv(raw.stdout), options);
  },
};
