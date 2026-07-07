# R1 task-bank draft for maintainer review

Status: draft, not final.

This file explains the handoff items in plain terms and proposes a first bank.
The machine-readable draft is `tools/measurement/task-bank-draft.jsonl`.

## What the handoff means

1. **Write `accept_cmd` from the real fix commit test delta.**
   The task prompt comes from real history, but the pass/fail check must be a
   maintainer-owned objective command. I inspected the fix commits read-only and
   drafted commands from their test deltas. For Q5 validity, you should review
   and edit/approve these before treating them as the final bank.

2. **Choose auth mode.**
   Recommendation: use `run-cell --config-mode isolated` with a token:
   `CLAUDE_CODE_OAUTH_TOKEN` from `claude setup-token`, or `ANTHROPIC_API_KEY`.
   This gives literal A7 because the real `~/.claude` is not written. Use
   `--config-mode real` only as a fallback; it is documented, but it is a
   deviation from literal A7.

3. **Run the 60-cell grid and analyze.**
   For each final task: run A/B arms, 3 reps each, in interleaved order. Then
   concatenate row files into `runs.jsonl` and run `analyze.ts`. The result is
   the four-condition R1 gate: guardrail, median uncached delta, 90% CI, and
   total-input guardrail. The verdict decides R2 go/no-go.

## Recommended draft selection

I recommend starting with these 7 tasks, not forcing 10. They are better than
padding with broad release sweeps or duplicate commits.

| task | source | verdict | why |
|---|---:|---|---|
| `tk-powershell-brace-block-rewrite` | #8 | include | Best fit: prompt names the exact bug and the fix has a focused existing test file. |
| `tk-jsonc-settings-parse` | #11 | include | Clear user-facing JSONC parsing issue; uses pre-existing modified tests. |
| `tk-gain-telemetry-regressions` | #12 | include | Compact dogfood regressions; cheap objective tests. |
| `tk-install-auto-wires-copilot` | #10 | include | Good install/hook symptom and one focused test file. |
| `tk-support-github-channel` | #4 | include with caution | Objective tests are good; prompt was broader than the eventual slice. |
| `atlas-cache-valkey-resilience` | #2 | include with caution | Strong tests, but prompt is workflow-shaped rather than a clean bug request. |
| `tk-pricing-ai-credits` | #9 | weak include | Test is clean, but prompt-to-fix provenance is noisy. Keep only if you accept the mined linkage. |

## Excluded or reserve candidates

| candidate | decision | reason |
|---:|---|---|
| #1 `915cf6a5` | reserve | Real feature with good tests, but large ctx memory event-log work; heavier than R1 needs. |
| #3 `16b24719` | exclude | Terraform/infra replacement and workflow-shaped prompt; likely too broad and environment-sensitive. |
| #5 `bc85dd6d` | exclude | Miner marked it strong, but commit has no test files in the diff. |
| #6 `ab651c5c` | exclude | Large release/docs/runtime sweep; too many unrelated deltas for a clean task. |
| #7 `2c29337f` | duplicate | Same fix commit as #8; do not count both as independent tasks. |

## Review checklist before finalizing

- Confirm each `prompt` still fairly represents the task you want the agent to do.
- Confirm each `accept_cmd` is neither too broad nor too narrow.
- Prefer commands that run pre-existing modified test files. Avoid relying on
  newly added test files unless you deliberately want the agent to recreate tests.
- Decide whether 7 tasks is acceptable for R1. If you want 8, add candidate #1
  as a reserve; I would not force #3/#5/#6 into the bank.
