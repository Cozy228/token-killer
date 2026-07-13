import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    environment: "happy-dom",
    // A desktop viewport: the shell's <1100px branch puts the rail and the inspector into
    // drawers, and happy-dom's 1024px default would silently test the narrow layout.
    environmentOptions: { happyDOM: { settings: { navigator: { userAgent: "ctx-guide-test" } } } },
    setupFiles: ["tests/setup.ts"],
    restoreMocks: true,
    clearMocks: true,
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
