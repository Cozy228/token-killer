import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

// Sandboxed end-to-end for `ctx shim install|status|uninstall` (the top-level shim
// surface; `ctx install` wires it as part of its tier ladder). We point HOME at a
// temp dir so the installer writes ~/.contexa/shim and ~/.zshrc INSIDE the
// sandbox — never the real config.

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const cli = join(repoRoot, "src/cli.ts");
const tsxLoader = pathToFileURL(join(repoRoot, "node_modules/tsx/dist/loader.mjs")).href;

let home: string;

function runTg(args: string[]) {
  return spawnSync(process.execPath, ["--import", tsxLoader, cli, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: 20000,
    env: {
      ...process.env,
      HOME: home,
      // Windows: defaultRcPath()/homedir() read USERPROFILE (not HOME), so without
      // this the RC patch + shim land in the REAL profile, not the sandbox.
      USERPROFILE: home,
      SHELL: "/bin/zsh",
      CONTEXA_HOME: join(home, ".contexa"),
    },
  });
}

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "ctx-shim-cli-"));
  writeFileSync(join(home, ".zshrc"), "export FOO=1\n");
});

afterEach(() => {
  rmSync(home, { recursive: true, force: true });
});

describe("ctx shim install/status/uninstall", () => {
  test("install writes wrappers + manifest and patches the RC, then uninstall reverts", () => {
    const shimGit = join(
      home,
      ".contexa",
      "shim",
      process.platform === "win32" ? "git.cmd" : "git",
    );
    const rc = join(home, ".zshrc");

    const install = runTg(["shim", "install"]);
    expect(install.status).toBe(0);
    expect(existsSync(shimGit)).toBe(true);
    expect(existsSync(join(home, ".contexa", "shim", "manifest.json"))).toBe(true);
    expect(readFileSync(rc, "utf8")).toContain("contexa shim");
    // The probe should PASS: a shimmed `git` resolves into the shim dir.
    expect(install.stdout).toContain("probe");

    const status = runTg(["shim", "status"]);
    expect(status.status).toBe(0);
    expect(status.stdout).toContain("programs");

    const uninstall = runTg(["shim", "uninstall"]);
    expect(uninstall.status).toBe(0);
    expect(existsSync(join(home, ".contexa", "shim"))).toBe(false);
    // RC restored byte-identically.
    expect(readFileSync(rc, "utf8")).toBe("export FOO=1\n");
  });

  test("unknown shim subcommand exits non-zero", () => {
    const result = runTg(["shim", "bogus"]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("unknown subcommand");
  });

  test("install --dry-run previews without writing anything", () => {
    const result = runTg(["shim", "install", "--dry-run"]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("[dry-run]");
    // Nothing written: no shim dir, RC left byte-identical.
    expect(existsSync(join(home, ".contexa", "shim"))).toBe(false);
    expect(readFileSync(join(home, ".zshrc"), "utf8")).toBe("export FOO=1\n");
  });

  test("uninstall --dry-run reports without removing the installed shim", () => {
    runTg(["shim", "install"]); // real install first
    const dry = runTg(["shim", "uninstall", "--dry-run"]);
    expect(dry.status).toBe(0);
    expect(dry.stdout).toContain("[dry-run]");
    // Still installed — dry-run removed nothing.
    expect(existsSync(join(home, ".contexa", "shim"))).toBe(true);
  });
});
