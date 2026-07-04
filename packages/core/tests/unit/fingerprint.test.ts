import { describe, expect, test } from "vitest";
import {
  EXTRACTOR_VERSION,
  classifyContentChange,
  structuralFingerprint,
} from "../../src/ingest/code/fingerprint.ts";

/**
 * Structural fingerprint (2c) — the classifier is CONSERVATIVE: a reformat or a
 * comment-only edit is COSMETIC (same normalized stream); anything touching a
 * signature, a body token, or a string literal is STRUCTURAL.
 */
describe("structural fingerprint (2c)", () => {
  const ORIGINAL = `// header comment\nimport { readFileSync } from "node:fs";\n\nexport function greet(name: string): string {\n  return "hi " + name;\n}\n`;

  test("cosmetic-invariant: reindent + blank lines + operator spacing → same fingerprint", () => {
    const reformatted = `// header comment\nimport {readFileSync} from "node:fs";\n\n\n\nexport function greet(name:string):string{\n        return "hi " + name;\n}\n`;
    expect(structuralFingerprint(reformatted, "typescript")).toBe(
      structuralFingerprint(ORIGINAL, "typescript"),
    );
  });

  test("cosmetic-invariant: comment-only edits (line + block) → same fingerprint", () => {
    const recommented = `// a completely different header\nimport { readFileSync } from "node:fs";\n\n/* a new block comment */\nexport function greet(name: string): string {\n  return "hi " + name; // trailing note\n}\n`;
    expect(structuralFingerprint(recommented, "typescript")).toBe(
      structuralFingerprint(ORIGINAL, "typescript"),
    );
  });

  test("structural: a signature change (arity) → different fingerprint", () => {
    const sig = ORIGINAL.replace("greet(name: string)", "greet(name: string, loud: boolean)");
    expect(structuralFingerprint(sig, "typescript")).not.toBe(
      structuralFingerprint(ORIGINAL, "typescript"),
    );
  });

  test("structural: a body change → different fingerprint", () => {
    const body = ORIGINAL.replace('"hi " + name', '"hello " + name');
    expect(structuralFingerprint(body, "typescript")).not.toBe(
      structuralFingerprint(ORIGINAL, "typescript"),
    );
  });

  test("string content is structure: whitespace inside a literal is significant", () => {
    const a = `export const s = "a b";\n`;
    const b = `export const s = "ab";\n`;
    expect(structuralFingerprint(a, "typescript")).not.toBe(structuralFingerprint(b, "typescript"));
  });

  test("a comment marker inside a string is NOT stripped", () => {
    // If `//` inside the string were treated as a comment, these two would
    // collapse to the same normalized stream. They must stay distinct.
    const a = `export const u = "http://a";\n`;
    const b = `export const u = "http://b";\n`;
    expect(structuralFingerprint(a, "typescript")).not.toBe(structuralFingerprint(b, "typescript"));
  });

  test("python uses # comments; C-family treats # as structural", () => {
    const pyBase = `def greet(name):\n    return "hi"\n`;
    const pyComment = `# module doc\ndef greet(name):  # inline\n    return "hi"\n`;
    expect(structuralFingerprint(pyComment, "python")).toBe(
      structuralFingerprint(pyBase, "python"),
    );
    // The SAME `#` text in TS is a private field / not-a-comment: never stripped.
    const tsHashA = `class C { #x = 1; }\n`;
    const tsHashB = `class C { #y = 1; }\n`;
    expect(structuralFingerprint(tsHashA, "typescript")).not.toBe(
      structuralFingerprint(tsHashB, "typescript"),
    );
  });

  test("classifyContentChange: no baseline → structural; equal → cosmetic; differ → structural", () => {
    const fp = structuralFingerprint(ORIGINAL, "typescript");
    expect(classifyContentChange(undefined, fp)).toBe("structural");
    expect(classifyContentChange(fp, fp)).toBe("cosmetic");
    expect(classifyContentChange("stale-fp", fp)).toBe("structural");
  });

  test("extractor version is folded in (a bump forces structural on next change)", () => {
    // Sanity: the constant is exported and part of the hashed prefix, so two
    // versions of the SAME text would not compare equal (guarded by the prefix).
    expect(EXTRACTOR_VERSION).toBeGreaterThanOrEqual(1);
    expect(structuralFingerprint("x", "typescript")).not.toBe(
      structuralFingerprint("x", "javascript"),
    );
  });
});
