// Write a generated HTML report to ~/.token-killer/reports/ and (best-effort)
// open it in the default browser. Opening is fire-and-forget and never throws —
// a headless/agent/CI environment simply gets the path printed instead.

import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { tokenKillerHome } from "../core/dataDir.js";
import { renderReportHtml, type ReportDoc } from "./html.js";

function reportsDir(): string {
  return join(tokenKillerHome(), "reports");
}

function stamp(nowMs: number): string {
  return new Date(nowMs).toISOString().replace(/[:.]/g, "-");
}

export function writeReport(doc: ReportDoc, nowMs: number): string {
  const dir = reportsDir();
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${doc.kind}-${stamp(nowMs)}.html`);
  writeFileSync(path, renderReportHtml(doc));
  return path;
}

// Open a file in the OS default handler. Detached + unref so tk never waits on or
// is held open by the browser. Suppressed under TK_NO_OPEN (tests / headless).
export function openInBrowser(path: string): boolean {
  if (process.env.TK_NO_OPEN) return false;
  try {
    const [cmd, args] =
      process.platform === "darwin"
        ? (["open", [path]] as const)
        : process.platform === "win32"
          ? (["cmd", ["/c", "start", "", path]] as const)
          : (["xdg-open", [path]] as const);
    const child = spawn(cmd, [...args], { stdio: "ignore", detached: true });
    child.on("error", () => {});
    child.unref();
    return true;
  } catch {
    return false;
  }
}

// Write the report, try to open it, and print the path. Returns the path.
export function emitHtmlReport(doc: ReportDoc, nowMs: number = Date.now()): string {
  const path = writeReport(doc, nowMs);
  const opened = openInBrowser(path);
  process.stdout.write(`HTML report: ${path}${opened ? " (opening…)" : ""}\n`);
  return path;
}
