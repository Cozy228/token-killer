// Rule: chat_mode_bloat. VS Code custom chat modes (.chatmode.md) are SELECTABLE —
// only the active one loads — but when active its instructions BECOME part of the
// system prompt, so an oversized mode is paid on every turn it is selected. This
// flags heavy modes the same way prompt files / skill entrypoints are flagged.
// Advisory: it never edits the file. Chat modes are NOT summed into the always-on
// session footprint (only the selected one loads), which is why they are scanned
// per-file here rather than counted there.

import { type AnalyzedFile, type PerFileRule } from "../analyzer.js";
import { estimateTokens } from "../../core/tokens.js";
import type { DiscoveredFile } from "../discover.js";
import type { ContextFinding } from "../types.js";
import { buildFinding } from "./helpers.js";

const MODE_LINE_LIMIT = 200;
const MODE_TOKEN_LIMIT = 1_500;

function isChatMode(file: DiscoveredFile): boolean {
  return file.surface === "chat_mode";
}

export const chatModeBloatRule: PerFileRule = {
  type: "chat_mode_bloat",
  appliesTo: isChatMode,
  run(af: AnalyzedFile): ContextFinding[] {
    const tokens = estimateTokens(af.parsed.body);
    const lines = af.metrics.line_count;
    if (lines <= MODE_LINE_LIMIT && tokens <= MODE_TOKEN_LIMIT) return [];
    return [
      buildFinding(af, {
        type: "chat_mode_bloat",
        severity: "info",
        confidence: 0.6,
        evidence: `Chat mode instructions are ${lines} lines (~${tokens} tokens); while this mode is active they load into every turn as part of the system prompt.`,
        recommendation:
          "Trim the mode to its essential behavior, or move reference detail into a linked instructions file — a lean mode is cheaper on every turn it is active.",
        fix_class: "advisory",
        start_line: 1,
        idExtra: "bloat",
      }),
    ];
  },
};
