// `tk support` — one command to produce a shareable diagnostic (recent error +
// logs, auto-gathered and saved) and route it to the maintainer via the user's mail
// client (mailto:) or Microsoft Teams (msteams: scheme). NO SMTP/HTTP, no auto-send:
// the user always reviews and sends by hand. Routing is env-only (ADR 0011) — when
// neither TK_SUPPORT_EMAIL nor TK_SUPPORT_TEAMS is set, tk still gathers + saves the
// bundle and copies it to the clipboard, then prints a hint, sending nowhere.
//
// Lazily imported from src/cli.ts so the compression hot path never loads it (I5).

import { createInterface } from "node:readline/promises";

import { buildSupportReport, scrubHome, writeSupportBundle, type SupportReport } from "./report.js";
import {
  buildMailto,
  buildTeamsDeepLink,
  copyToClipboard,
  openExternal,
  resolveDestination,
  type SupportChannel,
} from "./send.js";

function out(line: string): void {
  process.stdout.write(line);
}
function err(line: string): void {
  process.stderr.write(line);
}

function usage(): string {
  return [
    "tk support [email|teams] [--email <addr>] [--teams <upn>] [--no-attach] [--redact] [-y]",
    "  Produce a shareable diagnostic (recent error + logs) and open your mail client",
    "  (mailto:) or Microsoft Teams (msteams: scheme) to send it. Nothing is sent",
    "  automatically — you review and send by hand. The full report is saved to",
    "  ~/.token-killer/reports/.",
    "",
    "  email | teams   Channel to reach support through (prompted if omitted in a TTY)",
    "  --email <addr>  Destination email (overrides TK_SUPPORT_EMAIL)",
    "  --teams <upn>   Destination Teams in-tenant UPN (overrides TK_SUPPORT_TEAMS)",
    "  --no-attach     Do NOT gather the error + logs bundle (send a bare message)",
    "  --redact        Lengths/labels only — no command text, output bytes, or config bodies",
    "  -y, --yes       Skip the interactive prompts (use the channel + attach defaults)",
    "",
    "  Routing is env-only (ADR 0011): with neither TK_SUPPORT_EMAIL nor TK_SUPPORT_TEAMS",
    "  set, tk saves the bundle, copies it to your clipboard, and prints a hint — it",
    "  sends nowhere.",
    "",
  ].join("\n");
}

type SupportArgs = {
  channel?: SupportChannel;
  noAttach: boolean;
  redact: boolean;
  email?: string;
  teams?: string;
  yes: boolean;
  help: boolean;
};

function parseArgs(argv: string[]): SupportArgs | { error: string } {
  const a: SupportArgs = { noAttach: false, redact: false, yes: false, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const t = argv[i];
    if (t === "email" || t === "teams") {
      a.channel = t;
    } else if (t === "--no-attach") {
      a.noAttach = true;
    } else if (t === "--redact") {
      a.redact = true;
    } else if (t === "-y" || t === "--yes") {
      a.yes = true;
    } else if (t === "--help" || t === "-h") {
      a.help = true;
    } else if (t === "--email") {
      const v = argv[i + 1];
      if (v === undefined) return { error: "--email requires a value" };
      a.email = v;
      i += 1;
    } else if (t === "--teams") {
      const v = argv[i + 1];
      if (v === undefined) return { error: "--teams requires a value" };
      a.teams = v;
      i += 1;
    } else {
      return { error: `unknown flag '${t}'` };
    }
  }
  // Convenience: a lone --email/--teams override expresses the channel too, so
  // `tk support --email x@y.z` works without repeating the positional. Ambiguous
  // only if BOTH are given with no positional, in which case the user must pick.
  if (!a.channel) {
    if (a.email !== undefined && a.teams === undefined) a.channel = "email";
    else if (a.teams !== undefined && a.email === undefined) a.channel = "teams";
  }
  return a;
}

async function ask(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return await rl.question(question);
  } finally {
    rl.close();
  }
}

// Always shown before any channel opens, but ATTACH-AWARE: with --no-attach nothing
// is gathered, so claiming "commands + output + logs + config" would misrepresent
// what leaves the machine. The manual send is the explicit per-run opt-in the
// raw-evidence contract requires.
function disclose(attach: boolean, redact: boolean): void {
  if (!attach) {
    out("This opens a BARE support draft — no commands, output, logs, or host config\n");
    out("are gathered or sent. Type your problem into the draft and send it by hand.\n\n");
    return;
  }
  out("This prepares a diagnostic report for support. It contains:\n");
  if (redact) {
    out("  • lengths and labels only — NO command text, output bytes, or config bodies\n");
  } else {
    out("  • the shell commands you ran through tk + their output\n");
    out("  • tk's own logs and recent errors\n");
    out("  • your host config and environment (home dir scrubbed)\n");
    out("  • NO chat prompts\n");
  }
  out("You review it and send it by hand — tk sends nothing automatically.\n\n");
}

function emailBody(report: SupportReport | undefined, bundlePath: string | undefined): string {
  const lines = ["Describe the problem here.", ""];
  if (report) lines.push("--- diagnostic summary ---", report.summary, "");
  // Scrub the saved path: it travels inside the mailto URI (leaves the machine), and
  // an absolute path under the home dir would otherwise leak it. ~ is resolvable by
  // the user to attach the file.
  if (bundlePath)
    lines.push(
      `Full report saved at: ${scrubHome(bundlePath)}`,
      "(attach this file before sending)",
    );
  return lines.join("\n");
}

export async function runSupport(argv: string[]): Promise<number> {
  const parsed = parseArgs(argv);
  if ("error" in parsed) {
    err(`tk support: ${parsed.error}\n`);
    return 1;
  }
  if (parsed.help) {
    out(usage());
    return 0;
  }

  const interactive = Boolean(process.stdin.isTTY) && Boolean(process.stdout.isTTY);
  let channel = parsed.channel;
  let attach = !parsed.noAttach;

  // Interactive flow (only when both ends are a TTY and the user didn't pass -y).
  if (interactive && !parsed.yes) {
    if (!channel) {
      const answer = (await ask("Reach support via: [1] Email  [2] Microsoft Teams: ")).trim();
      channel = answer === "2" ? "teams" : answer === "1" ? "email" : undefined;
      if (!channel) {
        err("tk support: no channel selected\n");
        return 1;
      }
    }
    if (!parsed.noAttach) {
      const answer = (await ask("Attach the most recent error and recent logs? [Y/n]: ")).trim();
      attach = !/^n/i.test(answer);
    }
  }

  // Non-interactive (or interactive -y) with no channel ⇒ usage + exit 1.
  if (!channel) {
    err(usage());
    return 1;
  }

  disclose(attach, parsed.redact);

  // Save FIRST (durable): the file is the carrier the user attaches/pastes by hand.
  let report: SupportReport | undefined;
  let bundlePath: string | undefined;
  if (attach) {
    report = await buildSupportReport({ cwd: process.cwd(), redact: parsed.redact });
    bundlePath = writeSupportBundle(report.markdown, Date.now());
    out(`Saved diagnostic bundle: ${bundlePath}\n`);
  }

  const override = channel === "email" ? parsed.email : parsed.teams;
  const destination = resolveDestination(channel, override);

  // ADR 0011: no env (and no override) ⇒ copy to clipboard, print the path + the
  // "set TK_SUPPORT_*" hint, and send nothing.
  if (destination === undefined) {
    if (report) {
      const copied = copyToClipboard(report.markdown);
      out(copied ? "Report copied to clipboard.\n" : "Report saved (clipboard unavailable).\n");
    }
    out(
      "No support destination configured. Set TK_SUPPORT_EMAIL or TK_SUPPORT_TEAMS " +
        "(an in-tenant Teams UPN) to enable one-tap send. Nothing was sent.\n",
    );
    return 0;
  }

  if (channel === "email") {
    const uri = buildMailto(destination, "tk support report", emailBody(report, bundlePath));
    const opened = await openExternal(uri);
    if (!opened) out(`Open this link to email support:\n${uri}\n`);
    if (bundlePath) out(`Attach this file to the email: ${bundlePath}\n`);
  } else {
    // Teams: the clipboard carries the FULL report; the deep link opens the chat
    // with a short pointer (the scheme's `message=` is a pointer, not the payload).
    const copied = report ? copyToClipboard(report.markdown) : false;
    const pointer = report
      ? `tk support report — ${report.summary.split("\n")[0]}`
      : "tk support report";
    const uri = buildTeamsDeepLink(destination, pointer);
    const opened = await openExternal(uri);
    if (!opened) out(`Open this link to message support on Teams:\n${uri}\n`);
    if (bundlePath) {
      out(
        `Report saved: ${bundlePath}${copied ? " — and copied to your clipboard; paste it into the chat." : " — paste it into the chat from this file."}\n`,
      );
    }
  }
  return 0;
}
