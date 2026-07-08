#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

const repo = execFileSync("git", ["rev-parse", "--show-toplevel"], {
  encoding: "utf8",
}).trim();

const textExtensions = new Set([
  ".cjs",
  ".css",
  ".html",
  ".json",
  ".jsonc",
  ".md",
  ".mjs",
  ".ps1",
  ".py",
  ".sh",
  ".ts",
  ".txt",
  ".yaml",
  ".yml",
]);

const exactFiles = new Set(["package.json", "README.md", "plans/README.md", "tsdown.config.mjs"]);
const allowedRoots = ["src/", "tests/", "scripts/", ".github/", "docs/"];
const skippedPrefixes = [
  "docs/archive/",
  "docs/reports/",
  "docs/adr/0015-contexa-ctx-hard-rename.md",
  "plans/014-contexa-ctx-rename.md",
];

const replacements = [
  [/\bensureTokenKillerHome\b/g, "ensureContexaHome"],
  [/\btokenKillerHome\b/g, "contexaHome"],
  [/\btokenKillerHomeDir\b/g, "contexaHomeDir"],
  [/\bREMOTE_TK_HOME\b/g, "REMOTE_CONTEXA_HOME"],
  [/\bTOKEN_KILLER_HOME\b/g, "CONTEXA_HOME"],
  [/\bTK_SHIM_DIR\b/g, "CTX_SHIM_DIR"],
  [/__TK_/g, "__CTX_"],
  [/\bTK_/g, "CTX_"],
  [/\.token-killer/g, ".contexa"],
  [/\bToken Killer\b/g, "Contexa"],
  [/\btoken-killer\b/g, "contexa"],
  [/\bTK\.md\b/g, "CTX.md"],
  [/\bTK\b/g, "CTX"],
  [/\btk\b/g, "ctx"],
];

const renames = new Map([
  ["scripts/benchmark-sessions/setup-tk.sh", "scripts/benchmark-sessions/setup-ctx.sh"],
  ["scripts/tk-baseline-probe.ps1", "scripts/ctx-baseline-probe.ps1"],
]);

function isTarget(file) {
  if (skippedPrefixes.some((prefix) => file.startsWith(prefix))) return false;
  if (exactFiles.has(file)) return true;
  if (!allowedRoots.some((root) => file.startsWith(root))) return false;
  return textExtensions.has(path.extname(file));
}

const files = execFileSync("git", ["ls-files"], { cwd: repo, encoding: "utf8" })
  .split("\n")
  .filter(Boolean)
  .filter(isTarget);

for (const file of files) {
  const abs = path.join(repo, file);
  if (!existsSync(abs)) continue;
  const before = readFileSync(abs, "utf8");
  let after = before;
  for (const [pattern, replacement] of replacements) {
    after = after.replace(pattern, replacement);
  }
  if (after !== before) writeFileSync(abs, after);
}

const plansReadmePath = path.join(repo, "plans/README.md");
let plansReadme = readFileSync(plansReadmePath, "utf8");
plansReadme = plansReadme.replace(
  /\| 014\s+\| Rename Contexa \(`ctx`\) to Contexa \(`ctx`\) from the 0\.3\.2 baseline \| P1 \| L \| PR #57 green \| — \| TODO \|/,
  "| 014  | Rename Token Killer (`tk`) to Contexa (`ctx`) from the 0.3.2 baseline | P1 | L | PR #57 green | — | DONE |",
);
plansReadme = plansReadme.replace(
  /\| 014\s+\| Rename Token Killer \(`tk`\) to Contexa \(`ctx`\) from the 0\.3\.2 baseline \| P1 \| L \| PR #57 green \| — \| TODO \|/,
  "| 014  | Rename Token Killer (`tk`) to Contexa (`ctx`) from the 0.3.2 baseline | P1 | L | PR #57 green | — | DONE |",
);
writeFileSync(plansReadmePath, plansReadme);

const identityPath = path.join(repo, "src/core/identity.ts");
writeFileSync(
  identityPath,
  [
    'export const PRODUCT_NAME = "Contexa";',
    'export const PRIMARY_BIN = "ctx";',
    'export const HOME_ENV = "CONTEXA_HOME";',
    'export const DEFAULT_HOME_DIR = ".contexa";',
    'export const SHIM_ENV = "CTX_SHIM_DIR";',
    "",
  ].join("\n"),
);

const dataDirPath = path.join(repo, "src/core/dataDir.ts");
let dataDir = readFileSync(dataDirPath, "utf8");
if (!dataDir.includes('import { DEFAULT_HOME_DIR, HOME_ENV } from "./identity.js";')) {
  dataDir = dataDir.replace(
    'import path from "node:path";\n',
    'import path from "node:path";\nimport { DEFAULT_HOME_DIR, HOME_ENV } from "./identity.js";\n',
  );
}
dataDir = dataDir.replace(
  /export function contexaHome\(\): string \{\n\s*if \(process\.env\.CONTEXA_HOME\) \{\n\s*return path\.resolve\(process\.env\.CONTEXA_HOME\);\n\s*\}\n\s*return path\.join\(os\.homedir\(\), "\.contexa"\);\n\}/,
  [
    "export function contexaHome(): string {",
    "  if (process.env[HOME_ENV]) {",
    "    return path.resolve(process.env[HOME_ENV]);",
    "  }",
    "  return path.join(os.homedir(), DEFAULT_HOME_DIR);",
    "}",
  ].join("\n"),
);
writeFileSync(dataDirPath, dataDir);

for (const [from, to] of renames) {
  const fromAbs = path.join(repo, from);
  const toAbs = path.join(repo, to);
  if (from !== to && existsSync(fromAbs) && !existsSync(toAbs)) {
    renameSync(fromAbs, toAbs);
  }
}
