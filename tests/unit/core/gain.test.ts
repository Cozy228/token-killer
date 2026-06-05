import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";

import { parseGainArgs, runGain } from "../../../src/core/gain.js";
import { recordHistory } from "../../../src/core/history.js";
import type { FilteredResult, RawResult, TkOptions } from "../../../src/types.js";

const previousHome = process.env.TOKEN_KILLER_HOME;

afterEach(() => {
  vi.restoreAllMocks();
  if (previousHome === undefined) delete process.env.TOKEN_KILLER_HOME;
  else process.env.TOKEN_KILLER_HOME = previousHome;
});

function options(cwd: string): TkOptions {
  return {
    raw: false,
    stats: false,
    verbose: false,
    maxLines: 120,
    maxChars: 12000,
    saveRaw: false,
    cwd,
    reportFormat: "text",
  };
}

function rawResult(): RawResult {
  return { command: "git status", stdout: "x".repeat(400), stderr: "", exitCode: 0, durationMs: 5 };
}

function filtered(saved: number): FilteredResult {
  return {
    handler: "git-status",
    output: "y",
    rawChars: 400,
    outputChars: 100,
    rawTokens: 100,
    outputTokens: 100 - saved,
    savedTokens: saved,
    savingsPct: saved,
    exitCode: 0,
    qualityStatus: "passed",
  };
}

async function withHome<T>(fn: (home: string) => Promise<T>): Promise<T> {
  const home = await mkdtemp(path.join(tmpdir(), "tk-gain-"));
  process.env.TOKEN_KILLER_HOME = home;
  try {
    return await fn(home);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
}

function captureStdout(): { text: () => string } {
  let buffer = "";
  vi.spyOn(process.stdout, "write").mockImplementation((chunk: string | Uint8Array) => {
    buffer += typeof chunk === "string" ? chunk : chunk.toString();
    return true;
  });
  return { text: () => buffer };
}

describe("parseGainArgs", () => {
  test("flags and aliases", () => {
    expect(parseGainArgs(["--user", "--graph"]).user).toBe(true);
    expect(parseGainArgs(["--json"]).format).toBe("json");
    expect(parseGainArgs(["--csv"]).format).toBe("csv");
    expect(parseGainArgs(["--weekly"]).bucketing).toBe("weekly");
    expect(parseGainArgs(["--history"]).history).toBe(10);
    expect(parseGainArgs(["--history", "3"]).history).toBe(3);
    expect(parseGainArgs(["-t", "opus"]).quotaModel).toBe("opus");
    expect(parseGainArgs(["-t", "opus"]).quota).toBe(true);
    expect(parseGainArgs(["--bogus"]).error).toMatch(/unknown flag/);
  });
});

describe("runGain --json (ledger ① only)", () => {
  test("emits the measured object with no cross-ledger total", async () => {
    await withHome(async () => {
      const cwd = path.join(process.env.TOKEN_KILLER_HOME!, "workspace");
      await recordHistory(rawResult(), filtered(75), options(cwd));

      const cap = captureStdout();
      const code = await runGain(["--json"], cwd);
      expect(code).toBe(0);

      const json = JSON.parse(cap.text());
      expect(json.estimate_kind).toBe("measured");
      expect(json.saved_tokens).toBe(75);
      expect(json.commands).toBe(1);
      // no cross-ledger total / no estimate keys unless --quota
      expect(json).not.toHaveProperty("total");
      expect(json).not.toHaveProperty("estimated_savings_usd");
    });
  });

  test("--quota adds a heuristic sibling, never inside the measured object", async () => {
    await withHome(async () => {
      const cwd = path.join(process.env.TOKEN_KILLER_HOME!, "workspace");
      await recordHistory(rawResult(), filtered(75), options(cwd));

      const cap = captureStdout();
      await runGain(["--json", "--quota"], cwd);

      const json = JSON.parse(cap.text());
      expect(json.estimated_savings_usd.estimate_kind).toBe("heuristic");
      expect(json.estimated_savings_usd).toHaveProperty("value_usd");
      // the measured object must stay clean
      expect(json.estimate_kind).toBe("measured");
      expect(json).not.toHaveProperty("saved_tokens_usd");
    });
  });
});

describe("runGain --user", () => {
  test("aggregates across project fingerprints", async () => {
    await withHome(async (home) => {
      await recordHistory(rawResult(), filtered(50), options(path.join(home, "proj-a")));
      await recordHistory(rawResult(), filtered(30), options(path.join(home, "proj-b")));

      const cap = captureStdout();
      await runGain(["--user", "--json"], path.join(home, "proj-a"));

      const json = JSON.parse(cap.text());
      expect(json.commands).toBe(2);
      expect(json.saved_tokens).toBe(80);
    });
  });

  test("text output lists per-project labels (basename from meta.json)", async () => {
    await withHome(async (home) => {
      await recordHistory(rawResult(), filtered(50), options(path.join(home, "proj-a")));

      const cap = captureStdout();
      await runGain(["--user"], path.join(home, "proj-a"));

      expect(cap.text()).toContain("By project:");
      expect(cap.text()).toContain("proj-a");
    });
  });
});

describe("runGain fail-open", () => {
  test("empty store yields a zero summary, exit 0", async () => {
    await withHome(async (home) => {
      const cap = captureStdout();
      const code = await runGain([], path.join(home, "empty"));
      expect(code).toBe(0);
      expect(cap.text()).toContain("Commands: 0");
    });
  });
});
