// `ctx debug` entry (docs/debug-command-goal.md). Runs once on a tester's machine
// and writes ONE self-contained markdown bundle reviewing ctx-on-this-machine, so a
// maintainer with only the bundle + the source can locate most problems. This is
// distinct from `ctx inspect` (which audits the developer's OWN agent history/context,
// not ctx itself), hence its own command rather than `inspect --debug`.
//
// Flags:
//   --out <path>   destination (default: reports/debug-<ts>.md, relative to cwd)
//   --full         attach EVERY row's payload, not just anomalies'
//   --redact       length/label only — no command text, payload bytes, or config bodies
//
// Side effects: writes only the --out file. No network, no telemetry. Exit codes
// mirror inspect: 0 ok · 1 user/IO error · 3 internal error.

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { collectDebugBundle } from "./collect.js";
import { renderDebug } from "./render.js";

type DebugArgs = {
  out?: string;
  full: boolean;
  redact: boolean;
  error?: string;
};

export function parseDebugArgs(argv: string[]): DebugArgs {
  const args: DebugArgs = { full: false, redact: false };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--out") {
      const value = argv[i + 1];
      i += 1;
      if (value === undefined) args.error = "--out requires a path";
      else args.out = value;
    } else if (token === "--full") {
      args.full = true;
    } else if (token === "--redact") {
      args.redact = true;
    } else {
      args.error = `unknown flag '${token}'`;
    }
  }
  return args;
}

// Default output path: reports/debug-<UTC-timestamp>.md under cwd. Colons are
// illegal in Windows filenames, so the ISO stamp is flattened to digits.
function defaultOut(cwd: string, now: Date): string {
  const stamp = now.toISOString().replace(/[-:T]/g, "").slice(0, 14); // YYYYMMDDHHMMSS
  return path.join(cwd, "reports", `debug-${stamp}.md`);
}

export async function runDebug(argv: string[], cwd: string = process.cwd()): Promise<number> {
  const opts = parseDebugArgs(argv);
  if (opts.error) {
    process.stderr.write(`ctx debug: ${opts.error}\n`);
    return 1;
  }

  try {
    const bundle = await collectDebugBundle({ cwd, full: opts.full, redact: opts.redact });
    const markdown = renderDebug(bundle);
    const outPath = path.resolve(cwd, opts.out ?? defaultOut(cwd, new Date()));
    await mkdir(path.dirname(outPath), { recursive: true });
    await writeFile(outPath, markdown, "utf8");
    const delivery = bundle.delivery.brokenHook
      ? "wired but BROKEN"
      : bundle.delivery.anyWired
        ? "wired"
        : "NOT wired";
    process.stdout.write(
      `Wrote ctx debug bundle: ${outPath}\n` +
        `  ${bundle.commands.length} commands · ${bundle.anomalies.length} anomalies · ` +
        `delivery ${delivery}${opts.redact ? " · redacted" : ""}\n`,
    );
    return 0;
  } catch (error) {
    process.stderr.write(
      `ctx debug: internal error: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    return 3;
  }
}
