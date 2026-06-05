import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vitest";

import { expectRtkParity, filterRtkOutput } from "../../helpers/rtkCommandHarness.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

// RTK: system/read.rs — apply_line_window (tail_lines/max_lines) + optional line
// numbers over file content. tg routes `cat` here; RTK's own command is `read`,
// and tg accepts its flags (-m/--max-lines, --tail-lines, -n). The language-aware
// filter influences smart_truncate's structural retention.

describe("RTK read behavior", () => {
  // RTK: read.rs::apply_line_window (tail path) + test_apply_line_window_tail_lines
  // — keep only the last N lines; genuine reduction, no omission marker.
  test("--tail-lines keeps only the last N lines", async () => {
    const input = Array.from({ length: 180 }, (_, i) => `line ${i + 1}`).join("\n") + "\n";

    const result = await filterRtkOutput(["cat", "--tail-lines", "40", "src/main.ts"], input);

    expect(result.output).toContain("line 180");
    expect(result.output).toContain("line 141");
    expect(result.output).not.toContain("line 140");
    expect(result.output).not.toContain("line 1\n");

    expectRtkParity(result, {
      critical: ["line 141", "line 180"],
      forbidden: [/more lines/],
      minSavingsRatio: 0.5,
    });
  });

  // RTK: core/filter.rs::smart_truncate + read.rs::test_apply_line_window_max_lines_still_works
  // — cap at max_lines, keep the first max_lines/2 lines plus structurally
  // important lines, then a single `[N more lines]` marker.
  test("--max-lines caps content and appends a single more-lines marker", async () => {
    const input = Array.from({ length: 180 }, (_, i) => `line ${i + 1}`).join("\n") + "\n";

    const result = await filterRtkOutput(["cat", "--max-lines", "60", "src/main.ts"], input);

    expect(result.output).toContain("line 1");
    expect(result.output).toContain("[151 more lines]");
    expect(result.output).not.toContain("line 180");
    // Exactly one omission marker (smart_truncate never interleaves markers).
    expect(result.output.match(/more lines/g)?.length).toBe(1);

    expectRtkParity(result, {
      critical: ["line 1", "[151 more lines]"],
      maxOutputChars: 1200,
    });
  });

  // RTK: core/filter.rs::smart_truncate — import/declaration/brace lines are
  // structurally important and survive truncation even past max_lines/2.
  test("--max-lines retains structurally important lines (imports, declarations)", async () => {
    const input = await readSourceFixture();

    const result = await filterRtkOutput(["cat", "--max-lines", "20", "src/order.ts"], input);

    expect(result.output).toContain("import { api }");
    expect(result.output).toContain("export async function submitOrder");
    expect(result.output).toContain("export function validatePayload");
    expect(result.output).toContain("more lines");
  });

  // RTK: read.rs::format_with_line_numbers — right-aligned line numbers + " │ ".
  test("-n prefixes right-aligned line numbers", async () => {
    const input = await readSourceFixture();

    const result = await filterRtkOutput(["cat", "-n", "src/order.ts"], input);

    expect(result.output).toContain(" │ import { api }");
    expect(result.output).toMatch(/^ ?1 │ /m);
    // Full content is retained (line numbers only annotate).
    expect(result.output).toContain("cancelOrder");
  });
});

async function readSourceFixture(): Promise<string> {
  return readFile(path.join(repoRoot, "tests/fixtures/system/read_source.ts.txt"), "utf8");
}
