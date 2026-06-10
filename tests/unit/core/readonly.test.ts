import { describe, expect, test } from "vitest";

import { isReadOnlyForHandler } from "../../../src/core/readonly.js";
import type { ParsedCommand } from "../../../src/types.js";

function cmd(program: string, args: string[]): ParsedCommand {
  return {
    program,
    args,
    original: [program, ...args],
    displayCommand: [program, ...args].join(" "),
  };
}

describe("isReadOnlyForHandler — the dedup read-only gate (ADR 0009)", () => {
  test("pure-read handlers are always read-only", () => {
    expect(isReadOnlyForHandler("ls", cmd("ls", ["-la"]))).toBe(true);
    expect(isReadOnlyForHandler("tree", cmd("tree", ["-L", "2"]))).toBe(true);
    expect(isReadOnlyForHandler("search-like", cmd("rg", ["TODO", "src"]))).toBe(true);
    expect(isReadOnlyForHandler("wc", cmd("wc", ["-l", "f"]))).toBe(true);
    expect(isReadOnlyForHandler("read", cmd("cat", ["f"]))).toBe(true);
    expect(isReadOnlyForHandler("read-like", cmd("less", ["f"]))).toBe(true);
    expect(isReadOnlyForHandler("env", cmd("env", []))).toBe(true);
    expect(isReadOnlyForHandler("git-status", cmd("git", ["status"]))).toBe(true);
    expect(isReadOnlyForHandler("git-log", cmd("git", ["log", "--oneline"]))).toBe(true);
    expect(isReadOnlyForHandler("git-diff", cmd("git", ["diff", "--stat"]))).toBe(true);
    expect(isReadOnlyForHandler("package-list", cmd("pnpm", ["list"]))).toBe(true);
  });

  test("L12: rg --pre runs an arbitrary preprocessor command → NOT read-only", () => {
    expect(isReadOnlyForHandler("search-like", cmd("rg", ["--pre", "sh", "TODO", "."]))).toBe(
      false,
    );
    expect(isReadOnlyForHandler("search-like", cmd("rg", ["--pre-glob", "*.md", "TODO"]))).toBe(
      false,
    );
    expect(isReadOnlyForHandler("search-like", cmd("rg", ["TODO", "src"]))).toBe(true);
  });

  test("an unknown / non-cacheable handler is denied (default-deny)", () => {
    expect(isReadOnlyForHandler("totally-unknown", cmd("whatever", []))).toBe(false);
    // npmHandler is not cacheable; its name is not in the allowlist, so even if it
    // somehow reached the gate it is denied rather than blindly trusted.
    expect(isReadOnlyForHandler("npm", cmd("npm", ["install"]))).toBe(false);
  });

  test("eslint: read-only unless --fix / --fix-type (robust to npx/pnpm wrappers)", () => {
    expect(isReadOnlyForHandler("eslint", cmd("eslint", ["src/"]))).toBe(true);
    expect(isReadOnlyForHandler("eslint", cmd("eslint", ["--fix", "src/"]))).toBe(false);
    expect(isReadOnlyForHandler("eslint", cmd("eslint", ["--fix-type", "problem"]))).toBe(false);
    // The bypass the review caught: program is pnpm/npx, the tool + flag live in args.
    expect(isReadOnlyForHandler("eslint", cmd("pnpm", ["eslint", "--fix", "src/"]))).toBe(false);
    expect(isReadOnlyForHandler("eslint", cmd("npx", ["eslint", "src/"]))).toBe(true);
    // --fix-dry-run reports but does not write.
    expect(isReadOnlyForHandler("eslint", cmd("eslint", ["--fix-dry-run", "src/"]))).toBe(true);
  });

  test("ruff: check is read-only; --fix and format mutate", () => {
    expect(isReadOnlyForHandler("ruff", cmd("ruff", ["check", "."]))).toBe(true);
    expect(isReadOnlyForHandler("ruff", cmd("ruff", ["check", "--fix", "."]))).toBe(false);
    expect(isReadOnlyForHandler("ruff", cmd("ruff", ["format", "."]))).toBe(false);
    expect(isReadOnlyForHandler("ruff", cmd("ruff", ["format", "--check", "."]))).toBe(true);
  });

  test("tsc: read-only only with --noEmit (emits .js by default)", () => {
    expect(isReadOnlyForHandler("tsc", cmd("tsc", ["--noEmit"]))).toBe(true);
    expect(isReadOnlyForHandler("tsc", cmd("tsc", []))).toBe(false);
    expect(isReadOnlyForHandler("tsc", cmd("tsc", ["-p", "tsconfig.json"]))).toBe(false);
    expect(isReadOnlyForHandler("tsc", cmd("npx", ["tsc", "--noEmit"]))).toBe(true);
  });

  test("find (list-like): -exec / -delete mutate, plain listing is read-only", () => {
    expect(isReadOnlyForHandler("list-like", cmd("find", [".", "-name", "*.ts"]))).toBe(true);
    expect(
      isReadOnlyForHandler("list-like", cmd("find", [".", "-exec", "chmod", "+x", "{}", "+"])),
    ).toBe(false);
    expect(isReadOnlyForHandler("list-like", cmd("find", [".", "-delete"]))).toBe(false);
  });

  test("git-branch: read-only listing, -d/-m/--delete mutate", () => {
    expect(isReadOnlyForHandler("git-branch", cmd("git", ["branch"]))).toBe(true);
    expect(isReadOnlyForHandler("git-branch", cmd("git", ["branch", "--list"]))).toBe(true);
    expect(isReadOnlyForHandler("git-branch", cmd("git", ["branch", "-d", "x"]))).toBe(false);
    expect(isReadOnlyForHandler("git-branch", cmd("git", ["branch", "--move", "a", "b"]))).toBe(
      false,
    );
  });

  test("docker / kubectl read vs write subcommands", () => {
    expect(isReadOnlyForHandler("docker", cmd("docker", ["ps"]))).toBe(true);
    expect(isReadOnlyForHandler("docker", cmd("docker", ["compose", "ps"]))).toBe(true);
    expect(isReadOnlyForHandler("docker", cmd("docker", ["rm", "c"]))).toBe(false);
    expect(isReadOnlyForHandler("docker", cmd("docker", ["build", "."]))).toBe(false);
    expect(isReadOnlyForHandler("kubectl", cmd("kubectl", ["get", "pods"]))).toBe(true);
    expect(isReadOnlyForHandler("kubectl", cmd("kubectl", ["delete", "pod", "x"]))).toBe(false);
  });

  test("mypy: read-only unless --install-types", () => {
    expect(isReadOnlyForHandler("mypy", cmd("mypy", ["src"]))).toBe(true);
    expect(isReadOnlyForHandler("mypy", cmd("mypy", ["--install-types"]))).toBe(false);
  });
});
