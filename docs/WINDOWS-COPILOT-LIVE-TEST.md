# Live test — does Copilot route through tk? (VS Code, Windows)

**The one thing this proves:** that GitHub Copilot's agent, running a command in VS Code,
actually passes through tk so the output gets compressed. SSH can't show this (VS Code is a
GUI), so it needs you at the keyboard once. ~10 minutes.

**You need:** a Windows machine with VS Code + GitHub Copilot (Business), and a git repo with
some history (≥20 commits) — the `token-killer` repo you clone in Step 0 has 160+ commits and
works fine as the target.

**The decisive signal:** after Copilot runs a command, `tk gain --history` either shows that
command with a savings % (**tk engaged** ✅) or shows nothing new (**tk did NOT engage** ❌).
Both outcomes are useful — ❌ is a finding, not a failure on your part.

---

## Step 0 — setup (PowerShell)

Pick the path that matches how you got the code. **The Windows fixes live on the
`token-killer-node-cli` branch — not `main` — so a source clone MUST check that branch out,
and that branch must be pushed/current on the remote first.**

### Option A — from source (company Windows PC)

Prereqs: Node 20+ (`node --version`), git, and a package manager (pnpm via corepack, or npm).

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
- `corepack enable` blocked → use `npm install` + `npm run build` instead (npm works too).
- `npm link` blocked (permissions) → skip it and use `node dist\cli.js` everywhere `tk`
  appears below (e.g. `node dist\cli.js init --host vscode`).
- Behind a proxy → set it once before installing: `npm config set proxy http://host:port`
  (and `npm config set https-proxy http://host:port`).

### Option B — from the prebuilt tarball (other testers, no build)

```powershell
npm i -g .\token-killer-0.1.0.tgz
tk --version                 # expect 0.1.0
```

### Then (both paths) — wire VS Code

```powershell
tk init --host vscode        # patches VS Code settings.json: shim dir -> integrated-terminal PATH
tk init --show               # expect: shim installed, probe PASS
```

Then **fully quit and reopen VS Code** (File → Exit, not just reload — the integrated terminal
must pick up the new PATH). Optional baseline so you can see the delta afterward:
```powershell
tk gain                      # note the current total (may be empty)
```

## Step 1 — open a repo and Copilot agent mode

1. In VS Code, open a folder that is a git repo with history (e.g. the `token-killer` repo you
   just cloned, or any real repo).
2. Open Copilot Chat (the chat icon / `Ctrl+Alt+I`).
3. Switch the chat mode to **Agent** (the dropdown at the top of the chat — must be Agent,
   not Ask/Edit, so it actually runs terminal commands).

## Step 2 — give it a prompt that runs a verbose command

Paste one of these (they reliably make Copilot run a real command in the terminal):

> **Summarize what changed in the last 20 commits of this repo.**

(That triggers `git log`. Alternatives: *"show me the current git status and the staged
diff"* → `git status` + `git diff`; *"find every TODO comment in the codebase"* → `rg`/`grep`.)

Let Copilot run the command in the integrated terminal. Approve the run if it asks.

## Step 3 — the decisive check

Back in a terminal (or VS Code's terminal):

```powershell
tk gain --history
```

- **✅ PASS** — the command Copilot just ran appears as a row with a savings % (e.g.
  `git log … 82%`). tk is intercepting. Note whether `tk init --show` said the active tier is
  **hook** or **shim**.
- **❌ DID NOT ENGAGE** — nothing new in the history. Copilot ran the command outside the
  integrated terminal's environment, so it never reached tk. **This is the key finding** — it
  tells us the shim/PATH path doesn't cover Copilot's execution, and we pivot to the hook tier.

## Step 4 — quick breakage sanity

In the VS Code terminal, confirm the D2 class is fine (these should just work via PowerShell):

```powershell
cat package.json | Select-Object -First 3
ls
```

They should behave normally (tk leaves them alone now). If anything errors, capture it.

---

## Send back

Copy this filled in (a screenshot of `tk gain --history` is perfect):

```
- tk init --show output:        host = ____   tier = hook / shim   probe = PASS / FAIL
- Did the command appear in `tk gain --history`?   YES / NO
- If yes: which command + savings %:               __________
- Anything break (cat/ls/…)? what exactly:         __________
- Gut feel — would you keep it on?                 __________
```

Send to **cozy228@outlook.com**.
