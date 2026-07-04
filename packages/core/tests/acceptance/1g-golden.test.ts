/**
 * Golden transcripts (CTX-IMPL §10): recorded input→output fixtures for
 * context / search / remember. A format change must surface as a REVIEWED DIFF
 * of these files, never silent drift. Determinism: a script-generated fixture
 * (fixed content → stable entity ids → stable blake2b handles) under a fixed
 * clock and a temp CTX_HOME sandbox (G-7).
 *
 * Update the goldens deliberately with `CTX_UPDATE_GOLDEN=1` and review the diff.
 * `remember()` mints a time+random ULID, so its one volatile handle is masked
 * (`[m·····]`); every other handle is content-derived and stable.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { DocsAdapter } from "../../src/ingest/docs.ts";
import { serveContext, serveRemember, serveSearch } from "../../src/serve/serve.ts";
import { openStore, type Store } from "../../src/store/store.ts";
import { cleanupTempDir, makeTempDir } from "../helpers/sandbox.ts";

const GOLDEN_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "golden");
const CLOCK = () => Date.UTC(2026, 6, 4);
const UPDATE = process.env.CTX_UPDATE_GOLDEN === "1";

function goldenMatch(name: string, actual: string): void {
  const file = join(GOLDEN_DIR, `${name}.md`);
  if (UPDATE) {
    mkdirSync(GOLDEN_DIR, { recursive: true });
    writeFileSync(file, actual);
    return;
  }
  let expected: string;
  try {
    expected = readFileSync(file, "utf8");
  } catch {
    throw new Error(`missing golden ${name}.md — regenerate with CTX_UPDATE_GOLDEN=1`);
  }
  expect(actual, `golden drift in ${name}.md — review + regenerate with CTX_UPDATE_GOLDEN=1`).toBe(
    expected,
  );
}

describe("acceptance: 1g golden transcripts", () => {
  let root: string;
  let store: Store;

  beforeAll(async () => {
    root = makeTempDir("ctx-golden-");
    const project = join(root, "proj");
    mkdirSync(project, { recursive: true });
    writeFileSync(
      join(project, "payments.md"),
      [
        "# Payments Service",
        "",
        "## Idempotency Rule",
        "Retry must be idempotent. A double-charge on redelivery is the failure we avoid.",
        "Persist the idempotency key so a retried request dedups on a stable id.",
        "",
      ].join("\n"),
    );
    store = openStore({ projectDir: project, home: join(root, "home"), now: CLOCK });

    const docs = new DocsAdapter();
    await docs.ingest(store, await docs.dirtyCheck(store), {
      deadline: Number.MAX_SAFE_INTEGER,
      now: CLOCK,
    });

    // Deterministic memory entity (FIXED id → stable handle, unlike remember()).
    const m = store.beginGeneration("memory");
    const memId = "mem:GOLDEN0000000000000000000";
    store.upsertEntity({
      id: memId,
      kind: "memory",
      name: "idempotency note",
      locator: { t: "store" },
      gen: m,
    });
    store.writeMemory({
      entityId: memId,
      gist: "retried payment must dedup on the idempotency key, not on wall-clock time",
      origin: "remember",
      authority: "confirmed",
    });
    store.ftsIndex(memId, {
      name: "idempotency note",
      text: "retry payment idempotency key dedup",
      kind: "memory",
    });
    store.publishGeneration("memory");
  }, 60_000);

  afterAll(() => {
    store.close();
    cleanupTempDir(root);
  });

  test("context() transcript", async () => {
    const resp = await serveContext({ store, now: CLOCK }, { task: "idempotency retry payment" });
    expect(resp.isError).toBe(false);
    goldenMatch("context", resp.text);
  });

  test("search() transcript", async () => {
    const resp = await serveSearch({ store, now: CLOCK }, { query: "idempotency key" });
    expect(resp.isError).toBe(false);
    goldenMatch("search", resp.text);
  });

  test("remember() transcript (volatile ULID handle masked)", () => {
    // Fresh sandbox store so the write does not perturb the shared fixture.
    const memRoot = makeTempDir("ctx-golden-mem-");
    const project = join(memRoot, "proj");
    mkdirSync(project, { recursive: true });
    writeFileSync(join(project, "README.md"), "# fixture\n");
    const memStore = openStore({ projectDir: project, home: join(memRoot, "home"), now: CLOCK });
    const resp = serveRemember(
      { store: memStore },
      { note: "retry queue drops metadata on redelivery" },
    );
    expect(resp.isError).toBe(false);
    const masked = resp.text.replace(/\[m[0-9a-z]{5,}\]/g, "[m·····]");
    goldenMatch("remember", masked);
    memStore.close();
    cleanupTempDir(memRoot);
  });
});
