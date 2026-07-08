/**
 * Multipass VM management for ctx (contexa) integration testing.
 *
 * Ported from rtk/scripts/benchmark/lib/vm.ts and adapted to ctx conventions:
 *   - Bun's `$` shell helper replaced with Node child_process.
 *   - Build step builds the ctx Node CLI (`pnpm install && pnpm build` -> dist/cli.js)
 *     instead of a Rust `cargo build --release` binary.
 *   - "binary size" reporting now measures the built dist/cli.js artifact size.
 *   - VM/labels renamed rtk -> ctx.
 */

import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const VM_NAME = "ctx-test";
const CLOUD_INIT = "scripts/benchmark/cloud-init.yaml";

export interface VmInfo {
  name: string;
  state: string;
  ipv4: string;
}

interface RunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * Run a command without a shell, capturing stdout/stderr/exit code.
 * Never throws on a non-zero exit; callers inspect exitCode.
 */
function run(cmd: string, args: string[]): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("error", reject);
    child.on("close", (code) => resolve({ stdout, stderr, exitCode: code ?? 0 }));
  });
}

/** Run a command and throw if it exits non-zero (for setup/build steps). */
async function runChecked(cmd: string, args: string[]): Promise<RunResult> {
  const result = await run(cmd, args);
  if (result.exitCode !== 0) {
    throw new Error(
      `Command failed (${cmd} ${args.join(" ")}):\n${result.stdout}\n${result.stderr}`,
    );
  }
  return result;
}

/** Check if VM exists */
export async function vmExists(): Promise<boolean> {
  const result = await run("multipass", ["list", "--format", "json"]);
  const data = JSON.parse(result.stdout);
  return data.list?.some((vm: VmInfo) => vm.name === VM_NAME) ?? false;
}

/** Check if VM is running */
export async function vmRunning(): Promise<boolean> {
  const result = await run("multipass", ["list", "--format", "json"]);
  const data = JSON.parse(result.stdout);
  const vm = data.list?.find((v: VmInfo) => v.name === VM_NAME);
  return vm?.state === "Running";
}

/** Create a new VM with cloud-init (20 min timeout for full provisioning) */
export async function vmCreate(): Promise<void> {
  console.log(`[vm] Creating ${VM_NAME} with cloud-init (this takes ~10-15 min)...`);
  // --timeout 1200 = 20 min for cloud-init to finish installing Node, Go, .NET, etc.
  await runChecked("multipass", [
    "launch",
    "--name",
    VM_NAME,
    "--cpus",
    "2",
    "--memory",
    "4G",
    "--disk",
    "20G",
    "--timeout",
    "1200",
    "--cloud-init",
    CLOUD_INIT,
    "24.04",
  ]);
}

/** Start existing VM */
export async function vmStart(): Promise<void> {
  console.log(`[vm] Starting ${VM_NAME}...`);
  await runChecked("multipass", ["start", VM_NAME]);
}

/** Execute a command in the VM, returns stdout (60s timeout per test by default) */
export async function vmExec(cmd: string, timeoutMs = 60_000): Promise<RunResult> {
  const exec = run("multipass", ["exec", VM_NAME, "--", "bash", "-c", cmd]);

  const timeout = delay(timeoutMs).then(() => {
    throw new Error(`vmExec timed out after ${timeoutMs}ms: ${cmd}`);
  });

  return Promise.race([exec, timeout]) as Promise<RunResult>;
}

/** Transfer a file to the VM */
export async function vmTransfer(localPath: string, remotePath: string): Promise<void> {
  await runChecked("multipass", ["transfer", localPath, `${VM_NAME}:${remotePath}`]);
}

/** Wait for cloud-init to complete (max 40 min — installs Node, Go, .NET, etc.) */
export async function vmWaitReady(maxWaitSec = 2400): Promise<boolean> {
  console.log("[vm] Waiting for cloud-init...");
  const start = Date.now();
  while ((Date.now() - start) / 1000 < maxWaitSec) {
    const { exitCode } = await vmExec("test -f /home/ubuntu/.cloud-init-complete");
    if (exitCode === 0) {
      const elapsed = Math.round((Date.now() - start) / 1000);
      console.log(`[vm] Cloud-init complete after ${elapsed}s`);
      return true;
    }
    await delay(10_000);
  }
  console.error("[vm] Cloud-init timed out!");
  return false;
}

/** Transfer ctx source and build the Node CLI (dist/cli.js) */
export async function vmBuildTk(projectRoot: string): Promise<{
  buildTime: number;
  binarySize: number;
  version: string;
}> {
  console.log("[vm] Transferring ctx source...");

  // Create tarball excluding heavy dirs and macOS resource forks (._*)
  await runChecked("bash", [
    "-c",
    `COPYFILE_DISABLE=1 tar czf /tmp/ctx-src.tar.gz --exclude node_modules --exclude dist --exclude .git --exclude "index.html*" --exclude "._*" -C "${projectRoot}" .`,
  ]);
  await vmTransfer("/tmp/ctx-src.tar.gz", "/tmp/ctx-src.tar.gz");
  await vmExec("mkdir -p /home/ubuntu/ctx && cd /home/ubuntu/ctx && tar xzf /tmp/ctx-src.tar.gz");

  console.log("[vm] Building ctx (pnpm install && pnpm build)...");
  const start = Date.now();
  const { stdout, exitCode } = await vmExec(
    "export PATH=$HOME/.local/share/pnpm:$PATH && cd /home/ubuntu/ctx && pnpm install --frozen-lockfile && pnpm build 2>&1 | tail -5",
    600_000,
  );
  const buildTime = Math.round((Date.now() - start) / 1000);

  if (exitCode !== 0) {
    throw new Error(`Build failed:\n${stdout}`);
  }

  // "binary size" is the built dist/cli.js artifact size for the Node CLI.
  const { stdout: sizeStr } = await vmExec("stat -c%s /home/ubuntu/ctx/dist/cli.js");
  const binarySize = parseInt(sizeStr.trim(), 10);

  const { stdout: version } = await vmExec("node /home/ubuntu/ctx/dist/cli.js --version");

  console.log(`[vm] Build OK in ${buildTime}s — ${binarySize} bytes — ${version.trim()}`);

  return { buildTime, binarySize, version: version.trim() };
}

/** Delete the VM */
export async function vmDelete(): Promise<void> {
  console.log(`[vm] Deleting ${VM_NAME}...`);
  await run("multipass", ["delete", VM_NAME, "--purge"]);
}

/** Ensure VM is ready (create or reuse) */
export async function vmEnsureReady(): Promise<void> {
  if (await vmExists()) {
    if (!(await vmRunning())) {
      await vmStart();
    }
    console.log(`[vm] Reusing existing VM ${VM_NAME}`);
    // Check if cloud-init is still running
    const { exitCode } = await vmExec("test -f /home/ubuntu/.cloud-init-complete");
    if (exitCode !== 0) {
      console.log("[vm] Cloud-init still running, waiting...");
      const ready = await vmWaitReady();
      if (!ready) {
        throw new Error(
          "Cloud-init timed out. Check: multipass exec ctx-test -- cat /var/log/cloud-init-output.log",
        );
      }
    }
  } else {
    await vmCreate();
    // multipass launch --timeout should wait, but double-check
    const { exitCode } = await vmExec("test -f /home/ubuntu/.cloud-init-complete");
    if (exitCode !== 0) {
      const ready = await vmWaitReady();
      if (!ready) {
        throw new Error(
          "Cloud-init timed out. Check: multipass exec ctx-test -- cat /var/log/cloud-init-output.log",
        );
      }
    }
  }
}

// The ctx CLI is invoked as `node dist/cli.js`. CTX_BIN is the launcher prefix.
export const CTX_BIN = "node /home/ubuntu/ctx/dist/cli.js";
