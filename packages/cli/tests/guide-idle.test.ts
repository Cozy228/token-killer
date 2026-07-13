/**
 * IdleBackstop (R13) — fake-timer unit. The idle countdown fires exactly once
 * after `idleMs` of no `touch()`, is reset by `touch()`, and is cancelled by
 * `stop()`.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { IdleBackstop } from "../src/guide/idle.ts";

describe("IdleBackstop", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  test("fires once after idleMs of inactivity", () => {
    let fired = 0;
    const idle = new IdleBackstop(1000, () => {
      fired++;
    });
    idle.start();

    vi.advanceTimersByTime(999);
    expect(fired).toBe(0);

    vi.advanceTimersByTime(1);
    expect(fired).toBe(1);

    // No double fire after it has fired.
    vi.advanceTimersByTime(10_000);
    expect(fired).toBe(1);
    expect(idle.fired).toBe(true);
  });

  test("touch() resets the countdown", () => {
    let fired = 0;
    const idle = new IdleBackstop(1000, () => {
      fired++;
    });
    idle.start();

    vi.advanceTimersByTime(900);
    idle.touch();
    vi.advanceTimersByTime(900);
    expect(fired).toBe(0); // reset kept it alive

    vi.advanceTimersByTime(100);
    expect(fired).toBe(1);
  });

  test("stop() cancels the backstop", () => {
    let fired = 0;
    const idle = new IdleBackstop(1000, () => {
      fired++;
    });
    idle.start();
    idle.stop();
    vi.advanceTimersByTime(10_000);
    expect(fired).toBe(0);
  });
});
