import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Zero-egress build (G-egress): relative base so assets load same-origin under the
// token-gated loopback server; fonts/icons are bundled from node_modules, never a CDN.
export default defineConfig({
  base: "./",
  plugins: [react()],
  build: {
    outDir: "dist",
    // Inline nothing surprising; keep deterministic asset URLs the CSP allows.
    assetsInlineLimit: 4096,
    chunkSizeWarningLimit: 2000,
  },
});
