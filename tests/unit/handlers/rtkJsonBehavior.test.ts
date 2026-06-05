import { describe, expect, test } from "vitest";

import { expectRtkParity, filterRtkFixture, filterRtkOutput } from "../../helpers/rtkCommandHarness.js";

// RTK oracle: rtk/src/cmds/system/json_cmd.rs.
// `rtk json <file>` (no --schema/--keys-only) runs filter_json_compact ->
// compact_json(value, 0, max_depth). These tests assert that the tg `json`
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
    expect(result.output).toContain('name: "token-guard"');
    expect(result.output).toContain('version: "0.1.0"');
    expect(result.output).toContain("private: true");

    // Nested object: non-simple value emits "key:" then the indented object body.
    expect(result.output).toContain("dependencies:");
    expect(result.output).toContain('strip-ansi: "^7.2.0"');
    expect(result.output).toContain("scripts:");
    expect(result.output).toContain('test: "vitest run"');

    // Array of > 5 simple strings collapses to "[first, ... +N more]".
    expect(result.output).toContain('["dist", ... +7 more]');

    // The long "description" string is truncated to 77 chars + ellipsis, so the
    // raw 80+ "a" run from the source JSON must not survive.
    expect(result.output).not.toMatch(/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/);

    expectRtkParity(result, {
      // Exact full-document compaction, anchored to RTK's compact_json output:
      //   - sorted keys: dependencies, description, files, name, private, scripts, version
      //   - nested objects emitted on their own indented block
      //   - files array (8 entries) collapsed; description truncated at 77 chars
      exact: [
        "{",
        "  dependencies:",
        "  {",
        '    strip-ansi: "^7.2.0"',
        "  }",
        `  description: "${"a".repeat(77)}..."`,
        "  files:",
        '  ["dist", ... +7 more]',
        "  name: \"token-guard\"",
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
        'name: "token-guard"',
        "dependencies:",
        'strip-ansi: "^7.2.0"',
        '["dist", ... +7 more]',
      ],
      forbidden: [
        // raw JSON key form ("description": "aaaa...) must be gone post-compaction.
        /"description": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/,
      ],
      maxOutputChars: 340,
      // RTK json_cmd.rs is a token-saver: the compact form must shrink the raw.
      minSavingsRatio: 0.4,
    });
  });

  // RTK: compact_json String arm — s.len() > 80 keeps floor_char_boundary(77) then "...".
  test("truncates long string values to 77 chars plus ellipsis", async () => {
    const payload = "b".repeat(200);
    const result = await filterRtkOutput(["json", "data.json"], `{"key": "${payload}"}`);

    expect(result.output).toContain("key:");
    // Truncated marker present; the full 200-char run is gone.
    expect(result.output).toContain("...");
    expect(result.output).not.toContain("b".repeat(100));

    // The quoted value keeps exactly 77 "b"s (the RTK invariant from
    // test_compact_truncates_*: the quoted slice is <= 80 bytes).
    expect(result.output).toContain(`"${"b".repeat(77)}..."`);
    const quoted = result.output.split('"')[1] ?? "";
    expect(quoted.length).toBeLessThanOrEqual(80);

    expectRtkParity(result, {
      critical: ["key:", `"${"b".repeat(77)}..."`],
      forbidden: [/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb/],
    });
  });

  // RTK: compact_json String arm with floor_char_boundary on multibyte input
  // (test_compact_truncates_pure_multibyte_string) — never split a codepoint.
  test("truncates multibyte string values without splitting a codepoint", async () => {
    const payload = "日本語テスト".repeat(85);
    const result = await filterRtkOutput(["json", "data.json"], `{"key": "${payload}"}`);

    expect(result.output).toContain("key:");
    expect(result.output).toContain("...");
    // No replacement character / lone surrogate from a bad cut.
    expect(result.output).not.toContain("�");
    // The quoted value stays small (well under the original) — compaction shrank it.
    const quoted = result.output.split('"')[1] ?? "";
    expect(quoted.length).toBeLessThanOrEqual(80);

    expectRtkParity(result, {
      critical: ["key:", "..."],
      minSavingsRatio: 0.6,
    });
  });

  // RTK: compact_json Array arm — arr.len() > 5 collapses to "[first, ... +N more]".
  test("collapses arrays longer than five entries", async () => {
    const result = await filterRtkOutput(
      ["json", "data.json"],
      JSON.stringify({ nums: [10, 20, 30, 40, 50, 60, 70, 80] }),
    );

    // First element kept, remainder summarized as "+N more".
    expect(result.output).toContain("[10, ... +7 more]");
    // Later elements are dropped (not inlined).
    expect(result.output).not.toContain("80");

    expectRtkParity(result, {
      critical: ["nums:", "[10, ... +7 more]"],
      forbidden: [/30, 40/],
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
      JSON.stringify({ config: { db: { host: "localhost", port: 5432 }, cache: { ttl: 60 } }, name: "svc" }),
    );

    // RTK compact form strips the JSON quoting/braces noise: "key: value" not "\"key\":value".
    expect(result.output).toContain('host: "localhost"');
    expect(result.output).toContain("port: 5432");
    expect(result.output).not.toContain('"host":"localhost"');

    expectRtkParity(result, {
      critical: ['host: "localhost"', "port: 5432", 'name: "svc"'],
    });
  });

  // RTK: compact_json depth guard — depth > max_depth returns "...".
  // max_depth = 5, so a deeply nested chain collapses past level 5.
  test("bounds nesting depth with an ellipsis past max depth", async () => {
    // The leaf object lives beyond max_depth (5); compact_json returns "..." for
    // it, eliding the bulky payload it holds. The payload is large enough that
    // the elided compact form is well under the raw minified input.
    const buried = Object.fromEntries(
      Array.from({ length: 30 }, (_, i) => [`leaf-key-${i}`, `deep-leaf-value-${i}`]),
    );
    const deep = { a: { b: { c: { d: { e: { f: { g: buried } } } } } } };
    const result = await filterRtkOutput(["json", "data.json"], JSON.stringify(deep));

    // Every buried leaf value is beyond max_depth and must be elided, not shown.
    expect(result.output).not.toMatch(/deep-leaf-value/);
    expect(result.output).toContain("...");

    expectRtkParity(result, {
      critical: ["a:", "..."],
      forbidden: [/deep-leaf-value/],
      minSavingsRatio: 0.4,
    });
  });
});
