import { executeCommand } from "../../executor.js";
import type { CommandHandler, ParsedCommand } from "../../types.js";
import { makeFilteredResult } from "../base.js";
import { removeAnsi } from "../../core/ansi.js";

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

// RTK: core/truncate.rs::CAP_WARNINGS = 10 (max bundles shown).
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

// RTK: js/next_cmd.rs::filter_next_build.
function filterNextBuild(output: string): string {
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
    result.push(
      `${routesTotal} routes (${routesStatic} static, ${routesDynamic} dynamic)`,
    );
    result.push("");
  }

  if (bundles.length > 0) {
    result.push("Bundles:");

    // Sort by size (descending) and show top 10.
    bundles.sort((a, b) => b.total - a.total);

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

    if (bundles.length > CAP_WARNINGS) {
      result.push("");
      result.push(`  ... +${bundles.length - CAP_WARNINGS} more routes`);
    }

    result.push("");
  }

  // Show build time and status.
  let statusLine = "";
  if (buildTime !== "") {
    statusLine += `Time: ${buildTime} | `;
  }
  statusLine += `Errors: ${errors} | Warnings: ${warnings}`;
  result.push(statusLine);

  return result.join("\n").trim();
}

export const nextHandler: CommandHandler = {
  name: "next",

  matches(command: ParsedCommand): boolean {
    return command.program === "next";
  },

  execute(command) {
    return executeCommand(command);
  },

  async filter(raw, _command, options) {
    return makeFilteredResult(
      this.name,
      raw,
      `${filterNextBuild(`${raw.stdout}\n${raw.stderr}`)}\n`,
      options,
    );
  },
};
