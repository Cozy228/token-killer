// Slice 1 integration — static-context analyzers wired into the one `tk inspect`
// (goal §"CLI contract", ADR 0003). Verifies scope axes, removed-flag handling,
// and per-scope bucket persistence.

import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const cli = path.join(repoRoot, "src/cli.ts");
const tsxLoader = pathToFileURL(path.join(repoRoot, "node_modules/tsx/dist/loader.mjs")).href;

let home: string;
let project: string;

beforeEach(() => {
  home = mkdtempSync(path.join(tmpdir(), "tk-ctx-home-"));
  project = mkdtempSync(path.join(tmpdir(), "tk-ctx-proj-"));
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

function runTk(args: string[], cwd = project) {
  return spawnSync(process.execPath, ["--import", tsxLoader, cli, ...args], {
    cwd,
    encoding: "utf8",
    timeout: 15000,
    env: {
      ...process.env,
      HOME: home,
      USERPROFILE: home,
      // Windows VS Code source discovery resolves via APPDATA — sandbox it too.
      APPDATA: path.join(home, "AppData", "Roaming"),
      TOKEN_KILLER_HOME: path.join(home, ".token-killer"),
    },
  });
}

describe("tk inspect — static context wiring", () => {
  test("--project --text surfaces static findings and exits 0", () => {
    write(project, ".github/copilot-instructions.md", "# Copilot\nproject rules\n");
    write(project, "AGENTS.md", "---\nbroken yaml\n---\n# Agents\n");

    const r = runTk(["inspect", "--project", "--text"]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("source = static_context");
    // Malformed frontmatter surfaces as a finding.
    expect(r.stdout).toContain("malformed_frontmatter");
  });

  test("--project --json emits a unified findings array", () => {
    write(project, "AGENTS.md", "---\nbroken yaml\n---\n# Agents\n");
    const r = runTk(["inspect", "--project", "--json"]);
    expect(r.status).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(Array.isArray(parsed.findings)).toBe(true);
    expect(
      parsed.static_context.findings.some((f: { source: string }) => f.source === "static_context"),
    ).toBe(true);
  });

  test("persists a project-scope bucket to ~/.token-killer/projects/<fp>/inspect/latest.json", () => {
    write(project, "AGENTS.md", "# Agents\n");
    const r = runTk(["inspect", "--project", "--text"]);
    expect(r.status).toBe(0);
    const projectsDir = path.join(home, ".token-killer", "projects");
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

  test("removed flags (--copilot-context/--repo-context/--telemetry-export) report unknown flag (exit 1)", () => {
    for (const flag of ["--copilot-context", "--repo-context", "--telemetry-export"]) {
      const r = runTk(["inspect", flag]);
      expect(r.status).toBe(1);
      expect(r.stderr).toContain("unknown flag");
    }
  });

  test("--surface skills on an empty user scope reports zero and exits 2", () => {
    // No user-level skills present → static empty, runtime empty → exit 2.
    const r = runTk(["inspect", "--surface", "skills"]);
    expect(r.status).toBe(2);
  });

  test("--fail-on warn exits 4 when a warn finding exists", () => {
    write(project, "AGENTS.md", "---\nbroken yaml\n---\n# Agents\n");
    const r = runTk(["inspect", "--project", "--fail-on", "warn"]);
    expect(r.status).toBe(4);
  });
});
