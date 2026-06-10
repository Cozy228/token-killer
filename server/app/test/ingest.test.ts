import { describe, it, expect, vi, beforeEach } from "vitest";

// Stub the DB layer so the route tests never touch Postgres.
vi.mock("../src/db.js", () => ({
  ensureSchema: vi.fn().mockResolvedValue(undefined),
  insertEvent: vi.fn().mockResolvedValue(undefined),
}));

import app from "../src/index.js";
import { insertEvent } from "../src/db.js";

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
  beforeEach(() => vi.clearAllMocks());

  it("accepts a valid v2 payload", async () => {
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
    const res = await post({ ...valid, schema: "1" });
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
