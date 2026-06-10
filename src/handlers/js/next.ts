import type { ParsedCommand } from "../../types.js";
import { defineHandler } from "../define.js";
import { removeAnsi } from "../../core/ansi.js";
import { overBudgetLadder } from "../common/budget.js";

// RTK: js/next_cmd.rs — filter Next.js `next build` output down to a route/bundle
// summary. Counts routes by status symbol, extracts bundle sizes, counts
// warnings/errors, and reports build time.
//   ○ static  ● / ◐ dynamic  λ server (total-only)

// RTK: js/next_cmd.rs::filter_next_build ROUTE_PATTERN.
// (Compiled but only BUNDLE_PATTERN drives bundle extraction; kept for parity.)
const ROUTE_PATTERN = /^[○●◐λ✓]\s+(\/[^\s]*)\s+(\d+(?:\.\d+)?)\s*(kB|B)/;

// RTK: js/next_cmd.rs::filter_next_build BUNDLE_PATTERN — route + size + total size.
const BUNDLE_PATTERN =
  /^[○●◐λ✓]\s+([\w/\-.]+)\s+(\d+(?:\.\d+)?)\s*(kB|B)\s+(\d+(?:\.\d+)?)\s*(kB|B)/;

// M20: CAP_WARNINGS was a hard cap that emitted `... +N more routes` which the
// base sniffer detected as an undeclared omission, reverting to raw (0% saved +
// false `inflated`). Replaced with a declared over-budget ladder (ADR 0001): within
// budget all bundles are listed; over budget only the count line is emitted.
// Keep the constant as the "show N bundles in the full listing" threshold only.
const CAP_WARNINGS = 10;

type Bundle = {
  route: string;
  total: number;
  pctChange: number | undefined;
};

// RTK: core/utils.rs::truncate — keep up to max chars, else max-3 chars + "...".
function truncate(text: string, maxLen: number): string {
  const chars = [...text];
  if (chars.length <= maxLen) return text;
  if (maxLen < 3) return "...";
  return `${chars.slice(0, maxLen - 3).join("")}...`;
}

// RTK: utils mirror of Rust `format!("{:<30} {:>6.0} kB", ...)` field formatting.
function padEndTo(text: string, width: number): string {
  return text.length >= width ? text : text + " ".repeat(width - text.length);
}

function padStartTo(text: string, width: number): string {
  return text.length >= width ? text : " ".repeat(width - text.length) + text;
}

// RTK: js/next_cmd.rs::extract_time — first "<number><s|ms>" match on a line.
export function extractTime(line: string): string | undefined {
  const match = line.match(/(\d+(?:\.\d+)?)\s*(s|ms)/);
  if (!match) return undefined;
  return `${match[1]}${match[2]}`;
}

// RTK: js/next_cmd.rs::filter_next_build — returns the assembled summary lines
// (pre-join) so the caller can run the over-budget ladder on them.
function buildNextSummaryLines(output: string): string[] {
  void ROUTE_PATTERN;

  let routesStatic = 0;
  let routesDynamic = 0;
  let routesTotal = 0;
  const bundles: Bundle[] = [];
  let warnings = 0;
  let errors = 0;
  let buildTime = "";

  const cleanOutput = removeAnsi(output);

  for (const line of cleanOutput.split(/\r?\n/)) {
    // Count route types by leading symbol.
    if (line.startsWith("○")) {
      routesStatic += 1;
      routesTotal += 1;
    } else if (line.startsWith("●") || line.startsWith("◐")) {
      routesDynamic += 1;
      routesTotal += 1;
    } else if (line.startsWith("λ")) {
      routesTotal += 1;
    }

    // Extract bundle information (route + size + total size).
    const caps = line.match(BUNDLE_PATTERN);
    if (caps) {
      const route = caps[1] ?? "";
      const size = Number.parseFloat(caps[2] ?? "") || 0;
      const total = Number.parseFloat(caps[4] ?? "") || 0;
      const pctChange = total > 0 ? ((total - size) / size) * 100 : undefined;
      bundles.push({ route, total, pctChange });
    }

    // Count warnings and errors.
    const lower = line.toLowerCase();
    if (lower.includes("warning")) {
      warnings += 1;
    }
    if (lower.includes("error") && !line.includes("0 error")) {
      errors += 1;
    }

    // Extract build time.
    if (line.includes("Compiled") || line.includes("in")) {
      const timeMatch = extractTime(line);
      if (timeMatch !== undefined) {
        buildTime = timeMatch;
      }
    }
  }

  // Detect if build was skipped (already built).
  const alreadyBuilt =
    cleanOutput.includes("already optimized") ||
    cleanOutput.includes("Cache") ||
    (routesTotal === 0 && cleanOutput.includes("Ready"));

  const result: string[] = [];
  result.push("Next.js Build");
  result.push("═══════════════════════════════════════");

  if (alreadyBuilt && routesTotal === 0) {
    result.push("Already built (using cache)");
    result.push("");
  } else if (routesTotal > 0) {
    result.push(`${routesTotal} routes (${routesStatic} static, ${routesDynamic} dynamic)`);
    result.push("");
  }

  if (bundles.length > 0) {
    result.push("Bundles:");

    // Sort by size (descending).
    bundles.sort((a, b) => b.total - a.total);

    // Show top CAP_WARNINGS bundles in the full listing.
    const shown = bundles.slice(0, CAP_WARNINGS);
    for (const { route, total, pctChange } of shown) {
      let warningMarker = "";
      if (pctChange !== undefined && pctChange > 10) {
        warningMarker = ` [warn] (+${Math.round(pctChange)}%)`;
      }
      const routeCol = padEndTo(truncate(route, 30), 30);
      const sizeCol = padStartTo(`${Math.round(total)}`, 6);
      result.push(`  ${routeCol} ${sizeCol} kB${warningMarker}`);
    }

    // M20: no `... +N more routes` marker — that string trips the base sniffer
    // (undeclared omission → revert to raw). The over-budget ladder in
    // filterNextBuild handles the > CAP_WARNINGS case as a declared replacement.

    result.push("");
  }

  // Show build time and status.
  let statusLine = "";
  if (buildTime !== "") {
    statusLine += `Time: ${buildTime} | `;
  }
  statusLine += `Errors: ${errors} | Warnings: ${warnings}`;
  result.push(statusLine);

  return result;
}

// M20: wrap the summary builder with an over-budget ladder so a long bundle list
// ships a declared replacement (count-only) instead of a `+N more routes` marker
// that the base sniffer flags as undeclared omission and reverts to raw.
function filterNextBuild(output: string): string {
  const lines = buildNextSummaryLines(output);
  const full = lines.join("\n").trim();

  // Build a replacement that keeps the header + status but drops the bundle rows.
  const replacement = (): string => {
    const keep: string[] = [];
    let inBundles = false;
    for (const line of lines) {
      if (line === "Bundles:") {
        inBundles = true;
        continue;
      }
      if (inBundles && line === "") {
        inBundles = false;
        continue;
      }
      if (!inBundles) keep.push(line);
    }
    return keep.join("\n").trim();
  };

  const { text } = overBudgetLadder({ full, replacement });
  return text;
}

export const nextHandler = defineHandler({
  name: "next",
  // The build summary is a structural reformat (header + counts) that can edge past a
  // tiny raw build log; without this the inflation check reverts it to raw on small
  // fixtures (same class as maven/summary — see base.ts structural rationale).
  traits: { structural: true },
  programs: ["next"],

  match(command: ParsedCommand): boolean {
    return command.program === "next";
  },

  format: (raw, command, options) => {
    // M18: gate the build formatter on `next build` only. Other subcommands
    // (`next lint`, `next dev`, `next start`, `next info`) produce output that is
    // not a build summary and must not be flattened to "Errors: N / Warnings: N".
    // Pass them through (respecting the exit-code guard from above).
    const subcommand = command.args[0];
    if (subcommand !== "build") {
      return `${raw.stdout}${raw.stderr}`;
    }

    // A FAILED build's `file:line` compile/type error is the evidence the agent
    // acts on; the route/bundle summary flattens it to "Errors: N" (audit #16). On
    // a non-zero exit, pass the raw build output through so the error detail (and
    // its location) survives instead of being reduced to a count.
    if (raw.exitCode !== 0) {
      return `${raw.stdout}${raw.stderr}`;
    }
    return `${filterNextBuild(`${raw.stdout}\n${raw.stderr}`)}\n`;
  },
});
