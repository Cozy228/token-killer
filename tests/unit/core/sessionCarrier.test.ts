import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { parseArgv, sanitizeSessionId } from "../../../src/parse.js";
import { rewriteCommand } from "../../../src/hook/rewrite.js";
import { readHistory, recordHistory } from "../../../src/core/history.js";
import type { FilteredResult, RawResult, TkOptions } from "../../../src/types.js";

const ENV_KEY = "TK_SESSION";
let savedEnv: string | undefined;

beforeEach(() => {
  savedEnv = process.env[ENV_KEY];
  delete process.env[ENV_KEY];
});

afterEach(() => {
  if (savedEnv === undefined) delete process.env[ENV_KEY];
  else process.env[ENV_KEY] = savedEnv;
});

describe("sanitizeSessionId", () => {
  test("accepts the conservative charset", () => {
    expect(sanitizeSessionId("abc-123_DEF.4")).toBe("abc-123_DEF.4");
    expect(sanitizeSessionId("  trim-me  ")).toBe("trim-me");
  });

  test("drops anything with shell metacharacters or spaces", () => {
    expect(sanitizeSessionId("abc; rm -rf /")).toBeUndefined();
    expect(sanitizeSessionId("a b")).toBeUndefined();
    expect(sanitizeSessionId("$(whoami)")).toBeUndefined();
    expect(sanitizeSessionId("")).toBeUndefined();
    expect(sanitizeSessionId("x".repeat(129))).toBeUndefined();
    expect(sanitizeSessionId(undefined)).toBeUndefined();
  });
});

describe("parse — --session flag", () => {
  test("consumes the flag and drops it from the wrapped command", () => {
    const parsed = parseArgv(["--session", "abc", "git", "status"]);
    expect(parsed.options.sessionId).toBe("abc");
    expect(parsed.command?.original).toEqual(["git", "status"]);
    expect(parsed.command?.displayCommand).toBe("git status");
  });

  test("falls back to TK_SESSION env when the flag is absent", () => {
    process.env[ENV_KEY] = "envid";
    const parsed = parseArgv(["git", "status"]);
    expect(parsed.options.sessionId).toBe("envid");
  });

  test("the flag wins over the env", () => {
    process.env[ENV_KEY] = "envid";
    const parsed = parseArgv(["--session", "flagid", "git", "status"]);
    expect(parsed.options.sessionId).toBe("flagid");
  });

  test("an invalid flag value is ignored (falls back to env), tokens still dropped", () => {
    process.env[ENV_KEY] = "envid";
    const parsed = parseArgv(["--session", "bad!", "git", "status"]);
    expect(parsed.options.sessionId).toBe("envid");
    expect(parsed.command?.original).toEqual(["git", "status"]);
  });

  test("absent flag and env ⇒ undefined (honest-absent)", () => {
    const parsed = parseArgv(["git", "status"]);
    expect(parsed.options.sessionId).toBeUndefined();
  });
});

describe("parse — --no-dedup", () => {
  test("sets options.dedup=false and drops the flag from the command", () => {
    const parsed = parseArgv(["--no-dedup", "git", "status"]);
    expect(parsed.options.dedup).toBe(false);
    expect(parsed.command?.original).toEqual(["git", "status"]);
  });

  test("absent ⇒ dedup undefined (follow the gate)", () => {
    expect(parseArgv(["git", "status"]).options.dedup).toBeUndefined();
  });
});

describe("rewrite — --session injection", () => {
  test("injects the flag when a valid session is supplied", () => {
    const r = rewriteCommand("git status", "abc");
    expect(r.decision).toBe("rewrite");
    expect(r.rewritten).toBe("tk --session abc git status");
  });

  test("no session ⇒ byte-identical to today's rewrite", () => {
    expect(rewriteCommand("git status").rewritten).toBe("tk git status");
    expect(rewriteCommand("git status", undefined).rewritten).toBe("tk git status");
  });

  test("injects the flag on each eligible segment of a chain", () => {
    const r = rewriteCommand("git status && tsc --noEmit", "abc");
    expect(r.rewritten).toBe("tk --session abc git status && tk --session abc tsc --noEmit");
  });

  test("a pipe is fully passed — the producer is not rewritten even with a session (C1)", () => {
    // Rewriting the producer would feed `head` the compacted log, not the real one.
    const r = rewriteCommand("git log | head", "abc");
    expect(r.decision).toBe("pass");
  });

  test("a session with shell metacharacters injects NO flag (sanitizer)", () => {
    const r = rewriteCommand("git status", "abc; rm -rf /");
    expect(r.decision).toBe("rewrite");
    expect(r.rewritten).toBe("tk git status");
  });

  test("an already-tk segment is left untouched (idempotent, no double --session)", () => {
    expect(rewriteCommand("tk git status", "abc").decision).toBe("pass");
    expect(rewriteCommand("tk --session abc git status", "abc").decision).toBe("pass");
  });
});

describe("recordHistory — session_id stamping", () => {
  let home: string;
  let cwd: string;

  beforeEach(async () => {
    home = await mkdtemp(path.join(tmpdir(), "tk-carrier-home-"));
    cwd = await mkdtemp(path.join(tmpdir(), "tk-carrier-cwd-"));
    process.env.TOKEN_KILLER_HOME = home;
  });

  afterEach(async () => {
    delete process.env.TOKEN_KILLER_HOME;
    await rm(home, { recursive: true, force: true });
    await rm(cwd, { recursive: true, force: true });
  });

  function raw(): RawResult {
    return { command: "git status", stdout: "x", stderr: "", exitCode: 0, durationMs: 1 };
  }

  function filtered(): FilteredResult {
    return {
      handler: "git-status",
      output: "x",
      rawChars: 1,
      outputChars: 1,
      rawTokens: 1,
      outputTokens: 1,
      savedTokens: 0,
      savingsPct: 0,
      exitCode: 0,
      qualityStatus: "passed",
    };
  }

  function options(over: Partial<TkOptions> = {}): TkOptions {
    return {
      raw: false,
      stats: false,
      verbose: false,
      maxLines: 120,
      maxChars: 12000,
      saveRaw: false,
      cwd,
      ...over,
    };
  }

  test("writes session_id when present", async () => {
    await recordHistory(raw(), filtered(), options({ sessionId: "sess-9" }));
    const rows = await readHistory(cwd);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.session_id).toBe("sess-9");
  });

  test("omits session_id when absent (honest-absent)", async () => {
    await recordHistory(raw(), filtered(), options());
    const rows = await readHistory(cwd);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.session_id).toBeUndefined();
    expect("session_id" in rows[0]!).toBe(false);
  });
});
