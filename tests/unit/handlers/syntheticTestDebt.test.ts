import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vitest";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

const verifiedHandlerTests = new Set([
  "fixtureContent.test.ts",
  "fixtureRegressionDebt.test.ts",
  "fixtureWiring.test.ts",
  "registeredHandlerCoverage.test.ts",
  "rtkDomainCaseParity.test.ts",
  "syntheticTestDebt.test.ts",
]);

function listSyntheticHandlerTests(dir: string, prefix = ""): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    const absolute = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...listSyntheticHandlerTests(absolute, relative));
      continue;
    }

    if (!entry.name.endsWith(".test.ts")) {
      continue;
    }

    if (verifiedHandlerTests.has(entry.name)) {
      continue;
    }

    files.push(`tests/unit/handlers/${relative}`);
  }

  return files.sort();
}

describe("synthetic handler test debt", () => {
  test("no unported synthetic handler tests remain outside the product suite", () => {
    const syntheticTests = listSyntheticHandlerTests(
      path.join(repoRoot, "tests/unit/handlers"),
    );

    expect(
      syntheticTests,
      [
        "Synthetic stdout handler tests are excluded from product tests and must be ported to fixtureCases or deleted:",
        ...syntheticTests,
      ].join("\n"),
    ).toEqual([]);
  });
});
