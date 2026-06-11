import { describe, expect, test } from "vitest";

import { parseArgv } from "../../src/parse.js";

describe("parseArgv", () => {
  test("parses tk stats flag without consuming original git flags", () => {
    const parsed = parseArgv(["--stats", "git", "diff", "--", "src"]);

    expect(parsed.mode).toBe("command");
    expect(parsed.options.stats).toBe(true);
    expect(parsed.command?.program).toBe("git");
    expect(parsed.command?.args).toEqual(["diff", "--", "src"]);
    expect(parsed.command?.original).toEqual(["git", "diff", "--", "src"]);
  });

  test("bare `help` / `version` are verbs, not passthrough commands", () => {
    expect(parseArgv(["help"]).mode).toBe("help");
    expect(parseArgv(["version"]).mode).toBe("version");
    // The --flag form keeps working too.
    expect(parseArgv(["--help"]).mode).toBe("help");
    expect(parseArgv(["--version"]).mode).toBe("version");
  });

  test("`tk -- help` escape hatch still passes `help` through to a real program", () => {
    const parsed = parseArgv(["--", "help"]);
    expect(parsed.mode).toBe("command");
    expect(parsed.command?.program).toBe("help");
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

  test("bare 'report' is no longer a subcommand (the report alias was removed)", () => {
    // The detailed report now lives only at `tk gain report`; a bare `report`
    // token is treated as an ordinary command, never the four-view report.
    const parsed = parseArgv(["report"]);
    expect(parsed.mode).toBe("command");
    expect(parsed.command?.program).toBe("report");
  });
});
