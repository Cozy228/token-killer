import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";

import { runColdPathTelemetry } from "../../../src/telemetry/dispatch.js";
import { writeConfigTemplate } from "../../../src/core/config.js";
import { loadOrCreateState, stateFile } from "../../../src/telemetry/state.js";
import type { HistoryRecord } from "../../../src/core/history.js";

const previousHome = process.env.TOKEN_GUARD_HOME;
const ENDPOINT = "https://telemetry.example.test/v1";

afterEach(() => {
  vi.restoreAllMocks();
  if (previousHome === undefined) delete process.env.TOKEN_GUARD_HOME;
  else process.env.TOKEN_GUARD_HOME = previousHome;
});

async function withHome<T>(fn: (home: string) => Promise<T> | T): Promise<T> {
  const home = await mkdtemp(path.join(tmpdir(), "tg-disp-"));
  process.env.TOKEN_GUARD_HOME = home;
  vi.spyOn(process.stderr, "write").mockReturnValue(true);
  try {
    return await fn(home);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
}

const records: HistoryRecord[] = [
  {
    timestamp: "2026-06-09T12:00:00.000Z",
    command: "git status",
    handler: "git-status",
    raw_chars: 400,
    output_chars: 100,
    raw_tokens: 100,
    output_tokens: 25,
    saved_tokens: 75,
    savings_pct: 75,
    exit_code: 0,
    duration_ms: 10,
    quality_status: "passed",
    source_adapter: "shell",
  },
];

function lastSentAt(): string | null {
  return JSON.parse(readFileSync(stateFile(), "utf8")).lastSentAt;
}

describe("runColdPathTelemetry — consent gate", () => {
  test("no config / telemetry off ⇒ no send, no state stamp", async () => {
    await withHome(() => {
      const send = vi.fn().mockResolvedValue(true);
      runColdPathTelemetry({ records, now: new Date(), runId: "r", endpoint: ENDPOINT, send });
      expect(send).not.toHaveBeenCalled();
      expect(existsSync(stateFile())).toBe(false);
    });
  });
});

describe("runColdPathTelemetry — opted in", () => {
  test("empty endpoint ⇒ local file + warn, never sends, never stamps", async () => {
    await withHome((home) => {
      writeConfigTemplate({ telemetry: true });
      const send = vi.fn().mockResolvedValue(true);
      runColdPathTelemetry({ records, now: new Date(), runId: "r", endpoint: "", send });
      expect(send).not.toHaveBeenCalled();
      expect(existsSync(path.join(home, "advice", "telemetry-export.json"))).toBe(true);
      expect(lastSentAt()).toBeNull();
    });
  });

  test("first run stamps lastSentAt BEFORE dispatch and sends once", async () => {
    await withHome(() => {
      writeConfigTemplate({ telemetry: true });
      const now = new Date("2026-06-10T00:00:00.000Z");
      // a never-resolving send proves the stamp happens before dispatch completes.
      const send = vi.fn(() => new Promise<boolean>(() => {}));
      runColdPathTelemetry({ records, now, runId: "r", endpoint: ENDPOINT, send });
      expect(send).toHaveBeenCalledTimes(1);
      expect(lastSentAt()).toBe(now.toISOString());
    });
  });

  test("within the 23h window ⇒ skips the send, no second attempt", async () => {
    await withHome(() => {
      writeConfigTemplate({ telemetry: true });
      const send = vi.fn().mockResolvedValue(true);
      const first = new Date("2026-06-10T00:00:00.000Z");
      runColdPathTelemetry({ records, now: first, runId: "r1", endpoint: ENDPOINT, send });
      // 10h later — still inside the window
      const soon = new Date("2026-06-10T10:00:00.000Z");
      runColdPathTelemetry({ records, now: soon, runId: "r2", endpoint: ENDPOINT, send });
      expect(send).toHaveBeenCalledTimes(1);
      expect(lastSentAt()).toBe(first.toISOString());
    });
  });

  test("after 23h ⇒ sends again and restamps", async () => {
    await withHome(() => {
      writeConfigTemplate({ telemetry: true });
      const send = vi.fn().mockResolvedValue(true);
      const first = new Date("2026-06-10T00:00:00.000Z");
      runColdPathTelemetry({ records, now: first, runId: "r1", endpoint: ENDPOINT, send });
      const later = new Date("2026-06-11T00:00:01.000Z"); // >23h
      runColdPathTelemetry({ records, now: later, runId: "r2", endpoint: ENDPOINT, send });
      expect(send).toHaveBeenCalledTimes(2);
      expect(lastSentAt()).toBe(later.toISOString());
    });
  });

  test("a send failure neither throws nor leaves the window un-stamped", async () => {
    await withHome((home) => {
      writeConfigTemplate({ telemetry: true });
      const send = vi.fn().mockRejectedValue(new Error("network down"));
      const now = new Date("2026-06-10T00:00:00.000Z");
      // must not throw
      expect(() =>
        runColdPathTelemetry({ records, now, runId: "r", endpoint: ENDPOINT, send }),
      ).not.toThrow();
      // stamped before dispatch ⇒ no retry until the next window
      expect(lastSentAt()).toBe(now.toISOString());
      // the local export is kept on failure (async — flush microtasks)
      return Promise.resolve().then(() => {
        expect(existsSync(path.join(home, "advice", "telemetry-export.json"))).toBe(true);
      });
    });
  });
});
