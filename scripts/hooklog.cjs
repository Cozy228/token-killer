// Diagnostic logger for the live Copilot CLI preToolUse hook (issue #20). CommonJS (.cjs)
// because the project is "type":"module" — a bare .js here loads as ESM and `require`
// throws. Invoked by a no-space .cmd shim a hook field points at. Captures the FULL
// invocation context (including the PARENT process command-line chain — i.e. exactly how
// Copilot launched the hook) + runs the REAL tk hook, then passes its stdout through and
// ALWAYS exits 0 so nothing is denied while diagnosing.
const fs = require("fs");
const { spawnSync } = require("child_process");

const field = process.argv[2] || "?";
const LOG = "C:\\Users\\cozy2\\tk-hooklog.txt";
const CLI = "C:\\Users\\cozy2\\workspace\\token-killer\\dist\\cli.js";

let stdin = Buffer.alloc(0);
try {
  stdin = fs.readFileSync(0);
} catch (e) {
  stdin = Buffer.from(`<<stdin read error: ${e && e.message}>>`);
}

// Walk the parent-process chain (this node → shim cmd.exe → whatever Copilot spawned →
// Copilot) capturing each CommandLine, so we see the EXACT wrapper Copilot uses for the
// hook field (e.g. `pwsh -Command "<field>"` vs `-File` vs `cmd /c`).
let parents = "";
try {
  const ps =
    "$id=" +
    process.pid +
    "; 1..5 | %{ $p=Get-CimInstance Win32_Process -Filter \"ProcessId=$id\"; if(-not $p){break}; '" +
    "[' + $p.ProcessId + '] ' + $p.Name + ' :: ' + $p.CommandLine; $id=$p.ParentProcessId }";
  const r = spawnSync("powershell", ["-NoProfile", "-Command", ps], { encoding: "utf8" });
  parents = (r.stdout || "") + (r.stderr ? `\n[stderr] ${r.stderr}` : "");
} catch (e) {
  parents = `<<parent-chain error: ${e && e.message}>>`;
}

let real = { status: null, signal: null, stdout: Buffer.alloc(0), stderr: Buffer.alloc(0), error: null };
try {
  real = spawnSync(process.execPath, [CLI, "hook", "copilot"], { input: stdin, timeout: 10000 });
} catch (e) {
  real.error = e && e.message;
}

const lines = [
  `=== field=${field} ts=${new Date().toISOString()} ===`,
  `node=${process.execPath}`,
  `argv=${JSON.stringify(process.argv)}`,
  `cwd=${process.cwd()}`,
  `--- parent process chain (how Copilot launched the hook) ---`,
  parents.trim(),
  `--- stdin ---`,
  `stdin.len=${stdin.length}`,
  `stdin=${stdin.toString("utf8")}`,
  `--- real tk hook result ---`,
  `real.status=${real.status}`,
  `real.signal=${real.signal}`,
  `real.error=${real.error == null ? "null" : real.error}`,
  `real.stdout=${(real.stdout || Buffer.alloc(0)).toString("utf8")}`,
  `real.stderr=${(real.stderr || Buffer.alloc(0)).toString("utf8")}`,
  "",
];
try {
  fs.appendFileSync(LOG, lines.join("\n"));
} catch {
  /* best-effort */
}

process.stdout.write(real.stdout || Buffer.alloc(0));
process.exit(0);
