import { spawnSync } from "node:child_process";
import { existsSync as fsExistsSync } from "node:fs";
import { homedir as osHomedir } from "node:os";
import { delimiter, join } from "node:path";

import { resolveHookCommand } from "../hook/install.js";

// Windows preflight for `tk status` (issue #23, report §8 / §10 P0-5). On a
// stock Windows box the documented Copilot-CLI hook requirements are easy to get
// subtly wrong (no PowerShell 7+, a non-absolute hook command that PowerShell
// can't resolve, the hooks dir never loaded, the shell tool named `powershell`
// not `bash`). These read-only checks surface those before the user wonders why
// a "successful" install never compresses anything.
//
// Every probe is best-effort and DEGRADES to a "not found / unavailable" line —
// `tk status` must stay total (never throw), and the section runs on ALL
// platforms (it just reports "not found" off Windows), which also makes it
// deterministically unit-testable on macOS/Linux.

export type PreflightVerdict = boolean | "warn";

export type PreflightCheck = {
  name: string;
  ok: PreflightVerdict;
  detail: string;
};

// A single command run, narrowed to what the checks need. `ok` is false when the
// binary is absent or the spawn itself failed; `stdout` is the trimmed first
// useful output (stderr folded in, since some tools print `--version` there).
export type RunResult = { ok: boolean; stdout: string };
export type Runner = (cmd: string, args: string[]) => RunResult;
export type Which = (program: string) => string | null;

export type PreflightDeps = {
  run: Runner;
  which: Which;
  existsSync: (path: string) => boolean;
  env: NodeJS.ProcessEnv;
  platform: NodeJS.Platform;
  execPath: string;
  cliPath: string | undefined;
  homedir: () => string;
};

// --- real probe defaults ---------------------------------------------------
// Production `gatherPreflight()` uses these; tests inject fakes so the matrix is
// deterministic and never depends on what is installed on the box.

// Wrap spawnSync so a missing binary / ENOENT / signal NEVER throws — the whole
// point of preflight is to report absence, not crash status.
function defaultRun(cmd: string, args: string[]): RunResult {
  try {
    const r = spawnSync(cmd, args, { encoding: "utf8", timeout: 5000 });
    if (r.error || r.status === null) {
      // ENOENT (binary missing) or killed by signal/timeout.
      const out = `${r.stdout ?? ""}${r.stderr ?? ""}`.trim();
      return { ok: false, stdout: out };
    }
    // Some tools print version info to stderr; fold both, prefer stdout.
    const out = ((r.stdout ?? "").trim() || (r.stderr ?? "").trim()).trim();
    return { ok: true, stdout: out };
  } catch {
    return { ok: false, stdout: "" };
  }
}

// Resolve a program on PATH without spawning a shell. Mirrors the executor's
// Windows PATHEXT walk so the probe matches how a hook/tool actually resolves a
// binary; off Windows it walks PATH dirs directly. Returns the absolute path or
// null. Never throws.
function defaultWhich(
  program: string,
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
  exists: (p: string) => boolean = fsExistsSync,
): string | null {
  try {
    const pathValue = env.PATH ?? env.Path ?? "";
    if (!pathValue) return null;
    const dirs = pathValue.split(delimiter).filter((d) => d.length > 0);
    const exts =
      platform === "win32"
        ? (env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD").split(";").filter((e) => e.length > 0)
        : [""];
    for (const dir of dirs) {
      for (const ext of exts) {
        const candidate = join(dir, `${program}${ext}`);
        if (exists(candidate)) return candidate;
      }
    }
    return null;
  } catch {
    return null;
  }
}

export function defaultPreflightDeps(): PreflightDeps {
  return {
    run: defaultRun,
    which: (program) => defaultWhich(program),
    existsSync: fsExistsSync,
    env: process.env,
    platform: process.platform,
    execPath: process.execPath,
    cliPath: process.argv[1],
    homedir: osHomedir,
  };
}

// --- pwsh version parsing --------------------------------------------------
// PowerShell 7+ is the documented Copilot-CLI hook requirement. `pwsh --version`
// prints like `PowerShell 7.4.1`; older Windows PowerShell would report `5.1.x`.
// Exported so the >=7 decision is unit-tested directly without spawning.

export type PwshVersion = {
  raw: string;
  major: number | null;
  version: string | null;
  atLeast7: boolean;
};

export function parsePwshVersion(raw: string): PwshVersion {
  const trimmed = (raw ?? "").trim();
  // Grab the first dotted-numeric token (e.g. "7.4.1" out of "PowerShell 7.4.1").
  const match = trimmed.match(/(\d+)(?:\.\d+)*/);
  if (!match) {
    return { raw: trimmed, major: null, version: null, atLeast7: false };
  }
  const version = match[0];
  const major = Number.parseInt(match[1], 10);
  const valid = Number.isFinite(major);
  return {
    raw: trimmed,
    major: valid ? major : null,
    version,
    atLeast7: valid && major >= 7,
  };
}

// --- the checks ------------------------------------------------------------

function copilotVersionCheck(deps: PreflightDeps): PreflightCheck {
  const r = deps.run("copilot", ["--version"]);
  if (!r.ok || r.stdout === "") {
    return { name: "Copilot CLI version", ok: "warn", detail: "not found" };
  }
  // The version string is usually a single line; keep the first non-empty line.
  const line = r.stdout.split(/\r?\n/).find((l) => l.trim() !== "") ?? r.stdout;
  return { name: "Copilot CLI version", ok: true, detail: line.trim() };
}

function pwshCheck(deps: PreflightDeps): PreflightCheck {
  const r = deps.run("pwsh", ["--version"]);
  if (!r.ok || r.stdout === "") {
    // PowerShell 7+ (pwsh) is the documented requirement. Copilot CLI >=1.0.46
    // has a powershell.exe fallback, but PS7+ is what the hooks reference wants.
    return {
      name: "PowerShell 7+ (pwsh)",
      ok: "warn",
      detail: "not found (PowerShell 7+ is the documented Copilot CLI requirement)",
    };
  }
  const parsed = parsePwshVersion(r.stdout);
  if (parsed.atLeast7) {
    return { name: "PowerShell 7+ (pwsh)", ok: true, detail: `${parsed.raw} (>= 7 OK)` };
  }
  const shown = parsed.version ?? parsed.raw;
  return {
    name: "PowerShell 7+ (pwsh)",
    ok: "warn",
    detail: `${parsed.raw} (below 7 — Copilot CLI requires PowerShell 7+; ${shown})`,
  };
}

function hookCommandPathCheck(deps: PreflightDeps): PreflightCheck {
  // The hook command is resolveHookCommand() → `"<node> <cli> hook copilot"`.
  // Both the node executable and the resolved cli.js must exist on disk, or the
  // hook PreToolUse entry is inert (the Windows CommandNotFoundException case the
  // absolute-path resolution was built to avoid — ADR 0005 §5 / audit #13).
  const node = deps.execPath;
  const cli = deps.cliPath;
  const nodeOk = Boolean(node) && deps.existsSync(node);
  const cliOk = Boolean(cli) && deps.existsSync(cli as string);
  const command = resolveHookCommand();
  if (nodeOk && cliOk) {
    return { name: "Hook command path", ok: true, detail: `executable: ${command}` };
  }
  const missing: string[] = [];
  if (!nodeOk) missing.push(`node (${node || "unknown"})`);
  if (!cliOk) missing.push(`cli (${cli ?? "unknown"})`);
  return {
    name: "Hook command path",
    ok: false,
    detail: `missing ${missing.join(", ")} — hook would be inert`,
  };
}

// Resolve the Copilot hooks dir the host actually loads: `$COPILOT_HOME/hooks`
// when COPILOT_HOME is set (rtk treats it as the `.copilot` ROOT), else
// `~/.copilot/hooks`.
export function copilotHooksDir(deps: PreflightDeps): string {
  const copilotHome = deps.env.COPILOT_HOME;
  if (copilotHome) return join(copilotHome, "hooks");
  return join(deps.homedir(), ".copilot", "hooks");
}

function hooksDirCheck(deps: PreflightDeps): PreflightCheck {
  const dir = copilotHooksDir(deps);
  const present = deps.existsSync(dir);
  return {
    name: "Copilot hooks dir",
    ok: present ? true : "warn",
    detail: present ? `loaded: ${dir}` : `absent: ${dir} (run \`tk install\`)`,
  };
}

function shellToolNameCheck(deps: PreflightDeps): PreflightCheck {
  // On Windows the shell tool the host invokes is named `powershell` (not only
  // `bash`). Confirm a powershell/pwsh binary resolves on PATH so a rewritten
  // `powershell` tool call has something to run.
  const powershell = deps.which("powershell");
  if (powershell) {
    return { name: "Windows shell tool (powershell)", ok: true, detail: `resolved: ${powershell}` };
  }
  const pwsh = deps.which("pwsh");
  if (pwsh) {
    return {
      name: "Windows shell tool (powershell)",
      ok: true,
      detail: `resolved (pwsh): ${pwsh}`,
    };
  }
  return {
    name: "Windows shell tool (powershell)",
    ok: "warn",
    detail: "not found on PATH (Windows shell tool is `powershell`, not only `bash`)",
  };
}

// Gather all preflight checks. Pure given its deps — production calls it with no
// args (real probes); tests inject a deterministic matrix. Never throws: any
// single probe that misbehaves is caught upstream and reported as not-found.
export function gatherPreflight(deps: PreflightDeps = defaultPreflightDeps()): PreflightCheck[] {
  return [
    copilotVersionCheck(deps),
    pwshCheck(deps),
    hookCommandPathCheck(deps),
    hooksDirCheck(deps),
    shellToolNameCheck(deps),
  ];
}

// Format the checks for `tk status` to print. A small glyph carries the verdict
// (ok / warn / fail) so the section scans at a glance; ASCII-only for Windows
// consoles that mangle box-drawing/emoji.
function glyph(ok: PreflightVerdict): string {
  if (ok === true) return "ok";
  if (ok === "warn") return "warn";
  return "FAIL";
}

export function renderPreflight(checks: PreflightCheck[]): string[] {
  return checks.map((c) => `  [${glyph(c.ok)}] ${c.name}: ${c.detail}`);
}
