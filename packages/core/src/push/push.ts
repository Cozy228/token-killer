/**
 * Push orchestration (CTX-IMPL §7): read `.ctx/push.jsonc` → build the ≤1KB
 * block → place it into the host instruction files, with an openwiki-style
 * no-op guard for the optional git post-commit hook (`--if-changed`).
 *
 * The pin/veto CLI (`ctx push pin|veto <id>`) edits `.ctx/push.jsonc`. Its
 * mechanism is provided here; ctx never installs a git hook into the user's
 * repo in M1 — the hook mechanism is `runPush(..., { ifChanged: true })`,
 * offered but not auto-wired.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { blake2bHex } from "../store/hash.ts";
import type { Store } from "../store/store.ts";
import { buildPushBlock, type PushBlock } from "./block.ts";
import { emptyPushConfig, parsePushConfig, type PushConfig } from "./config.ts";
import { placePushBlock, type PlacementResult } from "./hosts.ts";

/** Project-relative path of the pin/veto config (git-shareable, D27/D30). */
export const PUSH_CONFIG_REL = join(".ctx", "push.jsonc");

/** Store meta key holding the last-pushed block digest (no-op guard). */
export const PUSH_SHA_META = "push:last-sha";

export function pushConfigPath(projectRoot: string): string {
  return join(projectRoot, ".ctx", "push.jsonc");
}

/** Read + parse `.ctx/push.jsonc`; a missing file is an empty (clean) config. */
export function readPushConfig(projectRoot: string): PushConfig {
  const path = pushConfigPath(projectRoot);
  if (!existsSync(path)) return emptyPushConfig();
  return parsePushConfig(readFileSync(path, "utf8"));
}

export type PinVetoList = "pin" | "veto";
export type PinVetoAction = "add" | "remove";

export interface PinVetoResult {
  ok: boolean;
  path: string;
  config?: PushConfig;
  /** Success-shaped guidance when the existing file is malformed (never thrown). */
  guidance?: string;
}

/**
 * Add/remove an id in `.ctx/push.jsonc`'s pin or veto array. A malformed
 * existing file is NOT overwritten — the caller gets guidance to fix it first
 * (so a rewrite can't silently discard an unparseable hand edit). The mutator
 * writes canonical JSON; hand-authored comments are only preserved across
 * manual edits, not across `ctx push pin|veto`.
 */
export function editPinVeto(
  projectRoot: string,
  list: PinVetoList,
  id: string,
  action: PinVetoAction = "add",
): PinVetoResult {
  const path = pushConfigPath(projectRoot);
  const raw = existsSync(path) ? readFileSync(path, "utf8") : "";
  const current = parsePushConfig(raw);
  if (!current.ok && raw.trim().length > 0) {
    return { ok: false, path, guidance: current.warnings.join(" ") };
  }
  const pin = new Set(current.pin);
  const veto = new Set(current.veto);
  const target = list === "pin" ? pin : veto;
  if (action === "add") target.add(id);
  else target.delete(id);
  const obj = { pin: [...pin], veto: [...veto] };
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(obj, null, 2)}\n`);
  return { ok: true, path, config: { pin: obj.pin, veto: obj.veto, warnings: [], ok: true } };
}

export interface RunPushOptions {
  /** Explicit config (default: read `.ctx/push.jsonc`). */
  config?: PushConfig;
  /** Injected clock for decay (tests). */
  now?: number;
  /** Compute only, do not write files or update the store digest. */
  dryRun?: boolean;
  /** Post-commit-hook mode: skip entirely when the block is byte-unchanged. */
  ifChanged?: boolean;
}

export interface RunPushResult {
  /** True when `ifChanged` short-circuited an unchanged block. */
  skipped: boolean;
  block: PushBlock;
  placements: PlacementResult[];
  /** Config warnings (unknown keys / malformed) surfaced to the caller. */
  warnings: string[];
  /** blake2b digest of the rendered block. */
  sha: string;
}

/**
 * Render + place the push block for a project. On `ifChanged`, a block whose
 * digest matches the store's last-pushed digest is a no-op (nothing touched) —
 * the guard for a cheap git post-commit hook.
 */
export function runPush(
  store: Store,
  projectRoot: string,
  opts: RunPushOptions = {},
): RunPushResult {
  const config = opts.config ?? readPushConfig(projectRoot);
  const block = buildPushBlock(store, {
    config,
    ...(opts.now !== undefined ? { now: opts.now } : {}),
  });
  const sha = blake2bHex(block.text);

  if (opts.ifChanged && store.getMeta(PUSH_SHA_META) === sha) {
    return { skipped: true, block, placements: [], warnings: config.warnings, sha };
  }

  const placements = placePushBlock(projectRoot, block.text, (opts.dryRun !== undefined ? { dryRun: opts.dryRun } : {}));
  if (!opts.dryRun) store.setMeta(PUSH_SHA_META, sha);
  return { skipped: false, block, placements, warnings: config.warnings, sha };
}
