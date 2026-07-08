// `ctx debug` data collection (docs/debug-command-goal.md §collect). Gathers a
// self-contained diagnostic snapshot of ctx-on-this-machine so a reviewer with ONLY
// the bundle + the source tree can locate most problems. Pure-ish: it does I/O
// reads (history, governance, host configs, raw snapshots) and one best-effort local
// probe (the shim interception spawn + chcp), but never touches the network and
// writes nothing. All reads are best-effort — a missing/unreadable artifact is
// recorded as `available: false`, never thrown, so the bundle is always produced.
//
// Reuses the existing readers/aggregators rather than re-deriving them:
//   history.ts listProjectHistories (cross-fingerprint), aggregate.ts summarize/
//   byHost/byCommand/sourceAdapterMix, governance.ts summarizeGovernance, the hook/
//   shim status helpers, rewrite.ts rewriteCommand, dataDir.ts resolveStoredPath.

import { spawnSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { delimiter } from "node:path";

import {
  byCommand,
  byHost,
  FALLBACK_HANDLER,
  sourceAdapterMix,
  summarize,
  type GainSummary,
  type LabelRollup,
} from "../core/aggregate.js";
import { resolveStoredPath, contexaHome } from "../core/dataDir.js";
import { listProjectHistories, type HistoryRecord } from "../core/history.js";
import {
  listProjectGovernance,
  summarizeGovernance,
  type GovernanceLedger,
} from "../core/governance.js";
import { debugLogPath } from "../hook/debug.js";
import { claudeHookStatus, claudeSettingsPath } from "../hook/claudeInstall.js";
import {
  copilotHookConfigPath,
  copilotHookConfigStatus,
  resolveHookCommand,
} from "../hook/install.js";
import { rewriteCommand } from "../hook/rewrite.js";
import { detectHost, gatherDetectEnv, type Host } from "../shim/detect.js";
import { guidanceFilePath } from "../shim/guidance.js";
import { adapters } from "../shim/hostAdapter.js";
import { vscodeUserDir } from "../shim/hostConfig.js";
import { readManifest, shimDir } from "../shim/install.js";
import { runInterceptionProbe, type ProbeResult } from "../shim/probe.js";
import { VERSION } from "../version.js";

// A raw passthrough this big is a missed-handler opportunity worth surfacing as an
// anomaly even though it "passed" — the reviewer wants to know ctx shipped 2k+ tokens
// uncompressed (no handler / fell through the gate).
export const LARGE_RAW_TOKENS = 2000;

// How many trailing rows to show for the failure feed + how many rewrite probes.
const RECENT_FAILURES = 10;

// Representative commands run through the rewrite engine so the bundle shows what
// the hook WOULD do on this machine (mix of rewrite + pass, the two outcomes a
// reviewer needs to distinguish "engine works" from "engine inert").
const REWRITE_PROBES = ["git status", "git log -5", "grep -rn foo .", "ls -la"];

export type FileCapture = {
  path: string;
  available: boolean;
  bytes?: number;
  content?: string; // omitted under --redact (length-only)
};

export type RewriteProbe = { command: string; decision: string; detail?: string };

// The result of actually RUNNING the binary a wired hook points at. `pointsAtTk`
// only proves the settings string looks like ctx; it says nothing about whether the
// referenced binary still exists or loads. A dangling path (nvm node bumped, `npm
// rm -g`), a corrupt dist, or the wrong node makes the hook crash on every tool
// call while still reading as "wired" — the "installed but broken" case the spec
// exists to surface. `ran:false` ⇒ nothing to probe (no installed command).
export type ExecProbe = {
  ran: boolean;
  ok: boolean;
  exitCode: number | null;
  detail: string; // version line on success, or the failure reason
};

export type AnomalyRow = {
  record: HistoryRecord;
  snapshot: FileCapture; // the raw_output_path snapshot, or available:false if missing
};

export type DebugBundle = {
  generatedAt: string;
  redacted: boolean;
  full: boolean;
  env: {
    version: string;
    platform: string;
    arch: string;
    nodeVersion: string;
    shell?: string;
    termProgram?: string;
    detectedHost: Host;
    locale?: string;
    lang?: string;
    windowsCodepage?: string;
    contexaHome: string;
    cliPath: string;
    execPath: string;
  };
  delivery: {
    claudeHook: {
      path: string;
      present: boolean;
      pointsAtTk: boolean;
      command: string;
      exec: ExecProbe;
    };
    copilotHook: { path: string; present: boolean; managed: boolean };
    injection: { path: string; present: boolean };
    shim: {
      dir: string;
      dirExists: boolean;
      manifest?: { version: string; schema: number; programs: number };
      onPath: boolean;
      pathPosition: number;
      firstOnPath: boolean;
      probe: ProbeResult;
    };
    rewriteProbes: RewriteProbe[];
    recentFailures: HistoryRecord[];
    anyWired: boolean;
    // A hook is wired (string matches ctx) but the binary it points at failed to run
    // — installed-but-broken. The headline distinguishes this from a clean "wired".
    brokenHook: boolean;
  };
  commands: HistoryRecord[];
  anomalies: AnomalyRow[];
  // Non-anomaly rows that HAVE a snapshot but whose payload we suppressed (only
  // populated when !full). Under --full these are attached so the reviewer can read
  // every payload; otherwise the renderer prints the count + "add --full" hint.
  omittedPayloads: AnomalyRow[];
  aggregates: {
    summary: GainSummary;
    byHost: LabelRollup[];
    byCommand: LabelRollup[];
    sourceAdapterMix: Record<string, number>;
  };
  governance: GovernanceLedger;
  debugLog: FileCapture;
  hostConfigs: Array<{ label: string } & FileCapture>;
};

export type CollectOptions = { cwd: string; full: boolean; redact: boolean };

// Read a text file for the bundle. Under --redact we capture only the byte length
// (no content leaves the machine). Missing/unreadable ⇒ available:false.
async function loadFile(path: string, redact: boolean): Promise<FileCapture> {
  try {
    if (redact) {
      const { size } = await stat(path);
      return { path, available: true, bytes: size };
    }
    const content = await readFile(path, "utf8");
    return { path, available: true, bytes: Buffer.byteLength(content), content };
  } catch {
    return { path, available: false };
  }
}

// A row is anomalous when ctx did something the reviewer should look at: the filter
// threw (fallback), the quality gate flagged it (inflated/empty_output/failure), the
// tool failed (exit≠0), the output INFLATED (saved<0), or a big raw passthrough slid
// by uncompressed. quality_status absent ⇒ a legacy un-gated pass (not anomalous).
function isAnomaly(r: HistoryRecord): boolean {
  if (r.handler === FALLBACK_HANDLER) return true;
  if (r.quality_status !== undefined && r.quality_status !== "passed") return true;
  if (r.exit_code !== 0) return true;
  if (r.saved_tokens < 0) return true;
  if (r.handler === "raw" && r.raw_tokens >= LARGE_RAW_TOKENS) return true;
  return false;
}

async function loadSnapshot(r: HistoryRecord, redact: boolean): Promise<FileCapture> {
  if (!r.raw_output_path) return { path: "", available: false };
  return loadFile(resolveStoredPath(r.raw_output_path), redact);
}

// Best-effort Windows console code page (the GBK/cp936 命门). Off Windows the locale
// is UTF-8 so this is skipped. Never throws.
function detectCodepage(): string | undefined {
  if (process.platform !== "win32") return undefined;
  try {
    const out = spawnSync("chcp.com", [], { encoding: "utf8", windowsHide: true, timeout: 1000 });
    const match = /(\d{2,6})/.exec(out.stdout ?? "");
    return match ? match[1] : undefined;
  } catch {
    return undefined;
  }
}

// Split a hook command string into argv, honoring the double/single quotes that
// resolveHookCommand adds around paths containing spaces.
export function tokenizeCommand(cmd: string): string[] {
  const tokens: string[] = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(cmd)) !== null) tokens.push(m[1] ?? m[2] ?? m[3] ?? "");
  return tokens;
}

// Run the binary a hook command points at to confirm it actually loads. We strip
// the trailing `hook <surface>` and run the same `<node> <cli>` with `--version`
// instead — side-effect-free (a real hook event would append to debug.log), but it
// exercises the exact module-resolution path that a dangling/corrupt install fails.
// MODULE_NOT_FOUND or a non-zero exit ⇒ the hook crashes on every tool call.
export function probeHookBinary(command: string | undefined): ExecProbe {
  if (!command || command.trim() === "") {
    return { ran: false, ok: false, exitCode: null, detail: "no installed command" };
  }
  const argv = tokenizeCommand(command);
  // Drop a trailing `hook <surface>` so we invoke `<node> <cli> --version`; keep at
  // least the first token if the command is unexpectedly short.
  const endsWithHook = argv.length >= 2 && argv[argv.length - 2] === "hook";
  const head = endsWithHook ? argv.slice(0, -2) : argv.slice();
  const [bin, ...rest] = head.length > 0 ? head : argv;
  if (!bin) return { ran: false, ok: false, exitCode: null, detail: "empty command" };
  try {
    const r = spawnSync(bin, [...rest, "--version"], {
      encoding: "utf8",
      timeout: 5000,
      windowsHide: true,
    });
    if (r.error) {
      return { ran: true, ok: false, exitCode: null, detail: r.error.message };
    }
    const out = `${r.stdout ?? ""}${r.stderr ?? ""}`.trim();
    const moduleError = /cannot find module|module_not_found|no such file/i.test(out);
    const ok = r.status === 0 && !moduleError;
    const lines = out.split("\n").map((l) => l.trim());
    // On success the (only) line is the version. On failure Node's first stderr line
    // is the useless loader-frame header (`node:internal/modules/cjs/loader:…`); pick
    // the actual `Error:`/module-resolution line so the bundle shows why it broke.
    const errorLine = lines.find((l) =>
      /error:|cannot find module|module_not_found|no such file/i.test(l),
    );
    return {
      ran: true,
      ok,
      exitCode: r.status,
      detail: ok ? lines[0] || "ran ok" : errorLine || lines[0] || `exit ${r.status}`,
    };
  } catch (error) {
    return {
      ran: true,
      ok: false,
      exitCode: null,
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

function collectEnv(host: Host): DebugBundle["env"] {
  let locale: string | undefined;
  try {
    locale = new Intl.DateTimeFormat().resolvedOptions().locale;
  } catch {
    locale = undefined;
  }
  return {
    version: VERSION,
    platform: process.platform,
    arch: process.arch,
    nodeVersion: process.version,
    shell: process.env.SHELL ?? process.env.ComSpec,
    termProgram: process.env.TERM_PROGRAM,
    detectedHost: host,
    locale,
    lang: process.env.LANG ?? process.env.LC_ALL ?? process.env.LC_CTYPE,
    windowsCodepage: detectCodepage(),
    contexaHome: contexaHome(),
    cliPath: process.argv[1] ?? "(unknown)",
    execPath: process.execPath,
  };
}

function injectionTarget(host: Host): string {
  const vscodeDir = existsSync(vscodeUserDir()) ? vscodeUserDir() : undefined;
  return adapters[host].injectionPath(homedir(), vscodeDir);
}

function collectDelivery(host: Host, records: HistoryRecord[]): DebugBundle["delivery"] {
  const claude = claudeHookStatus({});
  const copilot = copilotHookConfigStatus({ project: false });
  const injectionPath = injectionTarget(host);
  const injectionPresent = existsSync(injectionPath);

  const dir = shimDir();
  const manifest = readManifest();
  const pathEntries = (process.env.PATH ?? "").split(delimiter);
  const pathPosition = pathEntries.indexOf(dir);

  // The interception spawn — the load-bearing "shim装了但没拦截" signal. Best-effort:
  // wrap it so a hostile environment can never crash the bundle.
  let probe: ProbeResult;
  try {
    probe = runInterceptionProbe(dir);
  } catch {
    probe = { pass: false, resolved: null, program: "git" };
  }

  const rewriteProbes: RewriteProbe[] = REWRITE_PROBES.map((command) => {
    const r = rewriteCommand(command);
    return { command, decision: r.decision, detail: r.rewritten ?? r.reason };
  });

  const recentFailures = records
    .filter((r) => r.quality_status === "failure")
    .slice(-RECENT_FAILURES);

  // Run the binary the installed claude hook actually names — the "装坏" check. Only
  // a present hook is worth probing; absent ⇒ ran:false. Best-effort, never throws.
  const claudeExec = claude.present
    ? probeHookBinary(claude.installedCommand)
    : { ran: false, ok: false, exitCode: null, detail: "no claude hook installed" };
  // Wired by string but the binary won't run = installed-but-broken.
  const brokenHook = claude.present && claude.pointsAtTk && claudeExec.ran && !claudeExec.ok;

  return {
    claudeHook: {
      path: claude.path,
      present: claude.present,
      pointsAtTk: claude.pointsAtTk,
      command: resolveHookCommand("claude"),
      exec: claudeExec,
    },
    copilotHook: { path: copilot.path, present: copilot.present, managed: copilot.managed },
    injection: { path: injectionPath, present: injectionPresent },
    shim: {
      dir,
      dirExists: existsSync(dir),
      manifest: manifest
        ? { version: manifest.version, schema: manifest.schema, programs: manifest.programs.length }
        : undefined,
      onPath: pathPosition >= 0,
      pathPosition,
      firstOnPath: pathPosition === 0,
      probe,
    },
    rewriteProbes,
    recentFailures,
    anyWired: claude.pointsAtTk || copilot.managed || pathPosition >= 0 || injectionPresent,
    brokenHook,
  };
}

async function collectHostConfigs(
  host: Host,
  redact: boolean,
): Promise<Array<{ label: string } & FileCapture>> {
  const targets: Array<{ label: string; path: string }> = [
    { label: "claude-code settings.json", path: claudeSettingsPath({}) },
    { label: "copilot ctx-rewrite.json", path: copilotHookConfigPath({ project: false }) },
    { label: "instruction injection", path: injectionTarget(host) },
  ];
  const claudeGuidance = guidanceFilePath("claude-code");
  if (claudeGuidance) targets.push({ label: "claude-code CTX.md", path: claudeGuidance });
  const copilotGuidance = guidanceFilePath("copilot-cli");
  if (copilotGuidance) targets.push({ label: "copilot-cli CTX.md", path: copilotGuidance });

  const out: Array<{ label: string } & FileCapture> = [];
  for (const t of targets) {
    const capture = await loadFile(t.path, redact);
    // Only include artifacts that actually exist on disk — an absent CTX.md/injection
    // is normal (tier not used) and listing it as "unavailable" is noise. Hook
    // configs are always listed (present-or-absent IS the diagnostic).
    if (
      capture.available ||
      t.label.includes("settings.json") ||
      t.label.includes("rewrite.json")
    ) {
      out.push({ label: t.label, ...capture });
    }
  }
  return out;
}

export async function collectDebugBundle(opts: CollectOptions): Promise<DebugBundle> {
  const host = detectHost(gatherDetectEnv());
  const commands = (await listProjectHistories()).sort((a, b) =>
    a.timestamp.localeCompare(b.timestamp),
  );

  // Anomalies always carry their payload (no truncation, ever). Non-anomaly rows
  // with a snapshot are suppressed unless --full.
  const anomalies: AnomalyRow[] = [];
  const omittedPayloads: AnomalyRow[] = [];
  for (const record of commands) {
    if (isAnomaly(record)) {
      anomalies.push({ record, snapshot: await loadSnapshot(record, opts.redact) });
    } else if (record.raw_output_path) {
      // Has a payload on disk but isn't anomalous → suppressed unless --full. The
      // suppressed count must reflect payloads ACTUALLY on disk, so verify existence
      // rather than trusting the record's pointer (a cleaned-up snapshot would
      // otherwise overstate the count).
      if (opts.full) {
        omittedPayloads.push({ record, snapshot: await loadSnapshot(record, opts.redact) });
      } else if (existsSync(resolveStoredPath(record.raw_output_path))) {
        omittedPayloads.push({
          record,
          snapshot: { path: record.raw_output_path, available: true },
        });
      }
    }
  }

  const governance = summarizeGovernance(await listProjectGovernance());

  return {
    generatedAt: new Date().toISOString(),
    redacted: opts.redact,
    full: opts.full,
    env: collectEnv(host),
    delivery: collectDelivery(host, commands),
    commands,
    anomalies,
    omittedPayloads,
    aggregates: {
      summary: summarize(commands),
      byHost: byHost(commands),
      byCommand: byCommand(commands),
      sourceAdapterMix: sourceAdapterMix(commands),
    },
    governance,
    debugLog: await loadFile(debugLogPath(), opts.redact),
    hostConfigs: await collectHostConfigs(host, opts.redact),
  };
}
