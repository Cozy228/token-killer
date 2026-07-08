// Slice 4 — proves the telemetry send path is unreachable from `ctx <cmd>` (the hot
// path is sacred) and reachable only from the cold paths (`ctx gain` / `ctx inspect`).
// Uses the observable telemetry-state.json `lastSentAt` stamp as the signal — no
// network server needed: the bogus endpoint fails fast, but the stamp lands BEFORE
// dispatch, so its presence/absence cleanly distinguishes "tried to send" from
// "never reached the trigger".

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const cli = path.join(repoRoot, "src/cli.ts");
const tsxLoader = pathToFileURL(path.join(repoRoot, "node_modules/tsx/dist/loader.mjs")).href;
const DEAD_ENDPOINT = "https://127.0.0.1:1/telemetry"; // refuses fast

let home: string;

beforeEach(async () => {
  home = await mkdtemp(path.join(tmpdir(), "ctx-tele-int-"));
  // Opt in to network telemetry.
  mkdirSync(home, { recursive: true });
  writeFileSync(path.join(home, "config.jsonc"), '{ "telemetry": true }\n');
});

afterEach(async () => {
  await rm(home, { recursive: true, force: true });
});

function runTk(args: string[], cwd: string) {
  const localBin = path.join(repoRoot, "node_modules/.bin");
  return spawnSync(process.execPath, ["--import", tsxLoader, cli, ...args], {
    cwd,
    encoding: "utf8",
    timeout: 15000,
    env: {
      ...process.env,
      PATH: `${localBin}${path.delimiter}${process.env.PATH ?? ""}`,
      CONTEXA_HOME: home,
      CTX_TELEMETRY_ENDPOINT: DEAD_ENDPOINT,
    },
  });
}

function stateLastSentAt(): string | null | undefined {
  const file = path.join(home, "telemetry-state.json");
  if (!existsSync(file)) return undefined; // never reached the trigger
  return JSON.parse(readFileSync(file, "utf8")).lastSentAt;
}

describe("telemetry send path reachability", () => {
  test("ctx <cmd> never reaches the telemetry trigger, even opted-in", () => {
    // A real handler command exercises the compress hot path (repoRoot is a git
    // repo). Post-U2 a DIRECT `ctx echo` would error before any hot path runs, so
    // route through an actual handled tool instead.
    const r = runTk(["git", "status"], repoRoot);
    expect(r.status).toBe(0);
    // The hot path must not create or stamp telemetry state.
    expect(stateLastSentAt()).toBeUndefined();
  });

  test("ctx gain reaches the trigger, stamps lastSentAt, and a dead endpoint is swallowed", () => {
    const r = runTk(["gain"], repoRoot);
    expect(r.status).toBe(0); // send failure never changes the exit code
    expect(stateLastSentAt()).toEqual(expect.any(String));
  });

  test("a second ctx gain inside 23h does not re-send (stamp unchanged)", () => {
    runTk(["gain"], repoRoot);
    const first = stateLastSentAt();
    runTk(["gain"], repoRoot);
    expect(stateLastSentAt()).toBe(first);
  });
});
