import type { TgOptions } from "../types.js";
import { IMPORTANT_PATTERN } from "./patterns.js";

export function limitLines(text: string, maxLines: number): string {
  const lines = text.split(/\r?\n/);
  if (lines.length <= maxLines) return text;

  const important = lines.filter((line) => IMPORTANT_PATTERN.test(line));
  const headCount = Math.max(1, Math.floor(maxLines / 3));
  const tailCount = Math.max(1, Math.floor(maxLines / 3));
  const middleBudget = Math.max(0, maxLines - headCount - tailCount - 1);
  const middle = important.slice(0, middleBudget);

  return [
    ...lines.slice(0, headCount),
    ...middle,
    `... ${lines.length - maxLines} lines hidden ...`,
    ...lines.slice(-tailCount),
  ].join("\n");
}

export function limitChars(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const head = text.slice(0, Math.floor(maxChars / 2));
  const tail = text.slice(text.length - Math.floor(maxChars / 2));
  return `${head}\n... ${text.length - maxChars} chars hidden ...\n${tail}`;
}

export function limitOutput(text: string, options: TgOptions): string {
  return limitChars(limitLines(text, options.maxLines), options.maxChars);
}
