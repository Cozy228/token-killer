// Slice 4–5 — `tg inspect` entry (inspect-v1-design.md "Inspect Flags", "Exit
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
import { writeAdviceArtifacts, writeTelemetryExport } from "./persist.js";
import { gatherRepoContext } from "./repoContext.js";
import { buildReport, renderJson, renderMarkdown } from "./report.js";
import { parseSince, scan } from "./scan.js";
import { discoverSources, type InputType } from "./sources.js";
import { buildTelemetry } from "./telemetry.js";

type InspectArgs = {
  json: boolean;
  inputType: InputType;
  since?: string;
  session?: string;
  repoContext: boolean;
  advice: boolean;
  writeAdvice: boolean;
  telemetryExport: boolean; // default off; CLI flag overrides (no config yet)
  minConfidence: number;
  minOccurrences: number;
  error?: string; // set on a parse error → exit 1
};

function parseNumberFlag(value: string | undefined, name: string): { value?: number; error?: string } {
  if (value === undefined) return { error: `${name} requires a value` };
  const n = Number(value);
  if (!Number.isFinite(n)) return { error: `${name} must be a number` };
  return { value: n };
}

export function parseInspectArgs(argv: string[]): InspectArgs {
  const args: InspectArgs = {
    json: false,
    inputType: "vscode",
    repoContext: false,
    advice: false,
    writeAdvice: false,
    telemetryExport: false,
    minConfidence: DEFAULT_ADVICE_OPTIONS.minConfidence,
    minOccurrences: DEFAULT_ADVICE_OPTIONS.minOccurrences,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--json") {
      args.json = true;
    } else if (token === "--repo-context") {
      args.repoContext = true;
    } else if (token === "--advice") {
      args.advice = true;
    } else if (token === "--write-advice") {
      args.writeAdvice = true;
    } else if (token === "--telemetry-export") {
      args.telemetryExport = true;
    } else if (token === "--no-telemetry-export") {
      args.telemetryExport = false;
    } else if (token === "--input-type") {
      const value = argv[i + 1];
      i += 1;
      if (value === "vscode" || value === "copilot-cli") args.inputType = value;
      else args.error = `invalid --input-type '${value ?? ""}' (expected vscode | copilot-cli)`;
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

export function runInspect(argv: string[], nowMs: number = Date.now(), home: string = homedir()): number {
  const startMs = nowMs;
  let opts: InspectArgs;
  try {
    opts = parseInspectArgs(argv);
  } catch (error) {
    process.stderr.write(`tg inspect: ${error instanceof Error ? error.message : String(error)}\n`);
    return 3;
  }

  if (opts.error) {
    process.stderr.write(`tg inspect: ${opts.error}\n`);
    return 1;
  }

  let sinceMs: number | undefined;
  if (opts.since !== undefined) {
    const duration = parseSince(opts.since);
    if (duration === undefined) {
      process.stderr.write(`tg inspect: invalid --since '${opts.since}' (expected e.g. 7d, 24h, 30m)\n`);
      return 1;
    }
    sinceMs = nowMs - duration;
  }

  try {
    const discovery = discoverSources(opts.inputType, home);
    if (!discovery.found) {
      process.stderr.write(
        `tg inspect: no ${opts.inputType} session sources found (this is normal if the host stores transcripts elsewhere).\n`,
      );
      return 2;
    }

    const result = scan(discovery, { sinceMs, session: opts.session });
    const repoContext = opts.repoContext ? gatherRepoContext(process.cwd()) : undefined;

    const adviceRequested = opts.advice || opts.writeAdvice;
    let findings: AdviceFinding[] = [];
    if (adviceRequested) {
      findings = buildAdvice(result, {
        minConfidence: opts.minConfidence,
        minOccurrences: opts.minOccurrences,
      });
    }

    const report = buildReport(
      result,
      new Date(nowMs).toISOString(),
      repoContext,
      adviceRequested ? findings : undefined,
    );

    const reportJson = renderJson(report);
    const reportMarkdown = renderMarkdown(report);

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
    // package → write locally + warn; never fail the run (spec).
    if (opts.telemetryExport) {
      const telemetry = buildTelemetry(result, findings, Math.max(0, Date.now() - startMs), randomUUID());
      const path = writeTelemetryExport(`${JSON.stringify(telemetry, null, 2)}\n`);
      process.stderr.write(`tg inspect: no telemetry endpoint configured; wrote local export: ${path}\n`);
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

    return 0;
  } catch (error) {
    process.stderr.write(`tg inspect: internal error: ${error instanceof Error ? error.message : String(error)}\n`);
    return 3;
  }
}
