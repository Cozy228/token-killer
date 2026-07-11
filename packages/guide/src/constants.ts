/**
 * The guide bundles ONLY types from `@contexa/core` (erased at build) — never a
 * runtime value, or the whole node-side core (node:sqlite, web-tree-sitter) would
 * land in the browser bundle. The authoritative disclosure text arrives at runtime
 * in every projection's `meta.disclosure`; this local mirror is only the pre-load
 * placeholder. A component test asserts the two are identical, so they can't drift.
 */
export const ACCELERATOR_DISCLOSURE_TEXT =
  "accelerator, not validated — a rebuildable index of cited sources, not a verified decision oracle";
