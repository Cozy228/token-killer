// Slice 5 — persistent inspect output (inspect-v1-design.md "Persistent Output").
// Writes to the user-level `~/.token-killer/advice/` with STABLE file names that
// overwrite prior files (no timestamped trend snapshots). Never the repo.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { tokenKillerHome } from "../core/dataDir.js";
import type { Finding } from "./unified.js";

export function adviceDir(): string {
  return join(tokenKillerHome(), "advice");
}

// ── Scope-bucket inspect reports (ADR 0003, goal "Data model") ────────────────
// The unified Finding[] report is persisted per scope so global findings are
// never duplicated across projects or left stale. `tk optimize context` reads
// the matching bucket.

export type ScopeBucket =
  | { scope: "user" }
  | { scope: "project"; fingerprint: string };

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
  // fingerprint is "repo:<hash>"; strip the prefix for a clean path segment.
  const hash = fingerprint.replace(/^repo:/, "");
  return join(tokenKillerHome(), "projects", hash, "inspect");
}

export function inspectBucketDir(bucket: ScopeBucket): string {
  return bucket.scope === "user"
    ? userContextInspectDir()
    : projectInspectDir(bucket.fingerprint);
}

export function inspectBucketPath(bucket: ScopeBucket): string {
  return join(inspectBucketDir(bucket), "latest.json");
}

export function writeInspectBucket(bucket: ScopeBucket, report: InspectBucketReport): string {
  const dir = inspectBucketDir(bucket);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, "latest.json");
  writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`);
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
  mkdirSync(dir, { recursive: true });
  const written: string[] = [];
  const files: Array<[string, string]> = [
    ["inspect-report.md", artifacts.reportMarkdown],
    ["inspect-report.json", artifacts.reportJson],
    ["advice.md", artifacts.adviceMarkdown],
  ];
  for (const [name, contents] of files) {
    const path = join(dir, name);
    writeFileSync(path, contents);
    written.push(path);
  }
  return written;
}

export function writeTelemetryExport(contents: string): string {
  const dir = adviceDir();
  mkdirSync(dir, { recursive: true });
  const path = join(dir, "telemetry-export.json");
  writeFileSync(path, contents);
  return path;
}
