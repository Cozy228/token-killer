export type ParsedCommand = {
  program: string;
  args: string[];
  original: string[];
  displayCommand: string;
};

export type RawResult = {
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
  // Optional secondary capture for handlers that, like RTK, run more than one
  // child command. git status runs `--porcelain -b` for the formatted output
  // (stdout) and a plain `git status` for in-progress state / detached-HEAD
  // detection (auxStdout). Not part of the savings baseline.
  auxStdout?: string;
};

// ADR 0001: a handler that cannot list every item below the token budget reduces
// it via the over-budget ladder and *declares* the reduction here, instead of
// emitting a `+N more` marker the gate has to sniff for. `digest` is a lossless
// reduction (step 1 — e.g. location-class: every file:line kept, match content
// dropped; stream-class: repeated lines de-duped). `replacement` is a complete-
// replacement summary (step 2 — an aggregate count, never a partial list). There
// is no "partial cap" kind because `+N more` is banned outright. The gate trusts
// the declaration: it force-persists raw that turn and records the snapshot path
// as the recovery pointer.
export type OmissionKind = "digest" | "replacement";

export type OmissionDeclaration = {
  kind: OmissionKind;
  // MASKING handlers only (e.g. env): a lossless, leak-free rendering (the masked
  // FULL listing) the gate ships when the recovery snapshot is unavailable —
  // whether persistence was disabled (--no-save-raw) OR the write FAILED. A masking
  // handler must never revert to raw (secrets) nor ship a recovery-less lossy
  // count, so this is its safe fallback. Non-masking handlers omit it (they fail
  // open to raw). Internal to the gate — not serialized into FilteredResult.
  safeFull?: string;
};

export type FilteredResult = {
  handler: string;
  output: string;
  rawChars: number;
  outputChars: number;
  rawTokens: number;
  outputTokens: number;
  savedTokens: number;
  savingsPct: number;
  rawOutputPath?: string;
  exitCode: number;
  filterError?: string;
  qualityStatus: "passed" | "inflated" | "empty_output";
  // Present only when the handler declared an over-budget reduction (ADR 0001).
  // rawPointer is the persisted snapshot path the recovery contract guarantees;
  // it is absent only when raw persistence was explicitly disabled (--no-save-raw).
  omission?: { kind: OmissionKind; rawPointer?: string };
};

export type TkOptions = {
  raw: boolean;
  stats: boolean;
  maxLines: number;
  maxChars: number;
  saveRaw: boolean | "auto";
  cwd: string;
  // ADR 0009: best-effort agent session id, carried through the rewritten command
  // via `--session <id>` (portable across sh/pwsh) or the `TK_SESSION` env. Stamped
  // onto history rows (`session_id`) and dedup entries; never part of the dedup key.
  sessionId?: string;
  // ADR 0009: per-command opt-out (`--no-dedup`). undefined ⇒ follow the
  // TK_SESSION_DEDUP / config gate; false ⇒ force the dedup stage off for this run.
  dedup?: boolean;
};

export type ParseMode =
  | "command"
  | "help"
  | "version"
  | "install"
  | "uninstall"
  | "status"
  | "shim"
  | "hook"
  | "inspect"
  | "debug"
  | "optimize"
  | "gain"
  | "config"
  | "telemetry";

export type ParsedArgv = {
  mode: ParseMode;
  options: TkOptions;
  command?: ParsedCommand;
  // Trailing args for reserved subcommands (init/hook/inspect/…), passed through
  // verbatim to their own dispatcher instead of the command router.
  subArgs?: string[];
};

// Static gate facts a handler declares about itself, read by the quality gate
// (makeFilteredResult) instead of the hardcoded name lists it replaced. These are
// the static analogue of OmissionDeclaration (which carries the *runtime* reduction
// fact through the same interface).
//   - structural: the output is a deliberate reformat (RTK-style grouping/
//     annotation), not a size reduction, so on small/clean inputs it can exceed the
//     raw dump — the SIZE-inflation check must not bounce it back to raw.
//   - masksSecrets: the raw output contains secret values the handler masks (env),
//     so reverting to raw would re-expose them — it must NEVER fail open to raw.
//   - ladder: the handler participates in the ADR 0001 over-budget ladder and never
//     emits an undeclared `+N more`, so the prose-omission sniff is retired for it
//     (the sniff is only the net for foreign / not-yet-converted passthrough).
export type HandlerTraits = {
  structural?: boolean;
  masksSecrets?: boolean;
  ladder?: boolean;
  // ADR 0009 session dedup: this handler's matched commands are read-only, so a
  // byte-identical repeat within the re-anchor window can be suppressed with a
  // recoverable marker. Opt-in; the runtime read-only gate (isReadOnlyCommand)
  // still excludes subcommand-mutating forms (`git branch -d`, `docker rm`, …).
  cacheable?: boolean;
  // The re-anchor window class for a cacheable handler (default "fast"). Bounds
  // recoverable-context staleness, NOT correctness (exact-compare is the spine).
  ttlClass?: TtlClass;
};

// ADR 0009 re-anchor window classes (wall-clock TTL): fast 30s, medium 120s,
// slow 300s. Measured from the last full emit, never refreshed on a hit.
export type TtlClass = "fast" | "medium" | "slow";

export interface CommandHandler {
  name: string;
  // Static gate facts (see HandlerTraits). Declared only on handlers that need a
  // non-default gate behaviour; omitted on the majority that take the defaults.
  traits?: HandlerTraits;
  // The real external executables this handler fronts — the programs the shim
  // wraps so `git`, `tsc`, … on the agent's PATH route into `tk`. Declared only
  // on handlers that wrap an external tool; omitted on tk-native verbs (read,
  // smart, summary, err, test, deps, json, log, pipe). The shim's wrapper set is
  // `dedupe(handlers.flatMap(h => h.programs ?? []))` (see src/shim/programs.ts).
  programs?: string[];
  matches(command: ParsedCommand): boolean;
  execute(command: ParsedCommand, options: TkOptions): Promise<RawResult>;
  filter(raw: RawResult, command: ParsedCommand, options: TkOptions): Promise<FilteredResult>;
}
