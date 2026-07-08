import { describe, expect, test } from "vitest";

import {
  estimateSavings,
  estimateSavingsTokens,
  parseEvidenceTokens,
} from "../../../src/inspect/savings.js";

describe("parseEvidenceTokens", () => {
  test("reads plain, ≈, ~ and k/M suffixed token figures", () => {
    expect(parseEvidenceTokens("metadata (~2248 tokens) loads")).toBe(2248);
    expect(parseEvidenceTokens("≈1580 tok of schemas")).toBe(1580);
    expect(parseEvidenceTokens("(~41K tok of output)")).toBe(41_000);
    expect(parseEvidenceTokens("~2.2k tokens")).toBe(2200);
    expect(parseEvidenceTokens("no number here")).toBeUndefined();
    expect(parseEvidenceTokens(undefined)).toBeUndefined();
  });
});

describe("estimateSavingsTokens", () => {
  test("uncompressed_commands ≈ half the measured output volume", () => {
    expect(
      estimateSavingsTokens({
        type: "uncompressed_commands",
        metrics: { total_output_tokens: 1000 },
      }),
    ).toBe(500);
  });
  test("standing-cost findings reclaim the token figure stated in their evidence", () => {
    expect(
      estimateSavingsTokens({
        type: "skill_count_bloat",
        evidence: "~2248 tokens load every session",
      }),
    ).toBe(2248);
    expect(estimateSavingsTokens({ type: "mcp_bloat", evidence: "≈900 tok of tool schemas" })).toBe(
      900,
    );
  });
  test("non-token fixes (safety/correctness) return undefined — no fabricated saving", () => {
    expect(
      estimateSavingsTokens({ type: "skill_invocation_policy", evidence: "missing policy" }),
    ).toBeUndefined();
    expect(
      estimateSavingsTokens({ type: "instruction_conflict", evidence: "two rules clash" }),
    ).toBeUndefined();
  });
  test("returns undefined when a standing-cost finding states no token figure", () => {
    expect(
      estimateSavingsTokens({ type: "skill_count_bloat", evidence: "too many skills" }),
    ).toBeUndefined();
  });
});

describe("estimateSavings — graded (every finding gets a number)", () => {
  test("grounded when a real figure exists", () => {
    expect(estimateSavings({ type: "skill_count_bloat", evidence: "~2248 tokens" })).toEqual({
      tokens: 2248,
      grounded: true,
    });
    expect(
      estimateSavings({ type: "uncompressed_commands", metrics: { total_output_tokens: 1000 } }),
    ).toEqual({ tokens: 500, grounded: true });
  });
  test("char figures in evidence are grounded (chars→tokens)", () => {
    // "54 chars" → ~14 tokens, grounded (the count is real).
    expect(
      estimateSavings({ type: "instruction_duplicate", evidence: "heading 54 chars matches" }),
    ).toEqual({ tokens: 14, grounded: true });
  });
  test("falls back to a coarse per-type default (rough) when nothing is measurable", () => {
    expect(
      estimateSavings({ type: "skill_invocation_policy", evidence: "missing policy" }),
    ).toEqual({ tokens: 60, grounded: false });
    expect(
      estimateSavings({ type: "vscode_compress_disabled", evidence: "compression off" }),
    ).toEqual({ tokens: 500, grounded: false });
  });
  test("unknown type still gets the generic coarse default", () => {
    expect(estimateSavings({ type: "something_new", evidence: "x" })).toEqual({
      tokens: 50,
      grounded: false,
    });
  });
});
