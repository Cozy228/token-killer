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
function discoverVscode(home: string, platform: NodeJS.Platform): SourceDiscovery {
  const userDir = vscodeUserDir(platform, home);
  const sessionFiles: string[] = [];
  const transcriptFiles: string[] = [];

  const roots = [join(userDir, "globalStorage"), ...listSubdirs(join(userDir, "workspaceStorage"))];
  for (const root of roots) {
    sessionFiles.push(...listSessions(join(root, "chatSessions")));
    transcriptFiles.push(...listJsonl(join(root, "GitHub.copilot-chat", "transcripts")));
    transcriptFiles.push(...listJsonl(join(root, "transcripts")));
  }

  return {
    inputType: "vscode",
    sessionFiles,
    transcriptFiles,
    found: sessionFiles.length + transcriptFiles.length > 0,
  };
}

// Copilot CLI session-state stores under ~/.copilot. Layout varies by version;
// probe the common subdirs tolerantly.
function discoverCopilotCli(home: string): SourceDiscovery {
  const base = join(home, ".copilot");
  const transcriptFiles: string[] = [];
  for (const sub of ["history", "session-state", "sessions", "logs"]) {
    transcriptFiles.push(...listJsonl(join(base, sub)));
  }
  return {
    inputType: "copilot-cli",
    sessionFiles: [],
    transcriptFiles,
    found: transcriptFiles.length > 0,
  };
}

export function discoverSources(
  inputType: InputType,
  home: string = homedir(),
  platform: NodeJS.Platform = process.platform,
): SourceDiscovery {
  return inputType === "copilot-cli" ? discoverCopilotCli(home) : discoverVscode(home, platform);
}
