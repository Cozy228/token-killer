/**
 * mine-tasks — propose task-bank candidates from real Claude Code session history.
 *
 * Authority: MEASUREMENT-DESIGN.md §3 (extraction recipe + inclusion criteria).
 * READ-ONLY over `~/.claude/projects/` and the mined repos (never writes there;
 * only writes `candidates.jsonl` + a yield table under --out). It PROPOSES
 * candidates with evidence + heuristic criteria flags; it does NOT decide the
 * bank and it does NOT author acceptance commands (Q5 — maintainer-authored).
 *
 * Recipe (§3): per session .jsonl, take the first `type:user & !isMeta` typed
 * human prompt → {cwd (repo), gitBranch, message.content (prompt), timestamp};
 * then `git log` around that timestamp for the fix-commit state as EVIDENCE.
 *
 * Usage:
 *   tsx mine-tasks.ts [--projects-dir <dir>] [--out <dir>] [--repo name=path]...
 *                     [--limit N] [--fix-window-hours 24]
 */
import { existsSync, readdirSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import {
  claudeProjectsDir,
  contentToText,
  DEFAULT_REPOS,
  git,
  isTypedHumanPrompt,
  readFileLines,
  type UserRecord,
  writeJson,
  writeJsonl,
} from "./lib.ts";

interface Candidate {
  id: string; // sessionId (task-opening prompt is the session's first typed turn)
  repo: string; // basename of cwd
  repo_path: string;
  repo_available: boolean;
  timestamp: string; // task T (ISO)
  gitBranch: string;
  prompt: string; // first ~400 chars of the opening human prompt
  fix_commit: string | null; // EVIDENCE: first commit after T within the window
  fix_commit_at: string | null;
  test_delta_evidence: boolean; // fix_commit touches a test/spec file
  criteria_flags: [boolean, boolean, boolean, boolean]; // §3 criteria 1..4 (heuristic)
  answer_in_repo_flag: boolean; // prompt text looks greppable in the repo at T
  accept_cmd: string; // LEFT EMPTY for the maintainer (Q5)
  smoke: boolean;
}

// --- §3 criterion heuristics (transparent, conservative — proposals only) ----

const CODE_VERBS =
  /\b(fix|bug|error|crash|fail(ing|s|ed)?|implement|add|refactor|rename|revert|patch|regression|throw|null|undefined|type\s*error|test|assert)\b/i;
const CODE_REF =
  /`[^`]+`|\b[\w./-]+\.(ts|tsx|js|mjs|cjs|json|sql|md|sh|rs|py|go|toml|yaml|yml)\b|\bfunction\b|\bclass\b|#\w+/;
const META_MARKERS =
  /(^\/|\bgrill\b|\bPRD\b|\broadmap\b|\bdesign\b|\b方案\b|\b设计\b|\b评审\b|\bplan\b|\bbrainstorm\b|\bthink\b|\bgoal\b|\bhandoff\b|\bquiz\b|\bhealth\b|\baudit\b|\bresearch\b|\b研究\b|\b梳理\b|\b讨论\b)/i;

/** c1: self-contained coding task (code verb + a concrete file/symbol reference). */
function isCodingTask(prompt: string): boolean {
  return CODE_VERBS.test(prompt) && CODE_REF.test(prompt);
}
/** c4: NOT a meta/workflow/design-chat prompt (§3 criterion 4 — the dominant class). */
function isNotMeta(prompt: string): boolean {
  return !META_MARKERS.test(prompt);
}

// --- git evidence (read-only) -----------------------------------------------

/** First commit strictly after T within the window on the repo — fix EVIDENCE. */
function findFixCommit(
  repoPath: string,
  atIso: string,
  windowHours: number,
): { sha: string; at: string; touchesTest: boolean } | null {
  const until = new Date(new Date(atIso).getTime() + windowHours * 3_600_000).toISOString();
  // Ascending so the FIRST commit after T is first; --all to survive branch churn.
  const log = git(
    ["log", "--all", "--reverse", "--since", atIso, "--until", until, "--format=%H %cI"],
    repoPath,
  );
  if (log.code !== 0) return null;
  const first = log.stdout.split("\n").find((l) => l.trim().length > 0);
  if (!first) return null;
  const [sha, at] = first.trim().split(" ");
  if (!sha) return null;
  const stat = git(["show", "--stat", "--format=", sha as string], repoPath);
  const touchesTest = /\b[\w./-]*(test|spec|__tests__)[\w./-]*\.(ts|tsx|js|mjs|py|rs|go)\b/i.test(
    stat.stdout,
  );
  return { sha: sha as string, at: at ?? "", touchesTest };
}

// --- mining -----------------------------------------------------------------

interface Yield {
  files_scanned: number;
  user_records: number;
  sessions_with_typed_prompt: number;
  after_c1_coding_task: number;
  after_c2_objective_acceptance: number;
  after_c3_repo_reconstructable: number;
  after_c4_not_meta: number;
  survived_all: number;
}

function mine(
  projectsDir: string,
  repos: Record<string, string>,
  windowHours: number,
): {
  candidates: Candidate[];
  yields: Yield;
} {
  const y: Yield = {
    files_scanned: 0,
    user_records: 0,
    sessions_with_typed_prompt: 0,
    after_c1_coding_task: 0,
    after_c2_objective_acceptance: 0,
    after_c3_repo_reconstructable: 0,
    after_c4_not_meta: 0,
    survived_all: 0,
  };
  const candidates: Candidate[] = [];
  const repoByPath = new Map(Object.values(repos).map((p) => [p, true]));

  if (!existsSync(projectsDir)) return { candidates, yields: y };
  const projDirs = readdirSync(projectsDir).filter((d) =>
    statSync(join(projectsDir, d)).isDirectory(),
  );

  for (const pd of projDirs) {
    const full = join(projectsDir, pd);
    const files = readdirSync(full).filter((f) => f.endsWith(".jsonl"));
    for (const f of files) {
      y.files_scanned++;
      let opening: { rec: UserRecord; text: string } | null = null;
      for (const line of readFileLines(join(full, f))) {
        let rec: UserRecord;
        try {
          rec = JSON.parse(line) as UserRecord;
        } catch {
          continue;
        }
        if (rec.type === "user") y.user_records++;
        if (opening === null && isTypedHumanPrompt(rec)) {
          opening = { rec, text: contentToText(rec.message?.content) };
          // keep scanning for the record count, but the opening prompt is fixed
        }
      }
      if (!opening) continue;
      y.sessions_with_typed_prompt++;

      const rec = opening.rec;
      const prompt = opening.text.slice(0, 400).replace(/\s+/g, " ").trim();
      const repoPath = rec.cwd ?? "";
      const repoName = repoPath ? basename(repoPath) : "?";
      const repoAvailable = repoPath.length > 0 && existsSync(join(repoPath, ".git"));

      const c1 = isCodingTask(opening.text);
      const c4 = isNotMeta(opening.text);
      let fix: ReturnType<typeof findFixCommit> = null;
      let c3 = false;
      if (repoAvailable && rec.timestamp) {
        // c3: repo reconstructable at a pinned SHA around T.
        const before = git(
          ["log", "--all", "--before", rec.timestamp, "-1", "--format=%H"],
          repoPath,
        );
        c3 = before.code === 0 && before.stdout.trim().length > 0;
        fix = findFixCommit(repoPath, rec.timestamp, windowHours);
      }
      const c2 = Boolean(fix?.touchesTest); // objective acceptance derivable (evidence)
      // §3 "answer discoverable at T" is assessed by the maintainer against the
      // pinned SHA tree (the miner does not check out per candidate); left false.
      const answerInRepo = false;

      if (c1) y.after_c1_coding_task++;
      if (c2) y.after_c2_objective_acceptance++;
      if (c3) y.after_c3_repo_reconstructable++;
      if (c4) y.after_c4_not_meta++;
      const survivedAll = c1 && c2 && c3 && c4;
      if (survivedAll) y.survived_all++;

      candidates.push({
        id: rec.sessionId ?? f.replace(/\.jsonl$/, ""),
        repo: repoName,
        repo_path: repoPath,
        repo_available: repoAvailable,
        timestamp: rec.timestamp ?? "",
        gitBranch: rec.gitBranch ?? "",
        prompt,
        fix_commit: fix?.sha ?? null,
        fix_commit_at: fix?.at ?? null,
        test_delta_evidence: Boolean(fix?.touchesTest),
        criteria_flags: [c1, c2, c3, c4],
        answer_in_repo_flag: answerInRepo,
        accept_cmd: "", // Q5: maintainer authors from the real fix commit's test delta
        smoke: false,
      });
    }
  }
  // Strongest candidates first: all criteria, then criterion count, then recency.
  candidates.sort((a, b) => {
    const sa = a.criteria_flags.filter(Boolean).length;
    const sb = b.criteria_flags.filter(Boolean).length;
    if (sa !== sb) return sb - sa;
    return b.timestamp.localeCompare(a.timestamp);
  });
  return { candidates, yields: y };
}

function renderYield(y: Yield, repos: Record<string, string>): string {
  return [
    "## yield vs full mined population (design §3)",
    "",
    `| stage | count |`,
    `|---|---|`,
    `| session .jsonl files scanned | ${y.files_scanned} |`,
    `| \`type:user\` records | ${y.user_records} |`,
    `| sessions with a typed human opening prompt | ${y.sessions_with_typed_prompt} |`,
    `| — survive c1 (coding task) | ${y.after_c1_coding_task} |`,
    `| — survive c2 (objective acceptance derivable) | ${y.after_c2_objective_acceptance} |`,
    `| — survive c3 (repo reconstructable at SHA) | ${y.after_c3_repo_reconstructable} |`,
    `| — survive c4 (not meta/workflow) | ${y.after_c4_not_meta} |`,
    `| **survive ALL four (strong candidates)** | **${y.survived_all}** |`,
    "",
    `repos considered: ${Object.entries(repos)
      .map(([n, p]) => `${n} (${existsSync(join(p, ".git")) ? "available" : "absent"})`)
      .join(", ")}`,
    y.survived_all < 10
      ? `\n⚠ Bank-shortfall (Q17): <10 strong candidates. Do NOT pad with synthetic ` +
        `prompts — extend with maintainer post-authored acceptance tests (read ONLY the ` +
        `fix commit), or accept smaller N and scale the R1 gate (e.g. ≥6/8).`
      : "",
  ].join("\n");
}

// --- entry ------------------------------------------------------------------

function parseFlags(argv: string[]): {
  flags: Record<string, string>;
  repos: Record<string, string>;
} {
  const flags: Record<string, string> = {};
  const repos: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] as string;
    if (a === "--repo") {
      const kv = argv[++i] ?? "";
      const eq = kv.indexOf("=");
      if (eq > 0) repos[kv.slice(0, eq)] = kv.slice(eq + 1);
    } else if (a.startsWith("--")) {
      const key = a.slice(2);
      flags[key] = argv[i + 1] && !argv[i + 1]!.startsWith("--") ? (argv[++i] as string) : "true";
    }
  }
  return { flags, repos };
}

function main(): number {
  const { flags, repos: repoOverrides } = parseFlags(process.argv.slice(2));
  const projectsDir = flags["projects-dir"] ?? claudeProjectsDir();
  const outDir = flags.out ?? join(process.cwd(), "tools", "measurement", ".work");
  const repos = Object.keys(repoOverrides).length > 0 ? repoOverrides : DEFAULT_REPOS;
  const windowHours = flags["fix-window-hours"] ? Number(flags["fix-window-hours"]) : 24;

  console.log(`mining ${projectsDir} (read-only) …`);
  const { candidates, yields } = mine(projectsDir, repos, windowHours);
  const limited = flags.limit ? candidates.slice(0, Number(flags.limit)) : candidates;

  writeJsonl(join(outDir, "candidates.jsonl"), limited);
  writeJson(join(outDir, "yield.json"), yields);
  console.log(renderYield(yields, repos));
  console.log(`\nwrote ${limited.length} candidates → ${join(outDir, "candidates.jsonl")}`);
  console.log(
    `top strong candidates:\n` +
      limited
        .filter((c) => c.criteria_flags.every(Boolean))
        .slice(0, 8)
        .map(
          (c) =>
            `  [${c.criteria_flags.map((f) => (f ? "1" : "0")).join("")}] ${c.repo} ${c.timestamp} — ${c.prompt.slice(0, 80)}`,
        )
        .join("\n"),
  );
  return 0;
}

process.exitCode = main();
