import { describe, expect, test, vi } from "vitest";

import { buildTreeArgs, treeHandler } from "../../../src/handlers/system/tree.js";
import { executeCommand } from "../../../src/executor.js";
import type { ParsedCommand, RawResult } from "../../../src/types.js";
import {
  expectRtkParity,
  filterRtkFixture,
  filterRtkOutput,
} from "../../helpers/rtkCommandHarness.js";

// The migration harness only exercises filter(); the fail-open path lives in
// execute(), so we mock executeCommand to drive the re-run without spawning tree.
// importOriginal keeps the executor's other exports intact.
vi.mock("../../../src/executor.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../src/executor.js")>();
  return { ...actual, executeCommand: vi.fn() };
});

const mockedExecute = executeCommand as unknown as ReturnType<typeof vi.fn>;

function rawResult(over: Partial<RawResult>): RawResult {
  return { command: "tree", stdout: "", stderr: "", exitCode: 0, durationMs: 1, ...over };
}

// RTK: system/tree.rs::filter_tree_output — strip the trailing
// `N directories, M files` summary line while preserving the tree hierarchy
// (├──/└──/│), and remove trailing empty lines.

describe("RTK tree behavior", () => {
  // RTK: tree.rs::run — the bulk of tree savings comes from rewriting the
  // invocation with `-I <noise>` so heavy directories never reach the renderer.
  describe("buildTreeArgs command construction", () => {
    test("injects the noise -I exclusion ahead of the user path", () => {
      const args = buildTreeArgs(["."]);
      expect(args[0]).toBe("-I");
      expect(args[1]).toContain("node_modules");
      expect(args[1]).toContain(".git");
      expect(args[1]).toContain("dist");
      // The user's original args are preserved after the injected exclusion.
      expect(args[args.length - 1]).toBe(".");
    });

    test("does not inject -I when the user passes -a/--all", () => {
      expect(buildTreeArgs(["-a", "."])).toEqual(["-a", "."]);
      expect(buildTreeArgs(["--all"])).toEqual(["--all"]);
    });

    test("respects a user-supplied ignore pattern (no noise -I injected)", () => {
      // A custom -I suppresses the noise pattern but NOT the fan-out cap — the
      // goal only exempts --filelimit / -a from the balanced default.
      const args = buildTreeArgs(["-I", "foo", "."]);
      expect(args).toContain("-I");
      expect(args).toContain("foo");
      expect(args).not.toContain("node_modules");
      const ignoreIdx = args.indexOf("-I");
      expect(args[ignoreIdx + 1]).toBe("foo"); // user's pattern, not the noise list
      expect(args).toContain("--filelimit");

      const fromLong = buildTreeArgs(["--ignore=foo"]);
      expect(fromLong).toContain("--ignore=foo");
      expect(fromLong).not.toContain("node_modules");
    });

    // tk divergence G3: balanced (default) injects the native fan-out cap.
    test("injects --filelimit by default (balanced)", () => {
      const args = buildTreeArgs(["."]);
      expect(args).toContain("--filelimit");
      expect(args[args.indexOf("--filelimit") + 1]).toBe("25");
      expect(args[args.length - 1]).toBe(".");
    });

    test("does not double-inject when the user supplies --filelimit", () => {
      const args = buildTreeArgs(["--filelimit", "5", "."]);
      expect(args.filter((a) => a === "--filelimit")).toHaveLength(1);
      expect(args).toContain("5");
      expect(args).not.toContain("25");
    });

    test("does not inject --filelimit when the user passes -a", () => {
      expect(buildTreeArgs(["-a", "."])).toEqual(["-a", "."]);
    });

    // --level dial (shared CompressionLevel): none/minimal preserve the full tree;
    // balanced caps fan-out; aggressive caps + dirs-only.
    test("--level none injects no --filelimit (full tree)", () => {
      const args = buildTreeArgs(["--level", "none", "."]);
      expect(args).not.toContain("--filelimit");
      expect(args).not.toContain("-d");
      expect(args[0]).toBe("-I"); // noise pruning still applies
    });

    test("--level minimal injects no --filelimit (== none for tree)", () => {
      expect(buildTreeArgs(["--level", "minimal", "."])).not.toContain("--filelimit");
    });

    test("--level aggressive injects --filelimit and -d (dirs only)", () => {
      const args = buildTreeArgs(["--level", "aggressive", "."]);
      expect(args).toContain("--filelimit");
      expect(args[args.indexOf("--filelimit") + 1]).toBe("25");
      expect(args).toContain("-d");
    });

    test("strips --level before invoking the real binary", () => {
      expect(buildTreeArgs(["--level=balanced", "."])).not.toContain("--level=balanced");
    });
  });

  // RTK: tree.rs::test_filter_removes_summary + test_filter_preserves_structure.
  test("removes the summary line while preserving hierarchy structure", async () => {
    const result = await filterRtkFixture(
      ["tree", "."],
      "tests/fixtures/common/tree_with_summary.txt",
    );

    expect(result.output).toContain("├── src");
    expect(result.output).toContain("│   ├── main.rs");
    expect(result.output).toContain("└── tests");
    expect(result.output).toContain("test.rs");

    expectRtkParity(result, {
      critical: ["├── src", "│   ├── main.rs", "│   └── lib.rs", "└── tests", "    └── test.rs"],
      // Only the "N directories, M files" summary is removed.
      forbidden: [/directories,/, /\d+ files?$/m],
    });
    // Issue #43: this fixture is a tiny tree (< DISCLOSURE_MIN_RAW_CHARS), so the
    // H17 disclosure is suppressed — it would otherwise dominate the byte budget.
    expect(result.output).not.toContain("tool dirs");
  });

  // tk divergence G3: filter_tree_output must PRESERVE tree's native
  // `[N entries exceeds filelimit, not opening dir]` marker — its strip condition
  // needs both "director" and "file", and the marker has "dir"/"file" but not
  // "director". A future edit must not regress this.
  test("preserves the exceeds-filelimit marker while stripping the summary", async () => {
    const result = await filterRtkFixture(
      ["tree", "."],
      "tests/fixtures/system/tree_filelimit.txt",
    );

    // The oversized dir collapses to one line with the native count marker.
    expect(result.output).toContain("packages");
    expect(result.output).toContain("[30 entries exceeds filelimit, not opening dir]");
    // Small dirs render fully.
    expect(result.output).toContain("│   │   ├── index.ts");
    expect(result.output).toContain("button.tsx");
    // The trailing "N directories, M files" summary is still removed.
    expect(result.output).not.toMatch(/\d+ directories, \d+ files/);
  });

  // RTK: tree.rs::test_filter_summary_variations — different summary phrasings
  // (singular/plural directory/file) are all stripped, content is preserved.
  // H17: a disclosure line is appended when noise dirs may have been hidden.
  test("strips summary variations regardless of singular/plural phrasing", async () => {
    const variations: Array<[string, string]> = [
      [".\n└── file.txt\n\n0 directories, 1 file\n", "1 file"],
      [".\n└── file.txt\n\n1 directory, 0 files\n", "1 directory"],
      [".\n└── file.txt\n\n10 directories, 25 files\n", "25 files"],
    ];

    for (const [input, summaryFragment] of variations) {
      // Use -a so no disclosure line is added (this test focuses on summary stripping).
      const result = await filterRtkOutput(["tree", "-a", "."], input);
      expect(result.output).not.toContain(summaryFragment);
      expect(result.output).toContain("file.txt");
      expect(result.output).toContain("└── file.txt");
    }
  });

  // RTK: tree.rs::test_filter_removes_trailing_empty_lines (combined with summary
  // removal so the change is visible past trim()) — trailing blank lines and the
  // summary line are removed, leaving the hierarchy + disclosure + a single final newline.
  // H17: use -a to skip noise disclosure, isolating the trailing-empty-line behaviour.
  test("removes trailing empty lines and the summary line", async () => {
    const result = await filterRtkOutput(
      ["tree", "-a", "."],
      ".\n├── file.txt\n\n0 directories, 1 file\n\n\n",
    );
    expect(result.output).toBe(".\n├── file.txt\n");
  });
});

// A tree whose raw stdout exceeds DISCLOSURE_MIN_RAW_CHARS (200), so the H17
// disclosure is large enough to matter and is shown. The summary line is appended
// by the caller where a stripped-summary assertion is needed.
function largeTree(): string {
  const entries = Array.from(
    { length: 30 },
    (_, i) => `│   ├── module_${String(i).padStart(2, "0")}.ts`,
  ).join("\n");
  return `.\n├── src\n${entries}\n└── README.md\n`;
}

// Regression tests for audit findings.
describe("tree audit regressions", () => {
  // H17: when tree's -I filter was injected (no -a / user -I), a disclosure line
  // must appear so the agent knows tool dirs like dist/build/coverage may be hidden.
  // Issue #43: only on trees large enough that a hidden tool dir actually matters.
  test("H17: disclosure line is present when noise dirs were filtered (large tree)", async () => {
    const result = await filterRtkOutput(
      ["tree", "."],
      `${largeTree()}\n2 directories, 31 files\n`,
    );

    // Structure is preserved.
    expect(result.output).toContain("└── README.md");
    expect(result.output).toContain("module_00.ts");
    // Disclosure line is present.
    expect(result.output).toContain("tool dirs");
    expect(result.output).toContain("use -a");
  });

  test("H17: no disclosure line when user passes -a (show all)", async () => {
    const result = await filterRtkOutput(
      ["tree", "-a", "."],
      `${largeTree()}\n2 directories, 31 files\n`,
    );

    expect(result.output).not.toContain("tool dirs");
  });

  test("H17: no disclosure line when user passes their own -I pattern", async () => {
    const result = await filterRtkOutput(
      ["tree", "-I", "node_modules", "."],
      `${largeTree()}\n2 directories, 31 files\n`,
    );

    expect(result.output).not.toContain("tool dirs");
  });

  // Issue #43: on a small tree the disclosure banner is suppressed so it cannot
  // inflate the output past the raw input. The disclosure is worth less than its
  // ~70-char byte cost on a 3-line tree.
  describe("issue #43: small-tree disclosure suppression", () => {
    const smallTree = ".\n├── src\n│   └── main.ts\n\n2 directories, 1 file\n";

    test("no disclosure banner on a small filtered tree", async () => {
      const result = await filterRtkOutput(["tree", "."], smallTree);

      expect(result.output).toContain("└── main.ts");
      // The banner is suppressed below the threshold.
      expect(result.output).not.toContain("tool dirs");
    });

    test("output is not larger than raw input solely due to the banner", async () => {
      const result = await filterRtkOutput(["tree", "."], smallTree);

      // The shipped output must never exceed the raw input on a small tree — the
      // summary line is stripped and no banner is added.
      expect(result.output.length).toBeLessThanOrEqual(smallTree.length);
      expect(result.outputChars).toBeLessThanOrEqual(result.rawChars);
    });

    test("savings never goes negative purely from the banner", async () => {
      const result = await filterRtkOutput(["tree", "."], smallTree);

      expect(result.savedTokens).toBeGreaterThanOrEqual(0);
      expect(result.savingsPct).toBeGreaterThanOrEqual(0);
      // Stripping the summary line is a real (non-negative) win, not a loss.
      expect(result.outputChars).toBeLessThan(result.rawChars);
    });

    test("a large tree shows the banner without it dominating the byte budget", async () => {
      const raw = `${largeTree()}\n2 directories, 31 files\n`;
      const result = await filterRtkOutput(["tree", "."], raw);

      // The banner IS shown (AC2): hidden tool dirs matter on a tree this size, and
      // the compacted form shipped (not reverted to raw by the inflation guard).
      expect(result.output).toContain("tool dirs");
      // The banner overhead is a small fraction of a large tree, never dominating
      // it the way it would a 3-line tree (issue #43 root cause).
      expect(result.outputChars - result.rawChars).toBeLessThan(80);
      // Savings accounting stays non-negative.
      expect(result.savedTokens).toBeGreaterThanOrEqual(0);
      expect(result.savingsPct).toBeGreaterThanOrEqual(0);
    });
  });
});

describe("RTK tree execute fail-open", () => {
  const command: ParsedCommand = {
    program: "tree",
    args: ["."],
    original: ["tree", "."],
    displayCommand: "tree .",
  };

  // Cross-platform: busybox / very old BSD tree reject --filelimit. The proxy
  // must re-run with the user's original args, never error out (retention-first).
  test("re-runs with original args when --filelimit is unsupported", async () => {
    mockedExecute.mockReset();
    mockedExecute
      .mockResolvedValueOnce(
        rawResult({ stderr: "tree: Invalid argument `--filelimit'.", exitCode: 1 }),
      )
      .mockResolvedValueOnce(rawResult({ stdout: ".\n└── a.ts\n", exitCode: 0 }));

    const result = await treeHandler.execute(command, {} as never);

    expect(mockedExecute).toHaveBeenCalledTimes(2);
    expect(mockedExecute.mock.calls[0]![0].args).toContain("--filelimit");
    // Fallback uses the user's original args, with no injected cap.
    expect(mockedExecute.mock.calls[1]![0].args).toEqual(["."]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("a.ts");
  });

  // A genuine failure unrelated to --filelimit must NOT trigger the re-run.
  test("does not re-run on an unrelated non-zero exit", async () => {
    mockedExecute.mockReset();
    mockedExecute.mockResolvedValueOnce(
      rawResult({ stderr: "tree: ./missing: No such file or directory", exitCode: 1 }),
    );

    const result = await treeHandler.execute(command, {} as never);

    expect(mockedExecute).toHaveBeenCalledTimes(1);
    expect(result.exitCode).toBe(1);
  });
});
