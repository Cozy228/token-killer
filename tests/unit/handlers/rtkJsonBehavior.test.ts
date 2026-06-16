import { describe, expect, test } from "vitest";

import {
  expectRtkParity,
  filterRtkFixture,
  filterRtkOutput,
} from "../../helpers/rtkCommandHarness.js";

// RTK oracle: rtk/src/cmds/system/json_cmd.rs.
// `rtk json <file>` (no --schema/--keys-only) runs filter_json_compact ->
// compact_json(value, 0, max_depth). These tests assert that the tk `json`
// handler reproduces RTK's compaction across several independent dimensions:
//   1. object key rendering (sorted keys, "key: value", nested objects indented)
//   2. long-string truncation (compact_json String arm, s.len() > 80)
//   3. array compaction (small inline; > 5 collapses to "[first, ... +N more]")
//   4. depth bounding (depth > max_depth -> "...")
//   5. UTF-8 char-boundary safe truncation (floor_char_boundary, no mid-codepoint cut)
describe("RTK json behavior", () => {
  // RTK: compact_json Object + Array(all_simple) + String(>80) arms.
  test("compacts object keys, nested objects, arrays, and long values", async () => {
    const result = await filterRtkFixture(
      ["json", "package.json"],
      "tests/fixtures/system/json_package_response.json",
    );

    // Keys are sorted (keys.sort()) and simple values render inline as "key: value".
    expect(result.output).toContain('name: "token-killer"');
    expect(result.output).toContain('version: "0.1.0"');
    expect(result.output).toContain("private: true");

    // Nested object: non-simple value emits "key:" then the indented object body.
    expect(result.output).toContain("dependencies:");
    expect(result.output).toContain('strip-ansi: "^7.2.0"');
    expect(result.output).toContain("scripts:");
    expect(result.output).toContain('test: "vitest run"');

    // ADR 0001 divergence: within budget tg keeps every array entry inline and
    // never folds to RTK's lossy "[first, ... +N more]" — the full files array
    // is rendered verbatim.
    expect(result.output).toContain(
      '["dist", "README.md", "LICENSE", "CHANGELOG.md", "docs", "src", "types", "bin"]',
    );

    // ADR 0001 divergence: long string values are kept in full (no RTK 77-char
    // truncation), so the whole 360-char "a" run survives.
    expect(result.output).toContain(`description: "${"a".repeat(360)}"`);

    expectRtkParity(result, {
      // Exact full-document compaction, anchored to tg's lossless compact_json:
      //   - sorted keys: dependencies, description, files, name, private, scripts, version
      //   - nested objects emitted on their own indented block
      //   - files array kept inline in full; description kept in full (no truncation)
      exact: [
        "{",
        "  dependencies:",
        "  {",
        '    strip-ansi: "^7.2.0"',
        "  }",
        `  description: "${"a".repeat(360)}"`,
        "  files:",
        '  ["dist", "README.md", "LICENSE", "CHANGELOG.md", "docs", "src", "types", "bin"]',
        '  name: "token-killer"',
        "  private: true",
        "  scripts:",
        "  {",
        '    test: "vitest run"',
        '    typecheck: "tsc --noEmit"',
        "  }",
        '  version: "0.1.0"',
        "}",
      ].join("\n"),
      critical: [
        'name: "token-killer"',
        "dependencies:",
        'strip-ansi: "^7.2.0"',
        '["dist", "README.md", "LICENSE", "CHANGELOG.md", "docs", "src", "types", "bin"]',
      ],
      forbidden: [
        // raw JSON key form ("description": "aaaa...) must be gone post-compaction.
        /"description": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/,
        // ADR 0001 forbids RTK-style fake omission markers.
        /\+\d+ more/,
        /\.\.\./,
      ],
    });
  });

  // ADR 0001 divergence: within budget tg keeps long string values in full
  // instead of RTK's 77-char + "..." truncation; nothing is dropped.
  test("keeps long string values in full without truncation", async () => {
    const payload = "b".repeat(200);
    const result = await filterRtkOutput(["json", "data.json"], `{"key": "${payload}"}`);

    expect(result.output).toContain("key:");
    // The full 200-char run survives verbatim.
    expect(result.output).toContain(`"${"b".repeat(200)}"`);
    // No RTK truncation marker.
    expect(result.output).not.toContain("...");

    expectRtkParity(result, {
      critical: ["key:", `"${"b".repeat(200)}"`],
      forbidden: [/\.\.\./, /\+\d+ more/],
    });
  });

  // ADR 0001 divergence: within budget tg keeps multibyte string values in full
  // (no RTK truncation), so the question of a mid-codepoint cut never arises —
  // the entire run is preserved intact and undamaged.
  test("keeps multibyte string values in full without splitting a codepoint", async () => {
    const payload = "日本語テスト".repeat(85);
    const result = await filterRtkOutput(["json", "data.json"], `{"key": "${payload}"}`);

    expect(result.output).toContain("key:");
    // Full multibyte run survives verbatim, intact.
    expect(result.output).toContain(`"${payload}"`);
    // No truncation marker, and no replacement char / lone surrogate from a bad cut.
    expect(result.output).not.toContain("...");
    expect(result.output).not.toContain("�");

    expectRtkParity(result, {
      critical: ["key:", payload],
      forbidden: [/\.\.\./, /\+\d+ more/, /�/],
    });
  });

  // ADR 0001 divergence: within budget tg inlines every array entry instead of
  // RTK's "[first, ... +N more]" collapse — all eight numbers are kept.
  test("keeps arrays longer than five entries inline in full", async () => {
    const result = await filterRtkOutput(
      ["json", "data.json"],
      JSON.stringify({ nums: [10, 20, 30, 40, 50, 60, 70, 80] }),
    );

    // Every element kept inline; nothing summarized away.
    expect(result.output).toContain("[10, 20, 30, 40, 50, 60, 70, 80]");
    // The trailing element that RTK would drop is still present.
    expect(result.output).toContain("80");

    expectRtkParity(result, {
      critical: ["nums:", "[10, 20, 30, 40, 50, 60, 70, 80]"],
      forbidden: [/\+\d+ more/, /\.\.\./],
    });
  });

  // Regression guard: compact (non-pretty) nested JSON — exactly what arrives from
  // an API/tool — must still emit RTK's indented compact view and NOT be bounced
  // back to raw by the makeFilteredResult inflation gate. RTK always emits compact_json
  // regardless of size, so `json` is in base.ts STRUCTURAL_HANDLERS; without that the
  // indented form (which can equal/exceed the minified bytes) reverts to raw passthrough
  // (caught here by the harness assertNotUnfilteredPassthrough).
  test("keeps the compact view on minified nested JSON without reverting to raw", async () => {
    const result = await filterRtkOutput(
      ["json", "config.json"],
      JSON.stringify({
        config: { db: { host: "localhost", port: 5432 }, cache: { ttl: 60 } },
        name: "svc",
      }),
    );

    // RTK compact form strips the JSON quoting/braces noise: "key: value" not "\"key\":value".
    expect(result.output).toContain('host: "localhost"');
    expect(result.output).toContain("port: 5432");
    expect(result.output).not.toContain('"host":"localhost"');

    expectRtkParity(result, {
      critical: ['host: "localhost"', "port: 5432", 'name: "svc"'],
    });
  });

  // ADR 0001 divergence: within budget tg renders every nesting level in full
  // instead of RTK's max_depth "..." guard — deeply buried leaves are kept, not
  // elided.
  test("renders every nesting level in full past RTK's max depth", async () => {
    const buried = Object.fromEntries(
      Array.from({ length: 30 }, (_, i) => [`leaf-key-${i}`, `deep-leaf-value-${i}`]),
    );
    const deep = { a: { b: { c: { d: { e: { f: { g: buried } } } } } } };
    const result = await filterRtkOutput(["json", "data.json"], JSON.stringify(deep));

    // Every buried leaf value beyond RTK's max_depth is still present.
    expect(result.output).toMatch(/deep-leaf-value-0/);
    expect(result.output).toMatch(/deep-leaf-value-29/);
    // The full nesting chain is rendered with no depth-guard ellipsis.
    expect(result.output).toContain("g:");
    expect(result.output).not.toContain("...");

    expectRtkParity(result, {
      critical: ["a:", "g:", "deep-leaf-value-0", "deep-leaf-value-29"],
      forbidden: [/\.\.\./, /\+\d+ more/],
    });
  });
});

// Regression tests for audit findings.
describe("json audit regressions", () => {
  // M10-json: 64-bit integers must not be corrupted by JSON.parse double precision.
  // The handler returns raw passthrough for payloads with big integers, so we
  // call the handler directly (bypassing the no-passthrough assertion).
  test("M10-json: raw is returned for payloads containing 64-bit integers", async () => {
    const { jsonHandler } = await import("../../../src/handlers/system/json.js");
    // 9007199254740993 = Number.MAX_SAFE_INTEGER + 2 → JSON.parse would yield 9007199254740992.
    const rawJson = '{"id":9007199254740993,"name":"bignum"}';
    const rawResult = {
      command: "json data.json",
      stdout: rawJson,
      stderr: "",
      exitCode: 0,
      durationMs: 1,
    };
    const command = {
      program: "json",
      args: ["data.json"],
      original: ["json", "data.json"],
      displayCommand: "json data.json",
    };
    const options = {
      raw: false,
      stats: false,
      maxLines: 120,
      maxChars: 12000,
      saveRaw: false as const,
      cwd: ".",
    };
    const result = await jsonHandler.filter(rawResult, command, options);

    // The exact big integer must survive; not corrupted.
    expect(result.output).toContain("9007199254740993");
    expect(result.output).not.toContain("9007199254740992");
  });

  // M10-json: strings with embedded newlines must not break line structure.
  test("M10-json: embedded newlines in string values are escaped", async () => {
    const rawJson = JSON.stringify({ msg: "line1\nline2", key: "val" });
    const result = await filterRtkOutput(["json", "data.json"], rawJson);

    // The newline must be escaped in the output, not rendered as a literal newline
    // that would break the compact single-line-per-entry format.
    expect(result.output).toContain("\\n");
    // The content is still present.
    expect(result.output).toContain("msg:");
    expect(result.output).toContain("line1");
    expect(result.output).toContain("line2");
  });
});
