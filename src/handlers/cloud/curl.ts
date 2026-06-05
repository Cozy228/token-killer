import { executeCommand } from "../../executor.js";
import type { CommandHandler, ParsedCommand } from "../../types.js";
import { makeFilteredResult, rawText } from "../base.js";

// RTK: cloud/curl_cmd.rs::MAX_RESPONSE_SIZE — non-JSON bodies past this byte size
// are truncated for the reader; the full body is recoverable via `tg --raw`.
const MAX_RESPONSE_SIZE = 500;

function matchesCurl(command: ParsedCommand): boolean {
  return command.program === "curl";
}

// RTK: curl_cmd.rs::run — RTK always prepends `-s` (silent: no progress meter,
// which curl writes to stderr and would otherwise pollute the captured stream),
// then forwards the user's args verbatim. The migration harness bypasses
// execute(), so this construction helper (and its unit test) guards the real-CLI
// command shape.
export function buildCurlArgs(args: string[]): string[] {
  return ["-s", ...args];
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

// RTK: curl_cmd.rs::filter_curl_output. tg has no TTY plane — its filtered output
// always feeds an LLM reader, so the truncation path is the equivalent of RTK's
// is_tty=true branch. JSON / small bodies pass through unchanged.
function formatCurl(raw: string): string {
  const trimmed = raw.trim();
  const byteLen = Buffer.byteLength(trimmed, "utf8");

  if (looksLikeJson(trimmed) || byteLen < MAX_RESPONSE_SIZE) {
    return trimmed;
  }

  const head = truncateOnCharBoundary(trimmed, MAX_RESPONSE_SIZE);
  // RTK emits "{head}... ({n} bytes total)" then a tee hint on the next line; tg's
  // recovery channel is `tg --raw` rather than a tee file. The marker wording is
  // kept clear of base.ts LOSSY_OMISSION_PATTERNS so the output is not bounced to raw.
  return `${head}... (${byteLen} bytes total)\nResponse truncated; re-run with \`tg --raw\` to recover the full body.`;
}

export const curlHandler: CommandHandler = {
  name: "curl",

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
    // stderr-or-stdout; tg keeps BOTH (untruncated) because for curl the HTTP
    // response body lives on stdout (error pages, API error JSON) and is often the
    // most useful diagnostic — dropping it in favour of stderr would lose it.
    if (raw.exitCode !== 0) {
      const segments = [raw.stderr.trim(), raw.stdout.trim()].filter(Boolean);
      const output = segments.length > 0 ? `FAILED: curl ${segments.join("\n")}` : "FAILED: curl";
      return makeFilteredResult(this.name, raw, output, options);
    }
    return makeFilteredResult(this.name, raw, formatCurl(rawText(raw)), options);
  },
};
