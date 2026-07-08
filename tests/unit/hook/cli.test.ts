// Issue #42 — `ctx hook check <cmd>` routing-health dry-run.
//
// The acceptance flow uses this to assert the command-routing hook is wired
// correctly WITHOUT invoking an agent or spending budget: a rewritable command must
// print `rewrite: ctx …` and exit 0. These pin that contract (the exact line the
// harness greps for) plus the other decision spellings.

import { afterEach, describe, expect, test, vi } from "vitest";

import { runHook } from "../../../src/hook/cli.js";

// Capture stdout/stderr writes and run a `ctx hook ...` invocation.
async function run(argv: string[]): Promise<{ code: number; out: string; err: string }> {
  const out: string[] = [];
  const err: string[] = [];
  const so = vi.spyOn(process.stdout, "write").mockImplementation((c: string | Uint8Array) => {
    out.push(typeof c === "string" ? c : Buffer.from(c).toString("utf8"));
    return true;
  });
  const se = vi.spyOn(process.stderr, "write").mockImplementation((c: string | Uint8Array) => {
    err.push(typeof c === "string" ? c : Buffer.from(c).toString("utf8"));
    return true;
  });
  try {
    const code = await runHook(argv);
    return { code, out: out.join(""), err: err.join("") };
  } finally {
    so.mockRestore();
    se.mockRestore();
  }
}

afterEach(() => vi.restoreAllMocks());

describe("ctx hook check — routing health (issue #42)", () => {
  test("rewritable command → 'rewrite: ctx …' on stdout, exit 0 (the acceptance gate)", async () => {
    const r = await run(["check", "git", "status"]);
    expect(r.code).toBe(0);
    // The exact shape the acceptance harness asserts: `^rewrite:\s*ctx\b`.
    expect(r.out).toMatch(/^rewrite:\s*ctx git status\b/);
  });

  test("quoted single-arg form works too", async () => {
    const r = await run(["check", "git status"]);
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/^rewrite:\s*ctx git status\b/);
  });

  test("mutating git subcommand → pass (not rewritten), still exit 0", async () => {
    const r = await run(["check", "git", "commit", "-m", "x"]);
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/^pass:/);
  });

  test("missing command → exit 1 with a clear message", async () => {
    const r = await run(["check"]);
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/missing command/);
  });

  test("unknown subcommand → exit 1", async () => {
    const r = await run(["bogus"]);
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/unknown subcommand/);
  });
});
