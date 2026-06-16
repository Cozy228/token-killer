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
    const p = makeProgressReporter({ enabled: true, write });
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
    const p = makeProgressReporter({ enabled: true, write });
    p.step(1, 10); // "  1/10" → 6 chars
    p.phase("Next…");
    expect(out).toEqual(["\r  1/10", "\r      \r", "Next…\n"]);
  });

  test("step with an unknown total shows a bare count", () => {
    const { out, write } = capture();
    const p = makeProgressReporter({ enabled: true, write });
    p.step(5, 0);
    expect(out).toEqual(["\r  5"]);
  });
});
