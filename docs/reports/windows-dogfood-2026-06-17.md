# tk Real-Machine Acceptance Report
**102 pass · 1 fail · 1 warn · 2 skip · 7 info**
*Self-sufficient report: every FAIL/WARN below carries a dossier (exact repro + exit + stderr + stdout) so it can be diagnosed and fixed without the machine. No coverage switches — every phase ran.*
## Environment
| Key | Value |
|---|---|
| date | 2026-01-17 16:58:56 |
| tk invocation | node C:\Users\user\OSS\token-killer\dist\cli.js |
| tk version | 0.2.0 |
| OS | Windows |
| OS detail | Microsoft Windows 10.0.26100 |
| PowerShell | 7.6.1 |
| Node | v22.22.1 |
| compile-cache tier | enableCompileCache() API (Node >=22.8) |
| code page / enc | 437 |
| antivirus | Defender(Not running), Windows Defender, CrowdStrike Falcon Sensor, CrowdStrike |
| git | yes |
| ripgrep (rg) | absent |
| tree | yes |
| pnpm | yes |
| copilot | yes |
| target repo | C:\Users\user\OSS\token-killer |
| prior install host | vscode |
## Acceptance scope (mutations + restores)
 * config restored from snapshot
 * config restored after telemetry round-trip
 * support bundle removed: C:\Users\user\OSS\token-killer\reports\support-2026-06-17T09-16-58-972Z.md
 * support bundle removed: C:\Users\user\OSS\token-killer\reports\support-2026-06-17T09-17-01-175Z.md
 * support bundle removed: C:\Users\user\OSS\token-killer\reports\support-2026-06-17T09-17-03-989Z.md
 * optimize --backup snapshot removed: C:\Users\user\OSS\token-killer\backups\context\2026-06-17T09-17-07-689Z
 * optimize --apply confined to temp repo (discarded)
 * VS Code settings restored
 * claude-code settings removed (none existed before)
 * prior install host 'vscode' restored
## Summary by phase
| Phase | pass | fail | warn | skip | info |
|---|---|---|---|---|---|
| func | 33 | 1 | 0 | 0 | 1 |
| hook | 10 | 0 | 0 | 0 | 0 |
| compress | 15 | 0 | 0 | 1 | 0 |
| boundary | 12 | 0 | 0 | 1 | 1 |
| failsafe | 2 | 0 | 0 | 0 | 0 |
| perf | 0 | 0 | 0 | 0 | 3 |
| shim | 3 | 0 | 0 | 0 | 1 |
| roundtrip | 13 | 0 | 0 | 0 | 0 |
| lifecycle | 14 | 0 | 0 | 0 | 0 |
| tier0 | 0 | 0 | 1 | 0 | 1 |
## Findings (fail / warn)
 * FAIL [func] inspect (scope+advice+surface+write-advice, one run) [D01] — exit=0
 * WARN [tier0] Copilot CLI routing [D02] — no new gain row — hook may not have fired (auth/proxy?)
## Failure dossiers (full payloads — diagnose without the machine)
### D01 · FAIL [func] inspect (scope+advice+surface+write-advice, one run)
 * repro: node C:\Users\user\OSS\token-killer\dist\cli.js inspect --project --user --since 7d --advice --min-confidence 0.5 --min-occurrences 2 --surface instructions --write-advice --text
 * exit: 0 · ms: 278,518 · timedOut: False
 * detail: exit=0
stderr:
```text
Discovering sources (vscode + copilot-cli)...
  vscode      ~\AppData\Roaming\Code\User - 61 transcript(s), 449 session(s)
  copilot-cli ~\.copilot - 0 transcript(s), 0 session(s)
Scanning 61 transcript(s) + 449 session(s)...

  1/510 transcripts · 0 events
  2/510 transcripts · 0 events
  3/510 transcripts · 0 events
  4/510 transcripts · 0 events
  5/510 transcripts · 0 events
  6/510 transcripts · 0 events
  7/510 transcripts · 0 events
  8/510 transcripts · 0 events
  9/510 transcripts · 0 events
 10/510 transcripts · 0 events
 11/510 transcripts · 0 events
 12/510 transcripts · 190 events
 13/510 transcripts · 190 events
 14/510 transcripts · 190 events
 15/510 transcripts · 190 events
 16/510 transcripts · 190 events
 17/510 transcripts · 190 events
 18/510 transcripts · 190 events
 19/510 transcripts · 190 events
 20/510 transcripts · 190 events
 21/510 transcripts · 190 events
 22/510 transcripts · 190 events
 23/510 transcripts · 190 events
 24/510 transcripts · 190 events
 25/510 transcripts · 190 events
 26/510 transcripts · 190 events
 27/510 transcripts · 190 events
 28/510 transcripts · 190 events
 29/510 transcripts · 190 events
 30/510 transcripts · 190 events
 31/510 transcripts · 190 events
...
 68/510 sessions · 663 events
 68/510 sessions · 663 events
 69/510 sessions · 663 ev
 _(+69490 more chars truncated)

```
stdout (head):
```text
Wrote advice artifacts:
  C:\Users\user\.token-killer\advice\inspect-report.md
  C:\Users\user\.token-killer\advice\inspect-report.json
  C:\Users\user\.token-killer\advice\advice.md

```
### D02 · WARN [tier0] Copilot CLI routing
 * repro: C:\WINDOWS\system32\cmd.exe /c copilot -p "run a single command: git status"
 * exit: 1 · ms: 25,720 · timedOut: False
 * detail: no new gain row — hook may not have fired (auth/proxy?)
stderr:
```text
Your organization or enterprise has exceeded its Copilot budget. Contact your admin to resume usage. (Request ID: BCBD:1AE596:1E8F9E:203B420:6A3266F4)

Changes     +0 -0
AI Credits 0 (17s)

```
stdout (head):
```text
(empty)

```
## Detailed results
| Phase | Status | Case | Detail | ms |
|---|---|---|---|---|
| func | PASS | tk --version | 0.2.0 | 772 |
| func | PASS | tk --help |  | 882 |
| func | PASS | tk status |  | 5,966 |
| func | PASS | tk config show |  | 850 |
| func | PASS | tk config path | C:\Users\user.token-killer\config.jsonc | 814 |
| func | PASS | tk telemetry status |  | 884 |
| func | PASS | tk telemetry preview |  | 823 |
| func | PASS | gain --text |  | 750 |
| func | PASS | gain --json |  | 732 |
| func | PASS | gain --csv |  | 841 |
| func | PASS | gain --history |  | 985 |
| func | PASS | gain --daily |  | 1,490 |
| func | PASS | gain --weekly |  | 1,374 |
| func | PASS | gain --monthly |  | 1,468 |
| func | PASS | gain --all --graph |  | 1,524 |
| func | PASS | gain --failures |  | 1,487 |
| func | PASS | gain --quota |  | 1,549 |
| func | PASS | gain --user (cross-project aggregate) |  | 1,392 |
| func | PASS | gain HTML names the project (not 'this project') | Covers token-killer | 1,184 |
| func | PASS | inspect --project HTML names the project | Covers token-killer | 241,157 |
| func | PASS | inspect --json |  | 227,693 |
| func | FAIL | inspect (scope+advice+surface+write-advice, one run) | exit=0 | 278,518 |
| func | PASS | inspect --write-advice writes artifacts | 3 file(s) | 278,518 |
| func | PASS | inspect --input-type copilot-cli --session |  | 1,102 |
| func | INFO | inspect --fail-on error | exit=0 (nonzero = findings reached threshold, by design) | 190,034 |
| func | PASS | optimize context --project (preview) |  | 1,602 |
| func | PASS | optimize context --user (preview) |  | 791 |
| func | PASS | optimize --surface instructions (preview) |  | 1,014 |
| func | PASS | tk debug (writes bundle) |  | 1,797 |
| func | PASS | tk debug scrubs home path |  |  |
| func | PASS | tk debug --full (writes bundle) |  | 1,675 |
| func | PASS | tk debug --full scrubs home path |  |  |
| func | PASS | tk debug --redact (writes bundle) |  | 1,894 |
| func | PASS | tk debug --redact scrubs home path |  |  |
| func | PASS | tk debug --out honors custom path | C:\Users\user\AppData\Local\Temp\tk-accept-20260617-165847\debug-custom-out.md | 1,612 |
| hook | PASS | hook check git status | rewrite: tk git status | 690 |
| hook | PASS | hook check git commit | pass: git commit -m x | 663 |
| hook | PASS | hook check git add . | pass: git add . | 677 |
| hook | PASS | hook check rg foo . | pass: rg foo . | 667 |
| hook | PASS | hook check read CONTEXT.md | pass: read CONTEXT.md | 673 |
| hook | PASS | copilot rewrite -> modifiedArgs | {"permissionDecision":"allow","permissionDecisionReason":"tk auto-rewrite","modifiedArgs":{"command":"tk git status"}} | 721 |
| hook | PASS | copilot deny node_modules |  | 685 |
| hook | PASS | copilot fail-open bad json (empty=allow) |  | 665 |
| hook | PASS | claude rewrite -> updatedInput |  | 688 |
| hook | PASS | claude fail-open bad json |  | 706 |
| compress | PASS | git log -p -20 | raw=267196 saved=96.4% (>=60%) | 1,539 |
| compress | PASS | git log -30 | raw=1644 saved=26.8% (>=20%) | 1,223 |
| compress | SKIP | rg import src | rg absent |  |
| compress | PASS | git status | Raw: 882 tokens Output: 643 tokens Saved: 239 tokens (27.1%) | 1,727 |
| compress | PASS | git branch | Raw: 8 tokens Output: 2 tokens Saved: 6 tokens (75%) | 1,212 |
| compress | PASS | git show -1 --stat | Raw: 472 tokens Output: 472 tokens Saved: 0 tokens (0%) | 1,329 |
| compress | PASS | git diff | Raw: 0 tokens Output: 0 tokens Saved: 0 tokens (0%) | 1,348 |
| compress | PASS | tree src | Raw: 68 tokens Output: 88 tokens Saved: 0 tokens (0%) | 1,141 |
| compress | PASS | pnpm --version | (passthrough) | 2,324 |
| compress | PASS | npx --version | (passthrough) | 2,683 |
| compress | PASS | --raw passthrough (no banner) |  | 1,111 |
| compress | PASS | --max-chars 200 caps body | stdout=257 chars | 1,203 |
| compress | PASS | --max-lines 5 caps body | stdout=2 lines | 1,302 |
| compress | PASS | --save-raw discloses raw path |  | 1,305 |
| compress | PASS | --no-save-raw suppresses raw artifact |  | 1,566 |
| compress | PASS | TK_NO_HISTORY=1 skips gain row | rows 2 -> 2 |  |
| boundary | PASS | non-git dir -> clear error |  | 2,321 |
| boundary | PASS | empty repo: git status |  | 2,182 |
| boundary | INFO | empty repo: git log | exit=128 (no commits) | 1,466 |
| boundary | PASS | untracked dir collapses to dir/ |  | 1,747 |
| boundary | PASS | -uall expands dir (passthrough) |  | 1,473 |
| boundary | SKIP | unicode content (rg) | rg absent |  |
| boundary | PASS | unicode content survives (read) |  | 800 |
| boundary | PASS | huge file read --max-lines 200 capped | out~201 lines | 806 |
| boundary | PASS | failing cmd preserves nonzero exit | exit=1 | 1,088 |
| boundary | PASS | unknown binary bounded (no fork-bomb) | exit=1 | 670 |
| boundary | PASS | path with spaces |  | 1,717 |
| boundary | PASS | uninstall --help prints usage (no teardown) |  | 721 |
| boundary | PASS | uninstall refuses unknown flag (fail closed) | exit=1 | 692 |
| boundary | PASS | GBK/cp936 child output decoded (legacy fallback) |  | 1,546 |
| failsafe | PASS | TK_DEBUG=1 traces to stderr |  | 1,748 |
| failsafe | PASS | corrupt config -> real cmd still runs |  | 1,813 |
| perf | INFO | tk --version startup | cold=676ms p50=672 p95=720 | 672 |
| perf | INFO | tk git status vs raw | tk p50=1,749ms raw p50=602ms overhead=1,148ms (tk spawns 2x: porcelain+human) | 1,749 |
| perf | INFO | git log -p -100 compress | 2,153ms saved=98.3% | 2,153 |
| shim | INFO | tk shim status | token-killer shim status | 1,368 |
| shim | PASS | tk shim install --dry-run (no mutation) |  | 1,094 |
| shim | PASS | tk shim uninstall --dry-run (no mutation) |  | 657 |
| shim | PASS | where git resolves through shim (PATH prepend) | C:\Users\user.token-killer\shim\git.cmd |  |
|  |  | C:\Users\user\PortableGit\bin\git.exe |  |  |
|  |  | C:\Users\user\AppData\Local\Programs\Git\cmd\git.exe |  |  |
| roundtrip | PASS | config init writes template |  | 657 |
| roundtrip | PASS | config init idempotent (already exists) |  | 644 |
| roundtrip | PASS | telemetry enable |  | 725 |
| roundtrip | PASS | telemetry status reflects enabled |  | 716 |
| roundtrip | PASS | telemetry disable |  | 651 |
| roundtrip | PASS | telemetry status reflects disabled |  | 647 |
| roundtrip | PASS | support email saves bundle, opens no GUI |  | 2,120 |
| roundtrip | PASS | support email --redact runs |  | 2,168 |
| roundtrip | PASS | support email --no-attach (bare draft, no bundle) | no bundle saved (bare draft, by design) | 697 |
| roundtrip | PASS | support teams saves bundle (routing unset) |  | 2,085 |
| roundtrip | PASS | optimize --backup snapshots files |  | 807 |
| roundtrip | PASS | optimize --apply (temp repo, backs up) |  | 176,169 |
| roundtrip | PASS | optimize --restore reverts |  | 1,048 |
| lifecycle | PASS | install --host vscode | Active tier: shim (primary) + hook (additive) | 6,113 |
| lifecycle | PASS | status after install |  | 6,353 |
| lifecycle | PASS | install idempotent (2nd run) |  | 2,947 |
| lifecycle | PASS | shim git.cmd written |  |  |
| lifecycle | PASS | VS Code settings patched (TK_SHIM_DIR) |  |  |
| lifecycle | PASS | install --host copilot-cli |  | 4,215 |
| lifecycle | PASS | install --host claude-code |  | 860 |
| lifecycle | PASS | install --project |  | 3,112 |
| lifecycle | PASS | uninstall --project |  | 714 |
| lifecycle | PASS | uninstall --purge-data (dry-run plan) |  | 1,295 |
| lifecycle | PASS | uninstall --dry-run |  | 1,320 |
| lifecycle | PASS | uninstall |  | 810 |
| lifecycle | PASS | shim removed after uninstall |  |  |
| lifecycle | PASS | restore prior install (vscode) |  | 3,926 |
| tier0 | WARN | Copilot CLI routing | no new gain row — hook may not have fired (auth/proxy?) | 25,720 |
| tier0 | INFO | VS Code + Copilot agent (MANUAL) | baseline gain rows=2 — see report for steps |  |
