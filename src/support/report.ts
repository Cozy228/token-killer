// `tk support` — assemble the shareable diagnostic. We REUSE `tk debug`'s collector
// and renderer rather than re-deriving them: collectDebugBundle already gathers
// version/platform/delivery health/command history/recent failures/debug.log/host
// configs, and renderDebug emits one home-scrubbed markdown document. The one gap is
// that the bundle does NOT capture errors.log (the real crash/hook-error feed), so we
// tail it in here.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { tokenKillerHome } from "../core/dataDir.js";
import { collectDebugBundle } from "../debug/collect.js";
import { renderDebug } from "../debug/render.js";
import { errorLogPath } from "../hook/debug.js";

// How many trailing errors.log lines to attach — enough to carry the most recent
// crash/hook-error without bloating the bundle.
const ERRORS_TAIL_LINES = 50;

// The support-boundary home scrubber. renderDebug scrubs the paths IT formats
// (env/config/artifact paths) but NOT command text or anomaly snapshot payloads —
// fine for `tk debug` (a local file), but `tk support` SENDS the bundle, so the
// whole document and summary are scrubbed here before anything leaves the machine.
// Kept local (mirrors render.ts's private one) rather than widening render.ts's
// export surface — Plan 009 scopes render.ts as untouched. Idempotent: re-scrubbing
// renderDebug's already-`~` paths is a no-op. Exported so the CLI can scrub the saved
// bundle path it puts into the mailto body.
export function scrubHome(text: string): string {
  const home = homedir();
  if (!home) return text;
  // A plain case-sensitive `split(home)` leaks the real home through two common
  // variants: a case-insensitive FS (macOS/Windows) can surface it in mixed case
  // (`/users/ziyu`), and a Windows home can appear with `\` OR `/` separators and
  // either drive-letter case (`C:\Users\ziyu` vs `c:/users/ziyu`). Build a matcher
  // that is case-insensitive (`i`) and separator-agnostic: split on either separator,
  // escape each literal segment's regex metachars, then rejoin with a class matching
  // BOTH separators. Idempotent — the emitted `~` never re-matches the home pattern.
  const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = home.split(/[\\/]/).map(escapeRe).join("[\\\\/]");
  return text.replace(new RegExp(pattern, "gi"), "~");
}

// Like scrubHome but for a SINGLE path string (not a document): additionally
// normalizes Windows `\` to `/` so the path shown in the mailto body / "saved at"
// line is portable and matches RTK's forward-slash form. Deliberately NOT applied
// to the full bundle — blanket-posixifying a document would corrupt command text
// and anomaly payloads (regex / `\n` literals), so this is scoped to lone paths.
export function scrubHomePath(p: string): string {
  return scrubHome(p).replace(/\\/g, "/");
}

// Best-effort read-last-N-lines. Missing/unreadable ⇒ "(none)". Never throws.
export function tailFile(path: string, maxLines: number): string {
  try {
    const lines = readFileSync(path, "utf8").split("\n");
    // A trailing newline yields a final empty element — drop it so the tail isn't
    // padded with a blank line.
    if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
    if (lines.length === 0) return "(none)";
    return lines.slice(-maxLines).join("\n");
  } catch {
    return "(none)";
  }
}

export type SupportReport = { markdown: string; summary: string };

// Build the full markdown report (debug bundle + errors.log tail) and a compact
// one-screen `summary` (for the mailto: body / Teams pointer). Under `redact` the
// debug bundle is already length/label-only; the errors.log section becomes a
// length-only line and the summary drops the last-error text.
export async function buildSupportReport(opts: {
  cwd: string;
  redact: boolean;
}): Promise<SupportReport> {
  const bundle = await collectDebugBundle({ cwd: opts.cwd, full: false, redact: opts.redact });
  const debugMarkdown = renderDebug(bundle);

  const rawTail = tailFile(errorLogPath(), ERRORS_TAIL_LINES);
  const errorsSection = opts.redact
    ? rawTail === "(none)"
      ? "(none)"
      : `_(${rawTail.split("\n").length} lines, ${rawTail.length} chars — body redacted)_`
    : rawTail;

  const assembled = [
    debugMarkdown,
    "## Recent errors (errors.log)",
    "",
    opts.redact ? errorsSection : ["```", errorsSection, "```"].join("\n"),
    "",
  ].join("\n");
  // Scrub the WHOLE document at the support boundary (covers command text + anomaly
  // payloads renderDebug leaves verbatim, and the errors.log tail). No-op under
  // --redact (already body-free).
  const markdown = scrubHome(assembled);

  const e = bundle.env;
  const d = bundle.delivery;
  const deliveryState = !d.anyWired ? "NOT wired" : d.brokenHook ? "wired but BROKEN" : "wired";
  const lastError =
    opts.redact || rawTail === "(none)" ? rawTail : (rawTail.split("\n").pop() ?? "(none)");
  // Scrub the summary too — `lastError` is a raw errors.log line and the summary
  // travels in the mailto body / Teams pointer (both leave the machine).
  const summary = scrubHome(
    [
      `tk ${e.version} · ${e.platform}/${e.arch} · node ${e.nodeVersion} · host ${e.detectedHost}`,
      `delivery: ${deliveryState}`,
      `recent delivery failures: ${d.recentFailures.length}`,
      `last error: ${opts.redact ? "(redacted)" : lastError}`,
    ].join("\n"),
  );

  return { markdown, summary };
}

// Write the report to ~/.token-killer/reports/support-<ts>.md (reuse the reports/
// dir + ISO-flattened stamp convention from src/report/open.ts). Returns the path.
export function writeSupportBundle(markdown: string, nowMs: number): string {
  const dir = join(tokenKillerHome(), "reports");
  // Owner-only: the bundle holds commands, output, logs, and host config, so it must
  // not be world-readable on a shared host (matches rawStore.ts's 0700/0600).
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const stamp = new Date(nowMs).toISOString().replace(/[:.]/g, "-");
  const path = join(dir, `support-${stamp}.md`);
  writeFileSync(path, markdown, { mode: 0o600 });
  return path;
}
