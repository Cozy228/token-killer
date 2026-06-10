import { describe, expect, test } from "vitest";

import { routeCommand } from "../../../src/router.js";
import type { ParsedCommand, RawResult, TkOptions } from "../../../src/types.js";

// Direct handler invocation — bypasses the assertNotUnfilteredPassthrough guard
// used by filterRtkOutput. These tests verify passthrough behaviour which is
// intentionally output === raw.
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
  verbose: false,
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

describe("RTK git show behavior", () => {
  // C4 regression: `git show HEAD:path/to/file` outputs file content (deeply-
  // indented source lines). The old formatShow treated 4-space-indented source
  // as a "commit subject" and `| N` lines as diffstat — silently destroying
  // content. With the C4 fix the output is a byte-identical passthrough.
  describe("C4: colon-spec (blob/file content) passthrough", () => {
    test("git show HEAD:f.ts with deeply-indented source is byte-identical passthrough", async () => {
      const fileContent = [
        "export function foo() {",
        "    if (true) {",
        "        return 42;",
        "    }",
        "}",
      ].join("\n");

      const result = await runHandler(["git", "show", "HEAD:src/foo.ts"], fileContent);

      // Byte-identical passthrough — every indented line must survive unchanged.
      expect(result.output.trim()).toBe(fileContent.trim());
      expect(result.output).toContain("        return 42;");
      // Should NOT produce "Clean working tree" or other fabricated text.
      expect(result.output).not.toContain("commit ");
    });

    test("git show HEAD:README.md with pipe-like lines is not reinterpreted as diffstat", async () => {
      const readmeContent = [
        "# My Project",
        "",
        "| Column | Value |",
        "| ------ | ----- |",
        "| foo    | 123   |",
        "| bar    | 456   |",
      ].join("\n");

      const result = await runHandler(["git", "show", "HEAD:README.md"], readmeContent);

      expect(result.output).toContain("| foo    | 123   |");
      expect(result.output).toContain("| bar    | 456   |");
      // The table line count must not be interpreted as a diffstat summary.
      expect(result.output).not.toMatch(/files? changed/);
    });

    test("git show :path with root-tree colon spec is a passthrough", async () => {
      const content = "module.exports = { strict: true };\n";
      const result = await runHandler(["git", "show", ":jest.config.js"], content);
      expect(result.output.trim()).toBe(content.trim());
    });

    test("git show with --format flag passes through without commit reformatting", async () => {
      const customFormat = "%H|%s|%an\nabc1234|fix: do thing|Alice";
      const result = await runHandler(["git", "show", "--format=%H|%s|%an", "HEAD"], customFormat);
      expect(result.output).toContain("abc1234|fix: do thing|Alice");
    });

    test("git show with --pretty flag passes through without commit reformatting", async () => {
      const customFormat = "HASH=abc1234\nSUBJECT=fix: do thing";
      const result = await runHandler(
        ["git", "show", "--pretty=format:HASH=%H%nSUBJECT=%s", "HEAD"],
        customFormat,
      );
      expect(result.output).toContain("HASH=abc1234");
      expect(result.output).toContain("SUBJECT=fix: do thing");
    });

    test("git show on an actual commit object uses the commit formatter (not passthrough)", async () => {
      const commitOutput = [
        "commit abc1234567890abcdef1234567890abcdef123456",
        "Author: Alice <alice@example.com>",
        "Date:   Mon Jan 1 00:00:00 2024 +0000",
        "",
        "    fix: resolve login issue",
        "",
        "diff --git a/src/auth.ts b/src/auth.ts",
        "--- a/src/auth.ts",
        "+++ b/src/auth.ts",
        "@@ -1,2 +1,2 @@",
        "-const old = 1;",
        "+const fixed = 1;",
      ].join("\n");

      const result = await runHandler(["git", "show", "HEAD"], commitOutput);

      // It goes through the commit formatter — commit hash present.
      expect(result.output).toContain("abc1234");
      expect(result.output).toContain("fix: resolve login issue");
      // The diff content should also be present (via compactUnifiedDiff).
      expect(result.output).toContain("auth.ts");
    });
  });
});
