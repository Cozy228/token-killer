/**
 * K2's app: the top-bar stub + D28's shared interaction states, and nothing else.
 *
 * The four-state canvas, the tree, the inspector and the omnibox land in slices S/G/C/T/F.
 * What lands HERE is the thing they all stand on: one seam, and screens that tell the
 * truth about what the store can and cannot show.
 */
import { useCallback, useEffect, useState } from "react";
import { HashRouter, Route, Routes } from "react-router";
import { useDataSource } from "./data/context.tsx";
import type { BoundedProjection, GuideStatus } from "./data/dto.ts";
import { GuideAuthError, GuideNotServableError, GuideSourceError } from "./data/source.ts";
import { TopBar } from "./ui/TopBar.tsx";
import {
  AuthFailureScreen,
  EmptyStoreScreen,
  LoadingScreen,
  SourceUnavailableScreen,
  StaleGenerationScreen,
} from "./ui/states.tsx";

type Load =
  | { phase: "loading" }
  | { phase: "ready"; status: GuideStatus; overview: BoundedProjection }
  | { phase: "not-servable"; status: GuideStatus }
  | { phase: "auth"; message: string }
  | { phase: "source"; message: string };

export function GuidePage(): React.ReactNode {
  const source = useDataSource();
  const [load, setLoad] = useState<Load>({ phase: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    setLoad({ phase: "loading" });

    void (async () => {
      try {
        // The status is asked for FRESH on every load — never cached across a reload,
        // never taken once at startup. A sibling worktree can supersede this checkout's
        // generation while the page sits open, and the badge has to be able to say so.
        const status = await source.status();
        const overview = await source.overview();
        if (live) setLoad({ phase: "ready", status, overview });
      } catch (error) {
        if (!live) return;
        if (error instanceof GuideNotServableError) {
          setLoad({ phase: "not-servable", status: error.status });
        } else if (error instanceof GuideAuthError) {
          setLoad({ phase: "auth", message: error.message });
        } else if (error instanceof GuideSourceError) {
          setLoad({ phase: "source", message: error.message });
        } else {
          setLoad({ phase: "source", message: String(error) });
        }
      }
    })();

    return () => {
      live = false;
    };
  }, [source, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  const status = load.phase === "ready" || load.phase === "not-servable" ? load.status : undefined;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-200">
      <TopBar status={status} />
      {load.phase === "loading" ? <LoadingScreen /> : null}
      {load.phase === "auth" ? <AuthFailureScreen message={load.message} /> : null}
      {load.phase === "source" ? (
        <SourceUnavailableScreen message={load.message} onRetry={retry} />
      ) : null}
      {load.phase === "not-servable" && load.status.generation.state === "stale" ? (
        <StaleGenerationScreen status={load.status} />
      ) : null}
      {load.phase === "not-servable" && load.status.generation.state !== "stale" ? (
        <EmptyStoreScreen status={load.status} />
      ) : null}
      {load.phase === "ready" ? <ReadyPanel overview={load.overview} /> : null}
    </div>
  );
}

/**
 * Placeholder for the canvas host. It renders the projection's own counts — nothing
 * generated, nothing ranked — so that a live drive of K2 SHOWS data crossing the seam
 * rather than merely asserting that it would. The shell and the canvas replace this
 * wholesale in slice S.
 */
function ReadyPanel(props: { overview: BoundedProjection }): React.ReactNode {
  const overview = props.overview;
  const files = overview.containers.reduce((sum, c) => sum + (c.fileCount ?? 0), 0);
  return (
    <main
      data-testid="state-ready"
      className="mx-auto flex max-w-2xl flex-col gap-3 px-6 py-16 text-zinc-300"
    >
      <h1 className="text-lg font-semibold text-zinc-100">The context base is current</h1>
      <p>
        The overview projection came back with{" "}
        <strong className="text-zinc-100">{overview.containers.length}</strong> scopes,{" "}
        <strong className="text-zinc-100">{files}</strong> files and{" "}
        <strong className="text-zinc-100">{overview.edges.length}</strong> aggregate relations.
      </p>
      <p className="text-sm text-zinc-400">
        The canvas, the tree and the inspector land in the next slice. This slice ships the
        server, the data seam and the states above it.
      </p>
    </main>
  );
}

export function App(): React.ReactNode {
  return (
    <HashRouter>
      <Routes>
        <Route path="*" element={<GuidePage />} />
      </Routes>
    </HashRouter>
  );
}
