// Patch planning (goal §"Patch planning"). Emits a plan, never applies. Only
// insert/remove_marker_block and explicit high-confidence user-level
// frontmatter_set are eligible for applySafe (enforced in applySafe.ts). The
// suggested diff is built from the LIVE file, validated against the finding's
// stored body_hash — no raw instruction body is ever persisted.

import { basename } from "node:path";

import { computeBodyMetrics, hashText } from "./metrics.js";
import { parseMarkdown } from "./parseMarkdown.js";
import type { ContextFinding, FixClass } from "./types.js";

export type ContextPatchOperation =
  | { kind: "insert_marker_block"; path: string; marker: "token_budget" }
  | { kind: "remove_marker_block"; path: string; marker: "token_budget" }
  | { kind: "frontmatter_set"; path: string; key: string; value: unknown }
  | { kind: "suggested_diff"; path: string; diff: string };

export type ContextPatchPlan = {
  target: string;
  fix_class: FixClass;
  operations: ContextPatchOperation[];
  requires_confirmation: boolean;
  reason: string;
  // Provenance for the optimize consumer/report.
  finding_id: string;
  finding_type: string;
};

export type PlanOutcome =
  | { status: "ok"; plan: ContextPatchPlan }
  | { status: "hash_mismatch"; target: string; finding_id: string }
  | { status: "file_missing"; target: string; finding_id: string }
  | { status: "skipped"; target: string; finding_id: string; reason: string };

// Validate the finding against the live file body before planning anything.
function bodyHashMatches(finding: ContextFinding, liveContent: string): boolean {
  if (!finding.body_hash) return true; // nothing to validate against
  const parsed = parseMarkdown(liveContent);
  return computeBodyMetrics(parsed.body).body_hash === finding.body_hash;
}

// M3: body_hash does NOT cover the frontmatter region a `frontmatter_set` op writes.
// For an auto-applied finding, also require the FULL file to be unchanged so a
// frontmatter edit made between inspect and apply is detected (not silently clobbered).
function contentHashMatches(finding: ContextFinding, liveContent: string): boolean {
  if (!finding.content_hash) return true; // older finding without the hash → body check only
  return hashText(liveContent) === finding.content_hash;
}

function inferPromptDescription(target: string): string {
  return basename(target)
    .replace(/\.prompt\.md$/, "")
    .replace(/[-_]+/g, " ")
    .trim();
}

// A minimal, human-readable suggested diff. We never compute a destructive edit
// for semantic findings — the "diff" is an annotated location + recommendation.
function annotatedDiff(finding: ContextFinding): string {
  const loc = finding.start_line ? `${finding.file}:${finding.start_line}` : finding.file;
  return [
    `# ${finding.type} @ ${loc}`,
    `# ${finding.evidence}`,
    `# Suggested: ${finding.recommendation}`,
  ].join("\n");
}

// Build a plan for one static-context finding against the live file content.
export function planForFinding(
  finding: ContextFinding,
  liveContent: string | undefined,
): PlanOutcome {
  const target = finding.file ?? "";
  if (liveContent === undefined) {
    return { status: "file_missing", target, finding_id: finding.id };
  }
  if (!bodyHashMatches(finding, liveContent)) {
    return { status: "hash_mismatch", target, finding_id: finding.id };
  }
  // M3: a safe_mechanical finding is auto-applied (frontmatter_set / marker block), so
  // the whole file — including the frontmatter region body_hash skips — must be
  // unchanged. A frontmatter edit between inspect and apply now surfaces as a mismatch.
  if (finding.fix_class === "safe_mechanical" && !contentHashMatches(finding, liveContent)) {
    return { status: "hash_mismatch", target, finding_id: finding.id };
  }

  const operations: ContextPatchOperation[] = [];

  // Concrete frontmatter_set for the safe_mechanical findings.
  if (finding.fix_class === "safe_mechanical") {
    if (finding.type === "prompt_metadata_gap") {
      operations.push({
        kind: "frontmatter_set",
        path: target,
        key: "description",
        value: inferPromptDescription(target),
      });
    } else if (finding.type === "skill_invocation_policy") {
      operations.push({
        kind: "frontmatter_set",
        path: target,
        key: "disable-model-invocation",
        value: true,
      });
    } else {
      operations.push({ kind: "suggested_diff", path: target, diff: annotatedDiff(finding) });
    }
  } else {
    operations.push({ kind: "suggested_diff", path: target, diff: annotatedDiff(finding) });
  }

  return {
    status: "ok",
    plan: {
      target,
      fix_class: finding.fix_class,
      operations,
      requires_confirmation: finding.fix_class !== "safe_mechanical",
      reason: finding.recommendation,
      finding_id: finding.id,
      finding_type: finding.type,
    },
  };
}

// Render a unified-diff-ish preview of a frontmatter_set against live content.
export function renderFrontmatterSetDiff(
  path: string,
  key: string,
  value: unknown,
  liveContent: string,
): string {
  const parsed = parseMarkdown(liveContent);
  const line = `${key}: ${typeof value === "string" ? value : JSON.stringify(value)}`;
  if (parsed.frontmatter.present && !parsed.frontmatter.malformed) {
    const insertAfter = parsed.frontmatter.start_line ?? 1;
    return [
      `--- ${path}`,
      `+++ ${path}`,
      `@@ frontmatter @@`,
      ` (after line ${insertAfter})`,
      `+${line}`,
    ].join("\n");
  }
  // No frontmatter yet → propose adding a block at the top.
  return [`--- ${path}`, `+++ ${path}`, `@@ top of file @@`, `+---`, `+${line}`, `+---`].join("\n");
}
