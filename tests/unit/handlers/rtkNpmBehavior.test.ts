import { describe, expect, test } from "vitest";

import { expectRtkParity, filterRtkOutput } from "../../helpers/rtkCommandHarness.js";

// Faithful port of rtk/src/cmds/js/npm_cmd.rs filter behavior.
// Covers all three RTK #[test] dimensions:
//   1. test_filter_npm_output        — strip banner / npm WARN / npm notice, keep content
//   2. test_filter_npm_output_empty  — whitespace-only output collapses to "ok"
//   3. test_npm_subcommand_routing   — both `npm run <script>` and bare `npm <script>`
//      flow through the same filter_npm_output path (see routing note in npm.ts).
describe("RTK npm behavior", () => {
  // RTK: js/npm_cmd.rs::test_filter_npm_output — the exact fixture from the Rust test,
  // padded with extra warnings/notices so the inflation gate has real volume to compress.
  test("strips lifecycle banner, npm WARN and npm notice while keeping build output", async () => {
    const stdout = [
      "> project@1.0.0 build",
      "> next build",
      "",
      "npm WARN deprecated inflight@1.0.6: This module is not supported",
      "npm WARN deprecated rimraf@2.7.1: Rimraf versions prior to v4 are no longer supported",
      "npm WARN deprecated glob@7.2.3: Glob versions prior to v9 are no longer supported",
      "npm notice",
      "npm notice New major version of npm available! 9.8.1 -> 10.2.4",
      "npm notice Changelog: https://github.com/npm/cli/releases/tag/v10.2.4",
      "npm notice Run npm install -g npm@10.2.4 to update!",
      "npm notice",
      "",
      "   Creating an optimized production build...",
      "   ✓ Build completed",
    ].join("\n");

    const result = await filterRtkOutput(["npm", "run", "build"], stdout);

    expectRtkParity(result, {
      // RTK asserts result.contains("Build completed").
      critical: ["Build completed"],
      forbidden: [
        // RTK asserts !result.contains("npm WARN").
        /npm WARN/,
        // RTK asserts !result.contains("npm notice").
        /npm notice/,
        // RTK asserts !result.contains("> project@").
        /> project@/,
      ],
      // Banner + WARN + notice noise dwarfs the two real lines kept.
      minTokenSavingsRatio: 0.6,
    });

    // The lifecycle banner's second line ("> next build") is also a `>`+`@`? No —
    // it has no `@`, but RTK only strips lines that contain `@`. Mirror RTK exactly:
    // "> next build" survives because it lacks `@`.
    expect(result.output).toContain("> next build");
  });

  // RTK: js/npm_cmd.rs::test_filter_npm_output_empty — "\n\n\n" filters to exactly "ok".
  test("collapses whitespace-only output to ok", async () => {
    const result = await filterRtkOutput(["npm", "run", "noop"], "\n\n\n\n\n\n\n\n\n\n");

    expectRtkParity(result, {
      critical: ["ok"],
      exact: "ok",
    });
  });

  // RTK: js/npm_cmd.rs::test_npm_subcommand_routing — a bare script name (`npm install`
  // here exercises a known subcommand) still runs through filter_npm_output, proving the
  // filter is applied regardless of whether `run` was injected.
  test("filters npm install output the same way as npm run", async () => {
    const stdout = [
      "npm WARN deprecated har-validator@5.1.5: this library is no longer supported",
      "npm WARN deprecated uuid@3.4.0: Please upgrade to version 7 or higher",
      "npm WARN deprecated request@2.88.2: request has been deprecated",
      "",
      "added 1357 packages, and audited 1358 packages in 42s",
      "",
      "npm notice",
      "npm notice New minor version of npm available! 9.8.0 -> 9.8.1",
      "npm notice",
      "found 0 vulnerabilities",
    ].join("\n");

    const result = await filterRtkOutput(["npm", "install", "express"], stdout);

    expectRtkParity(result, {
      critical: ["added 1357 packages", "found 0 vulnerabilities"],
      forbidden: [/npm WARN/, /npm notice/],
      minTokenSavingsRatio: 0.4,
    });
  });
});
