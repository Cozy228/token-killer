import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

import { posixWrapper } from "../../../src/shim/install.js";

// End-to-end checks for the recursion guard and the fail-open contract. We build
// a real shim dir containing a `git` wrapper (`exec ctx git "$@"`), put it on the
// child PATH with CTX_SHIM_DIR set, and drive the real CLI. The shim must NOT
// fork-bomb (shim→ctx→shim): executeCommand strips the shim dir so the real git
// is resolved; when the real git is unreachable the process must fail toward a
// clear error, never crash, never hang.

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const cli = join(repoRoot, "src/cli.ts");
const tsxLoader = pathToFileURL(join(repoRoot, "node_modules/tsx/dist/loader.mjs")).href;

let tmp: string;
let shimDir: string;
let tkHome: string;

function runTg(args: string[], extraEnv: NodeJS.ProcessEnv, cwd = repoRoot) {
  return spawnSync(process.execPath, ["--import", tsxLoader, cli, ...args], {
    cwd,
    encoding: "utf8",
    timeout: 15000,
    // Isolate the data dir: cwd is the repo root, so without this the spawned
    // CLI would write history into the real ~/.contexa/.
    env: { ...process.env, CONTEXA_HOME: tkHome, ...extraEnv },
  });
}

beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), "ctx-shim-e2e-"));
  shimDir = join(tmp, "shim");
  tkHome = join(tmp, "home");
  mkdirSync(shimDir);
  mkdirSync(tkHome);
  // A POSIX wrapper that, absent the recursion guard, would re-invoke ctx → shim.
  writeFileSync(join(shimDir, "git"), '#!/usr/bin/env sh\nexec ctx git "$@"\n');
  chmodSync(join(shimDir, "git"), 0o755);
});

afterAll(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe("recursion guard e2e", () => {
  test("resolves the real git with the shim dir first on PATH (finite, no recursion)", () => {
    const result = runTg(["git", "status"], {
      CTX_SHIM_DIR: shimDir,
      PATH: `${shimDir}${delimiter}${process.env.PATH ?? ""}`,
    });
    // It must terminate (no timeout/fork-bomb) and produce a real git result —
    // either a compressed status (exit 0) or a clear "Not a git repository".
    expect(result.signal).toBeNull();
    expect([0, 128]).toContain(result.status);
    expect(`${result.stdout}${result.stderr}`).not.toContain("exec ctx git");
  });

  test("installed wrapper self-sets CTX_SHIM_DIR → no fork-bomb when the var is UNSET in env (C7)", () => {
    // Regression for C7/D3: the recursion guard only engages when CTX_SHIM_DIR is set,
    // and the old wrappers never set it. An installed POSIX wrapper must self-export
    // the baked shim dir so a shell whose PATH has the shim dir first — but with NO
    // CTX_SHIM_DIR exported (subshell, env-stripping host) — still resolves the real
    // tool instead of spawning wrapper→ctx→wrapper forever.
    const wrapShim = join(tmp, "wrapshim");
    mkdirSync(wrapShim, { recursive: true });
    const tkExec = { bin: process.execPath, args: ["--import", tsxLoader, cli] };
    const gitWrapper = join(wrapShim, "git");
    writeFileSync(gitWrapper, posixWrapper("git", tkExec, wrapShim));
    chmodSync(gitWrapper, 0o755);

    const env: NodeJS.ProcessEnv = { ...process.env, CONTEXA_HOME: tkHome };
    delete env.CTX_SHIM_DIR; // the whole point: the var is NOT in the environment
    const result = spawnSync("sh", ["-c", "git status"], {
      cwd: repoRoot,
      encoding: "utf8",
      timeout: 15000,
      env: { ...env, PATH: `${wrapShim}${delimiter}${process.env.PATH ?? ""}` },
    });
    expect(result.signal).toBeNull(); // no timeout → no fork-bomb
    expect([0, 128]).toContain(result.status);
    expect(`${result.stdout}${result.stderr}`).not.toContain("export CTX_SHIM_DIR");
  });

  // POSIX-only: plants a `#!/usr/bin/env sh` wrapper to drive the fail-open path with
  // ONLY the shim copy reachable. The Windows shim uses .cmd wrappers resolved via
  // PATHEXT (a different mechanism), so this sh-shebang scenario doesn't apply there;
  // the recursion sentinel itself is unit-tested cross-platform in path.test.ts.
  test.skipIf(process.platform === "win32")(
    "fail-open: real git unreachable → clear error, non-128 exit, never crashes",
    () => {
      // PATH contains ONLY the shim dir: stripping it leaves the real git
      // unreachable, so the sentinel fires and both compress and passthrough must
      // fail toward a clear one-line error rather than recursing forever.
      const result = runTg(["git", "status"], {
        CTX_SHIM_DIR: shimDir,
        PATH: shimDir,
      });
      expect(result.signal).toBeNull();
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("shim dir");
      // failOpenPassthrough is one of ctx's OWN error sinks → it nudges toward `ctx support`
      // (constraint 4). This is the only reachable runtime trigger for that call site.
      expect(result.stderr).toContain("Run `ctx support`");
    },
  );
});
