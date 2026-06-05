// Slice 1 integration — static-context analyzers wired into the one `tg inspect`
// (goal §"CLI contract", ADR 0003). Verifies scope axes, the --copilot-context
// narrowing flag, mutual exclusivity, and per-scope bucket persistence.

import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const cli = path.join(repoRoot, "src/cli.ts");
const tsxLoader = path.join(repoRoot, "node_modules/tsx/dist/loader.mjs");

let home: string;
let project: string;

beforeEach(() => {
  home = mkdtempSync(path.join(tmpdir(), "tg-ctx-home-"));
  project = mkdtempSync(path.join(tmpdir(), "tg-ctx-proj-"));
});
afterEach(() => {
  rmSync(home, { recursive: true, force: true });
  rmSync(project, { recursive: true, force: true });
});

function write(base: string, rel: string, content: string): void {
  const abs = path.join(base, rel);
  mkdirSync(path.dirname(abs), { recursive: true });
  writeFileSync(abs, content);
}

function runTg(args: string[], cwd = project) {
  return spawnSync(process.execPath, ["--import", tsxLoader, cli, ...args], {
    cwd,
    encoding: "utf8",
    timeout: 15000,
    env: {
      ...process.env,
      HOME: home,
      USERPROFILE: home,
      TOKEN_GUARD_HOME: path.join(home, ".token-guard"),
    },
  });
}

describe("tg inspect — static context wiring", () => {
  test("--project --copilot-context narrows to static findings and exits 0", () => {
    write(project, ".github/copilot-instructions.md", "# Copilot\nproject rules\n");
    write(project, "AGENTS.md", "---\nbroken yaml\n---\n# Agents\n");

    const r = runTg(["inspect", "--project", "--copilot-context"]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("source = static_context");
    // Malformed frontmatter surfaces as a finding.
    expect(r.stdout).toContain("malformed_frontmatter");
    // No runtime table when --copilot-context turns runtime off.
    expect(r.stdout).not.toContain("Opportunities (ranked");
  });

  test("--project --copilot-context --json emits a unified findings array", () => {
    write(project, "AGENTS.md", "---\nbroken yaml\n---\n# Agents\n");
    const r = runTg(["inspect", "--project", "--copilot-context", "--json"]);
    expect(r.status).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(Array.isArray(parsed.findings)).toBe(true);
    expect(parsed.static_context.findings.some((f: { source: string }) => f.source === "static_context")).toBe(true);
  });

  test("persists a project-scope bucket to ~/.token-guard/projects/<fp>/inspect/latest.json", () => {
    write(project, "AGENTS.md", "# Agents\n");
    const r = runTg(["inspect", "--project", "--copilot-context"]);
    expect(r.status).toBe(0);
    const projectsDir = path.join(home, ".token-guard", "projects");
    expect(existsSync(projectsDir)).toBe(true);
    // Find the single bucket dir.
    const buckets = readdirSync(projectsDir);
    expect(buckets.length).toBe(1);
    const latest = path.join(projectsDir, buckets[0], "inspect", "latest.json");
    expect(existsSync(latest)).toBe(true);
    const report = JSON.parse(readFileSync(latest, "utf8"));
    expect(report.scope).toBe("project");
    expect(report.fingerprint).toMatch(/^repo:/);
  });

  test("--copilot-context with a runtime-only flag is an invalid-arg error (exit 1)", () => {
    const r = runTg(["inspect", "--copilot-context", "--since", "7d"]);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("cannot be combined with runtime-only flags");
  });

  test("--surface skills on an empty user scope reports zero and exits 2", () => {
    // No user-level skills present → static empty, runtime empty → exit 2.
    const r = runTg(["inspect", "--copilot-context", "--surface", "skills"]);
    expect(r.status).toBe(2);
  });

  test("--fail-on warn exits 4 when a warn finding exists", () => {
    write(project, "AGENTS.md", "---\nbroken yaml\n---\n# Agents\n");
    const r = runTg(["inspect", "--project", "--copilot-context", "--fail-on", "warn"]);
    expect(r.status).toBe(4);
  });
});
