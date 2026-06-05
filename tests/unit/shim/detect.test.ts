import { describe, expect, test } from "vitest";

import { detectHost, selectTier, type DetectEnv } from "../../../src/shim/detect.js";

function env(overrides: Partial<DetectEnv>): DetectEnv {
  return {
    copilotDirExists: false,
    termProgram: undefined,
    codeOnPath: false,
    vscodeUserDirExists: false,
    ...overrides,
  };
}

describe("detectHost", () => {
  test("Copilot CLI wins when ~/.copilot exists (highest tier)", () => {
    expect(detectHost(env({ copilotDirExists: true, vscodeUserDirExists: true }))).toBe("copilot-cli");
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
  test("Copilot CLI → hook when the installer is available", () => {
    expect(selectTier("copilot-cli", true, true)).toBe("hook");
  });

  test("Copilot CLI degrades to shim when hook installer is missing", () => {
    expect(selectTier("copilot-cli", false, true)).toBe("shim");
  });

  test("Copilot CLI degrades to injection when hook missing AND shim probe fails", () => {
    expect(selectTier("copilot-cli", false, false)).toBe("injection");
  });

  test("VS Code → shim when the probe passes", () => {
    expect(selectTier("vscode", false, true)).toBe("shim");
  });

  test("VS Code → injection when the probe fails", () => {
    expect(selectTier("vscode", false, false)).toBe("injection");
  });

  test("unknown host always → injection", () => {
    expect(selectTier("unknown", true, true)).toBe("injection");
  });
});
