/**
 * grade-cell — run a task's acceptance command in the POST-RUN sandbox and record
 * `pass` from the exit code, SEPARATELY from the agent's `is_error` (design §2 M2:
 * `is_error:false` does NOT imply pass — grade objectively). The acceptance command
 * is maintainer-authored (Q5); grade-cell just executes it and records the bit.
 *
 * Usage:
 *   tsx grade-cell.ts --taskdir <dir> --runsdir <dir> --arm <A|B> --rep <n>
 */
import { existsSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { CellRow } from "./run-cell.ts";
import { readJson, run, WORKSPACE, writeJson } from "./lib.ts";

function flags(argv: string[]): Record<string, string> {
  const f: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] as string;
    if (a.startsWith("--"))
      f[a.slice(2)] =
        argv[i + 1] && !argv[i + 1]!.startsWith("--") ? (argv[++i] as string) : "true";
  }
  return f;
}

function main(): number {
  const f = flags(process.argv.slice(2));
  for (const r of ["taskdir", "runsdir", "arm", "rep"])
    if (!f[r]) {
      console.error(`missing --${r}`);
      return 2;
    }
  const meta = readJson<{ task: string; accept_cmd: string; smoke: boolean }>(
    join(f.taskdir as string, "meta.json"),
  );
  // Absolutize: accept_cmd runs with cwd = the scratch repo, so the script path
  // must be absolute (a relative path would resolve inside the repo → 127).
  const cellDir = join(resolve(f.runsdir as string), `${meta.task}.${f.arm}.${f.rep}`);
  const rowPath = join(cellDir, "row.json");
  const scratchRepo = join(cellDir, "repo");
  const row = readJson<CellRow>(rowPath);

  if (!meta.accept_cmd || meta.accept_cmd.trim().length === 0) {
    row.pass = null;
    row.void_reason = row.void_reason ?? "no accept_cmd (maintainer must author — Q5)";
    writeJson(rowPath, row);
    console.log(`grade ${meta.task} ${f.arm} ${f.rep}: SKIPPED — no accept_cmd`);
    return 0;
  }
  if (row.void_reason) {
    // A void run (budget/transport) is not graded — it never produced a real result.
    row.pass = null;
    writeJson(rowPath, row);
    console.log(`grade ${meta.task} ${f.arm} ${f.rep}: SKIPPED — void (${row.void_reason})`);
    return 0;
  }

  // Write the accept_cmd to a script (multi-line safe) OUTSIDE the graded tree, run
  // it with cwd = the post-run scratch repo. Exit 0 ⇔ pass (M2), independent of is_error.
  const acceptScript = join(cellDir, "accept.sh");
  writeFileSync(
    acceptScript,
    meta.accept_cmd.endsWith("\n") ? meta.accept_cmd : meta.accept_cmd + "\n",
  );
  // TK_MEASURE_DIR lets an accept_cmd materialize committed test assets (e.g. a fix
  // commit's FAIL_TO_PASS test under atlas-tests/<task>/) — the sandbox can't reach
  // the source repo's git objects, so the test is stored in-repo and copied in here.
  // Derived from the harness location → portable (no hard-coded home path).
  const measureDir = join(WORKSPACE, "tools", "measurement");
  const res = run("bash", [acceptScript], {
    cwd: scratchRepo,
    env: { ...process.env, TK_MEASURE_DIR: measureDir },
    timeout: 300_000,
  });
  row.pass = res.code === 0;
  writeJson(rowPath, row);
  // Persist a small grade artifact for audit.
  writeJson(join(cellDir, "grade.json"), {
    task: meta.task,
    arm: f.arm,
    rep: Number(f.rep),
    accept_exit: res.code,
    pass: row.pass,
    is_error: row.is_error, // shown side-by-side to make the separation auditable
    smoke: meta.smoke,
    stdout_tail: res.stdout.slice(-500),
    stderr_tail: res.stderr.slice(-500),
  });
  if (existsSync(acceptScript)) rmSync(acceptScript);
  console.log(
    `grade ${meta.task} ${f.arm} ${f.rep}: accept_exit=${res.code} pass=${row.pass} ` +
      `(is_error=${row.is_error}, independent) smoke=${meta.smoke}`,
  );
  return 0;
}

process.exitCode = main();
