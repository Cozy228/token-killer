import { describe, expect, test } from "vitest";

import { parseArgv } from "../../src/parse.js";

describe("parseArgv", () => {
  test("parses tg stats flag without consuming original git flags", () => {
    const parsed = parseArgv(["--stats", "git", "diff", "--", "src"]);

    expect(parsed.mode).toBe("command");
    expect(parsed.options.stats).toBe(true);
    expect(parsed.command?.program).toBe("git");
    expect(parsed.command?.args).toEqual(["diff", "--", "src"]);
    expect(parsed.command?.original).toEqual(["git", "diff", "--", "src"]);
  });

  test("stops parsing at the original command", () => {
    const parsed = parseArgv(["pytest", "--maxfail=1"]);

    expect(parsed.options.stats).toBe(false);
    expect(parsed.command?.program).toBe("pytest");
    expect(parsed.command?.args).toEqual(["--maxfail=1"]);
    expect(parsed.command?.original).toEqual(["pytest", "--maxfail=1"]);
  });

  test("parses max-lines before search command", () => {
    const parsed = parseArgv(["--max-lines", "200", "rg", "TODO", "."]);

    expect(parsed.options.maxLines).toBe(200);
    expect(parsed.command?.original).toEqual(["rg", "TODO", "."]);
  });

  test("parses report json mode", () => {
    const parsed = parseArgv(["--report", "--json"]);

    expect(parsed.mode).toBe("report");
    expect(parsed.options.reportFormat).toBe("json");
    expect(parsed.command).toBeUndefined();
  });

  test("does not consume tsc flags", () => {
    const parsed = parseArgv(["tsc", "--noEmit"]);

    expect(parsed.command?.program).toBe("tsc");
    expect(parsed.command?.args).toEqual(["--noEmit"]);
  });

  test("does not consume read-level flags globally", () => {
    const parsed = parseArgv(["read", "--level", "aggressive", "src/cli.ts"]);

    expect(parsed.command?.program).toBe("read");
    expect(parsed.command?.args).toEqual(["--level", "aggressive", "src/cli.ts"]);
  });

  test("does not consume maven flags", () => {
    const parsed = parseArgv(["mvn", "-q", "test"]);

    expect(parsed.command?.program).toBe("mvn");
    expect(parsed.command?.args).toEqual(["-q", "test"]);
  });
});
