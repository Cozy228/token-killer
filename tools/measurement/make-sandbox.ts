/**
 * make-sandbox — build the two per-task arm sandboxes (design §3/§4, Q7/Q10/Q14).
 *
 * For a task {repo, sha (fix-parent), at (T), prompt, accept_cmd}, produces a task
 * dir with TWO byte-identical checkouts differing ONLY in the three ratified knobs
 * (A4). The frozen tree is the SHA's tree extracted via `git archive` into a FRESH
 * single-commit repo — so the future fix commit is not even an object in the
 * sandbox (A2), stronger than a worktree (which shares .git and can `git log` the
 * fix). The sandbox also gets its OWN git-common-dir ⇒ its OWN Contexa store shard, so
 * the real `~/.contexa` store is never touched.
 *
 * Time-cut (Q14 / T1): arm B's Contexa store is built by `ctx sync` with
 *   - CONTEXA_HOME  → sandbox-local (armB/.contexahome), never the real ~/.contexa
 *   - HOME      → a time-cut home whose `.claude/.../memory/` is empty (default)
 *                 or filtered to files mtime < T (--memory-mode asof)
 * The git/code/docs sources are time-cut by construction (the archived tree IS the
 * tree at SHA ≤ T; A2 proves nothing newer is reachable). The memory source is the
 * only unbounded leak vector, so it is fed a time-cut HOME. NOTE (deviation): the
 * store's timestamp columns record INGEST wall-time, not source time, so A3 is
 * proven at the INPUT boundary (host-import memory rows == 0) — see
 * implementation-notes.md.
 *
 * Usage:
 *   tsx make-sandbox.ts --task <id> --repo <path> --sha <fix-parent-sha>
 *       --at <ISO-T> --prompt <text|@file> --out <taskdir>
 *       [--accept-cmd <inline|@file>] [--smoke] [--memory-mode empty|asof]
 *       [--keep-push-imperative]   # keep the push-block steering line (shipped cond.)
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  cpSync,
  existsSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { join, resolve } from "node:path";
import {
  BASE_TOOLS,
  claudeProjectSlug,
  CLI_ENTRY,
  CTX_MCP_TOOLS,
  ensureDir,
  git,
  runCtx,
  TSX_LOADER,
  writeJson,
} from "./lib.ts";

const MANAGED_BLOCK_RE =
  /\n?<!--\s*ctx:managed:begin\s*-->[\s\S]*?<!--\s*ctx:managed:end\s*-->\n?/g;
const PUSH_TARGETS = ["AGENTS.md", "CLAUDE.md"];

/** The steering IMPERATIVE line inside the managed push block (E-12): it turns an
 *  `optional` condition into a steered one. Neutralized in measurement checkouts by
 *  default (§1c). Kept in sync with packages/core/src/push/block.ts HEADER_LINES[1]
 *  — copied here (measurement must not import product code); the regex tolerates
 *  minor whitespace drift so a header re-word does not silently un-neutralize. */
const PUSH_IMPERATIVE_RE = /^Start tasks with the `context` MCP tool[^\n]*\n?/m;

interface Flags {
  [k: string]: string | boolean;
}
function parseFlags(argv: string[]): Flags {
  const f: Flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] as string;
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) f[key] = true;
    else f[key] = argv[++i] as string;
  }
  return f;
}

/** `@file` → file contents; otherwise the literal value. */
function resolveValue(v: string): string {
  return v.startsWith("@") ? readFileSync(v.slice(1), "utf8") : v;
}

function shq(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}

/** Extract ONLY the tree at `sha` into `dest` (no `.git`). Copying a live `.git`
 *  races with git's post-commit `gc --auto` (loose objects get packed/deleted mid
 *  copy → ENOENT), so the base holds a pure tree; each arm gets its OWN fresh repo. */
function extractTree(repo: string, sha: string, dest: string): void {
  ensureDir(dest);
  // git archive | tar -x → the exact tree at SHA, no history. Shell pipeline keeps
  // the binary tar stream out of JS (utf8 capture would corrupt it).
  const pipe = spawnSync(
    "bash",
    ["-c", `git -C ${shq(repo)} archive --format=tar ${shq(sha)} | tar -x -C ${shq(dest)}`],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  if (pipe.status !== 0) throw new Error(`git archive|tar for ${sha} failed: ${pipe.stderr}`);
}

/** Turn an extracted tree into a fresh single-commit repo (A2). `gc.auto=0` so no
 *  background pack races a later copy; the fix SHA is NOT an object here. */
function initFrozenRepo(dir: string, sha: string): void {
  const id = [
    "-c",
    "gc.auto=0",
    "-c",
    "user.email=harness@measurement",
    "-c",
    "user.name=measurement-harness",
  ];
  git([...id, "init", "-q"], dir);
  git([...id, "add", "-A"], dir);
  git(
    [...id, "commit", "-q", "-m", `frozen tree at ${sha} (history truncated — design §3/T1)`],
    dir,
  );
}

/** Strip any managed ctx push block from CLAUDE.md/AGENTS.md (arm A cleanliness). */
function stripPushBlocks(repoDir: string): void {
  for (const t of PUSH_TARGETS) {
    const p = join(repoDir, t);
    if (!existsSync(p)) continue;
    const before = readFileSync(p, "utf8");
    const after = before.replace(MANAGED_BLOCK_RE, "\n");
    if (after !== before) writeFileSync(p, after);
  }
}

/** Neutralize (strip) the steering imperative line INSIDE the managed push block,
 *  in every measurement checkout by default (§1c). The block's descriptive first
 *  line + gotchas stay (presence disclosure ≠ steering). Only touches text within a
 *  managed block. Returns true if it changed anything. */
function neutralizePushImperative(repoDir: string): boolean {
  let changed = false;
  for (const t of PUSH_TARGETS) {
    const p = join(repoDir, t);
    if (!existsSync(p)) continue;
    const before = readFileSync(p, "utf8");
    const after = before.replace(MANAGED_BLOCK_RE, (block) =>
      block.replace(PUSH_IMPERATIVE_RE, ""),
    );
    if (after !== before) {
      writeFileSync(p, after);
      changed = true;
    }
  }
  return changed;
}

/** Remove a `ctx` server from any existing .mcp.json (arm A cleanliness). */
function stripCtxMcp(repoDir: string): void {
  const p = join(repoDir, ".mcp.json");
  if (!existsSync(p)) return;
  try {
    const cfg = JSON.parse(readFileSync(p, "utf8"));
    if (cfg?.mcpServers?.contexa) {
      delete cfg.mcpServers.contexa;
      if (Object.keys(cfg.mcpServers).length === 0) rmSync(p);
      else writeFileSync(p, JSON.stringify(cfg, null, 2) + "\n");
    }
  } catch {
    /* malformed — leave as-is (arm A won't get a ctx server anyway) */
  }
}

/** Build the time-cut HOME for the ctx memory importer (Q14). */
function buildTimecutHome(
  timecutHome: string,
  repoRealPath: string,
  atIso: string,
  mode: string,
): number {
  const slug = claudeProjectSlug(repoRealPath);
  const memDir = join(timecutHome, ".claude", "projects", slug, "memory");
  ensureDir(memDir);
  if (mode !== "asof") return 0; // default 'empty' → zero host memory (provable A3)
  // asof: copy real memory files with mtime < T (heuristic — memory .md carry no
  // reliable SOURCE timestamp; flagged in the arm meta).
  const realMem = join(process.env.HOME ?? "", ".claude", "projects", slug, "memory");
  if (!existsSync(realMem)) return 0;
  const T = new Date(atIso).getTime();
  let copied = 0;
  for (const f of readdirSync(realMem)) {
    const src = join(realMem, f);
    const st = statSync(src);
    if (st.isFile() && st.mtimeMs < T) {
      cpSync(src, join(memDir, f));
      copied++;
    }
  }
  return copied;
}

function writeWrapper(path: string): void {
  writeFileSync(
    path,
    `#!/usr/bin/env bash\n# ctx launcher (F2: run from source via tsx). Absolute paths so it\n# works from any cwd / from within a per-rep scratch copy.\nexec node --import "file://${TSX_LOADER}" "${CLI_ENTRY}" "$@"\n`,
  );
  chmodSync(path, 0o755);
}

/** Copy an extracted base tree into an arm repo, preserving symlinks VERBATIM.
 *  Default cpSync (verbatimSymlinks:false) rewrites a repo-relative symlink target
 *  (e.g. atlas CLAUDE.md → AGENTS.md) into an ABSOLUTE path back into the shared
 *  base/ tree — both arms then alias ONE mutable file outside their checkouts, and
 *  a write-through (ctx push via armB's CLAUDE.md) contaminates arm A (defect
 *  found 2026-07-10, e0-sandboxes rebuild; see implementation-notes.md). */
function copyTreeVerbatim(src: string, dest: string): void {
  cpSync(src, dest, { recursive: true, verbatimSymlinks: true });
  assertSymlinksContained(dest);
}

/** Guard: every symlink in an arm repo must resolve INSIDE that repo. A link whose
 *  target escapes (absolute, or ../ past the root) fails the build LOUDLY — an
 *  escaping link is a cross-arm/base aliasing channel, never acceptable. */
function assertSymlinksContained(root: string): void {
  const rootAbs = resolve(root);
  const offenders: string[] = [];
  const walk = (rel: string): void => {
    for (const e of readdirSync(join(rootAbs, rel), { withFileTypes: true })) {
      const r = rel ? join(rel, e.name) : e.name;
      if (e.isSymbolicLink()) {
        const target = readlinkSync(join(rootAbs, r));
        const resolved = resolve(join(rootAbs, r, ".."), target);
        if (resolved !== rootAbs && !resolved.startsWith(rootAbs + "/"))
          offenders.push(`${r} → ${target} (resolves to ${resolved})`);
      } else if (e.isDirectory()) walk(r);
    }
  };
  walk("");
  if (offenders.length > 0)
    throw new Error(
      `symlink(s) escape the arm repo ${rootAbs}:\n  ${offenders.join("\n  ")}\n` +
        "(refusing to build — an escaping link aliases state outside the checkout)",
    );
}

/** Recursive file map (relative path → content signature) for the A4 diff. Robust
 *  on real repos: symlinks are recorded by target (not followed), files are hashed
 *  as bytes (binary-safe, no huge strings), and any unreadable/special entry is
 *  recorded as a marker rather than crashing the whole build. */
function fileMap(dir: string, skip = new Set([".git"])): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (rel: string): void => {
    let entries: import("node:fs").Dirent[];
    try {
      entries = readdirSync(join(dir, rel), { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (skip.has(e.name)) continue;
      const r = rel ? join(rel, e.name) : e.name;
      const abs = join(dir, r);
      try {
        if (e.isSymbolicLink()) out.set(r, `symlink:${readlinkSync(abs)}`);
        else if (e.isDirectory()) walk(r);
        else if (e.isFile())
          out.set(
            r,
            `${statSync(abs).size}:${createHash("sha1").update(readFileSync(abs)).digest("hex")}`,
          );
        else out.set(r, `special:${e.name}`); // fifo/socket/device — record, don't read
      } catch {
        out.set(r, "unreadable");
      }
    }
  };
  walk("");
  return out;
}

/** A4: diff armA/repo vs armB/repo — must be exactly the ratified knobs. */
function armDelta(
  armArepo: string,
  armBrepo: string,
): {
  onlyInB: string[];
  onlyInA: string[];
  differing: string[];
  isExactlyKnobs: boolean;
} {
  const a = fileMap(armArepo);
  const b = fileMap(armBrepo);
  const onlyInB: string[] = [];
  const onlyInA: string[] = [];
  const differing: string[] = [];
  for (const [k, v] of b) {
    if (!a.has(k)) onlyInB.push(k);
    else if (a.get(k) !== v) differing.push(k);
  }
  for (const k of a.keys()) if (!b.has(k)) onlyInA.push(k);
  const allowed = new Set([".mcp.json", ...PUSH_TARGETS]);
  const touched = [...onlyInB, ...onlyInA, ...differing];
  const isExactlyKnobs =
    onlyInA.length === 0 && touched.every((f) => allowed.has(f)) && onlyInB.includes(".mcp.json");
  return {
    onlyInB: onlyInB.sort(),
    onlyInA: onlyInA.sort(),
    differing: differing.sort(),
    isExactlyKnobs,
  };
}

function toolsList(arm: "A" | "B"): string {
  return arm === "A" ? BASE_TOOLS.join(" ") : [...BASE_TOOLS, ...CTX_MCP_TOOLS].join(" ");
}

function main(): number {
  const f = parseFlags(process.argv.slice(2));
  for (const req of ["task", "repo", "sha", "at", "prompt", "out"]) {
    if (!f[req]) {
      console.error(`missing --${req}\nusage: see file header`);
      return 2;
    }
  }
  const task = String(f.task);
  // Absolutize everything crossing a subprocess boundary: a relative CONTEXA_HOME/HOME
  // re-anchors against the child's cwd (armB/repo) and lands artifacts INSIDE the
  // checkout. The .mcp.json also needs absolute paths to work from a scratch copy.
  const repo = resolve(String(f.repo));
  const sha = String(f.sha);
  const at = String(f.at);
  const prompt = resolveValue(String(f.prompt)).trim();
  const acceptCmd = f["accept-cmd"] ? resolveValue(String(f["accept-cmd"])).trim() : "";
  const smoke = Boolean(f.smoke);
  const memoryMode = f["memory-mode"] ? String(f["memory-mode"]) : "empty";
  // §1c: strip the push-block steering imperative by default; keep it ONLY for an
  // explicitly named `shipped` condition (measuring the product's own onboarding).
  const keepPushImperative = Boolean(f["keep-push-imperative"]);
  const out = resolve(String(f.out));

  if (existsSync(out)) rmSync(out, { recursive: true, force: true });
  ensureDir(out);

  // Resolve the fix-parent SHA to a full hash and sanity-check it exists.
  const rev = git(["rev-parse", "--verify", `${sha}^{commit}`], repo);
  if (rev.code !== 0) throw new Error(`sha ${sha} not found in ${repo}: ${rev.stderr}`);
  const fullSha = rev.stdout.trim();

  // 1) extract the frozen tree once (NO .git), copy the pure tree to both arms
  //    (byte-identical base), then give each arm its OWN fresh single-commit repo.
  //    (Copying a live .git races git's post-commit gc --auto → ENOENT.)
  const base = join(out, "base");
  extractTree(repo, fullSha, base);
  const armArepo = join(out, "armA", "repo");
  const armBrepo = join(out, "armB", "repo");
  copyTreeVerbatim(base, armArepo);
  copyTreeVerbatim(base, armBrepo);
  initFrozenRepo(armArepo, fullSha);
  initFrozenRepo(armBrepo, fullSha);

  // 2) arm A: strip any ctx artifacts (defensive — old trees usually have none).
  stripPushBlocks(armArepo);
  stripCtxMcp(armArepo);

  // 3) arm B: build the time-cut Contexa store, register mcp, place the push block.
  const contexaHome = join(out, "armB", ".contexahome");
  const timecutHome = join(out, "armB", ".timecut-home");
  const wrapper = join(out, "armB", "ctx-launch");
  // arm B repo must ALSO start clean, then ctx adds exactly the knobs.
  stripPushBlocks(armBrepo);
  stripCtxMcp(armBrepo);
  const repoRealPath = git(["rev-parse", "--show-toplevel"], repo).stdout.trim() || repo;
  const memCopied = buildTimecutHome(timecutHome, repoRealPath, at, memoryMode);
  writeWrapper(wrapper);

  // ctx sync: cwd = armB/repo so projectDir = the sandbox; CONTEXA_HOME + HOME isolated.
  const sync = runCtx(["sync"], { cwd: armBrepo, contexaHome, home: timecutHome });
  if (sync.code !== 0) console.error(`warn: ctx sync exit ${sync.code}\n${sync.stderr}`);
  // Register the ctx MCP server with ABSOLUTE paths pointing at the FROZEN store
  // (so a per-rep scratch copy still serves the T-frozen context base).
  const mcpConfig = {
    mcpServers: {
      ctx: {
        command: wrapper,
        args: ["mcp", "--project", armBrepo],
        env: { CONTEXA_HOME: contexaHome, HOME: timecutHome },
      },
    },
  };
  writeFileSync(join(armBrepo, ".mcp.json"), JSON.stringify(mcpConfig, null, 2) + "\n");
  // Place the ≤1KB push block (cwd = armB/repo, same store).
  const push = runCtx(["push"], { cwd: armBrepo, contexaHome, home: timecutHome });
  if (push.code !== 0) console.error(`warn: ctx push exit ${push.code}\n${push.stderr}`);
  // §1c: neutralize the steering imperative unless this is the named shipped condition.
  const imperativeNeutralized = keepPushImperative ? false : neutralizePushImperative(armBrepo);

  // 4) A3 time-cut proof: zero host-import memory rows + input-boundary facts.
  const storePath = findStore(contexaHome);
  const proof = timecutProof(
    storePath,
    timecutHome,
    repoRealPath,
    at,
    fullSha,
    repo,
    memCopied,
    memoryMode,
  );
  writeJson(join(out, "timecut-proof.json"), proof);

  // 5) A2 proof: fix commit unreachable in the sandbox.
  const a2 = a2Proof(armBrepo, repo, at);

  // 6) A4 arm delta.
  const delta = armDelta(armArepo, armBrepo);

  // 7) per-cell env for run-cell.
  const meta = {
    task,
    repo,
    sha: fullSha,
    at,
    prompt,
    accept_cmd: acceptCmd,
    smoke,
    memory_mode: memoryMode,
    keep_push_imperative: keepPushImperative,
    push_imperative_neutralized: imperativeNeutralized,
  };
  writeJson(join(out, "meta.json"), meta);
  writeJson(join(out, "cellA.env.json"), {
    arm: "A",
    repo: armArepo,
    allowedTools: toolsList("A"),
    mcpConfig: null,
    prompt,
    accept_cmd: acceptCmd,
    smoke,
  });
  writeJson(join(out, "cellB.env.json"), {
    arm: "B",
    repo: armBrepo,
    allowedTools: toolsList("B"),
    mcpConfig: join(armBrepo, ".mcp.json"),
    prompt,
    accept_cmd: acceptCmd,
    smoke,
  });
  writeJson(join(out, "arm-delta.json"), delta);

  // report
  console.log(`sandbox for task ${task} → ${out}`);
  console.log(
    `  push imperative: ${keepPushImperative ? "KEPT (shipped condition)" : imperativeNeutralized ? "neutralized ✓" : "not present"}`,
  );
  console.log(`  A2 fix-unreachable: ${a2.fixUnreachable ? "✓" : "✗"} (${a2.note})`);
  console.log(
    `  A3 time-cut: host-import memory rows = ${proof.host_import_memory_rows} ` +
      `(${proof.host_import_memory_rows === 0 ? "✓" : "✗"}); timecut-home memory files = ${proof.timecut_home_memory_files}`,
  );
  console.log(
    `  A4 arm-delta exactly-knobs: ${delta.isExactlyKnobs ? "✓" : "✗"} ` +
      `(onlyInB=${JSON.stringify(delta.onlyInB)} differing=${JSON.stringify(delta.differing)} onlyInA=${JSON.stringify(delta.onlyInA)})`,
  );
  const allOk = a2.fixUnreachable && proof.host_import_memory_rows === 0 && delta.isExactlyKnobs;
  console.log(allOk ? "  ALL sandbox invariants ✓" : "  ⚠ some invariant failed — inspect proofs");
  return allOk ? 0 : 1;
}

function findStore(contexaHome: string): string | null {
  const projs = join(contexaHome, "projects");
  if (!existsSync(projs)) return null;
  for (const d of readdirSync(projs)) {
    const p = join(projs, d, "store.sqlite");
    if (existsSync(p)) return p;
  }
  return null;
}

function timecutProof(
  storePath: string | null,
  timecutHome: string,
  repoRealPath: string,
  at: string,
  sha: string,
  repo: string,
  memCopied: number,
  memoryMode: string,
): Record<string, unknown> {
  let hostImport = 0;
  let totalMemory = 0;
  let entities = 0;
  const counts: Record<string, number> = {};
  if (storePath) {
    const db = new DatabaseSync(storePath, { readOnly: true });
    try {
      hostImport = (
        db.prepare("SELECT COUNT(*) n FROM memory WHERE origin LIKE 'host-import%'").get() as {
          n: number;
        }
      ).n;
      totalMemory = (db.prepare("SELECT COUNT(*) n FROM memory").get() as { n: number }).n;
      entities = (db.prepare("SELECT COUNT(*) n FROM entities").get() as { n: number }).n;
      for (const row of db.prepare("SELECT kind, COUNT(*) n FROM entities GROUP BY kind").all() as {
        kind: string;
        n: number;
      }[])
        counts[row.kind] = row.n;
    } finally {
      db.close();
    }
  }
  const slug = claudeProjectSlug(repoRealPath);
  const memDir = join(timecutHome, ".claude", "projects", slug, "memory");
  const memFiles = existsSync(memDir)
    ? readdirSync(memDir).filter((f) => statSync(join(memDir, f)).isFile()).length
    : 0;
  return {
    T: at,
    sha,
    store_path: storePath,
    entities,
    entities_by_kind: counts,
    total_memory_rows: totalMemory,
    host_import_memory_rows: hostImport, // A3: must be 0 (empty mode)
    memory_mode: memoryMode,
    timecut_home_memory_files: memFiles,
    memory_files_copied_asof: memCopied,
    note:
      "git/code/docs sources are time-cut by the archived tree at SHA≤T (A2 proves nothing newer is reachable). " +
      "Store timestamp columns are INGEST time, not source time — A3 is proven at the input boundary: " +
      "host-import memory rows == 0 (empty home) or only files mtime<T copied (asof).",
  };
}

function a2Proof(
  sandboxRepo: string,
  sourceRepo: string,
  at: string,
): { fixUnreachable: boolean; note: string } {
  // Find a real commit AFTER T in the source repo; assert it's not an object in the sandbox.
  const after = git(["log", "--all", "--since", at, "--reverse", "-1", "--format=%H"], sourceRepo);
  const futureSha = after.stdout.trim().split("\n")[0] ?? "";
  const allHashes = git(["log", "--all", "--format=%H"], sandboxRepo)
    .stdout.trim()
    .split("\n")
    .filter(Boolean);
  if (!futureSha) {
    return {
      fixUnreachable: allHashes.length === 1,
      note: `sandbox history has ${allHashes.length} commit(s); no post-T commit in source to test`,
    };
  }
  const exists = git(["cat-file", "-e", futureSha], sandboxRepo).code === 0;
  return {
    fixUnreachable: !exists && allHashes.length === 1,
    note: `post-T source commit ${futureSha.slice(0, 8)} present in sandbox = ${exists}; sandbox commits = ${allHashes.length}`,
  };
}

try {
  process.exitCode = main();
} catch (e) {
  console.error(e instanceof Error ? (e.stack ?? e.message) : String(e));
  process.exitCode = 1;
}
