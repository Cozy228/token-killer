/**
 * `ctx install` host integration (CTX-IMPL §7 CLI / §9 slice 1i, P28).
 *
 * Managed writes of:
 *  (a) the MCP-server registration for Claude Code → project `.mcp.json`
 *      (surface choice + rationale in mcpConfig.ts), command `ctx mcp`;
 *  (b) push-block placement → root `AGENTS.md` floor + `CLAUDE.md` (the two
 *      files that cover all four P28 hosts), as sentinel-wrapped managed blocks.
 *
 * ALL writes are additive (JSON merge / managed block) — user content is never
 * clobbered, and every push block is byte-exact removable (§11 rollback,
 * `removePush`). Cold-path full catch-up (running the refresh engine with a
 * large budget) is driven by the CLI after this returns, mirroring `ctx sync`.
 *
 * The 1h digest builder is not a dependency here: this slice writes the minimal
 * §7 fixed 2-line header as the block body. When 1h merges, its ranked-gotcha
 * digest replaces `pushBlockBody` — the placement mechanics are unchanged.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  CTX_MCP_SERVER_NAME,
  ctxServerEntry,
  upsertMcpServer,
  type McpServerEntry,
} from "./mcpConfig.ts";
import { removeManagedBlock, upsertManagedBlock } from "./managedBlock.ts";

/** The two managed instruction files (P28: cover all four hosts). */
export const PUSH_PLACEMENT_FILES = ["AGENTS.md", "CLAUDE.md"] as const;
/** The MCP registration file (project scope). */
export const MCP_CONFIG_FILE = ".mcp.json";

/** CTX-IMPL §7 fixed 2-line push header — the minimal block body (pre-1h). */
export const PUSH_HEADER_BODY =
  "This project has a ctx context base (code, decisions, history, memory — with provenance).\n" +
  "Start tasks with the `context` MCP tool; drill down by passing back any [handle].";

export type WriteAction = "created" | "updated" | "unchanged";

export interface FileWrite {
  path: string;
  action: WriteAction;
}

export interface InstallOptions {
  /** Repo/checkout root where `.mcp.json`, `AGENTS.md`, `CLAUDE.md` are placed. */
  projectRoot: string;
  /** MCP command to register (default `ctx`). */
  mcpCommand?: string;
  /** MCP args (default `["mcp"]`). */
  mcpArgs?: string[];
  /** Push block body (default the §7 fixed header; 1h supplies the digest). */
  pushBlockBody?: string;
}

export interface InstallResult {
  writes: FileWrite[];
}

function readOrNull(path: string): string | null {
  return existsSync(path) ? readFileSync(path, "utf8") : null;
}

/** Write `content` to `path`, reporting created/updated/unchanged (idempotent). */
function writeFile(path: string, content: string): FileWrite {
  const before = readOrNull(path);
  if (before === content) return { path, action: "unchanged" };
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
  return { path, action: before === null ? "created" : "updated" };
}

/** Write the MCP registration (`.mcp.json` additive merge). */
export function installMcpRegistration(opts: InstallOptions): FileWrite {
  const path = join(opts.projectRoot, MCP_CONFIG_FILE);
  const entry: McpServerEntry = ctxServerEntry(opts.mcpCommand, opts.mcpArgs);
  const next = upsertMcpServer(readOrNull(path), CTX_MCP_SERVER_NAME, entry);
  return writeFile(path, next);
}

/** Write both push-placement managed blocks (AGENTS.md floor + CLAUDE.md). */
export function installPushPlacement(opts: InstallOptions): FileWrite[] {
  const body = opts.pushBlockBody ?? PUSH_HEADER_BODY;
  return PUSH_PLACEMENT_FILES.map((name) => {
    const path = join(opts.projectRoot, name);
    return writeFile(path, upsertManagedBlock(readOrNull(path), body));
  });
}

/** Run the full managed-write install (MCP registration + push placement). */
export function installProject(opts: InstallOptions): InstallResult {
  return { writes: [installMcpRegistration(opts), ...installPushPlacement(opts)] };
}

/**
 * `ctx doctor --remove-push` (§11): restore each placement file byte-exact minus
 * the managed block. A file that becomes empty (ctx created it) is deleted so the
 * restore is "as if never installed". The `.mcp.json` registration is left in
 * place — `--remove-push` is scoped to push blocks only.
 */
export function removePush(projectRoot: string): FileWrite[] {
  const writes: FileWrite[] = [];
  for (const name of PUSH_PLACEMENT_FILES) {
    const path = join(projectRoot, name);
    const before = readOrNull(path);
    if (before === null) continue; // nothing to remove
    const restored = removeManagedBlock(before);
    if (restored.length === 0) {
      rmSync(path, { force: true });
      writes.push({ path, action: "updated" });
    } else if (restored !== before) {
      writeFileSync(path, restored);
      writes.push({ path, action: "updated" });
    } else {
      writes.push({ path, action: "unchanged" });
    }
  }
  return writes;
}
