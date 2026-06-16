import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

// Per-fixture existence is no longer asserted here: tests/unit/handlers/
// fixtureContent.test.ts reads every fixtureCases fixture (readFile throws if one
// is missing), so a deleted fixture already fails the behavior suite. What remains
// below are the corpus-SIZE guards (a handler needs N sample fixtures), which no
// content test covers.
describe("fixtures", () => {
  test("gradle handler fixture corpus has at least six samples", () => {
    const paths = readdirSync(path.join(repoRoot, "tests/fixtures/java"))
      .filter((file) => file.startsWith("gradle") && file.endsWith(".txt"))
      .map((file) => `tests/fixtures/java/${file}`);

    expect(
      paths.length,
      `Port gradlew fixtures into tests/fixtures/java (have ${paths.length}, need 6)`,
    ).toBeGreaterThanOrEqual(6);
  });

  test("golangci handler fixture sample exists", () => {
    expect(
      existsSync(path.join(repoRoot, "tests/fixtures/go/golangci_v2_json.txt")),
      "Add tests/fixtures/go/golangci_v2_json.txt",
    ).toBe(true);
  });

  test("glab handler fixture corpus has at least five samples", () => {
    const dir = path.join(repoRoot, "tests/fixtures/git");
    const paths = existsSync(dir)
      ? readdirSync(dir)
          .filter((file) => file.includes("glab"))
          .map((file) => `tests/fixtures/git/${file}`)
      : [];

    expect(paths.length, "Port glab fixtures into tests/fixtures/git").toBeGreaterThanOrEqual(5);
  });
});
