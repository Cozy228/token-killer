# LLM delegation is host-borrowed; no api_key path, no BYO-key escape hatch

The codemap intelligence layer (需求 B) needs a model to generate the optional narrative
fields (summary / tags / tours / Domain promotion). We delegate that generation to a model
tk does **not** own and **never** pays for: the host agent's model via slash-command is the
primary path; on the secondary headless target the in-session host model is reused when a
session is live, and only in true headless mode does tk shell out to a logged-in local
subscription CLI (`claude` / `codex`, the codewiki caw pattern, presence-gated). tk never
constructs an LLM client with an `api_key`, and the "let power users bring their own key"
escape hatch is **explicitly rejected** — not even opt-in / default-off.

## Why

An api_key path is exactly the `OpenAI(base_url, api_key)` shape pinned as the anti-pattern
in `repodoc/src/llm.py:43`. Shipping it — even gated — forces tk to store or transmit a
credential (violating the no-credential principle, M23 cleartext-credential blacklist, and
A4.11's "tk holds no egress, embeds no credentials"), and it breaks the CI invariant that
keeps the find-code path provably static-only: `grep -E 'openai|AsyncOpenAI|api_key|faiss|embedding'`
over the repo must return 0 hits. Borrowing the host's already-authenticated model costs tk
zero tokens and zero credentials, which is the whole point.

## Considered Options

- **BYO-key opt-in (default-off, documented warning)** — rejected. Re-introduces the
  anti-pattern code path and credential-handling surface for marginal convenience to the
  narrow population that has neither a host session nor a logged-in subscription CLI. When
  there is no model to borrow, tk ships static-only (B-D7), which is an honest degrade.

## Detail (not separately ADR-worthy)

- **Secondary-target default provider**: reuse the in-session host model when both it and a
  logged-in CLI are available — saves a process and an inter-process JSON round-trip; the caw
  subprocess is for true headless only (no host session to borrow).
- **leaf token / max-depth**: reuse codewiki's `16_000` token leaf threshold + `depth-2` as a
  shippable initial value for tk's own repo; recalibrate after the Slice-1 measurement harness
  yields real project-size distributions.
