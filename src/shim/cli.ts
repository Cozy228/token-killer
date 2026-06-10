import { existsSync } from "node:fs";
import { delimiter } from "node:path";

import { VERSION } from "../version.js";
import {
  defaultRcPath,
  patchRc,
  patchVscodeSettings,
  unpatchRc,
  unpatchVscodeSettings,
  vscodeSettingsPath,
  vscodeUserDir,
} from "./hostConfig.js";
import { installWrappers, readManifest, removeShimDir, shimDir } from "./install.js";
import { runInterceptionProbe, type ProbeResult } from "./probe.js";
import { shimmablePrograms } from "./programs.js";

function out(line: string): void {
  process.stdout.write(`${line}\n`);
}

function err(line: string): void {
  process.stderr.write(`${line}\n`);
}

export type InstallShimOptions = {
  // Which host configs to patch. `tk shim install` patches both available
  // surfaces; `tk init` patches the one for the detected host.
  rc?: boolean;
  vscode?: boolean;
  quiet?: boolean;
};

// Install the shim tier: write wrappers + manifest, prepend the shim dir on the
// requested host surfaces, then run the interception probe and return its
// result so callers (init's ladder) can fall back when the shim is dead. Fail
// toward not breaking the user: a settings.json we cannot parse is reported, not
// overwritten.
export function installShim(opts: InstallShimOptions = {}): ProbeResult {
  const { rc = true, vscode = true, quiet = false } = opts;
  const log = quiet ? () => {} : out;
  const dir = shimDir();
  const requested = shimmablePrograms();
  // installWrappers only writes wrappers for programs whose binary is present, so
  // the manifest — not the requested candidate list — is the source of truth for
  // what was actually installed (D2: never claim cat/ls/wc/env on a box without them).
  const manifest = installWrappers({
    programs: requested,
    installedAt: Date.now(),
    version: VERSION,
  });
  const installed = manifest.programs;
  log(`token-killer shim installed: ${dir}`);
  log(
    `  wrappers: ${installed.length} (${installed.slice(0, 6).join(", ")}${installed.length > 6 ? ", …" : ""})`,
  );
  // Honest disclosure, not a silent drop: list the tools tk did NOT wrap because
  // no binary was found on PATH (on stock Windows `cat`/`ls`/… are shell aliases).
  const skipped = requested.filter((program) => !installed.includes(program));
  if (skipped.length > 0) {
    log(`  skipped ${skipped.length} not on PATH: ${skipped.join(", ")}`);
  }

  if (rc) {
    const rcPath = defaultRcPath();
    try {
      patchRc(rcPath, dir);
      log(`  shell RC patched: ${rcPath}`);
    } catch (error) {
      err(`  shell RC patch failed (${rcPath}): ${(error as Error).message}`);
    }
  }

  if (vscode && existsSync(vscodeUserDir())) {
    const settings = vscodeSettingsPath();
    try {
      patchVscodeSettings(settings, dir);
      log(`  VS Code settings patched: ${settings}`);
    } catch {
      err(`  VS Code settings.json could not be parsed (comments?); patch it manually:`);
      err(
        `    "terminal.integrated.env.*": { "TK_SHIM_DIR": "${dir}", "PATH": "${dir}${delimiter}\${env:PATH}" }`,
      );
    }
  }

  const probe = runInterceptionProbe(dir);
  log(
    `  interception probe: ${probe.pass ? "PASS" : "FAIL"}${probe.resolved ? ` (${probe.resolved})` : ""}`,
  );
  return probe;
}

function install(): number {
  installShim({ rc: true, vscode: true });
  out(`Restart your terminal (or VS Code) for PATH changes to take effect.`);
  return 0;
}

function uninstall(): number {
  const dir = shimDir();
  removeShimDir();
  unpatchRc(defaultRcPath());
  const settings = vscodeSettingsPath();
  if (existsSync(settings)) {
    try {
      unpatchVscodeSettings(settings, dir);
    } catch {
      err(
        `  VS Code settings.json could not be parsed; remove the TK_SHIM_DIR/PATH keys manually.`,
      );
    }
  }
  out(`token-killer shim removed: ${dir}`);
  return 0;
}

function status(): number {
  const dir = shimDir();
  const manifest = readManifest();
  const pathEntries = (process.env.PATH ?? "").split(delimiter);
  const index = pathEntries.indexOf(dir);

  out(`token-killer shim status`);
  out(`  dir:            ${dir}${existsSync(dir) ? "" : " (not installed)"}`);
  out(
    `  manifest:       ${manifest ? `v${manifest.version} schema ${manifest.schema}, ${manifest.programs.length} programs` : "absent"}`,
  );
  out(`  on PATH:        ${index >= 0 ? `yes (position ${index})` : "no"}`);
  out(`  first on PATH:  ${index === 0 ? "yes" : "no"}`);

  const probe = runInterceptionProbe(dir);
  out(
    `  probe:          ${probe.pass ? "PASS" : "FAIL"}${probe.resolved ? ` → ${probe.resolved}` : ""}`,
  );
  return 0;
}

export function runShim(argv: string[]): number {
  const sub = argv[0];
  switch (sub) {
    case "install":
      return install();
    case "uninstall":
      return uninstall();
    case "status":
    case undefined:
      return status();
    default:
      err(`tk shim: unknown subcommand '${sub}' (expected install | uninstall | status)`);
      return 1;
  }
}
