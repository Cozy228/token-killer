import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vitest";

import { wgetHandler } from "../../../src/handlers/cloud/wget.js";
import { expectRtkParity, type RtkParityResult } from "../../helpers/rtkCommandHarness.js";
import type { ParsedCommand, RawResult, TgOptions } from "../../../src/types.js";

// wget is not yet registered in src/handlers/index.ts (registration is a shared
// change reported back to the caller, not made here), so this suite drives the
// faithful wgetHandler directly while still asserting RTK parity via the shared
// expectRtkParity harness. Once registered, routeCommand("wget") resolves to the
// same handler.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

const options: TgOptions = {
  raw: false,
  stats: false,
  verbose: false,
  maxLines: 120,
  maxChars: 12000,
  saveRaw: false,
  cwd: repoRoot,
};

async function runWget(
  commandArgs: string[],
  stderr: string,
  exitCode = 0,
  stdout = "",
): Promise<RtkParityResult> {
  // RTK: wget_cmd.rs::run captures wget output where progress + the "saved"
  // summary land on STDERR; the parser reads stderr first, then stdout.
  const command: ParsedCommand = {
    program: commandArgs[0] ?? "",
    args: commandArgs.slice(1),
    original: commandArgs,
    displayCommand: commandArgs.join(" "),
  };
  const raw: RawResult = {
    command: commandArgs.join(" "),
    stdout,
    stderr,
    exitCode,
    durationMs: 1,
  };
  const result = await wgetHandler.filter(raw, command, options);
  const rawOutput = `${stdout}${stderr}`;
  // Mirror the harness no-passthrough guard: filtered output must differ from raw.
  expect(
    result.output.trim(),
    "wget must not pass RTK behavior tests by returning raw output unchanged",
  ).not.toBe(rawOutput.trim());
  return { ...result, rawOutput };
}

// A realistic wget stderr transcript: resolving / connecting noise, the progress
// bar, and the terminal "saved" summary. RTK strips all of this to one line.
const PROGRESS_STDERR = [
  "--2026-06-04 12:00:00--  https://example.com/file.tar.gz",
  "Resolving example.com (example.com)... 93.184.216.34",
  "Connecting to example.com (example.com)|93.184.216.34|:443... connected.",
  "HTTP request sent, awaiting response... 200 OK",
  "Length: 2097152 (2.0M) [application/gzip]",
  "Saving to: 'file.tar.gz'",
  "",
  "file.tar.gz   0%[                    ]       0  --.-KB/s",
  "file.tar.gz  47%[========>           ] 1,000,000 1.00MB/s  eta 1s",
  "file.tar.gz 100%[===================>] 2,097,152 1.00MB/s    in 2.0s",
  "",
  "2026-06-04 12:00:02 (1.00 MB/s) - 'file.tar.gz' saved [2097152/2097152]",
].join("\n");

describe("RTK wget behavior", () => {
  // RTK #[test] dimensions: compact_url strip + extract_filename "Saving to" +
  // format_size MB + progress stripping (the whole transcript collapses to one
  // "ok | file | size" line).
  test("summarizes downloaded file and strips transfer progress", async () => {
    const result = await runWget(["wget", "https://example.com/file.tar.gz"], PROGRESS_STDERR);

    // RTK: wget_cmd.rs::run success => "{compact_url} ok | {filename} | {size}".
    // compact_url strips https://; filename parsed from "Saving to: 'file.tar.gz'";
    // size recovered from the "saved [2097152/...]" line => 2.0MB.
    expect(result.output).toBe("example.com/file.tar.gz ok | file.tar.gz | 2.0MB");

    expectRtkParity(result, {
      critical: ["example.com/file.tar.gz ok", "file.tar.gz", "2.0MB"],
      forbidden: [/====/, /Resolving/, /Connecting/, /KB\/s/, /https:\/\//],
      exact: "example.com/file.tar.gz ok | file.tar.gz | 2.0MB",
      // Whole multi-line transcript reduced to a single short line.
      minTokenSavingsRatio: 0.7,
    });
  });

  // RTK #[test]: test_extract_filename_from_output_flag — an explicit -O argument
  // overrides any "Saving to" parsing or URL fallback.
  test("honours -O output-document filename over URL", async () => {
    const result = await runWget(
      ["wget", "-O", "myfile.zip", "https://example.com/x"],
      "Saving to: 'x'\n2026-06-04 (1.00 MB/s) - 'x' saved [524288/524288]",
    );
    // -O wins for the filename; size from the saved line => 512KB.
    expect(result.output).toBe("example.com/x ok | myfile.zip | 512.0KB");
    expectRtkParity(result, {
      critical: ["myfile.zip", "example.com/x ok"],
      forbidden: [/Saving to/],
      exact: "example.com/x ok | myfile.zip | 512.0KB",
    });
  });

  // RTK #[test]: test_format_size_zero — when no size is known (no "saved" line,
  // no real file to stat), format_size(0) renders "?".
  test("renders unknown size as ? when no saved summary is present", async () => {
    const result = await runWget(
      ["wget", "https://example.com/file.tar.gz"],
      [
        "--2026-06-04 12:00:00--  https://example.com/file.tar.gz",
        "Resolving example.com (example.com)... 93.184.216.34",
        "Connecting to example.com|93.184.216.34|:443... connected.",
        "HTTP request sent, awaiting response... 200 OK",
        "Saving to: 'file.tar.gz'",
      ].join("\n"),
    );
    expect(result.output).toBe("example.com/file.tar.gz ok | file.tar.gz | ?");
    expectRtkParity(result, {
      critical: ["file.tar.gz", "?"],
      forbidden: [/Resolving/, /Connecting/],
      exact: "example.com/file.tar.gz ok | file.tar.gz | ?",
    });
  });

  // RTK #[test]: test_extract_filename_empty_url_fallback — a URL with no file
  // basename (and no usable stderr) falls back to "index.html".
  test("falls back to index.html for a bare URL with no saving line", async () => {
    const result = await runWget(
      ["wget", "https://example.com/"],
      [
        "--2026-06-04 12:00:00--  https://example.com/",
        "Resolving example.com (example.com)... 93.184.216.34",
        "HTTP request sent, awaiting response... 200 OK",
        "Length: unspecified [text/html]",
      ].join("\n"),
    );
    expect(result.output).toBe("example.com/ ok | index.html | ?");
    expectRtkParity(result, {
      critical: ["index.html"],
      exact: "example.com/ ok | index.html | ?",
    });
  });

  // RTK #[test]: test_compact_url_truncates_long_url — URLs over 50 chars (after
  // stripping the protocol) collapse to "{first 25}...{last 20}".
  test("truncates a long URL with an ellipsis", async () => {
    const longUrl =
      "https://example.com/very/long/path/that/exceeds/fifty/characters/archive.zip";
    const result = await runWget(
      ["wget", longUrl],
      "Saving to: 'archive.zip'\n2026-06-04 (1.00 MB/s) - 'archive.zip' saved [4096/4096]",
    );
    expect(result.output).toMatch(/^example\.com\/very\/long\/pat\.\.\..*archive\.zip ok \| archive\.zip \| 4\.0KB$/);
    expect(result.output).toContain("...");
    expectRtkParity(result, {
      critical: ["archive.zip", "4.0KB"],
    });
  });

  // RTK #[test]: test_parse_error_404 — a 404 in the transcript on a failed
  // download maps to "404 Not Found" behind "{compact_url} FAILED:".
  test("parses 404 failures into a terse FAILED line", async () => {
    const result = await runWget(
      ["wget", "https://example.com/missing.zip"],
      [
        "--2026-06-04 12:00:00--  https://example.com/missing.zip",
        "Resolving example.com (example.com)... 93.184.216.34",
        "Connecting to example.com|93.184.216.34|:443... connected.",
        "HTTP request sent, awaiting response... 404 Not Found",
        "2026-06-04 12:00:00 ERROR 404: Not Found.",
      ].join("\n"),
      8,
    );
    expect(result.output).toBe("example.com/missing.zip FAILED: 404 Not Found");
    expectRtkParity(result, {
      critical: ["FAILED:", "404 Not Found"],
      forbidden: [/Resolving/, /Connecting/],
      exact: "example.com/missing.zip FAILED: 404 Not Found",
    });
  });

  // RTK #[test]: test_parse_error_dns — name-resolution failures collapse to
  // "DNS lookup failed".
  test("parses DNS resolution failures", async () => {
    const result = await runWget(
      ["wget", "https://nope.invalid/file.bin"],
      [
        "--2026-06-04 12:00:00--  https://nope.invalid/file.bin",
        "Resolving nope.invalid (nope.invalid)... failed: Name or service not known.",
        "wget: unable to resolve host address 'nope.invalid'",
      ].join("\n"),
      4,
    );
    expect(result.output).toBe("nope.invalid/file.bin FAILED: DNS lookup failed");
    expectRtkParity(result, {
      critical: ["FAILED:", "DNS lookup failed"],
      exact: "nope.invalid/file.bin FAILED: DNS lookup failed",
    });
  });

  // RTK #[test]: test_parse_error_ssl — certificate / SSL problems collapse to
  // "SSL/TLS error".
  test("parses SSL/TLS failures", async () => {
    const result = await runWget(
      ["wget", "https://self-signed.example/file.bin"],
      [
        "--2026-06-04 12:00:00--  https://self-signed.example/file.bin",
        "ERROR: cannot verify self-signed.example's certificate, issued by ...",
        "To connect to self-signed.example insecurely, use '--no-check-certificate'.",
      ].join("\n"),
      5,
    );
    expect(result.output).toBe("self-signed.example/file.bin FAILED: SSL/TLS error");
    expectRtkParity(result, {
      critical: ["FAILED:", "SSL/TLS error"],
      exact: "self-signed.example/file.bin FAILED: SSL/TLS error",
    });
  });
});
