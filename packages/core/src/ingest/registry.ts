/**
 * Default source registry (CTX-IMPL §4). `ctx sync` and the serve path build the
 * registry through this factory and hand it to the RefreshEngine, which iterates
 * whatever is registered — the orchestration is source-generic, never git-only
 * (P28: `ctx sync` = all-sources entry point). M1 registers git (1d), docs (1e),
 * memory (1c — always-clean dirtyCheck, so it only ingests on explicit cold
 * paths); M2 adds code (2a — tree-sitter symbols). Network carriers join at M4.
 */
import { MemorySourceAdapter, type MemoryAdapterOptions } from "../memory/adapter.ts";
import { createGitAdapter, type GitAdapterOptions } from "./git/adapter.ts";
import { createCodeAdapter, type CodeAdapterOptions } from "./code/adapter.ts";
import { DocsAdapter } from "./docs.ts";
import { SourceRegistry } from "./adapter.ts";

export interface RegistryOptions {
  git?: GitAdapterOptions | false;
  docs?: false;
  memory?: MemoryAdapterOptions | false;
  code?: CodeAdapterOptions | false;
}

export function createDefaultRegistry(opts: RegistryOptions = {}): SourceRegistry {
  const registry = new SourceRegistry();
  // The assembled registry always has the code source registered, so git
  // `touches` must be SYMBOL-level (2b symbol biography) — the doc contract at
  // GitAdapterOptions.symbolTouches. The BARE GitAdapter keeps file-level as its
  // default (M1 code-source-free unit fixtures); the default registry owns the
  // opt-in so no caller has to remember it. Callers/tests still override via
  // `git: { symbolTouches: false }`.
  if (opts.git !== false) registry.register(createGitAdapter({ symbolTouches: true, ...opts.git }));
  if (opts.docs !== false) registry.register(new DocsAdapter());
  if (opts.memory !== false) registry.register(new MemorySourceAdapter(opts.memory));
  if (opts.code !== false) registry.register(createCodeAdapter(opts.code));
  return registry;
}
