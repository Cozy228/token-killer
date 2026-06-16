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

// HTML reports (tk gain / tk inspect, now HTML-by-default) try to open a browser
// via `open`/`xdg-open`. Suppress that in the whole test suite so no test ever
// spawns a GUI process — the report file is still written, just never opened.
process.env.TK_NO_OPEN = "1";

beforeEach(() => {
  const current = process.env.TOKEN_KILLER_HOME;
  if (!current || path.resolve(current) === realHome) {
    workerFallback ??= mkdtempSync(path.join(tmpdir(), "tk-test-home-fallback-"));
    process.env.TOKEN_KILLER_HOME = workerFallback;
  }
});
