import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import { vscodeUserDir } from "../../src/shim/hostConfig.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const cli = path.join(repoRoot, "src/cli.ts");
const tsxLoader = path.join(repoRoot, "node_modules/tsx/dist/loader.mjs");

let home: string;

beforeEach(() => {
  home = mkdtempSync(path.join(tmpdir(), "tk-inspect-cli-"));
});
afterEach(() => {
  rmSync(home, { recursive: true, force: true });
});

function runTk(args: string[]) {
  return spawnSync(process.execPath, ["--import", tsxLoader, cli, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: 15000,
    env: {
      ...process.env,
      HOME: home,
      USERPROFILE: home,
      TOKEN_KILLER_HOME: path.join(home, ".token-killer"),
    },
  });
}

// Seed enough raw compressible commands to clear the advice thresholds.
function seedRawCommands(command: string, times: number) {
  const records = Array.from({ length: times }, () => ({
    toolName: "bash",
    toolArgs: JSON.stringify({ command }),
    toolResult: "x".repeat(120),
  }));
  seedTranscript(records);
}

function seedTranscript(records: object[]) {
  const ws = path.join(
    vscodeUserDir(process.platform, home),
    "workspaceStorage",
    "ws1",
    "GitHub.copilot-chat",
    "transcripts",
  );
  mkdirSync(ws, { recursive: true });
  writeFileSync(path.join(ws, "t.jsonl"), records.map((r) => JSON.stringify(r)).join("\n") + "\n");
}

describe("tk inspect — exit codes & output", () => {
  test("no sources → exit 2", () => {
    const r = runTk(["inspect"]);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("no vscode session sources");
  });

  test("default report opens an HTML file → exit 0", () => {
    seedTranscript([
      {
        toolName: "bash",
        toolArgs: JSON.stringify({ command: "git status" }),
        toolResult: "x".repeat(200),
      },
    ]);
    const r = runTk(["inspect"]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("Generated HTML report:");
    expect(r.stdout).toContain(".html");
  });

  test("--text prints the markdown report → exit 0", () => {
    seedTranscript([
      {
        toolName: "bash",
        toolArgs: JSON.stringify({ command: "git status" }),
        toolResult: "x".repeat(200),
      },
    ]);
    const r = runTk(["inspect", "--text"]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("# Token Killer Inspect");
    expect(r.stdout).toContain("`git status`");
  });

  test("--json emits parseable JSON with schemaVersion", () => {
    seedTranscript([
      {
        toolName: "bash",
        toolArgs: JSON.stringify({ command: "npm test" }),
        toolResult: "y".repeat(80),
      },
    ]);
    const r = runTk(["inspect", "--json"]);
    expect(r.status).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.schemaVersion).toBe("1");
    expect(parsed.opportunities[0].key).toBe("npm test");
  });

  test("invalid --since → exit 1", () => {
    seedTranscript([
      { toolName: "bash", toolArgs: JSON.stringify({ command: "git log" }), toolResult: "z" },
    ]);
    const r = runTk(["inspect", "--since", "7w"]);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("invalid --since");
  });

  test("invalid --input-type → exit 1", () => {
    const r = runTk(["inspect", "--input-type", "emacs"]);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("invalid --input-type");
  });
});

describe("tk inspect --advice / --write-advice (Slice 5)", () => {
  test("--text --advice leads with the delivery recommendation (vscode → shim)", () => {
    seedRawCommands("git status", 6);
    const r = runTk(["inspect", "--text", "--advice"]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("## Advice");
    expect(r.stdout).toContain("shim");
    expect(r.stdout).toContain("tk install");
  });

  test("--json --advice includes the advice array", () => {
    seedRawCommands("git status", 6);
    const r = runTk(["inspect", "--json", "--advice"]);
    expect(r.status).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.advice[0].type).toBe("delivery");
  });

  test("--write-advice writes stable-named artifacts under ~/.token-killer/advice", () => {
    seedRawCommands("git status", 6);
    const r = runTk(["inspect", "--write-advice"]);
    expect(r.status).toBe(0);
    const adviceDir = path.join(home, ".token-killer", "advice");
    for (const name of ["inspect-report.md", "inspect-report.json", "advice.md"]) {
      expect(existsSync(path.join(adviceDir, name))).toBe(true);
    }
    expect(readFileSync(path.join(adviceDir, "advice.md"), "utf8")).toContain(
      "generated by tk inspect",
    );
  });
});
