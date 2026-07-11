/**
 * `ctx guide` command — start the ephemeral loopback render surface, or export a
 * self-contained snapshot (`--export <dir>`). Read-only: opens the project store,
 * serves projections in-process, opens the browser detached (suppressed under
 * `CTX_NO_OPEN`), and stays up until idle/disconnect teardown.
 */
import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { openStore, buildFixtureStore, type Store } from "@contexa/core";
import { startGuideServer } from "./server.ts";
import { exportGuide } from "./export.ts";
import { openInBrowser } from "./open.ts";

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
  /** `--fixture`: serve the deterministic fixture store (demo / smoke), not the repo. */
  fixture?: boolean;
  /** Idle shutdown override (ms) — tests set this small. */
  idleMs?: number;
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

function openGuideStore(io: GuideIo, fixture: boolean): Store {
  const store = openStore({ home: io.home, projectDir: io.projectDir });
  if (fixture) buildFixtureStore(store);
  return store;
}

/** Run `ctx guide`. Returns an exit code; when serving, resolves on teardown. */
export async function runGuide(io: GuideIo, flags: GuideFlags): Promise<number> {
  const now = io.now ?? Date.now;
  const env = io.env ?? process.env;

  if (flags.exportDir !== undefined) {
    const store = openGuideStore(io, flags.fixture ?? false);
    try {
      const dir = resolve(flags.exportDir);
      const result = exportGuide(store, dir, now);
      io.out(`ctx guide: exported ${result.files.length} file(s) + ${result.subjects} subject(s)`);
      io.out(`  ${result.dir}`);
      io.out("  self-contained snapshot (offline, zero external URLs) — open index.html");
      return 0;
    } finally {
      store.close();
    }
  }

  const store = openGuideStore(io, flags.fixture ?? false);
  let server;
  try {
    server = await startGuideServer({
      store,
      now,
      env,
      ...(resolveDistDir() !== undefined ? { distDir: resolveDistDir() } : {}),
      ...(flags.idleMs !== undefined ? { idleMs: flags.idleMs } : {}),
    });
  } catch (err) {
    store.close();
    io.out(`ctx guide: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }

  const opened = openInBrowser(server.url, env);
  io.out(`ctx guide: serving on ${server.origin}`);
  io.out(`  ${server.url}`);
  io.out(
    opened
      ? "  opening in your browser… (idle/disconnect auto-shutdown)"
      : "  CTX_NO_OPEN set — open the URL above (idle/disconnect auto-shutdown)",
  );

  // Serve until idle/disconnect teardown; then close the store.
  await server.closed;
  store.close();
  io.out("ctx guide: session ended.");
  return 0;
}
