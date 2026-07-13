import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Base "./" so the production bundle can be opened from a static snapshot path
// (D17 one-render-path parity: export must be relative-URL safe).
export default defineConfig({
  base: "./",
  plugins: [react()],
  build: {
    sourcemap: true,
    // Deterministic asset names help the snapshot/export story; not required for the spike.
    chunkSizeWarningLimit: 2000,
  },
});
