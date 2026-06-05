import { describe, expect, test } from "vitest";

import { expectRtkParity, filterRtkFixture, filterRtkOutput } from "../../helpers/rtkCommandHarness.js";
import { buildCurlArgs } from "../../../src/handlers/cloud/curl.js";

// RTK: curl_cmd.rs::run command construction — the real CLI path must prepend
// `-s` so the progress meter never pollutes the captured body. The migration
// harness only exercises filter(); these assert the execute() rewrite directly.
describe("RTK curl command construction (buildCurlArgs)", () => {
  test("prepends -s ahead of the user's args", () => {
    expect(buildCurlArgs(["https://example.com"])).toEqual(["-s", "https://example.com"]);
  });
  test("preserves the user's flags and order verbatim after -s", () => {
    expect(buildCurlArgs(["-X", "POST", "-d", "k=v", "https://api.test"])).toEqual([
      "-s",
      "-X",
      "POST",
      "-d",
      "k=v",
      "https://api.test",
    ]);
  });
});

describe("RTK curl behavior", () => {
  // RTK: cloud/curl_cmd.rs::test_filter_curl_large_json_object_passthrough — a
  // top-level JSON body is never truncated (mid-stream cut = invalid JSON, #1536).
  // Retention gate: full body preserved, no "bytes total" marker.
  test("preserves large JSON bodies without truncation", async () => {
    const result = await filterRtkFixture(
      ["curl", "https://example.com/data"],
      "tests/fixtures/cloud/curl_large_json.json",
    );

    expectRtkParity(result, {
      critical: ['"status":"ok"', '"data":"aaaaaaaa'],
      forbidden: [/bytes total/, /\.\.\./],
      exact: result.rawOutput.trim(),
      maxOutputChars: result.rawOutput.trim().length,
    });
  });

  // RTK: cloud/curl_cmd.rs::test_filter_curl_non_json — a short non-JSON body is
  // under MAX_RESPONSE_SIZE, so it passes through unchanged.
  test("passes short non-JSON bodies through unchanged", async () => {
    const body = "Hello, World!\nThis is plain text.";
    const result = await filterRtkOutput(["curl", "https://example.com/x"], body);

    expect(result.output.trim()).toBe(body);
    expect(result.output).not.toMatch(/bytes total/);
  });

  // RTK: cloud/curl_cmd.rs::test_filter_curl_long_output_truncated — a long
  // non-JSON body is cut at MAX_RESPONSE_SIZE bytes with a "... (N bytes total)"
  // marker and a recovery hint. This is the curl compression path.
  test("truncates long non-JSON bodies at 500 bytes with a recovery hint", async () => {
    const body = "x".repeat(1000);
    const result = await filterRtkOutput(["curl", "https://example.com/blob"], body);

    expect(result.output).toMatch(/^x+\.\.\. \(1000 bytes total\)/);
    expect(result.output).toContain("bytes total");
    expect(result.output).toMatch(/tk --raw/);
    // RTK asserts the truncated content is < 600 chars (head 500 + small marker).
    expect(result.output.split("\n")[0]!.length).toBeLessThan(600);

    expectRtkParity(result, {
      critical: ["(1000 bytes total)"],
      // 1000 raw chars collapse to ~520 visible (head + marker); real compression.
      maxOutputChars: 600,
    });
  });

  // RTK: cloud/curl_cmd.rs::test_filter_curl_exact_500_bytes — exactly 500 bytes
  // is NOT < MAX_RESPONSE_SIZE, so it still hits the truncation/marker path.
  test("emits the marker at exactly 500 bytes (boundary is exclusive)", async () => {
    const body = "a".repeat(500);
    const result = await filterRtkOutput(["curl", "https://example.com/exact"], body);

    expect(result.output).toContain("(500 bytes total)");
  });

  // RTK: cloud/curl_cmd.rs::test_filter_curl_multibyte_boundary — 499 ASCII + a
  // 2-byte "é" (501 bytes). The cut must not split the UTF-8 character, so it
  // backs off to byte 499; the marker still reports the true 501-byte total.
  test("never splits a UTF-8 character at the truncation boundary", async () => {
    const body = "a".repeat(499) + "é";
    const result = await filterRtkOutput(["curl", "https://example.com/utf8"], body);

    expect(result.output).toContain("(501 bytes total)");
    // The é (byte 500-501) is dropped wholesale, never a lone continuation byte.
    expect(result.output).not.toContain("�");
    const head = result.output.split("... (")[0]!;
    expect(head).toBe("a".repeat(499));
  });

  // RTK: cloud/curl_cmd.rs::run — on failure curl is NOT filtered. A long non-JSON
  // error body (e.g. an HTML error page) must reach the caller in full; truncating
  // it would destroy diagnostics. The 500-byte cut applies only to successful runs.
  test("does not truncate a long error body on failure", async () => {
    const errorBody = `<html><body>${"x".repeat(1000)} server error</body></html>`;
    const result = await filterRtkOutput(["curl", "https://example.com/boom"], errorBody, 22);

    expect(result.output).toContain("FAILED: curl");
    expect(result.output).toContain("server error");
    expect(result.output).not.toMatch(/bytes total/);
    // Full body preserved (no 500-byte cut on the failure path).
    expect(result.output).toContain("x".repeat(1000));
  });

  // NOTE: the dual-stream failure case (stdout body + stderr diagnostic) is a
  // DELIBERATE tk divergence from RTK — RTK's curl_cmd.rs:35-42 keeps only stderr
  // when it is non-empty, dropping the stdout body. That behavior is asserted in
  // curlProductBehavior.test.ts, NOT here, because this suite must only prove
  // RTK-faithful semantics. See docs/green-test-parity-audit.md (curl divergence).
});
