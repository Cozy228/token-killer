// Slice 1 — `tk hook` subcommand dispatcher.
//
//   tk hook copilot      runtime handler the host invokes (reads stdin → decision)
//   tk hook check <cmd>  dry-run: show how a command would be rewritten (mirrors
//                        `rtk hook check`); the test/debug surface
//
// Installation is NOT here — it is `tk init`'s job (DESIGN §3.1). There is no
// `tk hook install`/`init`/`status`.

import { runHookCopilot } from "./copilot.js";
import { rewriteCommand } from "./rewrite.js";

function err(line: string): void {
  process.stderr.write(`${line}\n`);
}

// `tk hook check <command>` — print how the command would be rewritten. Joins the
// trailing argv so both `tk hook check git status` and `tk hook check "git status"`
// work. Human-readable on stdout; exit 0.
function runHookCheck(argv: string[]): number {
  const command = argv.join(" ").trim();
  if (command.length === 0) {
    err("tk hook check: missing command");
    return 1;
  }
  const r = rewriteCommand(command);
  switch (r.decision) {
    case "rewrite":
      process.stdout.write(`rewrite: ${r.rewritten}\n`);
      break;
    case "suggest":
      process.stdout.write(`suggest: ${r.reason ?? ""}\n`);
      break;
    case "deny":
      process.stdout.write(`deny: ${r.reason ?? ""}\n`);
      break;
    case "pass":
    default:
      process.stdout.write(`pass: ${command}\n`);
      break;
  }
  return 0;
}

export async function runHook(argv: string[]): Promise<number> {
  const sub = argv[0];
  switch (sub) {
    case "copilot":
      return runHookCopilot();
    case "check":
      return runHookCheck(argv.slice(1));
    default:
      err(`tk hook: unknown subcommand '${sub ?? ""}' (expected copilot | check)`);
      return 1;
  }
}
