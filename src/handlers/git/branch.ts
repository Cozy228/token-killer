import { executeCommand } from "../../executor.js";
import type { CommandHandler } from "../../types.js";
import { makeFilteredResult } from "../base.js";

// RTK: rtk/src/core/truncate.rs::CAP_WARNINGS — cap the remote-only section at 10.
const MAX_REMOTE_BRANCHES = 10;

// RTK: git.rs::filter_branch_output — keep the current branch and locals, fold remote
// branches down to their bare name, drop ones that duplicate a local/current, and list
// the remaining remote-only branches under a capped "remote-only (N):" section.
function formatBranch(text: string): string {
  let current = "";
  const local: string[] = [];
  const remote: string[] = [];
  const seenRemote = new Set<string>();

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === "") continue;
    if (line.startsWith("* ")) {
      current = line.slice(2);
    } else if (line.startsWith("remotes/")) {
      const rest = line.slice("remotes/".length);
      const slash = rest.indexOf("/");
      if (slash === -1) continue;
      const branch = rest.slice(slash + 1);
      if (branch.startsWith("HEAD ")) continue;
      if (!seenRemote.has(branch)) {
        seenRemote.add(branch);
        remote.push(branch);
      }
    } else {
      local.push(line);
    }
  }

  if (current === "" && local.length === 0 && remote.length === 0) return "\n";

  const out = [`* ${current}`];
  for (const branch of local) out.push(`  ${branch}`);

  const remoteOnly = remote.filter((branch) => branch !== current && !local.includes(branch));
  if (remoteOnly.length > 0) {
    out.push(`  remote-only (${remoteOnly.length}):`);
    for (const branch of remoteOnly.slice(0, MAX_REMOTE_BRANCHES)) out.push(`    ${branch}`);
    if (remoteOnly.length > MAX_REMOTE_BRANCHES) {
      out.push(`    ... +${remoteOnly.length - MAX_REMOTE_BRANCHES} more`);
    }
  }

  return `${out.join("\n")}\n`;
}

export const gitBranchHandler: CommandHandler = {
  name: "git-branch",

  matches(command) {
    return command.program === "git" && command.args[0] === "branch";
  },

  execute(command) {
    return executeCommand(command);
  },

  async filter(raw, _command, options) {
    return makeFilteredResult(this.name, raw, formatBranch(raw.stdout || raw.stderr), options);
  },
};
