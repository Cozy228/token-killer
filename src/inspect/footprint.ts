// Session footprint — the STANDING per-session token cost of a user's AI setup: the
// context that loads into every session before they type a word. Mirrors Claude
// Code's `/context` standing breakdown and VS Code Copilot's fixed per-request cost.
// The host-fixed parts (base system prompt + built-in tool schemas) are NOT counted
// — they aren't user-controllable. We account only for the surfaces the user owns:
// instruction files, skills, custom agents, and MCP servers.
//
// Honest by construction: instruction / skill / agent costs are MEASURED from disk
// via the calibrated estimator. The MCP cost is an ESTIMATE — tool schemas live on
// the server, not on disk (a read-only inspect can't connect), so we estimate from
// published per-server figures and flag the line `estimated`.

import { estimateTokens } from "../core/tokens.js";
import { discoverContextFiles, readContextFile } from "../context/discover.js";
import { parseMarkdown } from "../context/parseMarkdown.js";
import type { ContextScope } from "../context/types.js";
import type { McpAnalysis } from "./mcp.js";

// Published MCP tool-schema sizes: ~550–1,400 tok/tool; a typical server with ~10
// tools ≈ 5–10k; GitHub's official server ≈ 17.6k (sources: modelcontextprotocol
// issue #2808, apideck). We only know the server COUNT from config (schemas need a
// live connection), so we estimate a conservative ~5k/server and flag it `estimated`.
export const MCP_TOKENS_PER_SERVER_ESTIMATE = 5_000;

export type FootprintItem = {
  key: "instructions" | "skills" | "agents" | "mcp";
  label: string;
  tokens: number;
  count: number;
  estimated?: boolean;
  detail: string;
};

export type Footprint = {
  // Total standing tokens loaded every session (sum of items).
  total_tokens: number;
  // True when any item is an estimate (so the total carries a ~/est. qualifier).
  has_estimate: boolean;
  items: FootprintItem[];
};

function metaString(values: Record<string, unknown>, key: string): string {
  const v = values[key];
  return typeof v === "string" ? v : "";
}

export function computeFootprint(opts: {
  scopes: ContextScope[];
  home: string;
  cwd: string;
  mcp: McpAnalysis;
}): Footprint {
  const { files } = discoverContextFiles({
    scopes: opts.scopes,
    home: opts.home,
    cwd: opts.cwd,
  });

  let instrTokens = 0;
  let instrCount = 0;
  let skillTokens = 0;
  let skillCount = 0;
  let agentTokens = 0;
  let agentCount = 0;

  for (const f of files) {
    const content = readContextFile(f.path);
    if (content === undefined) continue;
    if (f.surface === "skill" || f.surface === "custom_agent") {
      // Standing cost = the always-on routing metadata (name + description), NOT the
      // body (which loads only when the skill/agent is invoked).
      const { values } = parseMarkdown(content).frontmatter;
      const meta = `${metaString(values, "name") || f.display}\n${metaString(values, "description")}`;
      const t = estimateTokens(meta);
      if (f.surface === "skill") {
        skillTokens += t;
        skillCount += 1;
      } else {
        agentTokens += t;
        agentCount += 1;
      }
    } else if (f.always_on) {
      // Instruction files load whole into every session.
      instrTokens += estimateTokens(content);
      instrCount += 1;
    }
  }

  const items: FootprintItem[] = [];
  if (instrCount > 0) {
    items.push({
      key: "instructions",
      label: "Instruction files",
      tokens: instrTokens,
      count: instrCount,
      detail: `${instrCount} always-on file(s) (CLAUDE.md / AGENTS.md / copilot-instructions) loaded whole every session`,
    });
  }
  if (skillCount > 0) {
    items.push({
      key: "skills",
      label: "Skills",
      tokens: skillTokens,
      count: skillCount,
      detail: `name + description of ${skillCount} skill(s), loaded for invocation routing`,
    });
  }
  if (agentCount > 0) {
    items.push({
      key: "agents",
      label: "Custom agents",
      tokens: agentTokens,
      count: agentCount,
      detail: `name + description of ${agentCount} custom agent(s), loaded for routing`,
    });
  }
  const mcpCount = opts.mcp.servers.length;
  if (mcpCount > 0) {
    items.push({
      key: "mcp",
      label: "MCP tool schemas",
      tokens: mcpCount * MCP_TOKENS_PER_SERVER_ESTIMATE,
      count: mcpCount,
      estimated: true,
      detail: `${mcpCount} server(s) × ~${MCP_TOKENS_PER_SERVER_ESTIMATE} tok (estimated — real cost = each server's tool count × ~1k/tool; GitHub's server alone ≈ 17.6k)`,
    });
  }

  return {
    total_tokens: items.reduce((s, i) => s + i.tokens, 0),
    has_estimate: items.some((i) => i.estimated),
    items,
  };
}
