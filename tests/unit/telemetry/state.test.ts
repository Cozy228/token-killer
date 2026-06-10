import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";

import {
  deviceHash,
  loadOrCreateState,
  purgeState,
  setLastSentAt,
  stateFile,
} from "../../../src/telemetry/state.js";

const previousHome = process.env.TOKEN_KILLER_HOME;

afterEach(() => {
  if (previousHome === undefined) delete process.env.TOKEN_KILLER_HOME;
  else process.env.TOKEN_KILLER_HOME = previousHome;
});

async function withHome<T>(fn: () => Promise<T> | T): Promise<T> {
  const home = await mkdtemp(path.join(tmpdir(), "tk-state-"));
  process.env.TOKEN_KILLER_HOME = home;
  try {
    return await fn();
  } finally {
    await rm(home, { recursive: true, force: true });
  }
}

describe("telemetry state", () => {
  test("lazily creates a 64-hex salt + stable device_hash", async () => {
    await withHome(() => {
      const now = new Date("2026-06-01T00:00:00.000Z");
      const state = loadOrCreateState(now);
      expect(state.deviceSalt).toMatch(/^[a-f0-9]{64}$/);
      expect(state.firstSeenAt).toBe(now.toISOString());
      expect(state.lastSentAt).toBeNull();
      expect(deviceHash(state)).toMatch(/^[a-f0-9]{64}$/);

      // re-load keeps the same salt → same hash
      const again = loadOrCreateState(new Date("2027-01-01T00:00:00.000Z"));
      expect(again.deviceSalt).toBe(state.deviceSalt);
      expect(again.firstSeenAt).toBe(state.firstSeenAt);
    });
  });

  test("setLastSentAt stamps the time", async () => {
    await withHome(() => {
      loadOrCreateState(new Date("2026-06-01T00:00:00.000Z"));
      const sentAt = new Date("2026-06-05T10:00:00.000Z");
      setLastSentAt(sentAt);
      expect(loadOrCreateState().lastSentAt).toBe(sentAt.toISOString());
    });
  });

  test("purge deletes the state file (resetting device_hash)", async () => {
    await withHome(() => {
      const before = deviceHash(loadOrCreateState());
      expect(existsSync(stateFile())).toBe(true);
      expect(purgeState()).toBe(true);
      expect(existsSync(stateFile())).toBe(false);
      // a fresh salt yields a different hash
      const after = deviceHash(loadOrCreateState());
      expect(after).not.toBe(before);
      // purge again is a no-op
      expect(purgeState()).toBe(true); // file exists again from the line above
    });
  });
});
