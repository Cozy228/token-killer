/**
 * Generation / freshness resolution (D10, D28, D33) — the answer to the generation trap.
 *
 * THE TRAP (confirmed against the real store, not hypothetical):
 *
 *   The shard key derives from `git rev-parse --git-common-dir`, so EVERY worktree of a
 *   repo shares ONE store. But a published generation is bound to the full identity tuple
 *   `(repoRev, worktreeDigest, schemaVersion, policyVersion)` (`store/generation.ts`), and
 *   `worktreeDigest` — by its own doc comment — "distinguishes worktrees that share one
 *   shard". So `ctx sync` from worktree A rewrites the shared generation identity, and from
 *   worktree B `store.publishedGen(source)` then returns 0 for every source.
 *
 *   A caller that trusts `publishedGen()` alone therefore sees an EMPTY STORE — while the
 *   rows are all still sitting there, built under another checkout.
 *
 * The honest resolution is a THREE-way distinction that `publishedGen()` alone cannot make:
 *
 *   publishedGen > 0                      -> live     (built under THIS identity, has data)
 *   publishedGen == 0, identity stored     -> stale    (built under ANOTHER identity)
 *   publishedGen == 0, no identity stored  -> empty    (never built; needs `ctx sync`)
 *
 * `stale` is the case the badge exists for. Never render it as `live`, never silently fall
 * back to serving the mismatched rows as if they were current, and never flatten it into
 * `empty` — an empty-store screen would tell the user to run `ctx sync` while hiding that
 * their data is present but was built somewhere else.
 */
import { headOid } from "../ingest/git/gitCli.ts";
import type { Store } from "../store/store.ts";
import type { FreshnessState, GenerationView, SourceGeneration } from "./types.ts";

/**
 * The sources the Atlas is built from. `code` supplies files/declarations/
 * calls/imports/contains; `git` supplies commits/touches/co-changed. `docs` and
 * `memory` feed annotations, not the code space, so they are reported but never
 * decide the badge.
 */
export const ATLAS_SOURCES: readonly string[] = ["code", "git"];
const REPORTED_SOURCES: readonly string[] = ["code", "git", "docs", "memory"];

export interface FreshnessOptions {
  /** `snapshot` when the DTO is being built for an export (D17). Default `live`. */
  mode?: "live" | "snapshot";
}

/** Resolve the D28 badge truthfully. Pure read; never writes the store. */
export function resolveGeneration(store: Store, opts: FreshnessOptions = {}): GenerationView {
  const currentIdentity = store.currentGenerationIdentity();

  const sources: SourceGeneration[] = REPORTED_SOURCES.map((source) => {
    const storedIdentity = store.generationIdentityOf(source);
    return {
      source,
      publishedGen: store.publishedGen(source),
      storedIdentity,
      matchesCurrentIdentity: storedIdentity !== undefined && storedIdentity === currentIdentity,
    };
  });

  const atlas = sources.filter((s) => ATLAS_SOURCES.includes(s.source));
  const built = atlas.filter((s) => s.storedIdentity !== undefined);
  const mismatched = built.filter((s) => !s.matchesCurrentIdentity);
  const serving = atlas.filter((s) => s.publishedGen > 0);

  const state = resolveState({
    mode: opts.mode ?? "live",
    builtCount: built.length,
    mismatchedCount: mismatched.length,
    servingCount: serving.length,
  });

  return {
    state,
    currentIdentity,
    repoRev: repoRevOf(store.projectRoot),
    sources,
    reason: reasonFor(state, mismatched, currentIdentity),
  };
}

/** The checkout's committed tip, or `""` when there is none (no git, no commits). */
function repoRevOf(projectRoot: string): string {
  try {
    return headOid(projectRoot) ?? "";
  } catch {
    // A project that is not a git checkout is not an error state for the guide — the
    // code Atlas is still complete. It simply has no revision to display.
    return "";
  }
}

function resolveState(input: {
  mode: "live" | "snapshot";
  builtCount: number;
  mismatchedCount: number;
  servingCount: number;
}): FreshnessState {
  // Nothing was ever built for the Atlas sources -> genuinely empty.
  if (input.builtCount === 0) return "empty";
  // Something was built, but not under this checkout's identity. THE TRAP.
  // This outranks `empty`: `publishedGen` reads 0 and the store LOOKS empty, but
  // the rows exist and were built elsewhere. Saying "empty" here would send the
  // user to `ctx sync` while concealing why.
  if (input.mismatchedCount > 0) return "stale";
  // Identity matches but no source is serving rows -> the build never published.
  if (input.servingCount === 0) return "empty";
  return input.mode === "snapshot" ? "snapshot" : "live";
}

function reasonFor(
  state: FreshnessState,
  mismatched: readonly SourceGeneration[],
  currentIdentity: string,
): string {
  switch (state) {
    case "live":
      return `built under the current generation ${currentIdentity}`;
    case "snapshot":
      return `exported snapshot of generation ${currentIdentity}`;
    case "stale": {
      const names = mismatched.map((s) => s.source).join(", ");
      const other = mismatched[0]?.storedIdentity ?? "unknown";
      return (
        `the store holds data for ${names} built under generation ${other}, ` +
        `not this checkout's ${currentIdentity} — every worktree of this repo shares one ` +
        `store, so a sync elsewhere supersedes this one. Run \`ctx sync\` here to rebuild.`
      );
    }
    case "empty":
      return "no generation has been published for this repository — run `ctx sync`";
  }
}

/** True when the projection may present store rows as current data (D33). */
export function isServable(view: GenerationView): boolean {
  return view.state === "live" || view.state === "snapshot";
}
