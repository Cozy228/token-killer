import { describe, expect, test } from "vitest";

import { javacHandler } from "../../../../src/handlers/java/javac.js";
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

describe("javac handler", () => {
  test("groups compiler errors by file and preserves symbol details", async () => {
    const raw: RawResult = {
      command: "javac App.java",
      stdout: "",
      stderr: [
        ...Array.from({ length: 240 }, (_, index) => `Noise${index}.java:1: error: cannot find symbol\n  symbol: class Missing${index}\n  location: class Noise${index}`),
        "src/order/App.java:42: error: cannot find symbol",
        "        submitOrder(orderId);",
        "        ^",
        "  symbol:   method submitOrder(String)",
        "  location: class App",
        "src/order/Api.java:88: error: incompatible types: String cannot be converted to Order",
        "2 errors",
      ].join("\n"),
      exitCode: 1,
      durationMs: 1,
    };

    const result = await javacHandler.filter(
      raw,
      { program: "javac", args: ["App.java"], original: ["javac", "App.java"], displayCommand: "javac App.java" },
      options,
    );

    expect(result.handler).toBe("javac");
    expect(result.output).toContain("src/order/App.java:42");
    expect(result.output).toContain("cannot find symbol");
    expect(result.output).toContain("submitOrder(String)");
    expect(result.output).toContain("src/order/Api.java:88");
    expect(result.output).not.toContain("Noise239");
    expect(result.savingsPct).toBeGreaterThanOrEqual(80);
  });
});
