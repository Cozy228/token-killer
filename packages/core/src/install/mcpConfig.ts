/**
 * Claude Code MCP-server registration via project-scoped `.mcp.json` (P28).
 *
 * Surface choice (disclosed per assignment): ctx registers into the project's
 * root `.mcp.json`, NOT the user-level `~/.claude.json`. Rationale:
 *  - ctx is a project-local context tool; the registration belongs with the
 *    project and is git-shareable (same stance as `.ctx/push.jsonc`, D27/D30);
 *  - it is a purely additive JSON merge, local to the checkout (§11 rollback);
 *  - G-7 becomes structurally trivial — every install write lands under the
 *    project root, so tests never go near the real `~/.claude`.
 * Claude Code natively reads `.mcp.json` at the repo root (project MCP scope);
 * the registered command is `ctx mcp` (the slice 1g stdio server).
 *
 * The merge NEVER clobbers user content: existing servers and unrelated
 * top-level keys are preserved; only `mcpServers.<name>` is set. A malformed
 * existing file is left untouched (surfaced as a typed error the caller reports).
 */

/** The default server name ctx registers under. */
export const CTX_MCP_SERVER_NAME = "ctx";

export interface McpServerEntry {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

interface McpConfigShape {
  mcpServers?: Record<string, McpServerEntry>;
  [key: string]: unknown;
}

/** Thrown when an existing `.mcp.json` is not parseable — never clobber it. */
export class McpConfigParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "McpConfigParseError";
  }
}

/** The registration entry for the ctx stdio server (`ctx mcp`). */
export function ctxServerEntry(command = "ctx", args: string[] = ["mcp"]): McpServerEntry {
  return { command, args };
}

function parse(existing: string | null): McpConfigShape {
  if (existing === null || existing.trim().length === 0) return {};
  let value: unknown;
  try {
    value = JSON.parse(existing);
  } catch (err) {
    throw new McpConfigParseError(
      `existing .mcp.json is not valid JSON (${err instanceof Error ? err.message : String(err)})`,
    );
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new McpConfigParseError("existing .mcp.json is not a JSON object");
  }
  return value as McpConfigShape;
}

/**
 * Additive merge: return the `.mcp.json` text with `mcpServers[name]` set to
 * `entry`, preserving every other server and top-level key. Stable formatting
 * (2-space indent + trailing newline) makes re-install byte-idempotent.
 */
export function upsertMcpServer(
  existing: string | null,
  name: string,
  entry: McpServerEntry,
): string {
  const config = parse(existing);
  const servers = { ...config.mcpServers, [name]: entry };
  const merged: McpConfigShape = { ...config, mcpServers: servers };
  return `${JSON.stringify(merged, null, 2)}\n`;
}

/** Read back a server entry (doctor: registration present + correct). */
export function readMcpServer(existing: string | null, name: string): McpServerEntry | undefined {
  return parse(existing).mcpServers?.[name];
}

/** True when the entry registers the `ctx mcp` stdio command. */
export function isCtxMcpEntry(entry: McpServerEntry | undefined): boolean {
  return entry !== undefined && Array.isArray(entry.args) && entry.args.includes("mcp");
}
