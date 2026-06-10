import { defineHandler } from "../define.js";

type JavacIssueKind = "error" | "warning";

type JavacIssue = {
  file: string;
  line: string;
  kind: JavacIssueKind;
  message: string;
  details: string[];
};

function formatJavac(text: string): string {
  const lines = text.split(/\r?\n/);
  const issues: JavacIssue[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    // Match both error: and warning: diagnostics.
    const match = line.match(/^(.+?\.java):(\d+):\s+(error|warning):\s+(.+)$/);
    if (!match) continue;
    const kind = (match[3] ?? "error") as JavacIssueKind;
    const details: string[] = [];
    for (let offset = 1; offset <= 5; offset += 1) {
      const detail = lines[index + offset];
      if (!detail || /^.+?\.java:\d+:\s+(?:error|warning):/.test(detail)) break;
      // Keep type-mismatch context lines (symbol/location/required/found) and
      // the caret pointer. No hardcoded fixture strings allowed in product code.
      if (/symbol:|location:|required:|found:|incompatible types|^\s*\^/.test(detail)) {
        details.push(detail.trim());
      }
    }
    issues.push({
      file: match[1] ?? "",
      line: match[2] ?? "",
      kind,
      message: match[4] ?? "",
      details,
    });
  }
  const errors = issues.filter((i) => i.kind === "error");
  const warnings = issues.filter((i) => i.kind === "warning");
  const sorted = [...errors, ...warnings].sort((a, b) => a.file.localeCompare(b.file));
  const out = [`Javac: ${errors.length} error(s), ${warnings.length} warning(s)`];
  for (const issue of sorted) {
    out.push(`${issue.file}:${issue.line}: ${issue.kind}: ${issue.message}`);
    for (const detail of issue.details) out.push(`  ${detail}`);
  }
  return `${out.join("\n")}\n`;
}

export const javacHandler = defineHandler({
  name: "javac",
  programs: ["javac"],

  match(command) {
    return command.program === "javac";
  },

  format: (raw, _command, options) => formatJavac(`${raw.stdout}\n${raw.stderr}`),
});
