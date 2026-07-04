/**
 * Default source registry (CTX-IMPL §4). `ctx sync` and the serve path build the
 * registry through this factory and hand it to the RefreshEngine, which iterates
 * whatever is registered — the orchestration is source-generic, never git-only
 * (P28: `ctx sync` = all-sources entry point). M1 registers git (1d), docs (1e),
 * memory (1c — always-clean dirtyCheck, so it only ingests on explicit cold
 * paths); M2 adds code (2a — tree-sitter symbols). Network carriers join at M4.
 */
import { MemorySourceAdapter } from "../memory/adapter.ts";
import { createGitAdapter, type GitAdapterOptions } from "./git/adapter.ts";
import { createCodeAdapter, type CodeAdapterOptions } from "./code/adapter.ts";
import { DocsAdapter } from "./docs.ts";
import { SourceRegistry } from "./adapter.ts";

export interface RegistryOptions {
  git?: GitAdapterOptions | false;
  docs?: false;
  memory?: false;
  code?: CodeAdapterOptions | false;
}

export function createDefaultRegistry(opts: RegistryOptions = {}): SourceRegistry {
  const registry = new SourceRegistry();
  if (opts.git !== false) registry.register(createGitAdapter(opts.git));
  if (opts.docs !== false) registry.register(new DocsAdapter());
  if (opts.memory !== false) registry.register(new MemorySourceAdapter());
  if (opts.code !== false) registry.register(createCodeAdapter(opts.code));
  return registry;
}
