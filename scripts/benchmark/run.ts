#!/usr/bin/env -S npx tsx
/**
 * ctx (contexa) Full Integration Test Suite — Multipass VM
 *
 * Ported from rtk/scripts/benchmark/run.ts and adapted to ctx conventions:
 *   - Runtime: bun -> tsx (run via `pnpm exec tsx` or the shebang above).
 *   - Build: `cargo build --release` -> `pnpm install && pnpm build` (dist/cli.js).
 *   - Quality phase: cargo fmt/clippy/test -> pnpm typecheck/lint/test.
 *   - Binary: a single Rust binary -> the bundled dist/cli.js artifact.
 *   - Binary/VM/labels renamed rtk -> ctx.
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
import { vmEnsureReady, vmBuildTk, vmExec, CTX_BIN } from "./lib/vm";
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
const phaseArg = args.includes("--phase") ? parseInt(args[args.indexOf("--phase") + 1], 10) : null;
const phaseOnly = phaseArg !== null && !Number.isNaN(phaseArg) ? phaseArg : null;
if (args.includes("--phase") && phaseOnly === null) {
  console.error("Error: --phase requires a number (e.g. --phase 3)");
  process.exit(1);
}

const PROJECT_ROOT = new URL("../../", import.meta.url).pathname.replace(/\/$/, "");
const reportPath = args.includes("--report")
  ? args[args.indexOf("--report") + 1]
  : `${PROJECT_ROOT}/benchmark-report.txt`;

const CTX = CTX_BIN;

function shouldRun(phase: number): boolean {
  return phaseOnly === null || phaseOnly === phase;
}

function heading(phase: number, title: string) {
  console.log(`\n\x1b[34m[Phase ${phase}] ${title}\x1b[0m`);
}

// ══════════════════════════════════════════════════════════════
// Phase 0: VM Setup
// ══════════════════════════════════════════════════════════════

console.log("\x1b[34m[ctx-test] ctx Full Integration Test Suite\x1b[0m");
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
// ctx ships a single bundled dist/cli.js (tsdown output). The dependency-free
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
    "export PATH=$HOME/.local/share/pnpm:$PATH && cd /home/ubuntu/ctx && pnpm exec prettier --check . 2>&1",
  );

  await testCmd(
    "quality:typecheck",
    "export PATH=$HOME/.local/share/pnpm:$PATH && cd /home/ubuntu/ctx && pnpm typecheck 2>&1",
  );

  await testCmd(
    "quality:test",
    "export PATH=$HOME/.local/share/pnpm:$PATH && cd /home/ubuntu/ctx && pnpm test:product 2>&1",
  );
}

// ══════════════════════════════════════════════════════════════
// Phase 3: Built-in Commands
// ══════════════════════════════════════════════════════════════

if (shouldRun(3)) {
  heading(3, "Built-in Commands");

  // Git
  await testCmd("git:status", `cd /tmp/test-git && ${CTX} git status`);
  await testCmd("git:log", `cd /tmp/test-git && ${CTX} git log -5`);
  await testCmd("git:log --oneline", `cd /tmp/test-git && ${CTX} git log --oneline -10`);
  await testCmd("git:diff", `cd /tmp/test-git && ${CTX} git diff`, "any");
  await testCmd("git:branch", `cd /tmp/test-git && ${CTX} git branch`);
  await testCmd("git:add --dry-run", `cd /tmp/test-git && ${CTX} git add --dry-run .`, "any");

  // Files
  await testCmd("files:ls", `${CTX} ls /home/ubuntu/ctx`);
  await testCmd("files:ls src/", `${CTX} ls /home/ubuntu/ctx/src/`);
  await testCmd("files:ls -R", `${CTX} ls -R /home/ubuntu/ctx/src/`);
  await testCmd("files:read", `${CTX} read /home/ubuntu/ctx/src/cli.ts`);
  await testCmd("files:read aggressive", `${CTX} read /home/ubuntu/ctx/src/cli.ts -l aggressive`);
  await testCmd("files:smart", `${CTX} smart /home/ubuntu/ctx/src/cli.ts`);
  await testCmd("files:find *.ts", `${CTX} find '*.ts' /home/ubuntu/ctx/src/`);
  await testCmd("files:wc", `${CTX} wc /home/ubuntu/ctx/src/cli.ts`);
  await testCmd(
    "files:diff",
    `${CTX} diff /home/ubuntu/ctx/src/cli.ts /home/ubuntu/ctx/src/parse.ts`,
  );

  // Search
  await testCmd("search:grep", `${CTX} grep 'function main' /home/ubuntu/ctx/src/`);

  // Data
  await testCmd("data:json", `${CTX} json /tmp/test-node/package.json`);
  await testCmd("data:deps", `cd /home/ubuntu/ctx && ${CTX} deps`);
  await testCmd("data:env", `${CTX} env`);

  // Runners
  await testCmd("runner:summary", `${CTX} summary 'echo hello world'`);
  await testCmd("runner:err", `${CTX} err false`, "any");
  await testCmd("runner:test", `${CTX} test 'echo ok'`, "any");

  // Logs
  await testCmd("log:large", `${CTX} log /tmp/large.log`);

  // Network
  await testCmd("net:curl", `${CTX} curl https://httpbin.org/get`, "any");

  // GitHub
  await testCmd("gh:pr list", `cd /home/ubuntu/ctx && ${CTX} gh pr list`, "any");

  // Python (test project has intentional failures)
  await testCmd("python:pytest", `cd /tmp/test-python && ${CTX} pytest`, 1);
  await testCmd("python:ruff check", `cd /tmp/test-python && ${CTX} ruff check .`, 1);
  await testCmd("python:mypy", `cd /tmp/test-python && ${CTX} mypy .`, 1);
  await testCmd("python:pip list", `${CTX} pip list`);

  // Go (test project has intentional test failure)
  await testCmd(
    "go:test",
    `export PATH=$PATH:/usr/local/go/bin && cd /tmp/test-go && ${CTX} go test ./...`,
    1,
  );
  await testCmd(
    "go:build",
    `export PATH=$PATH:/usr/local/go/bin && cd /tmp/test-go && ${CTX} go build .`,
    1,
  );
  await testCmd(
    "go:vet",
    `export PATH=$PATH:/usr/local/go/bin && cd /tmp/test-go && ${CTX} go vet ./...`,
    1,
  );
  await testCmd(
    "go:golangci-lint",
    `export PATH=$PATH:/usr/local/go/bin:$HOME/go/bin && cd /tmp/test-go && ${CTX} golangci-lint run`,
    1,
  );

  // TypeScript
  await testCmd("ts:tsc", `cd /tmp/test-node && ${CTX} tsc --noEmit`, "any");

  // Linters
  await testCmd("lint:eslint", `cd /tmp/test-node && ${CTX} lint 'eslint src/'`, "any");
  await testCmd("lint:prettier", `cd /tmp/test-node && ${CTX} prettier --check src/`, "any");

  // Docker
  await testCmd("docker:ps", `${CTX} docker ps`, "any");
  await testCmd("docker:images", `${CTX} docker images`, "any");

  // Kubernetes
  await testCmd("k8s:pods", `${CTX} kubectl pods`, "any");

  // .NET
  await testCmd(
    "dotnet:build",
    `export DOTNET_ROOT=/usr/local/share/dotnet && export PATH=$PATH:$DOTNET_ROOT && cd /tmp/test-dotnet/TestApp 2>/dev/null && ${CTX} dotnet build || echo 'dotnet skip'`,
    "any",
  );

  // Meta
  await testCmd("meta:report", `${CTX} --report`);
  await testCmd("meta:report --json", `${CTX} --report --json`);
  await testCmd("meta:raw", `${CTX} --raw echo 'raw test'`);
  await testCmd("meta:version", `${CTX} --version`);
}

// ══════════════════════════════════════════════════════════════
// Phase 4: TOML Filter Commands
// ══════════════════════════════════════════════════════════════

if (shouldRun(4)) {
  heading(4, "TOML Filter Commands");

  // System
  await testCmd("toml:df", `${CTX} df -h`);
  await testCmd("toml:du", `${CTX} du -sh /tmp`, "any");
  await testCmd("toml:ps", `${CTX} ps aux`);
  await testCmd("toml:ping", `${CTX} ping -c 2 127.0.0.1`);

  // Build tools
  await testCmd("toml:make", `cd /tmp && ${CTX} make -f Makefile`, "any");
  await testCmd("toml:rsync", `${CTX} rsync --version`);

  // Linters
  await testCmd("toml:shellcheck", `${CTX} shellcheck /tmp/test.sh`, "any");
  await testCmd("toml:hadolint", `${CTX} hadolint /tmp/Dockerfile.bad`, "any");
  await testCmd("toml:yamllint", `${CTX} yamllint /tmp/test.yaml`, "any");
  await testCmd("toml:markdownlint", `${CTX} markdownlint /tmp/test.md`, "any");

  // Cloud/Infra
  await testCmd("toml:terraform", `${CTX} terraform --version`, "any");
  await testCmd("toml:helm", `${CTX} helm version`, "any");
  await testCmd("toml:ansible", `${CTX} ansible-playbook --version`, "any");

  // Mocked tools
  await testCmd("toml:gcloud", `${CTX} gcloud version`);
  await testCmd("toml:shopify", `${CTX} shopify theme check`, "any");
  await testCmd("toml:pio", `${CTX} pio run`, "any");
  await testCmd("toml:quarto", `${CTX} quarto render`, "any");
  await testCmd("toml:sops", `${CTX} sops --version`);
  // Swift ecosystem
  await testCmd("toml:swift build", `${CTX} swift build`, "any");
  await testCmd("toml:swift test", `${CTX} swift test`, "any");
  await testCmd("toml:swift run", `${CTX} swift run`, "any");
  await testCmd("toml:swift package", `${CTX} swift package resolve`, "any");
  await testCmd("toml:swiftlint", `${CTX} swiftlint`, "any");
  await testCmd("toml:swiftformat", `${CTX} swiftformat`, "any");
  await testCmd("toml:kubectl", `${CTX} kubectl version --client`, "any");
}

// ══════════════════════════════════════════════════════════════
// Phase 5: Hook Rewrite Engine
// ══════════════════════════════════════════════════════════════

if (shouldRun(5)) {
  heading(5, "Hook Rewrite Engine");

  // Basic rewrites
  await testRewrite("git status", "ctx git status");
  await testRewrite("git log --oneline -10", "ctx git log --oneline -10");
  await testRewrite("docker ps", "ctx docker ps");
  // NOTE: ctx rewrites "kubectl get pods" to "ctx kubectl get pods" (preserves get)
  await testRewrite("kubectl get pods", "ctx kubectl get pods");
  await testRewrite("ruff check", "ctx ruff check");
  await testRewrite("pytest", "ctx pytest");
  await testRewrite("go test", "ctx go test");
  await testRewrite("pnpm list", "ctx pnpm list");
  await testRewrite("gh pr list", "ctx gh pr list");
  await testRewrite("df -h", "ctx df -h");
  await testRewrite("ps aux", "ctx ps aux");

  // Compound
  await testRewrite("go test && git status", "ctx go test && ctx git status");
  // NOTE: shell strips single quotes in vmExec, so 'msg' becomes msg
  await testRewrite("git add . && git commit -m msg", "ctx git add . && ctx git commit -m msg");

  // No rewrite (shell builtins) — ctx rewrite returns empty string + exit 1
  // We test via testCmd since testRewrite expects non-empty output
  await testCmd("rewrite:cd (no rewrite)", `${CTX} rewrite 'cd /tmp'`, 1);
  await testCmd("rewrite:export (no rewrite)", `${CTX} rewrite 'export FOO=bar'`, 1);
}

// ══════════════════════════════════════════════════════════════
// Phase 6: Exit Code Preservation
// ══════════════════════════════════════════════════════════════

if (shouldRun(6)) {
  heading(6, "Exit Code Preservation");

  // Success
  await testCmd("exit:git status=0", `cd /tmp/test-git && ${CTX} git status`, 0);
  await testCmd("exit:ls=0", `${CTX} ls /tmp`, 0);
  await testCmd("exit:report=0", `${CTX} --report`, 0);

  // Failures
  // rg returns exit 1 (no match) or 2 (error) — accept both
  await testCmd("exit:grep NOTFOUND", `${CTX} grep NOTFOUND_XYZ_123 /tmp`, "any");
}

// ══════════════════════════════════════════════════════════════
// Phase 7: Token Savings
// ══════════════════════════════════════════════════════════════

if (shouldRun(7)) {
  heading(7, "Token Savings");

  await testSavings(
    "savings:git log",
    "cd /tmp/test-git && git log -20",
    `cd /tmp/test-git && ${CTX} git log -20`,
    60,
  );
  await testSavings(
    "savings:ls",
    "ls -la /home/ubuntu/ctx/src/",
    `${CTX} ls /home/ubuntu/ctx/src/`,
    60,
  );
  await testSavings("savings:log dedup", "cat /tmp/large.log", `${CTX} log /tmp/large.log`, 80);
  await testSavings(
    "savings:read aggressive",
    "cat /home/ubuntu/ctx/src/cli.ts",
    `${CTX} read /home/ubuntu/ctx/src/cli.ts -l aggressive`,
    50,
  );
  await testSavings("savings:swift test", "swift test", `${CTX} swift test`, 60);
  await testSavings("savings:swiftlint", "swiftlint", `${CTX} swiftlint`, 20);
}

// ══════════════════════════════════════════════════════════════
// Phase 8: Pipe Compatibility
// ══════════════════════════════════════════════════════════════

if (shouldRun(8)) {
  heading(8, "Pipe Compatibility");

  await testCmd("pipe:git status|wc", `cd /tmp/test-git && ${CTX} git status | wc -l`);
  await testCmd("pipe:ls|wc", `${CTX} ls /home/ubuntu/ctx/src/ | wc -l`);
  await testCmd("pipe:grep|head", `${CTX} grep 'function' /home/ubuntu/ctx/src/ | head -5`);
}

// ══════════════════════════════════════════════════════════════
// Phase 9: Edge Cases
// ══════════════════════════════════════════════════════════════

if (shouldRun(9)) {
  heading(9, "Edge Cases");

  await testCmd("edge:summary true", `${CTX} summary 'true'`, "any");
  await testCmd("edge:grep NOTFOUND", `${CTX} grep NOTFOUND_XYZ /home/ubuntu/ctx/src/`, 1);
  await testCmd(
    "edge:unicode",
    `echo 'hello world' > /tmp/uni.txt && ${CTX} grep 'hello' /tmp`,
    "any",
  );
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
      `cd /tmp/test-git && hyperfine --warmup 3 --min-runs 5 '${CTX} git status' 'git status' --export-json /dev/stdout 2>/dev/null`,
    );
    try {
      const hf = JSON.parse(hfOut);
      const tkMean = (hf.results?.[0]?.mean * 1000).toFixed(1);
      const rawMean = (hf.results?.[1]?.mean * 1000).toFixed(1);
      console.log(`  Startup: ctx=${tkMean}ms raw=${rawMean}ms`);
    } catch {
      console.log("  hyperfine output parse failed");
    }
  } else {
    skipTest("perf:hyperfine", "not installed");
  }

  // Memory
  const { stdout: memOut } = await vmExec(
    `cd /tmp/test-git && /usr/bin/time -v ${CTX} git status 2>&1 | grep 'Maximum resident'`,
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
    `cd /tmp/test-git && for i in $(seq 1 10); do ${CTX} git status >/dev/null & done; wait`,
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
  console.log(
    `\n\x1b[31m  NOT READY — ${failed} failures — ${passed}/${total} (${passRate}%)\x1b[0m\n`,
  );
  process.exit(1);
}
