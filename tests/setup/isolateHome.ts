import { mkdtempSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { beforeEach } from "vitest";

// Global safety net so no test (or CLI subprocess it spawns) can ever write into
// the developer's real ~/.contexa/. The original bug: tests that spawn the
// CLI or call recordHistory without setting CONTEXA_HOME inherited the real
// environment and polluted `ctx gain` with thousands of fixture records.
//
// Before every test, if CONTEXA_HOME is unset (or still points at the real
// home), redirect it to a throwaway temp dir for this worker. Tests that set
// their own CONTEXA_HOME inside the test body run AFTER this hook, so they
// keep full control — this only catches omissions.
const realHome = path.resolve(homedir(), ".contexa");
let workerFallback: string | undefined;

// HTML reports (ctx gain / ctx inspect, now HTML-by-default) try to open a browser
// via `open`/`xdg-open`. Suppress that in the whole test suite so no test ever
// spawns a GUI process — the report file is still written, just never opened.
process.env.CTX_NO_OPEN = "1";

beforeEach(() => {
  const current = process.env.CONTEXA_HOME;
  if (!current || path.resolve(current) === realHome) {
    workerFallback ??= mkdtempSync(path.join(tmpdir(), "ctx-test-home-fallback-"));
    process.env.CONTEXA_HOME = workerFallback;
  }
  // Neutralize an ambient COPILOT_HOME: it relocates the Copilot CLI config ROOT
  // (discoverCopilotCli honors it), so a value set on the dev/CI machine would shift
  // source discovery off each test's sandboxed `home`. Tests that exercise COPILOT_HOME
  // set it in their own body (after this hook) and clean up.
  delete process.env.COPILOT_HOME;
});
