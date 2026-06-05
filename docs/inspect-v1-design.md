# Token Guard Inspect Design

## Summary

Token Guard is an independent local developer CLI for understanding Copilot agent workflow behavior, storage coverage, and cost-reduction opportunities.

The analysis command is:

```text
tg inspect
```

Token Guard is not part of Atlas. It does not live in the Atlas product boundary, does not provide a portal feature, and does not act as a governed knowledge layer. Atlas may be one repository whose workflow can be inspected, but Token Guard itself is a separate local tool.

## Product Boundary

`tg inspect` is the local diagnostic surface inside Token Guard. Its job is to inspect local evidence about agent workflow behavior and produce actionable findings.

`tg inspect` is not:

1. The runtime command rewriter
2. The policy enforcement system
3. An exact token accounting system
4. A source-code audit tool
5. An Atlas feature
6. A portal surface
7. A Chronicle ingestion tool

The design intentionally keeps inspect focused on local workflow evidence. It should explain what happened, where noise or cost may be coming from, and what the user can do next.

## Command Model

Token Guard has one executable:

```text
tg
```

The inspect design depends on two command areas:

```text
tg inspect
tg config init
```

inspect is for analysis. config is for user-level configuration management. Configuration initialization is intentionally not hidden under inspect, because inspect should remain an analysis command.

### Inspect Flags

Inspect supports:

```text
tg inspect
tg inspect --json
tg inspect --since 7d
tg inspect --session <id>
tg inspect --input-type vscode
tg inspect --input-type copilot-cli
tg inspect --repo-context
tg inspect --include-raw
tg inspect --write-advice
tg inspect --telemetry-export
tg inspect --no-telemetry-export
```

Markdown is the default stdout format. `--json` switches stdout to JSON. Inspect does not need `--markdown` because Markdown is already the default.

`--session <id>` selects a discovered session identifier from configured sources. It is not a path input.

Inspect does not support:

```text
--source-path
```

Path-based source scans are out of scope because they bypass input-type discovery and make coverage semantics harder to explain.

## Default Input Type

The default input type is:

```text
vscode
```

It includes:

1. Stable VS Code Copilot workspace storage
2. `chatSessions/*.jsonl` for session inventory
3. `GitHub.copilot-chat/transcripts/*.jsonl` for analyzable tool workflow events

It excludes Copilot CLI storage, cloud audit logs, and repository context by default.

Missing sources are normal. If VS Code transcript storage is absent, that is reported as not-found, not as an error. A coverage error only occurs when a discovered source or record exists but cannot be read or parsed.

## Repository Context

Repository context is opt-in:

```text
tg inspect --repo-context
```

When enabled, repository context is limited to lightweight metadata and durable guidance, such as:

1. package manifest presence
2. git root identity
3. CONTEXT.md or CONTEXT-MAP.md
4. ADR index presence
5. local skill or rule file presence

Repository context must not become source-code analysis. It exists only to explain workflow patterns, not to review code.

## Evidence Model

`tg inspect` normalizes local evidence into three categories.

### Shell Execution

Shell Execution represents a tool entry point that runs a raw shell or terminal command.

Examples:

1. Copilot CLI powershell
2. VS Code run_in_terminal

The model is entry-point agnostic. powershell is not the core abstraction; it is one observed shell execution entry point.

### Direct Tool Action

Direct Tool Action represents a structured tool call that performs work without first becoming a raw shell command.

Examples:

1. view
2. read_file
3. grep_search
4. list_dir
5. apply_patch
6. replace_string_in_file
7. web_fetch

Inspect uses a stable category enum:

| Category | Meaning |
|---|---|
| read | File or content reads |
| search | Text or code search |
| list | Directory, file, or resource listing |
| edit | File creation or modification |
| execute_adjacent | Tooling adjacent to execution but not raw shell execution |
| web | Web or URL fetches |
| agent-orchestration | Subagent and agent control |
| metadata | Intent, diagnostics, state, or bookkeeping |
| other | Compatibility fallback |

Downstream JSON consumers can rely on this enum. Unknown tools fall back to other.

### Workflow Signal

Workflow Signal represents observed behavior around a session rather than a single direct action.

Examples:

1. skill invocation
2. repeated reads
3. repeated searches
4. session inventory
5. transcript coverage
6. source storage layout
7. unknown-time records

Workflow Signal must not be confused with repository context. Repository context is optional evidence; workflow signals are observations about local agent behavior.

## Time Window Semantics

`--since <duration>` applies only to records with reliable event or session timestamps.

Records without reliable timestamps are excluded from time-window analysis and counted separately as unknown-time records. Inspect must not silently use file modification time as a timestamp fallback.

## VS Code Coverage Semantics

VS Code storage has two distinct concepts:

1. Session inventory
2. Transcript coverage

Session inventory is the count of discovered chat session records. Transcript coverage is the subset with analyzable tool workflow events.

These numbers must not be collapsed into one count. A report that says "162 VS Code sessions analyzed" when only 40 transcripts contain tool events is misleading.

Inspect scans Stable VS Code storage by default. Insiders, Codium, and other VS Code-like storage roots are out of scope until explicitly added to the input-type model.

## Output Model

By default, `tg inspect` writes Markdown to stdout and creates no files.

JSON output is explicit:

```text
tg inspect --json
```

JSON includes:

```json
{
  "schemaVersion": "1",
  "generatedAt": "2026-06-04T00:00:00.000Z"
}
```

The JSON schema should be extensible for future source kinds, but inspect starts with local agent storage scanning.

### Persistent Output

`--write-advice` writes to:

```text
~/.token-guard/advice/
```

Persistent inspect output uses stable file names:

```text
inspect-report.md
inspect-report.json
advice.md
telemetry-export.json
```

Stable names overwrite prior files. Inspect does not create timestamped trend snapshots by default.

## Recommendation Model

Recommendations are actionable findings ranked by impact and confidence.

Markdown output shows only the top five recommendations. Full recommendation data belongs in JSON output or a future verbose mode.

Recommendation types:

1. skill-gap
2. context-gap
3. storage-discovery
4. shell-noise
5. tool-noise
6. workflow-friction

Recommendation findings do not cause non-zero exit codes. Inspect is diagnostic, not enforcement.

## Cost Semantics

Token Guard provides cost heuristics, not exact token accounting.

Evidence can include:

1. command frequency
2. tool frequency
3. repeated reads
4. repeated searches
5. average and maximum argument length
6. average and maximum output length
7. shell-heavy workflow patterns

Reports must not present these signals as a precise token bill. The safe phrasing is "cost heuristic", "long-output hotspot", "high-noise pattern", or "likely token pressure", not "exact token cost".

## Raw Evidence Policy

Raw Evidence includes:

1. full commands
2. full tool arguments
3. full result text
4. paths
5. session identifiers
6. repository names
7. command examples
8. result snippets

Default Markdown and JSON output must exclude Raw Evidence.

Raw fields require:

```text
tg inspect --include-raw
```

`--include-raw` must not be enabled through user configuration. It must be a per-run explicit choice.

Telemetry export must never include Raw Evidence.

## Telemetry Export

Telemetry Export is disabled by default.

It can be enabled by:

1. `tg inspect --telemetry-export`
2. user-level configuration

It can be disabled for one run by:

```text
tg inspect --no-telemetry-export
```

CLI flags override user configuration.

### Telemetry Content

Telemetry Export contains only anonymized aggregate metrics.

Allowed examples:

1. tool category counts
2. source coverage counts
3. recommendation type counts
4. Token Guard version
5. platform
6. duration bucket
7. per-run random identifier

Disallowed:

1. Raw Evidence
2. paths
3. session identifiers
4. repository names
5. command examples
6. result snippets
7. stable installation identifier

Telemetry does not correlate multiple runs from the same machine.

### Telemetry Transport

Telemetry uploads to an endpoint provided by an enterprise build-time constant.

The generic package must not hardcode a public endpoint. If no endpoint is configured, inspect writes `telemetry-export.json` in the user-level Token Guard data directory, emits a warning, and still completes the main inspect report.

Upload contract:

1. HTTPS only
2. POST
3. JSON body
4. Content-Type: application/json
5. any 2xx status is success
6. no retry by default

Upload failure emits a warning, preserves the local telemetry payload, and does not fail `tg inspect`.

## User Configuration

User configuration is stored at:

```text
~\.token-guard\config.jsonc
```

The format is JSONC.

Allowed fields:

```jsonc
{
  "inputType": "vscode",
  "defaultSince": "7d",
  "telemetryExport": false
}
```

User configuration must not enable:

1. Raw Evidence
2. Repository Context
3. Taxonomy overrides
4. path-based scans

CLI flags always override user configuration.

If the configuration file exists but cannot be parsed or violates the allowed shape, the command exits with code 1.

### Config Initialization

Token Guard provides:

```text
tg config init
```

It creates an example JSONC configuration file if one does not already exist.

It is non-interactive.

It does not run Inspect analysis.

It does not overwrite an existing file. If the file already exists, it exits with code 1 and prints the existing path.

The generated template sets:

```jsonc
{
  "telemetryExport": false
}
```

Creating the config file is not telemetry opt-in. The user opts in only by changing the field to true or by passing `--telemetry-export`.

## Exit Codes

| Code | Meaning |
|---|---|
| 0 | Report generated, including reports with warnings |
| 1 | User input or configuration error |
| 2 | No major source can be analyzed |
| 3 | Internal error |

Telemetry warnings do not change the exit code unless they are caused by invalid user input.

## Packaging and Platform

Token Guard is a single npm package:

```text
token-guard
```

It exposes the binary:

```text
tg
```

The project is developed with pnpm and TypeScript, then published as compiled JavaScript.

Runtime baseline:

```text
Node.js 20+
```

Platform stance:

1. Windows-first
2. cross-platform where the same local storage concepts exist
3. no native executable packaging
4. no platform-specific installer

## Analyzer Set

Inspect includes these analyzers:

1. Source coverage analyzer
2. Tool usage analyzer
3. Shell command analyzer
4. Workflow signal analyzer
5. Skill and context gap analyzer
6. Cost heuristic analyzer
7. Recommendation ranker

Skill analysis identifies skill gaps only. It does not generate `SKILL.md` drafts.

Context analysis recommends durable context improvements only. It does not edit CONTEXT.md, README files, rules, skills, or configuration.

## Non-Goals

1. Atlas integration
2. portal UI
3. source-code analysis
4. exact token accounting
5. trend snapshots
6. Chronicle ingestion
7. path-based source scans
8. project-level configuration or writes
9. user-defined taxonomy
10. automatic config edits
11. skill draft generation
12. source document edits
13. native executable packaging
14. direct policy enforcement

> **Superseded by [ADR 0003](adr/0003-inspect-default-full-static-context.md).** The
> Copilot Context Optimizer makes default `tg inspect` read a curated set of **project
> context files** (not source code) and write `~/.token-guard/projects/<fingerprint>/inspect/latest.json`
> on every run. This narrows two promises above: "no default repository scan" (now a bounded
> context-file read) and "no default file writes" (now a user-level report write; the project
> repository is still never written). "No source-code analysis" and "no path-based source
> scans" remain fully in force.

## Future Questions

1. Should inspect add trend snapshots and run comparison?
2. Should inspect support VS Code Insiders and other VS Code-like storage roots?
3. Should telemetry support authenticated enterprise upload?
4. Should Token Guard support enterprise policy-controlled defaults?
5. Should inspect support custom taxonomy configuration?
6. Should Token Guard add `tg config set/get`?
7. Should inspect ingest Chronicle exports?

## Design Recommendation

Proceed with `tg inspect` as the focused local diagnostic CLI inside the complete Token Guard product.

The public model should be:

```text
token-guard package
tg executable
tg inspect analysis command
tg config init configuration bootstrap
```

The core product promise is evidence-based workflow insight with safe defaults: no default repository scan, no default file writes, no default raw evidence, no default telemetry export, and no claim of exact token accounting.
