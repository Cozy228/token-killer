import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import type { RawResult, TkOptions } from "../types.js";
import { rawOutputDir, rawOutputPathRelative } from "./dataDir.js";
import { safePathPart } from "./path.js";

// Per-process monotonic counter: combined with the pid and a millisecond timestamp it
// makes snapshot filenames collision-proof even for many saves within one ms (H3).
let saveCounter = 0;

function timestampForPath(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const ms = String(date.getMilliseconds()).padStart(3, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(
    date.getHours(),
  )}${pad(date.getMinutes())}${pad(date.getSeconds())}${ms}`;
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

  // ms timestamp + pid + per-process counter. The old second-resolution name let a
  // second run in the same second overwrite the first, so a printed pointer could name
  // another run's bytes (H3); this composite is unique by construction.
  const fileName = `${timestampForPath()}-${process.pid}-${(saveCounter += 1)}-${safePathPart(
    raw.command,
  )}.log`;
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
    await mkdir(dir, { recursive: true, mode: 0o700 });
    // Write to a unique temp file then atomically rename into place so a reader (or a
    // crash) never sees a torn snapshot (H3). mode 0600 keeps the file off other
    // users' eyes (H21); for masking handlers the content routed here is already
    // masked (base.ts), so this is defence in depth.
    const tmpPath = `${absolutePath}.${process.pid}.${(saveCounter += 1)}.tmp`;
    await writeFile(tmpPath, content, { encoding: "utf8", mode: 0o600 });
    await rename(tmpPath, absolutePath);
  } catch {
    return undefined;
  }
  return relativePath;
}
