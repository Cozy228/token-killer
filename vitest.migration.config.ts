import { defineConfig } from "vitest/config";

/**
 * Migration and debt gates. Red is meaningful here:
 * - RTK command behavior remains unmigrated
 * - Fixture-backed behavior regressions remain unresolved
 * - Script parity is still incomplete
 */
export default defineConfig({
  test: {
    include: [
      "tests/unit/handlers/fixtureRegressionDebt.test.ts",
      "tests/unit/handlers/rtk*Behavior.test.ts",
      "tests/unit/fixtures.test.ts",
      "tests/unit/rtkScriptParity.test.ts",
    ],
  },
});
