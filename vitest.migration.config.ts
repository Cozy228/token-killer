import { defineConfig } from "vitest/config";

/**
 * Migration and debt gates. Red is meaningful here:
 * - RTK module migration remains incomplete (rtkDomainCaseParity)
 * - RTK command behavior remains unmigrated (rtk*Behavior)
 * - Fixture-backed behavior regressions remain unresolved
 * - fixtureCases wiring / synthetic-stdout debt must stay clean
 * - Script parity and project infrastructure (CI, docs) are still incomplete
 *
 * This suite is expected to be red until migration completes, so it is run
 * report-only and is NOT part of the blocking `test:ci` gate. The mapping in
 * docs/testing-and-migration-audit.md §4.2 is the source of truth for this list.
 */
export default defineConfig({
  test: {
    include: [
      "tests/unit/handlers/rtkDomainCaseParity.test.ts",
      "tests/unit/handlers/registeredHandlerCoverage.test.ts",
      "tests/unit/handlers/fixtureWiring.test.ts",
      "tests/unit/handlers/fixtureRegressionDebt.test.ts",
      "tests/unit/handlers/syntheticTestDebt.test.ts",
      "tests/unit/handlers/rtk*Behavior.test.ts",
      "tests/unit/fixtures.test.ts",
      "tests/unit/rtkScriptParity.test.ts",
      "tests/unit/projectConfig.test.ts",
    ],
  },
});
