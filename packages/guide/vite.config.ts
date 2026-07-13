import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";
import { defineConfig } from "vite";

// The guide SPA. ZERO EGRESS is a build-time property here, not a runtime hope:
// every asset (JS, CSS, fonts) is bundled into `dist/` and served by the loopback
// server from disk. No CDN, no remote font, no analytics — so there is nothing for
// the CSP the server sends (`default-src 'self'`) to block.
//
// `base: "./"` keeps every asset reference relative, so the same build serves from
// the loopback server AND from a single inlined-snapshot file later (D17: ONE render
// path — the export must not become a second build).
export default defineConfig({
  base: "./",
  plugins: [react(), tailwind()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    // A local tool: keep the map so a maintainer can read a stack trace.
    sourcemap: true,
  },
});
