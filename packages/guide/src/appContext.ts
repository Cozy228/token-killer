/**
 * Cross-cutting app state shared by every view: the evidence drawer opener (J5
 * provenance), the claim-status focus filter (the legend is a live filter, J5),
 * and the per-view status scope (counts + label the legend reports). Kept in one
 * context so any view can open evidence or publish its status counts without prop
 * drilling.
 */
import { createContext, useContext } from "react";
import type { ClaimStatus, EvidencePacket } from "@contexa/core";

export interface AppState {
  openEvidence: (e: EvidencePacket) => void;
  /** Statuses currently in focus (the legend filter). `null` = all in focus. */
  focus: Set<ClaimStatus> | null;
  toggleFocus: (s: ClaimStatus) => void;
  /** Publish the current view's status counts + a scope label for the legend. */
  setScope: (counts: Record<string, number>, label: string) => void;
}

export const AppContext = createContext<AppState | null>(null);

export function useApp(): AppState {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp outside AppContext");
  return ctx;
}

/** True when an item of `status` should render de-emphasized under the focus filter. */
export function isDimmed(focus: Set<ClaimStatus> | null, status: ClaimStatus): boolean {
  return focus !== null && !focus.has(status);
}
