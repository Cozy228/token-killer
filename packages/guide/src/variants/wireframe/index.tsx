// Wireframe variant: the plain structural default that proves the seam.
// No aesthetics — grayscale, system fonts. Correct semantics only.

import type { NodeContentProps, VariantSpec } from "../types.js";
import "./wireframe.css";

/** Middle-truncate names longer than 24 chars (UA rule). */
function truncate(name: string): string {
  if (name.length <= 24) return name;
  return `${name.slice(0, 12)}…${name.slice(-10)}`;
}

function NodeContent({ node, lit, dimmed, focused, showDeclLabel }: NodeContentProps) {
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
        <div className="wf-label">{truncate(node.name)}</div>
      ) : node.kind === "decl" && showDeclLabel ? (
        <div className="wf-label wf-decl-label">{truncate(node.name)}</div>
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
