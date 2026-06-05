import type { ParsedCommand } from "../types.js";

// Interactivity denylist (ADR 0002 §3, CONTEXT.md → Interactive command). This is
// a SAFETY NET on top of the primary TTY gate in cli.ts, not the main mechanism:
// the cases below open an editor / patch picker / login prompt and must always be
// passthrough'd (stdio: inherit), even on the off chance stdout is not a TTY.
// Keep the list small and explicit.

// CLIs that have a credential `login` subcommand that opens a prompt. Scoping
// the login check to these (review finding F3) avoids treating `grep login f`,
// `git checkout login`, or `ls login` as interactive — those are specific
// matches that should still compress.
const AUTH_CLIS = new Set([
  "gh", "glab", "hub", "gt",
  "aws", "gcloud", "az", "doctl", "flyctl", "fly", "heroku", "databricks",
  "npm", "pnpm", "yarn",
  "docker", "podman", "helm",
  "vault", "op", "tsh", "kaggle", "huggingface-cli", "wrangler", "vercel", "netlify",
]);

// `login` as a positional subcommand of one of the auth CLIs above. A flag value
// like `--message=login` (not positional) does not count.
function isLoginSubcommand(program: string, args: string[]): boolean {
  if (!AUTH_CLIS.has(program)) return false;
  return args.some((arg) => arg === "login" && !arg.startsWith("-"));
}

// `-m`/`-F` (or combined short groups like `-am`) and `--message`/`--file`
// (with or without `=value`) mean git commit takes its message non-interactively
// and does NOT open the editor.
function gitCommitHasMessage(args: string[]): boolean {
  for (const arg of args) {
    if (arg === "-m" || arg === "-F") return true;
    if (arg === "--message" || arg === "--file") return true;
    if (arg.startsWith("--message=") || arg.startsWith("--file=")) return true;
    // Combined short flags, e.g. `-am`, `-Fm`.
    if (/^-[a-zA-Z]+$/.test(arg) && (arg.includes("m") || arg.includes("F"))) return true;
  }
  return false;
}

export function isInteractive(command: ParsedCommand): boolean {
  const { program, args } = command;

  // A credential `login` subcommand needs a prompt: `gh auth login`,
  // `npm login`, `docker login`, `aws sso login`, `glab auth login`, …
  if (isLoginSubcommand(program, args)) return true;

  if (program === "git") {
    const sub = args[0];
    if (sub === "commit" && !gitCommitHasMessage(args)) return true;
    if (sub === "rebase" && (args.includes("-i") || args.includes("--interactive"))) return true;
    if (
      sub === "add" &&
      (args.includes("-p") ||
        args.includes("-i") ||
        args.includes("--patch") ||
        args.includes("--interactive"))
    ) {
      return true;
    }
    if ((sub === "mergetool" || sub === "difftool") && !args.includes("--no-prompt")) return true;
  }

  return false;
}
