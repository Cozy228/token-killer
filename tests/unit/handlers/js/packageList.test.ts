import { describe, expect, test } from "vitest";

import { packageListHandler } from "../../../../src/handlers/js/packageList.js";
import type { RawResult, TgOptions } from "../../../../src/types.js";

const options: TgOptions = {
  raw: false,
  stats: false,
  verbose: false,
  maxLines: 120,
  maxChars: 12000,
  saveRaw: false,
  cwd: process.cwd(),
};

describe("package list handler", () => {
  test("compresses dependency tree and preserves problems", async () => {
    const raw: RawResult = {
      command: "npm list",
      stdout: [
        "project@1.0.0 /repo",
        ...Array.from({ length: 500 }, (_, index) => `├── package-${index}@${index}.0.0`),
        "├── broken-package@1.0.0 invalid: \"^2.0.0\" from root project",
        "├── peer-tool@2.0.0 unmet peer react@^19",
        "└── missing-lib@0.0.0 missing",
      ].join("\n"),
      stderr: "npm ERR! invalid dependency broken-package\n",
      exitCode: 1,
      durationMs: 1,
    };

    const result = await packageListHandler.filter(
      raw,
      { program: "npm", args: ["list"], original: ["npm", "list"], displayCommand: "npm list" },
      options,
    );

    expect(result.handler).toBe("package-list");
    expect(result.output).toContain("Dependencies:");
    expect(result.output).toContain("broken-package");
    expect(result.output).toContain("unmet peer");
    expect(result.output).toContain("missing-lib");
    expect(result.output).not.toContain("package-499");
    expect(result.savingsPct).toBeGreaterThanOrEqual(80);
  });
});
