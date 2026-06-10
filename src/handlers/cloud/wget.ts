import type { ParsedCommand, RawResult } from "../../types.js";
import { defineHandler } from "../define.js";

// RTK: cloud/wget_cmd.rs — compact wget: strips progress bars, emits a single
// result line. RTK's `run` path captures wget's output (progress is written to
// STDERR) and reduces it to "{compact_url} ok | {filename} | {size}" on success
// or "{compact_url} FAILED: {error}" on failure. tk operates on already-captured
// raw output, so the same parsing is applied to raw.stderr / raw.stdout.

function matchesWget(command: ParsedCommand): boolean {
  return command.program === "wget";
}

// RTK: wget_cmd.rs::compact_url — strip protocol, truncate URLs longer than 50
// chars to "{first 25}...{last 20}" (char-based, Unicode-safe).
function compactUrl(url: string): string {
  let withoutProto = url;
  if (url.startsWith("https://")) {
    withoutProto = url.slice("https://".length);
  } else if (url.startsWith("http://")) {
    withoutProto = url.slice("http://".length);
  }

  const chars = Array.from(withoutProto);
  if (chars.length <= 50) {
    return withoutProto;
  }
  const prefix = chars.slice(0, 25).join("");
  const suffix = chars.slice(chars.length - 20).join("");
  return `${prefix}...${suffix}`;
}

// RTK: wget_cmd.rs::format_size — 0 bytes renders as "?" (size unknown), then
// B / KB / MB / GB with one decimal place above the byte threshold.
function formatSize(bytes: number): string {
  if (bytes === 0) {
    return "?";
  }
  if (bytes < 1024) {
    return `${bytes}B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)}KB`;
  }
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  }
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)}GB`;
}

// RTK: wget_cmd.rs::extract_filename_from_output — prefer an explicit -O /
// --output-document argument, then parse wget's stderr for the "Saving to" /
// French "Sauvegarde en" line (quoted in « » or '...'), then fall back to the
// URL basename, defaulting to "index.html" when there is no real filename.
function extractFilename(stderr: string, url: string, args: string[]): string {
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]!;
    if (arg === "-O" || arg === "--output-document") {
      const next = args[i + 1];
      if (next !== undefined) {
        return next;
      }
    }
    if (arg.startsWith("-O") && arg.length > 2) {
      return arg.slice(2);
    }
  }

  for (const line of stderr.split(/\r?\n/)) {
    if (line.includes("Sauvegarde en") || line.includes("Saving to")) {
      const chars = Array.from(line);
      let startIdx: number | undefined;
      let endIdx: number | undefined;

      for (let i = 0; i < chars.length; i += 1) {
        const c = chars[i]!;
        if (c === "«" || (c === "'" && startIdx === undefined)) {
          startIdx = i;
        }
        if (c === "»" || (c === "'" && startIdx !== undefined)) {
          endIdx = i;
        }
      }

      if (startIdx !== undefined && endIdx !== undefined && endIdx > startIdx + 1) {
        return chars
          .slice(startIdx + 1, endIdx)
          .join("")
          .trim();
      }
    }
  }

  // Fallback: extract from URL.
  const afterProto = url.includes("://") ? url.split("://").pop()! : url;
  const lastSegment = afterProto.split("/").pop() ?? "index.html";
  const filename = lastSegment.split("?")[0] ?? "index.html";

  if (filename === "" || !filename.includes(".")) {
    return "index.html";
  }
  return filename;
}

// RTK: wget_cmd.rs::parse_error — map well-known wget failure signatures to a
// terse label; otherwise surface the first meaningful stderr line (skipping
// "--" timestamp lines) truncated to 60 chars.
//
// M12-wget fix: use anchored patterns for HTTP status codes so that a body
// containing e.g. "Length: 15000" (contains "500") is not falsely labelled
// "500 Server Error". Match only when the status code appears as part of an
// HTTP status line ("HTTP/... 404") or as a standalone token ("ERROR 404:").
function parseError(stderr: string, stdout: string): string {
  const combined = `${stderr}\n${stdout}`;

  // Anchored HTTP status patterns: "HTTP/1.x NNN" or "ERROR NNN:" or "NNN Reason".
  if (/\bHTTP\/\S+\s+404\b|ERROR\s+404\b|(?:^|\s)404\s/m.test(combined)) return "404 Not Found";
  if (/\bHTTP\/\S+\s+403\b|ERROR\s+403\b|(?:^|\s)403\s/m.test(combined)) return "403 Forbidden";
  if (/\bHTTP\/\S+\s+401\b|ERROR\s+401\b|(?:^|\s)401\s/m.test(combined)) return "401 Unauthorized";
  if (/\bHTTP\/\S+\s+500\b|ERROR\s+500\b|(?:^|\s)500\s/m.test(combined)) return "500 Server Error";
  if (combined.includes("Connection refused")) return "Connection refused";
  if (combined.includes("unable to resolve") || combined.includes("Name or service not known")) {
    return "DNS lookup failed";
  }
  if (combined.includes("timed out")) return "Connection timed out";
  if (combined.includes("SSL") || combined.includes("certificate")) return "SSL/TLS error";

  for (const line of stderr.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed !== "" && !trimmed.startsWith("--")) {
      const chars = Array.from(trimmed);
      if (chars.length > 60) {
        return `${chars.slice(0, 60).join("")}...`;
      }
      return trimmed;
    }
  }

  return "Unknown error";
}

// C5-wget: wget -O - / -qO- / --output-document - writes the body to stdout
// rather than a file. This constant caps how many bytes are emitted inline (the
// same limit curl uses for non-JSON bodies). Bodies below this threshold pass
// through in full; larger ones are truncated with a byte-count marker.
const WGET_MAX_BODY_SIZE = 500;

// Return true when the user asked wget to write the body to stdout (-O - or
// -qO- or --output-document -) so we should emit raw.stdout instead of the
// filename/size summary.
function isStdoutDownload(args: string[]): boolean {
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]!;
    if ((arg === "-O" || arg === "--output-document") && args[i + 1] === "-") return true;
    if (arg === "-O-" || arg === "-qO-" || arg === "-qO -") return true;
    // -qO- written as combined flags ending in "-O-".
    if (arg.startsWith("-") && !arg.startsWith("--") && arg.includes("O") && arg.endsWith("-")) {
      return true;
    }
  }
  return false;
}

// RTK: wget_cmd.rs::run resolves the URL as the final positional argument and
// passes the remaining tokens through as wget flags.
const VALUE_FLAGS = new Set([
  "-O",
  "--output-document",
  "-o",
  "--output-file",
  "-P",
  "--directory-prefix",
]);

function splitUrlAndArgs(args: string[]): { url: string; rest: string[] } {
  let url = "";
  const rest: string[] = [];
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]!;
    if (arg.startsWith("-")) {
      rest.push(arg);
      // Keep the value of value-taking flags (e.g. -O myfile.zip) in `rest` so
      // extract_filename can honour it instead of mistaking it for the URL.
      if (VALUE_FLAGS.has(arg) && i + 1 < args.length) {
        i += 1;
        rest.push(args[i]!);
      }
      continue;
    }
    // The download target is the URL (prefer one with a scheme, else first bare arg).
    if (arg.includes("://") || url === "") {
      url = arg;
    } else {
      rest.push(arg);
    }
  }
  return { url, rest };
}

export const wgetHandler = defineHandler({
  name: "wget",
  programs: ["wget"],

  match: matchesWget,

  format: (raw: RawResult, command, options) => {
    const { url, rest } = splitUrlAndArgs(command.args);

    if (raw.exitCode !== 0) {
      // RTK: wget_cmd.rs::run failure branch — "{compact_url} FAILED: {error}".
      const error = parseError(raw.stderr, raw.stdout);
      const output = `${compactUrl(url)} FAILED: ${error}`;
      return output;
    }

    // C5-wget: -O -/-qO- writes the body to stdout; emit the body (size-gated,
    // same policy as curl). Non-empty stdout on a success without this flag is
    // also surfaced so wget --spider / wget with redirect output is not silently
    // discarded.
    if (isStdoutDownload(command.args) && raw.stdout.length > 0) {
      const body = raw.stdout.trim();
      const byteLen = Buffer.byteLength(body, "utf8");
      if (byteLen <= WGET_MAX_BODY_SIZE) {
        return body;
      }
      // Truncate on a char boundary (same approach as curl).
      const buf = Buffer.from(body, "utf8");
      let end = WGET_MAX_BODY_SIZE;
      while (end > 0 && (buf[end]! & 0xc0) === 0x80) end -= 1;
      const head = buf.subarray(0, end).toString("utf8");
      return `${head}... (${byteLen} bytes total)`;
    }

    // RTK: wget_cmd.rs::run success branch — "{compact_url} ok | {filename} |
    // {size}". RTK reads the on-disk file size via std::fs::metadata; tk filters
    // already-captured output and has no downloaded file, so the size is parsed
    // from wget's own "saved [N/total]" summary when present, else unknown ("?").
    const filename = extractFilename(raw.stderr, url, rest);
    const size = parseSavedSize(raw.stderr, raw.stdout);
    const output = `${compactUrl(url)} ok | ${filename} | ${formatSize(size)}`;
    return output;
  },
});

// RTK: wget_cmd.rs::run reports the downloaded file's size from disk metadata.
// tk has no file to stat, so it recovers the byte count from wget's terminal
// "saved [<written>/<total>]" line (written to STDERR), falling back to 0 → "?".
function parseSavedSize(stderr: string, stdout: string): number {
  const combined = `${stderr}\n${stdout}`;
  const match = combined.match(/saved \[(\d+)(?:\/\d+)?\]/);
  if (match) {
    return Number.parseInt(match[1]!, 10);
  }
  return 0;
}
