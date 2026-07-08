import { executeCommand } from "../../executor.js";
import type { CommandHandler, OmissionDeclaration, ParsedCommand } from "../../types.js";
import { makeFilteredResult, rawText } from "../base.js";

// RTK: cloud/curl_cmd.rs::MAX_RESPONSE_SIZE — non-JSON bodies past this byte size
// are truncated for the reader; the full body is recoverable via `ctx --raw`.
const MAX_RESPONSE_SIZE = 500;

function matchesCurl(command: ParsedCommand): boolean {
  return command.program === "curl";
}

// RTK: curl_cmd.rs::run — RTK always prepends `-s` (silent: no progress meter,
// which curl writes to stderr and would otherwise pollute the captured stream),
// then forwards the user's args verbatim. The migration harness bypasses
// execute(), so this construction helper (and its unit test) guards the real-CLI
// command shape.
//
// H12-curl fix: inject `-sS` instead of bare `-s`. `-s` silences BOTH the
// progress meter AND curl's own error diagnostics (connection refused, TLS
// errors, …). `-sS` keeps errors (-S = --show-error) while still suppressing
// the progress meter. A connection failure with plain `-s` prints nothing,
// causing the failure branch to emit "FAILED: curl" with no reason. With `-sS`
// the diagnostic goes to stderr and surfaces in the failure output.
export function buildCurlArgs(args: string[]): string[] {
  return ["-sS", ...args];
}

// RTK: curl_cmd.rs::filter_curl_output — a top-level JSON document. Mid-stream
// truncation would produce invalid JSON (#1536), so JSON always passes through.
function looksLikeJson(trimmed: string): boolean {
  return (
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]")) ||
    (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2)
  );
}

// RTK: curl_cmd.rs truncates on a char boundary because `.len()` counts bytes —
// never cut in the middle of a UTF-8 character. Continuation bytes are 0x80..0xBF.
function truncateOnCharBoundary(text: string, maxBytes: number): string {
  const buf = Buffer.from(text, "utf8");
  if (buf.length <= maxBytes) return text;
  let end = maxBytes;
  while (end > 0 && (buf[end]! & 0xc0) === 0x80) end -= 1;
  return buf.subarray(0, end).toString("utf8");
}

// RTK: curl_cmd.rs::filter_curl_output. ctx has no TTY plane — its filtered output
// always feeds an LLM reader, so the truncation path is the equivalent of RTK's
// is_tty=true branch. JSON / small bodies pass through unchanged.
//
// H12-curl fix: declare `{kind:"replacement"}` for the truncation so the gate
// force-persists raw and appends a snapshot pointer. The old wording evaded the
// base-gate sniffer and pointed recovery at `ctx --raw` re-run (which re-fires
// a POST, ADR 0001 d6 bans). The replacement kind causes the gate to write a
// raw snapshot and append "[full output: <path>]" — recovery without re-execution.
function formatCurl(raw: string): { output: string; omission?: OmissionDeclaration } {
  const trimmed = raw.trim();
  const byteLen = Buffer.byteLength(trimmed, "utf8");

  if (looksLikeJson(trimmed) || byteLen < MAX_RESPONSE_SIZE) {
    return { output: trimmed };
  }

  const head = truncateOnCharBoundary(trimmed, MAX_RESPONSE_SIZE);
  // RTK emits "{head}... ({n} bytes total)". Declare `digest` (not `replacement`)
  // so the gate force-persists raw and appends a snapshot pointer when available,
  // but does NOT revert to raw when persistence is disabled (--no-save-raw) — a
  // revert would re-expose a large body in full, undoing the size gate. `digest` =
  // "head is a lossless prefix window, full body in snapshot". The `... (N bytes)`
  // marker wording is kept clear of OMISSION_MARKERS so the gate does not
  // double-sniff it as an undeclared omission.
  // H12-curl: drop the `ctx --raw` re-run hint (ADR 0001 d6: re-run would re-fire
  // a POST). Recovery is via the rawPointer snapshot the gate appends.
  return {
    output: `${head}... (${byteLen} bytes total)`,
    omission: { kind: "digest" },
  };
}

export const curlHandler: CommandHandler = {
  name: "curl",
  traits: { structural: true },
  programs: ["curl"],

  matches: matchesCurl,

  execute(command) {
    // RTK: curl_cmd.rs prepends `-s` before spawning curl; never mutate the
    // original command so the filter keeps seeing the user's args.
    const args = buildCurlArgs(command.args);
    return executeCommand({
      ...command,
      args,
      original: ["curl", ...args],
      displayCommand: `curl ${args.join(" ")}`,
    });
  },

  async filter(raw, _command, options) {
    // RTK: curl_cmd.rs::run — on failure curl is NOT filtered; the body is surfaced
    // verbatim because truncating it would destroy diagnostics. RTK prints only
    // stderr-or-stdout; ctx keeps BOTH (untruncated) because for curl the HTTP
    // response body lives on stdout (error pages, API error JSON) and is often the
    // most useful diagnostic — dropping it in favour of stderr would lose it.
    if (raw.exitCode !== 0) {
      const segments = [raw.stderr.trim(), raw.stdout.trim()].filter(Boolean);
      const output = segments.length > 0 ? `FAILED: curl ${segments.join("\n")}` : "FAILED: curl";
      return makeFilteredResult(this, raw, output, options);
    }
    const { output, omission } = formatCurl(rawText(raw));
    return makeFilteredResult(this, raw, output, options, undefined, omission);
  },
};
