#!/usr/bin/env node
/**
 * ctx CLI entry.
 *
 * Slice 1d lands `ctx sync` — the all-sources orchestration entry point (P28):
 * it opens the project store, builds the source registry via the core factory,
 * and drives the RefreshEngine generically (not git-specific), running the cold
 * path with a large budget for full catch-up (§4.4). With only the git adapter
 * registered so far it exercises git, but the command never hardcodes it.
 *
 * The remaining subcommands (install/doctor/mcp/guide/import/remember/recall/
 * memory/push) land in later M1 slices; until then they return a success-shaped
 * notice rather than an unknown-command error (§9 addenda).
 */
import { pathToFileURL } from "node:url";
import { createDefaultRegistry, openStore, RefreshEngine } from "@ctx/core";

/** Cold-path budget: large enough for a full first-call catch-up (§4.4). The
 *  engine's first-call gate uses `catchupGateMs`, so raise both together. */
export const SYNC_BUDGET_MS = 600_000;

export interface CliIO {
  out(s: string): void;
  err(s: string): void;
}

const defaultIO: CliIO = {
  out: (s) => void process.stdout.write(s),
  err: (s) => void process.stderr.write(s),
};

export interface SyncOptions {
  projectDir?: string;
  home?: string;
}

/** `ctx sync` — drive the registry-generic refresh engine over all sources. */
export async function runSync(
  args: string[],
  io: CliIO = defaultIO,
  opts: SyncOptions = {},
): Promise<number> {
  const force = args.includes("--force"); // escape hatch (file-scan sources); git is exact.
  const store = openStore({ projectDir: opts.projectDir, home: opts.home });
  try {
    const registry = createDefaultRegistry();
    const engine = new RefreshEngine(store, registry, {
      // Cold path: the first-call catch-up gate must not clip a full sync.
      catchupGateMs: SYNC_BUDGET_MS,
    });
    const report = await engine.refresh(SYNC_BUDGET_MS);
    await engine.background; // finish any budget-deferred remainder before exit
    io.out(`ctx sync: ${report.status}${force ? " (force)" : ""}\n`);
    for (const s of report.sources) {
      const tail = s.error ? ` — ${s.error}` : "";
      io.out(`  ${s.source}: ${s.state} (behind ${s.magnitude}, gen ${s.publishedGen})${tail}\n`);
    }
    return report.frozenSources.length > 0 ? 1 : 0;
  } finally {
    store.close();
  }
}

const HELP = `ctx — developer-local context engineering

Usage: ctx <command>

Commands (available now):
  sync            Ingest all registered sources into the project context base

More commands (install/doctor/mcp/guide/import/remember/recall/memory/push)
land in later M1 slices.
`;

export async function run(argv: string[], io: CliIO = defaultIO): Promise<number> {
  const [cmd, ...rest] = argv;
  switch (cmd) {
    case "sync":
      return runSync(rest, io);
    case undefined:
    case "-h":
    case "--help":
      io.out(HELP);
      return 0;
    default:
      // Success-shaped notice, never an unknown-command error (§7 serving rule).
      io.out(`ctx: '${cmd}' lands in a later M1 slice. Available now: sync.\n`);
      return 0;
  }
}

export function main(): void {
  void run(process.argv.slice(2)).then((code) => {
    if (code !== 0) process.exitCode = code;
  });
}

// Run only when executed directly (never on import — tests import runSync).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
