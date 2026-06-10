import { existsSync, readdirSync } from "node:fs";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { applySessionDedup } from "../../../src/core/sessionDedup.js";
import { dedupStoreFile, rawOutputDir, resolveStoredPath } from "../../../src/core/dataDir.js";
import { estimateTokens } from "../../../src/core/savings.js";
import type {
  CommandHandler,
  FilteredResult,
  ParsedCommand,
  RawResult,
  TkOptions,
  TtlClass,
} from "../../../src/types.js";

const T0 = 1_700_000_000_000;
const ENABLED = { TK_SESSION_DEDUP: "1" } as NodeJS.ProcessEnv;
// A deterministic, >256-byte compressed output (the dedup eligibility floor).
const OUT = `On branch main\n${"  modified:   src/file.ts\n".repeat(15)}`;
const RAWOUT = `RAWMARK ${"abcdefgh ".repeat(60)}`;

let home: string;
let cwd: string;

beforeEach(async () => {
  home = await mkdtemp(path.join(tmpdir(), "tk-dedup-home-"));
  cwd = await mkdtemp(path.join(tmpdir(), "tk-dedup-cwd-"));
  process.env.TOKEN_KILLER_HOME = home;
});

afterEach(async () => {
  delete process.env.TOKEN_KILLER_HOME;
  await rm(home, { recursive: true, force: true });
  await rm(cwd, { recursive: true, force: true });
});

function command(program = "git", args = ["status"]): ParsedCommand {
  return {
    program,
    args,
    original: [program, ...args],
    displayCommand: [program, ...args].join(" "),
  };
}

function handler(ttlClass: TtlClass = "fast"): CommandHandler {
  return {
    name: "git-status",
    traits: { cacheable: true, ttlClass },
    matches: () => true,
    execute: async () => mkRaw(""),
    filter: async () => mkFiltered(""),
  };
}

function mkRaw(stdout: string, exitCode = 0): RawResult {
  return { command: "git status", stdout, stderr: "", exitCode, durationMs: 5 };
}

function mkFiltered(output: string): FilteredResult {
  return {
    handler: "git-status",
    output,
    rawChars: 2000,
    outputChars: output.length,
    rawTokens: 500,
    outputTokens: estimateTokens(output),
    savedTokens: 100,
    savingsPct: 40,
    exitCode: 0,
    qualityStatus: "passed",
  };
}

function mkOptions(over: Partial<TkOptions> = {}): TkOptions {
  return {
    raw: false,
    stats: false,
    verbose: false,
    maxLines: 120,
    maxChars: 12000,
    saveRaw: "auto",
    cwd,
    sessionId: "s1",
    ...over,
  };
}

type Call = Partial<{
  handler: CommandHandler;
  command: ParsedCommand;
  options: TkOptions;
  raw: RawResult;
  filtered: FilteredResult;
  now: number;
  env: NodeJS.ProcessEnv;
}>;

function run(over: Call = {}): Promise<FilteredResult | null> {
  return applySessionDedup({
    handler: over.handler ?? handler(),
    command: over.command ?? command(),
    options: over.options ?? mkOptions(),
    raw: over.raw ?? mkRaw(RAWOUT),
    filtered: over.filtered ?? mkFiltered(OUT),
    now: over.now ?? T0,
    env: over.env ?? ENABLED,
  });
}

describe("applySessionDedup — exact-compare hit (the core proof)", () => {
  test("a byte-identical repeat returns a recoverable marker", async () => {
    expect(await run({ now: T0 })).toBeNull(); // first run establishes
    const hit = await run({ now: T0 + 1000 });
    expect(hit).not.toBeNull();
    expect(hit!.output).toContain("[tk] unchanged since");
    expect(hit!.output).toContain("git status");
    expect(hit!.output).toMatch(/full: \S+/);

    // The recovery pointer resolves to the original full output.
    const ptr = /full: (\S+)/.exec(hit!.output)![1]!;
    const recovered = await readFile(resolveStoredPath(ptr), "utf8");
    expect(recovered).toContain("RAWMARK");
  });

  test("the marker is strictly smaller than the compressed output it replaced", async () => {
    await run({ now: T0 });
    const hit = await run({ now: T0 + 1000 });
    expect(hit!.output.length).toBeLessThan(OUT.length);
  });
});

describe("applySessionDedup — exact-compare forces a re-emit on any change", () => {
  test("a byte difference (state changed) re-emits in full, no stale hit", async () => {
    await run({ now: T0 });
    const changed = await run({
      raw: mkRaw(`${RAWOUT} STATE CHANGED`),
      filtered: mkFiltered(`${OUT}new untracked line padding here\n`),
      now: T0 + 1000,
    });
    expect(changed).toBeNull();
  });

  test("H2: identical compressed output but DIFFERENT raw → MISS (no false 'unchanged')", async () => {
    // A capped/lossy handler can compress two different raws to byte-identical output
    // (content changed only beyond a per-file cap). Keying on the compressed view would
    // emit a false "unchanged" + a stale recovery pointer; keying on raw re-emits.
    await run({ raw: mkRaw(`${RAWOUT} v1`), filtered: mkFiltered(OUT), now: T0 });
    const second = await run({
      raw: mkRaw(`${RAWOUT} v2`),
      filtered: mkFiltered(OUT), // SAME compressed output as the first run
      now: T0 + 1000,
    });
    expect(second).toBeNull();
  });

  test("a changed / non-zero exit code is never deduped", async () => {
    await run({ now: T0 }); // establish at exit 0
    const nonzero = await run({ raw: mkRaw(RAWOUT, 1), now: T0 + 1000 });
    expect(nonzero).toBeNull();
  });

  test("past the re-anchor window the full output re-emits (re-anchor)", async () => {
    await run({ now: T0 }); // fast class = 30s
    expect(await run({ now: T0 + 31_000 })).toBeNull();
    // …and a fresh repeat within the new window hits again
    expect(await run({ now: T0 + 31_500 })).not.toBeNull();
  });
});

describe("applySessionDedup — gates", () => {
  test("a mutating form is never deduped (read-only gate, keyed on handler name)", async () => {
    // eslint is cacheable, but `eslint --fix` rewrites files — the gate must deny it
    // even though the real command runs both times and emits a byte-identical report.
    const eslint: CommandHandler = { ...handler("medium"), name: "eslint" };
    const fix = command("eslint", ["--fix", "src/"]);
    expect(await run({ handler: eslint, command: fix, now: T0 })).toBeNull();
    expect(await run({ handler: eslint, command: fix, now: T0 + 1000 })).toBeNull();
  });

  test("tiny output skips dedup (never make worse)", async () => {
    const tiny = mkFiltered("ok\n");
    expect(await run({ filtered: tiny, now: T0 })).toBeNull();
    expect(await run({ filtered: tiny, now: T0 + 1000 })).toBeNull();
  });

  test("enabled by default — no flag needed (dedup is default-on)", async () => {
    expect(await run({ env: {} as NodeJS.ProcessEnv, now: T0 })).toBeNull(); // establish
    const hit = await run({ env: {} as NodeJS.ProcessEnv, now: T0 + 1000 });
    expect(hit).not.toBeNull();
    expect(hit!.output).toContain("[tk] unchanged since");
  });

  test("TK_SESSION_DEDUP=0 disables it — no marker, no store written", async () => {
    const off = { TK_SESSION_DEDUP: "0" } as NodeJS.ProcessEnv;
    expect(await run({ env: off, now: T0 })).toBeNull();
    expect(await run({ env: off, now: T0 + 1000 })).toBeNull();
    await expect(access(dedupStoreFile(cwd))).rejects.toBeTruthy(); // never created
  });

  test("--no-save-raw disables dedup (no recovery channel)", async () => {
    const opts = mkOptions({ saveRaw: false });
    expect(await run({ options: opts, now: T0 })).toBeNull();
    expect(await run({ options: opts, now: T0 + 1000 })).toBeNull();
  });

  test("--no-dedup forces the stage off even when enabled and eligible", async () => {
    const opts = mkOptions({ dedup: false });
    expect(await run({ options: opts, now: T0 })).toBeNull();
    expect(await run({ options: opts, now: T0 + 1000 })).toBeNull();
  });
});

describe("applySessionDedup — session attribute (marker wording only)", () => {
  test("same session says 'in this session'", async () => {
    await run({ options: mkOptions({ sessionId: "s1" }), now: T0 });
    const hit = await run({ options: mkOptions({ sessionId: "s1" }), now: T0 + 1000 });
    expect(hit!.output).toContain("in this session");
  });

  test("a different session on a fast command still hits, worded 'here'", async () => {
    await run({ options: mkOptions({ sessionId: "s1" }), now: T0 });
    const hit = await run({ options: mkOptions({ sessionId: "s2" }), now: T0 + 1000 });
    expect(hit).not.toBeNull();
    expect(hit!.output).toContain("here");
    expect(hit!.output).not.toContain("in this session");
  });

  test("a different session still dedups — session is wording-only, never a gate", async () => {
    // Exact-compare + TTL are the only hit conditions; a second session that produces
    // identical output dedups too (lossless), worded "here" rather than "in this session".
    const slow = handler("slow");
    await run({ handler: slow, options: mkOptions({ sessionId: "s1" }), now: T0 });
    const hit = await run({
      handler: slow,
      options: mkOptions({ sessionId: "s2" }),
      now: T0 + 1000,
    });
    expect(hit).not.toBeNull();
    expect(hit!.output).toContain("here");
    expect(hit!.output).not.toContain("in this session");
  });
});

describe("applySessionDedup — lazy recovery snapshot (review #5)", () => {
  test("the establishing MISS writes no raw snapshot; the first HIT creates one", async () => {
    expect(await run({ now: T0 })).toBeNull(); // establish — should NOT snapshot
    const dir = rawOutputDir(cwd);
    const afterMiss = existsSync(dir) ? readdirSync(dir).length : 0;
    expect(afterMiss).toBe(0);

    const hit = await run({ now: T0 + 1000 }); // first hit — snapshots now
    expect(hit).not.toBeNull();
    const ptr = /full: (\S+)/.exec(hit!.output)![1]!;
    expect(existsSync(resolveStoredPath(ptr))).toBe(true);
    const recovered = await readFile(resolveStoredPath(ptr), "utf8");
    expect(recovered).toContain("RAWMARK");
  });
});

describe("applySessionDedup — honest HIT savings (review #9)", () => {
  test("the marker result's baseline is the suppressed compressed output, not raw", async () => {
    await run({ now: T0 });
    const hit = await run({ now: T0 + 1000 });
    // rawChars reflects the compressed repeat we suppressed (OUT), not the larger raw,
    // so --stats shows the incremental dedup saving without double-counting compression.
    expect(hit!.rawChars).toBe(OUT.length);
    expect(hit!.rawChars).toBeLessThan(RAWOUT.length);
    expect(hit!.savedTokens).toBeGreaterThan(0);
  });
});
