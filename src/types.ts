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
};

export type TgOptions = {
  raw: boolean;
  stats: boolean;
  verbose: boolean;
  maxLines: number;
  maxChars: number;
  saveRaw: boolean | "auto";
  cwd: string;
  reportFormat?: "text" | "json" | "csv";
};

export type ParseMode = "command" | "report" | "help" | "version";

export type ParsedArgv = {
  mode: ParseMode;
  options: TgOptions;
  command?: ParsedCommand;
};

export interface CommandHandler {
  name: string;
  matches(command: ParsedCommand): boolean;
  execute(command: ParsedCommand, options: TgOptions): Promise<RawResult>;
  filter(
    raw: RawResult,
    command: ParsedCommand,
    options: TgOptions,
  ): Promise<FilteredResult>;
}
