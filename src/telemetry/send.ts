// Slice 4 — telemetry transport (ADR 0004 §5). HTTPS POST via the built-in `https`
// module (NO new dependency). Fire-and-forget: a 2s timeout, `socket.unref()` so it
// never holds the process open, any 2xx = success, no retry. The promise NEVER
// rejects — it resolves false on any error/timeout/non-2xx so the caller's
// fail-open logic is trivial.

import { request } from "node:https";

export function sendTelemetry(
  endpoint: string,
  body: string,
  opts: { timeoutMs?: number } = {},
): Promise<boolean> {
  return new Promise((resolve) => {
    let url: URL;
    try {
      url = new URL(endpoint);
    } catch {
      resolve(false);
      return;
    }

    const req = request(
      url,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
        timeout: opts.timeoutMs ?? 2000,
      },
      (res) => {
        const code = res.statusCode ?? 0;
        res.resume(); // drain so the socket can close
        resolve(code >= 200 && code < 300);
      },
    );

    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
    // Never keep the event loop alive for a best-effort beacon.
    req.on("socket", (socket) => socket.unref());
    req.end(body);
  });
}
