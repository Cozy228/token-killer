// Ledger ③ store — governance opportunities (metrics-ledger Gap C, §0.1.3).
//
// The hook runtime appends ONE record per `deny`/`suggest` governance decision.
// A `rewrite` is NEVER written here: an executed rewrite later runs as `ctx <cmd>`
// and its saving is already counted in ledger ① — writing it here would
// double-count the same saving. That exclusion is physical (this store only ever
// sees deny/suggest), not a downstream filter.
//
// Privacy (§0.1.3, §2): labels + lengths only. NEVER the command/prompt text, a
// path, or any source content — only the counter kind, the decision, the event
// category label, and a heuristic prompt-token magnitude.

import type { Dirent } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { projectDataDir, projectFingerprint, contexaHome } from "./dataDir.js";
import { parseJsonl } from "./jsonl.js";
import type { GovernanceKind } from "../hook/govern.js";

export type { GovernanceKind };

export type GovernanceRecord = {
  ts: string;
  kind: GovernanceKind;
  decision: "deny" | "suggest";
  // ToolEvent.category label (read | list | search | prompt | …). A label, never
  // command text.
  category: string;
  // Heuristic prompt magnitude, prompt governance only. Folds into ③'s
  // `avoided_tokens_estimate`; never a measured saving.
  estimated_tokens?: number;
  project_fingerprint?: string;
};

export function governanceFile(cwd: string): string {
  return path.join(projectDataDir(cwd), "governance.jsonl");
}

// Append one ③ record. Best-effort callers wrap this so a write error can never
// break the fail-open hook. `rewrite`/`allow` decisions are never passed here.
export async function recordGovernance(
  cwd: string,
  record: Omit<GovernanceRecord, "project_fingerprint">,
): Promise<void> {
  const file = governanceFile(cwd);
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const full: GovernanceRecord = {
    ...record,
    project_fingerprint: projectFingerprint(cwd),
  };
  await writeFile(file, `${JSON.stringify(full)}\n`, { encoding: "utf8", flag: "a", mode: 0o600 });
}

function parseLines(text: string): GovernanceRecord[] {
  return parseJsonl<GovernanceRecord>(text);
}

export async function readGovernance(cwd: string): Promise<GovernanceRecord[]> {
  try {
    return parseLines(await readFile(governanceFile(cwd), "utf8"));
  } catch {
    return [];
  }
}

// User-level read: every project's governance.jsonl. Best-effort — an unreadable
// directory or corrupt file is skipped, never thrown (cold path, fail-open).
export async function listProjectGovernance(): Promise<GovernanceRecord[]> {
  const projectsDir = path.join(contexaHome(), "projects");
  let entries: Dirent[];
  try {
    entries = await readdir(projectsDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const records: GovernanceRecord[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const file = path.join(projectsDir, entry.name, "governance.jsonl");
    try {
      records.push(...parseLines(await readFile(file, "utf8")));
    } catch {
      // skip unreadable / corrupt project store
    }
  }
  return records;
}

// Heuristic action weights (§0.1, ledger ③). A deny avoided the whole cost; a
// suggest only nudged. Reads/searches carry no measured magnitude (we deny BEFORE
// the content is read — its size is unknown and privacy forbids guessing), so they
// contribute to COUNTS only; the token estimate folds prompt magnitudes alone.
const DENY_WEIGHT = 1.0;
const SUGGEST_WEIGHT = 0.4;

export type GovernanceLedger = {
  // §5: counts are an `opportunity`; the token figure is `heuristic`. Carried so a
  // reader can never mistake either for a measured ① saving.
  estimate_kind: "opportunity";
  denied_large_reads: number;
  suggested_broad_searches: number;
  denied_large_prompts: number;
  suggested_large_prompts: number;
  avoided_tokens_estimate: number;
  avoided_tokens_estimate_kind: "heuristic";
};

export function summarizeGovernance(records: GovernanceRecord[]): GovernanceLedger {
  const counts: Record<GovernanceKind, number> = {
    denied_large_reads: 0,
    suggested_broad_searches: 0,
    denied_large_prompts: 0,
    suggested_large_prompts: 0,
  };
  let avoided = 0;
  for (const record of records) {
    // A corrupt / future-version record may carry an unknown kind. `counts[unknown]`
    // is undefined, and `undefined + 1 = NaN` would poison the whole JSON summary, so
    // only tally kinds we know (L8).
    if (record.kind in counts) counts[record.kind] += 1;
    if (record.estimated_tokens && record.estimated_tokens > 0) {
      avoided +=
        record.estimated_tokens * (record.decision === "deny" ? DENY_WEIGHT : SUGGEST_WEIGHT);
    }
  }
  return {
    estimate_kind: "opportunity",
    ...counts,
    avoided_tokens_estimate: Math.round(avoided),
    avoided_tokens_estimate_kind: "heuristic",
  };
}
