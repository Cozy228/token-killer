import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

export type LiveComparisonCase = {
  name: string;
  command: string[];
  rawCommand?: string[];
  rtkCommand?: string[];
  requires?: Array<"git" | "rg" | "tree" | "tsc" | "pnpm" | "node" | "gh">;
};

export function commandAvailable(name: string): boolean {
  try {
    execFileSync("which", [name], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

export function skipReason(testCase: LiveComparisonCase): string | null {
  for (const req of testCase.requires ?? []) {
    if (req === "git") continue;
    if (!commandAvailable(req)) {
      return `${req} not available`;
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
    default:
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
];

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
