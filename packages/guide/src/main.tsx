/**
 * Guide entry — mount the app, apply the ?skin token layer, and wire the
 * browser-disconnect teardown beacon (brief §2: the guide is not a standing
 * destination). Vendored fonts + all CSS are bundled (G-egress: zero external URLs).
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./design/fonts.css";
import "./design/tokens.css";
import "./design/app.css";
import { App } from "./App.tsx";
import { applySkin, currentSkin } from "./skins.ts";

applySkin(currentSkin());

// Tell the loopback server when the tab goes away, so it tears down (not idle-only).
addEventListener("pagehide", () => {
  try {
    navigator.sendBeacon("api/close");
  } catch {
    /* best-effort */
  }
});

const el = document.getElementById("root");
if (el) {
  createRoot(el).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
