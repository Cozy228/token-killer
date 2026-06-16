import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { describe, expect, test } from "vitest";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const cli = path.join(repoRoot, "src/cli.ts");
// Spawn the CLI like the other integration suites: `node --import <file:// loader>`.
// A bare `npx` fails on Windows (not resolved without PATHEXT), and a raw drive-letter
// loader path is rejected by Node's --import (ERR_UNSUPPORTED_ESM_URL_SCHEME) — so use
// process.execPath + a pathToFileURL() loader, exactly as cli.test.ts does.
const tsxLoader = pathToFileURL(path.join(repoRoot, "node_modules/tsx/dist/loader.mjs")).href;

// Isolate the data dir so the spawned CLI never writes history into the real
// ~/.token-killer/.
const tokenKillerHome = mkdtempSync(path.join(tmpdir(), "tk-rtk-home-"));

function runTk(args: string[], cwd: string, input?: string, timeout = 15000) {
  return spawnSync(process.execPath, ["--import", tsxLoader, cli, ...args], {
    cwd,
    input,
    encoding: "utf8",
    timeout,
    env: { ...process.env, TOKEN_KILLER_HOME: tokenKillerHome },
  });
}

function git(args: string[], cwd: string) {
  return spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    timeout: 15000,
  });
}

function nativeGrep(args: string[], cwd: string) {
  return spawnSync("grep", args, {
    cwd,
    encoding: "utf8",
    timeout: 15000,
  });
}

async function initGitRepo(prefix: string) {
  const dir = await mkdtemp(path.join(tmpdir(), prefix));
  git(["init"], dir);
  git(["config", "user.email", "test@example.com"], dir);
  git(["config", "user.name", "Test User"], dir);
  return dir;
}

describe("RTK-style CLI integration parity", () => {
  test("tk grep -r preserves real grep output without line numbers", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "tk-rtk-grep-"));
    try {
      await writeFile(path.join(dir, "history.ts"), "export async function recordHistory() {}\n");
      await writeFile(path.join(dir, "pipeline.ts"), "export async function runPipeline() {}\n");

      const result = runTk(["grep", "-r", "export", "."], dir);

      expect(result.status).toBe(0);
      expect(result.stdout).not.toMatch(/0 across 0 files/);
      expect(result.stdout).toContain("history.ts");
      expect(result.stdout).toContain("recordHistory");
      expect(result.stdout).toContain("pipeline.ts");
      expect(result.stdout).toContain("runPipeline");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  // POSIX-only: compares tk's output byte-for-byte against the NATIVE grep, using
  // POSIX-grep-specific flags (-L/-o/-Z). Windows has no standard grep binary to
  // compare against, so this is honestly skipped there (the \0-framing emit fix it
  // guards is platform-agnostic and stays covered on Linux/macOS).
  test.runIf(process.platform !== "win32")(
    "tk grep preserves RTK format-flag output shapes",
    async () => {
      const dir = await mkdtemp(path.join(tmpdir(), "tk-rtk-grep-format-"));
      try {
        await writeFile(path.join(dir, "with-import.ts"), "import fs from 'node:fs';\n");
        await writeFile(path.join(dir, "without-import.ts"), "export const value = 1;\n");

        const filesWithoutMatch = runTk(
          ["grep", "-L", "import", "with-import.ts", "without-import.ts"],
          dir,
        );
        const nativeFilesWithoutMatch = nativeGrep(
          ["-L", "import", "with-import.ts", "without-import.ts"],
          dir,
        );
        expect(filesWithoutMatch.status).toBe(0);
        expect(filesWithoutMatch.stdout).toBe(nativeFilesWithoutMatch.stdout);
        expect(filesWithoutMatch.stdout).not.toContain("Search:");
        expect(filesWithoutMatch.stdout).not.toContain("Matches:");

        const onlyMatching = runTk(["grep", "-o", "import", "with-import.ts"], dir);
        const nativeOnlyMatching = nativeGrep(["-o", "import", "with-import.ts"], dir);
        expect(onlyMatching.status).toBe(0);
        expect(onlyMatching.stdout).toBe(nativeOnlyMatching.stdout);

        const nullDelimited = runTk(
          ["grep", "-Z", "-l", "import", "with-import.ts", "without-import.ts"],
          dir,
        );
        const nativeNullDelimited = nativeGrep(
          ["-Z", "-l", "import", "with-import.ts", "without-import.ts"],
          dir,
        );
        expect(nullDelimited.status).toBe(0);
        expect(nullDelimited.stdout).toBe(nativeNullDelimited.stdout);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    },
  );

  test("tk git diff preserves changed lines from a real repository", async () => {
    const dir = await initGitRepo("tk-rtk-diff-");
    try {
      await writeFile(
        path.join(dir, "submit.ts"),
        "export async function submitOrder(payload) {\n  return api.submit(payload)\n}\n",
      );
      git(["add", "submit.ts"], dir);
      git(["commit", "-m", "initial"], dir);
      await writeFile(
        path.join(dir, "submit.ts"),
        "export async function submitOrder(payload) {\n  return api.submit({ ...payload, idempotencyKey })\n}\n",
      );

      const result = runTk(["git", "diff"], dir);

      expect(result.status).toBe(0);
      expect(result.stdout).toContain("-  return api.submit(payload)");
      expect(result.stdout).toContain("+  return api.submit({ ...payload, idempotencyKey })");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("tk cat - preserves stdin content", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "tk-rtk-stdin-"));
    try {
      const result = runTk(
        ["cat", "-"],
        dir,
        "export function fromStdin() { return true; }\n",
        3000,
      );

      expect(result.status).toBe(0);
      expect(result.stdout).toContain("fromStdin");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 8000);

  test("tk diff - condenses piped unified diff", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "tk-rtk-diff-stdin-"));
    try {
      const input = [
        "diff --git a/src/main.ts b/src/main.ts",
        "--- a/src/main.ts",
        "+++ b/src/main.ts",
        "@@ -1,2 +1,3 @@",
        " export function main() {",
        '+  console.log("hello");',
        " }",
        "",
      ].join("\n");

      const result = runTk(["diff", "-"], dir, input, 3000);

      expect(result.status).toBe(0);
      expect(result.stdout).toContain("[file] src/main.ts (+1 -0)");
      expect(result.stdout).toContain('  +  console.log("hello");');
      expect(result.stdout).not.toContain("diff --git");
      // H8: @@ hunk headers are now RETAINED — they locate the change (line numbers)
      // and are essential for "did it change and where?"; dropping them was the bug.
      expect(result.stdout).toContain("@@ -1,2 +1,3 @@");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 8000);
});
