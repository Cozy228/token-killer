// Slice 4–5 — `tk inspect` entry (inspect-v1-design.md "Inspect Flags", "Exit
// Codes"). Read-only session scanner + advice generation.
//
// Exit codes: 0 ok (incl. warnings) · 1 user-input/config error · 2 no major
// source analyzable · 3 internal error.

import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { basename, sep } from "node:path";

import {
  buildAdvice,
  DEFAULT_ADVICE_OPTIONS,
  mcpBloatFinding,
  renderAdviceFile,
  renderAdviceMarkdown,
  type AdviceFinding,
} from "./advice.js";
import { analyzeMcpServers } from "./mcp.js";
import { readConfig } from "../core/config.js";
import { listProjectHistoriesSync } from "../core/history.js";
import { buildTelemetry } from "../telemetry/build.js";
import { runColdPathTelemetry } from "../telemetry/dispatch.js";
import { deviceHash, loadOrCreateState } from "../telemetry/state.js";
import { VERSION } from "../version.js";
import { renderStaticContextSection } from "../context/report.js";
import type { ContextFinding, ContextScope, FindingSeverity } from "../context/types.js";
import { writeAdviceArtifacts, writeTelemetryExport } from "./persist.js";
import { emitHtmlReport } from "../report/open.js";
import { analyzeHabits, type HabitStats } from "./habits.js";
import { buildReport, renderJson, renderMarkdown } from "./report.js";
import { computeFootprint } from "./footprint.js";
import { makeFileCache } from "./fileCache.js";
import { makeProgressReporter } from "./progress.js";
import { parseSince, scan, type ScanResult } from "./scan.js";
import { discoverHost, discoverHosts, hostFound, mergeHosts, type InputType } from "./sources.js";
import { persistScopeBuckets, runStaticContext } from "./staticContext.js";
import { buildInspectAggregates } from "./telemetry.js";
import { runtimeFindings, type Finding } from "./unified.js";

type FailOnSeverity = "info" | "warn" | "error";

type InspectArgs = {
  json: boolean;
  text: boolean; // opt out of the default HTML report → terminal markdown
  inputType: InputType;
  inputTypeExplicit: boolean;
  since?: string;
  session?: string;
  advice: boolean;
  writeAdvice: boolean;
  minConfidence: number;
  minOccurrences: number;
  // Static-context scope/analyzer axes (ADR 0003).
  scopeUser: boolean;
  scopeProject: boolean;
  surface?: string;
  failOn?: FailOnSeverity;
  error?: string; // set on a parse error → exit 1
};

function parseNumberFlag(
  value: string | undefined,
  name: string,
): { value?: number; error?: string } {
  if (value === undefined) return { error: `${name} requires a value` };
  const n = Number(value);
  if (!Number.isFinite(n)) return { error: `${name} must be a number` };
  return { value: n };
}

export function parseInspectArgs(argv: string[]): InspectArgs {
  const args: InspectArgs = {
    json: false,
    text: false,
    inputType: "vscode",
    inputTypeExplicit: false,
    advice: false,
    writeAdvice: false,
    minConfidence: DEFAULT_ADVICE_OPTIONS.minConfidence,
    minOccurrences: DEFAULT_ADVICE_OPTIONS.minOccurrences,
    scopeUser: false,
    scopeProject: false,
  };
  const SURFACES = new Set(["instructions", "prompts", "agents", "modes", "skills"]);
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--json") {
      args.json = true;
    } else if (token === "--text") {
      args.text = true;
    } else if (token === "--advice") {
      args.advice = true;
    } else if (token === "--write-advice") {
      args.writeAdvice = true;
    } else if (token === "--input-type") {
      const value = argv[i + 1];
      i += 1;
      args.inputTypeExplicit = true;
      if (value === "vscode" || value === "copilot-cli") args.inputType = value;
      else args.error = `invalid --input-type '${value ?? ""}' (expected vscode | copilot-cli)`;
    } else if (token === "--project") {
      args.scopeProject = true;
    } else if (token === "--user") {
      args.scopeUser = true;
    } else if (token === "--surface") {
      const value = argv[i + 1];
      i += 1;
      if (value && SURFACES.has(value)) args.surface = value;
      else
        args.error = `invalid --surface '${value ?? ""}' (expected instructions | prompts | agents | skills)`;
    } else if (token === "--fail-on") {
      const value = argv[i + 1];
      i += 1;
      if (value === "info" || value === "warn" || value === "error") args.failOn = value;
      else args.error = `invalid --fail-on '${value ?? ""}' (expected info | warn | error)`;
    } else if (token === "--since") {
      const value = argv[i + 1];
      i += 1;
      if (value === undefined) args.error = "--since requires a value (e.g. 7d, 24h, 30m)";
      else args.since = value;
    } else if (token === "--session") {
      const value = argv[i + 1];
      i += 1;
      if (value === undefined) args.error = "--session requires a value";
      else args.session = value;
    } else if (token === "--min-confidence") {
      const r = parseNumberFlag(argv[i + 1], "--min-confidence");
      i += 1;
      if (r.error) args.error = r.error;
      else args.minConfidence = r.value!;
    } else if (token === "--min-occurrences") {
      const r = parseNumberFlag(argv[i + 1], "--min-occurrences");
      i += 1;
      if (r.error) args.error = r.error;
      else args.minOccurrences = r.value!;
    } else {
      args.error = `unknown flag '${token}'`;
    }
  }
  return args;
}

// Severity rank for --fail-on (info < warn < error).
const SEVERITY_RANK: Record<FindingSeverity, number> = { info: 0, warn: 1, error: 2 };

export function runInspect(
  argv: string[],
  nowMs: number = Date.now(),
  home: string = homedir(),
  cwd: string = process.cwd(),
): number {
  let opts: InspectArgs;
  try {
    opts = parseInspectArgs(argv);
  } catch (error) {
    process.stderr.write(`tk inspect: ${error instanceof Error ? error.message : String(error)}\n`);
    return 3;
  }

  if (opts.error) {
    process.stderr.write(`tk inspect: ${opts.error}\n`);
    return 1;
  }

  // Config drives whether the local telemetry aggregate is written (no CLI flag).
  // A parse / out-of-shape config is a user-config error → exit 1 (inspect-v1).
  let telemetryExport = false;
  try {
    telemetryExport = readConfig().telemetryExport;
  } catch (error) {
    process.stderr.write(`tk inspect: ${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }

  let sinceMs: number | undefined;
  if (opts.since !== undefined) {
    const duration = parseSince(opts.since);
    if (duration === undefined) {
      process.stderr.write(
        `tk inspect: invalid --since '${opts.since}' (expected e.g. 7d, 24h, 30m)\n`,
      );
      return 1;
    }
    sinceMs = nowMs - duration;
  }

  // Resolve static-context scopes (ADR 0003): default user-level.
  const scopes: ContextScope[] = [];
  if (opts.scopeUser) scopes.push("user");
  if (opts.scopeProject) scopes.push("project");
  if (scopes.length === 0) scopes.push("user");

  // Progress is a no-op unless STDERR is an interactive TTY (and TK_NO_PROGRESS is
  // unset). It writes only to STDERR, so the report / JSON on STDOUT stays clean.
  const progress = makeProgressReporter();

  try {
    // Runtime analysis (orthogonal to scope).
    let result: ScanResult | undefined;
    let habits: HabitStats | undefined;
    // Host selection: an explicit --input-type scans just that host; otherwise tk
    // scans EVERY known host (vscode + copilot-cli) and merges, so a user driving
    // either is covered without a flag. The host list is shown with the resolved
    // directory so the run reveals WHERE it looked, not only which host.
    const hosts = opts.inputTypeExplicit
      ? [discoverHost(opts.inputType, home)]
      : discoverHosts(home);
    const relHome = (dir: string): string =>
      dir === home ? "~" : dir.startsWith(home + sep) ? `~${dir.slice(home.length)}` : dir;
    progress.phase(
      opts.inputTypeExplicit
        ? `Discovering ${opts.inputType} sources…`
        : `Discovering sources (${hosts.map((h) => h.inputType).join(" + ")})…`,
    );
    for (const h of hosts) {
      progress.phase(
        `  ${h.inputType.padEnd(11)} ${relHome(h.dir)} — ${h.transcriptFiles.length} transcript(s), ${h.sessionFiles.length} session(s)`,
      );
    }
    // Host label for the report (no paths — STDOUT may be saved/shared): the hosts
    // that actually had data, or all attempted hosts when none did.
    const foundHosts = hosts.filter(hostFound);
    const hostsLabel = (foundHosts.length > 0 ? foundHosts : hosts)
      .map((h) => h.inputType)
      .join(" + ");
    const discovery = mergeHosts(hosts);
    if (discovery.found) {
      // One byte-bounded read-through cache shared across scan + habits so each
      // transcript / session file is read from disk once, not twice — while peak
      // memory stays capped on low-RAM hosts with many large transcripts.
      const fileCache = makeFileCache();
      progress.phase(
        `Scanning ${discovery.transcriptFiles.length} transcript(s) + ${discovery.sessionFiles.length} session(s)…`,
      );
      result = scan(discovery, {
        sinceMs,
        session: opts.session,
        onProgress: (done, total, detail) => progress.step(done, total, detail),
        fileCache,
      });
      progress.phase(
        `Scanned ${result.tool_event_count.toLocaleString()} tool event(s) across ${result.session_inventory} session(s).`,
      );
      // Per-session habit metrics feed the cost-tips advice (chronicle parity).
      progress.phase("Analyzing usage habits…");
      habits = analyzeHabits(
        discovery,
        (done, total, detail) => progress.step(done, total, detail),
        fileCache,
      );
      progress.phase(`Analyzed habits across ${habits.sessions} active session(s).`);
    } else {
      progress.done();
      const where = hosts.map((h) => `${h.inputType} (${relHome(h.dir)})`).join(", ");
      process.stderr.write(
        `tk inspect: no session sources found in ${where} (this is normal if the host stores transcripts elsewhere).\n`,
      );
    }

    // Static-context analysis (always runs, scope-aware).
    progress.phase("Analyzing context files…");
    const sc = runStaticContext({
      scopes,
      surface: opts.surface,
      home,
      cwd,
      onProgress: (done, total, detail) => progress.step(done, total, detail),
    });
    const staticFindings: ContextFinding[] = sc.result.findings;
    progress.phase(`Analyzed ${sc.result.files_scanned} context file(s).`);

    // Exit 2 only when BOTH runtime and static context are empty (goal exit table).
    // "static empty" means no files scanned AND no synthesized findings (e.g. the
    // VS Code settings finding, which has no scanned markdown file behind it).
    const runtimeEmpty = !result || result.tool_event_count === 0;
    const staticEmpty = sc.result.files_scanned === 0 && sc.result.findings.length === 0;
    if (runtimeEmpty && staticEmpty) {
      progress.done();
      process.stderr.write(
        "tk inspect: no major source analyzable (no runtime session events and no static-context files found).\n",
      );
      return 2;
    }

    progress.phase("Building report…");

    // MCP server-count analysis is config-derived (applies even with no runtime
    // data). Computed here so the aggregated runtime findings can fold it in with a
    // real `where` (the config file), and the advice appendix can reuse it.
    const mcp = analyzeMcpServers(home, cwd);

    // Session footprint — the standing per-session token cost (instructions, skills,
    // custom agents, MCP estimate). Mirrors Claude Code's /context standing breakdown.
    const footprint = computeFootprint({ scopes, home, cwd, mcp });

    // Aggregated, actionable runtime findings (NOT one-per-tool): delivery,
    // orientation cost, repeated failures, dependency reads, habit tips, MCP bloat.
    const rtFindings = runtimeFindings(result, habits, mcp);
    const unifiedFindings: Finding[] = [...rtFindings, ...staticFindings];

    // Persist the per-scope unified Finding[] buckets that `tk optimize context`
    // consumes (ADR 0003). Runtime findings are written into each produced bucket.
    persistScopeBuckets({
      scopes,
      staticFindings,
      runtimeFindings: rtFindings,
      generatedAt: new Date(nowMs).toISOString(),
      files_scanned: sc.result.files_scanned,
      cwd,
    });

    // Advice is computed ALWAYS (not just under --advice) so the default report can
    // LEAD with action items — what the user should do — instead of a raw data table.
    // --advice/--write-advice still control the verbose appendix and on-disk artifacts.
    let findings: AdviceFinding[] = [];
    if (result) {
      findings = buildAdvice(
        result,
        {
          minConfidence: opts.minConfidence,
          minOccurrences: opts.minOccurrences,
        },
        habits,
      );
    }
    // MCP server-count advice for the --advice/--write-advice appendix (the HTML
    // report shows the unified `mcp_bloat` runtime finding instead). Reuses the `mcp`
    // analysis computed above.
    const mcpFinding = mcpBloatFinding(mcp.servers.length, mcp.servers);
    if (mcpFinding) findings = [...findings, mcpFinding];

    const report = buildReport(
      result ?? emptyScanResult(opts.inputType),
      new Date(nowMs).toISOString(),
      undefined,
      findings,
    );
    report.static_context = { files_scanned: sc.result.files_scanned, findings: staticFindings };
    report.findings = unifiedFindings;
    report.footprint = footprint;
    // Reflect EVERY host scanned (e.g. "vscode + copilot-cli"), not just the
    // representative one ScanResult carries.
    report.inputType = hostsLabel;

    const reportJson = renderJson(report);
    const staticSection = renderStaticContextSection({
      files_scanned: sc.result.files_scanned,
      findings: staticFindings,
    });
    const reportMarkdown = `${renderMarkdown(report)}\n${staticSection}`;

    // --write-advice: persist the advice artifacts to disk (stable names) and print
    // a confirmation. Independent of the display mode — it does not open/print the
    // report itself.
    if (opts.writeAdvice) {
      const written = writeAdviceArtifacts({
        reportMarkdown,
        reportJson,
        adviceMarkdown: renderAdviceFile(findings),
      });
      process.stdout.write(`Wrote advice artifacts:\n${written.map((p) => `  ${p}`).join("\n")}\n`);
    }

    // Telemetry export: allow-listed aggregates only (config-gated, no CLI flag). No
    // endpoint in the generic package → write locally + warn; never fail the run.
    if (telemetryExport && result) {
      // Payload v2 is ALWAYS user-level (ADR 0004 §5); the inspect scan only
      // contributes the optional inspect aggregates.
      const state = loadOrCreateState(new Date(nowMs));
      const telemetry = buildTelemetry({
        records: listProjectHistoriesSync(),
        version: VERSION,
        deviceHash: deviceHash(state),
        firstSeenAt: state.firstSeenAt,
        now: new Date(nowMs),
        runId: randomUUID(),
        inspect: buildInspectAggregates(result, findings),
      });
      const path = writeTelemetryExport(`${JSON.stringify(telemetry, null, 2)}\n`);
      process.stderr.write(
        `tk inspect: no telemetry endpoint configured; wrote local export: ${path}\n`,
      );
    }

    // Display. Default is the single-file HTML report (built + opened); --text prints
    // terminal markdown, --json prints JSON. --write-advice already emitted its own
    // confirmation, so it suppresses the report stream.
    if (!opts.writeAdvice) {
      if (opts.json) {
        process.stdout.write(reportJson);
      } else if (opts.text) {
        process.stdout.write(reportMarkdown);
        if (opts.advice) process.stdout.write(`\n${renderAdviceMarkdown(findings)}\n`);
      } else {
        emitHtmlReport(
          {
            kind: "inspect",
            title: "Your token-saving opportunities",
            subtitle: "Where your AI setup wastes tokens, and how to fix it.",
            generatedAt: new Date(nowMs).toISOString(),
            data: {
              scope: scopes.includes("project") ? "project" : "user",
              // Name the actual project (cwd basename) so a project-scoped report
              // says "Covers <name>" instead of the ambiguous "this project".
              project: scopes.includes("project") ? basename(cwd) : undefined,
              files_scanned: sc.result.files_scanned,
              sessions_analyzed: result?.session_inventory ?? 0,
              footprint,
              findings: unifiedFindings.map((f) => ({
                severity: f.severity,
                type: f.type,
                file: (f as { file?: string }).file,
                start_line: (f as { start_line?: number }).start_line,
                // Runtime findings carry an actionable `where` instead of a file.
                where: (f as { where?: string }).where,
                evidence: f.evidence,
                recommendation: f.recommendation,
                fix_class: f.fix_class,
              })),
            },
          },
          nowMs,
        );
      }
    }

    // Cold-path NETWORK telemetry (ADR 0004 §5), gated on `telemetry` consent +
    // a build-time endpoint. Separate from telemetryExport local-export consent
    // above. Always user-level; the scan contributes the optional inspect
    // aggregates. Best-effort — never changes the exit code.
    runColdPathTelemetry({
      records: listProjectHistoriesSync(),
      now: new Date(nowMs),
      runId: randomUUID(),
      inspect: result ? buildInspectAggregates(result, findings) : undefined,
    });

    // --fail-on: opt-in non-zero exit (4, never reuses 2) when any finding is at
    // or above the requested severity. Findings never change the exit code on
    // their own — inspect is diagnostic, not enforcement.
    if (opts.failOn) {
      const threshold = SEVERITY_RANK[opts.failOn];
      const hit = unifiedFindings.some((f) => SEVERITY_RANK[f.severity] >= threshold);
      if (hit) return 4;
    }

    return 0;
  } catch (error) {
    progress.done();
    process.stderr.write(
      `tk inspect: internal error: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    return 3;
  }
}

// A zero-event ScanResult so the runtime report renders cleanly when no runtime
// session sources are found, without special-casing every field.
function emptyScanResult(inputType: InputType): ScanResult {
  return {
    inputType,
    session_inventory: 0,
    transcript_coverage: 0,
    tool_event_count: 0,
    unknown_time_records: 0,
    coverage_errors: 0,
    opportunities: [],
  };
}
