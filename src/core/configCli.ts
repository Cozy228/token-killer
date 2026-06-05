// `tg config` dispatcher (Slice 3a). Today only `init`: non-interactive, never
// overwrites. Creating the file is NOT opt-in — both consent fields default to
// false; the user opts in by editing to true or via `tg telemetry enable`.

import { existsSync } from "node:fs";

import { configPath, readConfig, writeConfigTemplate, ConfigError } from "./config.js";

export function runConfig(argv: string[]): number {
  const sub = argv[0];

  if (sub === "init") {
    const path = configPath();
    if (existsSync(path)) {
      process.stderr.write(`tg config: already exists at ${path}\n`);
      return 1;
    }
    writeConfigTemplate();
    process.stdout.write(`Wrote config template: ${path}\n`);
    return 0;
  }

  if (sub === "path") {
    process.stdout.write(`${configPath()}\n`);
    return 0;
  }

  if (sub === "show") {
    try {
      const config = readConfig();
      process.stdout.write(`${JSON.stringify(config, null, 2)}\n`);
      return 0;
    } catch (error) {
      // Parse / out-of-shape ⇒ exit 1 (inspect-v1 rule).
      const message = error instanceof ConfigError ? error.message : String(error);
      process.stderr.write(`tg config: ${message}\n`);
      return 1;
    }
  }

  process.stderr.write("tg config: usage: tg config <init|show|path>\n");
  return 1;
}
