import { describe, expect, test } from "vitest";

import { expectRtkParity, filterRtkOutput } from "../../helpers/rtkCommandHarness.js";

describe("RTK find behavior", () => {
  test("groups matched files by directory instead of dumping one path per line", async () => {
    const result = await filterRtkOutput(
      ["find", ".", "-name", "*.ts"],
      ["./src/cli.ts", "./src/parse.ts", "./src/core/history.ts", "./tests/unit/parse.test.ts"].join("\n"),
    );

    expect(result.output).toContain("4F");
    expect(result.output).toContain("src/");
    expect(result.output).toContain("cli.ts");
    expect(result.output).not.toMatch(/\.\/src\/cli\.ts\n\.\/src\/parse\.ts/);

    expectRtkParity(result, {
      critical: [
        "4F",
        "src/",
        "cli.ts",
      ],
      forbidden: [
        /\.\/src\/cli\.ts\n\.\/src\/parse\.ts/,
      ],
      exact: [
        "4F 3D:",
        "",
        "src/ cli.ts parse.ts",
        "src/core/ history.ts",
        "tests/unit/ parse.test.ts",
      ].join("\n"),
    });
  });
});
