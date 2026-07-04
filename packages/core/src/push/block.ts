/**
 * Push block builder (CTX-IMPL §7).
 *
 * Renders the sentinel-wrapped managed block that ctx writes into a host's
 * always-loaded instruction file (root `AGENTS.md` / `CLAUDE.md`). Shape:
 *
 *   <!-- ctx:managed:begin -->
 *   This project has a ctx context base (code, decisions, history, memory — with provenance).
 *   Start tasks with the `context` MCP tool; drill down by passing back any [handle].
 *   Gotchas:
 *   ⚠ <gist> [handle]
 *   ...
 *   <!-- ctx:managed:end -->
 *
 * The first two body lines are the FIXED HEADER (context-base pitch + drill-down
 * instruction); the gotcha lines are the top auto-ranked memory gists. The
 * TOTAL block (sentinels + header + gotchas) is hard-capped at 1KB: the builder
 * greedily fills gotcha lines and stops before the byte budget would be
 * exceeded, so A9-budget holds BY CONSTRUCTION for any memory set.
 */
import { SENTINEL_BEGIN, SENTINEL_END } from "../memory/sentinel.ts";
import type { Store } from "../store/store.ts";
import { emptyPushConfig, type PushConfig } from "./config.ts";
import { rankGotchas, type GotchaCandidate } from "./rank.ts";

/** Full block byte ceiling — sentinels + header + gotchas (§7 "≤1KB"). */
export const PUSH_MAX_BYTES = 1024;

/** Readability cap on gotcha lines before the byte budget trims further. */
export const PUSH_MAX_GOTCHAS = 6;

export const BLOCK_BEGIN = `<!-- ${SENTINEL_BEGIN} -->`;
export const BLOCK_END = `<!-- ${SENTINEL_END} -->`;

/** The two fixed header lines (context-base pitch + drill-down instruction). */
export const HEADER_LINES: readonly [string, string] = [
  "This project has a ctx context base (code, decisions, history, memory — with provenance).",
  "Start tasks with the `context` MCP tool; drill down by passing back any [handle].",
];

const GOTCHAS_LABEL = "Gotchas:";

export interface PushBlock {
  /** The full sentinel-wrapped block text (no trailing newline). */
  text: string;
  /** UTF-8 byte length of `text` (always ≤ PUSH_MAX_BYTES). */
  bytes: number;
  /** Gotchas actually rendered (post budget/pin/veto). */
  rendered: GotchaCandidate[];
  /** Handles rendered in the block (resolvable via `ctx recall`). */
  handles: string[];
  /** True when ranked gotchas were dropped to fit the byte budget. */
  truncated: boolean;
}

export interface BuildBlockOptions {
  config?: PushConfig;
  now?: number;
  /** Max gotcha lines before the byte budget (default PUSH_MAX_GOTCHAS). */
  maxGotchas?: number;
}

function gotchaLine(g: GotchaCandidate): string {
  return `⚠ ${g.gist} [${g.handle}]`;
}

function assemble(header: readonly string[], bodyLines: readonly string[]): string {
  const parts = [BLOCK_BEGIN, ...header];
  if (bodyLines.length > 0) {
    parts.push(GOTCHAS_LABEL, ...bodyLines);
  }
  parts.push(BLOCK_END);
  return parts.join("\n");
}

function byteLen(s: string): number {
  return Buffer.byteLength(s, "utf8");
}

/**
 * Build the push block from a ranked gotcha list. Pure over its inputs (no
 * store access) so it is trivially testable and deterministic; `buildPushBlock`
 * is the store-backed convenience wrapper.
 */
export function renderPushBlock(
  gotchas: readonly GotchaCandidate[],
  maxGotchas = PUSH_MAX_GOTCHAS,
): PushBlock {
  const capped = gotchas.slice(0, Math.max(0, maxGotchas));
  const bodyLines: string[] = [];
  const rendered: GotchaCandidate[] = [];
  let truncated = false;

  for (const g of capped) {
    const trial = assemble(HEADER_LINES, [...bodyLines, gotchaLine(g)]);
    if (byteLen(trial) > PUSH_MAX_BYTES) {
      truncated = true;
      break; // budget wins — remaining ranked gotchas are dropped
    }
    bodyLines.push(gotchaLine(g));
    rendered.push(g);
  }
  if (rendered.length < gotchas.length) truncated = true;

  const text = assemble(HEADER_LINES, bodyLines);
  return {
    text,
    bytes: byteLen(text),
    rendered,
    handles: rendered.map((g) => g.handle),
    truncated,
  };
}

/** Store-backed builder: rank active memory gists (with pin/veto) and render. */
export function buildPushBlock(store: Store, opts: BuildBlockOptions = {}): PushBlock {
  const config = opts.config ?? emptyPushConfig();
  const now = opts.now ?? Date.now();
  const gotchas = rankGotchas(store, config, now);
  return renderPushBlock(gotchas, opts.maxGotchas ?? PUSH_MAX_GOTCHAS);
}
