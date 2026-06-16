// `tk support` — channel builders + OS openers + clipboard. Zero-dep, NO HTTP and
// no runtime dependency (the whole project is strictly zero-dep, Node ≥20).
//
// The opener deliberately does NOT reuse src/report/open.ts's Windows branch. That
// path opens FILE paths via `cmd /c start "" <x>`, which truncates a URI at the
// first UNQUOTED `&` — and every mailto:/msteams: URI carries `&` (subject&body,
// users&message), so the body/message would be silently lost (spike-verified
// 2026-06-13; same Windows cmd-quoting hazard family as issue #8). On Windows we
// hand the whole URI to the shell's protocol handler via
// `rundll32 url.dll,FileProtocolHandler <uri>` instead (verified end-to-end for
// both mailto: and the Teams scheme). macOS `open` / Linux `xdg-open` take the URI
// directly, exactly as openInBrowser does for files.
//
// ADR 0011: there is NO baked-in destination — routing is env-only, so each
// deployment points support at its own in-tenant identity.

import { spawn, spawnSync } from "node:child_process";

export type SupportChannel = "email" | "teams";

// Resolve where a support report is routed. Precedence: explicit `override` (a
// --email/--teams flag) > the matching env var. Returns `undefined` when nothing
// is configured — the caller then degrades to save+clipboard+hint and sends
// nowhere (ADR 0011: tk ships no default address). A blank/whitespace value counts
// as unset so an empty env export can't masquerade as a destination.
export function resolveDestination(kind: SupportChannel, override?: string): string | undefined {
  const fromOverride = override?.trim();
  if (fromOverride) return fromOverride;
  const env = kind === "email" ? process.env.TK_SUPPORT_EMAIL : process.env.TK_SUPPORT_TEAMS;
  const fromEnv = env?.trim();
  return fromEnv ? fromEnv : undefined;
}

// Percent-encode an addr-spec for the mailto: `to` slot per RFC 6068 §2. In an
// addr-spec (`local-part "@" domain`) the `@` is STRUCTURAL and must stay literal;
// `encodeURIComponent` over-encodes it to `%40` (plus `+ , ; : $` → `%xx`), which the
// RFC's `to = addr-spec` grammar disallows and some mail clients fail to parse. So we
// encode with encodeURIComponent (which neutralizes the injection-relevant `? & = #`
// space …) and then RESTORE exactly the RFC "some-delims" it escaped — leaving the
// structural `@` literal while `?`/`&`/space stay encoded (no header/recipient
// injection from an env-supplied address like `ops&alerts@x.com` or `x@y.z?cc=…`).
function encodeMailtoRecipient(addr: string): string {
  // some-delims restored: $ (24), + (2B), , (2C), : (3A), ; (3B), @ (40).
  return encodeURIComponent(addr).replace(/%(24|2B|2C|3A|3B|40)/g, (_m, hex) =>
    String.fromCharCode(parseInt(hex, 16)),
  );
}

// mailto: cannot auto-attach a file, so `body` is a compact SUMMARY only; the full
// report is the saved markdown file, attached by hand and referenced by path in the
// body. The recipient keeps its structural `@` (RFC 6068 §2); subject/body are
// percent-encoded so the single unencoded `&` between them stays the field separator.
// Body line breaks are normalized to CRLF before encoding so they become `%0D%0A` as
// RFC 6068 §5 requires (`encodeURIComponent("\n")` alone yields a non-conformant
// `%0A`). Keep the URI well under client length limits (the summary is one screen).
export function buildMailto(to: string, subject: string, body: string): string {
  const encodedBody = encodeURIComponent(body.replace(/\r\n|\r|\n/g, "\r\n"));
  return `mailto:${encodeMailtoRecipient(to)}?subject=${encodeURIComponent(subject)}&body=${encodedBody}`;
}

// msteams: SCHEME deep link (NOT the https://teams.microsoft.com/l/... form): the
// scheme launches the Teams app directly and is reliably registered in tk's
// enterprise target environment. `users` resolves an in-tenant Entra UPN; `message`
// is a SHORT pointer only — the full report travels via the clipboard.
export function buildTeamsDeepLink(upn: string, message: string): string {
  return `msteams:/l/chat/0/0?users=${encodeURIComponent(upn)}&message=${encodeURIComponent(message)}`;
}

// Fail-fast budget for the launcher to exit. open/xdg-open/rundll32 dispatch the URI
// and exit promptly; a no-handler FAILURE exits fast too. A child still alive after
// this almost certainly launched (a slow handler app, not a failure), so we assume
// success and detach rather than hang tk.
export const OPEN_EXIT_TIMEOUT_MS = 2000;

// Open a mailto:/msteams: URI in the OS handler. Honors TK_NO_OPEN (tests /
// headless / CI). Windows uses rundll32 — NOT cmd /c start (see file header).
// Resolves to the REAL outcome: we await the launcher's EXIT (not just `spawn`),
// because `open`/`xdg-open` exit NON-ZERO (fast) when no handler is registered for the
// scheme — resolving eagerly on `spawn` reported success and wrongly suppressed the
// caller's manual-URI fallback (review #12). rundll32's exit code is unreliable on
// Windows (often 0 regardless), so there a clean spawn+exit counts as success. These
// are launcher processes that exit after dispatching — awaiting exit does NOT block on
// the mail client / Teams. Best-effort: resolves false under TK_NO_OPEN, on a
// missing/denied opener (ENOENT via `error`), or on a non-zero exit; never rejects.
export function openExternal(uri: string): Promise<boolean> {
  if (process.env.TK_NO_OPEN) return Promise.resolve(false);
  return new Promise((resolve) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const settle = (value: boolean): void => {
      if (settled) return;
      settled = true;
      if (timer !== undefined) clearTimeout(timer);
      resolve(value);
    };
    try {
      const [cmd, args] =
        process.platform === "darwin"
          ? (["open", [uri]] as const)
          : process.platform === "win32"
            ? (["rundll32", ["url.dll,FileProtocolHandler", uri]] as const)
            : (["xdg-open", [uri]] as const);
      const child = spawn(cmd, [...args], { stdio: "ignore", detached: true });
      timer = setTimeout(() => {
        child.unref();
        settle(true); // launched but slow to exit — assume success, don't hang tk
      }, OPEN_EXIT_TIMEOUT_MS);
      timer.unref?.();
      child.once("error", () => settle(false)); // ENOENT / permission denied
      child.once("exit", (code, signal) => {
        child.unref();
        // Windows: rundll32's exit code is unreliable → a clean exit is success.
        // Elsewhere: require exit 0 (a non-zero exit = no handler for the scheme).
        settle(process.platform === "win32" ? true : code === 0 && signal == null);
      });
    } catch {
      settle(false);
    }
  });
}

// Best-effort clipboard copy, presence-gated: only a tool that actually exists on
// this box runs, so a host without one degrades cleanly (returns false) instead of
// throwing. A missing binary surfaces as a spawn `error` (ENOENT), which we skip to
// try the next candidate. Also honors TK_NO_OPEN so the whole external-side-effect
// surface (open + clipboard) is suppressed under the same gate the suite relies on.
export function copyToClipboard(text: string): boolean {
  if (process.env.TK_NO_OPEN) return false;
  const candidates: ReadonlyArray<readonly [string, string[]]> =
    process.platform === "darwin"
      ? [["pbcopy", []]]
      : process.platform === "win32"
        ? [["clip", []]]
        : [
            ["xclip", ["-selection", "clipboard"]],
            ["wl-copy", []],
          ];
  for (const [cmd, args] of candidates) {
    try {
      const r = spawnSync(cmd, [...args], { input: text, timeout: 2000, windowsHide: true });
      if (r.error) continue; // tool not present (ENOENT) or killed by timeout → next
      // Require an explicit exit 0. A signal-kill (incl. external SIGTERM) leaves
      // status=null with no error; `(null ?? 0)===0` would falsely report success, so
      // only a real 0 counts; null/non-zero falls through to the next candidate.
      if (r.status === 0) return true;
    } catch {
      // Defensive: spawnSync surfaces failures on the result, not by throwing, but
      // a hostile environment must never break the support flow.
    }
  }
  return false;
}
