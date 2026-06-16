import { spawnSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { delimiter } from "node:path";

// Interception probe (goal Phase 2 step 5, "most fragile assumption"). Spawn a
// NON-interactive shell the way a tool-shell would, with the shim dir prepended
// to PATH, and confirm a shimmed program resolves INTO the shim dir. This proves
// the load-bearing assumption — that the injected PATH is actually honored —
// rather than silently shipping a no-op shim. PASS/FAIL is reported by status
// and consulted by `tk install` to fall back to injection when the shim is dead.

export type ProbeResult = { pass: boolean; resolved: string | null; program: string };

export function runInterceptionProbe(
  shimDir: string,
  program = "git",
  platform: NodeJS.Platform = process.platform,
): ProbeResult {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PATH: `${shimDir}${delimiter}${process.env.PATH ?? ""}`,
    TK_SHIM_DIR: shimDir,
  };

  let resolved: string | null = null;
  if (platform === "win32") {
    const r = spawnSync("where", [program], { encoding: "utf8", env, timeout: 5000 });
    resolved =
      (r.stdout ?? "")
        .split(/\r?\n/)
        .find((l) => l.trim() !== "")
        ?.trim() ?? null;
  } else {
    const r = spawnSync("sh", ["-c", `command -v ${program}`], {
      encoding: "utf8",
      env,
      timeout: 5000,
    });
    resolved = (r.stdout ?? "").trim() || null;
  }

  let pass = resolved !== null && resolved.startsWith(shimDir);
  // Windows `where` returns the canonical LONG path, but shimDir can be an 8.3 short
  // form (e.g. `RUNNER~1` under %TEMP%) or differ in case — a literal startsWith then
  // wrongly reports a working shim as dead. Re-compare both paths canonicalized.
  if (!pass && resolved !== null && platform === "win32") {
    try {
      pass = realpathSync
        .native(resolved)
        .toLowerCase()
        .startsWith(realpathSync.native(shimDir).toLowerCase());
    } catch {
      /* leave pass=false — a path that can't be realpath'd isn't a valid hit */
    }
  }
  return { pass, resolved, program };
}
