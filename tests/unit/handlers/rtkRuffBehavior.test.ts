import { describe, expect, test } from "vitest";

import { buildRuffArgs } from "../../../src/handlers/python/ruff.js";
import { expectRtkParity, filterRtkOutput } from "../../helpers/rtkCommandHarness.js";

describe("RTK ruff behavior", () => {
  // RTK: ruff_cmd.rs::run — check-mode invocations are forced to emit JSON so the
  // filter can summarize them; `format`/`version` and explicit formats pass through.
  describe("buildRuffArgs command construction", () => {
    test("forces check --output-format=json and keeps the target", () => {
      expect(buildRuffArgs(["check", "src/handlers/index.ts"])).toEqual([
        "check",
        "--output-format=json",
        "src/handlers/index.ts",
      ]);
    });

    test("treats a bare invocation as check against '.'", () => {
      expect(buildRuffArgs([])).toEqual(["check", "--output-format=json", "."]);
    });

    test("does not force JSON for format or version", () => {
      expect(buildRuffArgs(["format", "--check"])).toEqual(["format", "--check"]);
      expect(buildRuffArgs(["version"])).toEqual(["version"]);
    });

    test("respects a user-supplied output format", () => {
      expect(buildRuffArgs(["check", "--output-format=github", "."])).toEqual([
        "check",
        "--output-format=github",
        ".",
      ]);
    });
  });

  // ADR 0001 (intentional divergence from RTK's MAX_VIOLATIONS cap): ruff
  // diagnostics are location-class and are NEVER capped. A noisy run over the token
  // budget drops the message text (step-1 lossless digest) but keeps EVERY
  // file:line:col, and declares the omission instead of emitting a `+N more`.
  test("keeps every location over budget via a lossless digest (no +N more)", async () => {
    const diagnostics = Array.from({ length: 200 }, (_, i) => ({
      filename: `/Users/dev/project/src/feature_${i}.py`,
      code: "F401",
      location: { row: i + 1, column: 4 },
      message: `\`module_${i}\` imported but unused`,
      fix: null,
    }));
    const result = await filterRtkOutput(["ruff", "check", "."], JSON.stringify(diagnostics), 1);

    // Every one of the 200 locations survives — none suppressed, no overflow marker.
    const listed = result.output.split("\n").filter((l) => l.startsWith("- src/")).length;
    expect(listed).toBe(200);
    expect(result.output).not.toMatch(/\+\s*\d+\s+more/);
    expect(result.output).toContain("200 issues");
    expect(result.output).toMatch(/F401: 200/);
    expect(result.output).toMatch(/- src\/feature_\d+\.py:\d+:4/);
    // Over budget → the digest dropped the message text, so the report is far
    // smaller than the raw JSON it summarizes while keeping every location.
    expect(result.output.length).toBeLessThan(JSON.stringify(diagnostics).length / 3);
  });

  // H11-ruff regression: non-check subcommands must pass through unchanged —
  // they must NOT be rewritten to `ruff check --output-format=json <subcommand>`.
  test("passes through ruff rule F401 unchanged", () => {
    expect(buildRuffArgs(["rule", "F401"])).toEqual(["rule", "F401"]);
  });

  test("passes through ruff linter unchanged", () => {
    expect(buildRuffArgs(["linter"])).toEqual(["linter"]);
  });

  test("passes through ruff config unchanged", () => {
    expect(buildRuffArgs(["config"])).toEqual(["config"]);
  });

  test("passes through ruff clean unchanged", () => {
    expect(buildRuffArgs(["clean"])).toEqual(["clean"]);
  });

  test("passes through ruff analyze unchanged", () => {
    expect(buildRuffArgs(["analyze", "graph"])).toEqual(["analyze", "graph"]);
  });

  test("passes through ruff check --statistics unchanged (incompatible flag)", () => {
    expect(buildRuffArgs(["check", "--statistics"])).toEqual(["check", "--statistics"]);
  });

  test("passes through ruff check --diff unchanged (incompatible flag)", () => {
    expect(buildRuffArgs(["check", "--diff", "."])).toEqual(["check", "--diff", "."]);
  });

  test("passes through ruff check --watch unchanged (incompatible flag)", () => {
    expect(buildRuffArgs(["check", "--watch"])).toEqual(["check", "--watch"]);
  });

  test("still rewrites ruff check (bare subcommand) with JSON output", () => {
    expect(buildRuffArgs(["check", "."])).toEqual(["check", "--output-format=json", "."]);
  });

  test("still rewrites bare ruff (no subcommand) to check with JSON output", () => {
    expect(buildRuffArgs([])).toEqual(["check", "--output-format=json", "."]);
  });

  test("treats a path argument as a check target and rewrites", () => {
    expect(buildRuffArgs(["src/"])).toEqual(["check", "--output-format=json", "src/"]);
  });

  test("summarizes JSON violations with file, rule, fixable count", async () => {
    const result = await filterRtkOutput(
      ["ruff", "check", "."],
      JSON.stringify([
        {
          filename: "/repo/main.py",
          code: "F401",
          location: { row: 1, column: 8 },
          message: "unused import",
          fix: { applicability: "safe" },
        },
        {
          filename: "/repo/utils.py",
          code: "E501",
          location: { row: 2, column: 1 },
          message: "line too long",
        },
      ]),
      1,
    );

    expect(result.output).toContain("2 issues");
    expect(result.output).toContain("1 fixable");
    expect(result.output).toContain("F401");
    expect(result.output).toContain("main.py");
    expect(result.output).not.toMatch(/"filename"/);

    expectRtkParity(result, {
      critical: ["2 issues", "1 fixable", "F401", "main.py"],
      forbidden: [/"filename"/],
      maxOutputChars: 220,
    });
  });
});
