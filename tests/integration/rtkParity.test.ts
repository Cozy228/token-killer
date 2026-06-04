import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vitest";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const cli = path.join(repoRoot, "src/cli.ts");

function runTg(args: string[], cwd: string, input?: string, timeout = 15000) {
  return spawnSync("npx", ["tsx", cli, ...args], {
    cwd,
    input,
    encoding: "utf8",
    timeout,
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
  test("tg grep -r preserves real grep output without line numbers", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "tg-rtk-grep-"));
    try {
      await writeFile(
        path.join(dir, "history.ts"),
        "export async function recordHistory() {}\n",
      );
      await writeFile(
        path.join(dir, "pipeline.ts"),
        "export async function runPipeline() {}\n",
      );

      const result = runTg(["grep", "-r", "export", "."], dir);

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

  test("tg grep preserves RTK format-flag output shapes", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "tg-rtk-grep-format-"));
    try {
      await writeFile(path.join(dir, "with-import.ts"), "import fs from 'node:fs';\n");
      await writeFile(path.join(dir, "without-import.ts"), "export const value = 1;\n");

      const filesWithoutMatch = runTg(
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

      const onlyMatching = runTg(["grep", "-o", "import", "with-import.ts"], dir);
      const nativeOnlyMatching = nativeGrep(["-o", "import", "with-import.ts"], dir);
      expect(onlyMatching.status).toBe(0);
      expect(onlyMatching.stdout).toBe(nativeOnlyMatching.stdout);

      const nullDelimited = runTg(
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
  });

  test("tg git diff preserves changed lines from a real repository", async () => {
    const dir = await initGitRepo("tg-rtk-diff-");
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

      const result = runTg(["git", "diff"], dir);

      expect(result.status).toBe(0);
      expect(result.stdout).toContain("-  return api.submit(payload)");
      expect(result.stdout).toContain(
        "+  return api.submit({ ...payload, idempotencyKey })",
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("tg cat - preserves stdin content", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "tg-rtk-stdin-"));
    try {
      const result = runTg(
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

  test("tg diff - condenses piped unified diff", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "tg-rtk-diff-stdin-"));
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

      const result = runTg(["diff", "-"], dir, input, 3000);

      expect(result.status).toBe(0);
      expect(result.stdout).toContain("[file] src/main.ts (+1 -0)");
      expect(result.stdout).toContain('  +  console.log("hello");');
      expect(result.stdout).not.toContain("diff --git");
      expect(result.stdout).not.toContain("@@ -1,2");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 8000);
});
