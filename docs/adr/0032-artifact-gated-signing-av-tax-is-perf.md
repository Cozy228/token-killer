# Code-signing is artifact-gated, not now; the AV spawn tax is a performance problem, not a signing one

Status: accepted

There is currently **no tk-authored binary to sign**. tk ships as an npm JS package (`bin:
tk → dist/cli.js`) that runs on the user's existing Node; the vendored-bundle path
(L1–L8) repackages the **official, already-signed** Node binary plus tk's JS. So buying an
Authenticode certificate now would sign nothing meaningful — it cannot sign the user's Node
process, and there is no evidence it would remove the CrowdStrike ~400–1100ms per-spawn tax.

**The AV tax is a performance/architecture problem, not a signing one.** The dogfood evidence
shows the EDR intercepts process-creation and file-access generally (`git --version` and
`node -e 0` are both slow); tk pays structurally because it spawns Node one extra time. The
fix is daemon / fewer spawns / cached executable paths / less hot-path file I/O — signing is
not a substitute for performance architecture.

**Decision — artifact-gated signing.** Now: keep SHA256SUMS (L15), npm provenance (decision
#9), and release attestation; **do not buy a certificate**. When tk first ships a **tk-owned
Windows PE artifact** — an SEA (single-executable application), a daemon/service EXE, or an
MSI/MSIX installer — **Authenticode becomes a hard release gate**. macOS notarization is the
same: enabled only when shipping a `.app`/`.pkg`/`.dmg` or a bundled native executable. A CI
signing stage and a signing-verification contract may be **reserved now** (wired but with no
real certificate), so the security chain is not bolted on in a scramble when native
distribution actually appears.

## Consequences

- No certificate cost, key management, or CI signing complexity is paid for artifacts that do
  not exist (YAGNI), and the Windows-primary commitment is not violated because the current
  npm/JS distribution has no unsigned tk PE for AV to quarantine.
- The CrowdStrike spawn-tax mitigation moves to the performance track (the conditional daemon
  branch, exec-path caching, hot-path I/O reduction) — see the Windows startup-perf work and
  the daemon open decision — and is explicitly **not** addressed by signing.
- A PowerShell installer (L9 `install.ps1`) is a script, not a PE, so it does not by itself
  trip the gate; an MSI/MSIX would.
