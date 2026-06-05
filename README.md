# tg

`tg` is a TypeScript / Node.js command proxy inspired by RTK.

```bash
tg <original command> [...args]
```

The command after `tg` is the command you would normally run. `tg` executes it, captures stdout/stderr/exit code, compresses output locally, records token savings, and exits with the original command exit code.

## Principles

1. Retention before compression.
2. Raw output is always a valid result.
3. Never hide actionable facts behind placeholders.
4. Command-aware beats generic summarization.
5. Compress structure and noise, not evidence.
6. Full diffs, full matches, and source content are passthrough by default.
7. Every handler must prove preservation or fall back to raw.
8. High savings with wrong content is worse than zero savings.
9. Evaluation is based on agent next-action equivalence.
10. Deterministic, local, test-first.

See [docs/PRINCIPLES.md](./docs/PRINCIPLES.md) for the product rationale and [docs/DESIGN.md](./docs/DESIGN.md) for the implementation contracts.

## Usage

```bash
tg git status
tg git diff
tg diff old.txt new.txt
tg rg "submitOrder" src
tg cat package.json
tg read --level balanced src/cli.ts
tg ls .
tg npm test
tg tsc --noEmit
```

## Flags

```bash
tg --raw <command...>
tg --stats <command...>
tg --verbose <command...>
tg --max-lines 200 <command...>
tg --max-chars 12000 <command...>
tg --save-raw <command...>
tg --no-save-raw <command...>
tg --report
tg --report --json
tg --report --csv
tg --help
tg --version
```

`## Token Savings` is not printed by default. It appears only with `--stats`, `--verbose`, or `--report`.

## Current Handler Coverage

Implemented:

- read-like: `cat`, `type`, `less`
- explicit read: `read --level minimal|balance|balanced|aggressive`
- list-like: `ls`, `dir`, `find`, `tree`
- search-like: `rg`, `grep`
- diff: `diff`
- git status
- git diff
- git log
- git show
- git branch
- pytest
- ruff
- mypy
- pip list/freeze
- npm/pnpm/yarn test, vitest, jest
- eslint
- tsc
- npm/pnpm/yarn list
- mvn/maven
- gradle
- javac
- generic fallback

Planned:

- broader fixture corpus for every handler
- more real-command integration tests when optional tools are installed
- per-handler raw-save and filter-fallback tests

## Development

```bash
pnpm install
pnpm run typecheck
pnpm test
pnpm run build
```

Build output:

```text
dist/cli.js
```

The built CLI preserves the shebang and is exposed through npm:

```json
{
  "bin": {
    "tg": "./dist/cli.js"
  }
}
```
