import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  debugLogPath,
  emitSupportHintOnce,
  errorLogPath,
  logFatalError,
  recordHookError,
  resetSupportHintForTest,
  tkDebug,
  tkDebugEnabled,
} from "../../../src/hook/debug.js";

let writes: string[];
let dataHome: string;
const originalDebug = process.env.CTX_DEBUG;
const originalHome = process.env.CONTEXA_HOME;

beforeEach(() => {
  writes = [];
  resetSupportHintForTest();
  dataHome = mkdtempSync(join(tmpdir(), "ctx-debug-home-"));
  process.env.CONTEXA_HOME = dataHome;
  vi.spyOn(process.stderr, "write").mockImplementation((chunk: string | Uint8Array) => {
    writes.push(String(chunk));
    return true;
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  rmSync(dataHome, { recursive: true, force: true });
  if (originalDebug === undefined) delete process.env.CTX_DEBUG;
  else process.env.CTX_DEBUG = originalDebug;
  if (originalHome === undefined) delete process.env.CONTEXA_HOME;
  else process.env.CONTEXA_HOME = originalHome;
});

describe("tkDebug — gated by CTX_DEBUG", () => {
  test("silent when CTX_DEBUG is unset — no stderr, no log file", () => {
    delete process.env.CTX_DEBUG;
    expect(tkDebugEnabled()).toBe(false);
    tkDebug("claude:decision", { command: "git status", decision: "rewrite" });
    expect(writes).toHaveLength(0);
    expect(existsSync(debugLogPath())).toBe(false);
  });

  test("writes a structured line to stderr when CTX_DEBUG=1", () => {
    process.env.CTX_DEBUG = "1";
    tkDebug("claude:decision", { command: "git status", decision: "pass", reason: "mutating" });
    expect(writes).toHaveLength(1);
    const line = writes[0]!;
    expect(line).toMatch(/^ctx debug: claude:decision /);
    expect(line).toContain('command="git status"');
    expect(line).toContain('decision="pass"');
    expect(line).toContain('reason="mutating"');
    expect(line.endsWith("\n")).toBe(true);
  });

  test("drops undefined fields so the trace shows only what applies", () => {
    process.env.CTX_DEBUG = "1";
    tkDebug("claude:decision", {
      command: "ls",
      decision: "rewrite",
      reason: undefined,
      rewritten: "ctx ls",
    });
    expect(writes[0]).not.toContain("reason=");
    expect(writes[0]).toContain('rewritten="ctx ls"');
  });

  test("scope with no fields still emits a clean line", () => {
    process.env.CTX_DEBUG = "1";
    tkDebug("claude:skip");
    expect(writes[0]).toBe("ctx debug: claude:skip\n");
  });

  test("appends a timestamped line to the default debug log (not a ledger)", () => {
    process.env.CTX_DEBUG = "1";
    tkDebug("claude:stdin", { bytes: 90 });
    tkDebug("claude:emit", { rewrote: true });
    const logPath = debugLogPath();
    expect(logPath).toBe(join(dataHome, "debug.log"));
    const lines = readFileSync(logPath, "utf8").trimEnd().split("\n");
    expect(lines).toHaveLength(2);
    // ISO timestamp prefix + the same body as stderr
    expect(lines[0]).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z ctx debug: claude:stdin bytes=90$/);
    expect(lines[1]).toContain("ctx debug: claude:emit rewrote=true");
  });

  test.runIf(process.platform !== "win32")(
    "creates and repairs diagnostic logs with owner-only permissions",
    () => {
      const debugPath = debugLogPath();
      const errorPath = errorLogPath();
      chmodSync(dataHome, 0o755);
      writeFileSync(debugPath, "old debug\n", { mode: 0o644 });
      writeFileSync(errorPath, "old error\n", { mode: 0o644 });
      chmodSync(debugPath, 0o644);
      chmodSync(errorPath, 0o644);

      process.env.CTX_DEBUG = "1";
      tkDebug("permissions");
      recordHookError("permissions", new Error("test"));

      expect(statSync(dataHome).mode & 0o777).toBe(0o700);
      expect(statSync(debugPath).mode & 0o777).toBe(0o600);
      expect(statSync(errorPath).mode & 0o777).toBe(0o600);
    },
  );
});

describe("logFatalError — UNGATED crash breadcrumb", () => {
  test("writes errors.log even when CTX_DEBUG is unset", () => {
    delete process.env.CTX_DEBUG;
    expect(tkDebugEnabled()).toBe(false);
    logFatalError("ctx hook copilot", new Error("Cannot find module './cli.js'"));
    const path = errorLogPath();
    expect(path).toBe(join(dataHome, "errors.log"));
    const body = readFileSync(path, "utf8");
    expect(body).toContain("ctx fatal: ctx hook copilot");
    expect(body).toContain("Cannot find module './cli.js'");
    // also mirrored to stderr (host swallows it, but local runs surface it)
    expect(writes.join("")).toContain("ctx fatal: ctx hook copilot");
  });

  test("logs the stack for an Error and stringifies a non-Error", () => {
    logFatalError("ctx-a", new Error("boom"));
    logFatalError("ctx-b", "plain string failure");
    const body = readFileSync(errorLogPath(), "utf8");
    expect(body).toContain("ctx fatal: ctx-a");
    // Error path includes the stack (which contains the message)
    expect(body).toMatch(/boom/);
    expect(body).toContain("ctx fatal: ctx-b");
    expect(body).toContain("plain string failure");
  });
});

describe("recordHookError — UNGATED fail-open breadcrumb", () => {
  test("writes errors.log even when CTX_DEBUG is unset (reconstructable after the fact)", () => {
    delete process.env.CTX_DEBUG;
    expect(tkDebugEnabled()).toBe(false);
    recordHookError("claude: stdin parse (fail-open)", new Error("Unterminated string in JSON"));
    const body = readFileSync(errorLogPath(), "utf8");
    expect(body).toContain("ctx hook-error: claude: stdin parse (fail-open)");
    expect(body).toContain("Unterminated string in JSON");
  });

  test("stays OFF stderr by default — a fail-open hook's stderr is a spurious host error", () => {
    recordHookError("claude: stdin parse", new Error("boom"));
    expect(writes.join("")).toBe("");
  });

  test("surfaceStderr ALSO writes stderr (safe on Copilot CLI's debug channel)", () => {
    recordHookError("copilot: stdin parse", new Error("boom"), { surfaceStderr: true });
    expect(writes.join("")).toContain("ctx hook-error: copilot: stdin parse");
    expect(writes.join("")).toContain("boom");
    // and still persisted regardless of the stderr copy
    expect(readFileSync(errorLogPath(), "utf8")).toContain("ctx hook-error: copilot: stdin parse");
  });
});

describe("emitSupportHintOnce — nudge toward `ctx support` on ctx's OWN errors", () => {
  const HINT = "Run `ctx support`";

  test("writes the hint to stderr exactly once per process (collapses a burst)", () => {
    emitSupportHintOnce();
    emitSupportHintOnce();
    emitSupportHintOnce();
    expect(writes.filter((w) => w.includes(HINT))).toHaveLength(1);
  });

  test("fires from logFatalError (a fatal crash is always ctx's own error)", () => {
    logFatalError("ctx hook copilot", new Error("boom"));
    expect(writes.join("")).toContain(HINT);
    // The hint goes to stderr only — never into the clean machine log.
    expect(readFileSync(errorLogPath(), "utf8")).not.toContain(HINT);
  });

  test("fires from recordHookError when surfaceStderr is set (copilot)", () => {
    recordHookError("copilot: stdin parse", new Error("boom"), { surfaceStderr: true });
    expect(writes.join("")).toContain(HINT);
  });

  test("does NOT fire from a plain recordHookError (claude stays silent by design)", () => {
    recordHookError("claude: stdin parse", new Error("boom"));
    expect(writes.join("")).not.toContain(HINT);
  });
});
