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

export function tokenGuardHome(): string {
  if (process.env.TOKEN_GUARD_HOME) {
    return path.resolve(process.env.TOKEN_GUARD_HOME);
  }
  return path.join(os.homedir(), ".token-guard");
}

export function projectFingerprint(cwd: string): string {
  const normalized = resolveProjectRoot(cwd);
  const hash = createHash("sha256").update(normalized).digest("hex").slice(0, 12);
  return `repo:${hash}`;
}

export function projectDataDir(cwd: string): string {
  return path.join(tokenGuardHome(), "projects", projectFingerprint(cwd));
}

export function historyFile(cwd: string): string {
  return path.join(projectDataDir(cwd), "history.jsonl");
}

export function rawOutputDir(cwd: string): string {
  return path.join(projectDataDir(cwd), "raw");
}

export function rawOutputPathRelative(cwd: string, fileName: string): string {
  return path.join("projects", projectFingerprint(cwd), "raw", fileName);
}

export function resolveStoredPath(storedPath: string): string {
  return path.isAbsolute(storedPath)
    ? storedPath
    : path.join(tokenGuardHome(), storedPath);
}
