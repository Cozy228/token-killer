import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

// Sandboxed end-to-end for `tg init`. HOME points at a temp dir so every write
// (shim dir, RC, VS Code settings, injection file) lands inside the sandbox.

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
      TOKEN_GUARD_HOME: join(home, ".token-guard"),
      ...env,
    },
  });
}

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "tg-init-"));
});
afterEach(() => {
  rmSync(home, { recursive: true, force: true });
});

describe("tg init", () => {
  test("unknown host → instruction injection at user level", () => {
    const result = runTg(["init"], {
      PATH: "/usr/bin:/bin",
      TERM_PROGRAM: "",
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Detected host: unknown");
    expect(result.stdout).toContain("Active tier: injection");
    const injected = join(home, ".token-guard", "copilot-instructions.md");
    expect(existsSync(injected)).toBe(true);
    expect(readFileSync(injected, "utf8")).toContain("Token Guard");
  });

  test("--host vscode → shim tier (wrappers installed, probe passes)", () => {
    // VS Code user dir present so settings.json gets patched.
    mkdirSync(join(home, "Library", "Application Support", "Code", "User"), { recursive: true });
    mkdirSync(join(home, ".config", "Code", "User"), { recursive: true });

    const result = runTg(["init", "--host", "vscode"]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Active tier: shim");
    expect(existsSync(join(home, ".token-guard", "shim", "git"))).toBe(true);
  });

  test("--project writes the repo instruction file (the only repo write)", () => {
    const project = mkdtempSync(join(tmpdir(), "tg-init-project-"));
    try {
      const result = runTg(["init", "--project", "--host", "vscode"], {}, project);
      expect(result.status).toBe(0);
      const projectFile = join(project, ".github", "copilot-instructions.md");
      expect(existsSync(projectFile)).toBe(true);
      expect(readFileSync(projectFile, "utf8")).toContain("Token Guard");
    } finally {
      rmSync(project, { recursive: true, force: true });
    }
  });

  test("--host copilot-cli → hook tier, writes user-level hook config", () => {
    const result = runTg(["init", "--host", "copilot-cli"]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Active tier: hook");
    const cfg = join(home, ".copilot", "hooks", "tg-rewrite.json");
    expect(existsSync(cfg)).toBe(true);
    const parsed = JSON.parse(readFileSync(cfg, "utf8"));
    expect(parsed.hooks.PreToolUse[0].command).toBe("tg hook copilot");
  });

  test("copilot-cli auto-detected (~/.copilot exists) → hook tier", () => {
    mkdirSync(join(home, ".copilot"), { recursive: true });
    const result = runTg(["init"]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Detected host: copilot-cli");
    expect(result.stdout).toContain("Active tier: hook");
  });

  test("--host copilot-cli --dry-run writes nothing", () => {
    const result = runTg(["init", "--host", "copilot-cli", "--dry-run"]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("[dry-run]");
    expect(existsSync(join(home, ".copilot", "hooks", "tg-rewrite.json"))).toBe(false);
  });

  test("--uninstall removes the hook config", () => {
    runTg(["init", "--host", "copilot-cli"]);
    const cfg = join(home, ".copilot", "hooks", "tg-rewrite.json");
    expect(existsSync(cfg)).toBe(true);
    const result = runTg(["init", "--uninstall"]);
    expect(result.status).toBe(0);
    expect(existsSync(cfg)).toBe(false);
  });

  test("--show reports the detected host and shim status", () => {
    const result = runTg(["init", "--show"], { PATH: "/usr/bin:/bin", TERM_PROGRAM: "" });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Detected host:");
    expect(result.stdout).toContain("token-guard shim status");
    expect(result.stdout).toContain("injection file:");
  });
});
