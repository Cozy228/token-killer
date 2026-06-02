import stripAnsi from "strip-ansi";

export function removeAnsi(text: string): string {
  return stripAnsi(text);
}
