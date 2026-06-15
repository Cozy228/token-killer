// Slice 1 — Hook Rewrite Engine (DESIGN §3.8).
//
// A centralized command-rewrite registry over a raw shell command string. It is
// RTK-style: a `rewrite` only PREPENDS `tk` (`git status` → `tk git status`);
// nothing else changes. The `tk` proxy does the actual compression. The registry
// never replaces a tool result.
//
// Decisions (DESIGN §3.8):
//   - rewrite — the command, with `tk` prepended on each eligible segment
//   - suggest — not rewritten, carries a hint
//   - pass    — leave untouched (already `tk`, or a non-equivalent shell)
//   - deny    — blocked with a reason (unused by the terminal path today; direct-
//               tool denies live in govern.ts)
//
// Reuse: eligibility is decided by the existing command-proxy router
// (`routeSpecific`) plus the interactive denylist — only a specific, non-
// interactive, non-mutating match is rewritten. The registry does not fork or
// re-implement the compressor.

import { isProgramAvailable } from "../executor.js";
import { sanitizeSessionId } from "../parse.js";
import { routeSpecific } from "../router.js";
import { isInteractive } from "../shim/interactive.js";
import type { ParsedCommand } from "../types.js";

export type RewriteDecision = {
  decision: "pass" | "rewrite" | "suggest" | "deny";
  rewritten?: string;
  reason?: string;
};

type ChainOp = "&&" | "||" | ";" | "|";

type Segment = {
  text: string;
  // The operator that PRECEDES this segment in the chain (null for the first).
  precededBy: ChainOp | null;
};

// Split a command string into chain segments at top-level `&&`, `||`, `;`, `|`,
// respecting single/double quotes so operators inside quoted args are ignored, and
// tracking `{ ... }` brace depth so a separator INSIDE a script block / command
// group is not a top-level split point (issue #25).
function splitTopLevel(command: string): Segment[] {
  const segments: Segment[] = [];
  let buf = "";
  let prevOp: ChainOp | null = null;
  let quote: '"' | "'" | null = null;
  // Depth of unquoted `{ ... }` nesting. A `;`/`|`/`&&`/`||` at depth > 0 belongs to
  // the block (a pwsh script block, e.g. `ForEach-Object { a; b }`, or a bash command
  // group), NOT the outer chain — splitting there would inject `tk` mid-block and
  // change semantics (issue #25). At depth 0 the original top-level behavior is
  // byte-identical, so brace-free commands are unaffected.
  let braceDepth = 0;

  const flush = (nextOp: ChainOp): void => {
    segments.push({ text: buf, precededBy: prevOp });
    prevOp = nextOp;
    buf = "";
  };

  for (let i = 0; i < command.length; i += 1) {
    const c = command[i];
    if (quote) {
      buf += c;
      if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      buf += c;
      continue;
    }
    if (c === "{") {
      braceDepth += 1;
      buf += c;
      continue;
    }
    if (c === "}") {
      // Floor at 0 so a stray close-brace (no matching open) can't desync the depth
      // of an otherwise normal command and silently disable top-level splitting.
      if (braceDepth > 0) braceDepth -= 1;
      buf += c;
      continue;
    }
    // Separators are only chain operators at the top level (outside any brace block).
    if (braceDepth === 0) {
      if (c === "&" && command[i + 1] === "&") {
        flush("&&");
        i += 1;
        continue;
      }
      if (c === "|" && command[i + 1] === "|") {
        flush("||");
        i += 1;
        continue;
      }
      if (c === "|") {
        flush("|");
        continue;
      }
      if (c === ";") {
        flush(";");
        continue;
      }
    }
    buf += c;
  }
  segments.push({ text: buf, precededBy: prevOp });
  return segments;
}

// Tokenize a single segment into argv, stripping quotes. Total; never throws.
function tokenize(input: string): string[] {
  const tokens: string[] = [];
  let buf = "";
  let inToken = false;
  let quote: '"' | "'" | null = null;
  for (const c of input) {
    if (quote) {
      if (c === quote) quote = null;
      else buf += c;
      inToken = true;
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      inToken = true;
      continue;
    }
    if (c === " " || c === "\t" || c === "\n") {
      if (inToken) {
        tokens.push(buf);
        buf = "";
        inToken = false;
      }
      continue;
    }
    buf += c;
    inToken = true;
  }
  if (inToken) tokens.push(buf);
  return tokens;
}

function toParsed(tokens: string[]): ParsedCommand {
  return {
    program: tokens[0] ?? "",
    args: tokens.slice(1),
    original: tokens,
    displayCommand: tokens.join(" "),
  };
}

// Build the `tk ` (or `tk --session <id> `) prefix prepended to each eligible
// segment. The id is validated by the SINGLE shared `sanitizeSessionId` (parse.ts)
// — a raw id is NEVER interpolated, so `abc; rm -rf /` can never become shell syntax,
// and there is no second copy of the charset to drift out of sync. No/invalid session
// → exactly `tk ` (byte-identical to the no-session rewrite).
function tkPrefix(session?: string): string {
  const id = sanitizeSessionId(session);
  return id ? `tk --session ${id} ` : "tk ";
}

// Mutating ops are never rewritten (goal guardrail / DESIGN §14). routeSpecific
// already excludes most of them (only read-oriented handlers match), but git has
// read and write subcommands under the same handlers, so guard them explicitly.
function isMutating(parsed: ParsedCommand): boolean {
  if (parsed.program !== "git") return false;
  const sub = parsed.args[0];
  const mutatingSubs = new Set([
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
  if (sub && mutatingSubs.has(sub)) return true;
  // `git branch -d/-D/-m/-M/--delete/--move` mutates even though the branch
  // handler matches the read form.
  if (sub === "branch") {
    return parsed.args.some(
      (a) =>
        a === "-d" ||
        a === "-D" ||
        a === "-m" ||
        a === "-M" ||
        a === "--delete" ||
        a === "--move" ||
        a === "-c" ||
        a === "-C",
    );
  }
  return false;
}

// Why a segment is (in)eligible for rewrite. The reason is surfaced on `pass`
// decisions so `TK_DEBUG` can explain "why wasn't this rewritten?" (the most
// common hook question). Total; never throws.
type Eligibility = { eligible: true } | { eligible: false; reason: string };

function eligibility(tokens: string[], isAvailable: (program: string) => boolean): Eligibility {
  if (tokens.length === 0) return { eligible: false, reason: "empty segment" };
  if (tokens[0] === "tk") return { eligible: false, reason: "already a tk command" };
  // `test`/`[` are shell conditional builtins (`test -f x`, `[ -z "$v" ]`), never a
  // tool whose output is worth compressing. Rewriting to `tk test …` would run
  // `args[0]` as a program and break the conditional with exit 127 (C3), so they are
  // hard-ineligible regardless of what the test-runner handler's matcher accepts.
  if (tokens[0] === "test" || tokens[0] === "[") {
    return { eligible: false, reason: "shell conditional builtin" };
  }
  const parsed = toParsed(tokens);
  if (routeSpecific(parsed) === null) {
    return { eligible: false, reason: `no tk handler for '${parsed.program}'` };
  }
  // tk wraps real tools; it must not claim a command whose binary is absent. On a
  // stock Windows box `cat`/`ls`/`wc`/`env` are shell aliases, not executables, so
  // rewriting `cat foo` → `tk cat foo` would shell out to a missing binary and
  // break a command the shell would otherwise have run via its cmdlet alias (D2).
  // Off Windows this is always true (the gate is a Windows-only safety net).
  if (!isAvailable(parsed.program)) {
    return { eligible: false, reason: `no '${parsed.program}' binary on PATH` };
  }
  if (isInteractive(parsed)) return { eligible: false, reason: "interactive command" };
  if (isMutating(parsed)) return { eligible: false, reason: "mutating git subcommand" };
  return { eligible: true };
}

function rejoin(segments: Segment[]): string {
  let out = "";
  for (const seg of segments) {
    const text = seg.text.trim();
    if (seg.precededBy === null) out = text;
    else if (seg.precededBy === ";") out += `; ${text}`;
    else out += ` ${seg.precededBy} ${text}`;
  }
  return out;
}

// Bash collapses a backslash-line-continuation (`\<NL>`, `\<CRLF>`) plus the
// surrounding horizontal whitespace into a single space before dispatching the
// command. `String.trim()` does not unwrap them, so a command split across lines
// (`git \<NL>  log`) would tokenize as `["git\\", "log"]` and miss every handler —
// the rewrite silently never fires. Normalize first, mirroring RTK's
// collapse_line_continuations (issue #1564). No continuation → returns the input
// unchanged (the common fast path).
function collapseLineContinuations(command: string): string {
  return command.replace(/[ \t\v\f]*\\\r?\n[ \t\v\f]*/g, " ");
}

// Command substitution (`$(…)`, backticks) and arithmetic expansion (`$((…))`)
// are evaluated by the shell BEFORE the command runs, so their result can't be
// reasoned about statically — prepending `tk` may change semantics or wrap the
// wrong program. Pass instead. Quote handling mirrors the shell (and RTK's
// contains_substitution): single quotes suppress everything; a backslash escapes
// the next char outside single quotes; `$(` and backticks stay ACTIVE inside
// double quotes, so only single quotes protect them. `$(` covers both `$(…)` and
// `$((…))`. Conservative: any active construct → true.
function hasShellSubstitution(command: string): boolean {
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < command.length; i += 1) {
    const c = command[i];
    if (c === "\\" && !inSingle) {
      i += 1; // skip the escaped char
      continue;
    }
    if (c === "'" && !inDouble) {
      inSingle = !inSingle;
      continue;
    }
    if (c === '"' && !inSingle) {
      inDouble = !inDouble;
      continue;
    }
    if (inSingle) continue;
    if (c === "`") return true; // backtick command substitution
    if (c === "$" && command[i + 1] === "(") return true; // $( … )  and  $(( … ))
    // Process substitution `<( … )` / `>( … )` — only when fully unquoted.
    if (!inDouble && (c === "<" || c === ">") && command[i + 1] === "(") return true;
  }
  return false;
}

// A heredoc (`<<`/`<<-`) or output redirect (`>`/`>>`) makes the rewrite non-
// equivalent: the `tk` wrapper would not see the same I/O context. Pass instead.
// Conservative: any unquoted `<<`, `>`, or `>>` outside quotes → pass.
function hasNonEquivalentRedirect(command: string): boolean {
  let quote: '"' | "'" | null = null;
  for (let i = 0; i < command.length; i += 1) {
    const c = command[i];
    if (quote) {
      if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      continue;
    }
    if (c === "<" && command[i + 1] === "<") return true; // heredoc
    if (c === ">") return true; // > or >> output redirect (incl. 2>&1)
  }
  return false;
}

// `find … | xargs …` (and any pipe into xargs) must not be split/rewritten — it
// would break the pipeline semantics. Pass the whole command.
function pipesIntoXargs(segments: Segment[]): boolean {
  return segments.some((seg) => seg.precededBy === "|" && tokenize(seg.text)[0] === "xargs");
}

// Rewrite a raw shell command per DESIGN §3.8. Pure and total; never throws. When
// a (sanitized) `session` is supplied, each rewritten segment carries it as
// `tk --session <id> …` so the separate `tk` subprocess can stamp `session_id` on
// its history row (ADR 0009). A portable flag — not a `TK_SESSION=…` env prefix,
// which only works in POSIX sh and breaks on Windows pwsh.
export function rewriteCommand(
  raw: string,
  session?: string,
  // Presence check, injectable for tests. Defaults to the real PATH lookup so the
  // hook never rewrites a command whose binary is absent (D2).
  isAvailable: (program: string) => boolean = isProgramAvailable,
): RewriteDecision {
  // Unwrap bash line continuations first (P4) so a multi-line command tokenizes
  // the same as its single-line form; only then trim.
  const command = collapseLineContinuations(raw ?? "").trim();
  if (command.length === 0) return { decision: "pass", reason: "empty command" };
  const prefix = tkPrefix(session);

  // Non-equivalent shells → pass.
  if (hasNonEquivalentRedirect(command)) {
    return { decision: "pass", reason: "output redirect or heredoc (not equivalent under tk)" };
  }

  // Command substitution / arithmetic expansion → pass (P3): the shell evaluates
  // them at runtime, so the rewrite can't be proven equivalent.
  if (hasShellSubstitution(command)) {
    return { decision: "pass", reason: "command substitution or arithmetic expansion" };
  }

  const segments = splitTopLevel(command);
  if (pipesIntoXargs(segments)) return { decision: "pass", reason: "pipes into xargs" };

  let changed = false;
  // The reason the FIRST evaluated (non-pipe-RHS) segment was not rewritten —
  // reported on `pass` so the debug trace can explain it.
  let passReason: string | undefined;
  const out: Segment[] = segments.map((seg, i) => {
    // The RHS of `|` (`| grep`, `| head`) passes — ADR 0007 measured pipe tails as
    // not worth compressing. A segment whose stdout FEEDS a pipe must ALSO pass:
    // compressing a producer hands the downstream stage altered bytes, so e.g.
    // `git diff | grep -c '^+'` would count the compacted diff, not the real one
    // (C1). ADR 0007 follow-up #1 — never rewrite a segment followed by `|`.
    if (seg.precededBy === "|") return seg;
    if (segments[i + 1]?.precededBy === "|") {
      if (passReason === undefined) passReason = "stdout feeds a downstream pipe stage";
      return seg;
    }
    const tokens = tokenize(seg.text);
    const elig = eligibility(tokens, isAvailable);
    if (!elig.eligible) {
      if (passReason === undefined) passReason = elig.reason;
      return seg;
    }
    changed = true;
    return { ...seg, text: `${prefix}${seg.text.trim()}` };
  });

  if (!changed) return { decision: "pass", reason: passReason };
  return { decision: "rewrite", rewritten: rejoin(out) };
}
