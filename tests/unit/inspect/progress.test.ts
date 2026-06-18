import { describe, expect, test } from "vitest";

import { makeProgressReporter, progressEnabled } from "../../../src/inspect/progress.js";

describe("progressEnabled — gate", () => {
  test("true only on an interactive STDERR with no opt-out", () => {
    expect(progressEnabled({}, { isTTY: true })).toBe(true);
  });

  test("false when STDERR is not a TTY (pipes / CI / tests)", () => {
    expect(progressEnabled({}, { isTTY: undefined })).toBe(false);
    expect(progressEnabled({}, { isTTY: false })).toBe(false);
  });

  test("false when TK_NO_PROGRESS is set, even on a TTY", () => {
    expect(progressEnabled({ TK_NO_PROGRESS: "1" }, { isTTY: true })).toBe(false);
  });
});

describe("makeProgressReporter — output", () => {
  function capture() {
    const out: string[] = [];
    return { out, write: (s: string) => void out.push(s) };
  }

  test("disabled reporter emits nothing", () => {
    const { out, write } = capture();
    const p = makeProgressReporter({ enabled: false, write });
    p.phase("Scanning…");
    p.step(1, 3);
    p.done();
    expect(out).toEqual([]);
  });

  test("phase prints a persistent line; step overwrites in place; done clears it", () => {
    const { out, write } = capture();
    const p = makeProgressReporter({ enabled: true, tty: true, write });
    p.phase("Scanning 3 files…");
    p.step(1, 3);
    p.step(2, 3);
    p.done();
    expect(out).toEqual([
      "Scanning 3 files…\n",
      "\r  1/3",
      "\r  2/3",
      "\r     \r", // 5 spaces == width of "  2/3"
    ]);
  });

  test("a new phase clears the live counter before printing its label", () => {
    const { out, write } = capture();
    const p = makeProgressReporter({ enabled: true, tty: true, write });
    p.step(1, 10); // "  1/10" → 6 chars
    p.phase("Next…");
    expect(out).toEqual(["\r  1/10", "\r      \r", "Next…\n"]);
  });

  test("step with an unknown total shows a bare count", () => {
    const { out, write } = capture();
    const p = makeProgressReporter({ enabled: true, tty: true, write });
    p.step(5, 0);
    expect(out).toEqual(["\r  5"]);
  });
});

describe("makeProgressReporter — non-TTY milestones (issue #46)", () => {
  function capture() {
    const out: string[] = [];
    return { out, write: (s: string) => void out.push(s) };
  }

  test("forced-on into a pipe emits bounded milestone lines, not one-per-file", () => {
    const { out, write } = capture();
    const p = makeProgressReporter({ enabled: true, tty: false, write });
    p.phase("Scanning 510 files…");
    // Simulate one step per file (what scan.ts does) over a large file set. On a TTY this
    // is 510 `\r` overwrites that collapse; on a pipe they'd pile up as 510 lines (the bug).
    const total = 510;
    for (let i = 1; i <= total; i += 1) p.step(i, total);
    p.done();
    // 1 phase line + at most one line per 10% bucket (0%,10%,…,100% = 11) → far under 510.
    expect(out.length).toBeLessThanOrEqual(1 + 11);
    // No `\r` overwrites a pipe can't collapse; every line is newline-terminated.
    for (const line of out) {
      expect(line).not.toContain("\r");
      expect(line.endsWith("\n")).toBe(true);
    }
    // The final milestone reports completion.
    expect(out.at(-1)).toBe(`  ${total}/${total} (100%)\n`);
  });

  test("milestone lines only fire on a fresh 10% crossing", () => {
    const { out, write } = capture();
    const p = makeProgressReporter({ enabled: true, tty: false, write });
    // total 10 → each step crosses a new 10% bucket.
    for (let i = 1; i <= 10; i += 1) p.step(i, 10);
    expect(out).toEqual([
      "  1/10 (10%)\n",
      "  2/10 (20%)\n",
      "  3/10 (30%)\n",
      "  4/10 (40%)\n",
      "  5/10 (50%)\n",
      "  6/10 (60%)\n",
      "  7/10 (70%)\n",
      "  8/10 (80%)\n",
      "  9/10 (90%)\n",
      "  10/10 (100%)\n",
    ]);
  });

  test("a phase resets milestone thresholds and prints its label verbatim", () => {
    const { out, write } = capture();
    const p = makeProgressReporter({ enabled: true, tty: false, write });
    p.step(5, 10); // 50%
    p.phase("Next phase…");
    p.step(1, 10); // 10% of the new phase — fires again after the reset
    expect(out).toEqual(["  5/10 (50%)\n", "Next phase…\n", "  1/10 (10%)\n"]);
  });

  test("step with an unknown total is a no-op (no milestone math)", () => {
    const { out, write } = capture();
    const p = makeProgressReporter({ enabled: true, tty: false, write });
    p.step(5, 0);
    p.done();
    expect(out).toEqual([]);
  });
});
