import { defineConfig } from "vitest/config";

/**
 * Product tests only. Green means:
 * - Implemented tk commands work through the CLI integration path
 * - Implemented fixture-backed handlers preserve critical output
 * - Per-handler behavior (compression, level dial, dedup, recovery hints) is
 *   correct — every rtk*Behavior suite gates here
 * - Core tk parsing, routing, execution, and reporting helpers behave correctly
 *
 * The RTK migration is complete: the rtk*Behavior suites now assert tk's actual
 * ADR-0001 behavior (the intentional divergences from RTK — zero loss below
 * budget, no `+N more` markers, no capture-time stream truncation — are ratified,
 * not tracked as debt), so there is no longer a separate report-only migration
 * config.
 */
export default defineConfig({
  test: {
    // Redirect TOKEN_KILLER_HOME to a throwaway dir so tests never write into
    // the real ~/.token-killer/ (see tests/setup/isolateHome.ts).
    setupFiles: ["./tests/setup/isolateHome.ts"],
    // Auto-reset spies/mocks between tests so a forgotten restore in one test
    // can't leak into the next.
    restoreMocks: true,
    clearMocks: true,
    include: [
      "tests/unit/handlers/fixtureContent.test.ts",
      "tests/unit/handlers/curlProductBehavior.test.ts",
      "tests/unit/handlers/adr0001Ladder.test.ts",
      // Shipped-handler behavior coverage — every rtk*Behavior suite (all assert
      // tk's actual ADR-0001 behavior; the RTK divergences are ratified).
      "tests/unit/handlers/rtk*Behavior.test.ts",
      "tests/unit/handlers/registeredHandlerCoverage.test.ts",
      "tests/unit/handlers/fixtureWiring.test.ts",
      "tests/unit/handlers/fixtureRegressionDebt.test.ts",
      "tests/unit/handlers/syntheticTestDebt.test.ts",
      "tests/unit/fixtures.test.ts",
      "tests/integration/**/*.test.ts",
      "tests/unit/parse.test.ts",
      "tests/unit/pipeline.test.ts",
      "tests/unit/router.test.ts",
      "tests/unit/savings.test.ts",
      "tests/unit/executor.test.ts",
      "tests/unit/shim/**/*.test.ts",
      "tests/unit/hook/**/*.test.ts",
      "tests/unit/inspect/**/*.test.ts",
      "tests/unit/context/**/*.test.ts",
      "tests/unit/telemetry/**/*.test.ts",
      "tests/unit/core/**/*.test.ts",
      "tests/unit/report/**/*.test.ts",
      "tests/unit/dataDir.test.ts",
      "tests/unit/scripts/**/*.test.ts",
    ],
  },
});
