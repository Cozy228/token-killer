/**
 * Slice 2e — SCIP arbitration (M2-ACCEPTANCE.md "2e"). Flips the 2a-wired B5
 * todos green. Spec read-back: `docs/codemap/impl/appendix-A1-copyable.md:480–500`
 * (streaming consumer, position encodings, fail-open rollback).
 *
 * Deterministic CI tier (CTX-IMPL §10): a scripted TS project + a hand-built
 * `index.scip` (real protobuf wire bytes via the inverse encoder in
 * tests/helpers/scipFixture.ts — construction documented there). The fixture is
 * self-contained + full-depth-safe (no network, no scip-typescript toolchain).
 *
 * The fixture project (probed spans, ⚠ recorded):
 *   svc.ts   Service [1,3] · Service.persist [2,2] · run [4,7]
 *            tree-sitter derives run --calls--> Service.persist (a `local` method
 *            call) — the tree-sitter × SCIP overlap B5-jurisdiction arbitrates.
 *   other.ts helper [1,1] — NOT in index.scip → stays Derived (B5-upgrade).
 * SCIP occurrence lines are 0-based (line0 = span-start − 1).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { CodeSourceAdapter } from "../../src/ingest/code/adapter.ts";
import { clearScanCache } from "../../src/ingest/scan.ts";
import { serveContext } from "../../src/serve/serve.ts";
import { decodeScipIndex, ScipDecodeError } from "../../src/ingest/code/scip/reader.ts";
import { openStore, type Store } from "../../src/store/store.ts";
import type { Budget, IngestResult } from "../../src/ingest/adapter.ts";
import { cleanupTempDir, makeTempDir } from "../helpers/sandbox.ts";
import {
  encodeScipIndex,
  ROLE_DEFINITION,
  truncatedScip,
  writeScipFixture,
  type FixtureDocument,
} from "../helpers/scipFixture.ts";

const MAX_BUDGET: Budget = { deadline: Number.MAX_SAFE_INTEGER, now: Date.now };

const SVC_TS =
  `export class Service {\n` + //            line 1  → Service [1,3]
  `  persist(): void {}\n` + //              line 2  → Service.persist [2,2]
  `}\n` + //                                  line 3
  `export function run(): void {\n` + //      line 4  → run [4,7]
  `  const s = new Service();\n` + //         line 5
  `  s.persist();\n` + //                     line 6  → the call site
  `}\n`; //                                   line 7
const OTHER_TS = `export function helper(): number { return 1; }\n`; // helper [1,1]

/** Definitions for Service / persist / run + a reference (call) to persist in
 *  run. SCIP ranges are 0-based; char offsets are cosmetic (only line reconciles). */
const SVC_SCIP: FixtureDocument = {
  relativePath: "svc.ts",
  language: "typescript",
  occurrences: [
    { range: [0, 13, 20], symbol: "scip-ts . Service#", roles: ROLE_DEFINITION }, // def Service @L1
    { range: [1, 2, 9], symbol: "scip-ts . Service#persist().", roles: ROLE_DEFINITION }, // def persist @L2
    { range: [3, 16, 19], symbol: "scip-ts . run().", roles: ROLE_DEFINITION }, // def run @L4
    { range: [5, 4, 11], symbol: "scip-ts . Service#persist()." }, // ref persist in run @L6 → calls
  ],
};

const PERSIST = "sym:svc.ts#Service.persist";
const RUN = "sym:svc.ts#run";
const SERVICE = "sym:svc.ts#Service";
const HELPER = "sym:other.ts#helper";

describe("acceptance: 2e SCIP arbitration", () => {
  let root: string;
  let proj: string;
  let store: Store;

  const write = (rel: string, content: string): void =>
    writeFileSync(join(proj, rel), content, "utf8");

  async function ingest(scip = true): Promise<IngestResult> {
    clearScanCache();
    const adapter = new CodeSourceAdapter({ inProcess: true, scip });
    return adapter.ingest(store, await adapter.dirtyCheck(store), MAX_BUDGET);
  }

  /** Raw claim rows (no store enumeration API — 2nd WAL reader, 2c pattern). */
  function claimRows(where: string): Array<Record<string, unknown>> {
    const db = new DatabaseSync(store.dbPath);
    db.exec("PRAGMA busy_timeout=5000");
    const rows = db.prepare(`SELECT * FROM claims WHERE ${where}`).all() as Array<
      Record<string, unknown>
    >;
    db.close();
    return rows;
  }

  beforeEach(() => {
    root = makeTempDir("ctx-2e-scip-");
    proj = join(root, "proj");
    mkdirSync(proj, { recursive: true });
    store = openStore({ projectDir: proj, home: join(root, "home") });
    write("svc.ts", SVC_TS);
    write("other.ts", OTHER_TS);
  });
  afterEach(() => {
    store.close();
    cleanupTempDir(root);
  });

  test("B5-upgrade: covered identity/reference claims carry authority=observed (scip); tree-sitter-only symbols stay Derived", async () => {
    writeScipFixture(proj, [SVC_SCIP]);
    const result = await ingest();
    expect(result.complete).toBe(true);
    expect(result.scip?.applied).toBe(true);
    expect(result.scip?.reason).toBe("consumed");

    // IDENTITY upgrade: file --contains--> persist has a scip / observed claim.
    const containsPersist = store
      .claimsFor("file:svc.ts", "contains")
      .filter((c) => c.object === PERSIST);
    expect(containsPersist.some((c) => c.carrier === "scip" && c.authority === "observed")).toBe(
      true,
    );
    // ...for every covered definition (Service, persist, run).
    for (const sym of [SERVICE, PERSIST, RUN]) {
      const scipClaim = store
        .claimsFor("file:svc.ts", "contains")
        .find((c) => c.object === sym && c.carrier === "scip");
      expect(scipClaim?.authority, `${sym} identity upgraded`).toBe("observed");
    }

    // REFERENCE upgrade: run --calls--> persist has a scip / observed claim.
    const callsPersist = store.claimsFor(RUN, "calls").filter((c) => c.object === PERSIST);
    expect(callsPersist.some((c) => c.carrier === "scip" && c.authority === "observed")).toBe(true);

    // tree-sitter-only symbol (other.ts#helper, NOT in index.scip) stays Derived:
    // every claim about it is tree-sitter/derived — SCIP never touched it.
    const helperClaims = claimRows(`object = '${HELPER}'`);
    expect(helperClaims.length).toBeGreaterThan(0);
    for (const c of helperClaims) {
      expect(c.carrier).toBe("tree-sitter");
      expect(c.authority).toBe("derived");
    }
    expect(claimRows(`object = '${HELPER}' AND carrier = 'scip'`).length).toBe(0);
  });

  test("B5-jurisdiction: overlapping tree-sitter × SCIP same-predicate claims arbitrate to ONE link; provenance discloses the winner (Observed beats Derived)", async () => {
    writeScipFixture(proj, [SVC_SCIP]);
    const result = await ingest();

    // BOTH carriers asserted run --calls--> persist (the overlap really exists).
    const callClaims = store.claimsFor(RUN, "calls").filter((c) => c.object === PERSIST);
    expect(new Set(callClaims.map((c) => c.carrier))).toEqual(new Set(["tree-sitter", "scip"]));
    expect(new Set(callClaims.map((c) => c.authority))).toEqual(new Set(["derived", "observed"]));

    // ...yet exactly ONE resolved link (no duplicate edge).
    const callLinks = store.linksFrom(RUN, "calls").filter((l) => l.dst === PERSIST);
    expect(callLinks.length).toBe(1);

    // PROVENANCE discloses the winner: the link points at the SCIP observed claim.
    const winner = store.getClaim(callLinks[0]!.claimId!);
    expect(winner?.carrier).toBe("scip");
    expect(winner?.authority).toBe("observed");

    // Same arbitration on the identity predicate: one `contains` link, scip wins.
    const containsLinks = store
      .linksFrom("file:svc.ts", "contains")
      .filter((l) => l.dst === PERSIST);
    expect(containsLinks.length).toBe(1);
    expect(store.getClaim(containsLinks[0]!.claimId!)?.authority).toBe("observed");

    // The pass disclosed the flips (3 identity contains + 1 calls edge).
    expect(result.scip?.arbitrated).toBe(4);
    expect(result.scip?.identity).toBe(3);
    expect(result.scip?.edges).toBe(1);
  });

  test("B5-failopen: malformed/truncated index.scip → ingest completes on tree-sitter alone, success-shaped, no partial SCIP claims left behind", async () => {
    // The fixture is genuinely malformed: the reader throws on it.
    expect(() => decodeScipIndex(truncatedScip([SVC_SCIP]))).toThrow(ScipDecodeError);
    writeFileSync(join(proj, "index.scip"), truncatedScip([SVC_SCIP]));

    const result = await ingest();
    // SUCCESS-shaped disclosure: completed, fail-open, NOT an error.
    expect(result.complete).toBe(true);
    expect(result.scip?.applied).toBe(false);
    expect(result.scip?.reason).toBe("malformed");

    // NO partial SCIP claims anywhere (D16 rollback — nothing half-applied).
    expect(claimRows(`carrier = 'scip'`).length).toBe(0);

    // The store is EXACTLY as tree-sitter left it: symbols present, and the
    // run --calls--> persist link is the tree-sitter DERIVED one (never upgraded).
    expect(store.getEntity(PERSIST)?.kind).toBe("symbol");
    const link = store.linksFrom(RUN, "calls").find((l) => l.dst === PERSIST);
    expect(link, "tree-sitter call edge stands").toBeDefined();
    expect(store.getClaim(link!.claimId!)?.authority).toBe("derived");
    expect(store.getClaim(link!.claimId!)?.carrier).toBe("tree-sitter");

    // Serve is success-shaped over the fail-open store (envelope, not isError).
    const served = await serveContext({ store }, { ref: RUN });
    expect(served.isError).toBe(false);
  });

  test("a well-formed index.scip covering NO indexed file is a clean no-op (empty-decode success-shaped)", async () => {
    // A document for a path we never ingested → reconciles to nothing.
    writeFileSync(
      join(proj, "index.scip"),
      encodeScipIndex([
        {
          relativePath: "ghost.ts",
          language: "typescript",
          occurrences: [{ range: [0, 0, 5], symbol: "scip-ts . ghost().", roles: ROLE_DEFINITION }],
        },
      ]),
    );
    const result = await ingest();
    expect(result.complete).toBe(true);
    expect(result.scip?.applied).toBe(true); // decoded fine
    expect(result.scip?.identity).toBe(0); // but nothing reconciled
    expect(result.scip?.edges).toBe(0);
    expect(claimRows(`carrier = 'scip'`).length).toBe(0);
  });
});
