# Token Killer — Windows tester guide

Thanks for helping test **tk**. It's a small CLI that sits in front of your dev commands,
runs the real tool, and compresses the output so your coding agent (GitHub Copilot) spends
far fewer tokens reading it. You keep working normally — tk just shrinks what the agent has
to read.

Target for this round: **Windows 11 + VS Code + GitHub Copilot (Business)**.

---

## 1. Install (2 minutes, no build, no git)

You'll get a file named `token-killer-0.1.0.tgz`. In PowerShell:

```powershell
npm i -g .\token-killer-0.1.0.tgz
tk --version          # should print 0.1.0
```

It's self-contained (zero dependencies) — nothing else to install.

## 2. Turn it on for VS Code

```powershell
tk init --host vscode
```

This wires tk into VS Code's integrated terminal. Then **fully restart VS Code** (not just
reload). Confirm it's wired:

```powershell
tk init --show        # host: vscode, shim on PATH, probe: PASS
```

> `tk init` only ever wraps tools you actually have installed. On a fresh box it will print
> something like `skipped N not on PATH: cat, ls, …` — that's expected and correct: tk never
> replaces a command you don't have. `git`, `rg`, `npm`, etc. are the ones it compresses.

## 3. Just use Copilot normally

Open a repo, use Copilot Chat in **agent mode** as you always would. When Copilot runs
commands like `git log`, `git diff`, `git status`, `rg`, `npm test` — tk quietly compresses
their output behind the scenes. You don't change anything about how you work.

## 4. See what it saved

```powershell
tk gain               # totals: how many tokens tk has saved you
tk gain --history     # recent commands + per-command savings
```

A `0%` row is healthy when the input was already tiny — only a big *uncompressed* output is
worth a second look.

## 5. If something looks off

tk is built to **fail safe**: if it ever errors, the real command still runs — your workflow
should never break. If you do hit something weird:

```powershell
tk init --show        # is it still wired?
$env:TK_DEBUG=1       # then re-run the command to see tk's decision trace on stderr
```

If a command seems broken, **note the exact command** and move on — don't fight it. That's
exactly the kind of feedback we want.

## 6. Feedback we need (this is the important part)

Please answer these — even one line each is gold:

1. **Did it engage?** After using Copilot for a bit, does `tk gain --history` show your
   commands with savings? (If it's empty, tk isn't intercepting — that's a critical finding,
   not a failure on your part.)
2. **Savings:** what does `tk gain` show after a real session? Screenshot is perfect.
3. **Breakage:** did any command visibly break or behave oddly? Which one, exactly?
4. **Friction:** anything confusing in install / `tk init` / the output it produced?
5. **Worth it?** Gut feel — would you keep it on?

To uninstall completely at any time:

```powershell
tk init --uninstall
npm rm -g token-killer
```

Send findings back to **cozy228@outlook.com**. Thank you 🙏
