import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import { vscodeSettingsPath, vscodeUserDir } from "../../../src/shim/hostConfig.js";
import { runInstall, runStatus, runUninstall } from "../../../src/shim/init.js";

// Sandboxed coverage for `tk install` / `tk uninstall` / `tk status` (the CLI
// surface that replaced `tk init`, U1+U2). HOME points at a temp dir so every
// write (shim dir, RC, VS Code settings, injection file) lands inside the sandbox.
//
// Two altitudes, by design:
//   • A handful of BOUNDARY tests (`runTg`) spawn the real `tk` binary to prove
//     the cli.ts dispatch — verb → runInstall/runUninstall/runStatus, exit-code
//     propagation, and the removed-`init` stderr path — actually wires up.
//   • Every BEHAVIOR test calls runInstall/runUninstall/runStatus IN-PROCESS
//     (`callDirect`). The functions read HOME / TOKEN_KILLER_HOME / detect-env /
//     cwd at call time and write via process.stdout.write, so an in-process call
//     with a sandboxed env + captured streams exercises the identical code path
//     ~50× faster than a fresh `node --import tsx` per assertion.

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const cli = join(repoRoot, "src/cli.ts");
const tsxLoader = join(repoRoot, "node_modules/tsx/dist/loader.mjs");

let home: string;

// Restricted PATH for in-process calls: keep node (for execPath-based shim work)
// and the system bin (git, etc.), but DROP Homebrew so the preflight's bare-name
// probes (`copilot --version`, `pwsh --version`) hit a fast ENOENT instead of
// actually executing those CLIs (~0.45s each, several times over). Host detection
// keys off env markers / dotdirs — never PATH — so this changes nothing the tests
// assert. The real preflight path still runs end-to-end under the boundary spawn
// tests (full inherited PATH).
const SANDBOX_PATH = [dirname(process.execPath), "/usr/bin", "/bin"].join(delimiter);

// Boundary harness: spawn the real CLI through tsx. Reserved for the few tests
// that must prove cli.ts dispatch / process exit codes, not handler behavior.
function runTg(args: string[], env: NodeJS.ProcessEnv = {}, cwd = repoRoot) {
  return spawnSync(process.execPath, ["--import", tsxLoader, cli, ...args], {
    cwd,
    encoding: "utf8",
    timeout: 20000,
    env: {
      ...process.env,
      HOME: home,
      TOKEN_KILLER_HOME: join(home, ".token-killer"),
      // The suite itself runs inside Claude Code, which sets these markers; clear
      // them by default so host auto-detection reflects each test's intent. The
      // claude-code tests force the host explicitly or set these back on.
      CLAUDECODE: "",
      CLAUDE_CODE_ENTRYPOINT: "",
      ...env,
    },
  });
}

type DirectResult = { status: number; stdout: string; stderr: string };

// Direct harness: run an install/uninstall/status entrypoint IN-PROCESS with the
// same sandboxed environment runTg would hand a child, capturing stdout/stderr.
//
// Env MUST be mutated key-by-key (not via `process.env = {...}`): os.homedir() is
// resolved by libuv from the real OS environment, which only `process.env.HOME = x`
// (setenv) updates — replacing the whole object would leave homedir() reading the
// outer HOME. Tests run sequentially within a file, so the global env/cwd swap is
// race-free, and `finally` restores both even when an assertion throws.
//
// `argv` is the post-verb sub-argument list (what cli.ts passes as parsed.subArgs):
// `tk install --host vscode` → callDirect(runInstall, ["--host", "vscode"]).
function callDirect(
  fn: (argv: string[]) => number,
  argv: string[],
  env: NodeJS.ProcessEnv = {},
  cwd?: string,
): DirectResult {
  const overrides: NodeJS.ProcessEnv = {
    HOME: home,
    TOKEN_KILLER_HOME: join(home, ".token-killer"),
    PATH: SANDBOX_PATH,
    CLAUDECODE: "",
    CLAUDE_CODE_ENTRYPOINT: "",
    ...env,
  };
  const keys = Object.keys(overrides);
  const savedEnv: Record<string, string | undefined> = {};
  for (const key of keys) savedEnv[key] = process.env[key];
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }

  const outChunks: string[] = [];
  const errChunks: string[] = [];
  const origOut = process.stdout.write.bind(process.stdout);
  const origErr = process.stderr.write.bind(process.stderr);
  process.stdout.write = ((chunk: unknown) => {
    outChunks.push(String(chunk));
    return true;
  }) as typeof process.stdout.write;
  process.stderr.write = ((chunk: unknown) => {
    errChunks.push(String(chunk));
    return true;
  }) as typeof process.stderr.write;

  const savedCwd = process.cwd();
  if (cwd) process.chdir(cwd);

  let status: number;
  try {
    status = fn(argv);
  } finally {
    if (cwd) process.chdir(savedCwd);
    process.stdout.write = origOut;
    process.stderr.write = origErr;
    for (const key of keys) {
      if (savedEnv[key] === undefined) delete process.env[key];
      else process.env[key] = savedEnv[key];
    }
  }

  return { status, stdout: outChunks.join(""), stderr: errChunks.join("") };
}

const install = (argv: string[], env?: NodeJS.ProcessEnv, cwd?: string) =>
  callDirect(runInstall, argv, env, cwd);
const uninstall = (argv: string[], env?: NodeJS.ProcessEnv, cwd?: string) =>
  callDirect(runUninstall, argv, env, cwd);
const status = (env?: NodeJS.ProcessEnv) => callDirect(runStatus, [], env);

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "tk-init-"));
});
afterEach(() => {
  rmSync(home, { recursive: true, force: true });
});

describe("tk install", () => {
  // BOUNDARY: proves the real `tk install` binary dispatches to runInstall, exits
  // 0, and writes a real artifact end-to-end. The remaining install behaviors are
  // unit-tested in-process below.
  test("unknown host → instruction injection at user level (CLI boundary)", () => {
    const result = runTg(["install"], {
      PATH: "/usr/bin:/bin",
      TERM_PROGRAM: "",
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Detected host: unknown");
    expect(result.stdout).toContain("Active tier: injection");
    const injected = join(home, ".token-killer", "copilot-instructions.md");
    expect(existsSync(injected)).toBe(true);
    expect(readFileSync(injected, "utf8")).toContain("Token Killer");
  });

  // ADR 0012: VS Code is additive — the shim stays PRIMARY and the hook is layered
  // on top. So the install reports BOTH, and the shim wrappers + the shared hook
  // config (~/.copilot/hooks/tk-rewrite.json) are both written.
  test("--host vscode → shim (primary) + additive hook", () => {
    // VS Code user dir present so settings.json gets patched.
    mkdirSync(join(home, "Library", "Application Support", "Code", "User"), { recursive: true });
    mkdirSync(join(home, ".config", "Code", "User"), { recursive: true });

    const result = install(["--host", "vscode"]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Active tier: shim (primary) + hook (additive)");
    // Primary shim.
    expect(existsSync(join(home, ".token-killer", "shim", "git"))).toBe(true);
    // Additive hook — the SAME shared file the Copilot CLI writer targets.
    expect(existsSync(join(home, ".copilot", "hooks", "tk-rewrite.json"))).toBe(true);
  });

  // ADR 0012 / issue #22 acceptance: `tk install --host vscode` reports BOTH the
  // hook config wiring AND the shim probe. --dry-run for determinism (no probe side
  // effects, byte-stable output) — it must preview both and write nothing.
  test("--host vscode --dry-run reports BOTH the hook config and the shim", () => {
    mkdirSync(vscodeUserDir(process.platform, home), { recursive: true });
    const result = install(["--host", "vscode", "--dry-run"]);
    expect(result.status).toBe(0);
    // Additive hook wiring (shared ~/.copilot/hooks/tk-rewrite.json) is reported.
    expect(result.stdout).toContain("Additive hook");
    expect(result.stdout).toContain("VS Code hook config");
    expect(result.stdout).toMatch(/tk-rewrite\.json/);
    // The primary shim is reported alongside it.
    expect(result.stdout).toContain("would install shim");
    expect(result.stdout).toContain("Active tier: shim (primary) + hook (additive)");
    // --dry-run writes nothing.
    expect(existsSync(join(home, ".copilot", "hooks", "tk-rewrite.json"))).toBe(false);
    expect(existsSync(join(home, ".token-killer", "shim", "git"))).toBe(false);
  });

  // R1: the VS Code install must write TK_COMPRESS_TTY=1 into the integrated
  // terminal env so the agent's (TTY) commands actually compress.
  test("--host vscode writes TK_COMPRESS_TTY=1 into terminal.integrated.env; uninstall removes it", () => {
    mkdirSync(vscodeUserDir(process.platform, home), { recursive: true });
    const settingsPath = vscodeSettingsPath(process.platform, home);
    const envKey =
      process.platform === "darwin" ? "osx" : process.platform === "win32" ? "windows" : "linux";

    install(["--host", "vscode"]);
    const settings = JSON.parse(readFileSync(settingsPath, "utf8"));
    const envBlock = settings[`terminal.integrated.env.${envKey}`];
    expect(envBlock.TK_COMPRESS_TTY).toBe("1");
    expect(envBlock.TK_SHIM_DIR).toBeTruthy();

    uninstall([]);
    const after = JSON.parse(readFileSync(settingsPath, "utf8"));
    const afterBlock = after[`terminal.integrated.env.${envKey}`];
    expect(afterBlock?.TK_COMPRESS_TTY).toBeUndefined();
  });

  test("--project writes the repo instruction file (the only repo write)", () => {
    const project = mkdtempSync(join(tmpdir(), "tk-init-project-"));
    try {
      const result = install(["--project", "--host", "vscode"], {}, project);
      expect(result.status).toBe(0);
      const projectFile = join(project, ".github", "copilot-instructions.md");
      expect(existsSync(projectFile)).toBe(true);
      expect(readFileSync(projectFile, "utf8")).toContain("Token Killer");
    } finally {
      rmSync(project, { recursive: true, force: true });
    }
  });

  test("--host copilot-cli → hook tier, writes user-level hook config", () => {
    const result = install(["--host", "copilot-cli"]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Active tier: hook");
    const cfg = join(home, ".copilot", "hooks", "tk-rewrite.json");
    expect(existsSync(cfg)).toBe(true);
    const parsed = JSON.parse(readFileSync(cfg, "utf8"));
    // Audit #13: an absolute node + cli path (not a bare PATH-dependent `tk`).
    expect(parsed.hooks.PreToolUse[0].command.endsWith("hook copilot")).toBe(true);
  });

  // I4: copilot reads only copilot-instructions.md (no import syntax), so the
  // standalone ~/.copilot/TK.md must NOT be written.
  test("--host copilot-cli inlines guidance, writes no standalone TK.md", () => {
    install(["--host", "copilot-cli"]);
    expect(existsSync(join(home, ".copilot", "TK.md"))).toBe(false);
    const instr = readFileSync(join(home, ".copilot", "copilot-instructions.md"), "utf8");
    expect(instr).toContain("git status --short");
  });

  test("copilot-cli auto-detected (~/.copilot exists) → hook tier", () => {
    mkdirSync(join(home, ".copilot"), { recursive: true });
    const result = install([]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Detected host: copilot-cli");
    expect(result.stdout).toContain("Active tier: hook");
  });

  test("auto-detect does not STOP at vscode — also wires copilot-cli when ~/.copilot exists", () => {
    // VS Code primary (its terminal sets TERM_PROGRAM=vscode), and Copilot CLI is
    // also installed (~/.copilot). install must wire BOTH, not just the primary.
    mkdirSync(vscodeUserDir(process.platform, home), { recursive: true });
    mkdirSync(join(home, ".copilot"), { recursive: true });
    const result = install([], { TERM_PROGRAM: "vscode" });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Detected host: vscode");
    expect(result.stdout).toContain("Also wiring copilot-cli");
    expect(existsSync(join(home, ".token-killer", "shim", "git"))).toBe(true);
    expect(existsSync(join(home, ".copilot", "hooks", "tk-rewrite.json"))).toBe(true);
  });

  test("a forced --host stays single-host (no secondary wiring)", () => {
    mkdirSync(join(home, ".copilot"), { recursive: true });
    mkdirSync(vscodeUserDir(process.platform, home), { recursive: true });
    const result = install(["--host", "vscode"]);
    expect(result.status).toBe(0);
    // No SECONDARY-host wiring under a forced --host. ADR 0012: vscode now writes the
    // shared ~/.copilot/hooks/tk-rewrite.json as its OWN additive hook, so the file
    // exists — but the distinguishing signal of single-host is that there is no
    // "Also wiring <other-host>" line (the additive hook is vscode's, not copilot's).
    expect(result.stdout).not.toContain("Also wiring");
  });

  test("--host copilot-cli --dry-run writes nothing", () => {
    const result = install(["--host", "copilot-cli", "--dry-run"]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("[dry-run]");
    expect(existsSync(join(home, ".copilot", "hooks", "tk-rewrite.json"))).toBe(false);
  });

  test("--host claude-code → hook tier, patches ~/.claude/settings.json", () => {
    const result = install(["--host", "claude-code"]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Active tier: hook");
    const cfg = join(home, ".claude", "settings.json");
    expect(existsSync(cfg)).toBe(true);
    const parsed = JSON.parse(readFileSync(cfg, "utf8"));
    const cmd = parsed.hooks.PreToolUse[0].hooks[0].command;
    expect(cmd.endsWith("hook claude")).toBe(true);
    expect(cmd.startsWith("tk ")).toBe(false); // absolute node + cli, not bare tk
  });

  test("claude-code drop-in: replaces an existing rtk hook claude in place", () => {
    mkdirSync(join(home, ".claude"), { recursive: true });
    writeFileSync(
      join(home, ".claude", "settings.json"),
      JSON.stringify(
        {
          hooks: {
            PreToolUse: [
              { matcher: "Bash", hooks: [{ type: "command", command: "rtk hook claude" }] },
            ],
          },
          statusLine: { type: "command", command: "sh /x/s.sh" },
          enabledPlugins: { "codex@openai-codex": true },
        },
        null,
        2,
      ),
    );
    const result = install(["--host", "claude-code"]);
    expect(result.status).toBe(0);
    const parsed = JSON.parse(readFileSync(join(home, ".claude", "settings.json"), "utf8"));
    expect(parsed.hooks.PreToolUse).toHaveLength(1);
    expect(parsed.hooks.PreToolUse[0].hooks[0].command).not.toBe("rtk hook claude");
    expect(parsed.hooks.PreToolUse[0].hooks[0].command.endsWith("hook claude")).toBe(true);
    // surgical: unrelated keys preserved
    expect(parsed.statusLine).toEqual({ type: "command", command: "sh /x/s.sh" });
    expect(parsed.enabledPlugins).toEqual({ "codex@openai-codex": true });
  });

  test("claude-code auto-detected from a live env marker", () => {
    const result = install([], { CLAUDECODE: "1" });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Detected host: claude-code");
    expect(result.stdout).toContain("Active tier: hook");
  });

  test("claude-code writes the usage guide (TK.md) + wires @TK.md into CLAUDE.md; -g is a no-op", () => {
    const result = install(["--host", "claude-code", "-g"]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Active tier: hook");
    // tk drops a usage guide and references it from the auto-loaded CLAUDE.md so
    // the agent reads it. -g (stray rtk muscle memory) changes nothing.
    expect(existsSync(join(home, ".claude", "TK.md"))).toBe(true);
    expect(readFileSync(join(home, ".claude", "CLAUDE.md"), "utf8")).toContain("@TK.md");
  });

  test("claude-code --dry-run writes nothing", () => {
    const result = install(["--host", "claude-code", "--dry-run"]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("[dry-run]");
    expect(existsSync(join(home, ".claude", "settings.json"))).toBe(false);
    expect(existsSync(join(home, ".claude", "TK.md"))).toBe(false);
  });

  // Issue #26: a NON-copilot host must not persist the Copilot CLI version. install
  // --host claude-code once stamped hostVersion="GitHub Copilot CLI 1.x" because the
  // recorder ran the copilot `--version` preflight unconditionally for every host.
  test("--host claude-code records NO Copilot CLI version in delivery-state", () => {
    const result = install(["--host", "claude-code"]);
    expect(result.status).toBe(0);
    const state = JSON.parse(
      readFileSync(join(home, ".token-killer", "delivery-state.json"), "utf8"),
    );
    expect(state.installedHost).toBe("claude-code");
    // No copilot version leaks in, and no host version is claimed at all (claude-code
    // has no host-specific version probe yet — honest "not recorded").
    expect(state.hostVersion ?? "").not.toMatch(/copilot/i);
    expect(state.hostVersion).toBeUndefined();
  });
});

describe("tk uninstall", () => {
  // BOUNDARY: proves the real `tk uninstall` binary dispatches to runUninstall and
  // tears down a prior real install end-to-end.
  test("removes the hook config (CLI boundary)", () => {
    runTg(["install", "--host", "copilot-cli"]);
    const cfg = join(home, ".copilot", "hooks", "tk-rewrite.json");
    expect(existsSync(cfg)).toBe(true);
    const result = runTg(["uninstall"]);
    expect(result.status).toBe(0);
    expect(existsSync(cfg)).toBe(false);
  });

  test("claude-code: removes the tk hook entry and the usage guide", () => {
    install(["--host", "claude-code"]);
    expect(existsSync(join(home, ".claude", "settings.json"))).toBe(true);
    expect(existsSync(join(home, ".claude", "TK.md"))).toBe(true);
    const result = uninstall([]);
    expect(result.status).toBe(0);
    const parsed = JSON.parse(readFileSync(join(home, ".claude", "settings.json"), "utf8"));
    expect(parsed.hooks.PreToolUse).toEqual([]);
    expect(existsSync(join(home, ".claude", "TK.md"))).toBe(false);
  });

  // Regression: `--project` once nuked the user-level install too (it removed
  // everything, then ADDED project removals). Cleaning up a project test must
  // leave the user's claude-code hook and other user tiers intact.
  test("--project removes only repo artifacts, not the user install", () => {
    const project = mkdtempSync(join(tmpdir(), "tk-init-project-"));
    try {
      // User-level claude-code install.
      install(["--host", "claude-code"]);
      const userHook = join(home, ".claude", "settings.json");
      expect(existsSync(userHook)).toBe(true);
      // Project-level copilot install in the repo.
      install(["--project", "--host", "copilot-cli"], {}, project);
      const projectCfg = join(project, ".github", "hooks", "tk-rewrite.json");
      const projectInjection = join(project, ".github", "copilot-instructions.md");
      expect(existsSync(projectCfg)).toBe(true);

      const result = uninstall(["--project"], {}, project);
      expect(result.status).toBe(0);
      // Project artifacts gone — including the now-empty hooks/ dir and the
      // injection-only instructions file (no 0-byte leftover).
      expect(existsSync(projectCfg)).toBe(false);
      expect(existsSync(join(project, ".github", "hooks"))).toBe(false);
      expect(existsSync(projectInjection)).toBe(false);
      // User-level install untouched.
      expect(existsSync(userHook)).toBe(true);
      expect(readFileSync(userHook, "utf8")).toContain("hook claude");
    } finally {
      rmSync(project, { recursive: true, force: true });
    }
  });

  // Regression: `--dry-run` once IGNORED dry-run and actually deleted everything
  // while printing "removed". It must preview only — touch nothing.
  test("--dry-run previews without deleting anything", () => {
    install(["--host", "copilot-cli"]);
    const cfg = join(home, ".copilot", "hooks", "tk-rewrite.json");
    expect(existsSync(cfg)).toBe(true);

    const result = uninstall(["--dry-run"]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("[dry-run]");
    expect(result.stdout).toContain("would remove");
    expect(result.stdout).not.toMatch(/^(?!.*\[dry-run]).*\bremoved\b/m);
    // The config the real uninstall deletes is still present.
    expect(existsSync(cfg)).toBe(true);
  });

  // G2: data is preserved by default; --purge-data wipes the metrics tree.
  test("preserves ~/.token-killer/projects by default; --purge-data removes it", () => {
    const projects = join(home, ".token-killer", "projects", "repo-deadbeef");
    mkdirSync(projects, { recursive: true });
    writeFileSync(join(projects, "history.jsonl"), '{"x":1}\n');
    install(["--host", "copilot-cli"]);

    // Plain uninstall keeps the data.
    uninstall([]);
    expect(existsSync(projects)).toBe(true);

    // --purge-data removes the whole projects tree.
    const result = uninstall(["--purge-data"]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("metrics data");
    expect(existsSync(join(home, ".token-killer", "projects"))).toBe(false);
  });

  test("--purge-data --dry-run reports without deleting", () => {
    const projects = join(home, ".token-killer", "projects", "repo-deadbeef");
    mkdirSync(projects, { recursive: true });
    writeFileSync(join(projects, "history.jsonl"), '{"x":1}\n');

    const result = uninstall(["--purge-data", "--dry-run"]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("[dry-run]");
    expect(result.stdout).toMatch(/would remove .*projects/);
    expect(existsSync(projects)).toBe(true);
  });
});

describe("tk status", () => {
  // BOUNDARY: proves the real `tk status` binary dispatches to runStatus, exits 0,
  // and writes no install artifact.
  // ADR 0012 #7: status renders a per-host capability MATRIX (replacing the old
  // ad-hoc per-tier lines). Assert on the matrix's stable labels plus the shim
  // detail panel, tolerant of the new layout.
  test("reports the detected host and the capability matrix; writes nothing (CLI boundary)", () => {
    const result = runTg(["status"], { PATH: "/usr/bin:/bin", TERM_PROGRAM: "" });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Detected host:");
    // The matrix and its per-tier rows.
    expect(result.stdout).toContain("Delivery matrix:");
    expect(result.stdout).toContain("Instruction injection:");
    expect(result.stdout).toContain("Usage guidance:");
    // Honest best-effort fired / policy lines.
    expect(result.stdout).toContain("fired:");
    expect(result.stdout).toContain("blocked-by-policy:");
    // The detailed shim panel still prints below the matrix.
    expect(result.stdout).toContain("token-killer shim status");
    // No install artifact is written by status — but the delivery-state bookkeeping
    // file (lastVerified refresh) is allowed and expected. The shim dir must NOT exist.
    expect(existsSync(join(home, ".token-killer", "shim"))).toBe(false);
  });

  // The persisted delivery state lets status report what `tk install` chose even
  // for tiers a live probe can't fully confirm. Install records it; status reads it
  // back and refreshes lastVerified (best-effort, never breaking read-only status).
  test("status reflects the persisted delivery state written by install", () => {
    install(["--host", "copilot-cli"]);
    expect(existsSync(join(home, ".token-killer", "delivery-state.json"))).toBe(true);
    const result = status();
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("installed host:");
    expect(result.stdout).toMatch(/installed host:\s+copilot-cli/);
    expect(result.stdout).toContain("last verified:");
  });
});

describe("tk init (removed)", () => {
  // BOUNDARY: the rename hint lives in cli.ts (not runInstall), so this must stay a
  // real spawn — it verifies the dispatcher errors with exit 1 + a stderr hint and
  // installs nothing as a side effect.
  test("`tk init` errors with a rename hint and spawns nothing", () => {
    const result = runTg(["init"], { PATH: "/usr/bin:/bin", TERM_PROGRAM: "" });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("renamed to `tk install`");
    // Nothing installed as a side effect.
    expect(existsSync(join(home, ".token-killer", "shim"))).toBe(false);
  });
});
