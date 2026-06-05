// Slice 5 — persistent inspect output (inspect-v1-design.md "Persistent Output").
// Writes to the user-level `~/.token-guard/advice/` with STABLE file names that
// overwrite prior files (no timestamped trend snapshots). Never the repo.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { tokenGuardHome } from "../core/dataDir.js";

export function adviceDir(): string {
  return join(tokenGuardHome(), "advice");
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
