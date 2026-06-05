import { describe, expect, test } from "vitest";

import { failureSourceAdapter, handleError, recoveryHint } from "../../../src/hook/error.js";
import { normalize } from "../../../src/hook/normalize.js";

function errorEvent(toolName: string, input: Record<string, unknown>) {
  return normalize({ event: "errorOccurred", tool_name: toolName, tool_input: input });
}

describe("handleError — never blocks, always hints", () => {
  test("decision is allow with an additional_context hint", () => {
    const d = handleError(errorEvent("bash", { error: "boom" }));
    expect(d.decision).toBe("allow");
    expect(d.additional_context).toBeTruthy();
  });
});

describe("recoveryHint — category/signal-specific, no echo", () => {
  test("command not found", () => {
    expect(recoveryHint(errorEvent("bash", { stderr: "zsh: command not found: frobnicate" }))).toContain(
      "Command not found",
    );
  });

  test("ENOENT / no such file", () => {
    expect(recoveryHint(errorEvent("bash", { error: "ENOENT: no such file or directory" }))).toContain(
      "Path not found",
    );
  });

  test("permission denied", () => {
    expect(recoveryHint(errorEvent("bash", { stderr: "permission denied" }))).toContain("Permission denied");
  });

  test("read failure without a known signal → read-specific hint", () => {
    expect(recoveryHint(errorEvent("read_file", { message: "weird failure" }))).toContain("Read failed");
  });

  test("generic terminal failure → generic hint", () => {
    expect(recoveryHint(errorEvent("bash", { message: "exit code 2" }))).toContain("re-read the error");
  });

  test("hint never echoes the underlying error text", () => {
    const hint = recoveryHint(errorEvent("bash", { stderr: "fatal: SECRET_LEAK_12345" }));
    expect(hint).not.toContain("SECRET_LEAK_12345");
  });
});

describe("failureSourceAdapter", () => {
  test("terminal → terminal_tool", () => {
    expect(failureSourceAdapter(errorEvent("bash", {}))).toBe("terminal_tool");
  });
  test("direct tool → direct_tool", () => {
    expect(failureSourceAdapter(errorEvent("read_file", {}))).toBe("direct_tool");
  });
});
