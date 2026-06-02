import { access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vitest";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

const requiredRepoFiles = [
  { name: "GitHub Actions CI workflow", tgPath: ".github/workflows/ci.yml" },
  { name: "CLI testing guidelines", tgPath: "docs/cli-testing.md" },
] as const;

describe("repository CI and testing docs", () => {
  test.each(requiredRepoFiles)("$name exists", async ({ tgPath }) => {
    await expect(access(path.join(repoRoot, tgPath))).resolves.toBeUndefined();
  });
});
