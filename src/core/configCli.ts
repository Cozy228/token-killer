// `ctx config` dispatcher (Slice 3a). Today only `init`: non-interactive, never
// overwrites. Creating the file is NOT opt-in — both consent fields default to
// the build-time default (false in generic builds, true when baked with
// CTX_TELEMETRY_DEFAULT=true); the user opts in/out by editing or `ctx telemetry`.

import { existsSync } from "node:fs";

import { configPath, readConfig, writeConfigTemplate, ConfigError } from "./config.js";

export function runConfig(argv: string[]): number {
  const sub = argv[0];

  if (sub === "init") {
    const path = configPath();
    if (existsSync(path)) {
      process.stderr.write(`ctx config: already exists at ${path}\n`);
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
      process.stderr.write(`ctx config: ${message}\n`);
      return 1;
    }
  }

  process.stderr.write("ctx config: usage: ctx config <init|show|path>\n");
  return 1;
}
