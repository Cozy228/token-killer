// Slice 3a — the inspect-v1 config contract (ADR 0004 §1, inspect-v1-design.md).
// `~/.token-killer/config.jsonc`: a JSONC file with a CLOSED allow-listed shape.
// A parse error or any out-of-shape field MUST exit 1 (inspect-v1 rule); a MISSING
// file is fine and reads as defaults (config is optional). This module is the only
// place that knows the config shape — consent (telemetryExport / telemetry) lives
// here.

import { readFileSync, writeFileSync } from "node:fs";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

import { tokenKillerHome } from "./dataDir.js";

export type TgConfig = {
  inputType?: "vscode" | "copilot-cli";
  defaultSince?: string;
  // Local-export opt-in (inspect-v1 scope): write the aggregate payload to a LOCAL
  // file. Independent of `telemetry` — neither implies the other (ADR 0004 §1).
  telemetryExport: boolean;
  // NETWORK upload opt-in over the build-time endpoint. Requires this AND a
  // non-empty endpoint to send anything.
  telemetry: boolean;
};

export class ConfigError extends Error {}

export function configPath(): string {
  return join(tokenKillerHome(), "config.jsonc");
}

// The canonical closed-set template. `tk config init` and `tk telemetry
// enable|disable` regenerate the file from this — no comment-preserving edits.
export function configTemplate(telemetry = false, telemetryExport = false): string {
  return [
    "{",
    "  // token-killer config — closed set; unknown keys are rejected (exit 1).",
    "  // Edit values to opt in; creating this file is NOT itself opt-in.",
    '  "inputType": "vscode",',
    '  "defaultSince": "7d",',
    `  // telemetryExport: write the aggregate payload to a LOCAL file only.`,
    `  "telemetryExport": ${telemetryExport ? "true" : "false"},`,
    `  // telemetry: opt-in to NETWORK upload over the build-time endpoint.`,
    `  "telemetry": ${telemetry ? "true" : "false"}`,
    "}",
    "",
  ].join("\n");
}

const DEFAULT_CONFIG: TgConfig = { telemetryExport: false, telemetry: false };

const ALLOWED_KEYS = new Set(["inputType", "defaultSince", "telemetryExport", "telemetry"]);

// Strip `//` line and `/* */` block comments outside of string literals so a plain
// JSON.parse can read the JSONC body. No new dependency.
function stripJsonComments(text: string): string {
  let out = "";
  let inString = false;
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    const n = text[i + 1];
    if (inString) {
      out += c;
      if (c === "\\") {
        out += n ?? "";
        i += 2;
        continue;
      }
      if (c === '"') inString = false;
      i += 1;
      continue;
    }
    if (c === '"') {
      inString = true;
      out += c;
      i += 1;
      continue;
    }
    if (c === "/" && n === "/") {
      i += 2;
      while (i < text.length && text[i] !== "\n") i += 1;
      continue;
    }
    if (c === "/" && n === "*") {
      i += 2;
      while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) i += 1;
      i += 2;
      continue;
    }
    out += c;
    i += 1;
  }
  return out;
}

function validate(raw: unknown): TgConfig {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new ConfigError("config must be a JSON object");
  }
  const obj = raw as Record<string, unknown>;
  for (const key of Object.keys(obj)) {
    if (!ALLOWED_KEYS.has(key)) throw new ConfigError(`unknown config key '${key}'`);
  }
  const config: TgConfig = { ...DEFAULT_CONFIG };
  if ("inputType" in obj) {
    if (obj.inputType !== "vscode" && obj.inputType !== "copilot-cli") {
      throw new ConfigError("inputType must be 'vscode' or 'copilot-cli'");
    }
    config.inputType = obj.inputType;
  }
  if ("defaultSince" in obj) {
    if (typeof obj.defaultSince !== "string") throw new ConfigError("defaultSince must be a string");
    config.defaultSince = obj.defaultSince;
  }
  if ("telemetryExport" in obj) {
    if (typeof obj.telemetryExport !== "boolean") {
      throw new ConfigError("telemetryExport must be a boolean");
    }
    config.telemetryExport = obj.telemetryExport;
  }
  if ("telemetry" in obj) {
    if (typeof obj.telemetry !== "boolean") throw new ConfigError("telemetry must be a boolean");
    config.telemetry = obj.telemetry;
  }
  return config;
}

// Read + validate. Missing file ⇒ defaults (all false). Parse error or out-of-shape
// field ⇒ ConfigError (caller maps to exit 1).
export function readConfig(): TgConfig {
  let text: string;
  try {
    text = readFileSync(configPath(), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { ...DEFAULT_CONFIG };
    throw error;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripJsonComments(text));
  } catch (error) {
    throw new ConfigError(`config parse error: ${error instanceof Error ? error.message : String(error)}`);
  }
  return validate(parsed);
}

// Write the closed-set template. Used by `tk config init` (only if absent) and by
// `tk telemetry enable|disable` (regenerate with the chosen consent values).
export function writeConfigTemplate(opts: { telemetry?: boolean; telemetryExport?: boolean } = {}): string {
  const path = configPath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, configTemplate(opts.telemetry ?? false, opts.telemetryExport ?? false));
  return path;
}
