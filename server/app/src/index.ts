// Hono app + AWS Lambda handler. Fronted by a PRIVATE API Gateway REST API
// (REST API uses payload format 1.0; hono/aws-lambda's `handle` auto-detects it).
// The API is reachable only from inside the corp VPC via an execute-api VPC
// endpoint. Ingest relies on that network boundary; exports add bearer auth.
import { gzipSync } from "node:zlib";
import { Hono } from "hono";
import { handle } from "hono/aws-lambda";
import { TelemetryPayloadSchema } from "./schema.js";
import { ensureSchema, exportTelemetryCsv, insertEvent } from "./db.js";

const app = new Hono();

// Liveness probe (handy for a Route53/Grafana health check).
app.get("/health", (c) => c.json({ ok: true }));

app.post("/v1/telemetry", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ ok: false, error: "invalid_json" }, 400);
  }

  const parsed = TelemetryPayloadSchema.safeParse(body);
  if (!parsed.success) {
    // Malformed beacon — drop it. The client stamps lastSentAt BEFORE dispatch,
    // so a 4xx does not trigger a tight retry loop; the next window self-heals
    // anyway because the totals it carries are cumulative.
    return c.json({ ok: false, error: "invalid_payload" }, 400);
  }

  try {
    await ensureSchema();
    await insertEvent(parsed.data);
  } catch (err) {
    console.error("insert_failed", err);
    return c.json({ ok: false }, 500);
  }

  return c.json({ ok: true }, 202);
});

app.get("/v1/export", async (c) => {
  const authError = exportAuthError(c.req.header("authorization"));
  if (authError) return c.json(authError.body, authError.status);

  try {
    await ensureSchema();
    const csv = await exportTelemetryCsv();
    if (c.req.query("gzip") === "1") {
      const gz = gzipSync(csv);
      return c.body(new Uint8Array(gz), 200, {
        "content-type": "application/gzip",
        "content-encoding": "gzip",
        "content-disposition": 'attachment; filename="telemetry-events.csv.gz"',
      });
    }

    return c.body(csv, 200, {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="telemetry-events.csv"',
    });
  } catch (err) {
    console.error("export_failed", err);
    return c.json({ ok: false }, 500);
  }
});

function exportAuthError(
  authorization: string | undefined,
): { body: { ok: false; error: string }; status: 401 | 503 } | null {
  const token = process.env.TK_EXPORT_TOKEN;
  if (!token) {
    return { body: { ok: false, error: "export_not_configured" }, status: 503 };
  }

  if ((authorization ?? "") !== `Bearer ${token}`) {
    return { body: { ok: false, error: "unauthorized" }, status: 401 };
  }

  return null;
}

export const handler = handle(app);
export default app;
