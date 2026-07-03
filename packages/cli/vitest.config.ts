import { defineConfig } from "vitest/config";

// ctx CLI test config — isolated from the legacy tk root vitest config.
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    restoreMocks: true,
    clearMocks: true,
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
