import { closeSync, fsyncSync, mkdirSync, openSync, renameSync, writeSync } from "node:fs";
import { dirname } from "node:path";

let counter = 0;

// Crash-safe file write: write to a unique temp file in the same directory, fsync it,
// then atomically rename into place. A crash or signal mid-write leaves the original
// file intact (the rename is the only mutation a reader can observe) instead of a
// truncated shell rc / host config (M4). Same-directory temp keeps the rename atomic
// (no cross-device copy). Parent dirs are created as needed.
export function writeFileAtomicSync(filePath: string, content: string, mode = 0o644): void {
  mkdirSync(dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${(counter += 1)}.tmp`;
  const fd = openSync(tmp, "w", mode);
  try {
    writeSync(fd, content);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(tmp, filePath);
}
