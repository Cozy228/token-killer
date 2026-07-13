/**
 * The one place the renderer meets its data. Everything below this reads the seam, not
 * `fetch` and not a global — so an exported page and a live page run the same components.
 */
import { createContext, useContext, type ReactNode } from "react";
import type { GuideDataSource } from "./source.ts";

const DataSourceContext = createContext<GuideDataSource | undefined>(undefined);

export function DataSourceProvider(props: {
  source: GuideDataSource;
  children: ReactNode;
}): ReactNode {
  return (
    <DataSourceContext.Provider value={props.source}>{props.children}</DataSourceContext.Provider>
  );
}

export function useDataSource(): GuideDataSource {
  const source = useContext(DataSourceContext);
  if (!source) throw new Error("useDataSource() outside a DataSourceProvider");
  return source;
}
