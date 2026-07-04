/**
 * Generic MCP stdio client fixture (M1 acceptance): spawn `ctx mcp`, speak
 * JSON-RPC 2.0 over stdio (newline-delimited), and exercise initialize →
 * tools/list → tools/call for each of the three tools. This is the CI-side
 * proxy for a real host (hosts are not installable in CI, CTX-IMPL §9).
 *
 * Sandbox discipline: temp CTX_HOME, a script-generated fixture repo as cwd,
 * egress keys scrubbed from the child env (the server refuses to start with one
 * set, M14), explicit spawn + per-request timeouts (CI cold-start tax),
 * cleanup with retries (Windows EBUSY).
 */
import { spawn, type ChildProcessWithoutNullStreams, execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

const CLI = resolve(dirname(fileURLToPath(import.meta.url)), "../src/cli.ts");
// Spawn from the package dir so the child resolves `tsx`/`@ctx/core` via the
// workspace node_modules; the fixture repo is passed with `--project`.
const PKG_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// --experimental-sqlite: flag-gated on Node 22.5–22.12, an accepted no-op later.
const NODE_ARGS = ["--experimental-sqlite", "--import", "tsx"];
const REQUEST_TIMEOUT = 20_000;

interface RpcResponse {
  id: number | string | null;
  result?: unknown;
  error?: { code: number; message: string };
}

/** A minimal newline-delimited JSON-RPC client over a child's stdio. */
class McpClient {
  readonly #child: ChildProcessWithoutNullStreams;
  #buffer = "";
  readonly #pending = new Map<number, (r: RpcResponse) => void>();
  #nextId = 1;
  stderr = "";

  constructor(child: ChildProcessWithoutNullStreams) {
    this.#child = child;
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => this.#onData(chunk));
    child.stderr.on("data", (d: Buffer) => {
      this.stderr += d.toString();
    });
  }

  #onData(chunk: string): void {
    this.#buffer += chunk;
    let nl = this.#buffer.indexOf("\n");
    while (nl !== -1) {
      const line = this.#buffer.slice(0, nl).trim();
      this.#buffer = this.#buffer.slice(nl + 1);
      if (line.length > 0) {
        const msg = JSON.parse(line) as RpcResponse;
        if (typeof msg.id === "number") this.#pending.get(msg.id)?.(msg);
      }
      nl = this.#buffer.indexOf("\n");
    }
  }

  request(method: string, params?: unknown): Promise<RpcResponse> {
    const id = this.#nextId++;
    const payload = { jsonrpc: "2.0", id, method, ...(params !== undefined ? { params } : {}) };
    this.#child.stdin.write(`${JSON.stringify(payload)}\n`);
    return new Promise<RpcResponse>((res, rej) => {
      const timer = setTimeout(() => {
        this.#pending.delete(id);
        rej(
          new Error(`RPC ${method} timed out after ${REQUEST_TIMEOUT}ms\nstderr:\n${this.stderr}`),
        );
      }, REQUEST_TIMEOUT);
      this.#pending.set(id, (r) => {
        clearTimeout(timer);
        res(r);
      });
    });
  }

  notify(method: string, params?: unknown): void {
    this.#child.stdin.write(
      `${JSON.stringify({ jsonrpc: "2.0", method, ...(params !== undefined ? { params } : {}) })}\n`,
    );
  }

  async close(): Promise<void> {
    this.#child.stdin.end();
    await new Promise<void>((r) => this.#child.on("close", () => r()));
  }
}

function toolText(result: unknown): { text: string; isError: boolean } {
  const r = result as { content?: Array<{ type: string; text: string }>; isError?: boolean };
  return { text: r.content?.map((c) => c.text).join("") ?? "", isError: r.isError === true };
}

describe("ctx mcp — generic stdio client fixture", () => {
  let root: string;
  let repo: string;
  let client: McpClient;
  let child: ChildProcessWithoutNullStreams;

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), "ctx-mcp-"));
    repo = join(root, "repo");
    const git = (args: string[]): void => {
      execFileSync("git", args, {
        cwd: repo,
        stdio: ["ignore", "ignore", "pipe"],
        timeout: 15_000,
        env: {
          ...process.env,
          GIT_CONFIG_GLOBAL: join(tmpdir(), "ctx-mcp-no-gitconfig"),
          GIT_CONFIG_SYSTEM: join(tmpdir(), "ctx-mcp-no-gitconfig"),
        },
      });
    };
    execFileSync("git", ["init", "-q", "-b", "main", repo], { cwd: root, timeout: 15_000 });
    git(["config", "user.email", "t@t.invalid"]);
    git(["config", "user.name", "t"]);
    writeFileSync(
      join(repo, "DECISIONS.md"),
      "# Decisions\n\n## Idempotency\n**D1 — retry must be idempotent to avoid double-charge on redelivery.**\n",
    );
    git(["add", "DECISIONS.md"]);
    git(["commit", "-q", "-m", "docs: add idempotency decision"]);

    // Scrub egress keys (M14: the server refuses to start with one set).
    const env: NodeJS.ProcessEnv = { ...process.env, CTX_HOME: join(root, "ctx-home") };
    delete env.ANTHROPIC_API_KEY;
    delete env.OPENAI_API_KEY;
    delete env.TK_SHIM_DIR; // known leak breaks spawn tests

    child = spawn(process.execPath, [...NODE_ARGS, CLI, "mcp", "--project", repo], {
      cwd: PKG_DIR,
      env,
      stdio: ["pipe", "pipe", "pipe"],
    }) as ChildProcessWithoutNullStreams;
    client = new McpClient(child);
  });

  afterAll(async () => {
    await client.close().catch(() => {});
    if (!child.killed) child.kill();
    rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });

  test("initialize returns the ctx server info + tools capability", async () => {
    const res = await client.request("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
    });
    const result = res.result as {
      protocolVersion: string;
      capabilities: { tools?: unknown };
      serverInfo: { name: string };
    };
    expect(result.serverInfo.name).toBe("ctx");
    expect(result.capabilities.tools).toBeDefined();
    client.notify("notifications/initialized");
  });

  test("tools/list exposes context, search, remember", async () => {
    const res = await client.request("tools/list");
    const tools = (res.result as { tools: Array<{ name: string; inputSchema: unknown }> }).tools;
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual(["context", "remember", "search"]);
    for (const t of tools) expect(t.inputSchema).toBeDefined();
  });

  test("tools/call remember → success-shaped result", async () => {
    const res = await client.request("tools/call", {
      name: "remember",
      arguments: { note: "idempotency keys are persisted across retries" },
    });
    const { text, isError } = toolText(res.result);
    expect(isError).toBe(false);
    expect(text).toContain("remembered [");
  });

  test("tools/call context → one markdown block, cites the decision", async () => {
    const res = await client.request("tools/call", {
      name: "context",
      arguments: { task: "why must retry be idempotent" },
    });
    const { text, isError } = toolText(res.result);
    expect(isError).toBe(false);
    expect(text.startsWith("# ctx · ")).toBe(true);
    expect(text.toLowerCase()).toContain("idempotent");
  });

  test("tools/call search → ranked matches with handles", async () => {
    const res = await client.request("tools/call", {
      name: "search",
      arguments: { query: "idempotent retry" },
    });
    const { text, isError } = toolText(res.result);
    expect(isError).toBe(false);
    expect(text).toContain("# ctx · search:");
  });

  test("tools/call on an unknown tool → JSON-RPC error", async () => {
    const res = await client.request("tools/call", { name: "nope", arguments: {} });
    expect(res.error?.code).toBe(-32602);
  });
});
