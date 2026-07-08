import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

// Real-environment dispatch coverage for EVERY ctx subcommand. Each verb is spawned
// through the actual `node --import tsx src/cli.ts` boundary (not in-process), in a
// fully isolated HOME + CONTEXA_HOME, exercised in a SAFE read-only / dry-run
// form. The point is regression protection for the dispatch table: when a verb is
// renamed or removed (e.g. `ctx init`→`install`, `ctx status`→`doctor`), a verb must
// never silently fall through to command passthrough. Removed verbs must print a
// rename hint, not try to execute a program of that name.

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const cli = path.join(repoRoot, "src/cli.ts");
const tsxLoader = pathToFileURL(path.join(repoRoot, "node_modules/tsx/dist/loader.mjs")).href;

let home: string;

beforeAll(() => {
  home = mkdtempSync(path.join(tmpdir(), "ctx-allcmd-"));
});
afterAll(() => {
  rmSync(home, { recursive: true, force: true });
});

function runTk(args: string[]) {
  const localBin = path.join(repoRoot, "node_modules/.bin");
  return spawnSync(process.execPath, ["--import", tsxLoader, cli, ...args], {
    cwd: home, // a neutral, non-repo dir so optimize/inspect don't scan this repo
    encoding: "utf8",
    timeout: 20000,
    env: {
      ...process.env,
      PATH: `${localBin}${path.delimiter}${process.env.PATH ?? ""}`,
      // Isolate every surface so host detection is deterministic (→ unknown) and
      // nothing reads/writes the developer's real ~/.contexa / ~/.claude / ~/.copilot.
      HOME: home,
      USERPROFILE: home,
      CONTEXA_HOME: path.join(home, ".contexa"),
      CLAUDECODE: "",
      CLAUDE_CODE_ENTRYPOINT: "",
      TERM_PROGRAM: "",
    },
  });
}

// Every reserved verb in a safe, side-effect-free form, with one stable substring its
// own handler prints (so a pass proves the verb reached its handler, not passthrough).
// `exit` defaults to 0; inspect returns 2 ("no session sources" — the normal state in an
// isolated home, and itself proof the inspect handler ran).
const SAFE_COMMANDS: Array<{
  name: string;
  args: string[];
  contains: string;
  exit?: number;
  exits?: number[];
}> = [
  { name: "version", args: ["version"], contains: "." },
  { name: "help", args: ["help"], contains: "Contexa" },
  { name: "install --dry-run", args: ["install", "--dry-run"], contains: "Detected host:" },
  { name: "uninstall --dry-run", args: ["uninstall", "--dry-run"], contains: "[dry-run]" },
  { name: "doctor", args: ["doctor"], contains: "Delivery matrix:" },
  { name: "shim status", args: ["shim", "status"], contains: "shim" },
  { name: "hook check", args: ["hook", "check", "git", "status"], contains: "" },
  {
    name: "inspect --json",
    args: ["inspect", "--json"],
    contains: "",
    exits: [0, 2],
  },
  { name: "optimize", args: ["optimize"], contains: "" },
  { name: "gain --text", args: ["gain", "--text"], contains: "Token" },
  { name: "config path", args: ["config", "path"], contains: ".contexa" },
  { name: "telemetry status", args: ["telemetry", "status"], contains: "" },
  { name: "support --help", args: ["support", "--help"], contains: "ctx support" },
];

describe("every subcommand dispatches end-to-end", () => {
  test.each(SAFE_COMMANDS)("ctx $name reaches its handler", ({ args, contains, exit, exits }) => {
    const result = runTk(args);
    if (exits) expect(exits).toContain(result.status);
    else expect(result.status).toBe(exit ?? 0);
    // Never the command-router passthrough error (that would mean the verb fell through).
    expect(result.stderr).not.toContain("ctx wraps known dev tools");
    // `contains` is "" for verbs with no stable marker → toContain("") is a trivial pass.
    expect(`${result.stdout}${result.stderr}`).toContain(contains);
  });
});

describe("removed verbs print a rename hint, not a passthrough attempt", () => {
  test("ctx status → renamed to ctx doctor (exit 1)", () => {
    const result = runTk(["status"]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("`ctx status` was renamed to `ctx doctor`");
  });

  test("ctx init → renamed to ctx install (exit 1)", () => {
    const result = runTk(["init"]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("`ctx init` was renamed to `ctx install`");
  });
});
