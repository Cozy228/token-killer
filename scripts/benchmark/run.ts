#!/usr/bin/env -S npx tsx
/**
 * tk (token-killer) Full Integration Test Suite — Multipass VM
 *
 * Ported from rtk/scripts/benchmark/run.ts and adapted to tk conventions:
 *   - Runtime: bun -> tsx (run via `pnpm exec tsx` or the shebang above).
 *   - Build: `cargo build --release` -> `pnpm install && pnpm build` (dist/cli.js).
 *   - Quality phase: cargo fmt/clippy/test -> pnpm typecheck/lint/test.
 *   - Binary: a single Rust binary -> the bundled dist/cli.js artifact.
 *   - Binary/VM/labels renamed rtk -> tk.
 *
 * Usage:
 *   pnpm exec tsx scripts/benchmark/run.ts           # Full suite
 *   pnpm exec tsx scripts/benchmark/run.ts --quick   # Skip slow phases (perf, concurrency)
 *   pnpm exec tsx scripts/benchmark/run.ts --phase 3 # Run specific phase only
 *
 * Prerequisites:
 *   brew install multipass
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { vmEnsureReady, vmBuildTk, vmExec, TK_BIN } from "./lib/vm";
import { testCmd, testSavings, testRewrite, skipTest, getCounts } from "./lib/test";
import { saveReport } from "./lib/report";

const execFileAsync = promisify(execFile);

/** Run a git command in the project root, returning trimmed stdout. */
async function git(...args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", ["-C", PROJECT_ROOT, ...args]);
  return stdout.trim();
}

const args = process.argv.slice(2);
const quick = args.includes("--quick");
const phaseArg = args.includes("--phase")
  ? parseInt(args[args.indexOf("--phase") + 1], 10)
  : null;
const phaseOnly = phaseArg !== null && !Number.isNaN(phaseArg) ? phaseArg : null;
if (args.includes("--phase") && phaseOnly === null) {
  console.error("Error: --phase requires a number (e.g. --phase 3)");
  process.exit(1);
}

const PROJECT_ROOT = new URL("../../", import.meta.url).pathname.replace(/\/$/, "");
const reportPath = args.includes("--report")
  ? args[args.indexOf("--report") + 1]
  : `${PROJECT_ROOT}/benchmark-report.txt`;

const TK = TK_BIN;

function shouldRun(phase: number): boolean {
  return phaseOnly === null || phaseOnly === phase;
}

function heading(phase: number, title: string) {
  console.log(`\n\x1b[34m[Phase ${phase}] ${title}\x1b[0m`);
}

// ══════════════════════════════════════════════════════════════
// Phase 0: VM Setup
// ══════════════════════════════════════════════════════════════

console.log("\x1b[34m[tk-test] tk Full Integration Test Suite\x1b[0m");
console.log(`Project: ${PROJECT_ROOT}`);

await vmEnsureReady();

// ══════════════════════════════════════════════════════════════
// Phase 1: Transfer & Build
// ══════════════════════════════════════════════════════════════

heading(1, "Transfer & Build");
const branch = await git("branch", "--show-current");
const commit = await git("log", "--oneline", "-1");
const buildInfo = await vmBuildTk(PROJECT_ROOT);

// Bundle size check
// tk ships a single bundled dist/cli.js (tsdown output). The dependency-free
// bundle stays well under a megabyte; we use a relaxed 4MB limit as a guard.
const sizeLimit = 4_194_304; // 4MB
if (buildInfo.binarySize < sizeLimit) {
  console.log(`  \x1b[32mPASS\x1b[0m | bundle size | ${buildInfo.binarySize} bytes < 4MB`);
} else {
  console.log(`  \x1b[31mFAIL\x1b[0m | bundle size | ${buildInfo.binarySize} bytes >= 4MB`);
}

// ══════════════════════════════════════════════════════════════
// Phase 2: Node Quality (typecheck, lint, test)
// ══════════════════════════════════════════════════════════════

if (shouldRun(2)) {
  heading(2, "Node Quality");

  await testCmd(
    "quality:prettier",
    "export PATH=$HOME/.local/share/pnpm:$PATH && cd /home/ubuntu/tk && pnpm exec prettier --check . 2>&1",
  );

  await testCmd(
    "quality:typecheck",
    "export PATH=$HOME/.local/share/pnpm:$PATH && cd /home/ubuntu/tk && pnpm typecheck 2>&1",
  );

  await testCmd(
    "quality:test",
    "export PATH=$HOME/.local/share/pnpm:$PATH && cd /home/ubuntu/tk && pnpm test:product 2>&1",
  );
}

// ══════════════════════════════════════════════════════════════
// Phase 3: Built-in Commands
// ══════════════════════════════════════════════════════════════

if (shouldRun(3)) {
  heading(3, "Built-in Commands");

  // Git
  await testCmd("git:status", `cd /tmp/test-git && ${TK} git status`);
  await testCmd("git:log", `cd /tmp/test-git && ${TK} git log -5`);
  await testCmd("git:log --oneline", `cd /tmp/test-git && ${TK} git log --oneline -10`);
  await testCmd("git:diff", `cd /tmp/test-git && ${TK} git diff`, "any");
  await testCmd("git:branch", `cd /tmp/test-git && ${TK} git branch`);
  await testCmd("git:add --dry-run", `cd /tmp/test-git && ${TK} git add --dry-run .`, "any");

  // Files
  await testCmd("files:ls", `${TK} ls /home/ubuntu/tk`);
  await testCmd("files:ls src/", `${TK} ls /home/ubuntu/tk/src/`);
  await testCmd("files:ls -R", `${TK} ls -R /home/ubuntu/tk/src/`);
  await testCmd("files:read", `${TK} read /home/ubuntu/tk/src/cli.ts`);
  await testCmd("files:read aggressive", `${TK} read /home/ubuntu/tk/src/cli.ts -l aggressive`);
  await testCmd("files:smart", `${TK} smart /home/ubuntu/tk/src/cli.ts`);
  await testCmd("files:find *.ts", `${TK} find '*.ts' /home/ubuntu/tk/src/`);
  await testCmd("files:wc", `${TK} wc /home/ubuntu/tk/src/cli.ts`);
  await testCmd("files:diff", `${TK} diff /home/ubuntu/tk/src/cli.ts /home/ubuntu/tk/src/parse.ts`);

  // Search
  await testCmd("search:grep", `${TK} grep 'function main' /home/ubuntu/tk/src/`);

  // Data
  await testCmd("data:json", `${TK} json /tmp/test-node/package.json`);
  await testCmd("data:deps", `cd /home/ubuntu/tk && ${TK} deps`);
  await testCmd("data:env", `${TK} env`);

  // Runners
  await testCmd("runner:summary", `${TK} summary 'echo hello world'`);
  await testCmd("runner:err", `${TK} err false`, "any");
  await testCmd("runner:test", `${TK} test 'echo ok'`, "any");

  // Logs
  await testCmd("log:large", `${TK} log /tmp/large.log`);

  // Network
  await testCmd("net:curl", `${TK} curl https://httpbin.org/get`, "any");

  // GitHub
  await testCmd("gh:pr list", `cd /home/ubuntu/tk && ${TK} gh pr list`, "any");

  // Python (test project has intentional failures)
  await testCmd("python:pytest", `cd /tmp/test-python && ${TK} pytest`, 1);
  await testCmd("python:ruff check", `cd /tmp/test-python && ${TK} ruff check .`, 1);
  await testCmd("python:mypy", `cd /tmp/test-python && ${TK} mypy .`, 1);
  await testCmd("python:pip list", `${TK} pip list`);

  // Go (test project has intentional test failure)
  await testCmd("go:test", `export PATH=$PATH:/usr/local/go/bin && cd /tmp/test-go && ${TK} go test ./...`, 1);
  await testCmd("go:build", `export PATH=$PATH:/usr/local/go/bin && cd /tmp/test-go && ${TK} go build .`, 1);
  await testCmd("go:vet", `export PATH=$PATH:/usr/local/go/bin && cd /tmp/test-go && ${TK} go vet ./...`, 1);
  await testCmd("go:golangci-lint", `export PATH=$PATH:/usr/local/go/bin:$HOME/go/bin && cd /tmp/test-go && ${TK} golangci-lint run`, 1);

  // TypeScript
  await testCmd("ts:tsc", `cd /tmp/test-node && ${TK} tsc --noEmit`, "any");

  // Linters
  await testCmd("lint:eslint", `cd /tmp/test-node && ${TK} lint 'eslint src/'`, "any");
  await testCmd("lint:prettier", `cd /tmp/test-node && ${TK} prettier --check src/`, "any");

  // Docker
  await testCmd("docker:ps", `${TK} docker ps`, "any");
  await testCmd("docker:images", `${TK} docker images`, "any");

  // Kubernetes
  await testCmd("k8s:pods", `${TK} kubectl pods`, "any");

  // .NET
  await testCmd("dotnet:build", `export DOTNET_ROOT=/usr/local/share/dotnet && export PATH=$PATH:$DOTNET_ROOT && cd /tmp/test-dotnet/TestApp 2>/dev/null && ${TK} dotnet build || echo 'dotnet skip'`, "any");

  // Meta
  await testCmd("meta:report", `${TK} --report`);
  await testCmd("meta:report --json", `${TK} --report --json`);
  await testCmd("meta:raw", `${TK} --raw echo 'raw test'`);
  await testCmd("meta:version", `${TK} --version`);
}

// ══════════════════════════════════════════════════════════════
// Phase 4: TOML Filter Commands
// ══════════════════════════════════════════════════════════════

if (shouldRun(4)) {
  heading(4, "TOML Filter Commands");

  // System
  await testCmd("toml:df", `${TK} df -h`);
  await testCmd("toml:du", `${TK} du -sh /tmp`, "any");
  await testCmd("toml:ps", `${TK} ps aux`);
  await testCmd("toml:ping", `${TK} ping -c 2 127.0.0.1`);

  // Build tools
  await testCmd("toml:make", `cd /tmp && ${TK} make -f Makefile`, "any");
  await testCmd("toml:rsync", `${TK} rsync --version`);

  // Linters
  await testCmd("toml:shellcheck", `${TK} shellcheck /tmp/test.sh`, "any");
  await testCmd("toml:hadolint", `${TK} hadolint /tmp/Dockerfile.bad`, "any");
  await testCmd("toml:yamllint", `${TK} yamllint /tmp/test.yaml`, "any");
  await testCmd("toml:markdownlint", `${TK} markdownlint /tmp/test.md`, "any");

  // Cloud/Infra
  await testCmd("toml:terraform", `${TK} terraform --version`, "any");
  await testCmd("toml:helm", `${TK} helm version`, "any");
  await testCmd("toml:ansible", `${TK} ansible-playbook --version`, "any");

  // Mocked tools
  await testCmd("toml:gcloud", `${TK} gcloud version`);
  await testCmd("toml:shopify", `${TK} shopify theme check`, "any");
  await testCmd("toml:pio", `${TK} pio run`, "any");
  await testCmd("toml:quarto", `${TK} quarto render`, "any");
  await testCmd("toml:sops", `${TK} sops --version`);
  // Swift ecosystem
  await testCmd("toml:swift build", `${TK} swift build`, "any");
  await testCmd("toml:swift test", `${TK} swift test`, "any");
  await testCmd("toml:swift run", `${TK} swift run`, "any");
  await testCmd("toml:swift package", `${TK} swift package resolve`, "any");
  await testCmd("toml:swiftlint", `${TK} swiftlint`, "any");
  await testCmd("toml:swiftformat", `${TK} swiftformat`, "any");
  await testCmd("toml:kubectl", `${TK} kubectl version --client`, "any");
}

// ══════════════════════════════════════════════════════════════
// Phase 5: Hook Rewrite Engine
// ══════════════════════════════════════════════════════════════

if (shouldRun(5)) {
  heading(5, "Hook Rewrite Engine");

  // Basic rewrites
  await testRewrite("git status", "tk git status");
  await testRewrite("git log --oneline -10", "tk git log --oneline -10");
  await testRewrite("docker ps", "tk docker ps");
  // NOTE: tk rewrites "kubectl get pods" to "tk kubectl get pods" (preserves get)
  await testRewrite("kubectl get pods", "tk kubectl get pods");
  await testRewrite("ruff check", "tk ruff check");
  await testRewrite("pytest", "tk pytest");
  await testRewrite("go test", "tk go test");
  await testRewrite("pnpm list", "tk pnpm list");
  await testRewrite("gh pr list", "tk gh pr list");
  await testRewrite("df -h", "tk df -h");
  await testRewrite("ps aux", "tk ps aux");

  // Compound
  await testRewrite("go test && git status", "tk go test && tk git status");
  // NOTE: shell strips single quotes in vmExec, so 'msg' becomes msg
  await testRewrite("git add . && git commit -m msg", "tk git add . && tk git commit -m msg");

  // No rewrite (shell builtins) — tk rewrite returns empty string + exit 1
  // We test via testCmd since testRewrite expects non-empty output
  await testCmd("rewrite:cd (no rewrite)", `${TK} rewrite 'cd /tmp'`, 1);
  await testCmd("rewrite:export (no rewrite)", `${TK} rewrite 'export FOO=bar'`, 1);
}

// ══════════════════════════════════════════════════════════════
// Phase 6: Exit Code Preservation
// ══════════════════════════════════════════════════════════════

if (shouldRun(6)) {
  heading(6, "Exit Code Preservation");

  // Success
  await testCmd("exit:git status=0", `cd /tmp/test-git && ${TK} git status`, 0);
  await testCmd("exit:ls=0", `${TK} ls /tmp`, 0);
  await testCmd("exit:report=0", `${TK} --report`, 0);

  // Failures
  // rg returns exit 1 (no match) or 2 (error) — accept both
  await testCmd("exit:grep NOTFOUND", `${TK} grep NOTFOUND_XYZ_123 /tmp`, "any");
}

// ══════════════════════════════════════════════════════════════
// Phase 7: Token Savings
// ══════════════════════════════════════════════════════════════

if (shouldRun(7)) {
  heading(7, "Token Savings");

  await testSavings(
    "savings:git log",
    "cd /tmp/test-git && git log -20",
    `cd /tmp/test-git && ${TK} git log -20`,
    60,
  );
  await testSavings(
    "savings:ls",
    "ls -la /home/ubuntu/tk/src/",
    `${TK} ls /home/ubuntu/tk/src/`,
    60,
  );
  await testSavings(
    "savings:log dedup",
    "cat /tmp/large.log",
    `${TK} log /tmp/large.log`,
    80,
  );
  await testSavings(
    "savings:read aggressive",
    "cat /home/ubuntu/tk/src/cli.ts",
    `${TK} read /home/ubuntu/tk/src/cli.ts -l aggressive`,
    50,
  );
  await testSavings(
    "savings:swift test",
    "swift test",
    `${TK} swift test`,
    60,
  );
  await testSavings(
    "savings:swiftlint",
    "swiftlint",
    `${TK} swiftlint`,
    20,
  );
}

// ══════════════════════════════════════════════════════════════
// Phase 8: Pipe Compatibility
// ══════════════════════════════════════════════════════════════

if (shouldRun(8)) {
  heading(8, "Pipe Compatibility");

  await testCmd("pipe:git status|wc", `cd /tmp/test-git && ${TK} git status | wc -l`);
  await testCmd("pipe:ls|wc", `${TK} ls /home/ubuntu/tk/src/ | wc -l`);
  await testCmd("pipe:grep|head", `${TK} grep 'function' /home/ubuntu/tk/src/ | head -5`);
}

// ══════════════════════════════════════════════════════════════
// Phase 9: Edge Cases
// ══════════════════════════════════════════════════════════════

if (shouldRun(9)) {
  heading(9, "Edge Cases");

  await testCmd("edge:summary true", `${TK} summary 'true'`, "any");
  await testCmd("edge:grep NOTFOUND", `${TK} grep NOTFOUND_XYZ /home/ubuntu/tk/src/`, 1);
  await testCmd("edge:unicode", `echo 'hello world' > /tmp/uni.txt && ${TK} grep 'hello' /tmp`, "any");
}

// ══════════════════════════════════════════════════════════════
// Phase 10: Performance (skip with --quick)
// ══════════════════════════════════════════════════════════════

if (shouldRun(10) && !quick) {
  heading(10, "Performance");

  // hyperfine
  const { exitCode: hfExist } = await vmExec("command -v hyperfine");
  if (hfExist === 0) {
    const { stdout: hfOut } = await vmExec(
      `cd /tmp/test-git && hyperfine --warmup 3 --min-runs 5 '${TK} git status' 'git status' --export-json /dev/stdout 2>/dev/null`,
    );
    try {
      const hf = JSON.parse(hfOut);
      const tkMean = (hf.results?.[0]?.mean * 1000).toFixed(1);
      const rawMean = (hf.results?.[1]?.mean * 1000).toFixed(1);
      console.log(`  Startup: tk=${tkMean}ms raw=${rawMean}ms`);
    } catch {
      console.log("  hyperfine output parse failed");
    }
  } else {
    skipTest("perf:hyperfine", "not installed");
  }

  // Memory
  const { stdout: memOut } = await vmExec(
    `cd /tmp/test-git && /usr/bin/time -v ${TK} git status 2>&1 | grep 'Maximum resident'`,
  );
  const memKb = parseInt(memOut.match(/(\d+)/)?.[1] ?? "0", 10);
  // Node has a higher baseline RSS than a Rust binary; use a relaxed 120MB guard.
  if (memKb > 0 && memKb < 120000) {
    await testCmd("perf:memory", `echo '${memKb} KB < 120MB'`);
  } else if (memKb > 0) {
    await testCmd("perf:memory", `echo '${memKb} KB >= 120MB' && exit 1`, 0);
  }
} else if (quick && shouldRun(10)) {
  skipTest("perf:hyperfine", "--quick mode");
  skipTest("perf:memory", "--quick mode");
}

// ══════════════════════════════════════════════════════════════
// Phase 11: Concurrency (skip with --quick)
// ══════════════════════════════════════════════════════════════

if (shouldRun(11) && !quick) {
  heading(11, "Concurrency");

  await testCmd(
    "concurrency:10x git status",
    `cd /tmp/test-git && for i in $(seq 1 10); do ${TK} git status >/dev/null & done; wait`,
  );
} else if (quick && shouldRun(11)) {
  skipTest("concurrency:10x", "--quick mode");
}

// ══════════════════════════════════════════════════════════════
// Report
// ══════════════════════════════════════════════════════════════

const report = await saveReport({ ...buildInfo, branch, commit }, reportPath);

console.log("\n" + report);

const { total, passed, failed } = getCounts();
const passRate = total > 0 ? Math.round((passed * 100) / total) : 0;

if (failed === 0) {
  console.log(`\n\x1b[32m  READY FOR RELEASE — ${passed}/${total} (${passRate}%)\x1b[0m\n`);
  process.exit(0);
} else {
  console.log(`\n\x1b[31m  NOT READY — ${failed} failures — ${passed}/${total} (${passRate}%)\x1b[0m\n`);
  process.exit(1);
}
