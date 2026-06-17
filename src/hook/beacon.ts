// Issue #42 — optional "tk active" routing beacon.
//
// The runtime hooks are fail-open and SILENT: a transparent rewrite emits only the
// rewrite carrier (updatedInput / modifiedArgs), nothing the agent surfaces as text.
// So a transcript reader cannot positively confirm "tk fired" — firing is inferred
// indirectly from a later gain row, which conflates a mis-installed hook with an
// unrelated agent failure (e.g. the agent had no budget, so the wrapped command
// never ran → no gain row even when routing is perfect).
//
// This emits ONE line of `additionalContext` ("tk active …") on a rewrite so a
// transcript inspection can confirm firing directly. It is OPT-IN behind
// `TK_HOOK_BEACON` and only ever ADDS `additionalContext` to a decision the host
// already honors — it never changes the rewrite carrier, the permission decision,
// or the exit code, so the fail-open / transparent-rewrite contract is preserved.
// Default-off keeps the protocol wire byte-identical for every host that hasn't
// asked for it (the protocol-matrix `toEqual` rows stay green).

// The fixed beacon prefix a transcript reader greps for. Short, English, no path
// or source text (it is injected into the agent turn). Stable so acceptance /
// users can match it literally.
export const HOOK_BEACON_PREFIX = "tk active";

// True when the operator opted into the beacon. Any non-empty value other than
// "0"/"false" enables it (matches how the other TK_* gates read truthy env).
export function beaconEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const v = env.TK_HOOK_BEACON;
  if (v === undefined) return false;
  const t = v.trim().toLowerCase();
  return t.length > 0 && t !== "0" && t !== "false";
}

// The beacon line for a fired rewrite, or undefined when the beacon is off. The
// rewritten command is included (already host-visible via the rewrite carrier) so
// the transcript shows WHICH command tk wrapped. Total; never throws.
export function rewriteBeacon(
  rewritten: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  if (!beaconEnabled(env)) return undefined;
  const cmd = (rewritten ?? "").trim();
  return cmd.length > 0 ? `${HOOK_BEACON_PREFIX}: routed ${cmd}` : HOOK_BEACON_PREFIX;
}
