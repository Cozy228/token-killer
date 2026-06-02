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
        ...Array.from(
          { length: 500 },
          (_, index) => `├── package-${index}@${index}.0.0`,
        ),
        '├── broken-package@1.0.0 invalid: "^2.0.0" from root project',
        "├── peer-tool@2.0.0 unmet peer react@^19",
        "└── missing-lib@0.0.0 missing",
      ].join("\n"),
      stderr: "npm ERR! invalid dependency broken-package\n",
      exitCode: 1,
      durationMs: 1,
    };

    const result = await packageListHandler.filter(
      raw,
      {
        program: "npm",
        args: ["list"],
        original: ["npm", "list"],
        displayCommand: "npm list",
      },
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

describe("package list format variants", () => {
  test("preserves dependency names", async () => {
    const raw: RawResult = {
      command: "npm list",
      stdout: [
        "project@1.0.0 /repo",
        "├── react@18.3.1",
        "├── typescript@5.4.0",
        "├── vitest@1.6.0",
        "└── zod@3.23.0",
      ].join("\n"),
      stderr: "",
      exitCode: 0,
      durationMs: 1,
    };

    const result = await packageListHandler.filter(
      raw,
      {
        program: "npm",
        args: ["list"],
        original: ["npm", "list"],
        displayCommand: "npm list",
      },
      options,
    );

    expect(result.handler).toBe("package-list");
    expect(result.output).toContain("Dependencies:");
    expect(result.output).toContain("react@18.3.1");
    expect(result.output).toContain("typescript@5.4.0");
    expect(result.output).toContain("vitest@1.6.0");
    expect(result.output).toContain("zod@3.23.0");
  });

  test("marks invalid packages", async () => {
    const raw: RawResult = {
      command: "npm list",
      stdout: [
        "project@1.0.0 /repo",
        "├── react@18.3.1",
        '├── broken-dep@1.0.0 invalid: "^2.0.0" from root project',
        "└── missing-pkg@0.0.0 missing",
      ].join("\n"),
      stderr: "npm ERR! invalid dependency broken-dep",
      exitCode: 1,
      durationMs: 1,
    };

    const result = await packageListHandler.filter(
      raw,
      {
        program: "npm",
        args: ["list"],
        original: ["npm", "list"],
        displayCommand: "npm list",
      },
      options,
    );

    expect(result.handler).toBe("package-list");
    expect(result.output).toContain("broken-dep");
    expect(result.output).toContain("invalid");
    expect(result.output).toContain("missing");
    expect(result.exitCode).toBe(1);
  });

  test("handles empty output", async () => {
    const raw: RawResult = {
      command: "npm list",
      stdout: "",
      stderr: "",
      exitCode: 0,
      durationMs: 1,
    };

    const result = await packageListHandler.filter(
      raw,
      {
        program: "npm",
        args: ["list"],
        original: ["npm", "list"],
        displayCommand: "npm list",
      },
      options,
    );

    expect(result.handler).toBe("package-list");
    expect(typeof result.output).toBe("string");
  });

  test("routes pnpm list JSON-style output through package list handler", async () => {
    const raw: RawResult = {
      command: "pnpm list --json",
      stdout: JSON.stringify([
        {
          name: "project",
          dependencies: {
            react: { version: "18.3.1" },
            typescript: { version: "5.4.0" },
          },
          devDependencies: {
            vitest: { version: "1.6.0" },
          },
        },
      ]),
      stderr: "",
      exitCode: 0,
      durationMs: 1,
    };

    const result = await packageListHandler.filter(
      raw,
      {
        program: "pnpm",
        args: ["list", "--json"],
        original: ["pnpm", "list", "--json"],
        displayCommand: "pnpm list --json",
      },
      options,
    );

    expect(result.handler).toBe("package-list");
    expect(result.output).toContain("react");
    expect(result.output).toContain("typescript");
    expect(result.output).toContain("vitest");
    expect(result.output).not.toContain('"dependencies"');
  });

  test("handles pnpm outdated output as package dependency signal", async () => {
    const raw: RawResult = {
      command: "pnpm outdated",
      stdout: [
        "Package     Current  Wanted  Latest  Package Type",
        "react       18.2.0   18.3.1  19.0.0  dependencies",
        "typescript  5.3.0    5.4.0   5.6.0   devDependencies",
      ].join("\n"),
      stderr: "",
      exitCode: 1,
      durationMs: 1,
    };

    const result = await packageListHandler.filter(
      raw,
      {
        program: "pnpm",
        args: ["outdated"],
        original: ["pnpm", "outdated"],
        displayCommand: "pnpm outdated",
      },
      options,
    );

    expect(result.handler).toBe("package-list");
    expect(result.output).toContain("react");
    expect(result.output).toContain("18.2.0");
    expect(result.output).toContain("19.0.0");
    expect(result.output).toContain("typescript");
  });
});
