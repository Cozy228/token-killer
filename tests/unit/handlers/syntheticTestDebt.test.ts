import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vitest";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

/**
 * Structural meta-tests that operate on the test corpus rather than on a single
 * handler's stdout. They never fabricate command output, so they are exempt from
 * the synthetic-stdout check by design.
 */
const structuralMetaTests = new Set([
  "fixtureContent.test.ts",
  "fixtureRegressionDebt.test.ts",
  "fixtureWiring.test.ts",
  "registeredHandlerCoverage.test.ts",
  "syntheticTestDebt.test.ts",
]);

/**
 * A handler test exercises output filtering when it routes raw output through a
 * handler (`.filter(...)` / `routeCommand(...)`).
 */
const FILTER_SIGNALS = [/\.filter\(/, /routeCommand\(/];

/**
 * Real fixture-backed coverage feeds that filtering from the shared harness or
 * on-disk fixtures instead of a hand-written stdout literal. Any of these marks
 * the test as fixture-backed rather than synthetic.
 */
const HARNESS_SIGNALS = [
  /rtkCommandHarness/,
  /fixtureCases/,
  /filterRtkFixture/,
  /filterRtkOutput/,
  /tests\/fixtures/,
];

function listHandlerTestFiles(dir: string, prefix = ""): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    const absolute = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...listHandlerTestFiles(absolute, relative));
      continue;
    }

    if (!entry.name.endsWith(".test.ts")) {
      continue;
    }

    if (structuralMetaTests.has(entry.name)) {
      continue;
    }

    files.push(relative);
  }

  return files.sort();
}

/**
 * A test is synthetic-stdout debt when it filters command output by hand
 * (FILTER_SIGNALS) but never routes that output through the real harness or a
 * fixture file (no HARNESS_SIGNALS). Pure-function unit tests (arg builders,
 * summary formatters) never trip FILTER_SIGNALS and are correctly ignored.
 */
function findSyntheticHandlerTests(): string[] {
  const handlersDir = path.join(repoRoot, "tests/unit/handlers");
  return listHandlerTestFiles(handlersDir)
    .filter((relative) => {
      const source = readFileSync(path.join(handlersDir, relative), "utf8");
      const filtersOutput = FILTER_SIGNALS.some((re) => re.test(source));
      const fixtureBacked = HARNESS_SIGNALS.some((re) => re.test(source));
      return filtersOutput && !fixtureBacked;
    })
    .map((relative) => `tests/unit/handlers/${relative}`);
}

describe("synthetic handler test debt", () => {
  test("handler stdout tests route through fixtures, never hand-written stdout", () => {
    const syntheticTests = findSyntheticHandlerTests();

    expect(
      syntheticTests,
      [
        "Handler tests that filter command output must use a real fixture (rtkCommandHarness/fixtureCases/tests/fixtures), not hand-written stdout.",
        "Port these to fixtureCases or delete them:",
        ...syntheticTests,
      ].join("\n"),
    ).toEqual([]);
  });
});
