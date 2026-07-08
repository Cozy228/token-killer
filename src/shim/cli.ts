import { existsSync } from "node:fs";
import { delimiter } from "node:path";

import { emitSupportHintOnce } from "../hook/debug.js";
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
import {
  installWrappers,
  readManifest,
  realBinaryPresent,
  removeShimDir,
  resolveRealBinaryPath,
  shimDir,
} from "./install.js";
import { runInterceptionProbe, type ProbeResult } from "./probe.js";
import { shimmablePrograms } from "./programs.js";

function out(line: string): void {
  process.stdout.write(`${line}\n`);
}

function err(line: string): void {
  process.stderr.write(`${line}\n`);
}

export type InstallShimOptions = {
  // Which host configs to patch. `ctx shim install` patches both available
  // surfaces; `ctx install` patches the one for the detected host.
  rc?: boolean;
  vscode?: boolean;
  quiet?: boolean;
  // Preview only — report what would be written/patched, touch nothing.
  dryRun?: boolean;
};

// Install the shim tier: write wrappers + manifest, prepend the shim dir on the
// requested host surfaces, then run the interception probe and return its
// result so callers (init's ladder) can fall back when the shim is dead. Fail
// toward not breaking the user: a settings.json we cannot parse is reported, not
// overwritten.
export function installShim(opts: InstallShimOptions = {}): ProbeResult {
  const { rc = true, vscode = true, quiet = false, dryRun = false } = opts;
  const log = quiet ? () => {} : out;
  const dir = shimDir();
  // Partition candidates into present (wrapped) vs absent (skipped) up front, so a
  // --dry-run preview and the real install report the exact same set (D2: never
  // claim cat/ls/wc/env on a box without them).
  const requested = shimmablePrograms();
  const installed = requested.filter((program) => realBinaryPresent(program, dir));
  const skipped = requested.filter((program) => !installed.includes(program));
  const wrapperList = `${installed.length} (${installed.slice(0, 6).join(", ")}${installed.length > 6 ? ", …" : ""})`;

  if (dryRun) {
    // --dry-run: report exactly what a real install would do, but write nothing.
    log(`[dry-run] would install shim: ${dir}`);
    log(`  [dry-run] wrappers: ${wrapperList}`);
    if (skipped.length > 0) {
      log(`  [dry-run] skip ${skipped.length} not on PATH: ${skipped.join(", ")}`);
    }
    if (rc) log(`  [dry-run] would patch shell RC: ${defaultRcPath()}`);
    if (vscode && existsSync(vscodeUserDir())) {
      log(`  [dry-run] would patch VS Code settings: ${vscodeSettingsPath()}`);
    }
    // Nothing was written, so there is nothing to probe. The return is ignored on
    // the dry-run path (init handles its own preview); this is a valid placeholder.
    return { pass: false, resolved: null, program: "git" };
  }

  installWrappers({ programs: installed, installedAt: Date.now(), version: VERSION });
  log(`contexa shim installed: ${dir}`);
  log(`  wrappers: ${wrapperList}`);
  // Honest disclosure, not a silent drop: list the tools ctx did NOT wrap because
  // no binary was found on PATH (on stock Windows `cat`/`ls`/… are shell aliases).
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
      emitSupportHintOnce();
    }
  }

  if (vscode && existsSync(vscodeUserDir())) {
    const settings = vscodeSettingsPath();
    try {
      const res = patchVscodeSettings(settings, dir);
      log(`  VS Code settings patched: ${settings}`);
      if (res.reformatted && res.backupPath) {
        log(`    (had comments — reformatted to strict JSON; original saved to ${res.backupPath})`);
      }
    } catch {
      err(`  VS Code settings.json is not valid JSON; patch it manually:`);
      err(
        `    "terminal.integrated.env.*": { "CTX_SHIM_DIR": "${dir}", "CTX_COMPRESS_TTY": "1", "PATH": "${dir}${delimiter}\${env:PATH}" }`,
      );
      emitSupportHintOnce();
    }
  }

  const probe = runInterceptionProbe(dir);
  log(
    `  interception probe: ${probe.pass ? "PASS" : "FAIL"}${probe.resolved ? ` (${probe.resolved})` : ""}`,
  );
  return probe;
}

function install(dryRun: boolean): number {
  installShim({ rc: true, vscode: true, dryRun });
  if (!dryRun) out(`Restart your terminal (or VS Code) for PATH changes to take effect.`);
  return 0;
}

function uninstall(dryRun: boolean): number {
  const dir = shimDir();
  if (dryRun) {
    out(`[dry-run] would remove shim: ${dir}${existsSync(dir) ? "" : " (absent)"}`);
    out(`[dry-run] would unpatch shell RC: ${defaultRcPath()}`);
    const settingsPath = vscodeSettingsPath();
    if (existsSync(settingsPath)) out(`[dry-run] would unpatch VS Code settings: ${settingsPath}`);
    return 0;
  }
  removeShimDir();
  unpatchRc(defaultRcPath());
  const settings = vscodeSettingsPath();
  if (existsSync(settings)) {
    try {
      const res = unpatchVscodeSettings(settings, dir);
      if (res.reformatted && res.backupPath) {
        out(
          `  VS Code settings had comments — reformatted to strict JSON; original saved to ${res.backupPath}`,
        );
      }
    } catch {
      err(
        `  VS Code settings.json could not be parsed; remove the CTX_SHIM_DIR/PATH keys manually.`,
      );
    }
  }
  out(`contexa shim removed: ${dir}`);
  return 0;
}

type ShimStatusOptions = {
  probe?: ProbeResult;
};

function status(opts: ShimStatusOptions = {}): number {
  const dir = shimDir();
  const manifest = readManifest();
  const pathEntries = (process.env.PATH ?? "").split(delimiter);
  const index = pathEntries.indexOf(dir);

  out(`contexa shim status`);
  out(`  dir:            ${dir}${existsSync(dir) ? "" : " (not installed)"}`);
  out(
    `  manifest:       ${manifest ? `v${manifest.version} schema ${manifest.schema}, ${manifest.programs.length} programs` : "absent"}`,
  );
  out(`  on PATH:        ${index >= 0 ? `yes (position ${index})` : "no"}`);
  out(`  first on PATH:  ${index === 0 ? "yes" : "no"}`);

  // Baked real-binary paths (2.1). Each was resolved once at install so the runtime
  // skips the per-command PATH walk. Re-validate here (status is not a hot path):
  //  - stale    = the baked binary moved/was uninstalled → runtime falls back to a walk
  //  - shadowed = PATH was reordered so a DIFFERENT binary now wins; ctx still runs the
  //               baked one, so re-run `ctx install` to re-bake against the new PATH.
  const baked = Object.entries(manifest?.resolvedPaths ?? {});
  if (baked.length > 0) {
    let stale = 0;
    let shadowed = 0;
    for (const [program, bakedPath] of baked) {
      if (!existsSync(bakedPath)) {
        stale += 1;
        continue;
      }
      const current = resolveRealBinaryPath(program, dir);
      if (current && current !== bakedPath) shadowed += 1;
    }
    const flags: string[] = [];
    if (stale > 0) flags.push(`${stale} stale (binary moved)`);
    if (shadowed > 0) flags.push(`${shadowed} shadowed by PATH reorder — re-run \`ctx install\``);
    out(
      `  baked paths:    ${baked.length}${flags.length > 0 ? ` (${flags.join("; ")})` : " all valid"}`,
    );
  }

  const probe = opts.probe ?? runInterceptionProbe(dir);
  out(
    `  probe:          ${probe.pass ? "PASS" : "FAIL"}${probe.resolved ? ` → ${probe.resolved}` : ""}`,
  );
  return 0;
}

export function runShim(argv: string[], opts: { statusProbe?: ProbeResult } = {}): number {
  const dryRun = argv.includes("--dry-run");
  // The subcommand is the first non-flag token, so `--dry-run` can appear in any
  // position (e.g. `ctx shim install --dry-run`).
  const sub = argv.find((token) => !token.startsWith("-"));
  switch (sub) {
    case "install":
      return install(dryRun);
    case "uninstall":
      return uninstall(dryRun);
    case "status":
    case undefined:
      return status({ probe: opts.statusProbe });
    default:
      err(`ctx shim: unknown subcommand '${sub}' (expected install | uninstall | status)`);
      return 1;
  }
}
