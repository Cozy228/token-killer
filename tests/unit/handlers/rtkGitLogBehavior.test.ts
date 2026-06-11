import { describe, expect, test } from "vitest";

import { expectRtkParity, filterRtkOutput } from "../../helpers/rtkCommandHarness.js";
import { routeCommand } from "../../../src/router.js";
import type { ParsedCommand, RawResult, TkOptions } from "../../../src/types.js";

// Direct handler invocation — bypasses assertNotUnfilteredPassthrough for tests
// where output intentionally equals raw (H6 passthrough, M20 large log).
function parsed(args: string[]): ParsedCommand {
  return {
    program: args[0] ?? "",
    args: args.slice(1),
    original: args,
    displayCommand: args.join(" "),
  };
}

function raw(args: string[], stdout: string, exitCode = 0, stderr = ""): RawResult {
  return { command: args.join(" "), stdout, stderr, exitCode, durationMs: 1 };
}

const options: TkOptions = {
  raw: false,
  stats: false,
  maxLines: 120,
  maxChars: 12000,
  saveRaw: false,
  cwd: "/tmp",
};

async function runHandler(args: string[], stdout: string, exitCode = 0, stderr = "") {
  const cmd = parsed(args);
  const handler = routeCommand(cmd);
  return handler.filter(raw(args, stdout, exitCode, stderr), cmd, options);
}

describe("RTK git log behavior", () => {
  test("keeps commits and body signal while stripping trailers", async () => {
    const result = await filterRtkOutput(
      ["git", "log"],
      [
        "abc1234 fix auth",
        "BREAKING CHANGE: removed old API",
        "Signed-off-by: Dev <dev@example.com>",
        "def5678 update docs",
      ].join("\n"),
    );

    expect(result.output).toContain("abc1234");
    expect(result.output).toContain("BREAKING CHANGE");
    expect(result.output).toContain("def5678");
    expect(result.output).not.toMatch(/Signed-off-by/);

    expectRtkParity(result, {
      critical: ["abc1234", "BREAKING CHANGE", "def5678"],
      forbidden: [/Signed-off-by/],
      exact: ["abc1234 fix auth", "  BREAKING CHANGE: removed old API", "def5678 update docs"].join(
        "\n",
      ),
    });
  });

  // H6 regression: rich output flags (-p/--patch/--stat/--name-status/--name-only/
  // --show-signature/--format/--pretty) contain content that our reformatter cannot
  // handle losslessly — the output must pass through with the rich content intact.
  //
  // We use `runHandler` directly (not `filterRtkOutput`) because the H6 passthrough
  // produces output == raw, which `filterRtkOutput`'s passthrough guard rejects.
  // The regression being tested is content *destruction* in the old code — the old
  // two-commit verbose parser would collapse the log to "Git Log: 2 commits", losing
  // all diffs/stats/name lines entirely.
  describe("H6: rich output flags pass through with content intact", () => {
    test("git log -p retains patch diff content (old formatter stripped diffs)", async () => {
      const patchOutput = [
        "commit abc1234def5678abcdef1234567890abc1234abc",
        "Author: Alice <alice@example.com>",
        "Date:   Mon Jan 1 00:00:00 2024 +0000",
        "",
        "    fix: correct auth flow",
        "",
        "diff --git a/src/auth.ts b/src/auth.ts",
        "--- a/src/auth.ts",
        "+++ b/src/auth.ts",
        "@@ -1,3 +1,3 @@",
        "-const old = 1;",
        "+const fixed = 1;",
        " const ok = true;",
        "",
        "commit def5678abc1234abcdef5678901234def5678def",
        "Author: Bob <bob@example.com>",
        "Date:   Tue Jan 2 00:00:00 2024 +0000",
        "",
        "    feat: add feature",
        "",
        "diff --git a/src/feature.ts b/src/feature.ts",
        "--- /dev/null",
        "+++ b/src/feature.ts",
        "@@ -0,0 +1,2 @@",
        "+export function feature() {}",
        "+export default feature;",
      ].join("\n");

      const result = await runHandler(["git", "log", "-p"], patchOutput);

      // With H6 fix: diffs survive. Without: "Git Log: 2 commits" only.
      expect(result.output).toContain("diff --git a/src/auth.ts");
      expect(result.output).toContain("-const old = 1;");
      expect(result.output).toContain("+const fixed = 1;");
      expect(result.output).toContain("diff --git a/src/feature.ts");
    });

    test("git log --stat retains file statistics (old formatter stripped stat lines)", async () => {
      const statOutput = [
        "commit abc1234def5678abcdef1234567890abc1234abc",
        "Author: Bob <bob@example.com>",
        "Date:   Tue Jan 2 00:00:00 2024 +0000",
        "",
        "    chore: update deps",
        "",
        " package.json | 4 ++--",
        " pnpm-lock.yaml | 80 +++++++++++++++++++++++++++++++++++++++++++--------",
        " 2 files changed, 62 insertions(+), 22 deletions(-)",
        "",
        "commit def5678abc1234abcdef5678901234def5678def",
        "Author: Alice <alice@example.com>",
        "Date:   Mon Jan 1 00:00:00 2024 +0000",
        "",
        "    feat: setup project",
        "",
        " tsconfig.json | 15 +++++++++++++++",
        " 1 file changed, 15 insertions(+)",
      ].join("\n");

      const result = await runHandler(["git", "log", "--stat"], statOutput);

      // With H6 fix: stat lines survive. Without: "Git Log: 2 commits" only.
      expect(result.output).toContain("package.json | 4 ++--");
      expect(result.output).toContain("2 files changed, 62 insertions");
      expect(result.output).toContain("tsconfig.json | 15");
    });

    test("git log --name-status retains A/M/D file status lines", async () => {
      const nameStatusOutput = [
        "commit abc1234def5678abcdef1234567890abc1234abc",
        "Author: Carol <carol@example.com>",
        "Date:   Wed Jan 3 00:00:00 2024 +0000",
        "",
        "    feat: add file",
        "",
        "A\tsrc/new-feature.ts",
        "M\tsrc/existing.ts",
        "",
        "commit def5678abc1234abcdef5678901234def5678def",
        "Author: Dave <dave@example.com>",
        "Date:   Thu Jan 4 00:00:00 2024 +0000",
        "",
        "    fix: remove obsolete",
        "",
        "D\tsrc/old-stuff.ts",
        "M\tsrc/index.ts",
      ].join("\n");

      const result = await runHandler(["git", "log", "--name-status"], nameStatusOutput);

      expect(result.output).toContain("A\tsrc/new-feature.ts");
      expect(result.output).toContain("M\tsrc/existing.ts");
      expect(result.output).toContain("D\tsrc/old-stuff.ts");
    });

    test("git log --name-only retains changed file name lines", async () => {
      const nameOnlyOutput = [
        "commit abc1234def5678abcdef1234567890abc1234abc",
        "Author: Dave <dave@example.com>",
        "Date:   Fri Jan 5 00:00:00 2024 +0000",
        "",
        "    fix: update config",
        "",
        "config.yaml",
        "README.md",
        "",
        "commit def5678abc1234abcdef5678901234def5678def",
        "Author: Eve <eve@example.com>",
        "Date:   Sat Jan 6 00:00:00 2024 +0000",
        "",
        "    chore: add changelog",
        "",
        "CHANGELOG.md",
        "docs/guide.md",
      ].join("\n");

      const result = await runHandler(["git", "log", "--name-only"], nameOnlyOutput);

      expect(result.output).toContain("config.yaml");
      expect(result.output).toContain("README.md");
      expect(result.output).toContain("CHANGELOG.md");
    });
  });

  // M20-log regression: the old undeclared `[+N lines omitted]` body cap trips the
  // base omission sniffer and reverts the whole output to raw (0% savings + false
  // `inflated` row). The declared ladder must ship a declared omission, not revert.
  describe("M20-log: long-body log ships declared omission, not raw revert", () => {
    test("a log with many body lines per commit emits no undeclared omission marker", async () => {
      // Produce a log where each commit has >3 body lines — the old code would
      // emit `[+N lines omitted]` which trips the omission sniffer.
      const lines: string[] = [];
      for (let i = 0; i < 5; i += 1) {
        lines.push(`abc${i}000 feat: commit ${i}`);
        for (let j = 0; j < 6; j += 1) {
          lines.push(`  body line ${j} for commit ${i}`);
        }
      }
      const result = await filterRtkOutput(["git", "log"], lines.join("\n"));

      // No undeclared omission marker — the old `[+N lines omitted]` must be gone.
      expect(result.output).not.toMatch(/\[?\+\d+ lines omitted\]?/);
    });

    test("a very large oneline log: omission declared if present, no [+N lines omitted]", async () => {
      // Build a large enough log to exceed the budget and trigger the digest ladder.
      // Use `runHandler` to avoid the passthrough guard — over-budget output may
      // differ from raw, but the test fixture is large enough that headers survive.
      const lines: string[] = [];
      for (let i = 0; i < 200; i += 1) {
        const hash = `a${i.toString().padStart(7, "0")}b`;
        lines.push(`${hash} feat: add feature number ${i} with a descriptive commit message`);
        // Each commit has 4 body lines (>3 triggers the old undeclared cap)
        for (let j = 0; j < 4; j += 1) {
          lines.push(`  This is body line ${j} of commit ${i} with some extra text to fill space`);
        }
      }

      const result = await runHandler(["git", "log"], lines.join("\n"));

      // The old `[+N lines omitted]` marker must be absent.
      expect(result.output).not.toMatch(/\[?\+\d+ lines omitted\]?/);
      // If a ladder omission fired, the kind must be declared.
      if (result.omission !== undefined) {
        expect(["digest", "replacement"]).toContain(result.omission.kind);
      }
    });
  });
});
