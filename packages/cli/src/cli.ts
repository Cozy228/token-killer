#!/usr/bin/env node
/**
 * ctx CLI entry.
 *
 * Slice 1c wires the memory lifecycle surface (remember/recall/memory) to the
 * `@ctx/core` library calls. install/doctor/mcp/guide/sync land in later M1
 * slices; `ctx import` (network carriers) lands at M4 — a stub returns the P28
 * success-shaped "lands at M4" notice rather than an unknown-command error.
 */
import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";
import {
  CTX_CORE_SCAFFOLD,
  listMemories,
  openStore,
  recall,
  remember,
  setMemoryLifecycle,
  type MemoryStatus,
  type Store,
} from "@ctx/core";

export interface RunIo {
  out: (line: string) => void;
  /** Data home override ($CTX_HOME when omitted). Tests inject a sandbox. */
  home?: string;
  /** Project dir to resolve the shard from (defaults to cwd). */
  projectDir?: string;
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
    io.out('usage: ctx remember "<note>" [--detail <text>] [--anchor <id>]... [--supersedes <id>]');
    return 2;
  }
  return withStore(io, (store) => {
    const result = remember(store, {
      note,
      detail: args.flags.detail?.[0],
      anchors: args.flags.anchor,
      supersedes: args.flags.supersedes?.[0],
    });
    if (result.ok) {
      io.out(`remembered [${result.handle}] — ${result.gist}`);
      if (result.anchors.length > 0) io.out(`  anchors: ${result.anchors.join(", ")}`);
      if (result.supersededId) io.out(`  supersedes: ${result.supersededId}`);
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
    const result = setMemoryLifecycle(store, id, target);
    io.out(result.ok ? `${result.entityId} → ${result.status}` : result.guidance);
    return 0;
  });
}

function cmdImport(io: RunIo, args: ParsedArgs): number {
  const carrier = args.positionals[0] ?? "";
  // P28: `ctx import` (network carriers) lands at M4 — success-shaped notice.
  io.out(
    `ctx import${carrier ? ` ${carrier}` : ""}: network-carrier import (GitHub/Jira/Confluence) ` +
      "lands at M4. Local host memory (Claude Code) is imported automatically on cold-path sync.",
  );
  return 0;
}

export function run(argv: string[], io: RunIo): number {
  const [command, ...rest] = argv;
  const args = parseArgs(rest);
  switch (command) {
    case "remember":
      return cmdRemember(io, args);
    case "recall":
      return cmdRecall(io, args);
    case "memory":
      return cmdMemory(io, args);
    case "import":
      return cmdImport(io, args);
    default:
      io.out(
        `ctx: CLI scaffolding (${CTX_CORE_SCAFFOLD}). ` +
          "Available now: remember, recall, memory. install/doctor/mcp/guide/sync land in later M1 slices.",
      );
      return 0;
  }
}

export function main(): void {
  const code = run(process.argv.slice(2), { out: (line) => process.stdout.write(`${line}\n`) });
  if (code !== 0) process.exitCode = code;
}

// Run only when invoked as the entry point (not when imported by tests).
if (process.argv[1]) {
  try {
    if (pathToFileURL(realpathSync(process.argv[1])).href === import.meta.url) main();
  } catch {
    /* not resolvable as this module — do not run main */
  }
}
