import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runSupport } from "../../../src/support/cli.js";

let home: string;
let stdout: string[];
let stderr: string[];
const orig = {
  CONTEXA_HOME: process.env.CONTEXA_HOME,
  CTX_SUPPORT_EMAIL: process.env.CTX_SUPPORT_EMAIL,
  CTX_SUPPORT_TEAMS: process.env.CTX_SUPPORT_TEAMS,
  CTX_SUPPORT_GITHUB: process.env.CTX_SUPPORT_GITHUB,
};

function restoreEnv(key: keyof typeof orig, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "ctx-support-cli-"));
  process.env.CONTEXA_HOME = home;
  // Default to the env-routing-unset state; individual tests opt in.
  delete process.env.CTX_SUPPORT_EMAIL;
  delete process.env.CTX_SUPPORT_TEAMS;
  delete process.env.CTX_SUPPORT_GITHUB;
  // CTX_NO_OPEN is set globally by tests/setup/isolateHome.ts, so openExternal /
  // copyToClipboard never spawn — URIs are PRINTED instead of opened.
  stdout = [];
  stderr = [];
  vi.spyOn(process.stdout, "write").mockImplementation((c: string | Uint8Array) => {
    stdout.push(String(c));
    return true;
  });
  vi.spyOn(process.stderr, "write").mockImplementation((c: string | Uint8Array) => {
    stderr.push(String(c));
    return true;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  rmSync(home, { recursive: true, force: true });
  restoreEnv("CONTEXA_HOME", orig.CONTEXA_HOME);
  restoreEnv("CTX_SUPPORT_EMAIL", orig.CTX_SUPPORT_EMAIL);
  restoreEnv("CTX_SUPPORT_TEAMS", orig.CTX_SUPPORT_TEAMS);
  restoreEnv("CTX_SUPPORT_GITHUB", orig.CTX_SUPPORT_GITHUB);
});

describe("runSupport — dispatch + exit codes", () => {
  test("`support email --no-attach -y` exits 0; bare-draft disclosure; degrades, sends nothing", async () => {
    expect(await runSupport(["email", "--no-attach", "-y"])).toBe(0);
    const out = stdout.join("");
    // Attach-aware disclosure: --no-attach must NOT claim logs/commands/config are gathered.
    expect(out).toContain("BARE support draft");
    expect(out).not.toContain("the shell commands you ran through ctx");
    expect(out).toContain("has no email support destination");
  });

  test("`support teams -y` builds + saves a bundle and exits 0", async () => {
    expect(await runSupport(["teams", "-y"])).toBe(0);
    expect(stdout.join("")).toContain("Saved diagnostic bundle:");
  });

  test("non-TTY + no channel ⇒ usage on stderr + exit 1", async () => {
    expect(await runSupport([])).toBe(1);
    expect(stderr.join("")).toContain("ctx support [email|teams|github]");
  });

  test("unknown flag ⇒ `ctx support: unknown flag '<x>'` + exit 1", async () => {
    expect(await runSupport(["--bogus"])).toBe(1);
    expect(stderr.join("")).toBe("ctx support: unknown flag '--bogus'\n");
  });

  test("--help prints usage to stdout, exit 0", async () => {
    expect(await runSupport(["--help"])).toBe(0);
    expect(stdout.join("")).toContain("ctx support [email|teams|github]");
  });
});

// Under vitest there is no tsdown `define`, so the baked destination falls back to
// the CTX_SUPPORT_* env var (see resolveDestination) — these drive that test-mode
// path, which mirrors what a real build bakes into the channel.
describe("runSupport — baked-destination channels", () => {
  test("email destination prints a mailto: URI to that address (RFC 6068 literal @)", async () => {
    process.env.CTX_SUPPORT_EMAIL = "ops@corp.example";
    expect(await runSupport(["email", "--no-attach", "-y"])).toBe(0);
    expect(stdout.join("")).toContain("mailto:ops@corp.example?");
  });

  test("teams destination prints an msteams: scheme deep link (not https)", async () => {
    process.env.CTX_SUPPORT_TEAMS = "ops@corp.example";
    expect(await runSupport(["teams", "--no-attach", "-y"])).toBe(0);
    const out = stdout.join("");
    expect(out).toContain("msteams:/l/chat/0/0?users=ops%40corp.example");
    expect(out).not.toContain("https://teams.microsoft.com");
  });

  test("github destination prints a pre-filled issues/new draft URL", async () => {
    process.env.CTX_SUPPORT_GITHUB = "acme/widget";
    expect(await runSupport(["github", "--no-attach", "-y"])).toBe(0);
    const out = stdout.join("");
    expect(out).toContain("https://github.com/acme/widget/issues/new?title=ctx%20support%20report");
    expect(out).toContain("draft a GitHub issue");
  });

  test("a repo-URL github destination is accepted verbatim (GitHub Enterprise host)", async () => {
    process.env.CTX_SUPPORT_GITHUB = "https://ghe.corp.example/acme/widget";
    expect(await runSupport(["github", "--no-attach", "-y"])).toBe(0);
    expect(stdout.join("")).toContain("https://ghe.corp.example/acme/widget/issues/new?");
  });

  test("github with no baked destination degrades to save+hint, sends nothing", async () => {
    expect(await runSupport(["github", "-y"])).toBe(0);
    const out = stdout.join("");
    expect(out).toContain("Saved diagnostic bundle:");
    expect(out).toContain("has no github support destination");
    expect(out).not.toContain("issues/new");
  });
});
