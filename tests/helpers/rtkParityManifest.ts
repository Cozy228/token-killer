import { fixtureBackedHandlers } from "./fixtureCases.js";
import { routeCommand } from "../../src/router.js";
import type { ParsedCommand } from "../../src/types.js";

export type Domain =
  | "system utilities"
  | "cloud"
  | "language ecosystems"
  | ".NET";

export type RtkModuleParity = {
  group: Domain;
  rtkSource: string;
  expectedInlineTests: number;
  command: string[];
  expectedHandler: string;
};

export type RtkCommandExpectation = {
  rtkSource: string;
  command: string[];
  expectedHandler: string;
};

export type MigrationGap =
  | {
      kind: "routing";
      rtkSource: string;
      command: string;
      expectedHandler: string;
      actualHandler: string;
    }
  | {
      kind: "missing-handler";
      rtkSource: string;
      expectedHandler: string;
    }
  | {
      kind: "missing-handler-test";
      rtkSource: string;
      expectedHandler: string;
      expectedTestFile: string;
    }
  | {
      kind: "missing-fixture-coverage";
      rtkSource: string;
      expectedHandler: string;
    };

/** tg vitest file for each dedicated handler (when it exists). */
export const handlerTestFiles: Record<string, string> = {
  "list-like": "tests/unit/handlers/fixtureContent.test.ts",
  "read-like": "tests/unit/handlers/fixtureContent.test.ts",
  "search-like": "tests/unit/handlers/fixtureContent.test.ts",
  "package-list": "tests/unit/handlers/fixtureContent.test.ts",
  tsc: "tests/unit/handlers/fixtureContent.test.ts",
  "js-test": "tests/unit/handlers/fixtureContent.test.ts",
  eslint: "tests/unit/handlers/fixtureContent.test.ts",
  pytest: "tests/unit/handlers/fixtureContent.test.ts",
  ruff: "tests/unit/handlers/fixtureContent.test.ts",
  mypy: "tests/unit/handlers/fixtureContent.test.ts",
  pip: "tests/unit/handlers/fixtureContent.test.ts",
  gradle: "tests/unit/handlers/fixtureContent.test.ts",
  gh: "tests/unit/handlers/fixtureContent.test.ts",
  glab: "tests/unit/handlers/fixtureContent.test.ts",
  diff: "tests/unit/handlers/fixtureContent.test.ts",
};

export const rtkDomainModules: RtkModuleParity[] = [
  {
    group: "system utilities",
    rtkSource: "rtk/src/cmds/system/ls.rs",
    expectedInlineTests: 29,
    command: ["ls", "-la"],
    expectedHandler: "list-like",
  },
  {
    group: "system utilities",
    rtkSource: "rtk/src/cmds/system/tree.rs",
    expectedInlineTests: 6,
    command: ["tree", "."],
    expectedHandler: "list-like",
  },
  {
    group: "system utilities",
    rtkSource: "rtk/src/cmds/system/read.rs",
    expectedInlineTests: 8,
    command: ["cat", "README.md"],
    expectedHandler: "read-like",
  },
  {
    group: "system utilities",
    rtkSource: "rtk/src/cmds/system/find_cmd.rs",
    expectedInlineTests: 29,
    command: ["find", ".", "-name", "*.ts"],
    expectedHandler: "list-like",
  },
  {
    group: "system utilities",
    rtkSource: "rtk/src/cmds/system/grep_cmd.rs",
    expectedInlineTests: 23,
    command: ["grep", "-R", "TODO", "src"],
    expectedHandler: "search-like",
  },
  {
    group: "system utilities",
    rtkSource: "rtk/src/cmds/system/log_cmd.rs",
    expectedInlineTests: 3,
    command: ["log", "server.log"],
    expectedHandler: "log",
  },
  {
    group: "system utilities",
    rtkSource: "rtk/src/cmds/system/json_cmd.rs",
    expectedInlineTests: 10,
    command: ["json", "package.json"],
    expectedHandler: "json",
  },
  {
    group: "system utilities",
    rtkSource: "rtk/src/cmds/system/env_cmd.rs",
    expectedInlineTests: 12,
    command: ["env"],
    expectedHandler: "env",
  },
  {
    group: "system utilities",
    rtkSource: "rtk/src/cmds/system/wc_cmd.rs",
    expectedInlineTests: 15,
    command: ["wc", "-l", "src/cli.ts"],
    expectedHandler: "wc",
  },
  {
    group: "system utilities",
    rtkSource: "rtk/src/cmds/system/format_cmd.rs",
    expectedInlineTests: 7,
    command: ["format"],
    expectedHandler: "format",
  },
  {
    group: "system utilities",
    rtkSource: "rtk/src/cmds/system/pipe_cmd.rs",
    expectedInlineTests: 38,
    command: ["pipe", "cargo", "test"],
    expectedHandler: "pipe",
  },
  {
    group: "system utilities",
    rtkSource: "rtk/src/cmds/system/local_llm.rs",
    expectedInlineTests: 2,
    command: ["smart", "src/main.rs"],
    expectedHandler: "local-llm",
  },
  {
    group: "cloud",
    rtkSource: "rtk/src/cmds/cloud/aws_cmd.rs",
    expectedInlineTests: 82,
    command: ["aws", "cloudformation", "describe-stacks"],
    expectedHandler: "aws",
  },
  {
    group: "cloud",
    rtkSource: "rtk/src/cmds/cloud/container.rs",
    expectedInlineTests: 17,
    command: ["docker", "logs", "api"],
    expectedHandler: "container",
  },
  {
    group: "cloud",
    rtkSource: "rtk/src/cmds/cloud/curl_cmd.rs",
    expectedInlineTests: 11,
    command: ["curl", "-i", "https://example.com"],
    expectedHandler: "curl",
  },
  {
    group: "cloud",
    rtkSource: "rtk/src/cmds/cloud/psql_cmd.rs",
    expectedInlineTests: 18,
    command: ["psql", "-c", "select * from users"],
    expectedHandler: "psql",
  },
  {
    group: "cloud",
    rtkSource: "rtk/src/cmds/cloud/wget_cmd.rs",
    expectedInlineTests: 17,
    command: ["wget", "-S", "https://example.com"],
    expectedHandler: "wget",
  },
  {
    group: "language ecosystems",
    rtkSource: "rtk/src/cmds/js/npm_cmd.rs",
    expectedInlineTests: 3,
    command: ["npm", "list", "--depth=0"],
    expectedHandler: "package-list",
  },
  {
    group: "language ecosystems",
    rtkSource: "rtk/src/cmds/js/pnpm_cmd.rs",
    expectedInlineTests: 8,
    command: ["pnpm", "list", "--depth=0"],
    expectedHandler: "package-list",
  },
  {
    group: "language ecosystems",
    rtkSource: "rtk/src/cmds/js/tsc_cmd.rs",
    expectedInlineTests: 8,
    command: ["tsc", "--noEmit"],
    expectedHandler: "tsc",
  },
  {
    group: "language ecosystems",
    rtkSource: "rtk/src/cmds/js/vitest_cmd.rs",
    expectedInlineTests: 7,
    command: ["vitest", "run"],
    expectedHandler: "js-test",
  },
  {
    group: "language ecosystems",
    rtkSource: "rtk/src/cmds/js/lint_cmd.rs",
    expectedInlineTests: 15,
    command: ["eslint", "src"],
    expectedHandler: "eslint",
  },
  {
    group: "language ecosystems",
    rtkSource: "rtk/src/cmds/js/prettier_cmd.rs",
    expectedInlineTests: 5,
    command: ["prettier", "--check", "src"],
    expectedHandler: "prettier",
  },
  {
    group: "language ecosystems",
    rtkSource: "rtk/src/cmds/js/next_cmd.rs",
    expectedInlineTests: 2,
    command: ["next", "build"],
    expectedHandler: "next",
  },
  {
    group: "language ecosystems",
    rtkSource: "rtk/src/cmds/js/playwright_cmd.rs",
    expectedInlineTests: 5,
    command: ["playwright", "test"],
    expectedHandler: "playwright",
  },
  {
    group: "language ecosystems",
    rtkSource: "rtk/src/cmds/js/prisma_cmd.rs",
    expectedInlineTests: 3,
    command: ["prisma", "migrate", "deploy"],
    expectedHandler: "prisma",
  },
  {
    group: "language ecosystems",
    rtkSource: "rtk/src/cmds/python/pytest_cmd.rs",
    expectedInlineTests: 9,
    command: ["pytest"],
    expectedHandler: "pytest",
  },
  {
    group: "language ecosystems",
    rtkSource: "rtk/src/cmds/python/ruff_cmd.rs",
    expectedInlineTests: 6,
    command: ["ruff", "check", "."],
    expectedHandler: "ruff",
  },
  {
    group: "language ecosystems",
    rtkSource: "rtk/src/cmds/python/mypy_cmd.rs",
    expectedInlineTests: 9,
    command: ["mypy", "src"],
    expectedHandler: "mypy",
  },
  {
    group: "language ecosystems",
    rtkSource: "rtk/src/cmds/python/pip_cmd.rs",
    expectedInlineTests: 4,
    command: ["pip", "list"],
    expectedHandler: "pip",
  },
  {
    group: "language ecosystems",
    rtkSource: "rtk/src/cmds/jvm/gradlew_cmd.rs",
    expectedInlineTests: 56,
    command: ["./gradlew", "test"],
    expectedHandler: "gradle",
  },
  {
    group: ".NET",
    rtkSource: "rtk/src/cmds/dotnet/dotnet_cmd.rs",
    expectedInlineTests: 66,
    command: ["dotnet", "test"],
    expectedHandler: "dotnet",
  },
  {
    group: ".NET",
    rtkSource: "rtk/src/cmds/dotnet/binlog.rs",
    expectedInlineTests: 28,
    command: ["dotnet", "msbuild", "-bl"],
    expectedHandler: "dotnet-binlog",
  },
  {
    group: ".NET",
    rtkSource: "rtk/src/cmds/dotnet/dotnet_trx.rs",
    expectedInlineTests: 11,
    command: ["dotnet", "test", "--logger", "trx"],
    expectedHandler: "dotnet-trx",
  },
  {
    group: ".NET",
    rtkSource: "rtk/src/cmds/dotnet/dotnet_format_report.rs",
    expectedInlineTests: 3,
    command: ["dotnet", "format", "--verify-no-changes"],
    expectedHandler: "dotnet-format",
  },
];

/** RTK modules outside the domain radar but still required for full migration. */
export const rtkExtendedCommandExpectations: RtkCommandExpectation[] = [
  {
    rtkSource: "rtk/src/cmds/go/go_cmd.rs",
    command: ["go", "test", "./..."],
    expectedHandler: "go",
  },
  {
    rtkSource: "rtk/src/cmds/go/golangci_cmd.rs",
    command: ["golangci-lint", "run"],
    expectedHandler: "golangci",
  },
  {
    rtkSource: "rtk/src/cmds/rust/cargo_cmd.rs",
    command: ["cargo", "test"],
    expectedHandler: "cargo",
  },
  {
    rtkSource: "rtk/src/cmds/rust/runner.rs",
    command: ["rustc", "--version"],
    expectedHandler: "rust-runner",
  },
  {
    rtkSource: "rtk/src/cmds/ruby/rake_cmd.rs",
    command: ["rake", "test"],
    expectedHandler: "rake",
  },
  {
    rtkSource: "rtk/src/cmds/ruby/rspec_cmd.rs",
    command: ["rspec"],
    expectedHandler: "rspec",
  },
  {
    rtkSource: "rtk/src/cmds/ruby/rubocop_cmd.rs",
    command: ["rubocop"],
    expectedHandler: "rubocop",
  },
  {
    rtkSource: "rtk/src/cmds/cloud/container.rs",
    command: ["kubectl", "logs", "deploy/api"],
    expectedHandler: "container",
  },
  {
    rtkSource: "rtk/src/cmds/git/gh_cmd.rs",
    command: ["gh", "pr", "list"],
    expectedHandler: "gh",
  },
  {
    rtkSource: "rtk/src/cmds/git/glab_cmd.rs",
    command: ["glab", "mr", "list"],
    expectedHandler: "glab",
  },
  {
    rtkSource: "rtk/src/cmds/git/gt_cmd.rs",
    command: ["gt", "log"],
    expectedHandler: "gt",
  },
  {
    rtkSource: "rtk/src/cmds/git/diff_cmd.rs",
    command: ["diff", "old.ts", "new.ts"],
    expectedHandler: "diff",
  },
];

export function parsed(command: string[]): ParsedCommand {
  return {
    program: command[0] ?? "",
    args: command.slice(1),
    original: command,
    displayCommand: command.join(" "),
  };
}

function gapKey(gap: MigrationGap): string {
  switch (gap.kind) {
    case "routing":
      return `${gap.kind}:${gap.rtkSource}:${gap.command}`;
    case "missing-handler":
      return `${gap.kind}:${gap.rtkSource}:${gap.expectedHandler}`;
    case "missing-handler-test":
      return `${gap.kind}:${gap.expectedHandler}:${gap.expectedTestFile}`;
    case "missing-fixture-coverage":
      return `${gap.kind}:${gap.rtkSource}:${gap.expectedHandler}`;
  }
}

export function collectMigrationGaps(): MigrationGap[] {
  const gaps: MigrationGap[] = [];
  const seen = new Set<string>();

  function push(gap: MigrationGap) {
    const key = gapKey(gap);
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    gaps.push(gap);
  }

  const expectations: RtkCommandExpectation[] = [
    ...rtkDomainModules,
    ...rtkExtendedCommandExpectations,
  ];

  const backedHandlers = fixtureBackedHandlers();

  for (const module of expectations) {
    const handler = routeCommand(parsed(module.command));
    if (handler.name !== module.expectedHandler) {
      push({
        kind: "routing",
        rtkSource: module.rtkSource,
        command: module.command.join(" "),
        expectedHandler: module.expectedHandler,
        actualHandler: handler.name,
      });
    }

    const testFile = handlerTestFiles[module.expectedHandler];
    if (!testFile) {
      push({
        kind: "missing-handler",
        rtkSource: module.rtkSource,
        expectedHandler: module.expectedHandler,
      });
      continue;
    }

    if (!backedHandlers.has(module.expectedHandler)) {
      push({
        kind: "missing-fixture-coverage",
        rtkSource: module.rtkSource,
        expectedHandler: module.expectedHandler,
      });
    }
  }

  return gaps;
}

export function collectMigrationGapsForSource(rtkSource: string): MigrationGap[] {
  return collectMigrationGaps().filter((gap) => gap.rtkSource === rtkSource);
}

export function formatMigrationGapReport(gaps: MigrationGap[]): string {
  const counts = new Map<MigrationGap["kind"], number>();
  for (const gap of gaps) {
    counts.set(gap.kind, (counts.get(gap.kind) ?? 0) + 1);
  }

  const summary = [...counts.entries()]
    .map(([kind, count]) => `${kind}: ${count}`)
    .join(", ");

  const samples = gaps.slice(0, 40).map((gap) => {
    switch (gap.kind) {
      case "routing":
        return `[routing] ${gap.rtkSource} (${gap.command}) expected ${gap.expectedHandler}, got ${gap.actualHandler}`;
      case "missing-handler":
        return `[missing-handler] ${gap.rtkSource} needs handler ${gap.expectedHandler}`;
      case "missing-handler-test":
        return `[missing-handler-test] ${gap.expectedHandler} needs ${gap.expectedTestFile}`;
      case "missing-fixture-coverage":
        return `[missing-fixture-coverage] ${gap.rtkSource} needs fixture-backed coverage for ${gap.expectedHandler}`;
    }
  });

  const lines = [
    `RTK → tg migration incomplete (${gaps.length} gaps; ${summary})`,
    ...samples,
  ];

  if (gaps.length > samples.length) {
    lines.push(`… and ${gaps.length - samples.length} more`);
  }

  return lines.join("\n");
}
