/**
 * The app: D28's shared interaction states, and — when the store is servable — the shell.
 *
 * The load is ALL-OR-NOTHING, deliberately. The shell needs the status, the tree and the
 * overview; if any of the three refuses, the honest screen is the refusal, not a shell with a
 * hole in it. In particular a `stale` generation must never yield a half-drawn map: the
 * server refuses to project, and the only thing this component may do with that refusal is
 * print its reason (D33 data-state honesty).
 */
import { useCallback, useEffect, useState } from "react";
import { HashRouter, Route, Routes } from "react-router";
import { useDataSource } from "./data/context.tsx";
import type { BoundedProjection, GuideStatus, GuideTree } from "./data/dto.ts";
import { GuideAuthError, GuideNotServableError, GuideSourceError } from "./data/source.ts";
import { Shell } from "./shell/Shell.tsx";
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
  | { phase: "ready"; status: GuideStatus; tree: GuideTree; overview: BoundedProjection }
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
        const [tree, overview] = await Promise.all([source.tree(), source.overview()]);
        if (live) setLoad({ phase: "ready", status, tree, overview });
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

  if (load.phase === "ready") {
    return <Shell status={load.status} tree={load.tree} overview={load.overview} />;
  }

  const status = load.phase === "not-servable" ? load.status : undefined;

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
    </div>
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
