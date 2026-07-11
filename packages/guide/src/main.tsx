/**
 * Guide entry (P40 R12/R13). Mount the app. NO ?skin token layer (skins are
 * banned, R14), NO pagehide/beacon teardown (R13). R12: strip the one-time
 * bootstrap token from the address bar so it never lingers in history/referer —
 * the HttpOnly session cookie the server just set carries auth from here on.
 * Vendored fonts + all CSS are bundled (G-egress: zero external URLs).
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./design/fonts.css";
import "./design/tokens.css";
import "./design/app.css";
import "@xyflow/react/dist/style.css";
import { App } from "./App.tsx";

// R12: swap-and-strip. The cookie is already set on the shell response; drop the
// token from the URL (keep the client route in the hash) via replaceState.
try {
  const url = new URL(window.location.href);
  if (url.searchParams.has("token")) {
    url.searchParams.delete("token");
    window.history.replaceState({}, "", url.pathname + url.search + url.hash);
  }
} catch {
  /* non-browser env */
}

const el = document.getElementById("root");
if (el) {
  createRoot(el).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
