import { defineConfig } from "vitest/config";

// ctx core test config — isolated from the legacy tk root vitest config.
//
// Tests MUST sandbox all host state into a temp CTX_HOME/HOME (G-7); there is no
// global setup that touches the real ~/.ctx, ~/.claude or ~/.copilot. Acceptance
// scenarios live under tests/acceptance/ and start as `test.todo` in slice 1a.
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    // Auto-reset spies/mocks between tests so a forgotten restore cannot leak.
    restoreMocks: true,
    clearMocks: true,
    // Spawn/CLI tests pay a cold-start tax on CI runners; lift the per-test budget
    // above the largest in-test spawn timeout (matches the legacy tk rationale).
    testTimeout: 30000,
    // Living-repo fixtures ingest THIS repo in beforeAll; as the repo's own docs
    // grow (design corpora, etc.) that cold ingest gets slower on shared CI
    // runners, so the default hook budget must be generous (per-hook budgets can
    // still tighten it where a fixture is small).
    hookTimeout: 300000,
  },
});
