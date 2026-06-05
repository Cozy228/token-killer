// Slice 3b — `tk telemetry <enable|disable|status|preview|purge>` (ADR 0004 §5).
// NONE of these subcommands ever send over the network — `preview` prints the exact
// payload that a send WOULD POST, and that is all. enable/disable rewrite
// config.jsonc from the canonical closed-set template (read current values → set
// `telemetry` → write the full template back); comment-preserving edits are
// deliberately not attempted.

import { randomUUID } from "node:crypto";

import { ConfigError, readConfig, writeConfigTemplate } from "../core/config.js";
import { listProjectHistories } from "../core/history.js";
import { VERSION } from "../version.js";
import { buildTelemetry } from "./build.js";
import { deviceHash, loadOrCreateState, purgeState } from "./state.js";

export async function runTelemetry(argv: string[], now: Date = new Date()): Promise<number> {
  const sub = argv[0];

  if (sub === "enable" || sub === "disable") {
    let exportConsent = false;
    try {
      exportConsent = readConfig().telemetryExport; // preserve the other consent
    } catch (error) {
      return configError(error);
    }
    const path = writeConfigTemplate({ telemetry: sub === "enable", telemetryExport: exportConsent });
    process.stdout.write(
      `Telemetry ${sub === "enable" ? "enabled" : "disabled"} (network upload). Wrote ${path}\n`,
    );
    return 0;
  }

  if (sub === "status") {
    let config;
    try {
      config = readConfig();
    } catch (error) {
      return configError(error);
    }
    const state = loadOrCreateState(now);
    process.stdout.write(
      [
        `telemetry (network upload): ${config.telemetry ? "enabled" : "disabled"}`,
        `telemetryExport (local file): ${config.telemetryExport ? "enabled" : "disabled"}`,
        `device_hash: ${deviceHash(state)}`,
        `first_seen: ${state.firstSeenAt}`,
        `last_sent: ${state.lastSentAt ?? "never"}`,
        "",
      ].join("\n"),
    );
    return 0;
  }

  if (sub === "preview") {
    const state = loadOrCreateState(now);
    const payload = buildTelemetry({
      records: await listProjectHistories(),
      version: VERSION,
      deviceHash: deviceHash(state),
      firstSeenAt: state.firstSeenAt,
      now,
      runId: randomUUID(),
    });
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    return 0;
  }

  if (sub === "purge") {
    const removed = purgeState();
    process.stdout.write(
      removed
        ? "Telemetry state purged (device_hash reset on next use).\n"
        : "No telemetry state to purge.\n",
    );
    return 0;
  }

  process.stderr.write("tk telemetry: usage: tk telemetry <enable|disable|status|preview|purge>\n");
  return 1;
}

function configError(error: unknown): number {
  const message = error instanceof ConfigError ? error.message : String(error);
  process.stderr.write(`tk telemetry: ${message}\n`);
  return 1;
}
