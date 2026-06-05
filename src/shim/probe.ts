import { spawnSync } from "node:child_process";
import { delimiter } from "node:path";

// Interception probe (goal Phase 2 step 5, "most fragile assumption"). Spawn a
// NON-interactive shell the way a tool-shell would, with the shim dir prepended
// to PATH, and confirm a shimmed program resolves INTO the shim dir. This proves
// the load-bearing assumption — that the injected PATH is actually honored —
// rather than silently shipping a no-op shim. PASS/FAIL is reported by status
// and consulted by `tg init` to fall back to injection when the shim is dead.

export type ProbeResult = { pass: boolean; resolved: string | null; program: string };

export function runInterceptionProbe(
  shimDir: string,
  program = "git",
  platform: NodeJS.Platform = process.platform,
): ProbeResult {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PATH: `${shimDir}${delimiter}${process.env.PATH ?? ""}`,
    TG_SHIM_DIR: shimDir,
  };

  let resolved: string | null = null;
  if (platform === "win32") {
    const r = spawnSync("where", [program], { encoding: "utf8", env });
    resolved = (r.stdout ?? "").split(/\r?\n/).find((l) => l.trim() !== "")?.trim() ?? null;
  } else {
    const r = spawnSync("sh", ["-c", `command -v ${program}`], { encoding: "utf8", env });
    resolved = (r.stdout ?? "").trim() || null;
  }

  const pass = resolved !== null && resolved.startsWith(shimDir);
  return { pass, resolved, program };
}
