// Single-file HTML report renderer (no external deps, no network, renders from a
// file:// URL). Serves both `tk gain report --html` and `tk inspect --html`: data
// is injected as a JSON blob and a small vanilla renderer draws it. The audience
// is the END USER, not a log reader: every field has a plain-language label and a
// one-line explanation. The honesty model still holds — measured savings lead;
// the dollar figure and ③ are labelled estimates.
//
// Visual language ported from the improve-codebase-architecture review: serif
// display headings, an uppercase eyebrow label, white panel cards on a warm
// stone canvas, a deep slate-gradient hero, and an indigo/emerald/amber/rose
// palette. All inline — no Tailwind, no CDN, no fonts fetched — so the file stays
// openable offline straight from file://.

export type ReportKind = "gain" | "inspect";

export type ReportDoc = {
  kind: ReportKind;
  title: string;
  subtitle: string;
  generatedAt: string; // ISO
  data: unknown; // gain → Ledgers (+ estimated_savings_usd, price_per_mtok); inspect → InspectReportData
};

// Escape a JSON string for safe embedding inside <script> (prevent </script>
// breakout and U+2028/2029 source-break injection).
function embed(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

const STYLE = `
:root {
  --bg: #fafaf9;          /* stone-50 canvas */
  --surface: #ffffff;
  --ink: #0f172a;         /* slate-900 */
  --slate700: #334155;
  --slate600: #475569;
  --slate500: #64748b;
  --faint: #94a3b8;       /* slate-400 */
  --slate300: #cbd5e1;
  --slate100: #f1f5f9;
  --border: #e2e8f0;      /* slate-200 */
  --indigo: #4f46e5;
  --indigo-ink: #4338ca;
  --indigo-soft: #eef2ff;
  --emerald: #059669;
  --emerald-ink: #047857;
  --emerald-soft: #ecfdf5;
  --emerald-100: #d1fae5;
  --emerald-300: #6ee7b7;
  --amber-ink: #b45309;
  --amber-deep: #78350f;
  --amber-line: #fde68a;
  --amber-soft: #fffbeb;
  --rose: #e11d48;
  /* Severity ramp reused by the inspect view (kept as hi/mid/lo for the renderer). */
  --hi: #e11d48;
  --mid: #b45309;
  --lo: #4f46e5;
  --deep: linear-gradient(135deg, #0f172a, #1e293b);
  --mono: ui-monospace, "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace;
  --sans: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  --serif: ui-serif, Georgia, "Times New Roman", serif;
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--ink); font-family: var(--sans); font-size: 15px; line-height: 1.62; -webkit-font-smoothing: antialiased; }
.wrap { max-width: 880px; margin: 0 auto; padding: 56px 24px 100px; }
.num { font-family: var(--mono); font-variant-numeric: tabular-nums; }
.lbl { font-size: 0.62rem; letter-spacing: 0.12em; text-transform: uppercase; font-weight: 600; }

/* Page header */
.pagehead { margin-bottom: 40px; }
.pagehead > .lbl { color: var(--indigo); }
.pagehead h1 { font-family: var(--serif); font-size: 2.4rem; font-weight: 600; letter-spacing: -0.02em; margin: 0.4rem 0 0; }
.pagehead h1 .tk { color: var(--slate300); font-weight: 500; }
.pagehead .sub { color: var(--slate500); font-size: 0.95rem; margin-top: 0.55rem; }
.meta { color: var(--faint); font-size: 0.8rem; margin-top: 16px; padding-top: 14px; border-top: 1px solid var(--border); }
.meta b { color: var(--slate600); font-weight: 500; }

/* Deep slate emphasis surface */
.deep { background: var(--deep); color: #fff; }

/* Gain hero */
.hero { border-radius: 16px; padding: 38px 36px 30px; }
.hero.deep .kick { color: var(--emerald-300); }
.hero .big { font-family: var(--mono); font-size: clamp(2.6rem, 7vw, 3.9rem); font-weight: 700; line-height: 1.05; letter-spacing: -0.03em; margin: 12px 0 0; color: #fff; }
.hero .big small { font-family: var(--sans); font-size: 1rem; font-weight: 500; color: var(--slate300); margin-left: 12px; letter-spacing: 0; }
.hero .lead { color: #e2e8f0; font-size: 1.02rem; margin-top: 14px; max-width: 60ch; }
.hero .lead b { color: #fff; font-weight: 600; }
.hero .ba { display: flex; flex-wrap: wrap; gap: 10px 28px; margin-top: 24px; padding-top: 20px; border-top: 1px solid rgba(255,255,255,0.12); color: #94a3b8; font-size: 0.88rem; }
.hero .ba .n { color: #fff; font-family: var(--mono); font-weight: 600; }
.hero.light { background: var(--surface); border: 1px solid var(--border); color: var(--ink); box-shadow: 0 1px 2px rgba(15,23,42,0.04); }
.hero.light .lead { color: var(--ink); }

/* Sections */
.section { margin-top: 48px; }
.section > h2 { font-family: var(--serif); font-size: 1.4rem; font-weight: 600; margin: 0; letter-spacing: -0.01em; }
.section > .exp { color: var(--slate500); font-size: 0.9rem; margin: 6px 0 16px; max-width: 64ch; }
.panel { background: var(--surface); border: 1px solid var(--border); border-radius: 14px; box-shadow: 0 1px 2px rgba(15,23,42,0.04); overflow: hidden; }

table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
th { text-align: left; color: var(--faint); font-weight: 600; font-size: 0.6rem; letter-spacing: 0.1em; text-transform: uppercase; padding: 15px 16px 10px; border-bottom: 1px solid var(--border); }
td { padding: 12px 16px; border-bottom: 1px solid var(--slate100); vertical-align: middle; }
td.r, th.r { text-align: right; }
tr:last-child td { border-bottom: none; }
.hbar { position: relative; height: 6px; border-radius: 3px; background: var(--slate100); overflow: hidden; min-width: 90px; }
.hbar > i { position: absolute; inset: 0 auto 0 0; background: var(--emerald); border-radius: 3px; }

/* Supporting cards */
.cards { display: grid; gap: 18px; grid-template-columns: 1fr 1fr; margin-top: 18px; }
.card { background: var(--surface); border: 1px solid var(--border); border-radius: 14px; box-shadow: 0 1px 2px rgba(15,23,42,0.04); padding: 24px; }
.card.est { background: var(--amber-soft); border-color: var(--amber-line); }
.card h3 { font-family: var(--serif); font-size: 1.15rem; font-weight: 600; margin: 0; }
.card.est h3 { color: var(--amber-deep); }
.card .exp { color: var(--slate500); font-size: 0.85rem; margin: 6px 0 16px; }
.card.est .exp { color: var(--amber-ink); }
.kv { display: flex; justify-content: space-between; gap: 12px; padding: 10px 0; border-bottom: 1px solid var(--slate100); font-size: 0.9rem; }
.kv:last-of-type { border-bottom: none; }
.kv .k { color: var(--slate600); }
.kv .v { font-family: var(--mono); font-weight: 600; }
.kv .v.na { color: var(--faint); font-weight: 400; font-style: italic; }
.est-num { font-family: var(--mono); font-size: 1.85rem; font-weight: 700; color: var(--amber-ink); margin-top: 18px; }
.est-cap { color: var(--amber-ink); font-size: 0.8rem; margin-top: 4px; }
.naline { color: var(--faint); font-style: italic; font-size: 0.9rem; }
.delta { display: grid; grid-template-columns: 1fr auto; gap: 2px 12px; padding: 13px 0; border-bottom: 1px solid var(--slate100); }
.delta:last-child { border-bottom: none; }
.delta .nm { font-weight: 600; }
.delta .sv { font-family: var(--mono); font-weight: 600; color: var(--emerald-ink); text-align: right; }
.delta .ex { color: var(--faint); font-size: 0.82rem; }
.delta .ba2 { font-family: var(--mono); color: var(--slate500); font-size: 0.84rem; text-align: right; }

/* Inspect */
.summary { background: var(--surface); border: 1px solid var(--border); border-radius: 14px; box-shadow: 0 1px 2px rgba(15,23,42,0.04); padding: 22px 26px; display: flex; align-items: center; gap: 12px 28px; flex-wrap: wrap; }
.summary .big2 { font-family: var(--mono); font-size: 1.7rem; font-weight: 700; color: var(--ink); }
.summary .txt b { color: var(--ink); font-weight: 600; }
.summary .sub { color: var(--faint); font-size: 0.85rem; }
.summary .pri { margin-left: auto; display: flex; gap: 18px; font-size: 0.85rem; }
.summary .pri span { display: inline-flex; align-items: center; gap: 7px; color: var(--slate600); }
.dot { width: 8px; height: 8px; border-radius: 50%; flex: none; }
.prigrp { margin-top: 38px; }
.prigrp > h2 { font-family: var(--serif); font-size: 1.3rem; font-weight: 600; margin: 0 0 3px; display: flex; align-items: baseline; gap: 10px; }
.prigrp > h2 .ct { font-family: var(--mono); color: var(--faint); font-size: 0.8rem; font-weight: 500; }
.prigrp > .exp { color: var(--slate500); font-size: 0.85rem; margin: 0 0 14px; }
.item { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; box-shadow: 0 1px 2px rgba(15,23,42,0.04); padding: 20px 22px; margin-bottom: 12px; }
.item .ititle { display: flex; align-items: baseline; gap: 11px; }
.item .ititle .glyph { font-size: 0.7rem; flex: none; }
.item .ititle .pt { font-weight: 600; font-size: 1.02rem; }
.item .ititle .tag { margin-left: auto; flex: none; font-size: 0.6rem; letter-spacing: 0.08em; text-transform: uppercase; font-weight: 600; padding: 4px 10px; border-radius: 6px; background: var(--slate100); color: var(--slate600); border: 1px solid var(--border); white-space: nowrap; }
.item .ititle .tag.auto { background: var(--emerald-soft); color: var(--emerald-ink); border-color: var(--emerald-100); }
.field { display: grid; grid-template-columns: 54px 1fr; gap: 5px 14px; margin-top: 13px; font-size: 0.9rem; }
.field .lab { color: var(--faint); font-size: 0.6rem; letter-spacing: 0.1em; text-transform: uppercase; padding-top: 3px; }
.field .val { color: var(--ink); }
.field .val.where { font-family: var(--mono); color: var(--slate600); font-size: 0.86rem; }
.field .val.fix { color: var(--emerald-ink); }
.actions { display: flex; align-items: center; gap: 10px 14px; flex-wrap: wrap; margin-top: 15px; padding-left: 68px; }
.copybtn { font: inherit; font-size: 0.82rem; font-weight: 600; cursor: pointer; color: var(--indigo-ink); background: var(--indigo-soft); border: 1px solid #c7d2fe; border-radius: 8px; padding: 6px 13px; transition: background 0.15s, color 0.15s; }
.copybtn:hover { background: #e0e7ff; }
.copybtn.ok { background: var(--emerald); color: #fff; border-color: var(--emerald); }
.ahint { color: var(--faint); font-size: 0.82rem; }
.cmd { color: var(--slate500); font-size: 0.82rem; }
.cmd code { font-family: var(--mono); font-size: 0.82rem; background: var(--slate100); padding: 1px 6px; border-radius: 5px; }
.allbar { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-top: 18px; }
.empty { background: var(--surface); border: 1px solid var(--border); border-radius: 14px; text-align: center; padding: 60px; color: var(--slate500); margin-top: 24px; }
.empty b { color: var(--ink); }

.foot { margin-top: 60px; color: var(--faint); font-size: 0.78rem; }

@media (prefers-reduced-motion: no-preference) {
  .hero, .summary, .card, .item, .section, .panel { animation: rise 0.4s cubic-bezier(0.22,1,0.36,1) both; }
}
@keyframes rise { from { opacity: 0; transform: translateY(7px); } to { opacity: 1; transform: none; } }
@media (max-width: 640px) { .cards { grid-template-columns: 1fr; } .wrap { padding: 40px 18px 72px; } .summary .pri { margin-left: 0; width: 100%; } .pagehead h1 { font-size: 2rem; } }
`;

const SCRIPT = String.raw`
const DOC = window.__TK_REPORT__;
const root = document.getElementById("app");
const nf = new Intl.NumberFormat("en-US");
const n = (x) => (typeof x === "number" && isFinite(x) ? nf.format(Math.round(x)) : "—");
const pct = (x) => (typeof x === "number" && isFinite(x) ? Math.round(x) + "%" : "—");
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const isNa = (o) => o && typeof o === "object" && o.scope_na === true;
function money(x) {
  if (typeof x !== "number" || !isFinite(x)) return null;
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: x >= 100 ? 0 : 2 }).format(x);
}

const SURFACE_NAMES = {
  agent_instructions: "Agent instructions (AGENTS.md / CLAUDE.md)",
  copilot_instructions: "Copilot instructions",
  path_instructions: "Path-scoped instructions",
  prompt_file: "Prompt files",
  custom_agent: "Custom agents",
  skill: "Skills",
};
const EXPOSURE_PLAIN = { "always-on": "loads into every session", "on-invocation": "loads only when used" };
const PROBLEM = {
  always_on_bloat: "A file that loads every session is too large",
  instruction_conflict: "Two instructions contradict each other",
  skill_invocation_policy: "A skill can be auto-run by the model",
  prompt_metadata_gap: "A prompt is missing its description",
  skill_entrypoint_bloat: "A skill's main file is too long",
  duplicate_instructions: "The same instruction is repeated in several places",
  conditional_rule_missing: "A broad rule should be scoped to specific paths",
  review_truncation_risk: "Long content risks being cut off mid-review",
  cacheability_churn: "Volatile content breaks prompt caching",
};
const FIXCLASS_PLAIN = {
  safe_mechanical: { t: "tk can apply this for you", auto: true },
  suggested_diff: { t: "Manual edit", auto: false },
  advisory: { t: "Review suggestion", auto: false },
  delivery: { t: "Setup step", auto: false },
  non_goal: { t: "Out of scope", auto: false },
};
function humanize(t) { return String(t || "Opportunity").replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()); }

function render() {
  if (DOC.kind === "gain") renderGain(DOC.data);
  else renderInspect(DOC.data);
  root.addEventListener("click", (e) => {
    const b = e.target && e.target.closest ? e.target.closest(".copybtn") : null;
    if (b) copyText(b.getAttribute("data-prompt") || "", b);
  });
}

function renderGain(L) {
  const m = L.measured_command_savings || {};
  const out = [];

  // Hero — the one thing the user should take away. Deep slate surface so the
  // measured number is the loudest thing on the page.
  if (isNa(m)) {
    out.push('<div class="hero light"><div class="lead">' + esc(m.note) + '</div></div>');
  } else {
    const usd = money(L.estimated_savings_usd);
    const price = L.price_per_mtok || 3;
    let h = '<section class="hero deep">';
    if (usd) h += '<p class="lbl kick">≈ ' + usd + ' saved in model spend · estimated at $' + price + ' / 1M tokens</p>';
    h += '<div class="big">' + n(m.saved_tokens) + '<small>tokens saved (measured)</small></div>';
    h += '<div class="lead">Token Killer trimmed your command output by <b>' + pct(m.savings_pct) + '</b> before it reached the model, across <b>' + n(m.commands) + '</b> commands.</div>';
    h += '<div class="ba"><span>Output without tk: <span class="n">' + n(m.raw_tokens) + '</span> tokens</span>' +
      '<span>Sent to the model: <span class="n">' + n(m.output_tokens) + '</span> tokens</span>' +
      '<span>Avg saved per command: <span class="n">' + n(m.avg_savings_per_command) + '</span></span></div>';
    h += '</section>';
    out.push(h);

    const bh = Array.isArray(m.by_handler) ? m.by_handler.slice(0, 12) : [];
    if (bh.length) {
      const max = Math.max.apply(null, bh.map((h2) => h2.saved || 0).concat([1]));
      out.push('<div class="section"><h2>Where the savings came from</h2>' +
        '<p class="exp">The commands whose output Token Killer compressed the most.</p>' +
        '<div class="panel"><table><thead><tr><th>Command</th><th>Share of savings</th><th class="r">Tokens saved</th><th class="r">Reduced by</th><th class="r">Times run</th></tr></thead><tbody>' +
        bh.map((h2) =>
          '<tr><td class="num">' + esc(h2.handler) + '</td>' +
          '<td style="width:32%"><div class="hbar"><i style="width:' + Math.max(3, Math.round(((h2.saved || 0) / max) * 100)) + '%"></i></div></td>' +
          '<td class="r num">' + n(h2.saved) + '</td><td class="r num">' + pct(h2.pct) + '</td><td class="r num">' + n(h2.count) + '</td></tr>').join("") +
        '</tbody></table></div></div>');
    }
  }

  // Supporting detail.
  const cards = [];

  // ② smaller context files
  const od = L.optimizer_deltas || { surfaces: [] };
  let c2 = '';
  if (!od.surfaces || !od.surfaces.length) {
    c2 = '<p class="naline">No files optimized yet. Run <span class="num">tk optimize --apply</span> to slim oversized config files.</p>';
  } else {
    c2 = od.surfaces.map((s) =>
      '<div class="delta"><div class="nm">' + esc(SURFACE_NAMES[s.surface] || s.surface) + '</div>' +
      '<div class="sv">−' + n(s.delta_tokens) + ' tokens</div>' +
      '<div class="ex">' + esc(EXPOSURE_PLAIN[s.exposure_class] || s.exposure_class) + '</div>' +
      '<div class="ba2">' + n(s.before_tokens) + ' → ' + n(s.after_tokens) + '</div></div>').join("");
  }
  cards.push(cardHtml("", "Smaller context files", "Config and instruction files you optimized now load fewer tokens in every session.", c2));

  // ③ avoided (estimate)
  const g = L.governance_opportunities || {};
  const c3 = '<div class="kv"><span class="k">Oversized file reads blocked</span><span class="v">' + n(g.denied_large_reads) + '</span></div>' +
    '<div class="kv"><span class="k">Overly broad searches flagged</span><span class="v">' + n(g.suggested_broad_searches) + '</span></div>' +
    '<div class="kv"><span class="k">Huge prompts blocked</span><span class="v">' + n(g.denied_large_prompts) + '</span></div>' +
    '<div class="kv"><span class="k">Large prompts flagged</span><span class="v">' + n(g.suggested_large_prompts) + '</span></div>' +
    '<div class="est-num">≈ ' + n(g.avoided_tokens_estimate) + ' tokens</div>' +
    '<div class="est-cap">roughly what those actions would have cost — an estimate, not measured savings</div>';
  cards.push(cardHtml("est", "Wasteful actions you avoided", "When a huge read, search, or prompt was about to run, Token Killer blocked or flagged it. This is an estimate of what they would have cost.", c3));

  out.push('<div class="cards">' + cards.join("") + '</div>');

  // ④ safety — full width plain line
  const q = L.quality_guardrails || {};
  if (!isNa(q)) {
    out.push('<div class="section"><h2>Was the compression safe?</h2>' +
      '<p class="exp">Token Killer should never break a command or hide important output. These are the safety checks.</p>' +
      '<div class="card"><div class="kv"><span class="k">Times it fell back to full output (just in case)</span><span class="v">' + ratePlain(q.fallback_rate) + '</span></div>' +
      '<div class="kv"><span class="k">Commands that failed</span><span class="v">' + ratePlain(q.failure_rate) + '</span></div>' +
      '<div class="kv"><span class="k">Optimizations later reverted</span><span class="v">' + n(q.findings_reverted) + '</span></div></div></div>');
  }

  root.innerHTML = out.join("");
}

function ratePlain(x) {
  if (typeof x !== "number" || !isFinite(x)) return "—";
  if (x === 0) return "never";
  return (x * 100).toFixed(2) + "% of the time";
}
function cardHtml(extra, title, exp, body) {
  return '<div class="card ' + extra + '"><h3>' + esc(title) + '</h3><p class="exp">' + esc(exp) + '</p>' + body + '</div>';
}

function renderInspect(D) {
  const findings = Array.isArray(D.findings) ? D.findings : [];
  const counts = { error: 0, warn: 0, info: 0 };
  for (const f of findings) counts[f.severity] = (counts[f.severity] || 0) + 1;
  const out = [];

  const sess = typeof D.sessions_analyzed === "number" ? D.sessions_analyzed : null;
  let s = '<div class="summary"><span class="big2">' + n(findings.length) + '</span>' +
    '<span class="txt"><b>way' + (findings.length === 1 ? "" : "s") + ' to cut token usage</b><div class="sub">found by analyzing ' +
    (sess != null ? n(sess) + ' session' + (sess === 1 ? "" : "s") + ' and ' : '') + n(D.files_scanned) + ' context file' + (D.files_scanned === 1 ? "" : "s") + '</div></span>' +
    '<span class="pri">' + pleg("error", counts.error, "fix now") + pleg("warn", counts.warn, "worth fixing") + pleg("info", counts.info, "minor") + '</span></div>';
  out.push(s);

  if (!findings.length) {
    out.push('<div class="empty"><b>Nothing to fix.</b><br>Your AI setup is already lean — no token-wasting issues found.</div>');
    root.innerHTML = out.join("");
    return;
  }

  out.push('<div class="allbar"><button class="copybtn" type="button" data-prompt="' + esc(buildAllPrompt(findings)) +
    '">Copy all as a prompt</button><span class="ahint">hand the whole list to your coding agent to fix in one go</span></div>');

  const groups = [
    { sev: "error", title: "Fix now", exp: "High-impact problems that waste tokens or confuse the model.", glyph: "●" },
    { sev: "warn", title: "Worth fixing", exp: "Clear improvements that will reduce token usage.", glyph: "●" },
    { sev: "info", title: "Minor", exp: "Small tidy-ups, optional.", glyph: "●" },
  ];
  for (const grp of groups) {
    const list = findings.filter((f) => f.severity === grp.sev);
    if (!list.length) continue;
    out.push('<div class="prigrp"><h2 style="color:var(--' + (grp.sev === "error" ? "hi" : grp.sev === "warn" ? "mid" : "lo") + ')">' +
      esc(grp.title) + ' <span class="ct">' + list.length + '</span></h2><p class="exp">' + esc(grp.exp) + '</p>' +
      list.map((f) => itemHtml(f, grp)).join("") + '</div>');
  }
  root.innerHTML = out.join("");
}

function itemHtml(f, grp) {
  const color = grp.sev === "error" ? "var(--hi)" : grp.sev === "warn" ? "var(--mid)" : "var(--lo)";
  const problem = PROBLEM[f.type] || humanize(f.type);
  const fc = FIXCLASS_PLAIN[f.fix_class];
  const tag = fc ? '<span class="tag' + (fc.auto ? " auto" : "") + '">' + esc(fc.t) + '</span>' : '';
  const where = f.file ? esc(f.file) + (f.start_line ? ", line " + f.start_line : "") : "—";
  const auto = fc && fc.auto;
  const actions =
    '<div class="actions">' +
    '<button class="copybtn" type="button" data-prompt="' + esc(buildPrompt(f)) + '">Copy as prompt</button>' +
    '<span class="ahint">paste into your coding agent to apply this fix</span>' +
    (auto ? '<span class="cmd">or run <code>tk optimize --apply</code></span>' : '') +
    '</div>';
  return '<div class="item"><div class="ititle"><span class="glyph" style="color:' + color + '">●</span>' +
    '<span class="pt">' + esc(problem) + '</span>' + tag + '</div>' +
    '<div class="field"><span class="lab">Where</span><span class="val where">' + where + '</span></div>' +
    (f.evidence ? '<div class="field"><span class="lab">Why</span><span class="val">' + esc(f.evidence) + '</span></div>' : '') +
    (f.recommendation ? '<div class="field"><span class="lab">Fix</span><span class="val fix">' + esc(f.recommendation) + '</span></div>' : '') +
    actions +
    '</div>';
}

// The displayed fix is for the human; the COPIED text is an agent-ready prompt.
// It always tells the agent to SNAPSHOT first (tk optimize --backup) so the human
// can revert the agent's edits later with tk optimize --restore.
function buildPrompt(f) {
  const where = f.file ? f.file + (f.start_line ? " (line " + f.start_line + ")" : "") : "the relevant config file";
  const backupCmd = f.file ? "tk optimize --backup " + f.file : "tk optimize --backup";
  return [
    "Fix a token-wasting issue in my AI/agent configuration.",
    "",
    "Step 1 — before editing, snapshot the file so the change is reversible:",
    "  " + backupCmd,
    "Step 2 — apply this edit directly:",
    "  File: " + where,
    "  Problem: " + (PROBLEM[f.type] || humanize(f.type)),
    f.evidence ? "  Why it matters: " + f.evidence : "",
    "  Change to make: " + (f.recommendation || ""),
    "  Leave everything else in the file unchanged.",
    "",
    "Do not run tk optimize --restore yourself — that is the human's manual undo; it reverts to the step-1 snapshot.",
  ].filter(Boolean).join("\n");
}

function buildAllPrompt(findings) {
  const files = [];
  for (const f of findings) if (f.file && files.indexOf(f.file) === -1) files.push(f.file);
  const backupCmd = files.length ? "tk optimize --backup " + files.join(" ") : "tk optimize --backup";
  const list = findings
    .map((f, i) => {
      const where = f.file ? f.file + (f.start_line ? " (line " + f.start_line + ")" : "") : "the relevant file";
      return "  " + (i + 1) + ". " + where + " — " + (PROBLEM[f.type] || humanize(f.type)) + "\n     " + (f.recommendation || "");
    })
    .join("\n");
  return [
    "Reduce my AI/agent token usage by fixing the issues below.",
    "",
    "Step 1 — before editing, snapshot the files so your changes are reversible:",
    "  " + backupCmd,
    "Step 2 — apply each fix directly, leaving the rest of each file unchanged:",
    list,
    "",
    "When done, verify nothing broke. Do not run tk optimize --restore yourself — that is the human's manual undo; it reverts to the step-1 snapshot.",
  ].join("\n");
}

function copyText(text, btn) {
  const flash = () => {
    if (!btn) return;
    const orig = btn.textContent;
    btn.textContent = "Copied";
    btn.classList.add("ok");
    setTimeout(() => { btn.textContent = orig; btn.classList.remove("ok"); }, 1400);
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(flash, () => fallbackCopy(text, flash));
  } else {
    fallbackCopy(text, flash);
  }
}
function fallbackCopy(text, done) {
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand("copy"); } catch (e) { /* no-op */ }
  document.body.removeChild(ta);
  done();
}

function pleg(sev, c, label) {
  const v = sev === "error" ? "hi" : sev === "warn" ? "mid" : "lo";
  return '<span><span class="dot" style="background:var(--' + v + ')"></span>' + c + ' ' + label + '</span>';
}

render();
`;

export function renderReportHtml(doc: ReportDoc): string {
  const kicker =
    doc.kind === "gain" ? "Token savings · measured" : "Token optimization · opportunities";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(doc.title)} — Token Killer</title>
<style>${STYLE}</style>
</head>
<body>
<div class="wrap">
  <header class="pagehead">
    <p class="lbl">${escapeHtml(kicker)}</p>
    <h1>${escapeHtml(doc.title)} <span class="tk">/ tk</span></h1>
    <div class="sub">${escapeHtml(doc.subtitle)}</div>
    <div class="meta" id="meta"></div>
  </header>
  <main id="app"></main>
  <div class="foot">Generated by Token Killer on ${escapeHtml(doc.generatedAt)}. This report was built on your machine; nothing was uploaded.</div>
</div>
<script>window.__TK_REPORT__ = ${embed(doc)};</script>
<script>
(function () {
  var d = window.__TK_REPORT__;
  var meta = document.getElementById("meta");
  var bits = [];
  var scopeLabel = d.data && d.data.scope === "user" ? "all your projects" : d.data && d.data.scope === "project" ? "this project" : d.data && d.data.scope;
  if (scopeLabel) bits.push('<span>Covers <b>' + scopeLabel + '</b></span>');
  if (d.data && d.data.since) bits.push('<span>since <b>' + d.data.since + '</b></span>');
  bits.push('<span>as of ' + new Date(d.generatedAt).toLocaleString() + '</span>');
  meta.innerHTML = bits.join(" &middot; ");
})();
</script>
<script>${SCRIPT}</script>
</body>
</html>
`;
}

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c,
  );
}
