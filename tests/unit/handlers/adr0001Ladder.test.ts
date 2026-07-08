import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { routeCommand } from "../../../src/router.js";
import type { RawResult, TkOptions } from "../../../src/types.js";
import { toParsedCommand } from "../../helpers/fixtureCases.js";

// End-to-end checks for the ADR 0001 over-budget ladder and recovery contract:
// digest (lossless) always ships; replacement (lossy) ships only with a persisted
// snapshot, else fails open to raw; no `+N more` marker ever appears.

let workdir: string;
let prevHome: string | undefined;

beforeEach(() => {
  workdir = mkdtempSync(path.join(tmpdir(), "ctx-adr0001-"));
  // Sandbox the snapshot store under the temp dir (raw snapshots are persisted
  // relative to CONTEXA_HOME), so the recovery-contract assertion can read
  // the snapshot the inline pointer names.
  prevHome = process.env.CONTEXA_HOME;
  process.env.CONTEXA_HOME = workdir;
});

afterEach(() => {
  if (prevHome === undefined) delete process.env.CONTEXA_HOME;
  else process.env.CONTEXA_HOME = prevHome;
  rmSync(workdir, { recursive: true, force: true });
});

function options(overrides: Partial<TkOptions> = {}): TkOptions {
  return {
    raw: false,
    stats: false,
    maxLines: 100000,
    maxChars: 10000000,
    saveRaw: false,
    cwd: workdir,
    ...overrides,
  };
}

function raw(command: string[], stdout: string, exitCode = 0): RawResult {
  return { command: command.join(" "), stdout, stderr: "", exitCode, durationMs: 1 };
}

async function run(command: string[], stdout: string, opts: TkOptions, exitCode = 0) {
  const parsed = toParsedCommand(command);
  const handler = routeCommand(parsed);
  return handler.filter(raw(command, stdout, exitCode), parsed, opts);
}

// Mirrors src/handlers/base.ts OMISSION_MARKERS — any of these in shipped output
// means a banned fake-complete marker leaked.
const NO_OVERFLOW_MARKER =
  /\+\s*\d+\s+more\b|\[\d+ more lines\]|\(more changes truncated\)|\[\+?\d+\s+\w+\s+omitted\]/;

describe("ADR 0001 over-budget ladder", () => {
  test("ruff over budget keeps EVERY location via a lossless digest (no +N more)", async () => {
    // 120 violations across distinct files — well over the ~2000-token budget once
    // messages are included, so the ladder drops to the location digest.
    const diagnostics = Array.from({ length: 120 }, (_, i) => ({
      filename: `/repo/src/module_${i}/feature_${i}.py`,
      code: "F401",
      location: { row: i + 1, column: 7 },
      message: `\`dependency_${i}\` imported but unused and should be removed from the file`,
    }));
    const result = await run(["ruff", "check", "."], JSON.stringify(diagnostics), options());

    // Every location survives; the digest dropped only the message text.
    for (let i = 0; i < 120; i += 1) {
      expect(result.output).toContain(`src/module_${i}/feature_${i}.py:${i + 1}:7`);
    }
    expect(result.output).not.toMatch(NO_OVERFLOW_MARKER);
    expect(result.omission?.kind).toBe("digest");
    expect(result.qualityStatus).toBe("passed");
  });

  test("ruff under budget lists full messages and declares no omission", async () => {
    const diagnostics = [
      {
        filename: "/repo/src/a.py",
        code: "F401",
        location: { row: 1, column: 1 },
        message: "unused import",
      },
      {
        filename: "/repo/src/b.py",
        code: "E501",
        location: { row: 9, column: 1 },
        message: "line too long",
      },
    ];
    const result = await run(["ruff", "check", "."], JSON.stringify(diagnostics), options());
    expect(result.output).toContain("unused import");
    expect(result.output).toContain("line too long");
    expect(result.omission).toBeUndefined();
  });

  test("json over budget with persistence ships a replacement + snapshot pointer", async () => {
    const big = Array.from({ length: 4000 }, (_, i) => ({ id: i, name: `item-${i}` }));
    const result = await run(
      ["json", "data.json"],
      JSON.stringify(big),
      options({ saveRaw: "auto" }),
    );

    expect(result.omission?.kind).toBe("replacement");
    expect(result.output).toContain("JSON array: 4000 items (over budget)");
    expect(result.output).toMatch(/\[full output: .+\]/);
    expect(result.omission?.rawPointer).toBeTruthy();
    expect(result.output).not.toMatch(NO_OVERFLOW_MARKER);

    // The recovery contract: the snapshot the pointer names holds the full payload.
    expect(result.rawOutputPath).toBeTruthy();
    const snapshot = readFileSync(path.join(workdir, result.rawOutputPath!), "utf8");
    expect(snapshot).toContain('"name":"item-3999"');
  });

  test("json over budget WITHOUT persistence fails open to raw (no recovery-less summary)", async () => {
    const big = Array.from({ length: 4000 }, (_, i) => ({ id: i, name: `item-${i}` }));
    const stdout = JSON.stringify(big);
    const result = await run(["json", "data.json"], stdout, options({ saveRaw: false }));

    // No snapshot ⇒ the lossy replacement would be a fake-complete, so we fail open
    // to the full raw payload instead. Nothing is hidden.
    expect(result.output).toContain('"name":"item-3999"');
    expect(result.output).not.toContain("over budget");
    expect(result.omission).toBeUndefined();
    expect(result.qualityStatus).toBe("inflated");
  });

  test("env over budget WITHOUT a snapshot ships the masked FULL (lossless), never the recovery-less count or raw secrets", async () => {
    // Many categorised (cloud) vars push env past budget; one is a secret.
    const lines = Array.from({ length: 600 }, (_, i) => `AWS_CONFIG_${i}=config-value-number-${i}`);
    lines.push("AWS_SECRET_ACCESS_KEY=SUPERSECRETVALUE_DO_NOT_LEAK_12345");
    const stdout = `${lines.join("\n")}\n`;

    const result = await run(["env"], stdout, options({ saveRaw: false }));

    // Masking handler: it must NOT fail open to raw (that would re-expose the
    // secret), AND must NOT ship a recovery-less lossy count when no snapshot
    // exists. The fix: fall back to the masked FULL listing — every var present,
    // secret masked, zero loss, no `over budget` count, no omission marker.
    expect(result.output).not.toContain("SUPERSECRETVALUE_DO_NOT_LEAK_12345");
    expect(result.output).toContain("AWS_CONFIG_0=config-value-number-0");
    expect(result.output).toContain("AWS_CONFIG_599=config-value-number-599");
    expect(result.output).not.toContain("over budget");
    expect(result.omission).toBeUndefined();
    expect(result.output).not.toMatch(NO_OVERFLOW_MARKER);
  });

  test("env over budget WITH persistence ships the masked count + snapshot pointer", async () => {
    const lines = Array.from({ length: 600 }, (_, i) => `AWS_CONFIG_${i}=config-value-number-${i}`);
    lines.push("AWS_SECRET_ACCESS_KEY=SUPERSECRETVALUE_DO_NOT_LEAK_12345");
    const stdout = `${lines.join("\n")}\n`;

    const result = await run(["env"], stdout, options({ saveRaw: "auto" }));

    // Snapshot exists ⇒ the lossy count is honest (recoverable). Secret never in
    // the snapshot pointer path nor the visible output.
    expect(result.output).not.toContain("SUPERSECRETVALUE_DO_NOT_LEAK_12345");
    expect(result.output).toContain("over budget");
    expect(result.omission?.kind).toBe("replacement");
    expect(result.omission?.rawPointer).toBeTruthy();
    expect(result.output).not.toMatch(NO_OVERFLOW_MARKER);

    // H21: the persisted snapshot the pointer names must hold the MASKED full — never
    // the raw secret. (Before the fix it stored unmasked raw and the marker handed the
    // agent the pointer.) Every var is present; the secret value is not.
    const snapshot = readFileSync(path.join(workdir, result.rawOutputPath!), "utf8");
    expect(snapshot).not.toContain("SUPERSECRETVALUE_DO_NOT_LEAK_12345");
    expect(snapshot).toContain("AWS_CONFIG_599=config-value-number-599");
  });

  test("env under budget masks the secret value but keeps every var", async () => {
    const stdout = [
      "AWS_REGION=us-east-1",
      "AWS_SECRET_ACCESS_KEY=SUPERSECRETVALUE_DO_NOT_LEAK_12345",
      "",
    ].join("\n");
    const result = await run(["env"], stdout, options());
    expect(result.output).toContain("AWS_REGION=us-east-1");
    expect(result.output).not.toContain("SUPERSECRETVALUE_DO_NOT_LEAK_12345");
    expect(result.omission).toBeUndefined();
  });

  test("psql over budget replaces rows with a count + snapshot holding every row", async () => {
    const header = " id | name";
    const sep = "----+------";
    const rows = Array.from({ length: 3000 }, (_, i) => ` ${i} | user_with_a_longish_name_${i}`);
    const stdout = [header, sep, ...rows, "(3000 rows)", ""].join("\n");

    const result = await run(
      ["psql", "-c", "select * from users"],
      stdout,
      options({ saveRaw: "auto" }),
    );

    expect(result.omission?.kind).toBe("replacement");
    expect(result.output).toContain("3000 rows (over budget)");
    expect(result.output).toMatch(/\[full output: .+\]/);
    expect(result.output).not.toMatch(NO_OVERFLOW_MARKER);
    const snapshot = readFileSync(path.join(workdir, result.rawOutputPath!), "utf8");
    expect(snapshot).toContain("user_with_a_longish_name_2999");
  });
});
