/**
 * E4 — deterministic secret-shaped guard (slice 3).
 *
 * Committing memory changes the privacy envelope (git history is forever, pushed
 * to remotes), and there is NO LLM / network to lean on at write time, so the
 * guard is a set of deterministic regex classes (à la codex-memory
 * ASK_USER_PATTERNS): `sk-` keys, bearer / API tokens, passwords, private-key
 * blocks, provider credentials. A secret-shaped entry is never a hard error — it
 * is diverted (to the personal overlay as `needs-review`) with a success-shaped
 * remediation note.
 *
 * This module is REUSABLE: slice 3 runs it only on the S3 migration export path;
 * slice 4 wires the same function into the live import / remember paths.
 * No LLM, no network — a pure function of the text.
 */

/** One secret-shape rule: a name + a matching regex. Order is stable (E6). */
interface SecretRule {
  readonly cls: string;
  readonly re: RegExp;
}

/**
 * Regex classes. Kept intentionally conservative + high-precision — a false
 * positive only diverts to the overlay (non-destructive), but the classes still
 * aim at credential SHAPES, not any long string. Each `re` is anchored to a
 * recognisable prefix / keyword so ordinary prose does not trip it.
 */
const SECRET_RULES: readonly SecretRule[] = [
  // OpenAI / Anthropic style `sk-...` (incl. `sk-ant-`, `sk-proj-`).
  { cls: "openai-key", re: /\bsk-[A-Za-z0-9._-]{16,}/ },
  // AWS access key id.
  { cls: "aws-access-key", re: /\bAKIA[0-9A-Z]{16}\b/ },
  // GitHub tokens (ghp_, gho_, ghu_, ghs_, ghr_) + fine-grained (github_pat_).
  { cls: "github-token", re: /\b(?:gh[posur]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})/ },
  // Slack tokens.
  { cls: "slack-token", re: /\bxox[baprs]-[A-Za-z0-9-]{10,}/ },
  // Google API key.
  { cls: "google-api-key", re: /\bAIza[0-9A-Za-z._-]{35}/ },
  // Bearer token in an Authorization-style context.
  { cls: "bearer-token", re: /\bBearer\s+[A-Za-z0-9._~+/-]{16,}=*/ },
  // PEM private-key block.
  { cls: "private-key", re: /-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----/ },
  // JWT (three base64url segments).
  { cls: "jwt", re: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/ },
  // `password = <value>` / `secret: <value>` / `api_key="<value>"` assignments
  // with a non-trivial value (≥6 non-space chars). Keyword-anchored so a
  // sentence like "remember the password rotation policy" does not match
  // (no `=`/`:` + value).
  {
    cls: "credential-assignment",
    re: /\b(?:password|passwd|pwd|secret|api[_-]?key|access[_-]?token|client[_-]?secret|private[_-]?key)\b\s*[:=]\s*['"]?[^\s'"]{6,}/i,
  },
];

export interface SecretFinding {
  /** True if any secret-shaped class matched. */
  secret: boolean;
  /** The first matching class name (stable order), when `secret`. */
  cls?: string;
}

/**
 * Scan `text` for a secret shape. Deterministic: returns the first matching
 * class in the stable rule order (so the remediation note is reproducible).
 */
export function scanForSecret(text: string): SecretFinding {
  if (!text) return { secret: false };
  for (const rule of SECRET_RULES) {
    if (rule.re.test(text)) return { secret: true, cls: rule.cls };
  }
  return { secret: false };
}

/**
 * Scan a memory's gist + detail together (either may carry the secret).
 */
export function scanMemoryForSecret(gist: string, detail?: string): SecretFinding {
  const g = scanForSecret(gist);
  if (g.secret) return g;
  return detail ? scanForSecret(detail) : { secret: false };
}

/**
 * Success-shaped remediation guidance for a diverted entry — never an error
 * message. Names the class + the safe next step (rotate + re-remember redacted).
 */
export function secretRemediationNote(cls: string): string {
  return (
    `withheld from the committed memory log: this entry looks like a secret ` +
    `(${cls}). It was kept in your local (gitignored) overlay as needs-review so ` +
    `nothing sensitive enters git history. Rotate the credential if it is real, ` +
    `then re-record a redacted note.`
  );
}
