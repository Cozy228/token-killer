import { describe, expect, it } from "vitest";
import {
  clearSession,
  loadSession,
  saveSession,
  sessionKey,
  type KeyValueStore,
  type SessionState,
} from "../src/atlas/persist.js";

function mapStore(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => {
      data.set(k, v);
    },
    removeItem: (k) => {
      data.delete(k);
    },
  };
}

const STATE: SessionState = {
  viewport: { x: 10, y: 20, w: 40, h: 30 },
  zoom: 1.4,
  focusedId: "sym:src/app.ts#run",
  pinnedIds: ["dir:src"],
};

describe("within-generation session persistence (D10)", () => {
  it("restores viewport/selection/pins for the SAME generation key", () => {
    const store = mapStore();
    saveSession("proj1", "3.2.1.4", STATE, store);
    const restored = loadSession("proj1", "3.2.1.4", store);
    expect(restored).toEqual(STATE);
  });

  it("does NOT restore across a different generation identity", () => {
    const store = mapStore();
    saveSession("proj1", "3.2.1.4", STATE, store);
    // Same projection, DIFFERENT generation tuple -> no restore (returns to hotspot).
    expect(loadSession("proj1", "4.2.1.4", store)).toBeNull();
    // Different projection id -> also no restore.
    expect(loadSession("proj2", "3.2.1.4", store)).toBeNull();
  });

  it("keys are distinct per (projectionId, generation identity)", () => {
    expect(sessionKey("p", "1.1.1.1")).not.toBe(sessionKey("p", "1.1.1.2"));
    expect(sessionKey("p", "1.1.1.1")).not.toBe(sessionKey("q", "1.1.1.1"));
  });

  it("returns null on missing / malformed entries", () => {
    const store = mapStore();
    expect(loadSession("none", "0.0.0.0", store)).toBeNull();
    store.setItem(sessionKey("bad", "0.0.0.0"), "{not json");
    expect(loadSession("bad", "0.0.0.0", store)).toBeNull();
    store.setItem(sessionKey("partial", "0.0.0.0"), JSON.stringify({ zoom: 1 }));
    expect(loadSession("partial", "0.0.0.0", store)).toBeNull();
  });

  it("clears a stored session", () => {
    const store = mapStore();
    saveSession("proj1", "3.2.1.4", STATE, store);
    clearSession("proj1", "3.2.1.4", store);
    expect(loadSession("proj1", "3.2.1.4", store)).toBeNull();
  });
});
