/**
 * D28's shared interaction states — the ONLY screens K2 ships.
 *
 * The discipline here is D25: each one names exactly what is true, what is missing, and
 * the exact command that would change it. None of them substitutes a quieter, emptier
 * picture for an honest sentence, and none of them paraphrases the kernel — the stale
 * screen prints `GenerationView.reason` VERBATIM, because that string is the only place
 * that explains the shared-shard situation in the words the maintainer ratified.
 */
import { Fragment } from "react";
import type { GuideStatus } from "../data/dto.ts";

function Screen(props: {
  testId: string;
  title: string;
  children: React.ReactNode;
}): React.ReactNode {
  return (
    <main
      data-testid={props.testId}
      className="mx-auto flex max-w-2xl flex-col gap-4 px-6 py-16 text-zinc-300"
    >
      <h1 className="text-lg font-semibold text-zinc-100">{props.title}</h1>
      {props.children}
    </main>
  );
}

/** An exact, copyable command. The product is non-mutating: it never runs it for you. */
function Command(props: { children: string }): React.ReactNode {
  return (
    <code className="block w-fit rounded bg-zinc-900 px-3 py-1.5 font-mono text-sm text-zinc-100 ring-1 ring-zinc-700">
      {props.children}
    </code>
  );
}

/** Loading — includes the index catching up behind a freshly started server. */
export function LoadingScreen(): React.ReactNode {
  return (
    <Screen testId="state-loading" title="Reading the context store…">
      <p>Resolving this checkout&rsquo;s generation and catching the index up.</p>
    </Screen>
  );
}

/** Nothing has ever been published for this repository. */
export function EmptyStoreScreen(props: { status: GuideStatus }): React.ReactNode {
  return (
    <Screen testId="state-empty" title="This repository has no context base yet">
      <p>{props.status.generation.reason}</p>
      <p>Build one — it reads your checkout and your git history, and writes only to the store:</p>
      <Command>ctx sync</Command>
      <p className="text-sm text-zinc-400">
        Then reload this page. The badge above turns <span className="text-emerald-300">live</span>{" "}
        once a generation is published for this checkout.
      </p>
    </Screen>
  );
}

/**
 * THE GENERATION TRAP, rendered rather than routed around. Every worktree of a repo
 * shares one store, and each `ctx sync` supersedes the others' generations — so the store
 * reads as empty here while its rows sit there, built somewhere else. Falling back to
 * those rows and calling them live is the one thing this screen exists to prevent.
 */
export function StaleGenerationScreen(props: { status: GuideStatus }): React.ReactNode {
  const generation = props.status.generation;
  return (
    <Screen testId="state-stale" title="This store was built for a different checkout">
      {/* Verbatim from the kernel. Do not paraphrase: this is the only text that explains
          the shared-shard situation, and a vaguer version would be a quieter lie. */}
      <p data-testid="stale-reason">{generation.reason}</p>
      <Command>ctx sync</Command>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 font-mono text-xs text-zinc-400">
        <dt>this checkout</dt>
        <dd data-testid="current-identity">{generation.currentIdentity}</dd>
        {generation.sources.map((source) => (
          <Fragment key={source.source}>
            <dt>{source.source}</dt>
            <dd>
              {source.storedIdentity ?? "never built"} · serving gen {source.publishedGen}
            </dd>
          </Fragment>
        ))}
      </dl>
      <p className="text-sm text-zinc-400">
        No projection is shown, because none would be true. The rows in the store belong to
        another generation, and the guide never presents them as this one.
      </p>
    </Screen>
  );
}

/** The bootstrap token was missing or rejected: no route resolves without it. */
export function AuthFailureScreen(props: { message: string }): React.ReactNode {
  return (
    <Screen testId="state-auth" title="This page needs the link ctx printed">
      <p>{props.message}</p>
      <p>
        The guide serves 127.0.0.1 only, and only to the one-time link{" "}
        <code className="font-mono text-zinc-200">ctx guide</code> printed in your terminal. Open
        that link (it sets a session cookie), or start the server again:
      </p>
      <Command>ctx guide</Command>
    </Screen>
  );
}

/** The source would not answer — the server was stopped, or the transport faulted. */
export function SourceUnavailableScreen(props: {
  message: string;
  onRetry?: () => void;
}): React.ReactNode {
  return (
    <Screen testId="state-source" title="The context source is not answering">
      <p>{props.message}</p>
      {props.onRetry ? (
        <button
          type="button"
          onClick={props.onRetry}
          className="w-fit rounded bg-zinc-800 px-3 py-1.5 text-sm text-zinc-100 ring-1 ring-zinc-700 hover:bg-zinc-700"
        >
          Try again
        </button>
      ) : null}
    </Screen>
  );
}
