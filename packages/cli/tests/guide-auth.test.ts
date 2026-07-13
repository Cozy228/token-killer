/**
 * Loopback auth units (R12): loopback bind guard, clean-URL format, cookie
 * parsing, and the one-time-token → session state machine (single use).
 */
import { describe, expect, test } from "vitest";
import {
  assertLoopbackHost,
  COOKIE_NAME,
  formatGuideUrl,
  GuideAuth,
  isLoopbackHost,
  isLoopbackRequestHost,
  parseCookies,
  sessionCookie,
} from "../src/guide/auth.ts";

describe("loopback guards", () => {
  test("accepts loopback hosts, rejects the rest", () => {
    expect(isLoopbackHost("127.0.0.1")).toBe(true);
    expect(isLoopbackHost("::1")).toBe(true);
    expect(isLoopbackHost("localhost")).toBe(true);
    expect(isLoopbackHost("0.0.0.0")).toBe(false);
    expect(isLoopbackHost("192.168.1.4")).toBe(false);
    expect(() => assertLoopbackHost("0.0.0.0")).toThrow(/non-loopback/);
    expect(() => assertLoopbackHost("127.0.0.1")).not.toThrow();
  });

  test("request Host header rebinding guard", () => {
    expect(isLoopbackRequestHost("127.0.0.1:5173")).toBe(true);
    expect(isLoopbackRequestHost("localhost:5173")).toBe(true);
    expect(isLoopbackRequestHost("evil.example.com")).toBe(false);
    expect(isLoopbackRequestHost(undefined)).toBe(false);
  });
});

describe("clean URL format", () => {
  test("carries the token exactly once, loopback host", () => {
    expect(formatGuideUrl(4188, "abc123")).toBe("http://127.0.0.1:4188/?t=abc123");
  });
});

describe("cookie parsing", () => {
  test("parses a name=value cookie header", () => {
    const cookies = parseCookies("ctx_guide=sess-1; other=x");
    expect(cookies.get(COOKIE_NAME)).toBe("sess-1");
    expect(parseCookies(undefined).size).toBe(0);
  });

  test("session cookie is HttpOnly + SameSite=Strict", () => {
    const c = sessionCookie("sess-1");
    expect(c).toContain(`${COOKIE_NAME}=sess-1`);
    expect(c).toContain("HttpOnly");
    expect(c).toContain("SameSite=Strict");
    expect(c).toContain("Path=/");
  });
});

describe("GuideAuth token → session", () => {
  test("redeems the token exactly once (single use)", () => {
    const auth = new GuideAuth("TOKEN");
    expect(auth.tokenConsumed).toBe(false);

    const session = auth.redeemToken("TOKEN");
    expect(session).not.toBeNull();
    expect(auth.tokenConsumed).toBe(true);

    // Second redemption of the same token fails (consumed).
    expect(auth.redeemToken("TOKEN")).toBeNull();
    // Wrong token never redeems.
    expect(new GuideAuth("TOKEN").redeemToken("WRONG")).toBeNull();
    expect(new GuideAuth("TOKEN").redeemToken(null)).toBeNull();
  });

  test("recognizes a valid session cookie, rejects unknown", () => {
    const auth = new GuideAuth("TOKEN");
    const session = auth.redeemToken("TOKEN")!;
    expect(auth.hasValidCookie(`${COOKIE_NAME}=${session}`)).toBe(true);
    expect(auth.hasValidCookie(`${COOKIE_NAME}=forged`)).toBe(false);
    expect(auth.hasValidCookie(undefined)).toBe(false);
  });
});
