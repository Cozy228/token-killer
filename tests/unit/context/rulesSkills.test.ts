import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { analyzeContext } from "../../../src/context/analyzer.js";
import { registerAllRules } from "../../../src/context/rules/index.js";
import type { ContextFinding } from "../../../src/context/types.js";

let root: string;
let home: string;
let cwd: string;

beforeEach(() => {
  registerAllRules();
  root = mkdtempSync(join(tmpdir(), "tk-ctx-skills-"));
  home = join(root, "home");
  cwd = join(root, "repo");
  mkdirSync(home, { recursive: true });
  mkdirSync(cwd, { recursive: true });
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function writeUserSkill(name: string, content: string): void {
  const abs = join(home, ".claude", "skills", name, "SKILL.md");
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content);
}
function writeProjectSkill(name: string, content: string): void {
  const abs = join(cwd, ".claude", "skills", name, "SKILL.md");
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content);
}

function userFindings(): ContextFinding[] {
  return analyzeContext({ scopes: ["user"], home, cwd }).findings;
}
function projectFindings(): ContextFinding[] {
  return analyzeContext({ scopes: ["project"], home, cwd }).findings;
}

describe("skill_invocation_policy", () => {
  test("side-effect skill recommends disable-model-invocation (user → safe_mechanical)", () => {
    writeUserSkill(
      "deploy",
      [
        "---",
        "name: deploy",
        "description: Deploy the service",
        "---",
        "# Deploy",
        "Run the deploy and publish the release.",
      ].join("\n"),
    );
    const f = userFindings().find((x) => x.type === "skill_invocation_policy");
    expect(f).toBeDefined();
    expect(f!.adapter).toBe("claude");
    expect(f!.recommendation).toContain("disable-model-invocation");
    expect(f!.fix_class).toBe("safe_mechanical");
  });

  test("project side-effect skill is also safe_mechanical (apply discloses + backs up + restores)", () => {
    writeProjectSkill(
      "deploy",
      [
        "---",
        "name: deploy",
        "description: Deploy the service",
        "---",
        "# Deploy",
        "Run the deploy and publish the release.",
      ].join("\n"),
    );
    const f = projectFindings().find((x) => x.type === "skill_invocation_policy");
    expect(f).toBeDefined();
    expect(f!.fix_class).toBe("safe_mechanical");
  });

  test("background-knowledge skill recommends user-invocable: false", () => {
    writeUserSkill(
      "conventions",
      [
        "---",
        "name: conventions",
        "description: Background knowledge about our conventions",
        "---",
        "# Conventions",
        "We use tabs and prefer composition.",
      ].join("\n"),
    );
    const f = userFindings().filter((x) => x.type === "skill_invocation_policy");
    expect(f.some((x) => x.recommendation.includes("user-invocable: false"))).toBe(true);
  });

  test("disciplined skill with disable-model-invocation set has no policy finding", () => {
    writeUserSkill(
      "deploy",
      [
        "---",
        "name: deploy",
        "description: Deploy",
        "disable-model-invocation: true",
        "allowed-tools: [Bash]",
        "---",
        "# Deploy",
        "Run the deploy and publish.",
      ].join("\n"),
    );
    expect(userFindings().some((x) => x.type === "skill_invocation_policy")).toBe(false);
  });

  test("M1: explicit disable-model-invocation:false gets NO finding (never flip explicit intent to true)", () => {
    writeUserSkill(
      "deploy",
      [
        "---",
        "name: deploy",
        "description: Deploy",
        "disable-model-invocation: false",
        "---",
        "# Deploy",
        "Run the deploy and publish the release.",
      ].join("\n"),
    );
    expect(userFindings().some((x) => x.type === "skill_invocation_policy")).toBe(false);
  });
});

describe("skill_entrypoint_bloat", () => {
  test("long entrypoint recommends progressive disclosure", () => {
    const body = [
      "---",
      "name: big",
      "description: A big skill",
      "---",
      "# Big",
      ...Array.from({ length: 520 }, (_, i) => `line ${i}`),
    ].join("\n");
    writeUserSkill("big", body);
    const f = userFindings().find((x) => x.type === "skill_entrypoint_bloat");
    expect(f).toBeDefined();
    expect(f!.recommendation).toContain("progressive disclosure");
    expect(f!.fix_class).toBe("advisory");
  });

  test("compact skill entrypoint has no bloat finding", () => {
    writeUserSkill(
      "small",
      [
        "---",
        "name: small",
        "description: A small reference skill",
        "user-invocable: false",
        "allowed-tools: [Read]",
        "---",
        "# Small",
        "Short overview.",
      ].join("\n"),
    );
    expect(userFindings().some((x) => x.type === "skill_entrypoint_bloat")).toBe(false);
  });
});

describe("adapter labelling", () => {
  test("Claude-only skill metadata never appears on a copilot-adapter finding", () => {
    writeUserSkill(
      "deploy",
      [
        "---",
        "name: deploy",
        "description: Deploy",
        "---",
        "# Deploy",
        "Run the deploy and publish.",
      ].join("\n"),
    );
    const copilotFindings = userFindings().filter((x) => x.adapter === "copilot");
    expect(
      copilotFindings.some((x) =>
        /disable-model-invocation|user-invocable|allowed-tools/.test(x.recommendation),
      ),
    ).toBe(false);
  });
});
