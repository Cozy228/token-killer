import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { describe, expect, test } from "vitest";

import { historyFile, resolveStoredPath } from "../../src/core/dataDir.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const cli = path.join(repoRoot, "src/cli.ts");
const tsxLoader = pathToFileURL(path.join(repoRoot, "node_modules/tsx/dist/loader.mjs")).href;

// Default isolated CONTEXA_HOME for callers that don't pass an explicit one.
// Without this, the spawned CLI would inherit the real environment and write its
// history into the developer's real ~/.contexa/, polluting `ctx gain`.
const defaultTokenKillerHome = mkdtempSync(path.join(tmpdir(), "ctx-test-home-"));

function runTk(
  args: string[],
  cwd: string,
  input?: string,
  contexaHomeDir?: string,
  extraEnv?: NodeJS.ProcessEnv,
) {
  // Prepend the repo's local bin so handler-spawned CLIs (tsc, eslint, ...)
  // resolve to the project's installed versions instead of relying on a global
  // install that may be absent in CI or in out-of-repo temp dirs.
  const localBin = path.join(repoRoot, "node_modules/.bin");
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PATH: `${localBin}${path.delimiter}${process.env.PATH ?? ""}`,
    // Always isolate the data dir so tests never touch the real ~/.contexa/.
    CONTEXA_HOME: contexaHomeDir ?? defaultTokenKillerHome,
    ...extraEnv,
  };
  return spawnSync(process.execPath, ["--import", tsxLoader, cli, ...args], {
    cwd,
    encoding: "utf8",
    input,
    timeout: 15000,
    env,
  });
}

// A throwaway shim dir for the generic-passthrough tests. Post-U2 hardening, a
// DIRECT `ctx <unknown>` errors; generic passthrough only runs when the shell
// resolved a real tool through the shim (CTX_SHIM_DIR set). These tests exercise
// passthrough MECHANICS (output/exit/stderr preservation), so they run as
// shim-invoked. The dir need not contain wrappers — the recursion guard strips it
// from PATH and the real tools resolve elsewhere.
const SHIM_INVOKED: NodeJS.ProcessEnv = { CTX_SHIM_DIR: path.join(tmpdir(), "ctx-fake-shim") };

// Initialize a fresh git repo with a deterministic identity in `dir`. The Git
// tests below each need a DIFFERENT working-tree state (dirty + untracked, a
// specific diff, a clean branch), so they can't share one repo — but this
// init + identity boilerplate (three spawns) had been copied verbatim into each.
function gitInit(dir: string): void {
  // `-b main` pins the initial branch: CI runners (and any box without a global
  // init.defaultBranch) still default to `master`, which broke the status/branch
  // assertions below. Pinning makes the branch name environment-independent.
  spawnSync("git", ["init", "-b", "main"], { cwd: dir });
  spawnSync("git", ["config", "user.email", "test@test.com"], { cwd: dir });
  spawnSync("git", ["config", "user.name", "Test"], { cwd: dir });
}

// ============================================================================
// 1. Version & Help
// ============================================================================

describe("Version & Help", () => {
  test("--version prints version number", () => {
    const result = runTk(["--version"], repoRoot);
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/^\d+\.\d+\.\d+/);
  });

  test("--help prints usage", () => {
    const result = runTk(["--help"], repoRoot);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Usage:");
    expect(result.stdout).toContain("--raw");
    expect(result.stdout).toContain("--stats");
  });
});

// ============================================================================
// 1b. Passthrough hardening (U2) — a direct `ctx <unknown>` must NEVER auto-spawn
// an arbitrary PATH binary (the bug that ran Bandizip's uninstall.EXE).
// ============================================================================

describe("Passthrough hardening (U2)", () => {
  // POSIX-only: plants an executable on PATH and checks ctx's spawn policy. On
  // Windows the executable-bit / shebang mechanics differ; the unit gate
  // (routeSpecific/isShimmableProgram) is covered platform-agnostically elsewhere.
  const posix = process.platform !== "win32";

  function withPlantedBinary(
    name: string,
    run: (binDir: string, env: NodeJS.ProcessEnv) => ReturnType<typeof spawnSync>,
  ) {
    const binDir = mkdtempSync(path.join(tmpdir(), "ctx-evil-"));
    const script = path.join(binDir, name);
    // Marker on stdout proves the binary actually ran.
    writeFileSync(script, "#!/bin/sh\necho EVIL_RAN\n", { mode: 0o755 });
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      PATH: `${binDir}${path.delimiter}${process.env.PATH ?? ""}`,
      CONTEXA_HOME: defaultTokenKillerHome,
    };
    try {
      return run(binDir, env);
    } finally {
      rmSync(binDir, { recursive: true, force: true });
    }
  }

  test.runIf(posix)("direct `ctx <unknown>` errors and spawns nothing on PATH", () => {
    const result = withPlantedBinary("uninstall", (_binDir, env) =>
      spawnSync(process.execPath, ["--import", tsxLoader, cli, "uninstall-xyz"], {
        cwd: repoRoot,
        encoding: "utf8",
        timeout: 15000,
        env,
      }),
    );
    // uninstall-xyz isn't a ctx verb/handler/shimmable tool → error, never spawn.
    expect(result.status).toBe(1);
    expect(result.stdout).not.toContain("EVIL_RAN");
    expect(result.stderr).toContain('unknown command "uninstall-xyz"');
  });

  test.runIf(posix)("`ctx --raw <unknown>` force-runs the real binary", () => {
    const result = withPlantedBinary("evilcmd", (_binDir, env) =>
      spawnSync(process.execPath, ["--import", tsxLoader, cli, "--raw", "evilcmd"], {
        cwd: repoRoot,
        encoding: "utf8",
        timeout: 15000,
        env,
      }),
    );
    expect(result.stdout).toContain("EVIL_RAN");
  });

  test.runIf(posix)(
    "shim-invoked passthrough (CTX_SHIM_DIR set) still runs an unhandled tool",
    () => {
      const result = withPlantedBinary("evilcmd", (binDir, env) =>
        spawnSync(process.execPath, ["--import", tsxLoader, cli, "evilcmd"], {
          cwd: repoRoot,
          encoding: "utf8",
          timeout: 15000,
          // Shim-invoked: the shell already resolved a real tool the user ran. The
          // shim dir is a separate empty dir so the recursion guard is a no-op.
          env: { ...env, CTX_SHIM_DIR: mkdtempSync(path.join(tmpdir(), "ctx-shimdir-")) },
        }),
      );
      expect(result.stdout).toContain("EVIL_RAN");
    },
  );
});

// ============================================================================
// 1c. CTX_DEBUG dual-sink (D1) — the compress path traces the gate decision +
// savings to debug.log, not just stderr (which the VS Code agent can't see).
// ============================================================================

describe("CTX_DEBUG dual-sink (D1)", () => {
  test("a handler command writes the gate decision + savings to debug.log", () => {
    const debugHome = mkdtempSync(path.join(tmpdir(), "ctx-debug-home-"));
    try {
      // Piped stdout (spawnSync) ⇒ isTTY=false ⇒ gate reason=compress. The point is
      // that the FILE is written by the compress path, with the gate trace + savings.
      const result = runTk(["git", "status"], repoRoot, undefined, debugHome, { CTX_DEBUG: "1" });
      expect(result.status).toBe(0);
      const log = readFileSync(path.join(debugHome, "debug.log"), "utf8");
      expect(log).toContain("ctx debug: gate");
      expect(log).toContain("willCompress=true");
      expect(log).toContain('reason="compress"');
      // The savings trace from the same dual sink.
      expect(log).toContain("ctx debug: compress");
      expect(log).toContain("savedPct=");
    } finally {
      rmSync(debugHome, { recursive: true, force: true });
    }
  });

  test("a passed-through command records the gate reason (no-handler)", () => {
    const debugHome = mkdtempSync(path.join(tmpdir(), "ctx-debug-home-"));
    try {
      // Shim-invoked generic passthrough → no specific handler → reason=no-handler.
      runTk(["echo", "hi"], repoRoot, undefined, debugHome, {
        CTX_DEBUG: "1",
        CTX_SHIM_DIR: path.join(tmpdir(), "ctx-fake-shim"),
      });
      const log = readFileSync(path.join(debugHome, "debug.log"), "utf8");
      expect(log).toContain("ctx debug: gate");
      expect(log).toContain('reason="no-handler"');
      expect(log).toContain("willCompress=false");
    } finally {
      rmSync(debugHome, { recursive: true, force: true });
    }
  });
});

// ============================================================================
// 2. Ls / Dir / Find
// ============================================================================

describe("Ls / Find", () => {
  test("ctx ls shows project files", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "ctx-ls-"));
    try {
      await writeFile(path.join(dir, "a.txt"), "a");
      await writeFile(path.join(dir, "b.ts"), "b");
      spawnSync("git", ["init"], { cwd: dir });
      await mkdir(path.join(dir, "node_modules"), { recursive: true });
      await writeFile(path.join(dir, "node_modules/.keep"), "");

      const result = runTk(["ls"], dir);
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("a.txt");
      expect(result.stdout).toContain("b.ts");
      // H17: node_modules is hidden by default but DISCLOSED in one counted line
      // (never silently dropped — "did the build emit X?" must be answerable).
      expect(result.stdout).toContain("node_modules");
      expect(result.stdout).toContain("hidden");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("ctx find shows directory structure", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "ctx-find-"));
    try {
      await mkdir(path.join(dir, "src/lib"), { recursive: true });
      await mkdir(path.join(dir, "tests"), { recursive: true });
      await writeFile(path.join(dir, "src/app.ts"), "export const x = 1;");
      await writeFile(path.join(dir, "src/lib/util.ts"), "export const y = 2;");
      await writeFile(path.join(dir, "tests/app.test.ts"), "test");

      const result = runTk(["find", ".", "-name", "*.ts"], dir);
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("src/");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

// ============================================================================
// 3. Read / Cat
// ============================================================================

describe("Read / Cat", () => {
  test("ctx cat shows small file content unchanged", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "ctx-cat-"));
    try {
      await writeFile(path.join(dir, "small.json"), '{"key":"value"}\n');

      const result = runTk(["cat", "small.json"], dir);
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('"key":"value"');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("ctx cat reads multiple files in argument order", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "ctx-cat-multi-"));
    try {
      await writeFile(path.join(dir, "one.txt"), "alpha\nbravo\n");
      await writeFile(path.join(dir, "two.txt"), "charlie\ndelta\n");

      const result = runTk(["cat", "one.txt", "two.txt"], dir);

      expect(result.status).toBe(0);
      expect(result.stdout).toContain("alpha");
      expect(result.stdout).toContain("bravo");
      expect(result.stdout).toContain("charlie");
      expect(result.stdout).toContain("delta");
      expect(result.stdout.indexOf("alpha")).toBeLessThan(result.stdout.indexOf("charlie"));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("ctx cat passes through large files", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "ctx-cat-large-"));
    try {
      const lines = [
        "import { api } from './api';",
        "export function main() {",
        ...Array.from({ length: 2000 }, (_, i) => `  const filler${i} = ${i};`),
        "  return true;",
        "}",
      ];
      await writeFile(path.join(dir, "large.ts"), lines.join("\n"));

      const result = runTk(["cat", "large.ts"], dir);
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("filler1999");
      expect(result.stdout).toContain("return true;");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("ctx read supports minimal balanced and aggressive levels", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "ctx-read-level-"));
    try {
      const lines = [
        'import { api } from "./api";',
        "export interface SubmitResult {",
        "  id: string;",
        "}",
        "export async function submitOrder(payload: OrderPayload) {",
        "  const idempotencyKey = `${payload.id}:submit`;",
        ...Array.from({ length: 260 }, (_, i) => `  const filler${i} = ${i};`),
        ...Array.from(
          { length: 80 },
          (_, i) => `  const checkpoint${i} = payload.items[${i}]?.id ?? "missing";`,
        ),
        "  const result = await api.submit({ ...payload, idempotencyKey });",
        "  return { id: result.id };",
        "}",
      ];
      await writeFile(path.join(dir, "large.ts"), lines.join("\n"));

      const minimal = runTk(["read", "--level", "minimal", "large.ts"], dir);
      const balanced = runTk(["read", "--level", "balance", "large.ts"], dir);
      const aggressive = runTk(["read", "--level", "aggressive", "large.ts"], dir);

      expect(minimal.status).toBe(0);
      expect(balanced.status).toBe(0);
      expect(aggressive.status).toBe(0);
      expect(minimal.stdout).toContain("idempotencyKey");
      expect(minimal.stdout).toContain("filler259");
      expect(minimal.stdout).toContain("checkpoint79");
      expect(minimal.stdout).toContain("return { id: result.id };");
      expect(balanced.stdout).toContain("filler259");
      expect(balanced.stdout).toContain("submitOrder");
      expect(aggressive.stdout).toContain("export async function submitOrder");
      expect(aggressive.stdout).not.toContain("idempotencyKey");
      expect(aggressive.stdout.length).toBeLessThan(minimal.stdout.length);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("ctx read supports RTK tail-lines window", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "ctx-read-tail-"));
    try {
      await writeFile(path.join(dir, "sample.txt"), "alpha\nbravo\ncharlie\ndelta\n");

      const result = runTk(["read", "--tail-lines", "2", "sample.txt"], dir);

      expect(result.status).toBe(0);
      expect(result.stdout).toBe("charlie\ndelta\n");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("ctx read supports RTK max-lines with line numbers", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "ctx-read-lines-"));
    try {
      await writeFile(
        path.join(dir, "sample.txt"),
        ["alpha", ...Array.from({ length: 19 }, (_, index) => `line-${index}`)].join("\n") + "\n",
      );

      const result = runTk(["read", "--max-lines", "2", "--line-numbers", "sample.txt"], dir);

      expect(result.status).toBe(0);
      expect(result.stdout).toBe("1 | alpha\n2 | line-0\n");
      expect(result.stdout).not.toContain("line-18");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("ctx read supports RTK stdin dash input", () => {
    const result = runTk(["read", "-", "--tail-lines", "2"], repoRoot, "alpha\nbravo\ncharlie\n");

    expect(result.status).toBe(0);
    expect(result.stdout).toBe("bravo\ncharlie\n");
  });

  test("ctx read warns when stdin is specified more than once", () => {
    const result = runTk(["read", "-", "-"], repoRoot, "alpha\nbravo\n");

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("alpha");
    expect(result.stdout).toContain("rtk: warning: stdin specified more than once");
  });

  test("ctx read keeps valid content and reports missing files", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "ctx-read-missing-"));
    try {
      await writeFile(path.join(dir, "valid.txt"), "valid content\n");

      const result = runTk(["read", "valid.txt", "missing.txt"], dir);

      expect(result.status).toBe(1);
      expect(result.stdout).toContain("valid content");
      expect(result.stdout).toContain("cat: missing.txt:");
      expect(result.stdout).toContain("No such file or directory");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

// ============================================================================
// 4. Git
// ============================================================================

describe("Git", () => {
  test("ctx git status works in git repo", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "ctx-git-status-"));
    try {
      gitInit(dir);
      await writeFile(path.join(dir, "file.txt"), "content");
      spawnSync("git", ["add", "file.txt"], { cwd: dir });
      spawnSync("git", ["commit", "-m", "init"], { cwd: dir });
      await writeFile(path.join(dir, "file.txt"), "changed");
      await writeFile(path.join(dir, "new.txt"), "untracked");

      const result = runTk(["git", "status"], dir);
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("* main");
      expect(result.stdout).toContain(" M file.txt");
      expect(result.stdout).toContain("?? new.txt");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("ctx git log works", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "ctx-git-log-"));
    try {
      gitInit(dir);
      await writeFile(path.join(dir, "f.txt"), "v1");
      spawnSync("git", ["add", "f.txt"], { cwd: dir });
      spawnSync("git", ["commit", "-m", "first"], { cwd: dir });

      const result = runTk(["git", "log", "-1"], dir);
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("first");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("ctx git diff works", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "ctx-git-diff-"));
    try {
      gitInit(dir);
      const before = Array.from({ length: 80 }, (_, index) => `line-${index}`).join("\n");
      const after = Array.from({ length: 80 }, (_, index) =>
        index % 4 === 0 ? `changed-${index}` : `line-${index}`,
      ).join("\n");
      await writeFile(path.join(dir, "f.txt"), before);
      spawnSync("git", ["add", "f.txt"], { cwd: dir });
      spawnSync("git", ["commit", "-m", "init"], { cwd: dir });
      await writeFile(path.join(dir, "f.txt"), after);

      const result = runTk(["git", "diff"], dir);
      expect(result.status).toBe(0);
      // RTK-aligned git-diff emits only the condensed changes (no diffstat header).
      expect(result.stdout).toContain("f.txt");
      expect(result.stdout).toContain("@@");
      expect(result.stdout).toContain("-line-0");
      expect(result.stdout).toContain("+changed-0");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("ctx diff shows file metadata line numbers and aligned insertions", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "ctx-diff-"));
    try {
      const before = [
        "export function main() {",
        "  const unchanged1 = 1;",
        "  const unchanged2 = 2;",
        "  const unchanged3 = 3;",
        "}",
      ].join("\n");
      const after = [
        "export function main() {",
        "  const timeoutMs = 5000;",
        "  const unchanged1 = 1;",
        "  const unchanged2 = 2;",
        "  const unchanged3 = 3;",
        "}",
      ].join("\n");
      await writeFile(path.join(dir, "old.ts"), `${before}\n`);
      await writeFile(path.join(dir, "new.ts"), `${after}\n`);

      const result = runTk(["diff", "old.ts", "new.ts"], dir);
      // H8: ctx now propagates GNU diff's exit code — 1 when files differ (was always
      // 0, which broke every "did it change?" check).
      expect(result.status).toBe(1);
      expect(result.stdout).toContain("old.ts -> new.ts (+1 -0)");
      expect(result.stdout).toContain("+   const timeoutMs = 5000;");
      expect(result.stdout).not.toContain("-  const unchanged");
      expect(result.stdout).not.toContain("+  const unchanged");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("ctx git branch works", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "ctx-git-branch-"));
    try {
      gitInit(dir);
      await writeFile(path.join(dir, "f.txt"), "v1");
      spawnSync("git", ["add", "f.txt"], { cwd: dir });
      spawnSync("git", ["commit", "-m", "init"], { cwd: dir });

      const result = runTk(["git", "branch"], dir);
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("main");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

// ============================================================================
// 5. Grep / Search
// ============================================================================

describe("Grep / Search", () => {
  test("ctx rg finds matches", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "ctx-rg-"));
    try {
      await writeFile(path.join(dir, "a.ts"), "export const x = 1;\nconst y = 2;\n");
      await writeFile(path.join(dir, "b.ts"), "import { x } from './a';\nexport default x;\n");

      const result = runTk(["rg", "export", "."], dir);
      expect(result.status).toBe(0);
      // Should find matches (not "0 across 0 files" — the bug!)
      expect(result.stdout).toContain("export");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("ctx grep finds matches", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "ctx-grep-"));
    try {
      await writeFile(path.join(dir, "package.json"), '{"name":"sample"}\n');
      await writeFile(path.join(dir, "README.md"), "package.json is retained\n");

      const result = runTk(["grep", "-r", "package.json", "."], dir);

      expect(result.status).toBe(0);
      expect(result.stdout).toContain("README.md");
      expect(result.stdout).toContain("package.json is retained");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("ctx rg with no matches shows 0 matches message", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "ctx-rg-nomatch-"));
    try {
      await writeFile(path.join(dir, "a.ts"), "const x = 1;\n");

      const result = runTk(["rg", "NoSuchPattern_XYZ123", "."], dir);
      expect(result.stdout).toContain("matches");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  // Regression: `ctx rg PATTERN` with NO path operand reported a false "0 matches".
  // Root cause: the executor gave the spawned child a PIPE for stdin
  // (executor.ts `process.stdin.pipe(child.stdin)`). ripgrep, given no path operand,
  // searches the cwd UNLESS its stdin is a readable pipe/file — so the empty pipe
  // flipped rg into "search stdin", it read EOF, and reported nothing. Native rg with
  // a tty or /dev/null stdin (every real agent context) recurses the cwd and finds the
  // match; ctx manufactured the one stdin shape that defeats it. Surfaced in dogfood as a
  // "ctx rg glob bug / 假 0-match" because `-g`/`--glob` is what users pass INSTEAD of a
  // path, so the glob was incidental. rg is the ONLY wrapped tool with this cwd-fallback
  // heuristic — grep/cat/wc read stdin natively too, so ctx mirrors them (verified). The
  // existing tests above all pass an explicit "." and never exercised this path.
  test("ctx rg with no path operand searches the cwd (not empty stdin)", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "ctx-rg-nopath-"));
    try {
      await writeFile(path.join(dir, "a.ts"), 'import "github.com/acme/foo";\n');

      // No path argument — the user relies on rg's default "recurse the cwd".
      const result = runTk(["rg", "acme"], dir);

      expect(result.stdout).not.toContain("0 matches");
      expect(result.stdout).toContain("acme");
      expect(result.status).toBe(0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  // The exact dogfood symptom: a glob (`-g`) scoping the search with no path operand.
  test("ctx rg -g <glob> with no path operand finds matches (reported glob bug)", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "ctx-rg-glob-"));
    try {
      await mkdir(path.join(dir, "src"));
      await writeFile(path.join(dir, "src", "a.ts"), 'import "github.com/acme/foo";\n');

      const result = runTk(["rg", "-g", "*.ts", "acme"], dir);

      expect(result.stdout).not.toContain("0 matches");
      expect(result.stdout).toContain("acme");
      expect(result.status).toBe(0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

// ============================================================================
// 6. Generic Passthrough
// ============================================================================

// Post-U2 hardening these run as shim-invoked (the shell resolved a real tool
// through the shim → CTX_SHIM_DIR set); a DIRECT `ctx echo` now errors instead.
describe("Generic Passthrough (shim-invoked)", () => {
  test("ctx echo passes through output", () => {
    const result = runTk(["echo", "hello world"], repoRoot, undefined, undefined, SHIM_INVOKED);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("hello world");
  });

  test("ctx node -e passes through output", () => {
    const result = runTk(
      ["node", "-e", "console.log('rtk-style')"],
      repoRoot,
      undefined,
      undefined,
      SHIM_INVOKED,
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("rtk-style");
  });

  test("unknown commands pass through with generic handler", () => {
    const result = runTk(["printf", "abc"], repoRoot, undefined, undefined, SHIM_INVOKED);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("abc");
  });
});

// ============================================================================
// 7. Global Flags
// ============================================================================

describe("Global Flags", () => {
  test("--stats prints token savings", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "ctx-stats-"));
    try {
      await writeFile(path.join(dir, "sample.txt"), "alpha\nbeta\n");

      const result = runTk(["--stats", "cat", "sample.txt"], dir);
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("## Token Savings");
      expect(result.stdout).toContain("Raw:");
      expect(result.stdout).toContain("Output:");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("--stats --save-raw prints raw path and writes raw log", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "ctx-save-raw-"));
    const tkHome = path.join(dir, "contexa-data");
    try {
      await writeFile(path.join(dir, "sample.txt"), "alpha\nbeta\n");

      const result = runTk(["--stats", "--save-raw", "cat", "sample.txt"], dir, undefined, tkHome);
      process.env.CONTEXA_HOME = tkHome;
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("## Token Savings");

      const history = await readFile(historyFile(dir), "utf8");
      const record = JSON.parse(history.trim()) as { raw_output_path: string };
      // Platform-tolerant: Windows uses `\` separators and sanitizes the ':' in the
      // fingerprint to '-' (fingerprintSegment), so accept either separator and ':'/'-'.
      expect(record.raw_output_path).toMatch(/^projects[/\\]repo[:-][a-f0-9]{12}[/\\]raw[/\\]/);

      const rawLog = await readFile(resolveStoredPath(record.raw_output_path), "utf8");
      expect(rawLog).toContain("Command: cat sample.txt");
      expect(rawLog).toContain("--- STDOUT ---");
    } finally {
      delete process.env.CONTEXA_HOME;
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("--raw bypasses filtering", () => {
    const raw = runTk(["--raw", process.execPath, "-e", "console.log('raw retained')"], repoRoot);
    expect(raw.stdout).toBe("raw retained\n");
  });

  test("--raw streams via inherited stdio and records an honest light history row", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "ctx-raw-history-"));
    const tkHome = path.join(dir, "contexa-data");
    try {
      const result = runTk(
        ["--raw", process.execPath, "-e", "console.log('raw retained')"],
        dir,
        undefined,
        tkHome,
      );
      process.env.CONTEXA_HOME = tkHome;
      expect(result.status).toBe(0);
      // Streamed verbatim through the inherited stdout — no capture/reprint.
      expect(result.stdout).toBe("raw retained\n");

      const history = await readFile(historyFile(dir), "utf8");
      const record = JSON.parse(history.trim()) as Record<string, unknown>;
      expect(record.handler).toBe("raw");
      expect(record.exit_code).toBe(0);
      expect(typeof record.duration_ms).toBe("number");
      // No fabricated byte/token counts: the streaming path captured nothing, so the
      // size fields are absent on disk rather than written as fake zeros.
      expect(record.raw_chars).toBeUndefined();
      expect(record.output_chars).toBeUndefined();
      expect(record.raw_tokens).toBeUndefined();
      expect(record.output_tokens).toBeUndefined();
      expect(record.saved_tokens).toBeUndefined();
      expect(record.savings_pct).toBeUndefined();
    } finally {
      delete process.env.CONTEXA_HOME;
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("--raw preserves a non-zero exit code while streaming", () => {
    const result = runTk(["--raw", process.execPath, "-e", "process.exit(7)"], repoRoot);
    expect(result.status).toBe(7);
  });

  test("--raw --stats reports the savings summary on stderr, stdout stays verbatim", () => {
    const result = runTk(
      ["--raw", "--stats", process.execPath, "-e", "console.log('verbatim out')"],
      repoRoot,
    );
    expect(result.status).toBe(0);
    // stdout is byte-verbatim — the stats summary must NOT contaminate it.
    expect(result.stdout).toBe("verbatim out\n");
    expect(result.stdout).not.toContain("Token Savings");
    // The summary it forced the capture for is actually emitted (on stderr).
    expect(result.stderr).toContain("## Token Savings");
    expect(result.stderr).toContain("Saved:");
  });

  test("--raw --save-raw captures the bytes and records a full history row", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "ctx-raw-capture-"));
    const tkHome = path.join(dir, "contexa-data");
    try {
      const result = runTk(
        ["--raw", "--save-raw", process.execPath, "-e", "console.log('captured')"],
        dir,
        undefined,
        tkHome,
      );
      process.env.CONTEXA_HOME = tkHome;
      expect(result.status).toBe(0);
      expect(result.stdout).toBe("captured\n");

      const history = await readFile(historyFile(dir), "utf8");
      const record = JSON.parse(history.trim()) as Record<string, unknown>;
      expect(record.handler).toBe("raw");
      // --save-raw forces the capture path, so the size fields are present and real.
      expect(typeof record.raw_chars).toBe("number");
      expect(record.saved_tokens).toBe(0);
      expect(record.savings_pct).toBe(0);
      expect(typeof record.raw_output_path).toBe("string");
    } finally {
      delete process.env.CONTEXA_HOME;
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("--stats shows raw output path", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "ctx-stats-"));
    try {
      await writeFile(path.join(dir, "sample.txt"), "alpha\n");

      const result = runTk(["--stats", "--save-raw", "cat", "sample.txt"], dir);
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("Raw output:");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

// ============================================================================
// 8. Error Handling
// ============================================================================

describe("Error Handling", () => {
  test("ctx with no command prints the usage summary and exits 0", () => {
    const result = runTk([], repoRoot);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("ctx — Contexa");
    expect(result.stdout).toContain("Commands:");
    expect(result.stdout).toContain("Diagnose install + metrics health");
    expect(result.stdout).not.toContain("Read-only — writes nothing");
  });

  test("ctx with flags but no command (piped misuse) prints a one-line hint, not the banner", () => {
    // `cmd | ctx --max-lines N` — an agent piped output expecting compression. ctx does
    // not read stdin (ADR 0007); it must NOT answer with the ~20-line usage banner.
    const result = runTk(["--max-lines", "2"], repoRoot, "l1\nl2\nl3\nl4\n");
    expect(result.status).toBe(0);
    expect(result.stdout).not.toContain("ctx — Contexa");
    expect(result.stdout).not.toContain("Commands:");
    expect(result.stderr).toContain("ctx <command>");
    expect(result.stderr).toContain("piping");
  });

  test("preserves original command exit code", () => {
    const result = runTk(
      [process.execPath, "-e", "process.exit(7)"],
      repoRoot,
      undefined,
      undefined,
      SHIM_INVOKED,
    );
    expect(result.status).toBe(7);
  });

  test("passes through exit code 0", () => {
    const result = runTk(
      [process.execPath, "-e", "process.exit(0)"],
      repoRoot,
      undefined,
      undefined,
      SHIM_INVOKED,
    );
    expect(result.status).toBe(0);
  });

  test("preserves stderr from failed commands", () => {
    // `node` is a generic command (no specific handler) → passthrough with
    // inherited stdio, so stderr stays on stderr (stream separation preserved)
    // rather than being captured and reprinted to stdout. Shim-invoked (post-U2).
    const result = runTk(
      [process.execPath, "-e", "console.error('error msg'); process.exit(1)"],
      repoRoot,
      undefined,
      undefined,
      SHIM_INVOKED,
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("error msg");
  });
});

// Removed the "Acceptance: Handler Routing" block: it spawned 8 real commands and
// only string-matched their output, which never proved a SPECIFIC handler was used
// (generic passthrough would pass the same assertions). Routing is verified
// explicitly in tests/unit/router.test.ts (command → handler name for all of git
// status/diff/log/show/branch, cat, ls, rg), and the end-to-end output is covered
// by the Git/Grep sections above, the smoke suite, and the handler fixture tests.

// ============================================================================
// 10. Python / JS / Java handlers (stderr-based output)
// ============================================================================

describe("Language-specific handlers", () => {
  test("tsc handler shows grouped errors", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "ctx-tsc-"));
    try {
      // Create a TS file with a type error
      await writeFile(path.join(dir, "error.ts"), "const x: number = 'string';\n");
      await writeFile(
        path.join(dir, "tsconfig.json"),
        '{"compilerOptions":{"strict":true,"noEmit":true}}\n',
      );

      const result = runTk(["tsc", "--noEmit"], dir);
      // Should not crash, show TypeScript output
      expect(result.stdout).toContain("TS2322");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("npm test handler routes test runners", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "ctx-npm-test-"));
    try {
      await writeFile(
        path.join(dir, "package.json"),
        '{"name":"test","scripts":{"test":"echo test-output"}}\n',
      );

      const result = runTk(["npm", "test"], dir);
      expect(result.status).toBe(0);
      // Should route to js-test handler
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("npm list handler shows dependencies", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "ctx-npm-list-"));
    try {
      await writeFile(
        path.join(dir, "package.json"),
        '{"name":"test","dependencies":{"kept":"^1.0.0","noise":"^2.0.0"}}\n',
      );

      const result = runTk(["npm", "list", "--depth=0"], dir);
      expect(result.stdout).toContain("Problems:");
      expect(result.stdout).toContain("kept");
    } finally {
      // `ctx npm list` spawns a child npm process that can briefly hold a handle
      // on the temp dir after exit; on Windows that surfaces as EBUSY on rmdir.
      // Retry so the lingering handle clears instead of failing the teardown.
      await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    }
  });
});
