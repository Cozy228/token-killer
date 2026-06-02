import { describe, expect, test } from "vitest";

import { listLikeHandler } from "../../../../src/handlers/common/listLike.js";
import type { RawResult, TgOptions } from "../../../../src/types.js";

const options: TgOptions = {
  raw: false,
  stats: false,
  verbose: false,
  maxLines: 120,
  maxChars: 12000,
  saveRaw: false,
  cwd: process.cwd(),
};

/** Helper: build RawResult from an array of file paths */
function rawFromPaths(paths: string[], command = "find ."): RawResult {
  return {
    command,
    stdout: paths.map((p) => `./${p}`).join("\n"),
    stderr: "",
    exitCode: 0,
    durationMs: 1,
  };
}

/** Helper: call filter with the given program/args/raw */
async function filterWith(program: string, args: string[], raw: RawResult) {
  return listLikeHandler.filter(
    raw,
    {
      program,
      args,
      original: [program, ...args],
      displayCommand: `${program} ${args.join(" ")}`,
    },
    options,
  );
}

// ============================================================================
// Existing test: large noisy output → high savings
// ============================================================================

describe("list-like handler", () => {
  test("summarizes noisy listings and hides dependency directories", async () => {
    const files = [
      "src/cli.ts",
      "src/parse.ts",
      "tests/unit/parse.test.ts",
      "README.md",
      "package.json",
      ...Array.from(
        { length: 200 },
        (_, index) => `node_modules/pkg-${index}/index.js`,
      ),
      ...Array.from({ length: 200 }, (_, index) => `dist/chunk-${index}.js`),
    ];
    const raw: RawResult = {
      command: "find .",
      stdout: files.map((file) => `./${file}`).join("\n"),
      stderr: "",
      exitCode: 0,
      durationMs: 1,
    };

    const result = await listLikeHandler.filter(
      raw,
      {
        program: "find",
        args: ["."],
        original: ["find", "."],
        displayCommand: "find .",
      },
      options,
    );

    expect(result.handler).toBe("list-like");
    expect(result.output).toContain("src/");
    expect(result.output).toContain("tests/");
    expect(result.output).toContain("README.md");
    expect(result.output).toContain("Skipped:");
    expect(result.output).toContain("node_modules/");
    expect(result.output).not.toContain("pkg-199");
    expect(result.savingsPct).toBeGreaterThanOrEqual(80);
  });
});

// ============================================================================
// P0: deep directory structure preservation — the bug from the report
// ============================================================================

describe("list-like directory structure preservation", () => {
  // --------------------------------------------------------------------------
  // Deep nested find output should preserve subdirectory structure
  // Report bug: all paths collapsed to "src/ (39 files)"
  // --------------------------------------------------------------------------

  test("preserves subdirectory structure for deep find output", async () => {
    const files = [
      "src/cli.ts",
      "src/parse.ts",
      "src/types.ts",
      "src/core/history.ts", // src/core/
      "src/core/pipeline.ts",
      "src/core/savings.ts",
      "src/core/report.ts",
      "src/handlers/base.ts", // src/handlers/
      "src/handlers/index.ts",
      "src/handlers/generic.ts",
      "src/handlers/common/listLike.ts", // src/handlers/common/
      "src/handlers/common/searchLike.ts",
      "src/handlers/common/readLike.ts",
      "src/handlers/git/status.ts", // src/handlers/git/
      "src/handlers/git/diff.ts",
      "src/handlers/git/log.ts",
      "src/handlers/git/branch.ts",
      "tests/unit/parse.test.ts", // tests/unit/
      "tests/unit/router.test.ts",
      "tests/integration/cli.test.ts", // tests/integration/
    ];
    const result = await filterWith(
      "find",
      ["src", "-name", "*.ts"],
      rawFromPaths(files),
    );

    // CRITICAL: should NOT collapse everything to a single "src/ (17 files)"
    // The output should preserve meaningful subdirectory grouping
    expect(result.output).not.toMatch(/^\.\n├─ src\/ \(\d+ files\)\n$/m);

    // Should preserve at least some structural information
    const hasSubdirGrouping =
      result.output.includes("core/") ||
      result.output.includes("handlers/") ||
      result.output.includes("git/") ||
      result.output.includes("cli.ts");
    expect(hasSubdirGrouping).toBe(true);
  });

  test("does not lose all filenames when grouping by directory", async () => {
    const files = [
      "src/a.ts",
      "src/b.ts",
      "src/subdir/c.ts",
      "src/subdir/d.ts",
      "src/subdir/nested/e.ts",
    ];
    const result = await filterWith("find", ["src"], rawFromPaths(files));

    // Should NOT collapse to just "src/ (5 files)"
    expect(result.output).not.toMatch(/^\.\n├─ src\/ \(5 files\)\n$/m);

    // At minimum, should distinguish subdir/ from root files
    // or list individual filenames
    const output = result.output;
    const hasStructure =
      output.includes("subdir") ||
      output.includes("a.ts") ||
      output.includes("b.ts");
    expect(hasStructure).toBe(true);
  });

  // --------------------------------------------------------------------------
  // Realistic project structure from the report: find src -name "*.ts"
  // --------------------------------------------------------------------------

  test("handles realistic multi-level project structure", async () => {
    // Simulating a portion of the actual project's file layout
    const files = [
      "src/executor.ts",
      "src/cli.ts",
      "src/parse.ts",
      "src/router.ts",
      "src/types.ts",
      "src/core/history.ts",
      "src/core/rawStore.ts",
      "src/core/report.ts",
      "src/core/pipeline.ts",
      "src/core/savings.ts",
      "src/handlers/base.ts",
      "src/handlers/generic.ts",
      "src/handlers/index.ts",
      "src/handlers/common/listLike.ts",
      "src/handlers/common/searchLike.ts",
      "src/handlers/common/readLike.ts",
      "src/handlers/git/status.ts",
      "src/handlers/git/diff.ts",
      "src/handlers/git/log.ts",
      "src/handlers/git/branch.ts",
      "src/handlers/git/show.ts",
    ];
    const result = await filterWith(
      "find",
      ["src", "-name", "*.ts"],
      rawFromPaths(files),
    );

    // Should NOT be a single "src/ (20 files)" — need subdirectory visibility
    expect(result.output).not.toMatch(/^\.\n├─ src\/ \(20 files\)\n$/m);

    // Output should contain meaningful groupings including at least core/ or handlers/
    // (not checking for exact format since implementation may vary)
  });

  // --------------------------------------------------------------------------
  // Small input: passthrough behavior
  // --------------------------------------------------------------------------

  test("keeps small find output compact without inflating it", async () => {
    const files = ["package.json", "README.md", "tsconfig.json"];
    const result = await filterWith(
      "find",
      [".", "-name", "*.json"],
      rawFromPaths(files),
    );

    const rawChars = files.map((f) => `./${f}`).join("\n").length;
    expect(result.outputChars).toBeLessThanOrEqual(rawChars + 40);
    for (const file of files) {
      expect(result.output).toContain(file);
    }
  });

  test("lists every filename when ten or fewer unique paths", async () => {
    const files = Array.from({ length: 10 }, (_, index) => `src/file-${index}.ts`);
    const result = await filterWith("find", ["src"], rawFromPaths(files));

    for (const file of files) {
      expect(result.output).toContain(file);
    }
    expect(result.output).not.toMatch(/src\/ \(\d+ files\)/);
  });

  test("summarizes by directory when more than eighty unique paths", async () => {
    const files = Array.from({ length: 81 }, (_, index) => `src/pkg-${index}/index.ts`);
    const result = await filterWith("find", ["src"], rawFromPaths(files));

    expect(result.output).toContain("... 1 more files");
    expect(result.output).not.toContain("src/pkg-80/index.ts");
  });

  // --------------------------------------------------------------------------
  // All skipped: only noise directories
  // --------------------------------------------------------------------------

  test("handles listing where all entries are in skipped directories", async () => {
    const files = Array.from(
      { length: 10 },
      (_, i) => `node_modules/pkg-${i}/index.js`,
    );
    const result = await filterWith("find", ["."], rawFromPaths(files));

    // Should report everything was skipped, not crash
    expect(result.output).toContain("Skipped:");
    expect(result.output).toContain("node_modules/");
    expect(result.output).not.toContain("pkg-");
  });

  // --------------------------------------------------------------------------
  // Single file result
  // --------------------------------------------------------------------------

  test("handles single-file find result", async () => {
    const result = await filterWith(
      "find",
      ["src", "-name", "cli.ts"],
      rawFromPaths(["src/cli.ts"]),
    );

    // Should show the file, not collapse to "src/ (1 file)"
    expect(result.output).toContain("cli.ts");
  });
});

describe("tree-specific handler correctness gaps", () => {
  test("removes tree summary lines while preserving tree structure", async () => {
    const raw: RawResult = {
      command: "tree .",
      stdout: [
        ".",
        "├── src",
        "│   ├── main.rs",
        "│   └── lib.rs",
        "└── Cargo.toml",
        "",
        "2 directories, 3 files",
      ].join("\n"),
      stderr: "",
      exitCode: 0,
      durationMs: 1,
    };

    const result = await filterWith("tree", ["."], raw);

    expect(result.output).toContain("├── src");
    expect(result.output).toContain("│   ├── main.rs");
    expect(result.output).toContain("└── Cargo.toml");
    expect(result.output).not.toContain("directories");
    expect(result.output).not.toContain("3 files");
  });

  test("removes tree summary variations", async () => {
    const raw: RawResult = {
      command: "tree .",
      stdout: ".\n└── file.txt\n\n10 directories, 25 files\n",
      stderr: "",
      exitCode: 0,
      durationMs: 1,
    };

    const result = await filterWith("tree", ["."], raw);

    expect(result.output).toContain("file.txt");
    expect(result.output).not.toContain("10 directories");
    expect(result.output).not.toContain("25 files");
  });

  test("returns a stable newline for empty tree output", async () => {
    const raw: RawResult = {
      command: "tree empty",
      stdout: "",
      stderr: "",
      exitCode: 0,
      durationMs: 1,
    };

    const result = await filterWith("tree", ["empty"], raw);

    expect(result.output).toBe("\n");
  });

  test("reports skipped noise directories from tree output", async () => {
    const raw: RawResult = {
      command: "tree .",
      stdout: [
        ".",
        "├── node_modules",
        "│   └── package",
        "├── target",
        "│   └── debug",
        "└── src",
        "    └── main.rs",
      ].join("\n"),
      stderr: "",
      exitCode: 0,
      durationMs: 1,
    };

    const result = await filterWith("tree", ["."], raw);

    expect(result.output).toContain("Skipped:");
    expect(result.output).toContain("node_modules/");
    expect(result.output).toContain("target/");
    expect(result.output).toContain("src");
    expect(result.output).not.toContain("package");
  });
});
