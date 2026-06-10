#!/usr/bin/env python3
"""
A-spike: validate "saved tokens vs whole-session tokens" against REAL data.

NOT production. Throwaway probe to expose the denominator (口径) problem before
we commit to a `tk gain --session` design.

Inputs (read-only):
  - tk ledger:   ~/.token-killer/projects/<repo:hash>/history.jsonl  (saved_tokens, ts)
  - CC sessions: ~/.claude/projects/<slug>/*.jsonl                   (message.usage, ts)

The honest question: of everything the agent spent AFTER tk was onboarded,
what fraction did tk save? The catch is what "everything" means once prompt
caching re-reads the same context every turn. We print several denominators
side by side so the choice is explicit, not accidental.
"""
import json, os, sys, glob
from datetime import datetime

HOME = os.path.expanduser("~")
REPO_HASH = sys.argv[1] if len(sys.argv) > 1 else "repo:a47085322e05"
CC_SLUG   = sys.argv[2] if len(sys.argv) > 2 else "-Users-ziyu-Workspace-token-killer"

TK_HISTORY = f"{HOME}/.token-killer/projects/{REPO_HASH}/history.jsonl"
CC_GLOB    = f"{HOME}/.claude/projects/{CC_SLUG}/*.jsonl"

# Anthropic prompt-cache price multipliers (relative to base input price).
CACHE_WRITE_MULT = 1.25   # cache_creation costs 1.25x
CACHE_READ_MULT  = 0.10   # cache_read costs 0.10x

def parse_ts(s):
    if not s: return None
    try: return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except Exception: return None

# ---- 1. tk ledger: total saved tokens + onboarding cutoff -------------------
saved = raw = outp = n_cmd = 0
tk_min = tk_max = None
with open(TK_HISTORY) as fh:
    for line in fh:
        line = line.strip()
        if not line: continue
        try: r = json.loads(line)
        except Exception: continue
        saved += r.get("saved_tokens", 0) or 0
        raw   += r.get("raw_tokens", 0) or 0
        outp  += r.get("output_tokens", 0) or 0
        n_cmd += 1
        ts = parse_ts(r.get("timestamp"))
        if ts:
            tk_min = ts if tk_min is None or ts < tk_min else tk_min
            tk_max = ts if tk_max is None or ts > tk_max else tk_max

cutoff = tk_min  # "接入 tk 之后" = first observed tk command for this repo

# ---- 2. CC sessions: sum real usage AFTER the cutoff ------------------------
seen = set()
in_t = cc_t = cr_t = out_t = 0      # input / cache_creation / cache_read / output
turns = 0
side_in = side_cc = 0               # sidechain (subagent) share of footprint
per_session = {}                   # sessionId -> footprint, for attribution demo

for path in glob.glob(CC_GLOB):
    with open(path) as fh:
        for line in fh:
            try: o = json.loads(line)
            except Exception: continue
            if o.get("type") != "assistant": continue
            uid = o.get("uuid")
            if uid in seen: continue          # dedup resumed/duplicated lines
            seen.add(uid)
            ts = parse_ts(o.get("timestamp"))
            if cutoff and ts and ts < cutoff: continue
            u = (o.get("message") or {}).get("usage") or {}
            it = u.get("input_tokens", 0) or 0
            cc = u.get("cache_creation_input_tokens", 0) or 0
            cr = u.get("cache_read_input_tokens", 0) or 0
            ot = u.get("output_tokens", 0) or 0
            in_t += it; cc_t += cc; cr_t += cr; out_t += ot
            turns += 1
            if o.get("isSidechain"):
                side_in += it; side_cc += cc
            sid = o.get("sessionId", "?")
            per_session[sid] = per_session.get(sid, 0) + it + cc

# ---- 3. denominators & rates ------------------------------------------------
footprint = in_t + cc_t                                   # each token counted ~once at entry
naive_all = in_t + cc_t + cr_t                            # inflated by cache re-reads
billed    = in_t + cc_t * CACHE_WRITE_MULT + cr_t * CACHE_READ_MULT + out_t

def rate(num, den): return (100.0 * num / den) if den else 0.0

print("=" * 68)
print("A-SPIKE: session-level savings on REAL data (throwaway)")
print("=" * 68)
print(f"repo hash      : {REPO_HASH}")
print(f"cc slug        : {CC_SLUG}")
print(f"tk cutoff (接入): {cutoff}")
print(f"tk window      : {tk_min} .. {tk_max}")
print()
print(f"tk ledger      : {n_cmd} cmds | raw={raw:,}  out={outp:,}  saved={saved:,} tok")
print(f"cc usage(>cut) : {turns} turns across {len(per_session)} sessions")
print(f"  input_tokens          = {in_t:,}")
print(f"  cache_creation_tokens = {cc_t:,}")
print(f"  cache_read_tokens     = {cr_t:,}   <- re-reads, double-counts content")
print(f"  output_tokens         = {out_t:,}")
print(f"  (sidechain share of footprint: {side_in+side_cc:,})")
print()
print("Denominator choices (saved is one-time; pick a same-口径 denominator):")
print("-" * 68)
print(f"  [A] footprint  in+cc            = {footprint:,}")
print(f"      honest rate saved/(fp+saved)= {rate(saved, footprint+saved):.2f}%   <- recommend")
print()
print(f"  [B] billed     in+1.25cc+0.1cr+o= {billed:,.0f}")
print(f"      rate saved/(billed+saved)   = {rate(saved, billed+saved):.2f}%")
print()
print(f"  [C] naive-all  in+cc+cr         = {naive_all:,}   (WRONG: cache-inflated)")
print(f"      rate saved/naive_all        = {rate(saved, naive_all):.2f}%   <- flattering-low / unstable")
print("-" * 68)
print()
print("Per-session footprint (why history.jsonl needs session_id for real attribution):")
for sid, fp in sorted(per_session.items(), key=lambda x: -x[1])[:8]:
    print(f"  {sid[:8]}  footprint={fp:,}")
print()
print("Note: correlation here is TIME-WINDOW only (tk history has no session_id).")
print("      Adding session_id+host to history.jsonl => exact per-session join.")
