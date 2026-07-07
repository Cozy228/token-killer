/**
 * `ctx doctor` (CTX-IMPL §7 CLI / §9 slice 1i) — READ-ONLY verification.
 *
 * Reports one line per check: name, pass/fail, an actionable fix. It verifies
 * the runtime (Node ≥22.5, SQLite ≥3.43), the store (openable + schema current),
 * the MCP registration (present + `ctx mcp`), the push blocks (present +
 * in-budget), and the egress guard (M14: it explains that `ctx mcp` REFUSES to
 * start when a model API key is in the environment — a 1g reviewer finding).
 *
 * Doctor never writes: every check opens/reads and closes. G-7 is structural —
 * the store opens under the caller-supplied `home`, and all placement reads are
 * under `projectRoot`; nothing touches the real `~/.claude`/`~/.copilot`.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { openStore } from "../store/store.ts";
import { runMigrations } from "../store/migrate.ts";
import { MemoryFiles } from "../memory/fileStore.ts";
import { memoryOpsReport } from "../memory/ops.ts";
import { readMemoryOptOut } from "../push/config.ts";
import { EGRESS_ENV_KEYS } from "../serve/egress.ts";
import { PUSH_MAX_BYTES } from "../push/block.ts";
import { DEFAULT_PUSH_TARGETS, extractManagedBlock } from "../push/hosts.ts";
import { MCP_CONFIG_FILE } from "./install.ts";
import { CTX_MCP_SERVER_NAME, isCtxMcpEntry, readMcpServer } from "./mcpConfig.ts";
import { compareVersion, MIN_NODE, MIN_SQLITE, nodeVersion, sqliteVersion } from "./versions.ts";

export interface DoctorCheck {
  /** Stable check id (also the reported name). */
  name: string;
  ok: boolean;
  /** What was observed (version, path, count). */
  detail: string;
  /** Actionable remedy when `ok` is false (omitted when passing). */
  fix?: string;
}

export interface DoctorReport {
  checks: DoctorCheck[];
  ok: boolean;
}

export interface DoctorOptions {
  /** Repo/checkout root holding `.mcp.json`, `AGENTS.md`, `CLAUDE.md`. */
  projectRoot: string;
  /** Data home for the store (default $CTX_HOME/~.ctx; tests MUST set — G-7). */
  home?: string;
  /** Project dir to resolve the shard from (default: `projectRoot`). */
  projectDir?: string;
  /** Env the egress-guard check inspects (default process.env; tests inject). */
  env?: NodeJS.ProcessEnv;
}

function readOrNull(path: string): string | null {
  return existsSync(path) ? readFileSync(path, "utf8") : null;
}

/** The highest migration NNN the shipped code knows (schema "current"). */
function latestSchemaVersion(): number {
  const db = new DatabaseSync(":memory:");
  try {
    return runMigrations(db).schemaVersion;
  } finally {
    db.close();
  }
}

function checkNode(): DoctorCheck {
  const v = nodeVersion();
  const ok = compareVersion(v, MIN_NODE) >= 0;
  return {
    name: "node",
    ok,
    detail: `Node ${v} (require ≥${MIN_NODE})`,
    ...(ok ? {} : { fix: `Upgrade Node to ≥${MIN_NODE} (node:sqlite requires it).` }),
  };
}

function checkSqlite(): DoctorCheck {
  try {
    const v = sqliteVersion();
    const ok = compareVersion(v, MIN_SQLITE) >= 0;
    return {
      name: "sqlite",
      ok,
      detail: `SQLite ${v} (require ≥${MIN_SQLITE})`,
      ...(ok ? {} : { fix: `Upgrade to a Node build linking SQLite ≥${MIN_SQLITE}.` }),
    };
  } catch (err) {
    return {
      name: "sqlite",
      ok: false,
      detail: `node:sqlite unavailable (${err instanceof Error ? err.message : String(err)})`,
      fix: "Use Node ≥22.5 with node:sqlite (add --experimental-sqlite on 22.5–22.12).",
    };
  }
}

function checkStore(opts: DoctorOptions): DoctorCheck {
  const latest = latestSchemaVersion();
  try {
    const store = openStore({
      projectDir: opts.projectDir ?? opts.projectRoot,
      ...(opts.home !== undefined ? { home: opts.home } : {}),
    });
    try {
      const observed = Number(store.getMeta("schema_version") ?? "0");
      const ok = observed === latest;
      return {
        name: "store",
        ok,
        detail: `store ${store.dbPath} openable, schema_version ${observed} (current ${latest})`,
        ...(ok ? {} : { fix: `Run \`ctx sync\` to migrate the store to schema ${latest}.` }),
      };
    } finally {
      store.close();
    }
  } catch (err) {
    return {
      name: "store",
      ok: false,
      detail: `store not openable (${err instanceof Error ? err.message : String(err)})`,
      fix: "Delete `~/.ctx/projects/<shard>` and run `ctx sync` (sources are authoritative, §11).",
    };
  }
}

function checkMcp(opts: DoctorOptions): DoctorCheck {
  const path = join(opts.projectRoot, MCP_CONFIG_FILE);
  const raw = readOrNull(path);
  if (raw === null) {
    return {
      name: "mcp",
      ok: false,
      detail: `no ${MCP_CONFIG_FILE} at ${opts.projectRoot}`,
      fix: "Run `ctx install` to register the `ctx mcp` server in `.mcp.json`.",
    };
  }
  try {
    const entry = readMcpServer(raw, CTX_MCP_SERVER_NAME);
    const ok = isCtxMcpEntry(entry);
    return {
      name: "mcp",
      ok,
      detail: ok
        ? `${MCP_CONFIG_FILE} registers '${CTX_MCP_SERVER_NAME}' → ${entry!.command} ${(entry!.args ?? []).join(" ")}`
        : `${MCP_CONFIG_FILE} present but '${CTX_MCP_SERVER_NAME}' registration missing/incorrect`,
      ...(ok ? {} : { fix: "Run `ctx install` to (re)register the `ctx mcp` server." }),
    };
  } catch (err) {
    return {
      name: "mcp",
      ok: false,
      detail: `${MCP_CONFIG_FILE} not parseable (${err instanceof Error ? err.message : String(err)})`,
      fix: "Fix the JSON in `.mcp.json`, then run `ctx install`.",
    };
  }
}

function checkPush(opts: DoctorOptions): DoctorCheck {
  const missing: string[] = [];
  const oversized: string[] = [];
  let maxBytes = 0;
  for (const name of DEFAULT_PUSH_TARGETS) {
    const raw = readOrNull(join(opts.projectRoot, name));
    const block = raw === null ? undefined : extractManagedBlock(raw);
    if (block === undefined) {
      missing.push(name);
      continue;
    }
    const bytes = Buffer.byteLength(block, "utf8");
    maxBytes = Math.max(maxBytes, bytes);
    if (bytes > PUSH_MAX_BYTES) oversized.push(`${name} (${bytes}B)`);
  }
  if (missing.length > 0) {
    return {
      name: "push",
      ok: false,
      detail: `push block absent in: ${missing.join(", ")}`,
      fix: "Run `ctx install` to place the push block (AGENTS.md floor + CLAUDE.md).",
    };
  }
  if (oversized.length > 0) {
    return {
      name: "push",
      ok: false,
      detail: `push block over ${PUSH_MAX_BYTES}B: ${oversized.join(", ")}`,
      fix: "The push digest exceeds the 1KB budget — reduce pinned gotchas in `.ctx/push.jsonc`.",
    };
  }
  return {
    name: "push",
    ok: true,
    detail: `push block present + in-budget (≤${PUSH_MAX_BYTES}B; max ${maxBytes}B) in ${DEFAULT_PUSH_TARGETS.join(", ")}`,
  };
}

function checkEgressGuard(opts: DoctorOptions): DoctorCheck {
  const env = opts.env ?? process.env;
  const present = EGRESS_ENV_KEYS.filter((k) => {
    const v = env[k];
    return v !== undefined && v !== "";
  });
  if (present.length > 0) {
    return {
      name: "egress-guard",
      ok: false,
      detail:
        `${present.join(", ")} set — \`ctx mcp\` will REFUSE to start (M14). ctx spends zero ` +
        "model tokens, so it refuses to coexist with a model API key rather than risk egress.",
      fix: `Unset ${present.join(", ")} in the environment that launches \`ctx mcp\`.`,
    };
  }
  return {
    name: "egress-guard",
    ok: true,
    detail:
      "armed: no model API key in env, so `ctx mcp` starts. If ANTHROPIC_API_KEY / " +
      "OPENAI_API_KEY were set, `ctx mcp` would refuse to start (M14, zero-egress).",
  };
}

/**
 * E8 memory ops surface: review queue size + oldest-item age, last-reindex
 * skipped + shadowedOverlay counts, sidecar dangling/orphan warnings, external
 * snapshot ages. ADVISORY — the check stays `ok` (aging items are expected and
 * never auto-expired, E8); only sidecar integrity problems flag a warning fix.
 * Read-only: opens the store, reads the `.ctx` layout, never writes / creates it.
 */
function checkMemoryOps(opts: DoctorOptions): DoctorCheck {
  try {
    const store = openStore({
      projectDir: opts.projectDir ?? opts.projectRoot,
      ...(opts.home !== undefined ? { home: opts.home } : {}),
    });
    try {
      const files = new MemoryFiles(join(opts.projectRoot, ".ctx"));
      const r = memoryOpsReport(store, files);
      const oldest =
        r.oldestReviewAgeMs !== undefined
          ? `${Math.floor(r.oldestReviewAgeMs / 86_400_000)}d`
          : "n/a";
      const snapshots =
        r.snapshotAges.length > 0
          ? r.snapshotAges
              .map((s) => `${s.carrier} ${Math.floor(s.ageMs / 86_400_000)}d`)
              .join(", ")
          : "none";
      // E4 per-repo opt-out (slice 5 item 4) — surface the write mode.
      const optedOut = readMemoryOptOut(join(opts.projectRoot, ".ctx"));
      const mode = optedOut
        ? "commit-memory OFF (E4: every memory write stays in your personal overlay — never committed)"
        : "commit-memory ON";
      const detail =
        `${mode}; review-queue ${r.reviewQueue} (oldest ${oldest}); reindex skipped ` +
        `${r.reindexSkipped}, shadowedOverlay ${r.shadowedOverlay}; sidecars dangling ` +
        `${r.danglingSidecars}, orphan ${r.orphanSidecars}; snapshots ${snapshots}`;
      const integrityBad = r.danglingSidecars > 0 || r.orphanSidecars > 0;
      return {
        name: "memory",
        ok: !integrityBad,
        detail,
        ...(integrityBad
          ? {
              fix: "Sidecar integrity drift — run `ctx sync` to rebuild; a persistent dangling/orphan sidecar means a hand-edited `.ctx/memory` log (review it).",
            }
          : {}),
      };
    } finally {
      store.close();
    }
  } catch (err) {
    return {
      name: "memory",
      ok: true, // advisory — a missing/unopenable store is reported by `store` above
      detail: `memory ops unavailable (${err instanceof Error ? err.message : String(err)})`,
    };
  }
}

/**
 * True when the checkout is a shallow clone. Resolves `.git` whether it is a
 * directory (normal repo), a `gitdir:` pointer file (linked worktree / submodule),
 * or has a `commondir` (linked worktree keeps `shallow` in the common dir). No git
 * spawn — pure filesystem, success-shaped (any read error → not shallow).
 */
function isShallowClone(projectRoot: string): boolean {
  try {
    const dotGit = join(projectRoot, ".git");
    if (!existsSync(dotGit)) return false;
    let gitDir = dotGit;
    if (statSync(dotGit).isFile()) {
      const m = /gitdir:\s*(.+)/.exec(readFileSync(dotGit, "utf8"));
      if (!m) return false;
      gitDir = resolve(projectRoot, m[1]!.trim());
    }
    const commonDirFile = join(gitDir, "commondir");
    const commonDir = existsSync(commonDirFile)
      ? resolve(gitDir, readFileSync(commonDirFile, "utf8").trim())
      : gitDir;
    return existsSync(join(commonDir, "shallow"));
  } catch {
    return false;
  }
}

/**
 * Slice-5 item 5 (slice-3 D2 handoff): a shallow clone truncates history, so the
 * `anchored-at` ancestry classifier cannot tell `unresolved-here` (anchor absent
 * on THIS branch) from `target-removed` (anchor genuinely deleted) drift. ADVISORY
 * — always `ok: true` (warn, never fail); the warning rides in `detail`.
 */
function checkGitDepth(opts: DoctorOptions): DoctorCheck {
  if (isShallowClone(opts.projectRoot)) {
    return {
      name: "git-depth",
      ok: true,
      detail:
        "WARNING: shallow clone (`.git/shallow` present) — merge-base depth is truncated, so the " +
        "`anchored-at` ancestry classifier is unreliable: an absent anchor may be mislabeled " +
        "`unresolved-here` vs `target-removed` (drift). Run `git fetch --unshallow` for accurate " +
        "drift classification. Advisory only — memory stays fully functional.",
    };
  }
  return {
    name: "git-depth",
    ok: true,
    detail:
      "full clone — `anchored-at` ancestry depth available for accurate drift classification.",
  };
}

/** Run every read-only check and roll up an overall pass/fail. */
export function runDoctor(opts: DoctorOptions): DoctorReport {
  const checks = [
    checkNode(),
    checkSqlite(),
    checkStore(opts),
    checkMcp(opts),
    checkPush(opts),
    checkEgressGuard(opts),
    checkMemoryOps(opts),
    checkGitDepth(opts),
  ];
  return { checks, ok: checks.every((c) => c.ok) };
}

/** Render a doctor report as CLI lines (name · PASS/FAIL · detail [· fix]). */
export function formatDoctorReport(report: DoctorReport): string[] {
  const lines = report.checks.map((c) => {
    const mark = c.ok ? "PASS" : "FAIL";
    const fix = c.ok ? "" : `\n    fix: ${c.fix ?? ""}`;
    return `  [${mark}] ${c.name}: ${c.detail}${fix}`;
  });
  lines.push(report.ok ? "ctx doctor: all checks passed" : "ctx doctor: some checks failed");
  return lines;
}
