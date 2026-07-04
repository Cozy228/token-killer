/**
 * Default source registry (CTX-IMPL §4). `ctx sync` and the serve path build the
 * registry through this factory and hand it to the RefreshEngine, which iterates
 * whatever is registered — the orchestration is source-generic, never git-only
 * (P28: `ctx sync` = all-sources entry point, despite landing with 1d). Later
 * slices register their adapters here (memory 1c, docs 1e, …); today only git is
 * available, so `ctx sync` exercises git while driving the registry generically.
 */
import { createGitAdapter, type GitAdapterOptions } from "./git/adapter.ts";
import { SourceRegistry } from "./adapter.ts";

export interface RegistryOptions {
  git?: GitAdapterOptions | false;
}

export function createDefaultRegistry(opts: RegistryOptions = {}): SourceRegistry {
  const registry = new SourceRegistry();
  if (opts.git !== false) registry.register(createGitAdapter(opts.git));
  return registry;
}
