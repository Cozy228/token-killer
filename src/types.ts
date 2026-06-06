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

export type OmissionDeclaration = { kind: OmissionKind };

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
  verbose: boolean;
  maxLines: number;
  maxChars: number;
  saveRaw: boolean | "auto";
  cwd: string;
  reportFormat?: "text" | "json" | "csv";
};

export type ParseMode =
  | "command"
  | "report"
  | "report-ledger"
  | "help"
  | "version"
  | "shim"
  | "init"
  | "hook"
  | "inspect"
  | "optimize"
  | "agentsmd"
  | "gain"
  | "config"
  | "telemetry";

export type ParsedArgv = {
  mode: ParseMode;
  options: TkOptions;
  command?: ParsedCommand;
  // Trailing args for reserved subcommands (shim/init), passed through verbatim
  // to their own dispatcher instead of the command router.
  subArgs?: string[];
};

export interface CommandHandler {
  name: string;
  // The real external executables this handler fronts — the programs the shim
  // wraps so `git`, `tsc`, … on the agent's PATH route into `tk`. Declared only
  // on handlers that wrap an external tool; omitted on tk-native verbs (read,
  // smart, summary, err, test, deps, json, log, pipe). The shim's wrapper set is
  // `dedupe(handlers.flatMap(h => h.programs ?? []))` (see src/shim/programs.ts).
  programs?: string[];
  matches(command: ParsedCommand): boolean;
  execute(command: ParsedCommand, options: TkOptions): Promise<RawResult>;
  filter(
    raw: RawResult,
    command: ParsedCommand,
    options: TkOptions,
  ): Promise<FilteredResult>;
}
