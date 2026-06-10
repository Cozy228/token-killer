import type { OmissionDeclaration, ParsedCommand } from "../../types.js";
import { defineHandler } from "../define.js";
import { compactUnifiedDiff, extractDiffStatLines } from "./compactDiff.js";

function wantsStatOnly(command: ParsedCommand, text: string): boolean {
  if (
    command.args.includes("--stat") ||
    command.args.includes("--name-only") ||
    command.args.includes("--name-status")
  ) {
    return true;
  }
  return extractDiffStatLines(text).length > 0 && !text.includes("diff --git");
}

// C4: detect argv forms that produce non-commit output that must not be
// reformatted: `git show HEAD:path/to/file` (colon object spec) and explicit
// `--format`/`--pretty` flags that produce user-defined output.
function isRawPassthrough(command: ParsedCommand, text: string): boolean {
  // Colon-spec: any arg of the form <rev>:<path> or :<path> or <rev>: — these
  // request file/blob content, not a commit object.
  if (command.args.some((a) => a.includes(":"))) return true;
  // Explicit format/pretty flags: user controls the layout, not us.
  if (
    command.args.some(
      (a) =>
        a === "--format" ||
        a.startsWith("--format=") ||
        a === "--pretty" ||
        a.startsWith("--pretty="),
    )
  )
    return true;
  // Output doesn't start with a commit header — could be tag object, blob, tree,
  // or any other non-commit object.
  if (!/^commit [0-9a-f]{7,40}/m.test(text)) return true;
  return false;
}

function formatShow(
  text: string,
  command: ParsedCommand,
): { output: string; omission?: OmissionDeclaration } {
  const trimmed = text.trim();
  if (!trimmed) return { output: trimmed };

  if (wantsStatOnly(command, text)) {
    return { output: `${trimmed}\n` };
  }

  // C4: pass through without reformatting when the output is not a commit object.
  if (isRawPassthrough(command, text)) {
    return { output: `${trimmed}\n` };
  }

  const lines = text.split(/\r?\n/);
  const commit = lines
    .find((line) => line.startsWith("commit "))
    ?.replace("commit ", "")
    .trim();
  const author = lines
    .find((line) => line.startsWith("Author:"))
    ?.replace("Author:", "")
    .trim();
  const date = lines
    .find((line) => line.startsWith("Date:"))
    ?.replace("Date:", "")
    .trim();

  const subjectLines: string[] = [];
  let inSubject = false;
  for (const line of lines) {
    if (line.startsWith("    ") && line.trim()) {
      inSubject = true;
      subjectLines.push(line.trim());
      continue;
    }
    if (inSubject && line.trim() === "") break;
    if (inSubject && !line.startsWith("    ")) break;
  }

  const statLines = extractDiffStatLines(text);
  const diffStart = lines.findIndex((line) => line.startsWith("diff --git"));
  const diffText = diffStart >= 0 ? lines.slice(diffStart).join("\n") : "";

  const out: string[] = [];
  if (commit) out.push(`commit ${commit}`);
  if (author) out.push(`Author: ${author}`);
  if (date) out.push(`Date:   ${date}`);
  if (subjectLines.length > 0) {
    out.push("");
    out.push(...subjectLines);
  }
  if (statLines.length > 0) {
    out.push("");
    out.push(...statLines);
  }
  let omission: OmissionDeclaration | undefined;
  if (diffText.trim()) {
    const compacted = compactUnifiedDiff(diffText);
    omission = compacted.omission;
    out.push("", "--- Changes ---", compacted.text);
  }

  const output = out.length > 0 ? `${out.join("\n").trimEnd()}\n` : `${trimmed}\n`;
  return { output, omission };
}

export const gitShowHandler = defineHandler({
  name: "git-show",
  traits: { structural: true, ladder: true, cacheable: true, ttlClass: "fast" },
  programs: ["git"],

  match(command) {
    return command.program === "git" && command.args[0] === "show";
  },

  format(raw, command, _options) {
    const { output, omission } = formatShow(raw.stdout || raw.stderr, command);
    return { output, omission };
  },
});
