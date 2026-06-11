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

  test("FP fix: a side-effect verb in the BODY of a read-only skill is NOT flagged", () => {
    // Real false positive: read/think/learn skills got flagged because words like
    // "publish"/"release"/"send" appear in their prose. Classification is by the
    // declared purpose (name + description), not the body.
    writeUserSkill(
      "learn",
      [
        "---",
        "name: learn",
        "description: Research a topic and summarize findings into a reference document.",
        "---",
        "# Learn",
        "Produce a publish-ready article. You may send the draft for review and release notes.",
      ].join("\n"),
    );
    const sideEffect = userFindings().filter(
      (x) =>
        x.type === "skill_invocation_policy" &&
        x.recommendation.includes("disable-model-invocation"),
    );
    expect(sideEffect).toHaveLength(0);
  });

  test("a genuine side-effect skill (verb in its description) is still flagged", () => {
    writeUserSkill(
      "shipit",
      [
        "---",
        "name: shipit",
        "description: Commit, push, and publish a release.",
        "---",
        "# Ship",
        "Body.",
      ].join("\n"),
    );
    expect(
      userFindings().some(
        (x) =>
          x.type === "skill_invocation_policy" &&
          x.recommendation.includes("disable-model-invocation"),
      ),
    ).toBe(true);
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

describe("skill_description_bloat", () => {
  test("flags an over-long always-on description", () => {
    writeUserSkill(
      "verbose",
      [
        "---",
        "name: verbose",
        `description: ${"trigger words and explanation ".repeat(40)}`, // > 600 chars
        "---",
        "# Verbose",
        "Body.",
      ].join("\n"),
    );
    const f = userFindings().find((x) => x.type === "skill_description_bloat");
    expect(f).toBeDefined();
    expect(f!.recommendation).toContain("Tighten the description");
  });

  test("a concise description is not flagged", () => {
    writeUserSkill(
      "concise",
      ["---", "name: concise", "description: Short and to the point.", "---", "# C", "Body."].join(
        "\n",
      ),
    );
    expect(userFindings().some((x) => x.type === "skill_description_bloat")).toBe(false);
  });
});

describe("skill_count_bloat", () => {
  function writeManyUserSkills(n: number): void {
    for (let i = 0; i < n; i += 1) {
      writeUserSkill(
        `s${i}`,
        ["---", `name: s${i}`, `description: skill ${i}`, "---", "# S"].join("\n"),
      );
    }
  }

  test("warns when more than 20 user-level skills are installed", () => {
    writeManyUserSkills(21);
    const f = userFindings().find((x) => x.type === "skill_count_bloat");
    expect(f).toBeDefined();
    expect(f!.severity).toBe("warn");
    expect(f!.evidence).toContain("21 user-level skills");
    expect(f!.recommendation).toContain("Prune");
  });

  test("does not fire at or below the threshold", () => {
    writeManyUserSkills(20);
    expect(userFindings().some((x) => x.type === "skill_count_bloat")).toBe(false);
  });

  test("project-scoped skills do not count toward the user-level total", () => {
    for (let i = 0; i < 25; i += 1) {
      writeProjectSkill(
        `p${i}`,
        ["---", `name: p${i}`, `description: p ${i}`, "---", "# P"].join("\n"),
      );
    }
    expect(projectFindings().some((x) => x.type === "skill_count_bloat")).toBe(false);
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
