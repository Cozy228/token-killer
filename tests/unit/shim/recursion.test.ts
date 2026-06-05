import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

// End-to-end checks for the recursion guard and the fail-open contract. We build
// a real shim dir containing a `git` wrapper (`exec tg git "$@"`), put it on the
// child PATH with TG_SHIM_DIR set, and drive the real CLI. The shim must NOT
// fork-bomb (shim→tg→shim): executeCommand strips the shim dir so the real git
// is resolved; when the real git is unreachable the process must fail toward a
// clear error, never crash, never hang.

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const cli = join(repoRoot, "src/cli.ts");
const tsxLoader = join(repoRoot, "node_modules/tsx/dist/loader.mjs");

let tmp: string;
let shimDir: string;

function runTg(args: string[], extraEnv: NodeJS.ProcessEnv, cwd = repoRoot) {
  return spawnSync(process.execPath, ["--import", tsxLoader, cli, ...args], {
    cwd,
    encoding: "utf8",
    timeout: 15000,
    env: { ...process.env, ...extraEnv },
  });
}

beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), "tg-shim-e2e-"));
  shimDir = join(tmp, "shim");
  mkdirSync(shimDir);
  // A POSIX wrapper that, absent the recursion guard, would re-invoke tg → shim.
  writeFileSync(join(shimDir, "git"), '#!/usr/bin/env sh\nexec tg git "$@"\n');
  chmodSync(join(shimDir, "git"), 0o755);
});

afterAll(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe("recursion guard e2e", () => {
  test("resolves the real git with the shim dir first on PATH (finite, no recursion)", () => {
    const result = runTg(["git", "status"], {
      TG_SHIM_DIR: shimDir,
      PATH: `${shimDir}${delimiter}${process.env.PATH ?? ""}`,
    });
    // It must terminate (no timeout/fork-bomb) and produce a real git result —
    // either a compressed status (exit 0) or a clear "Not a git repository".
    expect(result.signal).toBeNull();
    expect([0, 128]).toContain(result.status);
    expect(`${result.stdout}${result.stderr}`).not.toContain("exec tg git");
  });

  test("fail-open: real git unreachable → clear error, non-128 exit, never crashes", () => {
    // PATH contains ONLY the shim dir: stripping it leaves the real git
    // unreachable, so the sentinel fires and both compress and passthrough must
    // fail toward a clear one-line error rather than recursing forever.
    const result = runTg(["git", "status"], {
      TG_SHIM_DIR: shimDir,
      PATH: shimDir,
    });
    expect(result.signal).toBeNull();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("shim dir");
  });
});
