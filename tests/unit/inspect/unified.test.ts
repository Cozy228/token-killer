import { describe, expect, test } from "vitest";

import { runtimeFindings } from "../../../src/inspect/unified.js";
import type { Opportunity, ScanResult } from "../../../src/inspect/scan.js";
import type { ToolCategory } from "../../../src/hook/normalize.js";

// Build one Opportunity with sane defaults; override what a case cares about.
function opp(over: Partial<Opportunity> & { key: string; category: ToolCategory }): Opportunity {
  const count = over.count ?? 5;
  const outChars = over.total_output_chars ?? 1000;
  return {
    key: over.key,
    kind: over.kind ?? "direct",
    category: over.category,
    count,
    share: over.share ?? 0.1,
    total_output_chars: outChars,
    total_output_tokens: over.total_output_tokens ?? Math.round(outChars / 4),
    avg_output_chars: Math.round(outChars / count),
    max_output_chars: over.max_output_chars ?? outChars,
    total_input_chars: over.total_input_chars ?? 100,
    max_input_chars: over.max_input_chars ?? 50,
    success_count: over.success_count ?? count,
    failure_count: over.failure_count ?? 0,
    compressible: over.compressible ?? false,
    governed_deny: over.governed_deny ?? 0,
    governed_suggest: over.governed_suggest ?? 0,
    large_output_count: over.large_output_count ?? 0,
  };
}

function scanOf(opportunities: Opportunity[]): ScanResult {
  return {
    inputType: "vscode",
    session_inventory: 3,
    transcript_coverage: 3,
    tool_event_count: opportunities.reduce((s, o) => s + o.count, 0),
    unknown_time_records: 0,
    coverage_errors: 0,
    opportunities,
  };
}

describe("runtimeFindings — aggregation (no per-tool dump)", () => {
  test("50 native read/list tools collapse into ONE orientation finding, not 50", () => {
    // Simulate the old "tool noise": dozens of distinct native tools the user has no
    // lever over (read_file, list_directory, …) each with output volume.
    const many: Opportunity[] = [];
    for (let i = 0; i < 50; i += 1) {
      many.push(
        opp({
          key: `read_file_${i}`,
          category: i % 2 ? "read" : "list",
          count: 4,
          total_output_chars: 2000,
        }),
      );
    }
    const out = runtimeFindings(scanOf(many));
    // One aggregate, not one-per-tool.
    expect(out.length).toBe(1);
    expect(out[0].type).toBe("orientation_cost");
    // No finding name leaks an individual native tool key.
    expect(out.every((f) => !/read_file_\d+/.test(f.evidence))).toBe(true);
    // It carries an actionable where (was empty before).
    expect(out[0].where).toBeTruthy();
  });

  test("compressible commands aggregate into ONE delivery finding", () => {
    const opps = [
      opp({
        key: "git status",
        kind: "shell",
        category: "execute_adjacent",
        count: 8,
        compressible: true,
        total_output_chars: 8000,
      }),
      opp({
        key: "git diff",
        kind: "shell",
        category: "execute_adjacent",
        count: 6,
        compressible: true,
        total_output_chars: 12000,
      }),
      opp({
        key: "ls",
        kind: "shell",
        category: "execute_adjacent",
        count: 5,
        compressible: true,
        total_output_chars: 3000,
      }),
    ];
    const out = runtimeFindings(scanOf(opps));
    const delivery = out.filter((f) => f.type === "uncompressed_commands");
    expect(delivery.length).toBe(1);
    expect(delivery[0].fix_class).toBe("delivery");
    expect(delivery[0].evidence).toContain("19 shell command(s)"); // 8+6+5
    expect(delivery[0].where).toContain("tk install");
  });

  test("repeated failures roll up and name the top offenders", () => {
    const opps = [
      opp({
        key: "pytest",
        kind: "shell",
        category: "execute_adjacent",
        count: 10,
        failure_count: 6,
      }),
      opp({ key: "tsc", kind: "shell", category: "execute_adjacent", count: 8, failure_count: 4 }),
    ];
    const out = runtimeFindings(scanOf(opps));
    const fail = out.find((f) => f.type === "repeated_failures");
    expect(fail).toBeDefined();
    expect(fail!.evidence).toContain("10 failed"); // 6 + 4
    expect(fail!.where).toContain("AGENTS.md");
  });

  test("severity tracks token volume (huge orientation → error)", () => {
    const huge = opp({
      key: "read",
      category: "read",
      count: 200,
      total_output_chars: 800_000,
      total_output_tokens: 200_000,
    });
    const out = runtimeFindings(scanOf([huge]));
    expect(out[0].type).toBe("orientation_cost");
    expect(out[0].severity).toBe("error"); // ≥ 40k tokens
  });

  test("low-occurrence noise is dropped entirely (no actionable signal)", () => {
    const out = runtimeFindings(
      scanOf([
        opp({
          key: "git status",
          kind: "shell",
          category: "execute_adjacent",
          count: 1,
          compressible: true,
        }),
      ]),
    );
    expect(out).toEqual([]);
  });

  test("every emitted finding has a where", () => {
    const opps = [
      opp({
        key: "git status",
        kind: "shell",
        category: "execute_adjacent",
        count: 8,
        compressible: true,
        total_output_chars: 9000,
      }),
      opp({ key: "read", category: "read", count: 30, total_output_chars: 60_000 }),
      opp({ key: "node", kind: "shell", category: "execute_adjacent", count: 9, failure_count: 5 }),
    ];
    const out = runtimeFindings(scanOf(opps));
    expect(out.length).toBeGreaterThan(0);
    expect(out.every((f) => typeof f.where === "string" && f.where.length > 0)).toBe(true);
  });
});
