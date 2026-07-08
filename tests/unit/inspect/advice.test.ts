import { describe, expect, test } from "vitest";

import {
  buildAdvice,
  renderAdviceFile,
  renderAdviceMarkdown,
} from "../../../src/inspect/advice.js";
import type { Opportunity, ScanResult } from "../../../src/inspect/scan.js";

function opp(over: Partial<Opportunity> & Pick<Opportunity, "key" | "kind">): Opportunity {
  return {
    category: over.kind === "shell" ? "execute_adjacent" : "read",
    count: 0,
    share: 0,
    total_output_chars: 0,
    total_output_tokens: 0,
    avg_output_chars: 0,
    max_output_chars: 0,
    total_input_chars: 0,
    total_input_tokens: 0,
    max_input_chars: 0,
    success_count: 0,
    failure_count: 0,
    compressible: false,
    governed_deny: 0,
    governed_suggest: 0,
    large_output_count: 0,
    ...over,
  };
}

function scanWith(inputType: ScanResult["inputType"], opportunities: Opportunity[]): ScanResult {
  return {
    inputType,
    session_inventory: 5,
    transcript_coverage: 2,
    tool_event_count: opportunities.reduce((s, o) => s + o.count, 0),
    unknown_time_records: 0,
    coverage_errors: 0,
    opportunities,
  };
}

describe("buildAdvice — delivery recommendation leads", () => {
  test("vscode with raw compressible commands → recommend the shim (ctx install)", () => {
    const scan = scanWith("vscode", [
      opp({ key: "git status", kind: "shell", compressible: true, count: 6 }),
    ]);
    const findings = buildAdvice(scan);
    expect(findings[0].type).toBe("delivery");
    expect(findings[0].recommendation).toContain("ctx install");
    expect(findings[0].recommendation).not.toContain("--host copilot-cli");
  });

  test("copilot-cli → recommend ctx install --host copilot-cli", () => {
    const scan = scanWith("copilot-cli", [
      opp({ key: "npm test", kind: "shell", compressible: true, count: 5 }),
    ]);
    const findings = buildAdvice(scan);
    expect(findings[0].type).toBe("delivery");
    expect(findings[0].recommendation).toContain("--host copilot-cli");
  });

  test("no delivery finding when raw compressible volume below threshold", () => {
    const scan = scanWith("vscode", [
      opp({ key: "git status", kind: "shell", compressible: true, count: 1 }),
    ]);
    expect(buildAdvice(scan).some((f) => f.type === "delivery")).toBe(false);
  });

  test("already-ctx commands are not counted as raw", () => {
    const scan = scanWith("vscode", [
      opp({ key: "ctx", kind: "shell", compressible: true, count: 20 }),
    ]);
    expect(buildAdvice(scan).some((f) => f.type === "delivery")).toBe(false);
  });
});

describe("buildAdvice — per-command & governance findings", () => {
  test("shell-noise rewrite advice for frequent raw commands", () => {
    const scan = scanWith("vscode", [
      opp({
        key: "git status",
        kind: "shell",
        compressible: true,
        count: 4,
        total_output_tokens: 90,
      }),
    ]);
    const shell = buildAdvice(scan).find((f) => f.type === "shell-noise");
    expect(shell?.recommendation).toContain("ctx git status");
  });

  test("tool-noise for dependency reads and repo-wide searches", () => {
    const scan = scanWith("vscode", [
      opp({ key: "read_file", kind: "direct", count: 5, governed_deny: 5 }),
      opp({ key: "grep_search", kind: "direct", count: 4, governed_suggest: 4 }),
    ]);
    const types = buildAdvice(scan).map((f) => f.title);
    expect(types.some((t) => t.includes("dependency/lockfile"))).toBe(true);
    expect(types.some((t) => t.includes("Narrow repo-wide"))).toBe(true);
  });

  test("workflow-friction for long-output hotspots", () => {
    const scan = scanWith("vscode", [
      opp({
        key: "read_file",
        kind: "direct",
        count: 3,
        large_output_count: 3,
        max_output_chars: 20000,
      }),
    ]);
    expect(buildAdvice(scan).some((f) => f.type === "workflow-friction")).toBe(true);
  });

  test("thresholds filter out low-occurrence / low-confidence findings", () => {
    const scan = scanWith("vscode", [
      opp({ key: "git status", kind: "shell", compressible: true, count: 4 }),
    ]);
    expect(buildAdvice(scan, { minConfidence: 0.6, minOccurrences: 10 })).toEqual([]);
  });

  test("findings never contain raw evidence (keys are sanitized)", () => {
    const scan = scanWith("vscode", [
      opp({ key: "git status", kind: "shell", compressible: true, count: 5 }),
    ]);
    expect(JSON.stringify(buildAdvice(scan))).not.toMatch(/node_modules|\/Users\/|SECRET/);
  });
});

describe("buildAdvice — workflow-signal gaps (skill / context / storage)", () => {
  test("skill-gap when manual file reads repeat heavily", () => {
    const scan = scanWith("vscode", [
      opp({ key: "read_file", kind: "direct", category: "read", count: 8 }),
    ]);
    const f = buildAdvice(scan).find((x) => x.type === "skill-gap");
    expect(f).toBeDefined();
    expect(f!.recommendation).toContain("skill");
  });

  test("context-gap when repo searches repeat heavily", () => {
    const scan = scanWith("vscode", [
      opp({ key: "grep_search", kind: "direct", category: "search", count: 7 }),
    ]);
    const f = buildAdvice(scan).find((x) => x.type === "context-gap");
    expect(f).toBeDefined();
    expect(f!.recommendation).toMatch(/CONTEXT\.md|AGENTS\.md/);
  });

  test("storage-discovery when sessions exist but no tool events were read", () => {
    const scan: ScanResult = {
      inputType: "vscode",
      session_inventory: 12,
      transcript_coverage: 0,
      tool_event_count: 0,
      unknown_time_records: 0,
      coverage_errors: 0,
      opportunities: [],
    };
    const f = buildAdvice(scan).find((x) => x.type === "storage-discovery");
    expect(f).toBeDefined();
    expect(f!.occurrences).toBe(12);
  });

  test("no gap findings when reads/searches are incidental", () => {
    const scan = scanWith("vscode", [
      opp({ key: "read_file", kind: "direct", category: "read", count: 2 }),
      opp({ key: "grep_search", kind: "direct", category: "search", count: 2 }),
    ]);
    const types = buildAdvice(scan).map((f) => f.type);
    expect(types).not.toContain("skill-gap");
    expect(types).not.toContain("context-gap");
    expect(types).not.toContain("storage-discovery");
  });
});

describe("buildAdvice — habit-based cost tips (chronicle parity)", () => {
  const habits = (over: Partial<import("../../../src/inspect/habits.js").HabitStats> = {}) => ({
    sessions: 1,
    total_tool_calls: 0,
    avg_tool_calls_per_session: 0,
    max_tool_calls_in_session: 0,
    prompt_count: 0,
    avg_prompt_chars: 0,
    max_prompt_chars: 0,
    long_prompt_count: 0,
    ...over,
  });

  test("flags long agent loops (high tool calls per session)", () => {
    const scan = scanWith("vscode", []);
    const f = buildAdvice(
      scan,
      undefined,
      habits({
        avg_tool_calls_per_session: 25,
        total_tool_calls: 50,
        max_tool_calls_in_session: 30,
      }),
    ).find((x) => x.type === "cost-tip" && x.title.includes("Long agent loops"));
    expect(f).toBeDefined();
    expect(f!.recommendation).toMatch(/fresh session|shorter|scope/i);
  });

  test("flags oversized prompts", () => {
    const scan = scanWith("vscode", []);
    const f = buildAdvice(
      scan,
      undefined,
      habits({ long_prompt_count: 4, avg_prompt_chars: 3000, max_prompt_chars: 9000 }),
    ).find((x) => x.type === "cost-tip" && x.title.includes("oversized prompts"));
    expect(f).toBeDefined();
    expect(f!.occurrences).toBe(4);
  });

  test("repeated failures → capture-the-fix (improve) even without habits", () => {
    const scan = scanWith("vscode", [
      opp({
        key: "npm test",
        kind: "shell",
        category: "execute_adjacent",
        count: 5,
        failure_count: 4,
      }),
    ]);
    const f = buildAdvice(scan).find(
      (x) => x.type === "cost-tip" && x.title.includes("Repeated failures"),
    );
    expect(f).toBeDefined();
    expect(f!.recommendation).toMatch(/AGENTS\.md/);
  });

  test("flags high orientation cost (reads+searches+lists) → code intelligence", () => {
    const scan = scanWith("vscode", [
      opp({ key: "read_file", kind: "direct", category: "read", count: 8 }),
      opp({ key: "grep_search", kind: "direct", category: "search", count: 5 }),
    ]);
    const f = buildAdvice(scan).find(
      (x) => x.type === "cost-tip" && x.title.includes("orientation cost"),
    );
    expect(f).toBeDefined();
    expect(f!.recommendation).toMatch(/code-intelligence|LSP|scoped/);
  });

  test("no cost tips for lean habits", () => {
    const scan = scanWith("vscode", []);
    expect(
      buildAdvice(
        scan,
        undefined,
        habits({ avg_tool_calls_per_session: 5, long_prompt_count: 0 }),
      ).some((x) => x.type === "cost-tip"),
    ).toBe(false);
  });
});

describe("rendering", () => {
  const scan = scanWith("vscode", [
    opp({ key: "git status", kind: "shell", compressible: true, count: 6 }),
  ]);

  test("markdown shows corrections + recommendations", () => {
    const md = renderAdviceMarkdown(buildAdvice(scan));
    expect(md).toContain("## Advice");
    expect(md).toContain("→");
  });

  test("advice file has the generated marker header", () => {
    const file = renderAdviceFile(buildAdvice(scan));
    expect(file).toContain("# CLI Corrections (generated by ctx inspect)");
  });

  test("empty findings render gracefully", () => {
    expect(renderAdviceMarkdown([])).toContain("No high-confidence corrections");
    expect(renderAdviceFile([])).toContain("No high-confidence corrections");
  });
});
