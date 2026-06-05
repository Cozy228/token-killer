import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { describe, expect, test } from "vitest";

import { projectFingerprint } from "../../src/core/dataDir.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const cli = path.join(repoRoot, "src/cli.ts");
const tsxLoader = path.join(repoRoot, "node_modules/tsx/dist/loader.mjs");

function runTg(args: string[], input?: string, tokenGuardHome?: string) {
  const env: NodeJS.ProcessEnv = { ...process.env };
  if (tokenGuardHome) env.TOKEN_GUARD_HOME = tokenGuardHome;
  return spawnSync(process.execPath, ["--import", tsxLoader, cli, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    input,
    timeout: 15000,
    env,
  });
}

describe("tg hook copilot — protocol over stdin/stdout", () => {
  test("rewrites a terminal command, stdout is ONLY protocol JSON", () => {
    const payload = JSON.stringify({
      event: "preToolUse",
      toolName: "bash",
      toolArgs: JSON.stringify({ command: "git status" }),
    });
    const r = runTg(["hook", "copilot"], payload);
    expect(r.status).toBe(0);
    // stdout must parse as a single JSON object and contain nothing else.
    const parsed = JSON.parse(r.stdout);
    expect(parsed).toEqual({ decision: "rewrite", rewritten_command: "tg git status" });
  });

  test("denies a dependency-dir read", () => {
    const payload = JSON.stringify({
      event: "preToolUse",
      tool_name: "read_file",
      tool_input: { filePath: "node_modules/x/i.js" },
    });
    const r = runTg(["hook", "copilot"], payload);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.decision).toBe("deny");
    expect(parsed.reason).toBeTruthy();
  });

  test("fail-open: malformed payload → exit 0, stdout is {\"decision\":\"allow\"}", () => {
    const r = runTg(["hook", "copilot"], "}{ not json");
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout)).toEqual({ decision: "allow" });
  });

  test("fail-open: empty stdin → allow", () => {
    const r = runTg(["hook", "copilot"], "");
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout)).toEqual({ decision: "allow" });
  });
});

describe("tg hook copilot — prompt + error events (Slice 2)", () => {
  test("oversized prompt → deny", () => {
    const payload = JSON.stringify({ event: "userPromptSubmitted", prompt: "x".repeat(17000 * 4) });
    const r = runTg(["hook", "copilot"], payload);
    expect(JSON.parse(r.stdout).decision).toBe("deny");
  });

  test("implementation-intent prompt → suggest with additional_context", () => {
    const payload = JSON.stringify({ event: "userPromptSubmitted", prompt: "implement the parser" });
    const r = runTg(["hook", "copilot"], payload);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.decision).toBe("suggest");
    expect(parsed.additional_context).toBeTruthy();
  });

  test("errorOccurred → allow + hint, and records a failure history row", async () => {
    const home = await mkdtemp(path.join(tmpdir(), "tg-hook-fail-"));
    try {
      const payload = JSON.stringify({
        event: "errorOccurred",
        toolName: "bash",
        toolArgs: JSON.stringify({ command: "frobnicate" }),
        toolResult: "command not found: frobnicate",
      });
      const r = runTg(["hook", "copilot"], payload, home);
      const parsed = JSON.parse(r.stdout);
      expect(parsed.decision).toBe("allow");
      expect(parsed.additional_context).toContain("Command not found");

      // The child runs with cwd=repoRoot and TOKEN_GUARD_HOME=home; build the
      // history path the same way (fingerprint is TOKEN_GUARD_HOME-independent).
      const file = path.join(home, "projects", projectFingerprint(repoRoot), "history.jsonl");
      const history = await readFile(file, "utf8");
      const row = JSON.parse(history.trim().split(/\r?\n/).pop() as string);
      expect(row.source_adapter).toBe("terminal_tool");
      expect(row.quality_status).toBe("failure");
      // Privacy: the failed command text is never stored.
      expect(row.command).toBe("");
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });
});

describe("tg hook check — dry-run", () => {
  test("shows the rewrite", () => {
    const r = runTg(["hook", "check", "git", "status"]);
    expect(r.status).toBe(0);
    expect(r.stdout.trim()).toBe("rewrite: tg git status");
  });

  test("shows pass for a non-rewritable command", () => {
    const r = runTg(["hook", "check", "some-unknown-tool"]);
    expect(r.status).toBe(0);
    expect(r.stdout.trim()).toBe("pass: some-unknown-tool");
  });

  test("missing command → exit 1, error on stderr", () => {
    const r = runTg(["hook", "check"]);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("missing command");
  });
});

describe("tg hook — unknown subcommand", () => {
  test("exit 1, diagnostic on stderr, stdout empty", () => {
    const r = runTg(["hook", "frobnicate"]);
    expect(r.status).toBe(1);
    expect(r.stdout).toBe("");
    expect(r.stderr).toContain("unknown subcommand");
  });
});
