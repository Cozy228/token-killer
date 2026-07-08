import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { analyzeContext } from "../../../src/context/analyzer.js";
import { renderStaticContextSection } from "../../../src/context/report.js";

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "ctx-ctx-analyzer-"));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function write(rel: string, content: string): void {
  const abs = join(root, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content);
}

describe("context/analyzer", () => {
  test("scans project files and tags source=static_context", () => {
    const cwd = join(root, "repo");
    mkdirSync(cwd, { recursive: true });
    write("repo/AGENTS.md", "# Agents\nbe nice\n");
    write("repo/.github/copilot-instructions.md", "# Copilot\nrules\n");

    const res = analyzeContext({ scopes: ["project"], cwd, home: root });
    expect(res.files_scanned).toBe(2);
    expect(res.findings.every((f) => f.source === "static_context")).toBe(true);
  });

  test("malformed frontmatter yields a finding, not a crash", () => {
    const cwd = join(root, "repo");
    mkdirSync(cwd, { recursive: true });
    write("repo/AGENTS.md", "---\nbroken yaml line\n---\n# Body\n");

    const res = analyzeContext({ scopes: ["project"], cwd, home: root });
    const mf = res.findings.find((f) => f.type === "malformed_frontmatter");
    expect(mf).toBeDefined();
    expect(mf!.severity).toBe("warn");
    expect(mf!.file).toBe("AGENTS.md");
  });

  test("--surface narrows the scanned surfaces", () => {
    const cwd = join(root, "repo");
    mkdirSync(cwd, { recursive: true });
    write("repo/AGENTS.md", "# Agents\n");
    write("repo/.github/prompts/p.prompt.md", "# Prompt\n");

    const onlyPrompts = analyzeContext({
      scopes: ["project"],
      cwd,
      home: root,
      surface: "prompts",
    });
    expect(onlyPrompts.files_scanned).toBe(1);
  });

  test("finding ids are deterministic (cacheable, no timestamps)", () => {
    const cwd = join(root, "repo");
    mkdirSync(cwd, { recursive: true });
    write("repo/AGENTS.md", "---\nbroken\n---\nbody\n");
    const a = analyzeContext({ scopes: ["project"], cwd, home: root });
    const b = analyzeContext({ scopes: ["project"], cwd, home: root });
    expect(a.findings.map((f) => f.id)).toEqual(b.findings.map((f) => f.id));
  });
});

describe("context/report — static section render", () => {
  test("renders header, counts, and per-finding evidence", () => {
    const out = renderStaticContextSection({
      files_scanned: 3,
      findings: [
        {
          id: "x",
          source: "static_context",
          type: "malformed_frontmatter",
          severity: "warn",
          confidence: 1,
          surface: "agent_instructions",
          file: "AGENTS.md",
          start_line: 1,
          evidence: "bad yaml",
          recommendation: "fix it",
          fix_class: "advisory",
        },
      ],
    });
    expect(out).toContain("source = static_context");
    expect(out).toContain("Files scanned: 3");
    expect(out).toContain("[warn] malformed_frontmatter AGENTS.md:1");
    expect(out).toContain("Fix: advisory");
  });

  test("renders empty state", () => {
    const out = renderStaticContextSection({ files_scanned: 0, findings: [] });
    expect(out).toContain("No static-context findings");
  });

  test("consolidates same (severity,type,recommendation) findings into ONE block listing files", () => {
    const mk = (file: string) => ({
      id: file,
      source: "static_context" as const,
      type: "skill_invocation_policy" as const,
      severity: "warn" as const,
      confidence: 0.5,
      surface: "skill" as const,
      file,
      start_line: 6,
      evidence: "Read-only skill missing allowed-tools.",
      recommendation: "Add an `allowed-tools` list.",
      fix_class: "suggested_diff" as const,
    });
    const out = renderStaticContextSection({
      files_scanned: 3,
      findings: [mk("a/SKILL.md"), mk("b/SKILL.md"), mk("c/SKILL.md")],
    });
    // One grouped header with the count, the shared recommendation once, and a file list.
    expect(out).toContain("[warn] skill_invocation_policy (3 files)");
    expect(out).toContain("    - a/SKILL.md:6");
    expect(out).toContain("    - c/SKILL.md:6");
    // The recommendation appears once, not three times.
    expect(out.match(/Add an `allowed-tools` list\./g)?.length).toBe(1);
    // No per-file Evidence repetition in a consolidated group.
    expect(out).not.toContain("Evidence: Read-only skill missing allowed-tools.");
  });

  test("promotes a split type to its max severity (nothing dropped) and shows a Saves line", () => {
    const base = {
      source: "static_context" as const,
      confidence: 0.5,
      surface: "skill" as const,
      evidence: "x",
      recommendation: "fix it",
      fix_class: "advisory" as const,
    };
    const out = renderStaticContextSection({
      files_scanned: 3,
      findings: [
        { ...base, id: "1", type: "skill_invocation_policy", severity: "warn", file: "a" },
        { ...base, id: "2", type: "skill_invocation_policy", severity: "info", file: "b" },
        { ...base, id: "3", type: "instruction_duplicate", severity: "info", file: "c" },
      ] as never,
    });
    // The info-only type is KEPT (not dropped); the split type surfaces entirely as
    // warn (both instances promoted, so it never appears under [info]).
    expect(out).toContain("instruction_duplicate");
    expect(out).toContain("skill_invocation_policy (2 files)");
    // Every finding carries a Saves line (grounded or "varies").
    expect(out).toContain("Saves:");
  });
});
