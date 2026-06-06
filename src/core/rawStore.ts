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

  // Persisting raw must never break the pipeline. A disk-full / permission / quota
  // error here returns "no snapshot" (undefined) rather than throwing through
  // makeFilteredResult — the agent must still get its output. Critically, ADR 0001's
  // declared-omission path now force-persists on EVERY digest/replacement (a much
  // wider surface than the old exit≠0/>20K trigger), and makeFilteredResult's
  // `replacementNeedsRecovery` fail-open assumes a missing snapshot is signalled by
  // `undefined`, not an exception — so swallowing the error here is load-bearing.
  try {
    await mkdir(dir, { recursive: true });
    await writeFile(absolutePath, content, "utf8");
  } catch {
    return undefined;
  }
  return relativePath;
}
