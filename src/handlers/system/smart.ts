import { rawText } from "../base.js";
import { defineHandler } from "../define.js";

// RTK: system/local_llm.rs — `smart <file>` produces a local heuristic summary of a
// file with no external model. In tk the summarizer emits a `Summary:` payload (and
// optional `System prompt:` framing); the filter keeps only the summary signal and
// strips the prompt boilerplate so the downstream context sees just the answer.
function extractSummary(output: string): string {
  const lines = output.split("\n");
  const summaryLines: string[] = [];

  for (const line of lines) {
    const match = line.match(/^\s*Summary:\s*(.*)$/);
    if (match) {
      summaryLines.push((match[1] ?? "").trim());
      continue;
    }
    // Drop the prompt framing entirely; keep any other non-empty signal lines so a
    // multi-line summary survives, but never the "System prompt:" boilerplate.
    if (/^\s*System prompt:/.test(line)) continue;
    if (summaryLines.length > 0 && line.trim() !== "") summaryLines.push(line.trim());
  }

  if (summaryLines.length > 0) return summaryLines.join("\n");

  // No explicit Summary marker: drop only the prompt framing.
  return lines
    .filter((line) => !/^\s*System prompt:/.test(line))
    .join("\n")
    .trim();
}

export const smartHandler = defineHandler({
  name: "smart",
  match(command) {
    return command.program === "smart" && command.args.length > 0;
  },
  format: (raw, _command, options) => extractSummary(rawText(raw)),
});
