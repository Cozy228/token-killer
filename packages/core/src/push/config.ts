/**
 * `.ctx/push.jsonc` pin/veto config (CTX-IMPL §7, P28 addenda).
 *
 * Shape: `{ "pin": [ids], "veto": [ids] }`; `//` and `/* *\/` comments allowed
 * (git-shareable, hand-editable — D27/D30). Every recoverable condition is
 * SUCCESS-SHAPED (§7 / G-3): a missing file, malformed JSON, a wrong-typed
 * value, or an UNKNOWN KEY never throws — the parse returns an empty config
 * plus guidance so the pipeline degrades to "auto-ranked only" instead of
 * crashing a cold path or a git hook.
 *
 * `pin` force-includes an entry; `veto` force-excludes it (veto wins on a
 * pin∩veto collision — excluding is the conservative operation).
 */

/** Allowed top-level keys — anything else is rejected WITH GUIDANCE (P28). */
const ALLOWED_KEYS = new Set(["pin", "veto"]);

export interface PushConfig {
  /** Ids/handles to force-include (in listed order). */
  pin: string[];
  /** Ids/handles to force-exclude (wins over pin). */
  veto: string[];
  /** Success-shaped guidance for anything malformed/unknown (never thrown). */
  warnings: string[];
  /** True when the raw source parsed and validated cleanly (no warnings). */
  ok: boolean;
}

export function emptyPushConfig(): PushConfig {
  return { pin: [], veto: [], warnings: [], ok: true };
}

/**
 * Strip `//` line and `/* *\/` block comments, respecting string literals and
 * escapes, so the remainder is plain JSON. Kept intentionally small: the config
 * is a two-array object, not a general JSONC document.
 */
export function stripJsonComments(src: string): string {
  let out = "";
  let inString = false;
  let inLine = false;
  let inBlock = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    const next = src[i + 1];
    if (inLine) {
      if (ch === "\n") {
        inLine = false;
        out += ch;
      }
      continue;
    }
    if (inBlock) {
      if (ch === "*" && next === "/") {
        inBlock = false;
        i++;
      }
      continue;
    }
    if (inString) {
      out += ch;
      if (ch === "\\") {
        // copy the escaped char verbatim (covers \" \\ etc.)
        if (next !== undefined) {
          out += next;
          i++;
        }
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      out += ch;
      continue;
    }
    if (ch === "/" && next === "/") {
      inLine = true;
      i++;
      continue;
    }
    if (ch === "/" && next === "*") {
      inBlock = true;
      i++;
      continue;
    }
    out += ch;
  }
  return out;
}

/** Coerce a raw value into a de-duplicated array of non-empty string ids. */
function asIdList(value: unknown, key: string, warnings: string[]): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    warnings.push(`\`${key}\` must be an array of ids; got ${typeof value}. Ignored ${key}.`);
    return [];
  }
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== "string") {
      warnings.push(`\`${key}\` entries must be strings; skipped a ${typeof item} entry.`);
      continue;
    }
    const id = item.trim();
    if (id.length === 0 || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/**
 * Parse a `.ctx/push.jsonc` source string. NEVER throws: malformed input →
 * empty config + guidance. Unknown top-level keys are REJECTED with guidance
 * (the config is ignored, matching the P28 "unknown keys rejected with
 * guidance" clause) so a typo can't silently apply a half-understood file.
 */
export function parsePushConfig(source: string): PushConfig {
  const trimmed = source.trim();
  if (trimmed.length === 0) return emptyPushConfig();

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripJsonComments(source));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      pin: [],
      veto: [],
      warnings: [
        `\`.ctx/push.jsonc\` is not valid JSON (${msg}). ` +
          `Expected \`{ "pin": [ids], "veto": [ids] }\` (comments allowed). Config ignored.`,
      ],
      ok: false,
    };
  }

  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {
      pin: [],
      veto: [],
      warnings: [
        `\`.ctx/push.jsonc\` must be a JSON object \`{ "pin": [ids], "veto": [ids] }\`. Config ignored.`,
      ],
      ok: false,
    };
  }

  const obj = parsed as Record<string, unknown>;
  const unknown = Object.keys(obj).filter((k) => !ALLOWED_KEYS.has(k));
  if (unknown.length > 0) {
    // P28: unknown keys are rejected WITH GUIDANCE — the whole config is ignored
    // (not silently partially applied) so a typo can't hide half a directive.
    return {
      pin: [],
      veto: [],
      warnings: [
        `\`.ctx/push.jsonc\` has unknown key(s): ${unknown.join(", ")}. ` +
          `Only \`pin\` and \`veto\` are allowed. Config ignored — fix or remove the extra key(s).`,
      ],
      ok: false,
    };
  }

  const warnings: string[] = [];
  const pin = asIdList(obj.pin, "pin", warnings);
  const veto = asIdList(obj.veto, "veto", warnings);
  return { pin, veto, warnings, ok: warnings.length === 0 };
}
