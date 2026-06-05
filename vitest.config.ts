import { defineConfig } from "vitest/config";

/**
 * Product tests only. Green means:
 * - Implemented tg commands work through the CLI integration path
 * - Implemented fixture-backed handlers preserve critical output
 * - Core tg parsing, routing, execution, and reporting helpers behave correctly
 *
 * RTK migration debt and missing handler gates live in vitest.migration.config.ts.
 * Keeping the configs separate makes red/green signals meaningful instead of
 * hiding migration debt inside product correctness.
 */
export default defineConfig({
  test: {
    include: [
      "tests/unit/handlers/fixtureContent.test.ts",
      "tests/unit/handlers/curlProductBehavior.test.ts",
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
      "tests/unit/core/**/*.test.ts",
      "tests/unit/dataDir.test.ts",
      "tests/unit/scripts/**/*.test.ts",
    ],
  },
});
