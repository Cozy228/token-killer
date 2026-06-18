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
// ADR 0013: the support destination is BAKED AT BUILD TIME, not configured at
// runtime — `tk support` reaches whoever PACKAGED this build (the maintainer), so a
// per-distribution identity is fixed by the packager, never retargeted by an end
// user. Mirrors the telemetry-endpoint build arg (src/telemetry/endpoint.ts).

import { spawn, spawnSync } from "node:child_process";

export type SupportChannel = "email" | "teams" | "github";

// Build-time destination constants — replaced by tsdown's `define` with
// JSON.stringify(process.env.TK_SUPPORT_* ?? "") at build (see tsdown.config.mjs). A
// generic build bakes "" ⇒ that channel has no destination and degrades to
// save+clipboard. An enterprise build bakes the maintainer's address/UPN/repo.
declare const __TK_SUPPORT_EMAIL__: string | undefined;
declare const __TK_SUPPORT_TEAMS__: string | undefined;
declare const __TK_SUPPORT_GITHUB__: string | undefined;

// The raw baked value for a channel. Under tsx/vitest there is no `define`, so the
// identifier is undefined and we honor the env var ONLY THEN (local runs + tests can
// point at a destination). A real build always replaces the identifier with its
// verbatim value — including "" — so the env fallback is unreachable in production
// and an installed CLI can never be retargeted by a runtime env export.
function bakedDestination(kind: SupportChannel): string {
  if (kind === "email") {
    return typeof __TK_SUPPORT_EMAIL__ !== "undefined"
      ? (__TK_SUPPORT_EMAIL__ ?? "")
      : (process.env.TK_SUPPORT_EMAIL ?? "");
  }
  if (kind === "teams") {
    return typeof __TK_SUPPORT_TEAMS__ !== "undefined"
      ? (__TK_SUPPORT_TEAMS__ ?? "")
      : (process.env.TK_SUPPORT_TEAMS ?? "");
  }
  return typeof __TK_SUPPORT_GITHUB__ !== "undefined"
    ? (__TK_SUPPORT_GITHUB__ ?? "")
    : (process.env.TK_SUPPORT_GITHUB ?? "");
}

// Resolve where a support report is routed for a channel, from the build-time baked
// value (ADR 0013). Returns `undefined` when this build baked no destination for the
// channel — the caller then degrades to save+clipboard+hint and sends nowhere. A
// blank/whitespace value counts as unset. The GitHub destination is the repo
// (`owner/name` slug or a full repo URL — see githubRepoBase).
export function resolveDestination(kind: SupportChannel): string | undefined {
  const value = bakedDestination(kind).trim();
  return value ? value : undefined;
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

// Normalize a configured GitHub destination to its repository base URL. Accepts
// the common `owner/name` slug (→ https://github.com/owner/name) OR an explicit
// http(s) repo URL so a GitHub Enterprise host is configurable just like the
// public one (the "git url + repo" both come from the single configured value).
// A trailing `/` and a `.git` suffix (as `git remote get-url` emits) are trimmed
// so the `/issues/new` suffix lands cleanly.
export function githubRepoBase(repo: string): string {
  const trimmed = repo
    .trim()
    .replace(/\/+$/, "")
    .replace(/\.git$/i, "");
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://github.com/${trimmed}`;
}

// Build a GitHub "new issue" URL pre-filled with a title + body — the GitHub
// analogue of a mailto: draft. Opening it lands the user on the repo's issue form
// with everything filled in; nothing is filed until they click "Submit". GitHub
// caps the prefill URL near 8 KB, so `body` MUST be the compact SUMMARY, not the
// full bundle — the full report travels via the clipboard + the saved file
// (attached by hand), the same split the Teams channel uses. title/body are
// percent-encoded so the single unencoded `&` between them stays the field
// separator (no query-param injection from a summary that contains `&`/`#`/`=`).
export function buildGithubIssueUrl(repo: string, title: string, body: string): string {
  const base = githubRepoBase(repo);
  return `${base}/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
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
