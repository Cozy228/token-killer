// Slice 5 — persistent inspect output (inspect-v1-design.md "Persistent Output").
// Writes to the user-level `~/.token-killer/advice/` with STABLE file names that
// overwrite prior files (no timestamped trend snapshots). Never the repo.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { fingerprintSegment, tokenKillerHome } from "../core/dataDir.js";
import type { Finding } from "./unified.js";

export function adviceDir(): string {
  return join(tokenKillerHome(), "advice");
}

// ── Scope-bucket inspect reports (ADR 0003, goal "Data model") ────────────────
// The unified Finding[] report is persisted per scope so global findings are
// never duplicated across projects or left stale. `tk optimize context` reads
// the matching bucket.

export type ScopeBucket = { scope: "user" } | { scope: "project"; fingerprint: string };

export type InspectBucketReport = {
  schemaVersion: "1";
  generatedAt: string;
  scope: "user" | "project";
  fingerprint?: string;
  files_scanned: number;
  findings: Finding[];
};

export function userContextInspectDir(): string {
  return join(tokenKillerHome(), "user-context", "inspect");
}

export function projectInspectDir(fingerprint: string): string {
  // Use the SAME canonical bucket segment as history/raw/dedup (I7): `repo:<hash>`
  // on POSIX, `repo-<hash>` on Windows. The old behaviour stripped the `repo:`
  // prefix entirely, landing inspect data in `projects/<hash>/` while the history
  // it analyzes lived in `projects/repo:<hash>/` — two desynced buckets for one
  // project. `latest.json` is a derived artifact regenerated every `tk inspect`, so
  // any pre-existing stripped-prefix dir is simply stale and harmless (no migration).
  return join(tokenKillerHome(), "projects", fingerprintSegment(fingerprint), "inspect");
}

export function inspectBucketDir(bucket: ScopeBucket): string {
  return bucket.scope === "user" ? userContextInspectDir() : projectInspectDir(bucket.fingerprint);
}

export function inspectBucketPath(bucket: ScopeBucket): string {
  return join(inspectBucketDir(bucket), "latest.json");
}

export function writeInspectBucket(bucket: ScopeBucket, report: InspectBucketReport): string {
  const dir = inspectBucketDir(bucket);
  // Owner-only like every store under ~/.token-killer/ (0700 dir / 0600 file). A
  // recursive mkdir here is a common first-writer of the data-dir root, so the mode
  // keeps the root from being created world-readable and weakening the metrics stores.
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const path = join(dir, "latest.json");
  writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  return path;
}

export function readInspectBucket(bucket: ScopeBucket): InspectBucketReport | undefined {
  const path = inspectBucketPath(bucket);
  if (!existsSync(path)) return undefined;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as InspectBucketReport;
  } catch {
    return undefined;
  }
}

export type AdviceArtifacts = {
  reportMarkdown: string;
  reportJson: string;
  adviceMarkdown: string;
};

// Returns the paths written, in stable order.
export function writeAdviceArtifacts(artifacts: AdviceArtifacts): string[] {
  const dir = adviceDir();
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const written: string[] = [];
  const files: Array<[string, string]> = [
    ["inspect-report.md", artifacts.reportMarkdown],
    ["inspect-report.json", artifacts.reportJson],
    ["advice.md", artifacts.adviceMarkdown],
  ];
  for (const [name, contents] of files) {
    const path = join(dir, name);
    writeFileSync(path, contents, { mode: 0o600 });
    written.push(path);
  }
  return written;
}

export function writeTelemetryExport(contents: string): string {
  const dir = adviceDir();
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const path = join(dir, "telemetry-export.json");
  writeFileSync(path, contents, { mode: 0o600 });
  return path;
}
