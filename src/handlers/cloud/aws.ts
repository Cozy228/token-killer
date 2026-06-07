import { executeCommand } from "../../executor.js";
import type { CommandHandler, ParsedCommand } from "../../types.js";
import { makeFilteredResult, rawText } from "../base.js";
import { type LadderResult, overBudgetLadder } from "../common/budget.js";

// RTK: cloud/aws_cmd.rs — AWS CLI emits verbose JSON; RTK parses it (serde_json)
// and emits compact, LLM-oriented summaries. This is a faithful port of a
// representative subset of the dispatch in aws_cmd.rs::run. Each covered service
// mirrors the corresponding filter_* function and its #[test] exactly. Services
// not covered here fall through to raw (they are not under test).

// ADR 0001 decisions 2/5/7: RTK's CAP_LIST cap and its "… +N more <label>" overflow
// markers are REMOVED. A listing that fits the token budget ships in full; over
// budget it runs the two-step ladder — a lossless step-1 digest (every item kept,
// decoration dropped) then a step-2 count replacement — declaring the omission so
// the gate force-persists raw and appends a recovery pointer. No "… +N more".
type FilterResult = LadderResult | null;

function matchesAws(command: ParsedCommand): boolean {
  return command.program === "aws";
}

// RTK: core/utils.rs::truncate_iso_date — keep the first 10 chars (the date) of an
// ISO 8601 datetime; strings shorter than 10 chars (e.g. "?") pass through.
function truncateIsoDate(date: string): string {
  return date.length >= 10 ? date.slice(0, 10) : date;
}

// RTK: core/utils.rs::shorten_arn — take the segment after the last "/", or after
// the last ":" when there is no "/".
function shortenArn(arn: string): string {
  const slashIdx = arn.lastIndexOf("/");
  if (slashIdx !== -1) {
    return arn.slice(slashIdx + 1);
  }
  const colonIdx = arn.lastIndexOf(":");
  return colonIdx !== -1 ? arn.slice(colonIdx + 1) : arn;
}

function asString(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function asInt(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : fallback;
}

function parseJson(jsonStr: string): unknown | undefined {
  try {
    return JSON.parse(jsonStr) as unknown;
  } catch {
    return undefined;
  }
}

function asArray(value: unknown): unknown[] | undefined {
  return Array.isArray(value) ? value : undefined;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

// RTK: cloud/aws_cmd.rs::filter_sts_identity / test_filter_sts_identity
// -> "AWS: <Account> <Arn>", with "?" for missing fields. Invalid JSON -> None.
function filterStsIdentity(jsonStr: string): FilterResult {
  const v = parseJson(jsonStr);
  if (v === undefined) return null;
  const obj = asRecord(v);
  const account = asString(obj.Account, "?");
  const arn = asString(obj.Arn, "?");
  return { text: `AWS: ${account} ${arn}` };
}

// RTK: cloud/aws_cmd.rs::filter_ec2_instances / test_filter_ec2_instances
// Header "EC2: <n> instances" followed by one indented line per instance:
// "<id> <state> <type> <privateIp> pub:<publicIp> vpc:<vpc> subnet:<subnet>
//  sg:[<sgIds>] (<NameTag>)". Missing scalars -> "-"; no Name tag -> "(-)".
function filterEc2Instances(jsonStr: string): FilterResult {
  const v = parseJson(jsonStr);
  if (v === undefined) return null;
  const reservations = asArray(asRecord(v).Reservations);
  if (reservations === undefined) return null;

  const rich: string[] = [];
  const ident: string[] = [];
  for (const res of reservations) {
    const insts = asArray(asRecord(res).Instances);
    if (!insts) continue;
    for (const instRaw of insts) {
      const inst = asRecord(instRaw);
      const id = asString(inst.InstanceId, "?");
      const state = asString(asRecord(inst.State).Name, "?");
      const itype = asString(inst.InstanceType, "?");
      const privateIp = asString(inst.PrivateIpAddress, "-");
      const publicIp = asString(inst.PublicIpAddress, "-");
      const subnet = asString(inst.SubnetId, "-");
      const vpc = asString(inst.VpcId, "-");

      const tags = asArray(inst.Tags) ?? [];
      const nameTag = tags.map((t) => asRecord(t)).find((t) => t.Key === "Name");
      const name = nameTag ? asString(nameTag.Value, "-") : "-";

      const sgs = (asArray(inst.SecurityGroups) ?? [])
        .map((sg) => asRecord(sg).GroupId)
        .filter((g): g is string => typeof g === "string");
      const sgStr = sgs.length === 0 ? "-" : sgs.join(",");

      // RTK formats as: "{id} {state} {itype} {private_ip} pub:{public_ip}
      // vpc:{vpc} subnet:{subnet} sg:[{sg_str}] ({name})"
      rich.push(
        `  ${id} ${state} ${itype} ${privateIp} pub:${publicIp} vpc:${vpc} subnet:${subnet} sg:[${sgStr}] (${name})`,
      );
      // ADR 0001 step-1 lossless digest: keep every instance's id/state/name (the
      // "which instance, healthy?" evidence), drop the network decoration.
      ident.push(`  ${id} ${state} (${name})`);
    }
  }

  const total = rich.length;
  const header = `EC2: ${total} instances`;
  return overBudgetLadder({
    full: total === 0 ? header : `${header}\n${rich.join("\n")}`,
    digest: () => (total === 0 ? header : `${header}\n${ident.join("\n")}`),
    replacement: () => header,
  });
}

// RTK: cloud/aws_cmd.rs::filter_s3_ls — `aws s3 ls` emits plain text (not JSON).
// ADR 0001 decision 2: RTK's "keep first N then `… +N more items`" cap is removed.
// Each line is an object/prefix (pure evidence with no decoration), so there is no
// lossless digest step — within budget every line ships verbatim, over budget it
// falls to a count replacement (+ snapshot pointer).
function filterS3Ls(output: string): LadderResult {
  const lines = output.split("\n");
  // Match Rust `.lines()`: a trailing newline does not yield a final empty line.
  if (lines.length > 0 && lines[lines.length - 1] === "") {
    lines.pop();
  }
  const total = lines.length;
  return overBudgetLadder({
    full: lines.join("\n"),
    replacement: () => `${total} items`,
  });
}

// RTK: cloud/aws_cmd.rs::filter_cfn_describe_stacks / test_filter_cfn_describe_stacks_*
// Per stack: "<StackName> <StackStatus> <date>" (date = truncate_iso_date of
// LastUpdatedTime or CreationTime, else "?"), then "  <OutputKey>=<OutputValue>"
// for each Output. Overflow via join_with_overflow(..., "stacks").
function filterCfnDescribeStacks(jsonStr: string): FilterResult {
  const v = parseJson(jsonStr);
  if (v === undefined) return null;
  const stacks = asArray(asRecord(v).Stacks);
  if (stacks === undefined) return null;

  const fullLines: string[] = [];
  const stackLines: string[] = [];
  const total = stacks.length;
  for (const stackRaw of stacks) {
    const stack = asRecord(stackRaw);
    const name = asString(stack.StackName, "?");
    const status = asString(stack.StackStatus, "?");
    const dateRaw = asString(stack.LastUpdatedTime, "") || asString(stack.CreationTime, "") || "?";
    const head = `${name} ${status} ${truncateIsoDate(dateRaw)}`;
    fullLines.push(head);
    stackLines.push(head);

    const outputs = asArray(stack.Outputs);
    if (outputs) {
      for (const outRaw of outputs) {
        const out = asRecord(outRaw);
        const key = asString(out.OutputKey, "?");
        const val = asString(out.OutputValue, "?");
        fullLines.push(`  ${key}=${val}`);
      }
    }
  }

  // ADR 0001 step-1 digest: keep every stack's name/status/date, drop the per-stack
  // Outputs (`key=val`) decoration.
  return overBudgetLadder({
    full: fullLines.join("\n"),
    digest: () => stackLines.join("\n"),
    replacement: () => `${total} stacks`,
  });
}

// RTK: cloud/aws_cmd.rs::filter_cfn_list_stacks / test_filter_cfn_list_stacks
// Per summary: "<StackName> <StackStatus> <date>"; overflow "stacks".
function filterCfnListStacks(jsonStr: string): FilterResult {
  const v = parseJson(jsonStr);
  if (v === undefined) return null;
  const stacks = asArray(asRecord(v).StackSummaries);
  if (stacks === undefined) return null;

  const lines = stacks.map((stackRaw) => {
    const stack = asRecord(stackRaw);
    const name = asString(stack.StackName, "?");
    const status = asString(stack.StackStatus, "?");
    const dateRaw = asString(stack.LastUpdatedTime, "") || asString(stack.CreationTime, "") || "?";
    return `${name} ${status} ${truncateIsoDate(dateRaw)}`;
  });

  // Each line is already minimal (name/status/date) — no lossless digest step.
  return overBudgetLadder({
    full: lines.join("\n"),
    replacement: () => `${stacks.length} stacks`,
  });
}

// RTK: cloud/aws_cmd.rs::filter_lambda_list / test_filter_lambda_list
// Per function: "<FunctionName> <Runtime> <MemorySize>MB <Timeout>s <State>"
// (State defaults to "active"). Environment is intentionally NOT read (secrets).
function filterLambdaList(jsonStr: string): FilterResult {
  const v = parseJson(jsonStr);
  if (v === undefined) return null;
  const functions = asArray(asRecord(v).Functions);
  if (functions === undefined) return null;

  const total = functions.length;
  const rich: string[] = [];
  const ident: string[] = [];
  for (const funcRaw of functions) {
    const func = asRecord(funcRaw);
    const name = asString(func.FunctionName, "?");
    const runtime = asString(func.Runtime, "?");
    const memory = asInt(func.MemorySize, 0);
    const timeout = asInt(func.Timeout, 0);
    const state = asString(func.State, "active");
    // SECURITY: Environment is intentionally NOT read (may contain secrets).
    rich.push(`${name} ${runtime} ${memory}MB ${timeout}s ${state}`);
    // ADR 0001 step-1 digest: keep every function's name + state, drop runtime/mem/timeout.
    ident.push(`${name} ${state}`);
  }

  return overBudgetLadder({
    full: rich.join("\n"),
    digest: () => ident.join("\n"),
    replacement: () => `${total} functions`,
  });
}

// RTK: cloud/aws_cmd.rs::filter_ecs_list_services / test_filter_ecs_list_services
// Shortens each serviceArn to its trailing name component; overflow "services".
function filterEcsListServices(jsonStr: string): FilterResult {
  const v = parseJson(jsonStr);
  if (v === undefined) return null;
  const arns = asArray(asRecord(v).serviceArns);
  if (arns === undefined) return null;

  const total = arns.length;
  const lines = arns.map((arn) => shortenArn(asString(arn, "?")));
  // Service names only — no decoration to drop, so no lossless digest step.
  return overBudgetLadder({
    full: lines.join("\n"),
    replacement: () => `${total} services`,
  });
}

// RTK: cloud/aws_cmd.rs::run — the dispatch. Each arm requires the exact subcommand
// + first operation arg. Anything else (uncovered services / mutations) returns raw.
function filterAws(args: string[], stdout: string): FilterResult {
  const subcommand = args[0] ?? "";
  const op = args[1] ?? "";

  if (subcommand === "sts" && op === "get-caller-identity") return filterStsIdentity(stdout);
  if (subcommand === "s3" && op === "ls") return filterS3Ls(stdout);
  if (subcommand === "ec2" && op === "describe-instances") return filterEc2Instances(stdout);
  if (subcommand === "cloudformation" && op === "describe-stacks")
    return filterCfnDescribeStacks(stdout);
  if (subcommand === "cloudformation" && op === "list-stacks") return filterCfnListStacks(stdout);
  if (subcommand === "lambda" && op === "list-functions") return filterLambdaList(stdout);
  if (subcommand === "ecs" && op === "list-services") return filterEcsListServices(stdout);

  return null;
}

export const awsHandler: CommandHandler = {
  name: "aws",
  programs: ["aws"],

  matches: matchesAws,

  execute(command) {
    return executeCommand(command);
  },

  async filter(raw, command, options) {
    // RTK: cloud/aws_cmd.rs — on a failed command RTK prints stderr verbatim and
    // does not filter; mirror that by surfacing the raw output unchanged.
    if (raw.exitCode !== 0) {
      return makeFilteredResult(this.name, raw, rawText(raw), options);
    }

    const result = filterAws(command.args, raw.stdout);
    if (result === null) {
      // Uncovered service or unparseable JSON: fall back to raw (RTK's None path
      // / generic passthrough). Not under test.
      return makeFilteredResult(this.name, raw, rawText(raw), options);
    }

    return makeFilteredResult(this.name, raw, result.text, options, undefined, result.omission);
  },
};
