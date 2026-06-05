import { describe, expect, test } from "vitest";

import { shimmablePrograms } from "../../../src/shim/programs.js";

describe("shimmablePrograms (wrapper-set derivation)", () => {
  const set = new Set(shimmablePrograms());

  test("includes the real external executables handlers front", () => {
    for (const program of [
      "git", "gh", "glab", "gt", "ls", "tree", "cat", "grep", "rg", "find",
      "diff", "wc", "env", "npm", "npx", "pnpm", "yarn", "jest", "vitest",
      "eslint", "tsc", "next", "prisma", "prettier", "playwright", "pytest",
      "ruff", "mypy", "pip", "mvn", "gradle", "javac", "curl", "aws", "psql",
      "wget", "docker", "kubectl", "terraform", "dotnet",
    ]) {
      expect(set.has(program), `expected ${program} in shim set`).toBe(true);
    }
  });

  test("excludes tk-native verbs (they front no external tool)", () => {
    for (const verb of [
      "read", "smart", "summary", "err", "test", "deps", "json", "log", "pipe",
      "format", "package-list", "generic", "type", "dir",
    ]) {
      expect(set.has(verb), `did not expect ${verb} in shim set`).toBe(false);
    }
  });

  test("never wraps interpreters/shells or tk itself (F1 deny-set)", () => {
    for (const program of ["node", "deno", "bun", "tsx", "python", "python3", "bash", "sh", "zsh", "pwsh", "tk"]) {
      expect(set.has(program), `must never wrap ${program}`).toBe(false);
    }
  });

  test("is sorted and deduped", () => {
    const list = shimmablePrograms();
    expect(list).toEqual([...new Set(list)].sort());
  });
});
