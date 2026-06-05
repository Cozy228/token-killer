import { createHash } from "node:crypto";
import { realpathSync } from "node:fs";
import os from "node:os";
import path from "node:path";

function resolveProjectRoot(cwd: string): string {
  try {
    return realpathSync(cwd);
  } catch {
    return path.resolve(cwd);
  }
}

export function tokenKillerHome(): string {
  if (process.env.TOKEN_KILLER_HOME) {
    return path.resolve(process.env.TOKEN_KILLER_HOME);
  }
  return path.join(os.homedir(), ".token-killer");
}

export function projectFingerprint(cwd: string): string {
  const normalized = resolveProjectRoot(cwd);
  const hash = createHash("sha256").update(normalized).digest("hex").slice(0, 12);
  return `repo:${hash}`;
}

// Render a fingerprint (logical id `repo:<hash>`) into a filesystem-safe path
// segment. `repo:<hash>` is the canonical id used for display/telemetry, but its
// colon is ILLEGAL in a Windows path component (reserved for the drive letter /
// NTFS alternate data streams), so `mkdir projects\repo:<hash>` throws ENOENT and
// every history write — hence every compression — silently fails open to
// passthrough. On POSIX the colon is a valid filename char, so this is a no-op
// and existing on-disk layout is untouched. We only neutralise characters
// Windows actually rejects, keeping the segment stable per platform.
export function fingerprintSegment(fingerprint: string): string {
  return process.platform === "win32" ? fingerprint.replace(/:/g, "-") : fingerprint;
}

export function projectDataDir(cwd: string): string {
  return path.join(tokenKillerHome(), "projects", fingerprintSegment(projectFingerprint(cwd)));
}

export function historyFile(cwd: string): string {
  return path.join(projectDataDir(cwd), "history.jsonl");
}

// Local-display-only project label (ADR 0004 §3): basename, never the full path.
// Lives next to the project's history.jsonl. Never enters telemetry.
export function projectMetaFile(cwd: string): string {
  return path.join(projectDataDir(cwd), "meta.json");
}

export function projectMetaFileForFingerprint(fingerprint: string): string {
  return path.join(tokenKillerHome(), "projects", fingerprintSegment(fingerprint), "meta.json");
}

export function rawOutputDir(cwd: string): string {
  return path.join(projectDataDir(cwd), "raw");
}

export function rawOutputPathRelative(cwd: string, fileName: string): string {
  return path.join("projects", fingerprintSegment(projectFingerprint(cwd)), "raw", fileName);
}

export function resolveStoredPath(storedPath: string): string {
  return path.isAbsolute(storedPath)
    ? storedPath
    : path.join(tokenKillerHome(), storedPath);
}
