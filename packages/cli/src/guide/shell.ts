/**
 * Minimal fallback shell for the guide server — served ONLY when the built
 * `packages/guide` Vite app is absent (CLI tests, headless smoke, a from-source
 * run before the app is built). The real product serves the built bundle. This
 * fallback is deliberately not a second frontend: it carries ZERO external URLs
 * (no CDN, fonts, telemetry — G-egress), inline CSS/JS only, uses the session
 * cookie (R12 — no token-from-URL app logic, no pagehide beacon), strips the
 * bootstrap token from the address bar, and renders a minimal read-only view so
 * the server proves out end-to-end.
 */
export const FALLBACK_SHELL = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>ctx guide</title>
<style>
  :root { color-scheme: dark; }
  body { margin: 0; background: #14161b; color: #e6e8ec;
    font: 14px/1.5 ui-sans-serif, system-ui, sans-serif; }
  .bar { padding: 6px 12px; background: #1b1e24; color: #9aa0aa; font-size: 12px;
    border-bottom: 1px solid #2a2e37; }
  main { padding: 16px; max-width: 900px; }
  h1 { font-size: 19px; font-weight: 600; letter-spacing: -0.01em; }
  .note { color: #9aa0aa; font-size: 13px; }
  .src { display: flex; gap: 12px; flex-wrap: wrap; margin: 12px 0; }
  .chip { padding: 6px 10px; border: 1px solid #2a2e37; border-radius: 8px; background: #1b1e24; }
  .num { font-family: ui-monospace, monospace; font-variant-numeric: tabular-nums; }
</style>
</head>
<body>
<div class="bar" id="dr01">accelerator, not validated</div>
<main>
  <h1>ctx guide</h1>
  <p class="note">The full guide app is not built. Run <code>pnpm --filter @contexa/guide build</code>
  and reload. This minimal fallback confirms the server is live and read-only.</p>
  <p id="status">Loading projections…</p>
  <div class="src" id="sources"></div>
  <p class="num" id="badges"></p>
</main>
<script>
  // R12: strip the one-time bootstrap token from the address bar; the cookie the
  // server just set carries auth from here on. No token-from-URL app logic.
  try {
    if (new URLSearchParams(location.search).has("token")) {
      history.replaceState({}, "", location.pathname + location.hash);
    }
  } catch (_) {}
  async function j(path) {
    const r = await fetch(path, { credentials: "same-origin" });
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
        d.textContent = src.source + " ";
        const n = document.createElement("span");
        n.className = "num"; n.textContent = String(src.entityCount);
        d.appendChild(n); s.appendChild(d);
      }
      document.getElementById("badges").textContent =
        "needs-review " + canvas.badges.needsReview +
        " \\u00b7 open conflicts " + canvas.badges.openConflicts;
    } catch (e) {
      document.getElementById("status").textContent = "Error: " + e.message;
    }
  })();
</script>
</body>
</html>
`;
