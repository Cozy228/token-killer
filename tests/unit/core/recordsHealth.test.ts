import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  fingerprintSegment,
  projectFingerprint,
  resetFingerprintCacheForTests,
} from "../../../src/core/dataDir.js";
import {
  archiveUnresolvedOrphans,
  diagnoseRecords,
  mergeDuplicateBuckets,
  pruneEmptyBuckets,
  recordsStoreExists,
  recoverOrphanNames,
} from "../../../src/core/recordsHealth.js";

// recordsHealth keys everything off TOKEN_KILLER_HOME (via tokenKillerHome), so each
// test points it at a throwaway store and builds the exact bucket layout it asserts.

let home: string;
let prevHome: string | undefined;

function projectsDir(): string {
  return join(home, "projects");
}

// Create projects/<segment(fingerprint)>/ with the given files; returns the dir.
function makeBucket(dirName: string, files: Record<string, string>): string {
  const dir = join(projectsDir(), dirName);
  mkdirSync(dir, { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(dir, name), content);
  }
  return dir;
}

function historyLines(n: number): string {
  return (
    Array.from({ length: n }, (_, i) => JSON.stringify({ command: `c${i}` })).join("\n") + "\n"
  );
}

beforeEach(() => {
  prevHome = process.env.TOKEN_KILLER_HOME;
  home = mkdtempSync(join(tmpdir(), "tk-records-"));
  process.env.TOKEN_KILLER_HOME = home;
  resetFingerprintCacheForTests();
});
afterEach(() => {
  if (prevHome === undefined) delete process.env.TOKEN_KILLER_HOME;
  else process.env.TOKEN_KILLER_HOME = prevHome;
  rmSync(home, { recursive: true, force: true });
});

describe("diagnoseRecords", () => {
  test("a no-store home is empty and reports no buckets", () => {
    expect(recordsStoreExists()).toBe(false);
    const report = diagnoseRecords();
    expect(report.buckets).toHaveLength(0);
    expect(report.orphanBuckets).toHaveLength(0);
  });

  test("a labelled bucket with a fresh rollup is healthy", () => {
    makeBucket("repo:aaaaaaaaaaaa", {
      "history.jsonl": historyLines(3),
      "rollup.json": JSON.stringify({ version: 1, source_lines: 3 }),
      "meta.json": JSON.stringify({ label: "my-project" }),
    });
    const report = diagnoseRecords();
    expect(report.buckets).toHaveLength(1);
    const b = report.buckets[0];
    expect(b.displayName).toBe("my-project");
    expect(b.orphan).toBe(false);
    expect(b.rollup).toBe("fresh");
    expect(report.orphanBuckets).toHaveLength(0);
    expect(report.staleRollups).toHaveLength(0);
  });

  test("a bucket with history but no meta is an orphan shown as a bare hash", () => {
    makeBucket("repo:bbbbbbbbbbbb", { "history.jsonl": historyLines(2) });
    const report = diagnoseRecords();
    expect(report.orphanBuckets).toHaveLength(1);
    expect(report.orphanBuckets[0].displayName).toBe("bbbbbbbb");
    expect(report.orphanBuckets[0].orphan).toBe(true);
  });

  test("a meta label that is itself a hash counts as junk → orphan", () => {
    makeBucket("repo:cccccccccccc", {
      "history.jsonl": historyLines(1),
      "meta.json": JSON.stringify({ label: "cccccccc" }),
    });
    const report = diagnoseRecords();
    expect(report.orphanBuckets).toHaveLength(1);
    expect(report.buckets[0].badMeta).toBe(true);
  });

  test("a meta label that is a flattened absolute path is junk → orphan", () => {
    // The legacy bug: a data-dir path leaked into the name slot. Must not render verbatim.
    makeBucket("repo:cafecafecafe", {
      "history.jsonl": historyLines(3),
      "meta.json": JSON.stringify({ label: "-Users-ziyu-Workspace-token-killer" }),
    });
    const report = diagnoseRecords();
    expect(report.orphanBuckets).toHaveLength(1);
    expect(report.buckets[0].badMeta).toBe(true);
    // A normal dash-cased project name is NOT mistaken for a flattened path.
    makeBucket("repo:beadbeadbead", {
      "history.jsonl": historyLines(1),
      "meta.json": JSON.stringify({ label: "atlas-agent-e2e" }),
    });
    expect(diagnoseRecords().orphanBuckets).toHaveLength(1); // still just the flattened one
  });

  test("a rollup whose source_lines mismatch history is stale", () => {
    makeBucket("repo:dddddddddddd", {
      "history.jsonl": historyLines(5),
      "rollup.json": JSON.stringify({ version: 1, source_lines: 2 }),
      "meta.json": JSON.stringify({ label: "stale-one" }),
    });
    expect(diagnoseRecords().staleRollups.map((b) => b.rollup)).toEqual(["stale"]);
  });

  test("repo: and repo- dirs of the same hash form one duplicate group", () => {
    makeBucket("repo:eeeeeeeeeeee", { "history.jsonl": historyLines(1) });
    makeBucket("repo-eeeeeeeeeeee", { "history.jsonl": historyLines(1) });
    const report = diagnoseRecords();
    expect(report.dupGroups).toHaveLength(1);
    expect(report.dupGroups[0].fingerprint).toBe("repo:eeeeeeeeeeee");
    expect(report.dupGroups[0].canonicalDir).toBe(fingerprintSegment("repo:eeeeeeeeeeee"));
  });
});

describe("mergeDuplicateBuckets", () => {
  test("merges the dash-spelled dir into the canonical one and removes it", () => {
    makeBucket("repo:ffffffffffff", { "history.jsonl": '{"command":"keep"}\n' });
    makeBucket("repo-ffffffffffff", { "history.jsonl": '{"command":"merged"}\n' });

    const result = mergeDuplicateBuckets();
    expect(result.merged).toBe(1);

    const canonical = join(projectsDir(), fingerprintSegment("repo:ffffffffffff"));
    const text = readFileSync(join(canonical, "history.jsonl"), "utf8");
    expect(text).toContain('"keep"');
    expect(text).toContain('"merged"');
    expect(existsSync(join(projectsDir(), "repo-ffffffffffff"))).toBe(false);
  });
});

describe("recoverOrphanNames", () => {
  test("matches an orphan bucket to a real repo by fingerprint and writes its name", () => {
    // A real repo under the scan root: its fingerprint must equal the orphan bucket's.
    const scanRoot = mkdtemp("tk-scan-");
    const repoDir = join(scanRoot, "cool-repo");
    mkdirSync(join(repoDir, ".git"), { recursive: true });
    const fingerprint = projectFingerprint(repoDir);

    makeBucket(fingerprintSegment(fingerprint), { "history.jsonl": historyLines(2) });
    expect(diagnoseRecords().orphanBuckets).toHaveLength(1);

    const result = recoverOrphanNames(scanRoot);
    expect(result.recovered).toEqual([{ fingerprint, label: "cool-repo" }]);
    expect(result.unmatched).toBe(0);

    // The orphan now resolves to the repo basename.
    expect(diagnoseRecords().orphanBuckets).toHaveLength(0);
    expect(diagnoseRecords().buckets[0].displayName).toBe("cool-repo");

    rmSync(scanRoot, { recursive: true, force: true });
  });

  test("an orphan with no matching repo stays unmatched", () => {
    const scanRoot = mkdtemp("tk-scan-empty-");
    makeBucket("repo:111111111111", { "history.jsonl": historyLines(1) });
    const result = recoverOrphanNames(scanRoot);
    expect(result.recovered).toHaveLength(0);
    expect(result.unmatched).toBe(1);
    rmSync(scanRoot, { recursive: true, force: true });
  });
});

describe("archiveUnresolvedOrphans", () => {
  test("folds orphan history into one archived bucket and deletes the hash dirs", () => {
    makeBucket("repo:222222222222", { "history.jsonl": '{"command":"o1"}\n' });
    makeBucket("repo:333333333333", { "history.jsonl": '{"command":"o2a"}\n{"command":"o2b"}\n' });

    const result = archiveUnresolvedOrphans();
    expect(result.archived).toBe(2);

    const archiveDir = join(projectsDir(), "archived");
    const text = readFileSync(join(archiveDir, "history.jsonl"), "utf8");
    expect(text).toContain('"o1"');
    expect(text).toContain('"o2a"');
    expect(text).toContain('"o2b"');
    expect(JSON.parse(readFileSync(join(archiveDir, "meta.json"), "utf8")).label).toBe("archived");

    // The hash-named dirs are gone; the archived bucket is no longer an orphan.
    expect(existsSync(join(projectsDir(), "repo:222222222222"))).toBe(false);
    expect(existsSync(join(projectsDir(), "repo:333333333333"))).toBe(false);
    expect(diagnoseRecords().orphanBuckets).toHaveLength(0);
  });
});

describe("pruneEmptyBuckets", () => {
  test("removes directories with no history/dedup/governance data", () => {
    makeBucket("repo:444444444444", { "meta.json": JSON.stringify({ label: "dead" }) });
    makeBucket("repo:555555555555", { "history.jsonl": historyLines(1) });
    const result = pruneEmptyBuckets();
    expect(result.pruned).toBe(1);
    expect(existsSync(join(projectsDir(), "repo:444444444444"))).toBe(false);
    expect(existsSync(join(projectsDir(), "repo:555555555555"))).toBe(true);
  });
});

// mkdtemp helper local to this file (keeps the temp under the OS tmpdir, not `home`).
function mkdtemp(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix));
}
