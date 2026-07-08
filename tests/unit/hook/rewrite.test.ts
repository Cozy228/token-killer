import { describe, expect, test } from "vitest";

import { rewriteCommand } from "../../../src/hook/rewrite.js";

describe("rewriteCommand — rewrite table (DESIGN §3.8)", () => {
  const rewrites: Array<[string, string]> = [
    ["git status", "ctx git status"],
    ["git diff", "ctx git diff"],
    ["git log", "ctx git log"],
    ["git branch", "ctx git branch"],
    ["git show HEAD", "ctx git show HEAD"],
    ["rg pattern src", "ctx rg pattern src"],
    ["grep -r pattern src", "ctx grep -r pattern src"],
    ["cat file.txt", "ctx cat file.txt"],
    ["ls src", "ctx ls src"],
    ["npm test", "ctx npm test"],
    ["pnpm test", "ctx pnpm test"],
    ["tsc --noEmit", "ctx tsc --noEmit"],
    ["eslint src", "ctx eslint src"],
  ];
  for (const [input, expected] of rewrites) {
    test(`${input} → ${expected}`, () => {
      // Inject isAvailable=() => true: this table tests the rewrite MAPPING, not tool
      // presence. The real isProgramAvailable returns false for tools absent on the CI
      // box (e.g. eslint on Windows), which would gate out the rewrite (D2) and fail the
      // mapping assertion. Presence-gating has its own dedicated tests.
      const r = rewriteCommand(input, undefined, () => true);
      expect(r.decision).toBe("rewrite");
      expect(r.rewritten).toBe(expected);
    });
  }

  test("only prepends ctx — nothing else changes (quoted args preserved)", () => {
    const r = rewriteCommand('cat "my file.txt"');
    expect(r.rewritten).toBe('ctx cat "my file.txt"');
  });

  test("L15: rewrite is a byte-faithful prepend even with \\ / escaped quotes the tokenizer does not parse", () => {
    // The tokenizer ignores backslash escapes; the rewrite must stay exactly
    // `ctx ` + the original segment (prepend-only), never a re-quoted/normalized form.
    // (Command substitution `$(…)` is now gated upstream by P3 — see its own block.)
    for (const c of ['grep "a\\b" src', "grep 'it'\\''s' ."]) {
      expect(rewriteCommand(c).rewritten).toBe(`ctx ${c}`);
    }
  });
});

describe("rewriteCommand — non-rewrite cases (pass)", () => {
  test("already a ctx command → pass (no nesting)", () => {
    expect(rewriteCommand("ctx git status").decision).toBe("pass");
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

describe("rewriteCommand — pass carries a reason (CTX_DEBUG: why not rewritten)", () => {
  test("empty command", () => {
    expect(rewriteCommand("").reason).toBe("empty command");
  });

  test("already a ctx command", () => {
    expect(rewriteCommand("ctx git status").reason).toBe("already a ctx command");
  });

  test("no handler names the program", () => {
    expect(rewriteCommand("some-unknown-tool --flag").reason).toBe(
      "no ctx handler for 'some-unknown-tool'",
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

describe("rewriteCommand — command substitution / expansion → pass (P3)", () => {
  test("command substitution $(…) → pass", () => {
    const r = rewriteCommand("git log $(git rev-parse HEAD)");
    expect(r.decision).toBe("pass");
    expect(r.reason).toBe("command substitution or arithmetic expansion");
  });

  test("backtick substitution → pass", () => {
    expect(rewriteCommand("git log `git rev-parse HEAD`").decision).toBe("pass");
  });

  test("arithmetic expansion $((…)) → pass", () => {
    expect(rewriteCommand("git log -n $((1 + 2))").decision).toBe("pass");
  });

  test("process substitution <(…) → pass", () => {
    expect(rewriteCommand("git diff <(git show A) <(git show B)").decision).toBe("pass");
  });

  test("single-quoted $(…) is literal → still rewrites (quote-aware)", () => {
    // The `$(…)` is inside single quotes, so the shell never expands it — the
    // gate must NOT trip, and `git log` still rewrites.
    const r = rewriteCommand("git log --grep '$(foo)'");
    expect(r.decision).toBe("rewrite");
    expect(r.rewritten).toBe("ctx git log --grep '$(foo)'");
  });
});

describe("rewriteCommand — line continuations (P4)", () => {
  test("backslash-newline collapses, then the command rewrites", () => {
    const r = rewriteCommand("git \\\n  log --oneline");
    expect(r.decision).toBe("rewrite");
    expect(r.rewritten).toBe("ctx git log --oneline");
  });

  test("CRLF continuation also collapses", () => {
    const r = rewriteCommand("git \\\r\n log");
    expect(r.decision).toBe("rewrite");
    expect(r.rewritten).toBe("ctx git log");
  });
});

describe("rewriteCommand — chains", () => {
  test("&& rewrites both eligible sides", () => {
    const r = rewriteCommand("git status && tsc --noEmit");
    expect(r.decision).toBe("rewrite");
    expect(r.rewritten).toBe("ctx git status && ctx tsc --noEmit");
  });

  test("; rewrites both eligible sides", () => {
    const r = rewriteCommand("git status ; git diff");
    expect(r.rewritten).toBe("ctx git status; ctx git diff");
  });

  test("|| rewrites both eligible sides", () => {
    const r = rewriteCommand("git status || git diff");
    expect(r.rewritten).toBe("ctx git status || ctx git diff");
  });

  test("pipe head is NOT rewritten — compressing the producer corrupts the tail (C1)", () => {
    // `ctx git log | head` would feed `head` the COMPACTED log, not the real one.
    // ADR 0007 follow-up #1: a segment whose stdout flows into `|` passes untouched.
    const r = rewriteCommand("git log | head");
    expect(r.decision).toBe("pass");
  });

  test("pipe RHS grep is left untouched", () => {
    const r = rewriteCommand("cat file.txt | grep TODO");
    expect(r.decision).toBe("pass");
  });

  test("C1: counting filter over a handled producer keeps the real count", () => {
    // `ctx git diff | grep -c '^+'` would count `+` lines in the compacted diff (0),
    // not the real diff. Neither segment may be rewritten.
    const r = rewriteCommand("git diff | grep -c '^+'");
    expect(r.decision).toBe("pass");
  });

  test("chain with an ineligible side rewrites only the eligible one", () => {
    const r = rewriteCommand("git commit -m x && git status");
    expect(r.rewritten).toBe("git commit -m x && ctx git status");
  });

  test("chain with no eligible side → pass", () => {
    expect(rewriteCommand("git commit -m x && git push").decision).toBe("pass");
  });

  test("operators inside quotes are not split", () => {
    const r = rewriteCommand('rg "a && b" src');
    expect(r.decision).toBe("rewrite");
    expect(r.rewritten).toBe('ctx rg "a && b" src');
  });
});

describe("rewriteCommand — presence gate (D2)", () => {
  // ctx wraps real tools; it must not rewrite a command whose binary is absent (on
  // a stock Windows box `cat`/`ls` are pwsh cmdlet aliases, not executables, so
  // `ctx cat` would shell out to a missing binary and break them). The PATH check
  // is injected here for a deterministic, cross-platform assertion.
  test("passes a command whose binary is absent (no rewrite)", () => {
    const r = rewriteCommand("cat file.txt", undefined, () => false);
    expect(r.decision).toBe("pass");
    expect(r.reason).toContain("no 'cat' binary on PATH");
  });

  test("rewrites the same command when the binary is present", () => {
    const r = rewriteCommand("cat file.txt", undefined, () => true);
    expect(r.decision).toBe("rewrite");
    expect(r.rewritten).toBe("ctx cat file.txt");
  });

  test("in a chain, absent-binary segments pass while present ones rewrite", () => {
    const r = rewriteCommand("git status && cat foo", undefined, (p) => p === "git");
    expect(r.decision).toBe("rewrite");
    expect(r.rewritten).toBe("ctx git status && cat foo");
  });
});
