// Shared interaction states (D13 shared states subset for the spike):
// loading / empty / error. Empty names `ctx sync`; error renders detail.

export type StateScreenKind =
  | { kind: "loading"; detail?: string }
  | { kind: "empty" }
  | { kind: "error"; detail: string };

export function StateScreen(props: { state: StateScreenKind }) {
  const { state } = props;
  if (state.kind === "loading") {
    return (
      <div className="state-screen state-loading" role="status" aria-live="polite">
        <div className="state-title">Loading Atlas projection…</div>
        <div className="state-body">{state.detail ?? "Compiling the quantized code Atlas from the corpus."}</div>
      </div>
    );
  }
  if (state.kind === "empty") {
    return (
      <div className="state-screen state-empty">
        <div className="state-title">No indexed corpus yet</div>
        <div className="state-body">
          This repository has not been indexed. Run <code className="state-cmd">ctx sync</code> to build the store, then
          reload.
        </div>
      </div>
    );
  }
  return (
    <div className="state-screen state-error" role="alert">
      <div className="state-title">Could not load the Atlas</div>
      <div className="state-body state-error-detail">{state.detail}</div>
    </div>
  );
}
