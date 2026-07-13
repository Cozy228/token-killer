// Wireframe variant: the plain structural default that proves the seam.
// No aesthetics — grayscale, system fonts. Correct semantics only.

import type { NodeContentProps, VariantSpec } from "../types.js";
import "./wireframe.css";

/** Middle-truncate names longer than 24 chars (UA rule). */
function truncate(name: string): string {
  if (name.length <= 24) return name;
  return `${name.slice(0, 12)}…${name.slice(-10)}`;
}

// Declarations never reach the renderer under the Option-A map slim-down, so
// NodeContent only ever draws a folder region or a self-describing FILE lot.
function NodeContent({ node, lit, dimmed, focused }: NodeContentProps) {
  const classes = [
    "wf-node",
    `wf-${node.kind}`,
    lit ? "wf-lit" : "",
    dimmed ? "wf-dimmed" : "",
    focused ? "wf-focused" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const showTick = node.status === "needs-review" || node.status === "conflict";
  const declCount = node.declCount ?? 0;

  return (
    <div className={classes} title={node.path}>
      {node.kind === "folder" ? (
        <div className="wf-label wf-folder-label">{node.name}/</div>
      ) : node.kind === "file" ? (
        // Self-describing lot at readable zoom (name + decl-count chip); the text
        // fades out below the readable zoom via CSS (--zoom), leaving the tick /
        // lit marker / recency luminance as the overview signal. The hover
        // readout covers identity when the text is hidden.
        <div className="wf-file-meta">
          <div className="wf-label">{truncate(node.name)}</div>
          {declCount > 0 ? (
            <div className="wf-decl-chip">
              {declCount} {declCount === 1 ? "decl" : "decls"}
            </div>
          ) : null}
        </div>
      ) : null}
      {showTick ? <span className={`wf-tick wf-status-${node.status}`} /> : null}
      {node.overflow > 0 ? <span className="wf-overflow">+{node.overflow}</span> : null}
    </div>
  );
}

const spec: VariantSpec = {
  id: "wireframe",
  label: "Wireframe",
  description: "Plain grayscale structural default; saturated color only on claim status ticks.",
  themeClass: "variant-wireframe",
  NodeContent,
};

export default spec;
