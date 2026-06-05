// Slice 3b — telemetry machine state (ADR 0004 §1). `~/.token-guard/
// telemetry-state.json` is INTERNAL, never hand-edited. It holds a once-generated
// device salt; `device_hash = sha256(deviceSalt)` is the per-install anonymous id.
// `tg telemetry purge` deletes this file (resetting the device_hash).

import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { tokenGuardHome } from "../core/dataDir.js";

export type TelemetryState = {
  deviceSalt: string; // 64 hex, generated once
  firstSeenAt: string; // ISO
  lastSentAt: string | null; // ISO | null
};

export function stateFile(): string {
  return join(tokenGuardHome(), "telemetry-state.json");
}

function generateSalt(): string {
  return randomBytes(32).toString("hex"); // 64 hex chars
}

function writeState(state: TelemetryState): void {
  const file = stateFile();
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(state, null, 2)}\n`);
}

// Load existing state, or lazily create it (salt generated once). `now` is injected
// so tests are deterministic; it is only consulted when creating firstSeenAt.
export function loadOrCreateState(now: Date = new Date()): TelemetryState {
  const file = stateFile();
  if (existsSync(file)) {
    try {
      const parsed = JSON.parse(readFileSync(file, "utf8")) as Partial<TelemetryState>;
      if (typeof parsed.deviceSalt === "string" && parsed.deviceSalt.length > 0) {
        return {
          deviceSalt: parsed.deviceSalt,
          firstSeenAt:
            typeof parsed.firstSeenAt === "string" ? parsed.firstSeenAt : now.toISOString(),
          lastSentAt: typeof parsed.lastSentAt === "string" ? parsed.lastSentAt : null,
        };
      }
    } catch {
      // corrupt — fall through and regenerate
    }
  }
  const state: TelemetryState = {
    deviceSalt: generateSalt(),
    firstSeenAt: now.toISOString(),
    lastSentAt: null,
  };
  writeState(state);
  return state;
}

export function deviceHash(state: TelemetryState): string {
  return createHash("sha256").update(state.deviceSalt).digest("hex");
}

// Stamp lastSentAt = now. Called BEFORE dispatching a send (Slice 4) so a down
// endpoint is never hammered — at most one attempt per window, even on failure.
export function setLastSentAt(now: Date): void {
  const state = loadOrCreateState(now);
  writeState({ ...state, lastSentAt: now.toISOString() });
}

// Delete the state file. Returns true if a file was removed.
export function purgeState(): boolean {
  const file = stateFile();
  if (!existsSync(file)) return false;
  rmSync(file);
  return true;
}
