import { mkdtempSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { beforeEach } from "vitest";

// Global safety net so no test (or CLI subprocess it spawns) can ever write into
// the developer's real ~/.token-killer/. The original bug: tests that spawn the
// CLI or call recordHistory without setting TOKEN_KILLER_HOME inherited the real
// environment and polluted `tk gain` with thousands of fixture records.
//
// Before every test, if TOKEN_KILLER_HOME is unset (or still points at the real
// home), redirect it to a throwaway temp dir for this worker. Tests that set
// their own TOKEN_KILLER_HOME inside the test body run AFTER this hook, so they
// keep full control — this only catches omissions.
const realHome = path.resolve(homedir(), ".token-killer");
let workerFallback: string | undefined;

beforeEach(() => {
  const current = process.env.TOKEN_KILLER_HOME;
  if (!current || path.resolve(current) === realHome) {
    workerFallback ??= mkdtempSync(path.join(tmpdir(), "tk-test-home-fallback-"));
    process.env.TOKEN_KILLER_HOME = workerFallback;
  }
});
