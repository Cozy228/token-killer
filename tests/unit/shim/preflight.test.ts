import { describe, expect, test } from "vitest";

import {
  copilotHooksDir,
  defaultProtocolProbe,
  gatherPreflight,
  parseHookCommandPaths,
  parsePwshVersion,
  renderPreflight,
  type PreflightCheck,
  type PreflightDeps,
  type ProtocolProbeResult,
  type RunResult,
} from "../../../src/shim/preflight.js";

// Unit tests for the Windows preflight (issue #23). All probes are INJECTED so
// the matrix is deterministic and never depends on what is installed on the box.

// Build a deps object whose `run`/`which` are driven by lookup tables. Anything
// not in the table is treated as absent (run → not ok / empty, which → null).
function makeDeps(opts: {
  runs?: Record<string, RunResult>;
  resolvable?: Record<string, string>;
  files?: Set<string>;
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  // The command baked into the installed tk-managed hook config; null (default) models
  // "no tk-managed hook installed" (issue #23).
  installedCommand?: string | null;
  // Result of the in-process protocol self-probe; defaults to "did not rewrite" so the
  // all-absent matrix has no `ok` check (issue #23 §2).
  protocolProbe?: ProtocolProbeResult;
  home?: string;
}): PreflightDeps {
  const runs = opts.runs ?? {};
  const resolvable = opts.resolvable ?? {};
  const files = opts.files ?? new Set<string>();
  return {
    run: (cmd) => runs[cmd] ?? { ok: false, stdout: "" },
    which: (program) => resolvable[program] ?? null,
    existsSync: (p) => files.has(p),
    env: opts.env ?? {},
    platform: opts.platform ?? "win32",
    installedHookCommand: () => opts.installedCommand ?? null,
    protocolProbe: () => opts.protocolProbe ?? { rewrote: false, got: null },
    homedir: () => opts.home ?? "/home/u",
  };
}

function find(checks: PreflightCheck[], name: string): PreflightCheck {
  const c = checks.find((x) => x.name === name);
  if (!c) throw new Error(`no check named ${name}: ${checks.map((x) => x.name).join(", ")}`);
  return c;
}

describe("parsePwshVersion", () => {
  test("7.4.1 → atLeast7 ok, major 7", () => {
    const v = parsePwshVersion("PowerShell 7.4.1");
    expect(v.atLeast7).toBe(true);
    expect(v.major).toBe(7);
    expect(v.version).toBe("7.4.1");
  });

  test("bare 7.0 string parses", () => {
    const v = parsePwshVersion("7.0");
    expect(v.atLeast7).toBe(true);
    expect(v.major).toBe(7);
  });

  test("major > 7 (8.x) is still ok", () => {
    expect(parsePwshVersion("PowerShell 8.0.0").atLeast7).toBe(true);
  });

  test("5.1 (Windows PowerShell) → below 7", () => {
    const v = parsePwshVersion("5.1.19041.1");
    expect(v.atLeast7).toBe(false);
    expect(v.major).toBe(5);
  });

  test("garbage → not ok, no major", () => {
    const v = parsePwshVersion("not a version");
    expect(v.atLeast7).toBe(false);
    expect(v.major).toBeNull();
    expect(v.version).toBeNull();
  });

  test("empty string → not ok", () => {
    expect(parsePwshVersion("").atLeast7).toBe(false);
  });
});

describe("copilotHooksDir", () => {
  test("honors COPILOT_HOME as the .copilot root", () => {
    const deps = makeDeps({ env: { COPILOT_HOME: "/custom/copilot" } });
    expect(copilotHooksDir(deps)).toBe("/custom/copilot/hooks");
  });

  test("falls back to ~/.copilot/hooks", () => {
    const deps = makeDeps({ home: "/home/u" });
    expect(copilotHooksDir(deps)).toBe("/home/u/.copilot/hooks");
  });
});

describe("gatherPreflight — Copilot CLI version", () => {
  test("present → reports the version line, ok", () => {
    const deps = makeDeps({ runs: { copilot: { ok: true, stdout: "1.0.46" } } });
    const c = find(gatherPreflight(deps), "Copilot CLI version");
    expect(c.ok).toBe(true);
    expect(c.detail).toContain("1.0.46");
  });

  test("absent → warn, not found", () => {
    const deps = makeDeps({});
    const c = find(gatherPreflight(deps), "Copilot CLI version");
    expect(c.ok).toBe("warn");
    expect(c.detail).toBe("not found");
  });

  test("multi-line output → keeps first non-empty line", () => {
    const deps = makeDeps({ runs: { copilot: { ok: true, stdout: "\ncopilot 2.0\nextra" } } });
    const c = find(gatherPreflight(deps), "Copilot CLI version");
    expect(c.detail).toBe("copilot 2.0");
  });
});

describe("gatherPreflight — PowerShell 7+", () => {
  test("pwsh present >= 7 → ok", () => {
    const deps = makeDeps({ runs: { pwsh: { ok: true, stdout: "PowerShell 7.4.1" } } });
    const c = find(gatherPreflight(deps), "PowerShell 7+ (pwsh)");
    expect(c.ok).toBe(true);
    expect(c.detail).toContain("7.4.1");
  });

  test("pwsh present < 7 → warn (below 7)", () => {
    const deps = makeDeps({ runs: { pwsh: { ok: true, stdout: "5.1.19041.1" } } });
    const c = find(gatherPreflight(deps), "PowerShell 7+ (pwsh)");
    expect(c.ok).toBe("warn");
    expect(c.detail).toContain("below 7");
  });

  test("pwsh absent → warn (not found, requirement noted)", () => {
    const deps = makeDeps({});
    const c = find(gatherPreflight(deps), "PowerShell 7+ (pwsh)");
    expect(c.ok).toBe("warn");
    expect(c.detail).toContain("not found");
    expect(c.detail).toContain("PowerShell 7+");
  });
});

describe("gatherPreflight — hook command path (validates the INSTALLED baked command, #23)", () => {
  const baked = '"/usr/bin/node" "/opt/tk/cli.js" hook copilot';

  test("baked node + cli both exist → ok, shows the installed command", () => {
    const deps = makeDeps({
      installedCommand: baked,
      files: new Set(["/usr/bin/node", "/opt/tk/cli.js"]),
    });
    const c = find(gatherPreflight(deps), "Hook command path");
    expect(c.ok).toBe(true);
    expect(c.detail).toContain("hook copilot");
  });

  test("baked cli path is stale (missing) → FAIL, names the missing piece", () => {
    const deps = makeDeps({
      installedCommand: baked,
      files: new Set(["/usr/bin/node"]), // cli absent
    });
    const c = find(gatherPreflight(deps), "Hook command path");
    expect(c.ok).toBe(false);
    expect(c.detail).toContain("cli");
    expect(c.detail).toContain("inert");
  });

  test("baked node path is stale (missing) → FAIL", () => {
    const deps = makeDeps({
      installedCommand: baked,
      files: new Set(["/opt/tk/cli.js"]), // node absent
    });
    const c = find(gatherPreflight(deps), "Hook command path");
    expect(c.ok).toBe(false);
    expect(c.detail).toContain("node");
  });

  test("no tk-managed hook installed → warn (NOT a false-green from the running process)", () => {
    const deps = makeDeps({ installedCommand: null });
    const c = find(gatherPreflight(deps), "Hook command path");
    expect(c.ok).toBe("warn");
    expect(c.detail).toContain("no tk-managed hook");
  });

  test("STALE baked path is caught even while the running process is healthy (#23 core)", () => {
    // The exact regression: the installed config points at a node/cli that no longer
    // exist, while the current tk process's own paths ARE present. The check must FAIL
    // on the baked paths — the old check passed because it validated the live process.
    const deps = makeDeps({
      installedCommand: '"/old/removed/node" "/old/removed/cli.js" hook copilot',
      files: new Set(["/usr/bin/node", "/opt/tk/cli.js"]), // live process is fine…
    });
    const c = find(gatherPreflight(deps), "Hook command path");
    expect(c.ok).toBe(false); // …but the BAKED paths are stale.
    expect(c.detail).toContain("stale");
  });
});

describe("parseHookCommandPaths", () => {
  test("plain unquoted paths → node + cli", () => {
    expect(parseHookCommandPaths("/usr/bin/node /opt/tk/cli.js hook copilot")).toEqual({
      node: "/usr/bin/node",
      cli: "/opt/tk/cli.js",
    });
  });

  test("double-quoted Windows paths with spaces are kept whole", () => {
    const cmd = '"C:\\Program Files\\nodejs\\node.exe" "C:\\Users\\me\\app\\cli.js" hook copilot';
    expect(parseHookCommandPaths(cmd)).toEqual({
      node: "C:\\Program Files\\nodejs\\node.exe",
      cli: "C:\\Users\\me\\app\\cli.js",
    });
  });

  test("empty command → both undefined (never throws)", () => {
    expect(parseHookCommandPaths("")).toEqual({ node: undefined, cli: undefined });
  });
});

describe("gatherPreflight — hooks dir", () => {
  test("present (~/.copilot/hooks) → ok", () => {
    const deps = makeDeps({ home: "/home/u", files: new Set(["/home/u/.copilot/hooks"]) });
    const c = find(gatherPreflight(deps), "Copilot hooks dir");
    expect(c.ok).toBe(true);
    expect(c.detail).toContain("/home/u/.copilot/hooks");
  });

  test("absent → warn", () => {
    const deps = makeDeps({ home: "/home/u" });
    const c = find(gatherPreflight(deps), "Copilot hooks dir");
    expect(c.ok).toBe("warn");
    expect(c.detail).toContain("absent");
  });

  test("present via COPILOT_HOME → ok at the custom root", () => {
    const deps = makeDeps({
      env: { COPILOT_HOME: "/custom/copilot" },
      files: new Set(["/custom/copilot/hooks"]),
    });
    const c = find(gatherPreflight(deps), "Copilot hooks dir");
    expect(c.ok).toBe(true);
    expect(c.detail).toContain("/custom/copilot/hooks");
  });

  test("COPILOT_HOME set but dir absent → warn", () => {
    const deps = makeDeps({ env: { COPILOT_HOME: "/custom/copilot" } });
    const c = find(gatherPreflight(deps), "Copilot hooks dir");
    expect(c.ok).toBe("warn");
  });
});

describe("gatherPreflight — Windows shell tool name", () => {
  test("powershell resolves → ok", () => {
    const deps = makeDeps({
      resolvable: { powershell: "C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe" },
    });
    const c = find(gatherPreflight(deps), "Windows shell tool (powershell)");
    expect(c.ok).toBe(true);
    expect(c.detail).toContain("powershell.exe");
  });

  test("only pwsh resolves → ok (pwsh fallback)", () => {
    const deps = makeDeps({ resolvable: { pwsh: "/usr/bin/pwsh" } });
    const c = find(gatherPreflight(deps), "Windows shell tool (powershell)");
    expect(c.ok).toBe(true);
    expect(c.detail).toContain("pwsh");
  });

  test("neither resolves → warn", () => {
    const deps = makeDeps({});
    const c = find(gatherPreflight(deps), "Windows shell tool (powershell)");
    expect(c.ok).toBe("warn");
    expect(c.detail).toContain("not found");
  });
});

describe("gatherPreflight — full healthy Windows matrix", () => {
  test("everything present → all ok", () => {
    const deps = makeDeps({
      runs: {
        copilot: { ok: true, stdout: "1.0.46" },
        pwsh: { ok: true, stdout: "PowerShell 7.4.1" },
      },
      resolvable: { powershell: "C:/ps.exe" },
      installedCommand: '"/n/node" "/c/cli.js" hook copilot',
      protocolProbe: { rewrote: true, got: "tk git status" },
      files: new Set(["/n/node", "/c/cli.js", "/home/u/.copilot/hooks"]),
      home: "/home/u",
    });
    const checks = gatherPreflight(deps);
    expect(checks).toHaveLength(6);
    expect(checks.every((c) => c.ok === true)).toBe(true);
  });

  test("nothing present → no throw, every check degrades", () => {
    const deps = makeDeps({});
    const checks = gatherPreflight(deps);
    expect(checks).toHaveLength(6);
    // None throw; verdicts are warn/FAIL, never true (the self-probe defaults to
    // "did not rewrite" → warn).
    expect(checks.some((c) => c.ok === true)).toBe(false);
  });
});

describe("renderPreflight", () => {
  test("produces a stable line per check with a verdict glyph", () => {
    const checks: PreflightCheck[] = [
      { name: "A", ok: true, detail: "good" },
      { name: "B", ok: "warn", detail: "meh" },
      { name: "C", ok: false, detail: "bad" },
    ];
    const lines = renderPreflight(checks);
    expect(lines).toEqual(["  [ok] A: good", "  [warn] B: meh", "  [FAIL] C: bad"]);
  });

  test("never throws on real gathered checks (injected absent matrix)", () => {
    const lines = renderPreflight(gatherPreflight(makeDeps({})));
    expect(lines).toHaveLength(6);
    for (const line of lines) expect(line.startsWith("  [")).toBe(true);
  });
});

describe("gatherPreflight — hook protocol self-probe (#23 §2)", () => {
  test("the in-process pipeline rewrites → ok", () => {
    const deps = makeDeps({ protocolProbe: { rewrote: true, got: "tk git status" } });
    const c = find(gatherPreflight(deps), "Hook protocol self-probe");
    expect(c.ok).toBe(true);
    expect(c.detail).toContain("rewrites end-to-end");
  });

  test("the pipeline did NOT rewrite → warn, shows what it got", () => {
    const deps = makeDeps({ protocolProbe: { rewrote: false, got: "git status" } });
    const c = find(gatherPreflight(deps), "Hook protocol self-probe");
    expect(c.ok).toBe("warn");
    expect(c.detail).toContain("did not rewrite");
    expect(c.detail).toContain("git status");
  });
});

describe("defaultProtocolProbe (REAL in-process pipeline)", () => {
  // No injection: this drives tk's actual normalizeStdin → decide → toHostOutput on a
  // synthetic powershell event. `git` is present on the dev box / CI (off Windows the
  // presence gate is always open), so the rewrite fires deterministically. This is the
  // test that would actually CATCH a normalize/rewrite/host-output regression (#23 §2).
  test("a synthetic powershell `git status` event rewrites to `tk git status`", () => {
    const result = defaultProtocolProbe();
    expect(result.rewrote).toBe(true);
    expect(result.got).toBe("tk git status");
  });
});
