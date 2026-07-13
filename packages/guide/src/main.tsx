/**
 * Entry point. It picks the side of the D17 seam ONCE, here, and nothing downstream
 * ever asks again: a page carrying an inlined snapshot reads that; every other page is
 * live against the loopback server that served it.
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { DataSourceProvider } from "./data/context.tsx";
import { LiveDataSource } from "./data/live.ts";
import { readInlinedSnapshot, SnapshotDataSource } from "./data/snapshot.ts";
import type { GuideDataSource } from "./data/source.ts";
import "./index.css";

const inlined = readInlinedSnapshot();
const source: GuideDataSource = inlined
  ? new SnapshotDataSource(inlined)
  : new LiveDataSource();

const root = document.getElementById("root");
if (!root) throw new Error("no #root element in the page");

createRoot(root).render(
  <StrictMode>
    <DataSourceProvider source={source}>
      <App />
    </DataSourceProvider>
  </StrictMode>,
);
