export function uniqueLines(lines: string[]): string[] {
  return [...new Set(lines)];
}

export function ensureTrailingNewline(text: string): string {
  return text.endsWith("\n") ? text : `${text}\n`;
}
