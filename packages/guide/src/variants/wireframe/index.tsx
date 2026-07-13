// Wireframe variant: the plain structural default that proves the seam.
// No aesthetics — grayscale, system fonts. Correct semantics only.

import type { NodeContentProps, VariantSpec } from "../types.js";
import "./wireframe.css";

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

  return (
    <div className={classes} title={node.path}>
      {node.kind === "folder" ? (
        <div className="wf-label wf-folder-label">{node.name}/</div>
      ) : node.kind === "file" ? (
        <div className="wf-label">{node.name}</div>
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
