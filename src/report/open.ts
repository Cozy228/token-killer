// Write a generated HTML report to ~/.contexa/reports/ and (best-effort)
// open it in the default browser. Opening is fire-and-forget and never throws —
// a headless/agent/CI environment simply gets the path printed instead.

import { spawn } from "node:child_process";
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { contexaHome } from "../core/dataDir.js";
import { renderReportHtml, type ReportDoc } from "./html.js";

function reportsDir(): string {
  return join(contexaHome(), "reports");
}

function stamp(nowMs: number): string {
  return new Date(nowMs).toISOString().replace(/[:.]/g, "-");
}

export function writeReport(doc: ReportDoc, nowMs: number): string {
  const dir = reportsDir();
  // Owner-only (0700 dir / 0600 file): this directory is shared with the
  // `ctx support` diagnostic bundle (src/support/report.ts), which carries command
  // lines, command output, and host config. The mkdir mode only applies on
  // creation, so chmod the dir explicitly to retroactively tighten one a prior ctx
  // version created 0755 (world-listable). POSIX modes are no-ops on Windows.
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  chmodSync(dir, 0o700);
  const path = join(dir, `${doc.kind}-${stamp(nowMs)}.html`);
  writeFileSync(path, renderReportHtml(doc), { mode: 0o600 });
  return path;
}

// Open a file in the OS default handler. Detached + unref so ctx never waits on or
// is held open by the browser. Suppressed under CTX_NO_OPEN (tests / headless).
export function openInBrowser(path: string): boolean {
  if (process.env.CTX_NO_OPEN) return false;
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
  process.stdout.write(
    `Generated HTML report: ${path}${opened ? " (opening in your browser…)" : ""}\n`,
  );
  return path;
}
