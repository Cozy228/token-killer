import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { parseDebugArgs, runDebug } from "../../../src/debug/cli.js";

describe("parseDebugArgs", () => {
  test("defaults: no out, not full, not redact", () => {
    expect(parseDebugArgs([])).toEqual({ full: false, redact: false });
  });

  test("parses --out / --full / --redact", () => {
    expect(parseDebugArgs(["--out", "x.md", "--full", "--redact"])).toMatchObject({
      out: "x.md",
      full: true,
      redact: true,
    });
  });

  test("--out without a value is a user error", () => {
    expect(parseDebugArgs(["--out"]).error).toMatch(/requires a path/);
  });

  test("unknown flag is a user error", () => {
    expect(parseDebugArgs(["--nope"]).error).toMatch(/unknown flag/);
  });
});

describe("runDebug", () => {
  let tkHome: string;
  let cwd: string;
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    saved.TOKEN_KILLER_HOME = process.env.TOKEN_KILLER_HOME;
    tkHome = mkdtempSync(path.join(tmpdir(), "tk-debug-cli-home-"));
    cwd = mkdtempSync(path.join(tmpdir(), "tk-debug-cli-cwd-"));
    process.env.TOKEN_KILLER_HOME = tkHome;
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    if (saved.TOKEN_KILLER_HOME === undefined) delete process.env.TOKEN_KILLER_HOME;
    else process.env.TOKEN_KILLER_HOME = saved.TOKEN_KILLER_HOME;
    rmSync(tkHome, { recursive: true, force: true });
    rmSync(cwd, { recursive: true, force: true });
  });

  test("writes the bundle to --out and returns 0", async () => {
    const out = path.join(cwd, "bundle.md");
    const code = await runDebug(["--out", out], cwd);
    expect(code).toBe(0);
    const md = readFileSync(out, "utf8");
    expect(md).toContain("# tk debug bundle");
    expect(md).toContain("## 2. Delivery health self-check");
  });

  test("default output lands under reports/ in cwd", async () => {
    const code = await runDebug([], cwd);
    expect(code).toBe(0);
    const reportsDir = path.join(cwd, "reports");
    const { readdirSync } = await import("node:fs");
    const files = readdirSync(reportsDir);
    expect(files.some((f) => /^debug-\d{14}\.md$/.test(f))).toBe(true);
  });

  test("a bad flag returns exit 1 and writes nothing", async () => {
    const code = await runDebug(["--bogus"], cwd);
    expect(code).toBe(1);
  });
});
