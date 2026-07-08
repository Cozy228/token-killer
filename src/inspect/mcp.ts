// MCP server-count analysis. Every connected MCP server injects its tool schemas
// into the model's context for the WHOLE session, and practitioners report a small
// number of servers can take a large share of the window (and a CLI is far cheaper
// per call than its MCP). So the COUNT of configured servers is a standing token
// cost worth flagging, independent of any one session — figures and sources are in
// docs/reports/token-optimization-best-practices-20260611.md, not asserted as fact here.
//
// Read-only and privacy-safe: we count server keys and report names only — never
// the server commands, args, env, or URLs (those can carry secrets).

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { parseJsonc } from "../core/jsonc.js";

export type McpAnalysis = {
  // Distinct server names found across all known config locations.
  servers: string[];
  // Where they were found (file basenames only, for the evidence line).
  sources: string[];
};

// Known MCP config locations for the hosts ctx targets. Both user- and project-level.
function configPaths(home: string, cwd: string): string[] {
  return [
    join(home, ".copilot", "mcp-config.json"), // Copilot CLI (user)
    join(home, ".claude.json"), // Claude Code (user, global mcpServers)
    join(home, ".cursor", "mcp.json"), // Cursor (user)
    join(cwd, ".mcp.json"), // Claude Code (project)
    join(cwd, ".vscode", "mcp.json"), // VS Code (project)
    join(cwd, ".cursor", "mcp.json"), // Cursor (project)
  ];
}

// Server map lives under "mcpServers" (Claude/Cursor) or "servers" (VS Code).
function serverNames(parsed: unknown): string[] {
  if (typeof parsed !== "object" || parsed === null) return [];
  const obj = parsed as Record<string, unknown>;
  const map = obj.mcpServers ?? obj.servers;
  if (typeof map !== "object" || map === null || Array.isArray(map)) return [];
  // Respect an explicit per-server `disabled: true` / `enabled: false` toggle.
  return Object.entries(map as Record<string, unknown>)
    .filter(([, v]) => {
      if (typeof v !== "object" || v === null) return true;
      const e = v as Record<string, unknown>;
      return e.disabled !== true && e.enabled !== false;
    })
    .map(([name]) => name);
}

export function analyzeMcpServers(home: string, cwd: string): McpAnalysis {
  const servers = new Set<string>();
  const sources: string[] = [];
  for (const path of configPaths(home, cwd)) {
    if (!existsSync(path)) continue;
    let parsed: unknown;
    try {
      parsed = parseJsonc(readFileSync(path, "utf8"));
    } catch {
      continue; // malformed config — never throw from a diagnostic
    }
    const names = serverNames(parsed);
    if (names.length > 0) {
      names.forEach((n) => servers.add(n));
      sources.push(path.split(/[\\/]/).pop() ?? path);
    }
  }
  return { servers: [...servers], sources: [...new Set(sources)] };
}
