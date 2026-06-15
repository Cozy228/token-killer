import { spawnSync } from "node:child_process";
import { existsSync as fsExistsSync } from "node:fs";
import { homedir as osHomedir } from "node:os";
import { delimiter, join } from "node:path";

import { decide, toHostOutput } from "../hook/copilot.js";
import { readInstalledCopilotHookCommand } from "../hook/install.js";
import { normalizeStdin } from "../hook/normalize.js";

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
  // The command baked into the INSTALLED tk-managed Copilot hook config (or null when
  // none is installed). hookCommandPathCheck validates the paths THIS embeds — the ones
  // the host actually executes — not the current process (issue #23).
  installedHookCommand: () => string | null;
  // Runs tk's real hook pipeline on a synthetic powershell event and reports whether it
  // rewrote (issue #23 §2). Injected so the matrix tests are deterministic; production
  // wires `defaultProtocolProbe` (the real in-process pipeline).
  protocolProbe: () => ProtocolProbeResult;
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

// The result of running tk's REAL hook pipeline on a synthetic event (issue #23 §2).
export type ProtocolProbeResult = { rewrote: boolean; got: string | null };

// Drive a synthetic Copilot-CLI `powershell` host event through tk's actual protocol
// pipeline (normalizeStdin → decide → toHostOutput) and report whether it still emits
// a rewrite. This proves the WIRE PATH works — dialect detection, the rewrite decision,
// and the host-output shaping — not merely that a hooks dir exists or a shell resolves.
// `git status` is the probe command: off Windows the presence gate is always open, on
// Windows `git` is present on any dev box (the same basis the protocol-matrix suite
// relies on). Total; any internal error degrades to `rewrote: false`.
export function defaultProtocolProbe(): ProtocolProbeResult {
  try {
    const wire = JSON.stringify({
      eventName: "preToolUse",
      toolName: "powershell",
      toolArgs: JSON.stringify({ command: "git status" }),
    });
    const ev = normalizeStdin(wire);
    const out = toHostOutput(ev, decide(ev)) as { modifiedArgs?: { command?: string } } | null;
    const got = out?.modifiedArgs?.command ?? null;
    return { rewrote: got === "tk git status", got };
  } catch {
    return { rewrote: false, got: null };
  }
}

export function defaultPreflightDeps(): PreflightDeps {
  return {
    run: defaultRun,
    which: (program) => defaultWhich(program),
    existsSync: fsExistsSync,
    env: process.env,
    platform: process.platform,
    installedHookCommand: () => readInstalledCopilotHookCommand({ project: false }),
    protocolProbe: defaultProtocolProbe,
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

// Split a baked hook command (`"<node>" "<cli>" hook <sub>`) into its two leading
// path tokens, honoring the double-quote wrapping `resolveHookCommand`/`quoteArg`
// apply to paths containing spaces (e.g. `"C:\Program Files\nodejs\node.exe"`). Only
// double quotes are recognized — that is the only quoting quoteArg emits. Total; never
// throws. A missing token comes back undefined (an empty/garbled command).
export function parseHookCommandPaths(command: string): { node?: string; cli?: string } {
  const tokens: string[] = [];
  let buf = "";
  let inQuote = false;
  let started = false;
  for (const c of command) {
    if (c === '"') {
      inQuote = !inQuote;
      started = true;
      continue;
    }
    if (!inQuote && (c === " " || c === "\t")) {
      if (started) {
        tokens.push(buf);
        buf = "";
        started = false;
      }
      continue;
    }
    buf += c;
    started = true;
  }
  if (started) tokens.push(buf);
  return { node: tokens[0], cli: tokens[1] };
}

function hookCommandPathCheck(deps: PreflightDeps): PreflightCheck {
  // Validate the command BAKED INTO THE INSTALLED tk-managed hook config — the node +
  // cli paths the host will actually execute — NOT the current `tk status` process's
  // own paths (which trivially exist and prove nothing). A stale baked path makes the
  // hook inert with a Windows CommandNotFoundException, and is exactly the failure this
  // check must surface (issue #23 / ADR 0005 §5 / audit #13).
  const command = deps.installedHookCommand();
  if (command === null) {
    // No tk-managed hook installed — there is no baked command to validate. Honest
    // "not applicable" rather than a false-green from the running process's paths.
    return {
      name: "Hook command path",
      ok: "warn",
      detail: "no tk-managed hook config installed (run `tk install`)",
    };
  }
  const { node, cli } = parseHookCommandPaths(command);
  const nodeOk = Boolean(node) && deps.existsSync(node as string);
  const cliOk = Boolean(cli) && deps.existsSync(cli as string);
  if (nodeOk && cliOk) {
    return { name: "Hook command path", ok: true, detail: `executable: ${command}` };
  }
  const missing: string[] = [];
  if (!nodeOk) missing.push(`node (${node || "unparsed"})`);
  if (!cliOk) missing.push(`cli (${cli ?? "unparsed"})`);
  return {
    name: "Hook command path",
    ok: false,
    detail: `missing ${missing.join(", ")} — baked hook path is stale, hook would be inert; re-run \`tk install\``,
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

// Protocol self-probe (issue #23 §2). The dir/shell checks above prove the hook is
// WIRED and a shell exists; this proves the wire PATH still PRODUCES a rewrite by
// driving a synthetic powershell event through tk's real normalize→decide→toHostOutput
// pipeline. It catches a "looks installed but silently stopped rewriting" regression
// that existence checks structurally cannot. A non-rewrite is a `warn` (the env may
// just lack git), never a hard FAIL — the hook itself is still fail-open.
function hookProtocolSelfProbe(deps: PreflightDeps): PreflightCheck {
  const name = "Hook protocol self-probe";
  const { rewrote, got } = deps.protocolProbe();
  if (rewrote) {
    return {
      name,
      ok: true,
      detail: "powershell event rewrites end-to-end: `git status` -> `tk git status`",
    };
  }
  return {
    name,
    ok: "warn",
    detail: `powershell event did not rewrite (got: ${got ?? "nothing"}) — check the rewrite pipeline / that git is on PATH`,
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
    hookProtocolSelfProbe(deps),
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
