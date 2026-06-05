import { describe, expect, test } from "vitest";

import { rewriteCommand } from "../../../src/hook/rewrite.js";

describe("rewriteCommand — rewrite table (DESIGN §3.8)", () => {
  const rewrites: Array<[string, string]> = [
    ["git status", "tg git status"],
    ["git diff", "tg git diff"],
    ["git log", "tg git log"],
    ["git branch", "tg git branch"],
    ["git show HEAD", "tg git show HEAD"],
    ["rg pattern src", "tg rg pattern src"],
    ["grep -r pattern src", "tg grep -r pattern src"],
    ["cat file.txt", "tg cat file.txt"],
    ["ls src", "tg ls src"],
    ["npm test", "tg npm test"],
    ["pnpm test", "tg pnpm test"],
    ["tsc --noEmit", "tg tsc --noEmit"],
    ["eslint src", "tg eslint src"],
  ];
  for (const [input, expected] of rewrites) {
    test(`${input} → ${expected}`, () => {
      const r = rewriteCommand(input);
      expect(r.decision).toBe("rewrite");
      expect(r.rewritten).toBe(expected);
    });
  }

  test("only prepends tg — nothing else changes (quoted args preserved)", () => {
    const r = rewriteCommand('cat "my file.txt"');
    expect(r.rewritten).toBe('tg cat "my file.txt"');
  });
});

describe("rewriteCommand — non-rewrite cases (pass)", () => {
  test("already a tg command → pass (no nesting)", () => {
    expect(rewriteCommand("tg git status").decision).toBe("pass");
  });

  test("unknown/generic command → pass", () => {
    expect(rewriteCommand("some-unknown-tool --flag").decision).toBe("pass");
  });

  test("heredoc → pass", () => {
    expect(rewriteCommand("cat <<EOF\nhi\nEOF").decision).toBe("pass");
  });

  test("output redirect → pass", () => {
    expect(rewriteCommand("git log > out.txt").decision).toBe("pass");
    expect(rewriteCommand("ls src >> out.txt").decision).toBe("pass");
  });

  test("find ... | xargs ... → pass (do not break pipeline)", () => {
    expect(rewriteCommand("find . -name '*.ts' | xargs grep TODO").decision).toBe("pass");
  });

  test("empty / whitespace → pass", () => {
    expect(rewriteCommand("").decision).toBe("pass");
    expect(rewriteCommand("   ").decision).toBe("pass");
  });

  test("mutating git ops are never rewritten", () => {
    expect(rewriteCommand("git commit -m msg").decision).toBe("pass");
    expect(rewriteCommand("git push").decision).toBe("pass");
    expect(rewriteCommand("git branch -D feature").decision).toBe("pass");
  });

  test("interactive git commit (no -m) is never rewritten", () => {
    expect(rewriteCommand("git commit").decision).toBe("pass");
  });
});

describe("rewriteCommand — chains", () => {
  test("&& rewrites both eligible sides", () => {
    const r = rewriteCommand("git status && tsc --noEmit");
    expect(r.decision).toBe("rewrite");
    expect(r.rewritten).toBe("tg git status && tg tsc --noEmit");
  });

  test("; rewrites both eligible sides", () => {
    const r = rewriteCommand("git status ; git diff");
    expect(r.rewritten).toBe("tg git status; tg git diff");
  });

  test("|| rewrites both eligible sides", () => {
    const r = rewriteCommand("git status || git diff");
    expect(r.rewritten).toBe("tg git status || tg git diff");
  });

  test("pipe: only LHS is rewritten", () => {
    const r = rewriteCommand("git log | head");
    expect(r.decision).toBe("rewrite");
    expect(r.rewritten).toBe("tg git log | head");
  });

  test("pipe RHS grep is left untouched", () => {
    const r = rewriteCommand("cat file.txt | grep TODO");
    expect(r.rewritten).toBe("tg cat file.txt | grep TODO");
  });

  test("chain with an ineligible side rewrites only the eligible one", () => {
    const r = rewriteCommand("git commit -m x && git status");
    expect(r.rewritten).toBe("git commit -m x && tg git status");
  });

  test("chain with no eligible side → pass", () => {
    expect(rewriteCommand("git commit -m x && git push").decision).toBe("pass");
  });

  test("operators inside quotes are not split", () => {
    const r = rewriteCommand('rg "a && b" src');
    expect(r.decision).toBe("rewrite");
    expect(r.rewritten).toBe('tg rg "a && b" src');
  });
});
