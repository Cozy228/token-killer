import { access } from "node:fs/promises";
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
});
