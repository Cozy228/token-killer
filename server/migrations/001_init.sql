-- Canonical DDL for the telemetry store. The ingest Lambda runs this same
-- statement (idempotently) on cold start, so you normally don't have to apply
-- this by hand — it's kept here as the source of truth for Grafana / DBAs.
--
-- One flat table: scalar KPIs are promoted to columns for cheap Grafana
-- queries; the full payload (including nested `inspect`/count maps) is retained
-- in `payload jsonb` so schema evolution rarely needs a migration.

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
  -- dedup client double-sends of the same per-POST runId
  CONSTRAINT telemetry_events_dedup UNIQUE (device_hash, run_id)
);

CREATE INDEX IF NOT EXISTS idx_telemetry_received_at ON telemetry_events (received_at);
CREATE INDEX IF NOT EXISTS idx_telemetry_device      ON telemetry_events (device_hash);
