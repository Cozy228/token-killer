import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

export type LiveComparisonCase = {
  name: string;
  command: string[];
  rawCommand?: string[];
  rtkCommand?: string[];
  cwd?: string;
  requires?: Array<
    | "git"
    | "rg"
    | "tree"
    | "tsc"
    | "pnpm"
    | "node"
    | "gh"
    | "aws"
    | "docker"
    | "kubectl"
    | "glab"
    | "gt"
    | "pip"
    | "pytest"
    | "mypy"
    | "curl"
    | "wget"
    | "psql"
  >;
};

const COMMAND_ALIASES: Record<string, string[]> = {
  pip: ["pip", "pip3"],
  pytest: ["pytest", "py.test"],
  mypy: ["mypy"],
  python: ["python3", "python"],
};

export function commandAvailable(name: string): boolean {
  const candidates = COMMAND_ALIASES[name] ?? [name];
  for (const candidate of candidates) {
    try {
      execFileSync("which", [candidate], { stdio: "ignore" });
      return true;
    } catch {
      // try next alias
    }
  }
  return false;
}

export function resolveCommand(name: string): string {
  const candidates = COMMAND_ALIASES[name] ?? [name];
  for (const candidate of candidates) {
    if (commandAvailable(candidate)) return candidate;
  }
  return candidates[0] ?? name;
}

export function skipReason(testCase: LiveComparisonCase): string | null {
  for (const req of testCase.requires ?? []) {
    if (req === "git" || req === "node" || req === "pnpm" || req === "tsc") continue;
    if (!commandAvailable(req)) {
      return `${req} not installed`;
    }
  }

  if (testCase.command[0] === "gh" && !commandAvailable("gh")) {
    return "gh not available";
  }

  if (testCase.command[0] === "eslint" && !commandAvailable("eslint")) {
    return "eslint not available";
  }

  if (testCase.command[0] === "vitest" && !commandAvailable("vitest") && !commandAvailable("pnpm")) {
    return "vitest not available";
  }

  if (testCase.command[0] === "ruff" && !commandAvailable("ruff")) {
    return "ruff not available";
  }

  if (testCase.command[0] === "pytest" && !commandAvailable("pytest")) {
    return "pytest not available";
  }

  return null;
}

export function buildRawArgv(command: string[]): string[] {
  if (command[0] === "git") {
    return ["git", "--no-pager", ...command.slice(1)];
  }
  return [...command];
}

export function buildRtkArgv(command: string[]): string[] {
  const [program, ...args] = command;

  switch (program) {
    case "cat":
      return ["read", args[0] ?? "."];
    case "ls":
      return ["ls", ...args];
    case "tree":
      return ["tree", ...args];
    case "find":
      return ["find", ...args];
    case "rg":
      return ["grep", args[0] ?? "", args[1] ?? "."].filter(Boolean);
    case "grep": {
      const patternIndex = args.findIndex((arg) => !arg.startsWith("-"));
      const pattern = args[patternIndex] ?? "";
      const pathArg = args[patternIndex + 1] ?? ".";
      return ["grep", pattern, pathArg];
    }
    case "git":
      return ["git", ...args];
    case "diff":
      return ["diff", ...args];
    case "pnpm":
      return ["pnpm", ...args];
    case "npm":
      if (args[0] === "list") return ["deps"];
      return ["npm", ...args];
    case "tsc":
      return ["tsc", ...args];
    case "eslint":
      return ["lint", ...args];
    case "vitest":
      return ["vitest", ...args];
    case "jest":
      return ["jest", ...args];
    case "gh":
      return ["gh", ...args];
    case "glab":
      return ["glab", ...args];
    case "gt":
      return ["gt", ...args];
    case "pytest":
      return ["pytest", ...args];
    case "ruff":
      return ["ruff", ...args];
    case "mypy":
      return ["mypy", ...args];
    case "pip":
      return ["pip", ...args];
    case "mvn":
      return ["mvn", ...args];
    case "javac":
      return ["javac", ...args];
    case "aws":
      return ["aws", ...args];
    case "docker":
      return ["docker", ...args];
    case "kubectl":
      return ["kubectl", ...args];
    case "curl":
      return ["curl", ...args];
    case "wget":
      return ["wget", ...args];
    case "psql":
      return ["psql", ...args];
    case "env":
      return ["env"];
    case "json":
      return ["json", ...args];
    case "log":
      return ["log", ...args];
    case "wc":
      return ["wc", ...args];
    case "format":
      return ["format", ...args];
    case "next":
      return ["next", ...args];
    case "prisma":
      return ["prisma", ...args];
    case "prettier":
      return ["prettier", ...args];
    case "playwright":
      return ["playwright", ...args];
    case "pipe":
      return ["pipe", ...args];
    default:
      if (program.startsWith("./")) return command;
      return command;
  }
}

export function createDiffFixture(): { dir: string; oldPath: string; newPath: string; cleanup: () => void } {
  const dir = mkdtempSync(path.join(tmpdir(), "tg-compare-diff-"));
  const oldPath = path.join(dir, "old.ts");
  const newPath = path.join(dir, "new.ts");
  writeFileSync(oldPath, "export const value = 1;\n", "utf8");
  writeFileSync(newPath, "export const value = 1;\nexport const extra = 2;\n", "utf8");
  return {
    dir,
    oldPath,
    newPath,
    cleanup: () => {
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

export const liveComparisonCases: LiveComparisonCase[] = [
  {
    name: "read-like: cat package.json",
    command: ["cat", "package.json"],
  },
  {
    name: "read-like: cat src/cli.ts",
    command: ["cat", "src/cli.ts"],
  },
  {
    name: "read-like: cat docs/DESIGN.md",
    command: ["cat", "docs/DESIGN.md"],
  },
  {
    name: "list-like: ls -la .",
    command: ["ls", "-la", "."],
  },
  {
    name: "list-like: find src -name *.ts",
    command: ["find", "src", "-name", "*.ts"],
    requires: ["node"],
  },
  {
    name: "list-like: tree .",
    command: ["tree", "."],
    requires: ["tree"],
  },
  {
    name: "search-like: rg export src/",
    command: ["rg", "export", "src/"],
    requires: ["rg"],
  },
  {
    name: "search-like: grep -r import src/",
    command: ["grep", "-r", "import", "src/"],
    requires: ["node"],
  },
  {
    name: "git-status: git status",
    command: ["git", "status"],
    requires: ["git"],
  },
  {
    name: "git-log: git log --oneline -10",
    command: ["git", "log", "--oneline", "-10"],
    requires: ["git"],
  },
  {
    name: "git-diff: git diff HEAD~1",
    command: ["git", "diff", "HEAD~1"],
    requires: ["git"],
  },
  {
    name: "git-branch: git branch",
    command: ["git", "branch"],
    requires: ["git"],
  },
  {
    name: "git-show: git show -1 --stat",
    command: ["git", "show", "-1", "--stat"],
    requires: ["git"],
  },
  {
    name: "git-worktree: git worktree list",
    command: ["git", "worktree", "list"],
    requires: ["git"],
  },
  {
    name: "package-list: pnpm list --depth=0",
    command: ["pnpm", "list", "--depth=0"],
    requires: ["pnpm"],
  },
  {
    name: "tsc: tsc --noEmit clean project",
    command: ["tsc", "--noEmit"],
    rawCommand: ["pnpm", "exec", "tsc", "--noEmit"],
    rtkCommand: ["tsc", "--noEmit"],
    requires: ["pnpm", "node"],
  },
  {
    name: "js-test: vitest run savings test",
    command: ["pnpm", "exec", "vitest", "run", "tests/unit/savings.test.ts"],
    rawCommand: ["pnpm", "exec", "vitest", "run", "tests/unit/savings.test.ts"],
    rtkCommand: ["vitest", "run", "tests/unit/savings.test.ts"],
    requires: ["pnpm", "node"],
  },
  {
    name: "generic: echo hello",
    command: ["echo", "hello"],
  },
  {
    name: "wc: wc README.md",
    command: ["wc", "README.md"],
  },
  {
    name: "env: env snapshot",
    command: ["env"],
  },
  {
    name: "json: json package.json",
    command: ["json", "package.json"],
  },
  {
    name: "log: log repeated app fixture",
    command: ["log", "tests/fixtures/system/app_repeated.log"],
  },
  {
    name: "eslint: eslint package.json",
    command: ["pnpm", "exec", "eslint", "package.json"],
    rawCommand: ["pnpm", "exec", "eslint", "package.json"],
    rtkCommand: ["lint", "package.json"],
    requires: ["pnpm", "node"],
  },
  {
    name: "ruff: ruff check src/handlers/index.ts",
    command: ["ruff", "check", "src/handlers/index.ts"],
    requires: ["node"],
  },
  {
    name: "pytest: pytest --collect-only",
    command: ["pytest", "--collect-only", "-q", "tests/unit/savings.test.ts"],
    rawCommand: [resolveCommand("pytest"), "--collect-only", "-q", "tests/unit/savings.test.ts"],
    rtkCommand: ["pytest", "--collect-only", "-q", "tests/unit/savings.test.ts"],
    requires: ["pytest", "node"],
  },
  {
    name: "pip: pip list",
    command: ["pip", "list"],
    rawCommand: [resolveCommand("pip"), "list"],
    rtkCommand: ["pip", "list"],
    requires: ["pip"],
  },
  {
    name: "mypy: mypy src/handlers/index.ts",
    command: ["mypy", "src/handlers/index.ts"],
    rawCommand: [resolveCommand("mypy"), "src/handlers/index.ts"],
    rtkCommand: ["mypy", "src/handlers/index.ts"],
    requires: ["mypy", "node"],
  },
  {
    name: "prettier: check package.json",
    command: ["pnpm", "exec", "prettier", "--check", "package.json"],
    rawCommand: ["pnpm", "exec", "prettier", "--check", "package.json"],
    rtkCommand: ["prettier", "--check", "package.json"],
    requires: ["pnpm", "node"],
  },
  {
    name: "format: format --check",
    command: ["format", "--check"],
    rawCommand: ["pnpm", "exec", "prettier", "--check", "package.json", "README.md", "src/cli.ts"],
    rtkCommand: ["format", "--check"],
    requires: ["pnpm", "node"],
  },
  {
    name: "curl: httpbin json",
    command: ["curl", "-s", "https://httpbin.org/json"],
    requires: ["curl"],
  },
  {
    name: "wget: example.com head",
    command: ["wget", "-q", "-O", "-", "https://example.com/"],
    requires: ["wget"],
  },
  {
    name: "git-add: missing path",
    command: ["git", "add", "__tg_missing_fixture_file__"],
    requires: ["git"],
  },
  {
    name: "git-commit: dry-run",
    command: ["git", "commit", "--dry-run"],
    requires: ["git"],
  },
  {
    name: "git-push: dry-run local",
    command: ["git", "push", "--dry-run", ".", "HEAD:refs/heads/__tg_fixture_branch__"],
    requires: ["git"],
  },
  {
    name: "git-pull: ff-only local",
    command: ["git", "pull", "--ff-only", ".", "HEAD"],
    requires: ["git"],
  },
  {
    name: "git-fetch: missing remote",
    command: ["git", "fetch", "/tmp/__tg_missing_remote__", "main"],
    requires: ["git"],
  },
  {
    name: "git-stash: invalid ref",
    command: ["git", "stash", "show", "stash@{999999}"],
    requires: ["git"],
  },
  {
    name: "gt: gt log",
    command: ["gt", "log"],
    requires: ["gt"],
  },
  {
    name: "glab: mr list",
    command: ["glab", "mr", "list"],
    requires: ["glab"],
  },
];

export function createDockerComposeFixture(): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync(path.join(tmpdir(), "tg-compare-docker-"));
  writeFileSync(
    path.join(dir, "docker-compose.yml"),
    [
      "services:",
      "  web:",
      "    image: web:latest",
      "  api:",
      "    image: api:latest",
      "  db:",
      "    image: postgres:16",
      "",
    ].join("\n"),
    "utf8",
  );
  return {
    dir,
    cleanup: () => {
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

export function dockerComposeComparisonCase(dir: string): LiveComparisonCase {
  return {
    name: "docker: compose ps (temp project)",
    command: ["docker", "compose", "ps"],
    cwd: dir,
    requires: ["docker"],
  };
}

export function diffComparisonCase(oldPath: string, newPath: string): LiveComparisonCase {
  return {
    name: "diff: diff old.ts new.ts",
    command: ["diff", oldPath, newPath],
  };
}

export function createTscErrorFixture(): {
  dir: string;
  filePath: string;
  cleanup: () => void;
} {
  const dir = mkdtempSync(path.join(tmpdir(), "tg-compare-tsc-"));
  const filePath = path.join(dir, "broken.ts");
  writeFileSync(filePath, "const value: number = \"wrong\";\nexport { value };\n", "utf8");
  return {
    dir,
    filePath,
    cleanup: () => {
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

export function tscErrorComparisonCase(filePath: string): LiveComparisonCase {
  return {
    name: "tsc: type error in temp file",
    command: ["pnpm", "exec", "tsc", "--noEmit", "--ignoreConfig", filePath],
    rawCommand: ["pnpm", "exec", "tsc", "--noEmit", "--ignoreConfig", filePath],
    rtkCommand: ["tsc", "--noEmit", "--ignoreConfig", filePath],
    requires: ["pnpm", "node"],
  };
}

export function ghComparisonCase(): LiveComparisonCase | null {
  if (!commandAvailable("gh")) return null;
  return {
    name: "gh: gh repo view",
    command: ["gh", "repo", "view"],
    requires: ["gh"],
  };
}
