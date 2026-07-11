/**
 * `ctx mcp` — MCP stdio server (CONTEXA-IMPL §7 serving surface, slice 1g).
 *
 * A THIN stdio JSON-RPC 2.0 shim (§1: ~50-line shim) over the `@contexa/core`
 * serving library. MCP's stdio transport is newline-delimited JSON-RPC — one
 * message per line, no embedded newlines. We implement the minimal loop locally
 * rather than depend on `@modelcontextprotocol/sdk`: the SDK is NOT in this
 * workspace's lockfile/pnpm store, and the assignment forbids network installs —
 * so a dependency-free loop keeps the shim honest and installable.
 *
 * Methods: `initialize`, `notifications/initialized`, `tools/list`,
 * `tools/call`, `ping`. Recoverable serving conditions ride back inside the
 * tool result (`isError` per §7 taxonomy); JSON-RPC-level errors are reserved
 * for protocol faults (bad method / parse error).
 */
import { createInterface } from "node:readline";
import {
  ACCELERATOR_DISCLOSURE,
  assertNoEgress,
  claimEnvelopeFor,
  createDefaultRegistry,
  openStore,
  RefreshEngine,
  serveContext,
  serveRemember,
  serveSearch,
  type ClaimEnvelope,
  type RefreshReport,
  type ServeDeps,
  type ServeResponse,
  type Store,
} from "@contexa/core";

/** MCP protocol revision this shim speaks (stdio newline-delimited JSON-RPC). */
export const MCP_PROTOCOL_VERSION = "2024-11-05";
export const SERVER_INFO = { name: "ctx", version: "0.0.0" } as const;

/** Serve-path refresh gate (§4.1 time-box); large enough for a warm no-op. */
export const MCP_REFRESH_BUDGET_MS = 3_000;

export const TOOLS = [
  {
    name: "context",
    description:
      "Start any task here — a rebuildable accelerator index of cited sources, NOT a validated " +
      "decision oracle (DR-01). Returns this project's context for a subject: decisions (why), " +
      "history (what happened), memory (what we learned), each with a resolvable [handle] and a " +
      "claim envelope (derivation/confidence/status/freshness/disclosure). " +
      "Pass `task` (natural language), `ref` (entity id / name), or a [handle] to drill down.",
    inputSchema: {
      type: "object",
      properties: {
        ref: {
          type: "string",
          description: "Entity id, name, or a [handle] from a prior response",
        },
        task: { type: "string", description: "Natural-language task/question" },
        handle: { type: "string", description: "A [handle] to expand via read-through" },
        budget: {
          type: "string",
          enum: ["lean", "wide"],
          description: "Response budget (default lean)",
        },
      },
    },
  },
  {
    name: "search",
    description: "Cross-source ranked lookup over the context base; every hit carries a [handle].",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
        kinds: {
          type: "array",
          items: { type: "string" },
          description: "Optional entity-kind filter",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "remember",
    description:
      "Persist a durable project note (gist ≤240 chars). `anchors` tie it to entities; " +
      "`supersedes` retires a prior note. Recoverable issues return guidance, not errors.",
    inputSchema: {
      type: "object",
      properties: {
        note: { type: "string" },
        detail: { type: "string" },
        anchors: { type: "array", items: { type: "string" } },
        supersedes: { type: "string" },
      },
      required: ["note"],
    },
  },
] as const;

interface JsonRpcRequest {
  jsonrpc?: string;
  id?: number | string | null;
  method?: string;
  params?: unknown;
}

export interface McpServerOptions {
  input: NodeJS.ReadableStream;
  output: NodeJS.WritableStream;
  deps: ServeDeps;
}

function send(output: NodeJS.WritableStream, message: unknown): void {
  output.write(`${JSON.stringify(message)}\n`);
}

function reply(output: NodeJS.WritableStream, id: number | string | null, result: unknown): void {
  send(output, { jsonrpc: "2.0", id, result });
}

function replyError(
  output: NodeJS.WritableStream,
  id: number | string | null,
  code: number,
  message: string,
): void {
  send(output, { jsonrpc: "2.0", id, error: { code, message } });
}

/**
 * DR-31: serialize the minimum claim envelope for every served item through the
 * MCP machine interface, under the caller's scope (this stdio session). The entity
 * ids come from the response diag (never re-selected); each envelope carries the
 * same per-claim evidence/derivation/confidence/status/freshness/disclosure a human
 * gets, plus the DR-01 accelerator disclosure. R6: same claims, same citations,
 * same UNKNOWN/restricted outcomes for an agent as for a person.
 */
function envelopesFor(deps: ServeDeps, response: ServeResponse): ClaimEnvelope[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  const add = (id: string): void => {
    if (!seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  };
  for (const section of response.diag.sections ?? []) {
    for (const item of section.items) add(item.entityId);
  }
  for (const item of response.diag.search?.items ?? []) add(item.entityId);
  const envelopes: ClaimEnvelope[] = [];
  for (const id of ids) {
    const entity = deps.store.getEntity(id);
    if (entity) envelopes.push(claimEnvelopeFor(deps.store, entity));
  }
  return envelopes;
}

async function callTool(deps: ServeDeps, name: string, args: Record<string, unknown>) {
  switch (name) {
    case "context":
      return serveContext(deps, args);
    case "search":
      return serveSearch(deps, args);
    case "remember":
      return serveRemember(deps, args);
    default:
      return undefined;
  }
}

/**
 * Drive the JSON-RPC loop over `input`/`output` until input ends. Exposed for
 * the generic MCP stdio client fixture test (spawn, initialize, tools/list,
 * tools/call) as well as `ctx mcp`.
 */
export async function runMcpServer(opts: McpServerOptions): Promise<void> {
  const { output, deps } = opts;
  const rl = createInterface({ input: opts.input, crlfDelay: Number.POSITIVE_INFINITY });
  for await (const line of rl) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    let req: JsonRpcRequest;
    try {
      req = JSON.parse(trimmed) as JsonRpcRequest;
    } catch {
      replyError(output, null, -32700, "parse error");
      continue;
    }
    const id = req.id ?? null;
    const isNotification = req.id === undefined || req.id === null;
    switch (req.method) {
      case "initialize":
        reply(output, id, {
          protocolVersion: MCP_PROTOCOL_VERSION,
          capabilities: { tools: {} },
          serverInfo: SERVER_INFO,
        });
        break;
      case "notifications/initialized":
        break; // notification — no response
      case "ping":
        if (!isNotification) reply(output, id, {});
        break;
      case "tools/list":
        reply(output, id, { tools: TOOLS });
        break;
      case "tools/call": {
        const params = (req.params ?? {}) as { name?: string; arguments?: Record<string, unknown> };
        const name = params.name ?? "";
        const args = params.arguments ?? {};
        try {
          const response = await callTool(deps, name, args);
          if (response === undefined) {
            replyError(output, id, -32602, `unknown tool: ${name}`);
            break;
          }
          reply(output, id, {
            content: [{ type: "text", text: response.text }],
            // DR-31/DR-01: the machine-readable claim envelopes + accelerator
            // disclosure ride alongside the human text (R6 same-claim interface).
            structuredContent: {
              disclosure: ACCELERATOR_DISCLOSURE,
              envelopes: envelopesFor(deps, response),
            },
            isError: response.isError,
          });
        } catch (err) {
          // A thrown fault (e.g. the egress refusal) → tool-level isError, so the
          // agent sees a message rather than a dead transport.
          reply(output, id, {
            content: [{ type: "text", text: err instanceof Error ? err.message : String(err) }],
            isError: true,
          });
        }
        break;
      }
      default:
        if (!isNotification)
          replyError(output, id, -32601, `method not found: ${req.method ?? "(none)"}`);
    }
  }
}

export interface RunMcpOptions {
  projectDir?: string;
  home?: string;
  now?: () => number;
}

/** `ctx mcp` entry: open the store, wire refresh-before-select, serve on stdio. */
export async function runMcp(opts: RunMcpOptions = {}): Promise<number> {
  assertNoEgress(process.env); // refuse to START with a model key set (M14)
  const store: Store = openStore({
    ...(opts.projectDir !== undefined ? { projectDir: opts.projectDir } : {}),
    ...(opts.home !== undefined ? { home: opts.home } : {}),
    ...(opts.now !== undefined ? { now: opts.now } : {}),
  });
  // Symbol-level `touches` (slice 2b) come from the default registry: serve
  // returns symbol biographies, not just file-level history.
  const registry = createDefaultRegistry();
  const engine = new RefreshEngine(
    store,
    registry,
    opts.now !== undefined ? { now: opts.now } : {},
  );
  const refresh = (budgetMs: number): Promise<RefreshReport> => engine.refresh(budgetMs);
  const deps: ServeDeps = {
    store,
    refresh,
    serveBudgetMs: MCP_REFRESH_BUDGET_MS,
    ...(opts.now !== undefined ? { now: opts.now } : {}),
  };
  try {
    await runMcpServer({ input: process.stdin, output: process.stdout, deps });
    await engine.background; // let any budget-deferred reconcile finish
    return 0;
  } finally {
    store.close();
  }
}
