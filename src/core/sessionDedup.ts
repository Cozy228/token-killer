// ADR 0009 — the session dedup stage, slotted into runPipeline after compression
// and before emit/record. Mirrors ztk's proxy_session.zig::applySession spine
// (run + compress → hash the compressed output → dedup only on a fresh exact
// match), with tk's four divergences: a rawStore recovery pointer, a per-project
// store, separated accounting, and exit-code identity. Default-off; a no-op unless
// enabled AND the command is eligible. Every step is fail-open: any uncertainty
// emits the full output.

import { rawText } from "../handlers/base.js";
import type {
  CommandHandler,
  FilteredResult,
  ParsedCommand,
  RawResult,
  TkOptions,
  TtlClass,
} from "../types.js";
import { readConfig } from "./config.js";
import { dedupStoreFile } from "./dataDir.js";
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
import { isReadOnlyCommand } from "./readonly.js";
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
  return `[tk] unchanged since ${formatClock(opts.lastDifferedAt)} — same as the earlier \`${shortCmd(
    opts.normCmd,
  )}\` ${where}; full: ${opts.rawPointer}\n`;
}

function markerResult(
  handlerName: string,
  raw: RawResult,
  marker: string,
  rawPointer: string,
): FilteredResult {
  const savings = calculateSavings(rawText(raw), marker);
  return {
    handler: handlerName,
    output: marker,
    rawChars: savings.rawChars,
    outputChars: savings.outputChars,
    rawTokens: savings.rawTokens,
    outputTokens: savings.outputTokens,
    savedTokens: savings.savedTokens,
    savingsPct: savings.savingsPct,
    rawOutputPath: rawPointer,
    exitCode: raw.exitCode,
    qualityStatus: "passed",
  };
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
  if (!isReadOnlyCommand(command)) return null; // mandatory read-only gate
  if (filtered.output.length < MIN_DEDUP_BYTES) return null; // tiny / structured → skip

  const ttlClass = ttlClassOf(handler);
  const sessionId = options.sessionId; // already validated by parse.ts; may be absent
  const normCmd = normalizeCommand(command);
  const key = entryKey(normCmd);
  const outHash = hashOutput(filtered.output);
  const file = dedupStoreFile(options.cwd);

  let prev: DedupEntry | undefined;
  try {
    prev = (await readStore(file)).entries[key];
  } catch {
    return null; // can't read the store — fail open
  }

  // Optional same-session gate on the long (slow) window only: when both sides
  // carry a session id and they differ, a 5-minute-old entry from another session
  // should re-anchor rather than claim "you already saw this". Correctness does not
  // depend on this — it only sharpens a long-window marker (exact-compare still holds).
  const crossSessionSlow =
    ttlClass === "slow" && !!prev?.session_id && !!sessionId && prev.session_id !== sessionId;

  if (
    prev &&
    isFresh(prev, now) &&
    prev.outHash === outHash &&
    prev.exitCode === raw.exitCode &&
    prev.rawPointer &&
    !crossSessionSlow
  ) {
    const sameSession = !!prev.session_id && !!sessionId && prev.session_id === sessionId;
    const marker = buildMarker({
      normCmd,
      lastDifferedAt: prev.lastDifferedAt,
      rawPointer: prev.rawPointer,
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
      raw_pointer: prev.rawPointer,
    });
    return markerResult(filtered.handler, raw, marker, prev.rawPointer);
  }

  // MISS (new / changed / expired / cross-session-slow) — establish or refresh the
  // entry with a LIVE recovery pointer. maybeSaveRawOutput only persists on
  // exit≠0/>20 KB by default, so force a snapshot when the filter didn't already
  // take one; without a recovery channel we decline to cache (lossless-or-nothing).
  let rawPointer = filtered.rawOutputPath;
  if (!rawPointer) {
    try {
      rawPointer = await maybeSaveRawOutput(raw, { ...options, saveRaw: true });
    } catch {
      rawPointer = undefined;
    }
  }
  if (!rawPointer) return null;

  const differed = !prev || prev.outHash !== outHash;
  const entry: DedupEntry = {
    normCmd,
    outHash,
    exitCode: raw.exitCode,
    ttlClass,
    lastEmittedAt: now,
    lastDifferedAt: differed ? now : prev.lastDifferedAt,
    rawPointer,
    ...(sessionId ? { session_id: sessionId } : {}),
  };
  await upsertEntry(file, key, entry, now);
  return null;
}
