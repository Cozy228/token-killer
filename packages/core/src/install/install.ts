/**
 * `ctx install` host integration (CTX-IMPL §7 CLI / §9 slice 1i, P28).
 *
 * Slice 1i owns two managed writes:
 *  (a) the MCP-server registration for Claude Code → project `.mcp.json`
 *      (surface choice + rationale in mcpConfig.ts), command `ctx mcp`;
 *  (b) push-block placement — REUSING slice 1h's push surface: the ≤1KB digest
 *      (`buildPushBlock`) placed into the AGENTS.md + CLAUDE.md two-file floor
 *      (`placePushBlock`, idempotent + byte-preserving). 1i adds only the pieces
 *      1h does not: MCP registration, the doctor checks, and byte-exact removal
 *      (`removePush`, the §11 rollback that `ctx doctor --remove-push` calls).
 *
 * ALL writes are additive (JSON merge / managed block) — user content is never
 * clobbered. Cold-path full catch-up (running the refresh engine with a large
 * budget) is driven by the CLI between (a) and (b) so the placed digest reflects
 * the freshly-ingested context base.
 */
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Store } from "../store/store.ts";
import { buildPushBlock, renderPushBlock } from "../push/block.ts";
import { DEFAULT_PUSH_TARGETS, placePushBlock, type PlacementResult } from "../push/hosts.ts";
import {
  CTX_MCP_SERVER_NAME,
  ctxServerEntry,
  upsertMcpServer,
  type McpServerEntry,
} from "./mcpConfig.ts";

/** The MCP registration file (project scope). */
export const MCP_CONFIG_FILE = ".mcp.json";

/**
 * Byte-exact removal span: a managed block plus a single leading "\n" separator
 * and a trailing "\n" — the exact bytes `placePushBlock` adds when it appends a
 * block after existing content that ends in one newline (the shape of real
 * AGENTS.md/CLAUDE.md). Inverting it restores the file byte-exact (§11).
 */
const REMOVE_SPAN = /\n?<!--\s*ctx:managed:begin\s*-->[\s\S]*?<!--\s*ctx:managed:end\s*-->\n?/;

export type WriteAction = "created" | "updated" | "unchanged";

export interface FileWrite {
  path: string;
  action: WriteAction;
}

export interface InstallOptions {
  /** Repo/checkout root where `.mcp.json` + the push files are placed. */
  projectRoot: string;
  /** MCP command to register (default `ctx`). */
  mcpCommand?: string;
  /** MCP args (default `["mcp"]`). */
  mcpArgs?: string[];
  /** Store to build the real ≤1KB digest from; omitted → header-only block. */
  store?: Store;
  /** Injected clock for the digest builder (tests). */
  now?: number;
}

export interface InstallResult {
  mcp: FileWrite;
  placements: PlacementResult[];
}

function readOrNull(path: string): string | null {
  return existsSync(path) ? readFileSync(path, "utf8") : null;
}

/** Write the MCP registration (`.mcp.json` additive merge); idempotent. */
export function installMcpRegistration(opts: InstallOptions): FileWrite {
  const path = join(opts.projectRoot, MCP_CONFIG_FILE);
  const before = readOrNull(path);
  const entry: McpServerEntry = ctxServerEntry(opts.mcpCommand, opts.mcpArgs);
  const next = upsertMcpServer(before, CTX_MCP_SERVER_NAME, entry);
  if (before === next) return { path, action: "unchanged" };
  writeFileSync(path, next);
  return { path, action: before === null ? "created" : "updated" };
}

/**
 * Full managed-write install (MCP registration + push placement). The push
 * block is the store-backed ≤1KB digest when a store is supplied, otherwise the
 * fixed-header block (`renderPushBlock([])`) — both via slice 1h's builder.
 */
export function installProject(opts: InstallOptions): InstallResult {
  const mcp = installMcpRegistration(opts);
  const block = opts.store
    ? buildPushBlock(opts.store, opts.now !== undefined ? { now: opts.now } : {})
    : renderPushBlock([]);
  const placements = placePushBlock(opts.projectRoot, block.text);
  return { mcp, placements };
}

/**
 * `ctx doctor --remove-push` (§11): restore each placement file byte-exact minus
 * the managed block. A file that becomes empty (ctx created it) is deleted so the
 * restore is "as if never installed". The `.mcp.json` registration is left in
 * place — `--remove-push` is scoped to push blocks only.
 */
export function removePush(
  projectRoot: string,
  targets: readonly string[] = DEFAULT_PUSH_TARGETS,
): FileWrite[] {
  const writes: FileWrite[] = [];
  for (const name of targets) {
    const path = join(projectRoot, name);
    const before = readOrNull(path);
    if (before === null) continue; // nothing to remove
    const restored = before.replace(REMOVE_SPAN, "");
    if (restored === before) {
      writes.push({ path, action: "unchanged" }); // no managed block present
    } else if (restored.length === 0) {
      rmSync(path, { force: true }); // ctx-created file → remove entirely
      writes.push({ path, action: "updated" });
    } else {
      writeFileSync(path, restored);
      writes.push({ path, action: "updated" });
    }
  }
  return writes;
}
