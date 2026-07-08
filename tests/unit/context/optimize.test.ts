import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { runInspect } from "../../../src/inspect/cli.js";
import { registerAllRules } from "../../../src/context/rules/index.js";
import {
  parseOptimizeArgs,
  resolveOptimizeScopes,
  runOptimize,
  selectStaticFindings,
} from "../../../src/context/optimizeCli.js";

let root: string;
let home: string;
let cwd: string;

beforeEach(() => {
  registerAllRules();
  root = mkdtempSync(join(tmpdir(), "ctx-ctx-opt-"));
  home = join(root, "home");
  cwd = join(root, "repo");
  mkdirSync(home, { recursive: true });
  mkdirSync(cwd, { recursive: true });
  process.env.CONTEXA_HOME = join(home, ".contexa");
});
afterEach(() => {
  delete process.env.CONTEXA_HOME;
  rmSync(root, { recursive: true, force: true });
  vi.restoreAllMocks();
});

function write(rel: string, content: string): void {
  const abs = join(cwd, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content);
}

function captureStdout(): { calls: string[]; restore: () => void } {
  const calls: string[] = [];
  const spy = vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
    calls.push(String(chunk));
    return true;
  });
  return { calls, restore: () => spy.mockRestore() };
}

describe("parseOptimizeArgs / scope", () => {
  test("`context` target is optional (accepted but no longer required)", () => {
    // A leading `context` token is still accepted for back-compat.
    expect(parseOptimizeArgs(["context"]).error).toBeUndefined();
    // Flags work directly with no `context` prefix.
    expect(parseOptimizeArgs(["--apply"]).error).toBeUndefined();
    // A bare unknown token is a flag error.
    expect(parseOptimizeArgs(["skills"]).error).toMatch(/unknown flag/);
  });

  test("scope is git-aware: off-git defaults to user; --surface skills and --user select user", () => {
    // `cwd` here is a fresh temp dir, never a git repo → user-only default.
    expect(resolveOptimizeScopes(parseOptimizeArgs([]), cwd)).toEqual(["user"]);
    expect(resolveOptimizeScopes(parseOptimizeArgs(["--surface", "skills"]), cwd)).toEqual([
      "user",
    ]);
    expect(resolveOptimizeScopes(parseOptimizeArgs(["--user"]), cwd)).toEqual(["user"]);
    expect(resolveOptimizeScopes(parseOptimizeArgs(["--project"]), cwd)).toEqual(["project"]);
  });
});

describe("selectStaticFindings", () => {
  test("keeps only source = static_context", () => {
    const bucket = {
      schemaVersion: "1" as const,
      generatedAt: "t",
      scope: "project" as const,
      files_scanned: 1,
      findings: [
        {
          id: "rt",
          source: "runtime",
          type: "x",
          severity: "info",
          confidence: 1,
          evidence: "",
          recommendation: "",
          fix_class: "advisory",
          metrics: {},
        },
        {
          id: "sc",
          source: "static_context",
          type: "always_on_bloat",
          severity: "warn",
          confidence: 1,
          surface: "agent_instructions",
          evidence: "",
          recommendation: "",
          fix_class: "advisory",
        },
      ] as never[],
    };
    const out = selectStaticFindings(bucket, undefined);
    expect(out.length).toBe(1);
    expect(out[0].source).toBe("static_context");
  });
});

describe("runOptimize (default preview)", () => {
  test("triggers inspect when the bucket is absent, then plans (no writes)", async () => {
    write(
      "AGENTS.md",
      `# Rules\n${Array.from({ length: 300 }, (_, i) => `line ${i}`).join("\n")}\n`,
    );

    const trigger = vi.fn((scope: "user" | "project", h: string, c: string, n: number) => {
      runInspect(scope === "user" ? ["--user", "--text"] : ["--project", "--text"], n, h, c);
    });

    const { calls, restore } = captureStdout();
    const code = await runOptimize(["context", "--project"], 1000, home, cwd, {
      triggerInspect: trigger,
    });
    restore();

    expect(code).toBe(0);
    expect(trigger).toHaveBeenCalledOnce();
    const out = calls.join("");
    expect(out).toContain("preview, scope = project");
    expect(out).toContain("always_on_bloat");
    // No advice file is written in the default preview.
    expect(existsSync(join(home, ".contexa", "advice", "context"))).toBe(false);
  });

  test("hash mismatch suppresses a stale diff and asks for re-inspect", async () => {
    write(
      "AGENTS.md",
      `# Rules\n${Array.from({ length: 300 }, (_, i) => `line ${i}`).join("\n")}\n`,
    );
    // First inspect persists the bucket with the current body_hash.
    runInspect(["--project", "--text"], 1000, home, cwd);
    // Now mutate the file so the live body no longer matches the stored hash.
    write("AGENTS.md", "# Rules\nshort now\n");

    const { calls, restore } = captureStdout();
    const code = await runOptimize(["context", "--project"], 1000, home, cwd, {
      triggerInspect: vi.fn(),
    });
    restore();
    expect(code).toBe(0);
    expect(calls.join("")).toContain("re-run `ctx inspect`");
  });
});
