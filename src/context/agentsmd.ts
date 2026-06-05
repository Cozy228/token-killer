// `tk agentsmd patch|restore` — compatibility alias (goal §"CLI contract",
// §"Slice 6"). Manages the Token Killer token-budget marker block in the
// user-level instruction target. `patch` installs it (idempotent); `restore`
// removes only the managed block.

import { homedir } from "node:os";

import { applyMarkerBlock } from "./applySafe.js";

export async function runAgentsmd(
  argv: string[],
  nowMs: number = Date.now(),
  home: string = homedir(),
): Promise<number> {
  const sub = argv[0];
  if (sub === "patch") return applyMarkerBlock(home, "insert", nowMs);
  if (sub === "restore") return applyMarkerBlock(home, "remove", nowMs);
  process.stderr.write(`tk agentsmd: expected 'patch' or 'restore', got '${sub ?? ""}'\n`);
  return 1;
}
