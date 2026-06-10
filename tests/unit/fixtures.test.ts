import { access } from "node:fs/promises";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

const requiredFixtures = [
  "tests/fixtures/common/cat_large_ts.txt",
  "tests/fixtures/common/ls_large_project.txt",
  "tests/fixtures/common/rg_many_matches.txt",
  "tests/fixtures/common/rg_default_format.txt",
  "tests/fixtures/common/grep_no_line_numbers.txt",
  "tests/fixtures/git/status_dirty.txt",
  "tests/fixtures/git/diff_large.txt",
  "tests/fixtures/git/log_many.txt",
  "tests/fixtures/git/log_standard.txt",
  "tests/fixtures/git/show_large.txt",
  "tests/fixtures/git/branch_many.txt",
  "tests/fixtures/git/status_dirty_extended.txt",
  "tests/fixtures/python/pytest_failed.txt",
  "tests/fixtures/python/pytest_passed.txt",
  "tests/fixtures/python/ruff_many.txt",
  "tests/fixtures/python/mypy_many.txt",
  "tests/fixtures/python/pip_list_large.txt",
  "tests/fixtures/js/vitest_failed.txt",
  "tests/fixtures/js/jest_failed.txt",
  "tests/fixtures/js/eslint_many.txt",
  "tests/fixtures/js/tsc_many.txt",
  "tests/fixtures/js/npm_list_large.txt",
  "tests/fixtures/java/maven_test_failed.txt",
  "tests/fixtures/java/gradle_test_failed.txt",
  "tests/fixtures/java/javac_errors.txt",
];

describe("fixtures", () => {
  test.each(requiredFixtures)("%s exists", async (fixture) => {
    await expect(access(path.join(repoRoot, fixture))).resolves.toBeUndefined();
  });

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
