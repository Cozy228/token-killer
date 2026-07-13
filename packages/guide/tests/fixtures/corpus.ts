// Handcrafted CorpusInput fixture (~15 files / 3 folders / 2 non-active
// statuses + a mini diff event). The REAL store is never read in tests.

import type { CorpusDecl, CorpusFile, CorpusInput } from "../../src/atlas/types.js";

function decls(path: string, names: Array<[string, string]>): CorpusDecl[] {
  return names.map(([name, kind], i) => ({ id: `sym:${path}#${name}`, name, kind, order: i }));
}

function file(
  path: string,
  status: CorpusFile["status"],
  names: Array<[string, string]>,
  recency: number | null = null,
): CorpusFile {
  const d = decls(path, names);
  return { path, declCount: d.length, decls: d, status, recency };
}

// 40 synthetic decls to exercise the >34 overflow marker.
function manyDecls(n: number): Array<[string, string]> {
  return Array.from({ length: n }, (_, i) => [`fn${i}`, "function"] as [string, string]);
}

export function makeFixtureCorpus(): CorpusInput {
  const files: CorpusFile[] = [
    file("README.md", "active", []),
    file("LICENSE", "active", []),
    file("src/index.ts", "active", [
      ["main", "function"],
      ["boot", "function"],
      ["A", "class"],
      ["B", "class"],
      ["VERSION", "const"],
    ]),
    file("src/app.ts", "active", [
      ["run", "function"],
      ["stop", "function"],
      ["App", "class"],
    ]),
    file("src/config.ts", "needs-review", [
      ["load", "function"],
      ["DEFAULTS", "const"],
    ]),
    file("src/router.ts", "active", [
      ["route", "function"],
      ["match", "function"],
      ["Router", "class"],
      ["Route", "class"],
      ["notFound", "function"],
      ["ROUTES", "const"],
    ]),
    file("src/big.ts", "active", manyDecls(40)),
    file("src/util/math.ts", "active", [
      ["add", "function"],
      ["sub", "function"],
      ["mul", "function"],
      ["div", "function"],
      ["clamp", "function"],
      ["lerp", "function"],
      ["Vec", "class"],
      ["PI", "const"],
    ]),
    file("src/util/str.ts", "conflict", [
      ["trim", "function"],
      ["pad", "function"],
      ["split", "function"],
      ["join", "function"],
    ]),
    file("src/util/id.ts", "active", [["uuid", "function"]]),
    file("src/util/time.ts", "active", [
      ["now", "function"],
      ["sleep", "function"],
      ["Clock", "class"],
    ]),
    file("src/util/deep.ts", "active", [
      ["walk", "function"],
      ["freeze", "function"],
    ]),
    file("docs/guide.md", "active", []),
    file("docs/api.md", "active", []),
    file("docs/faq.md", "active", []),
  ];

  const corpus: CorpusInput = {
    schemaVersion: 1,
    repo: "fixture-repo",
    sourceRevision: "0123456789abcdef0123456789abcdef01234567",
    generations: { code: 3, git: 2, docs: 1, memory: 4 },
    files,
    edges: {
      calls: [
        { src: "sym:src/index.ts#main", dst: "sym:src/app.ts#run", count: 2, claimId: 101 },
        { src: "sym:src/app.ts#run", dst: "sym:src/util/math.ts#add", count: 1, claimId: 102 },
        { src: "sym:src/app.ts#run", dst: "sym:src/util/str.ts#trim", count: 1, claimId: 103 },
        { src: "sym:src/router.ts#route", dst: "sym:src/util/id.ts#uuid", count: 1, claimId: 104 },
        {
          src: "sym:src/util/math.ts#mul",
          dst: "sym:src/util/math.ts#add",
          count: 3,
          claimId: 105,
        },
      ],
      imports: [
        { src: "file:src/index.ts", dst: "file:src/app.ts", count: 1, claimId: 201 },
        { src: "file:src/app.ts", dst: "file:src/util/math.ts", count: 1, claimId: 202 },
        { src: "file:src/app.ts", dst: "file:src/router.ts", count: 1, claimId: 203 },
        { src: "file:src/router.ts", dst: "file:src/util/id.ts", count: 1, claimId: 204 },
      ],
      touches: [
        { commit: "commit:aaaaaaa", target: "file:src/app.ts" },
        { commit: "commit:aaaaaaa", target: "sym:src/util/math.ts#add" },
        { commit: "commit:bbbbbbb", target: "file:src/util/math.ts" },
      ],
    },
    event: {
      kind: "diff",
      label: "fixture diff aaaaaaa..bbbbbbb",
      range: { from: "aaaaaaa", to: "bbbbbbb" },
      commitIds: ["commit:aaaaaaa", "commit:bbbbbbb"],
      anchorFiles: ["file:src/app.ts", "file:src/util/math.ts"],
      anchorSyms: ["sym:src/util/math.ts#add"],
    },
    disclosures: ["fixture corpus: co-changed and references edges excluded"],
  };
  return corpus;
}

/** Deterministically shuffle arrays to prove order-independence of compile(). */
export function shuffledFixtureCorpus(seed = 7): CorpusInput {
  const base = makeFixtureCorpus();
  let s = seed >>> 0;
  const rnd = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
  const shuffle = <T>(arr: T[]): T[] => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      const ai = a[i]!;
      a[i] = a[j]!;
      a[j] = ai;
    }
    return a;
  };
  return {
    ...base,
    files: shuffle(base.files.map((f) => ({ ...f, decls: shuffle(f.decls) }))),
    edges: {
      calls: shuffle(base.edges.calls),
      imports: shuffle(base.edges.imports),
      touches: shuffle(base.edges.touches),
    },
  };
}
