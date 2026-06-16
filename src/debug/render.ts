// `tk debug` markdown renderer (docs/debug-command-goal.md §render). PURE: takes a
// DebugBundle and returns one self-contained markdown document. Section order is by
// diagnostic value (delivery health before raw usage). The volume gate lives here —
// the full command list is one summary line per row (never truncated), anomaly rows
// always carry their full payload, and non-anomaly payloads are suppressed with an
// explicit "N suppressed, add --full" notice (never a silent truncation).
//
// Redaction: host-config bodies have the user's home dir rewritten to `~` (the
// confirmed default). Under --redact NOTHING but lengths/labels is emitted — no
// command text, no payload bytes, no config bodies.

import { homedir } from "node:os";

import type { HistoryRecord } from "../core/history.js";
import {
  LARGE_RAW_TOKENS,
  type AnomalyRow,
  type DebugBundle,
  type ExecProbe,
  type FileCapture,
} from "./collect.js";

const REDACTED = "[redacted]";

function scrubHome(text: string): string {
  const home = homedir();
  if (!home) return text;
  // Replace the longest form first; both POSIX and Windows separators appear in
  // hook command strings ("<node>" "<cli>").
  return text.split(home).join("~");
}

function fence(content: string, lang = ""): string {
  // Guard against a payload that itself contains a closing fence by using a longer
  // delimiter when needed.
  const ticks = content.includes("```") ? "````" : "```";
  return `${ticks}${lang}\n${content.replace(/\n$/, "")}\n${ticks}`;
}

// Render arbitrary text as an inline-code span that survives backticks, pipes and
// newlines — used for command cells (tables) and anomaly headings. A real command
// may carry backticks (substitution), `<tags>` (greps), `|` (pipes) or newlines;
// raw interpolation would break the table row, escape the code span, or inject HTML
// into a heading. CommonMark: pick a backtick run longer than any inside the
// content and pad when the content touches a backtick. In a table cell `|` must
// also be backslash-escaped (GFM splits cells before parsing inline code).
function codeSpan(text: string, inTable = false): string {
  let s = text.replace(/\r?\n+/g, " ");
  if (inTable) s = s.replace(/\|/g, "\\|");
  let run = 0;
  let max = 0;
  for (const ch of s) {
    run = ch === "`" ? run + 1 : 0;
    if (run > max) max = run;
  }
  const ticks = "`".repeat(max + 1);
  const pad = s.startsWith("`") || s.endsWith("`") ? " " : "";
  return `${ticks}${pad}${s}${pad}${ticks}`;
}

// Cap an over-long aggregate KEY (e.g. a 4k-char `wc <60 files>` command) for the
// usage tables — the full text already appears verbatim in §3 and (if anomalous)
// §4, so this display key is not load-bearing. Explicit `+N chars` marker, never a
// silent cut.
function capKey(text: string, max = 160): string {
  return text.length <= max ? text : `${text.slice(0, max)}… (+${text.length - max} chars)`;
}

function yesNo(v: boolean): string {
  return v ? "yes" : "no";
}

function bytesLabel(c: FileCapture): string {
  return c.bytes === undefined ? "" : ` (${c.bytes} bytes)`;
}

// The "does the wired binary actually run" verdict for §2. Not-run ⇒ neutral; ok ⇒
// the version line; failed ⇒ the loud BROKEN reason (a dangling/corrupt install).
function renderExec(e: ExecProbe): string {
  if (!e.ran) return "not probed";
  if (e.ok) return `YES ✅ (\`${e.detail}\`)`;
  return `**NO — BROKEN 🔴** (\`${e.detail.replace(/\|/g, "\\|")}\`)`;
}

// ── Section 1: version & environment ────────────────────────────────────────────
function renderEnv(b: DebugBundle): string {
  const e = b.env;
  const rows: Array<[string, string | undefined]> = [
    ["tk version", e.version],
    ["platform / arch", `${e.platform} / ${e.arch}`],
    ["node", e.nodeVersion],
    ["shell", e.shell],
    ["TERM_PROGRAM", e.termProgram],
    ["detected host", e.detectedHost],
    ["locale", e.locale],
    ["LANG/LC_*", e.lang],
    ["windows codepage", e.windowsCodepage],
    ["TOKEN_KILLER_HOME", e.tokenKillerHome],
    ["cli path", e.cliPath],
    ["node execPath", e.execPath],
  ];
  const body = rows
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => `| ${k} | ${scrubHome(String(v))} |`)
    .join("\n");
  return [
    "## 1. Version & environment",
    "",
    "| field | value |",
    "| --- | --- |",
    body,
    "",
    "> `detected host` is inferred from env (e.g. `CLAUDECODE`/`TERM_PROGRAM`). Running",
    "> `tk debug` from inside an agent shell can pin it to that agent regardless of the",
    '> host you meant to test — read it as "the host tk would target here", not ground truth.',
  ].join("\n");
}

// ── Section 2: delivery health self-check ───────────────────────────────────────
function renderDelivery(b: DebugBundle): string {
  const d = b.delivery;
  const lines: string[] = ["## 2. Delivery health self-check", ""];

  if (!d.anyWired) {
    lines.push(
      "> ⚠️ **tk is NOT wired into any host.** No claude/copilot hook, no shim on PATH, no instruction injection were found. tk only runs when invoked explicitly as `tk <cmd>`. This is *not wired*, distinct from *installed but broken* below.",
      "",
    );
  } else if (d.brokenHook) {
    lines.push(
      `> 🔴 **tk is wired but INSTALLED-BUT-BROKEN.** The claude-code hook points at tk, but the binary it names failed to run (\`${d.claudeHook.exec.detail}\`). The hook crashes on every tool call (non-blocking), so NOTHING is compressed even though the wiring looks correct. Fix the binary path (re-run \`tk install\`) — this is *not* a healthy install.`,
      "",
    );
  } else {
    lines.push("> tk delivery is wired into at least one tier (details below).", "");
  }

  lines.push(
    "### Hook tiers",
    "",
    `- **claude-code hook**: ${d.claudeHook.present ? (d.claudeHook.pointsAtTk ? "present, points at tk ✅" : "present, but NOT tk ⚠️") : "absent"} — \`${scrubHome(d.claudeHook.path)}\``,
    `  - expected command: \`${scrubHome(d.claudeHook.command)}\``,
    `  - binary runs: ${renderExec(d.claudeHook.exec)}`,
    `- **copilot-cli hook**: ${d.copilotHook.present ? (d.copilotHook.managed ? "present, managed by tk ✅" : "present, NOT managed by tk ⚠️") : "absent"} — \`${scrubHome(d.copilotHook.path)}\``,
    `- **instruction injection**: ${d.injection.present ? "present ✅" : "absent"} — \`${scrubHome(d.injection.path)}\``,
    "",
    "### Shim tier",
    "",
    `- dir: \`${scrubHome(d.shim.dir)}\`${d.shim.dirExists ? "" : " (not installed)"}`,
    `- manifest: ${d.shim.manifest ? `v${d.shim.manifest.version} schema ${d.shim.manifest.schema}, ${d.shim.manifest.programs} programs` : "absent"}`,
    `- on PATH: ${d.shim.onPath ? `yes (position ${d.shim.pathPosition}${d.shim.firstOnPath ? ", first" : ", NOT first ⚠️"})` : "no"}`,
    `- interception probe: ${d.shim.probe.pass ? "PASS ✅" : "FAIL ⚠️"}${d.shim.probe.resolved ? ` → \`${scrubHome(d.shim.probe.resolved)}\`` : ""}`,
    "",
    "### Rewrite engine probe (`tk hook check`)",
    "",
    "| command | decision | detail |",
    "| --- | --- | --- |",
  );
  for (const p of d.rewriteProbes) {
    const detail = b.redacted ? "" : (p.detail ?? "").replace(/\|/g, "\\|");
    lines.push(`| \`${p.command}\` | ${p.decision} | ${detail} |`);
  }

  lines.push("", "### Recent delivery failures (`recordHookFailure`)", "");
  if (d.recentFailures.length === 0) {
    lines.push("none recorded ✅");
  } else {
    lines.push("| timestamp | surface | handler | exit |", "| --- | --- | --- | --- |");
    for (const r of d.recentFailures) {
      lines.push(`| ${r.timestamp} | ${r.source_adapter ?? "?"} | ${r.handler} | ${r.exit_code} |`);
    }
  }
  return lines.join("\n");
}

// ── Section 3: full command list (every row, one line, never truncated) ─────────
function commandCell(r: HistoryRecord, redacted: boolean): string {
  if (redacted) return `${REDACTED} (${r.command.length} chars)`;
  if (r.command === "") return "_(failure row — command not stored)_";
  return codeSpan(r.command, true);
}

function renderCommands(b: DebugBundle): string {
  const lines: string[] = [
    "## 3. Full command list",
    "",
    `${b.commands.length} commands recorded across all project fingerprints (de-fragmented).`,
    "",
    "| time | command | handler | raw→out tok | saved% | status | exit |",
    "| --- | --- | --- | --- | --- | --- | --- |",
  ];
  for (const r of b.commands) {
    const status = r.quality_status ?? "passed";
    lines.push(
      `| ${r.timestamp} | ${commandCell(r, b.redacted)} | ${r.handler} | ${r.raw_tokens}→${r.output_tokens} | ${r.savings_pct}% | ${status} | ${r.exit_code} |`,
    );
  }
  return lines.join("\n");
}

// ── Section 4: anomaly rows + full payload ──────────────────────────────────────
function anomalyTags(r: HistoryRecord): string {
  const tags: string[] = [];
  if (r.handler === "fallback") tags.push("filter-fallback");
  if (r.quality_status && r.quality_status !== "passed") tags.push(r.quality_status);
  if (r.exit_code !== 0) tags.push(`exit ${r.exit_code}`);
  // saved<0 means the output inflated; skip if the gate already labelled it
  // `inflated` so the tag isn't duplicated.
  if (r.saved_tokens < 0 && r.quality_status !== "inflated") tags.push("inflated");
  if (r.handler === "raw" && r.raw_tokens >= LARGE_RAW_TOKENS) tags.push("large-raw-passthrough");
  return [...new Set(tags)].join(", ");
}

function renderSnapshot(snap: FileCapture, redacted: boolean): string {
  if (!snap.available) {
    return `_snapshot unavailable_ (raw_output_path ${snap.path ? `\`${snap.path}\` unreadable` : "absent"}) — payload NOT reconstructable.`;
  }
  if (redacted) return `_snapshot present${bytesLabel(snap)}, body redacted._`;
  return fence(snap.content ?? "");
}

function renderAnomaly(a: AnomalyRow, redacted: boolean): string {
  const r = a.record;
  const title = redacted
    ? `${REDACTED} (${r.command.length} chars)`
    : r.command
      ? codeSpan(r.command)
      : "(failure row)";
  return [
    `### ${title}`,
    "",
    `- flagged: **${anomalyTags(r)}**`,
    `- handler: \`${r.handler}\` · source: \`${r.source_adapter ?? "?"}\` · ${r.timestamp}`,
    `- tokens: raw ${r.raw_tokens} → out ${r.output_tokens} (saved ${r.saved_tokens}, ${r.savings_pct}%)`,
    "",
    "**Raw payload (stdin/stdout snapshot):**",
    "",
    renderSnapshot(a.snapshot, redacted),
  ].join("\n");
}

function renderAnomalies(b: DebugBundle): string {
  const lines: string[] = ["## 4. Anomaly rows + full payload", ""];
  if (b.anomalies.length === 0) {
    lines.push("No anomalous rows (every row passed the gate, exit 0, no inflation). ✅");
  } else {
    lines.push(
      `${b.anomalies.length} anomalous rows. Each carries its full payload — never truncated.`,
      "",
    );
    lines.push(...b.anomalies.map((a) => renderAnomaly(a, b.redacted)));
  }

  // Volume gate notice for the suppressed non-anomaly payloads.
  lines.push("", "---", "");
  if (b.omittedPayloads.length === 0) {
    lines.push("_No additional (non-anomaly) payloads on disk._");
  } else if (b.full) {
    lines.push(
      `### Full payloads (--full): ${b.omittedPayloads.length} non-anomaly rows`,
      "",
      ...b.omittedPayloads.map((a) => renderAnomaly(a, b.redacted)),
    );
  } else {
    lines.push(
      `**${b.omittedPayloads.length} non-anomaly payloads suppressed** to keep the bundle small. Re-run with \`--full\` to include them.`,
    );
  }
  return lines.join("\n");
}

// ── Section 5: usage aggregation ────────────────────────────────────────────────
function rollupTable(
  title: string,
  rows: Array<{ key: string; count: number; raw: number; saved: number; pct: number }>,
  keyHeader: string,
): string {
  const lines = [
    `**${title}**`,
    "",
    `| ${keyHeader} | count | raw tok | saved tok | saved% |`,
    "| --- | --- | --- | --- | --- |",
  ];
  for (const r of rows) {
    const key = r.key === "" ? "_(empty)_" : codeSpan(capKey(r.key), true);
    lines.push(`| ${key} | ${r.count} | ${r.raw} | ${r.saved} | ${r.pct}% |`);
  }
  return lines.join("\n");
}

function renderAggregates(b: DebugBundle): string {
  const a = b.aggregates;
  const s = a.summary;
  const quality = Object.entries(s.quality_status_counts)
    .map(([k, v]) => `${k}: ${v}`)
    .join(", ");
  const mix = Object.entries(a.sourceAdapterMix)
    .map(([k, v]) => `${k}: ${v}`)
    .join(", ");
  const g = b.governance;

  const lines = [
    "## 5. Usage aggregation",
    "",
    "_Scope: live aggregation over ALL project fingerprints (de-fragmented). To",
    "reconcile with the CLI, compare `tk gain --user` (the cross-project view), not the",
    "default project-scoped `tk gain`; labels here come from live `summarize`, so they",
    "may differ from a stale `gain` rollup cache._",
    "",
    `- commands: **${s.commands}** · raw **${s.raw_tokens}** → out **${s.output_tokens}** tok · saved **${s.saved_tokens}** (${s.savings_pct}%)`,
    `- quality histogram: ${quality || "none"}`,
    `- source_adapter mix: ${mix || "none"}`,
    `- governance (③ opportunity, heuristic): denied reads ${g.denied_large_reads}, broad searches ${g.suggested_broad_searches}, denied prompts ${g.denied_large_prompts}, suggested prompts ${g.suggested_large_prompts}; avoided ≈ ${g.avoided_tokens_estimate} tok`,
    "",
    rollupTable("By host (source_adapter)", a.byHost, "host"),
    "",
    rollupTable(
      "By handler",
      s.by_handler.map((h) => ({
        key: h.handler,
        count: h.count,
        raw: h.raw,
        saved: h.saved,
        pct: h.pct,
      })),
      "handler",
    ),
  ];
  if (!b.redacted) {
    lines.push("", rollupTable("By command", a.byCommand, "command"));
  }
  return lines.join("\n");
}

// ── Section 6: debug.log + host configs ─────────────────────────────────────────
function renderArtifact(label: string, cap: FileCapture, redacted: boolean): string {
  const head = `### ${label}\n\n\`${scrubHome(cap.path)}\``;
  if (!cap.available) return `${head} — _absent_`;
  if (redacted) return `${head} — _present${bytesLabel(cap)}, body redacted._`;
  return `${head}${bytesLabel(cap)}\n\n${fence(scrubHome(cap.content ?? ""))}`;
}

function renderArtifacts(b: DebugBundle): string {
  const lines: string[] = ["## 6. debug.log & host configs", ""];
  lines.push(renderArtifact("debug.log", b.debugLog, b.redacted), "");
  for (const c of b.hostConfigs) {
    lines.push(renderArtifact(c.label, c, b.redacted), "");
  }
  return lines.join("\n").replace(/\n+$/, "");
}

export function renderDebug(b: DebugBundle): string {
  const header = [
    "# tk debug bundle",
    "",
    `Generated ${b.generatedAt} · tk ${b.env.version}${b.redacted ? " · **REDACTED** (length/label only)" : ""}${b.full ? " · full payloads" : ""}`,
    "",
    "> Self-contained diagnostic of tk on this machine. Acceptance: a reviewer with",
    "> ONLY this bundle + the source tree at this version should be able to locate",
    "> most problems. No network was touched producing it.",
    "",
  ].join("\n");

  const doc = [
    header,
    renderEnv(b),
    "",
    renderDelivery(b),
    "",
    renderCommands(b),
    "",
    renderAnomalies(b),
    "",
    renderAggregates(b),
    "",
    renderArtifacts(b),
    "",
  ].join("\n");

  // Final privacy net. Per-field scrubHome covers §1/§2/§6 (env, delivery, configs),
  // but the home dir also surfaces in command text and payload snapshots in §3–§5,
  // which those calls never reach. The bundle is meant to be SHARED with a maintainer
  // (see the header acceptance note), so no section may leak the literal home path —
  // `~\…` stays fully diagnostic. Idempotent: re-scrubbing the already-scrubbed
  // sections is a no-op.
  return scrubHome(doc);
}
