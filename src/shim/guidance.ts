import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

import type { Host } from "./detect.js";
import { applyInjectionBlock, removeInjectionBlock } from "./injection.js";

// Usage guidance ctx drops at `ctx install` so the agent SPENDS FEWER TOKENS — not
// just the transparent `ctx <cmd>` rewrite the hook/shim already does, but the
// agent-actionable habits the research (docs/reports/token-optimization-best-practices)
// found move the needle most: prefer a tool's native terse form, and read/search with
// the agent's own bounded tools instead of shelling out (orientation is where most
// tokens leak). This file is the INPUT-side lever (tokens the agent reads); the
// output-side lever (writing less code, billed ~4×) lives in the separate PONYTAIL.md
// so the two can be kept or dropped independently and don't repeat each other. CTX.md
// always ships; PONYTAIL.md is OPT-IN (`ctx install --ponytail`) — see below.
// This file is AGENT-facing — every line is a habit the model can act on. Human-only
// surfaces (the `ctx gain`/`ctx inspect` analytics) are NOT here; they belong on the
// CLI, not in always-on resident context. Written as a dedicated, ctx-owned `CTX.md`
// so it never tangles with the user's own CLAUDE.md content.

const GUIDANCE_FILENAME = "CTX.md";

// A second standalone file: the "lazy senior dev" coding doctrine. ctx's token
// lever is two-sided — CTX.md cuts the tokens the agent READS (tool output);
// PONYTAIL.md cuts the tokens the agent WRITES (over-built code, billed ~4×).
// Verbatim from ponytail (github.com/DietrichGebert/ponytail, MIT). Kept as its
// own file so a user can delete one lever without losing the other.
//
// OPT-IN, not default: the coding doctrine is an opinionated behavior change
// (YAGNI/deletion-over-addition/`ponytail:` comments), heavier than the neutral
// terse-form habits in CTX.md. So `ctx install` ships CTX.md alone; PONYTAIL.md is
// written + imported ONLY with `ctx install --ponytail`. Toggle off (a plain re-install)
// removes any PONYTAIL.md a prior --ponytail install left, so on-disk state and the
// loader's @imports never drift apart. The flag flows in as GuidanceOptions.ponytail.
export type GuidanceOptions = { ponytail?: boolean };
const LAZY_FILENAME = "PONYTAIL.md";
const VSCODE_LAZY_FILENAME = "contexa-lazy.instructions.md";

// VS Code Copilot auto-loads a user-level `.instructions.md` from the user
// profile (`~/.copilot/instructions`) across all workspaces (verified against the
// VS Code custom-instructions docs, ADR 0008). Unlike claude-code (which pulls
// CTX.md in via an `@import` VS Code does NOT expand) the file IS the loaded
// instruction, so ctx writes the full guide inlined, under an `applyTo: '**'`
// always-on frontmatter.
const VSCODE_GUIDANCE_FILENAME = "contexa.instructions.md";

// Self-contained guidance doc. The whole file is ctx's — overwritten on re-init,
// deleted on uninstall — so it needs no inline markers.
export function guidanceDoc(): string {
  return `${[
    "# Contexa — usage guide",
    "",
    "_`ctx` runs the real tool and compresses its output (60–90% on common dev commands,",
    "transparently). Routing more through ctx = fewer tokens read._",
    "",
    "## Route output-heavy commands through ctx",
    "",
    "| Instead of | Run | Note |",
    "|---|---|---|",
    "| `cat <file>` | `ctx read --max-lines 200 <file>` | `--level aggressive` = symbol outline |",
    "| `grep`/`rg <pattern>` | `ctx rg <pattern> <path>` | auto-caps; `--level minimal` lossless, `--raw` verbatim |",
    "| `ls -R` / `tree` | `ctx tree <path>` | auto-caps; `-L <n>` shallower |",
    "| any high-output cmd | `ctx <cmd>` | build/test/log/`docker`/`kubectl`/`gh` … |",
    "",
    "## Prefer native terse forms (ctx passes these through unchanged)",
    "",
    "| Instead of | Use | Gives |",
    "|---|---|---|",
    "| `git status` | `git status --short` | drops hints + headers |",
    "| `git log` | `git log --oneline -<n>` | one line/commit |",
    "| `git diff` | `git diff --stat` | file/line counts (full only to read hunks) |",
    "| `git show` | `git show --stat` | summary (full only to read changes) |",
    "| `grep`/`rg` full lines | `-c` / `-l` / `-o` | counts / filenames / matches only |",
    "",
    "Don't re-read a file or repeat a search whose result is already in context.",
  ].join("\n")}\n`;
}

// The "lazy senior dev" coding doctrine, verbatim from ponytail (MIT). Cuts the
// agent's own output tokens (over-built code) — the other half of ctx's lever.
export function ponytailDoc(): string {
  return `${[
    "<!-- Lazy senior dev mode — verbatim from ponytail (github.com/DietrichGebert/ponytail), MIT. -->",
    "",
    "# Ponytail, lazy senior dev mode",
    "",
    "You are a lazy senior developer. Lazy means efficient, not careless. The best code is the code never written.",
    "",
    "Before writing any code, stop at the first rung that holds:",
    "",
    "1. Does this need to be built at all? (YAGNI)",
    "2. Does the standard library already do this? Use it.",
    "3. Does a native platform feature cover it? Use it.",
    "4. Does an already-installed dependency solve it? Use it.",
    "5. Can this be one line? Make it one line.",
    "6. Only then: write the minimum code that works.",
    "",
    "Rules:",
    "",
    "- No abstractions that weren't explicitly requested.",
    "- No new dependency if it can be avoided.",
    "- No boilerplate nobody asked for.",
    "- Deletion over addition. Boring over clever. Fewest files possible.",
    '- Question complex requests: "Do you actually need X, or does Y cover it?"',
    "- Pick the edge-case-correct option when two stdlib approaches are the same size, lazy means less code, not the flimsier algorithm.",
    "- Mark intentional simplifications with a `ponytail:` comment. If the shortcut has a known ceiling (global lock, O(n²) scan, naive heuristic), the comment names the ceiling and the upgrade path.",
    "",
    "Not lazy about: input validation at trust boundaries, error handling that prevents data loss, security, accessibility, the calibration real hardware needs (the platform is never the spec ideal, a clock drifts, a sensor reads off), anything explicitly requested. Lazy code without its check is unfinished: non-trivial logic leaves ONE runnable check behind, the smallest thing that fails if the logic breaks (an assert-based demo/self-check or one small test file; no frameworks, no fixtures). Trivial one-liners need no test.",
  ].join("\n")}\n`;
}

// Dedicated guidance file per host — written ONLY for hosts that actually read a
// standalone file: claude-code pulls ~/.claude/CTX.md in via `@import`; vscode's
// `.instructions.md` IS the auto-loaded file. copilot-cli has NO standalone file
// (I4): it has no import syntax, so the guidance is inlined into its loader
// (copilot-instructions.md, see guidanceLoader) and a separate ~/.copilot/CTX.md was
// dead weight the host never loaded. Other hosts have no stable home for it.
export function guidanceFilePath(host: Host, home = homedir()): string | undefined {
  if (host === "claude-code") return join(home, ".claude", GUIDANCE_FILENAME);
  if (host === "vscode") return join(home, ".copilot", "instructions", VSCODE_GUIDANCE_FILENAME);
  return undefined;
}

// The exact bytes written to a host's standalone guidance file. claude-code gets
// the bare doc (it pulls it in via `@import`). vscode's file is the auto-loaded
// instruction itself, so it carries the `applyTo: '**'` always-on frontmatter the
// `.instructions.md` format requires and inlines the full doc (no `@import`
// indirection — VS Code does not resolve it). copilot-cli has no standalone file
// (its guidance is inlined into the loader, see guidanceLoader), so this is never
// called for it.
export function guidanceFileContent(host: Host): string {
  if (host === "vscode") return `---\napplyTo: '**'\n---\n\n${guidanceDoc()}`;
  return guidanceDoc();
}

// Same standalone-file rule as CTX.md, for the PONYTAIL.md doctrine file:
// claude-code reads it via `@import`, vscode auto-loads the `.instructions.md`,
// copilot-cli has no import syntax so it is inlined into the loader instead.
export function lazyFilePath(host: Host, home = homedir()): string | undefined {
  if (host === "claude-code") return join(home, ".claude", LAZY_FILENAME);
  if (host === "vscode") return join(home, ".copilot", "instructions", VSCODE_LAZY_FILENAME);
  return undefined;
}

export function lazyFileContent(host: Host): string {
  if (host === "vscode") return `---\napplyTo: '**'\n---\n\n${ponytailDoc()}`;
  return ponytailDoc();
}

// The auto-loaded instructions file that must reference the guidance so the agent
// actually reads it, plus the body to inject under ctx's guarded markers:
//   - claude-code reads ~/.claude/CLAUDE.md and supports `@file` imports → a one
//     line `@CTX.md` pulls the dedicated file in.
//   - copilot-cli reads ~/.copilot/copilot-instructions.md but has NO import
//     syntax → inline the full guidance so it is actually loaded.
export function guidanceLoader(
  host: Host,
  home = homedir(),
  opts: GuidanceOptions = {},
): { path: string; body: string } | undefined {
  if (host === "claude-code") {
    const imports = opts.ponytail
      ? [`@${GUIDANCE_FILENAME}`, `@${LAZY_FILENAME}`]
      : [`@${GUIDANCE_FILENAME}`];
    return {
      path: join(home, ".claude", "CLAUDE.md"),
      body: ["## Contexa", "", ...imports].join("\n"),
    };
  }
  if (host === "copilot-cli") {
    // No import syntax → inline. Append the doctrine only when opted in.
    const parts = opts.ponytail
      ? [guidanceDoc().trimEnd(), "", ponytailDoc().trimEnd()]
      : [guidanceDoc().trimEnd()];
    return {
      path: join(home, ".copilot", "copilot-instructions.md"),
      body: parts.join("\n"),
    };
  }
  return undefined;
}

// Write the dedicated guidance file (whole file is ours) and wire the loader line
// into the host's auto-loaded instructions (marker-guarded, idempotent). Returns
// the paths touched so the caller can report them.
export function writeGuidance(
  host: Host,
  home = homedir(),
  opts: GuidanceOptions = {},
): { guidance?: string; ponytail?: string; loader?: string } {
  const result: { guidance?: string; ponytail?: string; loader?: string } = {};

  const guidancePath = guidanceFilePath(host, home);
  if (guidancePath) {
    mkdirSync(dirname(guidancePath), { recursive: true });
    writeFileSync(guidancePath, guidanceFileContent(host));
    result.guidance = guidancePath;
  }

  // PONYTAIL.md is opt-in (--ponytail). When NOT opted in, actively remove any file a
  // prior --ponytail install wrote so on-disk state matches the loader's @imports
  // (which guidanceLoader is dropping this run). The whole file is ctx-owned.
  const lazyPath = lazyFilePath(host, home);
  if (lazyPath) {
    if (opts.ponytail) {
      mkdirSync(dirname(lazyPath), { recursive: true });
      writeFileSync(lazyPath, lazyFileContent(host));
      result.ponytail = lazyPath;
    } else if (existsSync(lazyPath)) {
      rmSync(lazyPath, { force: true });
    }
  }

  const loader = guidanceLoader(host, home, opts);
  if (loader) {
    mkdirSync(dirname(loader.path), { recursive: true });
    const existing = existsSync(loader.path) ? readFileSync(loader.path, "utf8") : "";
    writeFileSync(loader.path, applyInjectionBlock(existing, loader.body));
    result.loader = loader.path;
  }

  return result;
}

// Reverse of writeGuidance: delete the dedicated file, strip the loader block.
export function unwriteGuidance(host: Host, home = homedir()): void {
  const guidancePath = guidanceFilePath(host, home);
  if (guidancePath && existsSync(guidancePath)) rmSync(guidancePath, { force: true });

  const lazyPath = lazyFilePath(host, home);
  if (lazyPath && existsSync(lazyPath)) rmSync(lazyPath, { force: true });

  const loader = guidanceLoader(host, home);
  if (loader && existsSync(loader.path)) {
    writeFileSync(loader.path, removeInjectionBlock(readFileSync(loader.path, "utf8")));
  }
}
