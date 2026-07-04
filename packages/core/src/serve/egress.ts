/**
 * `assertNoEgress()` — D22 / M-cross-cutting M14 (restated in CTX-IMPL §7).
 *
 * ctx spends ZERO model tokens: serving is fully deterministic (selection +
 * read-through), and any future LLM artifact runs via host re-prompt or the
 * user's subscription CLI — never a tool-embedded API key. This guard proves the
 * stance by REFUSING to run when an egress-capable model key is present in the
 * environment: it is wired at every serve + ingest entry point (CTX-IMPL §7 /
 * assignment 1g). We do not read the key to use it — we refuse to coexist with
 * it, so the "zero tool-embedded egress" claim is mechanically checkable.
 *
 * This is NOT a recoverable serving condition (§7 error taxonomy): a present key
 * is an environment/config invariant violation, closer to store corruption than
 * to "ref not found". It throws; the MCP shim surfaces it as an `isError`, and
 * `ctx mcp` refuses to start.
 */

/** Egress-capable model API-key env vars ctx refuses to coexist with (M14). */
export const EGRESS_ENV_KEYS = ["ANTHROPIC_API_KEY", "OPENAI_API_KEY"] as const;

/** HARD GUARD: never read a model API key, never open a model network socket. */
export function assertNoEgress(env: NodeJS.ProcessEnv = process.env): void {
  for (const key of EGRESS_ENV_KEYS) {
    const value = env[key];
    if (value !== undefined && value !== "") {
      // We do not USE it — we refuse to, to prove zero tool-embedded egress.
      throw new Error(
        `refusing to run with ${key} set: ctx spends zero model tokens. ` +
          "Context serving is fully deterministic (selection + read-through); any narrative " +
          "generation runs via your host agent or subscription CLI, never a tool-embedded key. " +
          `Unset ${key} for this process to use ctx.`,
      );
    }
  }
}
