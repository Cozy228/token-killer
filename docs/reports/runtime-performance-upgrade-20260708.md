# Runtime performance upgrade research

Date: 2026-07-08

## Verdict

The best performance upgrade is not a runtime switch. Keep the main product on Node,
fix the local CLI import shape, and make the command-proxy hot path optionally resident.

For the CrowdStrike/EDR case, the structural fix is a `CommandProxyResident` path:
shimmed tool names point at a tiny signed wrapper executable, and that wrapper sends the
request to an already-running local resident proxy. The resident proxy then runs the real
tool and streams/compresses output. That removes the per-command Node process start and
large JS module load from the shim path. SEA, Bun, and Deno compile improve packaging and
some parse/compile cost, but they still launch a runtime process per command, so they do
not remove the main EDR-priced operation.

## Current repo facts

- The legacy command proxy already has the main low-risk optimizations: `src/cli.ts`
  enables Node compile cache, lazy-loads management subcommands, supports `--raw`
  streaming, and the executor uses `CTX_REAL_BIN` plus a PATH-hash gate before falling
  back to PATH/PATHEXT walking.
- The current Contexa CLI path still has a short-command startup issue:
  `packages/cli/src/cli.ts` statically imports many exports from `@contexa/core`, and
  `packages/core/src/index.ts` re-exports store, ingest, code extraction, SCIP reader,
  memory, selection, serve, push, and install surfaces. That means `ctx --help` loads far
  more than a command shell needs.
- Local Mac sanity check, not a Windows/CrowdStrike benchmark:
  - `node -e 0`: p50 about 22 ms.
  - `bun -e 0`: p50 about 9 ms.
  - `node packages/cli/src/cli.ts --help`: p50 about 100 ms.
  This points at import-shape work before runtime-switch work.
- `ctx mcp` is already resident per agent session: it opens the store once and reuses
  `RefreshEngine` and the store until stdio ends. A cross-session codemap daemon is still
  not justified by current evidence.

## Source findings

### Node SEA

Node 22.18 SEA is still "Active development". It builds by creating a blob, copying the
Node binary, removing the signature on macOS/Windows before injection, injecting the blob,
and then signing again if desired. In Node 22.18 it supports a single embedded CommonJS
script, and `useCodeCache` cannot be combined with `import()`. Sources:

- https://nodejs.org/download/release/v22.18.0/docs/api/single-executable-applications.html
- https://nodejs.org/api/single-executable-applications.html

Implication for this repo: SEA is useful if we want a signed, Node-owned executable
identity for distribution or a resident daemon binary. It is a poor bet for per-command
shim performance because it still starts a Node runtime image per invocation and fights
the repo's current dynamic-import boundaries when `useCodeCache` is enabled.

### Node compile cache

Node's module compile cache can persist V8 code cache for CJS, ESM, and TypeScript module
loads. In Node 22.18 it is available via `module.enableCompileCache()` and
`NODE_COMPILE_CACHE`; newer Node docs mark it stable in later 24/25+ lines. Sources:

- https://nodejs.org/download/release/v22.18.0/docs/api/module.html
- https://nodejs.org/api/module.html

Implication: keep it. It helps repeated short-lived Node starts, but it is not a substitute
for removing the Node start entirely on EDR-heavy Windows machines.

### Bun compile

Bun can build standalone executables, cross-compile to Windows targets, embed a copy of
the Bun runtime, and optionally generate bytecode for startup wins. Bun's docs explicitly
say compiled executables move file read/resolve/parse/transpile cost to build time.
Sources:

- https://bun.com/docs/bundler/executables
- https://bun.com/docs/bundler

However, Bun's `node:sqlite` reference says it is not implemented and recommends
`bun:sqlite` instead. Source:

- https://bun.com/reference/node/sqlite

Implication: Bun is not the best primary runtime for this repo today. The core store uses
`node:sqlite`; switching to Bun would require a compatibility layer or a store port. Even
if that port succeeds, Bun compile still launches a Bun runtime per command, so it does
not solve the EDR spawn floor.

### Deno compile

Deno can compile self-contained executables, cross-compile, include files, sign Windows
executables, and supports many Node/npm compatibility surfaces, including `node:sqlite`
in Deno 2.2+. Sources:

- https://docs.deno.com/runtime/reference/cli/compile/
- https://docs.deno.com/runtime/fundamentals/node/
- https://docs.deno.com/api/node/sqlite/

Implication: Deno is a more plausible runtime-switch spike than Bun for `node:sqlite`
compatibility, but it still introduces a new runtime and permission/distribution model,
and it still starts a runtime process per command. It is not the best CrowdStrike fix.

### EDR exclusions and signing

CrowdStrike exposes API surfaces for IOA exclusions, Sensor Visibility exclusions, and
prevention policy management. Microsoft Defender docs likewise describe custom file,
folder, process, and process-opened-file exclusions, but warn that exclusions lower
protection. Sources:

- https://developer.crowdstrike.com/api-reference/collections/ioa-exclusions/
- https://developer.crowdstrike.com/api-reference/collections/sensor-visibility-exclusions/
- https://developer.crowdstrike.com/api-reference/collections/prevention-policy/
- https://learn.microsoft.com/en-us/defender-endpoint/configure-exclusions-microsoft-defender-antivirus
- https://learn.microsoft.com/en-us/defender-endpoint/navigate-defender-endpoint-antivirus-exclusions

Implication: an org-wide EDR exclusion/allowlist can be the biggest operational lever, but
it is an IT/security decision, not a product architecture. Code signing is still required
once the project ships a tk-owned Windows PE artifact, but signing alone is not evidence
that process creation and file I/O scans disappear.

## Recommended plan

1. Fix the cheap import-shape issue first.
   - Make `packages/cli/src/cli.ts` a small command router.
   - Do not import `@contexa/core` at top level for `--help`, unknown future-slice
     notices, or simple argument parsing.
   - Dynamically import narrow command modules after command selection.
   - Split `@contexa/core` entrypoints if needed so `remember` does not import code
     extraction, SCIP, serve, push, and install.
   - Verification: compare `node packages/cli/src/cli.ts --help` and simple command p50
     before/after on macOS, plus Windows dogfood later.

2. Keep Node as the primary runtime and tighten packaging.
   - Keep compile cache.
   - Prefer single-entry or minimal-chunk builds for hot CLI entrypoints where the code
     path is short-lived.
   - Keep vendored Node as a distribution fallback if the install base lacks the required
     Node/SQLite version.

3. Treat SEA as a packaging/distribution spike, not the performance answer.
   - Valid use: signed resident daemon executable or no-system-Node bundle.
   - Bad use: launching a SEA on every shimmed command.
   - Spike only after a single bundled CJS/ESM entry has no dynamic import/code cache
     conflict for the target path.

4. Do not move the product to Bun now.
   - Bun compile is attractive for pure JS CLIs, but this repo's store is `node:sqlite`.
   - A Bun port would add runtime-specific store code before proving it removes the
     Windows EDR bottleneck.

5. Defer Deno to a "runtime switch" spike only if the project intentionally wants a new
   runtime for distribution reasons.
   - Deno has better `node:sqlite` compatibility than Bun, but the migration cost is still
     larger than the expected performance win for this specific bottleneck.

6. For the CrowdStrike hard case, build the resident proxy only after two gates.
   - Gate A: IT/security says a signed user-level resident process plus local IPC/named
     pipe is allowed and will not be killed/quarantined.
   - Gate B: a tiny signed wrapper spawn on the target Windows box is materially cheaper
     than `node.exe` under Falcon.
   - If both pass, build: signed generic wrapper executable copied/hardlinked as `git.exe`,
     `rg.exe`, etc.; wrapper sends argv/stdin/env/cwd to `ctxd`; `ctxd` spawns the real tool
     and streams/compresses output; fallback to direct real tool when daemon is unavailable.

## Best option

Best overall: Node mainline + lazy CLI imports now + signed resident command proxy for the
Windows EDR path, gated by real Falcon policy and tiny-wrapper measurements.

SEA/Bun/Deno are not the best answer to "avoid the CrowdStrike thing" because they optimize
packaging and JS parse/compile cost, not the per-command process-start tax. SEA is still
useful as a packaging format for a resident daemon. Bun is not a primary-runtime candidate
until `node:sqlite` is implemented or the store is intentionally ported. Deno is a possible
runtime-switch spike, but not the shortest path to the desired latency.
