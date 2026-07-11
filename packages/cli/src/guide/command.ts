/**
 * `ctx guide` command (P40) — start the loopback render surface, or export a
 * self-contained snapshot (`--export <dir>`). Read-only. On startup it runs a
 * budgeted `RefreshEngine` catch-up over the REAL store (R10) so an indexed repo
 * is never stale, then serves projections in-process and opens the browser
 * detached (suppressed under `CTX_NO_OPEN`). It lives until Ctrl-C (graceful
 * close) with a long idle backstop (R13). `--fixture` builds its demo store in an
 * ISOLATED temp home and NEVER touches the real store (R10 fixture isolation).
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, dirname, join } from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  openStore,
  buildFixtureStore,
  createDefaultRegistry,
  RefreshEngine,
  type Store,
} from "@contexa/core";
import { startGuideServer } from "./server.ts";
import { exportGuide } from "./export.ts";
import { openInBrowser } from "./open.ts";

/** R10 startup catch-up budget. The serve path uses 3 s; the guide is a foreground
 *  human session, so a slightly larger gate is acceptable. */
export const GUIDE_REFRESH_BUDGET_MS = 5_000;

export interface GuideIo {
  out: (line: string) => void;
  err?: (line: string) => void;
  home?: string;
  projectDir?: string;
  /** Injected clock (tests). */
  now?: () => number;
  /** Test seam: keep the process from opening a browser + block forever. */
  env?: NodeJS.ProcessEnv;
}

export interface GuideFlags {
  /** `--export <dir>`: write a self-contained snapshot instead of serving. */
  exportDir?: string;
  /** `--fixture`: serve the deterministic fixture store (demo / smoke), isolated. */
  fixture?: boolean;
  /** Idle backstop override (ms) — tests set this small. */
  idleMs?: number;
}

/** A prepared store plus a cleanup that disposes any isolated temp home. */
interface PreparedStore {
  store: Store;
  cleanup: () => void;
}

/** Resolve the built Vite app dir when present (packages/guide/dist). */
function resolveDistDir(): string | undefined {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    // dev: packages/cli/src/guide → packages/guide/dist
    const candidates = [resolve(here, "../../../guide/dist"), resolve(here, "../../guide/dist")];
    for (const c of candidates) if (existsSync(join(c, "index.html"))) return c;
  } catch {
    /* ignore */
  }
  return undefined;
}

/**
 * Open the store the guide serves. `--fixture` builds the demo store in an ISOLATED
 * temp home (R10): the fixture's writes must NEVER land in the developer's real
 * store — the v2 build wrote fixture rows into the real project store. The real
 * (non-fixture) store is the repo's own; its cleanup is a no-op.
 */
function openGuideStore(io: GuideIo, fixture: boolean): PreparedStore {
  if (fixture) {
    const isolatedHome = mkdtempSync(join(tmpdir(), "ctx-guide-fixture-"));
    const store = openStore({ home: isolatedHome, projectDir: io.projectDir });
    buildFixtureStore(store);
    return {
      store,
      cleanup: () => rmSync(isolatedHome, { recursive: true, force: true, maxRetries: 5 }),
    };
  }
  const store = openStore({ home: io.home, projectDir: io.projectDir });
  return { store, cleanup: () => {} };
}

/**
 * R10 startup catch-up: run the SAME `RefreshEngine` the serve path uses over a
 * budget so an indexed repo is never stale. Resilient — a refresh fault must not
 * crash the guide; it serves the previous generation and reports the fault.
 */
async function refreshCatchUp(store: Store, io: GuideIo): Promise<void> {
  try {
    const registry = createDefaultRegistry();
    const engine = new RefreshEngine(store, registry, io.now !== undefined ? { now: io.now } : {});
    const report = await engine.refresh(GUIDE_REFRESH_BUDGET_MS);
    if (report.frozenSources.length > 0 && io.err) {
      io.err(
        `ctx guide: refresh froze ${report.frozenSources.join(", ")} — serving last generation`,
      );
    }
  } catch (err) {
    io.err?.(
      `ctx guide: startup refresh skipped (${err instanceof Error ? err.message : String(err)})`,
    );
  }
}

/** Run `ctx guide`. Returns an exit code; when serving, resolves on teardown. */
export async function runGuide(io: GuideIo, flags: GuideFlags): Promise<number> {
  const now = io.now ?? Date.now;
  const env = io.env ?? process.env;

  if (flags.exportDir !== undefined) {
    const prepared = openGuideStore(io, flags.fixture ?? false);
    try {
      if (!flags.fixture) await refreshCatchUp(prepared.store, io);
      const dir = resolve(flags.exportDir);
      const result = exportGuide(prepared.store, dir, now, resolveDistDir());
      io.out(`ctx guide: exported ${result.files.length} file(s) + ${result.subjects} subject(s)`);
      io.out(`  ${result.dir}`);
      io.out(
        result.mountedBundle
          ? "  self-contained snapshot (offline, real UI, zero external URLs) — open index.html"
          : "  self-contained snapshot (offline JSON, zero external URLs) — build the guide for the UI",
      );
      return 0;
    } finally {
      prepared.store.close();
      prepared.cleanup();
    }
  }

  const prepared = openGuideStore(io, flags.fixture ?? false);
  // R10: budgeted catch-up over the real store before serving (never for fixture).
  if (!flags.fixture) await refreshCatchUp(prepared.store, io);

  let server;
  try {
    const distDir = resolveDistDir();
    server = await startGuideServer({
      store: prepared.store,
      now,
      env,
      ...(distDir !== undefined ? { distDir } : {}),
      ...(flags.idleMs !== undefined ? { idleMs: flags.idleMs } : {}),
    });
  } catch (err) {
    prepared.store.close();
    prepared.cleanup();
    io.out(`ctx guide: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }

  const opened = openInBrowser(server.url, env);
  io.out(`ctx guide: serving on ${server.origin}`);
  io.out(`  ${server.url}`);
  io.out(
    opened
      ? "  opening in your browser… — press Ctrl-C to stop (idle backstop 2h)"
      : "  CTX_NO_OPEN set — open the URL above; press Ctrl-C to stop (idle backstop 2h)",
  );

  // R13: live until Ctrl-C (graceful close) or the idle backstop. Closing the tab
  // never kills the session. Signal-only shutdown (davia pattern) with the
  // re-entrancy guard inside server.close().
  const onSignal = (): void => {
    void server.close();
  };
  process.once("SIGINT", onSignal);
  process.once("SIGTERM", onSignal);

  await server.closed;
  process.removeListener("SIGINT", onSignal);
  process.removeListener("SIGTERM", onSignal);
  prepared.store.close();
  prepared.cleanup();
  io.out("ctx guide: session ended.");
  return 0;
}
