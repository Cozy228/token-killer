import { describe, expect, test } from "vitest";

import {
  expectRtkParity,
  filterRtkFixture,
  filterRtkOutput,
} from "../../helpers/rtkCommandHarness.js";

// RTK oracle: rtk/src/cmds/system/log_cmd.rs::analyze_logs and its #[test]s.
// `rtk log` (program === "log") deduplicates structurally-identical log lines into
// a "Log Summary" with error/warn/info counts, then lists unique errors/warnings
// sorted by frequency with "[×N]" repeat markers. Normalization strips timestamps
// and collapses /-rooted paths (PATH_RE), UUIDs, 0x hex, and 4+ digit runs so
// repeated events fold together; the *displayed* line is the original (untouched)
// first occurrence.
describe("RTK log behavior", () => {
  // RTK: log_cmd.rs::test_analyze_logs — three identical ERROR lines (differing
  // only by timestamp + path) collapse to a single "[×3]" entry under [ERRORS].
  // Fixture tests/fixtures/system/app_repeated.log is built to mirror RTK's own
  // test input shape (space-form timestamps fully stripped, /paths -> <PATH>).
  test("collapses repeated normalized errors and warnings into [×N] groups", async () => {
    const result = await filterRtkFixture(
      ["log", "app.log"],
      "tests/fixtures/system/app_repeated.log",
    );

    expectRtkParity(result, {
      critical: [
        "Log Summary",
        // 3 repeated "Connection failed" + 1 "Disk write" => 4 total, 2 unique.
        "   [error] 4 errors (2 unique)",
        // 2 repeated "Retrying" + 1 "Cache miss" => 3 total, 2 unique.
        "   [warn] 3 warnings (2 unique)",
        // "Connected" (x2, same path) + "Request served" => 3 info messages.
        "   [info] 3 info messages",
        "[ERRORS]",
        "[WARNINGS]",
        // Repeat-collapse markers: errors x3, warnings x2.
        "[×3]",
        "[×2]",
      ],
      // The displayed line is the original; the repeat group must be reported once,
      // never as three separate raw ERROR lines.
      forbidden: [/10:00:01 ERROR/, /10:00:02 ERROR/],
      // Genuine compression of 10 raw lines into a grouped summary.
      maxOutputChars: 420,
    });
  });

  // RTK: log_cmd.rs::test_analyze_logs — the same input asserts the literal "×3"
  // marker and an "ERRORS" section header exist.
  test("emits the RTK ×N repeat marker and ERRORS section header", async () => {
    const result = await filterRtkFixture(
      ["log", "app.log"],
      "tests/fixtures/system/app_repeated.log",
    );

    expect(result.output).toContain("×3");
    expect(result.output).toContain("ERRORS");
  });

  // RTK: log_cmd.rs::test_analyze_logs_extended_severity_keywords — severity labels
  // above ERROR (CRITICAL/ALERT/EMERG/SEVERE/FATAL/PANIC) bucket as errors, and
  // "notice" buckets as a warning, even though none literally contain "error"/"warn".
  test("buckets critical/alert/emerg/severe as errors and notice as warning", async () => {
    const lines: string[] = [];
    for (let i = 0; i < 5; i += 1) {
      lines.push(`2024-01-01 10:00:0${i} CRITICAL: disk full on /dev/sda1 partition root`);
    }
    lines.push("2024-01-01 10:01:00 ALERT: memory pressure on host nodepool exceeded threshold");
    lines.push("2024-01-01 10:01:01 emerg: system shutdown imminent now please save work");
    lines.push("2024-01-01 10:01:02 SEVERE: data corruption detected in /var/data/store shard");
    for (let i = 0; i < 4; i += 1) {
      lines.push(`2024-01-01 10:02:0${i} notice: config reloaded from /etc/app/config.yml ok`);
    }
    const stdout = `${lines.join("\n")}\n`;

    const result = await filterRtkOutput(["log", "app.log"], stdout);

    expectRtkParity(result, {
      critical: [
        "[ERRORS]",
        "[WARNINGS]",
        // 5 critical + 1 alert + 1 emerg + 1 severe => 8 errors, 4 unique.
        "   [error] 8 errors (4 unique)",
        // 4 notices collapse to a single "[×4]" warning.
        "   [warn] 4 warnings (1 unique)",
        "[×5]",
        "[×4]",
      ],
      // None of these severities literally contain "error"/"warn"; they must still
      // land in the ERRORS/WARNINGS buckets, not be dropped as noise.
      maxOutputChars: 560,
    });
  });

  // RTK: log_cmd.rs::test_analyze_logs_multibyte — very long multi-byte messages
  // must not panic and must truncate on char (scalar) boundaries, not bytes. RTK
  // caps the displayed original at 100 chars (97 chars + "..."). Repeating each
  // event gives genuine compression while still exercising the truncation path.
  test("truncates long multibyte messages on char boundaries without corruption", async () => {
    const errMsg = "ข้อผิดพลาด".repeat(15); // 150 code points
    const warnMsg = "คำเตือน".repeat(15);
    const lines: string[] = [];
    for (let i = 0; i < 4; i += 1) {
      lines.push(`2024-01-01 10:00:0${i} ERROR: ${errMsg} connection failed`);
    }
    for (let i = 0; i < 3; i += 1) {
      lines.push(`2024-01-01 10:01:0${i} WARN: ${warnMsg} retry attempt`);
    }
    const stdout = `${lines.join("\n")}\n`;

    const result = await filterRtkOutput(["log", "app.log"], stdout);

    expectRtkParity(result, {
      critical: [
        "[ERRORS]",
        "[WARNINGS]",
        "   [error] 4 errors (1 unique)",
        "   [warn] 3 warnings (1 unique)",
        "[×4]",
        "[×3]",
        // Truncation marker on the long original message.
        "...",
      ],
    });

    // RTK truncates the whole displayed original line at 100 chars: it keeps the
    // first 97 code points and appends "...". The displayed line includes RTK's
    // "   [×N] " prefix; strip that to recover the 97-char original + "...".
    const errorLine = result.output
      .split("\n")
      .find((line) => line.includes("ERROR:") && line.includes("..."));
    expect(errorLine).toBeDefined();
    const displayed = errorLine!.replace(/^\s*(\[×\d+\]\s*)?/, "");
    expect(displayed.endsWith("...")).toBe(true);
    const kept = displayed.slice(0, displayed.length - 3); // drop "..."
    expect([...kept]).toHaveLength(97);
    // Char-based (not byte-based) truncation: no broken multibyte scalar.
    expect([...kept].every((cp) => cp.length >= 1)).toBe(true);
    // The original 150-codepoint message must not survive in full.
    expect([...errMsg].length).toBe(150);
    expect(result.output).not.toContain(errMsg);
  });
});
