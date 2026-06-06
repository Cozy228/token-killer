import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

// Sandboxed end-to-end for `tk init shim install|status|uninstall` (the shim tier
// now lives under `tk init`). We point HOME at a temp dir so the installer writes
// ~/.token-killer/shim and ~/.zshrc INSIDE the sandbox — never the real config.

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const cli = join(repoRoot, "src/cli.ts");
const tsxLoader = join(repoRoot, "node_modules/tsx/dist/loader.mjs");

let home: string;

function runTg(args: string[]) {
  return spawnSync(process.execPath, ["--import", tsxLoader, cli, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: 20000,
    env: { ...process.env, HOME: home, SHELL: "/bin/zsh", TOKEN_KILLER_HOME: join(home, ".token-killer") },
  });
}

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "tk-shim-cli-"));
  writeFileSync(join(home, ".zshrc"), "export FOO=1\n");
});

afterEach(() => {
  rmSync(home, { recursive: true, force: true });
});

describe("tk init shim install/status/uninstall", () => {
  test("install writes wrappers + manifest and patches the RC, then uninstall reverts", () => {
    const shimGit = join(home, ".token-killer", "shim", "git");
    const rc = join(home, ".zshrc");

    const install = runTg(["init", "shim", "install"]);
    expect(install.status).toBe(0);
    expect(existsSync(shimGit)).toBe(true);
    expect(existsSync(join(home, ".token-killer", "shim", "manifest.json"))).toBe(true);
    expect(readFileSync(rc, "utf8")).toContain("token-killer shim");
    // The probe should PASS: a shimmed `git` resolves into the shim dir.
    expect(install.stdout).toContain("probe");

    const status = runTg(["init", "shim", "status"]);
    expect(status.status).toBe(0);
    expect(status.stdout).toContain("programs");

    const uninstall = runTg(["init", "shim", "uninstall"]);
    expect(uninstall.status).toBe(0);
    expect(existsSync(join(home, ".token-killer", "shim"))).toBe(false);
    // RC restored byte-identically.
    expect(readFileSync(rc, "utf8")).toBe("export FOO=1\n");
  });

  test("unknown shim subcommand exits non-zero", () => {
    const result = runTg(["init", "shim", "bogus"]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("unknown subcommand");
  });
});
