/**
 * Trailer & issue-key extraction from a commit message (CTX-IMPL §5.1). These
 * are explicit references the author wrote — recorded as `explicit-key` claims
 * (authority Observed). Issue/PR entities themselves are network-carrier
 * territory (GitHub/Jira, M4); 1d records the reference as a claim on the commit
 * so the link layer can resolve it once those entities exist — it does not
 * fabricate stub entities with synthetic locators.
 */

export type CommitReferenceKind = "fixes" | "closes" | "references" | "issue-key" | "decision";

export interface CommitReference {
  kind: CommitReferenceKind;
  /** The referenced token: `#123`, `ABC-456`, or a decision slug. */
  target: string;
}

// `Fixes|Closes|Resolves #123` (GitHub-style) — case-insensitive, whole word.
const CLOSING_RE = /\b(fix(?:e[sd])?|close[sd]?|resolve[sd]?)\b[:\s]+#(\d+)/gi;
// Bare `#123` PR/issue mentions not already captured as closing keywords.
const HASH_RE = /(?<![\w&])#(\d+)\b/g;
// Jira-style issue keys: 2+ uppercase letters, dash, digits (e.g. ABC-123).
const ISSUE_KEY_RE = /\b([A-Z][A-Z0-9]+-\d+)\b/g;
// `Decision: <slug>` trailer (§5.3 promotion marker).
const DECISION_RE = /^\s*Decision:\s*(.+?)\s*$/gim;

function classifyClosing(keyword: string): "fixes" | "closes" {
  return /^fix/i.test(keyword) ? "fixes" : "closes";
}

/** Parse all references from `subject\n\nbody`. Deduplicated, order-stable. */
export function parseReferences(subject: string, body: string): CommitReference[] {
  const text = body ? `${subject}\n${body}` : subject;
  const out: CommitReference[] = [];
  const seen = new Set<string>();
  const push = (kind: CommitReferenceKind, target: string) => {
    const dedup = `${kind}\0${target}`;
    if (seen.has(dedup)) return;
    seen.add(dedup);
    out.push({ kind, target });
  };

  const closedNumbers = new Set<string>();
  for (const m of text.matchAll(CLOSING_RE)) {
    const kind = classifyClosing(m[1]!);
    const num = `#${m[2]}`;
    closedNumbers.add(num);
    push(kind, num);
  }
  for (const m of text.matchAll(HASH_RE)) {
    const num = `#${m[1]}`;
    if (!closedNumbers.has(num)) push("references", num);
  }
  for (const m of text.matchAll(ISSUE_KEY_RE)) push("issue-key", m[1]!);
  for (const m of text.matchAll(DECISION_RE)) push("decision", m[1]!);
  return out;
}
