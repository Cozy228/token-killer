// Slice 4–5 — `tk inspect` entry (inspect-v1-design.md "Inspect Flags", "Exit
// Codes"). Read-only session scanner + advice generation.
//
// Exit codes: 0 ok (incl. warnings) · 1 user-input/config error · 2 no major
// source analyzable · 3 internal error.

import { randomUUID } from "node:crypto";
import { homedir } from "node:os";

import {
  buildAdvice,
  DEFAULT_ADVICE_OPTIONS,
  renderAdviceFile,
  renderAdviceMarkdown,
  type AdviceFinding,
} from "./advice.js";
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
import { gatherRepoContext } from "./repoContext.js";
import { buildReport, renderJson, renderMarkdown } from "./report.js";
import { parseSince, scan, type ScanResult } from "./scan.js";
import { discoverSources, type InputType } from "./sources.js";
import { persistScopeBuckets, runStaticContext } from "./staticContext.js";
import { buildInspectAggregates } from "./telemetry.js";
import { runtimeFindings, type Finding } from "./unified.js";

type FailOnSeverity = "info" | "warn" | "error";

type InspectArgs = {
  json: boolean;
  html: boolean;
  inputType: InputType;
  inputTypeExplicit: boolean;
  since?: string;
  session?: string;
  repoContext: boolean;
  advice: boolean;
  writeAdvice: boolean;
  telemetryExport: boolean; // default from config.jsonc; CLI flag overrides
  telemetryExportExplicit: boolean; // true once --telemetry-export/--no- seen
  minConfidence: number;
  minOccurrences: number;
  // Static-context scope/analyzer axes (ADR 0003).
  scopeUser: boolean;
  scopeProject: boolean;
  copilotContext: boolean; // static-context analyzers only (runtime off)
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
    html: false,
    inputType: "vscode",
    inputTypeExplicit: false,
    repoContext: false,
    advice: false,
    writeAdvice: false,
    telemetryExport: false,
    telemetryExportExplicit: false,
    minConfidence: DEFAULT_ADVICE_OPTIONS.minConfidence,
    minOccurrences: DEFAULT_ADVICE_OPTIONS.minOccurrences,
    scopeUser: false,
    scopeProject: false,
    copilotContext: false,
  };
  const SURFACES = new Set(["instructions", "prompts", "agents", "skills"]);
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--json") {
      args.json = true;
    } else if (token === "--html") {
      args.html = true;
    } else if (token === "--repo-context") {
      args.repoContext = true;
    } else if (token === "--advice") {
      args.advice = true;
    } else if (token === "--write-advice") {
      args.writeAdvice = true;
    } else if (token === "--telemetry-export") {
      args.telemetryExport = true;
      args.telemetryExportExplicit = true;
    } else if (token === "--no-telemetry-export") {
      args.telemetryExport = false;
      args.telemetryExportExplicit = true;
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
    } else if (token === "--copilot-context") {
      args.copilotContext = true;
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

  // Config provides the telemetryExport default; a CLI flag still overrides it.
  // A parse / out-of-shape config is a user-config error → exit 1 (inspect-v1).
  try {
    const config = readConfig();
    if (!opts.telemetryExportExplicit) opts.telemetryExport = config.telemetryExport;
  } catch (error) {
    process.stderr.write(`tk inspect: ${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }

  // --copilot-context (static-only) is mutually exclusive with runtime-only flags.
  if (
    opts.copilotContext &&
    (opts.since !== undefined || opts.session !== undefined || opts.inputTypeExplicit)
  ) {
    process.stderr.write(
      "tk inspect: --copilot-context (static-context only) cannot be combined with runtime-only flags (--since/--session/--input-type)\n",
    );
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

  try {
    // Runtime analysis (orthogonal to scope; off under --copilot-context).
    let result: ScanResult | undefined;
    if (!opts.copilotContext) {
      const discovery = discoverSources(opts.inputType, home);
      if (discovery.found) {
        result = scan(discovery, { sinceMs, session: opts.session });
      } else {
        process.stderr.write(
          `tk inspect: no ${opts.inputType} session sources found (this is normal if the host stores transcripts elsewhere).\n`,
        );
      }
    }

    // Static-context analysis (always runs, scope-aware).
    const sc = runStaticContext({ scopes, surface: opts.surface, home, cwd });
    const staticFindings: ContextFinding[] = sc.result.findings;

    // Exit 2 only when BOTH runtime and static context are empty (goal exit table).
    const runtimeEmpty = !result || result.tool_event_count === 0;
    const staticEmpty = sc.result.files_scanned === 0;
    if (runtimeEmpty && staticEmpty) {
      process.stderr.write(
        "tk inspect: no major source analyzable (no runtime session events and no static-context files found).\n",
      );
      return 2;
    }

    const rtFindings = runtimeFindings(result);
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

    const repoContext = opts.repoContext ? gatherRepoContext(cwd) : undefined;

    const adviceRequested = opts.advice || opts.writeAdvice;
    let findings: AdviceFinding[] = [];
    if (adviceRequested && result) {
      findings = buildAdvice(result, {
        minConfidence: opts.minConfidence,
        minOccurrences: opts.minOccurrences,
      });
    }

    const report = buildReport(
      result ?? emptyScanResult(opts.inputType),
      new Date(nowMs).toISOString(),
      repoContext,
      adviceRequested ? findings : undefined,
    );
    report.static_context = { files_scanned: sc.result.files_scanned, findings: staticFindings };
    report.findings = unifiedFindings;

    // `--html`: write a single-file, user-facing HTML report and open it. Short-
    // circuits the text/JSON stream (still after persistence above).
    if (opts.html) {
      emitHtmlReport({
        kind: "inspect",
        title: "Context cleanup report",
        subtitle: "Where your AI setup wastes tokens, and how to fix it.",
        generatedAt: new Date(nowMs).toISOString(),
        data: {
          scope: scopes.includes("project") ? "project" : "user",
          files_scanned: sc.result.files_scanned,
          sessions_analyzed: result?.session_inventory ?? 0,
          findings: unifiedFindings.map((f) => ({
            severity: f.severity,
            type: f.type,
            file: (f as { file?: string }).file,
            start_line: (f as { start_line?: number }).start_line,
            evidence: f.evidence,
            recommendation: f.recommendation,
            fix_class: f.fix_class,
          })),
        },
      });
      return 0;
    }

    const reportJson = renderJson(report);
    const staticSection = renderStaticContextSection({
      files_scanned: sc.result.files_scanned,
      findings: staticFindings,
    });
    const reportMarkdown = opts.copilotContext
      ? `# Token Killer Inspect\n\n${staticSection}`
      : `${renderMarkdown(report)}\n${staticSection}`;

    // Persist (stable names) before printing the confirmation.
    if (opts.writeAdvice) {
      const written = writeAdviceArtifacts({
        reportMarkdown,
        reportJson,
        adviceMarkdown: renderAdviceFile(findings),
      });
      process.stdout.write(`Wrote advice artifacts:\n${written.map((p) => `  ${p}`).join("\n")}\n`);
    }

    // Telemetry export: allow-listed aggregates only. No endpoint in the generic
    // package → write locally + warn; never fail the run (spec). Runtime-derived,
    // so skipped under --copilot-context where no runtime scan ran.
    if (opts.telemetryExport && result) {
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

    // stdout report (skipped when --write-advice already printed a confirmation,
    // unless --json/--advice was explicitly asked for the stream too).
    if (!opts.writeAdvice) {
      if (opts.json) {
        process.stdout.write(reportJson);
      } else {
        process.stdout.write(reportMarkdown);
        if (opts.advice) process.stdout.write(`\n${renderAdviceMarkdown(findings)}\n`);
      }
    }

    // Cold-path NETWORK telemetry (ADR 0004 §5), gated on `telemetry` consent +
    // a build-time endpoint. Separate from --telemetry-export (local consent)
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
    process.stderr.write(
      `tk inspect: internal error: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    return 3;
  }
}

// A zero-event ScanResult so the runtime report renders cleanly under
// --copilot-context (no runtime scan) without special-casing every field.
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
