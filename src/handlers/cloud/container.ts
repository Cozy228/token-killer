import { executeCommand } from "../../executor.js";
import type { CommandHandler, ParsedCommand } from "../../types.js";
import { makeFilteredResult, rawText } from "../base.js";

// RTK: cloud/container.rs — caps come from core/truncate.rs.
// CAP_LIST = 20 (docker ps, compose ps, kubectl services),
// CAP_INVENTORY = 50 (docker images), CAP_WARNINGS = 10 (kubectl pod issues).
const CAP_LIST = 20;
const CAP_INVENTORY = 50;
const CAP_WARNINGS = 10;

// RTK: cloud/container.rs::compact_ports — extract bare port numbers from a
// docker ports column. Keeps the host-side port (after the final ':' before
// "->"), collapses to "first, second, … +N" past 3 entries, "-" when empty.
function compactPorts(ports: string): string {
  if (ports === "") {
    return "-";
  }
  const portNums = ports
    .split(",")
    .map((p) => {
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

// RTK: cloud/container.rs::docker_ps — "[docker] N containers:" header then one
// line per container; truncates past CAP_LIST with "  … +N more". (tg receives
// the `--format` stdout that RTK produces internally and reformats it.)
function dockerPs(raw: string): string {
  if (raw.trim() === "") {
    return "[docker] 0 containers";
  }
  const lines = raw
    .split("\n")
    .filter((l) => l.trim() !== "")
    .map((line) => formatContainerLineFromParts(line.split("\t"), true))
    .filter((l): l is string => l !== null);

  let rtk = `[docker] ${lines.length} containers:\n`;
  for (const entry of lines.slice(0, CAP_LIST)) {
    rtk += entry;
  }
  if (lines.length > CAP_LIST) {
    rtk += `  … +${lines.length - CAP_LIST} more\n`;
  }
  return rtk;
}

// RTK: cloud/container.rs::docker_ps_all — first column is State; running/
// restarting are grouped under "[docker] N running:", everything else under
// "[docker] N stopped/exited:". Each group truncates at 20.
function dockerPsAll(raw: string): string {
  const running: string[] = [];
  const stopped: string[] = [];
  for (const line of raw.split("\n").filter((l) => l.trim() !== "")) {
    const parts = line.split("\t");
    const state = parts[0] ?? "";
    const isRunning = state === "running" || state === "restarting";
    const entry = formatContainerLineFromParts(parts.slice(1), isRunning);
    if (entry !== null) {
      (isRunning ? running : stopped).push(entry);
    }
  }

  const MAX = 20;
  let rtk = `[docker] ${running.length} running:\n`;
  for (const l of running.slice(0, MAX)) {
    rtk += l;
  }
  if (running.length > MAX) {
    rtk += `  … +${running.length - MAX} more\n`;
  }
  if (stopped.length > 0) {
    rtk += `[docker] ${stopped.length} stopped/exited:\n`;
    for (const l of stopped.slice(0, MAX)) {
      rtk += l;
    }
    if (stopped.length > MAX) {
      rtk += `  … +${stopped.length - MAX} more\n`;
    }
  }
  return rtk;
}

// RTK: cloud/container.rs::docker_images — "[docker] N images (TOTAL)" header
// where TOTAL sums GB/MB sizes (GB→MB ×1024, displayed GB past 1024MB). One
// "  image [size]" line each, truncated past CAP_INVENTORY.
function dockerImages(raw: string): string {
  const lines = raw.split("\n").filter((l) => l !== "");
  if (lines.length === 0) {
    return "[docker] 0 images";
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

  const totalDisplay = totalMb > 1024 ? `${(totalMb / 1024).toFixed(1)}GB` : `${totalMb.toFixed(0)}MB`;
  let rtk = `[docker] ${lines.length} images (${totalDisplay})\n`;

  const imageLines = lines.map((line) => {
    const parts = line.split("\t");
    return `  ${parts[0] ?? ""} [${parts[1] ?? ""}]\n`;
  });
  for (const l of imageLines.slice(0, CAP_INVENTORY)) {
    rtk += l;
  }
  if (imageLines.length > CAP_INVENTORY) {
    rtk += `  … +${imageLines.length - CAP_INVENTORY} more\n`;
  }
  return rtk;
}

// RTK: cloud/container.rs::format_compose_ps — tab-separated
// "Name\tImage\tStatus\tPorts" (headerless --format output). Shortens image to
// its last path segment, drops empty port brackets, truncates past CAP_LIST.
function formatComposePs(raw: string): string {
  const lines = raw.split("\n").filter((l) => l.trim() !== "");
  if (lines.length === 0) {
    return "[compose] 0 services";
  }

  let result = `[compose] ${lines.length} services:\n`;
  const formatted = lines
    .map((line) => {
      const parts = line.split("\t");
      if (parts.length < 4) {
        return null;
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
      return `  ${name} (${shortImage}) ${status}${portStr}`;
    })
    .filter((l): l is string => l !== null);

  for (const line of formatted.slice(0, CAP_LIST)) {
    result += `${line}\n`;
  }
  if (formatted.length > CAP_LIST) {
    result += `  … +${formatted.length - CAP_LIST} more\n`;
  }
  return result.replace(/\s+$/, "");
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
    result += buildingLine !== undefined ? `[compose] ${buildingLine.trim()}\n` : "[compose] Build:\n";
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
// pods (incl. CrashLoop/Error waiting reasons) under "[warn] Issues:".
function formatKubectlPods(json: unknown): string {
  const items = (json as { items?: unknown }).items;
  if (!Array.isArray(items) || items.length === 0) {
    return "No pods found\n";
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
        if (typeof reason === "string" && (reason.includes("CrashLoop") || reason.includes("Error"))) {
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

  let out = `${items.length} pods: ${parts.join(", ")}\n`;
  if (issues.length > 0) {
    out += "[warn] Issues:\n";
    for (const issue of issues.slice(0, CAP_WARNINGS)) {
      out += `  ${issue}\n`;
    }
    if (issues.length > CAP_WARNINGS) {
      out += `  … +${issues.length - CAP_WARNINGS} more`;
    }
  }
  return out;
}

// RTK: cloud/container.rs::format_kubectl_services — parses `kubectl get
// services -o json`. One "  ns/name TYPE [ports]" line each; ports render as
// "port" or "port→target", truncated past CAP_LIST.
function formatKubectlServices(json: unknown): string {
  const items = (json as { items?: unknown }).items;
  if (!Array.isArray(items) || items.length === 0) {
    return "No services found\n";
  }

  let out = `${items.length} services:\n`;
  const allLines = (items as Record<string, any>[]).map((svc) => {
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
    return `  ${ns}/${name} ${svcType} [${ports.join(",")}]`;
  });

  for (const line of allLines.slice(0, CAP_LIST)) {
    out += `${line}\n`;
  }
  if (allLines.length > CAP_LIST) {
    out += `  … +${allLines.length - CAP_LIST} more`;
    out += "\n";
  }
  return out;
}

// RTK: cloud/container.rs::format_compose_logs / docker_logs / kubectl_logs —
// log streams are passed through a dedup engine and wrapped with a header. tg
// has no separate log engine here, so the raw stream is surfaced under the same
// header (still trimmed) and stays recoverable via `tg --raw`.
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
const DOCKER_PS_ALL_FORMAT =
  "{{.State}}\t{{.ID}}\t{{.Names}}\t{{.Status}}\t{{.Image}}\t{{.Ports}}";
const DOCKER_IMAGES_FORMAT = "{{.Repository}}:{{.Tag}}\t{{.Size}}";
const DOCKER_COMPOSE_PS_FORMAT = "{{.Name}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}";
// RTK: docker_logs / kubectl_logs / run_compose_logs all cap the stream at 100.
const LOGS_TAIL = "100";

// docker/compose `logs` accept options that consume the FOLLOWING token as their
// value (`--tail 50`, `--since 1h`, …). The container/service is the first
// positional operand; a naive "first non-dash token" scan would grab such a
// value (e.g. the `50` in `docker logs --tail 50 web`), so skip a value-flag's
// argument while searching. The `--flag=value` form carries its own value inline
// and needs no skip. RTK parses these via clap so the operand is unambiguous;
// this restores the same operand identification on tg's flag-tolerant path.
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
      const svc = firstLogsOperand(args.slice(2), COMPOSE_LOGS_VALUE_FLAGS);
      const out = ["compose", "logs", "--tail", LOGS_TAIL];
      if (svc !== undefined) out.push(svc);
      return out;
    }
    // compose build (and anything else) is a passthrough in RTK.
    return args;
  }

  if (sub === "logs") {
    const container = firstLogsOperand(args.slice(1), DOCKER_LOGS_VALUE_FLAGS);
    if (container !== undefined) return ["logs", "--tail", LOGS_TAIL, container];
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
    const after = args.slice(1);
    const pod = after[0];
    if (pod !== undefined) {
      return ["logs", "--tail", LOGS_TAIL, pod, ...after.slice(1)];
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

// RTK: cloud/container.rs::run / run_compose_* / run_kubectl_get dispatch. tg
// reformats the captured stdout instead of re-executing with `--format`/`-o
// json`, so the docker ps/images branches assume tab-separated `--format`
// stdout and the kubectl branches assume `-o json` stdout, matching how RTK
// invokes the child internally.
function formatDocker(args: string[], raw: string): string {
  const sub = args[0];

  if (sub === "compose") {
    const action = args[1];
    if (action === "ps") {
      return formatComposePs(raw);
    }
    if (action === "logs") {
      return formatComposeLogs(raw);
    }
    if (action === "build") {
      return formatComposeBuild(raw);
    }
    return raw;
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
    return formatDockerLogs(container, raw);
  }

  return raw;
}

function parseKubectlJson(raw: string): unknown | null {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function formatKubectl(args: string[], raw: string): string {
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
        return json === null ? raw : formatKubectlPods(json);
      }
      if (resource === "svc" || resource === "service" || resource === "services") {
        const json = parseKubectlJson(raw);
        return json === null ? raw : formatKubectlServices(json);
      }
    }
    return raw;
  }

  if (args[0] === "logs") {
    const pod = args.slice(1).find((a) => !a.startsWith("-")) ?? "";
    return formatKubectlLogs(pod, raw);
  }

  return raw;
}

function matchesDocker(command: ParsedCommand): boolean {
  return command.program === "docker";
}

function matchesKubectl(command: ParsedCommand): boolean {
  return command.program === "kubectl";
}

export const dockerHandler: CommandHandler = {
  name: "docker",
  programs: ["docker"],

  matches: matchesDocker,

  execute(command) {
    // RTK: container.rs rewrites each handled subcommand into a fixed
    // `--format`/`--tail` invocation before spawning docker.
    return executeCommand(rewriteCommand(command, buildDockerArgs(command.args)));
  },

  async filter(raw, command, options) {
    // RTK: container.rs early_exit_on_failure — on failure RTK surfaces stderr
    // and tracks raw; tg returns the unfiltered streams so diagnostics survive.
    if (raw.exitCode !== 0) {
      return makeFilteredResult(this.name, raw, rawText(raw), options);
    }
    return makeFilteredResult(this.name, raw, formatDocker(command.args, raw.stdout), options);
  },
};

export const kubectlHandler: CommandHandler = {
  name: "kubectl",
  programs: ["kubectl"],

  matches: matchesKubectl,

  execute(command) {
    // RTK: container.rs rewrites `get pods|services` to `-o json` and `logs` to
    // `--tail 100` before spawning kubectl.
    return executeCommand(rewriteCommand(command, buildKubectlArgs(command.args)));
  },

  async filter(raw, command, options) {
    if (raw.exitCode !== 0) {
      return makeFilteredResult(this.name, raw, rawText(raw), options);
    }
    return makeFilteredResult(this.name, raw, formatKubectl(command.args, raw.stdout), options);
  },
};
