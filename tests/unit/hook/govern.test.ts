import { describe, expect, test } from "vitest";

import { governDirectTool } from "../../../src/hook/govern.js";
import { normalize, type ToolEvent } from "../../../src/hook/normalize.js";

function read(input: Record<string, unknown>): ToolEvent {
  return normalize({ event: "preToolUse", tool_name: "read_file", tool_input: input });
}
function list(input: Record<string, unknown>): ToolEvent {
  return normalize({ event: "preToolUse", tool_name: "list_dir", tool_input: input });
}
function search(input: Record<string, unknown>): ToolEvent {
  return normalize({ event: "preToolUse", tool_name: "grep_search", tool_input: input });
}

describe("governDirectTool — dependency-dir / lockfile reads → deny", () => {
  test("read inside node_modules → deny", () => {
    expect(governDirectTool(read({ filePath: "node_modules/foo/index.js" })).decision).toBe("deny");
  });

  test("read inside dist → deny", () => {
    expect(governDirectTool(read({ path: "dist/bundle.js" })).decision).toBe("deny");
  });

  test("read inside .git → deny", () => {
    expect(governDirectTool(read({ filePath: ".git/COMMIT_EDITMSG" })).decision).toBe("deny");
  });

  test("list a build directory → deny", () => {
    expect(governDirectTool(list({ path: "target/classes" })).decision).toBe("deny");
  });

  test("lockfile read → deny (any directory)", () => {
    expect(governDirectTool(read({ filePath: "pnpm-lock.yaml" })).decision).toBe("deny");
    expect(governDirectTool(read({ filePath: "sub/package-lock.json" })).decision).toBe("deny");
  });

  test("ordinary source read → allow", () => {
    expect(governDirectTool(read({ filePath: "src/cli.ts" })).decision).toBe("allow");
  });

  test("Windows-style separators are handled", () => {
    expect(governDirectTool(read({ filePath: "node_modules\\foo\\index.js" })).decision).toBe("deny");
  });
});

describe("governDirectTool — repo-wide search → suggest (warn)", () => {
  test("no path → suggest", () => {
    expect(governDirectTool(search({ query: "TODO" })).decision).toBe("suggest");
  });

  test("repo root path → suggest", () => {
    expect(governDirectTool(search({ query: "TODO", path: "." })).decision).toBe("suggest");
  });

  test("scoped path → allow", () => {
    expect(governDirectTool(search({ query: "TODO", path: "src" })).decision).toBe("allow");
  });

  test("include pattern counts as a scope → allow", () => {
    expect(governDirectTool(search({ query: "TODO", includePattern: "src/**/*.ts" })).decision).toBe("allow");
  });
});

describe("governDirectTool — never rewrites direct tools", () => {
  test("decision never carries a rewritten_command", () => {
    for (const ev of [read({ filePath: "node_modules/x" }), search({ query: "x" })]) {
      expect(governDirectTool(ev).rewritten_command).toBeUndefined();
    }
  });
});
