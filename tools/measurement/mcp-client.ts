/**
 * mcp-client — a dependency-free MCP stdio JSON-RPC 2.0 client for the E0
 * retrieval benchmark (MEASUREMENT-DESIGN-V2 §1b).
 *
 * It spawns `ctx mcp` exactly as the arm-B wrapper does (run-from-source via the
 * tsx loader; command/args/env read from a sandbox's `.mcp.json`), speaks the
 * minimal handshake (`initialize` → `notifications/initialized`), then issues
 * `tools/call` requests with a per-request timeout. No agent, no model spend.
 *
 * The server refuses to START with a model key in the environment (`assertNoEgress`,
 * M14), so the child env is scrubbed of ANTHROPIC_API_KEY / CLAUDE_CODE_OAUTH_TOKEN /
 * OPENAI_API_KEY before spawn.
 *
 * Verified against a real frozen store (probe, 2026-07-10): initialize/tools/list/
 * tools/call all round-trip; `context` returns `{content:[{text}], isError}` with
 * resolvable `[handle]`s; a no-seed miss returns `isError:false` with the O-33
 * "use task mode" guidance — so completion is classified by TEXT, not `isError`.
 */
import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { createInterface, type Interface } from "node:readline";

/** ctx MCP server config, as stored in a sandbox arm-B `.mcp.json`. */
export interface CtxMcpConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

/** One tool result (or a client-side failure standing in for one). */
export interface ToolCallOutcome {
  /** Wall time from send to matched reply, ms. */
  latency_ms: number;
  /** How the call ended (transport-level; relevance is judged separately). */
  completion: "hit" | "miss" | "timeout" | "transport-error";
  /** `isError` from the tool result (a MISS often has isError:false — O-33). */
  is_error: boolean;
  /** The tool's text payload (verbatim; empty on timeout/transport-error). */
  text: string;
  /** Advertised handles parsed from `text` (deduped, id-shaped). */
  handles: string[];
  /** A transport/timeout note when completion is not hit/miss. */
  note?: string;
}

/** Model-key env vars that would make the server refuse to start (M14). */
const EGRESS_KEYS = [
  "ANTHROPIC_API_KEY",
  "CLAUDE_CODE_OAUTH_TOKEN",
  "OPENAI_API_KEY",
  "GEMINI_API_KEY",
];

/** Miss/guidance markers — a tool RESPONDED but returned no usable seed. Verbatim
 *  fragments from the ctx serving surface (engine.ts unknown-ref / no-index branch);
 *  matching is substring, case-insensitive. */
const MISS_MARKERS = [
  "does not resolve to a known entity",
  "not indexed",
  "no results",
  "nothing indexed",
  "use task mode",
];

/** Parse id-shaped `[handle]`s out of a ctx response. ctx handles are short
 *  base36-ish ids (e.g. `c3d118`); we require at least one digit to avoid catching
 *  the literal `[handle]` that appears in guidance text. Deduped, order-preserved. */
export function parseHandles(text: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const m of text.matchAll(/\[([0-9a-z]{4,16})\]/g)) {
    const h = m[1] as string;
    if (!/[0-9]/.test(h)) continue; // skip words like "handle"
    if (seen.has(h)) continue;
    seen.add(h);
    out.push(h);
  }
  return out;
}

function classifyText(text: string, isError: boolean): "hit" | "miss" {
  const lower = text.toLowerCase();
  if (isError) return "miss";
  if (MISS_MARKERS.some((mk) => lower.includes(mk))) return "miss";
  if (text.trim().length === 0) return "miss";
  return "hit";
}

interface Pending {
  resolve: (o: Record<string, unknown>) => void;
  reject: (e: Error) => void;
  timer: NodeJS.Timeout;
}

/**
 * A single spawned `ctx mcp` session. Reused across a query's reps + drill-downs;
 * one instance per (task, query batch) keeps the frozen store warm. Call `start()`
 * before any `callContext()`, and `stop()` when done.
 */
export class McpClient {
  #child: ChildProcessWithoutNullStreams | null = null;
  #rl: Interface | null = null;
  #pending = new Map<number, Pending>();
  #nextId = 1;
  #stderr = "";
  readonly #config: CtxMcpConfig;
  readonly #cwd: string;

  constructor(config: CtxMcpConfig, cwd: string) {
    this.#config = config;
    this.#cwd = cwd;
  }

  /** Spawn the server and complete the MCP handshake. Rejects on spawn/init failure. */
  async start(initTimeoutMs = 60_000): Promise<void> {
    const env: NodeJS.ProcessEnv = { ...process.env, ...this.#config.env };
    for (const k of EGRESS_KEYS) delete env[k];
    const child = spawn(this.#config.command, this.#config.args ?? [], {
      cwd: this.#cwd,
      env,
      stdio: ["pipe", "pipe", "pipe"],
    }) as ChildProcessWithoutNullStreams;
    this.#child = child;
    child.stderr.on("data", (d: Buffer) => {
      this.#stderr += d.toString();
      if (this.#stderr.length > 64_000) this.#stderr = this.#stderr.slice(-32_000);
    });
    const rl = createInterface({ input: child.stdout, crlfDelay: Number.POSITIVE_INFINITY });
    this.#rl = rl;
    rl.on("line", (line) => this.#onLine(line));
    const spawnErr = new Promise<never>((_, rej) => {
      child.once("error", (e) => rej(new Error(`spawn failed: ${e.message}`)));
      child.once("exit", (code) =>
        rej(new Error(`server exited early (code ${code}) stderr: ${this.#stderr.slice(-400)}`)),
      );
    });
    await Promise.race([
      this.#request(
        "initialize",
        {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "e0-bench", version: "0" },
        },
        initTimeoutMs,
      ),
      spawnErr,
    ]);
    // notifications/initialized is a notification (no id / no reply).
    child.stdin.write(
      `${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`,
    );
  }

  #onLine(line: string): void {
    const t = line.trim();
    if (!t.startsWith("{")) return;
    let o: Record<string, unknown>;
    try {
      o = JSON.parse(t) as Record<string, unknown>;
    } catch {
      return;
    }
    const id = o.id;
    if (typeof id !== "number" || !this.#pending.has(id)) return;
    const p = this.#pending.get(id) as Pending;
    this.#pending.delete(id);
    clearTimeout(p.timer);
    p.resolve(o);
  }

  #request(method: string, params: unknown, timeoutMs: number): Promise<Record<string, unknown>> {
    const child = this.#child;
    if (!child) return Promise.reject(new Error("client not started"));
    const id = this.#nextId++;
    return new Promise<Record<string, unknown>>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(id);
        reject(new Error(`timeout awaiting ${method} (${timeoutMs}ms)`));
      }, timeoutMs);
      this.#pending.set(id, { resolve, reject, timer });
      child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
    });
  }

  /**
   * Call the `context` tool once with a timeout, returning a classified outcome.
   * Never throws — a timeout or transport fault is recorded as a completion state
   * (the benchmark measures reliability; an exception would lose the data point).
   */
  async callContext(args: Record<string, unknown>, timeoutMs: number): Promise<ToolCallOutcome> {
    const started = Date.now();
    try {
      const reply = await this.#request(
        "tools/call",
        { name: "context", arguments: args },
        timeoutMs,
      );
      const latency = Date.now() - started;
      if (reply.error) {
        const err = reply.error as { message?: string };
        return {
          latency_ms: latency,
          completion: "transport-error",
          is_error: true,
          text: "",
          handles: [],
          note: `jsonrpc error: ${err.message ?? "unknown"}`,
        };
      }
      const result = (reply.result ?? {}) as {
        content?: { type?: string; text?: string }[];
        isError?: boolean;
      };
      const text = (result.content ?? [])
        .map((c) => (typeof c.text === "string" ? c.text : ""))
        .join("");
      const isError = result.isError === true;
      const completion = classifyText(text, isError);
      return {
        latency_ms: latency,
        completion,
        is_error: isError,
        text,
        handles: parseHandles(text),
      };
    } catch (e) {
      const latency = Date.now() - started;
      const msg = e instanceof Error ? e.message : String(e);
      const isTimeout = /timeout/i.test(msg);
      return {
        latency_ms: latency,
        completion: isTimeout ? "timeout" : "transport-error",
        is_error: true,
        text: "",
        handles: [],
        note: msg,
      };
    }
  }

  /** Terminate the server; safe to call more than once. */
  stop(): void {
    for (const p of this.#pending.values()) {
      clearTimeout(p.timer);
      p.reject(new Error("client stopped"));
    }
    this.#pending.clear();
    this.#rl?.close();
    this.#rl = null;
    const child = this.#child;
    this.#child = null;
    if (child) {
      try {
        child.stdin.end();
      } catch {
        /* ignore */
      }
      child.kill();
    }
  }
}
