/** Small shared helpers for the guide surfaces. */
import { useEffect, useState } from "react";
import type { ClaimStatus, EvidencePacket } from "@contexa/core";

export interface AsyncState<T> {
  data: T | undefined;
  error: Error | undefined;
  loading: boolean;
}

/** Load an async projection once; expose loading/error/data. */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]): AsyncState<T> {
  const [state, setState] = useState<AsyncState<T>>({
    data: undefined,
    error: undefined,
    loading: true,
  });
  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true }));
    fn().then(
      (data) => alive && setState({ data, error: undefined, loading: false }),
      (error) => alive && setState({ data: undefined, error, loading: false }),
    );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}

/** Count evidence packets by claim status across any projection payload. */
export function statusCounts(node: unknown): Record<string, number> {
  const counts: Record<string, number> = {};
  walk(node, (pkt) => {
    const s = pkt.envelope.status;
    counts[s] = (counts[s] ?? 0) + 1;
  });
  return counts;
}

function walk(node: unknown, visit: (p: EvidencePacket) => void): void {
  if (node === null || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const el of node) walk(el, visit);
    return;
  }
  const obj = node as Record<string, unknown>;
  if ("envelope" in obj && "terse" in obj && "glyphs" in obj) {
    visit(obj as unknown as EvidencePacket);
  }
  for (const v of Object.values(obj)) walk(v, visit);
}

export function statusOf(pkt: EvidencePacket): ClaimStatus {
  return pkt.envelope.status;
}
