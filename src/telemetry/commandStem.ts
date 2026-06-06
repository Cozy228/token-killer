// Redact a shell command to its program (+ optional subcommand) for telemetry.
// Args, paths, flags, URLs, and secrets are dropped — never emitted raw.

function splitCommandTokens(command: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let quote: '"' | "'" | null = null;
  for (let i = 0; i < command.length; i += 1) {
    const c = command[i];
    if (quote) {
      if (c === quote) quote = null;
      else current += c;
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      continue;
    }
    if (c === " " || c === "\t") {
      if (current) {
        tokens.push(current);
        current = "";
      }
      continue;
    }
    current += c;
  }
  if (current) tokens.push(current);
  return tokens;
}

function isArgToken(token: string): boolean {
  if (token.startsWith("-")) return true;
  if (token.includes("://")) return true;
  if (/[/\\]/.test(token)) return true;
  if (/\.[a-zA-Z0-9]{1,8}$/.test(token)) return true;
  if (/[~@{}]/.test(token)) return true;
  if (/^[0-9a-f]{8,}$/i.test(token)) return true;
  if (token.includes("=") && token.length > 24) return true;
  return false;
}

const SECOND_TOKEN_PROGRAMS = new Set([
  "git",
  "docker",
  "kubectl",
  "npm",
  "pnpm",
  "yarn",
  "npx",
  "dotnet",
  "cargo",
  "go",
  "gh",
  "glab",
  "aws",
  "gcloud",
  "terraform",
  "vitest",
  "jest",
  "pytest",
  "ruff",
  "eslint",
  "tsc",
  "mvn",
  "gradle",
  "curl",
  "wget",
  "psql",
  "rg",
  "grep",
]);

// Returns e.g. "git diff", "vitest run", "ruff check" — never file paths or flags.
export function commandStem(raw: string): string {
  let cmd = raw.trim();
  if (cmd.startsWith("tk ")) cmd = cmd.slice(3).trim();
  if (!cmd) return "";

  const tokens = splitCommandTokens(cmd);
  if (tokens.length === 0) return "";

  const program = tokens[0];
  const parts = [program];

  if (!SECOND_TOKEN_PROGRAMS.has(program)) return program;

  for (let i = 1; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (isArgToken(token)) break;
    parts.push(token);
    if (program === "docker" && token === "compose") continue;
    if (program === "git" && parts.length >= 3) break;
    if (program === "docker" && tokens[1] === "compose" && parts.length >= 3) break;
    if (parts.length >= 2 && !(program === "docker" && tokens[1] === "compose")) break;
  }

  return parts.join(" ");
}
