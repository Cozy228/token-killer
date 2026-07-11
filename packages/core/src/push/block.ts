/**
 * Push block builder (CONTEXA-IMPL §7; DR-32 use-blocking refit).
 *
 * Renders the sentinel-wrapped managed block that ctx writes into a host's
 * always-loaded instruction file (root `AGENTS.md` / `CLAUDE.md`). Shape of the
 * PLACED block (what lands in a committed host file):
 *
 *   <!-- ctx:managed:begin -->
 *   This project has a ctx context base (code, decisions, history, memory).
 *   Start tasks with the `context` MCP tool; drill down by passing back any [handle].
 *   (N memory note(s) omitted here — an always-loaded file carries no uncited claims;
 *    query the `context` MCP tool for cited, provenance-backed claims.)
 *   <!-- ctx:managed:end -->
 *
 * DR-32 (art. 3 citation-or-silence): the always-loaded placed block must NOT
 * render uncited factual gotchas (`⚠ gist [handle]` is a bare claim — no evidence
 * anchor, observed time, derivation, confidence, status, freshness, or disclosure),
 * and its header must not CLAIM "with provenance". So the placed block OMITS the
 * factual gotcha lines (the tool instruction stays) and carries an explicit
 * omission disclosure. Ranking still runs (`rankGotchas` → `wouldRender`), so
 * pins/vetoes still govern WHICH notes would return once each carries the full
 * minimum claim envelope. If factual gotchas ever return here, each must carry the
 * FULL envelope + an omission disclosure (DR-07/DR-32).
 *
 * The `ctx push --local` DISPLAY view (writes NO host file — terminal only, slice 5
 * three-tier (c)) may still SHOW the ranked gotchas locally; it opts in with
 * `includeGotchas: true`. There the TOTAL block is byte-capped at 1KB and the
 * greedy fill / readability cap still apply.
 */
import { SENTINEL_BEGIN, SENTINEL_END } from "../memory/sentinel.ts";
import type { Store } from "../store/store.ts";
import { emptyPushConfig, type PushConfig } from "./config.ts";
import { rankGotchas, type GotchaCandidate } from "./rank.ts";

/** Full block byte ceiling — sentinels + header + body (§7 "≤1KB"). */
export const PUSH_MAX_BYTES = 1024;

/** Readability cap on gotcha lines before the byte budget trims further. */
export const PUSH_MAX_GOTCHAS = 6;

export const BLOCK_BEGIN = `<!-- ${SENTINEL_BEGIN} -->`;
export const BLOCK_END = `<!-- ${SENTINEL_END} -->`;

/**
 * The two fixed header lines. DR-32: line 1 is a NON-CLAIMING description (the old
 * "— with provenance" claim is dropped — a bare gist carries none); line 2 is the
 * tool instruction (may stay).
 */
export const HEADER_LINES: readonly [string, string] = [
  "This project has a ctx context base (code, decisions, history, memory).",
  "Start tasks with the `context` MCP tool; drill down by passing back any [handle].",
];

const GOTCHAS_LABEL = "Gotchas:";

/** DR-32 explicit omission disclosure for the placed block. */
function omissionLine(n: number): string {
  return (
    `(${n} memory note${n === 1 ? "" : "s"} omitted here — an always-loaded file carries no ` +
    "uncited claims; query the `context` MCP tool for cited, provenance-backed claims.)"
  );
}

export interface PushBlock {
  /** The full sentinel-wrapped block text (no trailing newline). */
  text: string;
  /** UTF-8 byte length of `text` (always ≤ PUSH_MAX_BYTES). */
  bytes: number;
  /** Gotcha lines actually RENDERED into `text`. Empty for the placed/shared block
   *  (DR-32 — no uncited factual claims in an always-loaded file); populated only
   *  for the `ctx push --local` display view. */
  rendered: GotchaCandidate[];
  /** DR-32: the ranked candidates pins/vetoes WOULD surface — governs which notes
   *  return once each carries a full claim envelope. Independent of placement. */
  wouldRender: GotchaCandidate[];
  /** Handles rendered in `text` (resolvable via `ctx recall`). Empty when placed. */
  handles: string[];
  /** True when ranked gotchas were dropped to fit the byte budget (local view). */
  truncated: boolean;
  /** DR-32: count of factual gotchas omitted from the placed block. */
  omittedGotchas: number;
}

export interface RenderBlockOptions {
  /** Max gotcha lines before the byte budget (default PUSH_MAX_GOTCHAS). */
  maxGotchas?: number;
  /**
   * DR-32: render the factual gotcha lines. Default FALSE — the placed/shared block
   * omits them (an always-loaded host file must not carry uncited claims). Only the
   * `ctx push --local` display view (writes no host file) sets true.
   */
  includeGotchas?: boolean;
}

export interface BuildBlockOptions extends RenderBlockOptions {
  config?: PushConfig;
  now?: number;
}

function gotchaLine(g: GotchaCandidate): string {
  return `⚠ ${g.gist} [${g.handle}]`;
}

/** Join the sentinel-wrapped block: begin, header, arbitrary body lines, end. */
function assemble(header: readonly string[], bodyLines: readonly string[]): string {
  return [BLOCK_BEGIN, ...header, ...bodyLines, BLOCK_END].join("\n");
}

function byteLen(s: string): number {
  return Buffer.byteLength(s, "utf8");
}

/**
 * Build the push block from a ranked gotcha list. Pure over its inputs (no store
 * access), so it is trivially testable and deterministic; `buildPushBlock` is the
 * store-backed wrapper. Default = the PLACED block (gotchas omitted, DR-32).
 */
export function renderPushBlock(
  gotchas: readonly GotchaCandidate[],
  opts: RenderBlockOptions = {},
): PushBlock {
  const maxGotchas = opts.maxGotchas ?? PUSH_MAX_GOTCHAS;
  const includeGotchas = opts.includeGotchas ?? false;
  const capped = gotchas.slice(0, Math.max(0, maxGotchas));

  if (!includeGotchas) {
    // DR-32 placed/shared block: OMIT factual gotchas; de-claimed header + an
    // explicit omission disclosure. Ranking (`capped`) is still surfaced via
    // `wouldRender` so pins/vetoes remain observable — no gotcha line is placed.
    const body = capped.length > 0 ? [omissionLine(capped.length)] : [];
    const text = assemble(HEADER_LINES, body);
    return {
      text,
      bytes: byteLen(text),
      rendered: [],
      wouldRender: [...capped],
      handles: [],
      truncated: false,
      omittedGotchas: capped.length,
    };
  }

  // `ctx push --local` display view (no host file): render gotcha lines under the
  // 1KB byte budget; the greedy fill + readability cap still apply.
  const bodyLines: string[] = [];
  const rendered: GotchaCandidate[] = [];
  let truncated = false;
  for (const g of capped) {
    const trial = assemble(HEADER_LINES, [GOTCHAS_LABEL, ...bodyLines, gotchaLine(g)]);
    if (byteLen(trial) > PUSH_MAX_BYTES) {
      truncated = true;
      break; // budget wins — remaining ranked gotchas are dropped
    }
    bodyLines.push(gotchaLine(g));
    rendered.push(g);
  }
  if (rendered.length < gotchas.length) truncated = true;

  const body = bodyLines.length > 0 ? [GOTCHAS_LABEL, ...bodyLines] : [];
  const text = assemble(HEADER_LINES, body);
  return {
    text,
    bytes: byteLen(text),
    rendered,
    wouldRender: [...capped],
    handles: rendered.map((g) => g.handle),
    truncated,
    omittedGotchas: 0,
  };
}

/** Store-backed builder: rank active memory gists (with pin/veto) and render.
 *  Default = the PLACED block (gotchas omitted, DR-32); the `--local` display view
 *  passes `includeGotchas: true`. */
export function buildPushBlock(store: Store, opts: BuildBlockOptions = {}): PushBlock {
  const config = opts.config ?? emptyPushConfig();
  const now = opts.now ?? Date.now();
  const gotchas = rankGotchas(store, config, now);
  return renderPushBlock(gotchas, {
    maxGotchas: opts.maxGotchas ?? PUSH_MAX_GOTCHAS,
    includeGotchas: opts.includeGotchas ?? false,
  });
}
