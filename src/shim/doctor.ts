// `tk doctor` — diagnose (and with --fix repair) BOTH halves of a tk install:
//   1. delivery: the install matrix (hook / shim / injection / guidance) — reuses the
//      status gather so a broken tier is re-installed via the existing installer.
//   2. records: the per-project metrics store (rollup freshness, duplicate/empty/orphan
//      buckets) — reuses core/recordsHealth so reports never show a bare-hash project.
//
// Read-only by default (it prints "would fix …"); `--fix` applies repairs. This verb
// replaced `tk status` (cli.ts prints a rename hint for the old name).

import { existsSync } from "node:fs";

import { ensureProjectMeta } from "../core/history.js";
import {
  archiveUnresolvedOrphans,
  diagnoseRecords,
  mergeDuplicateBuckets,
  pruneEmptyBuckets,
  rebuildAllRollups,
  recordsStoreExists,
  recoverOrphanNames,
  type RecordsReport,
} from "../core/recordsHealth.js";
import { discoverHosts, hostFound, type HostDiscovery } from "../inspect/sources.js";
import { installedTierIds } from "./capability.js";
import { gatherStatus, renderStatusReport, runInstall, type StatusGather } from "./init.js";

function out(line = ""): void {
  process.stdout.write(`${line}\n`);
}

const USAGE = [
  "tk doctor [--fix] [scan-root]",
  "",
  "  Diagnose tk's install + metrics health. Read-only by default.",
  "  --fix        Repair broken delivery tiers and normalize the metrics store",
  "  scan-root    Optional dir to scan for git repos; recovers real names for orphan",
  "               buckets. Unmatched orphans are archived (token totals preserved).",
  "  --help       Show this usage",
].join("\n");

type DoctorArgs = { fix: boolean; help: boolean; scanRoot?: string };

function parseDoctorArgs(argv: string[]): DoctorArgs {
  const args: DoctorArgs = { fix: false, help: false };
  for (const token of argv) {
    if (token === "--fix") args.fix = true;
    else if (token === "--help" || token === "-h") args.help = true;
    else if (!token.startsWith("-") && args.scanRoot === undefined) args.scanRoot = token;
    // Any other flag is ignored — doctor is non-destructive without --fix, and the only
    // positional it accepts is the scan root.
  }
  return args;
}

// Which expected delivery tiers for the recorded install host are NOT live right now.
// Empty ⇒ the install is intact; non-empty ⇒ --fix re-runs the installer for that host.
function missingTiers(status: StatusGather): string[] {
  const host = status.matrix.installedHost;
  if (!host) return [];
  const live = new Set<string>(status.matrix.tiers.filter((t) => t.installed).map((t) => t.tier));
  return installedTierIds(host).filter((tier) => !live.has(tier));
}

function shortHash(fingerprint: string): string {
  return fingerprint.replace(/^repo:/, "").slice(0, 8);
}

const HOST_LABEL: Record<HostDiscovery["inputType"], string> = {
  vscode: "VS Code (Copilot)",
  "copilot-cli": "Copilot CLI",
};

// Diagnose each agent host's SESSION-DATA ROOT — the directory `tk inspect` reads to
// find missed token-saving opportunities (VS Code's user-storage chatSessions, Copilot
// CLI's ~/.copilot/session-state). tk cannot repair a host's own data, so this is
// REPORT-ONLY: it surfaces WHERE tk looks and whether anything is there, so a "no
// opportunities" inspect result can be told apart from "the root is missing/empty/wrong"
// (the actual misconfiguration). Reuses inspect's discovery so doctor and inspect can
// never disagree about which roots are scanned.
function renderSessionData(hosts: HostDiscovery[]): void {
  out();
  out("  Session data roots (read by `tk inspect`):");
  for (const h of hosts) {
    const label = HOST_LABEL[h.inputType];
    if (hostFound(h)) {
      out(
        `    [found  ] ${label}: ${h.dir} — ${h.sessionFiles.length} session(s), ${h.transcriptFiles.length} transcript(s)`,
      );
    } else if (existsSync(h.dir)) {
      out(`    [empty  ] ${label}: ${h.dir} — root present, no sessions found`);
    } else {
      out(`    [absent ] ${label}: ${h.dir} — root absent (host not installed, or data elsewhere)`);
    }
  }
}

// Print the records section. `fix=false` marks each fixable finding "would fix"; in fix
// mode the findings are shown plainly (the actions are reported by the repair pass).
function renderRecordsReport(
  report: RecordsReport | undefined,
  fix: boolean,
  scanRoot?: string,
): void {
  out();
  out("  Records health:");
  if (!report) {
    out("    (no metrics store yet — nothing to check)");
    return;
  }
  const tag = fix ? "found" : "would fix";
  out(`    ${report.buckets.length} project bucket(s) under ${report.projectsDir}`);

  if (report.staleRollups.length > 0) {
    out(
      `    [${tag}] ${report.staleRollups.length} stale/missing rollup cache(s) — rebuild from history`,
    );
  }
  if (report.dupGroups.length > 0) {
    const which = report.dupGroups.map((g) => shortHash(g.fingerprint)).join(", ");
    out(
      `    [${tag}] ${report.dupGroups.length} duplicate bucket group(s) (repo:/repo- split): ${which}`,
    );
  }
  // Dedupe by fingerprint: a repo:/repo- duplicate pair is ONE logical orphan (the
  // dup is merged first under --fix), so the preview must not count it twice.
  const orphans = [...new Map(report.orphanBuckets.map((b) => [b.fingerprint, b])).values()];
  if (orphans.length > 0) {
    const names = orphans.map((b) => b.displayName).join(", ");
    out(`    [${tag}] ${orphans.length} orphan bucket(s) shown as a bare hash: ${names}`);
    if (!scanRoot) {
      out(
        "             pass a scan-root to recover real names; unmatched ones are archived (tokens kept)",
      );
    }
  }
  if (report.emptyBuckets.length > 0) {
    out(`    [${tag}] ${report.emptyBuckets.length} empty bucket(s) — prune`);
  }
  if (
    report.staleRollups.length === 0 &&
    report.dupGroups.length === 0 &&
    report.orphanBuckets.length === 0 &&
    report.emptyBuckets.length === 0
  ) {
    out("    all buckets healthy — no normalization needed");
  }
}

function anyInstallOrRecordIssue(status: StatusGather, report: RecordsReport | undefined): boolean {
  if (missingTiers(status).length > 0) return true;
  if (!report) return false;
  return (
    report.staleRollups.length > 0 ||
    report.dupGroups.length > 0 ||
    report.orphanBuckets.length > 0 ||
    report.emptyBuckets.length > 0
  );
}

// Repair the delivery install by re-running the existing installer for the recorded
// host (idempotent: re-bakes shim paths, rewrites the hook config, etc.). Doctor never
// AUTO-installs a host that was never set up — it only repairs an existing install.
function repairInstalls(status: StatusGather): void {
  const host = status.matrix.installedHost;
  if (!host) {
    out(
      "    install: no prior install recorded — run `tk install` first (doctor won't auto-install)",
    );
    return;
  }
  const missing = missingTiers(status);
  if (missing.length === 0) {
    out(`    install: all expected tiers present for ${host} — nothing to repair`);
    return;
  }
  out(`    install: re-installing ${host} (missing tiers: ${missing.join(", ")})`);
  runInstall(["--host", host]);
}

// Normalize the metrics store. Order matters: heal the current repo's own name first
// (so it is never mistaken for an orphan), merge duplicate spellings, recover orphan
// names from the scan root, archive whatever stays unresolved (token totals preserved),
// prune dead dirs, then rebuild every rollup cache LAST so merged/archived buckets get
// a fresh cache.
async function repairRecords(scanRoot?: string): Promise<void> {
  try {
    await ensureProjectMeta(process.cwd());
  } catch {
    /* current repo may have no bucket yet — harmless */
  }

  const dup = mergeDuplicateBuckets();
  if (dup.merged > 0)
    out(`    merged ${dup.merged} duplicate bucket(s): ${dup.details.join("; ")}`);

  if (scanRoot) {
    const rec = recoverOrphanNames(scanRoot);
    out(
      `    scanned ${scanRoot}: recovered ${rec.recovered.length} project name(s)` +
        (rec.unmatched > 0 ? `, ${rec.unmatched} still unmatched` : ""),
    );
    for (const r of rec.recovered) out(`      ${shortHash(r.fingerprint)} → ${r.label}`);
  }

  const arch = archiveUnresolvedOrphans();
  if (arch.archived > 0) {
    out(`    archived ${arch.archived} unresolved orphan(s) → 'archived' (token totals preserved)`);
  }

  const pruned = pruneEmptyBuckets();
  if (pruned.pruned > 0) out(`    pruned ${pruned.pruned} empty bucket(s)`);

  const stale = await rebuildAllRollups();
  out(`    rebuilt rollup caches${stale > 0 ? ` (${stale} were stale)` : ""}`);
}

export async function runDoctor(argv: string[] = []): Promise<number> {
  const args = parseDoctorArgs(argv);
  if (args.help) {
    out(USAGE);
    return 0;
  }
  const fix = args.fix;

  // 1. Delivery install section (also refreshes the verification timestamp).
  const status = await gatherStatus();
  renderStatusReport(status);

  // 2. Host session-data roots — the inputs `tk inspect` reads (report-only).
  renderSessionData(discoverHosts());

  // 3. Records section.
  const report = recordsStoreExists() ? diagnoseRecords() : undefined;
  renderRecordsReport(report, fix, args.scanRoot);

  if (!fix) {
    if (anyInstallOrRecordIssue(status, report)) {
      out();
      out("  Run `tk doctor --fix [scan-root]` to apply the repairs above.");
    }
    return 0;
  }

  // 3. Apply repairs.
  out();
  out("  Applying repairs:");
  repairInstalls(status);
  await repairRecords(args.scanRoot);
  out();
  out("  Done. Run `tk gain --user` to see the normalized report.");
  return 0;
}
