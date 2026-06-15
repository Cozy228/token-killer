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

function runTk(args: string[], input?: string, tokenKillerHome?: string) {
  const env: NodeJS.ProcessEnv = { ...process.env };
  if (tokenKillerHome) env.TOKEN_KILLER_HOME = tokenKillerHome;
  return spawnSync(process.execPath, ["--import", tsxLoader, cli, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    input,
    timeout: 15000,
    env,
  });
}

describe("tk hook copilot — protocol over stdin/stdout", () => {
  test("VS Code dialect: rewrites via hookSpecificOutput.updatedInput, stdout is ONLY that JSON", () => {
    const payload = JSON.stringify({
      event: "preToolUse",
      tool_name: "run_in_terminal",
      tool_input: { command: "git status" },
    });
    const r = runTk(["hook", "copilot"], payload);
    expect(r.status).toBe(0);
    // stdout must parse as a single JSON object and contain nothing else.
    const parsed = JSON.parse(r.stdout);
    expect(parsed.hookSpecificOutput.updatedInput).toEqual({ command: "tk git status" });
    expect(parsed.hookSpecificOutput.permissionDecision).toBe("allow");
  });

  // #19 end-to-end: VS Code validates updatedInput against run_in_terminal's full
  // schema, so the rewrite must preserve every original field (explanation/goal/
  // mode) and overwrite only `command`. An incomplete updatedInput is silently
  // ignored by VS Code — the exact bug this locks.
  test("VS Code dialect: updatedInput preserves the full run_in_terminal input", () => {
    const payload = JSON.stringify({
      event: "preToolUse",
      tool_name: "run_in_terminal",
      tool_input: {
        command: "git status",
        explanation: "Check repository status",
        goal: "Inspect working tree",
        mode: "sync",
      },
    });
    const r = runTk(["hook", "copilot"], payload);
    expect(r.status).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.hookSpecificOutput.updatedInput).toEqual({
      command: "tk git status",
      explanation: "Check repository status",
      goal: "Inspect working tree",
      mode: "sync",
    });
  });

  test("Copilot CLI dialect: rewrites via flat modifiedArgs", () => {
    const payload = JSON.stringify({
      event: "preToolUse",
      toolName: "bash",
      toolArgs: JSON.stringify({ command: "git status" }),
    });
    const r = runTk(["hook", "copilot"], payload);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.modifiedArgs).toEqual({ command: "tk git status" });
    expect("hookSpecificOutput" in parsed).toBe(false);
  });

  test("denies a dependency-dir read via permissionDecision", () => {
    const payload = JSON.stringify({
      event: "preToolUse",
      tool_name: "read_file",
      tool_input: { filePath: "node_modules/x/i.js" },
    });
    const r = runTk(["hook", "copilot"], payload);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.hookSpecificOutput.permissionDecision).toBe("deny");
    expect(parsed.hookSpecificOutput.permissionDecisionReason).toBeTruthy();
  });

  test("fail-open: malformed payload → exit 0, empty stdout (run unchanged)", () => {
    const r = runTk(["hook", "copilot"], "}{ not json");
    expect(r.status).toBe(0);
    expect(r.stdout).toBe("");
  });

  test("fail-open: empty stdin → exit 0, empty stdout", () => {
    const r = runTk(["hook", "copilot"], "");
    expect(r.status).toBe(0);
    expect(r.stdout).toBe("");
  });
});

describe("tk hook copilot — prompt + error events (Slice 2)", () => {
  test("oversized prompt → deny", () => {
    const payload = JSON.stringify({ event: "userPromptSubmitted", prompt: "x".repeat(17000 * 4) });
    const r = runTk(["hook", "copilot"], payload);
    expect(JSON.parse(r.stdout).hookSpecificOutput.permissionDecision).toBe("deny");
  });

  test("implementation-intent prompt → allow + additionalContext hint", () => {
    const payload = JSON.stringify({
      event: "userPromptSubmitted",
      prompt: "implement the parser",
    });
    const r = runTk(["hook", "copilot"], payload);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.hookSpecificOutput.permissionDecision).toBe("allow");
    expect(parsed.hookSpecificOutput.additionalContext).toBeTruthy();
  });

  test("errorOccurred → additionalContext hint, and records a failure history row", async () => {
    const home = await mkdtemp(path.join(tmpdir(), "tk-hook-fail-"));
    try {
      const payload = JSON.stringify({
        event: "errorOccurred",
        toolName: "bash",
        toolArgs: JSON.stringify({ command: "frobnicate" }),
        toolResult: "command not found: frobnicate",
      });
      const r = runTk(["hook", "copilot"], payload, home);
      const parsed = JSON.parse(r.stdout);
      // errorOccurred carries camelCase toolName → Copilot CLI flat dialect.
      expect(parsed.additionalContext).toContain("Command not found");

      // The child runs with cwd=repoRoot and TOKEN_KILLER_HOME=home; build the
      // history path the same way (fingerprint is TOKEN_KILLER_HOME-independent).
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

describe("tk hook check — dry-run", () => {
  test("shows the rewrite", () => {
    const r = runTk(["hook", "check", "git", "status"]);
    expect(r.status).toBe(0);
    expect(r.stdout.trim()).toBe("rewrite: tk git status");
  });

  test("shows pass for a non-rewritable command", () => {
    const r = runTk(["hook", "check", "some-unknown-tool"]);
    expect(r.status).toBe(0);
    expect(r.stdout.trim()).toBe("pass: some-unknown-tool");
  });

  test("missing command → exit 1, error on stderr", () => {
    const r = runTk(["hook", "check"]);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("missing command");
  });
});

describe("tk hook — unknown subcommand", () => {
  test("exit 1, diagnostic on stderr, stdout empty", () => {
    const r = runTk(["hook", "frobnicate"]);
    expect(r.status).toBe(1);
    expect(r.stdout).toBe("");
    expect(r.stderr).toContain("unknown subcommand");
  });
});
