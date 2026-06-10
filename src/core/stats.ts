export function formatStats(result: {
  rawTokens: number;
  outputTokens: number;
  savedTokens: number;
  savingsPct: number;
  rawOutputPath?: string;
}): string {
  const lines = [
    "## Token Savings",
    `Raw: ${result.rawTokens} tokens`,
    `Output: ${result.outputTokens} tokens`,
    `Saved: ${result.savedTokens} tokens (${result.savingsPct}%)`,
  ];
  if (result.rawOutputPath) {
    lines.push(`Raw output: ${result.rawOutputPath}`);
  }
  return lines.join("\n");
}
