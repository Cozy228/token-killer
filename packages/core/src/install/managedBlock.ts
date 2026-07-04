/**
 * Managed-block mechanics for push placement files (CTX-IMPL §7 / §11 rollback).
 *
 * `ctx install` places the push digest into host instruction files (root
 * `AGENTS.md` floor + `CLAUDE.md`, P28) as a sentinel-wrapped managed block.
 * Everything install writes is ADDITIVE — user content is never clobbered — and
 * every block is removable byte-exact by `ctx doctor --remove-push` (§11:
 * push blocks are sentinel-wrapped → reversible).
 *
 * The sentinel is the SAME `ctx:managed:begin` / `ctx:managed:end` pair the
 * memory echo-exclusion (memory/sentinel.ts) already recognises — so a managed
 * push block re-imported from a host file is stripped, never echoed back (A1-echo).
 *
 * Invariant (proven by tests): for any base content that is empty or ends in a
 * single "\n" (the shape of real AGENTS.md/CLAUDE.md and every test fixture),
 * `removeManagedBlock(upsertManagedBlock(base, body)) === base` byte-for-byte,
 * and `upsertManagedBlock` is idempotent (re-install → identical bytes).
 */
import { SENTINEL_BEGIN, SENTINEL_END } from "../memory/sentinel.ts";

/** The begin/end marker lines exactly as written into a managed file. */
export const MANAGED_BEGIN_LINE = `<!-- ${SENTINEL_BEGIN} -->`;
export const MANAGED_END_LINE = `<!-- ${SENTINEL_END} -->`;

/** ≤1KB block budget (CTX-IMPL §7 / A9-budget) — doctor asserts against this. */
export const PUSH_BLOCK_MAX_BYTES = 1024;

/**
 * A managed block WITH the single leading "\n" separator we insert before it and
 * the trailing "\n" after it — the exact bytes `upsertManagedBlock` adds beyond
 * the base content. Removing this span restores the base (see module invariant).
 */
const MANAGED_SPAN_MID = /\n<!--\s*ctx:managed:begin\s*-->[\s\S]*?<!--\s*ctx:managed:end\s*-->\n?/;
/** Same, for a block at the very start of the file (a ctx-created file). */
const MANAGED_SPAN_HEAD = /^<!--\s*ctx:managed:begin\s*-->[\s\S]*?<!--\s*ctx:managed:end\s*-->\n?/;
/** Locate a block anywhere (doctor: presence + size check). */
const MANAGED_BLOCK_ANYWHERE = /<!--\s*ctx:managed:begin\s*-->[\s\S]*?<!--\s*ctx:managed:end\s*-->/;

/** Render the managed block body into its sentinel-wrapped form (no surround). */
export function renderManagedBlock(body: string): string {
  return `${MANAGED_BEGIN_LINE}\n${body}\n${MANAGED_END_LINE}`;
}

/** Extract the managed block (markers inclusive), or undefined if none present. */
export function extractManagedBlock(content: string): string | undefined {
  return MANAGED_BLOCK_ANYWHERE.exec(content)?.[0];
}

export function hasManagedBlock(content: string): boolean {
  return MANAGED_BLOCK_ANYWHERE.test(content);
}

/**
 * Remove the managed block plus exactly the separator/trailing newlines
 * `upsertManagedBlock` inserted. The head form runs first so a ctx-created file
 * (block at offset 0) restores to "" rather than leaving a stray newline.
 */
export function removeManagedBlock(content: string): string {
  if (MANAGED_SPAN_HEAD.test(content)) return content.replace(MANAGED_SPAN_HEAD, "");
  return content.replace(MANAGED_SPAN_MID, "");
}

/**
 * Insert (or replace, idempotently) the managed block. `existing === null` means
 * the file is absent → a fresh ctx-owned file is created (block + trailing "\n").
 * Otherwise the block is appended after the user content with one blank-line
 * separator; a prior ctx block is stripped first so re-install never stacks.
 */
export function upsertManagedBlock(existing: string | null, body: string): string {
  const block = renderManagedBlock(body);
  const base = existing === null ? "" : removeManagedBlock(existing);
  if (base.length === 0) return `${block}\n`;
  // One blank line between user content and our block; a base already ending in
  // "\n" needs just the blank-line "\n", otherwise add the missing one too.
  const separator = base.endsWith("\n") ? "\n" : "\n\n";
  return `${base}${separator}${block}\n`;
}
