import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runSupport } from "../../../src/support/cli.js";

let home: string;
let stdout: string[];
let stderr: string[];
const orig = {
  TOKEN_KILLER_HOME: process.env.TOKEN_KILLER_HOME,
  TK_SUPPORT_EMAIL: process.env.TK_SUPPORT_EMAIL,
  TK_SUPPORT_TEAMS: process.env.TK_SUPPORT_TEAMS,
};

function restoreEnv(key: keyof typeof orig, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "tk-support-cli-"));
  process.env.TOKEN_KILLER_HOME = home;
  // Default to the env-routing-unset state; individual tests opt in.
  delete process.env.TK_SUPPORT_EMAIL;
  delete process.env.TK_SUPPORT_TEAMS;
  // TK_NO_OPEN is set globally by tests/setup/isolateHome.ts, so openExternal /
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
  restoreEnv("TOKEN_KILLER_HOME", orig.TOKEN_KILLER_HOME);
  restoreEnv("TK_SUPPORT_EMAIL", orig.TK_SUPPORT_EMAIL);
  restoreEnv("TK_SUPPORT_TEAMS", orig.TK_SUPPORT_TEAMS);
});

describe("runSupport — dispatch + exit codes", () => {
  test("`support email --no-attach -y` exits 0; bare-draft disclosure; degrades, sends nothing", async () => {
    expect(await runSupport(["email", "--no-attach", "-y"])).toBe(0);
    const out = stdout.join("");
    // Attach-aware disclosure: --no-attach must NOT claim logs/commands/config are gathered.
    expect(out).toContain("BARE support draft");
    expect(out).not.toContain("the shell commands you ran through tk");
    expect(out).toContain("No support destination configured");
  });

  test("`support teams -y` builds + saves a bundle and exits 0", async () => {
    expect(await runSupport(["teams", "-y"])).toBe(0);
    expect(stdout.join("")).toContain("Saved diagnostic bundle:");
  });

  test("non-TTY + no channel ⇒ usage on stderr + exit 1", async () => {
    expect(await runSupport([])).toBe(1);
    expect(stderr.join("")).toContain("tk support [email|teams]");
  });

  test("unknown flag ⇒ `tk support: unknown flag '<x>'` + exit 1", async () => {
    expect(await runSupport(["--bogus"])).toBe(1);
    expect(stderr.join("")).toBe("tk support: unknown flag '--bogus'\n");
  });

  test("--help prints usage to stdout, exit 0", async () => {
    expect(await runSupport(["--help"])).toBe(0);
    expect(stdout.join("")).toContain("tk support [email|teams]");
  });
});

describe("runSupport — env-routed channels", () => {
  test("email + TK_SUPPORT_EMAIL prints a mailto: URI to that address (RFC 6068 literal @)", async () => {
    process.env.TK_SUPPORT_EMAIL = "ops@corp.example";
    expect(await runSupport(["email", "--no-attach", "-y"])).toBe(0);
    expect(stdout.join("")).toContain("mailto:ops@corp.example?");
  });

  test("teams + TK_SUPPORT_TEAMS prints an msteams: scheme deep link (not https)", async () => {
    process.env.TK_SUPPORT_TEAMS = "ops@corp.example";
    expect(await runSupport(["teams", "--no-attach", "-y"])).toBe(0);
    const out = stdout.join("");
    expect(out).toContain("msteams:/l/chat/0/0?users=ops%40corp.example");
    expect(out).not.toContain("https://teams.microsoft.com");
  });

  test("a lone --email override implies the email channel", async () => {
    expect(await runSupport(["--email", "ops@corp.example", "--no-attach", "-y"])).toBe(0);
    expect(stdout.join("")).toContain("mailto:ops@corp.example?");
  });
});
