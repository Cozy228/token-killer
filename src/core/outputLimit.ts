import type { TkOptions } from "../types.js";

// Opt-in DISPLAY caps for `--max-lines` / `--max-chars`. Applied to the FINAL compressed
// output only (cli display layer), NEVER in the quality gate — so they cannot interfere
// with compression or the omission sniffer. A non-finite limit (the default) is "no cap",
// so the flags do nothing unless the user passes them. The marker is worded as a user
// cap (not a `+N more` compression omission) and names the flag so it is unmistakable.

export function limitLines(text: string, maxLines: number): string {
  if (!Number.isFinite(maxLines) || maxLines <= 0) return text;
  const lines = text.split("\n");
  // A trailing newline yields a final "" element; don't count it as a content line.
  const trailingNl = lines.length > 0 && lines[lines.length - 1] === "";
  const content = trailingNl ? lines.slice(0, -1) : lines;
  if (content.length <= maxLines) return text;
  return `${content.slice(0, maxLines).join("\n")}\n[ctx] output limited to ${maxLines} of ${content.length} lines by --max-lines\n`;
}

export function limitChars(text: string, maxChars: number): string {
  if (!Number.isFinite(maxChars) || maxChars <= 0) return text;
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n[ctx] output limited to ${maxChars} of ${text.length} chars by --max-chars\n`;
}

// Apply the user's opt-in caps to a final output string: lines first, then a hard char
// ceiling. Both are no-ops unless the matching flag set a finite limit.
export function limitOutput(text: string, options: TkOptions): string {
  return limitChars(limitLines(text, options.maxLines), options.maxChars);
}
