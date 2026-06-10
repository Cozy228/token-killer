import { handlers } from "../handlers/index.js";

// Interpreters and shells that must NEVER be wrapped (review finding F1). The
// recursion guard in executor.ts strips TK_SHIM_DIR for tools tk *spawns*, but
// it cannot protect tk's own interpreter: if `node` were shimmed, a `tk <tool>`
// invocation could resolve its interpreter through the shim and recurse before
// any guard runs. The wrapper bypasses this by calling node via an absolute path
// (see install.ts defaultTkExec), but this deny-set is the explicit, code-level
// guarantee so a future `programs: ["node"]` declaration can never wire a
// fork-bomb. Today no handler declares any of these — it is pure insurance.
const NEVER_WRAP = new Set([
  "node",
  "deno",
  "bun",
  "ts-node",
  "tsx",
  "python",
  "python3",
  "ruby",
  "perl",
  "sh",
  "bash",
  "zsh",
  "fish",
  "dash",
  "pwsh",
  "powershell",
  "tk",
]);

// The shim's wrapper set: every real external executable any handler fronts,
// deduped, minus the interpreter/shell deny-set. Derived from the handlers'
// `programs` declarations — there is no parallel hardcoded include list.
// tk-native verbs (read, smart, summary, err, test, deps, json, log, pipe)
// declare no programs and so are never wrapped.
export function shimmablePrograms(): string[] {
  const seen = new Set<string>();
  for (const handler of handlers) {
    for (const program of handler.programs ?? []) {
      if (!NEVER_WRAP.has(program)) seen.add(program);
    }
  }
  return [...seen].sort();
}

// True when `program` is a known dev tool tk fronts (a wrapper exists for it).
// The passthrough-hardening guard (U2) uses this to decide whether a DIRECT
// `tk <x>` (no TK_SHIM_DIR) is allowed to run a real tool that has no specific
// handler but is still a tool tk knows — e.g. `git --version`, a shimmable tool
// invoked in a probe form. An unknown word must never be auto-spawned on PATH.
export function isShimmableProgram(program: string): boolean {
  return shimmablePrograms().includes(program);
}
