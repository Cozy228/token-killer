/**
 * Committed / overlay memory file layout (slice 3 — the storage locus).
 *
 * Durable memory now lives in committed `.ctx/` files; the SQLite store is a
 * rebuildable index over them (B1). Two zones (the third — external snapshots —
 * is out of scope here):
 *
 *   ① Mainline (committed, git-synced, shared):
 *      .ctx/memory/log.md        — append-only memory entries (C1, one/line)
 *      .ctx/memory/decisions.md  — append-only lifecycle/decision log (C2)
 *      .ctx/memory/details/<ulid>.md — write-once detail sidecars (S1)
 *   ② Overlay (gitignored, per-person, never shared — E3 landing zone):
 *      .ctx/memory.local.md      — agent remember() + host imports (needs-review)
 *      .ctx/decisions.local.md   — overlay lifecycle events
 *      .ctx/details.local/<ulid>.md — overlay detail sidecars
 *
 * Scaffold ctx writes once: `.ctx/.gitattributes` (E2 `merge=union` on the
 * append-only logs) + `.ctx/.gitignore` (the overlay + index). Concepts follow
 * memory (C3) — the layout is laid down; there is no authored concept write path
 * yet (recorded in the slice notes).
 *
 * All values on a log line are percent-encoded (serialize.ts), so a line can
 * never be torn by the union merge. Sidecars are ULID-named + write-once — a
 * second writer never targets the same file, so union merge cannot collide.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Store } from "../store/store.ts";
import {
  parseDecision,
  parseMemory,
  serializeDecision,
  serializeMemory,
  type SerializedDecision,
  type SerializedMemory,
} from "./serialize.ts";

export type MemoryZone = "mainline" | "overlay";

const GITATTRIBUTES = `# ctx memory — append-only logs auto-merge line-wise (E2 merge=union).
# A git conflict here would signal a byte collision, never a contradiction;
# semantic contradictions are filed at post-merge reindex, not by git.
memory/log.md merge=union
memory/decisions.md merge=union
`;

const GITIGNORE = `# ctx personal overlay — gitignored, per-person, never shared (E3 / three-tier).
# Nothing auto-generated (agent remember, host imports) reaches git unreviewed.
*.local.md
*.local.jsonc
details.local/
`;

/** Strip the `mem:` prefix to get the ULID that names a detail sidecar. */
export function ulidOf(memoryId: string): string {
  return memoryId.startsWith("mem:") ? memoryId.slice(4) : memoryId;
}

export class MemoryFiles {
  readonly ctxRoot: string;

  constructor(ctxRoot: string) {
    this.ctxRoot = ctxRoot;
  }

  /** The `.ctx` directory under a store's current checkout root. */
  static forStore(store: Store): MemoryFiles {
    return new MemoryFiles(join(store.projectRoot, ".ctx"));
  }

  // ---- path helpers ----

  #memoryLog(zone: MemoryZone): string {
    return zone === "mainline"
      ? join(this.ctxRoot, "memory", "log.md")
      : join(this.ctxRoot, "memory.local.md");
  }

  #decisionLog(zone: MemoryZone): string {
    return zone === "mainline"
      ? join(this.ctxRoot, "memory", "decisions.md")
      : join(this.ctxRoot, "decisions.local.md");
  }

  #detailsDir(zone: MemoryZone): string {
    return zone === "mainline"
      ? join(this.ctxRoot, "memory", "details")
      : join(this.ctxRoot, "details.local");
  }

  sidecarPath(zone: MemoryZone, ulid: string): string {
    return join(this.#detailsDir(zone), `${ulid}.md`);
  }

  // ---- scaffold ----

  /** Idempotently lay down the committed scaffold (`.gitattributes`,
   *  `.gitignore`, the `memory/` + `details/` dirs, and the `concepts/` layout).
   *  Never overwrites an existing file (non-destruction). */
  ensureScaffold(): void {
    mkdirSync(join(this.ctxRoot, "memory", "details"), { recursive: true });
    mkdirSync(join(this.ctxRoot, "concepts"), { recursive: true });
    const attrs = join(this.ctxRoot, ".gitattributes");
    if (!existsSync(attrs)) writeFileSync(attrs, GITATTRIBUTES, "utf8");
    const ignore = join(this.ctxRoot, ".gitignore");
    if (!existsSync(ignore)) writeFileSync(ignore, GITIGNORE, "utf8");
    // C3: concepts follow memory into the file model — layout only for now.
    const conceptsKeep = join(this.ctxRoot, "concepts", ".gitkeep");
    if (!existsSync(conceptsKeep)) writeFileSync(conceptsKeep, "", "utf8");
  }

  // ---- append (write-through: sidecar first, then the log line) ----

  /** Append a memory entry to `zone`. If `detailBody` is present it is written
   *  write-once to the ULID-named sidecar FIRST (S1a single-commit atomicity),
   *  then the log line is appended carrying the `detail=<ulid>` pointer. */
  appendMemory(zone: MemoryZone, entry: SerializedMemory, detailBody?: string): void {
    this.ensureScaffold();
    if (detailBody !== undefined && detailBody.length > 0) {
      const ulid = entry.detailPointer ?? ulidOf(entry.memoryId);
      const path = this.sidecarPath(zone, ulid);
      if (!existsSync(path)) {
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, detailBody, "utf8"); // write-once — never overwrite
      }
      entry.detailPointer = ulid;
    }
    appendLine(this.#memoryLog(zone), serializeMemory(entry));
  }

  /** Append a lifecycle / decision event to `zone`. */
  appendDecision(zone: MemoryZone, event: SerializedDecision): void {
    this.ensureScaffold();
    appendLine(this.#decisionLog(zone), serializeDecision(event));
  }

  // ---- read ----

  memoryLines(zone: MemoryZone): string[] {
    return readLines(this.#memoryLog(zone));
  }

  decisionLines(zone: MemoryZone): string[] {
    return readLines(this.#decisionLog(zone));
  }

  readMemories(zone: MemoryZone): SerializedMemory[] {
    const out: SerializedMemory[] = [];
    for (const raw of this.memoryLines(zone)) {
      const m = parseMemory(raw);
      if (m) out.push(m);
    }
    return out;
  }

  readDecisions(zone: MemoryZone): SerializedDecision[] {
    const out: SerializedDecision[] = [];
    for (const raw of this.decisionLines(zone)) {
      const d = parseDecision(raw);
      if (d) out.push(d);
    }
    return out;
  }

  /** Read a detail sidecar body. Missing sidecar → `undefined` (a dangling
   *  pointer is success-shaped at the reader, per S1(b) — never a throw). */
  readSidecar(zone: MemoryZone, ulid: string): string | undefined {
    const path = this.sidecarPath(zone, ulid);
    return existsSync(path) ? readFileSync(path, "utf8") : undefined;
  }
}

function appendLine(file: string, text: string): void {
  mkdirSync(dirname(file), { recursive: true });
  appendFileSync(file, `${text}\n`, "utf8");
}

function readLines(file: string): string[] {
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8")
    .split("\n")
    .map((l) => l.trimEnd())
    .filter((l) => l.length > 0);
}
