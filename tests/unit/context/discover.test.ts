import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { discoverContextFiles } from "../../../src/context/discover.js";

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "tk-ctx-discover-"));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function write(rel: string, content = "x\n"): void {
  const abs = join(root, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content);
}

describe("context/discover — project scope", () => {
  test("discovers each supported project surface and skips dep/build dirs", () => {
    const cwd = join(root, "repo");
    mkdirSync(cwd, { recursive: true });
    const w = (rel: string) => write(join("repo", rel));
    w(".github/copilot-instructions.md");
    w(".github/instructions/api.instructions.md");
    w(".github/prompts/review.prompt.md");
    w(".github/agents/dev.agent.md");
    w("AGENTS.md");
    w("CLAUDE.md");
    w("GEMINI.md");
    w("packages/foo/AGENTS.md");
    // Must be skipped:
    w("node_modules/pkg/AGENTS.md");
    w("dist/AGENTS.md");

    const { files } = discoverContextFiles({ scopes: ["project"], cwd, home: root });
    const byDisplay = new Map(files.map((f) => [f.display.replace(/\\/g, "/"), f]));

    expect(byDisplay.has(".github/copilot-instructions.md")).toBe(true);
    expect(byDisplay.get(".github/copilot-instructions.md")!.surface).toBe("copilot_instructions");
    expect(byDisplay.get(".github/instructions/api.instructions.md")!.surface).toBe("path_instructions");
    expect(byDisplay.get(".github/prompts/review.prompt.md")!.surface).toBe("prompt_file");
    expect(byDisplay.get(".github/agents/dev.agent.md")!.surface).toBe("custom_agent");
    expect(byDisplay.get("CLAUDE.md")!.adapter).toBe("claude");
    expect(byDisplay.get("GEMINI.md")!.adapter).toBe("gemini");

    // Root AGENTS.md is always_on; nested is not.
    expect(byDisplay.get("AGENTS.md")!.always_on).toBe(true);
    expect(byDisplay.get("packages/foo/AGENTS.md")!.always_on).toBe(false);

    // Dependency/build dirs are never recursed.
    const paths = files.map((f) => f.path.replace(/\\/g, "/"));
    expect(paths.some((p) => p.includes("/node_modules/"))).toBe(false);
    expect(paths.some((p) => p.includes("/dist/"))).toBe(false);
  });

  test("default (user) scope does not read project files", () => {
    const cwd = join(root, "repo");
    mkdirSync(cwd, { recursive: true });
    write(join("repo", "AGENTS.md"));
    const { files } = discoverContextFiles({ scopes: ["user"], cwd, home: join(root, "emptyhome") });
    expect(files.length).toBe(0);
  });
});

describe("context/discover — user scope", () => {
  test("discovers user-level CLAUDE.md, copilot instructions, and skills", () => {
    const home = join(root, "home");
    write(join("home", ".claude", "CLAUDE.md"));
    write(join("home", ".copilot", "copilot-instructions.md"));
    write(join("home", ".claude", "skills", "deploy", "SKILL.md"));

    const { files } = discoverContextFiles({ scopes: ["user"], cwd: root, home });
    const surfaces = files.map((f) => f.surface).sort();
    expect(surfaces).toContain("agent_instructions"); // ~/.claude/CLAUDE.md
    expect(surfaces).toContain("copilot_instructions");
    expect(surfaces).toContain("skill");
    expect(files.every((f) => f.scope === "user")).toBe(true);
    // The CLAUDE.md user file is always_on.
    const claude = files.find((f) => f.surface === "agent_instructions");
    expect(claude!.always_on).toBe(true);
  });
});
