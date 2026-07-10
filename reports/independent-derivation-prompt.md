---
status: frozen
purpose: zero-base derivation prompt (v3) — enterprise & project background supplied; product design derived from zero; given independently to each model
---

# Zero-base product derivation — prompt

You are a product and systems designer starting from a blank slate.

Attached is a research report: **"Enterprise Developer Friction in the Age of AI
Coding Agents"** (`reports/enterprise-dev.md`). Its conclusion identifies five
persistent, high-cost problems in enterprise engineering:

1. Fragmented, untrusted engineering context
2. Manual change impact analysis and blast-radius estimation
3. Ambiguous ownership and decision routing
4. Hidden verification tax in AI-assisted development
5. Non-code delivery constraints after coding

Starting from these five problems and the background below, design — from zero —
the product or system you would build. **Treat all five problems as in-scope
targets: the design should aim to address and implement each of them as fully and
concretely as possible, not select a comfortable subset.** Where full coverage is
genuinely impossible, the design must say exactly where the ceiling is and why.
**No existing product or prior decision exists. Invent everything.** Do not anchor
on any known tool category (portal, catalog, wiki, code-review bot, RAG layer); if
your design resembles one, that must be a conclusion you reached, not a starting
point.

## Enterprise background (given)

- A large **financial enterprise** with an engineering organization of **several
  thousand engineers** across many teams, many services and shared platform code, a
  mature GitHub pull-request workflow, Harness CI/CD pipelines, Terraform Enterprise and various Public Cloud including AWS, Azure, OCI and separate systems of record
  for tickets, documentation, incidents, and change management (Jira / Confluence /
  ServiceNow class).
- As a regulated financial institution: formal change-management and approval
  processes, audit requirements, strict security review for any new tooling, and a
  hard data boundary — source code, diffs, and local artifacts must not leave the
  company; external SaaS is effectively unavailable for engineering data.
- Developer endpoints are centrally managed: Windows 11, EDR/antivirus
  agents that tax process spawns, corporate proxies, restricted egress.
- **AI coding agents are the backdrop of this era**: assistants are officially
  rolled out and mainstream in daily work (GitHub Copilot in VS Code, terminal CLI
  agents, Claude-class coding agents). Agents both consume engineering context and
  generate a growing share of changes — amplifying every one of the five problems,
  exactly as the report describes.
- Organizational knowledge decays as the report says: catalogs and wikis exist but
  are stale; CODEOWNERS exists but does not answer runtime or approval authority;
  finding the right information or person is a daily, unbudgeted cost.

## Project background (given)

- This is a sanctioned **internal tooling project** inside the enterprise. Its
  deliverable is an internal tool (or tool family), not a commercial product.
- **Target users: the enterprise's internal engineering teams** — developers,
  reviewers, tech leads, platform/SRE engineers — and the AI coding agents working
  alongside them.
- The proving ground is internal: real teams, real repositories, real reviews.
  Claims must be backed by internally measured evidence before they are believed;
  the culture rejects vendor-style numbers.
- Why now: coding itself is no longer the bottleneck (report: 16% of time coding,
  ~58% comprehension). AI made generation cheap and shifted the cost to context
  reconstruction, review, verification, and coordination. Whoever supplies trusted
  context at the decision moment multiplies both humans and agents; nobody inside
  the company owns that layer today.

## Deliverables

**1. The design — concrete, not categorical.**
The product itself: what it is, its major parts, how data gets in and flows through,
what a developer / a reviewer / an AI agent / a platform engineer actually sees and
touches, how it enters a team on day one under the constraints above, and how it
earns and keeps trust. Describe surfaces, objects, and mechanisms — not categories
and slogans. Diverge before you converge: sketch at least two fundamentally
different product shapes, then choose, and show why the losing shape lost.

**2. The five questions — answer each explicitly.**
- What problem does this product solve?
- How does it solve it — by what mechanisms?
- Which features solve which of the report's five problems?
- Are all five solved? Where honestly not, say so and explain why not.
- What happens to a team that doesn't have this product?

**3. The riskiest assumption — and the cheapest honest test.**
Name the single assumption your design most depends on, and design the cheapest
study that could kill it: protocol, primary endpoint, one guardrail, kill criterion.

## Rules

- Work from the report's evidence and the given background; cite the finding when it
  drives a choice.
- **No prior work exists.** Do not reference, defer to, or argue against any existing
  product decisions, measurements, codebases, or earlier discussions.
- Mark **HYPOTHESIS** where you go beyond the report and background; mark **UNKNOWN**
  (plus what evidence would decide it) where you cannot choose.
- Concreteness over completeness. Length as needed.
- English, deliverable only — no process narrative.
