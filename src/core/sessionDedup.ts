// ADR 0009 — the session dedup stage, slotted into runPipeline after compression
// and before emit/record. Mirrors ztk's proxy_session.zig::applySession spine
// (run + compress → hash the compressed output → dedup only on a fresh exact
// match), with tk's four divergences: a rawStore recovery pointer, a per-project
// store, separated accounting, and exit-code identity. Default-on; a no-op unless
// enabled AND the command is eligible. Every step is fail-open: any uncertainty
// emits the full output.

import { existsSync } from "node:fs";

import type {
  CommandHandler,
  FilteredResult,
  ParsedCommand,
  RawResult,
  TkOptions,
  TtlClass,
} from "../types.js";
import { removeAnsi } from "./ansi.js";
import { readConfig } from "./config.js";
import { dedupStoreFile, resolveStoredPath } from "./dataDir.js";
import { appendDedupEvent } from "./dedupLedger.js";
import {
  type DedupEntry,
  entryKey,
  hashOutput,
  isFresh,
  normalizeCommand,
  readStore,
  upsertEntry,
} from "./dedupStore.js";
import { maybeSaveRawOutput } from "./rawStore.js";
import { isReadOnlyForHandler } from "./readonly.js";
import { calculateSavings, estimateTokens } from "./savings.js";

// Below this the marker would not be smaller, so caching never pays (and tiny /
// structured outputs are the highest-stakes to keep verbatim). The never-make-worse
// floor; a defensive per-marker length check backs it up on a hit.
const MIN_DEDUP_BYTES = 256;

// ADR 0009: session dedup ships **default-ON** (it is lossless + recoverable). It is
// disabled only by an explicit opt-out — `TK_SESSION_DEDUP=0` (env), `sessionDedup:
// false` (config), `--no-dedup` (per command), or `--raw`. A non-empty env value is
// the override; an empty/unset value falls through to the config, whose absence is
// the default (on).
export function sessionDedupEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const v = env.TK_SESSION_DEDUP;
  if (v !== undefined && v.trim() !== "") {
    const s = v.trim().toLowerCase();
    return !(s === "0" || s === "false" || s === "off" || s === "no");
  }
  try {
    return readConfig().sessionDedup !== false; // absent ⇒ default-on; only explicit false disables
  } catch {
    return true; // a malformed config can't express "off"; dedup is safe, stay on
  }
}

function ttlClassOf(handler: CommandHandler): TtlClass {
  return handler.traits?.ttlClass ?? "fast";
}

function formatClock(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function shortCmd(normCmd: string): string {
  return normCmd.length > 48 ? `${normCmd.slice(0, 47)}…` : normCmd;
}

// The one-line marker the model sees on a hit: names the command + when it last
// differed, says whether it was this session or just this project, and carries the
// rawStore recovery pointer. Unmistakably a tk marker; ends with a newline.
export function buildMarker(opts: {
  normCmd: string;
  lastDifferedAt: number;
  rawPointer: string;
  sameSession: boolean;
}): string {
  const where = opts.sameSession ? "in this session" : "here";
  // Show an ABSOLUTE pointer: the agent's cwd is the project, not ~/.token-killer, so a
  // home-relative path would `cat`-fail (H20). The stored entry keeps the relative form.
  return `[tk] unchanged since ${formatClock(opts.lastDifferedAt)} — same as the earlier \`${shortCmd(
    opts.normCmd,
  )}\` ${where}; full: ${resolveStoredPath(opts.rawPointer)}\n`;
}

// The FilteredResult emitted on a HIT. Its savings are measured against the
// SUPPRESSED compressed repeat (`filtered.output`), not the raw — so `--stats` shows
// the honest incremental dedup saving (compressed → marker) and never double-counts
// the original compression (which `--stats` already showed on the first run). The
// dedup ledger records the same increment.
function markerResult(
  filtered: FilteredResult,
  marker: string,
  rawPointer: string,
): FilteredResult {
  const savings = calculateSavings(filtered.output, marker);
  return {
    handler: filtered.handler,
    output: marker,
    rawChars: savings.rawChars,
    outputChars: savings.outputChars,
    rawTokens: savings.rawTokens,
    outputTokens: savings.outputTokens,
    savedTokens: savings.savedTokens,
    savingsPct: savings.savingsPct,
    rawOutputPath: rawPointer,
    exitCode: filtered.exitCode,
    qualityStatus: "passed",
  };
}

// Take a recovery snapshot of the current raw (force-persist regardless of the auto
// policy). Fail-open: undefined when persistence is unavailable.
async function snapshot(raw: RawResult, options: TkOptions): Promise<string | undefined> {
  try {
    return await maybeSaveRawOutput(raw, { ...options, saveRaw: true });
  } catch {
    return undefined;
  }
}

export type DedupInput = {
  handler: CommandHandler;
  command: ParsedCommand;
  options: TkOptions;
  raw: RawResult;
  filtered: FilteredResult;
  now?: number;
  env?: NodeJS.ProcessEnv;
};

// Returns a marker-substituted FilteredResult on a dedup HIT (the caller emits it
// in place of the repeat and records ONLY a dedup event), else null (the caller
// emits the full output and records the normal ledger-① row). All store / snapshot
// / ledger side effects are fail-open.
export async function applySessionDedup(input: DedupInput): Promise<FilteredResult | null> {
  const { handler, command, options, raw, filtered } = input;
  const env = input.env ?? process.env;
  const now = input.now ?? Date.now();

  // Eligibility gates (any "no" → emit the full output, no dedup).
  if (options.dedup === false) return null; // `--no-dedup` per-command opt-out
  if (!sessionDedupEnabled(env)) return null;
  if (options.raw) return null; // --raw never compresses (belt-and-braces; cli bypasses too)
  if (options.saveRaw === false) return null; // no recovery channel possible → never dedup
  if (raw.exitCode !== 0) return null; // exit identity / errors always pass through
  if (!handler.traits?.cacheable) return null; // opt-in only
  if (handler.traits?.masksSecrets) return null; // never snapshot a masking handler's raw (H21)
  if (!isReadOnlyForHandler(handler.name, command)) return null; // mandatory read-only gate
  if (filtered.output.length < MIN_DEDUP_BYTES) return null; // tiny / structured → skip

  const ttlClass = ttlClassOf(handler);
  const sessionId = options.sessionId; // already validated by parse.ts; may be absent
  const normCmd = normalizeCommand(command);
  const key = entryKey(normCmd);
  // H2: hash the RAW (ANSI-stripped), not the compressed view. A lossy/capped handler
  // can emit byte-identical compressed output from two different raws; keying on the
  // compressed view would dedup them and hand back a stale recovery pointer.
  const rawHash = hashOutput(removeAnsi(`${raw.stdout}${raw.stderr}`));
  const file = dedupStoreFile(options.cwd);

  let prev: DedupEntry | undefined;
  try {
    prev = (await readStore(file)).entries[key];
  } catch {
    return null; // can't read the store — fail open
  }

  // HIT — a fresh entry with the same compressed output. (Exit identity holds by
  // construction: exit≠0 returned above and entries are only stored at exit 0.)
  // Session id is NOT part of the hit decision, only the marker's wording — so two
  // sessions that produce identical output in one repo both dedup (correct + lossless;
  // exact-compare is the spine, the wall-clock TTL the freshness bound).
  if (prev && isFresh(prev, now) && prev.rawHash === rawHash) {
    // Resolve a live recovery pointer LAZILY: reuse the stored snapshot if it still
    // exists on disk, else snapshot the current raw now. Keying on rawHash means the
    // current raw is BYTE-IDENTICAL to the establishing run's, so the snapshot it
    // names is faithful. A command that never repeats pays for no snapshot at all.
    let rawPointer =
      prev.rawPointer && existsSync(resolveStoredPath(prev.rawPointer))
        ? prev.rawPointer
        : undefined;
    if (!rawPointer) rawPointer = await snapshot(raw, options);
    if (!rawPointer) return null; // no recovery channel → emit full (lossless-or-nothing)

    const sameSession = !!prev.session_id && !!sessionId && prev.session_id === sessionId;
    const marker = buildMarker({
      normCmd,
      lastDifferedAt: prev.lastDifferedAt,
      rawPointer,
      sameSession,
    });
    if (marker.length >= filtered.output.length) return null; // defensive never-make-worse

    const markerTokens = estimateTokens(marker);
    await appendDedupEvent(options.cwd, {
      ts: new Date(now).toISOString(),
      session_id: sessionId,
      norm_cmd: normCmd,
      handler: filtered.handler,
      ttl_class: ttlClass,
      output_tokens: filtered.outputTokens,
      marker_tokens: markerTokens,
      saved_tokens: Math.max(0, filtered.outputTokens - markerTokens),
      raw_pointer: rawPointer,
    });
    // Persist a freshly-created pointer so later hits reuse it — NOT lastEmittedAt (a
    // hit is not a full emit) and NOT session_id (the entry keeps its original owner).
    if (rawPointer !== prev.rawPointer) {
      await upsertEntry(file, key, { ...prev, rawPointer }, now);
    }
    return markerResult(filtered, marker, rawPointer);
  }

  // MISS (new / changed / expired) — establish or refresh the entry. The recovery
  // snapshot is DEFERRED to the first actual HIT (above), so a never-repeated command
  // writes no extra raw log; reuse the filter's own snapshot here when it made one.
  const differed = !prev || prev.rawHash !== rawHash;
  const entry: DedupEntry = {
    normCmd,
    rawHash,
    exitCode: raw.exitCode,
    ttlClass,
    lastEmittedAt: now,
    lastDifferedAt: differed ? now : prev.lastDifferedAt,
    rawPointer: filtered.rawOutputPath ?? "",
    ...(sessionId ? { session_id: sessionId } : {}),
  };
  await upsertEntry(file, key, entry, now);
  return null;
}
