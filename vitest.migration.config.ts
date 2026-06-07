import { defineConfig } from "vitest/config";

/**
 * Remaining RTK behavior debt, report-only. Red is meaningful here: each suite
 * under tests/unit/handlers/migration/ covers a handler whose tk output still
 * diverges from RTK reference behavior on some cases. Their green assertions are
 * real shipped-handler coverage too, but the file as a whole carries known-red
 * cases, so it cannot gate `test:ci` without hiding live failures.
 *
 * As a handler's divergences are resolved (or accepted and the red cases
 * removed), move its suite back to tests/unit/handlers/ so the product config's
 * rtk*Behavior glob picks it up and it starts gating.
 *
 * The migration bookkeeping suites (parity manifest, script parity, project-
 * config existence) were retired once the rewrite stabilized; the still-useful
 * hygiene suites (registeredHandlerCoverage, fixtureWiring, fixtureRegressionDebt,
 * syntheticTestDebt, fixtures) were promoted into the product config.
 */
export default defineConfig({
  test: {
    // Same global safety net as the product config: never touch the real
    // ~/.token-killer/ (see tests/setup/isolateHome.ts).
    setupFiles: ["./tests/setup/isolateHome.ts"],
    restoreMocks: true,
    clearMocks: true,
    include: ["tests/unit/handlers/migration/rtk*Behavior.test.ts"],
  },
});
