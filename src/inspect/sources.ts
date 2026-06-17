// Slice 4 — inspect source discovery (inspect-v1-design.md "Default Input Type",
// "VS Code Coverage Semantics"). Pure read-only path resolution. No --source-path:
// sources are discovered from the input-type model, never a caller path.
//
// Missing sources are NORMAL (reported as not-found, not an error). A coverage
// error only occurs when a discovered file exists but cannot be read/parsed —
// that is handled in scan.ts, not here.

import { existsSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { vscodeUserDir } from "../shim/hostConfig.js";

export type InputType = "vscode" | "copilot-cli";

export type SourceDiscovery = {
  inputType: InputType;
  // Session-inventory files (VS Code chatSessions). Counts discovered sessions.
  sessionFiles: string[];
  // Analyzable tool-workflow files (transcripts / CLI session-state).
  transcriptFiles: string[];
  // Whether any major source was found at all (drives exit code 2).
  found: boolean;
};

// Per-host discovery — carries the resolved root dir tk looked in so the run can
// show WHERE it scanned (progress), not just which host.
export type HostDiscovery = {
  inputType: InputType;
  dir: string;
  sessionFiles: string[];
  transcriptFiles: string[];
};

export function hostFound(h: HostDiscovery): boolean {
  return h.sessionFiles.length + h.transcriptFiles.length > 0;
}

function listByExt(dir: string, exts: string[]): string[] {
  if (!existsSync(dir)) return [];
  try {
    return readdirSync(dir)
      .filter((f) => exts.some((ext) => f.endsWith(ext)))
      .map((f) => join(dir, f))
      .filter((p) => {
        try {
          return statSync(p).isFile();
        } catch {
          return false;
        }
      });
  } catch {
    return [];
  }
}

// Transcripts are append-only JSON-Lines.
function listJsonl(dir: string): string[] {
  return listByExt(dir, [".jsonl"]);
}

// chatSessions are serialized ChatModels — `.jsonl` (incremental) on some builds,
// a single-object `.json` on others (notably Windows). Discover BOTH, or the I3
// reader never sees half the sessions (live Windows box: 5 of 7 were `.json`).
function listSessions(dir: string): string[] {
  return listByExt(dir, [".json", ".jsonl"]);
}

function listSubdirs(dir: string): string[] {
  if (!existsSync(dir)) return [];
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => join(dir, e.name));
  } catch {
    return [];
  }
}

// Stable VS Code storage only (Insiders/Codium out of scope). Sessions live in
// `chatSessions/`, analyzable events in the Copilot chat `transcripts/` — kept as
// two distinct counts (coverage semantics: never collapse them).
function discoverVscode(home: string, platform: NodeJS.Platform): HostDiscovery {
  const userDir = vscodeUserDir(platform, home);
  const sessionFiles: string[] = [];
  const transcriptFiles: string[] = [];

  const roots = [join(userDir, "globalStorage"), ...listSubdirs(join(userDir, "workspaceStorage"))];
  for (const root of roots) {
    sessionFiles.push(...listSessions(join(root, "chatSessions")));
    transcriptFiles.push(...listJsonl(join(root, "GitHub.copilot-chat", "transcripts")));
    transcriptFiles.push(...listJsonl(join(root, "transcripts")));
  }

  return { inputType: "vscode", dir: userDir, sessionFiles, transcriptFiles };
}

// Copilot CLI session-state stores under ~/.copilot. Layout varies by version;
// probe the common subdirs tolerantly.
function discoverCopilotCli(home: string): HostDiscovery {
  const base = join(home, ".copilot");
  const transcriptFiles: string[] = [];
  for (const sub of ["history", "session-state", "sessions", "logs"]) {
    transcriptFiles.push(...listJsonl(join(base, sub)));
  }
  return { inputType: "copilot-cli", dir: base, sessionFiles: [], transcriptFiles };
}

// Discover ONE host (used when --input-type is explicit).
export function discoverHost(
  inputType: InputType,
  home: string = homedir(),
  platform: NodeJS.Platform = process.platform,
): HostDiscovery {
  return inputType === "copilot-cli" ? discoverCopilotCli(home) : discoverVscode(home, platform);
}

// Discover EVERY known host (used when --input-type is NOT given): tk scans both
// VS Code and the Copilot CLI so a user driving either is covered without a flag.
export function discoverHosts(
  home: string = homedir(),
  platform: NodeJS.Platform = process.platform,
): HostDiscovery[] {
  return [discoverVscode(home, platform), discoverCopilotCli(home)];
}

// Merge per-host discoveries into one SourceDiscovery: scan()/analyzeHabits() read
// the union of files and don't care which host a file came from (flatToolRecords
// already handles both the VS Code and flat/CLI line shapes). `inputType` is set to
// a representative host (first with data) purely for the legacy ScanResult field —
// the report's host LABEL is computed separately in the CLI from the host list.
export function mergeHosts(hosts: HostDiscovery[]): SourceDiscovery {
  const withData = hosts.find(hostFound) ?? hosts[0];
  return {
    inputType: withData?.inputType ?? "vscode",
    sessionFiles: hosts.flatMap((h) => h.sessionFiles),
    transcriptFiles: hosts.flatMap((h) => h.transcriptFiles),
    found: hosts.some(hostFound),
  };
}

// Back-compat single-host SourceDiscovery (kept for callers/tests that want the
// flat shape for one host).
export function discoverSources(
  inputType: InputType,
  home: string = homedir(),
  platform: NodeJS.Platform = process.platform,
): SourceDiscovery {
  return mergeHosts([discoverHost(inputType, home, platform)]);
}
