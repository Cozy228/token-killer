// Postgres access layer. One warm pool per Lambda container (max: 1 — each
// container handles one request at a time, so a single connection is enough).
// `ensureSchema()` runs an idempotent CREATE TABLE IF NOT EXISTS on first use,
// so there is no separate migration step to operate (migrations/001_init.sql is
// the canonical copy of this DDL for reference / Grafana).
import pg from "pg";
import { getDbConfig } from "./config.js";
import type { TelemetryPayload } from "./schema.js";

const { Pool } = pg;

let pool: pg.Pool | null = null;
let schemaReady = false;

const DDL = `
CREATE TABLE IF NOT EXISTS telemetry_events (
  id            bigserial    PRIMARY KEY,
  received_at   timestamptz  NOT NULL DEFAULT now(),
  schema_ver    text         NOT NULL,
  device_hash   text         NOT NULL,
  run_id        text         NOT NULL,
  version       text,
  os            text,
  arch          text,
  commands_24h              integer,
  commands_total            bigint,
  tokens_saved_24h          bigint,
  tokens_saved_total        bigint,
  savings_pct               numeric(8,2),
  fallback_count            integer,
  parse_failure_24h         integer,
  first_seen_days           integer,
  active_days_30d           integer,
  estimated_savings_usd_30d numeric(16,6),
  payload       jsonb        NOT NULL,
  CONSTRAINT telemetry_events_dedup UNIQUE (device_hash, run_id)
);
CREATE INDEX IF NOT EXISTS idx_telemetry_received_at ON telemetry_events (received_at);
CREATE INDEX IF NOT EXISTS idx_telemetry_device      ON telemetry_events (device_hash);
`;

async function getPool(): Promise<pg.Pool> {
  if (pool) return pool;
  const cfg = await getDbConfig();
  pool = new Pool({
    host: cfg.host,
    port: cfg.port,
    database: cfg.database,
    user: cfg.user,
    password: cfg.password,
    // RDS enforces TLS; the cert chain is AWS-managed and terminates in-VPC.
    ssl: { rejectUnauthorized: false },
    max: 1,
    idleTimeoutMillis: 0,
    // Stay well under the client's 2s fire-and-forget beacon budget.
    connectionTimeoutMillis: 1500,
  });
  return pool;
}

export async function ensureSchema(): Promise<void> {
  if (schemaReady) return;
  const p = await getPool();
  await p.query(DDL);
  schemaReady = true;
}

export async function insertEvent(e: TelemetryPayload): Promise<void> {
  const p = await getPool();
  // ON CONFLICT DO NOTHING dedups client double-sends of the same runId.
  await p.query(
    `INSERT INTO telemetry_events (
       schema_ver, device_hash, run_id, version, os, arch,
       commands_24h, commands_total, tokens_saved_24h, tokens_saved_total,
       savings_pct, fallback_count, parse_failure_24h, first_seen_days,
       active_days_30d, estimated_savings_usd_30d, payload
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
     ON CONFLICT (device_hash, run_id) DO NOTHING`,
    [
      e.schema,
      e.device_hash,
      e.runId,
      e.version,
      e.os,
      e.arch,
      e.commands_24h,
      e.commands_total,
      e.tokens_saved_24h,
      e.tokens_saved_total,
      e.savings_pct,
      e.fallback_count,
      e.parse_failure_24h,
      e.first_seen_days,
      e.active_days_30d,
      e.estimated_savings_usd_30d,
      JSON.stringify(e),
    ],
  );
}
