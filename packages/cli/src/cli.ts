#!/usr/bin/env node
/**
 * ctx CLI entry.
 *
 * Slice 1d lands `ctx sync` — the all-sources orchestration entry point (P28):
 * it opens the project store, builds the source registry via the core factory,
 * and drives the RefreshEngine generically (not git-specific), running the cold
 * path with a large budget for full catch-up (§4.4).
 *
 * Slice 1c wires the memory lifecycle surface (remember/recall/memory) to the
 * `@ctx/core` library calls. `ctx import` (network carriers) lands at M4 — a
 * stub returns the P28 success-shaped "lands at M4" notice.
 *
 * Slice 1i wires `ctx install` (managed MCP registration into project
 * `.mcp.json` + push-block placement into AGENTS.md/CLAUDE.md, then a cold-path
 * full catch-up) and `ctx doctor` (read-only runtime/store/registration/push
 * verification; `--remove-push` strips the managed blocks byte-exact). The
 * remaining subcommands (guide/push) land in later M1 slices; until then they
 * return a success-shaped notice rather than an unknown-command error (§9).
 */
import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";
import {
  buildPushBlock,
  createDefaultRegistry,
  editPinVeto,
  formatDoctorReport,
  installMcpRegistration,
  listMemories,
  openStore,
  MemoryFiles,
  readMergedPushConfig,
  recall,
  RefreshEngine,
  remember,
  removePush,
  runDoctor,
  runPush,
  setMemoryLifecycle,
  type MemoryStatus,
  type Store,
} from "@ctx/core";
import { runMcp } from "./mcp.ts";

/** Cold-path budget: large enough for a full first-call catch-up (§4.4). The
 *  engine's first-call gate uses `catchupGateMs`, so raise both together. */
export const SYNC_BUDGET_MS = 600_000;

/** IO seam for `runSync` (1d shape — messages carry their own newlines). */
export interface CliIO {
  out(s: string): void;
  err(s: string): void;
}

/** IO seam for `run` (1c shape — line-oriented; entry point appends "\n"). */
export interface RunIo {
  out: (line: string) => void;
  err?: (line: string) => void;
  /** Data home override ($CTX_HOME when omitted). Tests inject a sandbox. */
  home?: string;
  /** Project dir to resolve the shard from (defaults to cwd). */
  projectDir?: string;
}

export interface SyncOptions {
  projectDir?: string;
  home?: string;
}

/** `ctx sync` — drive the registry-generic refresh engine over all sources. */
export async function runSync(args: string[], io: CliIO, opts: SyncOptions = {}): Promise<number> {
  const force = args.includes("--force"); // escape hatch (file-scan sources); git is exact.
  const store = openStore({ projectDir: opts.projectDir, home: opts.home });
  try {
    // Symbol-level `touches` (slice 2b) come from the default registry: commit
    // history joins to symbols, not just files, so `context(sym)` returns a
    // symbol biography.
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

interface ParsedArgs {
  positionals: string[];
  flags: Record<string, string[]>;
}

/** Minimal flag parser: `--flag value` (repeatable); everything else positional. */
function parseArgs(argv: string[]): ParsedArgs {
  const positionals: string[] = [];
  const flags: Record<string, string[]> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] as string;
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const val = argv[i + 1] !== undefined && !argv[i + 1]!.startsWith("--") ? argv[++i]! : "";
      (flags[key] ??= []).push(val);
    } else {
      positionals.push(a);
    }
  }
  return { positionals, flags };
}

const LIFECYCLE_VERBS: Record<string, MemoryStatus> = {
  confirm: "active",
  retire: "retired",
  review: "needs-review",
};

function withStore(io: RunIo, fn: (store: Store) => number): number {
  const store = openStore({ home: io.home, projectDir: io.projectDir });
  try {
    return fn(store);
  } finally {
    store.close();
  }
}

function cmdRemember(io: RunIo, args: ParsedArgs): number {
  const note = args.positionals[0];
  if (note === undefined) {
    io.out(
      'usage: ctx remember "<note>" [--detail <text>] [--anchor <id>]... [--supersedes <id>] [--local]',
    );
    return 2;
  }
  // `--local` (slice 5): a human note that lands in the gitignored personal
  // overlay as `active` — deliberately divergent my-view attention that NEVER
  // syncs. Plain `remember` stays the committed Mainline default.
  const local = args.flags.local !== undefined;
  return withStore(io, (store) => {
    const result = remember(store, {
      note,
      detail: args.flags.detail?.[0],
      anchors: args.flags.anchor,
      supersedes: args.flags.supersedes?.[0],
      // S8a: the CLI is the HUMAN surface. `local` → overlay+active (never shared);
      // default → committed Mainline as `active` (the E4 secret guard diverts a
      // secret-shaped note to the overlay). Write-through is always-on (slice 4).
      surface: local ? "local" : "cli",
      files: MemoryFiles.forStore(store),
    });
    if (result.ok) {
      io.out(`remembered [${result.handle}] — ${result.gist}`);
      if (result.anchors.length > 0) io.out(`  anchors: ${result.anchors.join(", ")}`);
      if (result.supersededId) io.out(`  supersedes: ${result.supersededId}`);
      if (result.status !== "active") io.out(`  status: ${result.status}`);
      if (result.localOnly) io.out("  local only — never shared");
      if (result.committedZoneDisabled) {
        io.out("  (this repo does not commit memory (E4) — kept in your personal overlay)");
      }
      if (result.remediation) io.out(`  ${result.remediation}`);
      return 0;
    }
    io.out(result.guidance); // success-shaped guidance (§7 / G-3), not an error
    return 0;
  });
}

function cmdRecall(io: RunIo, args: ParsedArgs): number {
  const handle = args.positionals[0];
  if (handle === undefined) {
    io.out("usage: ctx recall <handle|entity-id>");
    return 2;
  }
  return withStore(io, (store) => {
    const result = recall(store, handle);
    io.out(result.ok ? result.text : result.guidance);
    return 0;
  });
}

function cmdMemory(io: RunIo, args: ParsedArgs): number {
  const sub = args.positionals[0];
  if (sub === "list" || sub === undefined) {
    return withStore(io, (store) => {
      const status = args.flags.status?.[0] as MemoryStatus | undefined;
      const rows = listMemories(store, status ? { status } : {});
      if (rows.length === 0) {
        io.out("(no memory entries)");
        return 0;
      }
      for (const m of rows) io.out(`[${m.handle}] ${m.status} · ${m.authority} · ${m.gist}`);
      return 0;
    });
  }
  const target = LIFECYCLE_VERBS[sub];
  if (target === undefined) {
    io.out(`unknown memory subcommand: ${sub} (expected list|confirm|retire|review)`);
    return 2;
  }
  const id = args.positionals[1];
  if (id === undefined) {
    io.out(`usage: ctx memory ${sub} <handle|entity-id>`);
    return 2;
  }
  return withStore(io, (store) => {
    // CLI/human lifecycle decisions write-through to the committed MAINLINE
    // decision log (E3). A `confirm` on an overlay-only note also PROMOTES its
    // create body to Mainline (slice-4 item 4), unless the E4 guard diverts it.
    const result = setMemoryLifecycle(store, id, target, MemoryFiles.forStore(store));
    if (!result.ok) {
      io.out(result.guidance);
      return 0;
    }
    io.out(`${result.entityId} → ${result.status}`);
    if (result.promoted) io.out("  promoted to the shared committed memory log");
    if (result.localOnly) {
      io.out("  (this repo does not commit memory (E4) — recorded in your personal overlay)");
    }
    if (result.remediation) io.out(`  ${result.remediation}`);
    return 0;
  });
}

function cmdPush(io: RunIo, args: ParsedArgs): number {
  const sub = args.positionals[0];
  if (sub === "pin" || sub === "veto") {
    const id = args.positionals[1];
    if (id === undefined) {
      io.out(`usage: ctx push ${sub} <id|handle> [--remove]`);
      return 2;
    }
    const remove = args.flags.remove !== undefined;
    return withStore(io, (store) => {
      const res = editPinVeto(store.projectRoot, sub, id, remove ? "remove" : "add");
      if (!res.ok) {
        io.out(res.guidance ?? "could not update .ctx/push.jsonc"); // success-shaped
        return 0;
      }
      io.out(`${remove ? "un-" : ""}${sub} ${id} → ${res.path}`);
      return 0;
    });
  }

  // `ctx push --local`: render MY local view — the shared committed config merged
  // with my personal overlay attention (`.ctx/push.local.jsonc`). DISPLAY ONLY,
  // never placed into a (possibly committed) host file, so personal pins/vetoes
  // never leak into a shared artifact (slice 5, three-tier (c)).
  if (args.flags.local !== undefined) {
    return withStore(io, (store) => {
      const merged = readMergedPushConfig(store.projectRoot);
      for (const w of merged.warnings) io.out(`note: ${w}`);
      const block = buildPushBlock(store, { config: merged });
      io.out(block.text);
      io.out(
        `local view: ${block.bytes} bytes, ${block.rendered.length} gotcha(s) ` +
          "(shared config + your personal overlay) — NOT written to any file.",
      );
      return 0;
    });
  }

  // Render + place the push block (cold-path use; --if-changed = hook mode).
  const dryRun = args.flags["dry-run"] !== undefined;
  const ifChanged = args.flags["if-changed"] !== undefined;
  return withStore(io, (store) => {
    const res = runPush(store, store.projectRoot, { dryRun, ifChanged });
    for (const w of res.warnings) io.out(`note: ${w}`);
    if (res.skipped) {
      io.out("ctx push: block unchanged — nothing to write.");
      return 0;
    }
    io.out(res.block.text);
    const verb = dryRun ? "would write" : "wrote";
    for (const p of res.placements) {
      const status = p.changed ? (p.created ? "created" : "updated") : "unchanged";
      io.out(`  ${verb} ${p.path} (${status}, ${p.bytes} bytes)`);
    }
    io.out(
      `block: ${res.block.bytes} bytes, ${res.block.rendered.length} gotcha(s)` +
        (res.block.truncated ? " (budget-trimmed)" : ""),
    );
    return 0;
  });
}

function cmdImport(io: RunIo, args: ParsedArgs): number {
  const carrier = args.positionals[0] ?? "";
  // P28: `ctx import` (network carriers) lands at M4 — success-shaped notice.
  io.out(
    `ctx import${carrier ? ` ${carrier}` : ""}: network-carrier import (GitHub/Jira/Confluence) ` +
      "lands at M4. Local host memory (Claude Code) is imported into your personal overlay as " +
      "needs-review on cold-path `ctx sync`; run `ctx memory list --status needs-review` to review it.",
  );
  return 0;
}

/**
 * `ctx install` (slice 1i) — managed host integration then cold-path catch-up.
 * (1) writes the `ctx mcp` registration into project `.mcp.json` (additive JSON
 * merge); (2) drives the refresh engine with a large budget for a full first
 * sync — exactly like `ctx sync` (§4.4 / §9 row); (3) places the ≤1KB push block
 * via slice 1h's `runPush` AFTER the sync, so the digest reflects freshly
 * ingested memory. All writes are additive/idempotent; `doctor --remove-push`
 * reverses the placement (§11).
 */
async function runInstall(io: RunIo): Promise<number> {
  const store = openStore({ home: io.home, projectDir: io.projectDir });
  try {
    const projectRoot = io.projectDir ?? store.projectRoot;
    const mcp = installMcpRegistration({ projectRoot });
    io.out(`  ${mcp.action}: ${mcp.path}`);
    // Cold-path full catch-up: same large budget as `ctx sync` (§4.4 / §9 row).
    const engine = new RefreshEngine(
      store,
      createDefaultRegistry(), // symbol biography (2b) — registry default
      { catchupGateMs: SYNC_BUDGET_MS },
    );
    const report = await engine.refresh(SYNC_BUDGET_MS);
    await engine.background;
    // Place the push block reflecting the now-ingested context base (1h builder).
    const push = runPush(store, projectRoot);
    for (const p of push.placements) {
      const status = p.changed ? (p.created ? "created" : "updated") : "unchanged";
      io.out(`  ${status}: ${p.path} (${p.bytes} bytes)`);
    }
    io.out(`ctx install: registered + placed; context base ${report.status}`);
    return 0;
  } finally {
    store.close();
  }
}

/**
 * `ctx doctor` (slice 1i) — READ-ONLY verification, or `--remove-push` to strip
 * the managed push blocks byte-exact (§11 rollback). Doctor reports; it exits
 * non-zero only when a check fails (so scripts can gate on it).
 */
function cmdDoctor(io: RunIo, args: ParsedArgs): number {
  const store = openStore({ home: io.home, projectDir: io.projectDir });
  const projectRoot = io.projectDir ?? store.projectRoot;
  store.close();
  if (args.flags["remove-push"] !== undefined) {
    const writes = removePush(projectRoot);
    if (writes.length === 0) io.out("ctx doctor: no managed push blocks to remove");
    for (const w of writes) io.out(`  ${w.action}: ${w.path}`);
    return 0;
  }
  const report = runDoctor({
    projectRoot,
    ...(io.home !== undefined ? { home: io.home } : {}),
    ...(io.projectDir !== undefined ? { projectDir: io.projectDir } : {}),
  });
  for (const line of formatDoctorReport(report)) io.out(line);
  return report.ok ? 0 : 1;
}

const HELP = `ctx — developer-local context engineering

Usage: ctx <command>

Commands (available now):
  install         Register the ctx MCP server + place push blocks, then sync
  doctor          Verify runtime/store/registration/push (--remove-push to strip)
  sync            Ingest all registered sources into the project context base
  mcp             Run the MCP stdio server (context/search/remember tools)
  remember        Write a memory entry (gist ≤240 chars, optional anchors)
  recall          Expand a handle or entity id
  memory          List memory entries / lifecycle (confirm|retire|review)
  push            Render + place the ≤1KB context block (AGENTS.md + CLAUDE.md);
                  push pin|veto <id> edits .ctx/push.jsonc; --dry-run / --if-changed

More commands (guide/import) land in later M1 slices.
`;

export function run(argv: string[], io: RunIo): number | Promise<number> {
  const [command, ...rest] = argv;
  const args = parseArgs(rest);
  switch (command) {
    case "install":
      return runInstall(io);
    case "doctor":
      return cmdDoctor(io, args);
    case "sync":
      return runSync(
        rest,
        { out: io.out, err: io.err ?? io.out },
        {
          projectDir: io.projectDir,
          home: io.home,
        },
      );
    case "remember":
      return cmdRemember(io, args);
    case "recall":
      return cmdRecall(io, args);
    case "memory":
      return cmdMemory(io, args);
    case "mcp": {
      // The MCP server owns stdout (JSON-RPC only) — do not route via io.out.
      // `--project <dir>` overrides the project (cwd default); used by the CI
      // stdio fixture, which must spawn from the workspace for module resolution
      // while pointing the store at a fixture repo elsewhere.
      const projectDir = args.flags.project?.[0] ?? io.projectDir;
      return runMcp({
        ...(projectDir !== undefined ? { projectDir } : {}),
        ...(io.home !== undefined ? { home: io.home } : {}),
      });
    }
    case "push":
      return cmdPush(io, args);
    case "import":
      return cmdImport(io, args);
    case undefined:
    case "-h":
    case "--help":
      io.out(HELP);
      return 0;
    default:
      // Success-shaped notice, never an unknown-command error (§7 serving rule).
      io.out(
        `ctx: '${command}' lands in a later M1 slice. ` +
          "Available now: sync, remember, recall, memory, push.",
      );
      return 0;
  }
}

export function main(): void {
  const io: RunIo = {
    // 1d-style messages carry their own trailing newline; 1c-style lines don't.
    out: (line) => process.stdout.write(line.endsWith("\n") ? line : `${line}\n`),
    err: (line) => process.stderr.write(line.endsWith("\n") ? line : `${line}\n`),
  };
  void Promise.resolve(run(process.argv.slice(2), io)).then((code) => {
    if (code !== 0) process.exitCode = code;
  });
}

// Run only when invoked as the entry point (not when imported by tests).
if (process.argv[1]) {
  try {
    if (pathToFileURL(realpathSync(process.argv[1])).href === import.meta.url) main();
  } catch {
    /* not resolvable as this module — do not run main */
  }
}
