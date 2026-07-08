# Contexa (`ctx`) hard rename

Date: 2026-07-08

## Status

Accepted.

## Context

The 0.3.2 code line had not shipped to users, so the product rename could be
done as a hard rename instead of a compatibility migration. Carrying old command,
environment, and data-directory aliases would increase the public surface before
1.0.0 without protecting real user state.

## Decision

- Product name: Contexa.
- CLI command: `ctx`.
- Package name: `contexa`.
- Data/config root: `~/.contexa`.
- Data/config override: `CONTEXA_HOME`.
- Shim env: `CTX_SHIM_DIR`.
- Other product-scoped env vars use the `CTX_` prefix.

No `tk` package bin, `TOKEN_KILLER_HOME`, `TK_SHIM_DIR`, or `~/.token-killer`
compatibility behavior is shipped. Existing 0.3.2-era names may remain only in
historical notes and archived material.

## Consequences

Install output, generated wrappers, guidance files, help text, tests, support
reports, telemetry build knobs, and docs all use Contexa/`ctx` naming. There is no
runtime read, copy, or migration path from `~/.token-killer`.
