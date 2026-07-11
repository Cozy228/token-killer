/**
 * Embedded fallback shell for the guide server — served when the built
 * `packages/guide` Vite app is not present (CLI tests, headless smoke, a
 * from-source run before the app is built). Self-contained: ZERO external URLs
 * (no CDN, no fonts, no telemetry — G-egress), inline CSS/JS only. It reads the
 * token from the entry URL (already set as a cookie by the server), fetches the
 * live projections, and renders a minimal but real read-only view. The full
 * designed surfaces live in packages/guide; this proves the server end-to-end.
 */
export const EMBEDDED_SHELL = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>ctx guide</title>
<style>
  :root { color-scheme: dark; }
  body { margin: 0; background: #16181d; color: #e6e8ec;
    font: 14px/1.5 ui-sans-serif, system-ui, sans-serif; }
  .bar { padding: 6px 12px; background: #1b1e24; color: #9aa0aa; font-size: 12px;
    border-bottom: 1px solid #2a2e37; }
  main { padding: 16px; max-width: 900px; }
  h1 { font-size: 19px; font-weight: 600; letter-spacing: -0.01em; }
  code, .mono { font-family: ui-monospace, "SF Mono", Menlo, monospace; }
  .src { display: flex; gap: 12px; flex-wrap: wrap; margin: 12px 0; }
  .chip { padding: 6px 10px; border: 1px solid #2a2e37; border-radius: 8px; background: #1b1e24; }
  .num { font-family: ui-monospace, monospace; font-variant-numeric: tabular-nums; }
  a { color: #7aa2f7; }
</style>
</head>
<body>
<div class="bar" id="dr01">accelerator, not validated</div>
<main>
  <h1>ctx guide</h1>
  <p id="status">Loading projections…</p>
  <div class="src" id="sources"></div>
  <p class="mono" id="badges"></p>
  <p><a href="/impact-set">Impact-Set (gated)</a></p>
</main>
<script>
  const params = new URLSearchParams(location.search);
  const token = params.get("token") || "";
  const auth = { headers: token ? { authorization: "Bearer " + token } : {} };
  async function j(path) {
    const r = await fetch(path, auth);
    if (!r.ok) throw new Error(path + " -> " + r.status);
    return r.json();
  }
  (async () => {
    try {
      const canvas = await j("/api/canvas");
      document.getElementById("dr01").textContent = canvas.meta.disclosure;
      document.getElementById("status").textContent = "Live read-only view of this repo's graph.";
      const s = document.getElementById("sources");
      for (const src of canvas.sources) {
        const d = document.createElement("div");
        d.className = "chip";
        d.innerHTML = src.source + " <span class='num'>" + src.entityCount + "</span>";
        s.appendChild(d);
      }
      document.getElementById("badges").textContent =
        "needs-review " + canvas.badges.needsReview +
        " · open conflicts " + canvas.badges.openConflicts;
    } catch (e) {
      document.getElementById("status").textContent = "Error: " + e.message;
    }
  })();
  // Browser-disconnect teardown (brief §2): tell the server on unload.
  addEventListener("pagehide", () => { try { navigator.sendBeacon("/api/close"); } catch (_) {} });
</script>
</body>
</html>
`;
