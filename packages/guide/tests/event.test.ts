import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { compile } from "../src/atlas/compile.js";
import { project, resolveEvent } from "../src/atlas/event.js";
import type { ProjectableEvent } from "../src/atlas/types.js";
import { makeFixtureCorpus } from "./fixtures/corpus.js";

const here = dirname(fileURLToPath(import.meta.url));
const GOLDEN = resolve(here, "golden/event-projection.json");
const SYM_GOLDEN = resolve(here, "golden/event-symbol-projection.json");

const corpus = makeFixtureCorpus();
const model = compile(corpus);

function resolvedEvent(): ProjectableEvent {
  const r = resolveEvent({}, corpus);
  if (!r.ok) throw new Error("fixture default event should resolve");
  return r.event;
}

describe("event projection determinism", () => {
  it("produces byte-identical JSON on repeated projection", () => {
    const a = JSON.stringify(project(resolvedEvent(), model));
    const b = JSON.stringify(project(resolvedEvent(), model));
    expect(a).toBe(b);
  });

  it("matches the committed golden transcript", () => {
    const got = JSON.stringify(project(resolvedEvent(), model), null, 2);
    const golden = readFileSync(GOLDEN, "utf8").trimEnd();
    expect(got.trimEnd()).toBe(golden);
  });

  it("matches the committed golden for a TRUE decl-anchor symbol event (D32)", () => {
    // With kernel completeness, the symbol resolves to its decl node (no file
    // downgrade) and lights its real 1-hop caller/callee neighbors.
    const r = resolveEvent({ sym: "sym:src/util/math.ts#add" }, corpus);
    if (!r.ok) throw new Error("symbol event must resolve");
    const p = project(r.event, model);
    expect(p.anchors).toEqual(["sym:src/util/math.ts#add"]);
    expect(p.downgrades).toBe(0);
    const got = JSON.stringify(p, null, 2);
    const golden = readFileSync(SYM_GOLDEN, "utf8").trimEnd();
    expect(got.trimEnd()).toBe(golden);
  });
});

describe("event resolution + rejection", () => {
  it("rejects an open-concept query as a non-event with a disclosed reason", () => {
    const r = resolveEvent({ q: "how does auth work" }, corpus);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/open-concept queries are not events/);
  });

  it("rejects a malformed diff range", () => {
    const r = resolveEvent({ diff: "zzz..123" }, corpus);
    expect(r.ok).toBe(false);
  });

  it("rejects a valid range not present in the corpus", () => {
    const r = resolveEvent({ diff: "1234567..89abcde" }, corpus);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/not present in the loaded corpus/);
  });

  it("accepts the corpus diff range and lights its anchors", () => {
    const r = resolveEvent({ diff: "aaaaaaa..bbbbbbb" }, corpus);
    expect(r.ok).toBe(true);
    if (r.ok) {
      const p = project(r.event, model);
      expect(p.litNodeIds).toContain("file:src/app.ts");
      expect(p.litNodeIds).toContain("sym:src/util/math.ts#add");
    }
  });

  it("projects a symbol event without flooding its container", () => {
    const r = resolveEvent({ sym: "sym:src/util/math.ts#add" }, corpus);
    expect(r.ok).toBe(true);
    if (r.ok) {
      const p = project(r.event, model);
      expect(p.litNodeIds).toContain("sym:src/util/math.ts#add");
      // Sibling decls of the same file are NOT lit by a symbol event.
      expect(p.litNodeIds).not.toContain("sym:src/util/math.ts#sub");
    }
  });
});
