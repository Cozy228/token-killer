// Within-generation session persistence (D10). PURE over an injectable storage.
//
// "Within one generation, persist viewport, selection, and pinned regions."
// State is keyed by projectionId + generation identity: a matching key restores;
// a DIFFERENT generation identity never restores stale positions (a new
// generation returns to the recent hotspot, D10). localStorage is the default
// store; tests inject a Map-backed stub. All failures are swallowed — persistence
// is a convenience, never a correctness dependency.

import type { Viewport } from "./types.js";

export interface SessionState {
  viewport: Viewport;
  zoom: number;
  focusedId: string | null;
  pinnedIds: string[];
}

/** Minimal storage surface — a subset of the DOM Storage interface. */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const PREFIX = "ctx-guide:session:";

/** Storage key for a (projectionId, generation identity) pair. */
export function sessionKey(projectionId: string, generationIdentity: string): string {
  return `${PREFIX}${projectionId}:${generationIdentity}`;
}

function safeStore(store?: KeyValueStore): KeyValueStore | null {
  if (store) return store;
  try {
    if (typeof localStorage !== "undefined") return localStorage;
  } catch {
    // localStorage can throw in sandboxed / privacy modes — treat as absent.
  }
  return null;
}

export function saveSession(
  projectionId: string,
  generationIdentity: string,
  state: SessionState,
  store?: KeyValueStore,
): void {
  const s = safeStore(store);
  if (!s) return;
  try {
    s.setItem(sessionKey(projectionId, generationIdentity), JSON.stringify(state));
  } catch {
    // Quota / serialization failures are non-fatal.
  }
}

/** Restore state for an EXACT (projectionId, generation identity) key, else null. */
export function loadSession(
  projectionId: string,
  generationIdentity: string,
  store?: KeyValueStore,
): SessionState | null {
  const s = safeStore(store);
  if (!s) return null;
  try {
    const raw = s.getItem(sessionKey(projectionId, generationIdentity));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SessionState;
    if (
      !parsed ||
      typeof parsed !== "object" ||
      !parsed.viewport ||
      typeof parsed.zoom !== "number" ||
      !Array.isArray(parsed.pinnedIds)
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearSession(
  projectionId: string,
  generationIdentity: string,
  store?: KeyValueStore,
): void {
  const s = safeStore(store);
  if (!s) return;
  try {
    s.removeItem(sessionKey(projectionId, generationIdentity));
  } catch {
    // ignore
  }
}
