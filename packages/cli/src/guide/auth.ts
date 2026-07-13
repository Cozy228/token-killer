/**
 * Loopback auth (R12) for `ctx guide`.
 *
 * Contract:
 *   - The server binds 127.0.0.1 only (validated by `assertLoopbackHost`).
 *   - The printed URL carries a one-time bootstrap token exactly once.
 *   - The first request presenting the valid token consumes it (single use),
 *     mints a session, and the client is handed an HttpOnly, SameSite=Strict
 *     session cookie; the token is then redirected out of the address bar.
 *   - Every route (assets and API included) requires a valid token OR a valid
 *     session cookie — otherwise 401.
 *   - A DNS-rebinding Host header (non-loopback) is rejected (403).
 *
 * Only node:crypto is used — no external dependency.
 */

import { randomBytes } from "node:crypto";

export const COOKIE_NAME = "ctx_guide";
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "::1", "localhost", "[::1]"]);

/** Loopback bind guard — refuse any non-loopback host at bind time. */
export function isLoopbackHost(host: string): boolean {
  return LOOPBACK_HOSTS.has(host);
}

export function assertLoopbackHost(host: string): void {
  if (!isLoopbackHost(host)) {
    throw new Error(
      `ctx guide refuses to bind a non-loopback host: ${host}. ` +
        "The guide server is loopback-only (127.0.0.1) with zero egress.",
    );
  }
}

/** Reject a request whose Host header is not a loopback address (rebinding guard). */
export function isLoopbackRequestHost(hostHeader: string | undefined): boolean {
  if (hostHeader === undefined) return false;
  const host = hostHeader.split(":")[0] ?? "";
  // IPv6 bracket form `[::1]:port` -> host part keeps the leading `[`.
  const normalized = hostHeader.startsWith("[")
    ? hostHeader.slice(0, hostHeader.indexOf("]") + 1)
    : host;
  return isLoopbackHost(host) || isLoopbackHost(normalized);
}

/** The single clean URL printed to the user (token carried exactly once). */
export function formatGuideUrl(port: number, token: string, host = "127.0.0.1"): string {
  return `http://${host}:${port}/?t=${token}`;
}

/** Parse a `Cookie:` header into a name->value map. */
export function parseCookies(header: string | undefined): Map<string, string> {
  const out = new Map<string, string>();
  if (!header) return out;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const name = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (name) out.set(name, value);
  }
  return out;
}

/** The Set-Cookie value for a freshly minted session. */
export function sessionCookie(session: string): string {
  return `${COOKIE_NAME}=${session}; HttpOnly; SameSite=Strict; Path=/`;
}

/**
 * The auth state machine for one server instance. Holds the (single-use)
 * bootstrap token and the set of live session ids.
 */
export class GuideAuth {
  readonly #token: string;
  #tokenConsumed = false;
  readonly #sessions = new Set<string>();

  constructor(token: string = randomBytes(32).toString("base64url")) {
    this.#token = token;
  }

  get token(): string {
    return this.#token;
  }

  /** True once the bootstrap token has been redeemed for a session. */
  get tokenConsumed(): boolean {
    return this.#tokenConsumed;
  }

  /** Does this request already carry a valid session cookie? */
  hasValidCookie(cookieHeader: string | undefined): boolean {
    const cookies = parseCookies(cookieHeader);
    const session = cookies.get(COOKIE_NAME);
    return session !== undefined && this.#sessions.has(session);
  }

  /**
   * Attempt to redeem the URL token. Returns a fresh session id on success
   * (single use), or null if the token is missing/invalid/already consumed.
   */
  redeemToken(token: string | null): string | null {
    if (token === null || this.#tokenConsumed || token !== this.#token) return null;
    this.#tokenConsumed = true;
    const session = randomBytes(24).toString("base64url");
    this.#sessions.add(session);
    return session;
  }
}
