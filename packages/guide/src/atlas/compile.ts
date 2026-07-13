// Quantized directory spatial model (D9). PURE: CorpusInput -> AtlasModel.
//
// Positions come from real hierarchy, never from call/import force:
//   repo -> recursive folder region -> file lot -> AST outline (decls)
//
// Determinism guarantees (tested):
//   - Same input, even with shuffled arrays, produces a byte-identical model.
//   - A change repacks one parent region locally; sibling folders keep their
//     internal relative layout (parent-local repack, D9).

import type {
  AtlasEdge,
  AtlasModel,
  AtlasNode,
  AtlasRegion,
  CorpusFile,
  CorpusInput,
  NodeStatus,
} from "./types.js";

// World-unit layout constants (integers). UNIT (px per unit) is a render concern.
const GUTTER = 1;
const HEADER = 1;
const MAX_DECLS_SHOWN = 34;
const SHELF_ASPECT = 1.4; // target region aspect ~1.2..1.6

/** Footprint bucket side length by declaration count (D9). */
export function footprintFor(declCount: number): number {
  if (declCount <= 0) return 1;
  if (declCount <= 4) return 2;
  if (declCount <= 9) return 3;
  if (declCount <= 16) return 4;
  if (declCount <= 25) return 5;
  return 6;
}

export function rootId(): string {
  return "repo:root";
}
function dirId(path: string): string {
  return path === "" ? rootId() : `dir:${path}`;
}
export function fileId(path: string): string {
  return `file:${path}`;
}
/** Extract the file path from a `sym:<path>#<qualified>` id. */
export function fileOfSym(symId: string): string {
  const body = symId.startsWith("sym:") ? symId.slice(4) : symId;
  const hash = body.indexOf("#");
  return hash === -1 ? body : body.slice(0, hash);
}

// ---------------------------------------------------------------------------
// Canonicalization + FNV-1a hash (projectionId).
// ---------------------------------------------------------------------------

function sortedFiles(files: CorpusFile[]): CorpusFile[] {
  return [...files]
    .map((f) => ({
      ...f,
      decls: [...f.decls].sort(
        (a, b) => a.order - b.order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
      ),
    }))
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

function canonicalInput(input: CorpusInput): string {
  const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  const files = sortedFiles(input.files).map((f) => ({
    path: f.path,
    declCount: f.declCount,
    status: f.status,
    recency: f.recency,
    decls: f.decls.map((d) => ({ id: d.id, name: d.name, kind: d.kind, order: d.order })),
  }));
  const calls = [...input.edges.calls].sort((a, b) => cmp(a.src, b.src) || cmp(a.dst, b.dst));
  const imports = [...input.edges.imports].sort((a, b) => cmp(a.src, b.src) || cmp(a.dst, b.dst));
  const touches = [...input.edges.touches].sort(
    (a, b) => cmp(a.commit, b.commit) || cmp(a.target, b.target),
  );
  const canonical = {
    schemaVersion: input.schemaVersion,
    repo: input.repo,
    sourceRevision: input.sourceRevision,
    generations: input.generations,
    files,
    edges: {
      calls: calls.map((e) => [e.src, e.dst, e.count]),
      imports: imports.map((e) => [e.src, e.dst, e.count]),
      touches: touches.map((t) => [t.commit, t.target]),
    },
    event: {
      kind: input.event.kind,
      label: input.event.label,
      range: input.event.range,
      commitIds: [...input.event.commitIds].sort(cmp),
      anchorFiles: [...input.event.anchorFiles].sort(cmp),
      anchorSyms: [...input.event.anchorSyms].sort(cmp),
    },
    disclosures: [...input.disclosures].sort(cmp),
  };
  return JSON.stringify(canonical);
}

/** FNV-1a 32-bit, hex. Deterministic and dependency-free. */
export function fnv1a(str: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

// ---------------------------------------------------------------------------
// Folder tree.
// ---------------------------------------------------------------------------

interface TreeFile {
  type: "file";
  path: string;
  name: string;
  file: CorpusFile;
}
interface TreeFolder {
  type: "folder";
  path: string;
  name: string;
  children: TreeNode[];
}
type TreeNode = TreeFile | TreeFolder;

function buildTree(files: CorpusFile[], repo: string): TreeFolder {
  const root: TreeFolder = { type: "folder", path: "", name: repo, children: [] };
  const folderByPath = new Map<string, TreeFolder>([["", root]]);

  for (const file of files) {
    const segments = file.path.split("/");
    const fileName = segments.pop() as string;
    let parent = root;
    let acc = "";
    for (const seg of segments) {
      acc = acc === "" ? seg : `${acc}/${seg}`;
      let folder = folderByPath.get(acc);
      if (!folder) {
        folder = { type: "folder", path: acc, name: seg, children: [] };
        folderByPath.set(acc, folder);
        parent.children.push(folder);
      }
      parent = folder;
    }
    parent.children.push({ type: "file", path: file.path, name: fileName, file });
  }
  return root;
}

// ---------------------------------------------------------------------------
// Local layout: shelf packing, computed purely from a node's own subtree so
// that a change to one folder never alters another folder's internal layout.
// ---------------------------------------------------------------------------

interface LocalLayout {
  w: number;
  h: number;
  /** Placed children, positions relative to THIS region's origin. */
  placements: Array<{ node: TreeNode; x: number; y: number; layout?: LocalLayout }>;
}

function sizeOf(
  node: TreeNode,
  cache: Map<TreeNode, LocalLayout>,
): { w: number; h: number; layout?: LocalLayout } {
  if (node.type === "file") {
    const side = footprintFor(node.file.declCount);
    return { w: side, h: side };
  }
  const layout = layoutFolder(node, cache);
  return { w: layout.w, h: layout.h, layout };
}

function layoutFolder(folder: TreeFolder, cache: Map<TreeNode, LocalLayout>): LocalLayout {
  const cached = cache.get(folder);
  if (cached) return cached;

  const children = [...folder.children].sort((a, b) =>
    a.path < b.path ? -1 : a.path > b.path ? 1 : 0,
  );
  const sized = children.map((node) => ({ node, ...sizeOf(node, cache) }));

  if (sized.length === 0) {
    const empty: LocalLayout = {
      w: GUTTER + 1 + GUTTER,
      h: HEADER + GUTTER + 1 + GUTTER,
      placements: [],
    };
    cache.set(folder, empty);
    return empty;
  }

  // Deterministic target width from total (gutter-inflated) area and target aspect.
  let totalArea = 0;
  let maxItemW = 0;
  for (const s of sized) {
    totalArea += (s.w + GUTTER) * (s.h + GUTTER);
    if (s.w > maxItemW) maxItemW = s.w;
  }
  const targetWidth = Math.max(maxItemW, Math.ceil(Math.sqrt(totalArea * SHELF_ASPECT)));

  // Shelf pack in sorted order.
  let cursorX = 0;
  let cursorY = 0;
  let shelfHeight = 0;
  let packedWidth = 0;
  const placements: LocalLayout["placements"] = [];
  for (const s of sized) {
    if (cursorX > 0 && cursorX + s.w > targetWidth) {
      cursorX = 0;
      cursorY += shelfHeight + GUTTER;
      shelfHeight = 0;
    }
    const originX = GUTTER + cursorX;
    const originY = HEADER + GUTTER + cursorY;
    placements.push({ node: s.node, x: originX, y: originY, layout: s.layout });
    cursorX += s.w + GUTTER;
    if (cursorX - GUTTER > packedWidth) packedWidth = cursorX - GUTTER;
    if (s.h > shelfHeight) shelfHeight = s.h;
  }
  const packedHeight = cursorY + shelfHeight;

  const layout: LocalLayout = {
    w: GUTTER + packedWidth + GUTTER,
    h: HEADER + GUTTER + packedHeight + GUTTER,
    placements,
  };
  cache.set(folder, layout);
  return layout;
}

// ---------------------------------------------------------------------------
// Emit absolute nodes by walking the tree pre-order, offsetting each child by
// its parent's absolute origin plus the child's local position.
// ---------------------------------------------------------------------------

function emit(
  folder: TreeFolder,
  layout: LocalLayout,
  originX: number,
  originY: number,
  depth: number,
  parentId: string | null,
  out: { nodes: AtlasNode[]; regions: AtlasRegion[] },
): void {
  const id = dirId(folder.path);
  const rect = { x: originX, y: originY, w: layout.w, h: layout.h };
  out.nodes.push({
    id,
    kind: "folder",
    name: folder.name,
    path: folder.path,
    parent: parentId,
    depth,
    rect,
    footprint: Math.max(layout.w, layout.h),
    status: "active",
    overflow: 0,
  });
  out.regions.push({ id, path: folder.path, depth, rect });

  for (const p of layout.placements) {
    const childX = originX + p.x;
    const childY = originY + p.y;
    if (p.node.type === "folder" && p.layout) {
      emit(p.node, p.layout, childX, childY, depth + 1, id, out);
    } else if (p.node.type === "file") {
      emitFile(p.node, childX, childY, depth + 1, id, out);
    }
  }
}

function emitFile(
  node: TreeFile,
  x: number,
  y: number,
  depth: number,
  parentId: string,
  out: { nodes: AtlasNode[]; regions: AtlasRegion[] },
): void {
  const file = node.file;
  const side = footprintFor(file.declCount);
  const fid = fileId(file.path);
  const shown = Math.min(file.decls.length, MAX_DECLS_SHOWN, side * side);
  const overflow = Math.max(0, file.declCount - shown);
  out.nodes.push({
    id: fid,
    kind: "file",
    name: node.name,
    path: file.path,
    parent: parentId,
    depth,
    rect: { x, y, w: side, h: side },
    footprint: side,
    status: file.status,
    overflow,
  });
  // Decls pack on the inner side x side grid, in source order.
  const decls = [...file.decls].sort(
    (a, b) => a.order - b.order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
  for (let i = 0; i < shown; i++) {
    const d = decls[i];
    const col = i % side;
    const row = Math.floor(i / side);
    out.nodes.push({
      id: d.id,
      kind: "decl",
      name: d.name,
      path: `${file.path}#${d.name}`,
      parent: fid,
      depth: depth + 1,
      rect: { x: x + col, y: y + row, w: 1, h: 1 },
      footprint: 1,
      status: file.status,
      overflow: 0,
    });
  }
}

// ---------------------------------------------------------------------------
// Edge derivation.
// ---------------------------------------------------------------------------

function deriveEdges(input: CorpusInput, nodeIndex: Map<string, AtlasNode>): AtlasModel["edges"] {
  const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

  // Raw sym->sym calls that resolve to known decl nodes on both ends.
  const sym: AtlasEdge[] = [];
  for (const e of input.edges.calls) {
    if (nodeIndex.has(e.src) && nodeIndex.has(e.dst) && e.src !== e.dst) {
      sym.push({ src: e.src, dst: e.dst, kind: "calls", count: e.count, claimId: e.claimId });
    }
  }
  sym.sort((a, b) => cmp(a.src, b.src) || cmp(a.dst, b.dst));

  // File-level aggregated calls + native file imports.
  const fileAgg = new Map<string, AtlasEdge>();
  const bump = (
    src: string,
    dst: string,
    kind: "calls" | "imports",
    count: number,
    claimId: number | null,
  ) => {
    if (src === dst) return;
    if (!nodeIndex.has(src) || !nodeIndex.has(dst)) return;
    const key = `${kind} ${src} ${dst}`;
    const cur = fileAgg.get(key);
    if (cur) cur.count += count;
    else fileAgg.set(key, { src, dst, kind, count, claimId });
  };
  for (const e of input.edges.calls) {
    bump(fileId(fileOfSym(e.src)), fileId(fileOfSym(e.dst)), "calls", e.count, e.claimId);
  }
  for (const e of input.edges.imports) {
    bump(e.src, e.dst, "imports", e.count, e.claimId);
  }
  const file = [...fileAgg.values()].sort(
    (a, b) => cmp(a.kind, b.kind) || cmp(a.src, b.src) || cmp(a.dst, b.dst),
  );

  return { file, sym };
}

// ---------------------------------------------------------------------------
// compile()
// ---------------------------------------------------------------------------

export function compile(input: CorpusInput): AtlasModel {
  const files = sortedFiles(input.files);
  const tree = buildTree(files, input.repo);
  const cache = new Map<TreeNode, LocalLayout>();
  const rootLayout = layoutFolder(tree, cache);

  const out: { nodes: AtlasNode[]; regions: AtlasRegion[] } = { nodes: [], regions: [] };
  emit(tree, rootLayout, 0, 0, 0, null, out);

  const nodeIndex = new Map<string, AtlasNode>();
  for (const n of out.nodes) nodeIndex.set(n.id, n);

  const edges = deriveEdges(input, nodeIndex);
  const projectionId = fnv1a(canonicalInput(input));

  return {
    projectionId,
    nodes: out.nodes,
    nodeIndex,
    edges,
    regions: out.regions,
    generations: input.generations,
    repo: input.repo,
    sourceRevision: input.sourceRevision,
  };
}

/** Node status helper (exported for tests / UI). */
export function statusOf(node: AtlasNode): NodeStatus {
  return node.status;
}

/** Walk parent chain (exclusive of self) from nearest parent to root. */
export function ancestors(model: AtlasModel, id: string): AtlasNode[] {
  const chain: AtlasNode[] = [];
  let cur = model.nodeIndex.get(id);
  while (cur && cur.parent) {
    const p = model.nodeIndex.get(cur.parent);
    if (!p) break;
    chain.push(p);
    cur = p;
  }
  return chain;
}
