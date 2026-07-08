/**
 * Markdown rendering of the serving surface (CONTEXA-IMPL §7 template). The
 * selection layer hands 1g a TYPED STRUCT (envelope + sections); this module is
 * the FINAL render step (P28: "markdown is the final render step"). All §7
 * shape rules live here:
 *
 *  - response = ONE markdown text block; the ONLY `#` is the first-line header
 *    `# ctx · <subject> — <freshness>` (§7 template); section labels are
 *    bold+codespan (`**\`code\`**`), never ATX headings (host renderers blow ATX
 *    up to H1).
 *  - source lines are `N⇥code` numbered exactly like the host Read tool (tab
 *    after the line number) so agents cite file:line without re-reading.
 *  - stable section order call-over-call (SECTION_ORDER); empty sections are
 *    omitted entirely, never templated (G-4).
 *  - every rendered item carries a resolvable short handle (G-5).
 *  - `truncated` vs `partial` stay distinct (§7) — surfaced as separate notes.
 */
import type { Entity } from "../store/types.ts";
import type { RefreshReport } from "../ingest/refresh.ts";
import { SECTION_ORDER } from "../select/types.ts";
import type {
  FacetResult,
  OmittedItem,
  RenderedItem,
  SearchResult,
  SectionName,
  SectionResult,
  SelectMiss,
  SelectResult,
} from "../select/types.ts";
import { OMITTED_HANDLES_PER_SECTION } from "./types.ts";

/** Sections whose full-tier body is verbatim FILE source → gets `N⇥` numbering.
 *  (commit = git object, memory = store text: not file:line, never numbered.)
 *  `symbol` (2d) is file-backed by its span locator — a symbol biography's
 *  definition renders N⇥ numbered exactly like the host Read tool. */
const FILE_BACKED_KINDS = new Set([
  "file",
  "doc_section",
  "decision",
  "concept",
  "module",
  "symbol",
]);

const SECTION_LABELS: Record<Exclude<SectionName, "subject">, string> = {
  code: "code",
  decisions: "decisions",
  history: "history",
  memory: "memory",
  conflicts: "conflicts",
};

/** Header freshness (§7): `fresh`, or `reconciling (git, docs)` when a source is
 *  still catching up / frozen. No refresh ran → `fresh` (nothing to reconcile). */
export function freshnessLabel(report: RefreshReport | undefined): string {
  if (!report) return "fresh";
  const reconciling = [...report.pendingSources, ...report.frozenSources];
  if (reconciling.length === 0) return "fresh";
  return `reconciling (${[...new Set(reconciling)].sort().join(", ")})`;
}

function headerLine(subject: string, freshness: string): string {
  const clean = subject.replace(/\s+/g, " ").trim() || "context";
  return `# ctx · ${clean} — ${freshness}`;
}

function sectionLabel(name: Exclude<SectionName, "subject">): string {
  return `**\`${SECTION_LABELS[name]}\`**`;
}

/** Span start for `N⇥` numbering: `path:START-END` → START, bare `path` → 1. */
function spanStart(locator: string | undefined): number {
  const m = locator?.match(/:(\d+)-\d+$/);
  return m ? Number(m[1]) : 1;
}

/**
 * Render one item: its first line (name · locator · [handle]) verbatim, then —
 * for a full-tier FILE-backed body — each source line numbered `N⇥code`, exactly
 * like the host Read tool. Skeleton/line tiers render as-is (previews, not
 * verbatim source regions).
 */
function renderItem(item: RenderedItem): string {
  if (item.tier !== "full" || !FILE_BACKED_KINDS.has(item.kind)) return item.text;
  const nl = item.text.indexOf("\n");
  if (nl === -1) return item.text;
  const header = item.text.slice(0, nl);
  const body = item.text.slice(nl + 1).split("\n");
  const start = spanStart(item.locator);
  const numbered = body.map((line, i) => `${start + i}\t${line}`);
  return [header, ...numbered].join("\n");
}

/** Per-section `omitted` line: exact count + up to N drill handles (§6.5:
 *  omissions are counted AND handle'd, never silently dropped). */
function omittedLine(section: SectionName, omitted: OmittedItem[]): string {
  const shown = omitted
    .slice(0, OMITTED_HANDLES_PER_SECTION)
    .map((o) => `${o.name} [${o.handle}]`)
    .join(" · ");
  const more = omitted.length - Math.min(omitted.length, OMITTED_HANDLES_PER_SECTION);
  const tail = more > 0 ? ` · (+${more} more)` : "";
  return `${section} ${omitted.length}: ${shown}${tail}`;
}

export interface RenderOut {
  text: string;
  handles: string[];
  sectionOrder: SectionName[];
}

/** Render a full `context()` selection result (§7 template). */
export function renderContext(result: SelectResult, freshness: string): RenderOut {
  const handles: string[] = [];
  const sectionOrder: SectionName[] = [];
  const subjectName =
    result.subject?.name ?? result.sections.find((s) => s.items[0])?.items[0]?.name ?? "context";
  const parts: string[] = [headerLine(subjectName, freshness)];

  const byName = new Map<SectionName, SectionResult>(result.sections.map((s) => [s.name, s]));

  // Subject block: unlabeled, directly under the header (it IS the answer).
  const subject = byName.get("subject");
  if (subject && subject.items.length > 0) {
    sectionOrder.push("subject");
    for (const item of subject.items) {
      parts.push(renderItem(item));
      handles.push(item.handle);
    }
  }

  // Call preview (2d): compact caller (`←`) / callee (`→`) lines under a symbol
  // subject, each a drill handle; `+N more` drills the `!callers`/`!callees`
  // facet (§7 template). Only emitted when the subject resolved call edges.
  const cp = result.callPreview;
  if (cp) {
    if (cp.callers.length > 0) {
      const refs = cp.callers.map((r) => `${r.name} [${r.handle}]`);
      if (cp.moreCallers > 0) refs.push(`+${cp.moreCallers} more [${cp.callersHandle}]`);
      parts.push(`← ${refs.join(" · ")}`);
      for (const r of cp.callers) handles.push(r.handle);
      if (cp.moreCallers > 0) handles.push(cp.callersHandle);
    }
    if (cp.callees.length > 0) {
      const refs = cp.callees.map((r) => `${r.name} [${r.handle}]`);
      if (cp.moreCallees > 0) refs.push(`+${cp.moreCallees} more [${cp.calleesHandle}]`);
      parts.push(`→ ${refs.join(" · ")}`);
      for (const r of cp.callees) handles.push(r.handle);
      if (cp.moreCallees > 0) handles.push(cp.calleesHandle);
    }
  }

  // Labeled sections in fixed order; empty sections omitted entirely (G-4).
  for (const name of SECTION_ORDER) {
    if (name === "subject") continue;
    const section = byName.get(name);
    if (!section || section.items.length === 0) continue;
    sectionOrder.push(name);
    parts.push(sectionLabel(name));
    for (const item of section.items) {
      parts.push(renderItem(item));
      handles.push(item.handle);
    }
  }

  // Omitted block: per-section count + drill handles (never silent, §6.5).
  const omittedLines: string[] = [];
  for (const name of SECTION_ORDER) {
    const section = byName.get(name);
    if (!section || section.omitted.length === 0) continue;
    omittedLines.push(omittedLine(name, section.omitted));
    for (const o of section.omitted.slice(0, OMITTED_HANDLES_PER_SECTION)) handles.push(o.handle);
  }
  if (omittedLines.length > 0) {
    parts.push("**`omitted`**");
    parts.push(...omittedLines);
  }

  // Envelope disclosure: truncated vs partial kept DISTINCT (§7).
  const env = result.envelope;
  const notes: string[] = [];
  if (env.truncated)
    notes.push("`truncated`: budget-capped subset — drill any [handle] for the rest");
  if (env.partial)
    notes.push("`partial`: a read-through failed — some items degraded (do not treat as clean)");
  for (const n of env.notes) notes.push(n);
  if (notes.length > 0) parts.push(notes.join("\n"));

  return { text: parts.join("\n"), handles, sectionOrder };
}

/** Render a facet drill-down (`context(handle!facet)`), §6 ~800-token budget. */
export function renderFacet(result: FacetResult, freshness: string): RenderOut {
  const parts = [headerLine(`${result.handle}!${result.facet}`, freshness)];
  parts.push(`**\`${result.facet}\`** [${result.handle}]`);
  if (result.text.length > 0) parts.push(result.text);
  const notes: string[] = [];
  if (result.truncated) notes.push("`truncated`: budget-capped subset");
  if (result.partial) notes.push("`partial`: read-through failed — degraded");
  for (const n of result.notes) notes.push(n);
  if (notes.length > 0) parts.push(notes.join("\n"));
  return { text: parts.join("\n"), handles: [result.handle], sectionOrder: [] };
}

/**
 * Render a recoverable miss (unknown-ref / empty-store / no-input) as
 * SUCCESS-SHAPED guidance (§7 / G-3): never `isError`, always actionable, with
 * resolvable candidate handles when any look close.
 */
export function renderMiss(subject: string, miss: SelectMiss, freshness: string): RenderOut {
  const handles: string[] = [];
  const status = miss.reason === "unknown-ref" ? "not indexed" : miss.reason;
  const parts = [headerLine(subject, `${freshness} · ${status}`), miss.guidance];
  if (miss.candidates.length > 0) {
    parts.push("**`candidates`**");
    for (const c of miss.candidates) {
      parts.push(`${c.kind} ${c.name} [${c.handle}]`);
      handles.push(c.handle);
    }
  }
  return { text: parts.join("\n"), handles, sectionOrder: [] };
}

/**
 * Render an ambiguous ref: ALL candidate definitions in ONE response (§7 — never
 * make the agent guess-and-retry). Each definition shows its `N⇥` source line.
 */
export function renderAmbiguous(
  ref: string,
  candidates: Array<{ entity: Entity; handle: string; defLine: string; startLine: number }>,
  freshness: string,
): RenderOut {
  const handles: string[] = [];
  const parts = [
    headerLine(ref, `${freshness} · ${candidates.length} definitions`),
    `\`${ref}\` is ambiguous — ${candidates.length} definitions. Pass a [handle] to pick one:`,
    "**`candidates`**",
  ];
  for (const c of candidates) {
    const loc = c.entity.locator;
    const locDisplay =
      loc.t === "file"
        ? loc.span
          ? `${loc.path}:${loc.span[0]}-${loc.span[1]}`
          : loc.path
        : c.entity.id;
    parts.push(`${c.entity.kind} ${c.entity.name} ${locDisplay} [${c.handle}]`);
    parts.push(`${c.startLine}\t${c.defLine}`);
    handles.push(c.handle);
  }
  return { text: parts.join("\n"), handles, sectionOrder: [] };
}

/** Render `search()` — flat ranked list + counted omissions (§6/§7). */
export function renderSearch(result: SearchResult, freshness: string): RenderOut {
  const handles: string[] = [];
  const parts = [headerLine(`search: ${result.query}`, freshness)];
  if (result.items.length === 0) {
    parts.push("No matches. Broaden the query or run `ctx sync` to (re)ingest sources.");
  } else {
    parts.push("**`matches`**");
    for (const item of result.items) {
      parts.push(item.line);
      handles.push(item.handle);
    }
  }
  if (result.omitted.length > 0) {
    const shown = result.omitted
      .slice(0, OMITTED_HANDLES_PER_SECTION)
      .map((o) => `${o.name} [${o.handle}]`)
      .join(" · ");
    const more =
      result.omitted.length - Math.min(result.omitted.length, OMITTED_HANDLES_PER_SECTION);
    parts.push("**`omitted`**");
    parts.push(`${result.omitted.length}: ${shown}${more > 0 ? ` · (+${more} more)` : ""}`);
    for (const o of result.omitted.slice(0, OMITTED_HANDLES_PER_SECTION)) handles.push(o.handle);
  }
  if (result.truncated) parts.push("`truncated`: ranked past the render cap — drill any [handle]");
  return { text: parts.join("\n"), handles, sectionOrder: [] };
}
