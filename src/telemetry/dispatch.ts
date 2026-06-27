// Slice 4 — cold-path telemetry trigger (ADR 0004 §5). Called ONLY at the end of
// `tk inspect` and `tk gain` — NEVER from `tk <cmd>` (the hot path is sacred). Any
// error here is swallowed: telemetry must never change a command's behavior or exit
// code. `now`/`runId`/`send`/`endpoint` are injectable so tests stay deterministic.

import { randomUUID } from "node:crypto";

import { readConfig } from "../core/config.js";
import type { HistoryRecord } from "../core/history.js";
import { writeTelemetryExport } from "../inspect/persist.js";
import { VERSION } from "../version.js";
import { buildTelemetry, buildTelemetryFromRollup, type InspectAggregates } from "./build.js";
import { loadCachedProjectRollups, mergeRollups, type MergedRollup } from "../core/rollup.js";
import { TELEMETRY_ENDPOINT } from "./endpoint.js";
import { sendTelemetry } from "./send.js";
import { deviceHash, loadOrCreateState, peekLastSentAt, setLastSentAt } from "./state.js";

const WINDOW_MS = 23 * 60 * 60 * 1000; // ≤1 attempt per 23h

export type SendFn = (endpoint: string, body: string) => Promise<boolean>;

export type DispatchParams = {
  records?: HistoryRecord[]; // legacy full scan
  rollup?: MergedRollup; // preferred user-level cache
  now: Date;
  runId: string;
  inspect?: InspectAggregates;
  endpoint?: string;
  send?: SendFn;
};

export function runColdPathTelemetry(params: DispatchParams): void {
  try {
    let config;
    try {
      config = readConfig();
    } catch {
      return; // a broken config never triggers a send (and never throws here)
    }
    if (!config.telemetry) return; // network upload not opted in

    const endpoint = params.endpoint ?? TELEMETRY_ENDPOINT;
    const state = loadOrCreateState(params.now);
    const payload = params.rollup
      ? buildTelemetryFromRollup({
          rollup: params.rollup,
          version: VERSION,
          deviceHash: deviceHash(state),
          firstSeenAt: state.firstSeenAt,
          now: params.now,
          runId: params.runId,
          inspect: params.inspect,
        })
      : buildTelemetry({
          records: params.records ?? [],
          version: VERSION,
          deviceHash: deviceHash(state),
          firstSeenAt: state.firstSeenAt,
          now: params.now,
          runId: params.runId,
          inspect: params.inspect,
        });
    const body = `${JSON.stringify(payload)}\n`;

    if (!endpoint) {
      // Empty-endpoint build: local file + warning, send nothing (unchanged).
      writeLocalAndWarn(body);
      return;
    }

    // Strictly ≤1 attempt per 23h window. Stamp lastSentAt BEFORE dispatching so a
    // down endpoint is never hammered — true no-retry, even on failure.
    if (
      state.lastSentAt &&
      params.now.getTime() - new Date(state.lastSentAt).getTime() < WINDOW_MS
    ) {
      return;
    }
    setLastSentAt(params.now);

    const send = params.send ?? sendTelemetry;
    void send(endpoint, body)
      .then((ok) => {
        if (!ok) writeLocalAndWarn(body);
      })
      .catch(() => writeLocalAndWarn(body));
  } catch {
    // The cold-path trigger must never throw.
  }
}

// Opportunistic HOT-PATH flush (ADR 0004 Decision 6 amendment). Fires at the tail of a
// normal `tk <cmd>` compress run — AFTER the compressed result is already on stdout, and
// NEVER on --raw / passthrough / hook paths. It exists so installs that rarely run the cold
// path (`tk inspect` / `tk gain`) still report at most once per 23h. It stays USER-LEVEL by
// merging the already-built per-project CACHED rollups via `loadCachedProjectRollups` — a
// READ-ONLY load that (unlike the cold path's `listProjectRollups`) never opens history.jsonl or
// rebuilds a rollup, so the hot path stays cheap and a project with history but no built rollup
// yet contributes nothing until a cold path seeds it. Shares the SAME 23h `lastSentAt` throttle, so the combined
// hot+cold cadence stays ≤ once/23h. Best-effort and non-blocking: every error is swallowed,
// the send socket is unref'd, and an empty cache simply sends nothing.
export async function runHotPathTelemetryFlush(
  now: Date = new Date(),
  deps: { endpoint?: string; send?: SendFn } = {},
): Promise<void> {
  try {
    const endpoint = deps.endpoint ?? TELEMETRY_ENDPOINT;
    // Generic/dev build bakes "" ⇒ inert; bail before ANY I/O (≈zero hot-path cost). The
    // caller also gates the dynamic import on this, so the module never even loads there.
    if (!endpoint) return;

    let config;
    try {
      config = readConfig();
    } catch {
      return; // a broken config never triggers a send
    }
    if (!config.telemetry) return; // network upload not opted in

    // 23h throttle (shared with the cold path), checked NON-destructively: the dominant
    // steady-state exit is this single small read. peekLastSentAt never creates state.
    const lastSentAt = peekLastSentAt();
    if (lastSentAt && now.getTime() - new Date(lastSentAt).getTime() < WINDOW_MS) return;

    // Merge the CACHED per-project rollups (user-level, like the cold path) — NEVER read raw
    // history or rebuild a rollup here — and do it BEFORE touching state: an opted-in install
    // whose projects have never run the cold path has no cached rollups yet, so we return here
    // without ever minting telemetry state (keeps the hot path side-effect-free and preserves
    // "tk <cmd> doesn't touch telemetry state"). The next cold-path run seeds the cache.
    const rollups = await loadCachedProjectRollups();
    if (rollups.length === 0) return;
    const rollup = mergeRollups(rollups);

    // A send is actually happening now: materialize state (mints the salt once) and stamp
    // BEFORE dispatch so a down endpoint is never retried within the window.
    const state = loadOrCreateState(now);
    setLastSentAt(now);
    const payload = buildTelemetryFromRollup({
      rollup,
      version: VERSION,
      deviceHash: deviceHash(state),
      firstSeenAt: state.firstSeenAt,
      now,
      runId: randomUUID(),
    });
    const send = deps.send ?? sendTelemetry;
    // Fire-and-forget; the socket is unref'd in send.ts so it never holds the process open.
    void send(endpoint, `${JSON.stringify(payload)}\n`).catch(() => {});
  } catch {
    // The hot-path flush must never throw or change the command's behavior / exit code.
  }
}

function writeLocalAndWarn(body: string): void {
  try {
    const path = writeTelemetryExport(body);
    process.stderr.write(`tk: telemetry send unavailable; kept local export: ${path}\n`);
  } catch {
    // best-effort
  }
}
