import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";

import { projectFingerprint, projectMetaFileForFingerprint } from "../../../src/core/dataDir.js";
import { parseGainArgs, runGain } from "../../../src/core/gain.js";
import { recordHistory, readProjectMeta } from "../../../src/core/history.js";
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
    maxLines: 120,
    maxChars: 12000,
    saveRaw: false,
    cwd,
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
    expect(parseGainArgs(["--json"]).output).toBe("json");
    expect(parseGainArgs(["--csv"]).output).toBe("csv");
    expect(parseGainArgs(["--text"]).output).toBe("text");
    expect(parseGainArgs([]).output).toBe("html");
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
      expect(json).not.toHaveProperty("estimated_savings");
    });
  });

  test("--quota adds a heuristic sibling, never inside the measured object", async () => {
    await withHome(async () => {
      const cwd = path.join(process.env.TOKEN_KILLER_HOME!, "workspace");
      await recordHistory(rawResult(), filtered(75), options(cwd));

      const cap = captureStdout();
      await runGain(["--json", "--quota"], cwd);

      const json = JSON.parse(cap.text());
      expect(json.estimated_savings.estimate_kind).toBe("heuristic");
      expect(json.estimated_savings).toHaveProperty("value_usd");
      // AI Credits is the headline value unit (1 credit = $0.01); USD retained.
      expect(json.estimated_savings.value_ai_credits).toBeCloseTo(
        json.estimated_savings.value_usd * 100,
        6,
      );
      // GPT-5.5 cross-reference rides alongside the Claude default.
      expect(json.estimated_savings.cross_reference.model).toBe("gpt-5.5");
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
      await runGain(["--user", "--text"], path.join(home, "proj-a"));

      expect(cap.text()).toContain("By project:");
      expect(cap.text()).toContain("proj-a");
    });
  });

  test("self-heals a missing label on the next record (no bare-hash fallback)", async () => {
    await withHome(async (home) => {
      const cwd = path.join(home, "proj-heal");
      await recordHistory(rawResult(), filtered(50), options(cwd));

      // Simulate legacy data whose meta.json was never written (showed as a hash).
      const fingerprint = projectFingerprint(cwd);
      await rm(projectMetaFileForFingerprint(fingerprint), { force: true });
      expect(await readProjectMeta(fingerprint)).toBeUndefined();

      await recordHistory(rawResult(), filtered(50), options(cwd));
      expect((await readProjectMeta(fingerprint))?.label).toBe("proj-heal");
    });
  });

  test("self-heals a stale label written by an older cwd", async () => {
    await withHome(async (home) => {
      const cwd = path.join(home, "proj-stale");
      await recordHistory(rawResult(), filtered(50), options(cwd));

      // Simulate a label frozen from a subdir/worktree under the old write-once rule.
      const fingerprint = projectFingerprint(cwd);
      await writeFile(projectMetaFileForFingerprint(fingerprint), JSON.stringify({ label: "src" }));

      await recordHistory(rawResult(), filtered(50), options(cwd));
      expect((await readProjectMeta(fingerprint))?.label).toBe("proj-stale");
    });
  });
});

describe("runGain --csv --daily window", () => {
  test("buckets the last 30 days around `now`, never the 1970 epoch", async () => {
    await withHome(async (home) => {
      // recordHistory stamps real `now`; use the real clock so the row lands in range.
      await recordHistory(rawResult(), filtered(50), options(path.join(home, "proj")));

      const cap = captureStdout();
      await runGain(["--csv", "--daily"], path.join(home, "proj"));

      const text = cap.text();
      expect(text).not.toContain("1969");
      expect(text).not.toContain("1970");
      const lines = text.trim().split("\n");
      expect(lines[0]).toBe("key,commands,raw_tokens,saved_tokens,savings_pct");
      expect(lines).toHaveLength(31); // header + 30 daily buckets
      // the recorded row's saved tokens show up on its (today's) bucket line
      expect(text).toContain(",50,");
    });
  });
});

describe("runGain fail-open", () => {
  test("empty store yields a zero summary, exit 0", async () => {
    await withHome(async (home) => {
      const cap = captureStdout();
      const code = await runGain(["--text"], path.join(home, "empty"));
      expect(code).toBe(0);
      expect(cap.text()).toContain("Total commands:   0");
    });
  });
});
