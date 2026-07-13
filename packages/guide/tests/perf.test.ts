import { describe, expect, it } from "vitest";
import { BUDGET_CURRENT, createPerfRecorder, evaluateBudget } from "../src/perf.js";

function fakeClock() {
  let t = 0;
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms;
    },
  };
}

describe("perf recorder", () => {
  it("records action durations with an injected clock", () => {
    const clock = fakeClock();
    const perf = createPerfRecorder(clock.now);
    const result = perf.measureAction("expand", () => {
      clock.advance(42);
      return "done";
    });
    expect(result).toBe("done");
    expect(perf.record.expand).toHaveLength(1);
    expect(perf.record.expand[0].ms).toBe(42);
  });

  it("computes firstInteractive relative to projection availability", () => {
    const clock = fakeClock();
    const perf = createPerfRecorder(clock.now);
    clock.advance(100);
    perf.markProjectionAvailable();
    clock.advance(250);
    perf.markFirstInteractive();
    expect(perf.record.firstInteractive).toBe(250);
  });

  it("samples positive fps and evaluates against the D12 budget", () => {
    const clock = fakeClock();
    const perf = createPerfRecorder(clock.now);
    perf.markProjectionAvailable();
    perf.markFirstInteractive();
    perf.measureAction("search", () => clock.advance(10));
    perf.recordFps(60);
    perf.recordFps(55);
    expect(Math.min(...perf.record.panZoomFps)).toBeGreaterThan(0);

    const checks = evaluateBudget(perf.record, BUDGET_CURRENT);
    const fps = checks.find((c) => c.label.includes("fps"))!;
    expect(fps.pass).toBe(true);
    const search = checks.find((c) => c.label.includes("search"))!;
    expect(search.pass).toBe(true);
  });

  it("fails a budget check when no measurement exists", () => {
    const perf = createPerfRecorder(fakeClock().now);
    const checks = evaluateBudget(perf.record, BUDGET_CURRENT);
    expect(checks.find((c) => c.label.includes("first interactive"))!.pass).toBe(false);
  });
});
