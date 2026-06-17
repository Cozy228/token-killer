import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

// Mock node:child_process so the openers/clipboard never actually spawn. vi.hoisted
// gives the factory access to the fns (the factory is hoisted above imports).
const { spawnMock, spawnSyncMock } = vi.hoisted(() => ({
  spawnMock: vi.fn(),
  spawnSyncMock: vi.fn(),
}));
vi.mock("node:child_process", () => ({ spawn: spawnMock, spawnSync: spawnSyncMock }));

import {
  buildGithubIssueUrl,
  buildMailto,
  buildTeamsDeepLink,
  copyToClipboard,
  githubRepoBase,
  openExternal,
  resolveDestination,
} from "../../../src/support/send.js";

const orig = {
  TK_NO_OPEN: process.env.TK_NO_OPEN,
  TK_SUPPORT_EMAIL: process.env.TK_SUPPORT_EMAIL,
  TK_SUPPORT_TEAMS: process.env.TK_SUPPORT_TEAMS,
  TK_SUPPORT_GITHUB: process.env.TK_SUPPORT_GITHUB,
  platform: process.platform,
};

function setPlatform(p: NodeJS.Platform): void {
  Object.defineProperty(process, "platform", { value: p, configurable: true });
}
function restoreEnv(key: keyof typeof orig, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

// A fake ChildProcess for openExternal: it now awaits the launcher's EXIT (review
// #12), so a success fires `exit` with code 0, a no-handler failure fires `exit` with
// a non-zero code, and a missing opener fires `error`. Invoke the matching callback
// synchronously (the production code clears its safety-timer once settled).
type ChildOutcome =
  | { event: "error" }
  | { event: "exit"; code: number | null; signal?: NodeJS.Signals | null };
function fakeChild(outcome: ChildOutcome) {
  const child = {
    once(event: string, cb: (...args: unknown[]) => void) {
      if (event === outcome.event) {
        if (outcome.event === "exit") cb(outcome.code, outcome.signal ?? null);
        else cb();
      }
      return child;
    },
    unref: vi.fn(),
  };
  return child;
}

beforeEach(() => {
  // Default: a launcher that exits cleanly (0); copyToClipboard sees a clean exit 0.
  spawnMock.mockReturnValue(fakeChild({ event: "exit", code: 0, signal: null }));
  spawnSyncMock.mockReturnValue({ status: 0, signal: null, error: undefined });
});

afterEach(() => {
  restoreEnv("TK_NO_OPEN", orig.TK_NO_OPEN);
  restoreEnv("TK_SUPPORT_EMAIL", orig.TK_SUPPORT_EMAIL);
  restoreEnv("TK_SUPPORT_TEAMS", orig.TK_SUPPORT_TEAMS);
  restoreEnv("TK_SUPPORT_GITHUB", orig.TK_SUPPORT_GITHUB);
  setPlatform(orig.platform);
});

describe("resolveDestination — env-only routing, NO baked default (ADR 0011)", () => {
  test("an explicit override beats the env var", () => {
    process.env.TK_SUPPORT_EMAIL = "env@x.com";
    expect(resolveDestination("email", "flag@x.com")).toBe("flag@x.com");
  });

  test("falls back to the matching env var when no override", () => {
    delete process.env.TK_SUPPORT_EMAIL;
    process.env.TK_SUPPORT_TEAMS = "u@tenant.com";
    expect(resolveDestination("teams")).toBe("u@tenant.com");
    expect(resolveDestination("email")).toBeUndefined();
  });

  test("undefined when nothing is configured — there is NO default address", () => {
    delete process.env.TK_SUPPORT_EMAIL;
    delete process.env.TK_SUPPORT_TEAMS;
    delete process.env.TK_SUPPORT_GITHUB;
    expect(resolveDestination("email")).toBeUndefined();
    expect(resolveDestination("teams")).toBeUndefined();
    expect(resolveDestination("github")).toBeUndefined();
  });

  test("a blank/whitespace env value counts as unset", () => {
    process.env.TK_SUPPORT_EMAIL = "   ";
    expect(resolveDestination("email")).toBeUndefined();
  });

  test("github routes through TK_SUPPORT_GITHUB, override beats env", () => {
    process.env.TK_SUPPORT_GITHUB = "env-owner/env-repo";
    expect(resolveDestination("github")).toBe("env-owner/env-repo");
    expect(resolveDestination("github", "flag-owner/flag-repo")).toBe("flag-owner/flag-repo");
  });
});

describe("buildMailto", () => {
  test("keeps the structural @ literal (RFC 6068 §2), encodes subject + CRLF body, one raw & separator", () => {
    const uri = buildMailto("ops@corp.com", "tk report & logs", "line1\nline2 & more");
    // RFC 6068 §2: the addr-spec `@` is structural and stays literal (NOT %40).
    expect(uri.startsWith("mailto:ops@corp.com?")).toBe(true);
    expect(uri).toContain("subject=tk%20report%20%26%20logs");
    // RFC 6068 §5: body line breaks MUST be CRLF → %0D%0A (not a bare %0A).
    expect(uri).toContain("body=line1%0D%0Aline2%20%26%20more");
    // Exactly one raw `&` — the field separator; subject/body `&` are encoded.
    expect(uri.split("&")).toHaveLength(2);
  });

  test("a recipient carrying `&` cannot add a raw ampersand (no second recipient)", () => {
    const uri = buildMailto("ops&alerts@example.com", "s", "b");
    // The injection-relevant `&` is encoded; the structural `@` stays literal.
    expect(uri).toContain("mailto:ops%26alerts@example.com?");
    expect(uri.split("&")).toHaveLength(2); // still exactly the one separator
  });

  test("a recipient carrying `?cc=` cannot inject extra headers", () => {
    const uri = buildMailto("x@y.z?cc=evil@z.com", "s", "b");
    // The injected `?` and `&` are encoded; only the structural `?`/`&` remain.
    expect(uri).not.toContain("?cc=");
    expect(uri).toContain("%3Fcc%3D");
    expect(uri.split("?")).toHaveLength(2);
    expect(uri.split("&")).toHaveLength(2);
  });
});

describe("buildTeamsDeepLink", () => {
  test("uses the msteams: SCHEME (not the https form) and encodes users + message", () => {
    const uri = buildTeamsDeepLink("user@tenant.com", "ptr & stuff");
    expect(uri.startsWith("msteams:/l/chat/0/0?")).toBe(true);
    expect(uri).not.toContain("https://");
    expect(uri).toContain("users=user%40tenant.com");
    expect(uri).toContain("message=ptr%20%26%20stuff");
  });
});

describe("githubRepoBase", () => {
  test("an owner/name slug maps to the public github.com repo URL", () => {
    expect(githubRepoBase("acme/widget")).toBe("https://github.com/acme/widget");
  });

  test("a full http(s) repo URL is kept as-is (GitHub Enterprise host)", () => {
    expect(githubRepoBase("https://ghe.corp.example/acme/widget")).toBe(
      "https://ghe.corp.example/acme/widget",
    );
  });

  test("trims a trailing slash and a `.git` suffix (as `git remote` emits)", () => {
    expect(githubRepoBase("acme/widget.git")).toBe("https://github.com/acme/widget");
    expect(githubRepoBase("https://github.com/acme/widget.git/")).toBe(
      "https://github.com/acme/widget",
    );
  });
});

describe("buildGithubIssueUrl", () => {
  test("builds an issues/new URL from a slug with one raw & separating title/body", () => {
    const uri = buildGithubIssueUrl("acme/widget", "tk report & logs", "line1\nline2 & more");
    expect(uri.startsWith("https://github.com/acme/widget/issues/new?")).toBe(true);
    expect(uri).toContain("title=tk%20report%20%26%20logs");
    expect(uri).toContain("body=line1%0Aline2%20%26%20more");
    // Exactly one raw `&` — the field separator; title/body `&` are encoded.
    expect(uri.split("&")).toHaveLength(2);
  });

  test("a body carrying `&`/`#` cannot inject extra query params", () => {
    const uri = buildGithubIssueUrl("acme/widget", "t", "b&labels=p0#frag");
    expect(uri).not.toContain("&labels=");
    expect(uri).toContain("%26labels%3Dp0%23frag");
    expect(uri.split("?")).toHaveLength(2);
    expect(uri.split("&")).toHaveLength(2);
  });

  test("respects a configured GitHub Enterprise repo URL", () => {
    const uri = buildGithubIssueUrl("https://ghe.corp.example/acme/widget", "t", "b");
    expect(uri.startsWith("https://ghe.corp.example/acme/widget/issues/new?")).toBe(true);
  });
});

describe("openExternal", () => {
  test("no-op + false under TK_NO_OPEN, never spawns", async () => {
    process.env.TK_NO_OPEN = "1";
    expect(await openExternal("mailto:x@y.z?subject=a&body=b")).toBe(false);
    expect(spawnMock).not.toHaveBeenCalled();
  });

  test("Windows uses rundll32 (NOT cmd) and the &-bearing URI reaches argv intact", async () => {
    delete process.env.TK_NO_OPEN;
    setPlatform("win32");
    const uri = "msteams:/l/chat/0/0?users=a%40b.com&message=hi%20there";
    expect(await openExternal(uri)).toBe(true);
    expect(spawnMock).toHaveBeenCalledTimes(1);
    const [cmd, args] = spawnMock.mock.calls[0]!;
    expect(cmd).toBe("rundll32");
    expect(cmd).not.toBe("cmd");
    // The whole URI (including `&`) is a SINGLE argv element — never split/truncated
    // the way `cmd /c start "" <uri>` would (issue #8 family).
    expect(args).toEqual(["url.dll,FileProtocolHandler", uri]);
    expect(args[1]).toContain("&");
  });

  test("macOS uses `open` with the raw URI", async () => {
    delete process.env.TK_NO_OPEN;
    setPlatform("darwin");
    expect(await openExternal("mailto:x@y.z")).toBe(true);
    const [cmd, args] = spawnMock.mock.calls[0]!;
    expect(cmd).toBe("open");
    expect(args).toEqual(["mailto:x@y.z"]);
  });

  test("Linux uses xdg-open with the raw URI", async () => {
    delete process.env.TK_NO_OPEN;
    setPlatform("linux");
    expect(await openExternal("mailto:x@y.z")).toBe(true);
    const [cmd, args] = spawnMock.mock.calls[0]!;
    expect(cmd).toBe("xdg-open");
    expect(args).toEqual(["mailto:x@y.z"]);
  });

  test("resolves FALSE on async spawn failure (missing opener) so the caller can print the URI", async () => {
    delete process.env.TK_NO_OPEN;
    setPlatform("darwin");
    spawnMock.mockReturnValueOnce(fakeChild({ event: "error" })); // emits 'error'
    expect(await openExternal("mailto:x@y.z")).toBe(false);
  });

  test("resolves FALSE on a non-zero exit (no handler for the scheme) so the caller prints the URI", async () => {
    delete process.env.TK_NO_OPEN;
    setPlatform("linux");
    // xdg-open exits 3 when no handler is registered — must NOT be reported as opened.
    spawnMock.mockReturnValueOnce(fakeChild({ event: "exit", code: 3, signal: null }));
    expect(await openExternal("msteams:/l/chat/0/0?users=a%40b.com")).toBe(false);
  });

  test("Windows treats a clean exit as success even with a non-zero code (rundll32 codes are unreliable)", async () => {
    delete process.env.TK_NO_OPEN;
    setPlatform("win32");
    spawnMock.mockReturnValueOnce(fakeChild({ event: "exit", code: 1, signal: null }));
    expect(await openExternal("mailto:x@y.z")).toBe(true);
  });
});

describe("copyToClipboard — presence-gated, best-effort", () => {
  test("no-op + false under TK_NO_OPEN", () => {
    process.env.TK_NO_OPEN = "1";
    expect(copyToClipboard("hi")).toBe(false);
    expect(spawnSyncMock).not.toHaveBeenCalled();
  });

  test("returns false when no clipboard tool is present (spawn errors on every candidate)", () => {
    delete process.env.TK_NO_OPEN;
    spawnSyncMock.mockReturnValue({ error: new Error("spawn ENOENT") });
    expect(copyToClipboard("hi")).toBe(false);
    expect(spawnSyncMock).toHaveBeenCalled();
  });

  test("macOS selects pbcopy, returns true, and pipes the text on stdin", () => {
    delete process.env.TK_NO_OPEN;
    setPlatform("darwin");
    spawnSyncMock.mockReturnValue({ status: 0, signal: null, error: undefined });
    expect(copyToClipboard("payload")).toBe(true);
    const [cmd, , opts] = spawnSyncMock.mock.calls[0]!;
    expect(cmd).toBe("pbcopy");
    expect(opts).toMatchObject({ input: "payload" });
  });

  test("Windows selects clip", () => {
    delete process.env.TK_NO_OPEN;
    setPlatform("win32");
    spawnSyncMock.mockReturnValue({ status: 0, signal: null, error: undefined });
    expect(copyToClipboard("x")).toBe(true);
    expect(spawnSyncMock.mock.calls[0]![0]).toBe("clip");
  });

  test("Linux falls back from xclip to wl-copy when the first tool is absent", () => {
    delete process.env.TK_NO_OPEN;
    setPlatform("linux");
    spawnSyncMock
      .mockReturnValueOnce({ error: new Error("spawn ENOENT") }) // xclip absent
      .mockReturnValueOnce({ status: 0, signal: null, error: undefined }); // wl-copy ok
    expect(copyToClipboard("x")).toBe(true);
    expect(spawnSyncMock).toHaveBeenCalledTimes(2);
    expect(spawnSyncMock.mock.calls[0]![0]).toBe("xclip");
    expect(spawnSyncMock.mock.calls[1]![0]).toBe("wl-copy");
  });

  test("a signal-killed tool (status=null, no error) is NOT reported as success", () => {
    delete process.env.TK_NO_OPEN;
    setPlatform("darwin");
    spawnSyncMock.mockReturnValue({ status: null, signal: "SIGTERM", error: undefined });
    expect(copyToClipboard("x")).toBe(false);
  });
});
