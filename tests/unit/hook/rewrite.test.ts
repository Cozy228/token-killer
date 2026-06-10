import { describe, expect, test } from "vitest";

import { rewriteCommand } from "../../../src/hook/rewrite.js";

describe("rewriteCommand — rewrite table (DESIGN §3.8)", () => {
  const rewrites: Array<[string, string]> = [
    ["git status", "tk git status"],
    ["git diff", "tk git diff"],
    ["git log", "tk git log"],
    ["git branch", "tk git branch"],
    ["git show HEAD", "tk git show HEAD"],
    ["rg pattern src", "tk rg pattern src"],
    ["grep -r pattern src", "tk grep -r pattern src"],
    ["cat file.txt", "tk cat file.txt"],
    ["ls src", "tk ls src"],
    ["npm test", "tk npm test"],
    ["pnpm test", "tk pnpm test"],
    ["tsc --noEmit", "tk tsc --noEmit"],
    ["eslint src", "tk eslint src"],
  ];
  for (const [input, expected] of rewrites) {
    test(`${input} → ${expected}`, () => {
      const r = rewriteCommand(input);
      expect(r.decision).toBe("rewrite");
      expect(r.rewritten).toBe(expected);
    });
  }

  test("only prepends tk — nothing else changes (quoted args preserved)", () => {
    const r = rewriteCommand('cat "my file.txt"');
    expect(r.rewritten).toBe('tk cat "my file.txt"');
  });

  test("L15: rewrite is a byte-faithful prepend even with \\ / $() the tokenizer does not parse", () => {
    // The tokenizer ignores backslash escapes and $(); the rewrite must stay exactly
    // `tk ` + the original segment (prepend-only), never a re-quoted/normalized form.
    for (const c of ['grep "a\\b" src', "rg $(date) src", "grep 'it'\\''s' ."]) {
      expect(rewriteCommand(c).rewritten).toBe(`tk ${c}`);
    }
  });
});

describe("rewriteCommand — non-rewrite cases (pass)", () => {
  test("already a tk command → pass (no nesting)", () => {
    expect(rewriteCommand("tk git status").decision).toBe("pass");
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

describe("rewriteCommand — pass carries a reason (TK_DEBUG: why not rewritten)", () => {
  test("empty command", () => {
    expect(rewriteCommand("").reason).toBe("empty command");
  });

  test("already a tk command", () => {
    expect(rewriteCommand("tk git status").reason).toBe("already a tk command");
  });

  test("no handler names the program", () => {
    expect(rewriteCommand("some-unknown-tool --flag").reason).toBe(
      "no tk handler for 'some-unknown-tool'",
    );
  });

  test("mutating git subcommand", () => {
    expect(rewriteCommand("git push").reason).toBe("mutating git subcommand");
  });

  test("output redirect / heredoc", () => {
    expect(rewriteCommand("git log > out.txt").reason).toContain("redirect");
    expect(rewriteCommand("cat <<EOF\nhi\nEOF").reason).toContain("redirect");
  });

  test("pipes into xargs", () => {
    expect(rewriteCommand("find . -name '*.ts' | xargs grep TODO").reason).toBe("pipes into xargs");
  });

  test("a rewrite carries no pass reason", () => {
    expect(rewriteCommand("git status").reason).toBeUndefined();
  });
});

describe("rewriteCommand — chains", () => {
  test("&& rewrites both eligible sides", () => {
    const r = rewriteCommand("git status && tsc --noEmit");
    expect(r.decision).toBe("rewrite");
    expect(r.rewritten).toBe("tk git status && tk tsc --noEmit");
  });

  test("; rewrites both eligible sides", () => {
    const r = rewriteCommand("git status ; git diff");
    expect(r.rewritten).toBe("tk git status; tk git diff");
  });

  test("|| rewrites both eligible sides", () => {
    const r = rewriteCommand("git status || git diff");
    expect(r.rewritten).toBe("tk git status || tk git diff");
  });

  test("pipe head is NOT rewritten — compressing the producer corrupts the tail (C1)", () => {
    // `tk git log | head` would feed `head` the COMPACTED log, not the real one.
    // ADR 0007 follow-up #1: a segment whose stdout flows into `|` passes untouched.
    const r = rewriteCommand("git log | head");
    expect(r.decision).toBe("pass");
  });

  test("pipe RHS grep is left untouched", () => {
    const r = rewriteCommand("cat file.txt | grep TODO");
    expect(r.decision).toBe("pass");
  });

  test("C1: counting filter over a handled producer keeps the real count", () => {
    // `tk git diff | grep -c '^+'` would count `+` lines in the compacted diff (0),
    // not the real diff. Neither segment may be rewritten.
    const r = rewriteCommand("git diff | grep -c '^+'");
    expect(r.decision).toBe("pass");
  });

  test("chain with an ineligible side rewrites only the eligible one", () => {
    const r = rewriteCommand("git commit -m x && git status");
    expect(r.rewritten).toBe("git commit -m x && tk git status");
  });

  test("chain with no eligible side → pass", () => {
    expect(rewriteCommand("git commit -m x && git push").decision).toBe("pass");
  });

  test("operators inside quotes are not split", () => {
    const r = rewriteCommand('rg "a && b" src');
    expect(r.decision).toBe("rewrite");
    expect(r.rewritten).toBe('tk rg "a && b" src');
  });
});

describe("rewriteCommand — presence gate (D2)", () => {
  // tk wraps real tools; it must not rewrite a command whose binary is absent (on
  // a stock Windows box `cat`/`ls` are pwsh cmdlet aliases, not executables, so
  // `tk cat` would shell out to a missing binary and break them). The PATH check
  // is injected here for a deterministic, cross-platform assertion.
  test("passes a command whose binary is absent (no rewrite)", () => {
    const r = rewriteCommand("cat file.txt", undefined, () => false);
    expect(r.decision).toBe("pass");
    expect(r.reason).toContain("no 'cat' binary on PATH");
  });

  test("rewrites the same command when the binary is present", () => {
    const r = rewriteCommand("cat file.txt", undefined, () => true);
    expect(r.decision).toBe("rewrite");
    expect(r.rewritten).toBe("tk cat file.txt");
  });

  test("in a chain, absent-binary segments pass while present ones rewrite", () => {
    const r = rewriteCommand("git status && cat foo", undefined, (p) => p === "git");
    expect(r.decision).toBe("rewrite");
    expect(r.rewritten).toBe("tk git status && cat foo");
  });
});
