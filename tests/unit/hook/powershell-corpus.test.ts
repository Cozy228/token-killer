// PowerShell rewrite corpus (issue #25).
//
// Goal: PROVE EQUIVALENCE, not raise the rewrite percentage. This file pins the
// CURRENT decision of `rewriteCommand` for every PowerShell-specific construct
// named in the issue so that conservative passthrough — the CORRECT outcome for
// ambiguous PS syntax — can never silently regress into an unsafe rewrite, and so
// that the provably-equivalent rewrites (`;` sequencing, quoted native args, plain
// `${var}` expansion, literal brace args) stay rewritten.
//
// Every case asserts `.decision` (and `.rewritten` where it rewrites). The PATH
// presence check is INJECTED on every call (never the real lookup) so the corpus
// is deterministic and platform-independent — it does not depend on what binaries
// happen to be installed on the box running the suite. On a stock Windows box,
// `ls`/`cat`/`wc`/`gc` are pwsh cmdlet ALIASES, not executables; the gate
// (`isAvailable`) is what keeps ctx from shelling out to a missing binary (D2,
// RTK Windows #1248: alias != executable).
//
// Parser status at the time of writing: ZERO changes were required. The existing
// guards (`hasNonEquivalentRedirect` scans for any unquoted `>`; `hasShellSubstitution`
// treats backtick + `$(` as active; quote-aware top-level split) already classify
// every PS construct correctly. This corpus is the deliverable; it documents the
// engine's behavior, it does not change it.

import { describe, expect, test } from "vitest";

import { rewriteCommand } from "../../../src/hook/rewrite.js";

// Pretend every program is a real on-PATH executable. Use this for cases that
// exercise PARSER behavior (redirects, substitution, sequencing, quoting) rather
// than the Windows presence gate — it isolates the construct under test from the
// alias/executable question.
const present = (): boolean => true;
// Pretend nothing is on PATH (every `ls`/`cat`/… is a pwsh alias, not a binary).
const absent = (): boolean => false;

describe("PowerShell corpus — `;` sequencing and pipelines", () => {
  test(";-separated read commands rewrite EVERY eligible segment", () => {
    // pwsh statement separator. Each segment is an independent command, so each
    // eligible one is wrapped — provably equivalent (no shared I/O context).
    const r = rewriteCommand("git status; git log", undefined, present);
    expect(r.decision).toBe("rewrite");
    expect(r.rewritten).toBe("ctx git status; ctx git log");
  });

  test("; rewrites the eligible side even when the other side is a no-handler program", () => {
    const r = rewriteCommand("git status; some-unknown-tool", undefined, present);
    expect(r.decision).toBe("rewrite");
    expect(r.rewritten).toBe("ctx git status; some-unknown-tool");
  });

  test("a pipeline PRODUCER passes — compressing it would corrupt the downstream stage (C1)", () => {
    // `git log | Select-String foo`: rewriting the producer hands Select-String the
    // compacted log, not the real bytes. The producer (and the `|` RHS) both pass.
    const r = rewriteCommand("git log | Select-String foo", undefined, present);
    expect(r.decision).toBe("pass");
    expect(r.reason).toBe("stdout feeds a downstream pipe stage");
  });

  test("the `|` RHS (a pipe consumer) is left untouched", () => {
    // ADR 0007: pipe tails are not worth compressing; the RHS always passes.
    const r = rewriteCommand("cat file.txt | Select-String TODO", undefined, present);
    expect(r.decision).toBe("pass");
  });
});

describe("PowerShell corpus — stream redirects must PASS (non-equivalent I/O)", () => {
  // `hasNonEquivalentRedirect` scans for ANY unquoted `>`, so every PS redirect
  // form below is caught: a redirect changes the I/O the wrapped program sees, so
  // the rewrite is not equivalent. Pin each form explicitly.
  const redirects: Array<[string, string]> = [
    ["merge stderr into stdout (bash + pwsh)", "git status 2>&1"],
    ["pwsh all-streams redirect to file", "git status *> out.txt"],
    ["pwsh all-streams merge into stdout", "git status *>&1"],
    ["stderr to file", "git log 2> err.txt"],
    ["explicit stdout to file", "git log 1> out.txt"],
    ["pwsh warning-stream (3>) to file", "git log 3> warn.txt"],
    ["append stdout", "git log >> out.txt"],
  ];
  for (const [label, cmd] of redirects) {
    test(`${label}: ${cmd} → pass`, () => {
      const r = rewriteCommand(cmd, undefined, present);
      expect(r.decision).toBe("pass");
      expect(r.reason).toContain("redirect");
    });
  }

  test("a redirect anywhere in a chain makes the WHOLE command pass", () => {
    // The guard is whole-command (not per-segment): any `>` → pass. Conservative
    // and correct — we never want to rewrite half of a redirecting pipeline.
    const r = rewriteCommand("git status 2>&1 && git log", undefined, present);
    expect(r.decision).toBe("pass");
  });
});

describe("PowerShell corpus — backtick (escape / line-continuation / substitution) → PASS", () => {
  // PowerShell uses backtick as the escape + line-continuation char; bash uses it
  // for command substitution. The engine cannot tell them apart statically and
  // treats ANY active backtick as substitution → pass. This is the documented,
  // intentional conservative behavior (issue #25: "keep conservative passthrough
  // on backtick"). It is correct for BOTH dialects: a bash backtick really is a
  // command sub, and a pwsh line-continuation means the command is incomplete on
  // this line, so passing it untouched is the only safe move.
  test("backtick line-continuation (command split across lines) → pass", () => {
    const r = rewriteCommand("git `\nlog", undefined, present);
    expect(r.decision).toBe("pass");
    expect(r.reason).toBe("command substitution or arithmetic expansion");
  });

  test("trailing backtick (pwsh continuation marker) → pass", () => {
    const r = rewriteCommand("git status `", undefined, present);
    expect(r.decision).toBe("pass");
  });

  test("backtick command substitution (bash sense) → pass", () => {
    const r = rewriteCommand("git log `git rev-parse HEAD`", undefined, present);
    expect(r.decision).toBe("pass");
  });

  test("a backtick INSIDE single quotes is literal — does not trip the gate", () => {
    // Single quotes suppress backtick in both shells, so `git log` still rewrites
    // and the literal backtick arg is preserved byte-for-byte.
    const r = rewriteCommand("git log --grep '`literal`'", undefined, present);
    expect(r.decision).toBe("rewrite");
    expect(r.rewritten).toBe("ctx git log --grep '`literal`'");
  });
});

describe("PowerShell corpus — $(...), ${...}, script block { ... }", () => {
  test("$(...) subexpression / command substitution → pass (runs a command at parse time)", () => {
    // pwsh `$(...)` is a subexpression and bash `$(...)` is command substitution;
    // both run code before the outer command, so the rewrite can't be proven
    // equivalent. Pass.
    const r = rewriteCommand("git log $(git rev-parse HEAD)", undefined, present);
    expect(r.decision).toBe("pass");
    expect(r.reason).toBe("command substitution or arithmetic expansion");
  });

  test("$((...)) arithmetic expansion → pass", () => {
    const r = rewriteCommand("git log -n $((1 + 2))", undefined, present);
    expect(r.decision).toBe("pass");
  });

  test("${var} plain variable expansion → REWRITE (provably equivalent)", () => {
    // `${HEAD}` is a plain variable reference in BOTH shells — it expands to a
    // value, it does not execute a command. Prepending `ctx` leaves the expansion
    // identical (`ctx` forwards the expanded value as a normal arg to git), so the
    // rewrite is equivalent. This is the same safety class as a quoted literal arg,
    // and distinct from `$(...)` which the gate (correctly) catches.
    const r = rewriteCommand("git log ${HEAD}", undefined, present);
    expect(r.decision).toBe("rewrite");
    expect(r.rewritten).toBe("ctx git log ${HEAD}");
  });

  test("${var} as a flag value → REWRITE, expansion preserved", () => {
    const r = rewriteCommand("git log --grep ${pat}", undefined, present);
    expect(r.decision).toBe("rewrite");
    expect(r.rewritten).toBe("ctx git log --grep ${pat}");
  });

  test("brace tokens after a native command → REWRITE (literal args, provably equivalent)", () => {
    // For a NATIVE command (git), `{ foo }` is NOT a script block — PowerShell
    // passes `{`, `foo`, `}` as literal string arguments. (A real script block only
    // matters as an argument to a cmdlet like ForEach-Object, and cmdlets have no
    // ctx handler, so those PASS via the no-handler branch — see the cmdlet case
    // below.) Prepending `ctx` forwards the same literal args, so this is equivalent;
    // the prepend is byte-faithful (braces and spacing preserved).
    const r = rewriteCommand("git log { foo }", undefined, present);
    expect(r.decision).toBe("rewrite");
    expect(r.rewritten).toBe("ctx git log { foo }");
  });

  test("a `;` INSIDE a brace block is NOT a top-level separator — ctx is never injected into the block (#25)", () => {
    // The regression issue #25 names: `splitTopLevel` used to track only quotes, so the
    // `;` inside the block was treated as a top-level statement separator and the engine
    // emitted `ctx git log { git status; ctx git log }` — injecting `ctx` mid-block and
    // mutating script-block content. With brace-depth tracking the block is ONE unit:
    // `ctx` is prepended exactly once at the front and the block's bytes (inner `;`
    // included) are byte-faithful.
    const r = rewriteCommand("git log { git status; git log }", undefined, present);
    expect(r.decision).toBe("rewrite");
    expect(r.rewritten).toBe("ctx git log { git status; git log }");
  });

  test("a `|` INSIDE a brace block is not a split point either", () => {
    // Without brace tracking the inner `|` split the command and the producer-passes
    // rule made the whole thing PASS. The block is a literal arg; prepend once.
    const r = rewriteCommand("git log { a | b }", undefined, present);
    expect(r.decision).toBe("rewrite");
    expect(r.rewritten).toBe("ctx git log { a | b }");
  });

  test("a real evaluated script block over a pipe: the inner `;` never wraps a mid-block command (#25)", () => {
    // `... | ForEach-Object { Write-Host $_; git status }`: the producer feeds a pipe
    // (passes) and ForEach-Object has no handler. The inner `;` must NOT split the
    // block and rewrite `git status` mid-block — that was the unsafe pre-fix outcome.
    const r = rewriteCommand(
      "git log --oneline | ForEach-Object { Write-Host $_; git status }",
      undefined,
      present,
    );
    expect(r.decision).toBe("pass");
  });

  test("a pwsh cmdlet that evaluates a script block has NO ctx handler → pass", () => {
    // The realistic script-block-as-evaluated-block case: `Get-ChildItem | ForEach-Object {…}`.
    // ForEach-Object isn't a ctx handler target, and it's the `|` RHS regardless, so
    // the command passes. Pin it so the brace-arg rewrite above is never confused
    // with rewriting a genuine script block.
    const r = rewriteCommand("Get-ChildItem | ForEach-Object { $_.Name }", undefined, present);
    expect(r.decision).toBe("pass");
  });
});

describe("PowerShell corpus — quoted native arguments (rewrite, quotes preserved)", () => {
  test("double-quoted arg with a space → rewrite, quotes byte-preserved", () => {
    const r = rewriteCommand('git log --grep "foo bar"', undefined, present);
    expect(r.decision).toBe("rewrite");
    expect(r.rewritten).toBe('ctx git log --grep "foo bar"');
  });

  test("a chain operator INSIDE a quoted arg is not a split point", () => {
    const r = rewriteCommand('git log --grep "a; b"', undefined, present);
    expect(r.decision).toBe("rewrite");
    expect(r.rewritten).toBe('ctx git log --grep "a; b"');
  });

  test("a pipe INSIDE a quoted arg is not a split point", () => {
    const r = rewriteCommand('git log --grep "a | b"', undefined, present);
    expect(r.decision).toBe("rewrite");
    expect(r.rewritten).toBe('ctx git log --grep "a | b"');
  });

  test("single-quoted arg with spaces → rewrite, quotes preserved", () => {
    const r = rewriteCommand("rg 'foo bar' src", undefined, present);
    expect(r.decision).toBe("rewrite");
    expect(r.rewritten).toBe("ctx rg 'foo bar' src");
  });
});

describe("PowerShell corpus — cmd /c and pwsh -Command nesting", () => {
  // The OUTER program (`cmd`, `pwsh`, `powershell`) has no ctx handler, so the WHOLE
  // command passes via the no-handler branch — and crucially the INNER quoted
  // command is just a quoted argument, never separately rewritten. This holds even
  // when the outer program IS present on PATH (it's the no-handler gate, not the
  // presence gate, that decides here): ctx has nothing to compress from a shell
  // launcher, and must not reach inside the quoted string.
  test('cmd /c "git status" → pass (outer no-handler; inner not rewritten)', () => {
    const r = rewriteCommand('cmd /c "git status"', undefined, present);
    expect(r.decision).toBe("pass");
    expect(r.reason).toBe("no ctx handler for 'cmd'");
    expect(r.rewritten).toBeUndefined();
  });

  test('pwsh -Command "git status" → pass (outer no-handler; inner not rewritten)', () => {
    const r = rewriteCommand('pwsh -Command "git status"', undefined, present);
    expect(r.decision).toBe("pass");
    expect(r.reason).toBe("no ctx handler for 'pwsh'");
    expect(r.rewritten).toBeUndefined();
  });

  test('powershell -Command "git log" → pass (outer no-handler)', () => {
    const r = rewriteCommand('powershell -Command "git log"', undefined, present);
    expect(r.decision).toBe("pass");
    expect(r.reason).toBe("no ctx handler for 'powershell'");
  });

  test("the inner command is never reached even if it would otherwise be eligible", () => {
    // Sanity: `git status` alone IS eligible, but wrapped as a quoted arg to `cmd`
    // it must NOT leak a `ctx` into the inner string.
    const r = rewriteCommand('cmd /c "git status && git log"', undefined, present);
    expect(r.decision).toBe("pass");
    expect(r.rewritten).toBeUndefined();
  });
});

describe("PowerShell corpus — alias vs real executable (Windows presence gate, D2)", () => {
  // The defining Windows case (RTK #1248): on a stock pwsh box `ls`/`cat`/`wc`/`gc`
  // resolve to cmdlet aliases, NOT to executables on PATH. ctx wraps real tools, so
  // it must rewrite ONLY when the binary actually exists — otherwise `ctx cat foo`
  // would shell out to a missing `cat.exe` and break a command pwsh would have run
  // via its alias. The gate is `isAvailable`; assert both polarities.

  const aliases = ["ls", "cat", "wc"];
  for (const alias of aliases) {
    test(`${alias}: alias-only (no binary on PATH) → pass`, () => {
      const r = rewriteCommand(`${alias} foo`, undefined, absent);
      expect(r.decision).toBe("pass");
      expect(r.reason).toBe(`no '${alias}' binary on PATH`);
    });

    test(`${alias}: real executable present → eligible (rewrite)`, () => {
      const r = rewriteCommand(`${alias} foo`, undefined, present);
      expect(r.decision).toBe("rewrite");
      expect(r.rewritten).toBe(`ctx ${alias} foo`);
    });
  }

  test("gc (Get-Content alias) has no ctx handler — passes regardless of PATH", () => {
    // `gc` is a pwsh alias for Get-Content. It is NOT one of ctx's read programs
    // (cat/type/less/read), so it fails at the no-handler gate BEFORE the presence
    // check ever runs — it passes whether or not a `gc` binary exists.
    expect(rewriteCommand("gc file.txt", undefined, present).reason).toBe(
      "no ctx handler for 'gc'",
    );
    expect(rewriteCommand("gc file.txt", undefined, absent).reason).toBe("no ctx handler for 'gc'");
  });

  test("mixed chain: present binary rewrites, alias-only segment passes", () => {
    // The realistic Windows chain: git is a real exe, cat is an alias. Only the
    // real-binary segment is wrapped; the alias segment is left for pwsh to run.
    const r = rewriteCommand("git status; cat foo", undefined, (p) => p === "git");
    expect(r.decision).toBe("rewrite");
    expect(r.rewritten).toBe("ctx git status; cat foo");
  });
});
