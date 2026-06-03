import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { describe, expect, test } from "vitest";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const cli = path.join(repoRoot, "src/cli.ts");

function runTg(args: string[], cwd: string) {
  return spawnSync("npx", ["tsx", cli, ...args], {
    cwd,
    encoding: "utf8",
    timeout: 15000,
  });
}

// ============================================================================
// 1. Version & Help
// ============================================================================

describe("Version & Help", () => {
  test("--version prints version number", () => {
    const result = runTg(["--version"], repoRoot);
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/^\d+\.\d+\.\d+/);
  });

  test("--help prints usage", () => {
    const result = runTg(["--help"], repoRoot);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Usage:");
    expect(result.stdout).toContain("--raw");
    expect(result.stdout).toContain("--stats");
    expect(result.stdout).toContain("--report");
  });
});

// ============================================================================
// 2. Ls / Dir / Find
// ============================================================================

describe("Ls / Find", () => {
  test("tg ls shows project files", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "tg-ls-"));
    try {
      await writeFile(path.join(dir, "a.txt"), "a");
      await writeFile(path.join(dir, "b.ts"), "b");
      spawnSync("git", ["init"], { cwd: dir });
      await mkdir(path.join(dir, "node_modules"), { recursive: true });
      await writeFile(path.join(dir, "node_modules/.keep"), "");

      const result = runTg(["ls"], dir);
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("a.txt");
      expect(result.stdout).toContain("b.ts");
      // node_modules should be skipped
      expect(result.stdout).toContain("Skipped:");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("tg find shows directory structure", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "tg-find-"));
    try {
      await mkdir(path.join(dir, "src/lib"), { recursive: true });
      await mkdir(path.join(dir, "tests"), { recursive: true });
      await writeFile(path.join(dir, "src/app.ts"), "export const x = 1;");
      await writeFile(path.join(dir, "src/lib/util.ts"), "export const y = 2;");
      await writeFile(path.join(dir, "tests/app.test.ts"), "test");

      const result = runTg(["find", ".", "-name", "*.ts"], dir);
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
  test("tg cat shows small file content unchanged", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "tg-cat-"));
    try {
      await writeFile(path.join(dir, "small.json"), '{"key":"value"}\n');

      const result = runTg(["cat", "small.json"], dir);
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('"key":"value"');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("tg cat compresses large files", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "tg-cat-large-"));
    try {
      const lines = [
        "import { api } from './api';",
        "export function main() {",
        ...Array.from({ length: 2000 }, (_, i) => `  const noise${i} = ${i};`),
        "  return true;",
        "}",
      ];
      await writeFile(path.join(dir, "large.ts"), lines.join("\n"));

      const result = runTg(["cat", "large.ts"], dir);
      expect(result.status).toBe(0);
      // Large file should be summarized (not full 2000 noise lines)
      expect(result.stdout).not.toContain("noise1999");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

// ============================================================================
// 4. Git
// ============================================================================

describe("Git", () => {
  test("tg git status works in git repo", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "tg-git-status-"));
    try {
      spawnSync("git", ["init"], { cwd: dir });
      spawnSync("git", ["config", "user.email", "test@test.com"], { cwd: dir });
      spawnSync("git", ["config", "user.name", "Test"], { cwd: dir });
      await writeFile(path.join(dir, "file.txt"), "content");
      spawnSync("git", ["add", "file.txt"], { cwd: dir });
      spawnSync("git", ["commit", "-m", "init"], { cwd: dir });
      await writeFile(path.join(dir, "file.txt"), "changed");
      await writeFile(path.join(dir, "new.txt"), "untracked");

      const result = runTg(["git", "status"], dir);
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("Branch:");
      expect(result.stdout).toContain("Modified:");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("tg git log works", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "tg-git-log-"));
    try {
      spawnSync("git", ["init"], { cwd: dir });
      spawnSync("git", ["config", "user.email", "test@test.com"], { cwd: dir });
      spawnSync("git", ["config", "user.name", "Test"], { cwd: dir });
      await writeFile(path.join(dir, "f.txt"), "v1");
      spawnSync("git", ["add", "f.txt"], { cwd: dir });
      spawnSync("git", ["commit", "-m", "first"], { cwd: dir });

      const result = runTg(["git", "log", "-1"], dir);
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("first");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("tg git diff works", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "tg-git-diff-"));
    try {
      spawnSync("git", ["init"], { cwd: dir });
      spawnSync("git", ["config", "user.email", "test@test.com"], { cwd: dir });
      spawnSync("git", ["config", "user.name", "Test"], { cwd: dir });
      await writeFile(path.join(dir, "f.txt"), "v1");
      spawnSync("git", ["add", "f.txt"], { cwd: dir });
      spawnSync("git", ["commit", "-m", "init"], { cwd: dir });
      await writeFile(path.join(dir, "f.txt"), "v2");

      const result = runTg(["git", "diff"], dir);
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("Git Diff Summary");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("tg diff compares two files without trailing blank-line noise", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "tg-diff-"));
    try {
      await writeFile(path.join(dir, "old.ts"), "const retries = 1;\n");
      await writeFile(
        path.join(dir, "new.ts"),
        "const retries = 3;\nconst timeoutMs = 5000;\n",
      );

      const result = runTg(["diff", "old.ts", "new.ts"], dir);
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("[file] new.ts (+2 -1)");
      expect(result.stdout).toContain("-const retries = 1;");
      expect(result.stdout).toContain("+const timeoutMs = 5000;");
      expect(result.stdout).not.toMatch(/^  [+-]$/m);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("tg git branch works", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "tg-git-branch-"));
    try {
      spawnSync("git", ["init"], { cwd: dir });
      spawnSync("git", ["config", "user.email", "test@test.com"], { cwd: dir });
      spawnSync("git", ["config", "user.name", "Test"], { cwd: dir });
      await writeFile(path.join(dir, "f.txt"), "v1");
      spawnSync("git", ["add", "f.txt"], { cwd: dir });
      spawnSync("git", ["commit", "-m", "init"], { cwd: dir });

      const result = runTg(["git", "branch"], dir);
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
  test("tg rg finds matches", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "tg-rg-"));
    try {
      await writeFile(
        path.join(dir, "a.ts"),
        "export const x = 1;\nconst y = 2;\n",
      );
      await writeFile(
        path.join(dir, "b.ts"),
        "import { x } from './a';\nexport default x;\n",
      );

      const result = runTg(["rg", "export", "."], dir);
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("Search: export");
      // Should find matches (not "0 across 0 files" — the bug!)
      expect(result.stdout).toContain("export");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("tg grep finds matches", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "tg-grep-"));
    try {
      await writeFile(path.join(dir, "package.json"), '{"name":"sample"}\n');
      await writeFile(path.join(dir, "README.md"), "package.json is retained\n");

      const result = runTg(["grep", "-r", "package.json", "."], dir);

      expect(result.status).toBe(0);
      expect(result.stdout).toContain("Search:");
      expect(result.stdout).toContain("README.md");
      expect(result.stdout).toContain("package.json is retained");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("tg rg with no matches shows 0 matches message", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "tg-rg-nomatch-"));
    try {
      await writeFile(path.join(dir, "a.ts"), "const x = 1;\n");

      const result = runTg(["rg", "NoSuchPattern_XYZ123", "."], dir);
      expect(result.stdout).toContain("matches");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

// ============================================================================
// 6. Generic Passthrough
// ============================================================================

describe("Generic Passthrough", () => {
  test("tg echo passes through output", () => {
    const result = runTg(["echo", "hello world"], repoRoot);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("hello world");
  });

  test("tg node -e passes through output", () => {
    const result = runTg(["node", "-e", "console.log('rtk-style')"], repoRoot);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("rtk-style");
  });

  test("unknown commands pass through with generic handler", () => {
    const result = runTg(["printf", "abc"], repoRoot);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("abc");
  });
});

// ============================================================================
// 7. Global Flags
// ============================================================================

describe("Global Flags", () => {
  test("--stats prints token savings", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "tg-stats-"));
    try {
      await writeFile(path.join(dir, "sample.txt"), "alpha\nbeta\n");

      const result = runTg(["--stats", "cat", "sample.txt"], dir);
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("## Token Savings");
      expect(result.stdout).toContain("Raw:");
      expect(result.stdout).toContain("Output:");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("--stats --save-raw prints raw path and writes raw log", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "tg-save-raw-"));
    try {
      await writeFile(path.join(dir, "sample.txt"), "alpha\nbeta\n");

      const result = runTg(["--stats", "--save-raw", "cat", "sample.txt"], dir);
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("## Token Savings");

      const history = await readFile(
        path.join(dir, ".tg/history.jsonl"),
        "utf8",
      );
      const record = JSON.parse(history.trim()) as { raw_output_path: string };
      expect(record.raw_output_path).toMatch(/^\.tg\/raw\//);

      const rawLog = await readFile(
        path.join(dir, record.raw_output_path),
        "utf8",
      );
      expect(rawLog).toContain("Command: cat sample.txt");
      expect(rawLog).toContain("--- STDOUT ---");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("--raw bypasses filtering", () => {
    const raw = runTg(
      ["--raw", process.execPath, "-e", "console.log('raw retained')"],
      repoRoot,
    );
    expect(raw.stdout).toBe("raw retained\n");
  });

  test("--raw still records history with zero savings", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "tg-raw-history-"));
    try {
      const result = runTg(
        ["--raw", process.execPath, "-e", "console.log('raw retained')"],
        dir,
      );
      expect(result.status).toBe(0);

      const history = await readFile(
        path.join(dir, ".tg/history.jsonl"),
        "utf8",
      );
      const record = JSON.parse(history.trim()) as {
        handler: string;
        saved_tokens: number;
        savings_pct: number;
      };
      expect(record.handler).toBe("raw");
      expect(record.saved_tokens).toBe(0);
      expect(record.savings_pct).toBe(0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("--verbose shows raw output path", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "tg-verbose-"));
    try {
      await writeFile(path.join(dir, "sample.txt"), "alpha\n");

      const result = runTg(["--verbose", "--save-raw", "cat", "sample.txt"], dir);
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("Raw output:");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

// ============================================================================
// 8. Report
// ============================================================================

describe("Report", () => {
  test("--report aggregates text json and csv history", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "tg-report-"));
    try {
      await writeFile(path.join(dir, "sample.txt"), "alpha\nbeta\n");
      expect(runTg(["--stats", "cat", "sample.txt"], dir).status).toBe(0);

      const text = runTg(["--report"], dir);
      expect(text.status).toBe(0);
      expect(text.stdout).toContain("Token Savings Report");
      expect(text.stdout).toContain("Commands: 1");

      const json = runTg(["--report", "--json"], dir);
      expect(json.status).toBe(0);
      expect(JSON.parse(json.stdout)).toMatchObject({ commands: 1 });

      const csv = runTg(["--report", "--csv"], dir);
      expect(csv.status).toBe(0);
      expect(csv.stdout).toContain(
        "commands,raw_tokens,output_tokens,saved_tokens,savings_pct",
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

// ============================================================================
// 9. Error Handling
// ============================================================================

describe("Error Handling", () => {
  test("tg with no command exits non-zero", () => {
    const result = runTg([], repoRoot);
    expect(result.status).not.toBe(0);
  });

  test("preserves original command exit code", () => {
    const result = runTg([process.execPath, "-e", "process.exit(7)"], repoRoot);
    expect(result.status).toBe(7);
  });

  test("passes through exit code 0", () => {
    const result = runTg([process.execPath, "-e", "process.exit(0)"], repoRoot);
    expect(result.status).toBe(0);
  });

  test("preserves stderr from failed commands", () => {
    const result = runTg(
      [process.execPath, "-e", "console.error('error msg'); process.exit(1)"],
      repoRoot,
    );
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("error msg");
  });
});

// ============================================================================
// 10. Acceptance: Route common commands through proper handlers
// ============================================================================

describe("Acceptance: Handler Routing", () => {
  test("routes common acceptance commands through compact handlers", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "tg-acceptance-"));
    try {
      spawnSync("git", ["init"], { cwd: dir, encoding: "utf8" });
      spawnSync("git", ["config", "user.email", "test@example.com"], {
        cwd: dir,
        encoding: "utf8",
      });
      spawnSync("git", ["config", "user.name", "Test User"], {
        cwd: dir,
        encoding: "utf8",
      });
      await writeFile(path.join(dir, "pkg.json"), '{"name":"sample"}\n');
      await writeFile(path.join(dir, "sample.txt"), "TODO retained\n");
      spawnSync("git", ["add", "."], { cwd: dir, encoding: "utf8" });
      spawnSync("git", ["commit", "-m", "initial retained"], {
        cwd: dir,
        encoding: "utf8",
      });
      await writeFile(path.join(dir, "sample.txt"), "TODO retained\nchanged\n");

      // Each should route to its specific handler (not generic)
      expect(runTg(["git", "status"], dir).stdout).toContain("Branch:");
      expect(runTg(["git", "diff"], dir).stdout).toContain("Git Diff Summary");
      expect(runTg(["git", "log", "-1"], dir).stdout).toContain(
        "initial retained",
      );
      expect(runTg(["git", "show", "--stat", "HEAD"], dir).stdout).toContain(
        "Git Show",
      );
      expect(runTg(["git", "branch"], dir).stdout).toContain("main");
      expect(runTg(["cat", "pkg.json"], dir).stdout).toContain("sample");
      expect(runTg(["ls", "."], dir).stdout).toContain("pkg.json");
      expect(runTg(["rg", "TODO", "."], dir).stdout).toContain("Search: TODO");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

// ============================================================================
// 11. Python / JS / Java handlers (stderr-based output)
// ============================================================================

describe("Language-specific handlers", () => {
  test("tsc handler shows grouped errors", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "tg-tsc-"));
    try {
      // Create a TS file with a type error
      await writeFile(
        path.join(dir, "error.ts"),
        "const x: number = 'string';\n",
      );
      await writeFile(
        path.join(dir, "tsconfig.json"),
        '{"compilerOptions":{"strict":true,"noEmit":true}}\n',
      );

      const result = runTg(["tsc", "--noEmit"], dir);
      // Should not crash, show TypeScript output
      expect(result.stdout).toContain("TypeScript");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("npm test handler routes test runners", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "tg-npm-test-"));
    try {
      await writeFile(
        path.join(dir, "package.json"),
        '{"name":"test","scripts":{"test":"echo test-output"}}\n',
      );

      const result = runTg(["npm", "test"], dir);
      expect(result.status).toBe(0);
      // Should route to js-test handler
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("npm list handler shows dependencies", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "tg-npm-list-"));
    try {
      await writeFile(
        path.join(dir, "package.json"),
        '{"name":"test","dependencies":{"kept":"^1.0.0","noise":"^2.0.0"}}\n',
      );

      const result = runTg(["npm", "list", "--depth=0"], dir);
      expect(result.stdout).toContain("Dependencies:");
      expect(result.stdout).toContain("kept");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
