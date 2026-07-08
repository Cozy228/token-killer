// Single-file HTML report renderer (no external deps, no network, renders from a
// file:// URL). Serves both `ctx gain` and `ctx inspect`: data is injected as a JSON
// blob and a small vanilla renderer draws it. These reports are also ctx's product
// showcase, so they double as a face for the tool — not just a log dump. The
// audience is a TECHNICAL end user: every field gets a plain-language label and a
// one-line explanation — precise and concrete, not dumbed down. The honesty model
// still holds — measured savings lead; the dollar figure and ③ are labelled estimates.
//
// Visual language: serif display headings, white panel cards on a cool neutral
// canvas, a solid deep-slate hero, and an indigo/emerald/amber/rose palette —
// flat fills throughout, no decorative gradients or grain. All inline — no
// Tailwind, no CDN, no fonts fetched — so the file stays openable offline from file://.

import { PROMPT_MODEL_SRC } from "./promptModel.js";

export type ReportKind = "gain" | "inspect";

export type ReportDoc = {
  kind: ReportKind;
  title: string;
  subtitle: string;
  generatedAt: string; // ISO
  data: unknown; // gain → Ledgers (+ estimated_savings_usd, estimated_savings_ai_credits, price_per_mtok); inspect → InspectReportData
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
  --bg: #f8fafc;          /* slate-50: a cool neutral canvas, not warm cream */
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
  --rose-soft: #fff1f2;
  --rose-line: #fecdd3;
  --violet: #7c3aed;
  --sky: #0284c7;
  /* Severity ramp reused by the inspect view (kept as hi/mid/lo for the renderer). */
  --hi: #e11d48;
  --mid: #b45309;
  --lo: #4f46e5;
  /* Dark + high-contrast so the hero dominates — a single solid deep slate, no
     gradient. Contrast does the work; the white number carries it. */
  --deep: #0f172a;
  --mono: ui-monospace, "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace;
  --sans: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  --serif: ui-serif, Georgia, "Times New Roman", serif;
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--ink); font-family: var(--sans); font-size: 15px; line-height: 1.62; -webkit-font-smoothing: antialiased; }
.wrap { max-width: 880px; margin: 0 auto; padding: 56px 24px 100px; }
.num { font-family: var(--mono); font-variant-numeric: tabular-nums; }
.samp { font-family: var(--mono); font-size: 0.78rem; color: var(--slate500); margin-top: 4px; line-height: 1.5; word-break: break-all; }
.lbl { font-size: 0.62rem; letter-spacing: 0.12em; text-transform: uppercase; font-weight: 600; }

/* Page header */
.pagehead { margin-bottom: 40px; }
.pagehead > .lbl { color: var(--indigo); }
.pagehead h1 { font-family: var(--serif); font-size: 2.4rem; font-weight: 600; letter-spacing: -0.02em; margin: 0.4rem 0 0; }
.pagehead h1 .ctx { color: var(--slate300); font-weight: 500; }
.pagehead .sub { color: var(--slate500); font-size: 0.95rem; margin-top: 0.55rem; }
.meta { color: var(--faint); font-size: 0.8rem; margin-top: 16px; padding-top: 14px; border-top: 1px solid var(--border); }
.meta b { color: var(--slate600); font-weight: 500; }

/* Deep slate emphasis surface */
.deep { background: var(--deep); color: #fff; }

/* Gain hero */
.hero { border-radius: 16px; padding: 38px 36px 30px; }
.hero.deep { box-shadow: inset 0 1px 0 rgba(255,255,255,0.06); }
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
.field .val.saves { color: var(--emerald-ink); font-weight: 700; font-family: var(--mono); font-variant-numeric: tabular-nums; }
.field .val.saves i { font-style: normal; font-weight: 600; opacity: 0.6; font-size: 0.85em; font-family: var(--sans); }
.field .val.saves i.rough { color: var(--amber-ink); opacity: 0.9; }
.field .val.savesvar { color: var(--faint); font-style: italic; }
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

/* Session footprint (standing per-session cost, à la /context) */
.fphead { display: flex; align-items: baseline; gap: 10px; margin: 4px 0 16px; }
.fpnum { font-family: var(--mono); font-size: 1.9rem; font-weight: 700; color: var(--ink); letter-spacing: -0.02em; }
.fpunit { color: var(--slate500); font-size: 0.9rem; }
.fpdetail { color: var(--faint); font-size: 0.78rem; margin-top: 3px; max-width: 52ch; }
.estbadge { font-size: 0.58rem; letter-spacing: 0.08em; text-transform: uppercase; font-weight: 600; color: var(--amber-ink); background: var(--amber-soft); border: 1px solid var(--amber-line); border-radius: 5px; padding: 1px 6px; vertical-align: middle; }

/* Token analysis ("Where your tokens go" — measured) */
.mbadge { font-size: 0.56rem; letter-spacing: 0.1em; text-transform: uppercase; font-weight: 700; color: var(--emerald-ink); background: var(--emerald-soft); border: 1px solid var(--emerald-100); border-radius: 6px; padding: 3px 8px; vertical-align: middle; }
.statband { display: grid; grid-template-columns: repeat(4, 1fr); margin-top: 4px; background: var(--surface); border: 1px solid var(--border); border-radius: 16px; box-shadow: 0 1px 2px rgba(15,23,42,0.04); overflow: hidden; }
.statband .stat { padding: 20px 20px; border-right: 1px solid var(--border); }
.statband .stat:last-child { border-right: none; }
.statband .ptag { font-size: 0.56rem; letter-spacing: 0.11em; text-transform: uppercase; font-weight: 700; color: var(--indigo); margin: 0 0 11px; }
.statband .pnum { font-family: var(--mono); font-size: 1.6rem; font-weight: 700; letter-spacing: -0.02em; color: var(--ink); line-height: 1; }
.statband .pnum .u { font-family: var(--sans); font-size: 0.68rem; font-weight: 600; color: var(--slate500); margin-left: 5px; }
.statband .plabel { color: var(--slate600); font-size: 0.78rem; margin: 9px 0 0; line-height: 1.45; }
.statband .stat.accent .pnum { color: var(--emerald-ink); }
.compbar { display: flex; height: 26px; border-radius: 8px; overflow: hidden; border: 1px solid var(--border); margin-top: 20px; }
.compbar > i { display: block; height: 100%; }
.seg-read { background: var(--emerald); } .seg-write { background: var(--violet); } .seg-fresh { background: var(--sky); }
.complegend { display: flex; flex-wrap: wrap; align-items: center; gap: 9px 20px; margin-top: 12px; font-size: 0.83rem; color: var(--slate600); }
.complegend .li { display: inline-flex; align-items: center; gap: 7px; }
.complegend .sw { width: 11px; height: 11px; border-radius: 3px; flex: none; }
.complegend .v { font-family: var(--mono); font-weight: 600; color: var(--ink); }
.hitpill { margin-left: auto; display: inline-flex; align-items: baseline; gap: 6px; background: var(--emerald-soft); border: 1px solid var(--emerald-100); border-radius: 8px; padding: 4px 11px; }
.hitpill .b { font-family: var(--mono); font-size: 1rem; font-weight: 700; color: var(--emerald-ink); }
.hitpill .t { color: var(--emerald-ink); font-size: 0.76rem; }
.subh { font-family: var(--serif); font-size: 1.05rem; font-weight: 600; margin: 30px 0 5px; display: flex; align-items: baseline; gap: 10px; }
.subh .ct { font-family: var(--mono); color: var(--faint); font-size: 0.76rem; font-weight: 500; }
.subh-exp { color: var(--slate500); font-size: 0.83rem; margin: 0 0 13px; max-width: 70ch; }
.sharebar { position: relative; height: 6px; border-radius: 3px; background: var(--slate100); overflow: hidden; min-width: 60px; }
.sharebar > i { position: absolute; inset: 0 auto 0 0; background: var(--indigo); border-radius: 3px; }
/* Row label = the command / model / session id: the anchor of each row, so it leads
   on weight + ink, mono for the literal value. Everything else recedes from it. */
td .tname, td .model { font-family: var(--mono); font-size: 0.86rem; font-weight: 600; color: var(--ink); letter-spacing: -0.01em; }
td .muted { color: var(--slate500); }
/* Category = quiet column tag, no fill (it sits in its own column, doesn't shout). */
.cat { font-size: 0.62rem; letter-spacing: 0.05em; text-transform: uppercase; font-weight: 600; color: var(--faint); }
/* Flags annotate the command on a SECOND line (so the command always leads and the
   row never wraps unpredictably): small colour-as-meaning text, no fill. */
.tflags { display: flex; flex-wrap: wrap; gap: 2px 14px; margin-top: 4px; }
.tflag { font-size: 0.66rem; font-weight: 600; white-space: nowrap; }
.tflag.comp { color: var(--emerald); }
.tflag.big { color: var(--amber-ink); }
.tflag.deny { color: var(--rose); }
/* Hover-help affordance: a dotted underline + help cursor on anything carrying a
   title tooltip, so the reader knows a description is one hover away. */
th[title], .tflag[title], .cat[title], .okbad[title], .tag[title], .saves i[title], .savesvar[title], .stat[title], .hitpill[title] { cursor: help; }
.tflag[title], .cat[title] { text-decoration: underline dotted; text-decoration-color: var(--slate300); text-underline-offset: 3px; }
th[title] { text-decoration: underline dotted; text-decoration-color: var(--slate300); text-underline-offset: 4px; }
.okbad { color: var(--rose); font-weight: 600; }
.ctxgrid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 13px; margin-top: 4px; }
.ctxcard { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 15px 17px; box-shadow: 0 1px 2px rgba(15,23,42,0.04); }
.ctxcard .k { font-size: 0.56rem; letter-spacing: 0.09em; text-transform: uppercase; font-weight: 600; color: var(--faint); }
.ctxcard .v { font-family: var(--mono); font-size: 1.35rem; font-weight: 700; color: var(--ink); margin-top: 6px; }
.ctxcard .d { color: var(--slate500); font-size: 0.75rem; margin-top: 3px; }
.ctxcard .cbar { height: 5px; border-radius: 3px; margin-top: 10px; }

.foot { margin-top: 60px; color: var(--faint); font-size: 0.78rem; }

/* Narrative eyebrow (rtk "01 — the problem" parity, ctx palette) */
.eyebrow { font-size: 0.62rem; letter-spacing: 0.14em; text-transform: uppercase; font-weight: 700; color: var(--indigo); margin-bottom: 6px; }

/* "The problem" — a connected stat ledger; every number is measured from the
   user's own runs (the estimate tile carries the amber treatment). */
.problem { display: grid; grid-template-columns: repeat(2, 1fr); margin-top: 20px; background: var(--surface); border: 1px solid var(--border); border-radius: 16px; box-shadow: 0 1px 2px rgba(15,23,42,0.04); overflow: hidden; }
.diff-lbl { margin-top: 6px; }
.pstat { padding: 26px 26px 24px; border-right: 1px solid var(--border); }
.pstat:last-child { border-right: none; }
.pstat.est { background: var(--amber-soft); }
.pstat .ptag { font-size: 0.6rem; letter-spacing: 0.12em; text-transform: uppercase; font-weight: 700; color: var(--indigo); margin: 0 0 16px; }
.pstat.est .ptag { color: var(--amber-ink); }
.pnum { font-family: var(--mono); font-size: 2.1rem; font-weight: 700; letter-spacing: -0.02em; color: var(--ink); line-height: 1; }
.pstat.est .pnum { color: var(--amber-ink); }
.pnum .punit { font-family: var(--sans); font-size: 0.76rem; font-weight: 600; color: var(--slate500); margin-left: 7px; letter-spacing: 0; }
.plabel { color: var(--slate600); font-size: 0.86rem; line-height: 1.55; margin: 14px 0 0; }
.pstat.est .plabel { color: var(--amber-ink); }

/* "See the difference" — before/after bars */
.diffbox { background: var(--surface); border: 1px solid var(--border); border-radius: 14px; box-shadow: 0 1px 2px rgba(15,23,42,0.04); padding: 24px 26px; }
.diffrow { display: grid; grid-template-columns: 150px 1fr auto; align-items: center; gap: 14px; margin: 10px 0; }
.diffrow .dl { color: var(--slate600); font-size: 0.86rem; }
.diffrow .dv { font-family: var(--mono); font-weight: 600; font-size: 0.9rem; white-space: nowrap; }
.diffbar { height: 22px; border-radius: 6px; min-width: 4px; }
.diffbar.raw { background: var(--rose); }
.diffbar.sent { background: var(--emerald); }
.diffrow .dv.cut { color: var(--emerald-ink); }

/* "Real-world savings" — daily/weekly/monthly trend */
.trendtabs { display: inline-flex; gap: 4px; background: var(--slate100); border-radius: 10px; padding: 4px; margin: 4px 0 16px; }
.trendbtn { font: inherit; font-size: 0.8rem; font-weight: 600; cursor: pointer; border: none; background: transparent; color: var(--slate600); padding: 6px 14px; border-radius: 7px; transition: background 0.15s, color 0.15s; }
.trendbtn.on { background: var(--surface); color: var(--indigo-ink); box-shadow: 0 1px 2px rgba(15,23,42,0.08); }
.chartwrap { background: var(--surface); border: 1px solid var(--border); border-radius: 14px; box-shadow: 0 1px 2px rgba(15,23,42,0.04); padding: 16px 20px 14px; }
.chartymax { font-family: var(--mono); font-size: 0.7rem; color: var(--faint); margin: 0 0 6px; }
.chartymax b { color: var(--slate600); font-weight: 600; }
/* Clean baseline only — no gridline stripes. Heights + the peak caption read the scale. */
.chart { position: relative; display: flex; align-items: flex-end; gap: 3px; height: 132px; padding-top: 20px; border-bottom: 1px solid var(--slate300); }
.chart .col { flex: 1 1 0; min-width: 2px; align-self: flex-end; background: var(--emerald); border-radius: 3px 3px 0 0; position: relative; transition: background 0.15s; }
.chart .col.zero { background: var(--slate100); min-height: 3px; }
.chart .col:hover { background: var(--emerald-ink); }
.chart .col > span { position: absolute; bottom: 100%; left: 50%; transform: translateX(-50%); white-space: nowrap; font-family: var(--mono); font-size: 0.66rem; color: var(--slate700); background: var(--surface); border: 1px solid var(--border); border-radius: 6px; padding: 3px 7px; opacity: 0; pointer-events: none; transition: opacity 0.12s; margin-bottom: 6px; z-index: 3; box-shadow: 0 4px 12px rgba(15,23,42,0.10); }
.chart .col:hover > span { opacity: 1; }
.chartx { display: flex; justify-content: space-between; font-family: var(--mono); font-size: 0.68rem; color: var(--faint); margin-top: 8px; }
.trendpanel { margin-top: 12px; }
.trendpanel .panel { border-radius: 14px; }
.trendempty { color: var(--faint); font-style: italic; font-size: 0.9rem; padding: 8px 0; }

@media (prefers-reduced-motion: no-preference) {
  .hero, .summary, .card, .item, .section, .panel { animation: rise 0.4s cubic-bezier(0.22,1,0.36,1) both; }
}
@keyframes rise { from { opacity: 0; transform: translateY(7px); } to { opacity: 1; transform: none; } }
@media (max-width: 680px) { .statband { grid-template-columns: 1fr 1fr; } .statband .stat:nth-child(2) { border-right: none; } .ctxgrid { grid-template-columns: 1fr; } .complegend .hitpill { margin-left: 0; } }
@media (max-width: 640px) { .cards, .problem { grid-template-columns: 1fr; } .problem .pstat { border-right: none; border-bottom: 1px solid var(--border); } .problem .pstat:last-child { border-bottom: none; } .wrap { padding: 40px 18px 72px; } .summary .pri { margin-left: 0; width: 100%; } .pagehead h1 { font-size: 2rem; } .diffrow { grid-template-columns: 110px 1fr; } .diffrow .dv { grid-column: 2; text-align: right; } }
`;

const SCRIPT = String.raw`
const DOC = window.__CTX_REPORT__;
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
// Compact K/M/B for chart axes and bar labels (mirrors core/gain.ts compact()).
function cmp(x) {
  if (typeof x !== "number" || !isFinite(x)) return "0";
  const v = Math.round(x), a = Math.abs(v);
  if (a < 1000) return String(v);
  for (const [base, suf] of [[1e9, "B"], [1e6, "M"], [1e3, "K"]]) {
    if (a >= base) return (v / base).toFixed(1).replace(/\.0$/, "") + suf;
  }
  return String(v);
}

// Prompt model (issue #58): SURFACE_NAMES, PROBLEM, humanize, whereOf, surfaceName,
// fillTpl, PROMPT_TPL, buildPrompt and buildAllPrompt are defined ONCE in promptModel.ts
// and injected here verbatim, so the browser and the Node tests run identical code.
${PROMPT_MODEL_SRC}

const EXPOSURE_PLAIN = { "always-on": "loads into every session", "on-invocation": "loads only when used" };
const FIXCLASS_PLAIN = {
  safe_mechanical: { t: "ctx can apply this for you", auto: true, tip: "A safe, mechanical edit ctx can apply automatically with ctx optimize --apply." },
  suggested_diff: { t: "Manual edit", auto: false, tip: "A concrete edit to make by hand (or hand to your agent via Copy as prompt)." },
  advisory: { t: "Review suggestion", auto: false, tip: "A judgement call to review — no automatic fix." },
  delivery: { t: "Setup step", auto: false, tip: "A one-time setup action (install a shim / hook), not a file edit." },
  non_goal: { t: "Out of scope", auto: false, tip: "Noted for context; not something to act on here." },
};

function render() {
  if (DOC.kind === "gain") renderGain(DOC.data);
  else renderInspect(DOC.data);
  root.addEventListener("click", (e) => {
    const t = e.target;
    const b = t && t.closest ? t.closest(".copybtn") : null;
    if (b) { copyText(b.getAttribute("data-prompt") || "", b); return; }
    const tb = t && t.closest ? t.closest(".trendbtn") : null;
    if (tb) switchTrend(tb);
  });
}

// "The problem" — one section that both SHOWS the waste (before/after bars: raw
// output vs what actually reached the model) and frames its cost (two stat tiles:
// the noise share stripped, and the estimated spend avoided). Folds in the old
// standalone "See the difference" bars so the raw→sent figures appear once here,
// not duplicated across two adjacent sections. Every number is measured from the
// user's own runs; the spend tile is the amber estimate, never summed into tokens.
function renderProblem(m, L) {
  const raw = m.raw_tokens || 0;
  const sent = m.output_tokens || 0;
  const usd = money(L.estimated_savings_usd);
  const credits = L.estimated_savings_ai_credits;
  const creditStr = typeof credits === "number" && isFinite(credits) ? n(credits) : null;
  const price = L.price_per_mtok || 3;
  const w = (v) => (raw > 0 ? Math.max(2, Math.round((v / raw) * 100)) : 2);
  const bars = raw > 0
    ? '<p class="eyebrow diff-lbl">See the difference</p>' +
      '<div class="diffbox">' +
      '<div class="diffrow"><span class="dl">Output without ctx</span><span class="diffbar raw" style="width:' + w(raw) + '%"></span><span class="dv">' + cmp(raw) + '</span></div>' +
      '<div class="diffrow"><span class="dl">Sent to the model</span><span class="diffbar sent" style="width:' + w(sent) + '%"></span><span class="dv cut">' + cmp(sent) + ' &middot; &minus;' + pct(m.savings_pct) + '</span></div>' +
      '</div>'
    : '';
  const tiles = [
    { cls: "", tag: "Redundant noise", num: pct(m.savings_pct), unit: "",
      p: "of that raw output was boilerplate Contexa stripped before it ever reached the model." },
    { cls: "est", tag: "Spend avoided", num: creditStr ? creditStr : (usd || "—"),
      unit: creditStr ? "AI Credits" : "",
      p: "estimated model spend on that raw output" + (creditStr && usd ? " (" + usd + ")" : "") +
        ", valued at $" + price + " / 1M tokens." },
  ];
  return '<div class="section"><p class="eyebrow">The problem</p>' +
    '<h2>What that command output was costing you</h2>' +
    '<p class="exp">Every command your agent runs dumps its output into the context window. Here is what that cost, and what Contexa cut before it reached the model.</p>' +
    bars +
    '<div class="problem">' +
    tiles.map((t) => '<div class="pstat ' + t.cls + '"><p class="ptag">' + esc(t.tag) + '</p>' +
      '<div class="pnum">' + t.num + (t.unit ? '<span class="punit">' + esc(t.unit) + '</span>' : '') + '</div>' +
      '<p class="plabel">' + esc(t.p) + '</p></div>').join("") +
    '</div></div>';
}

// "Real-world savings" — daily/weekly/monthly trend (rtk Proof parity). Driven by
// the rollup buckets wired in via core/ledger.ts. Hidden when absent/all-empty.
function renderTrend(ts) {
  if (!ts || typeof ts !== "object") return "";
  const sets = { daily: ts.daily || [], weekly: ts.weekly || [], monthly: ts.monthly || [] };
  const anyData = ["daily", "weekly", "monthly"].some((k) =>
    sets[k].some((b) => (b.saved || 0) > 0 || (b.commands || 0) > 0));
  if (!anyData) return "";
  // Render the WHOLE series in order — never filter out empty buckets, or the trend
  // loses its time axis and reads as jumpy noise. Idle periods render as faint
  // baseline ticks (.zero), so the line of activity stays continuous and honest.
  const view = (buckets) => {
    const data = buckets;
    if (!data.length || !data.some((b) => (b.saved || 0) > 0)) {
      return '<div class="trendempty">No activity in this window yet.</div>';
    }
    const max = Math.max.apply(null, data.map((b) => b.saved || 0).concat([1]));
    const bars = data.map((b) => {
      const saved = b.saved || 0;
      const h = saved <= 0 ? 0 : Math.max(3, Math.round((saved / max) * 100));
      return '<div class="col' + (saved <= 0 ? " zero" : "") + '" style="height:' + h + '%">' +
        '<span>' + esc(b.key) + ' &middot; ' + cmp(saved) + ' saved &middot; ' + pct(b.pct) + '</span></div>';
    }).join("");
    const chart = '<div class="chartwrap"><p class="chartymax">peak <b>' + cmp(max) + '</b> tokens saved</p>' +
      '<div class="chart">' + bars + '</div>' +
      '<div class="chartx"><span>' + esc(data[0].key) + '</span><span>' + esc(data[data.length - 1].key) + '</span></div></div>';
    const rows = data.slice(-12).reverse().map((b) =>
      '<tr><td class="num">' + esc(b.key) + '</td><td class="r num">' + cmp(b.saved) + '</td>' +
      '<td class="r num">' + pct(b.pct) + '</td><td class="r num">' + n(b.commands) + '</td></tr>').join("");
    return chart + '<div class="trendpanel"><div class="panel"><table>' +
      '<thead><tr><th>Period</th><th class="r">Saved</th><th class="r">Reduced by</th><th class="r">Commands</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div></div>';
  };
  const tabs = [["daily", "Daily"], ["weekly", "Weekly"], ["monthly", "Monthly"]];
  // Default to the densest view that has data.
  const first = tabs.map((t) => t[0]).find((k) => sets[k].some((b) => (b.saved || 0) > 0)) || "daily";
  const btns = tabs.map(([k, label]) =>
    '<button type="button" class="trendbtn' + (k === first ? " on" : "") + '" data-trend="' + k + '">' + label + '</button>').join("");
  const panels = tabs.map(([k]) =>
    '<div class="trendview" data-trendview="' + k + '"' + (k === first ? "" : ' style="display:none"') + '>' + view(sets[k]) + '</div>').join("");
  return '<div class="section" id="trend"><p class="eyebrow">Real-world savings</p>' +
    '<h2>Your savings over time</h2>' +
    '<p class="exp">Daily, weekly, and monthly token savings from your own runs, the same data as <span class="num">ctx gain --daily / --weekly / --monthly</span>.</p>' +
    '<div class="trendtabs">' + btns + '</div>' + panels + '</div>';
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
    const credits = L.estimated_savings_ai_credits;
    const creditStr = typeof credits === "number" && isFinite(credits) ? n(credits) : null;
    const price = L.price_per_mtok || 3;
    const xr = L.cross_reference;
    let h = '<section class="hero deep">';
    // Value kicker: AI Credits (1 credit = $0.01) is the headline value unit, USD
    // in parentheses. This is an ESTIMATE derived from the measured tokens below.
    if (creditStr) h += '<p class="lbl kick">≈ ' + creditStr + ' AI Credits saved' + (usd ? ' (' + usd + ')' : '') + ' · estimated at $' + price + ' / 1M tokens (Sonnet 4.6)</p>';
    else if (usd) h += '<p class="lbl kick">≈ ' + usd + ' saved in model spend · estimated at $' + price + ' / 1M tokens</p>';
    // Cross-reference at a well-known model's rate (e.g. GPT-5.5).
    if (xr && typeof xr.estimated_savings_ai_credits === "number" && isFinite(xr.estimated_savings_ai_credits)) {
      h += '<p class="lbl kick xref">at ' + esc(xr.model) + ' rates ($' + xr.price_per_mtok + ' / 1M): ≈ ' + n(xr.estimated_savings_ai_credits) + ' AI Credits (' + (money(xr.estimated_savings_usd) || '') + ')</p>';
    }
    h += '<div class="big">' + n(m.saved_tokens) + '<small>tokens saved (measured)</small></div>';
    h += '<div class="lead">Contexa trimmed your command output by <b>' + pct(m.savings_pct) + '</b> before it reached the model, across <b>' + n(m.commands) + '</b> commands.</div>';
    h += '<div class="ba"><span>Output without ctx: <span class="n">' + n(m.raw_tokens) + '</span> tokens</span>' +
      '<span>Sent to the model: <span class="n">' + n(m.output_tokens) + '</span> tokens</span>' +
      '<span>Avg saved per command: <span class="n">' + n(m.avg_savings_per_command) + '</span></span></div>';
    h += '</section>';
    out.push(h);

    // Narrative arc (ctx-honest): one "problem" section that shows the raw→sent
    // difference and frames its cost — no duplicate before/after section.
    out.push(renderProblem(m, L));

    const bh = Array.isArray(m.by_handler) ? m.by_handler.slice(0, 12) : [];
    if (bh.length) {
      const max = Math.max.apply(null, bh.map((h2) => h2.saved || 0).concat([1]));
      out.push('<div class="section"><h2>Where the savings came from</h2>' +
        '<p class="exp">The commands whose output Contexa compressed the most.</p>' +
        '<div class="panel"><table><thead><tr><th>Command</th><th>Share of savings</th><th class="r">Tokens saved</th><th class="r">Reduced by</th><th class="r">Times run</th></tr></thead><tbody>' +
        bh.map((h2) =>
          '<tr><td class="num">' + esc(h2.handler) + '</td>' +
          '<td style="width:32%"><div class="hbar"><i style="width:' + Math.max(3, Math.round(((h2.saved || 0) / max) * 100)) + '%"></i></div></td>' +
          '<td class="r num">' + n(h2.saved) + '</td><td class="r num">' + pct(h2.pct) + '</td><td class="r num">' + n(h2.count) + '</td></tr>').join("") +
        '</tbody></table></div></div>');
    }

    // Real-world savings — daily/weekly/monthly trend (rollup buckets via ledger.ts).
    out.push(renderTrend(L.timeseries));
  }

  // Supporting detail.
  const cards = [];

  // ② smaller context files
  const od = L.optimizer_deltas || { surfaces: [] };
  let c2 = '';
  if (!od.surfaces || !od.surfaces.length) {
    c2 = '<p class="naline">No files optimized yet. Run <span class="num">ctx optimize --apply</span> to slim oversized config files.</p>';
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
    '<div class="est-cap">roughly what those actions would have cost (an estimate, not measured savings)</div>';
  cards.push(cardHtml("est", "Wasteful actions you avoided", "When a huge read, search, or prompt was about to run, Contexa blocked or flagged it. This is an estimate of what they would have cost.", c3));

  out.push('<div class="cards">' + cards.join("") + '</div>');

  // ④ safety — full width plain line
  const q = L.quality_guardrails || {};
  if (!isNa(q)) {
    out.push('<div class="section"><h2>Was the compression safe?</h2>' +
      '<p class="exp">Contexa should never break a command or hide important output. These are the safety checks.</p>' +
      '<div class="card"><div class="kv"><span class="k">Fell back to full output (safety fallback, never truncated)</span><span class="v">' + ratePlain(q.fallback_rate) + '</span></div>' +
      '<div class="kv"><span class="k">Commands that failed</span><span class="v">' + ratePlain(q.failure_rate) + '</span></div>' +
      '<div class="kv"><span class="k">Optimizations later reverted</span><span class="v">' + n(q.findings_reverted) + '</span></div></div></div>');
  }

  root.innerHTML = out.join("");
}

// Toggle the daily/weekly/monthly trend view. Scoped to the clicked button's
// #trend section so it never touches anything else.
function switchTrend(btn) {
  const sec = btn.closest("#trend");
  if (!sec) return;
  const want = btn.getAttribute("data-trend");
  const btns = sec.querySelectorAll(".trendbtn");
  for (let i = 0; i < btns.length; i++) btns[i].classList.toggle("on", btns[i] === btn);
  const views = sec.querySelectorAll(".trendview");
  for (let i = 0; i < views.length; i++) {
    views[i].style.display = views[i].getAttribute("data-trendview") === want ? "" : "none";
  }
}

function ratePlain(x) {
  if (typeof x !== "number" || !isFinite(x)) return "—";
  if (x === 0) return "never";
  return (x * 100).toFixed(2) + "% of the time";
}
function cardHtml(extra, title, exp, body) {
  return '<div class="card ' + extra + '"><h3>' + esc(title) + '</h3><p class="exp">' + esc(exp) + '</p>' + body + '</div>';
}

// Standing per-session token cost panel (instructions / skills / agents / MCP).
function renderFootprint(fp) {
  if (!fp || !Array.isArray(fp.items) || !fp.items.length) return "";
  const max = Math.max.apply(null, fp.items.map((i) => i.tokens).concat([1]));
  const rows = fp.items.map((i) =>
    '<tr><td>' + esc(i.label) + (i.estimated ? ' <span class="estbadge">est.</span>' : '') +
      '<div class="fpdetail">' + esc(i.detail) + '</div></td>' +
      '<td class="r num">' + n(i.count) + '</td>' +
      '<td style="width:34%"><div class="hbar"><i style="width:' + Math.max(3, Math.round((i.tokens / max) * 100)) + '%"></i></div></td>' +
      '<td class="r num">' + n(i.tokens) + '</td></tr>').join("");
  return '<div class="section"><h2>Session footprint</h2>' +
    '<p class="exp">What loads into <b>every</b> session before you type a word — your always-on token cost. The host system prompt and built-in tools are excluded (you cannot change those).</p>' +
    '<div class="fphead"><span class="fpnum">≈ ' + n(fp.total_tokens) + '</span><span class="fpunit">tokens / session' + (fp.has_estimate ? ' · includes an estimate' : '') + '</span></div>' +
    '<div class="panel"><table><thead><tr><th>Source</th><th class="r">Count</th><th>Share</th><th class="r">Tokens</th></tr></thead><tbody>' +
    rows + '</tbody></table></div></div>';
}

// A table header cell with an optional hover description (native title tooltip).
function th(label, tip, right) {
  return '<th' + (right ? ' class="r"' : '') + (tip ? ' title="' + esc(tip) + '"' : '') + '>' + label + '</th>';
}

// Plain-language descriptions of each per-tool flag (shown on hover).
const FLAG_TIPS = {
  compressible: "ctx can losslessly compress this command's output — route it through the ctx shim",
  large: "at least one call returned very large output (an output hotspot)",
  deny: "targets a dependency dir, build output, or lockfile — low-signal, high-token",
};
const CATEGORY_TIPS = {
  execute: "Runs a shell command",
  read: "Reads a file",
  search: "Searches file contents",
  list: "Lists files / directories",
  edit: "Edits a file",
  web: "Fetches a URL",
  agent: "Orchestrates sub-agents / tasks",
};

// One context-split tile (measured standing per-turn cost).
function ctxCard(k, v, d, color, mx) {
  const w = Math.max(6, Math.round(((v || 0) / mx) * 100));
  return '<div class="ctxcard"><div class="k">' + esc(k) + '</div><div class="v">' + cmp(v || 0) +
    '</div><div class="d">' + esc(d) + '</div><div class="cbar" style="background:' + color + ';width:' + w + '%"></div></div>';
}

// "Where your tokens go" — the measured analysis of every past session: real token
// totals (session.shutdown ground truth) + per-model / per-session / per-tool detail.
// The per-tool table is the SAME dataset as the optimization findings below, zoomed in.
function renderTokenAnalysis(D) {
  const st = D.session_tokens;
  const opps = Array.isArray(D.opportunities) ? D.opportunities : [];
  const hasMeasured = st && st.sessions > 0;
  if (!hasMeasured && !opps.length) return "";

  const out = ['<div class="section"><h2>Where your tokens go <span class="mbadge">measured</span></h2>'];
  out.push('<p class="exp">Your past sessions at a glance: measured token spend — read straight from each session\'s shutdown record, not estimated — then the per-model, per-session and per-tool detail behind it.</p>');

  if (hasMeasured) {
    const prompt = st.input + st.cache_read + st.cache_write;
    const hit = prompt > 0 ? Math.round((st.cache_read / prompt) * 100) : 0;
    const toolCalls = typeof D.tool_event_count === "number" ? D.tool_event_count : 0;
    let okc = 0, totc = 0;
    for (const o of opps) { okc += o.success_count || 0; totc += (o.success_count || 0) + (o.failure_count || 0); }
    const okPct = totc ? Math.round((okc / totc) * 100) : null;

    out.push('<div class="statband">' +
      '<div class="stat" title="All tokens sent to the model: fresh input plus cache read and cache write."><p class="ptag">Prompt tokens</p><div class="pnum">' + cmp(prompt) + '</div><p class="plabel">input + cache, across ' + n(st.sessions) + ' session' + (st.sessions === 1 ? "" : "s") + '</p></div>' +
      '<div class="stat" title="Tokens generated by the model, including reasoning/thinking tokens."><p class="ptag">Output</p><div class="pnum">' + cmp(st.output) + '</div><p class="plabel">' + (st.reasoning > 0 ? 'incl. ' + cmp(st.reasoning) + ' reasoning' : 'generated by the model') + '</p></div>' +
      '<div class="stat accent" title="Premium requests (AI credits) billed across all sessions."><p class="ptag">Premium reqs</p><div class="pnum">' + (st.premium_requests || 0) + '</div><p class="plabel">AI credits billed</p></div>' +
      '<div class="stat" title="Total tool/command invocations across all sessions, and the share that succeeded."><p class="ptag">Tool calls</p><div class="pnum">' + n(toolCalls) + '</div><p class="plabel">' + (okPct != null ? okPct + '% succeeded' : 'across your sessions') + '</p></div>' +
      '</div>');

    const pr = prompt > 0 ? (st.cache_read / prompt) * 100 : 0;
    const pw = prompt > 0 ? (st.cache_write / prompt) * 100 : 0;
    const pf = prompt > 0 ? (st.input / prompt) * 100 : 0;
    out.push('<div class="compbar"><i class="seg-read" style="width:' + pr + '%"></i><i class="seg-write" style="width:' + pw + '%"></i><i class="seg-fresh" style="width:' + pf + '%"></i></div>');
    out.push('<div class="complegend">' +
      '<span class="li"><span class="sw seg-read"></span>Cache read <span class="v">' + cmp(st.cache_read) + '</span></span>' +
      '<span class="li"><span class="sw seg-write"></span>Cache write <span class="v">' + cmp(st.cache_write) + '</span></span>' +
      '<span class="li"><span class="sw seg-fresh"></span>Fresh input <span class="v">' + cmp(st.input) + '</span></span>' +
      '<span class="hitpill" title="Cache-read tokens ÷ prompt tokens. Higher means more context was reused turn-to-turn instead of re-sent."><span class="b">' + hit + '%</span><span class="t">cache hit</span></span></div>');

    const models = Array.isArray(st.models) ? st.models : [];
    if (models.length) {
      let rows = '';
      for (const m of models) rows += '<tr><td><span class="model">' + esc(m.model) + '</span></td><td class="r num">' + n(m.requests) +
        '</td><td class="r num">' + cmp(m.inputTokens) + '</td><td class="r num">' + cmp(m.outputTokens) + '</td><td class="r num">' + cmp(m.cacheReadTokens) +
        '</td><td class="r num">' + cmp(m.cacheWriteTokens) + '</td><td class="r num">' + cmp(m.reasoningTokens) + '</td><td class="r num">' + (Math.round(m.cost * 100) / 100) + '</td></tr>';
      const mhead =
        th('Model') + th('Reqs', 'API requests to this model', true) +
        th('Input', 'Fresh (uncached) input tokens', true) + th('Output', 'Generated output tokens', true) +
        th('Cache read', 'Tokens served from cache (cheap, reused)', true) +
        th('Cache write', 'Tokens written to cache (new context)', true) +
        th('Reasoning', 'Reasoning/thinking tokens', true) +
        th('Premium', 'Premium requests (AI credits) billed', true);
      out.push('<div class="subh">By model <span class="ct">' + models.length + ' model' + (models.length === 1 ? "" : "s") + '</span></div>' +
        '<div class="panel"><table><thead><tr>' + mhead + '</tr></thead><tbody>' + rows + '</tbody></table></div>');
    }

    const sessions = Array.isArray(st.bySession) ? st.bySession : [];
    if (sessions.length) {
      const TOP = 10;
      let rows = '';
      for (const r of sessions.slice(0, TOP)) rows += '<tr><td><span class="model">' + esc(r.id) + '</span></td><td class="muted">' + esc(r.model || "—") +
        '</td><td class="r num">' + cmp(r.prompt) + '</td><td class="r num">' + cmp(r.output) + '</td><td class="r num">' + Math.round((r.cache_hit || 0) * 100) + '%</td><td class="r num">' + (r.premium || 0) + '</td></tr>';
      const shead =
        th('Session', 'Copilot CLI session id') + th('Model', 'Primary model for the session') +
        th('Prompt', 'Measured prompt tokens (input + cache)', true) +
        th('Output', 'Measured output tokens', true) +
        th('Cache hit', 'Cache-read tokens ÷ prompt tokens', true) +
        th('Premium', 'Premium requests (AI credits) billed', true);
      out.push('<div class="subh">By session <span class="ct">' + sessions.length + ' session' + (sessions.length === 1 ? "" : "s") + (sessions.length > TOP ? ' · top ' + TOP + ' by spend' : '') + '</span></div>' +
        '<div class="panel"><table><thead><tr>' + shead + '</tr></thead><tbody>' + rows + '</tbody></table></div>');
    }
  }

  if (opps.length) {
    const TOP = 12;
    const toolTokens = (o) => (o.total_input_tokens || 0) + (o.total_output_tokens || 0);
    const totalToolTokens = opps.reduce((s, o) => s + toolTokens(o), 0) || 1;
    const maxTok = Math.max.apply(null, opps.map(toolTokens).concat([1]));
    let rows = '';
    for (const o of opps.slice(0, TOP)) {
      const fl = [];
      if (o.compressible) fl.push('<span class="tflag comp" title="' + esc(FLAG_TIPS.compressible) + '">compressible</span>');
      if (o.large_output_count > 0) fl.push('<span class="tflag big" title="' + esc(FLAG_TIPS.large) + '">large output</span>');
      if (o.governed_deny > 0) fl.push('<span class="tflag deny" title="' + esc(FLAG_TIPS.deny) + '">dependency read</span>');
      // Flags sit on their own line UNDER the command, so the command always leads and
      // the row never wraps unpredictably.
      const flags = fl.length ? '<div class="tflags">' + fl.join('') + '</div>' : '';
      const tot = (o.success_count || 0) + (o.failure_count || 0);
      const ok = tot ? Math.round((o.success_count / tot) * 100) : null;
      const okCell = ok == null ? '—' : (ok < 100 ? '<span class="okbad" title="' + (tot - o.success_count) + ' of ' + tot + ' calls failed">' + ok + '%</span>' : ok + '%');
      const cat = o.category === 'execute_adjacent' ? 'execute' : (o.category === 'agent-orchestration' ? 'agent' : o.category);
      const tt = toolTokens(o);
      const sw = Math.max(4, Math.round((tt / maxTok) * 100));
      const sharePct = ((tt / totalToolTokens) * 100).toFixed(1) + '%';
      rows += '<tr><td><div class="tname">' + esc(o.key) + '</div>' + flags + '</td><td><span class="cat" title="' + esc(CATEGORY_TIPS[cat] || ('Tool category: ' + cat)) + '">' + esc(cat) + '</span></td><td class="r num">' + n(o.count) +
        '</td><td class="r num">≈' + cmp(o.total_input_tokens || 0) + '</td><td class="r num">≈' + cmp(o.total_output_tokens || 0) + '</td><td class="r num">≈' + cmp(tt) + '</td>' +
        '<td style="width:14%"><div class="sharebar"><i style="width:' + sw + '%"></i></div></td><td class="r num">' + sharePct + '</td><td class="r num">' + okCell + '</td></tr>';
    }
    const head =
      th('Command / tool', 'The command or tool the agent invoked') +
      th('Category', 'What kind of operation it is') +
      th('Calls', 'How many times it ran across all sessions', true) +
      th('In ≈tok', 'Estimated input tokens (arguments), chars→tokens', true) +
      th('Out ≈tok', 'Estimated output tokens returned, chars→tokens', true) +
      th('Total ≈tok', 'Input + output token estimate', true) +
      th('Share', "This tool's portion of total tool token traffic") +
      th('Tok %', 'That share as a percentage', true) +
      th('Success', 'Share of calls that exited successfully', true);
    out.push('<div class="subh">By tool &amp; command <span class="ct">top ' + Math.min(TOP, opps.length) + ' of ' + opps.length + '</span></div>' +
      '<p class="subh-exp">What the agent ran, with per-tool token traffic (input + output, a chars→tokens estimate).' + (hasMeasured ? ' The measured totals above are the ground truth.' : '') + ' Hover any column or flag for what it means.</p>' +
      '<div class="panel"><table><thead><tr>' + head + '</tr></thead><tbody>' + rows + '</tbody></table></div>');
  }

  if (hasMeasured && st.last_context) {
    const c = st.last_context;
    const mx = Math.max(c.system || 0, c.conversation || 0, c.tool_definitions || 0, 1);
    out.push('<div class="subh">Standing context cost <span class="ct">most recent session</span></div>' +
      '<p class="subh-exp">Re-sent every turn before you type — your fixed per-turn overhead.</p>' +
      '<div class="ctxgrid">' +
      ctxCard('Tool definitions', c.tool_definitions, 'MCP + built-in tool schemas', 'var(--violet)', mx) +
      ctxCard('System prompt', c.system, 'Host instructions + your AGENTS.md', 'var(--sky)', mx) +
      ctxCard('Conversation', c.conversation, 'Messages so far this session', 'var(--emerald)', mx) +
      '</div>');
  }

  out.push('</div>');
  return out.join("");
}

// Promote each finding to its TYPE's max severity so one problem never splits across
// tiers (e.g. skill_invocation_policy isn't half "worth fixing", half "minor"). This
// is the classification fix — it does NOT drop any problem; grouping by type then
// renders each as a single card carrying its instance count.
const SEV_RANK = { error: 3, warn: 2, info: 1 };
function consolidateFindings(findings) {
  const maxByType = {};
  for (const f of findings) {
    if ((SEV_RANK[f.severity] || 0) > (SEV_RANK[maxByType[f.type]] || 0)) maxByType[f.type] = f.severity;
  }
  return findings.map((f) => (f.severity === maxByType[f.type] ? f : { ...f, severity: maxByType[f.type] }));
}

function renderInspect(D) {
  const raw = Array.isArray(D.findings) ? D.findings : [];
  const findings = consolidateFindings(raw);
  const out = [];

  // 1 · The analysis FIRST: where your tokens actually went (measured + detail).
  out.push(renderTokenAnalysis(D));

  // 2 · Standing per-session config cost (ctx's estimate of YOUR configurable surfaces).
  out.push(renderFootprint(D.footprint));

  // 3 · The optimizations that fall out of the analysis above — LAST. The findings
  // header doubles as the section intro, then the severity groups (existing UI with
  // "copy as prompt"). Empty → an explicit "nothing to fix" so the report still closes.
  const sess = typeof D.sessions_analyzed === "number" ? D.sessions_analyzed : null;
  out.push('<div class="section"><h2>What you can improve</h2>' +
    '<p class="exp">Potential optimizations, derived from the analysis above — ' +
    (sess != null ? 'across ' + n(sess) + ' session' + (sess === 1 ? "" : "s") + ' and ' : '') +
    n(D.files_scanned) + ' context file' + (D.files_scanned === 1 ? "" : "s") + '.</p></div>');

  if (!findings.length) {
    out.push('<div class="empty"><b>Nothing to fix.</b><br>Your AI setup is already lean — no token-wasting issues found.</div>');
    root.innerHTML = out.join("");
    return;
  }

  // Three tiers by impact — every problem is shown (nothing dropped). Within each
  // tier, cards are ordered by estimated saving (biggest first). The "lower impact"
  // tier is the old "minor" made meaningful: each card now states what it saves.
  const groups = [
    { sev: "error", title: "Fix now", exp: "High-impact problems that waste tokens or confuse the model.", glyph: "●" },
    { sev: "warn", title: "Worth fixing", exp: "Clear improvements that will reduce token usage.", glyph: "●" },
    { sev: "info", title: "Lower impact", exp: "Smaller wins and housekeeping — each card shows what it saves.", glyph: "●" },
  ];
  const typesIn = (sev) => new Set(findings.filter((f) => f.severity === sev).map((f) => f.type)).size;
  const total = typesIn("error") + typesIn("warn") + typesIn("info");

  out.push('<div class="summary"><span class="big2">' + n(total) + '</span>' +
    '<span class="txt"><b>way' + (total === 1 ? "" : "s") + ' to cut token usage</b><div class="sub">in priority order below</div></span>' +
    '<span class="pri">' + pleg("error", typesIn("error"), "fix now") + pleg("warn", typesIn("warn"), "worth fixing") + pleg("info", typesIn("info"), "lower impact") + '</span></div>');

  out.push('<div class="allbar"><button class="copybtn" type="button" data-prompt="' + esc(buildAllPrompt(findings)) +
    '">Copy all as a prompt</button><span class="ahint">hand the whole list to your coding agent to fix in one go</span></div>');

  // Sum a card's estimated saving (one type may span several instances) for ordering.
  const cardSaving = (items) => items.reduce((s, it) => s + (typeof it.est_savings_tokens === "number" ? it.est_savings_tokens : 0), 0);
  for (const grp of groups) {
    const list = findings.filter((f) => f.severity === grp.sev);
    if (!list.length) continue;
    // Collapse findings of the SAME type into ONE card (e.g. "9 skills can be
    // auto-run" instead of 9 identical cards), then order cards by saving.
    const byType = groupByType(list).sort((a, b) => cardSaving(b.items) - cardSaving(a.items));
    const color = grp.sev === "error" ? "hi" : grp.sev === "warn" ? "mid" : "lo";
    out.push('<div class="prigrp"><h2 style="color:var(--' + color + ')">' +
      esc(grp.title) + ' <span class="ct">' + byType.length + '</span></h2><p class="exp">' + esc(grp.exp) + '</p>' +
      byType.map((g) => (g.items.length === 1 ? itemHtml(g.items[0], grp) : groupItemHtml(g.type, g.items, grp))).join("") + '</div>');
  }
  root.innerHTML = out.join("");
}

// Group a finding list by type, preserving first-seen order.
function groupByType(list) {
  const order = [];
  const map = {};
  for (const f of list) {
    const t = f.type || "other";
    if (!map[t]) { map[t] = []; order.push(t); }
    map[t].push(f);
  }
  return order.map((t) => ({ type: t, items: map[t] }));
}

// De-duplicated, capped list of locations for a grouped card.
function whereList(items) {
  const seen = [];
  for (const f of items) {
    const w = f.file || f.where;
    if (w && seen.indexOf(w) === -1) seen.push(w);
  }
  return seen.slice(0, 8).map(esc).join(", ") + (seen.length > 8 ? " +" + (seen.length - 8) + " more" : "");
}

function groupItemHtml(type, items, grp) {
  const color = grp.sev === "error" ? "var(--hi)" : grp.sev === "warn" ? "var(--mid)" : "var(--lo)";
  const problem = PROBLEM[type] || humanize(type);
  const first = items[0];
  const fc = FIXCLASS_PLAIN[first.fix_class];
  const tag = fc ? '<span class="tag' + (fc.auto ? " auto" : "") + '"' + (fc.tip ? ' title="' + esc(fc.tip) + '"' : '') + '>' + esc(fc.t) + '</span>' : '';
  const auto = fc && fc.auto;
  const actions =
    '<div class="actions">' +
    '<button class="copybtn" type="button" data-prompt="' + esc(buildAllPrompt(items)) + '">Copy all ' + items.length + ' as a prompt</button>' +
    '<span class="ahint">paste into your coding agent to apply all ' + items.length + '</span>' +
    (auto ? '<span class="cmd">or run <code>ctx optimize --apply</code></span>' : '') +
    '</div>';
  // Estimated saving for a grouped card = the sum across its instances; grounded only
  // when EVERY instance is grounded (a mixed group reads as rough).
  let saved = 0;
  let savedGrounded = items.length > 0;
  for (const it of items) {
    if (typeof it.est_savings_tokens === "number") saved += it.est_savings_tokens;
    if (!it.est_savings_grounded) savedGrounded = false;
  }
  return '<div class="item"><div class="ititle"><span class="glyph" style="color:' + color + '">●</span>' +
    '<span class="pt">' + esc(problem) + '</span><span class="tag">×' + items.length + '</span>' + tag + '</div>' +
    '<div class="field"><span class="lab">Where</span><span class="val where">' + whereList(items) + '</span></div>' +
    (first.evidence ? '<div class="field"><span class="lab">Why</span><span class="val">' + esc(first.evidence) + (items.length > 1 ? ' (+ ' + (items.length - 1) + ' more like it)' : '') + '</span></div>' : '') +
    (first.recommendation ? '<div class="field"><span class="lab">Fix</span><span class="val fix">' + esc(first.recommendation) + '</span></div>' : '') +
    savesField(saved, savedGrounded) +
    actions +
    '</div>';
}

// The estimated-saving field — shown on EVERY card. The grounded flag marks a saving
// derived from a real figure (est.) vs a coarse per-type default (rough), so a
// ballpark is never mistaken for a measurement.
function savesField(tokens, grounded) {
  if (!tokens || tokens <= 0) return '<div class="field"><span class="lab">Saves</span><span class="val savesvar" title="Real, but not measurable from this finding — depends on how often it loads.">varies</span></div>';
  const label = grounded
    ? '<i title="Derived from a measured token/character count in this finding.">est.</i>'
    : '<i class="rough" title="A coarse per-type ballpark — no exact figure was available.">rough</i>';
  return '<div class="field"><span class="lab">Saves</span><span class="val saves">≈' + cmp(tokens) + ' tok / session ' + label + '</span></div>';
}

function itemHtml(f, grp) {
  const color = grp.sev === "error" ? "var(--hi)" : grp.sev === "warn" ? "var(--mid)" : "var(--lo)";
  const problem = PROBLEM[f.type] || humanize(f.type);
  const fc = FIXCLASS_PLAIN[f.fix_class];
  const tag = fc ? '<span class="tag' + (fc.auto ? " auto" : "") + '"' + (fc.tip ? ' title="' + esc(fc.tip) + '"' : '') + '>' + esc(fc.t) + '</span>' : '';
  const where = esc(whereOf(f));
  const auto = fc && fc.auto;
  const actions =
    '<div class="actions">' +
    '<button class="copybtn" type="button" data-prompt="' + esc(buildPrompt(f)) + '">Copy as prompt</button>' +
    '<span class="ahint">paste into your coding agent to apply this fix</span>' +
    (auto ? '<span class="cmd">or run <code>ctx optimize --apply</code></span>' : '') +
    '</div>';
  return '<div class="item"><div class="ititle"><span class="glyph" style="color:' + color + '">●</span>' +
    '<span class="pt">' + esc(problem) + '</span>' + tag + '</div>' +
    '<div class="field"><span class="lab">Where</span><span class="val where">' + where + '</span></div>' +
    (f.evidence ? '<div class="field"><span class="lab">Why</span><span class="val">' + esc(f.evidence) + '</span></div>' : '') +
    (f.recommendation ? '<div class="field"><span class="lab">Fix</span><span class="val fix">' + esc(f.recommendation) + '</span></div>' : '') +
    savesField(f.est_savings_tokens, f.est_savings_grounded) +
    actions +
    '</div>';
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
<title>${escapeHtml(doc.title)} — Contexa</title>
<style>${STYLE}</style>
</head>
<body>
<div class="wrap">
  <header class="pagehead">
    <p class="lbl">${escapeHtml(kicker)}</p>
    <h1>${escapeHtml(doc.title)} <span class="ctx">/ ctx</span></h1>
    <div class="sub">${escapeHtml(doc.subtitle)}</div>
    <div class="meta" id="meta"></div>
  </header>
  <main id="app"></main>
  <div class="foot">Generated by Contexa on ${escapeHtml(doc.generatedAt)}. This report was built on your machine; nothing was uploaded.</div>
</div>
<script>window.__CTX_REPORT__ = ${embed(doc)};</script>
<script>
(function () {
  var d = window.__CTX_REPORT__;
  var meta = document.getElementById("meta");
  // Escape every interpolated value before innerHTML. scope/since are enum/ISO today,
  // but the meta block must not be the one place an unescaped value could inject (L9).
  function esc(s){return String(s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  var bits = [];
  // Name the project for project-scoped reports ("Covers contexa"); fall back
  // to "this project" if the name is missing. User scope covers every project.
  var scopeLabel = d.data && d.data.scope === "user" ? "all your projects" : d.data && d.data.scope === "project" ? (d.data.project || "this project") : d.data && d.data.scope;
  if (scopeLabel) bits.push('<span>Covers <b>' + esc(scopeLabel) + '</b></span>');
  if (d.data && d.data.since) bits.push('<span>since <b>' + esc(d.data.since) + '</b></span>');
  bits.push('<span>as of ' + esc(new Date(d.generatedAt).toLocaleString()) + '</span>');
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
