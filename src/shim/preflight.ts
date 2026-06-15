import { spawnSync } from "node:child_process";
import { existsSync as fsExistsSync } from "node:fs";
import { homedir as osHomedir } from "node:os";
import { delimiter, join } from "node:path";

import { decide, toHostOutput } from "../hook/copilot.js";
import { readInstalledCopilotHookCommands } from "../hook/install.js";
import { normalizeStdin } from "../hook/normalize.js";
import type { Host } from "./detect.js";

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
  // EVERY command baked into the INSTALLED tk-managed Copilot hook config (empty when
  // none is installed). hookCommandPathCheck validates the paths each embeds — the ones
  // the host actually executes, including the native powershell/bash entries — not the
  // current process (issue #23 §1).
  installedHookCommands: () => string[];
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
//
// The wire shape is the REAL native Copilot CLI 1.0.62 payload (issue #23 §2): camelCase
// `toolName`/`toolArgs` (a JSON STRING) and NO event-name field. That eventless shape is
// exactly what the native `preToolUse` entry sends — earlier it normalized to `unknown`
// and silently never rewrote (the bcc9181 bug). Synthesizing `eventName:"preToolUse"`
// here would bypass the shape-inference path the host actually exercises, so the probe
// must NOT add it. `git status` is the probe command: off Windows the presence gate is
// always open, on Windows `git` is present on any dev box (the same basis the
// protocol-matrix suite relies on). Total; any internal error degrades to `rewrote: false`.
export function defaultProtocolProbe(): ProtocolProbeResult {
  try {
    const wire = JSON.stringify({
      toolName: "powershell",
      toolArgs: JSON.stringify({ command: "git status", description: "Run git status" }),
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
    installedHookCommands: () => readInstalledCopilotHookCommands({ project: false }),
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

// Best-effort version string for the SELECTED host's own CLI (issue #26). `tk install`
// records the host version it chose — NOT always Copilot's. Each host reports its
// version through a different command; an absent binary, a spawn failure, or a host with
// no CLI version probe (unknown) all degrade to `undefined` (honest "not recorded"),
// never the wrong tool's version. Install-time only (one shot), so the spawn cost is off
// the hot path. Total; never throws.
export function probeHostVersion(host: Host, run: Runner = defaultRun): string | undefined {
  const spec: Partial<Record<Host, { cmd: string; args: string[] }>> = {
    "copilot-cli": { cmd: "copilot", args: ["--version"] },
    "claude-code": { cmd: "claude", args: ["--version"] },
    vscode: { cmd: "code", args: ["--version"] },
  };
  const s = spec[host];
  if (!s) return undefined;
  const r = run(s.cmd, s.args);
  if (!r.ok || r.stdout === "") return undefined;
  const line = r.stdout.split(/\r?\n/).find((l) => l.trim() !== "");
  return line?.trim() || undefined;
}

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

// Split a baked hook command into its two leading path tokens (node + cli). Handles
// BOTH baked forms (issue #20):
//   - bash / cmd / VS Code: `"<node>" "<cli>" hook <sub>` (double-quoted paths)
//   - PowerShell:           `& '<node>' '<cli>' hook <sub>` (call operator + single quotes)
// So it recognizes single AND double quotes, and drops a leading `&` call-operator token.
// Total; never throws. A missing token comes back undefined (an empty/garbled command).
export function parseHookCommandPaths(command: string): { node?: string; cli?: string } {
  const tokens: string[] = [];
  let buf = "";
  let quote: '"' | "'" | null = null;
  let started = false;
  for (const c of command) {
    if (quote) {
      // Inside a quote: only the matching quote char closes it.
      if (c === quote) {
        quote = null;
      } else {
        buf += c;
      }
      started = true;
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      started = true;
      continue;
    }
    if (c === " " || c === "\t") {
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
  // Drop a leading PowerShell call operator so node/cli are the first real tokens.
  if (tokens[0] === "&") tokens.shift();
  return { node: tokens[0], cli: tokens[1] };
}

function hookCommandPathCheck(deps: PreflightDeps): PreflightCheck {
  // Validate EVERY command BAKED INTO THE INSTALLED tk-managed hook config — the node +
  // cli paths the host will actually execute — NOT the current `tk status` process's own
  // paths (which trivially exist and prove nothing). The dual-schema config bakes the
  // command in three host-executed places (PreToolUse.command + the native
  // powershell/bash entries); validating only one missed a stale native path (issue #23
  // §1). A stale baked path makes the hook inert with a Windows CommandNotFoundException,
  // and is exactly the failure this check must surface (ADR 0005 §5 / audit #13).
  const commands = deps.installedHookCommands();
  if (commands.length === 0) {
    // No tk-managed hook installed — there is no baked command to validate. Honest
    // "not applicable" rather than a false-green from the running process's paths.
    return {
      name: "Hook command path",
      ok: "warn",
      detail: "no tk-managed hook config installed (run `tk install`)",
    };
  }
  // Validate each distinct installed command; a single stale path anywhere makes that
  // wire inert, so any failure fails the whole check (it names which command is stale).
  const problems: string[] = [];
  for (const command of commands) {
    const { node, cli } = parseHookCommandPaths(command);
    const nodeOk = Boolean(node) && deps.existsSync(node as string);
    const cliOk = Boolean(cli) && deps.existsSync(cli as string);
    if (nodeOk && cliOk) continue;
    const missing: string[] = [];
    if (!nodeOk) missing.push(`node (${node || "unparsed"})`);
    if (!cliOk) missing.push(`cli (${cli ?? "unparsed"})`);
    problems.push(`${missing.join(", ")} in \`${command}\``);
  }
  if (problems.length === 0) {
    const detail =
      commands.length === 1
        ? `executable: ${commands[0]}`
        : `all ${commands.length} installed command paths executable (${commands.join(" | ")})`;
    return { name: "Hook command path", ok: true, detail };
  }
  return {
    name: "Hook command path",
    ok: false,
    detail: `missing ${problems.join("; ")} — baked hook path is stale, hook would be inert; re-run \`tk install\``,
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
  // existsSync proves the dir is PRESENT — it does NOT prove the host LOADED the config
  // from it (the host only reads the dir on startup, and that is not introspectable from
  // the CLI). Claiming "loaded" here overstated the signal (issue #23 §3); report the
  // honest "present" instead, and point at the protocol self-probe as the rewrite proof.
  const dir = copilotHooksDir(deps);
  const present = deps.existsSync(dir);
  return {
    name: "Copilot hooks dir",
    ok: present ? true : "warn",
    detail: present
      ? `present: ${dir} (host load not confirmable from CLI — see Hook protocol self-probe)`
      : `absent: ${dir} (run \`tk install\`)`,
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
