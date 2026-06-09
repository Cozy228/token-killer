import { executeCommand } from "../../executor.js";
import type { CommandHandler, ParsedCommand } from "../../types.js";
import { makeFilteredResult, rawText } from "../base.js";
import { type LadderResult, overBudgetLadder } from "../common/budget.js";

// ADR 0001 decisions 2/5/7: RTK's CAP_LIST / CAP_INVENTORY / CAP_WARNINGS caps and
// their `… +N more` overflow markers are REMOVED. A listing that fits the token
// budget ships in full; over budget it runs the two-step ladder — a lossless
// step-1 digest (every item kept, decoration columns dropped) then a step-2
// count replacement — with a declared omission so the gate force-persists raw and
// appends a `[full output: <path>]` pointer. No class ever emits a `+N more`.

// RTK: cloud/container.rs::compact_ports — extract bare port numbers from a
// docker ports column. Keeps the host-side port (after the final ':' before
// "->"), collapses to "first, second, … +N" past 3 entries, "-" when empty.
function compactPorts(ports: string): string {
  if (ports === "") {
    return "-";
  }
  const portNums = ports.split(",").map((p) => {
    const left = p.split("->")[0] ?? "";
    const segs = left.split(":");
    return segs[segs.length - 1] ?? "";
  });

  if (portNums.length <= 3) {
    return portNums.join(", ");
  }
  return `${portNums.slice(0, 2).join(", ")}, … +${portNums.length - 2}`;
}

// RTK: cloud/container.rs::format_container_line_from_parts — tab-separated
// "ID\tName\tStatus\tImage\tPorts". Truncates id to 12 chars, shortens image to
// its last path segment, appends compact ports in brackets when present.
function formatContainerLineFromParts(parts: string[], withPorts: boolean): string | null {
  if (parts.length < 4) {
    return null;
  }
  const id = parts[0]!.slice(0, Math.min(12, parts[0]!.length));
  const name = parts[1]!;
  const status = parts[2]!.trim();
  const imageParts = (parts[3] ?? "").split("/");
  const shortImage = imageParts[imageParts.length - 1] ?? "";
  let portSuffix = "";
  if (withPorts) {
    const ports = compactPorts(parts[4] ?? "");
    portSuffix = ports === "-" ? "" : ` [${ports}]`;
  }
  return `  ${id} ${name} (${shortImage}) ${status}${portSuffix}\n`;
}

// ADR 0001 step-1 lossless digest line: keep every container's identity (name +
// status — the "which service is abnormal?" evidence) and drop the id/image/ports
// decoration. Same null guard as the full renderer so the two stay item-aligned.
function identContainerLine(parts: string[]): string | null {
  if (parts.length < 4) {
    return null;
  }
  return `  ${parts[1]!} ${parts[2]!.trim()}\n`;
}

// RTK: cloud/container.rs::docker_ps — "[docker] N containers:" header then one
// line per container. (tk receives the `--format` stdout that RTK produces
// internally and reformats it.) Over budget it ladders: full → name/status digest
// → count. No `… +N more`.
function dockerPs(raw: string): LadderResult {
  if (raw.trim() === "") {
    return { text: "[docker] 0 containers" };
  }
  const rows = raw
    .split("\n")
    .filter((l) => l.trim() !== "")
    .map((line) => line.split("\t"));
  const rich: string[] = [];
  const ident: string[] = [];
  for (const parts of rows) {
    const full = formatContainerLineFromParts(parts, true);
    if (full === null) continue;
    rich.push(full);
    ident.push(identContainerLine(parts)!);
  }

  const header = `[docker] ${rich.length} containers:\n`;
  return overBudgetLadder({
    full: `${header}${rich.join("")}`,
    digest: () => `${header}${ident.join("")}`,
    replacement: () => `[docker] ${rich.length} containers`,
  });
}

// RTK: cloud/container.rs::docker_ps_all — first column is State; running/
// restarting are grouped under "[docker] N running:", everything else under
// "[docker] N stopped/exited:". Over budget it ladders both groups together.
function dockerPsAll(raw: string): LadderResult {
  const runningRich: string[] = [];
  const runningIdent: string[] = [];
  const stoppedRich: string[] = [];
  const stoppedIdent: string[] = [];
  for (const line of raw.split("\n").filter((l) => l.trim() !== "")) {
    const parts = line.split("\t");
    const state = parts[0] ?? "";
    const isRunning = state === "running" || state === "restarting";
    const rest = parts.slice(1);
    const full = formatContainerLineFromParts(rest, isRunning);
    if (full === null) continue;
    (isRunning ? runningRich : stoppedRich).push(full);
    (isRunning ? runningIdent : stoppedIdent).push(identContainerLine(rest)!);
  }

  const render = (running: string[], stopped: string[]): string => {
    let out = `[docker] ${runningRich.length} running:\n`;
    out += running.join("");
    if (stoppedRich.length > 0) {
      out += `[docker] ${stoppedRich.length} stopped/exited:\n`;
      out += stopped.join("");
    }
    return out;
  };

  return overBudgetLadder({
    full: render(runningRich, stoppedRich),
    digest: () => render(runningIdent, stoppedIdent),
    replacement: () =>
      stoppedRich.length > 0
        ? `[docker] ${runningRich.length} running, ${stoppedRich.length} stopped/exited`
        : `[docker] ${runningRich.length} running`,
  });
}

// RTK: cloud/container.rs::docker_images — "[docker] N images (TOTAL)" header
// where TOTAL sums GB/MB sizes (GB→MB ×1024, displayed GB past 1024MB). One
// "  image [size]" line each. Over budget: digest drops the size column, then a
// count replacement.
function dockerImages(raw: string): LadderResult {
  const lines = raw.split("\n").filter((l) => l !== "");
  if (lines.length === 0) {
    return { text: "[docker] 0 images" };
  }

  let totalMb = 0;
  for (const line of lines) {
    const sizeStr = line.split("\t")[1];
    if (sizeStr === undefined) {
      continue;
    }
    if (sizeStr.includes("GB")) {
      const n = Number.parseFloat(sizeStr.replace("GB", "").trim());
      if (!Number.isNaN(n)) {
        totalMb += n * 1024;
      }
    } else if (sizeStr.includes("MB")) {
      const n = Number.parseFloat(sizeStr.replace("MB", "").trim());
      if (!Number.isNaN(n)) {
        totalMb += n;
      }
    }
  }

  const totalDisplay =
    totalMb > 1024 ? `${(totalMb / 1024).toFixed(1)}GB` : `${totalMb.toFixed(0)}MB`;
  const header = `[docker] ${lines.length} images (${totalDisplay})\n`;
  const rich = lines.map((line) => {
    const parts = line.split("\t");
    return `  ${parts[0] ?? ""} [${parts[1] ?? ""}]\n`;
  });
  const ident = lines.map((line) => `  ${line.split("\t")[0] ?? ""}\n`);

  return overBudgetLadder({
    full: `${header}${rich.join("")}`,
    digest: () => `${header}${ident.join("")}`,
    replacement: () => `[docker] ${lines.length} images (${totalDisplay})`,
  });
}

// RTK: cloud/container.rs::format_compose_ps — tab-separated
// "Name\tImage\tStatus\tPorts" (headerless --format output). Shortens image to
// its last path segment, drops empty port brackets. Over budget it ladders to a
// name/status digest then a count.
function formatComposePs(raw: string): LadderResult {
  const lines = raw.split("\n").filter((l) => l.trim() !== "");
  if (lines.length === 0) {
    return { text: "[compose] 0 services" };
  }

  const rich: string[] = [];
  const ident: string[] = [];
  for (const line of lines) {
    const parts = line.split("\t");
    if (parts.length < 4) {
      continue;
    }
    const name = parts[0]!;
    const image = parts[1]!;
    const status = parts[2]!;
    const ports = parts[3]!;
    const imageParts = image.split("/");
    const shortImage = imageParts[imageParts.length - 1] || image;
    let portStr = "";
    if (ports.trim() !== "") {
      const compact = compactPorts(ports.trim());
      portStr = compact === "-" ? "" : ` [${compact}]`;
    }
    rich.push(`  ${name} (${shortImage}) ${status}${portStr}`);
    ident.push(`  ${name} ${status}`);
  }

  const header = `[compose] ${rich.length} services:`;
  const join = (rows: string[]): string => `${header}\n${rows.join("\n")}`.replace(/\s+$/, "");
  return overBudgetLadder({
    full: join(rich),
    digest: () => join(ident),
    replacement: () => `[compose] ${rich.length} services`,
  });
}

// RTK: cloud/container.rs::format_compose_build — emits the
// "[compose] [+] Building Ns (n/n) FINISHED" line (or a fallback), the unique
// service names from "[svc N/M]" build steps, and the count of " => " steps.
function formatComposeBuild(raw: string): string {
  if (raw.trim() === "") {
    return "[compose] Build: no output";
  }

  let result = "";
  for (const line of raw.split("\n")) {
    if (line.includes("Building") && line.includes("FINISHED")) {
      result += `[compose] ${line.trim()}\n`;
      break;
    }
  }
  if (result === "") {
    const buildingLine = raw.split("\n").find((l) => l.includes("Building"));
    result +=
      buildingLine !== undefined ? `[compose] ${buildingLine.trim()}\n` : "[compose] Build:\n";
  }

  const services: string[] = [];
  for (const line of raw.split("\n")) {
    const start = line.indexOf("[");
    if (start === -1) {
      continue;
    }
    const end = line.slice(start + 1).indexOf("]");
    if (end === -1) {
      continue;
    }
    const bracket = line.slice(start + 1, start + 1 + end);
    const svc = bracket.split(/\s+/)[0] ?? "";
    if (svc !== "" && svc !== "+" && !services.includes(svc)) {
      services.push(svc);
    }
  }
  if (services.length > 0) {
    result += `  Services: ${services.join(", ")}\n`;
  }

  const stepCount = raw.split("\n").filter((l) => l.trimStart().startsWith("=> ")).length;
  if (stepCount > 0) {
    result += `  Steps: ${stepCount}`;
  }

  return result.replace(/\s+$/, "");
}

// RTK: cloud/container.rs::format_kubectl_pods — parses `kubectl get pods -o
// json`. Counts Running/Pending/Failed and total restarts, surfaces non-Running
// pods (incl. CrashLoop/Error waiting reasons) under "[warn] Issues:". The issues
// list is pure evidence (no decoration to drop), so it has no step-1 digest: over
// budget it falls straight to a count replacement (decision 2 + step-2).
function formatKubectlPods(json: unknown): LadderResult {
  const items = (json as { items?: unknown }).items;
  if (!Array.isArray(items) || items.length === 0) {
    return { text: "No pods found\n" };
  }

  let running = 0;
  let pending = 0;
  let failed = 0;
  let restartsTotal = 0;
  const issues: string[] = [];

  for (const pod of items as Record<string, any>[]) {
    const ns = pod.metadata?.namespace ?? "-";
    const name = pod.metadata?.name ?? "-";
    const phase = pod.status?.phase ?? "Unknown";

    const containers = pod.status?.containerStatuses;
    if (Array.isArray(containers)) {
      for (const c of containers) {
        restartsTotal += typeof c.restartCount === "number" ? c.restartCount : 0;
      }
    }

    if (phase === "Running") {
      running += 1;
    } else if (phase === "Pending") {
      pending += 1;
      issues.push(`${ns}/${name} Pending`);
    } else if (phase === "Failed" || phase === "Error") {
      failed += 1;
      issues.push(`${ns}/${name} ${phase}`);
    } else if (Array.isArray(containers)) {
      for (const c of containers) {
        const reason = c.state?.waiting?.reason;
        if (
          typeof reason === "string" &&
          (reason.includes("CrashLoop") || reason.includes("Error"))
        ) {
          failed += 1;
          issues.push(`${ns}/${name} ${reason}`);
        }
      }
    }
  }

  const parts: string[] = [];
  if (running > 0) {
    parts.push(`${running}`);
  }
  if (pending > 0) {
    parts.push(`${pending} pending`);
  }
  if (failed > 0) {
    parts.push(`${failed} [x]`);
  }
  if (restartsTotal > 0) {
    parts.push(`${restartsTotal} restarts`);
  }

  const summary = `${items.length} pods: ${parts.join(", ")}\n`;
  if (issues.length === 0) {
    return { text: summary };
  }

  return overBudgetLadder({
    full: `${summary}[warn] Issues:\n${issues.map((issue) => `  ${issue}\n`).join("")}`,
    replacement: () => `${summary}[warn] ${issues.length} issues\n`,
  });
}

// RTK: cloud/container.rs::format_kubectl_services — parses `kubectl get
// services -o json`. One "  ns/name TYPE [ports]" line each. Over budget: digest
// drops the TYPE/ports decoration (keeps every ns/name), then a count.
function formatKubectlServices(json: unknown): LadderResult {
  const items = (json as { items?: unknown }).items;
  if (!Array.isArray(items) || items.length === 0) {
    return { text: "No services found\n" };
  }

  const rich: string[] = [];
  const ident: string[] = [];
  for (const svc of items as Record<string, any>[]) {
    const ns = svc.metadata?.namespace ?? "-";
    const name = svc.metadata?.name ?? "-";
    const svcType = svc.spec?.type ?? "-";
    const ports: string[] = Array.isArray(svc.spec?.ports)
      ? svc.spec.ports.map((p: any) => {
          const port = typeof p.port === "number" ? p.port : 0;
          let target = port;
          if (typeof p.targetPort === "number") {
            target = p.targetPort;
          } else if (typeof p.targetPort === "string") {
            const parsed = Number.parseInt(p.targetPort, 10);
            if (!Number.isNaN(parsed)) {
              target = parsed;
            }
          }
          return port === target ? `${port}` : `${port}→${target}`;
        })
      : [];
    rich.push(`  ${ns}/${name} ${svcType} [${ports.join(",")}]`);
    ident.push(`  ${ns}/${name}`);
  }

  const header = `${rich.length} services:`;
  const join = (rows: string[]): string => `${header}\n${rows.join("\n")}\n`;
  return overBudgetLadder({
    full: join(rich),
    digest: () => join(ident),
    replacement: () => `${rich.length} services\n`,
  });
}

// RTK: cloud/container.rs::format_compose_logs / docker_logs / kubectl_logs —
// log streams are passed through a dedup engine and wrapped with a header. tk
// has no separate log engine here, so the raw stream is surfaced under the same
// header (still trimmed) and stays recoverable via `tk --raw`.
function formatDockerLogs(container: string, raw: string): string {
  return `[docker] Logs for ${container}:\n${raw.trim()}`;
}

function formatComposeLogs(raw: string): string {
  if (raw.trim() === "") {
    return "[compose] No logs";
  }
  return `[compose] Logs:\n${raw.trim()}`;
}

function formatKubectlLogs(pod: string, raw: string): string {
  return `Logs for ${pod}:\n${raw.trim()}`;
}

// RTK: cloud/container.rs::kubectl_get_requests_raw_output — `-o/--output`,
// watch, and label/kind display flags force raw passthrough (the user asked for
// a specific machine format, so RTK does not summarize).
function requestsRawOutput(args: string[]): boolean {
  return args.some(
    (arg) =>
      arg === "-o" ||
      arg === "--output" ||
      arg === "-w" ||
      arg === "--watch" ||
      arg === "--show-labels" ||
      arg === "--show-kind" ||
      arg.startsWith("-o") ||
      arg.startsWith("--output="),
  );
}

// RTK: container.rs — the Go-template strings RTK passes to `docker --format`.
// Fields are tab-separated; the formatters above split on "\t". These MUST be
// real tab characters so the spawned `docker` produces the shape the filter
// expects (the migration harness bypasses execute(), so only these construction
// helpers — and their unit tests — guard the real-CLI command shape).
const DOCKER_PS_FORMAT = "{{.ID}}\t{{.Names}}\t{{.Status}}\t{{.Image}}\t{{.Ports}}";
const DOCKER_PS_ALL_FORMAT = "{{.State}}\t{{.ID}}\t{{.Names}}\t{{.Status}}\t{{.Image}}\t{{.Ports}}";
const DOCKER_IMAGES_FORMAT = "{{.Repository}}:{{.Tag}}\t{{.Size}}";
const DOCKER_COMPOSE_PS_FORMAT = "{{.Name}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}";

// ADR 0001 decision 8 + CONTEXT.md "Lossless capture": the capture-time `--tail 100`
// injection RTK uses is REMOVED. Pre-truncating the fetch discards the very bytes
// the recovery contract relies on (a stack trace older than 100 lines is gone with
// no raw to fall back to). The full stream is captured; the formatter de-dups
// losslessly and, over budget, summarises by count + snapshot pointer. A live
// `-f`/`--follow` cannot be captured (it never exits), so it passes through.
function hasFollow(args: string[]): boolean {
  return args.includes("-f") || args.includes("--follow");
}

// docker/compose `logs` accept options that consume the FOLLOWING token as their
// value (`--tail 50`, `--since 1h`, …). The container/service is the first
// positional operand; a naive "first non-dash token" scan would grab such a
// value (e.g. the `50` in `docker logs --tail 50 web`), so skip a value-flag's
// argument while searching. The `--flag=value` form carries its own value inline
// and needs no skip. RTK parses these via clap so the operand is unambiguous;
// this restores the same operand identification on tk's flag-tolerant path.
const DOCKER_LOGS_VALUE_FLAGS = new Set(["--since", "--until", "--tail", "-n"]);
// compose logs shares docker logs' `-n`/`--tail` alias and adds `--index`.
const COMPOSE_LOGS_VALUE_FLAGS = new Set(["--since", "--until", "--tail", "-n", "--index"]);

function firstLogsOperand(args: string[], valueFlags: Set<string>): string | undefined {
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;
    if (arg.startsWith("-")) {
      if (valueFlags.has(arg)) index += 1;
      continue;
    }
    return arg;
  }
  return undefined;
}

// RTK: container.rs docker_ps/docker_images/run_compose_ps/docker_logs command
// construction — RTK does not forward the user's flags; it rewrites each handled
// subcommand into a fixed `--format`/`--tail` invocation so its formatter has a
// stable, headerless tab-separated shape to parse. Unhandled docker subcommands
// pass through unchanged.
export function buildDockerArgs(args: string[]): string[] {
  const sub = args[0];

  if (sub === "ps") {
    const all = args.includes("-a") || args.includes("--all");
    return all
      ? ["ps", "-a", "--format", DOCKER_PS_ALL_FORMAT]
      : ["ps", "--format", DOCKER_PS_FORMAT];
  }

  if (sub === "images") {
    return ["images", "--format", DOCKER_IMAGES_FORMAT];
  }

  if (sub === "compose") {
    const action = args[1];
    if (action === "ps") {
      const all = args.includes("-a") || args.includes("--all");
      const out = ["compose", "ps"];
      if (all) out.push("-a");
      out.push("--format", DOCKER_COMPOSE_PS_FORMAT);
      return out;
    }
    if (action === "logs") {
      if (hasFollow(args)) return args;
      const svc = firstLogsOperand(args.slice(2), COMPOSE_LOGS_VALUE_FLAGS);
      const out = ["compose", "logs"];
      if (svc !== undefined) out.push(svc);
      return out;
    }
    // compose build (and anything else) is a passthrough in RTK.
    return args;
  }

  if (sub === "logs") {
    if (hasFollow(args)) return args;
    const container = firstLogsOperand(args.slice(1), DOCKER_LOGS_VALUE_FLAGS);
    if (container !== undefined) return ["logs", container];
    return args;
  }

  return args;
}

// RTK: container.rs kubectl_pods/kubectl_services/kubectl_logs command
// construction. `get pods|services` (incl. aliases) is rewritten to `-o json`
// with the user's remaining args appended — unless a raw-output flag is present,
// in which case RTK passes through. `logs <pod>` gains `--tail 100`. The
// resource is the FIRST token after `get` (positional), matching kubectl_get_target.
export function buildKubectlArgs(args: string[]): string[] {
  if (args[0] === "get") {
    const afterGet = args.slice(1);
    const resource = afterGet[0];
    const rest = afterGet.slice(1);
    if (resource !== undefined && !resource.startsWith("-") && !requestsRawOutput(rest)) {
      if (resource === "po" || resource === "pod" || resource === "pods") {
        return ["get", "pods", "-o", "json", ...rest];
      }
      if (resource === "svc" || resource === "service" || resource === "services") {
        return ["get", "services", "-o", "json", ...rest];
      }
    }
    return args;
  }

  if (args[0] === "logs") {
    if (hasFollow(args)) return args;
    const after = args.slice(1);
    const pod = after[0];
    if (pod !== undefined) {
      return ["logs", pod, ...after.slice(1)];
    }
    return args;
  }

  return args;
}

// RTK: build a rewritten command without mutating the original — the filter must
// keep seeing the user's args to drive its dispatch (mirrors ls.ts::execute).
function rewriteCommand(command: ParsedCommand, args: string[]): ParsedCommand {
  return {
    ...command,
    args,
    original: [command.program, ...args],
    displayCommand: `${command.program} ${args.join(" ")}`,
  };
}

// RTK: cloud/container.rs::run / run_compose_* / run_kubectl_get dispatch. tk
// reformats the captured stdout instead of re-executing with `--format`/`-o
// json`, so the docker ps/images branches assume tab-separated `--format`
// stdout and the kubectl branches assume `-o json` stdout, matching how RTK
// invokes the child internally. Returns a LadderResult so a declared omission
// reaches makeFilteredResult; passthrough/log/build paths carry no omission.
function formatDocker(args: string[], raw: string): LadderResult {
  const sub = args[0];

  if (sub === "compose") {
    const action = args[1];
    if (action === "ps") {
      return formatComposePs(raw);
    }
    if (action === "logs") {
      return { text: formatComposeLogs(raw) };
    }
    if (action === "build") {
      return { text: formatComposeBuild(raw) };
    }
    return { text: raw };
  }

  if (sub === "ps") {
    if (args.includes("-a")) {
      return dockerPsAll(raw);
    }
    return dockerPs(raw);
  }

  if (sub === "images") {
    return dockerImages(raw);
  }

  if (sub === "logs") {
    // Identify the container the same way buildDockerArgs does so the header
    // label matches the stream actually fetched (skip value-flag arguments).
    const container = firstLogsOperand(args.slice(1), DOCKER_LOGS_VALUE_FLAGS) ?? "";
    return { text: formatDockerLogs(container, raw) };
  }

  return { text: raw };
}

function parseKubectlJson(raw: string): unknown | null {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function formatKubectl(args: string[], raw: string): LadderResult {
  // RTK: kubectl get <pods|services> dispatch via kubectl_get_target — the
  // resource is the FIRST token after `get` (positional), rest is everything
  // after it. Mirrors buildKubectlArgs so execute() and filter() agree.
  if (args[0] === "get") {
    const afterGet = args.slice(1);
    const resource = afterGet[0];
    const rest = afterGet.slice(1);
    if (resource !== undefined && !resource.startsWith("-") && !requestsRawOutput(rest)) {
      if (resource === "po" || resource === "pod" || resource === "pods") {
        const json = parseKubectlJson(raw);
        return json === null ? { text: raw } : formatKubectlPods(json);
      }
      if (resource === "svc" || resource === "service" || resource === "services") {
        const json = parseKubectlJson(raw);
        return json === null ? { text: raw } : formatKubectlServices(json);
      }
    }
    return { text: raw };
  }

  if (args[0] === "logs") {
    const pod = args.slice(1).find((a) => !a.startsWith("-")) ?? "";
    return { text: formatKubectlLogs(pod, raw) };
  }

  return { text: raw };
}

function matchesDocker(command: ParsedCommand): boolean {
  return command.program === "docker";
}

function matchesKubectl(command: ParsedCommand): boolean {
  return command.program === "kubectl";
}

export const dockerHandler: CommandHandler = {
  name: "docker",
  traits: { cacheable: true, ttlClass: "fast" },
  programs: ["docker"],

  matches: matchesDocker,

  execute(command) {
    // RTK: container.rs rewrites each handled subcommand into a fixed
    // `--format`/`--tail` invocation before spawning docker.
    return executeCommand(rewriteCommand(command, buildDockerArgs(command.args)));
  },

  async filter(raw, command, options) {
    // RTK: container.rs early_exit_on_failure — on failure RTK surfaces stderr
    // and tracks raw; tk returns the unfiltered streams so diagnostics survive.
    if (raw.exitCode !== 0) {
      return makeFilteredResult(this, raw, rawText(raw), options);
    }
    const { text, omission } = formatDocker(command.args, raw.stdout);
    return makeFilteredResult(this, raw, text, options, undefined, omission);
  },
};

export const kubectlHandler: CommandHandler = {
  name: "kubectl",
  traits: { cacheable: true, ttlClass: "fast" },
  programs: ["kubectl"],

  matches: matchesKubectl,

  execute(command) {
    // RTK: container.rs rewrites `get pods|services` to `-o json` and `logs` to
    // `--tail 100` before spawning kubectl.
    return executeCommand(rewriteCommand(command, buildKubectlArgs(command.args)));
  },

  async filter(raw, command, options) {
    if (raw.exitCode !== 0) {
      return makeFilteredResult(this, raw, rawText(raw), options);
    }
    const { text, omission } = formatKubectl(command.args, raw.stdout);
    return makeFilteredResult(this, raw, text, options, undefined, omission);
  },
};
