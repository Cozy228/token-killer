import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { blake2bHex } from "../../src/store/hash.ts";
import {
  READ_THROUGH_MAX_BYTES,
  readFileLocator,
  resolveProjectPath,
  type ReadThroughHost,
} from "../../src/store/readthrough.ts";
import { openStore, type Store } from "../../src/store/store.ts";
import { cleanupTempDir, git, makeGitFixture, makeTempDir } from "../helpers/sandbox.ts";

describe("read-through hardening (traversal, allowlist, caps, sniff)", () => {
  let root: string;
  let projectRoot: string;
  let host: ReadThroughHost;

  beforeEach(() => {
    root = makeTempDir("ctx-rt-");
    projectRoot = join(root, "proj");
    mkdirSync(projectRoot);
    writeFileSync(join(projectRoot, "known.md"), "hello\nworld\nthree\n");
    writeFileSync(join(root, "secret.txt"), "outside");
    host = { projectRoot, isKnownEntityPath: (p) => p === "known.md" };
  });
  afterEach(() => {
    cleanupTempDir(root);
  });

  test.each([
    ["null byte", "known\0.md"],
    ["absolute posix", "/etc/passwd"],
    ["absolute win", "C:\\Windows\\system32"],
    ["dotdot pre-normalize", "../secret.txt"],
    ["dotdot buried", "docs/../../secret.txt"],
  ])("traversal rejected: %s", (_name, path) => {
    const r = resolveProjectPath(host, path);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("traversal-rejected");
  });

  test("allowlist cross-check: unknown entity paths are refused", () => {
    const r = resolveProjectPath(host, "unknown.md");
    expect(r).toMatchObject({ ok: false, reason: "not-allowlisted" });
  });

  test("symlink escape is rejected post-normalize", () => {
    const linkHost: ReadThroughHost = { projectRoot, isKnownEntityPath: () => true };
    try {
      symlinkSync(join(root, "secret.txt"), join(projectRoot, "sneaky.md"));
    } catch {
      return; // symlink creation not permitted (Windows non-admin) — defense untestable here
    }
    const r = resolveProjectPath(linkHost, "sneaky.md");
    expect(r).toMatchObject({ ok: false, reason: "traversal-rejected" });
  });

  test("reads exact bytes; span slices 1-based inclusive lines", () => {
    const whole = readFileLocator(host, { t: "file", path: "known.md" });
    expect(whole).toMatchObject({ ok: true, text: "hello\nworld\nthree\n", via: "file" });
    const span = readFileLocator(host, { t: "file", path: "known.md", span: [2, 3] });
    expect(span.ok && span.text).toBe("world\nthree");
  });

  test("size cap and binary sniff are refusals, not throws", () => {
    const bigHost: ReadThroughHost = { projectRoot, isKnownEntityPath: () => true };
    writeFileSync(join(projectRoot, "big.bin"), Buffer.alloc(READ_THROUGH_MAX_BYTES + 1, 65));
    expect(readFileLocator(bigHost, { t: "file", path: "big.bin" })).toMatchObject({
      ok: false,
      reason: "too-large",
    });
    writeFileSync(join(projectRoot, "nul.dat"), Buffer.from([104, 105, 0, 106]));
    expect(readFileLocator(bigHost, { t: "file", path: "nul.dat" })).toMatchObject({
      ok: false,
      reason: "binary",
    });
    expect(readFileLocator(bigHost, { t: "file", path: "gone.md" })).toMatchObject({
      ok: false,
      reason: "not-found",
    });
  });
});

describe("store-integrated read-through (drift, git, store, snapshot)", () => {
  let root: string;
  let repo: string;
  let store: Store;

  beforeEach(() => {
    root = makeTempDir("ctx-rt-store-");
    repo = makeGitFixture(root);
    store = openStore({ projectDir: repo, home: join(root, "contexa-home") });
  });
  afterEach(() => {
    store.close();
    cleanupTempDir(root);
  });

  test("content_hash drift marks the entity's links stale and is disclosed", () => {
    writeFileSync(join(repo, "doc.md"), "version one");
    store.upsertEntity({
      id: "file:doc.md",
      kind: "file",
      name: "doc.md",
      locator: { t: "file", path: "doc.md" },
      contentHash: blake2bHex("version one"),
      gen: 1,
    });
    store.upsertEntity({
      id: "file:other.md",
      kind: "file",
      name: "other.md",
      locator: { t: "file", path: "other.md" },
      gen: 1,
    });
    store.setLink({
      src: "file:doc.md",
      dst: "file:other.md",
      predicate: "references",
      method: "path-match",
    });
    const fresh = store.readThrough("file:doc.md");
    expect(fresh).toMatchObject({ ok: true, drift: false });

    writeFileSync(join(repo, "doc.md"), "version two"); // drift
    const drifted = store.readThrough("file:doc.md");
    expect(drifted).toMatchObject({ ok: true, text: "version two", drift: true });
    expect(store.linksFrom("file:doc.md")[0]?.stale).toBe(true);
  });

  test("git locator reads a blob via cat-file; bad oids are refused", () => {
    const oid = git(["rev-parse", "HEAD:README.md"], repo);
    const viaGit = store.resolveLocator({ t: "git", oid });
    expect(viaGit).toMatchObject({ ok: true, text: "# fixture\n", via: "git" });
    expect(store.resolveLocator({ t: "git", oid: "not-an-oid!" })).toMatchObject({
      ok: false,
      reason: "bad-oid",
    });
    expect(store.resolveLocator({ t: "git", oid: "deadbeef" })).toMatchObject({
      ok: false,
      reason: "not-found",
    });
  });

  test("store locator serves memory gist/detail; snapshot is a recoverable unsupported", () => {
    store.upsertEntity({
      id: "mem:01RT",
      kind: "memory",
      name: "note",
      locator: { t: "store" },
      gen: 1,
    });
    store.writeMemory({
      entityId: "mem:01RT",
      gist: "the gist",
      detail: "the detail",
      origin: "remember",
      authority: "confirmed",
    });
    expect(store.readThrough("mem:01RT")).toMatchObject({
      ok: true,
      text: "the gist\n\nthe detail",
      via: "store",
    });
    expect(
      store.resolveLocator({ t: "snapshot", carrier: "github", file: "x.json" }),
    ).toMatchObject({ ok: false, reason: "unsupported" });
    expect(store.readThrough("file:nope.md")).toMatchObject({ ok: false, reason: "no-entity" });
  });
});
