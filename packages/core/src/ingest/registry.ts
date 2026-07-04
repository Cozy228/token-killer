/**
 * Default source registry (CTX-IMPL §4). `ctx sync` and the serve path build the
 * registry through this factory and hand it to the RefreshEngine, which iterates
 * whatever is registered — the orchestration is source-generic, never git-only
 * (P28: `ctx sync` = all-sources entry point). All three M1 sources register
 * here: git (1d), docs (1e), memory (1c — always-clean dirtyCheck, so it only
 * ingests on explicit cold paths). Network carriers join at M4.
 */
import { MemorySourceAdapter } from "../memory/adapter.ts";
import { createGitAdapter, type GitAdapterOptions } from "./git/adapter.ts";
import { DocsAdapter } from "./docs.ts";
import { SourceRegistry } from "./adapter.ts";

export interface RegistryOptions {
  git?: GitAdapterOptions | false;
  docs?: false;
  memory?: false;
}

export function createDefaultRegistry(opts: RegistryOptions = {}): SourceRegistry {
  const registry = new SourceRegistry();
  if (opts.git !== false) registry.register(createGitAdapter(opts.git));
  if (opts.docs !== false) registry.register(new DocsAdapter());
  if (opts.memory !== false) registry.register(new MemorySourceAdapter());
  return registry;
}
