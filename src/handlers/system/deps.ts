import { readFile } from "node:fs/promises";
import path from "node:path";

import type { CommandHandler, ParsedCommand, RawResult, TkOptions } from "../../types.js";
import { makeFilteredResult, rawText } from "../base.js";

// RTK: system/deps.rs — `deps [path]` scans a directory for dependency manifests
// (Cargo.toml, package.json, requirements.txt, pyproject.toml, go.mod) and emits a
// compact per-ecosystem summary, dropping raw JSON/TOML noise.
//
// ctx divergence from RTK (recorded in docs/align-rtk-divergences.md): the handler's
// execute/filter split means filter summarizes the single manifest captured on
// stdin/stdout rather than re-scanning every manifest in a directory, and the
// Node.js section renders dev deps as "Dev (N):" with versions (RTK uses
// "Dev Dependencies (N):" without versions) so the prod/dev shapes stay symmetric.

// RTK: truncate.rs::CAP_WARNINGS = 12; reduced(CAP_WARNINGS, 5) = 7.
const MAX_DEPS = 12;
const MAX_DEV_DEPS = 7;

// RTK order: Cargo.toml, package.json, requirements.txt, pyproject.toml, go.mod.
const MANIFESTS = ["Cargo.toml", "package.json", "requirements.txt", "pyproject.toml", "go.mod"];

function summarizePackageJson(content: string): string | undefined {
  let json: Record<string, unknown>;
  try {
    json = JSON.parse(content) as Record<string, unknown>;
  } catch {
    return undefined;
  }
  if (typeof json !== "object" || json === null || Array.isArray(json)) return undefined;
  const hasDeps =
    typeof json.dependencies === "object" ||
    typeof json.devDependencies === "object" ||
    typeof json.name === "string";
  if (!hasDeps) return undefined;

  const out: string[] = ["Node.js (package.json):"];

  if (typeof json.name === "string") {
    const version = typeof json.version === "string" ? json.version : "?";
    out.push(`  ${json.name} @ ${version}`);
  }

  const deps = json.dependencies as Record<string, unknown> | undefined;
  if (deps && typeof deps === "object") {
    const entries = Object.entries(deps);
    out.push(`  Dependencies (${entries.length}):`);
    for (const [name, version] of entries.slice(0, MAX_DEPS)) {
      out.push(`    ${name} (${typeof version === "string" ? version : "*"})`);
    }
    if (entries.length > MAX_DEPS) out.push(`    ... +${entries.length - MAX_DEPS} more`);
  }

  const devDeps = json.devDependencies as Record<string, unknown> | undefined;
  if (devDeps && typeof devDeps === "object") {
    const entries = Object.entries(devDeps);
    out.push(`  Dev (${entries.length}):`);
    for (const [name, version] of entries.slice(0, MAX_DEV_DEPS)) {
      out.push(`    ${name} (${typeof version === "string" ? version : "*"})`);
    }
    if (entries.length > MAX_DEV_DEPS) out.push(`    ... +${entries.length - MAX_DEV_DEPS} more`);
  }

  return `${out.join("\n")}\n`;
}

// RTK: deps.rs::summarize_cargo_str.
function summarizeCargo(content: string): string | undefined {
  const sectionRe = /^\[([^\]]+)\]/;
  const depRe = /^([a-zA-Z0-9_-]+)\s*=\s*(?:"([^"]+)"|.*version\s*=\s*"([^"]+)")/;
  let section = "";
  const deps: string[] = [];
  const devDeps: string[] = [];

  for (const line of content.split("\n")) {
    const sectionMatch = line.match(sectionRe);
    if (sectionMatch) {
      section = sectionMatch[1] ?? "";
      continue;
    }
    const depMatch = line.match(depRe);
    if (depMatch) {
      const name = depMatch[1] ?? "";
      const version = depMatch[2] ?? depMatch[3] ?? "*";
      const dep = `${name} (${version})`;
      if (section === "dependencies") deps.push(dep);
      else if (section === "dev-dependencies") devDeps.push(dep);
    }
  }

  if (deps.length === 0 && devDeps.length === 0) return undefined;

  const out: string[] = ["Rust (Cargo.toml):"];
  if (deps.length > 0) {
    out.push(`  Dependencies (${deps.length}):`);
    for (const dep of deps.slice(0, MAX_DEPS)) out.push(`    ${dep}`);
    if (deps.length > MAX_DEPS) out.push(`    ... +${deps.length - MAX_DEPS} more`);
  }
  if (devDeps.length > 0) {
    out.push(`  Dev (${devDeps.length}):`);
    for (const dep of devDeps.slice(0, MAX_DEV_DEPS)) out.push(`    ${dep}`);
    if (devDeps.length > MAX_DEV_DEPS) out.push(`    ... +${devDeps.length - MAX_DEV_DEPS} more`);
  }
  return `${out.join("\n")}\n`;
}

// RTK: deps.rs::summarize_gomod_str.
function summarizeGoMod(content: string): string | undefined {
  let moduleName = "";
  let goVersion = "";
  const deps: string[] = [];
  let inRequire = false;

  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (line.startsWith("module ")) moduleName = line.slice("module ".length);
    else if (line.startsWith("go ")) goVersion = line.slice("go ".length);
    else if (line === "require (") inRequire = true;
    else if (line === ")") inRequire = false;
    else if (inRequire && !line.startsWith("//")) {
      const parts = line.split(/\s+/).filter(Boolean);
      if (parts.length >= 2) deps.push(`${parts[0]} ${parts[1]}`);
    } else if (line.startsWith("require ") && !line.includes("(")) {
      deps.push(line.slice("require ".length));
    }
  }

  if (!moduleName && deps.length === 0) return undefined;

  const out: string[] = ["Go (go.mod):"];
  if (moduleName) out.push(`  ${moduleName} (go ${goVersion})`);
  if (deps.length > 0) {
    out.push(`  Dependencies (${deps.length}):`);
    for (const dep of deps.slice(0, MAX_DEPS)) out.push(`    ${dep}`);
    if (deps.length > MAX_DEPS) out.push(`    ... +${deps.length - MAX_DEPS} more`);
  }
  return `${out.join("\n")}\n`;
}

// RTK: deps.rs::summarize_requirements_str.
function summarizeRequirements(content: string): string | undefined {
  const depRe = /^([a-zA-Z0-9_-]+)([=<>!~]+.*)?$/;
  const deps: string[] = [];
  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#")) continue;
    const match = line.match(depRe);
    if (match) deps.push(`${match[1] ?? ""}${match[2] ?? ""}`);
  }
  if (deps.length === 0) return undefined;

  const out: string[] = ["Python (requirements.txt):", `  Packages (${deps.length}):`];
  for (const dep of deps.slice(0, MAX_DEPS)) out.push(`    ${dep}`);
  if (deps.length > MAX_DEPS) out.push(`    ... +${deps.length - MAX_DEPS} more`);
  return `${out.join("\n")}\n`;
}

// Detect and summarize the captured manifest content. requirements.txt is the
// loosest match so it is tried last (after the structured formats).
function summarizeDeps(content: string): string {
  if (content.trim() === "") return "No dependency files found\n";
  const trimmedStart = content.replace(/^\s+/, "");
  if (trimmedStart.startsWith("{")) {
    const node = summarizePackageJson(content);
    if (node) return node;
  }
  if (/^\s*\[(?:dev-)?dependencies\]/m.test(content)) {
    const cargo = summarizeCargo(content);
    if (cargo) return cargo;
  }
  if (/^\s*module\s+\S/m.test(content)) {
    const go = summarizeGoMod(content);
    if (go) return go;
  }
  const requirements = summarizeRequirements(content);
  if (requirements) return requirements;
  return content;
}

async function readPrimaryManifest(options: TkOptions): Promise<string> {
  for (const manifest of MANIFESTS) {
    try {
      return await readFile(path.resolve(options.cwd, manifest), "utf8");
    } catch {
      // try next manifest
    }
  }
  return "";
}

export const depsHandler: CommandHandler = {
  name: "deps",
  traits: { structural: true },
  matches(command: ParsedCommand) {
    return command.program === "deps";
  },
  async execute(command, options: TkOptions): Promise<RawResult> {
    const pathArg = command.args.find((arg) => !arg.startsWith("-"));
    let content = "";
    if (pathArg) {
      try {
        content = await readFile(path.resolve(options.cwd, pathArg), "utf8");
      } catch {
        content = "";
      }
    }
    if (content === "") content = await readPrimaryManifest(options);
    return {
      command: command.displayCommand,
      stdout: content,
      stderr: "",
      exitCode: 0,
      durationMs: 0,
    };
  },
  async filter(raw, _command, options) {
    return makeFilteredResult(this, raw, summarizeDeps(rawText(raw)), options);
  },
};
