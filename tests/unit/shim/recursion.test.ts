import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

// End-to-end checks for the recursion guard and the fail-open contract. We build
// a real shim dir containing a `git` wrapper (`exec tk git "$@"`), put it on the
// child PATH with TK_SHIM_DIR set, and drive the real CLI. The shim must NOT
// fork-bomb (shim→tk→shim): executeCommand strips the shim dir so the real git
// is resolved; when the real git is unreachable the process must fail toward a
// clear error, never crash, never hang.

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const cli = join(repoRoot, "src/cli.ts");
const tsxLoader = join(repoRoot, "node_modules/tsx/dist/loader.mjs");

let tmp: string;
let shimDir: string;
let tkHome: string;

function runTg(args: string[], extraEnv: NodeJS.ProcessEnv, cwd = repoRoot) {
  return spawnSync(process.execPath, ["--import", tsxLoader, cli, ...args], {
    cwd,
    encoding: "utf8",
    timeout: 15000,
    // Isolate the data dir: cwd is the repo root, so without this the spawned
    // CLI would write history into the real ~/.token-killer/.
    env: { ...process.env, TOKEN_KILLER_HOME: tkHome, ...extraEnv },
  });
}

beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), "tk-shim-e2e-"));
  shimDir = join(tmp, "shim");
  tkHome = join(tmp, "home");
  mkdirSync(shimDir);
  mkdirSync(tkHome);
  // A POSIX wrapper that, absent the recursion guard, would re-invoke tk → shim.
  writeFileSync(join(shimDir, "git"), '#!/usr/bin/env sh\nexec tk git "$@"\n');
  chmodSync(join(shimDir, "git"), 0o755);
});

afterAll(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe("recursion guard e2e", () => {
  test("resolves the real git with the shim dir first on PATH (finite, no recursion)", () => {
    const result = runTg(["git", "status"], {
      TK_SHIM_DIR: shimDir,
      PATH: `${shimDir}${delimiter}${process.env.PATH ?? ""}`,
    });
    // It must terminate (no timeout/fork-bomb) and produce a real git result —
    // either a compressed status (exit 0) or a clear "Not a git repository".
    expect(result.signal).toBeNull();
    expect([0, 128]).toContain(result.status);
    expect(`${result.stdout}${result.stderr}`).not.toContain("exec tk git");
  });

  test("fail-open: real git unreachable → clear error, non-128 exit, never crashes", () => {
    // PATH contains ONLY the shim dir: stripping it leaves the real git
    // unreachable, so the sentinel fires and both compress and passthrough must
    // fail toward a clear one-line error rather than recursing forever.
    const result = runTg(["git", "status"], {
      TK_SHIM_DIR: shimDir,
      PATH: shimDir,
    });
    expect(result.signal).toBeNull();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("shim dir");
  });
});
