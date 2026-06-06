import { describe, expect, test } from "vitest";

import { failureHint } from "../../../src/core/failureHints.js";
import type { ParsedCommand, RawResult } from "../../../src/types.js";

const cmd: ParsedCommand = { program: "git", args: [], original: [], displayCommand: "git" };

function raw(partial: Partial<RawResult>): RawResult {
  return { command: "git", stdout: "", stderr: "", exitCode: 1, durationMs: 0, ...partial };
}

describe("failureHint", () => {
  test("returns undefined on success regardless of text", () => {
    expect(failureHint(raw({ exitCode: 0, stderr: "permission denied" }), cmd)).toBeUndefined();
  });

  test("git push non-fast-forward", () => {
    const r = raw({
      stderr:
        "! [rejected]        main -> main (non-fast-forward)\nerror: failed to push some refs",
    });
    expect(failureHint(r, cmd)).toContain("tk git pull --rebase");
  });

  test("unmerged paths", () => {
    expect(failureHint(raw({ stderr: "error: you have unmerged paths." }), cmd)).toContain(
      "resolve the conflicted files",
    );
  });

  test("not a git repository", () => {
    expect(
      failureHint(raw({ stderr: "fatal: not a git repository (or any parent)", exitCode: 128 }), cmd),
    ).toContain("not inside a git repository");
  });

  test("missing npm script (npm and pnpm phrasings)", () => {
    expect(failureHint(raw({ stderr: 'npm error Missing script: "build"' }), cmd)).toContain(
      "package.json script",
    );
    expect(failureHint(raw({ stderr: 'ERR_PNPM  Command "build" not found' }), cmd)).toContain(
      "package.json script",
    );
  });

  test("command not found via exit 127", () => {
    expect(failureHint(raw({ exitCode: 127, stderr: "" }), cmd)).toContain("command not found");
  });

  test("permission denied", () => {
    expect(failureHint(raw({ stderr: "bash: ./run.sh: Permission denied" }), cmd)).toContain(
      "permission denied",
    );
  });

  test("unknown deterministic-free failure → undefined (never guesses)", () => {
    expect(
      failureHint(raw({ exitCode: 1, stderr: "TypeError: cannot read property foo of undefined" }), cmd),
    ).toBeUndefined();
  });
});
