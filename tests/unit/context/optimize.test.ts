import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { runInspect } from "../../../src/inspect/cli.js";
import { registerAllRules } from "../../../src/context/rules/index.js";
import {
  parseOptimizeArgs,
  resolveOptimizeScope,
  runOptimize,
  selectStaticFindings,
} from "../../../src/context/optimizeCli.js";

let root: string;
let home: string;
let cwd: string;

beforeEach(() => {
  registerAllRules();
  root = mkdtempSync(join(tmpdir(), "tk-ctx-opt-"));
  home = join(root, "home");
  cwd = join(root, "repo");
  mkdirSync(home, { recursive: true });
  mkdirSync(cwd, { recursive: true });
  process.env.TOKEN_KILLER_HOME = join(home, ".token-killer");
});
afterEach(() => {
  delete process.env.TOKEN_KILLER_HOME;
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
  test("requires the context target", () => {
    expect(parseOptimizeArgs(["skills"]).error).toMatch(/unknown optimize target/);
    expect(parseOptimizeArgs(["context", "--dry-run"]).error).toBeUndefined();
  });

  test("default scope is project; --surface skills selects user", () => {
    expect(resolveOptimizeScope(parseOptimizeArgs(["context", "--dry-run"]))).toBe("project");
    expect(resolveOptimizeScope(parseOptimizeArgs(["context", "--surface", "skills"]))).toBe("user");
    expect(resolveOptimizeScope(parseOptimizeArgs(["context", "--user"]))).toBe("user");
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
        { id: "rt", source: "runtime", type: "x", severity: "info", confidence: 1, evidence: "", recommendation: "", fix_class: "advisory", metrics: {} },
        { id: "sc", source: "static_context", type: "always_on_bloat", severity: "warn", confidence: 1, surface: "agent_instructions", evidence: "", recommendation: "", fix_class: "advisory" },
      ] as never[],
    };
    const out = selectStaticFindings(bucket, undefined);
    expect(out.length).toBe(1);
    expect(out[0].source).toBe("static_context");
  });
});

describe("runOptimize --dry-run", () => {
  test("triggers inspect when the bucket is absent, then plans (no writes)", async () => {
    write("AGENTS.md", `# Rules\n${Array.from({ length: 300 }, (_, i) => `line ${i}`).join("\n")}\n`);

    const trigger = vi.fn((scope: "user" | "project", h: string, c: string, n: number) => {
      runInspect(scope === "user" ? ["--user"] : ["--project"], n, h, c);
    });

    const { calls, restore } = captureStdout();
    const code = await runOptimize(["context", "--project", "--dry-run"], 1000, home, cwd, { triggerInspect: trigger });
    restore();

    expect(code).toBe(0);
    expect(trigger).toHaveBeenCalledOnce();
    const out = calls.join("");
    expect(out).toContain("--dry-run, scope = project");
    expect(out).toContain("always_on_bloat");
    // No advice file is written in dry-run.
    expect(existsSync(join(home, ".token-killer", "advice", "context"))).toBe(false);
  });

  test("hash mismatch suppresses a stale diff and asks for re-inspect", async () => {
    write("AGENTS.md", `# Rules\n${Array.from({ length: 300 }, (_, i) => `line ${i}`).join("\n")}\n`);
    // First inspect persists the bucket with the current body_hash.
    runInspect(["--project"], 1000, home, cwd);
    // Now mutate the file so the live body no longer matches the stored hash.
    write("AGENTS.md", "# Rules\nshort now\n");

    const { calls, restore } = captureStdout();
    const code = await runOptimize(["context", "--project", "--dry-run"], 1000, home, cwd, {
      triggerInspect: vi.fn(),
    });
    restore();
    expect(code).toBe(0);
    expect(calls.join("")).toContain("re-run `tk inspect`");
  });
});

describe("runOptimize --write-advice", () => {
  test("writes user-scope advice to ~/.token-killer/advice/context/user.md without raw bodies", async () => {
    // Seed a user-level skill so static findings exist at user scope.
    const skill = join(home, ".claude", "skills", "deploy", "SKILL.md");
    mkdirSync(dirname(skill), { recursive: true });
    writeFileSync(skill, ["---", "name: deploy", "description: Deploy", "---", "# Deploy", "Run the deploy and publish."].join("\n"));

    const trigger = vi.fn((scope: "user" | "project", h: string, c: string, n: number) => {
      runInspect(["--user"], n, h, c);
    });

    const { restore } = captureStdout();
    const code = await runOptimize(["context", "--user", "--write-advice"], 1000, home, cwd, { triggerInspect: trigger });
    restore();

    expect(code).toBe(0);
    const advicePath = join(home, ".token-killer", "advice", "context", "user.md");
    expect(existsSync(advicePath)).toBe(true);
    const content = readFileSync(advicePath, "utf8");
    expect(content).toContain("# Copilot Context Advice");
    expect(content).toContain("skill_invocation_policy");
    // Sanitized: the raw skill body line is never persisted.
    expect(content).not.toContain("Run the deploy and publish.");
  });
});
