import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(here, "../src");

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx)$/.test(full)) out.push(full);
  }
  return out;
}

/** Strip comments so the gate only inspects UI copy, not annotations. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

/** Extract string-literal bodies + JSX text runs. */
function extractCopy(src: string): string {
  const code = stripComments(src);
  const pieces: string[] = [];
  const stringLiteral = /'([^'\\]|\\.)*'|"([^"\\]|\\.)*"|`([^`\\]|\\.)*`/g;
  for (const m of code.matchAll(stringLiteral)) pieces.push(m[0]);
  const jsxText = />([^<>{}]+)</g;
  for (const m of code.matchAll(jsxText)) pieces.push(m[1]);
  return pieces.join("\n");
}

const BANNED = /\b(impact|affected|blast\s+radius|risk|breaks)\b/i;

describe("D24 naming gate", () => {
  const uiFiles = [...walk(join(SRC, "ui")), ...walk(join(SRC, "variants"))];

  it("scans a non-trivial number of UI files", () => {
    expect(uiFiles.length).toBeGreaterThan(3);
  });

  it("has no banned wording in UI strings or JSX text", () => {
    const offenders: string[] = [];
    for (const f of uiFiles) {
      const copy = extractCopy(readFileSync(f, "utf8"));
      const m = copy.match(BANNED);
      if (m) offenders.push(`${f}: "${m[0]}"`);
    }
    expect(offenders).toEqual([]);
  });

  it("labels the diff surface Change Trace", () => {
    const rail = readFileSync(join(SRC, "ui/EvidenceRail.tsx"), "utf8");
    expect(rail).toContain("Change Trace");
  });
});

describe("D12 renderer seam", () => {
  it("confines @xyflow/react imports to ReactFlowRenderer.tsx", () => {
    const importRe = /(?:from|import)\s*\(?\s*["']@xyflow\/react["']/;
    const offenders: string[] = [];
    for (const f of walk(SRC)) {
      if (f.endsWith("ReactFlowRenderer.tsx")) continue;
      if (importRe.test(readFileSync(f, "utf8"))) offenders.push(f);
    }
    expect(offenders).toEqual([]);
  });
});
