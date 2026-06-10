import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import { vscodeSettingsPath, vscodeUserDir } from "../../../src/shim/hostConfig.js";

// Sandboxed end-to-end for `tk install` / `tk uninstall` / `tk status` (the CLI
// surface that replaced `tk init`, U1+U2). HOME points at a temp dir so every
// write (shim dir, RC, VS Code settings, injection file) lands inside the sandbox.

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const cli = join(repoRoot, "src/cli.ts");
const tsxLoader = join(repoRoot, "node_modules/tsx/dist/loader.mjs");

let home: string;

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

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "tk-init-"));
});
afterEach(() => {
  rmSync(home, { recursive: true, force: true });
});

describe("tk install", () => {
  test("unknown host → instruction injection at user level", () => {
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

  test("--host vscode → shim tier (wrappers installed, probe passes)", () => {
    // VS Code user dir present so settings.json gets patched.
    mkdirSync(join(home, "Library", "Application Support", "Code", "User"), { recursive: true });
    mkdirSync(join(home, ".config", "Code", "User"), { recursive: true });

    const result = runTg(["install", "--host", "vscode"]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Active tier: shim");
    expect(existsSync(join(home, ".token-killer", "shim", "git"))).toBe(true);
  });

  // R1: the VS Code install must write TK_COMPRESS_TTY=1 into the integrated
  // terminal env so the agent's (TTY) commands actually compress.
  test("--host vscode writes TK_COMPRESS_TTY=1 into terminal.integrated.env; uninstall removes it", () => {
    mkdirSync(vscodeUserDir(process.platform, home), { recursive: true });
    const settingsPath = vscodeSettingsPath(process.platform, home);
    const envKey =
      process.platform === "darwin" ? "osx" : process.platform === "win32" ? "windows" : "linux";

    runTg(["install", "--host", "vscode"]);
    const settings = JSON.parse(readFileSync(settingsPath, "utf8"));
    const envBlock = settings[`terminal.integrated.env.${envKey}`];
    expect(envBlock.TK_COMPRESS_TTY).toBe("1");
    expect(envBlock.TK_SHIM_DIR).toBeTruthy();

    runTg(["uninstall"]);
    const after = JSON.parse(readFileSync(settingsPath, "utf8"));
    const afterBlock = after[`terminal.integrated.env.${envKey}`];
    expect(afterBlock?.TK_COMPRESS_TTY).toBeUndefined();
  });

  test("--project writes the repo instruction file (the only repo write)", () => {
    const project = mkdtempSync(join(tmpdir(), "tk-init-project-"));
    try {
      const result = runTg(["install", "--project", "--host", "vscode"], {}, project);
      expect(result.status).toBe(0);
      const projectFile = join(project, ".github", "copilot-instructions.md");
      expect(existsSync(projectFile)).toBe(true);
      expect(readFileSync(projectFile, "utf8")).toContain("Token Killer");
    } finally {
      rmSync(project, { recursive: true, force: true });
    }
  });

  test("--host copilot-cli → hook tier, writes user-level hook config", () => {
    const result = runTg(["install", "--host", "copilot-cli"]);
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
    runTg(["install", "--host", "copilot-cli"]);
    expect(existsSync(join(home, ".copilot", "TK.md"))).toBe(false);
    const instr = readFileSync(join(home, ".copilot", "copilot-instructions.md"), "utf8");
    expect(instr).toContain("git status --short");
  });

  test("copilot-cli auto-detected (~/.copilot exists) → hook tier", () => {
    mkdirSync(join(home, ".copilot"), { recursive: true });
    const result = runTg(["install"]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Detected host: copilot-cli");
    expect(result.stdout).toContain("Active tier: hook");
  });

  test("--host copilot-cli --dry-run writes nothing", () => {
    const result = runTg(["install", "--host", "copilot-cli", "--dry-run"]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("[dry-run]");
    expect(existsSync(join(home, ".copilot", "hooks", "tk-rewrite.json"))).toBe(false);
  });

  test("--host claude-code → hook tier, patches ~/.claude/settings.json", () => {
    const result = runTg(["install", "--host", "claude-code"]);
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
    const result = runTg(["install", "--host", "claude-code"]);
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
    const result = runTg(["install"], { CLAUDECODE: "1" });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Detected host: claude-code");
    expect(result.stdout).toContain("Active tier: hook");
  });

  test("claude-code writes the usage guide (TK.md) + wires @TK.md into CLAUDE.md; -g is a no-op", () => {
    const result = runTg(["install", "--host", "claude-code", "-g"]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Active tier: hook");
    // tk drops a usage guide and references it from the auto-loaded CLAUDE.md so
    // the agent reads it. -g (stray rtk muscle memory) changes nothing.
    expect(existsSync(join(home, ".claude", "TK.md"))).toBe(true);
    expect(readFileSync(join(home, ".claude", "CLAUDE.md"), "utf8")).toContain("@TK.md");
  });

  test("claude-code --dry-run writes nothing", () => {
    const result = runTg(["install", "--host", "claude-code", "--dry-run"]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("[dry-run]");
    expect(existsSync(join(home, ".claude", "settings.json"))).toBe(false);
    expect(existsSync(join(home, ".claude", "TK.md"))).toBe(false);
  });
});

describe("tk uninstall", () => {
  test("removes the hook config", () => {
    runTg(["install", "--host", "copilot-cli"]);
    const cfg = join(home, ".copilot", "hooks", "tk-rewrite.json");
    expect(existsSync(cfg)).toBe(true);
    const result = runTg(["uninstall"]);
    expect(result.status).toBe(0);
    expect(existsSync(cfg)).toBe(false);
  });

  test("claude-code: removes the tk hook entry and the usage guide", () => {
    runTg(["install", "--host", "claude-code"]);
    expect(existsSync(join(home, ".claude", "settings.json"))).toBe(true);
    expect(existsSync(join(home, ".claude", "TK.md"))).toBe(true);
    const result = runTg(["uninstall"]);
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
      runTg(["install", "--host", "claude-code"]);
      const userHook = join(home, ".claude", "settings.json");
      expect(existsSync(userHook)).toBe(true);
      // Project-level copilot install in the repo.
      runTg(["install", "--project", "--host", "copilot-cli"], {}, project);
      const projectCfg = join(project, ".github", "hooks", "tk-rewrite.json");
      const projectInjection = join(project, ".github", "copilot-instructions.md");
      expect(existsSync(projectCfg)).toBe(true);

      const result = runTg(["uninstall", "--project"], {}, project);
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
    runTg(["install", "--host", "copilot-cli"]);
    const cfg = join(home, ".copilot", "hooks", "tk-rewrite.json");
    expect(existsSync(cfg)).toBe(true);

    const result = runTg(["uninstall", "--dry-run"]);
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
    runTg(["install", "--host", "copilot-cli"]);

    // Plain uninstall keeps the data.
    runTg(["uninstall"]);
    expect(existsSync(projects)).toBe(true);

    // --purge-data removes the whole projects tree.
    const result = runTg(["uninstall", "--purge-data"]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("metrics data");
    expect(existsSync(join(home, ".token-killer", "projects"))).toBe(false);
  });

  test("--purge-data --dry-run reports without deleting", () => {
    const projects = join(home, ".token-killer", "projects", "repo-deadbeef");
    mkdirSync(projects, { recursive: true });
    writeFileSync(join(projects, "history.jsonl"), '{"x":1}\n');

    const result = runTg(["uninstall", "--purge-data", "--dry-run"]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("[dry-run]");
    expect(result.stdout).toMatch(/would remove .*projects/);
    expect(existsSync(projects)).toBe(true);
  });
});

describe("tk status", () => {
  test("reports the detected host and shim status; writes nothing", () => {
    const result = runTg(["status"], { PATH: "/usr/bin:/bin", TERM_PROGRAM: "" });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Detected host:");
    expect(result.stdout).toContain("token-killer shim status");
    expect(result.stdout).toContain("injection file:");
    // No writes: status must not create the shim dir or any install artifact.
    expect(existsSync(join(home, ".token-killer", "shim"))).toBe(false);
  });
});

describe("tk init (removed)", () => {
  test("`tk init` errors with a rename hint and spawns nothing", () => {
    const result = runTg(["init"], { PATH: "/usr/bin:/bin", TERM_PROGRAM: "" });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("renamed to `tk install`");
    // Nothing installed as a side effect.
    expect(existsSync(join(home, ".token-killer", "shim"))).toBe(false);
  });
});
