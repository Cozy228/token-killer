import { basename } from "node:path";

import type { ParsedCommand } from "../types.js";

// ADR 0009 mandatory read-only gate. A command is dedup-eligible only if re-running
// it cannot change state — exact-compare alone is not enough, because a mutating
// command can produce byte-identical output yet a "unchanged" marker would wrongly
// imply "nothing happened". Default-true: a handler opts in via traits.cacheable
// and the pure-read tools (ls, tree, grep, wc, cat, env, tsc, …) are read-only for
// every command they match. Only the few tools whose handler matches BOTH read and
// write forms are gated here by subcommand.

// Git subcommands that mutate the repo / worktree. Mirrors the set in
// src/hook/rewrite.ts::isMutating — the two gate the same "never rewrite/dedup a
// mutation" and must stay in sync.
const GIT_MUTATING_SUBS = new Set([
  "commit",
  "push",
  "pull",
  "fetch",
  "merge",
  "rebase",
  "reset",
  "revert",
  "cherry-pick",
  "restore",
  "checkout",
  "switch",
  "stash",
  "clean",
  "rm",
  "mv",
  "add",
  "apply",
  "am",
  "tag",
  "init",
  "clone",
  "gc",
  "prune",
]);

function gitIsReadOnly(args: string[]): boolean {
  const sub = args[0];
  if (!sub) return true; // bare `git` prints help — no mutation
  if (GIT_MUTATING_SUBS.has(sub)) return false;
  if (sub === "branch") {
    // The read form lists branches; -d/-D/-m/-M/-c/-C (and --delete/--move/--copy)
    // mutate even though the branch handler matches the read shape (rewrite.ts).
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
  return true;
}

// docker/podman read subcommands. `compose` and `image` carry a read sub-verb.
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

export function isReadOnlyCommand(command: ParsedCommand): boolean {
  const prog = basename(command.program) || command.program;
  switch (prog) {
    case "git":
      return gitIsReadOnly(command.args);
    case "docker":
    case "podman":
      return dockerIsReadOnly(command.args);
    case "kubectl":
      return kubectlIsReadOnly(command.args);
    default:
      return true;
  }
}
