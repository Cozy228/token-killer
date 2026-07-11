import { defineConfig } from "vitest/config";

// Guide component tests — happy-dom, isolated from core/cli vitest configs.
export default defineConfig({
  test: {
    include: ["tests/**/*.test.{ts,tsx}"],
    environment: "happy-dom",
    restoreMocks: true,
    clearMocks: true,
    testTimeout: 20000,
  },
});
