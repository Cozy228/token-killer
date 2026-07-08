/**
 * Parse worker (CONTEXA-IMPL §5.2; ports codegraph `parse-worker.ts`). Runs on a
 * `worker_threads.Worker`, owns one `CodeParserCore`, and parses/extracts one
 * file at a time. Isolation is the point: a WASM memory fault poisons every
 * later parse, so on the D23 OOM signature we `process.exit(1)` and let the
 * manager respawn a clean isolate.
 *
 * The worker is loaded by the manager with `--experimental-strip-types` when
 * core runs from `.ts` source; it therefore imports the same `.ts` engine
 * modules as everything else.
 */
import { parentPort } from "node:worker_threads";
import { CodeParserCore } from "./runtime.ts";
import { HANG_CONTENT, POISON_CONTENT, type ToWorker } from "./protocol.ts";

installEmscriptenStderrFilter();

const core = new CodeParserCore();
const port = parentPort;
if (port) {
  port.on("message", (msg: ToWorker) => void handle(msg));
}

async function handle(msg: ToWorker): Promise<void> {
  if (!port) return;
  if (msg.type === "load") {
    for (const id of msg.langIds) await core.ensureLanguage(id); // sequential
    port.postMessage({ type: "loaded" });
    return;
  }
  if (msg.type === "shutdown") {
    core.dispose();
    port.postMessage({ type: "loaded" });
    return;
  }
  // parse
  const { id, relPath, content, langId } = msg;
  if (content === HANG_CONTENT) return; // never reply — exercises the manager timeout
  try {
    if (content === POISON_CONTENT) {
      throw new Error("memory access out of bounds (simulated WASM corruption)");
    }
    const result = await core.parse(relPath, content, langId);
    port.postMessage({ type: "parse-result", id, result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // A WASM memory fault leaves the module corrupted — all later parses would
    // cascade-fail. Crash so the manager spawns a fresh isolate with a clean
    // heap (D23; codegraph parse-worker.ts).
    if (message.includes("memory access out of bounds") || message.includes("out of memory")) {
      process.exit(1);
    }
    port.postMessage({ type: "parse-error", id, message });
  }
}

/**
 * Emscripten prints `Aborted()` (+ an `-sASSERTIONS` hint) straight to stderr
 * when WASM aborts, before the JS catch runs; the worker inherits the parent's
 * stderr, so each crash would leak noise. Filter exactly those lines at the
 * source (ported verbatim from codegraph parse-worker.ts). Everything we log
 * ourselves is untouched.
 */
function installEmscriptenStderrFilter(): void {
  const realWrite = process.stderr.write.bind(process.stderr);
  process.stderr.write = ((
    chunk: string | Uint8Array,
    encoding?: BufferEncoding | ((err?: Error | null) => void),
    cb?: (err?: Error | null) => void,
  ): boolean => {
    const s = typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8");
    if (s.startsWith("Aborted(") || s.includes("Build with -sASSERTIONS for more info")) {
      if (typeof encoding === "function") encoding();
      else if (cb) cb();
      return true;
    }
    return realWrite(chunk as never, encoding as never, cb as never);
  }) as typeof process.stderr.write;
}
