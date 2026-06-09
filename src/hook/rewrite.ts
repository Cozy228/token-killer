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
// respecting single/double quotes so operators inside quoted args are ignored.
function splitTopLevel(command: string): Segment[] {
  const segments: Segment[] = [];
  let buf = "";
  let prevOp: ChainOp | null = null;
  let quote: '"' | "'" | null = null;

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

// ADR 0009: a session id is only injected into the rewritten command string when
// it matches this conservative charset — otherwise it is dropped (no flag). This
// is a shell-injection guard: a raw id is NEVER interpolated, so `abc; rm -rf /`
// can never become shell syntax. Mirrors parse.ts::SESSION_ID_RE.
const SESSION_ID_RE = /^[A-Za-z0-9._-]{1,128}$/;

// Build the `tk ` (or `tk --session <id> `) prefix prepended to each eligible
// segment. No/invalid session → exactly `tk ` (byte-identical to the no-session
// rewrite), so non-session callers are never affected.
function tkPrefix(session?: string): string {
  const id = typeof session === "string" ? session.trim() : "";
  return SESSION_ID_RE.test(id) ? `tk --session ${id} ` : "tk ";
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

function eligibility(tokens: string[]): Eligibility {
  if (tokens.length === 0) return { eligible: false, reason: "empty segment" };
  if (tokens[0] === "tk") return { eligible: false, reason: "already a tk command" };
  const parsed = toParsed(tokens);
  if (routeSpecific(parsed) === null) {
    return { eligible: false, reason: `no tk handler for '${parsed.program}'` };
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
export function rewriteCommand(raw: string, session?: string): RewriteDecision {
  const command = (raw ?? "").trim();
  if (command.length === 0) return { decision: "pass", reason: "empty command" };
  const prefix = tkPrefix(session);

  // Non-equivalent shells → pass.
  if (hasNonEquivalentRedirect(command)) {
    return { decision: "pass", reason: "output redirect or heredoc (not equivalent under tk)" };
  }

  const segments = splitTopLevel(command);
  if (pipesIntoXargs(segments)) return { decision: "pass", reason: "pipes into xargs" };

  let changed = false;
  // The reason the FIRST evaluated (non-pipe-RHS) segment was not rewritten —
  // reported on `pass` so the debug trace can explain it.
  let passReason: string | undefined;
  const out: Segment[] = segments.map((seg) => {
    // Only the LHS of `|` is rewritten; the RHS (`| grep`, `| head`) passes.
    if (seg.precededBy === "|") return seg;
    const tokens = tokenize(seg.text);
    const elig = eligibility(tokens);
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
