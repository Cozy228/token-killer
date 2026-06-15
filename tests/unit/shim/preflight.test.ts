import { describe, expect, test } from "vitest";

import {
  copilotHooksDir,
  gatherPreflight,
  parsePwshVersion,
  renderPreflight,
  type PreflightCheck,
  type PreflightDeps,
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
  execPath?: string;
  cliPath?: string;
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
    execPath: opts.execPath ?? "/usr/bin/node",
    cliPath: opts.cliPath ?? "/opt/tk/cli.js",
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

describe("gatherPreflight — hook command path", () => {
  test("node + cli both exist → ok, shows command", () => {
    const deps = makeDeps({
      execPath: "/usr/bin/node",
      cliPath: "/opt/tk/cli.js",
      files: new Set(["/usr/bin/node", "/opt/tk/cli.js"]),
    });
    const c = find(gatherPreflight(deps), "Hook command path");
    expect(c.ok).toBe(true);
    expect(c.detail).toContain("hook copilot");
  });

  test("cli missing → FAIL, names the missing piece", () => {
    const deps = makeDeps({
      execPath: "/usr/bin/node",
      cliPath: "/opt/tk/cli.js",
      files: new Set(["/usr/bin/node"]), // cli absent
    });
    const c = find(gatherPreflight(deps), "Hook command path");
    expect(c.ok).toBe(false);
    expect(c.detail).toContain("cli");
    expect(c.detail).toContain("inert");
  });

  test("node missing → FAIL", () => {
    const deps = makeDeps({
      execPath: "/usr/bin/node",
      cliPath: "/opt/tk/cli.js",
      files: new Set(["/opt/tk/cli.js"]), // node absent
    });
    const c = find(gatherPreflight(deps), "Hook command path");
    expect(c.ok).toBe(false);
    expect(c.detail).toContain("node");
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
      execPath: "/n/node",
      cliPath: "/c/cli.js",
      files: new Set(["/n/node", "/c/cli.js", "/home/u/.copilot/hooks"]),
      home: "/home/u",
    });
    const checks = gatherPreflight(deps);
    expect(checks).toHaveLength(5);
    expect(checks.every((c) => c.ok === true)).toBe(true);
  });

  test("nothing present → no throw, every check degrades", () => {
    const deps = makeDeps({});
    const checks = gatherPreflight(deps);
    expect(checks).toHaveLength(5);
    // None throw; verdicts are warn/FAIL, never true.
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
    expect(lines).toHaveLength(5);
    for (const line of lines) expect(line.startsWith("  [")).toBe(true);
  });
});
