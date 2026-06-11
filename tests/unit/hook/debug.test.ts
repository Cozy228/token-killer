import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  debugLogPath,
  errorLogPath,
  logFatalError,
  tkDebug,
  tkDebugEnabled,
} from "../../../src/hook/debug.js";

let writes: string[];
let dataHome: string;
const originalDebug = process.env.TK_DEBUG;
const originalHome = process.env.TOKEN_KILLER_HOME;

beforeEach(() => {
  writes = [];
  dataHome = mkdtempSync(join(tmpdir(), "tk-debug-home-"));
  process.env.TOKEN_KILLER_HOME = dataHome;
  vi.spyOn(process.stderr, "write").mockImplementation((chunk: string | Uint8Array) => {
    writes.push(String(chunk));
    return true;
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  rmSync(dataHome, { recursive: true, force: true });
  if (originalDebug === undefined) delete process.env.TK_DEBUG;
  else process.env.TK_DEBUG = originalDebug;
  if (originalHome === undefined) delete process.env.TOKEN_KILLER_HOME;
  else process.env.TOKEN_KILLER_HOME = originalHome;
});

describe("tkDebug — gated by TK_DEBUG", () => {
  test("silent when TK_DEBUG is unset — no stderr, no log file", () => {
    delete process.env.TK_DEBUG;
    expect(tkDebugEnabled()).toBe(false);
    tkDebug("claude:decision", { command: "git status", decision: "rewrite" });
    expect(writes).toHaveLength(0);
    expect(existsSync(debugLogPath())).toBe(false);
  });

  test("writes a structured line to stderr when TK_DEBUG=1", () => {
    process.env.TK_DEBUG = "1";
    tkDebug("claude:decision", { command: "git status", decision: "pass", reason: "mutating" });
    expect(writes).toHaveLength(1);
    const line = writes[0]!;
    expect(line).toMatch(/^tk debug: claude:decision /);
    expect(line).toContain('command="git status"');
    expect(line).toContain('decision="pass"');
    expect(line).toContain('reason="mutating"');
    expect(line.endsWith("\n")).toBe(true);
  });

  test("drops undefined fields so the trace shows only what applies", () => {
    process.env.TK_DEBUG = "1";
    tkDebug("claude:decision", {
      command: "ls",
      decision: "rewrite",
      reason: undefined,
      rewritten: "tk ls",
    });
    expect(writes[0]).not.toContain("reason=");
    expect(writes[0]).toContain('rewritten="tk ls"');
  });

  test("scope with no fields still emits a clean line", () => {
    process.env.TK_DEBUG = "1";
    tkDebug("claude:skip");
    expect(writes[0]).toBe("tk debug: claude:skip\n");
  });

  test("appends a timestamped line to the default debug log (not a ledger)", () => {
    process.env.TK_DEBUG = "1";
    tkDebug("claude:stdin", { bytes: 90 });
    tkDebug("claude:emit", { rewrote: true });
    const logPath = debugLogPath();
    expect(logPath).toBe(join(dataHome, "debug.log"));
    const lines = readFileSync(logPath, "utf8").trimEnd().split("\n");
    expect(lines).toHaveLength(2);
    // ISO timestamp prefix + the same body as stderr
    expect(lines[0]).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z tk debug: claude:stdin bytes=90$/);
    expect(lines[1]).toContain("tk debug: claude:emit rewrote=true");
  });
});

describe("logFatalError — UNGATED crash breadcrumb", () => {
  test("writes errors.log even when TK_DEBUG is unset", () => {
    delete process.env.TK_DEBUG;
    expect(tkDebugEnabled()).toBe(false);
    logFatalError("tk hook copilot", new Error("Cannot find module './cli.js'"));
    const path = errorLogPath();
    expect(path).toBe(join(dataHome, "errors.log"));
    const body = readFileSync(path, "utf8");
    expect(body).toContain("tk fatal: tk hook copilot");
    expect(body).toContain("Cannot find module './cli.js'");
    // also mirrored to stderr (host swallows it, but local runs surface it)
    expect(writes.join("")).toContain("tk fatal: tk hook copilot");
  });

  test("logs the stack for an Error and stringifies a non-Error", () => {
    logFatalError("ctx-a", new Error("boom"));
    logFatalError("ctx-b", "plain string failure");
    const body = readFileSync(errorLogPath(), "utf8");
    expect(body).toContain("tk fatal: ctx-a");
    // Error path includes the stack (which contains the message)
    expect(body).toMatch(/boom/);
    expect(body).toContain("tk fatal: ctx-b");
    expect(body).toContain("plain string failure");
  });
});
