import { defineConfig } from "vitest/config";

/**
 * Verified tests only. CI green means:
 * - RTK migration gate passes (routing + fixture-backed handlers)
 * - Registered handlers have fixture coverage
 * - Integration / infrastructure tests pass
 *
 * Synthetic handler unit tests under tests/unit/handlers/** are intentionally
 * excluded until ported to tests/helpers/fixtureCases.ts or removed.
 */
const verifiedHandlerTests = [
  "tests/unit/handlers/fixtureContent.test.ts",
  "tests/unit/handlers/registeredHandlerCoverage.test.ts",
  "tests/unit/handlers/rtkCommandParity.test.ts",
  "tests/unit/handlers/rtkDomainCaseParity.test.ts",
  "tests/unit/handlers/syntheticTestDebt.test.ts",
];

export default defineConfig({
  test: {
    include: [
      ...verifiedHandlerTests,
      "tests/integration/**/*.test.ts",
      "tests/unit/fixtures.test.ts",
      "tests/unit/parse.test.ts",
      "tests/unit/pipeline.test.ts",
      "tests/unit/router.test.ts",
      "tests/unit/savings.test.ts",
      "tests/unit/executor.test.ts",
      "tests/unit/core/**/*.test.ts",
      "tests/unit/projectConfig.test.ts",
      "tests/unit/rtkScriptParity.test.ts",
    ],
  },
});
