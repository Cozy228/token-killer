import { gunzipSync } from "node:zlib";
import { describe, it, expect, vi, beforeEach } from "vitest";

// Stub the DB layer so the route tests never touch Postgres.
vi.mock("../src/db.js", () => ({
  ensureSchema: vi.fn().mockResolvedValue(undefined),
  insertEvent: vi.fn().mockResolvedValue(undefined),
  exportTelemetryCsv: vi
    .fn()
    .mockResolvedValue(
      'id,received_at,device_hash,payload\n1,2026-07-09T00:00:00.000Z,a1b2c3,"{""schema"":""1""}"\n',
    ),
}));

import app from "../src/index.js";
import { exportTelemetryCsv, insertEvent } from "../src/db.js";

const valid = {
  schema: "1",
  device_hash: "a1b2c3",
  version: "0.1.0",
  os: "darwin",
  arch: "arm64",
  commands_24h: 1,
  commands_total: 2,
  tokens_saved_24h: 10,
  tokens_saved_total: 20,
  savings_pct: 22.5,
  top_handlers: ["git-status"],
  quality_status_counts: { passed: 2 },
  fallback_count: 0,
  parse_failure_24h: 0,
  low_savings_handlers: [],
  first_seen_days: 5,
  active_days_30d: 3,
  source_adapter_mix: { shell: 2 },
  estimated_savings_usd_30d: 0.001,
  runId: "run-1",
};

function post(body: unknown) {
  return app.request("/v1/telemetry", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("POST /v1/telemetry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.TK_EXPORT_TOKEN;
  });

  it("accepts a valid v1 payload", async () => {
    const res = await post(valid);
    expect(res.status).toBe(202);
    expect(insertEvent).toHaveBeenCalledOnce();
  });

  it("strips unknown keys but still accepts", async () => {
    const res = await post({ ...valid, secret_path: "/home/me/.ssh/id_rsa" });
    expect(res.status).toBe(202);
    const stored = (insertEvent as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(stored).not.toHaveProperty("secret_path");
  });

  it("rejects a payload missing required fields", async () => {
    const res = await post({ schema: "1", device_hash: "x" });
    expect(res.status).toBe(400);
    expect(insertEvent).not.toHaveBeenCalled();
  });

  it("rejects the wrong schema version", async () => {
    const res = await post({ ...valid, schema: "2" });
    expect(res.status).toBe(400);
  });

  it("rejects non-JSON bodies", async () => {
    const res = await post("not json");
    expect(res.status).toBe(400);
  });
});

describe("GET /health", () => {
  it("returns ok", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});

describe("GET /v1/export", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.TK_EXPORT_TOKEN;
  });

  it("requires the export token to be configured", async () => {
    const res = await app.request("/v1/export");
    expect(res.status).toBe(503);
    expect(exportTelemetryCsv).not.toHaveBeenCalled();
  });

  it("rejects missing or wrong bearer tokens", async () => {
    process.env.TK_EXPORT_TOKEN = "secret";

    const missing = await app.request("/v1/export");
    expect(missing.status).toBe(401);

    const wrong = await app.request("/v1/export", {
      headers: { authorization: "Bearer nope" },
    });
    expect(wrong.status).toBe(401);
    expect(exportTelemetryCsv).not.toHaveBeenCalled();
  });

  it("returns a CSV export for the configured bearer token", async () => {
    process.env.TK_EXPORT_TOKEN = "secret";

    const res = await app.request("/v1/export", {
      headers: { authorization: "Bearer secret" },
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/csv");
    expect(res.headers.get("content-disposition")).toContain("telemetry-events.csv");
    expect(await res.text()).toContain("id,received_at,device_hash,payload");
    expect(exportTelemetryCsv).toHaveBeenCalledOnce();
  });
});

describe("GET /v1/export?gzip=1", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.TK_EXPORT_TOKEN;
  });

  it("returns a gzip CSV export for the configured bearer token", async () => {
    process.env.TK_EXPORT_TOKEN = "secret";

    const res = await app.request("/v1/export?gzip=1", {
      headers: { authorization: "Bearer secret" },
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/gzip");
    expect(res.headers.get("content-encoding")).toBe("gzip");
    expect(res.headers.get("content-disposition")).toContain("telemetry-events.csv.gz");
    const body = Buffer.from(await res.arrayBuffer());
    expect(gunzipSync(body).toString("utf8")).toContain("id,received_at,device_hash,payload");
    expect(exportTelemetryCsv).toHaveBeenCalledOnce();
  });
});
