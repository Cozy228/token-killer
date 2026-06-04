import { describe, expect, test } from "vitest";

import { expectRtkParity, filterRtkFixture } from "../../helpers/rtkCommandHarness.js";

describe("RTK gradle behavior", () => {
  test("build keeps compiler warnings and strips task progress", async () => {
    const result = await filterRtkFixture(
      ["./gradlew", "build"],
      "tests/fixtures/java/gradle_build_warnings.txt",
    );

    expect(result.output).toContain("w: /src/Foo.kt: (42, 5)");
    expect(result.output).toContain("warning: [options]");
    expect(result.output).toContain("Warning: Gradle deprecation detected");
    expect(result.output).toContain("BUILD SUCCESSFUL");
    expect(result.output).not.toMatch(/> Task :app:compileDebugKotlin/);

    expectRtkParity(result, {
      critical: [
        "w: /src/Foo.kt: (42, 5)",
        "warning: [options]",
        "Warning: Gradle deprecation detected",
        "BUILD SUCCESSFUL",
      ],
      forbidden: [
        /> Task :app:compileDebugKotlin/,
      ],
      maxOutputChars: 240,
    });
  });
});
