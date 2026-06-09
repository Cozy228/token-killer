import type { ParsedCommand } from "../types.js";

// ADR 0009 mandatory read-only gate. A command is dedup-eligible only if re-running
// it cannot change state — exact-compare alone is not enough, because a mutating
// command can produce byte-identical output yet a "unchanged" marker would wrongly
// imply "nothing happened" (the real command ALWAYS runs; dedup only suppresses the
// repeated *display*).
//
// The gate keys on the matched HANDLER's identity, not the program. Handlers match
// across wrappers — `matchesEslint`/`matchesTsc` fire on `npx eslint`, `pnpm eslint
// --fix`, etc. (the program is `npx`/`pnpm`, not `eslint`) — so a program-keyed gate
// would mis-classify `pnpm eslint --fix` as read-only. By switching on `handler.name`
// and inspecting the full `command.args` (which carry the tool name + flags for the
// wrapped forms), the read-only proof is robust to how the tool was invoked.
//
// Default is DENY: a handler this gate does not explicitly prove read-only is never
// cacheable. `cacheable` is opt-in per handler, but a cacheable handler whose matched
// form can mutate (`eslint --fix`, `ruff format`, `find -exec`, a bare `tsc` that
// emits) must be proven read-only HERE for the exact form, or it is declined (safe
// under-dedup). This is the positive-proof discipline that keeps the two from drifting.

// `find` actions that run a command or write a file (vs. just listing/printing).
const FIND_MUTATING_ACTIONS = new Set([
  "-exec",
  "-execdir",
  "-ok",
  "-okdir",
  "-delete",
  "-fprint",
  "-fprint0",
  "-fprintf",
  "-fls",
]);

function findIsReadOnly(args: string[]): boolean {
  return !args.some((a) => FIND_MUTATING_ACTIONS.has(a));
}

function eslintIsReadOnly(args: string[]): boolean {
  // --fix / --fix-type rewrite files in place; --fix-dry-run does NOT (it only
  // reports what would change), so it stays read-only.
  return !args.some((a) => a === "--fix" || a === "--fix-type" || a.startsWith("--fix-type="));
}

function ruffIsReadOnly(args: string[]): boolean {
  // `--fix`/`--fix-only` rewrite files on any subcommand. `ruff format` rewrites
  // files unless it is a `--check`/`--diff` dry run.
  if (args.some((a) => a === "--fix" || a === "--fix-only")) return false;
  if (args.includes("format")) return args.some((a) => a === "--check" || a === "--diff");
  return true;
}

function tscIsReadOnly(args: string[]): boolean {
  // tsc emits .js by default; only a declared `--noEmit` proves a pure type-check.
  // A project that relies on tsconfig `noEmit` (no CLI flag) is under-deduped — safe.
  return args.some((a) => a === "--noEmit" || a === "--noEmit=true");
}

function gitBranchIsReadOnly(args: string[]): boolean {
  // The read form lists branches; -d/-D/-m/-M/-c/-C (and --delete/--move/--copy)
  // mutate even though the branch handler matches the read shape.
  return !args.some(
    (a) =>
      a === "-d" ||
      a === "-D" ||
      a === "-m" ||
      a === "-M" ||
      a === "-c" ||
      a === "-C" ||
      a === "--delete" ||
      a === "--move" ||
      a === "--copy",
  );
}

const DOCKER_READ_SUBS = new Set([
  "ps",
  "images",
  "logs",
  "inspect",
  "version",
  "info",
  "top",
  "stats",
  "port",
  "diff",
  "history",
  "search",
]);

function dockerIsReadOnly(args: string[]): boolean {
  const sub = args[0];
  if (!sub) return false;
  if (sub === "compose") return args[1] === "ps" || args[1] === "logs" || args[1] === "ls";
  if (sub === "image") return args[1] === "ls" || args[1] === "inspect" || args[1] === "history";
  return DOCKER_READ_SUBS.has(sub);
}

const KUBECTL_READ_SUBS = new Set([
  "get",
  "describe",
  "logs",
  "version",
  "top",
  "explain",
  "api-resources",
  "api-versions",
  "cluster-info",
]);

function kubectlIsReadOnly(args: string[]): boolean {
  const sub = args[0];
  return sub ? KUBECTL_READ_SUBS.has(sub) : false;
}

// True only when the matched form is PROVABLY read-only. Keyed on the handler name
// (the reliable signal of which tool's semantics apply, robust to npx/pnpm wrappers).
export function isReadOnlyForHandler(handlerName: string, command: ParsedCommand): boolean {
  switch (handlerName) {
    // Pure-read handlers: every form they match is a read.
    //  - git-status/log/diff/show match only their (read) subcommand by construction.
    //  - package-list matches only `list`/`ls`.
    //  - search-like (grep/rg), read/read-like (cat/type/less/read), ls, tree, wc,
    //    diff, env never mutate.
    case "git-status":
    case "git-log":
    case "git-diff":
    case "git-show":
    case "ls":
    case "tree":
    case "wc":
    case "read":
    case "read-like":
    case "search-like":
    case "diff":
    case "env":
    case "package-list":
      return true;
    case "mypy":
      return !command.args.includes("--install-types"); // --install-types mutates the env
    case "git-branch":
      return gitBranchIsReadOnly(command.args);
    case "docker":
      return dockerIsReadOnly(command.args);
    case "kubectl":
      return kubectlIsReadOnly(command.args);
    case "list-like":
      return findIsReadOnly(command.args);
    case "eslint":
      return eslintIsReadOnly(command.args);
    case "ruff":
      return ruffIsReadOnly(command.args);
    case "tsc":
      return tscIsReadOnly(command.args);
    default:
      return false; // not provably read-only → never dedup (safe under-dedup)
  }
}
