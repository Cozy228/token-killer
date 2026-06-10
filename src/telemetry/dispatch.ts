// Slice 4 — cold-path telemetry trigger (ADR 0004 §5). Called ONLY at the end of
// `tk inspect` and `tk gain` — NEVER from `tk <cmd>` (the hot path is sacred). Any
// error here is swallowed: telemetry must never change a command's behavior or exit
// code. `now`/`runId`/`send`/`endpoint` are injectable so tests stay deterministic.

import { readConfig } from "../core/config.js";
import type { HistoryRecord } from "../core/history.js";
import { writeTelemetryExport } from "../inspect/persist.js";
import { VERSION } from "../version.js";
import { buildTelemetry, buildTelemetryFromRollup, type InspectAggregates } from "./build.js";
import type { MergedRollup } from "../core/rollup.js";
import { TELEMETRY_ENDPOINT } from "./endpoint.js";
import { sendTelemetry } from "./send.js";
import { deviceHash, loadOrCreateState, setLastSentAt } from "./state.js";

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

function writeLocalAndWarn(body: string): void {
  try {
    const path = writeTelemetryExport(body);
    process.stderr.write(`tk: telemetry send unavailable; kept local export: ${path}\n`);
  } catch {
    // best-effort
  }
}
