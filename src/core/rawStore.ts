import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type { RawResult, TkOptions } from "../types.js";
import { rawOutputDir, rawOutputPathRelative } from "./dataDir.js";
import { safePathPart } from "./path.js";

function timestampForPath(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(
    date.getHours(),
  )}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

export async function maybeSaveRawOutput(
  raw: RawResult,
  options: TkOptions,
): Promise<string | undefined> {
  const rawText = `${raw.stdout}${raw.stderr}`;
  const shouldSave =
    options.saveRaw === true ||
    (options.saveRaw === "auto" && (raw.exitCode !== 0 || rawText.length > 20000));

  if (!shouldSave || options.saveRaw === false) return undefined;

  const fileName = `${timestampForPath()}-${safePathPart(raw.command)}.log`;
  const dir = rawOutputDir(options.cwd);
  await mkdir(dir, { recursive: true });
  const relativePath = rawOutputPathRelative(options.cwd, fileName);
  const absolutePath = path.join(dir, fileName);
  const content = [
    `Command: ${raw.command}`,
    `Exit Code: ${raw.exitCode}`,
    `Duration: ${raw.durationMs}ms`,
    "--- STDOUT ---",
    raw.stdout,
    "--- STDERR ---",
    raw.stderr,
  ].join("\n");

  await writeFile(absolutePath, content, "utf8");
  return relativePath;
}
