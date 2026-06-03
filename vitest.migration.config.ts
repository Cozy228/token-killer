import { defineConfig } from "vitest/config";

/**
 * Migration and debt gates. Red is meaningful here:
 * - Missing RTK handlers remain unmigrated
 * - Fixture-backed coverage is incomplete
 * - Synthetic handler tests still need to be ported or deleted
 * - Infrastructure/script parity is still incomplete
 */
export default defineConfig({
  test: {
    include: [
      "tests/unit/handlers/fixtureWiring.test.ts",
      "tests/unit/handlers/fixtureRegressionDebt.test.ts",
      "tests/unit/handlers/registeredHandlerCoverage.test.ts",
      "tests/unit/handlers/rtkDomainCaseParity.test.ts",
      "tests/unit/handlers/syntheticTestDebt.test.ts",
      "tests/unit/fixtures.test.ts",
      "tests/unit/projectConfig.test.ts",
      "tests/unit/rtkScriptParity.test.ts",
    ],
  },
});
