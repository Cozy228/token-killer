import { describe, expect, test } from "vitest";

import { governPrompt, DEFAULT_PROMPT_THRESHOLDS } from "../../../src/hook/prompt.js";
import { normalize } from "../../../src/hook/normalize.js";

function promptEvent(text: string) {
  return normalize({ event: "userPromptSubmitted", prompt: text });
}

// ~4 chars per token (savings.estimateTokens). Build a prompt of N tokens.
function tokensOf(n: number): string {
  return "x".repeat(n * 4);
}

describe("governPrompt — token thresholds (DESIGN §3.5)", () => {
  test("over block threshold → deny", () => {
    const d = governPrompt(promptEvent(tokensOf(DEFAULT_PROMPT_THRESHOLDS.blockTokens + 10)));
    expect(d.decision).toBe("deny");
    expect(d.reason).toContain("block threshold");
  });

  test("over warn (under block) → suggest with additional_context", () => {
    const d = governPrompt(promptEvent(tokensOf(DEFAULT_PROMPT_THRESHOLDS.warnTokens + 10)));
    expect(d.decision).toBe("suggest");
    expect(d.additional_context).toBeTruthy();
  });

  test("short ordinary prompt → allow", () => {
    expect(governPrompt(promptEvent("fix the typo in the README")).decision).toBe("allow");
  });

  test("empty prompt → allow", () => {
    expect(governPrompt(promptEvent("")).decision).toBe("allow");
  });

  test("custom thresholds are honored", () => {
    const d = governPrompt(promptEvent(tokensOf(50)), { warnTokens: 10, blockTokens: 100 });
    expect(d.decision).toBe("suggest");
  });

  test("block takes precedence over implementation-intent", () => {
    const d = governPrompt(promptEvent("implement " + tokensOf(DEFAULT_PROMPT_THRESHOLDS.blockTokens + 10)));
    expect(d.decision).toBe("deny");
  });
});

describe("governPrompt — implementation-intent routing (L1)", () => {
  test("'implement ...' short prompt → suggest routing hint", () => {
    const d = governPrompt(promptEvent("implement the login form component"));
    expect(d.decision).toBe("suggest");
    expect(d.additional_context).toContain("cheaper model");
  });

  test("'generate tests' → suggest", () => {
    expect(governPrompt(promptEvent("generate unit tests for the parser")).decision).toBe("suggest");
  });

  test("planning prompt is NOT flagged", () => {
    expect(governPrompt(promptEvent("what is the root cause of this regression?")).decision).toBe("allow");
  });

  test("never carries prompt text back in the reason", () => {
    const secret = "implement SECRET_TOKEN_VALUE handling";
    const d = governPrompt(promptEvent(secret));
    expect(JSON.stringify(d)).not.toContain("SECRET_TOKEN_VALUE");
  });
});
