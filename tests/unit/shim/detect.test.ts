import { describe, expect, test } from "vitest";

import { detectHost, selectTier, type DetectEnv } from "../../../src/shim/detect.js";

function env(overrides: Partial<DetectEnv>): DetectEnv {
  return {
    claudeEnv: false,
    claudeSettingsExists: false,
    copilotDirExists: false,
    termProgram: undefined,
    codeOnPath: false,
    vscodeUserDirExists: false,
    ...overrides,
  };
}

describe("detectHost", () => {
  test("Claude Code wins outright when its env markers are set (live session)", () => {
    expect(detectHost(env({ claudeEnv: true, copilotDirExists: true }))).toBe("claude-code");
  });

  test("Claude Code from a persistent settings file (no live env, no copilot)", () => {
    expect(detectHost(env({ claudeSettingsExists: true, vscodeUserDirExists: true }))).toBe(
      "claude-code",
    );
  });

  test("Copilot CLI still wins over a persistent Claude settings file", () => {
    expect(detectHost(env({ claudeSettingsExists: true, copilotDirExists: true }))).toBe(
      "copilot-cli",
    );
  });

  test("Copilot CLI wins when ~/.copilot exists (highest tier)", () => {
    expect(detectHost(env({ copilotDirExists: true, vscodeUserDirExists: true }))).toBe(
      "copilot-cli",
    );
  });

  test("VS Code when TERM_PROGRAM=vscode", () => {
    expect(detectHost(env({ termProgram: "vscode" }))).toBe("vscode");
  });

  test("VS Code when code resolves on PATH", () => {
    expect(detectHost(env({ codeOnPath: true }))).toBe("vscode");
  });

  test("VS Code when the user dir exists", () => {
    expect(detectHost(env({ vscodeUserDirExists: true }))).toBe("vscode");
  });

  test("unknown when no signal", () => {
    expect(detectHost(env({}))).toBe("unknown");
  });
});

describe("selectTier", () => {
  test("Claude Code → hook when the installer is available", () => {
    expect(selectTier(["hook", "injection"], true, false)).toBe("hook");
  });

  test("Copilot CLI → hook when the installer is available", () => {
    expect(selectTier(["hook", "shim", "injection"], true, true)).toBe("hook");
  });

  test("Copilot CLI degrades to shim when hook installer is missing", () => {
    expect(selectTier(["hook", "shim", "injection"], false, true)).toBe("shim");
  });

  test("Copilot CLI degrades to injection when hook missing AND shim probe fails", () => {
    expect(selectTier(["hook", "shim", "injection"], false, false)).toBe("injection");
  });

  test("VS Code → shim when the probe passes", () => {
    expect(selectTier(["shim", "injection"], false, true)).toBe("shim");
  });

  test("VS Code → injection when the probe fails", () => {
    expect(selectTier(["shim", "injection"], false, false)).toBe("injection");
  });

  test("unknown host always → injection", () => {
    expect(selectTier(["injection"], true, true)).toBe("injection");
  });
});
