import { spawnSync } from "node:child_process";
import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { filterWithFallback } from "../src/core/pipeline.js";
import { routeCommand } from "../src/router.js";
import type { ParsedCommand, RawResult, TkOptions } from "../src/types.js";
import { commandAvailable } from "./liveComparisonCases.js";

const compareBinDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "compare-bin");

const STUB_PATH_PROGRAMS = new Set(["aws", "docker", "kubectl", "curl", "wget", "psql", "glab", "pip"]);

export type RtkWrapperSpec = {
  mode: "exec-cat" | "file-arg" | "dir-package";
  sub: string[];
};

export type FixtureComparisonCase = {
  name: string;
  fixture: string;
  command: string[];
  exitCode?: number;
  /** tk-only handler with no rtk filter: report rtk as raw passthrough (0% savings). */
  rtkUnsupported?: boolean;
  /** rtk wrapper invocation (command/file/dir input) instead of stdin — see runRtkWrapperFixture. */
  rtkWrapper?: RtkWrapperSpec;
};

const defaultOptions: TkOptions = {
  raw: false,
  stats: false,
  verbose: false,
  maxLines: 120,
  maxChars: 12000,
  saveRaw: false,
  cwd: "",
};

function toParsed(command: string[]): ParsedCommand {
  return {
    program: command[0] ?? "",
    args: command.slice(1),
    original: command,
    displayCommand: command.join(" "),
  };
}

function hasExplicitGrepFormat(args: string[]): boolean {
  return args.some((arg) =>
    ["-c", "--count", "-l", "--files-with-matches", "-L", "--files-without-match", "-o", "--only-matching", "-Z", "--null"].includes(
      arg,
    ),
  );
}

/** Map fixture-backed commands to an rtk invocation that reads filtered input from stdin. */
export function buildRtkFixtureArgv(command: string[]): string[] | null {
  const [program, ...args] = command;

  // npx <tool> re-dispatches to <tool>'s filter; map to the inner tool's rtk filter.
  if (program === "npx") {
    const [tool, ...toolArgs] = args;
    return tool ? buildRtkFixtureArgv([tool, ...toolArgs]) : null;
  }

  if (program === "pipe") {
    const filter = args[0];
    return filter ? ["pipe", "-f", filter] : ["pipe"];
  }

  if (program === "rg") return ["pipe", "-f", "rg"];
  if (program === "grep") {
    if (hasExplicitGrepFormat(args)) return null;
    return ["pipe", "-f", "grep"];
  }
  if (program === "find") return ["pipe", "-f", "find"];

  if (program === "git") {
    const sub = args[0];
    if (sub === "status" || args.length === 0) return ["pipe", "-f", "git-status"];
    if (sub === "diff") return ["pipe", "-f", "git-diff"];
    if (sub === "log") return ["pipe", "-f", "git-log"];
    if (sub === "worktree") return ["git", "worktree", ...args.slice(1)];
    return null;
  }

  if (program === "gh") return ["gh", ...args];
  if (program === "glab") return commandAvailable("glab") ? ["glab", ...args] : null;
  if (program === "gt") return commandAvailable("gt") ? ["gt", ...args] : null;

  if (program === "pytest") return ["pipe", "-f", "pytest"];
  if (program === "pip" && args[0] === "list") return ["pip", "list"];
  if (program === "tsc") return ["pipe", "-f", "tsc"];
  if (program === "vitest" || program === "jest") return ["pipe", "-f", "vitest"];
  if (program === "mypy") return ["pipe", "-f", "mypy"];
  if (program === "ruff") {
    if (args[0] === "check") return ["pipe", "-f", "ruff-check"];
    if (args[0] === "format") return ["pipe", "-f", "ruff-format"];
    return null;
  }
  if (program === "prettier") return ["pipe", "-f", "prettier"];
  if (program === "log") return ["pipe", "-f", "log"];

  if (program === "diff") {
    if (args[0] === "-") return ["diff", "-"];
    return null;
  }

  if (program === "kubectl" && commandAvailable("kubectl")) {
    const nextArgs = [...args];
    if (!nextArgs.includes("-o") && !nextArgs.includes("--output")) {
      nextArgs.push("-o", "json");
    }
    return ["kubectl", ...nextArgs];
  }

  if (program && STUB_PATH_PROGRAMS.has(program) && commandAvailable(program)) {
    return [program, ...args];
  }

  return null;
}

export function skipFixtureReason(testCase: FixtureComparisonCase): string | null {
  // Wrapper commands (err/summary/deps/smart) are compared via runRtkWrapperFixture.
  if (testCase.rtkWrapper) return null;

  const rtkArgv = buildRtkFixtureArgv(testCase.command);
  if (!rtkArgv) {
    const [prog] = testCase.command;
    if (prog === "test") {
      return "rtk test detects the framework from the executed command string; feeding fixture stdin via `cat` falls to the generic branch (not comparable)";
    }
    if (prog === "dotnet") {
      return "rtk dotnet needs a real project / TRX file; no fixture stdin mapping";
    }
    return "no fixture-safe rtk stdin mapping";
  }

  const [program, ...args] = testCase.command;
  if (program === "rg" && args.includes("--json")) {
    return "rg --json is explicit machine-readable output";
  }
  if (program === "eslint") return "rtk pipe has no eslint/lint filter (see live eslint case)";
  if (program === "format" || program === "next" || program === "npm" || program === "prisma") {
    return "use live case: rtk runs the real tool";
  }
  if (program === "playwright") return "rtk playwright needs live JSON reporter run";
  if (program && STUB_PATH_PROGRAMS.has(program) && !commandAvailable(program)) {
    return `${program} not installed`;
  }
  if (program === "aws") {
    return "rtk aws filter does not accept fixture stdin reliably";
  }
  if (program === "docker") {
    return "rtk docker compose ps does not read fixture stdin; see live docker case";
  }
  if (program === "wget" || program === "curl") {
    return "rtk invokes network fetch; see live curl/wget cases";
  }
  if (program === "pip" && !commandAvailable("pip")) {
    return "pip not installed";
  }
  if (["mvn", "./gradlew", "javac"].includes(program ?? "")) {
    return `${program} has no rtk pipe filter`;
  }
  if (program === "pnpm" || program === "npm") {
    if (testCase.command.includes("list")) return "see live pnpm/npm list case";
  }
  if (program === "env" || program === "json" || program === "wc") {
    return "see live env/json/wc cases";
  }
  if (program === "cat" || program === "less" || program === "type") {
    return "rtk read expects a real file path, not fixture stdin";
  }
  if (program === "ls" || program === "tree") {
    return "rtk ls/tree run live listing; use find/rg fixture rows";
  }

  if (program === "diff" && testCase.command[1] !== "-") {
    return "two-file diff fixtures need on-disk paths";
  }

  if (program === "git") {
    const sub = testCase.command[1];
    if (["add", "commit", "push", "pull", "fetch", "stash"].includes(sub ?? "")) {
      return `git ${sub} has no fixture stdin mapping`;
    }
  }

  return null;
}

export async function readFixtureText(repoRoot: string, fixture: string): Promise<string> {
  return readFile(path.join(repoRoot, fixture), "utf8");
}

export async function filterTgFixture(
  command: string[],
  rawText: string,
  exitCode: number,
  cwd: string,
): Promise<string> {
  const options = { ...defaultOptions, cwd };
  const parsed = toParsed(command);
  const handler = routeCommand(parsed);
  const raw: RawResult = {
    command: command.join(" "),
    stdout: rawText,
    stderr: "",
    exitCode,
    durationMs: 1,
  };
  const filtered = await filterWithFallback(handler, raw, parsed, options);
  return filtered.output;
}

export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function fixtureRtkShell(repoRoot: string, fixture: string, rtkArgv: string[]): string {
  const fixturePath = path.join(repoRoot, fixture);
  return `cat ${shellQuote(fixturePath)} | rtk ${rtkArgv.join(" ")}`;
}

const MAX_BUFFER = 20 * 1024 * 1024;

function rtkEnv(program: string | undefined): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    GIT_PAGER: "",
    PAGER: "",
    NO_COLOR: "1",
    AWS_DEFAULT_REGION: process.env.AWS_DEFAULT_REGION ?? "us-east-1",
  };
  if (program && STUB_PATH_PROGRAMS.has(program)) {
    env.PATH = `${compareBinDir}:${env.PATH ?? ""}`;
  }
  return env;
}

export function runRtkFixture(
  repoRoot: string,
  fixture: string,
  rtkArgv: string[],
): { stdout: string; stderr: string; exitCode: number } {
  const program = rtkArgv[0];
  const result = spawnSync("sh", ["-c", fixtureRtkShell(repoRoot, fixture, rtkArgv)], {
    cwd: repoRoot,
    encoding: "utf8",
    env: rtkEnv(program),
    maxBuffer: MAX_BUFFER,
  });
  return {
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    exitCode: result.status ?? 1,
  };
}

/**
 * Run a native rtk *wrapper* command against a fixture. Unlike the stdin pipe
 * filters, rtk's err/summary/deps/smart read a command/file/dir, so we feed the
 * fixture three ways depending on the wrapper (see RtkWrapperSpec).
 */
export function runRtkWrapperFixture(
  repoRoot: string,
  fixture: string,
  spec: RtkWrapperSpec,
): { stdout: string; stderr: string; exitCode: number; rtkCmd: string } {
  const fixturePath = path.join(repoRoot, fixture);
  const env: NodeJS.ProcessEnv = { ...process.env, GIT_PAGER: "", PAGER: "", NO_COLOR: "1" };
  const run = (argv: string[], rtkCmd: string) => {
    const result = spawnSync("rtk", argv, { cwd: repoRoot, encoding: "utf8", env, maxBuffer: MAX_BUFFER });
    return {
      stdout: result.stdout ?? "",
      stderr: result.stderr ?? "",
      exitCode: result.status ?? 1,
      rtkCmd,
    };
  };

  if (spec.mode === "exec-cat") {
    // rtk runs the given command; `cat <fixture>` makes the fixture its stdout.
    const arg = `cat ${shellQuote(fixturePath)}`;
    return run([...spec.sub, arg], `rtk ${spec.sub.join(" ")} ${shellQuote(`cat ${fixture}`)}`);
  }
  if (spec.mode === "file-arg") {
    return run([...spec.sub, fixturePath], `rtk ${spec.sub.join(" ")} ${fixture}`);
  }
  // dir-package: rtk deps scans a directory; stage the fixture as its package.json.
  const dir = mkdtempSync(path.join(os.tmpdir(), "tk-deps-"));
  try {
    copyFileSync(fixturePath, path.join(dir, "package.json"));
    return run([...spec.sub, dir], `rtk ${spec.sub.join(" ")} <tmpdir with ${path.basename(fixture)} as package.json>`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
