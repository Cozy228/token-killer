# Token Killer — Windows tester guide

Thanks for helping test **tk**. It's a small CLI that sits in front of your dev commands,
runs the real tool, and compresses the output so your coding agent (GitHub Copilot) spends
far fewer tokens reading it. You keep working normally — tk just shrinks what the agent has
to read.

Target for this round: **Windows 11 + VS Code + GitHub Copilot (Business)**.

There are two things we'd love from you, and they share one setup:

1. **A decisive 10-minute test** — does Copilot actually route through tk? → **Part 1**
2. **A real session + gut feel** — live with it for a bit, tell us how it feels. → **Part 2**

---

## Setup (once)

### Install — pick the path that matches how you got the code

**Option A — from source** (company Windows PC with Node 20+ and git)

The Windows fixes live on the **`token-killer-node-cli`** branch — *not* `main` — so a source
clone must check that branch out (and that branch must be pushed/current on the remote first).

```powershell
# 1. Clone and switch to the branch with the Windows fixes (NOT main)
git clone https://github.com/Cozy228/token-killer.git token-killer
cd token-killer
git checkout token-killer-node-cli

# 2. Install deps + build
corepack enable              # enables pnpm (ships with Node 20+); skip if pnpm already present
pnpm install
pnpm build                   # produces dist\cli.js
node dist\cli.js --version   # expect 0.1.0

# 3. Expose `tk` globally (from the repo dir)
npm link                     # creates the global `tk` command -> this repo's dist
tk --version                 # expect 0.1.0
```

If corporate policy blocks a step:
- `corepack enable` blocked → use `npm install` + `npm run build` instead.
- `npm link` blocked (permissions) → skip it and use `node dist\cli.js` everywhere `tk`
  appears below (e.g. `node dist\cli.js init --host vscode`).
- Behind a proxy → set it once before installing: `npm config set proxy http://host:port`
  (and `npm config set https-proxy http://host:port`).

**Option B — from the prebuilt tarball** (no build, no git)

You'll get a file named `token-killer-0.1.0.tgz`. In PowerShell:

```powershell
npm i -g .\token-killer-0.1.0.tgz
tk --version                 # expect 0.1.0
```

It's self-contained (zero dependencies) — nothing else to install.

### Wire VS Code (both paths)

```powershell
tk install --host vscode        # patches VS Code settings.json: shim dir -> integrated-terminal PATH
tk status               # expect: host = vscode, shim on PATH, probe = PASS
```

Then **fully quit and reopen VS Code** (File → Exit — not just reload; the integrated terminal
must pick up the new PATH).

> `tk install` only ever wraps tools you actually have installed. On a fresh box it will print
> something like `skipped N not on PATH: cat, ls, …` — that's expected and correct: tk never
> replaces a command you don't have. `git`, `rg`, `npm`, etc. are the ones it compresses.

Optional baseline so you can see the delta later:
```powershell
tk gain                      # note the current total (may be empty)
```

---

## Part 1 — the decisive test: does Copilot route through tk? (~10 min)

**The one thing this proves:** that GitHub Copilot's agent, running a command in VS Code,
actually passes through tk so the output gets compressed. SSH can't show this (VS Code is a
GUI), so it needs you at the keyboard once.

### 1. Open a repo + Copilot agent mode

1. In VS Code, open a folder that is a git repo with history (≥20 commits — the `token-killer`
   repo works fine as the target).
2. Open Copilot Chat (chat icon / `Ctrl+Alt+I`).
3. Switch the chat mode to **Agent** (the dropdown at the top of the chat — must be Agent, not
   Ask/Edit, so it actually runs terminal commands).

### 2. Give it a prompt that runs a verbose command

Paste one of these (they reliably make Copilot run a real command in the terminal):

> **Summarize what changed in the last 20 commits of this repo.**

(That triggers `git log`. Alternatives: *"show me the current git status and the staged
diff"* → `git status` + `git diff`; *"find every TODO comment in the codebase"* → `rg`/`grep`.)

Let Copilot run the command in the integrated terminal. Approve the run if it asks.

### 3. The decisive check

Back in VS Code's terminal:

```powershell
tk gain --history
```

- **✅ PASS** — the command Copilot just ran appears as a row with a savings % (e.g.
  `git log … 82%`). tk is intercepting. Note whether `tk status` said the active tier is
  **hook** or **shim**.
- **❌ DID NOT ENGAGE** — nothing new in the history. Copilot ran the command outside the
  integrated terminal's environment, so it never reached tk. **This is a key finding, not a
  failure on your part** — it tells us the shim/PATH path doesn't cover Copilot's execution,
  and we pivot to the hook tier.

### 4. Quick breakage sanity

In the VS Code terminal, confirm these still behave normally (tk leaves them to PowerShell):

```powershell
cat package.json | Select-Object -First 3
ls
```

If anything errors, capture the exact command.

---

## Part 2 — use it for a real session

Now just use Copilot normally, in **agent mode**, as you always would. When it runs commands
like `git log`, `git diff`, `git status`, `rg`, `npm test`, tk quietly compresses their output
behind the scenes. You don't change anything about how you work.

See what it saved:

```powershell
tk gain               # totals: how many tokens tk has saved you
tk gain --history     # recent commands + per-command savings
```

A `0%` row is healthy when the input was already tiny — only a big *uncompressed* output is
worth a second look.

tk is built to **fail safe**: if it ever errors, the real command still runs — your workflow
should never break. If something looks off:

```powershell
tk status        # is it still wired?
$env:TK_DEBUG=1       # then re-run the command to see tk's decision trace on stderr
```

If a command seems broken, **note the exact command** and move on — don't fight it. That's
exactly the kind of feedback we want.

---

## Send back

Copy this filled in (a screenshot of `tk gain --history` and `tk gain` is perfect):

```
— Setup —
- tk status:   host = ____   tier = hook / shim   probe = PASS / FAIL

— Part 1: did Copilot route through tk? —
- Command appeared in `tk gain --history`?      YES / NO
- If yes: which command + savings %:            __________
- Anything break (cat / ls / …)? what exactly:  __________

— Part 2: living with it —
- After a real session, what does `tk gain` show?         __________
- Anything confusing in install / tk install / its output?   __________
- Gut feel — would you keep it on?                        __________
```

Send to **cozy228@outlook.com**. Thank you 🙏

## Uninstall (any time)

```powershell
tk uninstall
npm rm -g token-killer
```
