// Progress reporter for `tk inspect`. The scan pipeline is fully synchronous and
// blocks the event loop, so a timer-driven spinner would never tick — progress is
// emitted as inline "X of Y" milestones written between work items (clig.dev:
// status → STDERR, keep an animated component to reassure on long operations).
//
// Hard rules:
//  • STDERR only — STDOUT carries the report / JSON and must stay pipe-clean.
//  • TTY-gated — a no-op when STDERR is not a TTY (pipes / CI / tests), so no
//    machine consumer ever sees progress bytes. `TK_NO_PROGRESS` forces it off.
//  • Self-clearing — the transient counter line is erased before each phase line
//    and on done(), so the final report is never interleaved with a stale "12/87".

export type ProgressReporter = {
  // A persistent milestone line ("Scanning 187 transcripts…"). Clears any live
  // counter first, then prints the label + newline.
  phase(label: string): void;
  // The transient "X of Y" counter, overwritten in place via carriage return.
  step(current: number, total: number, detail?: string): void;
  // Erase the live counter line (call before any other stdout/stderr write).
  done(): void;
};

const NOOP: ProgressReporter = {
  phase(): void {},
  step(): void {},
  done(): void {},
};

// Progress is shown only on an interactive STDERR and never when opted out. Pure
// + injectable so the gate is unit-testable without a real TTY.
//
// `TK_PROGRESS=1` forces progress ON even when STDERR is not a TTY. The scan blocks
// the event loop and writes its report only at the very end, so in a non-interactive
// run (a dogfood harness that pipes stdio, CI) a slow scan emits ZERO bytes until it
// finishes — making "slow" and "hung" byte-identical, and an opaque kill-at-timeout
// impossible to diagnose. Forcing progress lets such a runner capture WHERE the scan
// reached ("450/870 transcripts"). `TK_NO_PROGRESS` still wins (a machine consumer
// that needs a pristine STDERR can force it off).
export function progressEnabled(
  env: NodeJS.ProcessEnv = process.env,
  stream: { isTTY?: boolean } = process.stderr,
): boolean {
  if (env.TK_NO_PROGRESS) return false;
  if (env.TK_PROGRESS && env.TK_PROGRESS !== "0") return true;
  return Boolean(stream.isTTY);
}

export function makeProgressReporter(opts?: {
  enabled?: boolean;
  write?: (s: string) => void;
}): ProgressReporter {
  const enabled = opts?.enabled ?? progressEnabled();
  if (!enabled) return NOOP;
  const write = opts?.write ?? ((s: string): void => void process.stderr.write(s));
  let lineLen = 0; // width of the live counter line, tracked so we can erase it

  function clear(): void {
    if (lineLen > 0) {
      write(`\r${" ".repeat(lineLen)}\r`);
      lineLen = 0;
    }
  }

  return {
    phase(label: string): void {
      clear();
      write(`${label}\n`);
    },
    step(current: number, total: number, detail?: string): void {
      const head = total > 0 ? `  ${current}/${total}` : `  ${current}`;
      const text = detail ? `${head} ${detail}` : head;
      // Pad with spaces to erase any leftover from a previously longer line.
      const pad = Math.max(0, lineLen - text.length);
      write(`\r${text}${" ".repeat(pad)}`);
      lineLen = text.length;
    },
    done(): void {
      clear();
    },
  };
}
