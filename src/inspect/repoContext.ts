// Slice 4 — optional repository context (inspect-v1-design.md "Repository
// Context"). Opt-in (`--repo-context`), lightweight metadata + durable-guidance
// PRESENCE only. It must NOT become source-code analysis: presence booleans, no
// file contents.

import { existsSync } from "node:fs";
import { join } from "node:path";

export type RepoContext = {
  has_git: boolean;
  has_package_manifest: boolean;
  has_context_doc: boolean;
  has_adr_index: boolean;
  has_skill_or_rules: boolean;
};

const MANIFESTS = ["package.json", "pyproject.toml", "Cargo.toml", "go.mod", "pom.xml", "build.gradle"];
const CONTEXT_DOCS = ["CONTEXT.md", "CONTEXT-MAP.md"];
const SKILL_RULES = [".github/copilot-instructions.md", "CLAUDE.md", "AGENTS.md", ".cursorrules"];

function anyExists(cwd: string, candidates: string[]): boolean {
  return candidates.some((rel) => existsSync(join(cwd, rel)));
}

export function gatherRepoContext(cwd: string): RepoContext {
  return {
    has_git: existsSync(join(cwd, ".git")),
    has_package_manifest: anyExists(cwd, MANIFESTS),
    has_context_doc: anyExists(cwd, CONTEXT_DOCS),
    has_adr_index: existsSync(join(cwd, "docs", "adr")),
    has_skill_or_rules: anyExists(cwd, SKILL_RULES),
  };
}
