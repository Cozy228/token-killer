// Hono app + AWS Lambda handler. Fronted by a PRIVATE API Gateway REST API
// (REST API uses payload format 1.0; hono/aws-lambda's `handle` auto-detects it).
// The whole API is reachable only from inside the corp VPC via an execute-api
// VPC endpoint, so there is no public surface and no WAF/auth layer here.
import { Hono } from "hono";
import { handle } from "hono/aws-lambda";
import { TelemetryPayloadSchema } from "./schema.js";
import { ensureSchema, insertEvent } from "./db.js";

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

export const handler = handle(app);
export default app;
